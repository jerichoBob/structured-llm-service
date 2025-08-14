# Examples

This guide provides practical, copy-paste-friendly code examples that demonstrate how to use the Structured LLM Service effectively. Each example showcases different features and use cases.

## Table of Contents

- [Basic Data Extraction](#basic-data-extraction)
- [Complex Nested Structures](#complex-nested-structures)
- [Multi-Provider Usage](#multi-provider-usage)
- [Error Handling Patterns](#error-handling-patterns)
- [Performance Optimization](#performance-optimization)
- [Real-World Use Cases](#real-world-use-cases)

## Basic Data Extraction

### Simple Person Information

Extract basic person information from unstructured text:

```typescript
import { StructuredLLMService } from 'structured-llm-service';
import { z } from 'zod';

const PersonSchema = z.object({
  name: z.string().describe("The person's full name"),
  age: z.number().int().positive().describe("Age in years"),
  email: z.string().email().describe("Email address"),
  phone: z.string().optional().describe("Phone number if mentioned"),
});

const service = new StructuredLLMService();

async function extractPersonInfo() {
  const result = await service.generate({
    schema: PersonSchema,
    prompt: `Extract person information from this text:
      "Hello, I'm Dr. Sarah Johnson, a 34-year-old researcher. 
      You can reach me at sarah.johnson@university.edu or call me at (555) 123-4567."`,
  });

  if (result.success) {
    console.log('Extracted:', result.data);
    // Output: {
    //   name: "Dr. Sarah Johnson",
    //   age: 34,
    //   email: "sarah.johnson@university.edu",
    //   phone: "(555) 123-4567"
    // }
  }
}
```

### Product Information Extraction

Extract structured product data from descriptions:

```typescript
const ProductSchema = z.object({
  name: z.string().describe("Product name"),
  price: z.number().positive().describe("Price in USD"),
  category: z.string().describe("Product category"),
  features: z.array(z.string()).describe("List of key features"),
  inStock: z.boolean().describe("Whether the product is in stock"),
});

async function extractProductInfo() {
  const result = await service.generate({
    schema: ProductSchema,
    prompt: `Extract product information:
      "The UltraBook Pro 15 is a premium laptop priced at $1,299. 
      This computer features a 15-inch 4K display, 16GB RAM, 512GB SSD, 
      and 10-hour battery life. Currently available in our electronics section."`,
  });

  if (result.success) {
    console.log('Product:', result.data);
    // Output: {
    //   name: "UltraBook Pro 15",
    //   price: 1299,
    //   category: "electronics",
    //   features: ["15-inch 4K display", "16GB RAM", "512GB SSD", "10-hour battery life"],
    //   inStock: true
    // }
  }
}
```

## Complex Nested Structures

### Company Organization Chart

Extract hierarchical organizational data:

```typescript
const EmployeeSchema = z.object({
  name: z.string(),
  title: z.string(),
  email: z.string().email(),
  department: z.string(),
});

const DepartmentSchema = z.object({
  name: z.string().describe("Department name"),
  manager: EmployeeSchema.describe("Department manager"),
  employees: z.array(EmployeeSchema).describe("Department employees"),
  budget: z.number().optional().describe("Annual budget if mentioned"),
});

const CompanySchema = z.object({
  name: z.string().describe("Company name"),
  departments: z.array(DepartmentSchema).describe("Company departments"),
  totalEmployees: z.number().describe("Total number of employees"),
});

async function extractCompanyStructure() {
  const result = await service.generate({
    schema: CompanySchema,
    prompt: `Extract company structure from:
      "TechCorp Inc. has 45 employees across three departments. 
      The Engineering department is led by Alice Smith (alice@techcorp.com) 
      and includes developers Bob Jones (bob@techcorp.com) and Carol White (carol@techcorp.com).
      The Marketing department is managed by David Brown (david@techcorp.com) 
      with a team of 5 people and an annual budget of $500,000.
      HR is run by Eve Davis (eve@techcorp.com) with 2 staff members."`,
  });

  if (result.success) {
    console.log('Company Structure:', JSON.stringify(result.data, null, 2));
  }
}
```

### Invoice Processing

Extract detailed invoice information:

```typescript
const LineItemSchema = z.object({
  description: z.string().describe("Item description"),
  quantity: z.number().positive().describe("Quantity ordered"),
  unitPrice: z.number().positive().describe("Price per unit"),
  total: z.number().positive().describe("Line item total"),
});

const InvoiceSchema = z.object({
  invoiceNumber: z.string().describe("Invoice number"),
  date: z.string().describe("Invoice date"),
  vendor: z.object({
    name: z.string(),
    address: z.string(),
    phone: z.string().optional(),
  }),
  customer: z.object({
    name: z.string(),
    address: z.string(),
    email: z.string().email().optional(),
  }),
  lineItems: z.array(LineItemSchema),
  subtotal: z.number().positive(),
  tax: z.number().nonnegative(),
  total: z.number().positive(),
});

async function processInvoice(invoiceText: string) {
  const result = await service.generate({
    schema: InvoiceSchema,
    prompt: "Extract all invoice information from this document:",
    content: invoiceText,
    temperature: 0.1, // Low temperature for accuracy
  });

  if (result.success) {
    console.log('Invoice processed:', result.data);
    console.log('Total amount:', result.data.total);
    console.log('Number of items:', result.data.lineItems.length);
  } else {
    console.error('Invoice processing failed:', result.errors);
  }
}
```

## Multi-Provider Usage

### Provider Switching

Demonstrate how to easily switch between different LLM providers:

```typescript
const service = new StructuredLLMService({
  enableLogging: true,
});

const TaskSchema = z.object({
  title: z.string(),
  priority: z.enum(['low', 'medium', 'high']),
  dueDate: z.string().optional(),
  assignee: z.string().optional(),
});

async function compareProviders() {
  const prompt = "Extract task info: 'Fix the login bug - high priority, assign to John, due Friday'";

  // Try OpenAI first
  const openaiResult = await service.generate({
    schema: TaskSchema,
    prompt,
    provider: 'openai',
    model: 'gpt-4-turbo',
  });

  console.log('OpenAI result:', openaiResult.data);
  console.log('OpenAI cost:', openaiResult.tokenUsage.estimatedCost);

  // Fallback to auto-selection if needed
  if (!openaiResult.success) {
    const autoResult = await service.generate({
      schema: TaskSchema,
      prompt,
      provider: 'auto', // Automatically selects best available
    });

    console.log('Auto-selected provider:', autoResult.provider);
    console.log('Result:', autoResult.data);
  }
}
```

### Provider-Specific Configuration

Configure different settings for different providers:

```typescript
const service = new StructuredLLMService({
  providerConfigs: {
    openai: {
      defaultModel: 'gpt-4-turbo',
    },
    claude: {
      defaultModel: 'claude-3-5-sonnet-20241022',
    },
  },
});

async function useProviderSpecificSettings() {
  const schema = z.object({
    sentiment: z.enum(['positive', 'negative', 'neutral']),
    confidence: z.number().min(0).max(1),
  });

  // Use OpenAI with specific options
  const openaiResult = await service.generate({
    schema,
    prompt: "Analyze sentiment: 'I love this product!'",
    provider: 'openai',
    temperature: 0.3,
    providerOptions: {
      top_p: 0.9,
      frequency_penalty: 0.1,
    },
  });

  console.log('OpenAI analysis:', openaiResult.data);
}
```

## Error Handling Patterns

### Comprehensive Error Handling

Handle different types of errors gracefully:

```typescript
const UserSchema = z.object({
  username: z.string().min(3).max(20),
  email: z.string().email(),
  age: z.number().int().min(13).max(120),
  preferences: z.object({
    newsletter: z.boolean(),
    theme: z.enum(['light', 'dark']),
  }),
});

async function robustUserExtraction(text: string) {
  try {
    const result = await service.generate({
      schema: UserSchema,
      prompt: "Extract user information from this text:",
      content: text,
      maxRetries: 3,
      retryStrategy: 'exponential',
      timeout: 30000,
    });

    if (result.success) {
      console.log('User extracted successfully:', result.data);
      console.log('Processing time:', result.processingTime, 'ms');
      console.log('Attempts made:', result.attempts);
      return result.data;
    } else {
      // Handle validation errors
      console.error('Validation failed:');
      result.errors?.forEach(error => {
        console.error(`- ${error.field}: ${error.message}`);
        if (error.value !== undefined) {
          console.error(`  Received: ${JSON.stringify(error.value)}`);
        }
      });

      // Check for specific error types
      if (result.metadata?.isValidationError) {
        console.log('This was a schema validation error');
      }

      return null;
    }
  } catch (error) {
    // Handle service-level errors
    if (error.message.includes('API key')) {
      console.error('Configuration error: Missing or invalid API key');
    } else if (error.message.includes('timeout')) {
      console.error('Request timed out - try increasing timeout or simplifying prompt');
    } else if (error.message.includes('rate limit')) {
      console.error('Rate limit exceeded - implement backoff strategy');
    } else {
      console.error('Unexpected error:', error.message);
    }
    return null;
  }
}
```

### Retry with Custom Logic

Implement custom retry logic with error callbacks:

```typescript
async function extractWithCustomRetry() {
  const result = await service.generate({
    schema: z.object({
      summary: z.string().max(100),
      keywords: z.array(z.string()).max(5),
    }),
    prompt: "Summarize this article and extract keywords:",
    content: "Very long article content...",
    maxRetries: {
      max_attempts: 5,
      backoff_factor: 2,
      initial_delay: 1000,
      max_delay: 30000,
      jitter: true,
      on_error: (error) => {
        console.log(`Retry attempt failed: ${error.message}`);
        // Could implement custom logic here:
        // - Log to monitoring system
        // - Switch providers
        // - Adjust parameters
      },
    },
  });

  return result;
}
```

## Performance Optimization

### Response Caching

Leverage caching for improved performance and cost reduction:

```typescript
const cachedService = new StructuredLLMService({
  enableCaching: true,
  enableLogging: true,
});

const CategorySchema = z.object({
  category: z.string(),
  subcategory: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

async function demonstrateCaching() {
  const prompt = "Categorize this product: 'iPhone 15 Pro Max 256GB'";

  // First call - hits the API
  console.time('First call');
  const result1 = await cachedService.generate({
    schema: CategorySchema,
    prompt,
  });
  console.timeEnd('First call');
  console.log('Cache hit:', result1.metadata?.cacheHit); // false

  // Second identical call - returns cached result
  console.time('Second call');
  const result2 = await cachedService.generate({
    schema: CategorySchema,
    prompt, // Identical prompt
  });
  console.timeEnd('Second call');
  console.log('Cache hit:', result2.metadata?.cacheHit); // true
  console.log('Processing time:', result2.processingTime, 'ms'); // Much faster

  // Check cache statistics
  console.log('Cache stats:', result2.metadata?.responseCache?.stats);
}
```

### Schema Optimization

Optimize schemas for better performance and accuracy:

```typescript
// ❌ Poor schema - too generic
const BadSchema = z.object({
  data: z.any(),
  info: z.string(),
});

// ✅ Good schema - specific and descriptive
const GoodSchema = z.object({
  productName: z.string()
    .min(1)
    .max(100)
    .describe("The exact name of the product as mentioned"),
  
  price: z.number()
    .positive()
    .describe("Price in USD, extract numeric value only"),
  
  availability: z.enum(['in-stock', 'out-of-stock', 'pre-order'])
    .describe("Current availability status"),
  
  specifications: z.object({
    dimensions: z.string().optional().describe("Physical dimensions if mentioned"),
    weight: z.string().optional().describe("Weight if specified"),
    color: z.string().optional().describe("Available colors"),
  }).describe("Technical specifications"),
  
  rating: z.number()
    .min(0)
    .max(5)
    .optional()
    .describe("Customer rating out of 5 stars"),
});

async function optimizedExtraction() {
  const result = await service.generate({
    schema: GoodSchema,
    prompt: "Extract product information with high accuracy:",
    content: "Product listing content...",
    temperature: 0.1, // Low temperature for consistency
    maxTokens: 500,   // Reasonable limit
  });

  return result;
}
```

## Real-World Use Cases

### Email Processing System

Build an email classification and extraction system:

```typescript
const EmailSchema = z.object({
  classification: z.enum([
    'customer-support',
    'sales-inquiry',
    'bug-report',
    'feature-request',
    'spam',
    'other'
  ]).describe("Email category"),
  
  priority: z.enum(['low', 'medium', 'high', 'urgent'])
    .describe("Priority level based on content"),
  
  sender: z.object({
    name: z.string().optional(),
    email: z.string().email(),
    company: z.string().optional(),
  }),
  
  subject: z.string().describe("Email subject line"),
  
  keyPoints: z.array(z.string())
    .max(5)
    .describe("Main points or requests from the email"),
  
  actionRequired: z.boolean()
    .describe("Whether this email requires action"),
  
  suggestedResponse: z.string()
    .optional()
    .describe("Suggested response or next steps"),
});

class EmailProcessor {
  private service: StructuredLLMService;

  constructor() {
    this.service = new StructuredLLMService({
      enableCaching: true,
      enableLogging: true,
      defaultProvider: 'auto',
    });
  }

  async processEmail(emailContent: string) {
    const result = await this.service.generate({
      schema: EmailSchema,
      prompt: `Analyze this email and extract structured information.
        Focus on classification, priority, and actionable items:`,
      content: emailContent,
      temperature: 0.2,
    });

    if (result.success) {
      const email = result.data;
      
      // Route based on classification
      switch (email.classification) {
        case 'customer-support':
          await this.routeToSupport(email);
          break;
        case 'sales-inquiry':
          await this.routeToSales(email);
          break;
        case 'bug-report':
          await this.createBugTicket(email);
          break;
        default:
          await this.routeToGeneral(email);
      }

      return email;
    } else {
      console.error('Email processing failed:', result.errors);
      return null;
    }
  }

  private async routeToSupport(email: any) {
    console.log(`Routing ${email.priority} priority support email to team`);
  }

  private async routeToSales(email: any) {
    console.log(`New sales inquiry from ${email.sender.company || email.sender.email}`);
  }

  private async createBugTicket(email: any) {
    console.log(`Creating bug ticket: ${email.keyPoints.join(', ')}`);
  }

  private async routeToGeneral(email: any) {
    console.log(`General email classified as: ${email.classification}`);
  }
}

// Usage
const processor = new EmailProcessor();
await processor.processEmail(`
  From: john.doe@acmecorp.com
  Subject: Critical bug in payment system
  
  Hi team,
  
  We're experiencing a critical issue with the payment processing system.
  Customers are unable to complete purchases, and we're losing revenue.
  This needs immediate attention.
  
  Steps to reproduce:
  1. Add items to cart
  2. Proceed to checkout
  3. Enter payment details
  4. System throws error "Payment gateway unavailable"
  
  Please prioritize this fix.
  
  Best regards,
  John Doe
  CTO, Acme Corp
`);
```

### Document Analysis Pipeline

Create a document analysis system for legal or business documents:

```typescript
const ContractSchema = z.object({
  documentType: z.enum([
    'service-agreement',
    'employment-contract',
    'nda',
    'purchase-order',
    'lease-agreement',
    'other'
  ]),
  
  parties: z.array(z.object({
    name: z.string(),
    role: z.enum(['client', 'vendor', 'employee', 'employer', 'landlord', 'tenant']),
    address: z.string().optional(),
  })),
  
  keyTerms: z.object({
    effectiveDate: z.string().optional(),
    expirationDate: z.string().optional(),
    paymentAmount: z.number().optional(),
    paymentSchedule: z.string().optional(),
  }),
  
  obligations: z.array(z.object({
    party: z.string(),
    obligation: z.string(),
  })),
  
  riskFactors: z.array(z.string())
    .describe("Potential risks or concerning clauses"),
  
  summary: z.string()
    .max(500)
    .describe("Brief summary of the contract"),
});

async function analyzeContract(contractText: string) {
  const service = new StructuredLLMService({
    enableLogging: true,
  });

  const result = await service.generate({
    schema: ContractSchema,
    prompt: `Analyze this legal document and extract key information.
      Pay special attention to parties, terms, obligations, and potential risks:`,
    content: contractText,
    temperature: 0.1, // Very low for legal accuracy
    maxTokens: 2000,
  });

  if (result.success) {
    const contract = result.data;
    
    console.log('Document Analysis Complete:');
    console.log('Type:', contract.documentType);
    console.log('Parties:', contract.parties.map(p => `${p.name} (${p.role})`).join(', '));
    console.log('Risk Factors:', contract.riskFactors.length);
    
    // Generate risk report
    if (contract.riskFactors.length > 0) {
      console.log('\n⚠️  Risk Assessment:');
      contract.riskFactors.forEach((risk, index) => {
        console.log(`${index + 1}. ${risk}`);
      });
    }

    return contract;
  } else {
    console.error('Contract analysis failed:', result.errors);
    return null;
  }
}
```

### Content Moderation System

Build an automated content moderation system:

```typescript
const ModerationSchema = z.object({
  overallScore: z.number().min(0).max(10)
    .describe("Overall safety score (0=unsafe, 10=completely safe)"),
  
  categories: z.object({
    hate: z.number().min(0).max(10),
    violence: z.number().min(0).max(10),
    sexual: z.number().min(0).max(10),
    harassment: z.number().min(0).max(10),
    selfHarm: z.number().min(0).max(10),
    spam: z.number().min(0).max(10),
  }).describe("Scores for specific categories"),
  
  action: z.enum(['approve', 'review', 'reject'])
    .describe("Recommended moderation action"),
  
  reasoning: z.string()
    .describe("Explanation for the moderation decision"),
  
  flaggedPhrases: z.array(z.string())
    .describe("Specific phrases that triggered concerns"),
  
  suggestions: z.array(z.string())
    .optional()
    .describe("Suggestions for improving the content if applicable"),
});

class ContentModerator {
  private service: StructuredLLMService;

  constructor() {
    this.service = new StructuredLLMService({
      enableCaching: true,
      defaultProvider: 'auto',
    });
  }

  async moderateContent(content: string, contentType: 'post' | 'comment' | 'message' = 'post') {
    const result = await this.service.generate({
      schema: ModerationSchema,
      prompt: `Analyze this ${contentType} for safety and appropriateness.
        Consider hate speech, violence, harassment, spam, and other harmful content.
        Provide detailed scoring and actionable recommendations:`,
      content,
      temperature: 0.2,
    });

    if (result.success) {
      const moderation = result.data;
      
      // Log moderation decision
      console.log(`Content moderation: ${moderation.action.toUpperCase()}`);
      console.log(`Overall score: ${moderation.overallScore}/10`);
      console.log(`Reasoning: ${moderation.reasoning}`);

      // Take action based on score
      if (moderation.overallScore < 3) {
        await this.rejectContent(content, moderation);
      } else if (moderation.overallScore < 7) {
        await this.flagForReview(content, moderation);
      } else {
        await this.approveContent(content, moderation);
      }

      return moderation;
    } else {
      console.error('Moderation failed:', result.errors);
      // Default to manual review on failure
      await this.flagForReview(content, null);
      return null;
    }
  }

  private async rejectContent(content: string, moderation: any) {
    console.log('🚫 Content rejected automatically');
    // Implement rejection logic
  }

  private async flagForReview(content: string, moderation: any) {
    console.log('⚠️  Content flagged for manual review');
    // Implement review queue logic
  }

  private async approveContent(content: string, moderation: any) {
    console.log('✅ Content approved');
    // Implement approval logic
  }
}

// Usage
const moderator = new ContentModerator();
await moderator.moderateContent(
  "This is a sample post that needs to be checked for safety.",
  'post'
);
```

## Best Practices Summary

Based on these examples, here are key best practices:

1. **Schema Design**: Use specific, well-described schemas with appropriate constraints
2. **Error Handling**: Always check `result.success` and handle validation errors gracefully
3. **Performance**: Enable caching for repeated operations and use appropriate temperature settings
4. **Retry Logic**: Implement robust retry strategies for production systems
5. **Logging**: Enable logging for debugging and monitoring
6. **Provider Selection**: Use 'auto' for reliability or specific providers for consistency
7. **Token Management**: Set reasonable `maxTokens` limits and monitor costs
8. **Temperature Settings**: Use low temperatures (0.1-0.3) for factual extraction, higher for creative tasks

## Next Steps

- Review the [API Reference](./api-reference.md) for complete method documentation
- Check the [Migration Guide](./migration-guide.md) if you're coming from instructor-js
- Explore [Advanced Features](./advanced-features.md) for performance optimization
