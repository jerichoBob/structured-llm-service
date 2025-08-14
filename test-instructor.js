import { config } from 'dotenv';
import Instructor from '@instructor-ai/instructor';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// Load environment variables
config({ path: '../.env.local' });

console.log('Testing instructor-js client creation...');

// Test with OpenAI (known to work)
try {
  console.log('Testing OpenAI client...');
  const openai = new OpenAI({ 
    apiKey: process.env.OPENAI_API_KEY || 'fake-key-for-testing'
  });
  
  const instructor = Instructor({ 
    client: openai, 
    mode: 'TOOLS'
  });
  
  console.log('✅ OpenAI instructor client created successfully');
  
} catch (error) {
  console.error('❌ Error with OpenAI:', error.message);
}

// Test with Anthropic (the problematic one)
try {
  console.log('\nTesting Anthropic client...');
  const anthropic = new Anthropic({ 
    apiKey: process.env.ANTHROPIC_API_KEY
  });
  
  console.log('Anthropic client created, testing with different modes...');
  
  // Try different modes
  const modes = ['TOOLS', 'JSON', 'MD_JSON', 'JSON_SCHEMA'];
  
  for (const mode of modes) {
    try {
      const instructor = Instructor({ 
        client: anthropic, 
        mode: mode
      });
      console.log(`✅ Anthropic instructor client created successfully with mode: ${mode}`);
      break; // If successful, break out of loop
    } catch (error) {
      console.log(`❌ Failed with mode ${mode}: ${error.message}`);
    }
  }
  
} catch (error) {
  console.error('❌ Error with Anthropic:', error.message);
}

// Test what instructor-js expects
console.log('\nChecking instructor-js version and supported providers...');
try {
  // Try to get version info
  console.log('Instructor function type:', typeof Instructor);
  
  // Test with a minimal working example
  const openai = new OpenAI({ 
    apiKey: process.env.OPENAI_API_KEY || 'fake-key'
  });
  
  const instructor = Instructor({ 
    client: openai, 
    mode: 'TOOLS'
  });
  
  console.log('Instructor provider:', instructor.provider);
  console.log('Instructor mode:', instructor.mode);
  
} catch (error) {
  console.error('Error getting instructor info:', error.message);
}
