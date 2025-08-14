#!/usr/bin/env node

/**
 * Gemini Integration Demo Script
 * 
 * This script demonstrates the basic functionality of the GeminiService
 * with structured output using Zod schemas.
 * 
 * Usage:
 * 1. Set GOOGLE_API_KEY environment variable
 * 2. Run: npx ts-node src/providers/gemini-demo.ts
 */

import { GeminiService } from './gemini.service';
import { z } from 'zod';
import { hasGoogleApiKey } from '../config/environment';

// Define a simple schema for person extraction
const PersonSchema = z.object({
  name: z.string().describe('The person\'s full name'),
  role: z.string().describe('The person\'s job title or role'),
  age: z.number().optional().describe('The person\'s age if mentioned'),
  company: z.string().optional().describe('The company they work for if mentioned'),
  skills: z.array(z.string()).optional().describe('List of skills or technologies mentioned')
});

type Person = z.infer<typeof PersonSchema>;

async function runDemo() {
  console.log('🚀 Gemini Integration Demo');
  console.log('==========================\n');

  // Check if API key is available
  if (!hasGoogleApiKey()) {
    console.error('❌ No GOOGLE_API_KEY found in environment variables.');
    console.log('Please set your Google Gemini API key:');
    console.log('export GOOGLE_API_KEY="your-api-key-here"');
    console.log('\nGet your API key from: https://makersuite.google.com/app/apikey');
    process.exit(1);
  }

  try {
    // Initialize the Gemini service
    console.log('🔧 Initializing Gemini service...');
    const geminiService = new GeminiService();
    console.log('✅ Gemini service initialized successfully\n');

    // Test 1: Basic structured output
    console.log('📝 Test 1: Basic Person Extraction');
    console.log('-----------------------------------');
    const prompt1 = "Extract information about John Smith, a 30-year-old senior software engineer at Microsoft who specializes in TypeScript and React.";
    console.log(`Prompt: ${prompt1}\n`);

    console.log('🔄 Making API call...');
    const result1 = await geminiService.testConnection(PersonSchema, prompt1);
    
    console.log('✅ Response received:');
    console.log(JSON.stringify(result1, null, 2));
    
    // Validate the result
    const validation1 = PersonSchema.safeParse(result1);
    if (validation1.success) {
      console.log('✅ Schema validation passed\n');
    } else {
      console.log('❌ Schema validation failed:');
      console.log(validation1.error.errors);
      console.log('');
    }

    // Test 2: Different prompt with custom options
    console.log('📝 Test 2: Advanced Configuration');
    console.log('----------------------------------');
    const prompt2 = "Tell me about Dr. Sarah Johnson, a 35-year-old AI researcher at OpenAI who works with Python, machine learning, and natural language processing.";
    console.log(`Prompt: ${prompt2}\n`);

    console.log('🔄 Making API call with custom options...');
    const result2 = await geminiService.generateStructuredOutput(
      PersonSchema,
      prompt2,
      {
        model: 'gemini-1.5-flash',
        temperature: 0.1, // Low temperature for consistent results
      }
    );

    console.log('✅ Response received:');
    console.log(JSON.stringify(result2, null, 2));
    
    // Validate the result
    const validation2 = PersonSchema.safeParse(result2);
    if (validation2.success) {
      console.log('✅ Schema validation passed\n');
    } else {
      console.log('❌ Schema validation failed:');
      console.log(validation2.error.errors);
      console.log('');
    }

    console.log('🎉 Demo completed successfully!');
    console.log('The Gemini integration is working correctly with structured output.');

  } catch (error) {
    console.error('❌ Demo failed with error:');
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
      if (error.stack) {
        console.error('\nStack trace:');
        console.error(error.stack);
      }
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

// Run the demo if this file is executed directly
if (require.main === module) {
  runDemo().catch((error) => {
    console.error('Unhandled error in demo:', error);
    process.exit(1);
  });
}

export { runDemo, PersonSchema };
export type { Person };
