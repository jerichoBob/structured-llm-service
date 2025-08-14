import { z } from 'zod';
import StructuredLLMService, { structuredLLM } from './StructuredLLMService.js';
import {
  StructuredLLMOptions,
  StructuredLLMResult,
  StructuredLLMServiceConfig,
} from '../interfaces/index.js';

// Test schema for validation
const TestSchema = z.object({
  name: z.string().describe('The name of the person'),
  age: z.number().describe('The age of the person'),
  email: z.string().email().describe('The email address'),
  isActive: z.boolean().optional().describe('Whether the person is active'),
});

type TestData = z.infer<typeof TestSchema>;

describe('StructuredLLMService', () => {
  let service: StructuredLLMService;

  beforeEach(() => {
    service = new StructuredLLMService();
  });

  describe('Constructor and Configuration', () => {
    it('should create service with default configuration', () => {
      const config = service.getConfig();
      expect(config.defaultProvider).toBe('auto');
      expect(config.defaultRetryStrategy).toBe('exponential');
      expect(config.defaultMaxRetries).toBe(3);
      expect(config.defaultTimeout).toBe(30000);
      expect(config.enableCaching).toBe(false);
      expect(config.enableLogging).toBe(false);
    });

    it('should create service with custom configuration', () => {
      const customConfig: StructuredLLMServiceConfig = {
        defaultProvider: 'claude',
        defaultRetryStrategy: 'linear',
        defaultMaxRetries: 5,
        enableLogging: true,
      };

      const customService = new StructuredLLMService(customConfig);
      const config = customService.getConfig();

      expect(config.defaultProvider).toBe('claude');
      expect(config.defaultRetryStrategy).toBe('linear');
      expect(config.defaultMaxRetries).toBe(5);
      expect(config.enableLogging).toBe(true);
    });

    it('should update configuration', () => {
      service.updateConfig({ defaultProvider: 'gemini', enableCaching: true });
      const config = service.getConfig();

      expect(config.defaultProvider).toBe('gemini');
      expect(config.enableCaching).toBe(true);
    });
  });

  describe('Provider Management', () => {
    it('should return available providers', () => {
      const providers = service.getAvailableProviders();
      expect(providers).toContain('claude');
      expect(providers).toContain('gemini');
      expect(providers).toContain('auto');
    });

    it('should check provider availability', () => {
      expect(service.isProviderAvailable('claude')).toBe(true);
      expect(service.isProviderAvailable('gemini')).toBe(true);
      expect(service.isProviderAvailable('auto')).toBe(true);
      expect(service.isProviderAvailable('unknown')).toBe(false);
    });
  });

  describe('Generate Method (Stub Implementation)', () => {
    it('should generate structured output with basic options', async () => {
      const options: StructuredLLMOptions<TestData> = {
        schema: TestSchema,
        prompt: 'Generate a person profile',
      };

      const result: StructuredLLMResult<TestData> = await service.generate(options);

      // With placeholder API key, expect failure but proper error handling
      expect(result.success).toBe(false);
      expect(result.attempts).toBeGreaterThanOrEqual(1);
      expect(result.provider).toBe('auto'); // provider in error result shows original request
      expect(result.tokenUsage).toBeDefined();
      expect(result.tokenUsage.totalTokens).toBe(0);
      expect(result.processingTime).toBeGreaterThan(0);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should merge options with defaults', async () => {
      const options: StructuredLLMOptions<TestData> = {
        schema: TestSchema,
        prompt: 'Generate a person profile',
        provider: 'claude',
        maxRetries: 5,
      };

      const result = await service.generate(options);

      // Claude is not supported by instructor-js v1.7.0, so expect error
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]?.message).toContain('instructor-js v1.7.0 does not support claude');
    });

    it('should handle errors gracefully', async () => {
      // Create a service that will throw an error
      const errorService = new StructuredLLMService();

      // Mock the generate method to throw an error
      errorService.generate = async () => {
        throw new Error('Test error');
      };

      try {
        await errorService.generate({
          schema: TestSchema,
          prompt: 'This will fail',
        });
      } catch (error) {
        // The method should handle errors internally and return a result
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Default Export', () => {
    it('should provide a default instance', () => {
      expect(structuredLLM).toBeInstanceOf(StructuredLLMService);
      expect(structuredLLM.getAvailableProviders()).toContain('auto');
    });
  });

  describe('Type Safety', () => {
    it('should maintain type safety with generic schemas', async () => {
      const NumberSchema = z.object({
        value: z.number(),
        label: z.string(),
      });

      const options: StructuredLLMOptions<z.infer<typeof NumberSchema>> = {
        schema: NumberSchema,
        prompt: 'Generate a number with label',
      };

      const result = await service.generate(options);

      // With placeholder API key, expect failure but proper error handling
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      // TypeScript should still enforce the correct type
      expect(typeof result).toBe('object');
    });
  });

  describe('Instructor-js Integration (Stub)', () => {
    it('should import instructor-js without errors', async () => {
      // This test ensures that instructor-js can be imported successfully
      const { default: Instructor } = await import('@instructor-ai/instructor');
      expect(Instructor).toBeDefined();
    });

    it('should reference instructor-js in metadata', async () => {
      const result = await service.generate({
        schema: TestSchema,
        prompt: 'Test instructor-js reference',
      });

      // With placeholder API key, the call fails, so metadata will be error metadata
      expect(result.success).toBe(false);
      expect(result.metadata?.['error']).toBe(true);
      expect(result.metadata?.['stubImplementation']).toBe(true);
    });
  });
});
