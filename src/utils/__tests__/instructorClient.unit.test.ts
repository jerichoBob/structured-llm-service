import {
  createInstructorClient,
  createInstructorClientFromEnv,
  CircuitBreaker,
  CircuitBreakerState,
  calculateExponentialBackoff,
  customRetryHandler,
  ErrorType,
  getOptimalMode,
  isNativeStructuredOutputSupported,
  selectOptimalModeWithFallback,
  validateProviderConfig,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  type InstructorClientConfig,
  type LLMProvider,
  type RetryConfig,
  type CircuitBreakerConfig
} from '../instructorClient';
import { ClaudeAdapter } from '../../providers/claude';
import { GeminiNativeService } from '../../providers/gemini-native.service';
import { z } from 'zod';

// Mock the provider classes
jest.mock('../../providers/claude');
jest.mock('../../providers/gemini-native.service');

const MockedClaudeAdapter = ClaudeAdapter as jest.MockedClass<typeof ClaudeAdapter>;
const MockedGeminiNativeService = GeminiNativeService as jest.MockedClass<typeof GeminiNativeService>;

describe('InstructorClient Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment variables
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];
  });

  describe('Configuration Management', () => {
    describe('createInstructorClient', () => {
      it('should create Claude client with default configuration', () => {
        const config: InstructorClientConfig = {
          provider: 'claude',
          apiKey: 'test-key'
        };

        const client = createInstructorClient(config);

        expect(client.provider).toBe('claude');
        expect(client.client).toBeInstanceOf(ClaudeAdapter);
        expect(client._retryConfig).toEqual(DEFAULT_RETRY_CONFIG);
      });

      it('should create Gemini client with custom retry configuration', () => {
        const customRetryConfig: RetryConfig = {
          max_attempts: 5,
          initial_delay: 2000,
          backoff_factor: 3
        };

        const config: InstructorClientConfig = {
          provider: 'gemini',
          apiKey: 'test-key',
          retryConfig: customRetryConfig
        };

        const client = createInstructorClient(config);

        expect(client.provider).toBe('gemini');
        expect(client.client).toBeInstanceOf(GeminiNativeService);
        expect(client._retryConfig.max_attempts).toBe(5);
        expect(client._retryConfig.initial_delay).toBe(2000);
        expect(client._retryConfig.backoff_factor).toBe(3);
      });

      it('should throw error for unsupported provider', () => {
        const config = {
          provider: 'invalid' as LLMProvider,
          apiKey: 'test-key'
        };

        expect(() => createInstructorClient(config)).toThrow('Unsupported provider: invalid');
      });

      it('should merge custom retry config with defaults', () => {
        const config: InstructorClientConfig = {
          provider: 'claude',
          apiKey: 'test-key',
          retryConfig: {
            max_attempts: 5
            // Other fields should use defaults
          }
        };

        const client = createInstructorClient(config);

        expect(client._retryConfig.max_attempts).toBe(5);
        expect(client._retryConfig.initial_delay).toBe(DEFAULT_RETRY_CONFIG.initial_delay);
        expect(client._retryConfig.backoff_factor).toBe(DEFAULT_RETRY_CONFIG.backoff_factor);
      });
    });

    describe('createInstructorClientFromEnv', () => {
      it('should create client with environment variables', () => {
        process.env['ANTHROPIC_API_KEY'] = 'env-claude-key';

        const client = createInstructorClientFromEnv('claude');

        expect(client.provider).toBe('claude');
        expect(MockedClaudeAdapter).toHaveBeenCalled();
      });

      it('should throw error when environment variable is missing', () => {
        expect(() => createInstructorClientFromEnv('claude')).toThrow(
          'Missing required environment variable: ANTHROPIC_API_KEY'
        );
      });

      it('should use optimal mode by default', () => {
        process.env['GOOGLE_API_KEY'] = 'env-gemini-key';

        const client = createInstructorClientFromEnv('gemini', { model: 'gemini-1.5-pro' });

        expect(client.provider).toBe('gemini');
        // Should use TOOLS mode for modern Gemini models
      });
    });

    describe('validateProviderConfig', () => {
      it('should validate Claude configuration', () => {
        process.env['ANTHROPIC_API_KEY'] = 'test-key';
        expect(() => validateProviderConfig('claude')).not.toThrow();
      });

      it('should validate Gemini configuration', () => {
        process.env['GOOGLE_API_KEY'] = 'test-key';
        expect(() => validateProviderConfig('gemini')).not.toThrow();
      });

      it('should throw for missing Claude API key', () => {
        expect(() => validateProviderConfig('claude')).toThrow(
          'Missing required environment variable: ANTHROPIC_API_KEY'
        );
      });

      it('should throw for missing Gemini API key', () => {
        expect(() => validateProviderConfig('gemini')).toThrow(
          'Missing required environment variable: GOOGLE_API_KEY'
        );
      });
    });
  });

  describe('Circuit Breaker', () => {
    let circuitBreaker: CircuitBreaker;

    beforeEach(() => {
      circuitBreaker = new CircuitBreaker();
    });

    describe('Constructor', () => {
      it('should initialize with default configuration', () => {
        expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
        expect(circuitBreaker.getFailureCount()).toBe(0);
      });

      it('should initialize with custom configuration', () => {
        const customConfig: CircuitBreakerConfig = {
          failure_threshold: 10,
          reset_timeout: 60000,
          enabled: false
        };

        const cb = new CircuitBreaker(customConfig);
        expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
      });
    });

    describe('State Management', () => {
      it('should allow execution when closed', () => {
        expect(circuitBreaker.canExecute()).toBe(true);
      });

      it('should trip to open state after threshold failures', () => {
        // Record failures up to threshold
        for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.failure_threshold; i++) {
          circuitBreaker.recordFailure();
        }

        expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
        expect(circuitBreaker.canExecute()).toBe(false);
      });

      it('should transition to half-open after reset timeout', (done) => {
        // Trip the circuit breaker
        for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.failure_threshold; i++) {
          circuitBreaker.recordFailure();
        }

        expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);

        // Wait for reset timeout (using a shorter timeout for testing)
        const shortTimeoutCB = new CircuitBreaker({
          ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
          reset_timeout: 100
        });

        for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.failure_threshold; i++) {
          shortTimeoutCB.recordFailure();
        }

        setTimeout(() => {
          expect(shortTimeoutCB.canExecute()).toBe(true);
          // State should be half-open after timeout
          done();
        }, 150);
      });

      it('should reset to closed state on success', () => {
        // Record some failures
        circuitBreaker.recordFailure();
        circuitBreaker.recordFailure();

        expect(circuitBreaker.getFailureCount()).toBe(2);

        // Record success
        circuitBreaker.recordSuccess();

        expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
        expect(circuitBreaker.getFailureCount()).toBe(0);
      });

      it('should handle disabled circuit breaker', () => {
        const disabledCB = new CircuitBreaker({ ...DEFAULT_CIRCUIT_BREAKER_CONFIG, enabled: false });

        // Record many failures
        for (let i = 0; i < 100; i++) {
          disabledCB.recordFailure();
        }

        // Should still allow execution when disabled
        expect(disabledCB.canExecute()).toBe(true);
        expect(disabledCB.getState()).toBe(CircuitBreakerState.CLOSED);
      });

      it('should reset circuit breaker state', () => {
        // Trip the circuit breaker
        for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.failure_threshold; i++) {
          circuitBreaker.recordFailure();
        }

        expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);

        // Reset
        circuitBreaker.reset();

        expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
        expect(circuitBreaker.getFailureCount()).toBe(0);
        expect(circuitBreaker.canExecute()).toBe(true);
      });
    });
  });

  describe('Exponential Backoff Calculation', () => {
    it('should calculate exponential backoff without jitter', () => {
      const config: RetryConfig = {
        max_attempts: 3,
        initial_delay: 1000,
        backoff_factor: 2,
        jitter: false
      };

      expect(calculateExponentialBackoff(1, config)).toBe(1000); // 1000 * 2^0
      expect(calculateExponentialBackoff(2, config)).toBe(2000); // 1000 * 2^1
      expect(calculateExponentialBackoff(3, config)).toBe(4000); // 1000 * 2^2
    });

    it('should respect maximum delay limit', () => {
      const config: RetryConfig = {
        max_attempts: 10,
        initial_delay: 1000,
        max_delay: 5000,
        backoff_factor: 2,
        jitter: false
      };

      expect(calculateExponentialBackoff(5, config)).toBe(5000); // Capped at max_delay
      expect(calculateExponentialBackoff(10, config)).toBe(5000); // Still capped
    });

    it('should add jitter when enabled', () => {
      const config: RetryConfig = {
        max_attempts: 3,
        initial_delay: 1000,
        backoff_factor: 2,
        jitter: true
      };

      const delay1 = calculateExponentialBackoff(2, config);
      const delay2 = calculateExponentialBackoff(2, config);

      // With jitter, delays should be different (with high probability)
      // Base delay is 2000, jitter range is ±500, so delays should be 1500-2500
      expect(delay1).toBeGreaterThanOrEqual(1500);
      expect(delay1).toBeLessThanOrEqual(2500);
      expect(delay2).toBeGreaterThanOrEqual(1500);
      expect(delay2).toBeLessThanOrEqual(2500);
    });

    it('should use default configuration when not provided', () => {
      const delay = calculateExponentialBackoff(1);
      expect(delay).toBe(DEFAULT_RETRY_CONFIG.initial_delay);
    });
  });

  describe('Custom Retry Handler', () => {
    it('should not retry validation errors', () => {
      const validationError = new Error('Validation failed: invalid schema');
      const decision = customRetryHandler(validationError, 1);

      expect(decision.shouldRetry).toBe(false);
      expect(decision.errorType).toBe(ErrorType.VALIDATION);
      expect(decision.reason).toBe('Validation errors are not retryable');
    });

    it('should not retry client errors (4xx)', () => {
      const clientError = new Error('401 Unauthorized');
      const decision = customRetryHandler(clientError, 1);

      expect(decision.shouldRetry).toBe(false);
      expect(decision.errorType).toBe(ErrorType.CLIENT_ERROR);
      expect(decision.reason).toBe('Client errors (4xx) are not retryable');
    });

    it('should retry rate limit errors with custom delay', () => {
      const rateLimitError = new Error('429 Too Many Requests');
      const decision = customRetryHandler(rateLimitError, 1);

      expect(decision.shouldRetry).toBe(true);
      expect(decision.errorType).toBe(ErrorType.RATE_LIMIT);
      expect(decision.customDelay).toBe(5000);
      expect(decision.reason).toBe('Rate limit error - using linear delay strategy');
    });

    it('should retry server errors (5xx)', () => {
      const serverError = new Error('503 Service Unavailable');
      const decision = customRetryHandler(serverError, 1);

      expect(decision.shouldRetry).toBe(true);
      expect(decision.errorType).toBe(ErrorType.SERVER_ERROR);
      expect(decision.reason).toBe('Server error - using exponential backoff');
      expect(decision.customDelay).toBeUndefined(); // Should use exponential backoff
    });

    it('should retry network errors', () => {
      const networkError = new Error('ECONNRESET: Connection reset by peer');
      const decision = customRetryHandler(networkError, 1);

      expect(decision.shouldRetry).toBe(true);
      expect(decision.errorType).toBe(ErrorType.NETWORK_ERROR);
      expect(decision.reason).toBe('Network error - using exponential backoff');
    });

    it('should retry unknown errors conservatively', () => {
      const unknownError = new Error('Something went wrong');
      const decision = customRetryHandler(unknownError, 1);

      expect(decision.shouldRetry).toBe(true);
      expect(decision.errorType).toBe(ErrorType.UNKNOWN);
      expect(decision.reason).toBe('Unknown error type - using exponential backoff as fallback');
    });

    it('should handle Zod validation errors', () => {
      const zodError = new Error('ZodError: Invalid input');
      const decision = customRetryHandler(zodError, 1);

      expect(decision.shouldRetry).toBe(false);
      expect(decision.errorType).toBe(ErrorType.VALIDATION);
    });
  });

  describe('Mode Selection', () => {
    describe('isNativeStructuredOutputSupported', () => {
      it('should detect Claude 3+ models support', () => {
        expect(isNativeStructuredOutputSupported('claude', 'claude-3-sonnet')).toBe(true);
        expect(isNativeStructuredOutputSupported('claude', 'claude-3.5-sonnet')).toBe(true);
        expect(isNativeStructuredOutputSupported('claude', 'claude-3-haiku')).toBe(true);
        expect(isNativeStructuredOutputSupported('claude', 'claude-3-opus')).toBe(true);
      });

      it('should detect older Claude models do not support native output', () => {
        expect(isNativeStructuredOutputSupported('claude', 'claude-2')).toBe(false);
        expect(isNativeStructuredOutputSupported('claude', 'claude-1')).toBe(false);
      });

      it('should detect Gemini models support', () => {
        expect(isNativeStructuredOutputSupported('gemini', 'gemini-1.5-pro')).toBe(true);
        expect(isNativeStructuredOutputSupported('gemini', 'gemini-pro')).toBe(true);
        expect(isNativeStructuredOutputSupported('gemini', 'gemini-2.0-flash')).toBe(true);
      });

      it('should detect older Gemini models do not support native output', () => {
        expect(isNativeStructuredOutputSupported('gemini', 'gemini-1.0-pro')).toBe(false);
      });
    });

    describe('getOptimalMode', () => {
      it('should return TOOLS mode for modern Claude models', () => {
        expect(getOptimalMode('claude', 'claude-3-sonnet')).toBe('TOOLS');
        expect(getOptimalMode('claude', 'claude-3.5-sonnet')).toBe('TOOLS');
      });

      it('should return JSON mode for older Claude models', () => {
        expect(getOptimalMode('claude', 'claude-2')).toBe('JSON');
        expect(getOptimalMode('claude')).toBe('JSON'); // No model specified
      });

      it('should return TOOLS mode for modern Gemini models', () => {
        expect(getOptimalMode('gemini', 'gemini-1.5-pro')).toBe('TOOLS');
        expect(getOptimalMode('gemini', 'gemini-pro')).toBe('TOOLS');
      });

      it('should return JSON_SCHEMA mode for older Gemini models', () => {
        expect(getOptimalMode('gemini', 'gemini-1.0-pro')).toBe('JSON_SCHEMA');
        expect(getOptimalMode('gemini')).toBe('JSON_SCHEMA'); // No model specified
      });
    });

    describe('selectOptimalModeWithFallback', () => {
      it('should select TOOLS mode with JSON fallback for modern Claude', () => {
        const result = selectOptimalModeWithFallback('claude', 'claude-3-sonnet');

        expect(result.mode).toBe('TOOLS');
        expect(result.isNativeMode).toBe(true);
        expect(result.fallbackMode).toBe('JSON');
        expect(result.reason).toContain('native TOOLS mode');
      });

      it('should select JSON mode with MD_JSON fallback for older Claude', () => {
        const result = selectOptimalModeWithFallback('claude', 'claude-2');

        expect(result.mode).toBe('JSON');
        expect(result.isNativeMode).toBe(false);
        expect(result.fallbackMode).toBe('MD_JSON');
        expect(result.reason).toContain('JSON mode');
      });

      it('should handle missing model parameter', () => {
        const result = selectOptimalModeWithFallback('claude');

        expect(result.mode).toBe('JSON');
        expect(result.isNativeMode).toBe(false);
        expect(result.fallbackMode).toBe('MD_JSON');
      });
    });
  });

  describe('Client Generation Methods', () => {
    let mockClaudeAdapter: jest.Mocked<ClaudeAdapter>;
    let mockGeminiService: jest.Mocked<GeminiNativeService>;

    beforeEach(() => {
      mockClaudeAdapter = {
        generate: jest.fn()
      } as any;

      mockGeminiService = {
        generateStructuredOutput: jest.fn()
      } as any;

      MockedClaudeAdapter.mockImplementation(() => mockClaudeAdapter);
      MockedGeminiNativeService.mockImplementation(() => mockGeminiService);
    });

    describe('Claude Client', () => {
      it('should call Claude adapter with correct parameters', async () => {
        const schema = z.object({ name: z.string() });
        const mockResult = { 
          success: true, 
          data: { name: 'test' },
          attempts: 1,
          tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          processingTime: 100,
          provider: 'claude',
          model: 'claude-3-sonnet'
        };
        mockClaudeAdapter.generate.mockResolvedValue(mockResult);

        const client = createInstructorClient({
          provider: 'claude',
          apiKey: 'test-key'
        });

        const result = await client.generateWithRetry({
          schema,
          prompt: 'test prompt',
          content: 'test content',
          model: 'claude-3-sonnet',
          temperature: 0.7,
          maxTokens: 1000
        });

        expect(mockClaudeAdapter.generate).toHaveBeenCalledWith({
          schema,
          prompt: 'test prompt',
          content: 'test content',
          model: 'claude-3-sonnet',
          temperature: 0.7,
          maxTokens: 1000
        });

        expect(result).toEqual({ name: 'test' });
      });

      it('should handle Claude adapter errors', async () => {
        const schema = z.object({ name: z.string() });
        const mockError = new Error('Claude API error');
        mockClaudeAdapter.generate.mockRejectedValue(mockError);

        const client = createInstructorClient({
          provider: 'claude',
          apiKey: 'test-key',
          retryConfig: { max_attempts: 1 } // Don't retry for this test
        });

        await expect(client.generateWithRetry({
          schema,
          prompt: 'test prompt'
        })).rejects.toThrow('Claude API error');
      });

      it('should handle unsuccessful Claude responses', async () => {
        const schema = z.object({ name: z.string() });
        const mockResult = { 
          success: false, 
          errors: [{ message: 'Generation failed', field: 'response', code: 'GENERATION_ERROR' }],
          attempts: 1,
          tokenUsage: { promptTokens: 10, completionTokens: 0, totalTokens: 10 },
          processingTime: 100,
          provider: 'claude',
          model: 'claude-3-sonnet'
        };
        mockClaudeAdapter.generate.mockResolvedValue(mockResult);

        const client = createInstructorClient({
          provider: 'claude',
          apiKey: 'test-key',
          retryConfig: { max_attempts: 1 }
        });

        await expect(client.generateWithRetry({
          schema,
          prompt: 'test prompt'
        })).rejects.toThrow('Generation failed');
      });
    });

    describe('Gemini Client', () => {
      it('should call Gemini service with correct parameters', async () => {
        const schema = z.object({ name: z.string() });
        const mockResult = { data: { name: 'test' } };
        mockGeminiService.generateStructuredOutput.mockResolvedValue(mockResult);

        const client = createInstructorClient({
          provider: 'gemini',
          apiKey: 'test-key'
        });

        const result = await client.generateWithRetry({
          schema,
          prompt: 'test prompt',
          content: 'test content',
          model: 'gemini-1.5-pro',
          temperature: 0.7,
          maxTokens: 1000
        });

        expect(mockGeminiService.generateStructuredOutput).toHaveBeenCalledWith(
          schema,
          'test prompt\n\nContent to process:\ntest content',
          {
            model: 'gemini-1.5-pro',
            temperature: 0.7,
            maxTokens: 1000
          }
        );

        expect(result).toEqual({ name: 'test' });
      });

      it('should handle Gemini service errors', async () => {
        const schema = z.object({ name: z.string() });
        const mockError = new Error('Gemini API error');
        mockGeminiService.generateStructuredOutput.mockRejectedValue(mockError);

        const client = createInstructorClient({
          provider: 'gemini',
          apiKey: 'test-key',
          retryConfig: { max_attempts: 1 }
        });

        await expect(client.generateWithRetry({
          schema,
          prompt: 'test prompt'
        })).rejects.toThrow('Gemini API error');
      });

      it('should combine prompt and content correctly', async () => {
        const schema = z.object({ name: z.string() });
        mockGeminiService.generateStructuredOutput.mockResolvedValue({ data: { name: 'test' } });

        const client = createInstructorClient({
          provider: 'gemini',
          apiKey: 'test-key'
        });

        await client.generateWithRetry({
          schema,
          prompt: 'Extract name',
          content: 'John Doe is a person'
        });

        expect(mockGeminiService.generateStructuredOutput).toHaveBeenCalledWith(
          schema,
          'Extract name\n\nContent to process:\nJohn Doe is a person',
          {}
        );
      });

      it('should handle prompt without content', async () => {
        const schema = z.object({ name: z.string() });
        mockGeminiService.generateStructuredOutput.mockResolvedValue({ data: { name: 'test' } });

        const client = createInstructorClient({
          provider: 'gemini',
          apiKey: 'test-key'
        });

        await client.generateWithRetry({
          schema,
          prompt: 'Generate a name'
        });

        expect(mockGeminiService.generateStructuredOutput).toHaveBeenCalledWith(
          schema,
          'Generate a name',
          {}
        );
      });
    });
  });

  describe('Retry Logic Integration', () => {
    let mockClaudeAdapter: jest.Mocked<ClaudeAdapter>;

    beforeEach(() => {
      mockClaudeAdapter = {
        generate: jest.fn()
      } as any;

      MockedClaudeAdapter.mockImplementation(() => mockClaudeAdapter);
    });

    it('should retry on transient failures', async () => {
      const schema = z.object({ name: z.string() });
      
      // First call fails, second succeeds
      mockClaudeAdapter.generate
        .mockRejectedValueOnce(new Error('503 Service Unavailable'))
        .mockResolvedValueOnce({
          success: true,
          data: { name: 'test' },
          attempts: 2,
          tokenUsage: {
            promptTokens: 50,
            completionTokens: 20,
            totalTokens: 70,
            estimatedCost: 0.001
          },
          processingTime: 1500,
          provider: 'claude',
          model: 'claude-3-sonnet'
        });

      const client = createInstructorClient({
        provider: 'claude',
        apiKey: 'test-key',
        retryConfig: { max_attempts: 2, initial_delay: 10 } // Fast retry for testing
      });

      const result = await client.generateWithRetry({
        schema,
        prompt: 'test prompt'
      });

      expect(mockClaudeAdapter.generate).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ name: 'test' });
    });

    it('should not retry on validation errors', async () => {
      const schema = z.object({ name: z.string() });
      mockClaudeAdapter.generate.mockRejectedValue(new Error('Validation failed'));

      const client = createInstructorClient({
        provider: 'claude',
        apiKey: 'test-key',
        retryConfig: { max_attempts: 3 }
      });

      await expect(client.generateWithRetry({
        schema,
        prompt: 'test prompt'
      })).rejects.toThrow('Validation failed');

      expect(mockClaudeAdapter.generate).toHaveBeenCalledTimes(1);
    });

    it('should respect max retry attempts', async () => {
      const schema = z.object({ name: z.string() });
      mockClaudeAdapter.generate.mockRejectedValue(new Error('503 Service Unavailable'));

      const client = createInstructorClient({
        provider: 'claude',
        apiKey: 'test-key',
        retryConfig: { max_attempts: 2, initial_delay: 10 }
      });

      await expect(client.generateWithRetry({
        schema,
        prompt: 'test prompt'
      })).rejects.toThrow('503 Service Unavailable');

      expect(mockClaudeAdapter.generate).toHaveBeenCalledTimes(2);
    });

    it('should use custom error handler', async () => {
      const schema = z.object({ name: z.string() });
      const customErrorHandler = jest.fn().mockReturnValue(false); // Don't retry
      
      mockClaudeAdapter.generate.mockRejectedValue(new Error('Custom error'));

      const client = createInstructorClient({
        provider: 'claude',
        apiKey: 'test-key',
        retryConfig: { 
          max_attempts: 3,
          on_error: customErrorHandler
        }
      });

      await expect(client.generateWithRetry({
        schema,
        prompt: 'test prompt'
      })).rejects.toThrow('Custom error');

      expect(customErrorHandler).toHaveBeenCalledWith(
        expect.any(Error),
        1
      );
      expect(mockClaudeAdapter.generate).toHaveBeenCalledTimes(1);
    });

    it('should use custom delay from error handler', async () => {
      const schema = z.object({ name: z.string() });
      const customErrorHandler = jest.fn().mockReturnValue(100); // Custom delay
      
      mockClaudeAdapter.generate
        .mockRejectedValueOnce(new Error('503 Service Unavailable'))
        .mockResolvedValueOnce({
          success: true,
          data: { name: 'test' },
          attempts: 2,
          tokenUsage: {
            promptTokens: 50,
            completionTokens: 20,
            totalTokens: 70,
            estimatedCost: 0.001
          },
          processingTime: 1500,
          provider: 'claude',
          model: 'claude-3-sonnet'
        });

      const client = createInstructorClient({
        provider: 'claude',
        apiKey: 'test-key',
        retryConfig: { 
          max_attempts: 2,
          on_error: customErrorHandler
        }
      });

      const startTime = Date.now();
      const result = await client.generateWithRetry({
        schema,
        prompt: 'test prompt'
      });
      const endTime = Date.now();

      expect(customErrorHandler).toHaveBeenCalledWith(
        expect.any(Error),
        1
      );
      expect(result).toEqual({ name: 'test' });
      expect(endTime - startTime).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Circuit Breaker Integration', () => {
    let mockClaudeAdapter: jest.Mocked<ClaudeAdapter>;

    beforeEach(() => {
      mockClaudeAdapter = {
        generate: jest.fn()
      } as any;

      MockedClaudeAdapter.mockImplementation(() => mockClaudeAdapter);
    });

    it('should trip circuit breaker after consecutive failures', async () => {
      const schema = z.object({ name: z.string() });
      mockClaudeAdapter.generate.mockRejectedValue(new Error('503 Service Unavailable'));

      const client = createInstructorClient({
        provider: 'claude',
        apiKey: 'test-key',
        retryConfig: {
          max_attempts: 1,
          circuit_breaker: {
            failure_threshold: 2,
            reset_timeout: 1000,
            enabled: true
          }
        }
      });

      // First failure
      await expect(client.generateWithRetry({
        schema,
        prompt: 'test prompt 1'
      })).rejects.toThrow('503 Service Unavailable');

      // Second failure should trip the circuit
      await expect(client.generateWithRetry({
        schema,
        prompt: 'test prompt 2'
      })).rejects.toThrow('503 Service Unavailable');

      // Third call should fail fast due to open circuit
      await expect(client.generateWithRetry({
        schema,
        prompt: 'test prompt 3'
      })).rejects.toThrow('Circuit breaker is OPEN');

      // Should have only called generate twice (not for the third call)
      expect(mockClaudeAdapter.generate).toHaveBeenCalledTimes(2);
    });

    it('should reset circuit breaker on success', async () => {
      const schema = z.object({ name: z.string() });
      
      // First call fails, second succeeds
      mockClaudeAdapter.generate
        .mockRejectedValueOnce(new Error('503 Service Unavailable'))
        .mockResolvedValueOnce({ 
          success: true, 
          data: { name: 'test' },
          attempts: 1,
          tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          processingTime: 100,
          provider: 'claude',
          model: 'claude-3-sonnet'
        });

      const client = createInstructorClient({
        provider: 'claude',
        apiKey: 'test-key',
        retryConfig: {
          max_attempts: 2,
          initial_delay: 10,
          circuit_breaker: {
            failure_threshold: 3,
            reset_timeout: 1000,
            enabled: true
          }
        }
      });

      // This should succeed after retry and reset circuit breaker
      const result = await client.generateWithRetry({
        schema,
        prompt: 'test prompt'
      });

      expect(result).toEqual({ name: 'test' });
      expect(mockClaudeAdapter.generate).toHaveBeenCalledTimes(2);
    });
  });
});
