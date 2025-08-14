import { ClaudeAdapter } from '../claude.js';
import { z } from 'zod';

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

describe('ClaudeAdapter', () => {
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
      
      expect(() => new ClaudeAdapter()).not.toThrow();
    });

    it('should throw error when ANTHROPIC_API_KEY is not set', () => {
      delete process.env['ANTHROPIC_API_KEY'];
      
      expect(() => new ClaudeAdapter()).toThrow(
        'ANTHROPIC_API_KEY environment variable is required for Claude provider'
      );
    });

    it('should throw error when ANTHROPIC_API_KEY is empty string', () => {
      process.env['ANTHROPIC_API_KEY'] = '';
      
      expect(() => new ClaudeAdapter()).toThrow(
        'ANTHROPIC_API_KEY environment variable is required for Claude provider'
      );
    });
  });

  describe('isAvailable', () => {
    it('should return true when API key is available', () => {
      process.env['ANTHROPIC_API_KEY'] = 'test-api-key';
      const adapter = new ClaudeAdapter();
      
      expect(adapter.isAvailable()).toBe(true);
    });

    it('should return false when API key is not available', () => {
      // This test requires creating an adapter with a key first, then checking availability
      process.env['ANTHROPIC_API_KEY'] = 'test-api-key';
      const adapter = new ClaudeAdapter();
      
      // Simulate the key being removed after initialization
      (adapter as any).apiKey = '';
      
      expect(adapter.isAvailable()).toBe(false);
    });
  });

  describe('getSupportedModels', () => {
    it('should return array of supported Claude models', () => {
      process.env['ANTHROPIC_API_KEY'] = 'test-api-key';
      const adapter = new ClaudeAdapter();
      
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
      const adapter = new ClaudeAdapter();
      
      expect(adapter.name).toBe('claude');
    });
  });

  describe('generate method', () => {
    it('should be defined and callable', async () => {
      process.env['ANTHROPIC_API_KEY'] = 'test-api-key';
      const adapter = new ClaudeAdapter();
      
      // Mock the Anthropic client response
      const mockCreate = jest.fn().mockResolvedValue({
        id: 'test-id',
        content: [{ type: 'text', text: '{"test": "value"}' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: 'end_turn',
        stop_sequence: null
      });
      
      (adapter as any).client.messages.create = mockCreate;
      
      const schema = z.object({ test: z.string() });
      const options = {
        schema,
        prompt: 'Test prompt',
        maxRetries: 1
      };
      
      const result = await adapter.generate(options);
      
      expect(mockCreate).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.provider).toBe('claude');
      expect(result.attempts).toBe(1);
    });
  });
});
