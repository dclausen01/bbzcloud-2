const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs-extra');
const { app } = require('electron');
const CryptoJS = require('crypto-js');
const Store = require('electron-store');

class DatabaseService {
    constructor() {
        this.isConnected = false;
        this.encryptionEnabled = false;
        // Initialize electron-store with schema
        this.store = new Store({
            name: 'bbzcloud-store',
            clearInvalidConfig: true,
            schema: {
                databasePath: {
                    type: 'string'
                },
                globalZoom: {
                    type: 'number',
                    default: 1.0
                }
            }
        });
        
        // Initialize database asynchronously
        this.initPromise = this.initialize().catch(err => {
            console.error('Failed to initialize database:', err);
        });
    }

    async initialize() {
        try {
            await this.setupEncryption();
            this.encryptionEnabled = true;
        } catch (error) {
            console.log('No encryption key found - encryption features will be disabled until credentials are set');
            this.encryptionEnabled = false;
            // Continue without encryption - it will be set up later when credentials are saved
        }
        await this.initializeDatabase();
    }

    async initializeDatabase() {
        try {
            // Get database path from electron-store or use default
            const defaultPath = path.normalize(path.join(app.getPath('userData'), 'bbzcloud.db'));
            this.dbPath = path.normalize(this.store.get('databasePath', defaultPath));
            
            // Ensure directory exists
            await fs.ensureDir(path.dirname(this.dbPath));
            
            // Initialize database connection
            await new Promise((resolve, reject) => {
                this.db = new sqlite3.Database(this.dbPath, (err) => {
                    if (err) {
                        console.error('Database connection error:', err);
                        reject(err);
                        return;
                    }
                    this.isConnected = true;
                    resolve();
                });
            });

            // Enable foreign keys and verify database
            await new Promise((resolve, reject) => {
                this.db.serialize(() => {
                    // Enable foreign keys
                    this.db.run('PRAGMA foreign_keys = ON');
                    
                    // Check database integrity
                    this.db.get('PRAGMA integrity_check', [], (err, result) => {
                        if (err || result.integrity_check !== 'ok') {
                            reject(err || new Error('Database integrity check failed'));
                        } else {
                            resolve();
                        }
                    });
                });
            });

            // Create tables
            await this.createTables();
            
        } catch (error) {
            console.error('Database initialization error:', error);
            throw error;
        }
    }

    async setupEncryption() {
        try {
            // Get encryption key from keytar
            const keytar = require('keytar');
            const password = await keytar.getPassword('bbzcloud', 'password');
            
            if (!password) {
                throw new Error('No password found in keytar');
            }
            
            // Use password as encryption key
            this.encryptionKey = password;
        } catch (error) {
            console.error('Error in setupEncryption:', error);
            this.encryptionKey = null; // Clear encryption key if setup fails
            throw error; // Re-throw to be caught by initialize()
        }
    }

    async reEncryptAllData(newPassword) {
        if (!this.encryptionEnabled || !this.encryptionKey) {
            throw new Error('Encryption is not currently enabled');
        }

        const oldKey = this.encryptionKey;
        
        return this.withConnection(async () => {
            return new Promise(async (resolve, reject) => {
                try {
                    this.db.serialize(() => {
                        this.db.run('BEGIN TRANSACTION');

                        try {
                            // Re-encrypt todos
                            this.db.all('SELECT * FROM todos', [], async (err, todos) => {
                                if (err) throw err;

                                const todoStmt = this.db.prepare(`
                                    UPDATE todos 
                                    SET text = ?
                                    WHERE id = ?
                                `);

                                for (const todo of todos) {
                                    try {
                                        // Decrypt with old key
                                        const bytes = CryptoJS.AES.decrypt(todo.text, oldKey);
                                        const decryptedText = bytes.toString(CryptoJS.enc.Utf8);
                                        if (!decryptedText) continue; // Skip if decryption fails
                                        
                                        // Re-encrypt with new key
                                        const reEncrypted = CryptoJS.AES.encrypt(decryptedText, newPassword).toString();
                                        todoStmt.run(reEncrypted, todo.id);
                                    } catch (error) {
                                        console.error('Error re-encrypting todo:', error);
                                        // Continue with next todo even if one fails
                                    }
                                }
                                todoStmt.finalize();
                            });

                            // Re-encrypt secure documents
                            this.db.all('SELECT * FROM secure_documents', [], async (err, docs) => {
                                if (err) throw err;

                                const docStmt = this.db.prepare(`
                                    UPDATE secure_documents 
                                    SET content = ?
                                    WHERE id = ?
                                `);

                                for (const doc of docs) {
                                    try {
                                        // Decrypt with old key
                                        const bytes = CryptoJS.AES.decrypt(doc.content, oldKey);
                                        const decryptedContent = bytes.toString(CryptoJS.enc.Utf8);
                                        if (!decryptedContent) continue; // Skip if decryption fails
                                        
                                        // Re-encrypt with new key
                                        const reEncrypted = CryptoJS.AES.encrypt(decryptedContent, newPassword).toString();
                                        docStmt.run(reEncrypted, doc.id);
                                    } catch (error) {
                                        console.error('Error re-encrypting document:', error);
                                        // Continue with next document even if one fails
                                    }
                                }
                                docStmt.finalize();
                            });

                            this.db.run('COMMIT', (err) => {
                                if (err) reject(err);
                                else {
                                    // Update encryption key only after successful re-encryption
                                    this.encryptionKey = newPassword;
                                    resolve(true);
                                }
                            });
                        } catch (error) {
                            this.db.run('ROLLBACK');
                            reject(error);
                        }
                    });
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    async createTables() {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                try {
                    // Settings table
                    this.db.run(`
                        CREATE TABLE IF NOT EXISTS settings (
                            id TEXT PRIMARY KEY,
                            value TEXT NOT NULL,
                            updated_at INTEGER NOT NULL
                        )
                    `);

                    // Todos table
                    this.db.run(`
                        CREATE TABLE IF NOT EXISTS todos (
                            id INTEGER PRIMARY KEY,
                            text TEXT NOT NULL,
                            completed BOOLEAN NOT NULL DEFAULT 0,
                            folder TEXT NOT NULL DEFAULT 'Default',
                            created_at TEXT NOT NULL,
                            reminder TEXT,
                            updated_at INTEGER NOT NULL
                        )
                    `);

                    // Todo folders table
                    this.db.run(`
                        CREATE TABLE IF NOT EXISTS todo_folders (
                            name TEXT PRIMARY KEY,
                            updated_at INTEGER NOT NULL
                        )
                    `);

                    // Insert Default folder if it doesn't exist
                    this.db.run(`
                        INSERT OR IGNORE INTO todo_folders (name, updated_at)
                        VALUES ('Default', ?)
                    `, [Date.now()]);

                    // Secure documents table
                    this.db.run(`
                        CREATE TABLE IF NOT EXISTS secure_documents (
                            id TEXT PRIMARY KEY,
                            name TEXT NOT NULL,
                            size TEXT NOT NULL,
                            date TEXT NOT NULL,
                            content TEXT NOT NULL,
                            updated_at INTEGER NOT NULL
                        )
                    `);

                    // Custom apps table
                    this.db.run(`
                        CREATE TABLE IF NOT EXISTS custom_apps (
                            id TEXT PRIMARY KEY,
                            title TEXT NOT NULL,
                            url TEXT NOT NULL,
                            button_variant TEXT NOT NULL DEFAULT 'solid',
                            favicon TEXT,
                            zoom REAL NOT NULL DEFAULT 1.0,
                            updated_at INTEGER NOT NULL
                        )
                    `);

                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    // Encryption/Decryption helpers with improved error handling
    encrypt(data) {
        if (!this.encryptionEnabled || !this.encryptionKey) {
            throw new Error('Encryption is not set up. Please set your credentials in the settings panel first.');
        }
        return CryptoJS.AES.encrypt(JSON.stringify(data), this.encryptionKey).toString();
    }

    decrypt(encryptedData) {
        if (!this.encryptionEnabled || !this.encryptionKey) {
            throw new Error('Encryption is not set up. Please set your credentials in the settings panel first.');
        }
        if (!encryptedData) {
            throw new Error('Missing encrypted data');
        }
        
        try {
            const bytes = CryptoJS.AES.decrypt(encryptedData, this.encryptionKey);
            const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
            if (!decryptedStr) {
                throw new Error('Decryption resulted in empty string');
            }
            return JSON.parse(decryptedStr);
        } catch (error) {
            console.error('Decryption error:', error);
            throw new Error('Failed to decrypt data: ' + error.message);
        }
    }

    // Modified saveTodoState to handle encryption being disabled
    async saveTodoState(todoState) {
        return this.withConnection(async () => {
            return new Promise((resolve, reject) => {
                const timestamp = Date.now();
                
                this.db.serialize(() => {
                    this.db.run('BEGIN TRANSACTION');

                    try {
                        // Clear existing data
                        this.db.run('DELETE FROM todos');
                        this.db.run('DELETE FROM todo_folders');
                        
                        // Insert folders
                        const folderStmt = this.db.prepare('INSERT INTO todo_folders (name, updated_at) VALUES (?, ?)');
                        todoState.folders.forEach(folder => {
                            folderStmt.run(folder, timestamp);
                        });
                        folderStmt.finalize();
                        
                        // Insert todos with encrypted text only if encryption is enabled
                        const todoStmt = this.db.prepare(`
                            INSERT INTO todos (id, text, completed, folder, created_at, reminder, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        `);
                        
                        todoState.todos.forEach(todo => {
                            // Only encrypt if encryption is enabled
                            const text = this.encryptionEnabled ? this.encrypt(todo.text) : todo.text;
                            todoStmt.run(
                                todo.id,
                                text,
                                todo.completed ? 1 : 0,
                                todo.folder,
                                todo.createdAt,
                                todo.reminder,
                                timestamp
                            );
                        });
                        todoStmt.finalize();
                        
                        // Save todo settings without encryption
                        const todoSettings = JSON.stringify({
                            sortType: todoState.sortType,
                            selectedFolder: todoState.selectedFolder
                        });
                        
                        this.db.run(
                            'INSERT OR REPLACE INTO settings (id, value, updated_at) VALUES (?, ?, ?)',
                            ['todo_settings', todoSettings, timestamp]
                        );

                        this.db.run('COMMIT', (err) => {
                            if (err) reject(err);
                            else resolve(true);
                        });
                    } catch (error) {
                        this.db.run('ROLLBACK');
                        reject(error);
                    }
                });
            });
        });
    }

    // Modified getTodoState to handle encryption being disabled
    async getTodoState() {
        return this.withConnection(async () => {
            return new Promise((resolve, reject) => {
                const result = {
                    todos: [],
                    folders: [],
                    sortType: 'manual',
                    selectedFolder: 'Default'
                };

                this.db.serialize(() => {
                    // Get todos
                    this.db.all('SELECT * FROM todos ORDER BY id', [], (err, rows) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        result.todos = rows.map(todo => ({
                            id: todo.id,
                            text: this.encryptionEnabled ? this.decrypt(todo.text) : todo.text,
                            completed: Boolean(todo.completed),
                            folder: todo.folder,
                            createdAt: todo.created_at,
                            reminder: todo.reminder
                        }));

                        // Get folders
                        this.db.all('SELECT name FROM todo_folders ORDER BY name', [], (err, rows) => {
                            if (err) {
                                reject(err);
                                return;
                            }
                            result.folders = rows.map(folder => folder.name);

                            // Get todo settings
                            this.db.get('SELECT value FROM settings WHERE id = ?', ['todo_settings'], (err, row) => {
                                if (err) {
                                    reject(err);
                                    return;
                                }
                                if (row) {
                                    try {
                                        const settings = JSON.parse(row.value);
                                        if (settings && settings.sortType) {
                                            result.sortType = settings.sortType;
                                        }
                                        if (settings && settings.selectedFolder) {
                                            result.selectedFolder = settings.selectedFolder;
                                        }
                                    } catch (error) {
                                        console.error('Error parsing todo settings:', error);
                                    }
                                }
                                resolve(result);
                            });
                        });
                    });
                });
            });
        });
    }

    // Modified secure document operations to handle encryption being disabled
    async saveSecureDocument(document, password) {
        if (!this.encryptionEnabled) {
            throw new Error('Encryption is not set up. Please set your credentials in the settings panel first.');
        }
        return this.withConnection(async () => {
            const timestamp = Date.now();
            
            return new Promise((resolve, reject) => {
                try {
                    // Convert Buffer to base64 string for storage
                    const contentBase64 = Buffer.isBuffer(document.content)
                        ? document.content.toString('base64')
                        : Buffer.from(document.content).toString('base64');

                    // Create metadata object
                    const metadata = {
                        compressed: document.compressed || false,
                        content: contentBase64
                    };

                    // Encrypt the metadata
                    const encrypted = CryptoJS.AES.encrypt(
                        JSON.stringify(metadata),
                        password
                    ).toString();

                    this.db.run(
                        `INSERT OR REPLACE INTO secure_documents 
                        (id, name, size, date, content, updated_at) 
                        VALUES (?, ?, ?, ?, ?, ?)`,
                        [
                            document.id,
                            document.name,
                            document.size,
                            document.date,
                            encrypted,
                            timestamp
                        ],
                        (err) => {
                            if (err) reject(err);
                            else resolve(true);
                        }
                    );
                } catch (error) {
                    reject(new Error('Failed to save secure document: ' + error.message));
                }
            });
        });
    }

    async getSecureDocuments() {
        if (!this.encryptionEnabled) {
            throw new Error('Encryption is not set up. Please set your credentials in the settings panel first.');
        }
        return this.withConnection(async () => {
            return new Promise((resolve, reject) => {
                this.db.all(
                    'SELECT id, name, size, date FROM secure_documents ORDER BY date DESC',
                    [],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    }
                );
            });
        });
    }

    async getSecureDocument(id, password) {
        if (!this.encryptionEnabled) {
            throw new Error('Encryption is not set up. Please set your credentials in the settings panel first.');
        }
        return this.withConnection(async () => {
            return new Promise((resolve, reject) => {
                this.db.get(
                    'SELECT * FROM secure_documents WHERE id = ?',
                    [id],
                    (err, row) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        if (!row) {
                            reject(new Error('Document not found'));
                            return;
                        }
                        try {
                            // Decrypt the metadata
                            const decrypted = CryptoJS.AES.decrypt(row.content, password);
                            const metadata = JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
                            
                            // Convert base64 back to Buffer
                            const content = Buffer.from(metadata.content, 'base64');
                            
                            resolve({
                                ...row,
                                content,
                                compressed: metadata.compressed
                            });
                        } catch (error) {
                            console.error('Decryption error:', error);
                            reject(new Error('Failed to decrypt document: ' + error.message));
                        }
                    }
                );
            });
        });
    }

    async deleteSecureDocument(id) {
        if (!this.encryptionEnabled) {
            throw new Error('Encryption is not set up. Please set your credentials in the settings panel first.');
        }
        return this.withConnection(async () => {
            return new Promise((resolve, reject) => {
                this.db.run(
                    'DELETE FROM secure_documents WHERE id = ?',
                    [id],
                    (err) => {
                        if (err) reject(err);
                        else resolve(true);
                    }
                );
            });
        });
    }

    // Rest of the class implementation remains the same...
    // (getDatabasePath, changeDatabaseLocation, etc.)
}

module.exports = DatabaseService;
