const { safeStorage } = require('electron');
const Store = require('electron-store');

class CredentialService {
    constructor() {
        // Initialize electron-store for credential storage
        this.store = new Store({
            name: 'bbzcloud-credentials',
            clearInvalidConfig: true,
            schema: {
                credentials: {
                    type: 'object',
                    default: {}
                },
                migration: {
                    type: 'object',
                    properties: {
                        completed: { type: 'boolean', default: false },
                        version: { type: 'string', default: '1.0.0' }
                    },
                    default: {
                        completed: false,
                        version: '1.0.0'
                    }
                }
            }
        });

        // Initialize migration on startup
        this.initPromise = this.initialize().catch(err => {
            console.error('Failed to initialize credential service:', err);
        });
    }

    async initialize() {
        // Check if we need to migrate from keytar
        const migrationStatus = this.store.get('migration');
        if (!migrationStatus.completed) {
            await this.migrateFromKeytar();
        }
    }

    async ensureInitialized() {
        await this.initPromise;
    }

    async migrateFromKeytar() {
        console.log('[CredentialService] Starting migration from keytar to safeStorage');
        
        try {
            // Check if safeStorage is available
            if (!safeStorage.isEncryptionAvailable()) {
                console.warn('[CredentialService] safeStorage encryption not available, keeping keytar as fallback');
                return;
            }

            // Try to load keytar
            let keytar;
            try {
                keytar = require('keytar');
            } catch (error) {
                console.log('[CredentialService] keytar not available, skipping migration');
                this.store.set('migration.completed', true);
                return;
            }

            // Known credential keys from the application
            const credentialKeys = [
                { service: 'bbzcloud', account: 'password' }, // Main encryption password
                // Add other known service/account combinations as needed
            ];

            let migratedCount = 0;
            const errors = [];

            for (const { service, account } of credentialKeys) {
                try {
                    const password = await keytar.getPassword(service, account);
                    if (password) {
                        // Store in new system
                        await this.setPassword(service, account, password);
                        
                        // Clean up old keytar entry
                        try {
                            await keytar.deletePassword(service, account);
                            console.log(`[CredentialService] Migrated and cleaned up ${service}:${account}`);
                        } catch (deleteError) {
                            console.warn(`[CredentialService] Could not delete keytar entry ${service}:${account}:`, deleteError.message);
                        }
                        
                        migratedCount++;
                    }
                } catch (error) {
                    console.warn(`[CredentialService] Failed to migrate ${service}:${account}:`, error.message);
                    errors.push({ service, account, error: error.message });
                }
            }

            // Mark migration as complete
            this.store.set('migration.completed', true);
            this.store.set('migration.version', '1.0.0');
            
            console.log(`[CredentialService] Migration completed: ${migratedCount} credentials migrated`);
            if (errors.length > 0) {
                console.warn(`[CredentialService] Migration errors:`, errors);
            }

        } catch (error) {
            console.error('[CredentialService] Migration failed:', error);
            // Don't mark as complete - will retry next time
        }
    }

    async getPassword(service, account) {
        await this.ensureInitialized();

        // Try new system first
        const newKey = `${service}:${account}`;
        const encryptedData = this.store.get(`credentials.${newKey}`);
        
        if (encryptedData && safeStorage.isEncryptionAvailable()) {
            try {
                const buffer = Buffer.from(encryptedData, 'base64');
                return safeStorage.decryptString(buffer);
            } catch (error) {
                console.error(`[CredentialService] Error decrypting ${service}:${account}:`, error);
            }
        }

        // Fallback to keytar for any remaining credentials
        try {
            const keytar = require('keytar');
            const password = await keytar.getPassword(service, account);
            if (password) {
                // Migrate this credential to new system
                console.log(`[CredentialService] Found unmigrated credential ${service}:${account}, migrating now`);
                await this.setPassword(service, account, password);
                
                // Clean up keytar entry
                try {
                    await keytar.deletePassword(service, account);
                } catch (deleteError) {
                    console.warn(`[CredentialService] Could not delete keytar entry ${service}:${account}:`, deleteError.message);
                }
                
                return password;
            }
        } catch (error) {
            console.log(`[CredentialService] keytar not available for fallback: ${error.message}`);
        }

        return null;
    }

    async setPassword(service, account, password) {
        await this.ensureInitialized();

        if (!safeStorage.isEncryptionAvailable()) {
            throw new Error('Encryption not available - cannot store credentials securely');
        }

        try {
            const encrypted = safeStorage.encryptString(password);
            const key = `${service}:${account}`;
            this.store.set(`credentials.${key}`, encrypted.toString('base64'));
            return true;
        } catch (error) {
            console.error(`[CredentialService] Error encrypting ${service}:${account}:`, error);
            throw error;
        }
    }

    async deletePassword(service, account) {
        await this.ensureInitialized();

        const key = `${service}:${account}`;
        
        // Remove from new system
        this.store.delete(`credentials.${key}`);

        // Also try to remove from keytar if it exists
        try {
            const keytar = require('keytar');
            await keytar.deletePassword(service, account);
        } catch (error) {
            // Ignore keytar errors - it might not be available
        }

        return true;
    }

    async findCredentials(service) {
        await this.ensureInitialized();

        const credentials = [];
        const storedCredentials = this.store.get('credentials', {});
        
        // Find credentials matching the service
        for (const [key, encryptedData] of Object.entries(storedCredentials)) {
            if (key.startsWith(`${service}:`)) {
                const account = key.substring(service.length + 1);
                try {
                    if (safeStorage.isEncryptionAvailable()) {
                        const buffer = Buffer.from(encryptedData, 'base64');
                        const password = safeStorage.decryptString(buffer);
                        credentials.push({ account, password });
                    }
                } catch (error) {
                    console.error(`[CredentialService] Error decrypting credential ${key}:`, error);
                }
            }
        }

        // Also check keytar for any remaining credentials
        try {
            const keytar = require('keytar');
            const keytarCredentials = await keytar.findCredentials(service);
            for (const cred of keytarCredentials) {
                // Check if we already have this in the new system
                const existingCred = credentials.find(c => c.account === cred.account);
                if (!existingCred) {
                    credentials.push(cred);
                    
                    // Migrate this credential
                    console.log(`[CredentialService] Found unmigrated credential ${service}:${cred.account}, migrating now`);
                    try {
                        await this.setPassword(service, cred.account, cred.password);
                        await keytar.deletePassword(service, cred.account);
                    } catch (migrateError) {
                        console.warn(`[CredentialService] Could not migrate ${service}:${cred.account}:`, migrateError.message);
                    }
                }
            }
        } catch (error) {
            // Ignore keytar errors - it might not be available
        }

        return credentials;
    }

    // Get migration status
    getMigrationStatus() {
        return this.store.get('migration');
    }

    // Check if encryption is available
    isEncryptionAvailable() {
        return safeStorage.isEncryptionAvailable();
    }

    // Get statistics about stored credentials
    getCredentialStats() {
        const credentials = this.store.get('credentials', {});
        const count = Object.keys(credentials).length;
        const services = new Set();
        
        for (const key of Object.keys(credentials)) {
            const service = key.split(':')[0];
            services.add(service);
        }

        return {
            totalCredentials: count,
            uniqueServices: services.size,
            services: Array.from(services),
            encryptionAvailable: this.isEncryptionAvailable(),
            migrationStatus: this.getMigrationStatus()
        };
    }
}

module.exports = CredentialService;
