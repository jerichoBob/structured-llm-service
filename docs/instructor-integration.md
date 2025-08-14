# Instructor-js Integration Strategy

## Executive Summary

This document outlines the technical strategy for integrating instructor-js into our StructuredLLMService to provide Pydantic-equivalent structured output functionality for TypeScript. Based on research, instructor-js is an ideal choice that directly addresses our core requirements by providing a unified interface for structured data extraction across multiple LLM providers.

## Key Instructor-js Features

### Multi-Provider Support
- **Native Support**: OpenAI, Anthropic (Claude), and Google (Gemini) clients
- **Abstraction**: Handles provider-specific API differences automatically
- **Unified Interface**: Single API for all providers through `chat.completions.create`

### Zod Schema Integration
- **Single Source of Truth**: Uses Zod schemas to define desired data structure
- **Automatic Conversion**: Converts Zod schemas to appropriate LLM formats (JSON Schema, tool definitions)
- **Type Safety**: Maintains full TypeScript type safety throughout the pipeline

### Mode Switching
- **TOOLS Mode**: Uses native "Tool Calling" or "Function Calling" features (recommended default)
- **JSON Mode**: Uses dedicated JSON mode for compatible models
- **MD_JSON Mode**: Fallback mode using Markdown code blocks containing JSON
- **JSON_SCHEMA Mode**: Gemini-specific mode using native JSON schema conformance

### Automatic Retries & Validation
- **Validation Retries**: Automatically retries when LLM output doesn't match Zod schema
- **Error Context**: Sends validation errors back to LLM for correction
- **Configurable**: `max_retries` parameter controls retry attempts

## Architecture Design

### Core Service Structure

```typescript
export class StructuredLLMService {
  private instructorInstances: Map<string, InstructorInstance>;
  private config: StructuredLLMServiceConfig;

  constructor(config: StructuredLLMServiceConfig) {
    this.config = config;
    this.instructorInstances = new Map();
  }

  async generate<T>(options: StructuredLLMOptions<T>): Promise<StructuredLLMResult<T>> {
    const instructor = await this.getInstructorInstance(options.provider);
    // Implementation details...
  }
}
```

### Provider Initialization Strategy

Each provider requires specific client initialization:

```typescript
private async initializeProvider(provider: LLMProvider): Promise<InstructorInstance> {
  switch (provider) {
    case 'claude':
      const anthropic = new Anthropic({ 
        apiKey: this.config.providerConfigs?.claude?.apiKey 
      });
      return instructor({ client: anthropic, mode: 'TOOLS' });
      
    case 'gemini':
      const genAI = new GoogleGenerativeAI(
        this.config.providerConfigs?.gemini?.apiKey
      );
      const gemini = genAI.getGenerativeModel({ 
        model: this.config.providerConfigs?.gemini?.defaultModel || 'gemini-1.5-pro-latest' 
      });
      return instructor({ client: gemini, mode: 'TOOLS' });
      
    case 'openai':
      const openai = new OpenAI({ 
        apiKey: this.config.providerConfigs?.openai?.apiKey 
      });
      return instructor({ client: openai, mode: 'TOOLS' });
  }
}
```

## Implementation Strategy

### Phase 1: Basic Integration
1. **Provider Adapters**: Create adapter classes for each provider
2. **Core Wrapper**: Implement basic `generate()` method using instructor-js
3. **Schema Conversion**: Leverage instructor-js automatic Zod schema handling
4. **Basic Retries**: Use instructor-js built-in `max_retries` parameter

### Phase 2: Advanced Features
1. **Mode Selection**: Implement intelligent mode switching based on model capabilities
2. **Enhanced Retries**: Add network-level retry strategies using `p-retry`
3. **Error Handling**: Implement comprehensive error reporting and recovery
4. **Performance Optimization**: Add connection pooling and caching

### Phase 3: Production Features
1. **Monitoring**: Add token usage tracking and cost monitoring
2. **Circuit Breakers**: Implement circuit breaker patterns for resilience
3. **Rate Limiting**: Add provider-specific rate limiting
4. **Observability**: Add comprehensive logging and metrics

## Key Integration Points

### 1. Schema Handling
```typescript
// Our interface remains the same
interface StructuredLLMOptions<T> {
  schema: z.ZodSchema<T>;
  prompt: string;
  // ... other options
}

// Instructor-js handles the conversion automatically
const response = await instructorInstance.chat.completions.create({
  messages: [{ role: 'user', content: options.prompt }],
  model: this.getModelName(options.provider),
  response_model: {
    schema: options.schema,
    name: options.schema.description ?? 'DataExtractor',
  },
  max_retries: options.maxRetries || 3,
});
```

### 2. Provider Abstraction
```typescript
private getModelName(provider: LLMProvider, model?: string): string {
  if (model) return model;
  
  const defaults = {
    claude: 'claude-3-5-sonnet-20241022',
    gemini: 'gemini-1.5-pro-latest',
    openai: 'gpt-4-turbo',
  };
  
  return defaults[provider];
}
```

### 3. Error Handling Strategy
```typescript
try {
  const result = await instructorInstance.chat.completions.create({...});
  return {
    success: true,
    data: result,
    attempts: 1, // Instructor tracks this internally
    tokenUsage: this.extractTokenUsage(result),
    // ... other metadata
  };
} catch (error) {
  return this.handleInstructorError(error, options);
}
```

## Advanced Retry Implementation

### Network-Level Retries
```typescript
import pRetry from 'p-retry';

async generate<T>(options: StructuredLLMOptions<T>): Promise<StructuredLLMResult<T>> {
  const extractionTask = async () => {
    const instructor = await this.getInstructorInstance(options.provider);
    return await instructor.chat.completions.create({
      messages: [{ role: 'user', content: options.prompt }],
      model: this.getModelName(options.provider, options.model),
      response_model: {
        schema: options.schema,
        name: options.schema.description ?? 'DataExtractor',
      },
      max_retries: options.maxRetries || 3, // Validation retries
    });
  };

  // Network-level retries with exponential backoff
  return pRetry(extractionTask, {
    retries: 5,
    factor: 2,
    minTimeout: 1000,
    maxTimeout: 60000,
    randomize: true,
    onFailedAttempt: this.handleRetryAttempt.bind(this),
  });
}
```

## Enhanced Validation Strategy

### Custom Validation with Data Cleaning
```typescript
// Enhanced schema with custom validation and data cleaning
const EnhancedSchema = z.object({
  title: z.string()
    .min(5, 'Title must be at least 5 characters long.')
    .transform(val => val.trim()), // Data cleaning
    
  email: z.string()
    .email('Invalid email format provided.')
    .transform(val => val.toLowerCase()), // Normalization
    
  year: z.number()
    .gt(1990, 'Year must be after 1990.')
    .lt(new Date().getFullYear() + 1, 'Year cannot be in the future.'),
})
.refine(data => {
  // Cross-field validation
  if (data.title.toLowerCase().includes('spam') && data.year > 2020) {
    return false;
  }
  return true;
}, {
  message: 'Recent articles cannot contain spam-like content.',
  path: ['title'],
});
```

## Migration Strategy

### From Stub to Full Implementation

1. **Replace Mock Methods**: Replace stub implementations with instructor-js calls
2. **Update Interfaces**: Ensure interfaces remain compatible
3. **Add Provider Configs**: Extend configuration to include API keys and endpoints
4. **Update Tests**: Modify tests to work with real instructor-js integration
5. **Add Integration Tests**: Create tests that verify actual provider communication

### Backward Compatibility

- Maintain existing interface signatures
- Preserve configuration structure
- Keep error response formats consistent
- Ensure type safety is maintained

## Performance Considerations

### Connection Pooling
```typescript
private instructorInstances = new Map<string, InstructorInstance>();

private async getInstructorInstance(provider: LLMProvider): Promise<InstructorInstance> {
  const key = `${provider}-${this.getConfigHash(provider)}`;
  
  if (!this.instructorInstances.has(key)) {
    const instance = await this.initializeProvider(provider);
    this.instructorInstances.set(key, instance);
  }
  
  return this.instructorInstances.get(key)!;
}
```

### Token Usage Tracking
```typescript
private extractTokenUsage(response: any): TokenUsage {
  // Extract from instructor-js response metadata
  return {
    promptTokens: response.usage?.prompt_tokens || 0,
    completionTokens: response.usage?.completion_tokens || 0,
    totalTokens: response.usage?.total_tokens || 0,
    estimatedCost: this.calculateCost(response.usage, response.model),
  };
}
```

## Testing Strategy

### Unit Tests
- Mock instructor-js responses
- Test schema validation logic
- Verify error handling paths
- Test configuration management

### Integration Tests
- Test with real API calls (using test API keys)
- Verify provider switching works correctly
- Test retry mechanisms
- Validate token usage tracking

### Performance Tests
- Measure response times across providers
- Test concurrent request handling
- Validate memory usage with connection pooling
- Test retry strategy performance

## Security Considerations

### API Key Management
- Store API keys in environment variables
- Support key rotation without service restart
- Implement key validation on startup
- Add audit logging for API key usage

### Data Privacy
- No persistent storage of request/response data
- Configurable data retention policies
- Support for data anonymization
- GDPR compliance considerations

## Conclusion

Instructor-js provides an excellent foundation for our StructuredLLMService implementation. Its native multi-provider support, automatic Zod schema integration, and built-in retry mechanisms align perfectly with our requirements. The proposed architecture maintains our clean interface while leveraging instructor-js's powerful features for production-ready structured output functionality.

The phased implementation approach allows us to deliver value incrementally while building toward a comprehensive, production-ready solution that serves as the foundation for all future LLM integrations in the platform.
