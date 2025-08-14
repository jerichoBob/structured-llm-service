// Jest setup file to configure environment variables
const { config } = require('dotenv');

// Load environment variables from .env files
// First load from parent directory's .env.local (contains real API keys)
config({ path: '../.env.local' });
// Then load from local .env (for any overrides)
config();

// Optional: Set up global test configuration
global.console = {
  ...console,
  // Uncomment to suppress console.log during tests
  // log: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};
