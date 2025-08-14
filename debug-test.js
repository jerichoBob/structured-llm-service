import { config } from 'dotenv';

// Load environment variables
config({ path: '../.env.local' });
config();

console.log('Environment variables loaded:');
console.log('ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 'Present' : 'Missing');
console.log('GOOGLE_API_KEY:', process.env.GOOGLE_API_KEY ? 'Present' : 'Missing');

// Test the service
async function testService() {
  try {
    const { StructuredLLMService } = await import('./dist/services/StructuredLLMService.js');
    const { z } = await import('zod');
    
    const service = new StructuredLLMService({
      enableLogging: true,
    });
    
    console.log('\nAvailable providers:', service.getAvailableProviders());
    
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });
    
    console.log('\nTesting generate method...');
    const result = await service.generate({
      schema,
      prompt: 'Generate a person named John who is 30 years old',
      provider: 'auto', // This will resolve to OpenAI since it's the only supported provider
    });
    
    console.log('\nResult:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testService();
