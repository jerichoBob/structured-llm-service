import { GeminiService } from '../gemini.service';
import { z } from 'zod';
import { hasGoogleApiKey } from '../../config/environment';

// Simple Zod schema for testing structured output
const PersonSchema = z.object({
  name: z.string().describe('The person\'s full name'),
  role: z.string().describe('The person\'s job title or role'),
  age: z.number().optional().describe('The person\'s age if mentioned'),
  company: z.string().optional().describe('The company they work for if mentioned')
});

type Person = z.infer<typeof PersonSchema>;

describe('GeminiService Integration Tests', () => {
  let geminiService: GeminiService;

  beforeAll(() => {
    // Skip integration tests if no API key is available
    if (!hasGoogleApiKey()) {
      console.log('Skipping Gemini integration tests - no GOOGLE_API_KEY found in environment');
      return;
    }
    
    geminiService = new GeminiService();
  });

  // Skip all tests if no API key is available
  const describeOrSkip = hasGoogleApiKey() ? describe : describe.skip;

  describeOrSkip('Basic Structured Output with Zod', () => {
    it('should extract structured data from a simple prompt', async () => {
      const prompt = "Extract information about a person named John Doe who works as a software engineer at Google.";
      
      const result = await geminiService.testConnection(PersonSchema, prompt);
      
      // Validate the result matches our schema
      expect(PersonSchema.safeParse(result).success).toBe(true);
      
      // Check that we got reasonable data
      expect(result.name).toBeDefined();
      expect(result.role).toBeDefined();
      expect(typeof result.name).toBe('string');
      expect(typeof result.role).toBe('string');
      
      // Log the result for manual verification
      console.log('Extracted person data:', result);
    }, 30000); // 30 second timeout for API calls

    it('should handle different prompts and extract appropriate data', async () => {
      const prompt = "Tell me about Sarah Johnson, a 28-year-old marketing manager at Microsoft.";
      
      const result = await geminiService.testConnection(PersonSchema, prompt);
      
      // Validate the result matches our schema
      const parseResult = PersonSchema.safeParse(result);
      expect(parseResult.success).toBe(true);
      
      if (parseResult.success) {
        const person = parseResult.data;
        expect(person.name).toBeDefined();
        expect(person.role).toBeDefined();
        expect(typeof person.name).toBe('string');
        expect(typeof person.role).toBe('string');
        
        // Log the result for manual verification
        console.log('Extracted person data (test 2):', person);
      }
    }, 30000);

    it('should work with generateStructuredOutput method', async () => {
      const prompt = "Extract information about Dr. Alice Smith, a 35-year-old research scientist at OpenAI.";
      
      const result = await geminiService.generateStructuredOutput(
        PersonSchema,
        prompt,
        {
          model: 'gemini-1.5-flash',
          temperature: 0.1 // Low temperature for more consistent results
        }
      );
      
      // Validate the result matches our schema
      const parseResult = PersonSchema.safeParse(result);
      expect(parseResult.success).toBe(true);
      
      if (parseResult.success) {
        const person = parseResult.data;
        expect(person.name).toBeDefined();
        expect(person.role).toBeDefined();
        expect(typeof person.name).toBe('string');
        expect(typeof person.role).toBe('string');
        
        // Log the result for manual verification
        console.log('Extracted person data (generateStructuredOutput):', person);
      }
    }, 30000);
  });

  describeOrSkip('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      // Create a service with an invalid API key to test error handling
      const invalidService = new GeminiService('invalid-api-key');
      
      await expect(
        invalidService.testConnection(PersonSchema, "Test prompt")
      ).rejects.toThrow();
    }, 15000);
  });

  describeOrSkip('Schema Validation', () => {
    it('should validate that returned data conforms to Zod schema', async () => {
      const prompt = "Extract information about Bob Wilson, a data analyst.";
      
      const result = await geminiService.testConnection(PersonSchema, prompt);
      
      // The result should be valid according to our schema
      const validation = PersonSchema.safeParse(result);
      expect(validation.success).toBe(true);
      
      if (!validation.success) {
        console.error('Schema validation errors:', validation.error.errors);
        fail('Result does not conform to expected schema');
      }
      
      // Check required fields are present
      expect(result.name).toBeDefined();
      expect(result.role).toBeDefined();
      expect(typeof result.name).toBe('string');
      expect(typeof result.role).toBe('string');
      
      console.log('Schema validation passed for:', result);
    }, 30000);
  });
});

// Export the schema for use in other tests if needed
export { PersonSchema };
export type { Person };
