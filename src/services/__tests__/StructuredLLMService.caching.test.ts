import { z } from 'zod';
import { StructuredLLMService } from '../StructuredLLMService';
import { schemaCache } from '../../utils/schemaCache';
import { responseCache } from '../../utils/responseCache';

// Mock the instructor client
jest.mock('../../utils/instructorClient.js', () => ({
  createInstructorClientFromEnv: jest.fn(),
  validateProviderConfig: jest.fn(),
  selectOptimalModeWithFallback: jest.fn(() => ({
    mode: 'json',
    isNativeMode: false,
    fallbackMode: 'json',
    reason: 'Test mode selection'
  })),
}));

// Mock the cost calculator
jest.mock('../../utils/costCalculator.js', () => ({
  calculateCostFromUsage: jest.fn(() => ({
    inputCost: 0.01,
    outputCost: 0.02,
    totalCost: 0.03,
    currency: 'USD',
    provider: 'openai',
    model: 'gpt-4',
    pricingDate: '2024-01-01'
  })),
}));

describe('StructuredLLMService Caching Integration', () => {
  let service: StructuredLLMService;
  let mockInstructorClient: any;

  beforeEach(() => {
    // Clear caches before each test
    schemaCache.clear();
    responseCache.clear();

    // Create service with caching enabled
    service = new StructuredLLMService({
      enableCaching: true,
      enableLogging: false,
      defaultProvider: 'auto',
    });

    // Mock instructor client
    mockInstructorClient = {
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    };

    // Mock the instructor client creation
    const { createInstructorClientFromEnv } = require('../../utils/instructorClient.js');
    createInstructorClientFromEnv.mockReturnValue(mockInstructorClient);

    // Mock provider validation
    const { validateProviderConfig } = require('../../utils/instructorClient.js');
    validateProviderConfig.mockReturnValue(true);
  });

  afterEach(() => {
    schemaCache.clear();
    responseCache.clear();
    jest.clearAllMocks();
  });

  describe('Schema Caching', () => {
    it('should cache schemas for improved performance', async () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const mockResponse = {
        name: 'John Doe',
        age: 30,
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      mockInstructorClient.chat.completions.create.mockResolvedValue(mockResponse);

      // First request should cache the schema
      await service.generate({
        prompt: 'Extract user info',
        schema,
        model: 'gpt-4',
      });

      // Verify schema was cached
      const stats = schemaCache.getStats();
      expect(stats.size).toBe(1);
      expect(stats.misses).toBe(1);

      // Second request with same schema should hit cache
      await service.generate({
        prompt: 'Extract different user info',
        schema,
        model: 'gpt-4',
      });

      const updatedStats = schemaCache.getStats();
      expect(updatedStats.size).toBe(1);
      expect(updatedStats.hits).toBe(1);
      expect(updatedStats.misses).toBe(1);
    });

    it('should cache different schemas separately', async () => {
      const userSchema = z.object({ name: z.string() });
      const productSchema = z.object({ price: z.number() });

      const mockResponse1 = { name: 'John', usage: { prompt_tokens: 50, completion_tokens: 25, total_tokens: 75 } };
      const mockResponse2 = { price: 99.99, usage: { prompt_tokens: 60, completion_tokens: 30, total_tokens: 90 } };

      mockInstructorClient.chat.completions.create
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      await service.generate({
        prompt: 'Extract user',
        schema: userSchema,
        model: 'gpt-4',
      });

      await service.generate({
        prompt: 'Extract product',
        schema: productSchema,
        model: 'gpt-4',
      });

      const stats = schemaCache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.misses).toBe(2);
    });
  });

  describe('Response Caching', () => {
    it('should cache and return identical responses for same parameters', async () => {
      const schema = z.object({
        result: z.string(),
      });

      const mockResponse = {
        result: 'cached response',
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      mockInstructorClient.chat.completions.create.mockResolvedValue(mockResponse);

      const options = {
        prompt: 'Test prompt',
        schema,
        model: 'gpt-4',
        temperature: 0.1,
      };

      // First request should call LLM and cache response
      const result1 = await service.generate(options);

      expect(result1.success).toBe(true);
      expect(result1.data).toEqual({ result: 'cached response' });
      expect(result1.metadata?.['cached']).toBe(false);
      expect(result1.metadata?.['cacheHit']).toBe(false);
      expect(mockInstructorClient.chat.completions.create).toHaveBeenCalledTimes(1);

      // Second identical request should return cached response
      const result2 = await service.generate(options);

      expect(result2.success).toBe(true);
      expect(result2.data).toEqual({ result: 'cached response' });
      expect(result2.metadata?.['cached']).toBe(true);
      expect(result2.metadata?.['cacheHit']).toBe(true);
      expect(result2.tokenUsage.totalTokens).toBe(0); // No tokens used for cached response
      expect(mockInstructorClient.chat.completions.create).toHaveBeenCalledTimes(1); // No additional calls
    });

    it('should not cache responses when caching is disabled', async () => {
      // Create service with caching disabled
      const noCacheService = new StructuredLLMService({
        enableCaching: false,
        enableLogging: false,
        defaultProvider: 'claude',
      });

      const schema = z.object({ result: z.string() });
      const mockResponse = {
        result: 'no cache response',
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      };

      mockInstructorClient.chat.completions.create.mockResolvedValue(mockResponse);

      const options = {
        prompt: 'Test prompt',
        schema,
        model: 'gpt-4',
      };

      // First request
      const result1 = await noCacheService.generate(options);
      expect(result1.success).toBe(true);
      expect((result1.metadata?.['responseCache'] as any)?.enabled).toBe(false);

      // Second identical request should still call LLM
      const result2 = await noCacheService.generate(options);
      expect(result2.success).toBe(true);
      expect((result2.metadata?.['responseCache'] as any)?.enabled).toBe(false);
      expect(mockInstructorClient.chat.completions.create).toHaveBeenCalledTimes(2);
    });

    it('should generate different cache keys for different parameters', async () => {
      const schema = z.object({ result: z.string() });

      const mockResponse1 = {
        result: 'response 1',
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      };

      const mockResponse2 = {
        result: 'response 2',
        usage: { prompt_tokens: 110, completion_tokens: 55, total_tokens: 165 },
      };

      mockInstructorClient.chat.completions.create
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      // Request with temperature 0.1
      const result1 = await service.generate({
        prompt: 'Test prompt',
        schema,
        model: 'gpt-4',
        temperature: 0.1,
      });

      // Request with temperature 0.5 (different cache key)
      const result2 = await service.generate({
        prompt: 'Test prompt',
        schema,
        model: 'gpt-4',
        temperature: 0.5,
      });

      expect(result1.data).toEqual({ result: 'response 1' });
      expect(result2.data).toEqual({ result: 'response 2' });
      expect(mockInstructorClient.chat.completions.create).toHaveBeenCalledTimes(2);

      // Verify both responses are cached separately
      const cacheStats = responseCache.getStats();
      expect(cacheStats.size).toBe(2);
    });

    it('should handle content parameter in cache key generation', async () => {
      const schema = z.object({ summary: z.string() });

      const mockResponse1 = {
        summary: 'summary of content 1',
        usage: { prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 },
      };

      const mockResponse2 = {
        summary: 'summary of content 2',
        usage: { prompt_tokens: 250, completion_tokens: 125, total_tokens: 375 },
      };

      mockInstructorClient.chat.completions.create
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      // Request with content
      const result1 = await service.generate({
        prompt: 'Summarize this content',
        schema,
        model: 'gpt-4',
        content: 'This is the first content to summarize',
      });

      // Request with different content
      const result2 = await service.generate({
        prompt: 'Summarize this content',
        schema,
        model: 'gpt-4',
        content: 'This is the second content to summarize',
      });

      expect(result1.data).toEqual({ summary: 'summary of content 1' });
      expect(result2.data).toEqual({ summary: 'summary of content 2' });
      expect(mockInstructorClient.chat.completions.create).toHaveBeenCalledTimes(2);

      // Verify both responses are cached separately
      const cacheStats = responseCache.getStats();
      expect(cacheStats.size).toBe(2);
    });
  });

  describe('Cache Statistics in Metadata', () => {
    it('should include cache statistics in response metadata', async () => {
      const schema = z.object({ data: z.string() });
      const mockResponse = {
        data: 'test data',
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      };

      mockInstructorClient.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await service.generate({
        prompt: 'Test prompt',
        schema,
        model: 'gpt-4',
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.['schemaCache']).toBeDefined();
      expect((result.metadata?.['schemaCache'] as any)?.enabled).toBe(true);
      expect((result.metadata?.['schemaCache'] as any)?.stats).toBeDefined();

      expect(result.metadata?.['responseCache']).toBeDefined();
      expect((result.metadata?.['responseCache'] as any)?.enabled).toBe(true);
      expect((result.metadata?.['responseCache'] as any)?.stats).toBeDefined();
    });

    it('should show correct cache statistics for cached responses', async () => {
      const schema = z.object({ value: z.number() });
      const mockResponse = {
        value: 42,
        usage: { prompt_tokens: 75, completion_tokens: 25, total_tokens: 100 },
      };

      mockInstructorClient.chat.completions.create.mockResolvedValue(mockResponse);

      const options = {
        prompt: 'Get a number',
        schema,
        model: 'gpt-4',
      };

      // First request
      await service.generate(options);

      // Second request (cached)
      const cachedResult = await service.generate(options);

      expect((cachedResult.metadata?.['responseCache'] as any)?.stats?.hits).toBe(1);
      expect((cachedResult.metadata?.['responseCache'] as any)?.stats?.misses).toBe(1);
      expect((cachedResult.metadata?.['responseCache'] as any)?.stats?.hitRate).toBe(0.5);
    });
  });

  describe('Error Handling with Caching', () => {
    it('should not cache failed responses', async () => {
      const schema = z.object({ result: z.string() });

      mockInstructorClient.chat.completions.create.mockRejectedValue(
        new Error('API Error')
      );

      const options = {
        prompt: 'Test prompt',
        schema,
        model: 'gpt-4',
      };

      // First request should fail
      const result1 = await service.generate(options);
      expect(result1.success).toBe(false);

      // Verify no response was cached
      const cacheStats = responseCache.getStats();
      expect(cacheStats.size).toBe(0);

      // Second request should also call LLM (no cache)
      const result2 = await service.generate(options);
      expect(result2.success).toBe(false);
      expect(mockInstructorClient.chat.completions.create).toHaveBeenCalledTimes(6); // 3 retries per request
    });

    it('should handle cache errors gracefully', async () => {
      const schema = z.object({ result: z.string() });
      const mockResponse = {
        result: 'success despite cache error',
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      };

      mockInstructorClient.chat.completions.create.mockResolvedValue(mockResponse);

      // Mock cache error
      const originalGet = responseCache.get;
      responseCache.get = jest.fn().mockImplementation(() => {
        throw new Error('Cache error');
      });

      const result = await service.generate({
        prompt: 'Test prompt',
        schema,
        model: 'gpt-4',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ result: 'success despite cache error' });

      // Restore original method
      responseCache.get = originalGet;
    });
  });

  describe('Complex Schema Caching', () => {
    it('should cache complex nested schemas correctly', async () => {
      const complexSchema = z.object({
        user: z.object({
          name: z.string(),
          profile: z.object({
            age: z.number(),
            preferences: z.array(z.string()),
          }),
        }),
        metadata: z.record(z.any()),
      });

      const mockResponse = {
        user: {
          name: 'John Doe',
          profile: {
            age: 30,
            preferences: ['coding', 'reading'],
          },
        },
        metadata: { source: 'test' },
        usage: { prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 },
      };

      mockInstructorClient.chat.completions.create.mockResolvedValue(mockResponse);

      const options = {
        prompt: 'Extract complex user data',
        schema: complexSchema,
        model: 'gpt-4',
      };

      // First request
      const result1 = await service.generate(options);
      expect(result1.success).toBe(true);

      // Second request should use cached response
      const result2 = await service.generate(options);
      expect(result2.success).toBe(true);
      expect(result2.metadata?.['cacheHit']).toBe(true);
      expect(mockInstructorClient.chat.completions.create).toHaveBeenCalledTimes(1);
    });

    it('should cache discriminated union schemas correctly', async () => {
      const unionSchema = z.discriminatedUnion('type', [
        z.object({ type: z.literal('user'), name: z.string() }),
        z.object({ type: z.literal('admin'), permissions: z.array(z.string()) }),
      ]);

      const mockResponse = {
        type: 'user',
        name: 'John Doe',
        usage: { prompt_tokens: 150, completion_tokens: 75, total_tokens: 225 },
      };

      mockInstructorClient.chat.completions.create.mockResolvedValue(mockResponse);

      const options = {
        prompt: 'Extract user or admin data',
        schema: unionSchema,
        model: 'gpt-4',
      };

      // First request
      const result1 = await service.generate(options);
      expect(result1.success).toBe(true);

      // Second request should use cached response
      const result2 = await service.generate(options);
      expect(result2.success).toBe(true);
      expect(result2.metadata?.['cacheHit']).toBe(true);
      expect(result2.data).toEqual({ type: 'user', name: 'John Doe' });
    });
  });
});
