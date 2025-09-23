const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs-extra');
const { app } = require('electron');
const CryptoJS = require('crypto-js');
const Store = require('electron-store');

class DatabaseService {
    constructor() {
        this.db = null;
        this.isConnected = false;
        this.activeWatchers = new Map(); // Track file watchers for cleanup
        this.tempFiles = new Set(); // Track temporary files for cleanup
        this.lastMemoryCheck = Date.now();
        this.memoryCheckInterval = 5 * 60 * 1000; // 5 minutes
        
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
                },
                navbarZoom: {
                    type: 'number',
                    default: 0.9
                }
            }
        });
        
        // Initialize database synchronously
        try {
            this.initialize();
        } catch (err) {
            console.error('Failed to initialize database:', err);
        }
        
        // Setup periodic memory monitoring (macOS specific)
        if (process.platform === 'darwin') {
            this.setupMemoryMonitoring();
        }
    }

    initialize() {
        this.setupEncryption();
        this.initializeDatabase();
    }

    initializeDatabase() {
        try {
            // Get database path from electron-store or use default
            const defaultPath = path.normalize(path.join(app.getPath('userData'), 'bbzcloud.db'));
            this.dbPath = path.normalize(this.store.get('databasePath', defaultPath));
            
            // Ensure directory exists
            fs.ensureDirSync(path.dirname(this.dbPath));
            
            // Initialize database connection (synchronous)
            this.db = new Database(this.dbPath);
            this.isConnected = true;

            // Enable foreign keys and configure database
            this.db.pragma('foreign_keys = ON');
            this.db.pragma('journal_mode = WAL'); // Enable WAL mode for better performance
            
            // Check database integrity
            const integrityCheck = this.db.pragma('integrity_check');
            if (integrityCheck[0].integrity_check !== 'ok') {
                throw new Error('Database integrity check failed');
            }

            // Create tables
            this.createTables();
            
        } catch (error) {
            console.error('Database initialization error:', error);
            throw error;
        }
    }

    setupEncryption() {
        try {
            // Get encryption key from keytar
            const keytar = require('keytar');
            // Note: keytar.getPassword is async, but we'll handle this differently
            // For now, we'll set it to null and handle it in async methods
            this.encryptionKey = null;
            
            // We'll need to get the password asynchronously when needed
            this.getEncryptionKeyAsync = async () => {
                if (this.encryptionKey === null) {
                    try {
                        this.encryptionKey = await keytar.getPassword('bbzcloud', 'password');
                    } catch (error) {
                        console.error('Error getting encryption key:', error);
                        this.encryptionKey = null;
                    }
                }
                return this.encryptionKey;
            };
        } catch (error) {
            console.error('Error in setupEncryption:', error);
            this.encryptionKey = null;
        }
    }

    async reencryptData(oldPassword, newPassword) {
        // Ensure we have a connection
        this.ensureConnection();
        
        // First verify we can decrypt with old password
        this.encryptionKey = oldPassword;
        try {
            await this.getTodoState(); // This will throw if decryption fails
        } catch (error) {
            throw new Error('Invalid old password');
        }

        // Start transaction
        const transaction = this.db.transaction(() => {
            try {
                // 1. Reencrypt todos
                const todos = this.db.prepare('SELECT * FROM todos').all();
                const todoStmt = this.db.prepare(`
                    UPDATE todos 
                    SET text = ?
                    WHERE id = ?
                `);

                for (const todo of todos) {
                    // Decrypt with old password
                    const decryptedText = this.decrypt(todo.text);
                    
                    // Encrypt with new password
                    this.encryptionKey = newPassword;
                    const newEncryptedText = this.encrypt(decryptedText);
                    
                    todoStmt.run(newEncryptedText, todo.id);
                }

                // 2. Reencrypt secure documents
                const docs = this.db.prepare('SELECT * FROM secure_documents').all();
                const docStmt = this.db.prepare(`
                    UPDATE secure_documents 
                    SET content = ?
                    WHERE id = ?
                `);

                for (const doc of docs) {
                    try {
                        // Decrypt with old password
                        const decrypted = CryptoJS.AES.decrypt(doc.content, oldPassword);
                        const metadata = JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
                        
                        // Encrypt with new password
                        const newEncrypted = CryptoJS.AES.encrypt(
                            JSON.stringify(metadata),
                            newPassword
                        ).toString();
                        
                        docStmt.run(newEncrypted, doc.id);
                    } catch (error) {
                        console.error('Error reencrypting document:', error);
                    }
                }

                // Update encryption key
                this.encryptionKey = newPassword;
            } catch (error) {
                throw error;
            }
        });

        transaction();
        return true;
    }

    createTables() {
        // Settings table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS settings (
                id TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            )
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
            )
        `);

        // Todo folders table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS todo_folders (
                name TEXT PRIMARY KEY,
                updated_at INTEGER NOT NULL
            )
        `);

        // Insert Default folder if it doesn't exist
        const insertDefaultFolder = this.db.prepare(`
            INSERT OR IGNORE INTO todo_folders (name, updated_at)
            VALUES ('Default', ?)
        `);
        insertDefaultFolder.run(Date.now());

        // Secure documents table
        this.db.exec(`
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
        this.db.exec(`
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
    }

    closeConnection() {
        if (this.db && this.isConnected) {
            try {
                this.db.close();
                this.isConnected = false;
            } catch (error) {
                console.error('Error closing database:', error);
            }
        }
    }

    // Helper to ensure database connection
    ensureConnection() {
        if (!this.db || !this.isConnected) {
            this.initializeDatabase();
        }
    }

    // Encryption/Decryption helpers
    encrypt(data) {
        if (!this.encryptionKey) {
            // If no encryption key is set, return data as-is
            return JSON.stringify(data);
        }
        return CryptoJS.AES.encrypt(JSON.stringify(data), this.encryptionKey).toString();
    }

    decrypt(encryptedData) {
        if (!encryptedData) {
            throw new Error('Missing encrypted data');
        }
        if (!this.encryptionKey) {
            // If no encryption key is set, try to parse data as unencrypted JSON
            try {
                return JSON.parse(encryptedData);
            } catch (error) {
                console.error('Error parsing unencrypted data:', error);
                throw new Error('Failed to parse data');
            }
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

    // Settings operations
    async saveSettings(settings) {
        this.ensureConnection();
        
        // Save zooms to electron-store (device specific)
        const globalZoom = typeof settings.globalZoom === 'number' ? settings.globalZoom : 1.0;
        const navbarZoom = typeof settings.navbarZoom === 'number' ? settings.navbarZoom : 0.9;
        
        console.log('[Settings] Saving zoom values:', { globalZoom, navbarZoom });
        
        this.store.set('globalZoom', globalZoom);
        this.store.set('navbarZoom', navbarZoom);

        // Save other settings to database
        const settingsToSave = {
            navigationButtons: Object.entries(settings.navigationButtons || {}).reduce((acc, [key, button]) => ({
                ...acc,
                [key]: {
                    visible: button.visible
                }
            }), {}),
            theme: settings.theme || 'light',
            autostart: settings.autostart ?? false,
            minimizedStart: settings.minimizedStart ?? false
        };

        const timestamp = Date.now();
        const stmt = this.db.prepare(
            'INSERT OR REPLACE INTO settings (id, value, updated_at) VALUES (?, ?, ?)'
        );
        
        stmt.run('app_settings', JSON.stringify(settingsToSave), timestamp);
        return true;
    }

    async getSettings() {
        this.ensureConnection();
        
        const stmt = this.db.prepare('SELECT value FROM settings WHERE id = ?');
        const row = stmt.get('app_settings');
        
        let settings = {};
        try {
            settings = row ? JSON.parse(row.value) : {};
        } catch (error) {
            console.error('Error parsing settings:', error);
        }
        
        // Get zooms from electron-store (device specific)
        const globalZoom = parseFloat(this.store.get('globalZoom')) || 1.0;
        const navbarZoom = parseFloat(this.store.get('navbarZoom')) || 0.9;
        
        console.log('[Settings] Loading zoom values:', { globalZoom, navbarZoom });
        
        const result = {
            navigationButtons: settings?.navigationButtons || {},
            theme: settings?.theme || 'light',
            globalZoom: globalZoom,
            navbarZoom: navbarZoom,
            autostart: settings.autostart ?? false,
            minimizedStart: settings.minimizedStart ?? false
        };
        
        return result;
    }

    // Todo operations
    async saveTodoState(todoState) {
        this.ensureConnection();
        
        // Ensure we have the encryption key
        await this.getEncryptionKeyAsync();
        
        const timestamp = Date.now();
        
        const transaction = this.db.transaction(() => {
            // Clear existing data
            this.db.prepare('DELETE FROM todos').run();
            this.db.prepare('DELETE FROM todo_folders').run();
            
            // Insert folders
            const folderStmt = this.db.prepare('INSERT INTO todo_folders (name, updated_at) VALUES (?, ?)');
            for (const folder of todoState.folders) {
                folderStmt.run(folder, timestamp);
            }
            
            // Insert todos with encrypted text
            const todoStmt = this.db.prepare(`
                INSERT INTO todos (id, text, completed, folder, created_at, reminder, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            
            for (const todo of todoState.todos) {
                // Only encrypt the text content
                const encryptedText = this.encrypt(todo.text);
                todoStmt.run(
                    todo.id,
                    encryptedText,
                    todo.completed ? 1 : 0,
                    todo.folder,
                    todo.createdAt,
                    todo.reminder,
                    timestamp
                );
            }
            
            // Save todo settings without encryption
            const todoSettings = JSON.stringify({
                sortType: todoState.sortType,
                selectedFolder: todoState.selectedFolder
            });
            
            const settingsStmt = this.db.prepare(
                'INSERT OR REPLACE INTO settings (id, value, updated_at) VALUES (?, ?, ?)'
            );
            settingsStmt.run('todo_settings', todoSettings, timestamp);
        });

        transaction();
        return true;
    }

    async getTodoState() {
        this.ensureConnection();
        
        // Ensure we have the encryption key
        await this.getEncryptionKeyAsync();
        
        const result = {
            todos: [],
            folders: [],
            sortType: 'manual',
            selectedFolder: 'Default'
        };

        // Get todos
        const todoStmt = this.db.prepare('SELECT * FROM todos ORDER BY id');
        const todos = todoStmt.all();
        
        result.todos = todos.map(todo => ({
            id: todo.id,
            text: this.decrypt(todo.text), // Decrypt the text content
            completed: Boolean(todo.completed),
            folder: todo.folder,
            createdAt: todo.created_at,
            reminder: todo.reminder
        }));

        // Get folders
        const folderStmt = this.db.prepare('SELECT name FROM todo_folders ORDER BY name');
        const folders = folderStmt.all();
        result.folders = folders.map(folder => folder.name);

        // Get todo settings
        const settingsStmt = this.db.prepare('SELECT value FROM settings WHERE id = ?');
        const settingsRow = settingsStmt.get('todo_settings');
        
        if (settingsRow) {
            try {
                const settings = JSON.parse(settingsRow.value);
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

        return result;
    }

    // Custom apps operations
    async saveCustomApps(apps) {
        this.ensureConnection();
        
        const timestamp = Date.now();
        
        const transaction = this.db.transaction(() => {
            // Clear existing apps
            this.db.prepare('DELETE FROM custom_apps').run();
            
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
            
            for (const app of sanitizedApps) {
                stmt.run(
                    app.id,
                    app.title,
                    app.url,
                    app.buttonVariant,
                    app.favicon,
                    app.zoom,
                    timestamp
                );
            }
        });

        transaction();
        return true;
    }

    async getCustomApps() {
        this.ensureConnection();
        
        const stmt = this.db.prepare('SELECT * FROM custom_apps ORDER BY title');
        const apps = stmt.all();
        
        return apps.map(app => ({
            id: app.id,
            title: app.title,
            url: app.url,
            buttonVariant: app.button_variant,
            favicon: app.favicon,
            zoom: app.zoom
        }));
    }

    // Secure documents operations
    async saveSecureDocument(document, password) {
        this.ensureConnection();
        
        const timestamp = Date.now();
        
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

        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO secure_documents 
            (id, name, size, date, content, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        stmt.run(
            document.id,
            document.name,
            document.size,
            document.date,
            encrypted,
            timestamp
        );
        
        return true;
    }

    async getSecureDocuments() {
        this.ensureConnection();
        
        const stmt = this.db.prepare('SELECT id, name, size, date FROM secure_documents ORDER BY date DESC');
        return stmt.all() || [];
    }

    async getSecureDocument(id, password) {
        this.ensureConnection();
        
        const stmt = this.db.prepare('SELECT * FROM secure_documents WHERE id = ?');
        const row = stmt.get(id);
        
        if (!row) {
            throw new Error('Document not found');
        }
        
        try {
            // Decrypt the metadata
            const decrypted = CryptoJS.AES.decrypt(row.content, password);
            const metadata = JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
            
            // Convert base64 back to Buffer
            const content = Buffer.from(metadata.content, 'base64');
            
            return {
                ...row,
                content,
                compressed: metadata.compressed
            };
        } catch (error) {
            console.error('Decryption error:', error);
            throw new Error('Failed to decrypt document');
        }
    }

    async deleteSecureDocument(id) {
        this.ensureConnection();
        
        const stmt = this.db.prepare('DELETE FROM secure_documents WHERE id = ?');
        stmt.run(id);
        return true;
    }

    // Database location management
    getDatabasePath() {
        return this.dbPath;
    }

    async changeDatabaseLocation(newPath) {
        if (!newPath) {
            throw new Error('Invalid path');
        }

        // Ensure directory exists
        fs.ensureDirSync(path.dirname(newPath));

        // Close current connection
        this.closeConnection();

        // Copy current database to new location if it doesn't exist
        if (fs.existsSync(this.dbPath) && !fs.existsSync(newPath)) {
            try {
                const normalizedSource = path.normalize(this.dbPath);
                const normalizedDest = path.normalize(newPath);
                fs.copySync(normalizedSource, normalizedDest);
            } catch (error) {
                console.error('Error copying database:', error);
                throw error;
            }
        }

        // Update path in electron-store
        this.store.set('databasePath', newPath);
        this.dbPath = newPath;

        // Initialize new connection
        this.initializeDatabase();

        // Notify that database has changed
        try {
            const { BrowserWindow } = require('electron');
            const windows = BrowserWindow.getAllWindows();
            for (const win of windows) {
                if (win?.webContents) {
                    win.webContents.send('database-changed');
                }
            }
        } catch (error) {
            console.error('Error sending database-changed event:', error);
        }

        return true;
    }

    // Get last update timestamp for change detection
    async getLastUpdateTimestamp() {
        this.ensureConnection();
        
        const stmt = this.db.prepare(`
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
        `);
        
        const row = stmt.get();
        return row ? row.last_update || 0 : 0;
    }

    // Memory monitoring and cleanup methods (macOS specific optimizations)
    setupMemoryMonitoring() {
        console.log('[DatabaseService] Setting up memory monitoring for macOS');
        
        // Check memory usage periodically
        this.memoryMonitorInterval = setInterval(() => {
            this.checkMemoryUsage();
        }, this.memoryCheckInterval);

        // Setup cleanup on app exit
        const cleanup = () => {
            this.cleanupResources();
        };

        process.on('exit', cleanup);
        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
    }

    checkMemoryUsage() {
        try {
            const memUsage = process.memoryUsage();
            const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
            
            console.log(`[DatabaseService] Memory usage: ${heapUsedMB}MB heap used`);
            
            // If memory usage is high, trigger cleanup
            if (heapUsedMB > 200) { // 200MB threshold
                console.log('[DatabaseService] High memory usage detected, triggering cleanup');
                this.performMemoryCleanup();
            }
        } catch (error) {
            console.error('[DatabaseService] Error checking memory usage:', error);
        }
    }

    performMemoryCleanup() {
        try {
            // Clean up file watchers
            this.cleanupFileWatchers();
            
            // Clean up temporary files
            this.cleanupTempFiles();
            
            // Force garbage collection if available
            if (global.gc) {
                global.gc();
                console.log('[DatabaseService] Forced garbage collection');
            }
        } catch (error) {
            console.error('[DatabaseService] Error during memory cleanup:', error);
        }
    }

    cleanupFileWatchers() {
        try {
            let cleanedCount = 0;
            for (const [key, watcher] of this.activeWatchers.entries()) {
                if (watcher && typeof watcher.close === 'function') {
                    watcher.close();
                    this.activeWatchers.delete(key);
                    cleanedCount++;
                }
            }
            if (cleanedCount > 0) {
                console.log(`[DatabaseService] Cleaned up ${cleanedCount} file watchers`);
            }
        } catch (error) {
            console.error('[DatabaseService] Error cleaning up file watchers:', error);
        }
    }

    cleanupTempFiles() {
        try {
            let cleanedCount = 0;
            for (const tempFile of this.tempFiles) {
                try {
                    if (fs.existsSync(tempFile)) {
                        fs.unlinkSync(tempFile);
                        cleanedCount++;
                    }
                    this.tempFiles.delete(tempFile);
                } catch (error) {
                    console.error(`[DatabaseService] Error cleaning temp file ${tempFile}:`, error);
                }
            }
            if (cleanedCount > 0) {
                console.log(`[DatabaseService] Cleaned up ${cleanedCount} temporary files`);
            }
        } catch (error) {
            console.error('[DatabaseService] Error cleaning up temp files:', error);
        }
    }

    cleanupResources() {
        try {
            console.log('[DatabaseService] Performing final resource cleanup');
            
            // Clear intervals
            if (this.memoryMonitorInterval) {
                clearInterval(this.memoryMonitorInterval);
            }

            // Cleanup watchers and temp files
            this.cleanupFileWatchers();
            this.cleanupTempFiles();

            // Close database connection
            this.closeConnection();

            console.log('[DatabaseService] Resource cleanup completed');
        } catch (error) {
            console.error('[DatabaseService] Error during final cleanup:', error);
        }
    }

    // Enhanced file watcher registration for tracking
    registerFileWatcher(key, watcher) {
        // Clean up existing watcher if present
        if (this.activeWatchers.has(key)) {
            const existingWatcher = this.activeWatchers.get(key);
            if (existingWatcher && typeof existingWatcher.close === 'function') {
                existingWatcher.close();
            }
        }
        
        this.activeWatchers.set(key, watcher);
        console.log(`[DatabaseService] Registered file watcher: ${key}`);
    }

    // Enhanced temp file registration for tracking
    registerTempFile(filePath) {
        this.tempFiles.add(filePath);
        console.log(`[DatabaseService] Registered temp file: ${filePath}`);
    }
}

module.exports = DatabaseService;
