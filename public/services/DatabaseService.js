const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs-extra');
const { app } = require('electron');
const CryptoJS = require('crypto-js');
const Store = require('electron-store');

class DatabaseService {
    constructor() {
        this.store = new Store();
        this.initializeDatabase();
        this.setupEncryption();
    }

    initializeDatabase() {
        // Get database path from electron-store or use default
        const defaultPath = path.join(app.getPath('userData'), 'bbzcloud.db');
        this.dbPath = this.store.get('databasePath', defaultPath);
        
        // Ensure directory exists
        fs.ensureDirSync(path.dirname(this.dbPath));
        
        // Initialize database connection
        this.db = new Database(this.dbPath, { verbose: console.log });
        
        // Create tables if they don't exist
        this.createTables();
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

    createTables() {
        // Settings table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS settings (
                id TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );
        `);

        // Todos table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS todos (
                id INTEGER PRIMARY KEY,
                text TEXT NOT NULL,
                completed BOOLEAN NOT NULL DEFAULT 0,
                folder TEXT NOT NULL DEFAULT 'Default',
                created_at TEXT NOT NULL,
                reminder TEXT,
                updated_at INTEGER NOT NULL
            );
        `);

        // Todo folders table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS todo_folders (
                name TEXT PRIMARY KEY,
                updated_at INTEGER NOT NULL
            );
        `);

        // Custom apps table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS custom_apps (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                url TEXT NOT NULL,
                button_variant TEXT NOT NULL DEFAULT 'solid',
                favicon TEXT,
                zoom REAL NOT NULL DEFAULT 1.0,
                updated_at INTEGER NOT NULL
            );
        `);
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
    saveSettings(settings) {
        const timestamp = Date.now();
        const stmt = this.db.prepare('INSERT OR REPLACE INTO settings (id, value, updated_at) VALUES (?, ?, ?)');
        
        const encryptedValue = this.encrypt(settings);
        stmt.run('app_settings', encryptedValue, timestamp);
        
        return true;
    }

    getSettings() {
        const stmt = this.db.prepare('SELECT value FROM settings WHERE id = ?');
        const result = stmt.get('app_settings');
        
        if (result) {
            return this.decrypt(result.value);
        }
        return null;
    }

    // Todo operations
    saveTodoState(todoState) {
        const timestamp = Date.now();
        
        // Begin transaction
        const transaction = this.db.transaction(() => {
            // Clear existing data
            this.db.prepare('DELETE FROM todos').run();
            this.db.prepare('DELETE FROM todo_folders').run();
            
            // Insert folders
            const folderStmt = this.db.prepare('INSERT INTO todo_folders (name, updated_at) VALUES (?, ?)');
            for (const folder of todoState.folders) {
                folderStmt.run(folder, timestamp);
            }
            
            // Insert todos
            const todoStmt = this.db.prepare(`
                INSERT INTO todos (id, text, completed, folder, created_at, reminder, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            
            for (const todo of todoState.todos) {
                todoStmt.run(
                    todo.id,
                    todo.text,
                    todo.completed ? 1 : 0,
                    todo.folder,
                    todo.createdAt,
                    todo.reminder,
                    timestamp
                );
            }
            
            // Save sort type and selected folder in settings
            const settingsStmt = this.db.prepare('INSERT OR REPLACE INTO settings (id, value, updated_at) VALUES (?, ?, ?)');
            const todoSettings = this.encrypt({
                sortType: todoState.sortType,
                selectedFolder: todoState.selectedFolder
            });
            settingsStmt.run('todo_settings', todoSettings, timestamp);
        });
        
        // Execute transaction
        transaction();
        
        return true;
    }

    getTodoState() {
        // Get todos
        const todos = this.db.prepare('SELECT * FROM todos ORDER BY id').all()
            .map(todo => ({
                id: todo.id,
                text: todo.text,
                completed: Boolean(todo.completed),
                folder: todo.folder,
                createdAt: todo.created_at,
                reminder: todo.reminder
            }));
        
        // Get folders
        const folders = this.db.prepare('SELECT name FROM todo_folders ORDER BY name').all()
            .map(folder => folder.name);
        
        // Get todo settings
        const settingsStmt = this.db.prepare('SELECT value FROM settings WHERE id = ?');
        const settingsResult = settingsStmt.get('todo_settings');
        const todoSettings = settingsResult ? this.decrypt(settingsResult.value) : {
            sortType: 'manual',
            selectedFolder: 'Default'
        };
        
        return {
            todos,
            folders,
            ...todoSettings
        };
    }

    // Custom apps operations
    saveCustomApps(apps) {
        const timestamp = Date.now();
        
        const transaction = this.db.transaction(() => {
            // Clear existing apps
            this.db.prepare('DELETE FROM custom_apps').run();
            
            // Insert new apps
            const stmt = this.db.prepare(`
                INSERT INTO custom_apps (id, title, url, button_variant, favicon, zoom, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            
            for (const app of apps) {
                stmt.run(
                    app.id,
                    app.title,
                    app.url,
                    app.buttonVariant,
                    app.favicon || null,
                    app.zoom || 1.0,
                    timestamp
                );
            }
        });
        
        transaction();
        
        return true;
    }

    getCustomApps() {
        return this.db.prepare('SELECT * FROM custom_apps ORDER BY title').all()
            .map(app => ({
                id: app.id,
                title: app.title,
                url: app.url,
                buttonVariant: app.button_variant,
                favicon: app.favicon,
                zoom: app.zoom
            }));
    }

    // Database location management
    getDatabasePath() {
        return this.dbPath;
    }

    async changeDatabaseLocation(newPath) {
        // Validate new path
        if (!newPath) {
            throw new Error('Invalid path');
        }

        // Ensure directory exists
        await fs.ensureDir(path.dirname(newPath));

        // Close current connection
        this.db.close();

        // Copy current database to new location if it doesn't exist
        if (fs.existsSync(this.dbPath) && !fs.existsSync(newPath)) {
            await fs.copy(this.dbPath, newPath);
        }

        // Update path in electron-store
        this.store.set('databasePath', newPath);
        this.dbPath = newPath;

        // Initialize new connection
        this.db = new Database(this.dbPath, { verbose: console.log });

        return true;
    }

    // Get last update timestamp for change detection
    getLastUpdateTimestamp() {
        const result = this.db.prepare(`
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
        `).get();
        
        return result.last_update || 0;
    }

    // Migration helpers
    async migrateFromElectronStore() {
        const oldSettings = this.store.get('settings');
        const oldTodoState = this.store.get('todoState');

        if (oldSettings) {
            this.saveSettings(oldSettings);
        }

        if (oldTodoState) {
            this.saveTodoState(oldTodoState);
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
    }
}

module.exports = DatabaseService;
