/**
 * Main entry point for the structured-llm-service
 * Production-ready HTTP server with health checks and monitoring
 */

import http from 'http';
import { StructuredLLMService } from './services/StructuredLLMService.js';
import { z } from 'zod';
import type { LLMProvider } from './utils/instructorClient.js';

// Environment configuration
const PORT = parseInt(process.env['PORT'] || '3000', 10);
const HOST = process.env['HOST'] || '0.0.0.0';
const NODE_ENV = process.env['NODE_ENV'] || 'production';

// Initialize the service
const defaultProvider = process.env['DEFAULT_LLM_PROVIDER'] as LLMProvider | undefined;
const llmService = new StructuredLLMService({
  enableLogging: NODE_ENV !== 'test',
  enableCaching: process.env['ENABLE_CACHING'] === 'true',
  defaultProvider: defaultProvider || 'auto',
});

// Request/Response schemas
const GenerateRequestSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  content: z.string().optional(),
  schema: z.record(z.any()),
  provider: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
});

type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

// Utility functions
function parseJSON(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function sendJSON(res: http.ServerResponse, statusCode: number, data: any): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(data));
}

function sendError(res: http.ServerResponse, statusCode: number, message: string, details?: any): void {
  sendJSON(res, statusCode, {
    error: message,
    ...(details && { details }),
    timestamp: new Date().toISOString(),
  });
}

// Health check function
async function performHealthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; checks: Record<string, any> }> {
  const checks: Record<string, any> = {};
  let overallStatus: 'healthy' | 'unhealthy' = 'healthy';

  try {
    // Check if we can get available providers
    const providers = await llmService.getAvailableProviders();
    checks['providers'] = {
      status: providers.length > 0 ? 'healthy' : 'unhealthy',
      available: providers,
      count: providers.length,
    };

    if (providers.length === 0) {
      overallStatus = 'unhealthy';
    }
  } catch (error) {
    checks['providers'] = {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : String(error),
    };
    overallStatus = 'unhealthy';
  }

  // Check memory usage
  const memUsage = process.memoryUsage();
  checks['memory'] = {
    status: 'healthy',
    usage: {
      rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
    },
  };

  // Check uptime
  checks['uptime'] = {
    status: 'healthy',
    seconds: Math.floor(process.uptime()),
  };

  return { status: overallStatus, checks };
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const method = req.method?.toUpperCase();

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  // Health check endpoints
  if (url.pathname === '/health' || url.pathname === '/live') {
    sendJSON(res, 200, {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'structured-llm-service',
      version: '1.0.0',
    });
    return;
  }

  if (url.pathname === '/ready') {
    try {
      const healthCheck = await performHealthCheck();
      const statusCode = healthCheck.status === 'healthy' ? 200 : 503;
      sendJSON(res, statusCode, {
        status: healthCheck.status,
        timestamp: new Date().toISOString(),
        checks: healthCheck.checks,
      });
    } catch (error) {
      sendError(res, 503, 'Health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  // Service info endpoint
  if (url.pathname === '/info' && method === 'GET') {
    try {
      const providers = await llmService.getAvailableProviders();
      sendJSON(res, 200, {
        service: 'structured-llm-service',
        version: '1.0.0',
        providers: providers,
        features: {
          caching: process.env['ENABLE_CACHING'] === 'true',
          logging: NODE_ENV !== 'test',
          inputSanitization: true,
          secretManagement: true,
        },
        environment: NODE_ENV,
      });
    } catch (error) {
      sendError(res, 500, 'Failed to get service info', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  // Main generation endpoint
  if (url.pathname === '/generate' && method === 'POST') {
    let body = '';
    
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const requestData = parseJSON(body);
        if (!requestData) {
          sendError(res, 400, 'Invalid JSON in request body');
          return;
        }

        // Validate request schema
        const validationResult = GenerateRequestSchema.safeParse(requestData);
        if (!validationResult.success) {
          sendError(res, 400, 'Invalid request format', {
            errors: validationResult.error.errors,
          });
          return;
        }

        const request: GenerateRequest = validationResult.data;

        // Generate structured output
        const result = await llmService.generate({
          prompt: request.prompt,
          ...(request.content && { content: request.content }),
          schema: request.schema as any,
          ...(request.provider && { provider: request.provider as LLMProvider }),
          ...(request.model && { model: request.model }),
          ...(request.temperature !== undefined && { temperature: request.temperature }),
          ...(request.maxTokens && { maxTokens: request.maxTokens }),
        });

        if (result.success) {
          sendJSON(res, 200, {
            success: true,
            data: result.data,
            metadata: {
              provider: result.provider,
              model: result.model,
              attempts: result.attempts,
              processingTime: result.processingTime,
              tokenUsage: result.tokenUsage,
              ...result.metadata,
            },
          });
        } else {
          sendJSON(res, 422, {
            success: false,
            errors: result.errors,
            metadata: {
              provider: result.provider,
              model: result.model,
              attempts: result.attempts,
              processingTime: result.processingTime,
              ...result.metadata,
            },
          });
        }
      } catch (error) {
        console.error('Generation error:', error);
        sendError(res, 500, 'Internal server error', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    req.on('error', (error) => {
      console.error('Request error:', error);
      sendError(res, 400, 'Request error', {
        error: error.message,
      });
    });

    return;
  }

  // 404 for unknown endpoints
  sendError(res, 404, 'Endpoint not found', {
    path: url.pathname,
    method: method,
  });
});

// Error handling
server.on('error', (error) => {
  console.error('Server error:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Start server
server.listen(PORT, HOST, () => {
  console.log(`🚀 Structured LLM Service running on http://${HOST}:${PORT}`);
  console.log(`📊 Health check: http://${HOST}:${PORT}/health`);
  console.log(`🔍 Ready check: http://${HOST}:${PORT}/ready`);
  console.log(`📋 Service info: http://${HOST}:${PORT}/info`);
  console.log(`🎯 Generate endpoint: http://${HOST}:${PORT}/generate`);
  console.log(`🌍 Environment: ${NODE_ENV}`);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
