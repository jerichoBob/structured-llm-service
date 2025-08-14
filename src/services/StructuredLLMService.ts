import {
  StructuredLLMOptions,
  StructuredLLMResult,
  StructuredLLMServiceConfig,
  TokenUsage,
} from '../interfaces/index.js';
import {
  createInstructorClientFromEnv,
  validateProviderConfig,
  selectOptimalModeWithFallback,
  type LLMProvider as InstructorLLMProvider,
} from '../utils/instructorClient.js';
import {
  formatValidationError,
  toStandardValidationErrors,
  isZodError,
} from '../utils/zodErrorFormatter.js';
import {
  calculateCostFromUsage,
  type CostCalculationResult,
} from '../utils/costCalculator.js';
import { schemaCache, createCachedSchema } from '../utils/schemaCache.js';
import { responseCache } from '../utils/responseCache.js';
import { sanitizeInput, type SanitizationResult } from '../utils/inputSanitizer.js';

/**
 * Main service class providing Pydantic-equivalent structured output functionality
 * Built as a wrapper around instructor-js for production-ready LLM integration
 */
export class StructuredLLMService {
  private config: StructuredLLMServiceConfig;
  private _instructorClients: Map<string, any> = new Map();

  constructor(config: StructuredLLMServiceConfig = {}) {
    this.config = {
      defaultProvider: 'auto',
      defaultRetryStrategy: 'exponential',
      defaultMaxRetries: 3,
      defaultTimeout: 30000,
      enableCaching: false,
      enableLogging: false,
      ...config,
    };
  }

  /**
   * Generate structured output using the configured LLM provider
   * This is the main method that provides the Pydantic-equivalent experience
   * Now includes schema caching and response caching for improved performance
   */
  async generate<T>(options: StructuredLLMOptions<T>): Promise<StructuredLLMResult<T>> {
    const startTime = Date.now();
    const mergedOptions = this.mergeWithDefaults(options);

    try {
      // Resolve the actual provider to use
      const resolvedProvider = await this.resolveProvider(mergedOptions.provider!);
      const resolvedModel = mergedOptions.model || this.getDefaultModel(resolvedProvider);
      
      // Cache the schema for improved performance
      const cachedSchema = createCachedSchema(mergedOptions.schema);
      
      // Sanitize inputs before processing
      const promptSanitization = sanitizeInput(mergedOptions.prompt, 'llm_prompt');
      const contentSanitization = mergedOptions.content 
        ? sanitizeInput(mergedOptions.content, 'llm_content')
        : null;

      // Check if sanitization rejected any inputs
      if (promptSanitization.rejected || (contentSanitization && contentSanitization.rejected)) {
        const rejectionReason = promptSanitization.rejected 
          ? promptSanitization.rejectionReason 
          : contentSanitization?.rejectionReason;
        
        throw new Error(`Input rejected for security reasons: ${rejectionReason}`);
      }

      // Use sanitized inputs
      const sanitizedPrompt = promptSanitization.sanitizedInput;
      const sanitizedContent = contentSanitization?.sanitizedInput;

      // Prepare the prompt with sanitized content if provided
      const fullPrompt = sanitizedContent 
        ? `${sanitizedPrompt}\n\nContent to process:\n${sanitizedContent}`
        : sanitizedPrompt;

      // Log sanitization results if enabled
      if (this.config.enableLogging && (promptSanitization.wasModified || (contentSanitization && contentSanitization.wasModified))) {
        console.log('Input sanitization applied:', {
          promptModified: promptSanitization.wasModified,
          promptIssues: promptSanitization.issues.length,
          contentModified: contentSanitization?.wasModified || false,
          contentIssues: contentSanitization?.issues.length || 0,
        });
      }

      // Check response cache if caching is enabled
      if (this.config.enableCaching) {
        const cacheParams = {
          prompt: fullPrompt,
          schema: cachedSchema,
          model: resolvedModel,
          provider: resolvedProvider,
          ...(mergedOptions.temperature !== undefined && { temperature: mergedOptions.temperature }),
          ...(mergedOptions.maxTokens !== undefined && { maxTokens: mergedOptions.maxTokens }),
          ...(mergedOptions.content !== undefined && { content: mergedOptions.content }),
        };

        const cachedResponse = responseCache.get<T>(cacheParams);
        if (cachedResponse) {
          if (this.config.enableLogging) {
            console.log('Cache hit - returning cached response');
          }

          // Return cached response with updated metadata
          return {
            success: true,
            data: cachedResponse,
            attempts: 1,
            tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0 },
            processingTime: Date.now() - startTime,
            provider: resolvedProvider,
            model: resolvedModel,
            rawResponse: JSON.stringify(cachedResponse),
            metadata: {
              instructorVersion: '1.7.0',
              cached: true,
              cacheHit: true,
              structuredLoggingEnabled: this.config.enableLogging || false,
              inputSanitization: {
                promptSanitized: promptSanitization.wasModified,
                promptIssues: promptSanitization.issues.length,
                contentSanitized: contentSanitization?.wasModified || false,
                contentIssues: contentSanitization?.issues.length || 0,
              },
              schemaCache: {
                enabled: true,
                stats: schemaCache.getStats(),
              },
              responseCache: {
                enabled: true,
                stats: responseCache.getStats(),
              },
            },
          };
        }

        if (this.config.enableLogging) {
          console.log('Cache miss - proceeding with LLM request');
        }
      }
      
      // Get or create instructor client for this provider with model-specific configuration
      const instructorClient = await this.getInstructorClient(resolvedProvider, resolvedModel);

      let attempts = 0;
      let lastError: Error | null = null;
      let finalResult: T | null = null;
      let finalTokenUsage: TokenUsage | null = null;
      let finalCostCalculation: CostCalculationResult | null = null;
      const maxRetries = this.getMaxAttemptsFromRetryConfig(mergedOptions.maxRetries || 3);

      // Retry loop with exponential backoff
      while (attempts < maxRetries) {
        attempts++;
        
        try {
          if (this.config.enableLogging) {
            console.log(`Attempt ${attempts}/${maxRetries} for provider ${resolvedProvider}`);
          }

          // Use instructor-js to generate structured output with cached schema
          const result = await instructorClient.chat.completions.create({
            messages: [{ role: 'user', content: fullPrompt }],
            model: resolvedModel,
            response_model: { schema: cachedSchema },
            max_retries: 1, // Handle retries at service level
            temperature: mergedOptions.temperature,
            max_tokens: mergedOptions.maxTokens,
          });

          // Extract token usage information
          const baseTokenUsage: TokenUsage = {
            promptTokens: result.usage?.prompt_tokens || 0,
            completionTokens: result.usage?.completion_tokens || 0,
            totalTokens: result.usage?.total_tokens || 0,
          };

          // Calculate precise cost using the centralized cost calculator
          const costCalculation = calculateCostFromUsage(baseTokenUsage, resolvedModel, resolvedProvider);
          
          // Enhanced token usage with precise cost calculation
          const tokenUsage: TokenUsage = {
            ...baseTokenUsage,
            estimatedCost: costCalculation.totalCost,
          };

          // Store successful result for caching
          finalResult = result as T;
          finalTokenUsage = tokenUsage;
          finalCostCalculation = costCalculation;

          // Cache the response if caching is enabled
          if (this.config.enableCaching && finalResult) {
            const cacheParams = {
              prompt: fullPrompt,
              schema: cachedSchema,
              model: resolvedModel,
              provider: resolvedProvider,
              ...(mergedOptions.temperature !== undefined && { temperature: mergedOptions.temperature }),
              ...(mergedOptions.maxTokens !== undefined && { maxTokens: mergedOptions.maxTokens }),
              ...(mergedOptions.content !== undefined && { content: mergedOptions.content }),
            };

            responseCache.set(cacheParams, finalResult);
            
            if (this.config.enableLogging) {
              console.log('Response cached for future requests');
            }
          }

          break; // Success - exit retry loop

        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          
          if (this.config.enableLogging) {
            console.warn(`Attempt ${attempts} failed:`, lastError.message);
          }

          // If this isn't the last attempt, wait before retrying
          if (attempts < maxRetries) {
            const delay = this.calculateRetryDelay(attempts, mergedOptions.retryStrategy!);
            await this.sleep(delay);
          }
        }
      }

      // Check if we have a successful result
      if (finalResult && finalTokenUsage && finalCostCalculation) {
        // Get comprehensive mode selection information
        const modeInfo = selectOptimalModeWithFallback(
          resolvedProvider as InstructorLLMProvider,
          resolvedModel
        );

        // Log structured usage and cost information
        this.logUsageAndCost({
          requestId: this.generateRequestId(),
          provider: resolvedProvider,
          model: resolvedModel,
          tokenUsage: finalTokenUsage,
          costCalculation: finalCostCalculation,
          processingTime: Date.now() - startTime,
          attempts,
          success: true,
          mode: modeInfo.mode,
          isNativeMode: modeInfo.isNativeMode,
        });

        return {
          success: true,
          data: finalResult,
          attempts,
          tokenUsage: finalTokenUsage,
          processingTime: Date.now() - startTime,
          provider: resolvedProvider,
          model: resolvedModel,
          rawResponse: JSON.stringify(finalResult),
            metadata: {
              instructorVersion: '1.7.0',
              mode: modeInfo.mode,
              isNativeMode: modeInfo.isNativeMode,
              fallbackMode: modeInfo.fallbackMode,
              modeSelectionReason: modeInfo.reason,
              autoModeSelectionEnabled: true,
              structuredLoggingEnabled: this.config.enableLogging || false,
              cached: false,
              cacheHit: false,
              inputSanitization: {
                promptSanitized: promptSanitization.wasModified,
                promptIssues: promptSanitization.issues.length,
                contentSanitized: contentSanitization?.wasModified || false,
                contentIssues: contentSanitization?.issues.length || 0,
              },
              costCalculation: {
                inputCost: finalCostCalculation.inputCost,
                outputCost: finalCostCalculation.outputCost,
                totalCost: finalCostCalculation.totalCost,
                currency: finalCostCalculation.currency,
                pricingDate: finalCostCalculation.pricingDate,
              },
              schemaCache: {
                enabled: true,
                stats: schemaCache.getStats(),
              },
              responseCache: {
                enabled: this.config.enableCaching || false,
                stats: this.config.enableCaching ? responseCache.getStats() : undefined,
              },
            },
        };
      }

      // All attempts failed - log the failure
      const errorResult = this.createErrorResult<T>(lastError || new Error('Unknown error'), startTime, mergedOptions);
      
      // Log the failed request
      this.logUsageAndCost({
        requestId: this.generateRequestId(),
        provider: resolvedProvider,
        model: resolvedModel,
        tokenUsage: errorResult.tokenUsage,
        costCalculation: {
          inputCost: 0,
          outputCost: 0,
          totalCost: 0,
          currency: 'USD',
          provider: resolvedProvider,
          model: resolvedModel,
          pricingDate: new Date().toISOString().split('T')[0] || new Date().toISOString().substring(0, 10)
        },
        processingTime: Date.now() - startTime,
        attempts,
        success: false,
        error: lastError?.message || 'Unknown error',
      });

      return errorResult;

    } catch (error) {
      const errorResult = this.createErrorResult<T>(error, startTime, mergedOptions);
      
      // Log the failed request
      this.logUsageAndCost({
        requestId: this.generateRequestId(),
        provider: mergedOptions.provider || 'auto',
        model: mergedOptions.model || 'default',
        tokenUsage: errorResult.tokenUsage,
        costCalculation: {
          inputCost: 0,
          outputCost: 0,
          totalCost: 0,
          currency: 'USD',
          provider: mergedOptions.provider || 'auto',
          model: mergedOptions.model || 'default',
          pricingDate: new Date().toISOString().split('T')[0] || new Date().toISOString().substring(0, 10)
        },
        processingTime: Date.now() - startTime,
        attempts: 1,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      return errorResult;
    }
  }


  /**
   * Get or create an instructor client for the specified provider with automatic mode selection
   */
  private async getInstructorClient(provider: string, model?: string): Promise<any> {
    const clientKey = `${provider}-${model || 'default'}`;
    
    if (this._instructorClients.has(clientKey)) {
      return this._instructorClients.get(clientKey);
    }

    try {
      // Create client with automatic mode selection enabled
      const client = await createInstructorClientFromEnv(provider as InstructorLLMProvider, {
        model: model || this.getDefaultModel(provider),
        enableAutoModeSelection: true,
        enableStructuredLogging: this.config.enableLogging || false,
      });
      
      this._instructorClients.set(clientKey, client);
      
      if (this.config.enableLogging) {
        const modeInfo = selectOptimalModeWithFallback(
          provider as InstructorLLMProvider, 
          model || this.getDefaultModel(provider)
        );
        console.log(`Initialized instructor client for provider: ${provider}, model: ${model || this.getDefaultModel(provider)}`);
        console.log(`Selected mode: ${modeInfo.mode} (native: ${modeInfo.isNativeMode}), fallback: ${modeInfo.fallbackMode}`);
        console.log(`Reason: ${modeInfo.reason}`);
      }
      
      return client;
    } catch (error) {
      throw new Error(`Failed to initialize instructor client for ${provider}: ${error}`);
    }
  }

  /**
   * Get the default model for a provider
   */
  private getDefaultModel(provider: string): string {
    const defaultModels: Record<string, string> = {
      openai: 'gpt-4-turbo',
      claude: 'claude-3-5-sonnet-20241022',
      gemini: 'gemini-1.5-pro-latest',
    };

    return defaultModels[provider] || 'default';
  }


  /**
   * Resolve the provider to use, handling 'auto' selection
   * Now supports Claude and Gemini through native integrations
   */
  private async resolveProvider(provider: string): Promise<string> {
    if (provider !== 'auto') {
      // Validate the specific provider is available
      try {
        await validateProviderConfig(provider as InstructorLLMProvider);
        return provider;
      } catch (error) {
        throw new Error(`Provider ${provider} is not available: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Auto-select: Try providers in order of preference
    const preferredProviders: InstructorLLMProvider[] = ['claude', 'gemini'];
    
    for (const testProvider of preferredProviders) {
      try {
        await validateProviderConfig(testProvider);
        return testProvider;
      } catch {
        // Continue to next provider
      }
    }

    throw new Error('No supported providers are available. Please configure API keys for Claude or Gemini.');
  }

  /**
   * Calculate retry delay based on strategy
   */
  private calculateRetryDelay(attempt: number, strategy: string): number {
    switch (strategy) {
      case 'immediate':
        return 0;
      case 'linear':
        return attempt * 1000; // 1s, 2s, 3s, etc.
      case 'exponential':
      default:
        return Math.min(1000 * Math.pow(2, attempt - 1), 30000); // 1s, 2s, 4s, 8s, max 30s
    }
  }

  /**
   * Sleep for the specified number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Extract the maximum number of attempts from retry configuration
   */
  private getMaxAttemptsFromRetryConfig(maxRetries: number | import('../interfaces/llm.interfaces.js').RetryConfig): number {
    if (typeof maxRetries === 'number') {
      return maxRetries;
    }
    return maxRetries.max_attempts;
  }

  /**
   * Merge user options with service defaults
   */
  private mergeWithDefaults<T>(options: StructuredLLMOptions<T>): StructuredLLMOptions<T> {
    return {
      ...options,
      maxRetries: options.maxRetries ?? this.config.defaultMaxRetries ?? 3,
      retryStrategy: options.retryStrategy ?? this.config.defaultRetryStrategy ?? 'exponential',
      provider: options.provider ?? this.config.defaultProvider ?? 'auto',
      timeout: options.timeout ?? this.config.defaultTimeout ?? 30000,
    };
  }


  /**
   * Create error result for failed generations with enhanced error formatting
   */
  private createErrorResult<T>(
    error: unknown,
    startTime: number,
    options: StructuredLLMOptions<T>
  ): StructuredLLMResult<T> {
    // Use enhanced error formatting for better error reporting
    const enhancedErrors = formatValidationError(error);
    const standardErrors = toStandardValidationErrors(enhancedErrors);
    
    // If it's a Zod validation error, we have detailed field-level information
    const isValidationError = isZodError(error);
    
    return {
      success: false,
      errors: standardErrors,
      attempts: 1,
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      processingTime: Date.now() - startTime,
      provider: options.provider || 'auto',
      model: options.model || 'default',
      rawResponse: error instanceof Error ? error.message : String(error),
      metadata: {
        error: true,
        isValidationError,
        enhancedErrors, // Include enhanced error details for debugging
        errorType: error?.constructor?.name || 'Unknown',
      },
    };
  }

  /**
   * Get available providers based on environment configuration
   */
  async getAvailableProviders(): Promise<string[]> {
    const allProviders: InstructorLLMProvider[] = ['claude', 'gemini'];
    const available: string[] = [];

    for (const provider of allProviders) {
      try {
        await validateProviderConfig(provider);
        available.push(provider);
      } catch {
        // Provider not available
      }
    }

    // Always include 'auto' if any providers are available
    if (available.length > 0) {
      available.push('auto');
    }

    return available;
  }

  /**
   * Check if a specific provider is available
   */
  async isProviderAvailable(provider: string): Promise<boolean> {
    if (provider === 'auto') {
      const available = await this.getAvailableProviders();
      return available.includes('auto');
    }

    try {
      await validateProviderConfig(provider as InstructorLLMProvider);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get service configuration
   */
  getConfig(): StructuredLLMServiceConfig {
    return { ...this.config };
  }

  /**
   * Update service configuration
   */
  updateConfig(newConfig: Partial<StructuredLLMServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Generate a unique request ID for tracking
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Log structured usage and cost information
   */
  private logUsageAndCost(logData: {
    requestId: string;
    provider: string;
    model: string;
    tokenUsage: TokenUsage;
    costCalculation: CostCalculationResult;
    processingTime: number;
    attempts: number;
    success: boolean;
    mode?: string;
    isNativeMode?: boolean;
    error?: string;
  }): void {
    if (!this.config.enableLogging) {
      return;
    }

    const structuredLog = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      service: 'StructuredLLMService',
      event: 'llm_request_completed',
      requestId: logData.requestId,
      provider: logData.provider,
      model: logData.model,
      success: logData.success,
      attempts: logData.attempts,
      processingTimeMs: logData.processingTime,
      tokenUsage: {
        promptTokens: logData.tokenUsage.promptTokens,
        completionTokens: logData.tokenUsage.completionTokens,
        totalTokens: logData.tokenUsage.totalTokens,
      },
      costCalculation: {
        inputCost: logData.costCalculation.inputCost,
        outputCost: logData.costCalculation.outputCost,
        totalCost: logData.costCalculation.totalCost,
        currency: logData.costCalculation.currency,
        pricingDate: logData.costCalculation.pricingDate,
      },
      metadata: {
        mode: logData.mode,
        isNativeMode: logData.isNativeMode,
        ...(logData.error && { error: logData.error }),
      },
    };

    // Output structured JSON log
    console.log(JSON.stringify(structuredLog));
  }
}

// Export a default instance for convenience
export const structuredLLM = new StructuredLLMService();

// Export the class as default
export default StructuredLLMService;
