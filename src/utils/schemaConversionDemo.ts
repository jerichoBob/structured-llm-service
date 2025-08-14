import { z } from 'zod';
import { createInstructorClient } from './instructorClient.js';

/**
 * Demonstration of instructor-js built-in schema conversion capabilities
 * This module shows how instructor-js automatically handles:
 * 1. Zod schema to JSON Schema conversion
 * 2. Validation and retry logic
 * 3. Type-safe structured outputs
 */

// Example schemas demonstrating different Zod features
export const UserSchema = z.object({
  name: z.string().describe('Full name of the user'),
  email: z.string().email().describe('Valid email address'),
  age: z.number().min(0).max(150).describe('Age in years'),
  isActive: z.boolean().describe('Whether the user account is active'),
});

export const ProductSchema = z.object({
  name: z.string().min(1).describe('Product name'),
  price: z.number().positive().describe('Price in USD'),
  category: z.enum(['electronics', 'clothing', 'books', 'home']).describe('Product category'),
  tags: z.array(z.string()).describe('Product tags'),
  inStock: z.boolean().describe('Whether the product is in stock'),
  description: z.string().optional().describe('Optional product description'),
});

export const CompanySchema = z.object({
  name: z.string().describe('Company name'),
  founded: z.number().int().min(1800).max(new Date().getFullYear()).describe('Year founded'),
  employees: z.array(z.object({
    name: z.string().describe('Employee name'),
    position: z.string().describe('Job position'),
    department: z.string().describe('Department'),
    salary: z.number().positive().optional().describe('Annual salary in USD'),
  })).describe('List of employees'),
  headquarters: z.object({
    street: z.string().describe('Street address'),
    city: z.string().describe('City'),
    state: z.string().describe('State or province'),
    country: z.string().describe('Country'),
    zipCode: z.string().describe('Postal code'),
  }).describe('Company headquarters address'),
});

/**
 * Utility function to demonstrate schema conversion
 * This shows how instructor-js accepts Zod schemas directly
 */
export function createSchemaExtractionClient(provider: 'claude' | 'gemini' = 'claude'): any {
  return createInstructorClient({
    provider,
    apiKey: process.env[`${provider.toUpperCase()}_API_KEY`] || 'demo-key',
    mode: 'TOOLS', // instructor-js will automatically use the best mode for the provider
  });
}

/**
 * Example function showing how to use instructor-js with Zod schemas
 * This demonstrates the key benefit: no manual schema conversion needed
 */
export async function extractUserInfo(text: string, client: any) {
  // instructor-js automatically:
  // 1. Converts the Zod schema to the appropriate format (JSON Schema, tool definition, etc.)
  // 2. Sends it to the LLM with proper formatting
  // 3. Validates the response against the schema
  // 4. Retries if validation fails
  // 5. Returns a properly typed result
  
  return await client.chat.completions.create({
    messages: [
      {
        role: 'user',
        content: `Extract user information from this text: ${text}`,
      },
    ],
    model: 'gpt-4-turbo',
    response_model: {
      schema: UserSchema,
      name: 'User',
    },
    max_retries: 3, // instructor-js handles retries automatically
  });
}

/**
 * Example showing complex nested schema extraction
 */
export async function extractCompanyInfo(text: string, client: any) {
  return await client.chat.completions.create({
    messages: [
      {
        role: 'user',
        content: `Extract company information from this text: ${text}`,
      },
    ],
    model: 'gpt-4-turbo',
    response_model: {
      schema: CompanySchema,
      name: 'Company',
    },
    max_retries: 3,
  });
}

/**
 * Demonstration of instructor-js key benefits:
 * 
 * 1. **No Manual Schema Conversion**: 
 *    - You don't need to convert Zod schemas to JSON Schema manually
 *    - instructor-js handles this automatically for each provider
 * 
 * 2. **Automatic Validation**: 
 *    - instructor-js validates LLM responses against your Zod schema
 *    - Invalid responses trigger automatic retries
 * 
 * 3. **Type Safety**: 
 *    - Results are properly typed based on your Zod schema
 *    - TypeScript knows the exact shape of the returned data
 * 
 * 4. **Provider Abstraction**: 
 *    - Same schema works across OpenAI, Claude, Gemini
 *    - instructor-js handles provider-specific formatting
 * 
 * 5. **Built-in Retry Logic**: 
 *    - Automatic retries on validation failures
 *    - Configurable retry limits
 * 
 * 6. **Rich Schema Support**: 
 *    - Supports all Zod features: descriptions, validations, nested objects, arrays, enums
 *    - Preserves validation rules and error messages
 */

// Type exports for use in other modules
export type User = z.infer<typeof UserSchema>;
export type Product = z.infer<typeof ProductSchema>;
export type Company = z.infer<typeof CompanySchema>;
