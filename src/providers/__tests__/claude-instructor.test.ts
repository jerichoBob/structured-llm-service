import { ClaudeInstructorAdapter } from '../claude-instructor.js';
import { z } from 'zod';

// Mock the instructor-js library
jest.mock('@instructor-ai/instructor', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn()
    }
  }));
});

// Mock the Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: jest.fn()
      }
    }))
  };
});

describe('ClaudeInstructorAdapter', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should initialize successfully with valid API key', () => {
      process.env['ANTHROPIC_API_KEY'] = 'test-api-key';
      
      expect(() => new ClaudeInstructorAdapter()).not.toThrow();
    });

    it('should throw error when ANTHROPIC_API_KEY is not set', () => {
      delete process.env['ANTHROPIC_API_KEY'];
      
      expect(() => new ClaudeInstructorAdapter()).toThrow(
        'ANTHROPIC_API_KEY environment variable is required for Claude provider'
      );
    });

    it('should accept API key as constructor parameter', () => {
      delete process.env['ANTHROPIC_API_KEY'];
      
      expect(() => new ClaudeInstructorAdapter('test-key')).not.toThrow();
    });

    it('should accept baseUrl parameter', () => {
      process.env['ANTHROPIC_API_KEY'] = 'test-api-key';
      
      expect(() => new ClaudeInstructorAdapter(undefined, 'https://custom-api.example.com')).not.toThrow();
    });
  });

  describe('isAvailable', () => {
    it('should return true when API key is available', () => {
      process.env['ANTHROPIC_API_KEY'] = 'test-api-key';
      const adapter = new ClaudeInstructorAdapter();
      
      expect(adapter.isAvailable()).toBe(true);
    });

    it('should return true when API key is provided via constructor', () => {
      delete process.env['ANTHROPIC_API_KEY'];
      const adapter = new ClaudeInstructorAdapter('test-key');
      
      expect(adapter.isAvailable()).toBe(true);
    });
  });

  describe('getSupportedModels', () => {
    it('should return array of supported Claude models', () => {
      process.env['ANTHROPIC_API_KEY'] = 'test-api-key';
      const adapter = new ClaudeInstructorAdapter();
      
      const models = adapter.getSupportedModels();
      
      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
      expect(models).toContain('claude-3-5-sonnet-20241022');
      expect(models).toContain('claude-3-5-haiku-20241022');
    });
  });

  describe('name property', () => {
    it('should have correct provider name', () => {
      process.env['ANTHROPIC_API_KEY'] = 'test-api-key';
      const adapter = new ClaudeInstructorAdapter();
      
      expect(adapter.name).toBe('claude');
    });
  });

  describe('generate method', () => {
    it('should successfully generate structured output', async () => {
      process.env['ANTHROPIC_API_KEY'] = 'test-api-key';
      const adapter = new ClaudeInstructorAdapter();
      
      // Mock the instructor response
      const mockResponse = {
        name: 'John Doe',
        email: 'john@example.com',
        _raw: {
          id: 'test-id',
          usage: { input_tokens: 10, output_tokens: 5 },
          stop_reason: 'end_turn',
          stop_sequence: null
        }
      };
      
      (adapter as any).instructor.messages.create = jest.fn().mockResolvedValue(mockResponse);
      
      const schema = z.object({ 
        name: z.string(), 
        email: z.string().email() 
      });
      
      const options = {
        schema,
        prompt: 'Extract user information',
        content: 'John Doe john@example.com',
        maxRetries: 1
      };
      
      const result = await adapter.generate(options);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual(expect.objectContaining({ 
        name: 'John Doe', 
        email: 'john@example.com' 
      }));
      expect(result.provider).toBe('claude');
      expect(result.tokenUsage.promptTokens).toBe(10);
      expect(result.tokenUsage.completionTokens).toBe(5);
      expect(result.metadata?.['instructorMode']).toBe('TOOLS');
    });

    it('should handle validation errors', async () => {
      process.env['ANTHROPIC_API_KEY'] = 'test-api-key';
      const adapter = new ClaudeInstructorAdapter();
      
      // Mock validation error
      const validationError = {
        name: 'ValidationError',
        errors: [{
          path: ['email'],
          message: 'Invalid email format',
          code: 'invalid_string'
        }],
        attempts: 2
      };
      
      (adapter as any).instructor.messages.create = jest.fn().mockRejectedValue(validationError);
      
      const schema = z.object({ 
        name: z.string(), 
        email: z.string().email() 
      });
      
      const options = {
        schema,
        prompt: 'Extract user information',
        maxRetries: 2
      };
      
      const result = await adapter.generate(options);
      
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]?.field).toBe('email');
      expect(result.errors?.[0]?.message).toBe('Invalid email format');
      expect(result.attempts).toBe(2);
    });

    it('should handle API errors', async () => {
      process.env['ANTHROPIC_API_KEY'] = 'test-api-key';
      const adapter = new ClaudeInstructorAdapter();
      
      // Mock API error
      const apiError = new Error('API rate limit exceeded');
      (adapter as any).instructor.messages.create = jest.fn().mockRejectedValue(apiError);
      
      const schema = z.object({ name: z.string() });
      const options = {
        schema,
        prompt: 'Test prompt',
        maxRetries: 1
      };
      
      const result = await adapter.generate(options);
      
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]?.field).toBe('api');
      expect(result.errors?.[0]?.message).toBe('API rate limit exceeded');
    });

    it('should use default model when not specified', async () => {
      process.env['ANTHROPIC_API_KEY'] = 'test-api-key';
      const adapter = new ClaudeInstructorAdapter();
      
      const mockCreate = jest.fn().mockResolvedValue({
        test: 'data',
        _raw: {
          id: 'test-id',
          usage: { input_tokens: 5, output_tokens: 3 },
          stop_reason: 'end_turn'
        }
      });
      
      (adapter as any).instructor.messages.create = mockCreate;
      
      const schema = z.object({ test: z.string() });
      const options = { schema, prompt: 'Test' };
      
      await adapter.generate(options);
      
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-3-5-haiku-20241022'
        })
      );
    });

    it('should include content in message when provided', async () => {
      process.env['ANTHROPIC_API_KEY'] = 'test-api-key';
      const adapter = new ClaudeInstructorAdapter();
      
      const mockCreate = jest.fn().mockResolvedValue({
        test: 'data',
        _raw: {
          id: 'test-id',
          usage: { input_tokens: 5, output_tokens: 3 },
          stop_reason: 'end_turn'
        }
      });
      
      (adapter as any).instructor.messages.create = mockCreate;
      
      const schema = z.object({ test: z.string() });
      const options = { 
        schema, 
        prompt: 'Extract data', 
        content: 'Some content to process' 
      };
      
      await adapter.generate(options);
      
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { 
              role: 'user', 
              content: 'Extract data\n\nContent to process:\nSome content to process' 
            }
          ]
        })
      );
    });
  });

  describe('retry scenarios', () => {
    beforeEach(() => {
      process.env['ANTHROPIC_API_KEY'] = 'test-api-key';
    });

    it('should pass simple number retry configuration to instructor-js', async () => {
      const adapter = new ClaudeInstructorAdapter();
      const mockCreate = jest.fn().mockResolvedValue({
        test: 'data',
        _raw: {
          id: 'test-id',
          usage: { input_tokens: 5, output_tokens: 3 },
          stop_reason: 'end_turn'
        }
      });
      
      (adapter as any).instructor.messages.create = mockCreate;
      
      const schema = z.object({ test: z.string() });
      const options = { 
        schema, 
        prompt: 'Test', 
        maxRetries: 5 
      };
      
      await adapter.generate(options);
      
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_retries: expect.objectContaining({
            max_attempts: 5,
            backoff_factor: 2,
            initial_delay: 500,
            max_delay: 5000,
            jitter: true,
            on_error: expect.any(Function)
          })
        })
      );
    });

    it('should pass advanced retry configuration object to instructor-js', async () => {
      const adapter = new ClaudeInstructorAdapter();
      const mockCreate = jest.fn().mockResolvedValue({
        test: 'data',
        _raw: {
          id: 'test-id',
          usage: { input_tokens: 5, output_tokens: 3 },
          stop_reason: 'end_turn'
        }
      });
      
      (adapter as any).instructor.messages.create = mockCreate;
      
      const schema = z.object({ test: z.string() });
      const customRetryConfig = {
        max_attempts: 4,
        backoff_factor: 3,
        initial_delay: 1000,
        max_delay: 10000,
        jitter: false
      };
      
      const options = { 
        schema, 
        prompt: 'Test', 
        maxRetries: customRetryConfig
      };
      
      await adapter.generate(options);
      
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_retries: expect.objectContaining({
            max_attempts: 4,
            backoff_factor: 3,
            initial_delay: 1000,
            max_delay: 10000,
            jitter: false,
            on_error: expect.any(Function)
          })
        })
      );
    });

    it('should use default retry configuration when maxRetries is not specified', async () => {
      const adapter = new ClaudeInstructorAdapter();
      const mockCreate = jest.fn().mockResolvedValue({
        test: 'data',
        _raw: {
          id: 'test-id',
          usage: { input_tokens: 5, output_tokens: 3 },
          stop_reason: 'end_turn'
        }
      });
      
      (adapter as any).instructor.messages.create = mockCreate;
      
      const schema = z.object({ test: z.string() });
      const options = { schema, prompt: 'Test' };
      
      await adapter.generate(options);
      
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_retries: expect.objectContaining({
            max_attempts: 3,
            backoff_factor: 2,
            initial_delay: 500,
            max_delay: 5000,
            jitter: true,
            on_error: expect.any(Function)
          })
        })
      );
    });

    it('should handle retryable Anthropic errors (RateLimitError)', async () => {
      const adapter = new ClaudeInstructorAdapter();
      
      // Create a simple error with the correct name for testing
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.name = 'RateLimitError';
      
      const mockCreate = jest.fn().mockRejectedValue(rateLimitError);
      (adapter as any).instructor.messages.create = mockCreate;
      
      const schema = z.object({ test: z.string() });
      const options = { schema, prompt: 'Test', maxRetries: 2 };
      
      const result = await adapter.generate(options);
      
      // Verify the retry configuration includes our error handler
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_retries: expect.objectContaining({
            on_error: expect.any(Function)
          })
        })
      );
      
      expect(result.success).toBe(false);
      expect(result.errors?.[0]?.field).toBe('api');
    });

    it('should handle non-retryable Anthropic errors (AuthenticationError)', async () => {
      const adapter = new ClaudeInstructorAdapter();
      
      // Create a simple error with the correct name for testing
      const authError = new Error('Invalid API key');
      authError.name = 'AuthenticationError';
      
      const mockCreate = jest.fn().mockRejectedValue(authError);
      (adapter as any).instructor.messages.create = mockCreate;
      
      const schema = z.object({ test: z.string() });
      const options = { schema, prompt: 'Test', maxRetries: 2 };
      
      const result = await adapter.generate(options);
      
      expect(result.success).toBe(false);
      expect(result.errors?.[0]?.field).toBe('api');
      expect(result.errors?.[0]?.message).toBe('Invalid API key');
    });

    it('should handle network connection errors (APIConnectionError)', async () => {
      const adapter = new ClaudeInstructorAdapter();
      
      // Create a simple error with the correct name for testing
      const connectionError = new Error('Network connection failed');
      connectionError.name = 'APIConnectionError';
      
      const mockCreate = jest.fn().mockRejectedValue(connectionError);
      (adapter as any).instructor.messages.create = mockCreate;
      
      const schema = z.object({ test: z.string() });
      const options = { schema, prompt: 'Test', maxRetries: 3 };
      
      const result = await adapter.generate(options);
      
      expect(result.success).toBe(false);
      expect(result.errors?.[0]?.field).toBe('api');
      expect(result.errors?.[0]?.message).toBe('Network connection failed');
    });

    it('should handle server errors (InternalServerError)', async () => {
      const adapter = new ClaudeInstructorAdapter();
      
      // Create a simple error with the correct name for testing
      const serverError = new Error('Internal server error');
      serverError.name = 'InternalServerError';
      
      const mockCreate = jest.fn().mockRejectedValue(serverError);
      (adapter as any).instructor.messages.create = mockCreate;
      
      const schema = z.object({ test: z.string() });
      const options = { schema, prompt: 'Test', maxRetries: 2 };
      
      const result = await adapter.generate(options);
      
      expect(result.success).toBe(false);
      expect(result.errors?.[0]?.field).toBe('api');
      expect(result.errors?.[0]?.message).toBe('Internal server error');
    });

    it('should handle permission denied errors (PermissionDeniedError)', async () => {
      const adapter = new ClaudeInstructorAdapter();
      
      // Create a simple error with the correct name for testing
      const permissionError = new Error('Permission denied');
      permissionError.name = 'PermissionDeniedError';
      
      const mockCreate = jest.fn().mockRejectedValue(permissionError);
      (adapter as any).instructor.messages.create = mockCreate;
      
      const schema = z.object({ test: z.string() });
      const options = { schema, prompt: 'Test', maxRetries: 2 };
      
      const result = await adapter.generate(options);
      
      expect(result.success).toBe(false);
      expect(result.errors?.[0]?.field).toBe('api');
      expect(result.errors?.[0]?.message).toBe('Permission denied');
    });

    it('should handle bad request errors (BadRequestError)', async () => {
      const adapter = new ClaudeInstructorAdapter();
      
      // Create a simple error with the correct name for testing
      const badRequestError = new Error('Invalid request parameters');
      badRequestError.name = 'BadRequestError';
      
      const mockCreate = jest.fn().mockRejectedValue(badRequestError);
      (adapter as any).instructor.messages.create = mockCreate;
      
      const schema = z.object({ test: z.string() });
      const options = { schema, prompt: 'Test', maxRetries: 2 };
      
      const result = await adapter.generate(options);
      
      expect(result.success).toBe(false);
      expect(result.errors?.[0]?.field).toBe('api');
      expect(result.errors?.[0]?.message).toBe('Invalid request parameters');
    });

    it('should merge custom retry config with defaults', async () => {
      const adapter = new ClaudeInstructorAdapter();
      const mockCreate = jest.fn().mockResolvedValue({
        test: 'data',
        _raw: {
          id: 'test-id',
          usage: { input_tokens: 5, output_tokens: 3 },
          stop_reason: 'end_turn'
        }
      });
      
      (adapter as any).instructor.messages.create = mockCreate;
      
      const schema = z.object({ test: z.string() });
      const partialRetryConfig = {
        max_attempts: 7,
        initial_delay: 2000
        // Other properties should use defaults
      };
      
      const options = { 
        schema, 
        prompt: 'Test', 
        maxRetries: partialRetryConfig
      };
      
      await adapter.generate(options);
      
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_retries: expect.objectContaining({
            max_attempts: 7,           // Custom value
            initial_delay: 2000,       // Custom value
            backoff_factor: 2,         // Default value
            max_delay: 5000,           // Default value
            jitter: true,              // Default value
            on_error: expect.any(Function) // Default function
          })
        })
      );
    });
  });
});
