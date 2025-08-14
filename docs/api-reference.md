# API Reference

Complete documentation for the Structured LLM Service API, including all classes, methods, interfaces, and configuration options.

## Table of Contents

- [StructuredLLMService Class](#structuredllmservice-class)
- [Interfaces](#interfaces)
- [Type Definitions](#type-definitions)
- [Error Handling](#error-handling)
- [Utility Functions](#utility-functions)

## StructuredLLMService Class

The main service class that provides structured output functionality.

### Constructor

```typescript
new StructuredLLMService(config?: StructuredLLMServiceConfig)
```

Creates a new instance of the Structured LLM Service.

**Parameters:**
- `config` (optional): Configuration object for the service

**Example:**
```typescript
const service = new StructuredLLMService({
  defaultProvider: 'auto',
  enableCaching: true,
  enableLogging: true,
});
```

### Methods

#### generate<T>(options: StructuredLLMOptions<T>): Promise<StructuredLLMResult<T>>

The main method for generating structured output from LLMs.

**Type Parameters:**
- `T`: The expected return type, inferred from the Zod schema

**Parameters:**
- `options`: Configuration options for the generation request

**Returns:**
- `Promise<StructuredLLMResult<T>>`: Result object containing the generated data or errors

**Example:**
```typescript
const result = await service.generate({
  schema: z.object({ name: z.string(), age: z.number() }),
  prompt: "Extract person info: John is 25 years old",
  provider: 'openai',
  model: 'gpt-4-turbo',
  temperature: 0.1,
  maxTokens: 1000,
});
```

#### getAvailableProviders(): string[]

Returns a list of available LLM providers based on environment configuration.

**Returns:**
- `string[]`: Array of available provider names

**Example:**
```typescript
const providers = service.getAvailableProviders();
console.log(providers); // ['openai', 'auto']
```

#### isProviderAvailable(provider: string): boolean

Checks if a specific provider is available and properly configured.

**Parameters:**
- `provider`: The provider name to check

**Returns:**
- `boolean`: True if the provider is available

**Example:**
```typescript
if (service.isProviderAvailable('openai')) {
  // Use OpenAI provider
}
```

#### getConfig(): StructuredLLMServiceConfig

Returns the current service configuration.

**Returns:**
- `StructuredLLMServiceConfig`: Copy of the current configuration

**Example:**
```typescript
const config = service.getConfig();
console.log(config.defaultProvider); // 'auto'
```

#### updateConfig(newConfig: Partial<StructuredLLMServiceConfig>): void

Updates the service configuration with new values.

**Parameters:**
- `newConfig`: Partial configuration object with values to update

**Example:**
```typescript
service.updateConfig({
  enableCaching: false,
  defaultMaxRetries: 5,
});
```

## Interfaces

### StructuredLLMOptions<T>

Configuration options for structured LLM generation.

```typescript
interface StructuredLLMOptions<T = unknown> {
  schema: z.ZodSchema<T>;           // Zod schema defining expected output
  prompt: string;                   // Main instruction for the LLM
  content?: string;                 // Optional content to process
  model?: string;                   // Specific model to use
  maxRetries?: number | RetryConfig; // Retry configuration
  retryStrategy?: RetryStrategy;    // Retry strategy type
  temperature?: number;             // Response randomness (0.0-1.0)
  maxTokens?: number;              // Maximum response tokens
  provider?: LLMProvider;          // LLM provider to use
  timeout?: number;                // Request timeout in milliseconds
  providerOptions?: Record<string, unknown>; // Provider-specific options
}
```

**Field Details:**

- **schema**: Zod schema that defines the structure and validation rules for the expected output
- **prompt**: The main instruction or question for the LLM
- **content**: Optional additional content or context to process
- **model**: Specific model name (e.g., 'gpt-4-turbo', 'claude-3-5-sonnet-20241022')
- **maxRetries**: Number of retry attempts or advanced retry configuration
- **retryStrategy**: How to handle retries ('immediate', 'linear', 'exponential')
- **temperature**: Controls randomness in responses (0.0 = deterministic, 1.0 = very random)
- **maxTokens**: Maximum number of tokens in the response
- **provider**: Which LLM provider to use ('auto', 'openai', 'claude', 'gemini')
- **timeout**: Request timeout in milliseconds
- **providerOptions**: Additional provider-specific configuration

### StructuredLLMResult<T>

Result object returned by the generate method.

```typescript
interface StructuredLLMResult<T = unknown> {
  success: boolean;                 // Whether generation succeeded
  data?: T;                        // Validated data (if successful)
  errors?: ValidationError[];      // Validation errors (if failed)
  attempts: number;                // Number of attempts made
  tokenUsage: TokenUsage;          // Token consumption information
  processingTime: number;          // Total processing time in ms
  provider: string;                // Provider used
  model: string;                   // Model used
  rawResponse?: string;            // Raw LLM response
  metadata?: Record<string, unknown>; // Additional metadata
}
```

**Field Details:**

- **success**: Boolean indicating if the generation and validation succeeded
- **data**: The validated and typed result data (only present when success is true)
- **errors**: Array of validation errors with field-level details (only present when validation fails)
- **attempts**: Total number of retry attempts made (including the successful one)
- **tokenUsage**: Detailed token consumption and cost information
- **processingTime**: Total time taken for the request in milliseconds
- **provider**: The actual provider used (resolved from 'auto' if applicable)
- **model**: The specific model that processed the request
- **rawResponse**: The raw response from the LLM for debugging purposes
- **metadata**: Additional information including caching status, mode selection, and cost breakdown

### StructuredLLMServiceConfig

Configuration object for the service.

```typescript
interface StructuredLLMServiceConfig {
  defaultProvider?: LLMProvider;     // Default provider ('auto', 'openai', etc.)
  defaultRetryStrategy?: RetryStrategy; // Default retry strategy
  defaultMaxRetries?: number;        // Default maximum retry attempts
  defaultTimeout?: number;           // Default timeout in milliseconds
  enableCaching?: boolean;           // Enable response caching
  enableLogging?: boolean;           // Enable structured logging
  providerConfigs?: {               // Provider-specific configurations
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
```

### TokenUsage

Information about token consumption and costs.

```typescript
interface TokenUsage {
  promptTokens: number;      // Tokens used in the prompt
  completionTokens: number;  // Tokens used in the response
  totalTokens: number;       // Total tokens used
  estimatedCost?: number;    // Estimated cost in USD
}
```

### ValidationError

Detailed information about validation errors.

```typescript
interface ValidationError {
  field: string;    // Field name that failed validation
  message: string;  // Human-readable error message
  code: string;     // Error code for programmatic handling
  value?: unknown;  // The actual value that failed validation
}
```

### RetryConfig

Advanced retry configuration options.

```typescript
interface RetryConfig {
  max_attempts: number;        // Maximum number of attempts
  backoff_factor?: number;     // Exponential backoff multiplier
  initial_delay?: number;      // Initial delay in milliseconds
  max_delay?: number;         // Maximum delay between retries
  jitter?: boolean;           // Add random jitter to delays
  on_error?: (error: Error) => void | Promise<void>; // Error callback
}
```

## Type Definitions

### LLMProvider

```typescript
type LLMProvider = 'claude' | 'gemini' | 'auto';
```

Supported LLM providers. Note that 'auto' will automatically select the best available provider.

### RetryStrategy

```typescript
type RetryStrategy = 'immediate' | 'exponential' | 'linear';
```

Available retry strategies:
- **immediate**: Retry immediately without delay
- **exponential**: Exponential backoff (1s, 2s, 4s, 8s, ...)
- **linear**: Linear backoff (1s, 2s, 3s, 4s, ...)

## Error Handling

The service provides comprehensive error handling with detailed validation errors.

### Validation Errors

When the LLM output doesn't match the expected schema:

```typescript
const result = await service.generate({
  schema: z.object({
    age: z.number(),
    email: z.string().email(),
  }),
  prompt: "Extract: John is twenty-five, email: invalid-email",
});

if (!result.success) {
  result.errors?.forEach(error => {
    console.log(`${error.field}: ${error.message}`);
    // Output:
    // age: Expected number, received string
    // email: Invalid email format
  });
}
```

### Service Errors

For configuration or provider errors:

```typescript
try {
  const result = await service.generate(options);
} catch (error) {
  if (error.message.includes('API key')) {
    // Handle missing API key
  } else if (error.message.includes('timeout')) {
    // Handle timeout
  }
}
```

### Error Metadata

Additional error context is available in the metadata:

```typescript
if (!result.success && result.metadata?.error) {
  console.log('Error type:', result.metadata.errorType);
  console.log('Is validation error:', result.metadata.isValidationError);
  console.log('Enhanced errors:', result.metadata.enhancedErrors);
}
```

## Utility Functions

### Default Instance

A default service instance is exported for convenience:

```typescript
import { structuredLLM } from 'structured-llm-service';

const result = await structuredLLM.generate({
  schema: MySchema,
  prompt: "Extract data...",
});
```

### Schema Caching

The service automatically caches Zod schemas for improved performance:

```typescript
// Schema is cached automatically on first use
const result1 = await service.generate({ schema: PersonSchema, prompt: "..." });
const result2 = await service.generate({ schema: PersonSchema, prompt: "..." }); // Uses cached schema
```

### Response Caching

Enable response caching to reduce API calls for identical requests:

```typescript
const service = new StructuredLLMService({
  enableCaching: true,
});

// First call hits the API
const result1 = await service.generate({ schema: PersonSchema, prompt: "Extract: John, 25" });

// Second identical call returns cached result
const result2 = await service.generate({ schema: PersonSchema, prompt: "Extract: John, 25" });
console.log(result2.metadata?.cached); // true
```

## Advanced Configuration

### Custom Retry Logic

```typescript
const result = await service.generate({
  schema: MySchema,
  prompt: "Extract data...",
  maxRetries: {
    max_attempts: 5,
    backoff_factor: 2,
    initial_delay: 1000,
    max_delay: 30000,
    jitter: true,
    on_error: (error) => console.log('Retry due to:', error.message),
  },
});
```

### Provider-Specific Options

```typescript
const result = await service.generate({
  schema: MySchema,
  prompt: "Extract data...",
  provider: 'openai',
  providerOptions: {
    // OpenAI-specific options
    top_p: 0.9,
    frequency_penalty: 0.1,
  },
});
```

### Structured Logging

Enable detailed logging for debugging and monitoring:

```typescript
const service = new StructuredLLMService({
  enableLogging: true,
});

// Logs structured JSON with request details, token usage, and costs
const result = await service.generate(options);
```

## Performance Considerations

### Schema Optimization

- Use specific types instead of generic ones
- Add descriptions to guide the LLM
- Keep schemas as simple as possible

```typescript
// Good: Specific and descriptive
const PersonSchema = z.object({
  name: z.string().describe("Full name of the person"),
  age: z.number().int().positive().describe("Age in years"),
});

// Avoid: Too generic
const PersonSchema = z.object({
  name: z.string(),
  age: z.number(),
});
```

### Caching Strategy

- Enable caching for repeated similar requests
- Consider cache invalidation for dynamic content
- Monitor cache hit rates through metadata

### Token Management

- Monitor token usage through the `tokenUsage` field
- Set appropriate `maxTokens` limits
- Use temperature settings to balance creativity and consistency

## Migration from instructor-js

See the [Migration Guide](./migration-guide.md) for detailed information on migrating from raw instructor-js to this service wrapper.
