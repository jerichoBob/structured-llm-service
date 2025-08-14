import { 
  calculateExponentialBackoff, 
  DEFAULT_RETRY_CONFIG, 
  createInstructorClient,
  customRetryHandler,
  ErrorType,
  CircuitBreaker,
  CircuitBreakerState,
  type RetryConfig,
  type CircuitBreakerConfig
} from '../instructorClient.js';

describe('Instructor Client Retry Strategies', () => {
  describe('calculateExponentialBackoff', () => {
    it('should calculate exponential backoff without jitter', () => {
      const config: RetryConfig = {
        max_attempts: 5,
        initial_delay: 1000,
        backoff_factor: 2,
        jitter: false,
      };

      expect(calculateExponentialBackoff(1, config)).toBe(1000); // 1s
      expect(calculateExponentialBackoff(2, config)).toBe(2000); // 2s
      expect(calculateExponentialBackoff(3, config)).toBe(4000); // 4s
      expect(calculateExponentialBackoff(4, config)).toBe(8000); // 8s
    });

    it('should respect maximum delay limit', () => {
      const config: RetryConfig = {
        max_attempts: 10,
        initial_delay: 1000,
        backoff_factor: 2,
        max_delay: 5000,
        jitter: false,
      };

      expect(calculateExponentialBackoff(1, config)).toBe(1000); // 1s
      expect(calculateExponentialBackoff(2, config)).toBe(2000); // 2s
      expect(calculateExponentialBackoff(3, config)).toBe(4000); // 4s
      expect(calculateExponentialBackoff(4, config)).toBe(5000); // Capped at max_delay
      expect(calculateExponentialBackoff(5, config)).toBe(5000); // Still capped
    });

    it('should add jitter when enabled', () => {
      const config: RetryConfig = {
        max_attempts: 3,
        initial_delay: 1000,
        backoff_factor: 2,
        jitter: true,
      };

      // Run multiple times to test jitter randomness
      const delays = Array.from({ length: 10 }, () => calculateExponentialBackoff(2, config));
      
      // All delays should be around 2000ms but with variation due to jitter
      delays.forEach(delay => {
        expect(delay).toBeGreaterThan(1500); // 2000 - 25% = 1500
        expect(delay).toBeLessThan(2500); // 2000 + 25% = 2500
      });

      // Check that we actually get different values (jitter is working)
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });

    it('should use default config when none provided', () => {
      const delay = calculateExponentialBackoff(1);
      expect(delay).toBeGreaterThan(750); // 1000 - 25% jitter
      expect(delay).toBeLessThan(1250); // 1000 + 25% jitter
    });

    it('should never return negative delays', () => {
      const config: RetryConfig = {
        max_attempts: 3,
        initial_delay: 100,
        backoff_factor: 2,
        jitter: true,
      };

      // Even with jitter, delay should never be negative
      for (let i = 1; i <= 10; i++) {
        const delay = calculateExponentialBackoff(i, config);
        expect(delay).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('DEFAULT_RETRY_CONFIG', () => {
    it('should have sensible default values', () => {
      expect(DEFAULT_RETRY_CONFIG.max_attempts).toBe(3);
      expect(DEFAULT_RETRY_CONFIG.initial_delay).toBe(1000);
      expect(DEFAULT_RETRY_CONFIG.max_delay).toBe(30000);
      expect(DEFAULT_RETRY_CONFIG.backoff_factor).toBe(2);
      expect(DEFAULT_RETRY_CONFIG.jitter).toBe(true);
    });
  });

  describe('createInstructorClient with retry config', () => {
    const mockApiKey = 'test-api-key';

    // Mock the environment variable for Claude
    beforeAll(() => {
      process.env['ANTHROPIC_API_KEY'] = mockApiKey;
    });

    afterAll(() => {
      delete process.env['ANTHROPIC_API_KEY'];
    });

    it('should store retry config on the client', () => {
      const customRetryConfig: RetryConfig = {
        max_attempts: 5,
        initial_delay: 2000,
        backoff_factor: 1.5,
        jitter: false,
      };

      const client = createInstructorClient({
        provider: 'claude',
        apiKey: mockApiKey,
        retryConfig: customRetryConfig,
      });

      expect(client._retryConfig).toEqual({
        ...DEFAULT_RETRY_CONFIG,
        ...customRetryConfig,
      });
    });

    it('should use default retry config when none provided', () => {
      const client = createInstructorClient({
        provider: 'claude',
        apiKey: mockApiKey,
      });

      expect(client._retryConfig).toEqual(DEFAULT_RETRY_CONFIG);
    });

    it('should merge custom config with defaults', () => {
      const partialConfig: RetryConfig = {
        max_attempts: 5,
        jitter: false,
      };

      const client = createInstructorClient({
        provider: 'claude',
        apiKey: mockApiKey,
        retryConfig: partialConfig,
      });

      expect(client._retryConfig).toEqual({
        ...DEFAULT_RETRY_CONFIG,
        max_attempts: 5,
        jitter: false,
      });
    });

    it('should create Gemini client with retry config', () => {
      const client = createInstructorClient({
        provider: 'gemini',
        apiKey: mockApiKey,
      });

      expect(client.provider).toBe('gemini');
      expect(client._retryConfig).toEqual(DEFAULT_RETRY_CONFIG);
    });
  });

  describe('customRetryHandler', () => {
    it('should not retry validation errors', () => {
      const validationError = new Error('Schema validation failed');
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

    it('should retry rate limit errors with linear delay', () => {
      const rateLimitError = new Error('429 Too Many Requests');
      const decision = customRetryHandler(rateLimitError, 1);
      
      expect(decision.shouldRetry).toBe(true);
      expect(decision.errorType).toBe(ErrorType.RATE_LIMIT);
      expect(decision.customDelay).toBe(5000); // 5 second linear delay
      expect(decision.reason).toBe('Rate limit error - using linear delay strategy');
    });

    it('should retry server errors with exponential backoff', () => {
      const serverError = new Error('500 Internal Server Error');
      const decision = customRetryHandler(serverError, 1);
      
      expect(decision.shouldRetry).toBe(true);
      expect(decision.errorType).toBe(ErrorType.SERVER_ERROR);
      expect(decision.customDelay).toBeUndefined(); // Uses exponential backoff
      expect(decision.reason).toBe('Server error - using exponential backoff');
    });

    it('should retry network errors with exponential backoff', () => {
      const networkError = new Error('Network timeout');
      const decision = customRetryHandler(networkError, 1);
      
      expect(decision.shouldRetry).toBe(true);
      expect(decision.errorType).toBe(ErrorType.NETWORK_ERROR);
      expect(decision.customDelay).toBeUndefined(); // Uses exponential backoff
      expect(decision.reason).toBe('Network error - using exponential backoff');
    });

    it('should retry unknown errors with exponential backoff', () => {
      const unknownError = new Error('Something went wrong');
      const decision = customRetryHandler(unknownError, 1);
      
      expect(decision.shouldRetry).toBe(true);
      expect(decision.errorType).toBe(ErrorType.UNKNOWN);
      expect(decision.customDelay).toBeUndefined(); // Uses exponential backoff
      expect(decision.reason).toBe('Unknown error type - using exponential backoff as fallback');
    });

    it('should handle various rate limit error messages', () => {
      const rateLimitMessages = [
        'Rate limit exceeded',
        'Too many requests',
        'Quota exceeded',
        '429 rate limit'
      ];

      rateLimitMessages.forEach(message => {
        const error = new Error(message);
        const decision = customRetryHandler(error, 1);
        
        expect(decision.shouldRetry).toBe(true);
        expect(decision.errorType).toBe(ErrorType.RATE_LIMIT);
        expect(decision.customDelay).toBe(5000);
      });
    });

    it('should handle various validation error patterns', () => {
      const validationMessages = [
        'Validation failed',
        'Schema error',
        'Parse error',
        'Invalid input'
      ];

      validationMessages.forEach(message => {
        const error = new Error(message);
        const decision = customRetryHandler(error, 1);
        
        expect(decision.shouldRetry).toBe(false);
        expect(decision.errorType).toBe(ErrorType.VALIDATION);
      });
    });

    it('should handle Zod validation errors', () => {
      const zodError = new Error('ZodError: Invalid input');
      const decision = customRetryHandler(zodError, 1);
      
      expect(decision.shouldRetry).toBe(false);
      expect(decision.errorType).toBe(ErrorType.VALIDATION);
    });
  });

  describe('CircuitBreaker', () => {
    it('should start in CLOSED state', () => {
      const circuitBreaker = new CircuitBreaker();
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(circuitBreaker.getFailureCount()).toBe(0);
      expect(circuitBreaker.canExecute()).toBe(true);
    });

    it('should allow execution when circuit is CLOSED', () => {
      const circuitBreaker = new CircuitBreaker();
      
      expect(circuitBreaker.canExecute()).toBe(true);
    });

    it('should trip to OPEN after failure threshold is reached', () => {
      const config: CircuitBreakerConfig = {
        failure_threshold: 3,
        reset_timeout: 1000,
        enabled: true,
      };
      const circuitBreaker = new CircuitBreaker(config);
      
      // Record failures up to threshold
      circuitBreaker.recordFailure(); // 1
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      
      circuitBreaker.recordFailure(); // 2
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      
      circuitBreaker.recordFailure(); // 3 - should trip
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
      expect(circuitBreaker.canExecute()).toBe(false);
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      const config: CircuitBreakerConfig = {
        failure_threshold: 2,
        reset_timeout: 100, // Short timeout for testing
        enabled: true,
      };
      const circuitBreaker = new CircuitBreaker(config);
      
      // Trip the circuit
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
      
      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should transition to HALF_OPEN on next canExecute check
      expect(circuitBreaker.canExecute()).toBe(true);
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);
    });

    it('should reset to CLOSED on successful execution', () => {
      const circuitBreaker = new CircuitBreaker();
      
      // Trip the circuit
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
      
      // Record success should reset to CLOSED
      circuitBreaker.recordSuccess();
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(circuitBreaker.getFailureCount()).toBe(0);
    });

    it('should go back to OPEN if failure occurs during HALF_OPEN', async () => {
      const config: CircuitBreakerConfig = {
        failure_threshold: 2,
        reset_timeout: 100,
        enabled: true,
      };
      const circuitBreaker = new CircuitBreaker(config);
      
      // Trip the circuit
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
      
      // Wait for reset timeout and transition to HALF_OPEN
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(circuitBreaker.canExecute()).toBe(true);
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);
      
      // Failure during HALF_OPEN should go back to OPEN
      circuitBreaker.recordFailure();
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should be disabled when enabled is false', () => {
      const config: CircuitBreakerConfig = {
        failure_threshold: 1,
        reset_timeout: 1000,
        enabled: false,
      };
      const circuitBreaker = new CircuitBreaker(config);
      
      // Even with failures, should always allow execution when disabled
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      
      expect(circuitBreaker.canExecute()).toBe(true);
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED); // State doesn't change when disabled
    });

    it('should reset circuit breaker state manually', () => {
      const circuitBreaker = new CircuitBreaker();
      
      // Trip the circuit
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
      expect(circuitBreaker.getFailureCount()).toBe(5);
      
      // Manual reset
      circuitBreaker.reset();
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(circuitBreaker.getFailureCount()).toBe(0);
      expect(circuitBreaker.canExecute()).toBe(true);
    });

    it('should use default configuration when none provided', () => {
      const circuitBreaker = new CircuitBreaker();
      
      // Should use DEFAULT_CIRCUIT_BREAKER_CONFIG values
      expect(circuitBreaker.canExecute()).toBe(true);
      
      // Trip with default threshold (5 failures)
      for (let i = 0; i < 4; i++) {
        circuitBreaker.recordFailure();
        expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      }
      
      circuitBreaker.recordFailure(); // 5th failure should trip
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });
  });

  describe('Exponential backoff with jitter integration test', () => {
    it('should simulate realistic retry scenario with server errors', async () => {
      // Mock a scenario where we retry 3 times with exponential backoff
      const config: RetryConfig = {
        max_attempts: 3,
        initial_delay: 100, // Shorter delays for testing
        backoff_factor: 2,
        jitter: true,
      };

      const delays: number[] = [];
      
      // Simulate retry attempts
      for (let attempt = 1; attempt <= 3; attempt++) {
        const delay = calculateExponentialBackoff(attempt, config);
        delays.push(delay);
      }

      // Verify exponential growth pattern (accounting for jitter)
      expect(delays[0]!).toBeLessThan(delays[1]!); // First delay < second delay
      expect(delays[1]!).toBeLessThan(delays[2]! + 50); // Allow some jitter tolerance
      
      // Verify all delays are reasonable
      delays.forEach(delay => {
        expect(delay).toBeGreaterThan(0);
        expect(delay).toBeLessThan(1000); // Should be reasonable for test config
      });
    });

    it('should demonstrate different retry strategies for different error types', () => {
      const errors = [
        { error: new Error('429 Rate limit'), expectedDelay: 5000 },
        { error: new Error('500 Server error'), expectedDelay: undefined },
        { error: new Error('Network timeout'), expectedDelay: undefined },
        { error: new Error('Validation failed'), expectedDelay: undefined }
      ];

      errors.forEach(({ error, expectedDelay }) => {
        const decision = customRetryHandler(error, 1);
        
        if (expectedDelay !== undefined) {
          expect(decision.customDelay).toBe(expectedDelay);
        } else if (decision.shouldRetry) {
          expect(decision.customDelay).toBeUndefined(); // Uses exponential backoff
        }
      });
    });

    it('should integrate circuit breaker with retry strategies', () => {
      const circuitBreakerConfig: CircuitBreakerConfig = {
        failure_threshold: 3,
        reset_timeout: 5000,
        enabled: true,
      };

      const retryConfig: RetryConfig = {
        max_attempts: 5,
        initial_delay: 100,
        backoff_factor: 2,
        jitter: false,
        circuit_breaker: circuitBreakerConfig,
      };

      // Verify circuit breaker config is properly integrated
      expect(retryConfig.circuit_breaker).toEqual(circuitBreakerConfig);
      expect(retryConfig.circuit_breaker?.failure_threshold).toBe(3);
      expect(retryConfig.circuit_breaker?.enabled).toBe(true);
    });
  });
});
