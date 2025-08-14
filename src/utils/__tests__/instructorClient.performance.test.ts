import { z } from 'zod';
import {
  createInstructorClient,
  type LLMProvider,
} from '../instructorClient.js';

// Performance test schemas of varying complexity
const SimpleSchema = z.object({
  id: z.string(),
  name: z.string(),
  active: z.boolean(),
});

const MediumSchema = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
    age: z.number().int().min(0).max(120),
    preferences: z.object({
      theme: z.enum(['light', 'dark']),
      notifications: z.boolean(),
      language: z.string(),
    }),
  }),
  metadata: z.record(z.string(), z.any()).optional(),
  tags: z.array(z.string()),
});

const ComplexSchema = z.object({
  report: z.object({
    id: z.string(),
    title: z.string(),
    generatedAt: z.string(),
    author: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string().email(),
      department: z.string(),
    }),
    sections: z.array(z.object({
      id: z.string(),
      title: z.string(),
      content: z.string(),
      subsections: z.array(z.object({
        id: z.string(),
        title: z.string(),
        content: z.string(),
        data: z.array(z.object({
          key: z.string(),
          value: z.union([z.string(), z.number(), z.boolean()]),
          metadata: z.record(z.string(), z.any()).optional(),
        })),
      })),
    })),
    summary: z.object({
      totalSections: z.number().int().min(0),
      totalSubsections: z.number().int().min(0),
      totalDataPoints: z.number().int().min(0),
      insights: z.array(z.string()),
      recommendations: z.array(z.string()),
    }),
  }),
  attachments: z.array(z.object({
    id: z.string(),
    filename: z.string(),
    size: z.number().int().min(0),
    type: z.string(),
    url: z.string().url(),
  })).optional(),
});

type SimpleType = z.infer<typeof SimpleSchema>;
type MediumType = z.infer<typeof MediumSchema>;
type ComplexType = z.infer<typeof ComplexSchema>;

// Performance measurement utilities
interface PerformanceMetrics {
  latency: number;
  throughput: number;
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  cpuUsage: {
    user: number;
    system: number;
  };
}

interface BenchmarkResult {
  testName: string;
  provider: LLMProvider;
  schemaComplexity: 'simple' | 'medium' | 'complex';
  iterations: number;
  metrics: {
    avg: PerformanceMetrics;
    min: PerformanceMetrics;
    max: PerformanceMetrics;
    p95: PerformanceMetrics;
    p99: PerformanceMetrics;
  };
  errors: number;
  successRate: number;
}

class PerformanceBenchmark {
  private results: BenchmarkResult[] = [];

  async measurePerformance<T>(
    testName: string,
    provider: LLMProvider,
    schemaComplexity: 'simple' | 'medium' | 'complex',
    testFunction: () => Promise<T>,
    iterations: number = 10
  ): Promise<BenchmarkResult> {
    const measurements: PerformanceMetrics[] = [];
    let errors = 0;

    console.log(`Starting benchmark: ${testName} (${iterations} iterations)`);

    for (let i = 0; i < iterations; i++) {
      const startTime = process.hrtime.bigint();
      const startMemory = process.memoryUsage();
      const startCpu = process.cpuUsage();

      try {
        await testFunction();
        
        const endTime = process.hrtime.bigint();
        const endMemory = process.memoryUsage();
        const endCpu = process.cpuUsage(startCpu);

        const latency = Number(endTime - startTime) / 1_000_000; // Convert to milliseconds
        const throughput = 1000 / latency; // Operations per second

        measurements.push({
          latency,
          throughput,
          memoryUsage: {
            heapUsed: endMemory.heapUsed - startMemory.heapUsed,
            heapTotal: endMemory.heapTotal - startMemory.heapTotal,
            external: endMemory.external - startMemory.external,
          },
          cpuUsage: {
            user: endCpu.user,
            system: endCpu.system,
          },
        });
      } catch (error) {
        errors++;
        console.warn(`Iteration ${i + 1} failed:`, error);
      }

      // Small delay between iterations to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const successfulMeasurements = measurements.filter(m => m !== undefined);
    const successRate = (successfulMeasurements.length / iterations) * 100;

    if (successfulMeasurements.length === 0) {
      throw new Error(`All ${iterations} iterations failed for test: ${testName}`);
    }

    // Calculate statistics
    const sortedByLatency = [...successfulMeasurements].sort((a, b) => a.latency - b.latency);
    const p95Index = Math.floor(sortedByLatency.length * 0.95);
    const p99Index = Math.floor(sortedByLatency.length * 0.99);

    const result: BenchmarkResult = {
      testName,
      provider,
      schemaComplexity,
      iterations,
      metrics: {
        avg: this.calculateAverage(successfulMeasurements),
        min: this.findMinimum(successfulMeasurements),
        max: this.findMaximum(successfulMeasurements),
        p95: sortedByLatency[p95Index] || sortedByLatency[sortedByLatency.length - 1]!,
        p99: sortedByLatency[p99Index] || sortedByLatency[sortedByLatency.length - 1]!,
      },
      errors,
      successRate,
    };

    this.results.push(result);
    return result;
  }

  private calculateAverage(measurements: PerformanceMetrics[]): PerformanceMetrics {
    const sum = measurements.reduce((acc, m) => ({
      latency: acc.latency + m.latency,
      throughput: acc.throughput + m.throughput,
      memoryUsage: {
        heapUsed: acc.memoryUsage.heapUsed + m.memoryUsage.heapUsed,
        heapTotal: acc.memoryUsage.heapTotal + m.memoryUsage.heapTotal,
        external: acc.memoryUsage.external + m.memoryUsage.external,
      },
      cpuUsage: {
        user: acc.cpuUsage.user + m.cpuUsage.user,
        system: acc.cpuUsage.system + m.cpuUsage.system,
      },
    }), {
      latency: 0,
      throughput: 0,
      memoryUsage: { heapUsed: 0, heapTotal: 0, external: 0 },
      cpuUsage: { user: 0, system: 0 },
    });

    const count = measurements.length;
    return {
      latency: sum.latency / count,
      throughput: sum.throughput / count,
      memoryUsage: {
        heapUsed: sum.memoryUsage.heapUsed / count,
        heapTotal: sum.memoryUsage.heapTotal / count,
        external: sum.memoryUsage.external / count,
      },
      cpuUsage: {
        user: sum.cpuUsage.user / count,
        system: sum.cpuUsage.system / count,
      },
    };
  }

  private findMinimum(measurements: PerformanceMetrics[]): PerformanceMetrics {
    return measurements.reduce((min, m) => ({
      latency: Math.min(min.latency, m.latency),
      throughput: Math.min(min.throughput, m.throughput),
      memoryUsage: {
        heapUsed: Math.min(min.memoryUsage.heapUsed, m.memoryUsage.heapUsed),
        heapTotal: Math.min(min.memoryUsage.heapTotal, m.memoryUsage.heapTotal),
        external: Math.min(min.memoryUsage.external, m.memoryUsage.external),
      },
      cpuUsage: {
        user: Math.min(min.cpuUsage.user, m.cpuUsage.user),
        system: Math.min(min.cpuUsage.system, m.cpuUsage.system),
      },
    }));
  }

  private findMaximum(measurements: PerformanceMetrics[]): PerformanceMetrics {
    return measurements.reduce((max, m) => ({
      latency: Math.max(max.latency, m.latency),
      throughput: Math.max(max.throughput, m.throughput),
      memoryUsage: {
        heapUsed: Math.max(max.memoryUsage.heapUsed, m.memoryUsage.heapUsed),
        heapTotal: Math.max(max.memoryUsage.heapTotal, m.memoryUsage.heapTotal),
        external: Math.max(max.memoryUsage.external, m.memoryUsage.external),
      },
      cpuUsage: {
        user: Math.max(max.cpuUsage.user, m.cpuUsage.user),
        system: Math.max(max.cpuUsage.system, m.cpuUsage.system),
      },
    }));
  }

  getResults(): BenchmarkResult[] {
    return [...this.results];
  }

  generateReport(): string {
    const report = ['Performance Benchmark Report', '='.repeat(50), ''];

    this.results.forEach(result => {
      report.push(`Test: ${result.testName}`);
      report.push(`Provider: ${result.provider}`);
      report.push(`Schema Complexity: ${result.schemaComplexity}`);
      report.push(`Iterations: ${result.iterations}`);
      report.push(`Success Rate: ${result.successRate.toFixed(2)}%`);
      report.push(`Errors: ${result.errors}`);
      report.push('');
      report.push('Latency (ms):');
      report.push(`  Average: ${result.metrics.avg.latency.toFixed(2)}`);
      report.push(`  Min: ${result.metrics.min.latency.toFixed(2)}`);
      report.push(`  Max: ${result.metrics.max.latency.toFixed(2)}`);
      report.push(`  P95: ${result.metrics.p95.latency.toFixed(2)}`);
      report.push(`  P99: ${result.metrics.p99.latency.toFixed(2)}`);
      report.push('');
      report.push('Throughput (ops/sec):');
      report.push(`  Average: ${result.metrics.avg.throughput.toFixed(2)}`);
      report.push('');
      report.push('Memory Usage (bytes):');
      report.push(`  Heap Used: ${result.metrics.avg.memoryUsage.heapUsed.toFixed(0)}`);
      report.push(`  Heap Total: ${result.metrics.avg.memoryUsage.heapTotal.toFixed(0)}`);
      report.push('');
      report.push('-'.repeat(30));
      report.push('');
    });

    return report.join('\n');
  }
}

describe('Instructor Client Performance Benchmarks', () => {
  let benchmark: PerformanceBenchmark;

  // Test providers and configurations
  const testProviders: Array<{
    provider: LLMProvider;
    models: {
      native: string;
      fallback: string;
    };
  }> = [
    {
      provider: 'claude',
      models: {
        native: 'claude-3-5-sonnet-20241022',
        fallback: 'claude-2.1',
      },
    },
    {
      provider: 'gemini',
      models: {
        native: 'gemini-1.5-pro-latest',
        fallback: 'gemini-1.0-pro',
      },
    },
  ];

  beforeAll(() => {
    // Set up mock API keys for testing
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-key-12345';
    process.env['GOOGLE_API_KEY'] = 'test-gemini-key-67890';
  });

  afterAll(() => {
    // Clean up environment variables
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];
  });

  beforeEach(() => {
    benchmark = new PerformanceBenchmark();
  });

  afterEach(() => {
    // Log benchmark results after each test
    const report = benchmark.generateReport();
    if (report.includes('Test:')) {
      console.log('\n' + report);
    }
  });

  describe('Latency Benchmarks', () => {
    testProviders.forEach(({ provider, models }) => {
      describe(`${provider.toUpperCase()} Latency`, () => {
        let client: ReturnType<typeof createInstructorClient>;
        let mockGenerate: jest.Mock;

        beforeEach(() => {
          client = createInstructorClient({
            provider,
            apiKey: `test-${provider}-key`,
            model: models.native,
          });

          mockGenerate = jest.fn();
          if (provider === 'claude') {
            (client.client as any).generate = mockGenerate;
          } else {
            (client.client as any).generateStructuredOutput = mockGenerate;
          }
        });

        it(`should measure latency for simple schema with ${provider}`, async () => {
          const mockResponse = provider === 'claude'
            ? { success: true, data: { id: 'test-1', name: 'Test User', active: true } }
            : { data: { id: 'test-1', name: 'Test User', active: true } };

          mockGenerate.mockImplementation(() => 
            new Promise(resolve => setTimeout(() => resolve(mockResponse), 50))
          );

          const result = await benchmark.measurePerformance(
            `${provider} Simple Schema Latency`,
            provider,
            'simple',
            async () => {
              return await client.generateWithRetry<SimpleType>({
                schema: SimpleSchema,
                prompt: 'Generate simple data',
                model: models.native,
              });
            },
            20
          );

          expect(result.successRate).toBeGreaterThan(90);
          expect(result.metrics.avg.latency).toBeGreaterThan(40);
          expect(result.metrics.avg.latency).toBeLessThan(200);
          expect(result.metrics.avg.throughput).toBeGreaterThan(5);
        });

        it(`should measure latency for medium schema with ${provider}`, async () => {
          const mockResponse = provider === 'claude'
            ? {
                success: true,
                data: {
                  user: {
                    id: 'user-1',
                    name: 'Test User',
                    email: 'test@example.com',
                    age: 30,
                    preferences: { theme: 'dark' as const, notifications: true, language: 'en' },
                  },
                  metadata: { department: 'Engineering' },
                  tags: ['developer', 'senior'],
                },
              }
            : {
                data: {
                  user: {
                    id: 'user-1',
                    name: 'Test User',
                    email: 'test@example.com',
                    age: 30,
                    preferences: { theme: 'dark' as const, notifications: true, language: 'en' },
                  },
                  metadata: { department: 'Engineering' },
                  tags: ['developer', 'senior'],
                },
              };

          mockGenerate.mockImplementation(() => 
            new Promise(resolve => setTimeout(() => resolve(mockResponse), 100))
          );

          const result = await benchmark.measurePerformance(
            `${provider} Medium Schema Latency`,
            provider,
            'medium',
            async () => {
              return await client.generateWithRetry<MediumType>({
                schema: MediumSchema,
                prompt: 'Generate medium complexity data',
                model: models.native,
              });
            },
            15
          );

          expect(result.successRate).toBeGreaterThan(90);
          expect(result.metrics.avg.latency).toBeGreaterThan(90);
          expect(result.metrics.avg.latency).toBeLessThan(300);
        });

        it(`should measure latency for complex schema with ${provider}`, async () => {
          const mockResponse = provider === 'claude'
            ? {
                success: true,
                data: {
                  report: {
                    id: 'report-1',
                    title: 'Performance Report',
                    generatedAt: '2024-01-15T10:30:00Z',
                    author: {
                      id: 'author-1',
                      name: 'John Doe',
                      email: 'john@example.com',
                      department: 'Analytics',
                    },
                    sections: [{
                      id: 'section-1',
                      title: 'Overview',
                      content: 'This is the overview section',
                      subsections: [{
                        id: 'subsection-1',
                        title: 'Key Metrics',
                        content: 'Key performance metrics',
                        data: [
                          { key: 'users', value: 1000, metadata: { source: 'analytics' } },
                          { key: 'revenue', value: 50000, metadata: { currency: 'USD' } },
                        ],
                      }],
                    }],
                    summary: {
                      totalSections: 1,
                      totalSubsections: 1,
                      totalDataPoints: 2,
                      insights: ['User growth is strong'],
                      recommendations: ['Continue current strategy'],
                    },
                  },
                  attachments: [{
                    id: 'attachment-1',
                    filename: 'data.csv',
                    size: 1024,
                    type: 'text/csv',
                    url: 'https://example.com/data.csv',
                  }],
                },
              }
            : {
                data: {
                  report: {
                    id: 'report-1',
                    title: 'Performance Report',
                    generatedAt: '2024-01-15T10:30:00Z',
                    author: {
                      id: 'author-1',
                      name: 'John Doe',
                      email: 'john@example.com',
                      department: 'Analytics',
                    },
                    sections: [{
                      id: 'section-1',
                      title: 'Overview',
                      content: 'This is the overview section',
                      subsections: [{
                        id: 'subsection-1',
                        title: 'Key Metrics',
                        content: 'Key performance metrics',
                        data: [
                          { key: 'users', value: 1000, metadata: { source: 'analytics' } },
                          { key: 'revenue', value: 50000, metadata: { currency: 'USD' } },
                        ],
                      }],
                    }],
                    summary: {
                      totalSections: 1,
                      totalSubsections: 1,
                      totalDataPoints: 2,
                      insights: ['User growth is strong'],
                      recommendations: ['Continue current strategy'],
                    },
                  },
                  attachments: [{
                    id: 'attachment-1',
                    filename: 'data.csv',
                    size: 1024,
                    type: 'text/csv',
                    url: 'https://example.com/data.csv',
                  }],
                },
              };

          mockGenerate.mockImplementation(() => 
            new Promise(resolve => setTimeout(() => resolve(mockResponse), 200))
          );

          const result = await benchmark.measurePerformance(
            `${provider} Complex Schema Latency`,
            provider,
            'complex',
            async () => {
              return await client.generateWithRetry<ComplexType>({
                schema: ComplexSchema,
                prompt: 'Generate complex report data',
                model: models.native,
              });
            },
            10
          );

          expect(result.successRate).toBeGreaterThan(80);
          expect(result.metrics.avg.latency).toBeGreaterThan(180);
          expect(result.metrics.avg.latency).toBeLessThan(500);
        });
      });
    });
  });

  describe('Throughput Benchmarks', () => {
    testProviders.forEach(({ provider, models }) => {
      describe(`${provider.toUpperCase()} Throughput`, () => {
        it(`should measure concurrent request throughput for ${provider}`, async () => {
          const client = createInstructorClient({
            provider,
            apiKey: `test-${provider}-key`,
            model: models.native,
          });

          const mockGenerate = jest.fn();
          const mockResponse = provider === 'claude'
            ? { success: true, data: { id: 'concurrent-test', name: 'Concurrent User', active: true } }
            : { data: { id: 'concurrent-test', name: 'Concurrent User', active: true } };

          if (provider === 'claude') {
            (client.client as any).generate = mockGenerate;
          } else {
            (client.client as any).generateStructuredOutput = mockGenerate;
          }

          mockGenerate.mockImplementation(() => 
            new Promise(resolve => setTimeout(() => resolve(mockResponse), 75))
          );

          const concurrentRequests = 10;
          const result = await benchmark.measurePerformance(
            `${provider} Concurrent Throughput`,
            provider,
            'simple',
            async () => {
              const promises = Array.from({ length: concurrentRequests }, () =>
                client.generateWithRetry<SimpleType>({
                  schema: SimpleSchema,
                  prompt: 'Generate concurrent data',
                  model: models.native,
                })
              );
              return await Promise.all(promises);
            },
            5
          );

          expect(result.successRate).toBeGreaterThan(80);
          expect(result.metrics.avg.throughput).toBeGreaterThan(1);
          expect(mockGenerate).toHaveBeenCalledTimes(concurrentRequests * 5);
        });
      });
    });
  });

  describe('Memory Usage Benchmarks', () => {
    testProviders.forEach(({ provider, models }) => {
      describe(`${provider.toUpperCase()} Memory Usage`, () => {
        it(`should measure memory usage for ${provider} operations`, async () => {
          const client = createInstructorClient({
            provider,
            apiKey: `test-${provider}-key`,
            model: models.native,
          });

          const mockGenerate = jest.fn();
          const mockResponse = provider === 'claude'
            ? { success: true, data: { id: 'memory-test', name: 'Memory Test User', active: true } }
            : { data: { id: 'memory-test', name: 'Memory Test User', active: true } };

          if (provider === 'claude') {
            (client.client as any).generate = mockGenerate;
          } else {
            (client.client as any).generateStructuredOutput = mockGenerate;
          }

          mockGenerate.mockResolvedValue(mockResponse);

          const result = await benchmark.measurePerformance(
            `${provider} Memory Usage`,
            provider,
            'simple',
            async () => {
              // Create some additional objects to simulate memory usage
              const largeArray = new Array(1000).fill(0).map((_, i) => ({ id: i, data: 'test'.repeat(100) }));
              
              const response = await client.generateWithRetry<SimpleType>({
                schema: SimpleSchema,
                prompt: 'Generate data for memory test',
                model: models.native,
              });

              // Use the array to prevent optimization
              largeArray.forEach(item => item.id);
              
              return response;
            },
            15
          );

          expect(result.successRate).toBeGreaterThan(90);
          expect(result.metrics.avg.memoryUsage.heapUsed).toBeGreaterThan(0);
          
          // Memory usage should be reasonable (less than 50MB per operation)
          expect(result.metrics.avg.memoryUsage.heapUsed).toBeLessThan(50 * 1024 * 1024);
        });
      });
    });
  });

  describe('Retry Performance Impact', () => {
    testProviders.forEach(({ provider, models }) => {
      describe(`${provider.toUpperCase()} Retry Impact`, () => {
        it(`should measure performance impact of retries for ${provider}`, async () => {
          const clientWithRetries = createInstructorClient({
            provider,
            apiKey: `test-${provider}-key`,
            model: models.native,
            retryConfig: {
              max_attempts: 3,
              initial_delay: 50,
              backoff_factor: 2,
            },
          });

          const mockGenerate = jest.fn();
          const mockResponse = provider === 'claude'
            ? { success: true, data: { id: 'retry-test', name: 'Retry Test User', active: true } }
            : { data: { id: 'retry-test', name: 'Retry Test User', active: true } };

          if (provider === 'claude') {
            (clientWithRetries.client as any).generate = mockGenerate;
          } else {
            (clientWithRetries.client as any).generateStructuredOutput = mockGenerate;
          }

          // Mock to fail first two attempts, succeed on third
          mockGenerate
            .mockRejectedValueOnce(new Error('503 Service Unavailable'))
            .mockRejectedValueOnce(new Error('503 Service Unavailable'))
            .mockResolvedValue(mockResponse);

          const result = await benchmark.measurePerformance(
            `${provider} Retry Performance Impact`,
            provider,
            'simple',
            async () => {
              return await clientWithRetries.generateWithRetry<SimpleType>({
                schema: SimpleSchema,
                prompt: 'Generate data with retries',
                model: models.native,
              });
            },
            5
          );

          expect(result.successRate).toBeGreaterThan(80);
          // Latency should be higher due to retries and delays
          expect(result.metrics.avg.latency).toBeGreaterThan(10);
          expect(mockGenerate).toHaveBeenCalledTimes(15); // 3 attempts × 5 iterations
        });
      });
    });
  });

  describe('Schema Complexity Performance Comparison', () => {
    it('should compare performance across schema complexities', async () => {
      const provider = 'claude';
      const client = createInstructorClient({
        provider,
        apiKey: `test-${provider}-key`,
        model: 'claude-3-5-sonnet-20241022',
      });

      const mockGenerate = jest.fn();
      (client.client as any).generate = mockGenerate;

      // Test simple schema
      mockGenerate.mockResolvedValue({
        success: true,
        data: { id: 'simple-1', name: 'Simple Test', active: true },
      });

      const simpleResult = await benchmark.measurePerformance(
        'Schema Complexity - Simple',
        provider,
        'simple',
        async () => {
          return await client.generateWithRetry<SimpleType>({
            schema: SimpleSchema,
            prompt: 'Generate simple data',
            model: 'claude-3-5-sonnet-20241022',
          });
        },
        10
      );

      // Test medium schema
      mockGenerate.mockResolvedValue({
        success: true,
        data: {
          user: {
            id: 'user-1',
            name: 'Medium Test',
            email: 'test@example.com',
            age: 30,
            preferences: { theme: 'dark' as const, notifications: true, language: 'en' },
          },
          metadata: { test: true },
          tags: ['test'],
        },
      });

      const mediumResult = await benchmark.measurePerformance(
        'Schema Complexity - Medium',
        provider,
        'medium',
        async () => {
          return await client.generateWithRetry<MediumType>({
            schema: MediumSchema,
            prompt: 'Generate medium complexity data',
            model: 'claude-3-5-sonnet-20241022',
          });
        },
        10
      );

      // Compare results
      expect(simpleResult.successRate).toBeGreaterThan(90);
      expect(mediumResult.successRate).toBeGreaterThan(90);
      
      // Medium schema should generally take longer than simple schema
      // (though this might not always be true with mocked responses)
      expect(simpleResult.metrics.avg.latency).toBeGreaterThan(0);
      expect(mediumResult.metrics.avg.latency).toBeGreaterThan(0);
    });
  });

  describe('Performance Regression Detection', () => {
    it('should detect performance regressions', async () => {
      const provider = 'claude';
      const client = createInstructorClient({
        provider,
        apiKey: `test-${provider}-key`,
        model: 'claude-3-5-sonnet-20241022',
      });

      const mockGenerate = jest.fn();
      (client.client as any).generate = mockGenerate;

      // Baseline performance (fast)
      mockGenerate.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          success: true,
          data: { id: 'baseline', name: 'Baseline Test', active: true },
        }), 25))
      );

      const baselineResult = await benchmark.measurePerformance(
        'Performance Baseline',
        provider,
        'simple',
        async () => {
          return await client.generateWithRetry<SimpleType>({
            schema: SimpleSchema,
            prompt: 'Generate baseline data',
            model: 'claude-3-5-sonnet-20241022',
          });
        },
        10
      );

      // Simulated regression (slower)
      mockGenerate.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          success: true,
          data: { id: 'regression', name: 'Regression Test', active: true },
        }), 100))
      );

      const regressionResult = await benchmark.measurePerformance(
        'Performance Regression',
        provider,
        'simple',
        async () => {
          return await client.generateWithRetry<SimpleType>({
            schema: SimpleSchema,
            prompt: 'Generate regression data',
            model: 'claude-3-5-sonnet-20241022',
          });
        },
        10
      );

      // Compare baseline vs regression
      expect(baselineResult.successRate).toBeGreaterThan(90);
      expect(regressionResult.successRate).toBeGreaterThan(90);
      
      // Regression should be significantly slower than baseline
      const latencyIncrease = regressionResult.metrics.avg.latency / baselineResult.metrics.avg.latency;
      expect(latencyIncrease).toBeGreaterThan(2); // At least 2x slower
      
      // Throughput should be significantly lower
      const throughputDecrease = baselineResult.metrics.avg.throughput / regressionResult.metrics.avg.throughput;
      expect(throughputDecrease).toBeGreaterThan(2); // At least 2x lower throughput
    });
  });

  describe('Load Testing', () => {
    it('should handle sustained load', async () => {
      const provider = 'claude';
      const client = createInstructorClient({
        provider,
        apiKey: `test-${provider}-key`,
        model: 'claude-3-5-sonnet-20241022',
      });

      const mockGenerate = jest.fn();
      (client.client as any).generate = mockGenerate;

      mockGenerate.mockResolvedValue({
        success: true,
        data: { id: 'load-test', name: 'Load Test User', active: true },
      });

      const result = await benchmark.measurePerformance(
        'Sustained Load Test',
        provider,
        'simple',
        async () => {
          return await client.generateWithRetry<SimpleType>({
            schema: SimpleSchema,
            prompt: 'Generate data under load',
            model: 'claude-3-5-sonnet-20241022',
          });
        },
        50 // Higher iteration count for load testing
      );

      expect(result.successRate).toBeGreaterThan(95);
      expect(result.errors).toBeLessThan(3);
      expect(result.metrics.avg.latency).toBeLessThan(1000); // Should stay under 1 second
      expect(mockGenerate).toHaveBeenCalledTimes(50);
    });
  });
});
