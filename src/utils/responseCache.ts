import { createHash } from 'crypto';
import { z } from 'zod';

/**
 * Cache entry for LLM responses
 */
export interface CacheEntry<T = any> {
  /** The cached response data */
  data: T;
  /** Timestamp when the entry was created */
  createdAt: number;
  /** Timestamp when the entry was last accessed */
  lastAccessed: number;
  /** Number of times this entry has been accessed */
  hitCount: number;
  /** TTL (time to live) in milliseconds */
  ttl?: number;
  /** Metadata about the original request */
  metadata: {
    provider: string;
    model: string;
    schemaHash: string;
    promptHash: string;
  };
}

/**
 * Configuration for the response cache
 */
export interface ResponseCacheConfig {
  /** Maximum number of entries to store */
  maxSize?: number;
  /** Default TTL for cache entries in milliseconds */
  defaultTtl?: number;
  /** Enable automatic cleanup of expired entries */
  enableCleanup?: boolean;
  /** Cleanup interval in milliseconds */
  cleanupInterval?: number;
}

/**
 * Default configuration for the response cache
 */
export const DEFAULT_RESPONSE_CACHE_CONFIG: Required<ResponseCacheConfig> = {
  maxSize: 1000,
  defaultTtl: 24 * 60 * 60 * 1000, // 24 hours
  enableCleanup: true,
  cleanupInterval: 60 * 60 * 1000, // 1 hour
};

/**
 * LLM Response Cache for storing and retrieving full LLM responses
 * Uses deterministic cache keys based on prompt, schema, model, and parameters
 */
export class ResponseCache {
  private static instance: ResponseCache;
  private cache: Map<string, CacheEntry>;
  private config: Required<ResponseCacheConfig>;
  private cleanupTimer?: NodeJS.Timeout | undefined;
  private stats: {
    hits: number;
    misses: number;
    evictions: number;
    expirations: number;
    totalRequests: number;
  };

  private constructor(config: ResponseCacheConfig = {}) {
    this.config = { ...DEFAULT_RESPONSE_CACHE_CONFIG, ...config };
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
      totalRequests: 0
    };

    if (this.config.enableCleanup) {
      this.startCleanupTimer();
    }
  }

  /**
   * Get singleton instance of ResponseCache
   */
  public static getInstance(config?: ResponseCacheConfig): ResponseCache {
    if (!ResponseCache.instance) {
      ResponseCache.instance = new ResponseCache(config);
    }
    return ResponseCache.instance;
  }

  /**
   * Generate a deterministic cache key based on request parameters
   */
  private generateCacheKey(params: {
    prompt: string;
    schema: z.ZodSchema<any>;
    model: string;
    provider: string;
    temperature?: number;
    maxTokens?: number;
    content?: string;
  }): string {
    const { prompt, schema, model, provider, temperature, maxTokens, content } = params;

    // Create a deterministic hash of the schema
    const schemaHash = this.hashSchema(schema);
    
    // Create a hash of the prompt and content
    const promptContent = content ? `${prompt}\n---CONTENT---\n${content}` : prompt;
    const promptHash = createHash('md5').update(promptContent).digest('hex');

    // Include model parameters that affect output
    const modelParams = {
      temperature: temperature ?? 0,
      maxTokens: maxTokens ?? 0,
    };

    const keyData = {
      provider,
      model,
      schemaHash,
      promptHash,
      params: modelParams,
    };

    return createHash('md5').update(JSON.stringify(keyData)).digest('hex');
  }

  /**
   * Generate a hash for a Zod schema
   */
  private hashSchema(schema: z.ZodSchema<any>): string {
    try {
      const schemaString = JSON.stringify(schema._def, (_, value) => {
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
      // Fallback for schemas that can't be serialized
      return createHash('md5').update(`${schema.constructor.name}_${Date.now()}`).digest('hex');
    }
  }

  /**
   * Get a cached response if it exists and is not expired
   */
  public get<T>(params: {
    prompt: string;
    schema: z.ZodSchema<T>;
    model: string;
    provider: string;
    temperature?: number;
    maxTokens?: number;
    content?: string;
  }): T | null {
    this.stats.totalRequests++;
    const key = this.generateCacheKey(params);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if entry has expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.expirations++;
      this.stats.misses++;
      return null;
    }

    // Update access statistics
    entry.lastAccessed = Date.now();
    entry.hitCount++;
    this.stats.hits++;

    return entry.data as T;
  }

  /**
   * Store a response in the cache
   */
  public set<T>(
    params: {
      prompt: string;
      schema: z.ZodSchema<T>;
      model: string;
      provider: string;
      temperature?: number;
      maxTokens?: number;
      content?: string;
    },
    data: T,
    ttl?: number
  ): void {
    const key = this.generateCacheKey(params);
    const now = Date.now();

    // If cache is full, evict least recently used entry
    if (this.cache.size >= this.config.maxSize) {
      this.evictLeastRecentlyUsed();
    }

    const entry: CacheEntry<T> = {
      data,
      createdAt: now,
      lastAccessed: now,
      hitCount: 0,
      ttl: ttl ?? this.config.defaultTtl,
      metadata: {
        provider: params.provider,
        model: params.model,
        schemaHash: this.hashSchema(params.schema),
        promptHash: createHash('md5').update(params.prompt).digest('hex'),
      },
    };

    this.cache.set(key, entry);
  }

  /**
   * Check if a cache entry has expired
   */
  private isExpired(entry: CacheEntry): boolean {
    if (!entry.ttl) return false;
    return Date.now() - entry.createdAt > entry.ttl;
  }

  /**
   * Evict the least recently used entry
   */
  private evictLeastRecentlyUsed(): void {
    let lruKey = '';
    let oldestAccess = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestAccess) {
        oldestAccess = entry.lastAccessed;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.stats.evictions++;
    }
  }

  /**
   * Clean up expired entries
   */
  public cleanup(): number {
    let removedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        removedCount++;
        this.stats.expirations++;
      }
    }

    return removedCount;
  }

  /**
   * Start automatic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * Stop automatic cleanup timer
   */
  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Clear all cached entries
   */
  public clear(): void {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
      totalRequests: 0
    };
  }

  /**
   * Remove a specific entry from cache
   */
  public remove(params: {
    prompt: string;
    schema: z.ZodSchema<any>;
    model: string;
    provider: string;
    temperature?: number;
    maxTokens?: number;
    content?: string;
  }): boolean {
    const key = this.generateCacheKey(params);
    return this.cache.delete(key);
  }

  /**
   * Check if an entry exists in cache (without affecting access stats)
   */
  public has(params: {
    prompt: string;
    schema: z.ZodSchema<any>;
    model: string;
    provider: string;
    temperature?: number;
    maxTokens?: number;
    content?: string;
  }): boolean {
    const key = this.generateCacheKey(params);
    const entry = this.cache.get(key);
    return entry !== undefined && !this.isExpired(entry);
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
    expirations: number;
    totalRequests: number;
    hitRate: number;
    memoryUsage: {
      entries: number;
      averageEntrySize: number;
    };
  } {
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      expirations: this.stats.expirations,
      totalRequests: this.stats.totalRequests,
      hitRate: this.stats.totalRequests > 0 ? this.stats.hits / this.stats.totalRequests : 0,
      memoryUsage: {
        entries: this.cache.size,
        averageEntrySize: this.cache.size > 0 ? this.estimateMemoryUsage() / this.cache.size : 0,
      },
    };
  }

  /**
   * Estimate memory usage of the cache
   */
  private estimateMemoryUsage(): number {
    let totalSize = 0;
    for (const [key, entry] of this.cache.entries()) {
      // Rough estimation: key size + JSON size of entry
      totalSize += key.length * 2; // UTF-16 characters
      totalSize += JSON.stringify(entry).length * 2;
    }
    return totalSize;
  }

  /**
   * Get detailed cache information for debugging
   */
  public getDebugInfo(): {
    entries: Array<{
      key: string;
      hitCount: number;
      createdAt: Date;
      lastAccessed: Date;
      isExpired: boolean;
      provider: string;
      model: string;
      dataSize: number;
    }>;
    stats: ReturnType<ResponseCache['getStats']>;
  } {
    const entries: Array<{
      key: string;
      hitCount: number;
      createdAt: Date;
      lastAccessed: Date;
      isExpired: boolean;
      provider: string;
      model: string;
      dataSize: number;
    }> = [];

    for (const [key, entry] of this.cache.entries()) {
      entries.push({
        key,
        hitCount: entry.hitCount,
        createdAt: new Date(entry.createdAt),
        lastAccessed: new Date(entry.lastAccessed),
        isExpired: this.isExpired(entry),
        provider: entry.metadata.provider,
        model: entry.metadata.model,
        dataSize: JSON.stringify(entry.data).length,
      });
    }

    // Sort by hit count descending
    entries.sort((a, b) => b.hitCount - a.hitCount);

    return {
      entries,
      stats: this.getStats(),
    };
  }

  /**
   * Update cache configuration
   */
  public updateConfig(newConfig: Partial<ResponseCacheConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };

    // Handle cleanup timer changes
    if (oldConfig.enableCleanup !== this.config.enableCleanup) {
      if (this.config.enableCleanup) {
        this.startCleanupTimer();
      } else {
        this.stopCleanupTimer();
      }
    } else if (this.config.enableCleanup && oldConfig.cleanupInterval !== this.config.cleanupInterval) {
      this.stopCleanupTimer();
      this.startCleanupTimer();
    }

    // If max size decreased, evict entries
    while (this.cache.size > this.config.maxSize) {
      this.evictLeastRecentlyUsed();
    }
  }

  /**
   * Get most frequently used cache entries
   */
  public getMostUsedEntries(limit: number = 10): Array<{
    key: string;
    hitCount: number;
    provider: string;
    model: string;
    createdAt: Date;
  }> {
    const entries: Array<{
      key: string;
      hitCount: number;
      provider: string;
      model: string;
      createdAt: Date;
    }> = [];

    for (const [key, entry] of this.cache.entries()) {
      entries.push({
        key,
        hitCount: entry.hitCount,
        provider: entry.metadata.provider,
        model: entry.metadata.model,
        createdAt: new Date(entry.createdAt),
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
      expirations: 0,
      totalRequests: 0
    };
  }

  /**
   * Destroy the cache and cleanup resources
   */
  public destroy(): void {
    this.stopCleanupTimer();
    this.clear();
  }
}

// Export singleton instance
export const responseCache = ResponseCache.getInstance();

/**
 * Utility function to create a cache key for debugging
 */
export function createResponseCacheKey(params: {
  prompt: string;
  schema: z.ZodSchema<any>;
  model: string;
  provider: string;
  temperature?: number;
  maxTokens?: number;
  content?: string;
}): string {
  return responseCache['generateCacheKey'](params);
}
