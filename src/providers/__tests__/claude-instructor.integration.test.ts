import { ClaudeInstructorAdapter } from '../claude-instructor.js';
import { z } from 'zod';

/**
 * Integration tests for ClaudeInstructorAdapter retry behavior
 * 
 * These tests make actual API calls to Anthropic Claude API to validate
 * retry configuration and behavior in real-world scenarios.
 * 
 * NOTE: These tests require a valid ANTHROPIC_API_KEY and will consume API credits.
 * They are designed to run in a staging environment or when explicitly enabled.
 */

// Skip these tests by default to avoid consuming API credits during regular test runs
const ENABLE_INTEGRATION_TESTS = process.env['ENABLE_INTEGRATION_TESTS'] === 'true';
const describeIntegration = ENABLE_INTEGRATION_TESTS ? describe : describe.skip;

// Test configuration
const TEST_CONFIG = {
  // Use a smaller, faster model for integration tests
  model: 'claude-3-5-haiku-20241022',
  // Short timeout to potentially trigger timeouts for testing
  timeout: 5000,
  // Number of concurrent requests to potentially trigger rate limiting
  concurrentRequests: 10,
  // Delay between batches of requests
  batchDelay: 1000
};

// Simple schema for testing
const TestSchema = z.object({
  summary: z.string().describe('A brief summary of the input'),
  sentiment: z.enum(['positive', 'negative', 'neutral']).describe('The sentiment of the input'),
  keywords: z.array(z.string()).describe('Key words or phrases from the input')
});

describeIntegration('ClaudeInstructorAdapter Integration Tests', () => {
  let adapter: ClaudeInstructorAdapter;

  beforeAll(() => {
    // Ensure API key is available
    if (!process.env['ANTHROPIC_API_KEY']) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required for integration tests');
    }

    adapter = new ClaudeInstructorAdapter();
  });

  describe('Basic Retry Functionality', () => {
    it('should successfully generate structured output with default retry config', async () => {
      const options = {
        schema: TestSchema,
        prompt: 'Analyze this text',
        content: 'I love using this new AI tool! It makes my work so much easier and more efficient.',
        model: TEST_CONFIG.model,
        maxRetries: 3
      };

      const result = await adapter.generate(options);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.summary).toBeDefined();
      expect(result.data?.sentiment).toBeOneOf(['positive', 'negative', 'neutral']);
      expect(Array.isArray(result.data?.keywords)).toBe(true);
      expect(result.provider).toBe('claude');
      expect(result.tokenUsage.promptTokens).toBeGreaterThan(0);
      expect(result.tokenUsage.completionTokens).toBeGreaterThan(0);
    }, 30000);

    it('should handle custom retry configuration', async () => {
      const customRetryConfig = {
        max_attempts: 2,
        initial_delay: 1000,
        backoff_factor: 1.5,
        max_delay: 3000,
        jitter: false
      };

      const options = {
        schema: TestSchema,
        prompt: 'Analyze this text',
        content: 'This is a neutral statement about technology.',
        model: TEST_CONFIG.model,
        maxRetries: customRetryConfig
      };

      const result = await adapter.generate(options);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.sentiment).toBe('neutral');
    }, 30000);
  });

  describe('Rate Limiting and Retry Behavior', () => {
    it('should handle concurrent requests gracefully', async () => {
      const requests = Array.from({ length: TEST_CONFIG.concurrentRequests }, (_, i) => {
        return adapter.generate({
          schema: TestSchema,
          prompt: 'Analyze this text',
          content: `Test message ${i + 1}: This is a sample text for concurrent testing.`,
          model: TEST_CONFIG.model,
          maxRetries: 3
        });
      });

      const results = await Promise.allSettled(requests);
      
      // Count successful and failed requests
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;

      console.log(`Concurrent requests: ${successful} successful, ${failed} failed`);
      
      // At least some requests should succeed
      expect(successful).toBeGreaterThan(0);
      
      // If any failed, they should have proper error handling
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && !result.value.success) {
          console.log(`Request ${index + 1} failed:`, result.value.errors);
          expect(result.value.errors).toBeDefined();
          expect(result.value.errors?.[0]?.field).toBeDefined();
        }
      });
    }, 60000);

    it('should demonstrate retry behavior with aggressive rate limiting attempt', async () => {
      // This test attempts to trigger rate limiting by making rapid sequential requests
      const rapidRequests = Array.from({ length: 20 }, (_, i) => ({
        schema: TestSchema,
        prompt: 'Quick analysis',
        content: `Rapid test ${i + 1}`,
        model: TEST_CONFIG.model,
        maxRetries: {
          max_attempts: 5,
          initial_delay: 500,
          backoff_factor: 2,
          max_delay: 8000,
          jitter: true
        }
      }));

      const startTime = Date.now();
      const results: any[] = [];
      
      // Execute requests in batches to increase chance of rate limiting
      for (let i = 0; i < rapidRequests.length; i += 5) {
        const batch = rapidRequests.slice(i, i + 5);
        const batchPromises = batch.map(options => adapter.generate(options));
        
        try {
          const batchResults = await Promise.allSettled(batchPromises);
          results.push(...batchResults);
          
          // Small delay between batches
          if (i + 5 < rapidRequests.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          console.log(`Batch ${Math.floor(i / 5) + 1} error:`, error);
        }
      }
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      console.log(`Rapid requests completed in ${totalTime}ms`);
      
      // Analyze results
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const rateLimited = results.filter(r => 
        r.status === 'fulfilled' && 
        !r.value.success && 
        r.value.errors?.some((e: any) => e.message?.includes('rate') || e.message?.includes('429'))
      ).length;
      
      console.log(`Results: ${successful} successful, ${rateLimited} rate limited, ${results.length - successful - rateLimited} other errors`);
      
      // At least some requests should succeed
      expect(successful).toBeGreaterThan(0);
      
      // If rate limiting occurred, log it for verification
      if (rateLimited > 0) {
        console.log('✅ Rate limiting detected - retry behavior can be observed in logs');
      }
    }, 120000);
  });

  describe('Error Handling and Recovery', () => {
    it('should handle invalid API key gracefully', async () => {
      // Create adapter with invalid API key
      const invalidAdapter = new ClaudeInstructorAdapter('invalid-api-key');
      
      const options = {
        schema: TestSchema,
        prompt: 'Test with invalid key',
        content: 'This should fail',
        model: TEST_CONFIG.model,
        maxRetries: 2
      };

      const result = await invalidAdapter.generate(options);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]?.field).toBe('api');
      expect(result.errors?.[0]?.message).toContain('authentication');
    }, 15000);

    it('should handle malformed requests appropriately', async () => {
      const options = {
        schema: TestSchema,
        prompt: '', // Empty prompt
        content: '',
        model: 'invalid-model-name', // Invalid model
        maxRetries: 2
      };

      const result = await adapter.generate(options);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]?.field).toBe('api');
    }, 15000);
  });

  describe('Performance and Timeout Behavior', () => {
    it('should handle timeout scenarios with retry', async () => {
      // Use a very complex prompt that might take longer to process
      const complexPrompt = `
        Please provide a comprehensive analysis of the following text, including:
        1. Detailed sentiment analysis with confidence scores
        2. Entity extraction and classification
        3. Topic modeling and theme identification
        4. Linguistic analysis including tone, style, and complexity
        5. Contextual understanding and implications
        6. Comparative analysis with similar texts
        7. Predictive insights about audience reception
        8. Recommendations for improvement or optimization
      `;

      const options = {
        schema: TestSchema,
        prompt: complexPrompt,
        content: 'This is a simple test message that should be analyzed thoroughly.',
        model: TEST_CONFIG.model,
        maxRetries: {
          max_attempts: 3,
          initial_delay: 1000,
          backoff_factor: 2,
          max_delay: 5000,
          jitter: true
        }
      };

      const startTime = Date.now();
      const result = await adapter.generate(options);
      const endTime = Date.now();
      
      console.log(`Complex request completed in ${endTime - startTime}ms`);

      // Should either succeed or fail gracefully
      expect(result).toBeDefined();
      if (result.success) {
        expect(result.data).toBeDefined();
      } else {
        expect(result.errors).toBeDefined();
      }
    }, 45000);
  });

  describe('Retry Configuration Validation', () => {
    it('should respect different retry strategies', async () => {
      const strategies = [
        { name: 'Conservative', config: { max_attempts: 2, initial_delay: 2000, backoff_factor: 1.5 } },
        { name: 'Aggressive', config: { max_attempts: 5, initial_delay: 200, backoff_factor: 3 } },
        { name: 'Linear', config: { max_attempts: 3, initial_delay: 1000, backoff_factor: 1 } }
      ];

      for (const strategy of strategies) {
        console.log(`Testing ${strategy.name} retry strategy`);
        
        const options = {
          schema: TestSchema,
          prompt: 'Test retry strategy',
          content: `Testing ${strategy.name} strategy`,
          model: TEST_CONFIG.model,
          maxRetries: strategy.config
        };

        const startTime = Date.now();
        const result = await adapter.generate(options);
        const endTime = Date.now();
        
        console.log(`${strategy.name} strategy completed in ${endTime - startTime}ms`);
        
        // Should complete successfully or with proper error handling
        expect(result).toBeDefined();
        if (!result.success) {
          expect(result.errors).toBeDefined();
        }
      }
    }, 60000);
  });
});

// Helper function for expect extensions
expect.extend({
  toBeOneOf(received: any, expected: any[]) {
    const pass = expected.includes(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be one of ${expected.join(', ')}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be one of ${expected.join(', ')}`,
        pass: false,
      };
    }
  },
});

// Type declaration for custom matcher
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeOneOf(expected: any[]): R;
    }
  }
}
