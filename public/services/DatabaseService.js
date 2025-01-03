const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs-extra');
const { app } = require('electron');
const CryptoJS = require('crypto-js');
const Store = require('electron-store');

class DatabaseService {
    constructor() {
        this.isConnected = false;
        // Initialize electron-store with schema
        this.store = new Store({
            name: 'bbzcloud-store',
            clearInvalidConfig: true,
            schema: {
                encryptionKey: {
                    type: 'string'
                },
                databasePath: {
                    type: 'string'
                },
                globalZoom: {
                    type: 'number',
                    default: 1.0
                }
            },
            beforeEachMigration: (store, context) => {
                console.log('Migrating store:', context);
            },
            migrations: {
                '1.0.0': store => {
                    // Ensure encryption key is valid
                    const key = store.get('encryptionKey');
                    if (!key || typeof key !== 'string' || key.length < 32) {
                        console.log('Migration: Regenerating encryption key');
                        store.set('encryptionKey', CryptoJS.lib.WordArray.random(256/8).toString());
                    }
                }
            }
        });
        
        this.setupEncryption();
        
        // Initialize database asynchronously
        this.initPromise = this.initializeDatabase().catch(err => {
            console.error('Failed to initialize database:', err);
        });
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

    setupEncryption() {
        try {
            // Generate or retrieve encryption key
            let encryptionKey = this.store.get('encryptionKey');
            console.log('Retrieved encryption key exists:', Boolean(encryptionKey));
            
            if (!encryptionKey) {
                console.log('Generating new encryption key');
                encryptionKey = CryptoJS.lib.WordArray.random(256/8).toString();
                this.store.set('encryptionKey', encryptionKey);
                console.log('New encryption key saved to store');
            }
            
            // Validate encryption key format
            if (typeof encryptionKey !== 'string' || encryptionKey.length < 32) {
                console.error('Invalid encryption key format, regenerating');
                encryptionKey = CryptoJS.lib.WordArray.random(256/8).toString();
                this.store.set('encryptionKey', encryptionKey);
                console.log('Regenerated encryption key saved to store');
            }
            
            this.encryptionKey = encryptionKey;
            console.log('Encryption setup completed successfully');
        } catch (error) {
            console.error('Error in setupEncryption:', error);
            // Fallback to new key generation
            const newKey = CryptoJS.lib.WordArray.random(256/8).toString();
            this.store.set('encryptionKey', newKey);
            this.encryptionKey = newKey;
            console.log('Fallback encryption key generated and saved');
        }
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

    async closeConnection() {
        if (!this.db || !this.isConnected) return;
        
        // Don't actually close the connection, just mark it for potential cleanup
        this.pendingClose = true;
        
        // Schedule connection cleanup after a delay
        if (this.closeTimeout) {
            clearTimeout(this.closeTimeout);
        }
        
        this.closeTimeout = setTimeout(async () => {
            if (!this.pendingClose) return;
            
            try {
                await new Promise((resolve, reject) => {
                    this.db.close(err => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
                this.isConnected = false;
                this.pendingClose = false;
            } catch (error) {
                console.error('Error closing database:', error);
            }
        }, 5000); // Keep connection alive for 5 seconds
    }

    // Helper to ensure database is initialized and manage connections
    async ensureInitialized() {
        await this.initPromise;
        
        // Cancel any pending connection close
        if (this.pendingClose) {
            this.pendingClose = false;
            if (this.closeTimeout) {
                clearTimeout(this.closeTimeout);
            }
        }
        
        // Create a new connection if needed
        if (!this.isConnected) {
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
        }
        
        // Enable foreign keys
        await new Promise((resolve, reject) => {
            this.db.run('PRAGMA foreign_keys = ON', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Ensure database is ready by running a test query
        await new Promise((resolve, reject) => {
            this.db.get('SELECT 1', [], (err) => {
                if (err) {
                    console.error('Database not ready:', err);
                    reject(err);
                    return;
                }
                resolve();
            });
        });
    }

    // Helper to wrap database operations with proper connection handling
    async withConnection(operation) {
        try {
            await this.ensureInitialized();
            const result = await operation();
            await this.closeConnection();
            return result;
        } catch (error) {
            if (this.isConnected) {
                await this.closeConnection();
            }
            throw error;
        }
    }

    // Encryption/Decryption helpers
    encrypt(data) {
        return CryptoJS.AES.encrypt(JSON.stringify(data), this.encryptionKey).toString();
    }

    decrypt(encryptedData) {
        if (!encryptedData || !this.encryptionKey) {
            return null;
        }
        
        try {
            const bytes = CryptoJS.AES.decrypt(encryptedData, this.encryptionKey);
            const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
            return decryptedStr ? JSON.parse(decryptedStr) : null;
        } catch (error) {
            console.error('Decryption error:', error);
            return null;
        }
    }

    // Settings operations
    async saveSettings(settings) {
        return this.withConnection(async () => {
            // Save zoom to electron-store (device specific)
            const zoom = typeof settings.globalZoom === 'number' ? settings.globalZoom : 1.0;
            console.log('Saving zoom value:', zoom); // Debug log
            this.store.set('globalZoom', zoom);

            // Save other settings to database
            const settingsToSave = {
                navigationButtons: Object.entries(settings.navigationButtons || {}).reduce((acc, [key, button]) => ({
                    ...acc,
                    [key]: {
                        visible: button.visible
                    }
                }), {}),
                customApps: Array.isArray(settings.customApps) ? settings.customApps : [],
                theme: settings.theme,
                autostart: settings.autostart,
                minimizedStart: settings.minimizedStart
            };

            return new Promise((resolve, reject) => {
                const timestamp = Date.now();
                
                this.db.run(
                    'INSERT OR REPLACE INTO settings (id, value, updated_at) VALUES (?, ?, ?)',
                    ['app_settings', JSON.stringify(settingsToSave), timestamp],
                    (err) => {
                        if (err) reject(err);
                        else resolve(true);
                    }
                );
            });
        });
    }

    async getSettings() {
        return this.withConnection(async () => {
            return new Promise((resolve, reject) => {
                this.db.get(
                    'SELECT value FROM settings WHERE id = ?',
                    ['app_settings'],
                    (err, row) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        
                        let settings = {};
                        try {
                            settings = row ? JSON.parse(row.value) : {};
                        } catch (error) {
                            console.error('Error parsing settings:', error);
                        }
                        
                        // Get zoom from electron-store (device specific)
                        const globalZoom = parseFloat(this.store.get('globalZoom')) || 1.0;
                        console.log('Loading zoom value:', globalZoom); // Debug log
                        
                        // Only return the saved values, let the context handle defaults
                        resolve({
                            navigationButtons: settings?.navigationButtons || {},
                            customApps: Array.isArray(settings?.customApps) ? settings.customApps : [],
                            theme: settings?.theme,
                            globalZoom: globalZoom,
                            autostart: settings?.autostart,
                            minimizedStart: settings?.minimizedStart
                        });
                    }
                );
            });
        });
    }

    // Todo operations
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

    // Custom apps operations
    async saveCustomApps(apps) {
        return this.withConnection(async () => {
            return new Promise((resolve, reject) => {
                const timestamp = Date.now();
                
                this.db.serialize(() => {
                    this.db.run('BEGIN TRANSACTION');

                    try {
                        // Clear existing apps
                        this.db.run('DELETE FROM custom_apps');
                        
                        // Insert new apps with minimal required data
                        const stmt = this.db.prepare(`
                            INSERT INTO custom_apps (id, title, url, button_variant, favicon, zoom, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        `);
                        
                        const sanitizedApps = apps.map(app => ({
                            id: app.id,
                            title: app.title,
                            url: app.url,
                            buttonVariant: 'solid', // Always use default
                            favicon: null,          // Don't save favicon
                            zoom: app.zoom || 1.0,  // Use default zoom if not set
                        }));
                        
                        sanitizedApps.forEach(app => {
                            stmt.run(
                                app.id,
                                app.title,
                                app.url,
                                app.buttonVariant,
                                app.favicon,
                                app.zoom,
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
        });
    }

    async getCustomApps() {
        return this.withConnection(async () => {
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
        });
    }

    // Secure documents operations
    async saveSecureDocument(document, password) {
        return this.withConnection(async () => {
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
        });
    }

    async getSecureDocuments() {
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
        });
    }

    async deleteSecureDocument(id) {
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
                    try {
                        // Normalize paths for cross-platform compatibility
                        const normalizedSource = path.normalize(this.dbPath);
                        const normalizedDest = path.normalize(newPath);
                        fs.copySync(normalizedSource, normalizedDest);
                    } catch (error) {
                        console.error('Error copying database:', error);
                        reject(error);
                        return;
                    }
                }

                // Update path in electron-store
                this.store.set('databasePath', newPath);
                this.dbPath = newPath;

                // Initialize new connection
                this.db = new sqlite3.Database(this.dbPath, async (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    try {
                        // Enable foreign keys first
                        await new Promise((res, rej) => {
                            this.db.run('PRAGMA foreign_keys = ON', (err) => {
                                if (err) rej(err);
                                else res();
                            });
                        });

                        // Verify database integrity
                        await new Promise((res, rej) => {
                            this.db.get('PRAGMA integrity_check', [], (err, result) => {
                                if (err || result.integrity_check !== 'ok') {
                                    rej(err || new Error('Database integrity check failed'));
                                } else {
                                    res();
                                }
                            });
                        });

                        // Ensure tables exist and are properly structured
                        await this.createTables();

                        // Notify that database has changed
                        try {
                            const { BrowserWindow } = require('electron');
                            const windows = BrowserWindow.getAllWindows();
                            for (const win of windows) {
                                if (win?.webContents) {
                                    win.webContents.send('database-changed');
                                    console.log('Sent database-changed event to window');
                                }
                            }
                        } catch (error) {
                            console.error('Error sending database-changed event:', error);
                        }

                        resolve(true);
                    } catch (error) {
                        reject(error);
                    }
                });
            });
        });
    }

    // Get last update timestamp for change detection
    async getLastUpdateTimestamp() {
        return this.withConnection(async () => {
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
        });
    }

    // Migration helpers
    async migrateFromElectronStore() {
        return this.withConnection(async () => {
            const oldSettings = this.store.get('settings');
            const oldTodoState = this.store.get('todoState');

            try {
                if (oldSettings) {
                    await this.saveSettings(oldSettings);
                }

                if (oldTodoState) {
                    await this.saveTodoState(oldTodoState);
                }

                // Backup old data with normalized path
                const backupPath = path.normalize(path.join(app.getPath('userData'), 'store-backup.json'));
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
        });
    }
}

module.exports = DatabaseService;
