# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is `structured-llm-service`, a TypeScript service that provides Python Instructor-like structured LLM output functionality. It's built as a production-ready wrapper around instructor-js with enhanced retry logic, caching, cost calculation, and comprehensive error handling.

## Architecture

The service follows a layered architecture:

- **Main Service Layer**: `StructuredLLMService` class in `src/services/StructuredLLMService.ts` - the core service that orchestrates LLM calls
- **Provider Layer**: Individual provider implementations in `src/providers/` (Claude, Gemini)
- **Utilities Layer**: Supporting utilities in `src/utils/` for schema caching, response caching, cost calculation, input sanitization, and error formatting
- **HTTP Server**: Production HTTP server in `src/index.ts` with health checks and RESTful API
- **Interfaces**: Type definitions in `src/interfaces/` for all shared types and contracts

### Key Components

- **InstructorClient**: Core abstraction in `src/utils/instructorClient.ts` that manages provider selection and mode fallback
- **Schema Caching**: Performance optimization that caches Zod schema compilations
- **Response Caching**: Optional caching layer for identical requests
- **Cost Calculator**: Precise token usage and cost calculation in `src/utils/costCalculator.ts`
- **Input Sanitizer**: Security layer that sanitizes prompts and content
- **Error Formatter**: Enhanced error reporting with field-level validation details

## Development Commands

### Building and Type Checking
```bash
pnpm run build          # Compile TypeScript to dist/
pnpm run typecheck      # Type check without emitting files
pnpm run dev            # Watch mode compilation
```

### Testing
```bash
pnpm test               # Run unit tests
pnpm run test:watch     # Run tests in watch mode
pnpm run test:integration # Run integration tests (requires API keys)
```

### Code Quality
```bash
pnpm run lint           # Run ESLint on TypeScript files
pnpm run lint:fix       # Fix ESLint issues automatically
pnpm run format         # Format code with Prettier
pnpm run format:check   # Check if code is properly formatted
```

### Running the Service
```bash
pnpm start              # Start the production HTTP server
# Or run compiled version:
node dist/index.js
```

## Environment Configuration

The service requires API keys for supported providers:
- `ANTHROPIC_API_KEY` - For Claude provider
- `GOOGLE_API_KEY` - For Gemini provider

Optional configuration:
- `PORT` - HTTP server port (default: 3000)
- `HOST` - Server host (default: 0.0.0.0)
- `NODE_ENV` - Environment mode
- `ENABLE_CACHING` - Enable response caching (default: false)
- `DEFAULT_LLM_PROVIDER` - Default provider selection

## Testing Strategy

### Unit Tests
Standard Jest tests for individual components in `__tests__/` directories alongside source files.

### Integration Tests
Live API tests in `src/providers/__tests__/*.integration.test.ts` that validate real provider behavior. Run with:
```bash
ANTHROPIC_API_KEY=your_key pnpm run test:integration
```

Use the custom integration test runner:
```bash
node scripts/run-integration-tests.js
```

### Test Configuration
- Timeout: 10 seconds for unit tests, 5 minutes for integration tests
- ESM modules with proper TypeScript compilation
- Coverage reporting enabled

## Service Endpoints

- `GET /health` - Basic health check
- `GET /ready` - Comprehensive readiness check with provider validation
- `GET /info` - Service information and available providers
- `POST /generate` - Main structured output generation endpoint

## Provider Support

The service automatically selects optimal providers based on availability:
1. Claude (Anthropic) - Primary provider
2. Gemini (Google) - Secondary provider
3. Auto mode - Automatically selects best available provider

Each provider supports both native structured output modes and fallback JSON parsing modes.

## Development Notes

- This is an ESM project using ES2022 modules
- All imports use `.js` extensions (TypeScript convention for ESM)
- Strict TypeScript configuration with comprehensive type checking
- Uses pnpm as the package manager
- Comprehensive error handling with enhanced validation error formatting
- Production-ready with structured logging, health checks, and graceful shutdown