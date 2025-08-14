# Advanced Features

This guide covers the advanced features of the Structured LLM Service, including performance optimization, caching strategies, monitoring, and production deployment considerations.

## Table of Contents

- [Response Caching](#response-caching)
- [Schema Caching](#schema-caching)
- [Structured Logging](#structured-logging)
- [Cost Optimization](#cost-optimization)
- [Performance Monitoring](#performance-monitoring)
- [Production Deployment](#production-deployment)
- [Custom Retry Strategies](#custom-retry-strategies)
- [Provider Fallback](#provider-fallback)

## Response Caching

The service provides intelligent response caching to reduce API calls and improve performance.

### Basic Caching

```typescript
const service = new StructuredLLMService({
  enableCaching: true,
});

// First call hits the API
const result1 = await service.generate({
  schema: PersonSchema,
  prompt: "Extract: John Doe, age 30",
});

// Second identical call returns cached result
const result2 = await service.generate({
  schema: PersonSchema,
  prompt: "Extract: John Doe, age 30", // Identical parameters
});

console.log('Cache hit:', result2.metadata?.cacheHit); // true
console.log('Processing time:', result2.processingTime); // Much faster
```

### Cache Key Generation

The cache key is generated from:
- Prompt text
- Schema structure
- Model and provider
- Temperature and other parameters

```typescript
// These will have different cache keys:
const result1 = await service.generate({
  schema: PersonSchema,
  prompt: "Extract: John Doe",
  temperature: 0.1,
});

const result2 = await service.generate({
  schema: PersonSchema,
  prompt: "Extract: John Doe",
  temperature: 0.5, // Different temperature = different cache key
});
```

### Cache Statistics

Monitor cache performance:

```typescript
const result = await service.generate({
  schema: PersonSchema,
  prompt: "Extract data...",
});

const cacheStats = result.metadata?.responseCache?.stats;
console.log('Cache hits:', cacheStats?.hits);
console.log('Cache misses:', cacheStats?.misses);
console.log('Hit rate:', cacheStats?.hitRate);
console.log('Cache size:', cacheStats?.size);
```

### Cache Management

```typescript
// The cache is automatically managed, but you can monitor its behavior
const service = new StructuredLLMService({
  enableCaching: true,
  enableLogging: true, // Logs cache hits/misses
});

// Cache behavior is logged when enableLogging is true
const result = await service.generate(options);
// Logs: "Cache hit - returning cached response" or "Cache miss - proceeding with LLM request"
```

## Schema Caching

Zod schemas are automatically cached for improved performance.

### Automatic Schema Caching

```typescript
const PersonSchema = z.object({
  name: z.string(),
  age: z.number(),
});

// Schema is cached on first use
const result1 = await service.generate({
  schema: PersonSchema, // Schema cached here
  prompt: "Extract: John, 25",
});

const result2 = await service.generate({
  schema: PersonSchema, // Uses cached schema
  prompt: "Extract: Jane, 30",
});

// Check schema cache statistics
console.log('Schema cache stats:', result2.metadata?.schemaCache?.stats);
```

### Schema Cache Benefits

- **Performance**: Faster schema processing on repeated use
- **Memory Efficiency**: Shared schema instances
- **Validation Speed**: Pre-compiled validation functions

## Structured Logging

Enable comprehensive logging for monitoring and debugging.

### Basic Logging

```typescript
const service = new StructuredLLMService({
  enableLogging: true,
});

const result = await service.generate({
  schema: PersonSchema,
  prompt: "Extract person data",
});

// Outputs structured JSON logs:
// {
//   "timestamp": "2024-01-15T10:30:00.000Z",
//   "level": "INFO",
//   "service": "StructuredLLMService",
//   "event": "llm_request_completed",
//   "requestId": "req_1705312200000_abc123",
//   "provider": "openai",
//   "model": "gpt-4-turbo",
//   "success": true,
//   "attempts": 1,
//   "processingTimeMs": 1250,
//   "tokenUsage": {
//     "promptTokens": 45,
//     "completionTokens": 23,
//     "totalTokens": 68
//   },
//   "costCalculation": {
//     "inputCost": 0.00045,
//     "outputCost": 0.00069,
//     "totalCost": 0.00114,
//     "currency": "USD"
//   }
// }
```

### Log Analysis

Use the structured logs for:

- **Performance Monitoring**: Track processing times and token usage
- **Cost Analysis**: Monitor spending across providers and models
- **Error Tracking**: Identify common failure patterns
- **Cache Effectiveness**: Measure cache hit rates
- **Provider Performance**: Compare response times across providers

### Custom Log Processing

```typescript
// Capture logs for custom processing
const originalLog = console.log;
const logs: any[] = [];

console.log = (message: string) => {
  try {
    const logData = JSON.parse(message);
    if (logData.service === 'StructuredLLMService') {
      logs.push(logData);
    }
  } catch {
    // Not a JSON log, pass through
  }
  originalLog(message);
};

// Use the service...
const result = await service.generate(options);

// Analyze collected logs
const avgProcessingTime = logs.reduce((sum, log) => sum + log.processingTimeMs, 0) / logs.length;
const totalCost = logs.reduce((sum, log) => sum + log.costCalculation.totalCost, 0);
```

## Cost Optimization

### Automatic Cost Tracking

```typescript
const result = await service.generate({
  schema: PersonSchema,
  prompt: "Extract data...",
});

console.log('Token usage:', result.tokenUsage);
// {
//   promptTokens: 45,
//   completionTokens: 23,
//   totalTokens: 68,
//   estimatedCost: 0.00114
// }

console.log('Detailed cost breakdown:', result.metadata?.costCalculation);
// {
//   inputCost: 0.00045,
//   outputCost: 0.00069,
//   totalCost: 0.00114,
//   currency: "USD",
//   provider: "openai",
//   model: "gpt-4-turbo",
//   pricingDate: "2024-01-15"
// }
```

### Cost Optimization Strategies

#### 1. Use Appropriate Models

```typescript
// For simple extraction tasks
const result = await service.generate({
  schema: SimpleSchema,
  prompt: "Extract basic info...",
  model: 'gpt-3.5-turbo', // Cheaper model
});

// For complex reasoning tasks
const result = await service.generate({
  schema: ComplexSchema,
  prompt: "Analyze and extract complex relationships...",
  model: 'gpt-4-turbo', // More capable but expensive
});
```

#### 2. Optimize Token Usage

```typescript
// Set reasonable token limits
const result = await service.generate({
  schema: PersonSchema,
  prompt: "Extract person info from this text:",
  content: longText,
  maxTokens: 200, // Limit response size
  temperature: 0.1, // Lower temperature for consistency
});
```

#### 3. Leverage Caching

```typescript
const service = new StructuredLLMService({
  enableCaching: true, // Reduce API calls for repeated requests
});

// Batch similar requests to benefit from caching
const results = await Promise.all([
  service.generate({ schema: PersonSchema, prompt: "Extract: John, 25" }),
  service.generate({ schema: PersonSchema, prompt: "Extract: John, 25" }), // Cache hit
]);
```

### Cost Monitoring

```typescript
class CostMonitor {
  private totalCost = 0;
  private requestCount = 0;

  async trackGeneration<T>(
    service: StructuredLLMService,
    options: StructuredLLMOptions<T>
  ) {
    const result = await service.generate(options);
    
    if (result.success) {
      this.totalCost += result.tokenUsage.estimatedCost || 0;
      this.requestCount++;
      
      console.log(`Request ${this.requestCount}:`);
      console.log(`Cost: $${result.tokenUsage.estimatedCost?.toFixed(4)}`);
      console.log(`Total cost: $${this.totalCost.toFixed(4)}`);
      console.log(`Average per request: $${(this.totalCost / this.requestCount).toFixed(4)}`);
    }
    
    return result;
  }

  getStats() {
    return {
      totalCost: this.totalCost,
      requestCount: this.requestCount,
      averageCost: this.totalCost / this.requestCount,
    };
  }
}

const monitor = new CostMonitor();
const result = await monitor.trackGeneration(service, options);
```

## Performance Monitoring

### Response Time Tracking

```typescript
const service = new StructuredLLMService({
  enableLogging: true,
});

// Track performance across multiple requests
const performanceData: number[] = [];

for (let i = 0; i < 10; i++) {
  const result = await service.generate({
    schema: PersonSchema,
    prompt: `Extract person ${i}: John Doe, age ${20 + i}`,
  });
  
  performanceData.push(result.processingTime);
}

// Analyze performance
const avgTime = performanceData.reduce((a, b) => a + b) / performanceData.length;
const minTime = Math.min(...performanceData);
const maxTime = Math.max(...performanceData);

console.log(`Average: ${avgTime}ms, Min: ${minTime}ms, Max: ${maxTime}ms`);
```

### Provider Performance Comparison

```typescript
async function compareProviders() {
  const providers = ['openai', 'auto'];
  const results: Record<string, number[]> = {};

  for (const provider of providers) {
    results[provider] = [];
    
    for (let i = 0; i < 5; i++) {
      const result = await service.generate({
        schema: PersonSchema,
        prompt: "Extract: John Doe, age 30",
        provider: provider as any,
      });
      
      if (result.success) {
        results[provider].push(result.processingTime);
      }
    }
  }

  // Compare average performance
  for (const [provider, times] of Object.entries(results)) {
    const avg = times.reduce((a, b) => a + b) / times.length;
    console.log(`${provider}: ${avg.toFixed(0)}ms average`);
  }
}
```

## Production Deployment

### Environment Configuration

```typescript
// production.config.ts
export const productionConfig: StructuredLLMServiceConfig = {
  defaultProvider: 'auto',
  defaultRetryStrategy: 'exponential',
  defaultMaxRetries: 3,
  defaultTimeout: 30000,
  enableCaching: true,
  enableLogging: true,
  
  providerConfigs: {
    openai: {
      defaultModel: 'gpt-4-turbo',
    },
  },
};

// Initialize service with production config
const service = new StructuredLLMService(productionConfig);
```

### Health Checks

```typescript
class ServiceHealthCheck {
  constructor(private service: StructuredLLMService) {}

  async checkHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    providers: Record<string, boolean>;
    responseTime: number;
  }> {
    const startTime = Date.now();
    
    // Test basic functionality
    const testSchema = z.object({ test: z.string() });
    const result = await this.service.generate({
      schema: testSchema,
      prompt: "Return: { test: 'ok' }",
      timeout: 5000,
    });

    const responseTime = Date.now() - startTime;
    
    // Check provider availability
    const providers: Record<string, boolean> = {};
    for (const provider of ['openai']) {
      providers[provider] = this.service.isProviderAvailable(provider);
    }

    const status = result.success ? 'healthy' : 'unhealthy';
    
    return { status, providers, responseTime };
  }
}

// Use in health check endpoint
const healthCheck = new ServiceHealthCheck(service);
const health = await healthCheck.checkHealth();
```

### Error Monitoring

```typescript
class ErrorMonitor {
  private errors: Array<{
    timestamp: Date;
    error: string;
    provider: string;
    attempts: number;
  }> = [];

  async monitoredGenerate<T>(
    service: StructuredLLMService,
    options: StructuredLLMOptions<T>
  ) {
    const result = await service.generate(options);
    
    if (!result.success) {
      this.errors.push({
        timestamp: new Date(),
        error: result.errors?.map(e => e.message).join(', ') || 'Unknown error',
        provider: result.provider,
        attempts: result.attempts,
      });
      
      // Alert if error rate is high
      const recentErrors = this.errors.filter(
        e => Date.now() - e.timestamp.getTime() < 5 * 60 * 1000 // Last 5 minutes
      );
      
      if (recentErrors.length > 10) {
        console.error('High error rate detected:', recentErrors.length, 'errors in 5 minutes');
        // Send alert to monitoring system
      }
    }
    
    return result;
  }

  getErrorStats() {
    const last24h = this.errors.filter(
      e => Date.now() - e.timestamp.getTime() < 24 * 60 * 60 * 1000
    );
    
    return {
      totalErrors: this.errors.length,
      last24h: last24h.length,
      byProvider: this.groupBy(last24h, 'provider'),
      commonErrors: this.getTopErrors(last24h),
    };
  }

  private groupBy<T>(array: T[], key: keyof T): Record<string, number> {
    return array.reduce((acc, item) => {
      const group = String(item[key]);
      acc[group] = (acc[group] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private getTopErrors(errors: typeof this.errors): Array<{ error: string; count: number }> {
    const errorCounts = this.groupBy(errors, 'error');
    return Object.entries(errorCounts)
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }
}
```

## Custom Retry Strategies

### Advanced Retry Configuration

```typescript
const result = await service.generate({
  schema: PersonSchema,
  prompt: "Extract data...",
  maxRetries: {
    max_attempts: 5,
    backoff_factor: 2,
    initial_delay: 1000,
    max_delay: 30000,
    jitter: true,
    on_error: async (error) => {
      console.log(`Retry triggered by: ${error.message}`);
      
      // Custom logic on each retry
      if (error.message.includes('rate limit')) {
        // Wait longer for rate limit errors
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      // Log to monitoring system
      // await logToMonitoring('retry_attempt', { error: error.message });
    },
  },
});
```

### Conditional Retry Logic

```typescript
class SmartRetryService {
  private service: StructuredLLMService;

  constructor() {
    this.service = new StructuredLLMService();
  }

  async generateWithSmartRetry<T>(options: StructuredLLMOptions<T>) {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await this.service.generate({
          ...options,
          maxRetries: 1, // Handle retries at this level
        });

        if (result.success) {
          return result;
        }

        // Analyze the error to decide retry strategy
        const errorMessages = result.errors?.map(e => e.message).join(', ') || '';
        
        if (errorMessages.includes('rate limit')) {
          // Exponential backoff for rate limits
          const delay = Math.pow(2, attempt) * 2000;
          await this.sleep(delay);
        } else if (errorMessages.includes('timeout')) {
          // Try with a different provider
          options.provider = 'auto';
        } else if (attempt === 3) {
          // Last attempt failed
          return result;
        }

      } catch (error) {
        lastError = error as Error;
        
        if (attempt === 3) {
          throw error;
        }
        
        // Simple delay for unexpected errors
        await this.sleep(1000 * attempt);
      }
    }

    throw lastError || new Error('All retry attempts failed');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

## Provider Fallback

### Automatic Provider Fallback

```typescript
const service = new StructuredLLMService({
  defaultProvider: 'auto', // Automatically selects best available
});

// The service will automatically try available providers
const result = await service.generate({
  schema: PersonSchema,
  prompt: "Extract data...",
  // No provider specified - uses auto selection
});

console.log('Provider used:', result.provider);
```

### Manual Provider Fallback

```typescript
async function generateWithFallback<T>(
  service: StructuredLLMService,
  options: StructuredLLMOptions<T>
) {
  const providers = ['openai', 'auto'];
  
  for (const provider of providers) {
    try {
      const result = await service.generate({
        ...options,
        provider: provider as any,
      });
      
      if (result.success) {
        console.log(`Success with provider: ${provider}`);
        return result;
      }
      
      console.log(`Failed with provider ${provider}, trying next...`);
    } catch (error) {
      console.log(`Error with provider ${provider}:`, error.message);
    }
  }
  
  throw new Error('All providers failed');
}
```

### Provider Health Monitoring

```typescript
class ProviderHealthMonitor {
  private healthStatus: Record<string, {
    available: boolean;
    lastCheck: Date;
    errorCount: number;
    avgResponseTime: number;
  }> = {};

  constructor(private service: StructuredLLMService) {}

  async checkProviderHealth(provider: string) {
    const startTime = Date.now();
    
    try {
      const testResult = await this.service.generate({
        schema: z.object({ status: z.string() }),
        prompt: "Return: { status: 'ok' }",
        provider: provider as any,
        timeout: 5000,
      });

      const responseTime = Date.now() - startTime;
      
      this.healthStatus[provider] = {
        available: testResult.success,
        lastCheck: new Date(),
        errorCount: testResult.success ? 0 : (this.healthStatus[provider]?.errorCount || 0) + 1,
        avgResponseTime: responseTime,
      };

      return testResult.success;
    } catch (error) {
      this.healthStatus[provider] = {
        available: false,
        lastCheck: new Date(),
        errorCount: (this.healthStatus[provider]?.errorCount || 0) + 1,
        avgResponseTime: Date.now() - startTime,
      };

      return false;
    }
  }

  getHealthStatus() {
    return { ...this.healthStatus };
  }

  async getRecommendedProvider(): Promise<string> {
    const providers = ['openai'];
    const healthChecks = await Promise.all(
      providers.map(async provider => ({
        provider,
        healthy: await this.checkProviderHealth(provider),
        status: this.healthStatus[provider],
      }))
    );

    // Sort by health and performance
    const sortedProviders = healthChecks
      .filter(p => p.healthy)
      .sort((a, b) => {
        // Prefer providers with lower error count and faster response time
        const aScore = (a.status?.errorCount || 0) + (a.status?.avgResponseTime || 0) / 1000;
        const bScore = (b.status?.errorCount || 0) + (b.status?.avgResponseTime || 0) / 1000;
        return aScore - bScore;
      });

    return sortedProviders[0]?.provider || 'auto';
  }
}
```

## Best Practices Summary

1. **Enable Caching**: For production workloads with repeated patterns
2. **Monitor Costs**: Track token usage and implement cost alerts
3. **Use Structured Logging**: For debugging and performance analysis
4. **Implement Health Checks**: Monitor service and provider availability
5. **Plan for Failures**: Use retry strategies and provider fallbacks
6. **Optimize Schemas**: Use specific, well-described schemas
7. **Set Appropriate Timeouts**: Balance responsiveness with reliability
8. **Monitor Performance**: Track response times and error rates

These advanced features enable you to build robust, production-ready applications with the Structured LLM Service while maintaining optimal performance and cost efficiency.
