# Structured LLM Service Documentation

A production-ready TypeScript wrapper around instructor-js that provides Pydantic-equivalent structured output functionality for Large Language Models.

## Table of Contents

1. [Getting Started](./getting-started.md) - Installation, setup, and quick start guide
2. [API Reference](./api-reference.md) - Complete API documentation
3. [Examples](./examples.md) - Practical code examples and use cases
4. [Migration Guide](./migration-guide.md) - Migrating from instructor-js
5. [Advanced Features](./advanced-features.md) - Caching, retries, and performance optimization

## Quick Links

- [Installation](#installation)
- [Basic Usage](#basic-usage)
- [Key Benefits](#key-benefits)

## Installation

```bash
npm install structured-llm-service
# or
pnpm add structured-llm-service
# or
yarn add structured-llm-service
```

## Basic Usage

```typescript
import { StructuredLLMService } from 'structured-llm-service';
import { z } from 'zod';

// Define your data structure with Zod
const PersonSchema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email(),
});

// Initialize the service
const llmService = new StructuredLLMService({
  enableLogging: true,
  enableCaching: true,
});

// Generate structured output
const result = await llmService.generate({
  schema: PersonSchema,
  prompt: "Extract person information from this text: John Doe is 30 years old and his email is john@example.com",
});

if (result.success) {
  console.log(result.data); // { name: "John Doe", age: 30, email: "john@example.com" }
}
```

## Key Benefits

- **Type Safety**: Full TypeScript support with Zod schema validation
- **Production Ready**: Built-in retry logic, error handling, and logging
- **Performance Optimized**: Response caching and schema caching
- **Multi-Provider Support**: Easy switching between LLM providers
- **Cost Tracking**: Automatic token usage and cost calculation
- **Developer Experience**: Simplified API compared to raw instructor-js

## Documentation Structure

Each section of the documentation is designed to be self-contained while building upon previous concepts:

- **Getting Started**: Perfect for new users who want to get up and running quickly
- **API Reference**: Comprehensive documentation for all methods and interfaces
- **Examples**: Real-world use cases and implementation patterns
- **Migration Guide**: For developers already familiar with instructor-js
- **Advanced Features**: Deep dive into performance optimization and advanced configurations

## Support

For issues, questions, or contributions, please refer to the project repository.
