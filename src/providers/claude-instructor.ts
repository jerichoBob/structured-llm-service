import Anthropic from '@anthropic-ai/sdk';
import instructor from '@instructor-ai/instructor';
import { z } from 'zod';
import { LLMProviderAdapter, StructuredLLMOptions, StructuredLLMResult, ValidationError, RetryConfig } from '../interfaces/llm.interfaces.js';

/**
 * Decides whether to retry based on the Anthropic API error.
 * Throws the error if it's non-retryable.
 * @param error The error caught during an API call attempt.
 */
const handleAnthropicErrorForRetry = (error: Error) => {
  if (
    error instanceof Anthropic.AuthenticationError ||   // 401
    error instanceof Anthropic.PermissionDeniedError || // 403
    error instanceof Anthropic.BadRequestError         // 400
  ) {
    // Do not retry on these terminal errors
    console.error(`Non-retryable Anthropic error: ${error.name}. Aborting retries.`);
    throw error;
  }
  
  // For all other errors (RateLimitError, APIConnectionError, InternalServerError, etc.),
  // the function completes, allowing instructor-js to proceed with the next retry attempt.
  console.warn(`Retryable Anthropic error encountered: ${error.name}. Retrying...`);
};

/**
 * Claude provider adapter using instructor-js for structured LLM generation
 * This replaces the custom implementation with instructor-js built-in capabilities
 */
export class ClaudeInstructorAdapter implements LLMProviderAdapter {
  public readonly name = 'claude';
  private client: Anthropic;
  private instructor: any;
  private apiKey: string;

  /**
   * Initialize the Claude adapter with instructor-js integration
   * @throws {Error} If ANTHROPIC_API_KEY environment variable is not set
   */
  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey || process.env['ANTHROPIC_API_KEY'] || '';
    
    if (!this.apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY environment variable is required for Claude provider. ' +
        'Please set your Anthropic API key in the environment variables.'
      );
    }

    // Initialize Anthropic client
    this.client = new Anthropic({
      apiKey: this.apiKey,
      baseURL: baseUrl,
    });

    // Patch the Anthropic client with instructor functionality
    // Use "TOOLS" mode for Claude 3 models to leverage native structured output
    this.instructor = instructor({
      client: this.client,
      mode: 'TOOLS', // Uses Claude's native tool-use functionality
    });
  }

  /**
   * Generate structured output using instructor-js with Claude
   * @param options - Configuration options for structured generation
   * @returns Promise resolving to structured result
   */
  async generate<T>(options: StructuredLLMOptions<T>): Promise<StructuredLLMResult<T>> {
    const startTime = Date.now();
    const model = options.model || 'claude-3-5-haiku-20241022';

    try {
      // Construct the message content
      let content = options.prompt;
      if (options.content) {
        content += `\n\nContent to process:\n${options.content}`;
      }

      const messages = [
        { role: 'user' as const, content }
      ];

      // Configure advanced retry strategy
      const defaultRetryConfig: RetryConfig = {
        max_attempts: 3,
        backoff_factor: 2,
        initial_delay: 500, // 0.5 seconds
        max_delay: 5000,    // 5 seconds
        jitter: true,
        on_error: handleAnthropicErrorForRetry,
      };

      // Determine the final retry configuration
      let retryConfig: number | RetryConfig;
      if (typeof options.maxRetries === 'object') {
        // If a full config is passed, merge it with defaults
        retryConfig = { ...defaultRetryConfig, ...options.maxRetries };
      } else if (typeof options.maxRetries === 'number') {
        // If only a number is passed, use it for max_attempts
        retryConfig = { ...defaultRetryConfig, max_attempts: options.maxRetries };
      } else {
        // Otherwise, use the default config
        retryConfig = defaultRetryConfig;
      }

      // Use instructor-js to make the structured API call
      const response = await this.instructor.messages.create({
        model,
        messages,
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature || 0.1,
        // Pass the fully configured retry object
        max_retries: retryConfig,
        // The Zod schema is passed to response_model
        response_model: {
          schema: options.schema as z.ZodSchema<T>,
          name: options.schema.description || 'StructuredData',
        },
      });

      const processingTime = Date.now() - startTime;
      
      // Extract metadata from the raw response
      const rawResponse = (response as any)._raw as Anthropic.Messages.Message;
      const attempts = (rawResponse as any).usage?.attempts || 1;

      // Calculate token usage and cost
      const tokenUsage = {
        promptTokens: rawResponse.usage.input_tokens,
        completionTokens: rawResponse.usage.output_tokens,
        totalTokens: rawResponse.usage.input_tokens + rawResponse.usage.output_tokens,
        estimatedCost: this._calculateCost(
          rawResponse.usage.input_tokens,
          rawResponse.usage.output_tokens,
          model
        )
      };

      return {
        success: true,
        data: response,
        attempts,
        tokenUsage,
        processingTime,
        provider: this.name,
        model,
        rawResponse: JSON.stringify(rawResponse),
        metadata: {
          anthropicId: rawResponse.id,
          stopReason: rawResponse.stop_reason,
          stopSequence: rawResponse.stop_sequence,
          instructorMode: 'TOOLS'
        }
      };

    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      
      // Handle instructor-js validation errors specifically
      if (error.name === 'ValidationError' || error.constructor.name === 'ValidationError') {
        const validationErrors: ValidationError[] = [];
        
        if (error.errors && Array.isArray(error.errors)) {
          error.errors.forEach((err: any) => {
            validationErrors.push({
              field: err.path?.join('.') || 'root',
              message: err.message,
              code: err.code || 'VALIDATION_ERROR',
              value: err.received
            });
          });
        } else {
          validationErrors.push({
            field: 'schema',
            message: error.message || 'Schema validation failed',
            code: 'VALIDATION_ERROR'
          });
        }

        return {
          success: false,
          errors: validationErrors,
          attempts: error.attempts || 1,
          processingTime,
          provider: this.name,
          model,
          tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          rawResponse: error.message
        };
      }

      // Handle generic API errors
      return {
        success: false,
        errors: [{
          field: 'api',
          message: error.message || 'Unknown error occurred',
          code: 'API_ERROR',
          value: error
        }],
        attempts: error.attempts || 1,
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        processingTime,
        provider: this.name,
        model,
        rawResponse: error.stack || error.message || 'Unknown error'
      };
    }
  }

  /**
   * Check if Claude provider is available (API key is configured)
   * @returns True if API key is available
   */
  isAvailable(): boolean {
    return !!this.apiKey;
  }

  /**
   * Get supported Claude models (optimized for tool use)
   * @returns Array of supported model names
   */
  getSupportedModels(): string[] {
    return [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307'
    ];
  }

  /**
   * Calculate estimated cost based on token usage
   * @private
   */
  private _calculateCost(inputTokens: number, outputTokens: number, model: string): number {
    // Claude pricing (as of 2024) - prices per 1M tokens
    const pricing: Record<string, { input: number; output: number }> = {
      'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
      'claude-3-5-haiku-20241022': { input: 0.25, output: 1.25 },
      'claude-3-opus-20240229': { input: 15.00, output: 75.00 },
      'claude-3-sonnet-20240229': { input: 3.00, output: 15.00 },
      'claude-3-haiku-20240307': { input: 0.25, output: 1.25 }
    };
    
    const modelPricing = pricing[model] || pricing['claude-3-5-sonnet-20241022']!;
    
    const inputCost = (inputTokens / 1_000_000) * modelPricing.input;
    const outputCost = (outputTokens / 1_000_000) * modelPricing.output;
    
    return inputCost + outputCost;
  }
}
