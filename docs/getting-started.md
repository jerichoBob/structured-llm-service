# Getting Started

Welcome to the Structured LLM Service! This guide will help you get up and running quickly with our production-ready TypeScript wrapper around instructor-js.

## What is Structured LLM Service?

The Structured LLM Service is a powerful wrapper around instructor-js that provides Pydantic-equivalent structured output functionality for Large Language Models. It simplifies the process of getting structured, validated data from LLMs while adding production-ready features like retry logic, caching, and comprehensive error handling.

## Key Benefits Over Raw instructor-js

- **Simplified Configuration**: No need to manually configure clients for different providers
- **Built-in Retry Logic**: Automatic retry with exponential backoff for failed requests
- **Response Caching**: Optional caching to reduce API calls and costs
- **Cost Tracking**: Automatic token usage and cost calculation
- **Enhanced Error Handling**: Detailed validation errors with field-level information
- **Type Safety**: Full TypeScript support with Zod schema validation
- **Production Ready**: Structured logging, performance metrics, and monitoring

## Prerequisites

Before you begin, ensure you have:

- **Node.js**: Version 18 or higher
- **TypeScript**: Version 5.0 or higher (if using TypeScript)
- **API Keys**: At least one LLM provider API key (OpenAI, Claude, or Gemini)

## Installation

Install the package using your preferred package manager:

```bash
# Using npm
npm install structured-llm-service zod

# Using pnpm
pnpm add structured-llm-service zod

# Using yarn
yarn add structured-llm-service zod
```

### Dependencies

The service requires these peer dependencies:
- `zod` - For schema definition and validation
- `@instructor-ai/instructor` - Automatically installed as a dependency
- `openai` - For OpenAI provider support (automatically installed)

## Environment Setup

Set up your environment variables for the LLM providers you want to use:

```bash
# .env file
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_claude_api_key_here
GOOGLE_API_KEY=your_gemini_api_key_here
```

**Note**: Currently, instructor-js v1.7.0 primarily supports OpenAI. Our service includes fallback mechanisms for other providers.

## Quick Start Example

Here's a simple example to get you started:

```typescript
import { StructuredLLMService } from 'structured-llm-service';
import { z } from 'zod';

// 1. Define your data structure with Zod
const PersonSchema = z.object({
  name: z.string().describe("The person's full name"),
  age: z.number().int().positive().describe("The person's age in years"),
  email: z.string().email().describe("The person's email address"),
  occupation: z.string().optional().describe("The person's job or profession"),
});

// 2. Initialize the service
const llmService = new StructuredLLMService({
  enableLogging: true,
  enableCaching: false, // Disable for first run
  defaultProvider: 'auto', // Automatically select best available provider
});

// 3. Generate structured output
async function extractPersonInfo() {
  try {
    const result = await llmService.generate({
      schema: PersonSchema,
      prompt: `Extract person information from this text: 
        "Hi, I'm Sarah Johnson, a 28-year-old software engineer. 
        You can reach me at sarah.johnson@techcorp.com"`,
    });

    if (result.success) {
      console.log('Extracted data:', result.data);
      // Output: {
      //   name: "Sarah Johnson",
      //   age: 28,
      //   email: "sarah.johnson@techcorp.com",
      //   occupation: "software engineer"
      // }
      
      console.log('Token usage:', result.tokenUsage);
      console.log('Processing time:', result.processingTime, 'ms');
    } else {
      console.error('Validation errors:', result.errors);
    }
  } catch (error) {
    console.error('Service error:', error);
  }
}

// Run the example
extractPersonInfo();
```

## Configuration Options

The `StructuredLLMService` constructor accepts a configuration object:

```typescript
const llmService = new StructuredLLMService({
  // Provider settings
  defaultProvider: 'auto', // 'auto', 'openai', 'claude', 'gemini'
  
  // Retry configuration
  defaultRetryStrategy: 'exponential', // 'immediate', 'linear', 'exponential'
  defaultMaxRetries: 3,
  defaultTimeout: 30000, // 30 seconds
  
  // Performance features
  enableCaching: true, // Enable response caching
  enableLogging: true, // Enable structured logging
  
  // Provider-specific configurations (optional)
  providerConfigs: {
    openai: {
      defaultModel: 'gpt-4-turbo',
    },
    claude: {
      defaultModel: 'claude-3-5-sonnet-20241022',
    },
    gemini: {
      defaultModel: 'gemini-1.5-pro-latest',
    },
  },
});
```

## Understanding the Response

The `generate` method returns a `StructuredLLMResult` object:

```typescript
interface StructuredLLMResult<T> {
  success: boolean;           // Whether generation succeeded
  data?: T;                   // Validated data (if successful)
  errors?: ValidationError[]; // Validation errors (if failed)
  attempts: number;           // Number of retry attempts made
  tokenUsage: TokenUsage;     // Token consumption and cost info
  processingTime: number;     // Total processing time in ms
  provider: string;           // Provider used (e.g., 'openai')
  model: string;             // Specific model used
  rawResponse?: string;       // Raw LLM response for debugging
  metadata?: object;          // Additional provider metadata
}
```

## Error Handling

The service provides comprehensive error handling:

```typescript
const result = await llmService.generate({
  schema: PersonSchema,
  prompt: "Extract info from: Invalid data here",
});

if (!result.success) {
  // Handle validation errors
  result.errors?.forEach(error => {
    console.log(`Field '${error.field}': ${error.message}`);
  });
  
  // Check metadata for additional error context
  if (result.metadata?.error) {
    console.log('Error type:', result.metadata.errorType);
    console.log('Is validation error:', result.metadata.isValidationError);
  }
}
```

## Next Steps

Now that you have the basics working, explore these topics:

1. **[API Reference](./api-reference.md)** - Complete documentation of all methods and options
2. **[Examples](./examples.md)** - More complex use cases and patterns
3. **[Advanced Features](./advanced-features.md)** - Caching, performance optimization, and monitoring
4. **[Migration Guide](./migration-guide.md)** - If you're coming from instructor-js

## Common Issues

### API Key Not Found
```
Error: OpenAI API key is required. instructor-js v1.7.0 only supports OpenAI clients.
```
**Solution**: Ensure your `OPENAI_API_KEY` environment variable is set.

### Schema Validation Errors
```
Field 'age': Expected number, received string
```
**Solution**: Check that your Zod schema matches the expected data structure and add proper descriptions to guide the LLM.

### Timeout Errors
```
Request timeout after 30000ms
```
**Solution**: Increase the timeout in your configuration or use a simpler prompt.

## Support

If you encounter issues:
1. Check the [Examples](./examples.md) for similar use cases
2. Review the [API Reference](./api-reference.md) for detailed parameter information
3. Enable logging (`enableLogging: true`) to get detailed request information
4. Check the GitHub repository for known issues and solutions
