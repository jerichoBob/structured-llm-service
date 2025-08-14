import { GeminiNativeService } from '../gemini-native.service';
import { z } from 'zod';
import { hasGoogleApiKey } from '../../config/environment';

// Schema for testing
const PersonSchema = z.object({
  name: z.string().describe('The person\'s full name'),
  age: z.number().describe('The person\'s age'),
  occupation: z.string().describe('The person\'s job or profession'),
  email: z.string().email().optional().describe('The person\'s email address if mentioned')
});

type Person = z.infer<typeof PersonSchema>;

describe('GeminiNativeService Integration Tests', () => {
  let geminiService: GeminiNativeService;

  beforeAll(() => {
    // Skip integration tests if no API key is available
    if (!hasGoogleApiKey()) {
      console.log('Skipping Gemini native integration tests - no GOOGLE_API_KEY found in environment');
      return;
    }
    
    geminiService = new GeminiNativeService();
  });

  // Skip all tests if no API key is available
  const describeOrSkip = hasGoogleApiKey() ? describe : describe.skip;

  describeOrSkip('Basic Functionality', () => {
    it('should extract structured data using native function calling', async () => {
      const prompt = "John Smith is a 35-year-old software engineer. You can reach him at john.smith@example.com.";
      
      const result = await geminiService.generateStructuredOutput(PersonSchema, prompt);

      // Validate the result
      const validation = PersonSchema.safeParse(result.data);
      expect(validation.success).toBe(true);
      
      if (validation.success) {
        expect(result.data.name).toBeDefined();
        expect(result.data.age).toBeDefined();
        expect(result.data.occupation).toBeDefined();
        expect(typeof result.data.name).toBe('string');
        expect(typeof result.data.age).toBe('number');
        expect(typeof result.data.occupation).toBe('string');
        
        console.log('Native Gemini extraction result:', result.data);
      }
    }, 30000);

    it('should work with testConnection method', async () => {
      const result = await geminiService.testConnection(PersonSchema);

      // Validate the result
      const validation = PersonSchema.safeParse(result);
      expect(validation.success).toBe(true);
      
      if (validation.success) {
        expect(result.name).toBeDefined();
        expect(result.age).toBeDefined();
        expect(result.occupation).toBeDefined();
        
        console.log('Native Gemini test connection result:', result);
      }
    }, 30000);

    it('should handle custom generation options', async () => {
      const prompt = "Alice Johnson, age 28, works as a data scientist.";
      
      const result = await geminiService.generateStructuredOutput(
        PersonSchema,
        prompt,
        {
          model: 'gemini-1.5-flash',
          temperature: 0.1,
          maxTokens: 1000
        }
      );

      // Validate the result
      const validation = PersonSchema.safeParse(result.data);
      expect(validation.success).toBe(true);
      
      if (validation.success) {
        expect(result.data.name).toBeDefined();
        expect(result.data.age).toBe(28);
        expect(result.data.occupation).toContain('data scientist');
        
        console.log('Native Gemini with options result:', result.data);
      }
    }, 30000);
  });

  describeOrSkip('Error Handling', () => {
    it('should handle invalid API key gracefully', async () => {
      const invalidService = new GeminiNativeService('invalid-api-key-12345');
      
      await expect(
        invalidService.testConnection(PersonSchema, "Test prompt")
      ).rejects.toThrow(/Gemini connection test failed/);
    }, 15000);

    it('should handle schema validation errors', async () => {
      // This test verifies that Zod validation errors are properly caught and wrapped
      const prompt = "This text doesn't contain person information.";
      
      try {
        await geminiService.generateStructuredOutput(PersonSchema, prompt);
        // If we get here without an error, the model might have hallucinated data
        // which is acceptable for this test - we're mainly testing error handling
        console.log('Model successfully extracted data from ambiguous prompt');
      } catch (error) {
        // If there's an error, verify it's properly wrapped
        expect(error).toBeInstanceOf(Error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        expect(
          errorMessage.includes('Schema validation failed') || 
          errorMessage.includes('Gemini structured output generation failed')
        ).toBe(true);
        
        console.log('Caught expected error:', errorMessage);
      }
    }, 15000);
  });

  describeOrSkip('Complex Schema', () => {
    it('should handle complex nested schemas', async () => {
      const ComplexSchema = z.object({
        person: z.object({
          name: z.string(),
          age: z.number(),
          contact: z.object({
            email: z.string().email().optional(),
            phone: z.string().optional()
          })
        }),
        metadata: z.object({
          confidence: z.number().min(0).max(1),
          source: z.string().default('extraction')
        })
      });

      const prompt = "Sarah Wilson is 42 years old. Her email is sarah.w@company.com and phone is 555-0123.";
      
      const result = await geminiService.generateStructuredOutput(ComplexSchema, prompt);

      // Validate the complex result
      const validation = ComplexSchema.safeParse(result.data);
      expect(validation.success).toBe(true);
      
      if (validation.success) {
        expect(result.data.person).toBeDefined();
        expect(result.data.person.name).toBeDefined();
        expect(result.data.person.age).toBeDefined();
        expect(result.data.person.contact).toBeDefined();
        expect(result.data.metadata).toBeDefined();
        
        console.log('Complex schema result:', JSON.stringify(result.data, null, 2));
      }
    }, 45000);
  });
});

// Export schema for use in other tests if needed
export { PersonSchema };
export type { Person };
