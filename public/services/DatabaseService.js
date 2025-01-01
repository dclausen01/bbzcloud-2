const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs-extra');
const { app } = require('electron');
const CryptoJS = require('crypto-js');
const Store = require('electron-store');

class DatabaseService {
    constructor() {
        this.store = new Store();
        this.setupEncryption();
        // Initialize database asynchronously
        this.initPromise = this.initializeDatabase().catch(err => {
            console.error('Failed to initialize database:', err);
        });
    }

    async initializeDatabase() {
        // Get database path from electron-store or use default
        const defaultPath = path.join(app.getPath('userData'), 'bbzcloud.db');
        this.dbPath = this.store.get('databasePath', defaultPath);
        
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
                resolve();
            });
        });

        // Enable foreign keys
        await new Promise((resolve, reject) => {
            this.db.run('PRAGMA foreign_keys = ON', (err) => {
                if (err) {
                    console.error('Error enabling foreign keys:', err);
                    reject(err);
                    return;
                }
                resolve();
            });
        });

        // Create tables
        await this.createTables();
    }

    setupEncryption() {
        // Generate or retrieve encryption key
        let encryptionKey = this.store.get('encryptionKey');
        if (!encryptionKey) {
            encryptionKey = CryptoJS.lib.WordArray.random(256/8).toString();
            this.store.set('encryptionKey', encryptionKey);
        }
        this.encryptionKey = encryptionKey;
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

    // Secure documents operations
    async saveSecureDocument(document, password) {
        await this.ensureInitialized();
        const timestamp = Date.now();
        
        return new Promise((resolve, reject) => {
            const encrypted = CryptoJS.AES.encrypt(
                document.content.toString('base64'),
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
        });
    }

    async getSecureDocuments() {
        await this.ensureInitialized();
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
    }

    async getSecureDocument(id, password) {
        await this.ensureInitialized();
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
                        const decrypted = CryptoJS.AES.decrypt(row.content, password);
                        const content = Buffer.from(decrypted.toString(CryptoJS.enc.Utf8), 'base64');
                        resolve({
                            ...row,
                            content
                        });
                    } catch (error) {
                        reject(new Error('Failed to decrypt document'));
                    }
                }
            );
        });
    }

    async deleteSecureDocument(id) {
        await this.ensureInitialized();
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
    }

    // Helper to ensure database is initialized before operations
    async ensureInitialized() {
        await this.initPromise;
    }

    // Encryption/Decryption helpers
    encrypt(data) {
        return CryptoJS.AES.encrypt(JSON.stringify(data), this.encryptionKey).toString();
    }

    decrypt(encryptedData) {
        try {
            const bytes = CryptoJS.AES.decrypt(encryptedData, this.encryptionKey);
            return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
        } catch (error) {
            console.error('Decryption error:', error);
            return null;
        }
    }

    // Settings operations
    async saveSettings(settings) {
        await this.ensureInitialized();
        return new Promise((resolve, reject) => {
            const timestamp = Date.now();
            const encryptedValue = this.encrypt(settings);
            
            this.db.run(
                'INSERT OR REPLACE INTO settings (id, value, updated_at) VALUES (?, ?, ?)',
                ['app_settings', encryptedValue, timestamp],
                (err) => {
                    if (err) reject(err);
                    else resolve(true);
                }
            );
        });
    }

    async getSettings() {
        await this.ensureInitialized();
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT value FROM settings WHERE id = ?',
                ['app_settings'],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row ? this.decrypt(row.value) : null);
                }
            );
        });
    }

    // Todo operations
    async saveTodoState(todoState) {
        await this.ensureInitialized();
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
                    
                    // Insert todos
                    const todoStmt = this.db.prepare(`
                        INSERT INTO todos (id, text, completed, folder, created_at, reminder, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `);
                    
                    todoState.todos.forEach(todo => {
                        todoStmt.run(
                            todo.id,
                            todo.text,
                            todo.completed ? 1 : 0,
                            todo.folder,
                            todo.createdAt,
                            todo.reminder,
                            timestamp
                        );
                    });
                    todoStmt.finalize();
                    
                    // Save todo settings
                    const todoSettings = this.encrypt({
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
    }

    async getTodoState() {
        await this.ensureInitialized();
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
                        text: todo.text,
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
                                const settings = this.decrypt(row.value);
                                result.sortType = settings.sortType;
                                result.selectedFolder = settings.selectedFolder;
                            }
                            resolve(result);
                        });
                    });
                });
            });
        });
    }

    // Custom apps operations
    async saveCustomApps(apps) {
        await this.ensureInitialized();
        return new Promise((resolve, reject) => {
            const timestamp = Date.now();
            
            this.db.serialize(() => {
                this.db.run('BEGIN TRANSACTION');

                try {
                    // Clear existing apps
                    this.db.run('DELETE FROM custom_apps');
                    
                    // Insert new apps
                    const stmt = this.db.prepare(`
                        INSERT INTO custom_apps (id, title, url, button_variant, favicon, zoom, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `);
                    
                    apps.forEach(app => {
                        stmt.run(
                            app.id,
                            app.title,
                            app.url,
                            app.buttonVariant,
                            app.favicon || null,
                            app.zoom || 1.0,
                            timestamp
                        );
                    });
                    
                    stmt.finalize();

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
    }

    async getCustomApps() {
        await this.ensureInitialized();
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM custom_apps ORDER BY title', [], (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(rows.map(app => ({
                    id: app.id,
                    title: app.title,
                    url: app.url,
                    buttonVariant: app.button_variant,
                    favicon: app.favicon,
                    zoom: app.zoom
                })));
            });
        });
    }

    // Database location management
    getDatabasePath() {
        return this.dbPath;
    }

    async changeDatabaseLocation(newPath) {
        await this.ensureInitialized();
        if (!newPath) {
            throw new Error('Invalid path');
        }

        // Ensure directory exists
        await fs.ensureDir(path.dirname(newPath));

        return new Promise((resolve, reject) => {
            // Close current connection
            this.db.close((err) => {
                if (err) {
                    reject(err);
                    return;
                }

                // Copy current database to new location if it doesn't exist
                if (fs.existsSync(this.dbPath) && !fs.existsSync(newPath)) {
                    fs.copySync(this.dbPath, newPath);
                }

                // Update path in electron-store
                this.store.set('databasePath', newPath);
                this.dbPath = newPath;

                // Initialize new connection
                this.db = new sqlite3.Database(this.dbPath, (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve(true);
                });
            });
        });
    }

    // Get last update timestamp for change detection
    async getLastUpdateTimestamp() {
        await this.ensureInitialized();
        return new Promise((resolve, reject) => {
            this.db.get(`
                SELECT MAX(updated_at) as last_update
                FROM (
                    SELECT MAX(updated_at) as updated_at FROM settings
                    UNION ALL
                    SELECT MAX(updated_at) FROM todos
                    UNION ALL
                    SELECT MAX(updated_at) FROM todo_folders
                    UNION ALL
                    SELECT MAX(updated_at) FROM custom_apps
                )
            `, [], (err, row) => {
                if (err) reject(err);
                else resolve(row ? row.last_update || 0 : 0);
            });
        });
    }

    // Migration helpers
    async migrateFromElectronStore() {
        await this.ensureInitialized();
        const oldSettings = this.store.get('settings');
        const oldTodoState = this.store.get('todoState');

        try {
            if (oldSettings) {
                await this.saveSettings(oldSettings);
            }

            if (oldTodoState) {
                await this.saveTodoState(oldTodoState);
            }

            // Backup old data
            const backupPath = path.join(app.getPath('userData'), 'store-backup.json');
            await fs.writeJson(backupPath, {
                settings: oldSettings,
                todoState: oldTodoState
            });

            // Clear old data
            this.store.delete('settings');
            this.store.delete('todoState');

            return true;
        } catch (error) {
            console.error('Migration error:', error);
            throw error;
        }
    }
}

module.exports = DatabaseService;
