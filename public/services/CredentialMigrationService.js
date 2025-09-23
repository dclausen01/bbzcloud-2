const { safeStorage } = require('electron');
const Store = require('electron-store');

class CredentialMigrationService {
    constructor() {
        this.store = new Store({
            name: 'credential-migration',
            clearInvalidConfig: true,
            schema: {
                migrationCompleted: {
                    type: 'boolean',
                    default: false
                },
                migrationVersion: {
                    type: 'string',
                    default: '1.0.0'
                }
            }
        });
    }

    /**
     * Check if migration has been completed
     */
    isMigrationCompleted() {
        return this.store.get('migrationCompleted', false);
    }

    /**
     * Mark migration as completed
     */
    markMigrationCompleted() {
        this.store.set('migrationCompleted', true);
        this.store.set('migrationVersion', '1.0.0');
        console.log('[Migration] Migration marked as completed');
    }

    /**
     * Check if safeStorage is available
     */
    isSafeStorageAvailable() {
        return safeStorage && safeStorage.isEncryptionAvailable();
    }

    /**
     * Migrate credentials from keytar to safeStorage
     */
    async migrateCredentials() {
        if (this.isMigrationCompleted()) {
            console.log('[Migration] Credential migration already completed');
            return { success: true, message: 'Migration already completed' };
        }

        if (!this.isSafeStorageAvailable()) {
            console.error('[Migration] safeStorage is not available');
            return { success: false, error: 'safeStorage is not available on this system' };
        }

        try {
            // Import keytar only for migration
            let keytar;
            try {
                keytar = require('keytar');
            } catch (error) {
                console.log('[Migration] keytar not available, skipping migration');
                this.markMigrationCompleted();
                return { success: true, message: 'No keytar to migrate from' };
            }

            const migratedCredentials = [];
            const errors = [];

            // Known credentials to migrate based on DATABASE_CONFIG.ACCOUNTS
            const credentialsToMigrate = [
                { service: 'bbzcloud', account: 'email' },
                { service: 'bbzcloud', account: 'password' },
                { service: 'bbzcloud', account: 'bbbPassword' },
                { service: 'bbzcloud', account: 'webuntisEmail' },
                { service: 'bbzcloud', account: 'webuntisPassword' }
            ];

            for (const { service, account } of credentialsToMigrate) {
                try {
                    const password = await keytar.getPassword(service, account);
                    if (password) {
                        // Encrypt and store in safeStorage
                        const encryptedData = safeStorage.encryptString(password);
                        const key = `${service}:${account}`;
                        
                        // Store encrypted data in electron-store
                        this.store.set(`credentials.${key}`, encryptedData.toString('base64'));
                        
                        migratedCredentials.push({ service, account });
                        console.log(`[Migration] Migrated credential for ${service}:${account}`);
                    }
                } catch (error) {
                    console.error(`[Migration] Error migrating ${service}:${account}:`, error);
                    errors.push({ service, account, error: error.message });
                }
            }

            // Mark migration as completed even if some credentials failed
            this.markMigrationCompleted();

            return {
                success: true,
                migratedCredentials,
                errors,
                message: `Migrated ${migratedCredentials.length} credentials`
            };

        } catch (error) {
            console.error('[Migration] Critical error during migration:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get password using safeStorage (post-migration)
     */
    async getPassword(service, account) {
        if (!this.isSafeStorageAvailable()) {
            throw new Error('safeStorage is not available');
        }

        const key = `${service}:${account}`;
        const encryptedData = this.store.get(`credentials.${key}`);
        
        if (!encryptedData) {
            return null;
        }

        try {
            const buffer = Buffer.from(encryptedData, 'base64');
            return safeStorage.decryptString(buffer);
        } catch (error) {
            console.error(`[Migration] Error decrypting credential for ${service}:${account}:`, error);
            throw new Error('Failed to decrypt credential');
        }
    }

    /**
     * Set password using safeStorage
     */
    async setPassword(service, account, password) {
        if (!this.isSafeStorageAvailable()) {
            throw new Error('safeStorage is not available');
        }

        try {
            const encryptedData = safeStorage.encryptString(password);
            const key = `${service}:${account}`;
            
            this.store.set(`credentials.${key}`, encryptedData.toString('base64'));
            return true;
        } catch (error) {
            console.error(`[Migration] Error encrypting credential for ${service}:${account}:`, error);
            throw new Error('Failed to encrypt credential');
        }
    }

    /**
     * Delete password
     */
    async deletePassword(service, account) {
        const key = `${service}:${account}`;
        this.store.delete(`credentials.${key}`);
        return true;
    }

    /**
     * Compatibility wrapper that tries both keytar and safeStorage
     */
    async getPasswordCompat(service, account) {
        // If migration is completed, use only safeStorage
        if (this.isMigrationCompleted()) {
            try {
                return await this.getPassword(service, account);
            } catch (error) {
                console.error(`[Migration] Error getting password from safeStorage for ${service}:${account}:`, error);
                return null;
            }
        }

        // During migration phase, try keytar first, then safeStorage
        try {
            const keytar = require('keytar');
            const password = await keytar.getPassword(service, account);
            if (password) {
                return password;
            }
        } catch (error) {
            console.log('[Migration] keytar not available, trying safeStorage');
        }

        // Fallback to safeStorage
        try {
            return await this.getPassword(service, account);
        } catch (error) {
            console.error(`[Migration] Error getting password from safeStorage for ${service}:${account}:`, error);
            return null;
        }
    }

    /**
     * Compatibility wrapper for setting passwords
     */
    async setPasswordCompat(service, account, password) {
        // Always use safeStorage for new passwords
        return await this.setPassword(service, account, password);
    }

    /**
     * Run migration automatically on startup
     */
    async runStartupMigration() {
        console.log('[Migration] Running startup migration check...');
        
        if (this.isMigrationCompleted()) {
            console.log('[Migration] Migration already completed, skipping');
            return { success: true, message: 'Migration already completed' };
        }

        console.log('[Migration] Starting credential migration...');
        const result = await this.migrateCredentials();
        
        if (result.success) {
            console.log(`[Migration] Migration completed successfully: ${result.message}`);
            if (result.migratedCredentials && result.migratedCredentials.length > 0) {
                console.log('[Migration] Migrated credentials:', result.migratedCredentials);
            }
            if (result.errors && result.errors.length > 0) {
                console.warn('[Migration] Migration errors:', result.errors);
            }
        } else {
            console.error('[Migration] Migration failed:', result.error);
        }

        return result;
    }
}

module.exports = CredentialMigrationService;
