#!/usr/bin/env node

/**
 * Integration Test Runner for ClaudeInstructorAdapter
 * 
 * This script runs live integration tests against the Anthropic Claude API
 * to validate retry behavior and error handling in real-world scenarios.
 * 
 * Usage:
 *   npm run test:integration
 *   or
 *   node scripts/run-integration-tests.js
 * 
 * Environment Variables:
 *   ANTHROPIC_API_KEY - Required: Your Anthropic API key
 *   ENABLE_INTEGRATION_TESTS - Set to 'true' to enable tests
 *   TEST_TIMEOUT - Optional: Test timeout in milliseconds (default: 300000)
 */

const { execSync } = require('child_process');
const path = require('path');

// Configuration
const config = {
  testFile: 'src/providers/__tests__/claude-instructor.integration.test.ts',
  timeout: process.env.TEST_TIMEOUT || 300000, // 5 minutes default
  verbose: process.env.VERBOSE === 'true'
};

function checkEnvironment() {
  console.log('🔍 Checking environment...');
  
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY environment variable is required');
    console.log('   Please set your Anthropic API key:');
    console.log('   export ANTHROPIC_API_KEY=your_api_key_here');
    process.exit(1);
  }
  
  console.log('✅ ANTHROPIC_API_KEY is set');
  
  // Enable integration tests
  process.env.ENABLE_INTEGRATION_TESTS = 'true';
  console.log('✅ Integration tests enabled');
}

function runTests() {
  console.log('\n🧪 Running integration tests...');
  console.log('⚠️  Note: These tests will consume API credits');
  
  try {
    const jestCommand = [
      'npx jest',
      `--testPathPatterns=${config.testFile}`,
      `--testTimeout=${config.timeout}`,
      '--verbose',
      '--detectOpenHandles',
      '--forceExit'
    ].join(' ');
    
    if (config.verbose) {
      console.log(`Running: ${jestCommand}`);
    }
    
    execSync(jestCommand, {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: {
        ...process.env,
        ENABLE_INTEGRATION_TESTS: 'true'
      }
    });
    
    console.log('\n✅ Integration tests completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Integration tests failed');
    console.error('Error:', error.message);
    process.exit(1);
  }
}

function showUsage() {
  console.log(`
🚀 ClaudeInstructorAdapter Integration Test Runner

This script runs live integration tests that validate retry behavior
against the actual Anthropic Claude API.

Prerequisites:
  - Valid ANTHROPIC_API_KEY environment variable
  - API credits in your Anthropic account

Test Categories:
  ✓ Basic retry functionality with real API calls
  ✓ Rate limiting detection and handling
  ✓ Concurrent request management
  ✓ Error handling and recovery
  ✓ Performance and timeout behavior
  ✓ Different retry strategy validation

Environment Variables:
  ANTHROPIC_API_KEY     - Required: Your Anthropic API key
  ENABLE_INTEGRATION_TESTS - Automatically set to 'true'
  TEST_TIMEOUT          - Optional: Test timeout (default: 300000ms)
  VERBOSE              - Optional: Enable verbose output

Usage:
  npm run test:integration
  node scripts/run-integration-tests.js

Examples:
  # Basic run
  ANTHROPIC_API_KEY=your_key npm run test:integration
  
  # With custom timeout
  ANTHROPIC_API_KEY=your_key TEST_TIMEOUT=600000 npm run test:integration
  
  # Verbose output
  ANTHROPIC_API_KEY=your_key VERBOSE=true npm run test:integration

⚠️  Warning: These tests make real API calls and will consume credits!
`);
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    showUsage();
    return;
  }
  
  console.log('🔧 ClaudeInstructorAdapter Integration Test Runner');
  console.log('=' .repeat(60));
  
  checkEnvironment();
  runTests();
}

if (require.main === module) {
  main();
}

module.exports = { checkEnvironment, runTests, showUsage };
