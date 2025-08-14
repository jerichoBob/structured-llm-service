import { GeminiService } from '../gemini.service';
import { z } from 'zod';
import { hasGoogleApiKey } from '../../config/environment';
import { HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

// Schema for testing Gemini-specific features
const ContentAnalysisSchema = z.object({
  topic: z.string().describe('The main topic of the content'),
  sentiment: z.enum(['positive', 'negative', 'neutral']).describe('Overall sentiment'),
  keyPoints: z.array(z.string()).describe('Key points or themes identified'),
  safetyLevel: z.enum(['safe', 'caution', 'unsafe']).describe('Content safety assessment')
});

type ContentAnalysis = z.infer<typeof ContentAnalysisSchema>;

describe('Gemini-Specific Features Integration Tests', () => {
  let geminiService: GeminiService;

  beforeAll(() => {
    // Skip integration tests if no API key is available
    if (!hasGoogleApiKey()) {
      console.log('Skipping Gemini features integration tests - no GOOGLE_API_KEY found in environment');
      return;
    }
    
    geminiService = new GeminiService();
  });

  // Skip all tests if no API key is available
  const describeOrSkip = hasGoogleApiKey() ? describe : describe.skip;

  describeOrSkip('Safety Settings', () => {
    it('should handle content with safety settings configured', async () => {
      const prompt = "Analyze this business content: 'Our company focuses on sustainable technology solutions for renewable energy.'";
      
      // Test with safety settings (these would be passed through to the Gemini API)
      const result = await geminiService.generateStructuredOutput(
        ContentAnalysisSchema,
        prompt,
        {
          model: 'gemini-1.5-flash',
          temperature: 0.3,
          safetySettings: [
            {
              category: HarmCategory.HARM_CATEGORY_HARASSMENT,
              threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
            },
            {
              category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
              threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
            }
          ]
        }
      );

      // Validate the result
      const validation = ContentAnalysisSchema.safeParse(result);
      expect(validation.success).toBe(true);
      
      if (validation.success) {
        expect(result.topic).toBeDefined();
        expect(result.sentiment).toBeDefined();
        expect(result.keyPoints).toBeDefined();
        expect(Array.isArray(result.keyPoints)).toBe(true);
        
        console.log('Content analysis with safety settings:', result);
      }
    }, 30000);
  });

  describeOrSkip('Generation Configuration', () => {
    it('should work with custom generation configuration', async () => {
      const prompt = "Analyze this technology content: 'Artificial intelligence is transforming healthcare through machine learning algorithms and predictive analytics.'";
      
      // Test with generation configuration
      const result = await geminiService.generateStructuredOutput(
        ContentAnalysisSchema,
        prompt,
        {
          model: 'gemini-1.5-flash',
          temperature: 0.1, // Low temperature for consistent results
          maxTokens: 1000,
          generationConfig: {
            temperature: 0.1,
            topP: 0.8,
            topK: 40,
            maxOutputTokens: 1000,
          }
        }
      );

      // Validate the result
      const validation = ContentAnalysisSchema.safeParse(result);
      expect(validation.success).toBe(true);
      
      if (validation.success) {
        expect(result.topic).toBeDefined();
        expect(result.sentiment).toBeDefined();
        expect(result.keyPoints).toBeDefined();
        expect(result.keyPoints.length).toBeGreaterThan(0);
        
        console.log('Content analysis with generation config:', result);
      }
    }, 30000);

    it('should handle different temperature settings', async () => {
      const prompt = "Analyze: 'Innovation drives progress in technology sectors.'";
      
      // Test with higher temperature for more creative responses
      const result = await geminiService.generateStructuredOutput(
        ContentAnalysisSchema,
        prompt,
        {
          model: 'gemini-1.5-flash',
          temperature: 0.8, // Higher temperature
        }
      );

      // Validate the result
      const validation = ContentAnalysisSchema.safeParse(result);
      expect(validation.success).toBe(true);
      
      if (validation.success) {
        expect(result.topic).toBeDefined();
        expect(result.sentiment).toBeDefined();
        
        console.log('Content analysis with high temperature:', result);
      }
    }, 30000);
  });

  describeOrSkip('Error Handling', () => {
    it('should handle invalid API key gracefully', async () => {
      const invalidService = new GeminiService('invalid-api-key-12345');
      
      await expect(
        invalidService.testConnection(ContentAnalysisSchema, "Test prompt")
      ).rejects.toThrow(/Gemini connection test failed/);
    }, 15000);

    it('should handle network errors gracefully', async () => {
      // This test verifies that network-related errors are properly caught and wrapped
      const prompt = "Analyze this content for testing error handling.";
      
      try {
        // Use an invalid model name to trigger an error
        await geminiService.generateStructuredOutput(
          ContentAnalysisSchema,
          prompt,
          {
            model: 'invalid-model-name-that-does-not-exist'
          }
        );
        
        // If we get here, the test should fail because we expected an error
        fail('Expected an error to be thrown for invalid model name');
      } catch (error) {
        // Verify that the error is properly wrapped
        expect(error).toBeInstanceOf(Error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        expect(errorMessage).toContain('Gemini structured output generation failed');
        
        console.log('Caught expected error:', errorMessage);
      }
    }, 15000);

    it('should handle malformed prompts gracefully', async () => {
      // Test with an empty prompt
      try {
        await geminiService.testConnection(ContentAnalysisSchema, "");
        
        // If we get here, either the API handled it gracefully or returned a valid response
        console.log('Empty prompt was handled successfully');
      } catch (error) {
        // Verify that the error is properly wrapped
        expect(error).toBeInstanceOf(Error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        expect(errorMessage).toContain('Gemini connection test failed');
        
        console.log('Empty prompt error handled correctly:', errorMessage);
      }
    }, 15000);
  });

  describeOrSkip('Model Variations', () => {
    it('should work with different Gemini models', async () => {
      const prompt = "Analyze: 'Cloud computing enables scalable infrastructure solutions.'";
      
      // Test with gemini-1.5-flash (default)
      const result = await geminiService.generateStructuredOutput(
        ContentAnalysisSchema,
        prompt,
        {
          model: 'gemini-1.5-flash',
          temperature: 0.2
        }
      );

      // Validate the result
      const validation = ContentAnalysisSchema.safeParse(result);
      expect(validation.success).toBe(true);
      
      if (validation.success) {
        expect(result.topic).toBeDefined();
        expect(result.sentiment).toBeDefined();
        
        console.log('Analysis with gemini-1.5-flash:', result);
      }
    }, 30000);
  });

  describeOrSkip('Complex Schema Validation', () => {
    it('should handle complex nested schemas', async () => {
      const ComplexSchema = z.object({
        analysis: z.object({
          summary: z.string(),
          details: z.object({
            strengths: z.array(z.string()),
            weaknesses: z.array(z.string()),
            opportunities: z.array(z.string())
          })
        }),
        metadata: z.object({
          confidence: z.number().min(0).max(1),
          processingTime: z.string(),
          version: z.string().default('1.0')
        })
      });

      const prompt = "Perform a comprehensive analysis of this business strategy: 'Focus on digital transformation through cloud adoption and AI integration.'";
      
      const result = await geminiService.generateStructuredOutput(
        ComplexSchema,
        prompt,
        {
          model: 'gemini-1.5-flash',
          temperature: 0.3
        }
      );

      // Validate the complex result
      const validation = ComplexSchema.safeParse(result);
      expect(validation.success).toBe(true);
      
      if (validation.success) {
        expect(result.analysis).toBeDefined();
        expect(result.analysis.summary).toBeDefined();
        expect(result.analysis.details).toBeDefined();
        expect(result.metadata).toBeDefined();
        
        console.log('Complex schema analysis:', JSON.stringify(result, null, 2));
      }
    }, 45000); // Longer timeout for complex processing
  });
});

// Export schemas for use in other tests if needed
export { ContentAnalysisSchema };
export type { ContentAnalysis };
