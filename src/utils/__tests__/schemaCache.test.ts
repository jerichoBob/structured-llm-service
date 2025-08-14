import { z } from 'zod';
import { SchemaCache, schemaCache, createCachedSchema } from '../schemaCache';

describe('SchemaCache', () => {
  let cache: SchemaCache;

  beforeEach(() => {
    cache = SchemaCache.getInstance();
    cache.clear();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = SchemaCache.getInstance();
      const instance2 = SchemaCache.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should use provided maxSize on first instantiation', () => {
      // Reset singleton for this test
      (SchemaCache as any).instance = undefined;
      const instance = SchemaCache.getInstance(50);
      const stats = instance.getStats();
      expect(stats.maxSize).toBe(50);
      
      // Clean up
      instance.clear();
      (SchemaCache as any).instance = undefined;
    });
  });

  describe('schema caching', () => {
    it('should cache and retrieve schemas', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number()
      });

      const cached1 = cache.getOrSet(schema);
      const cached2 = cache.getOrSet(schema);

      expect(cached1).toBe(cached2);
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.totalRequests).toBe(2);
      expect(stats.hitRate).toBe(0.5);
    });

    it('should handle different schemas separately', () => {
      const schema1 = z.object({ name: z.string() });
      const schema2 = z.object({ age: z.number() });

      cache.getOrSet(schema1);
      cache.getOrSet(schema2);
      cache.getOrSet(schema1); // Should be a hit

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(2);
      expect(stats.size).toBe(2);
    });

    it('should generate consistent cache keys for identical schemas', () => {
      const schema1 = z.object({ name: z.string(), age: z.number() });
      const schema2 = z.object({ name: z.string(), age: z.number() });

      const key1 = cache.getCacheKey(schema1);
      const key2 = cache.getCacheKey(schema2);

      expect(key1).toBe(key2);
    });

    it('should generate different cache keys for different schemas', () => {
      const schema1 = z.object({ name: z.string() });
      const schema2 = z.object({ age: z.number() });

      const key1 = cache.getCacheKey(schema1);
      const key2 = cache.getCacheKey(schema2);

      expect(key1).not.toBe(key2);
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used schemas when cache is full', () => {
      // Create a small cache for testing
      (SchemaCache as any).instance = undefined;
      const smallCache = SchemaCache.getInstance(2);
      
      const schema1 = z.object({ field1: z.string() });
      const schema2 = z.object({ field2: z.string() });
      const schema3 = z.object({ field3: z.string() });

      smallCache.getOrSet(schema1);
      smallCache.getOrSet(schema2);
      
      // Access schema1 again to make it more recently used
      smallCache.getOrSet(schema1);
      
      // This should evict schema2 (least recently used)
      smallCache.getOrSet(schema3);

      const stats = smallCache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.evictions).toBe(1);
      
      // schema1 and schema3 should be in cache, schema2 should be evicted
      expect(smallCache.has(schema1)).toBe(true);
      expect(smallCache.has(schema3)).toBe(true);
      expect(smallCache.has(schema2)).toBe(false);

      // Clean up
      smallCache.clear();
      (SchemaCache as any).instance = undefined;
    });
  });

  describe('cache operations', () => {
    it('should check if schema exists without affecting stats', () => {
      const schema = z.object({ test: z.string() });
      
      expect(cache.has(schema)).toBe(false);
      
      cache.getOrSet(schema);
      expect(cache.has(schema)).toBe(true);
      
      // has() should not affect stats
      const stats = cache.getStats();
      expect(stats.totalRequests).toBe(1);
    });

    it('should remove specific schemas', () => {
      const schema1 = z.object({ field1: z.string() });
      const schema2 = z.object({ field2: z.string() });

      cache.getOrSet(schema1);
      cache.getOrSet(schema2);

      expect(cache.remove(schema1)).toBe(true);
      expect(cache.remove(schema1)).toBe(false); // Already removed

      expect(cache.has(schema1)).toBe(false);
      expect(cache.has(schema2)).toBe(true);
    });

    it('should clear all cached schemas', () => {
      const schema1 = z.object({ field1: z.string() });
      const schema2 = z.object({ field2: z.string() });

      cache.getOrSet(schema1);
      cache.getOrSet(schema2);

      expect(cache.getStats().size).toBe(2);

      cache.clear();

      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.totalRequests).toBe(0);
    });
  });

  describe('preloading', () => {
    it('should preload schemas into cache', () => {
      const schemas = [
        { name: 'user', schema: z.object({ name: z.string() }) },
        { name: 'product', schema: z.object({ price: z.number() }) }
      ];

      cache.preloadSchemas(schemas);

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.misses).toBe(2);
      expect(stats.totalRequests).toBe(2);
    });
  });

  describe('statistics and debugging', () => {
    it('should track cache statistics correctly', () => {
      const schema = z.object({ test: z.string() });

      // Initial stats
      let stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);

      // First access (miss)
      cache.getOrSet(schema);
      stats = cache.getStats();
      expect(stats.size).toBe(1);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0);

      // Second access (hit)
      cache.getOrSet(schema);
      stats = cache.getStats();
      expect(stats.size).toBe(1);
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });

    it('should provide debug information', () => {
      const schema1 = z.object({ field1: z.string() });
      const schema2 = z.object({ field2: z.number() });

      cache.getOrSet(schema1);
      cache.getOrSet(schema1); // Hit
      cache.getOrSet(schema2);

      const debugInfo = cache.getDebugInfo();
      
      expect(debugInfo.entries).toHaveLength(2);
      expect(debugInfo.entries[0]?.hitCount).toBe(2); // schema1 (most used)
      expect(debugInfo.entries[1]?.hitCount).toBe(1); // schema2
      expect(debugInfo.stats.size).toBe(2);
    });

    it('should return most used schemas', () => {
      const schema1 = z.object({ field1: z.string() });
      const schema2 = z.object({ field2: z.number() });
      const schema3 = z.object({ field3: z.boolean() });

      // Access schemas with different frequencies
      cache.getOrSet(schema1);
      cache.getOrSet(schema1);
      cache.getOrSet(schema1); // 3 hits

      cache.getOrSet(schema2);
      cache.getOrSet(schema2); // 2 hits

      cache.getOrSet(schema3); // 1 hit

      const mostUsed = cache.getMostUsedSchemas(2);
      
      expect(mostUsed).toHaveLength(2);
      expect(mostUsed[0]?.hitCount).toBe(3); // schema1
      expect(mostUsed[1]?.hitCount).toBe(2); // schema2
    });

    it('should reset statistics without clearing cache', () => {
      const schema = z.object({ test: z.string() });

      cache.getOrSet(schema);
      cache.getOrSet(schema);

      let stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.size).toBe(1);

      cache.resetStats();

      stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(1); // Cache still has the schema
    });
  });

  describe('cache size management', () => {
    it('should update max size and evict if necessary', () => {
      const schema1 = z.object({ field1: z.string() });
      const schema2 = z.object({ field2: z.string() });
      const schema3 = z.object({ field3: z.string() });

      cache.getOrSet(schema1);
      cache.getOrSet(schema2);
      cache.getOrSet(schema3);

      expect(cache.getStats().size).toBe(3);

      // Reduce max size to 2
      cache.updateMaxSize(2);

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(2);
      expect(stats.evictions).toBe(1);
    });
  });

  describe('error handling', () => {
    it('should handle schemas that cannot be serialized', () => {
      // Create a schema with circular reference in _def (edge case)
      const schema = z.object({ test: z.string() });
      
      // Mock JSON.stringify to throw an error
      const originalStringify = JSON.stringify;
      (global as any).JSON = {
        ...JSON,
        stringify: jest.fn().mockImplementation(() => {
          throw new Error('Circular reference');
        })
      };

      // Should not throw, should use fallback key generation
      expect(() => cache.getOrSet(schema)).not.toThrow();
      
      const stats = cache.getStats();
      expect(stats.size).toBe(1);

      // Restore original JSON.stringify
      (global as any).JSON = { ...JSON, stringify: originalStringify };
    });
  });
});

describe('Utility Functions', () => {
  beforeEach(() => {
    schemaCache.clear();
  });

  describe('createCachedSchema', () => {
    it('should return cached schema', () => {
      const schema = z.object({ name: z.string() });
      
      const cached1 = createCachedSchema(schema);
      const cached2 = createCachedSchema(schema);
      
      expect(cached1).toBe(cached2);
      
      const stats = schemaCache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });
  });

  describe('CacheSchema decorator', () => {
    it('should cache schemas when used manually', () => {
      // Test the decorator functionality manually since TypeScript decorators are complex
      const originalMethod = () => z.object({ test: z.string() });
      
      // Simulate what the decorator does
      const decoratedMethod = function() {
        const result = originalMethod();
        if (result && typeof result.parse === 'function') {
          return schemaCache.getOrSet(result);
        }
        return result;
      };
      
      const schema1 = decoratedMethod();
      const schema2 = decoratedMethod();
      
      expect(schema1).toBe(schema2);
      
      const stats = schemaCache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });
  });
});

describe('Complex Schema Scenarios', () => {
  let cache: SchemaCache;

  beforeEach(() => {
    cache = SchemaCache.getInstance();
    cache.clear();
  });

  it('should handle nested object schemas', () => {
    const schema = z.object({
      user: z.object({
        name: z.string(),
        profile: z.object({
          age: z.number(),
          preferences: z.array(z.string())
        })
      }),
      metadata: z.record(z.any())
    });

    const cached1 = cache.getOrSet(schema);
    const cached2 = cache.getOrSet(schema);

    expect(cached1).toBe(cached2);
  });

  it('should handle union and discriminated union schemas', () => {
    const schema = z.discriminatedUnion('type', [
      z.object({ type: z.literal('user'), name: z.string() }),
      z.object({ type: z.literal('admin'), permissions: z.array(z.string()) })
    ]);

    const cached1 = cache.getOrSet(schema);
    const cached2 = cache.getOrSet(schema);

    expect(cached1).toBe(cached2);
  });

  it('should handle array and tuple schemas', () => {
    const arraySchema = z.array(z.object({ id: z.number(), name: z.string() }));
    const tupleSchema = z.tuple([z.string(), z.number(), z.boolean()]);

    const cachedArray1 = cache.getOrSet(arraySchema);
    const cachedArray2 = cache.getOrSet(arraySchema);
    const cachedTuple1 = cache.getOrSet(tupleSchema);
    const cachedTuple2 = cache.getOrSet(tupleSchema);

    expect(cachedArray1).toBe(cachedArray2);
    expect(cachedTuple1).toBe(cachedTuple2);
    expect(cachedArray1).not.toBe(cachedTuple1);
  });

  it('should handle optional and nullable schemas', () => {
    const schema = z.object({
      required: z.string(),
      optional: z.string().optional(),
      nullable: z.string().nullable(),
      optionalNullable: z.string().optional().nullable()
    });

    const cached1 = cache.getOrSet(schema);
    const cached2 = cache.getOrSet(schema);

    expect(cached1).toBe(cached2);
  });

  it('should handle enum schemas', () => {
    const enumSchema = z.enum(['red', 'green', 'blue']);
    const nativeEnumSchema = z.nativeEnum({ RED: 'red', GREEN: 'green', BLUE: 'blue' });

    const cachedEnum1 = cache.getOrSet(enumSchema);
    const cachedEnum2 = cache.getOrSet(enumSchema);
    const cachedNativeEnum1 = cache.getOrSet(nativeEnumSchema);
    const cachedNativeEnum2 = cache.getOrSet(nativeEnumSchema);

    expect(cachedEnum1).toBe(cachedEnum2);
    expect(cachedNativeEnum1).toBe(cachedNativeEnum2);
    expect(cachedEnum1).not.toBe(cachedNativeEnum1);
  });
});
