import { z } from 'zod';
import { ResponseCache, responseCache, createResponseCacheKey, DEFAULT_RESPONSE_CACHE_CONFIG } from '../responseCache';

// Mock timers for testing
jest.useFakeTimers();

describe('ResponseCache', () => {
  let cache: ResponseCache;

  beforeEach(() => {
    cache = ResponseCache.getInstance();
    cache.clear();
    cache.resetStats();
  });

  afterEach(() => {
    cache.destroy();
    (ResponseCache as any).instance = undefined;
    jest.clearAllTimers();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = ResponseCache.getInstance();
      const instance2 = ResponseCache.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should use provided config on first instantiation', () => {
      (ResponseCache as any).instance = undefined;
      const customConfig = { maxSize: 500, defaultTtl: 1000 };
      const instance = ResponseCache.getInstance(customConfig);
      
      const stats = instance.getStats();
      expect(stats.maxSize).toBe(500);
      
      // Clean up
      instance.destroy();
      (ResponseCache as any).instance = undefined;
    });
  });

  describe('cache operations', () => {
    const testParams = {
      prompt: 'Extract user information',
      schema: z.object({ name: z.string(), age: z.number() }),
      model: 'gpt-4',
      provider: 'openai',
      temperature: 0.1,
      maxTokens: 1000,
    };

    const testData = { name: 'John Doe', age: 30 };

    it('should store and retrieve cached responses', () => {
      // Cache miss initially
      const result1 = cache.get(testParams);
      expect(result1).toBeNull();

      // Store response
      cache.set(testParams, testData);

      // Cache hit
      const result2 = cache.get(testParams);
      expect(result2).toEqual(testData);

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.totalRequests).toBe(2);
      expect(stats.hitRate).toBe(0.5);
    });

    it('should generate different cache keys for different parameters', () => {
      const params1 = { ...testParams, temperature: 0.1 };
      const params2 = { ...testParams, temperature: 0.5 };

      cache.set(params1, { name: 'Alice', age: 25 });
      cache.set(params2, { name: 'Bob', age: 35 });

      const result1 = cache.get(params1);
      const result2 = cache.get(params2);

      expect(result1).toEqual({ name: 'Alice', age: 25 });
      expect(result2).toEqual({ name: 'Bob', age: 35 });
    });

    it('should generate same cache key for identical parameters', () => {
      const params1 = { ...testParams };
      const params2 = { ...testParams };

      cache.set(params1, testData);
      const result = cache.get(params2);

      expect(result).toEqual(testData);
    });

    it('should handle content parameter in cache key generation', () => {
      const paramsWithContent = { ...testParams, content: 'Additional context' };
      const paramsWithoutContent = { ...testParams };

      cache.set(paramsWithContent, { name: 'With Content', age: 40 });
      cache.set(paramsWithoutContent, { name: 'Without Content', age: 50 });

      const result1 = cache.get(paramsWithContent);
      const result2 = cache.get(paramsWithoutContent);

      expect(result1).toEqual({ name: 'With Content', age: 40 });
      expect(result2).toEqual({ name: 'Without Content', age: 50 });
    });
  });

  describe('TTL and expiration', () => {
    const testParams = {
      prompt: 'Test prompt',
      schema: z.object({ result: z.string() }),
      model: 'test-model',
      provider: 'test-provider',
    };

    it('should respect TTL and expire entries', () => {
      const shortTtl = 1000; // 1 second
      cache.set(testParams, { result: 'test' }, shortTtl);

      // Should be available immediately
      expect(cache.get(testParams)).toEqual({ result: 'test' });

      // Fast-forward time beyond TTL
      jest.advanceTimersByTime(1500);

      // Should be expired and return null
      expect(cache.get(testParams)).toBeNull();

      const stats = cache.getStats();
      expect(stats.expirations).toBe(1);
    });

    it('should use default TTL when none specified', () => {
      cache.set(testParams, { result: 'test' });

      // Should be available immediately
      expect(cache.get(testParams)).toEqual({ result: 'test' });

      // Fast-forward time but not beyond default TTL (24 hours)
      jest.advanceTimersByTime(60 * 60 * 1000); // 1 hour

      // Should still be available
      expect(cache.get(testParams)).toEqual({ result: 'test' });
    });

    it('should clean up expired entries automatically', () => {
      const shortTtl = 1000;
      cache.set(testParams, { result: 'test' }, shortTtl);

      expect(cache.getStats().size).toBe(1);

      // Fast-forward time beyond TTL
      jest.advanceTimersByTime(1500);

      // Trigger cleanup
      const removedCount = cache.cleanup();
      expect(removedCount).toBe(1);
      expect(cache.getStats().size).toBe(0);
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used entries when cache is full', () => {
      // Create a small cache for testing
      (ResponseCache as any).instance = undefined;
      const smallCache = ResponseCache.getInstance({ maxSize: 2 });

      const params1 = {
        prompt: 'Prompt 1',
        schema: z.object({ id: z.number() }),
        model: 'test',
        provider: 'test',
      };
      const params2 = { ...params1, prompt: 'Prompt 2' };
      const params3 = { ...params1, prompt: 'Prompt 3' };

      smallCache.set(params1, { id: 1 });
      smallCache.set(params2, { id: 2 });

      // Access params1 to make it more recently used
      smallCache.get(params1);

      // This should evict params2 (least recently used)
      smallCache.set(params3, { id: 3 });

      const stats = smallCache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.evictions).toBe(1);

      // params1 and params3 should be in cache, params2 should be evicted
      expect(smallCache.has(params1)).toBe(true);
      expect(smallCache.has(params3)).toBe(true);
      expect(smallCache.has(params2)).toBe(false);

      smallCache.destroy();
      (ResponseCache as any).instance = undefined;
    });
  });

  describe('cache management', () => {
    const testParams = {
      prompt: 'Test prompt',
      schema: z.object({ value: z.string() }),
      model: 'test-model',
      provider: 'test-provider',
    };

    it('should check if entry exists without affecting stats', () => {
      expect(cache.has(testParams)).toBe(false);

      cache.set(testParams, { value: 'test' });
      expect(cache.has(testParams)).toBe(true);

      // has() should not affect request stats
      const stats = cache.getStats();
      expect(stats.totalRequests).toBe(0);
    });

    it('should remove specific entries', () => {
      const params1 = { ...testParams, prompt: 'Prompt 1' };
      const params2 = { ...testParams, prompt: 'Prompt 2' };

      cache.set(params1, { value: 'test1' });
      cache.set(params2, { value: 'test2' });

      expect(cache.remove(params1)).toBe(true);
      expect(cache.remove(params1)).toBe(false); // Already removed

      expect(cache.has(params1)).toBe(false);
      expect(cache.has(params2)).toBe(true);
    });

    it('should clear all cached entries', () => {
      cache.set(testParams, { value: 'test' });
      cache.set({ ...testParams, prompt: 'Another prompt' }, { value: 'test2' });

      expect(cache.getStats().size).toBe(2);

      cache.clear();

      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.totalRequests).toBe(0);
    });
  });

  describe('statistics and debugging', () => {
    const testParams = {
      prompt: 'Test prompt',
      schema: z.object({ data: z.string() }),
      model: 'test-model',
      provider: 'test-provider',
    };

    it('should track cache statistics correctly', () => {
      // Initial stats
      let stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);

      // First access (miss)
      cache.get(testParams);
      stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0);

      // Store and access (hit)
      cache.set(testParams, { data: 'test' });
      cache.get(testParams);
      stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });

    it('should provide debug information', () => {
      const params1 = { ...testParams, prompt: 'Prompt 1' };
      const params2 = { ...testParams, prompt: 'Prompt 2' };

      cache.set(params1, { data: 'test1' });
      cache.set(params2, { data: 'test2' });

      // Access params1 multiple times
      cache.get(params1);
      cache.get(params1);
      cache.get(params2);

      const debugInfo = cache.getDebugInfo();

      expect(debugInfo.entries).toHaveLength(2);
      expect(debugInfo.entries[0]?.hitCount).toBe(2); // params1 (most used)
      expect(debugInfo.entries[1]?.hitCount).toBe(1); // params2
      expect(debugInfo.stats.size).toBe(2);
    });

    it('should return most used entries', () => {
      const params1 = { ...testParams, prompt: 'Prompt 1' };
      const params2 = { ...testParams, prompt: 'Prompt 2' };
      const params3 = { ...testParams, prompt: 'Prompt 3' };

      cache.set(params1, { data: 'test1' });
      cache.set(params2, { data: 'test2' });
      cache.set(params3, { data: 'test3' });

      // Access with different frequencies
      cache.get(params1);
      cache.get(params1);
      cache.get(params1); // 3 hits

      cache.get(params2);
      cache.get(params2); // 2 hits

      cache.get(params3); // 1 hit

      const mostUsed = cache.getMostUsedEntries(2);

      expect(mostUsed).toHaveLength(2);
      expect(mostUsed[0]?.hitCount).toBe(3); // params1
      expect(mostUsed[1]?.hitCount).toBe(2); // params2
    });

    it('should reset statistics without clearing cache', () => {
      cache.set(testParams, { data: 'test' });
      cache.get(testParams);

      let stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(1);

      cache.resetStats();

      stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(1); // Cache still has the entry
    });
  });

  describe('configuration management', () => {
    it('should update configuration and handle size changes', () => {
      const params1 = {
        prompt: 'Prompt 1',
        schema: z.object({ id: z.number() }),
        model: 'test',
        provider: 'test',
      };
      const params2 = { ...params1, prompt: 'Prompt 2' };
      const params3 = { ...params1, prompt: 'Prompt 3' };

      cache.set(params1, { id: 1 });
      cache.set(params2, { id: 2 });
      cache.set(params3, { id: 3 });

      expect(cache.getStats().size).toBe(3);

      // Reduce max size to 2
      cache.updateConfig({ maxSize: 2 });

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(2);
      expect(stats.evictions).toBe(1);
    });

    it('should handle cleanup timer configuration changes', () => {
      // Test enabling/disabling cleanup
      cache.updateConfig({ enableCleanup: false });
      cache.updateConfig({ enableCleanup: true });

      // Test changing cleanup interval
      cache.updateConfig({ cleanupInterval: 30000 });

      // Should not throw errors
      expect(true).toBe(true);
    });
  });

  describe('memory usage estimation', () => {
    it('should estimate memory usage', () => {
      const testParams = {
        prompt: 'Test prompt',
        schema: z.object({ data: z.string() }),
        model: 'test-model',
        provider: 'test-provider',
      };

      cache.set(testParams, { data: 'test data' });

      const stats = cache.getStats();
      expect(stats.memoryUsage.entries).toBe(1);
      expect(stats.memoryUsage.averageEntrySize).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should handle schemas that cannot be serialized', () => {
      const testParams = {
        prompt: 'Test prompt',
        schema: z.object({ test: z.string() }),
        model: 'test-model',
        provider: 'test-provider',
      };

      // Mock JSON.stringify to throw an error for schema serialization
      const originalStringify = JSON.stringify;
      let callCount = 0;
      (global as any).JSON = {
        ...JSON,
        stringify: jest.fn().mockImplementation((value) => {
          callCount++;
          // Fail on first call (schema serialization), succeed on others
          if (callCount === 1) {
            throw new Error('Circular reference');
          }
          return originalStringify(value);
        })
      };

      // Should not throw, should use fallback key generation
      expect(() => cache.set(testParams, { test: 'data' })).not.toThrow();
      expect(() => cache.get(testParams)).not.toThrow();

      const stats = cache.getStats();
      expect(stats.size).toBe(1);

      // Restore original JSON.stringify
      (global as any).JSON = { ...JSON, stringify: originalStringify };
    });
  });
});

describe('Utility Functions', () => {
  beforeEach(() => {
    responseCache.clear();
  });

  describe('createResponseCacheKey', () => {
    it('should create cache key for debugging', () => {
      const params = {
        prompt: 'Test prompt',
        schema: z.object({ name: z.string() }),
        model: 'gpt-4',
        provider: 'openai',
        temperature: 0.1,
      };

      const key = createResponseCacheKey(params);
      expect(typeof key).toBe('string');
      expect(key.length).toBe(32); // MD5 hash length
    });

    it('should generate consistent keys for identical parameters', () => {
      const params = {
        prompt: 'Test prompt',
        schema: z.object({ name: z.string() }),
        model: 'gpt-4',
        provider: 'openai',
      };

      const key1 = createResponseCacheKey(params);
      const key2 = createResponseCacheKey(params);

      expect(key1).toBe(key2);
    });
  });
});

describe('Complex Schema Scenarios', () => {
  let cache: ResponseCache;

  beforeEach(() => {
    cache = ResponseCache.getInstance();
    cache.clear();
  });

  afterEach(() => {
    cache.destroy();
    (ResponseCache as any).instance = undefined;
  });

  it('should handle complex nested schemas', () => {
    const complexSchema = z.object({
      user: z.object({
        name: z.string(),
        profile: z.object({
          age: z.number(),
          preferences: z.array(z.string()),
          metadata: z.record(z.any())
        })
      }),
      settings: z.array(z.object({
        key: z.string(),
        value: z.union([z.string(), z.number(), z.boolean()])
      }))
    });

    const params = {
      prompt: 'Extract complex user data',
      schema: complexSchema,
      model: 'gpt-4',
      provider: 'openai',
    };

    const complexData = {
      user: {
        name: 'John Doe',
        profile: {
          age: 30,
          preferences: ['coding', 'reading'],
          metadata: { theme: 'dark', language: 'en' }
        }
      },
      settings: [
        { key: 'notifications', value: true },
        { key: 'timeout', value: 300 }
      ]
    };

    cache.set(params, complexData);
    const result = cache.get(params);

    expect(result).toEqual(complexData);
  });

  it('should handle discriminated union schemas', () => {
    const unionSchema = z.discriminatedUnion('type', [
      z.object({ type: z.literal('user'), name: z.string(), email: z.string() }),
      z.object({ type: z.literal('admin'), name: z.string(), permissions: z.array(z.string()) })
    ]);

    const params = {
      prompt: 'Extract user or admin data',
      schema: unionSchema,
      model: 'gpt-4',
      provider: 'openai',
    };

    const userData = { type: 'user' as const, name: 'John', email: 'john@example.com' };

    cache.set(params, userData);
    const result = cache.get(params);

    expect(result).toEqual(userData);
  });
});

describe('DEFAULT_RESPONSE_CACHE_CONFIG', () => {
  it('should have expected default values', () => {
    expect(DEFAULT_RESPONSE_CACHE_CONFIG.maxSize).toBe(1000);
    expect(DEFAULT_RESPONSE_CACHE_CONFIG.defaultTtl).toBe(24 * 60 * 60 * 1000); // 24 hours
    expect(DEFAULT_RESPONSE_CACHE_CONFIG.enableCleanup).toBe(true);
    expect(DEFAULT_RESPONSE_CACHE_CONFIG.cleanupInterval).toBe(60 * 60 * 1000); // 1 hour
  });
});
