import { z } from 'zod';

/**
 * Token usage information for tracking API consumption and costs
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost?: number;
}

/**
 * Validation error details for structured output validation
 */
export interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: unknown;
}

/**
 * Retry strategy options for handling failed requests
 */
export type RetryStrategy = 'immediate' | 'exponential' | 'linear';

/**
 * Advanced retry configuration for instructor-js
 */
export interface RetryConfig {
  /** Maximum number of attempts to make */
  max_attempts: number;
  /** Factor by which delay increases between retries (for exponential backoff) */
  backoff_factor?: number;
  /** Initial delay in milliseconds before first retry */
  initial_delay?: number;
  /** Maximum delay in milliseconds between retries */
  max_delay?: number;
  /** Add random jitter to prevent thundering herd */
  jitter?: boolean;
  /** Callback to determine if error should trigger retry */
  on_error?: (error: Error) => void | Promise<void>;
}

/**
 * Supported LLM providers
 */
export type LLMProvider = 'claude' | 'gemini' | 'auto';

/**
 * Configuration options for structured LLM generation
 * Provides Pydantic-equivalent experience for TypeScript
 */
export interface StructuredLLMOptions<T = unknown> {
  /** Zod schema defining the expected output structure */
  schema: z.ZodSchema<T>;
  
  /** Main prompt/instruction for the LLM */
  prompt: string;
  
  /** Optional content/context to process */
  content?: string;
  
  /** Specific model to use (provider-specific) */
  model?: string;
  
  /** Maximum number of retry attempts or advanced retry configuration (default: 3) */
  maxRetries?: number | RetryConfig;
  
  /** Strategy for handling retries (default: 'exponential') */
  retryStrategy?: RetryStrategy;
  
  /** Temperature for response generation (0.0 - 1.0) */
  temperature?: number;
  
  /** Maximum tokens in the response */
  maxTokens?: number;
  
  /** LLM provider to use (default: 'auto') */
  provider?: LLMProvider;
  
  /** Request timeout in milliseconds */
  timeout?: number;
  
  /** Additional provider-specific options */
  providerOptions?: Record<string, unknown>;
}

/**
 * Result of structured LLM generation with comprehensive metadata
 * Includes validation results, performance metrics, and error details
 */
export interface StructuredLLMResult<T = unknown> {
  /** Whether the generation and validation succeeded */
  success: boolean;
  
  /** Validated and typed data (only present if success is true) */
  data?: T;
  
  /** Validation errors (only present if validation failed) */
  errors?: ValidationError[];
  
  /** Number of attempts made (including successful one) */
  attempts: number;
  
  /** Token usage information for cost tracking */
  tokenUsage: TokenUsage;
  
  /** Total processing time in milliseconds */
  processingTime: number;
  
  /** Provider that was used for generation */
  provider: string;
  
  /** Specific model that was used */
  model: string;
  
  /** Raw response from the LLM (for debugging) */
  rawResponse?: string;
  
  /** Additional metadata from the provider */
  metadata?: Record<string, unknown>;
}

/**
 * Configuration for the StructuredLLMService
 */
export interface StructuredLLMServiceConfig {
  /** Default provider to use when not specified */
  defaultProvider?: LLMProvider;
  
  /** Default retry strategy */
  defaultRetryStrategy?: RetryStrategy;
  
  /** Default maximum retries */
  defaultMaxRetries?: number;
  
  /** Default timeout in milliseconds */
  defaultTimeout?: number;
  
  /** Enable response caching */
  enableCaching?: boolean;
  
  /** Enable detailed logging */
  enableLogging?: boolean;
  
  /** Provider-specific configurations */
  providerConfigs?: {
    claude?: {
      apiKey?: string;
      baseUrl?: string;
      defaultModel?: string;
    };
    gemini?: {
      apiKey?: string;
      baseUrl?: string;
      defaultModel?: string;
    };
  };
}

/**
 * Internal provider interface for implementing different LLM providers
 */
export interface LLMProviderAdapter {
  /** Provider name */
  name: string;
  
  /** Generate structured output using this provider */
  generate<T>(options: StructuredLLMOptions<T>): Promise<StructuredLLMResult<T>>;
  
  /** Check if this provider is available/configured */
  isAvailable(): boolean;
  
  /** Get supported models for this provider */
  getSupportedModels(): string[];
}
