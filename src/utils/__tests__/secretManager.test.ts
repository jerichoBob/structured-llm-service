import { SecretManager, getApiKey, setApiKey, defaultSecretManager } from '../secretManager.js';

describe('SecretManager', () => {
  let secretManager: SecretManager;

  beforeEach(() => {
    secretManager = new SecretManager({
      backend: 'memory',
      enableAuditLogging: true,
    });
    secretManager.clearAuditLog();
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env['SECRET_TEST_KEY'];
    delete process.env['SECRET_MANAGER_KEY'];
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      const manager = new SecretManager({ backend: 'memory' });
      expect(manager).toBeDefined();
    });

    it('should validate configuration', () => {
      expect(() => {
        SecretManager.validateConfig({
          backend: 'file',
          // Missing filePath
        } as any);
      }).toThrow('File path is required for file backend');
    });
  });

  describe('setSecret and getSecret', () => {
    it('should store and retrieve secrets securely', async () => {
      const key = 'test-key';
      const value = 'secret-value-123';

      await secretManager.setSecret(key, value, 'test-user');
      const retrieved = await secretManager.getSecret(key, 'test-user');

      expect(retrieved).toBe(value);
    });

    it('should return null for non-existent secrets', async () => {
      const retrieved = await secretManager.getSecret('non-existent', 'test-user');
      expect(retrieved).toBeNull();
    });

    it('should validate required inputs', async () => {
      await expect(secretManager.setSecret('', 'value', 'test-user')).rejects.toThrow('Key and value are required');
      await expect(secretManager.setSecret('key', '', 'test-user')).rejects.toThrow('Key and value are required');
    });

    it('should encrypt secrets in memory', async () => {
      const key = 'test-key';
      const value = 'secret-value-123';

      await secretManager.setSecret(key, value, 'test-user');

      // Access the private memoryStore to verify encryption
      const memoryStore = (secretManager as any).memoryStore;
      const storedSecret = memoryStore.get(key);

      expect(storedSecret).toBeDefined();
      expect(storedSecret.iv).toBeDefined();
      expect(storedSecret.encryptedData).toBeDefined();
      expect(storedSecret.hash).toBeDefined();
      expect(storedSecret.encryptedData).not.toContain(value); // Should not contain plain text
    });
  });

  describe('deleteSecret', () => {
    it('should delete existing secrets', async () => {
      const key = 'test-key';
      const value = 'secret-value-123';

      await secretManager.setSecret(key, value, 'test-user');
      const existed = await secretManager.deleteSecret(key, 'test-user');

      expect(existed).toBe(true);

      const retrieved = await secretManager.getSecret(key, 'test-user');
      expect(retrieved).toBeNull();
    });

    it('should return false for non-existent secrets', async () => {
      const existed = await secretManager.deleteSecret('non-existent', 'test-user');
      expect(existed).toBe(false);
    });
  });

  describe('listSecrets', () => {
    it('should list all secret keys', async () => {
      await secretManager.setSecret('key1', 'value1', 'test-user');
      await secretManager.setSecret('key2', 'value2', 'test-user');

      const keys = await secretManager.listSecrets();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toHaveLength(2);
    });

    it('should return empty array when no secrets exist', async () => {
      const keys = await secretManager.listSecrets();
      expect(keys).toEqual([]);
    });
  });

  describe('audit logging', () => {
    it('should log secret access operations', async () => {
      const key = 'test-key';
      const value = 'secret-value-123';

      await secretManager.setSecret(key, value, 'test-user');
      await secretManager.getSecret(key, 'test-user');
      await secretManager.deleteSecret(key, 'test-user');

      const auditLog = secretManager.getAuditLog();
      expect(auditLog).toHaveLength(3);

      expect(auditLog[0]?.operation).toBe('write');
      expect(auditLog[0]?.success).toBe(true);
      expect(auditLog[0]?.accessedBy).toBe('test-user');

      expect(auditLog[1]?.operation).toBe('read');
      expect(auditLog[1]?.success).toBe(true);
      expect(auditLog[1]?.accessedBy).toBe('test-user');

      expect(auditLog[2]?.operation).toBe('delete');
      expect(auditLog[2]?.success).toBe(true);
      expect(auditLog[2]?.accessedBy).toBe('test-user');
    });

    it('should log failed operations', async () => {
      // Try to get a non-existent secret
      await secretManager.getSecret('non-existent', 'test-user');

      const auditLog = secretManager.getAuditLog();
      expect(auditLog).toHaveLength(1);
      expect(auditLog[0]?.operation).toBe('read');
      expect(auditLog[0]?.success).toBe(false);
      expect(auditLog[0]?.error).toBe('Secret not found');
    });

    it('should disable logging when configured', async () => {
      const noLogManager = new SecretManager({
        backend: 'memory',
        enableAuditLogging: false,
      });

      await noLogManager.setSecret('key', 'value', 'test-user');
      const auditLog = noLogManager.getAuditLog();
      expect(auditLog).toHaveLength(0);
    });
  });

  describe('environment backend', () => {
    it('should store and retrieve from environment variables', async () => {
      const envManager = new SecretManager({
        backend: 'env',
        enableAuditLogging: false, // Disable to avoid console output in tests
      });

      const key = 'TEST_KEY';
      const value = 'secret-value-123';

      await envManager.setSecret(key, value, 'test-user');
      
      // Check that the environment variable was set
      expect(process.env['SECRET_TEST_KEY']).toBeDefined();

      const retrieved = await envManager.getSecret(key, 'test-user');
      expect(retrieved).toBe(value);
    });

    it('should handle plain text environment variables for backward compatibility', async () => {
      const envManager = new SecretManager({
        backend: 'env',
        enableAuditLogging: false,
      });

      // Set a plain text environment variable
      process.env['PLAIN_TEXT_KEY'] = 'plain-text-value';

      const retrieved = await envManager.getSecret('PLAIN_TEXT_KEY', 'test-user');
      expect(retrieved).toBe('plain-text-value');
    });
  });

  describe('error handling', () => {
    it('should handle decryption errors gracefully', async () => {
      await secretManager.setSecret('test-key', 'test-value', 'test-user');

      // Corrupt the stored data
      const memoryStore = (secretManager as any).memoryStore;
      const storedSecret = memoryStore.get('test-key');
      storedSecret.hash = 'corrupted-hash';

      await expect(secretManager.getSecret('test-key', 'test-user')).rejects.toThrow('Secret integrity verification failed');
    });

    it('should handle invalid encrypted data format', async () => {
      const memoryStore = (secretManager as any).memoryStore;
      memoryStore.set('invalid-key', {
        iv: 'valid-iv',
        encryptedData: 'invalid-format', // Missing colon separator
        hash: 'valid-hash',
      });

      await expect(secretManager.getSecret('invalid-key', 'test-user')).rejects.toThrow('Invalid encrypted data format');
    });
  });

  describe('unsupported backends', () => {
    it('should throw error for file backend', async () => {
      const fileManager = new SecretManager({
        backend: 'file',
        filePath: '/tmp/secrets',
      });

      await expect(fileManager.setSecret('key', 'value', 'test-user')).rejects.toThrow('File-based storage not yet implemented');
    });

    it('should throw error for vault backend', async () => {
      const vaultManager = new SecretManager({
        backend: 'vault',
        vaultConfig: {
          endpoint: 'http://localhost:8200',
          token: 'test-token',
          path: 'secret/',
        },
      });

      await expect(vaultManager.setSecret('key', 'value', 'test-user')).rejects.toThrow('Vault integration not yet implemented');
    });
  });
});

describe('API Key Convenience Functions', () => {
  beforeEach(() => {
    defaultSecretManager.clearAuditLog();
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env['SECRET_ANTHROPIC_API_KEY'];
    delete process.env['SECRET_GOOGLE_API_KEY'];
    delete process.env['SECRET_OPENAI_API_KEY'];
  });

  describe('getApiKey', () => {
    it('should retrieve API keys for supported providers', async () => {
      // Set up environment variables
      process.env['ANTHROPIC_API_KEY'] = 'claude-key-123';
      process.env['GOOGLE_API_KEY'] = 'gemini-key-456';
      process.env['OPENAI_API_KEY'] = 'openai-key-789';

      const claudeKey = await getApiKey('claude', 'test-user');
      const geminiKey = await getApiKey('gemini', 'test-user');
      const openaiKey = await getApiKey('openai', 'test-user');

      expect(claudeKey).toBe('claude-key-123');
      expect(geminiKey).toBe('gemini-key-456');
      expect(openaiKey).toBe('openai-key-789');
    });

    it('should return null for missing API keys', async () => {
      const key = await getApiKey('claude', 'test-user');
      expect(key).toBeNull();
    });

    it('should throw error for unknown providers', async () => {
      await expect(getApiKey('unknown-provider', 'test-user')).rejects.toThrow('Unknown provider: unknown-provider');
    });

    it('should be case insensitive for provider names', async () => {
      process.env['ANTHROPIC_API_KEY'] = 'claude-key-123';

      const key = await getApiKey('CLAUDE', 'test-user');
      expect(key).toBe('claude-key-123');
    });
  });

  describe('setApiKey', () => {
    it('should set API keys for supported providers', async () => {
      await setApiKey('claude', 'new-claude-key', 'test-user');
      await setApiKey('gemini', 'new-gemini-key', 'test-user');
      await setApiKey('openai', 'new-openai-key', 'test-user');

      const claudeKey = await getApiKey('claude', 'test-user');
      const geminiKey = await getApiKey('gemini', 'test-user');
      const openaiKey = await getApiKey('openai', 'test-user');

      expect(claudeKey).toBe('new-claude-key');
      expect(geminiKey).toBe('new-gemini-key');
      expect(openaiKey).toBe('new-openai-key');
    });

    it('should throw error for unknown providers', async () => {
      await expect(setApiKey('unknown-provider', 'key', 'test-user')).rejects.toThrow('Unknown provider: unknown-provider');
    });
  });
});

describe('Security Features', () => {
  let secretManager: SecretManager;

  beforeEach(() => {
    secretManager = new SecretManager({
      backend: 'memory',
      enableAuditLogging: true,
    });
  });

  it('should never log actual secret values', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    await secretManager.setSecret('sensitive-key', 'super-secret-value', 'test-user');
    await secretManager.getSecret('sensitive-key', 'test-user');

    // Check that console.log was called but never with the actual secret value
    const logCalls = consoleSpy.mock.calls;
    const allLoggedContent = logCalls.map(call => JSON.stringify(call)).join(' ');

    expect(allLoggedContent).not.toContain('super-secret-value');
    expect(allLoggedContent).not.toContain('sensitive-key'); // Should be hashed

    consoleSpy.mockRestore();
  });

  it('should use different encryption for each secret', async () => {
    await secretManager.setSecret('key1', 'same-value', 'test-user');
    await secretManager.setSecret('key2', 'same-value', 'test-user');

    const memoryStore = (secretManager as any).memoryStore;
    const secret1 = memoryStore.get('key1');
    const secret2 = memoryStore.get('key2');

    // Even with the same value, encryption should be different due to random IV
    expect(secret1.iv).not.toBe(secret2.iv);
    expect(secret1.encryptedData).not.toBe(secret2.encryptedData);
  });

  it('should maintain audit log size limit', async () => {
    // Add more than 1000 entries
    for (let i = 0; i < 1005; i++) {
      await secretManager.setSecret(`key-${i}`, `value-${i}`, 'test-user');
    }

    const auditLog = secretManager.getAuditLog();
    expect(auditLog.length).toBe(1000); // Should be capped at 1000
  });
});
