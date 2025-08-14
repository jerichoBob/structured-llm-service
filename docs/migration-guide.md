# Migration Guide from instructor-js

This guide helps developers migrate from raw instructor-js to our Structured LLM Service wrapper. We'll show side-by-side comparisons and highlight the benefits of using our service.

## Table of Contents

- [Why Migrate?](#why-migrate)
- [Installation Changes](#installation-changes)
- [Basic Usage Comparison](#basic-usage-comparison)
- [Configuration Migration](#configuration-migration)
- [Error Handling Improvements](#error-handling-improvements)
- [Advanced Features](#advanced-features)
- [Migration Checklist](#migration-checklist)

## Why Migrate?

### Benefits of Our Service Wrapper

| Feature | Raw instructor-js | Structured LLM Service |
|---------|-------------------|------------------------|
| **Setup Complexity** | Manual client configuration | Automatic configuration |
| **Retry Logic** | Manual implementation | Built-in exponential backoff |
| **Error Handling** | Basic error objects | Detailed validation errors |
| **Caching** | Not available | Response and schema caching |
| **Cost Tracking** | Manual calculation | Automatic token usage tracking |
| **Multi-Provider** | Limited support | Easy provider switching |
| **Type Safety** | Basic TypeScript support | Full type inference |
| **Logging** | Manual implementation | Structured logging built-in |

## Installation Changes

### Before (instructor-js)

```bash
npm install @instructor-ai/instructor openai zod
```

### After (Structured LLM Service)

```bash
npm install structured-llm-service zod
# instructor-js and openai are automatically included
```

## Basic Usage Comparison

### Simple Data Extraction

#### Before: Raw instructor-js

```typescript
import Instructor from '@instructor-ai/instructor';
import OpenAI from 'openai';
import { z } from 'zod';

// Manual client setup
const oai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const client = Instructor({
  client: oai,
  mode: "FUNCTIONS",
});

const PersonSchema = z.object({
  name: z.string(),
  age: z.number(),
});

async function extractPerson() {
  try {
    const person = await client.chat.completions.create({
      messages: [{ role: "user", content: "Extract: John is 25" }],
      model: "gpt-3.5-turbo",
      response_model: { schema: PersonSchema },
      max_retries: 3,
    });
    
    console.log(person);
  } catch (error) {
    console.error('Error:', error);
    // Limited error information
  }
}
```

#### After: Structured LLM Service

```typescript
import { StructuredLLMService } from 'structured-llm-service';
import { z } from 'zod';

// Automatic configuration
const service = new StructuredLLMService();

const PersonSchema = z.object({
  name: z.string(),
  age: z.number(),
});

async function extractPerson() {
  const result = await service.generate({
    schema: PersonSchema,
    prompt: "Extract: John is 25",
  });
  
  if (result.success) {
    console.log(result.data);
    console.log('Cost:', result.tokenUsage.estimatedCost);
    console.log('Time:', result.processingTime, 'ms');
  } else {
    // Detailed error information
    result.errors?.forEach(error => {
      console.error(`${error.field}: ${error.message}`);
    });
  }
}
```

### Key Differences

1. **No manual client setup** - Service handles configuration automatically
2. **Structured results** - Always get a consistent result object
3. **Built-in error handling** - Detailed validation errors with field information
4. **Automatic metrics** - Token usage, cost, and timing included
5. **Type safety** - Full TypeScript inference from schema

## Configuration Migration

### Before: Manual Client Configuration

```typescript
import Instructor from '@instructor-ai/instructor';
import OpenAI from 'openai';

// Separate configuration for each provider
const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://api.openai.com/v1',
});

const instructor = Instructor({
  client: openaiClient,
  mode: "FUNCTIONS", // Manual mode selection
});

// Manual retry logic
async function generateWithRetry(prompt: string, maxRetries = 3) {
  let attempts = 0;
  while (attempts < maxRetries) {
    try {
      return await instructor.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "gpt-4",
        response_model: { schema: MySchema },
      });
    } catch (error) {
      attempts++;
      if (attempts >= maxRetries) throw error;
      
      // Manual backoff calculation
      const delay = Math.pow(2, attempts) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

### After: Simplified Configuration

```typescript
import { StructuredLLMService } from 'structured-llm-service';

// Single configuration for all features
const service = new StructuredLLMService({
  defaultProvider: 'auto', // Automatic provider selection
  defaultMaxRetries: 3,
  defaultRetryStrategy: 'exponential', // Built-in backoff
  enableCaching: true,
  enableLogging: true,
  
  // Optional provider-specific settings
  providerConfigs: {
    openai: {
      defaultModel: 'gpt-4-turbo',
    },
  },
});

// Built-in retry with exponential backoff
async function generateWithRetry(prompt: string) {
  return await service.generate({
    schema: MySchema,
    prompt,
    // Retry logic is automatic
  });
}
```

## Error Handling Improvements

### Before: Basic Error Handling

```typescript
try {
  const result = await instructor.chat.completions.create({
    messages: [{ role: "user", content: "Extract invalid data" }],
    model: "gpt-4",
    response_model: { schema: PersonSchema },
  });
  
  console.log(result);
} catch (error) {
  // Limited error information
  console.error('Something went wrong:', error.message);
  
  // No field-level validation details
  // No retry information
  // No cost tracking on failures
}
```

### After: Comprehensive Error Handling

```typescript
const result = await service.generate({
  schema: PersonSchema,
  prompt: "Extract invalid data",
});

if (result.success) {
  console.log('Success:', result.data);
} else {
  // Detailed field-level errors
  result.errors?.forEach(error => {
    console.error(`Field '${error.field}': ${error.message}`);
    console.error(`Code: ${error.code}`);
    console.error(`Received value: ${JSON.stringify(error.value)}`);
  });
  
  // Additional context
  console.log('Attempts made:', result.attempts);
  console.log('Processing time:', result.processingTime, 'ms');
  console.log('Provider used:', result.provider);
  
  // Check error type
  if (result.metadata?.isValidationError) {
    console.log('This was a schema validation error');
  }
}
```

## Advanced Features

### Caching Migration

#### Before: Manual Caching

```typescript
// Manual cache implementation
const cache = new Map();

async function generateWithCache(prompt: string, schema: any) {
  const cacheKey = `${prompt}-${JSON.stringify(schema)}`;
  
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }
  
  const result = await instructor.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: "gpt-4",
    response_model: { schema },
  });
  
  cache.set(cacheKey, result);
  return result;
}
```

#### After: Built-in Caching

```typescript
const service = new StructuredLLMService({
  enableCaching: true, // That's it!
});

// Automatic caching based on prompt, schema, and parameters
const result1 = await service.generate({
  schema: PersonSchema,
  prompt: "Extract: John is 25",
});

// Second identical call returns cached result
const result2 = await service.generate({
  schema: PersonSchema,
  prompt: "Extract: John is 25", // Same prompt = cache hit
});

console.log('Cache hit:', result2.metadata?.cacheHit); // true
```

### Provider Switching

#### Before: Manual Provider Management

```typescript
// Separate setup for each provider
const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const openaiInstructor = Instructor({ client: openaiClient });

// Would need separate setup for Claude, Gemini, etc.
// Manual fallback logic required

async function generateWithFallback(prompt: string) {
  try {
    return await openaiInstructor.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "gpt-4",
      response_model: { schema: MySchema },
    });
  } catch (error) {
    // Manual fallback to another provider
    // Would need separate client setup
    throw error;
  }
}
```

#### After: Seamless Provider Switching

```typescript
const service = new StructuredLLMService({
  defaultProvider: 'auto', // Automatic selection
});

// Easy provider switching
const openaiResult = await service.generate({
  schema: MySchema,
  prompt: "Extract data...",
  provider: 'openai',
});

// Fallback to auto-selection if needed
if (!openaiResult.success) {
  const autoResult = await service.generate({
    schema: MySchema,
    prompt: "Extract data...",
    provider: 'auto', // Automatically picks best available
  });
}

// Check which provider was actually used
console.log('Provider used:', autoResult.provider);
```

## Migration Checklist

### Step 1: Update Dependencies

- [ ] Remove `@instructor-ai/instructor` from package.json
- [ ] Remove `openai` if not used elsewhere
- [ ] Add `structured-llm-service`
- [ ] Keep `zod` (still required)

```bash
npm uninstall @instructor-ai/instructor openai
npm install structured-llm-service
```

### Step 2: Update Imports

```typescript
// Before
import Instructor from '@instructor-ai/instructor';
import OpenAI from 'openai';

// After
import { StructuredLLMService } from 'structured-llm-service';
```

### Step 3: Replace Client Initialization

```typescript
// Before
const oai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const client = Instructor({ client: oai, mode: "FUNCTIONS" });

// After
const service = new StructuredLLMService({
  enableLogging: true,
  enableCaching: true,
});
```

### Step 4: Update Generation Calls

```typescript
// Before
const result = await client.chat.completions.create({
  messages: [{ role: "user", content: prompt }],
  model: "gpt-4",
  response_model: { schema: MySchema },
  max_retries: 3,
});

// After
const result = await service.generate({
  schema: MySchema,
  prompt: prompt,
  model: "gpt-4",
  maxRetries: 3,
});
```

### Step 5: Update Error Handling

```typescript
// Before
try {
  const result = await client.chat.completions.create(options);
  console.log(result);
} catch (error) {
  console.error(error);
}

// After
const result = await service.generate(options);
if (result.success) {
  console.log(result.data);
} else {
  result.errors?.forEach(error => {
    console.error(`${error.field}: ${error.message}`);
  });
}
```

### Step 6: Leverage New Features

- [ ] Enable caching for repeated operations
- [ ] Add structured logging for monitoring
- [ ] Use automatic cost tracking
- [ ] Implement provider fallback strategies
- [ ] Take advantage of enhanced error reporting

```typescript
const service = new StructuredLLMService({
  enableCaching: true,
  enableLogging: true,
  defaultProvider: 'auto',
  defaultRetryStrategy: 'exponential',
});
```

## Common Migration Patterns

### Pattern 1: Simple Function Migration

```typescript
// Before
async function extractPersonInstructor(text: string) {
  const result = await client.chat.completions.create({
    messages: [{ role: "user", content: `Extract person info: ${text}` }],
    model: "gpt-4",
    response_model: { schema: PersonSchema },
  });
  return result;
}

// After
async function extractPersonService(text: string) {
  const result = await service.generate({
    schema: PersonSchema,
    prompt: `Extract person info: ${text}`,
  });
  
  return result.success ? result.data : null;
}
```

### Pattern 2: Class-Based Migration

```typescript
// Before
class DataExtractorInstructor {
  private client: any;
  
  constructor() {
    const oai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.client = Instructor({ client: oai });
  }
  
  async extract(schema: any, prompt: string) {
    return await this.client.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "gpt-4",
      response_model: { schema },
    });
  }
}

// After
class DataExtractorService {
  private service: StructuredLLMService;
  
  constructor() {
    this.service = new StructuredLLMService({
      enableCaching: true,
      enableLogging: true,
    });
  }
  
  async extract<T>(schema: z.ZodSchema<T>, prompt: string) {
    const result = await this.service.generate({
      schema,
      prompt,
    });
    
    if (result.success) {
      return {
        data: result.data,
        cost: result.tokenUsage.estimatedCost,
        time: result.processingTime,
      };
    } else {
      throw new Error(`Extraction failed: ${result.errors?.map(e => e.message).join(', ')}`);
    }
  }
}
```

## Performance Considerations

### Before: Manual Optimization

```typescript
// Manual schema caching
const schemaCache = new Map();

// Manual response caching
const responseCache = new Map();

// Manual cost tracking
let totalCost = 0;

async function optimizedGeneration(prompt: string) {
  // Manual cache check
  const cacheKey = prompt;
  if (responseCache.has(cacheKey)) {
    return responseCache.get(cacheKey);
  }
  
  // Manual cost calculation
  const result = await client.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: "gpt-4",
    response_model: { schema: MySchema },
  });
  
  // Manual cost tracking
  const cost = calculateCost(result.usage);
  totalCost += cost;
  
  responseCache.set(cacheKey, result);
  return result;
}
```

### After: Automatic Optimization

```typescript
const service = new StructuredLLMService({
  enableCaching: true, // Automatic response caching
  enableLogging: true, // Automatic cost tracking
});

async function optimizedGeneration(prompt: string) {
  const result = await service.generate({
    schema: MySchema, // Automatic schema caching
    prompt,
  });
  
  // All optimization is automatic:
  // - Schema caching
  // - Response caching
  // - Cost calculation
  // - Performance metrics
  
  console.log('Cost:', result.tokenUsage.estimatedCost);
  console.log('Cached:', result.metadata?.cacheHit);
  
  return result;
}
```

## Troubleshooting Migration Issues

### Issue 1: Missing API Keys

```typescript
// Error: OpenAI API key is required
// Solution: Ensure environment variables are set
process.env.OPENAI_API_KEY = 'your-key-here';
```

### Issue 2: Schema Validation Differences

```typescript
// If you get different validation results:
// 1. Check schema descriptions
const PersonSchema = z.object({
  name: z.string().describe("Full name of the person"), // Add descriptions
  age: z.number().describe("Age in years"),
});

// 2. Use lower temperature for consistency
const result = await service.generate({
  schema: PersonSchema,
  prompt: "Extract...",
  temperature: 0.1, // More deterministic
});
```

### Issue 3: Performance Differences

```typescript
// Enable caching for better performance
const service = new StructuredLLMService({
  enableCaching: true,
});

// Monitor performance
const result = await service.generate(options);
console.log('Processing time:', result.processingTime, 'ms');
console.log('Cache hit:', result.metadata?.cacheHit);
```

## Next Steps

After migration:

1. **Test thoroughly** - Verify all functionality works as expected
2. **Enable monitoring** - Use structured logging for production insights
3. **Optimize caching** - Enable caching for repeated operations
4. **Explore advanced features** - Provider switching, custom retry logic
5. **Review documentation** - Check [API Reference](./api-reference.md) and [Examples](./examples.md)

## Support

If you encounter issues during migration:

1. Check the [Examples](./examples.md) for similar use cases
2. Review the [API Reference](./api-reference.md) for method signatures
3. Enable logging to debug issues: `enableLogging: true`
4. Compare with the side-by-side examples in this guide
