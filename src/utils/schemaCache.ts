import { z } from 'zod';
import { createHash } from 'crypto';

/**
 * Schema cache for storing and retrieving frequently used Zod schemas
 * to avoid repeated schema compilation and validation setup
 */
export class SchemaCache {
  private static instance: SchemaCache;
  private cache: Map<string, z.ZodSchema<any>>;
  private hitCount: Map<string, number>;
  private lastAccessed: Map<string, number>;
  private maxSize: number;
  private stats: {
    hits: number;
    misses: number;
    evictions: number;
    totalRequests: number;
  };

  private constructor(maxSize: number = 100) {
    this.cache = new Map();
    this.hitCount = new Map();
    this.lastAccessed = new Map();
    this.maxSize = maxSize;
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalRequests: 0
    };
  }

  /**
   * Get singleton instance of SchemaCache
   */
  public static getInstance(maxSize?: number): SchemaCache {
    if (!SchemaCache.instance) {
      SchemaCache.instance = new SchemaCache(maxSize);
    }
    return SchemaCache.instance;
  }

  /**
   * Generate a cache key for a schema based on its structure
   */
  private generateCacheKey(schema: z.ZodSchema<any>): string {
    try {
      // Create a hash based on the schema's structure
      const schemaString = JSON.stringify(schema._def, (_, value) => {
        // Sort object keys for consistent hashing
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          return Object.keys(value).sort().reduce((sorted: any, k) => {
            sorted[k] = value[k];
            return sorted;
          }, {});
        }
        return value;
      });
      return createHash('md5').update(schemaString).digest('hex');
    } catch (error) {
      // Fallback to a simple string representation if JSON.stringify fails
      const fallbackString = schema.constructor.name + '_' + Date.now() + '_' + Math.random();
      return createHash('md5').update(fallbackString).digest('hex');
    }
  }

  /**
   * Get a schema from cache or store it if not present
   */
  public getOrSet<T>(schema: z.ZodSchema<T>): z.ZodSchema<T> {
    this.stats.totalRequests++;
    const key = this.generateCacheKey(schema);
    const now = Date.now();
    
    if (this.cache.has(key)) {
      this.stats.hits++;
      this.hitCount.set(key, (this.hitCount.get(key) || 0) + 1);
      this.lastAccessed.set(key, now);
      return this.cache.get(key) as z.ZodSchema<T>;
    }

    this.stats.misses++;
    
    // If cache is full, evict least recently used item
    if (this.cache.size >= this.maxSize) {
      this.evictLeastRecentlyUsed();
    }

    this.cache.set(key, schema);
    this.hitCount.set(key, 1);
    this.lastAccessed.set(key, now);
    
    return schema;
  }

  /**
   * Evict the least recently used schema from cache
   */
  private evictLeastRecentlyUsed(): void {
    let lruKey = '';
    let oldestTime = Infinity;

    for (const [key, lastAccess] of this.lastAccessed.entries()) {
      if (lastAccess < oldestTime) {
        oldestTime = lastAccess;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.hitCount.delete(lruKey);
      this.lastAccessed.delete(lruKey);
      this.stats.evictions++;
    }
  }

  /**
   * Check if a schema exists in cache without affecting access statistics
   */
  public has(schema: z.ZodSchema<any>): boolean {
    const key = this.generateCacheKey(schema);
    return this.cache.has(key);
  }

  /**
   * Get cache key for a schema (useful for debugging)
   */
  public getCacheKey(schema: z.ZodSchema<any>): string {
    return this.generateCacheKey(schema);
  }

  /**
   * Clear all cached schemas
   */
  public clear(): void {
    this.cache.clear();
    this.hitCount.clear();
    this.lastAccessed.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalRequests: 0
    };
  }

  /**
   * Remove a specific schema from cache
   */
  public remove(schema: z.ZodSchema<any>): boolean {
    const key = this.generateCacheKey(schema);
    const existed = this.cache.has(key);
    
    if (existed) {
      this.cache.delete(key);
      this.hitCount.delete(key);
      this.lastAccessed.delete(key);
    }
    
    return existed;
  }

  /**
   * Get cache statistics
   */
  public getStats(): {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    evictions: number;
    totalRequests: number;
    hitRate: number;
    memoryUsage: {
      cacheEntries: number;
      hitCountEntries: number;
      lastAccessedEntries: number;
    };
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      totalRequests: this.stats.totalRequests,
      hitRate: this.stats.totalRequests > 0 ? this.stats.hits / this.stats.totalRequests : 0,
      memoryUsage: {
        cacheEntries: this.cache.size,
        hitCountEntries: this.hitCount.size,
        lastAccessedEntries: this.lastAccessed.size,
      }
    };
  }

  /**
   * Get detailed cache information for debugging
   */
  public getDebugInfo(): {
    entries: Array<{
      key: string;
      hitCount: number;
      lastAccessed: Date;
      schemaType: string;
    }>;
    stats: ReturnType<SchemaCache['getStats']>;
  } {
    const entries: Array<{
      key: string;
      hitCount: number;
      lastAccessed: Date;
      schemaType: string;
    }> = [];

    for (const [key, schema] of this.cache.entries()) {
      entries.push({
        key,
        hitCount: this.hitCount.get(key) || 0,
        lastAccessed: new Date(this.lastAccessed.get(key) || 0),
        schemaType: schema.constructor.name || 'Unknown'
      });
    }

    // Sort by hit count descending
    entries.sort((a, b) => b.hitCount - a.hitCount);

    return {
      entries,
      stats: this.getStats()
    };
  }

  /**
   * Preload commonly used schemas into cache
   */
  public preloadSchemas(schemas: Array<{ name: string; schema: z.ZodSchema<any> }>): void {
    schemas.forEach(({ schema }) => {
      this.getOrSet(schema);
    });
  }

  /**
   * Update cache size and evict entries if necessary
   */
  public updateMaxSize(newMaxSize: number): void {
    this.maxSize = newMaxSize;
    
    // If new size is smaller, evict entries
    while (this.cache.size > this.maxSize) {
      this.evictLeastRecentlyUsed();
    }
  }

  /**
   * Get most frequently used schemas
   */
  public getMostUsedSchemas(limit: number = 10): Array<{
    key: string;
    hitCount: number;
    schemaType: string;
  }> {
    const entries: Array<{
      key: string;
      hitCount: number;
      schemaType: string;
    }> = [];

    for (const [key, schema] of this.cache.entries()) {
      entries.push({
        key,
        hitCount: this.hitCount.get(key) || 0,
        schemaType: schema.constructor.name || 'Unknown'
      });
    }

    return entries
      .sort((a, b) => b.hitCount - a.hitCount)
      .slice(0, limit);
  }

  /**
   * Reset statistics without clearing cache
   */
  public resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalRequests: 0
    };
  }
}

// Export singleton instance
export const schemaCache = SchemaCache.getInstance();

/**
 * Utility function to create a cached schema wrapper
 */
export function createCachedSchema<T>(schema: z.ZodSchema<T>): z.ZodSchema<T> {
  return schemaCache.getOrSet(schema);
}

/**
 * Decorator function for caching schemas in class methods
 */
export function CacheSchema(_target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  
  descriptor.value = function (...args: any[]) {
    const result = originalMethod.apply(this, args);
    
    // If the result is a Zod schema, cache it
    if (result && typeof result.parse === 'function') {
      return schemaCache.getOrSet(result);
    }
    
    return result;
  };
  
  return descriptor;
}
