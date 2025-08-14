import { GoogleGenerativeAI, GenerationConfig, SafetySetting } from '@google/generative-ai';
import instructor from '@instructor-ai/instructor';
import { z } from 'zod';
import { validateGoogleApiKey, EnvironmentConfigError } from '../config/environment.js';

/**
 * Gemini Service for structured LLM interactions using instructor-js
 * 
 * This service provides a configured instructor client for Google's Gemini model,
 * enabling structured output generation with Zod schema validation.
 */
export class GeminiService {
  private googleClient: GoogleGenerativeAI;
  private instructorClient: any; // instructor returns a patched client with additional methods
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || this.loadApiKey();
    this.googleClient = new GoogleGenerativeAI(this.apiKey);
    this.instructorClient = this.createInstructorClient();
  }

  /**
   * Load API key from environment variables using the environment validator
   * @throws {EnvironmentConfigError} If GOOGLE_API_KEY is not found in environment
   */
  private loadApiKey(): string {
    try {
      return validateGoogleApiKey();
    } catch (error) {
      if (error instanceof EnvironmentConfigError) {
        throw error;
      }
      throw new EnvironmentConfigError(
        'Failed to load Google API key from environment variables.',
        ['GOOGLE_API_KEY']
      );
    }
  }

  /**
   * Create and configure the instructor client for Gemini
   */
  private createInstructorClient(): any {
    return instructor({
      client: this.googleClient,
      mode: 'TOOLS' as any // Using TOOLS mode which works with Gemini
    });
  }

  /**
   * Get the configured instructor client
   */
  public getInstructorClient(): any {
    return this.instructorClient;
  }

  /**
   * Get the underlying Google Generative AI client
   */
  public getGoogleClient(): GoogleGenerativeAI {
    return this.googleClient;
  }

  /**
   * Test the connection and basic functionality
   * @param schema - Zod schema for structured output
   * @param prompt - Test prompt
   */
  public async testConnection<T extends z.ZodType<any, any>>(
    schema: T,
    prompt: string = "Extract information about a person named John Doe who works as a software engineer."
  ): Promise<z.infer<T>> {
    try {
      // Use the native Google AI SDK method getGenerativeModel and generateContent
      const model = this.instructorClient.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      const response = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        // Pass the Zod schema to response_model
        response_model: {
          schema: schema,
          name: schema.description || "TestConnection"
        },
      });
      
      return response;
    } catch (error) {
      console.error("Gemini connection test failed:", error);
      throw new Error(`Gemini connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate structured output using Gemini with custom configuration
   */
  public async generateStructuredOutput<T extends z.ZodType<any, any>>(
    schema: T,
    prompt: string,
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      safetySettings?: SafetySetting[];
      generationConfig?: GenerationConfig;
    }
  ): Promise<z.infer<T>> {
    const {
      model: modelName = 'gemini-1.5-flash',
      temperature,
      maxTokens,
      safetySettings,
      generationConfig: baseGenerationConfig
    } = options || {};

    // Use the native Google AI SDK method getGenerativeModel and generateContent
    const model = this.instructorClient.getGenerativeModel({ 
      model: modelName,
      safetySettings,
      // Combine generationConfig from options with specific parameters
      generationConfig: {
        ...baseGenerationConfig,
        ...(temperature !== undefined && { temperature }),
        ...(maxTokens !== undefined && { maxOutputTokens: maxTokens }),
      }
    });

    try {
      const response = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        // Pass the Zod schema to response_model
        response_model: {
          schema: schema,
          name: schema.description || "StructuredOutput"
        },
      });

      return response;
    } catch (error) {
      console.error("Gemini structured output generation failed:", error);
      throw new Error(`Gemini structured output generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export a default instance factory function
export const createGeminiService = (apiKey?: string): GeminiService => {
  return new GeminiService(apiKey);
};

// Export for testing purposes
export const validateApiKey = (apiKey?: string): boolean => {
  const key = apiKey || process.env['GOOGLE_API_KEY'];
  return !!key && key.length > 0;
};
