import Anthropic from '@anthropic-ai/sdk';
import { LLMProviderAdapter, StructuredLLMOptions, StructuredLLMResult, ValidationError } from '../interfaces/llm.interfaces.js';

/**
 * Claude provider adapter for structured LLM generation
 * Implements the LLMProviderAdapter interface for Anthropic's Claude models
 */
export class ClaudeAdapter implements LLMProviderAdapter {
  public readonly name = 'claude';
  private client: Anthropic;
  private apiKey: string;

  /**
   * Initialize the Claude adapter with API key from environment
   * @throws {Error} If ANTHROPIC_API_KEY environment variable is not set
   */
  constructor() {
    this.apiKey = process.env['ANTHROPIC_API_KEY'] || '';
    
    if (!this.apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY environment variable is required for Claude provider. ' +
        'Please set your Anthropic API key in the environment variables.'
      );
    }

    this.client = new Anthropic({
      apiKey: this.apiKey,
    });
  }

  /**
   * Generate structured output using Claude
   * @param options - Configuration options for structured generation
   * @returns Promise resolving to structured result
   */
  async generate<T>(options: StructuredLLMOptions<T>): Promise<StructuredLLMResult<T>> {
    const startTime = Date.now();
    let attempts = 0;
    let lastError: Error | null = null;

    // Default model for Claude
    const model = options.model || 'claude-3-5-sonnet-20241022';
    
    const maxRetries = typeof options.maxRetries === 'number' ? options.maxRetries : (options.maxRetries?.max_attempts || 3);
    
    while (attempts < maxRetries) {
      attempts++;
      
      try {
        // Build the prompt with schema instructions
        const fullPrompt = this._buildPrompt(options.prompt, options.content, options.schema);
        
        // Make API request to Claude
        const response = await this.client.messages.create({
          model,
          max_tokens: options.maxTokens || 4096,
          temperature: options.temperature || 0.1,
          messages: [
            {
              role: 'user',
              content: fullPrompt
            }
          ]
        });

        // Extract and parse JSON from response
        const textContent = response.content
          .filter(block => block.type === 'text')
          .map(block => (block as any).text)
          .join('');

        const { data, errors } = this._parseAndValidateResponse(textContent, options.schema);
        
        const processingTime = Date.now() - startTime;
        
        // Calculate token usage
        const tokenUsage = {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
          estimatedCost: this._calculateCost(response.usage.input_tokens, response.usage.output_tokens, model)
        };

        if (errors.length === 0) {
          return {
            success: true,
            data: data as T,
            attempts,
            tokenUsage,
            processingTime,
            provider: this.name,
            model,
            rawResponse: textContent,
            metadata: {
              anthropicId: response.id,
              stopReason: response.stop_reason,
              stopSequence: response.stop_sequence
            }
          };
        } else {
          return {
            success: false,
            errors,
            attempts,
            tokenUsage,
            processingTime,
            provider: this.name,
            model,
            rawResponse: textContent,
            metadata: {
              anthropicId: response.id,
              stopReason: response.stop_reason,
              stopSequence: response.stop_sequence
            }
          };
        }

      } catch (error) {
        lastError = error as Error;
        
        // If this is the last attempt, return error result
        if (attempts >= maxRetries) {
          break;
        }
        
        // Apply retry strategy delay
        await this._applyRetryDelay(attempts, options.retryStrategy || 'exponential');
      }
    }

    // Return error result
    const processingTime = Date.now() - startTime;
    return {
      success: false,
      errors: [{
        field: 'api',
        message: lastError?.message || 'Unknown error occurred',
        code: 'API_ERROR',
        value: lastError
      }],
      attempts,
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      processingTime,
      provider: this.name,
      model: options.model || 'claude-3-5-sonnet-20241022',
      rawResponse: lastError?.message || 'Unknown error'
    };
  }

  /**
   * Check if Claude provider is available (API key is configured)
   * @returns True if API key is available
   */
  isAvailable(): boolean {
    return !!this.apiKey;
  }

  /**
   * Get supported Claude models
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
   * Build the full prompt with schema instructions
   * @private
   */
  private _buildPrompt(userPrompt: string, content?: string, schema?: any): string {
    let prompt = userPrompt;
    
    if (content) {
      prompt += `\n\nContent to process:\n${content}`;
    }
    
    if (schema) {
      // Convert Zod schema to JSON schema for prompt
      const schemaDescription = this._describeSchema(schema);
      prompt += `\n\nPlease respond with a valid JSON object that matches this schema:\n${schemaDescription}`;
      prompt += '\n\nIMPORTANT: Respond only with the JSON object, no additional text or formatting.';
    }
    
    return prompt;
  }

  /**
   * Parse and validate the response against the schema
   * @private
   */
  private _parseAndValidateResponse<T>(response: string, schema: any): { data?: T; errors: ValidationError[] } {
    const errors: ValidationError[] = [];
    
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : response.trim();
      
      const parsedData = JSON.parse(jsonString);
      
      // Validate against Zod schema
      const result = schema.safeParse(parsedData);
      
      if (result.success) {
        return { data: result.data, errors: [] };
      } else {
        // Convert Zod errors to our format
        result.error.errors.forEach((err: any) => {
          errors.push({
            field: err.path.join('.') || 'root',
            message: err.message,
            code: err.code,
            value: err.received
          });
        });
      }
    } catch (parseError) {
      errors.push({
        field: 'response',
        message: `Failed to parse JSON response: ${(parseError as Error).message}`,
        code: 'PARSE_ERROR',
        value: response
      });
    }
    
    return { errors };
  }

  /**
   * Apply retry delay based on strategy
   * @private
   */
  private async _applyRetryDelay(attempt: number, strategy: string): Promise<void> {
    let delay = 0;
    
    switch (strategy) {
      case 'immediate':
        delay = 0;
        break;
      case 'linear':
        delay = attempt * 1000; // 1s, 2s, 3s...
        break;
      case 'exponential':
      default:
        delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s, 8s...
        break;
    }
    
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
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

  /**
   * Describe Zod schema for prompt inclusion
   * @private
   */
  private _describeSchema(schema: any): string {
    // This is a simplified schema description
    // In a full implementation, you'd want more sophisticated schema introspection
    try {
      // Try to get schema description if available
      if (schema._def?.description) {
        return schema._def.description;
      }
      
      // Basic schema type detection
      const schemaType = schema._def?.typeName || 'unknown';
      return `Expected type: ${schemaType}`;
    } catch {
      return 'Valid JSON object matching the expected structure';
    }
  }
}
