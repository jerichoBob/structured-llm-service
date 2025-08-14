# Integration Testing for ClaudeInstructorAdapter

This document describes the live integration testing setup for validating retry behavior and error handling in the ClaudeInstructorAdapter against the actual Anthropic Claude API.

## Overview

The integration tests are designed to:
- Validate retry configuration and behavior in real-world scenarios
- Test rate limiting detection and handling
- Verify error recovery mechanisms
- Monitor performance under various conditions
- Ensure proper backoff and jitter implementation

## Test Categories

### 1. Basic Retry Functionality
- **Default Retry Config**: Tests successful generation with standard retry settings
- **Custom Retry Config**: Validates custom retry configuration parameters
- **Configuration Merging**: Ensures partial configs merge correctly with defaults

### 2. Rate Limiting and Retry Behavior
- **Concurrent Requests**: Tests handling of multiple simultaneous requests
- **Aggressive Rate Limiting**: Attempts to trigger rate limiting through rapid requests
- **Backoff Verification**: Monitors retry delays and exponential backoff

### 3. Error Handling and Recovery
- **Invalid API Key**: Tests authentication error handling
- **Malformed Requests**: Validates handling of bad request parameters
- **Network Errors**: Simulates connection issues and timeouts

### 4. Performance and Timeout Behavior
- **Complex Requests**: Tests handling of resource-intensive prompts
- **Timeout Scenarios**: Validates timeout handling with retry logic

### 5. Retry Configuration Validation
- **Conservative Strategy**: Low retry count with longer delays
- **Aggressive Strategy**: High retry count with shorter delays
- **Linear Strategy**: Fixed delay between retries

## Running Integration Tests

### Prerequisites

1. **API Key**: Valid Anthropic API key with available credits
2. **Environment**: Node.js environment with all dependencies installed
3. **Network**: Stable internet connection for API calls

### Environment Setup

```bash
# Set your Anthropic API key
export ANTHROPIC_API_KEY=your_api_key_here

# Optional: Set custom test timeout (default: 5 minutes)
export TEST_TIMEOUT=300000

# Optional: Enable verbose output
export VERBOSE=true
```

### Running Tests

```bash
# Using npm script (recommended)
npm run test:integration

# Using the script directly
node scripts/run-integration-tests.js

# With custom environment variables
ANTHROPIC_API_KEY=your_key TEST_TIMEOUT=600000 npm run test:integration
```

### Test Execution Flow

1. **Environment Check**: Validates API key presence
2. **Test Enablement**: Sets `ENABLE_INTEGRATION_TESTS=true`
3. **Jest Execution**: Runs integration test suite with extended timeouts
4. **Result Analysis**: Reports success/failure with detailed logs

## Test Configuration

### Default Settings

```typescript
const TEST_CONFIG = {
  model: 'claude-3-5-haiku-20241022',  // Fast, cost-effective model
  timeout: 5000,                       // Individual request timeout
  concurrentRequests: 10,              // Concurrent request count
  batchDelay: 1000                     // Delay between request batches
};
```

### Retry Strategies Tested

1. **Conservative**: `{ max_attempts: 2, initial_delay: 2000, backoff_factor: 1.5 }`
2. **Aggressive**: `{ max_attempts: 5, initial_delay: 200, backoff_factor: 3 }`
3. **Linear**: `{ max_attempts: 3, initial_delay: 1000, backoff_factor: 1 }`

## Expected Behaviors

### Successful Scenarios
- Basic requests complete within timeout
- Custom retry configs are respected
- Structured output matches schema requirements
- Token usage is properly tracked

### Error Scenarios
- Invalid API keys result in authentication errors
- Rate limiting triggers appropriate retry behavior
- Network errors are handled gracefully
- Malformed requests fail with descriptive errors

### Retry Behaviors
- Exponential backoff increases delay between attempts
- Jitter adds randomization to prevent thundering herd
- Maximum delay caps are respected
- Error handlers are called for each retry attempt

## Monitoring and Logging

### Console Output
- Request timing information
- Success/failure counts for concurrent tests
- Rate limiting detection messages
- Retry strategy performance metrics

### Test Assertions
- Response structure validation
- Error field verification
- Token usage validation
- Timing constraint checks

## Cost Considerations

⚠️ **Important**: These tests make real API calls and will consume credits from your Anthropic account.

### Cost Optimization
- Uses `claude-3-5-haiku-20241022` (most cost-effective model)
- Limits concurrent requests to avoid excessive usage
- Includes timeouts to prevent runaway tests
- Skipped by default in regular test runs

### Estimated Usage
- Basic functionality tests: ~10-20 API calls
- Rate limiting tests: ~20-30 API calls
- Error handling tests: ~5-10 API calls
- Performance tests: ~5-10 API calls
- **Total**: Approximately 40-70 API calls per full test run

## Troubleshooting

### Common Issues

1. **API Key Not Set**
   ```
   Error: ANTHROPIC_API_KEY environment variable is required
   ```
   **Solution**: Set the environment variable with your API key

2. **Tests Skipped**
   ```
   Tests are being skipped
   ```
   **Solution**: Ensure `ENABLE_INTEGRATION_TESTS=true` is set (automatic in script)

3. **Timeout Errors**
   ```
   Test timeout exceeded
   ```
   **Solution**: Increase `TEST_TIMEOUT` or check network connectivity

4. **Rate Limiting**
   ```
   Rate limit exceeded errors
   ```
   **Solution**: This is expected behavior for rate limiting tests

### Debug Mode

Enable verbose logging for detailed test execution information:

```bash
VERBOSE=true npm run test:integration
```

## Test Maintenance

### Adding New Tests
1. Add test cases to `claude-instructor.integration.test.ts`
2. Update timeout values if needed
3. Document expected behavior in this file
4. Consider API cost impact

### Updating Configuration
1. Modify `TEST_CONFIG` object for global changes
2. Update individual test timeouts as needed
3. Adjust retry strategies based on API changes
4. Update documentation accordingly

## Security Notes

- Never commit API keys to version control
- Use environment variables for sensitive configuration
- Consider using separate API keys for testing
- Monitor API usage to prevent unexpected charges

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Integration Tests
on:
  workflow_dispatch:  # Manual trigger only
  
jobs:
  integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run test:integration
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

**Note**: Integration tests should typically be run manually or on a schedule, not on every commit, due to API costs.

## Related Files

- `src/providers/__tests__/claude-instructor.integration.test.ts` - Main test file
- `scripts/run-integration-tests.js` - Test runner script
- `src/providers/claude-instructor.ts` - Implementation being tested
- `package.json` - NPM script configuration

## Support

For issues with integration testing:
1. Check this documentation first
2. Verify environment setup
3. Review console output for specific errors
4. Check Anthropic API status and account credits
