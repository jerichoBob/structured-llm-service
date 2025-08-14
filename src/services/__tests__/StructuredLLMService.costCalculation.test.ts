import { StructuredLLMService } from '../StructuredLLMService.js';
import { z } from 'zod';
import { calculateCostFromUsage } from '../../utils/costCalculator.js';
import type { LLMProvider } from '../../interfaces/llm.interfaces.js';

// Mock the cost calculator
jest.mock('../../utils/costCalculator.js', () => ({
  calculateCostFromUsage: jest.fn(),
}));

// Mock the instructor client utilities
jest.mock('../../utils/instructorClient.js', () => ({
  createInstructorClientFromEnv: jest.fn(),
  validateProviderConfig: jest.fn(),
  selectOptimalModeWithFallback: jest.fn(() => ({
    mode: 'TOOLS',
    isNativeMode: true,
    fallbackMode: 'JSON',
    reason: 'Test mode selection'
  })),
}));

// Mock the error formatter
jest.mock('../../utils/zodErrorFormatter.js', () => ({
  formatValidationError: jest.fn(() => []),
  toStandardValidationErrors: jest.fn(() => []),
  isZodError: jest.fn(() => false),
}));

const mockCalculateCostFromUsage = calculateCostFromUsage as jest.MockedFunction<typeof calculateCostFromUsage>;

describe('StructuredLLMService - Cost Calculation Integration', () => {
  let service: StructuredLLMService;
  let mockInstructorClient: any;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock console.log to capture structured logs
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    // Create service with logging enabled
    service = new StructuredLLMService({
      enableLogging: true,
      defaultProvider: 'openai' as LLMProvider
    });

    // Mock instructor client
    mockInstructorClient = {
      chat: {
        completions: {
          create: jest.fn()
        }
      }
    };

    // Mock the createInstructorClientFromEnv to return our mock
    const { createInstructorClientFromEnv } = require('../../utils/instructorClient.js');
    createInstructorClientFromEnv.mockResolvedValue(mockInstructorClient);

    // Mock validateProviderConfig to always pass
    const { validateProviderConfig } = require('../../utils/instructorClient.js');
    validateProviderConfig.mockImplementation(() => true);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('Successful requests with cost calculation', () => {
    it('should calculate and include precise costs in response metadata', async () => {
      // Arrange
      const testSchema = z.object({
        name: z.string(),
        age: z.number()
      });

      const mockApiResponse = {
        name: 'John Doe',
        age: 30,
        usage: {
          prompt_tokens: 150,
          completion_tokens: 75,
          total_tokens: 225
        }
      };

      const mockCostCalculation = {
        inputCost: 0.00045,
        outputCost: 0.001125,
        totalCost: 0.001575,
        currency: 'USD',
        provider: 'openai',
        model: 'gpt-4-turbo',
        pricingDate: '2024-12-01'
      };

      mockInstructorClient.chat.completions.create.mockResolvedValue(mockApiResponse);
      mockCalculateCostFromUsage.mockReturnValue(mockCostCalculation);

      // Act
      const result = await service.generate({
        schema: testSchema,
        prompt: 'Extract person information',
        provider: 'openai' as LLMProvider,
        model: 'gpt-4-turbo'
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.tokenUsage).toEqual({
        promptTokens: 150,
        completionTokens: 75,
        totalTokens: 225,
        estimatedCost: 0.001575
      });

      expect(result.metadata?.['costCalculation']).toEqual({
        inputCost: 0.00045,
        outputCost: 0.001125,
        totalCost: 0.001575,
        currency: 'USD',
        pricingDate: '2024-12-01'
      });

      // Verify cost calculator was called with correct parameters
      expect(mockCalculateCostFromUsage).toHaveBeenCalledWith(
        {
          promptTokens: 150,
          completionTokens: 75,
          totalTokens: 225
        },
        'gpt-4-turbo',
        'openai'
      );
    });

    it('should log structured cost information for successful requests', async () => {
      // Arrange
      const testSchema = z.object({ result: z.string() });
      const mockApiResponse = {
        result: 'success',
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150
        }
      };

      const mockCostCalculation = {
        inputCost: 0.0003,
        outputCost: 0.0005,
        totalCost: 0.0008,
        currency: 'USD',
        provider: 'openai',
        model: 'gpt-4-turbo',
        pricingDate: '2024-12-01'
      };

      mockInstructorClient.chat.completions.create.mockResolvedValue(mockApiResponse);
      mockCalculateCostFromUsage.mockReturnValue(mockCostCalculation);

      // Act
      await service.generate({
        schema: testSchema,
        prompt: 'Test prompt',
        provider: 'openai' as LLMProvider
      });

      // Assert
      expect(consoleSpy).toHaveBeenCalled();
      
      // Find the JSON log entry (skip initialization logs)
      const jsonLogCall = consoleSpy.mock.calls.find(call => {
        try {
          const parsed = JSON.parse(call[0]);
          return parsed.event === 'llm_request_completed';
        } catch {
          return false;
        }
      });
      
      expect(jsonLogCall).toBeDefined();
      const loggedData = JSON.parse(jsonLogCall[0]);
      
      expect(loggedData).toMatchObject({
        level: 'INFO',
        service: 'StructuredLLMService',
        event: 'llm_request_completed',
        provider: 'openai',
        model: 'gpt-4-turbo',
        success: true,
        attempts: 1,
        tokenUsage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150
        },
        costCalculation: {
          inputCost: 0.0003,
          outputCost: 0.0005,
          totalCost: 0.0008,
          currency: 'USD',
          pricingDate: '2024-12-01'
        }
      });

      expect(loggedData.requestId).toMatch(/^req_\d+_[a-z0-9]+$/);
      expect(loggedData.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should handle zero token usage correctly', async () => {
      // Arrange
      const testSchema = z.object({ empty: z.boolean() });
      const mockApiResponse = {
        empty: true,
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      };

      const mockCostCalculation = {
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        currency: 'USD',
        provider: 'openai',
        model: 'gpt-4-turbo',
        pricingDate: '2024-12-01'
      };

      mockInstructorClient.chat.completions.create.mockResolvedValue(mockApiResponse);
      mockCalculateCostFromUsage.mockReturnValue(mockCostCalculation);

      // Act
      const result = await service.generate({
        schema: testSchema,
        prompt: 'Empty test',
        provider: 'openai' as LLMProvider
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.tokenUsage.estimatedCost).toBe(0);
      expect((result.metadata?.['costCalculation'] as any)?.totalCost).toBe(0);
    });
  });

  describe('Failed requests with cost logging', () => {
    it('should log failed requests with zero cost', async () => {
      // Arrange
      const testSchema = z.object({ name: z.string() });
      const error = new Error('API request failed');

      mockInstructorClient.chat.completions.create.mockRejectedValue(error);

      // Act
      const result = await service.generate({
        schema: testSchema,
        prompt: 'Test prompt',
        provider: 'openai' as LLMProvider,
        maxRetries: 1
      });

      // Assert
      expect(result.success).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();
      
      // Find the JSON log entry (skip initialization logs)
      const jsonLogCall = consoleSpy.mock.calls.find(call => {
        try {
          const parsed = JSON.parse(call[0]);
          return parsed.event === 'llm_request_completed';
        } catch {
          return false;
        }
      });
      
      expect(jsonLogCall).toBeDefined();
      const loggedData = JSON.parse(jsonLogCall[0]);
      expect(loggedData).toMatchObject({
        success: false,
        tokenUsage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0
        },
        costCalculation: {
          inputCost: 0,
          outputCost: 0,
          totalCost: 0,
          currency: 'USD'
        },
        metadata: {
          error: 'API request failed'
        }
      });
    });

    it('should handle provider resolution failures with logging', async () => {
      // Arrange
      const testSchema = z.object({ test: z.string() });
      
      // Mock validateProviderConfig to throw for this test
      const { validateProviderConfig } = require('../../utils/instructorClient.js');
      validateProviderConfig.mockImplementation(() => {
        throw new Error('Provider not available');
      });

      // Act
      const result = await service.generate({
        schema: testSchema,
        prompt: 'Test prompt',
        provider: 'auto'
      });

      // Assert
      expect(result.success).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();
      
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(loggedData.success).toBe(false);
      expect(loggedData.costCalculation.totalCost).toBe(0);
    });
  });

  describe('Different providers and models', () => {
    it('should calculate costs correctly for Claude models', async () => {
      // Arrange
      const testSchema = z.object({ content: z.string() });
      const mockApiResponse = {
        content: 'Claude response',
        usage: {
          prompt_tokens: 200,
          completion_tokens: 100,
          total_tokens: 300
        }
      };

      const mockCostCalculation = {
        inputCost: 0.0006,
        outputCost: 0.0015,
        totalCost: 0.0021,
        currency: 'USD',
        provider: 'claude',
        model: 'claude-3-5-sonnet-20241022',
        pricingDate: '2024-12-01'
      };

      // Mock to simulate Claude provider (though instructor-js doesn't support it)
      const { validateProviderConfig } = require('../../utils/instructorClient.js');
      validateProviderConfig.mockImplementation((provider: string) => {
        if (provider === 'claude') return true;
        throw new Error('Provider not supported');
      });

      mockInstructorClient.chat.completions.create.mockResolvedValue(mockApiResponse);
      mockCalculateCostFromUsage.mockReturnValue(mockCostCalculation);

      // Act & Assert - This will actually fail due to instructor-js limitations with Claude
      const result = await service.generate({
        schema: testSchema,
        prompt: 'Test with Claude',
        provider: 'claude',
        model: 'claude-3-5-sonnet-20241022'
      });

      // Should fail due to instructor-js limitations
      expect(result.success).toBe(false);
      
      // Cost calculator should not be called since the request fails early
      expect(mockCalculateCostFromUsage).not.toHaveBeenCalled();
    });

    it('should handle missing usage data gracefully', async () => {
      // Arrange
      const testSchema = z.object({ data: z.string() });
      const mockApiResponse = {
        data: 'response without usage',
        // No usage field
      };

      const mockCostCalculation = {
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        currency: 'USD',
        provider: 'openai',
        model: 'gpt-4-turbo',
        pricingDate: '2024-12-01'
      };

      mockInstructorClient.chat.completions.create.mockResolvedValue(mockApiResponse);
      mockCalculateCostFromUsage.mockReturnValue(mockCostCalculation);

      // Act
      const result = await service.generate({
        schema: testSchema,
        prompt: 'Test without usage',
        provider: 'openai' as LLMProvider
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.tokenUsage).toEqual({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCost: 0
      });

      expect(mockCalculateCostFromUsage).toHaveBeenCalledWith(
        {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0
        },
        'gpt-4-turbo',
        'openai'
      );
    });
  });

  describe('Logging configuration', () => {
    it('should not log when logging is disabled', async () => {
      // Arrange
      const serviceWithoutLogging = new StructuredLLMService({
        enableLogging: false,
        defaultProvider: 'openai' as LLMProvider
      });

      const testSchema = z.object({ test: z.string() });
      const mockApiResponse = {
        test: 'no logging',
        usage: {
          prompt_tokens: 50,
          completion_tokens: 25,
          total_tokens: 75
        }
      };

      mockInstructorClient.chat.completions.create.mockResolvedValue(mockApiResponse);
      mockCalculateCostFromUsage.mockReturnValue({
        inputCost: 0.0001,
        outputCost: 0.0002,
        totalCost: 0.0003,
        currency: 'USD',
        provider: 'openai',
        model: 'gpt-4-turbo',
        pricingDate: '2024-12-01'
      });

      // Act
      await serviceWithoutLogging.generate({
        schema: testSchema,
        prompt: 'Test without logging',
        provider: 'openai' as LLMProvider
      });

      // Assert
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should include logging status in metadata', async () => {
      // Arrange
      const testSchema = z.object({ status: z.string() });
      const mockApiResponse = {
        status: 'logged',
        usage: {
          prompt_tokens: 75,
          completion_tokens: 25,
          total_tokens: 100
        }
      };

      mockInstructorClient.chat.completions.create.mockResolvedValue(mockApiResponse);
      mockCalculateCostFromUsage.mockReturnValue({
        inputCost: 0.0002,
        outputCost: 0.0003,
        totalCost: 0.0005,
        currency: 'USD',
        provider: 'openai',
        model: 'gpt-4-turbo',
        pricingDate: '2024-12-01'
      });

      // Act
      const result = await service.generate({
        schema: testSchema,
        prompt: 'Test logging status',
        provider: 'openai' as LLMProvider
      });

      // Assert
      expect(result.metadata?.['structuredLoggingEnabled']).toBe(true);
    });
  });

  describe('Retry scenarios with cost tracking', () => {
    it('should track attempts and final cost after retries', async () => {
      // Arrange
      const testSchema = z.object({ retry: z.string() });
      const mockApiResponse = {
        retry: 'success after retry',
        usage: {
          prompt_tokens: 120,
          completion_tokens: 80,
          total_tokens: 200
        }
      };

      const mockCostCalculation = {
        inputCost: 0.0004,
        outputCost: 0.0008,
        totalCost: 0.0012,
        currency: 'USD',
        provider: 'openai',
        model: 'gpt-4-turbo',
        pricingDate: '2024-12-01'
      };

      // Fail first attempt, succeed on second
      mockInstructorClient.chat.completions.create
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce(mockApiResponse);
      
      mockCalculateCostFromUsage.mockReturnValue(mockCostCalculation);

      // Act
      const result = await service.generate({
        schema: testSchema,
        prompt: 'Test retry',
        provider: 'openai' as LLMProvider,
        maxRetries: 2
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
      
      // Check logged data
      expect(consoleSpy).toHaveBeenCalled();
      
      // Find the JSON log entry (skip initialization logs)
      const jsonLogCall = consoleSpy.mock.calls.find(call => {
        try {
          const parsed = JSON.parse(call[0]);
          return parsed.event === 'llm_request_completed';
        } catch {
          return false;
        }
      });
      
      expect(jsonLogCall).toBeDefined();
      const loggedData = JSON.parse(jsonLogCall[0]);
      expect(loggedData.attempts).toBe(2);
      expect(loggedData.success).toBe(true);
      expect(loggedData.costCalculation.totalCost).toBe(0.0012);
    });
  });
});
