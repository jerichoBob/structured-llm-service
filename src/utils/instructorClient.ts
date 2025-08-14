import { ClaudeAdapter } from '../providers/claude.js';
import { GeminiNativeService } from '../providers/gemini-native.service.js';
import { getApiKey } from './secretManager.js';

/**
 * Supported LLM providers for native integration
 * Using native Claude and Gemini services instead of instructor-js
 */
export type LLMProvider = 'claude' | 'gemini';

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of consecutive failures that will trip the circuit */
  failure_threshold: number;
  /** Time in milliseconds to wait before attempting a half-open request */
  reset_timeout: number;
  /** Enable circuit breaker functionality */
  enabled: boolean;
}

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  CLOSED = 'closed',     // Normal operation
  OPEN = 'open',         // Circuit is open, failing fast
  HALF_OPEN = 'half_open' // Testing if service is back
}

/**
 * Advanced retry configuration for instructor-js
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  max_attempts: number;
  /** Initial delay in milliseconds before first retry */
  initial_delay?: number;
  /** Maximum delay in milliseconds between retries */
  max_delay?: number;
  /** Factor by which delay increases between retries (for exponential backoff) */
  backoff_factor?: number;
  /** Add random jitter to prevent thundering herd */
  jitter?: boolean;
  /** Custom retry handler function */
  on_error?: (error: Error, attempt: number) => boolean | number;
  /** Circuit breaker configuration */
  circuit_breaker?: CircuitBreakerConfig;
}

/**
 * Configuration for instructor-js client initialization
 */
export interface InstructorClientConfig {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
  mode?: 'TOOLS' | 'JSON' | 'MD_JSON' | 'JSON_SCHEMA' | 'AUTO';
  baseURL?: string;
  /** Advanced retry configuration */
  retryConfig?: RetryConfig;
  /** Enable automatic mode selection based on model capabilities */
  enableAutoModeSelection?: boolean;
  /** Enable structured logging for mode selection and performance */
  enableStructuredLogging?: boolean;
}

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failure_threshold: 5, // Trip after 5 consecutive failures
  reset_timeout: 30000, // 30 seconds before trying half-open
  enabled: true,
};

/**
 * Default retry configuration with exponential backoff and jitter
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  max_attempts: 3,
  initial_delay: 1000, // 1 second
  max_delay: 30000, // 30 seconds
  backoff_factor: 2, // Double the delay each time
  jitter: true, // Add randomness to prevent thundering herd
  circuit_breaker: DEFAULT_CIRCUIT_BREAKER_CONFIG,
};

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  /**
   * Check if a request should be allowed through the circuit breaker
   */
  canExecute(): boolean {
    if (!this.config.enabled) {
      return true;
    }

    const now = Date.now();

    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        return true;

      case CircuitBreakerState.OPEN:
        // Check if enough time has passed to try half-open
        if (now - this.lastFailureTime >= this.config.reset_timeout) {
          this.state = CircuitBreakerState.HALF_OPEN;
          return true;
        }
        return false;

      case CircuitBreakerState.HALF_OPEN:
        return true;

      default:
        return false;
    }
  }

  /**
   * Record a successful execution
   */
  recordSuccess(): void {
    if (!this.config.enabled) {
      return;
    }

    this.failureCount = 0;
    this.state = CircuitBreakerState.CLOSED;
  }

  /**
   * Record a failed execution
   */
  recordFailure(): void {
    if (!this.config.enabled) {
      return;
    }

    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // Failed during half-open, go back to open
      this.state = CircuitBreakerState.OPEN;
    } else if (this.failureCount >= this.config.failure_threshold) {
      // Exceeded failure threshold, trip the circuit
      this.state = CircuitBreakerState.OPEN;
    }
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Get current failure count
   */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Reset the circuit breaker to closed state
   */
  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }
}


/**
 * Calculate exponential backoff delay with optional jitter
 */
export function calculateExponentialBackoff(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  const { initial_delay = 1000, max_delay = 30000, backoff_factor = 2, jitter = true } = config;
  
  // Calculate base delay using exponential backoff
  let delay = initial_delay * Math.pow(backoff_factor, attempt - 1);
  
  // Apply maximum delay limit
  delay = Math.min(delay, max_delay);
  
  // Add jitter if enabled (±25% randomness)
  if (jitter) {
    const jitterRange = delay * 0.25;
    const jitterOffset = (Math.random() - 0.5) * 2 * jitterRange;
    delay = Math.max(0, delay + jitterOffset);
  }
  
  return Math.round(delay);
}

/**
 * Wrapper interface for native provider clients with retry configuration
 */
export interface NativeProviderClient {
  provider: LLMProvider;
  client: ClaudeAdapter | GeminiNativeService;
  _retryConfig: RetryConfig;
  _circuitBreaker: CircuitBreaker; // Shared circuit breaker per client instance
  
  // Method to generate structured output with retry logic
  generateWithRetry<T>(options: {
    schema: any;
    prompt: string;
    content?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<T>;
}

/**
 * Create and configure a native provider client with retry capabilities
 * Uses native Claude and Gemini services instead of instructor-js
 */
export function createInstructorClient(config: InstructorClientConfig): NativeProviderClient {
  const { provider, retryConfig } = config;
  
  // Merge with default retry configuration
  const finalRetryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };

  switch (provider) {
    case 'claude': {
      const claudeAdapter = new ClaudeAdapter();
      const circuitBreaker = new CircuitBreaker(finalRetryConfig.circuit_breaker);
      
      return {
        provider: 'claude',
        client: claudeAdapter,
        _retryConfig: finalRetryConfig,
        _circuitBreaker: circuitBreaker,
        
        async generateWithRetry<T>(options: {
          schema: any;
          prompt: string;
          content?: string;
          model?: string;
          temperature?: number;
          maxTokens?: number;
        }): Promise<T> {
          return await generateWithRetryLogic(claudeAdapter, options, finalRetryConfig, circuitBreaker);
        }
      };
    }

    case 'gemini': {
      const geminiService = new GeminiNativeService(config.apiKey);
      const circuitBreaker = new CircuitBreaker(finalRetryConfig.circuit_breaker);
      
      return {
        provider: 'gemini',
        client: geminiService,
        _retryConfig: finalRetryConfig,
        _circuitBreaker: circuitBreaker,
        
        async generateWithRetry<T>(options: {
          schema: any;
          prompt: string;
          content?: string;
          model?: string;
          temperature?: number;
          maxTokens?: number;
        }): Promise<T> {
          return await generateWithGeminiRetry(geminiService, options, finalRetryConfig, circuitBreaker);
        }
      };
    }

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

/**
 * Generic retry logic for Claude adapter with circuit breaker
 */
async function generateWithRetryLogic<T>(
  adapter: ClaudeAdapter,
  options: {
    schema: any;
    prompt: string;
    content?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  },
  retryConfig: RetryConfig,
  circuitBreaker: CircuitBreaker
): Promise<T> {
  
  // Check circuit breaker before attempting request
  if (!circuitBreaker.canExecute()) {
    throw new Error('Circuit breaker is OPEN - service is temporarily unavailable');
  }

  let attempts = 0;
  let lastError: Error | null = null;

  while (attempts < retryConfig.max_attempts) {
    attempts++;
    
    try {
      const result = await adapter.generate({
        schema: options.schema,
        prompt: options.prompt,
        ...(options.content && { content: options.content }),
        ...(options.model && { model: options.model }),
        ...(options.temperature !== undefined && { temperature: options.temperature }),
        ...(options.maxTokens && { maxTokens: options.maxTokens }),
      });

      if (result.success && result.data) {
        // Record success in circuit breaker
        circuitBreaker.recordSuccess();
        return result.data as T;
      } else {
        throw new Error(result.errors?.[0]?.message || 'Generation failed');
      }
    } catch (error) {
      lastError = error as Error;
      
      // Record failure in circuit breaker
      circuitBreaker.recordFailure();
      
      // Check if we should retry based on error type using custom handler
      if (attempts < retryConfig.max_attempts) {
        const retryDecision = customRetryHandler(error as Error, attempts);
        
        if (retryDecision.shouldRetry) {
          // Use custom delay if specified, otherwise use exponential backoff
          const delay = retryDecision.customDelay || calculateExponentialBackoff(attempts, retryConfig);
          
          // Call custom error handler if configured
          if (retryConfig.on_error) {
            const handlerResult = retryConfig.on_error(error as Error, attempts);
            if (typeof handlerResult === 'number') {
              // Handler returned custom delay
              await sleep(handlerResult);
              continue;
            } else if (handlerResult === false) {
              // Handler decided not to retry
              throw error;
            }
          }
          
          await sleep(delay);
          continue;
        }
      }
      
      throw error;
    }
  }
  
  throw lastError || new Error('Max retry attempts exceeded');
}

/**
 * Retry logic specifically for Gemini native service with circuit breaker
 */
async function generateWithGeminiRetry<T>(
  service: GeminiNativeService,
  options: {
    schema: any;
    prompt: string;
    content?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  },
  retryConfig: RetryConfig,
  circuitBreaker: CircuitBreaker
): Promise<T> {
  
  // Check circuit breaker before attempting request
  if (!circuitBreaker.canExecute()) {
    throw new Error('Circuit breaker is OPEN - service is temporarily unavailable');
  }

  let attempts = 0;
  let lastError: Error | null = null;
  
  const fullPrompt = options.content 
    ? `${options.prompt}\n\nContent to process:\n${options.content}`
    : options.prompt;

  while (attempts < retryConfig.max_attempts) {
    attempts++;
    
    try {
      const result = await service.generateStructuredOutput(
        options.schema,
        fullPrompt,
        {
          ...(options.model && { model: options.model }),
          ...(options.temperature !== undefined && { temperature: options.temperature }),
          ...(options.maxTokens && { maxTokens: options.maxTokens }),
        }
      );

      // Record success in circuit breaker
      circuitBreaker.recordSuccess();
      return result as T;
    } catch (error) {
      lastError = error as Error;
      
      // Record failure in circuit breaker
      circuitBreaker.recordFailure();
      
      // Check if we should retry based on error type using custom handler
      if (attempts < retryConfig.max_attempts) {
        const retryDecision = customRetryHandler(error as Error, attempts);
        
        if (retryDecision.shouldRetry) {
          // Use custom delay if specified, otherwise use exponential backoff
          const delay = retryDecision.customDelay || calculateExponentialBackoff(attempts, retryConfig);
          
          // Call custom error handler if configured
          if (retryConfig.on_error) {
            const handlerResult = retryConfig.on_error(error as Error, attempts);
            if (typeof handlerResult === 'number') {
              // Handler returned custom delay
              await sleep(handlerResult);
              continue;
            } else if (handlerResult === false) {
              // Handler decided not to retry
              throw error;
            }
          }
          
          await sleep(delay);
          continue;
        }
      }
      
      throw error;
    }
  }
  
  throw lastError || new Error('Max retry attempts exceeded');
}

/**
 * Error types for retry decision making
 */
export enum ErrorType {
  VALIDATION = 'validation',
  RATE_LIMIT = 'rate_limit',
  SERVER_ERROR = 'server_error',
  NETWORK_ERROR = 'network_error',
  CLIENT_ERROR = 'client_error',
  UNKNOWN = 'unknown'
}

/**
 * Retry decision result
 */
export interface RetryDecision {
  shouldRetry: boolean;
  errorType: ErrorType;
  customDelay?: number; // Custom delay in milliseconds, overrides exponential backoff
  reason: string;
}

/**
 * Custom retry handler that inspects error types and decides retry strategy
 */
export function customRetryHandler(error: Error, _attempt: number): RetryDecision {
  const message = error.message.toLowerCase();
  const errorString = error.toString().toLowerCase();
  
  // Check for validation errors (non-retryable)
  if (message.includes('validation') || 
      message.includes('schema') || 
      message.includes('parse') ||
      message.includes('invalid') ||
      errorString.includes('zod')) {
    return {
      shouldRetry: false,
      errorType: ErrorType.VALIDATION,
      reason: 'Validation errors are not retryable'
    };
  }
  
  // Check for client errors (4xx - non-retryable except rate limits)
  if (message.includes('400') || 
      message.includes('401') || 
      message.includes('403') || 
      message.includes('404') ||
      message.includes('unauthorized') ||
      message.includes('forbidden')) {
    return {
      shouldRetry: false,
      errorType: ErrorType.CLIENT_ERROR,
      reason: 'Client errors (4xx) are not retryable'
    };
  }
  
  // Check for rate limit errors (429 - retryable with linear delay)
  if (message.includes('429') || 
      message.includes('rate limit') || 
      message.includes('too many requests') ||
      message.includes('quota exceeded')) {
    return {
      shouldRetry: true,
      errorType: ErrorType.RATE_LIMIT,
      customDelay: 5000, // Fixed 5-second delay for rate limits
      reason: 'Rate limit error - using linear delay strategy'
    };
  }
  
  // Check for server errors (5xx - retryable with exponential backoff)
  if (message.includes('500') || 
      message.includes('502') || 
      message.includes('503') || 
      message.includes('504') ||
      message.includes('internal server error') ||
      message.includes('bad gateway') ||
      message.includes('service unavailable') ||
      message.includes('gateway timeout')) {
    return {
      shouldRetry: true,
      errorType: ErrorType.SERVER_ERROR,
      reason: 'Server error - using exponential backoff'
    };
  }
  
  // Check for network errors (retryable with exponential backoff)
  if (message.includes('network') || 
      message.includes('timeout') || 
      message.includes('connection') ||
      message.includes('econnreset') ||
      message.includes('enotfound') ||
      message.includes('etimedout')) {
    return {
      shouldRetry: true,
      errorType: ErrorType.NETWORK_ERROR,
      reason: 'Network error - using exponential backoff'
    };
  }
  
  // Unknown errors - be conservative and retry with exponential backoff
  return {
    shouldRetry: true,
    errorType: ErrorType.UNKNOWN,
    reason: 'Unknown error type - using exponential backoff as fallback'
  };
}


/**
 * Sleep utility function
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get the appropriate mode for a given provider and model
 * This implements intelligent mode selection based on model capabilities
 * Automatically detects native structured output support and falls back gracefully
 */
export function getOptimalMode(provider: LLMProvider, model?: string): 'TOOLS' | 'JSON' | 'MD_JSON' | 'JSON_SCHEMA' {
  // For modern models, TOOLS mode is generally the best choice
  // as it uses native function calling capabilities
  switch (provider) {
    case 'claude':
      // Claude 3+ models support native tool use (structured output)
      // Automatically use TOOLS mode for native structured output
      if (model && isNativeStructuredOutputSupported(provider, model)) {
        return 'TOOLS';
      }
      // Fallback to JSON mode for older models
      return 'JSON';
      
    case 'gemini':
      // Gemini models support both TOOLS and JSON_SCHEMA
      // TOOLS is more standardized across providers and uses native function calling
      if (model && isNativeStructuredOutputSupported(provider, model)) {
        return 'TOOLS';
      }
      // Fallback to JSON_SCHEMA for compatibility
      return 'JSON_SCHEMA';
      
    default:
      // Fallback to MD_JSON for maximum compatibility
      return 'MD_JSON';
  }
}

/**
 * Check if a specific model supports native structured output
 * This enables automatic detection and selection of the best mode
 */
export function isNativeStructuredOutputSupported(provider: LLMProvider, model: string): boolean {
  switch (provider) {
    case 'claude':
      // Claude 3+ models support native tool use
      return model.includes('claude-3') || 
             model.includes('claude-3.5') ||
             model.includes('sonnet') ||
             model.includes('haiku') ||
             model.includes('opus');
      
    case 'gemini':
      // Most Gemini models support function calling (native structured output)
      return model.includes('gemini-1.5') ||
             model.includes('gemini-pro') ||
             model.includes('gemini-2.0') ||
             !model.includes('gemini-1.0'); // Exclude very old models
      
    default:
      return false;
  }
}

/**
 * Enhanced mode selection with fallback detection
 * Automatically selects the best mode and provides fallback information
 */
export interface ModeSelectionResult {
  mode: 'TOOLS' | 'JSON' | 'MD_JSON' | 'JSON_SCHEMA';
  isNativeMode: boolean;
  fallbackMode: 'TOOLS' | 'JSON' | 'MD_JSON' | 'JSON_SCHEMA';
  reason: string;
}

export function selectOptimalModeWithFallback(
  provider: LLMProvider, 
  model?: string
): ModeSelectionResult {
  const supportsNative = model ? isNativeStructuredOutputSupported(provider, model) : false;
  const primaryMode = getOptimalMode(provider, model);
  
  let fallbackMode: 'TOOLS' | 'JSON' | 'MD_JSON' | 'JSON_SCHEMA';
  let reason: string;
  
  if (supportsNative && primaryMode === 'TOOLS') {
    fallbackMode = 'JSON';
    reason = `Using native TOOLS mode for ${provider} ${model || 'default'} with JSON fallback`;
  } else {
    fallbackMode = 'MD_JSON';
    reason = `Using ${primaryMode} mode for ${provider} ${model || 'default'} with MD_JSON fallback`;
  }
  
  return {
    mode: primaryMode,
    isNativeMode: supportsNative && primaryMode === 'TOOLS',
    fallbackMode,
    reason
  };
}

/**
 * Validate that required API keys are available for a provider
 */
export async function validateProviderConfig(provider: LLMProvider): Promise<void> {
  try {
    const apiKey = await getApiKey(provider, 'validateProviderConfig');
    if (!apiKey) {
      throw new Error(`Missing API key for provider: ${provider}`);
    }
  } catch (error) {
    throw new Error(`Failed to validate provider config for ${provider}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Create a configured instructor client with secure API key retrieval
 */
export async function createInstructorClientFromEnv(
  provider: LLMProvider,
  options: Partial<InstructorClientConfig> = {}
): Promise<NativeProviderClient> {
  await validateProviderConfig(provider);

  const apiKey = await getApiKey(provider, 'createInstructorClientFromEnv');
  if (!apiKey) {
    throw new Error(`API key not found for provider: ${provider}`);
  }

  const config: InstructorClientConfig = {
    provider,
    apiKey,
    mode: options.mode || getOptimalMode(provider, options.model),
    ...options,
  };

  return createInstructorClient(config);
}
