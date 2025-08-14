import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto';

/**
 * Supported secret storage backends
 */
export type SecretBackend = 'env' | 'memory' | 'file' | 'vault';

/**
 * Configuration for secret management
 */
export interface SecretManagerConfig {
  /** Backend to use for secret storage */
  backend: SecretBackend;
  /** Encryption key for local storage (auto-generated if not provided) */
  encryptionKey?: string;
  /** File path for file-based storage */
  filePath?: string;
  /** Vault configuration (for future implementation) */
  vaultConfig?: {
    endpoint: string;
    token: string;
    path: string;
  };
  /** Enable audit logging of secret access */
  enableAuditLogging?: boolean;
}

/**
 * Secret metadata for audit logging
 */
export interface SecretMetadata {
  key: string;
  accessedAt: Date;
  accessedBy: string;
  operation: 'read' | 'write' | 'delete';
  success: boolean;
  error?: string;
}

/**
 * Encrypted secret storage format
 */
interface EncryptedSecret {
  iv: string;
  encryptedData: string;
  hash: string;
}

/**
 * Secure secret manager with encryption and audit logging
 * Provides secure storage and retrieval of API keys and other sensitive data
 */
export class SecretManager {
  private config: SecretManagerConfig;
  private encryptionKey: Buffer;
  private memoryStore: Map<string, EncryptedSecret> = new Map();
  private auditLog: SecretMetadata[] = [];

  constructor(config: SecretManagerConfig) {
    this.config = {
      enableAuditLogging: true,
      ...config,
    };

    // Initialize encryption key
    this.encryptionKey = this.initializeEncryptionKey();
  }

  /**
   * Initialize or generate encryption key
   */
  private initializeEncryptionKey(): Buffer {
    if (this.config.encryptionKey) {
      return Buffer.from(this.config.encryptionKey, 'hex');
    }

    // Generate a new 256-bit encryption key
    const key = randomBytes(32);
    
    // Store the key securely (in production, this should be stored in a secure location)
    if (this.config.backend === 'env') {
      process.env['SECRET_MANAGER_KEY'] = key.toString('hex');
    }

    return key;
  }

  /**
   * Encrypt a secret value
   */
  private encrypt(value: string): EncryptedSecret {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    
    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    const encryptedData = encrypted + ':' + authTag.toString('hex');
    
    // Create hash for integrity verification
    const hash = createHash('sha256')
      .update(value)
      .digest('hex');

    return {
      iv: iv.toString('hex'),
      encryptedData,
      hash,
    };
  }

  /**
   * Decrypt a secret value
   */
  private decrypt(encrypted: EncryptedSecret): string {
    const [encryptedText, authTagHex] = encrypted.encryptedData.split(':');
    if (!encryptedText || !authTagHex) {
      throw new Error('Invalid encrypted data format');
    }
    
    const iv = Buffer.from(encrypted.iv, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    // Verify integrity
    const hash = createHash('sha256')
      .update(decrypted)
      .digest('hex');
    
    if (hash !== encrypted.hash) {
      throw new Error('Secret integrity verification failed');
    }
    
    return decrypted;
  }

  /**
   * Log secret access for audit purposes
   */
  private logAccess(metadata: Omit<SecretMetadata, 'accessedAt'>): void {
    if (!this.config.enableAuditLogging) {
      return;
    }

    const auditEntry: SecretMetadata = {
      ...metadata,
      accessedAt: new Date(),
    };

    this.auditLog.push(auditEntry);

    // Keep only last 1000 entries to prevent memory bloat
    if (this.auditLog.length > 1000) {
      this.auditLog.shift();
    }

    // In production, this should be sent to a secure logging system
    if (process.env['NODE_ENV'] !== 'test') {
      console.log(JSON.stringify({
        level: 'AUDIT',
        service: 'SecretManager',
        event: 'secret_access',
        ...auditEntry,
        // Never log the actual secret value
        key: this.hashKey(metadata.key),
      }));
    }
  }

  /**
   * Hash a key for safe logging
   */
  private hashKey(key: string): string {
    return createHash('sha256')
      .update(key)
      .digest('hex')
      .substring(0, 16); // First 16 chars for identification
  }

  /**
   * Store a secret securely
   */
  async setSecret(key: string, value: string, accessedBy: string = 'system'): Promise<void> {
    try {
      // Validate inputs
      if (!key || !value) {
        throw new Error('Key and value are required');
      }

      // Never store secrets in plain text
      const encrypted = this.encrypt(value);

      switch (this.config.backend) {
        case 'memory':
          this.memoryStore.set(key, encrypted);
          break;

        case 'env':
          // For environment variables, we still encrypt the value
          process.env[`SECRET_${key.toUpperCase()}`] = JSON.stringify(encrypted);
          break;

        case 'file':
          // File-based storage would be implemented here
          throw new Error('File-based storage not yet implemented');

        case 'vault':
          // Vault integration would be implemented here
          throw new Error('Vault integration not yet implemented');

        default:
          throw new Error(`Unsupported backend: ${this.config.backend}`);
      }

      this.logAccess({
        key,
        accessedBy,
        operation: 'write',
        success: true,
      });

    } catch (error) {
      this.logAccess({
        key,
        accessedBy,
        operation: 'write',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Retrieve a secret securely
   */
  async getSecret(key: string, accessedBy: string = 'system'): Promise<string | null> {
    try {
      let encrypted: EncryptedSecret | null = null;

      switch (this.config.backend) {
        case 'memory':
          encrypted = this.memoryStore.get(key) || null;
          break;

        case 'env':
          const envValue = process.env[`SECRET_${key.toUpperCase()}`] || process.env[key];
          if (envValue) {
            try {
              // Try to parse as encrypted secret
              encrypted = JSON.parse(envValue);
            } catch {
              // Fallback to plain text for backward compatibility
              // This should be migrated to encrypted storage
              this.logAccess({
                key,
                accessedBy,
                operation: 'read',
                success: true,
                error: 'Retrieved plain text secret (should be migrated to encrypted)',
              });
              return envValue;
            }
          }
          break;

        case 'file':
          throw new Error('File-based storage not yet implemented');

        case 'vault':
          throw new Error('Vault integration not yet implemented');

        default:
          throw new Error(`Unsupported backend: ${this.config.backend}`);
      }

      if (!encrypted) {
        this.logAccess({
          key,
          accessedBy,
          operation: 'read',
          success: false,
          error: 'Secret not found',
        });
        return null;
      }

      const decrypted = this.decrypt(encrypted);

      this.logAccess({
        key,
        accessedBy,
        operation: 'read',
        success: true,
      });

      return decrypted;

    } catch (error) {
      this.logAccess({
        key,
        accessedBy,
        operation: 'read',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Delete a secret
   */
  async deleteSecret(key: string, accessedBy: string = 'system'): Promise<boolean> {
    try {
      let existed = false;

      switch (this.config.backend) {
        case 'memory':
          existed = this.memoryStore.has(key);
          this.memoryStore.delete(key);
          break;

        case 'env':
          existed = !!process.env[`SECRET_${key.toUpperCase()}`];
          delete process.env[`SECRET_${key.toUpperCase()}`];
          break;

        case 'file':
          throw new Error('File-based storage not yet implemented');

        case 'vault':
          throw new Error('Vault integration not yet implemented');

        default:
          throw new Error(`Unsupported backend: ${this.config.backend}`);
      }

      this.logAccess({
        key,
        accessedBy,
        operation: 'delete',
        success: true,
      });

      return existed;

    } catch (error) {
      this.logAccess({
        key,
        accessedBy,
        operation: 'delete',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * List all secret keys (for management purposes)
   */
  async listSecrets(): Promise<string[]> {
    switch (this.config.backend) {
      case 'memory':
        return Array.from(this.memoryStore.keys());

      case 'env':
        return Object.keys(process.env)
          .filter(key => key.startsWith('SECRET_'))
          .map(key => key.replace('SECRET_', '').toLowerCase());

      case 'file':
        throw new Error('File-based storage not yet implemented');

      case 'vault':
        throw new Error('Vault integration not yet implemented');

      default:
        throw new Error(`Unsupported backend: ${this.config.backend}`);
    }
  }

  /**
   * Get audit log entries
   */
  getAuditLog(): SecretMetadata[] {
    return [...this.auditLog];
  }

  /**
   * Clear audit log (for testing purposes)
   */
  clearAuditLog(): void {
    this.auditLog.length = 0;
  }

  /**
   * Validate secret manager configuration
   */
  static validateConfig(config: SecretManagerConfig): void {
    if (!config.backend) {
      throw new Error('Backend is required');
    }

    if (config.backend === 'file' && !config.filePath) {
      throw new Error('File path is required for file backend');
    }

    if (config.backend === 'vault' && !config.vaultConfig) {
      throw new Error('Vault configuration is required for vault backend');
    }
  }
}

/**
 * Default secret manager instance
 */
export const defaultSecretManager = new SecretManager({
  backend: 'env',
  enableAuditLogging: true,
});

/**
 * Convenience function to get API keys securely
 */
export async function getApiKey(provider: string, accessedBy: string = 'system'): Promise<string | null> {
  const keyMap: Record<string, string> = {
    claude: 'ANTHROPIC_API_KEY',
    gemini: 'GOOGLE_API_KEY',
    openai: 'OPENAI_API_KEY',
  };

  const envKey = keyMap[provider.toLowerCase()];
  if (!envKey) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  return await defaultSecretManager.getSecret(envKey, accessedBy);
}

/**
 * Convenience function to set API keys securely
 */
export async function setApiKey(
  provider: string, 
  apiKey: string, 
  accessedBy: string = 'system'
): Promise<void> {
  const keyMap: Record<string, string> = {
    claude: 'ANTHROPIC_API_KEY',
    gemini: 'GOOGLE_API_KEY',
    openai: 'OPENAI_API_KEY',
  };

  const envKey = keyMap[provider.toLowerCase()];
  if (!envKey) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  await defaultSecretManager.setSecret(envKey, apiKey, accessedBy);
}
