import { ConnectionPoolManager, DEFAULT_CONNECTION_POOL_CONFIG, configureAnthropicHttpClient, configureGoogleHttpClient, initializeConnectionPooling } from '../httpClientConfig';
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';

describe('ConnectionPoolManager', () => {
  let manager: ConnectionPoolManager;

  beforeEach(() => {
    // Reset singleton for testing
    (ConnectionPoolManager as any).instance = undefined;
    manager = ConnectionPoolManager.getInstance();
  });

  afterEach(() => {
    manager.destroy();
    (ConnectionPoolManager as any).instance = undefined;
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = ConnectionPoolManager.getInstance();
      const instance2 = ConnectionPoolManager.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should use provided config on first instantiation', () => {
      (ConnectionPoolManager as any).instance = undefined;
      const customConfig = { maxSockets: 25 };
      const instance = ConnectionPoolManager.getInstance(customConfig);
      
      const stats = instance.getStats();
      expect(stats.config.maxSockets).toBe(25);
      expect(stats.config.maxFreeSockets).toBe(DEFAULT_CONNECTION_POOL_CONFIG.maxFreeSockets);
    });
  });

  describe('agent creation', () => {
    it('should create HTTP and HTTPS agents', () => {
      const httpAgent = manager.getHttpAgent();
      const httpsAgent = manager.getHttpsAgent();

      expect(httpAgent).toBeInstanceOf(HttpAgent);
      expect(httpsAgent).toBeInstanceOf(HttpsAgent);
    });

    it('should configure agents with correct options', () => {
      const httpAgent = manager.getHttpAgent();
      const httpsAgent = manager.getHttpsAgent();

      // Check that agents have the expected configuration
      // Note: keepAlive is not directly accessible, but maxSockets is
      expect(httpAgent.maxSockets).toBe(DEFAULT_CONNECTION_POOL_CONFIG.maxSockets);
      expect(httpsAgent.maxSockets).toBe(DEFAULT_CONNECTION_POOL_CONFIG.maxSockets);
      
      // Verify agents are properly instantiated
      expect(httpAgent).toBeInstanceOf(HttpAgent);
      expect(httpsAgent).toBeInstanceOf(HttpsAgent);
    });
  });

  describe('statistics', () => {
    it('should return connection pool statistics', () => {
      const stats = manager.getStats();

      expect(stats).toHaveProperty('http');
      expect(stats).toHaveProperty('https');
      expect(stats).toHaveProperty('config');

      expect(stats.http).toHaveProperty('sockets');
      expect(stats.http).toHaveProperty('freeSockets');
      expect(stats.http).toHaveProperty('requests');

      expect(stats.https).toHaveProperty('sockets');
      expect(stats.https).toHaveProperty('freeSockets');
      expect(stats.https).toHaveProperty('requests');

      expect(typeof stats.http.sockets).toBe('number');
      expect(typeof stats.https.sockets).toBe('number');
    });

    it('should handle empty socket objects gracefully', () => {
      const stats = manager.getStats();
      
      // Initially, all counts should be 0
      expect(stats.http.sockets).toBe(0);
      expect(stats.http.freeSockets).toBe(0);
      expect(stats.http.requests).toBe(0);
      expect(stats.https.sockets).toBe(0);
      expect(stats.https.freeSockets).toBe(0);
      expect(stats.https.requests).toBe(0);
    });
  });

  describe('configuration updates', () => {
    it('should update configuration and recreate agents', () => {
      const originalHttpAgent = manager.getHttpAgent();
      const originalHttpsAgent = manager.getHttpsAgent();

      manager.updateConfig({ maxSockets: 75 });

      const newHttpAgent = manager.getHttpAgent();
      const newHttpsAgent = manager.getHttpsAgent();

      // Agents should be different instances
      expect(newHttpAgent).not.toBe(originalHttpAgent);
      expect(newHttpsAgent).not.toBe(originalHttpsAgent);

      // Configuration should be updated
      const stats = manager.getStats();
      expect(stats.config.maxSockets).toBe(75);
    });
  });

  describe('fetch configuration', () => {
    it('should return fetch configuration', () => {
      const fetchConfig = manager.getFetchConfig();

      expect(fetchConfig).toHaveProperty('agent');
      expect(fetchConfig).toHaveProperty('keepalive');
      expect(fetchConfig.keepalive).toBe(true);
      expect(typeof fetchConfig.agent).toBe('function');
    });

    it('should return correct agent for URL', () => {
      const fetchConfig = manager.getFetchConfig();
      const httpsAgent = fetchConfig.agent!('https://example.com');
      const httpAgent = fetchConfig.agent!('http://example.com');

      expect(httpsAgent).toBe(manager.getHttpsAgent());
      expect(httpAgent).toBe(manager.getHttpAgent());
    });
  });

  describe('cleanup', () => {
    it('should destroy agents on cleanup', () => {
      const httpAgent = manager.getHttpAgent();
      const httpsAgent = manager.getHttpsAgent();

      const httpDestroySpy = jest.spyOn(httpAgent, 'destroy');
      const httpsDestroySpy = jest.spyOn(httpsAgent, 'destroy');

      manager.destroy();

      expect(httpDestroySpy).toHaveBeenCalled();
      expect(httpsDestroySpy).toHaveBeenCalled();
    });
  });
});

describe('Provider Configuration Functions', () => {
  beforeEach(() => {
    (ConnectionPoolManager as any).instance = undefined;
  });

  afterEach(() => {
    const instance = (ConnectionPoolManager as any).instance;
    if (instance) {
      instance.destroy();
      (ConnectionPoolManager as any).instance = undefined;
    }
  });

  describe('configureAnthropicHttpClient', () => {
    it('should return configuration for Anthropic client', () => {
      const config = configureAnthropicHttpClient();

      expect(config).toHaveProperty('httpAgent');
      expect(config).toHaveProperty('httpsAgent');
      expect(config).toHaveProperty('clientOptions');

      expect(config.httpAgent).toBeInstanceOf(HttpAgent);
      expect(config.httpsAgent).toBeInstanceOf(HttpsAgent);
      expect(config.clientOptions.httpAgent).toBe(config.httpAgent);
      expect(config.clientOptions.httpsAgent).toBe(config.httpsAgent);
    });

    it('should use custom configuration', () => {
      const customConfig = { maxSockets: 30 };
      configureAnthropicHttpClient(customConfig);

      const manager = ConnectionPoolManager.getInstance();
      const stats = manager.getStats();
      expect(stats.config.maxSockets).toBe(30);
    });
  });

  describe('configureGoogleHttpClient', () => {
    it('should return configuration for Google client', () => {
      const config = configureGoogleHttpClient();

      expect(config).toHaveProperty('customFetch');
      expect(config).toHaveProperty('poolManager');
      expect(config).toHaveProperty('clientOptions');

      expect(typeof config.customFetch).toBe('function');
      expect(config.poolManager).toBeInstanceOf(ConnectionPoolManager);
      expect(config.clientOptions.fetch).toBe(config.customFetch);
    });

    it('should create custom fetch function', () => {
      const config = configureGoogleHttpClient();
      
      // Mock global fetch
      const mockFetch = jest.fn().mockResolvedValue(new Response());
      global.fetch = mockFetch;

      // Test custom fetch
      config.customFetch('https://example.com', { method: 'POST' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          method: 'POST',
          keepalive: true,
        })
      );
    });
  });

  describe('initializeConnectionPooling', () => {
    it('should initialize connection pooling for all providers', () => {
      const result = initializeConnectionPooling();

      expect(result).toHaveProperty('anthropic');
      expect(result).toHaveProperty('google');
      expect(result).toHaveProperty('stats');

      expect(result.anthropic).toHaveProperty('httpAgent');
      expect(result.anthropic).toHaveProperty('httpsAgent');
      expect(result.google).toHaveProperty('customFetch');
      expect(typeof result.stats).toBe('function');
    });

    it('should return stats function that works', () => {
      const result = initializeConnectionPooling();
      const stats = result.stats();

      expect(stats).toHaveProperty('http');
      expect(stats).toHaveProperty('https');
      expect(stats).toHaveProperty('config');
    });

    it('should use custom configuration', () => {
      const customConfig = { maxSockets: 40 };
      const result = initializeConnectionPooling(customConfig);
      const stats = result.stats();

      expect(stats.config.maxSockets).toBe(40);
    });
  });
});

describe('DEFAULT_CONNECTION_POOL_CONFIG', () => {
  it('should have expected default values', () => {
    expect(DEFAULT_CONNECTION_POOL_CONFIG.maxSockets).toBe(50);
    expect(DEFAULT_CONNECTION_POOL_CONFIG.maxFreeSockets).toBe(10);
    expect(DEFAULT_CONNECTION_POOL_CONFIG.keepAliveTimeout).toBe(30000);
    expect(DEFAULT_CONNECTION_POOL_CONFIG.keepAlive).toBe(true);
    expect(DEFAULT_CONNECTION_POOL_CONFIG.timeout).toBe(60000);
    expect(DEFAULT_CONNECTION_POOL_CONFIG.maxTotalSockets).toBe(100);
  });
});
