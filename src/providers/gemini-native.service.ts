import { GoogleGenerativeAI, GenerationConfig, SafetySetting, FunctionDeclaration, SchemaType, FunctionCallingMode } from '@google/generative-ai';
import { z } from 'zod';
import { validateGoogleApiKey, EnvironmentConfigError } from '../config/environment.js';
import { formatValidationError, isZodError } from '../utils/zodErrorFormatter.js';

/**
 * Native Gemini Service for structured LLM interactions using Google's function calling
 * 
 * This service provides structured output generation with Zod schema validation
 * using Google's native function calling capabilities without instructor-js.
 */
export class GeminiNativeService {
  private googleClient: GoogleGenerativeAI;
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || this.loadApiKey();
    this.googleClient = new GoogleGenerativeAI(this.apiKey);
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
   * Convert Zod schema to Google's FunctionDeclaration format
   */
  private zodToGoogleFunction<T extends z.ZodType<any, any>>(
    name: string,
    description: string,
    schema: T
  ): FunctionDeclaration {
    // Convert Zod schema to JSON schema format
    const jsonSchema = this.zodToJsonSchema(schema);
    
    return {
      name,
      description,
      parameters: {
        type: SchemaType.OBJECT,
        properties: jsonSchema.properties || {},
        required: jsonSchema.required || [],
      },
    };
  }

  /**
   * Simple Zod to JSON Schema converter
   */
  private zodToJsonSchema(schema: z.ZodType<any, any>): any {
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const properties: any = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        const fieldSchema = value as z.ZodType<any, any>;
        properties[key] = this.zodToJsonSchema(fieldSchema);
        
        // Check if field is required (not optional)
        if (!(fieldSchema instanceof z.ZodOptional)) {
          required.push(key);
        }
      }

      return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
      };
    }

    if (schema instanceof z.ZodString) {
      return { type: 'string', description: schema.description };
    }

    if (schema instanceof z.ZodNumber) {
      return { type: 'number', description: schema.description };
    }

    if (schema instanceof z.ZodBoolean) {
      return { type: 'boolean', description: schema.description };
    }

    if (schema instanceof z.ZodArray) {
      return {
        type: 'array',
        items: this.zodToJsonSchema(schema.element),
        description: schema.description,
      };
    }

    if (schema instanceof z.ZodEnum) {
      return {
        type: 'string',
        enum: schema.options,
        description: schema.description,
      };
    }

    if (schema instanceof z.ZodOptional) {
      return this.zodToJsonSchema(schema.unwrap());
    }

    // Default fallback
    return { type: 'string', description: schema.description };
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
      const result = await this.generateStructuredOutput(schema, prompt);
      return result.data;
    } catch (error) {
      console.error("Gemini connection test failed:", error);
      throw new Error(`Gemini connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate structured output using Gemini's native function calling
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
  ): Promise<{ data: z.infer<T>; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
    const {
      model: modelName = 'gemini-1.5-flash',
      temperature,
      maxTokens,
      safetySettings,
      generationConfig: baseGenerationConfig
    } = options || {};

    // Convert Zod schema to Google function declaration
    const extractionFunction = this.zodToGoogleFunction(
      'extract_data',
      'Extract structured data from the given text according to the specified schema',
      schema
    );

    // Get the model with configuration
    const modelConfig: any = {
      model: modelName,
      generationConfig: {
        ...baseGenerationConfig,
        ...(temperature !== undefined && { temperature }),
        ...(maxTokens !== undefined && { maxOutputTokens: maxTokens }),
      }
    };
    
    if (safetySettings) {
      modelConfig.safetySettings = safetySettings;
    }
    
    const model = this.googleClient.getGenerativeModel(modelConfig);

    try {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: [{ functionDeclarations: [extractionFunction] }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingMode.ANY,
            allowedFunctionNames: ['extract_data']
          },
        },
      });

      const response = result.response;
      const functionCalls = response.functionCalls();

      // Extract token usage information from the response
      const usage = response.usageMetadata ? {
        promptTokens: response.usageMetadata.promptTokenCount || 0,
        completionTokens: response.usageMetadata.candidatesTokenCount || 0,
        totalTokens: response.usageMetadata.totalTokenCount || 0,
      } : undefined;

      // Check if the model made a function call
      if (!functionCalls || functionCalls.length === 0) {
        throw new Error('Model did not return a function call');
      }

      const call = functionCalls[0];
      if (!call || call.name !== 'extract_data') {
        throw new Error(`Unexpected function call: ${call?.name || 'undefined'}`);
      }

      // Validate the extracted data with Zod
      const extractedData = call.args;
      if (!extractedData) {
        throw new Error('Function call returned no arguments');
      }
      const validatedData = schema.parse(extractedData);

      return {
        data: validatedData,
        ...(usage && { usage })
      };
    } catch (error) {
      console.error("Gemini structured output generation failed:", error);
      
      if (isZodError(error)) {
        // Use enhanced error formatting for Zod validation errors
        const enhancedErrors = formatValidationError(error);
        const errorMessages = enhancedErrors.map(e => e.message).join(', ');
        throw new Error(`Schema validation failed: ${errorMessages}`);
      }
      
      throw new Error(`Gemini structured output generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export a default instance factory function
export const createGeminiNativeService = (apiKey?: string): GeminiNativeService => {
  return new GeminiNativeService(apiKey);
};

// Export for testing purposes
export const validateApiKey = (apiKey?: string): boolean => {
  const key = apiKey || process.env['GOOGLE_API_KEY'];
  return !!key && key.length > 0;
};
