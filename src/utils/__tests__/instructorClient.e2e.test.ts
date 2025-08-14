import { z } from 'zod';
import {
  createInstructorClient,
  createInstructorClientFromEnv,
  type LLMProvider,
} from '../instructorClient.js';

// Real-world schemas for end-to-end testing
const UserRegistrationSchema = z.object({
  user: z.object({
    id: z.string().uuid().describe('Unique user identifier'),
    email: z.string().email().describe('User email address'),
    username: z.string().min(3).max(20).describe('Username (3-20 characters)'),
    profile: z.object({
      firstName: z.string().min(1).describe('First name'),
      lastName: z.string().min(1).describe('Last name'),
      dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Date of birth (YYYY-MM-DD)'),
      phoneNumber: z.string().regex(/^\+?[\d\s\-\(\)]+$/).optional().describe('Phone number'),
      address: z.object({
        street: z.string().describe('Street address'),
        city: z.string().describe('City'),
        state: z.string().describe('State/Province'),
        zipCode: z.string().describe('ZIP/Postal code'),
        country: z.string().describe('Country'),
      }).describe('User address'),
    }).describe('User profile information'),
    preferences: z.object({
      language: z.enum(['en', 'es', 'fr', 'de', 'it']).describe('Preferred language'),
      timezone: z.string().describe('User timezone'),
      notifications: z.object({
        email: z.boolean().describe('Email notifications enabled'),
        sms: z.boolean().describe('SMS notifications enabled'),
        push: z.boolean().describe('Push notifications enabled'),
      }).describe('Notification preferences'),
      privacy: z.object({
        profileVisibility: z.enum(['public', 'friends', 'private']).describe('Profile visibility'),
        dataSharing: z.boolean().describe('Allow data sharing'),
      }).describe('Privacy settings'),
    }).describe('User preferences'),
  }).describe('User registration data'),
  metadata: z.object({
    registrationSource: z.enum(['web', 'mobile', 'api']).describe('Registration source'),
    referralCode: z.string().optional().describe('Referral code if applicable'),
    marketingConsent: z.boolean().describe('Marketing consent given'),
    termsVersion: z.string().describe('Terms of service version accepted'),
    registrationTimestamp: z.string().describe('ISO timestamp of registration'),
  }).describe('Registration metadata'),
});

const ProductCatalogSchema = z.object({
  catalog: z.object({
    id: z.string().describe('Catalog identifier'),
    name: z.string().describe('Catalog name'),
    description: z.string().describe('Catalog description'),
    version: z.string().describe('Catalog version'),
    lastUpdated: z.string().describe('Last update timestamp'),
    categories: z.array(z.object({
      id: z.string().describe('Category ID'),
      name: z.string().describe('Category name'),
      description: z.string().describe('Category description'),
      parentId: z.string().optional().describe('Parent category ID'),
      products: z.array(z.object({
        id: z.string().describe('Product ID'),
        sku: z.string().describe('Product SKU'),
        name: z.string().describe('Product name'),
        description: z.string().describe('Product description'),
        price: z.object({
          amount: z.number().positive().describe('Price amount'),
          currency: z.string().length(3).describe('Currency code (ISO 4217)'),
          discountedAmount: z.number().positive().optional().describe('Discounted price'),
        }).describe('Product pricing'),
        inventory: z.object({
          inStock: z.boolean().describe('Whether product is in stock'),
          quantity: z.number().int().min(0).describe('Available quantity'),
          reserved: z.number().int().min(0).describe('Reserved quantity'),
          reorderLevel: z.number().int().min(0).describe('Reorder threshold'),
        }).describe('Inventory information'),
        attributes: z.record(z.string(), z.any()).describe('Product attributes'),
        images: z.array(z.object({
          url: z.string().url().describe('Image URL'),
          alt: z.string().describe('Alt text'),
          isPrimary: z.boolean().describe('Is primary image'),
        })).describe('Product images'),
        reviews: z.object({
          averageRating: z.number().min(0).max(5).describe('Average rating'),
          totalReviews: z.number().int().min(0).describe('Total number of reviews'),
          ratingDistribution: z.record(z.string(), z.number().int().min(0)).describe('Rating distribution'),
        }).describe('Product reviews'),
      })).describe('Products in category'),
    })).describe('Product categories'),
  }).describe('Product catalog'),
  searchFilters: z.array(z.object({
    id: z.string().describe('Filter ID'),
    name: z.string().describe('Filter name'),
    type: z.enum(['range', 'select', 'multiselect', 'boolean']).describe('Filter type'),
    options: z.array(z.object({
      value: z.string().describe('Option value'),
      label: z.string().describe('Option label'),
      count: z.number().int().min(0).describe('Number of products with this option'),
    })).optional().describe('Filter options'),
  })).describe('Available search filters'),
});


// End-to-end test scenarios
interface E2ETestScenario {
  name: string;
  description: string;
  schema: z.ZodSchema<any>;
  prompt: string;
  expectedFields: string[];
  validationRules: Array<(data: any) => boolean>;
}

const testScenarios: E2ETestScenario[] = [
  {
    name: 'User Registration Flow',
    description: 'Complete user registration with profile, preferences, and metadata',
    schema: UserRegistrationSchema,
    prompt: 'Generate a complete user registration for John Smith, a 28-year-old software engineer from San Francisco who is registering via the web platform. Include all required profile information, preferences for English language and Pacific timezone, and appropriate metadata.',
    expectedFields: ['user.id', 'user.email', 'user.profile.firstName', 'metadata.registrationSource'],
    validationRules: [
      (data) => data.user?.profile?.firstName === 'John',
      (data) => data.user?.profile?.lastName === 'Smith',
      (data) => data.metadata?.registrationSource === 'web',
      (data) => data.user?.preferences?.language === 'en',
    ],
  },
  {
    name: 'E-commerce Product Catalog',
    description: 'Complex product catalog with categories, inventory, and reviews',
    schema: ProductCatalogSchema,
    prompt: 'Generate a product catalog for an electronics store with categories for laptops and smartphones. Include 2 laptops and 2 smartphones with complete pricing, inventory, and review information. Add appropriate search filters for price range and brand.',
    expectedFields: ['catalog.categories', 'catalog.categories[0].products', 'searchFilters'],
    validationRules: [
      (data) => data.catalog.categories.length >= 2,
      (data) => data.catalog.categories.some((cat: any) => cat.products.length >= 2),
      (data) => data.searchFilters.length > 0,
      (data) => data.catalog.categories.every((cat: any) => 
        cat.products.every((prod: any) => prod.price.currency === 'USD')
      ),
    ],
  },
];

describe('Instructor Client End-to-End Tests', () => {
  // Test providers for E2E scenarios
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
    // Use real API keys from root .env.local file
    // These should already be loaded by dotenv in jest.setup.js
    if (!process.env['ANTHROPIC_API_KEY']) {
      console.warn('ANTHROPIC_API_KEY not found in environment variables');
    }
    if (!process.env['GOOGLE_API_KEY']) {
      console.warn('GOOGLE_API_KEY not found in environment variables');
    }
  });

  describe('Complete Workflow Tests', () => {
    testProviders.forEach(({ provider, models }) => {
      describe(`${provider.toUpperCase()} Provider E2E`, () => {
        testScenarios.forEach((scenario) => {
          it(`should handle ${scenario.name} with ${provider}`, async () => {
            // Create client with realistic configuration
            const client = createInstructorClient({
              provider,
              apiKey: `test-${provider}-key`,
              model: models.native,
              enableAutoModeSelection: true,
              enableStructuredLogging: true,
              retryConfig: {
                max_attempts: 3,
                initial_delay: 1000,
                backoff_factor: 2,
                jitter: true,
              },
            });

            // Mock the appropriate generate method
            const mockGenerate = jest.fn();
            if (provider === 'claude') {
              (client.client as any).generate = mockGenerate;
            } else {
              (client.client as any).generateStructuredOutput = mockGenerate;
            }

            // Create realistic mock response based on scenario
            const mockResponse = createMockResponse(provider, scenario);
            mockGenerate.mockResolvedValue(mockResponse);

            // Execute the end-to-end scenario
            const startTime = Date.now();
            const result = await client.generateWithRetry({
              schema: scenario.schema,
              prompt: scenario.prompt,
              model: models.native,
              temperature: 0.1,
              maxTokens: 4000,
            });
            const endTime = Date.now();

            // Verify basic response structure
            expect(result).toBeDefined();
            expect(typeof result).toBe('object');


            // Verify expected fields are present
            scenario.expectedFields.forEach(fieldPath => {
              // For Gemini, the data is nested under a 'data' property
              const adjustedPath = provider === 'gemini' ? `data.${fieldPath}` : fieldPath;
              const fieldValue = getNestedValue(result, adjustedPath);
              expect(fieldValue).toBeDefined();
            });

            // Run custom validation rules
            scenario.validationRules.forEach(rule => {
              // For Gemini, pass the nested data to validation rules
              const dataToValidate = provider === 'gemini' ? (result as any).data : result;
              expect(rule(dataToValidate)).toBe(true);
            });

            // Verify performance is reasonable
            const latency = endTime - startTime;
            expect(latency).toBeLessThan(10000); // Should complete within 10 seconds

            // Verify mock was called
            expect(mockGenerate).toHaveBeenCalledTimes(1);
          });
        });
      });
    });
  });

  describe('Error Recovery Scenarios', () => {
    testProviders.forEach(({ provider, models }) => {
      describe(`${provider.toUpperCase()} Error Recovery`, () => {
        it(`should recover from transient failures with ${provider}`, async () => {
          const client = createInstructorClient({
            provider,
            apiKey: `test-${provider}-key`,
            model: models.native,
            retryConfig: {
              max_attempts: 3,
              initial_delay: 100,
              backoff_factor: 2,
            },
          });

          const mockGenerate = jest.fn();
          if (provider === 'claude') {
            (client.client as any).generate = mockGenerate;
          } else {
            (client.client as any).generateStructuredOutput = mockGenerate;
          }

          const scenario = testScenarios[0]!; // Use user registration scenario
          const mockResponse = createMockResponse(provider, scenario);

          // Mock transient failures followed by success
          mockGenerate
            .mockRejectedValueOnce(new Error('503 Service Unavailable'))
            .mockRejectedValueOnce(new Error('429 Too Many Requests'))
            .mockResolvedValueOnce(mockResponse);

          const result = await client.generateWithRetry({
            schema: scenario.schema,
            prompt: scenario.prompt,
            model: models.native,
          });

          expect(result).toBeDefined();
          expect(mockGenerate).toHaveBeenCalledTimes(3);
          
          // Verify the result still passes validation
          scenario.validationRules.forEach(rule => {
            // For Gemini, pass the nested data to validation rules
            const dataToValidate = provider === 'gemini' ? (result as any).data : result;
            expect(rule(dataToValidate)).toBe(true);
          });
        });

        it(`should handle schema validation errors gracefully with ${provider}`, async () => {
          const client = createInstructorClient({
            provider,
            apiKey: `test-${provider}-key`,
            model: models.native,
          });

          const mockGenerate = jest.fn();
          if (provider === 'claude') {
            (client.client as any).generate = mockGenerate;
          } else {
            (client.client as any).generateStructuredOutput = mockGenerate;
          }

          // Mock invalid response that fails schema validation
          const invalidResponse = provider === 'claude'
            ? { success: false, errors: [{ message: 'Schema validation failed: Invalid email format' }] }
            : Promise.reject(new Error('Schema validation failed: Invalid email format'));

          mockGenerate.mockResolvedValue(invalidResponse);

          const scenario = testScenarios[0]!;
          await expect(
            client.generateWithRetry({
              schema: scenario.schema,
              prompt: scenario.prompt,
              model: models.native,
            })
          ).rejects.toThrow('Schema validation failed');
        });
      });
    });
  });

  describe('Configuration Scenarios', () => {
    it('should work with environment-based configuration', () => {
      testProviders.forEach(({ provider, models }) => {
        const client = createInstructorClientFromEnv(provider, {
          model: models.native,
          enableAutoModeSelection: true,
          retryConfig: {
            max_attempts: 2,
            initial_delay: 500,
          },
        });

        expect(client.provider).toBe(provider);
        expect(client._retryConfig.max_attempts).toBe(2);
        expect(client._retryConfig.initial_delay).toBe(500);
      });
    });

    it('should handle different model configurations', async () => {
      const provider = 'claude';
      
      // Test native model
      const nativeClient = createInstructorClient({
        provider,
        apiKey: `test-${provider}-key`,
        model: 'claude-3-5-sonnet-20241022',
        enableAutoModeSelection: true,
      });

      // Test fallback model
      const fallbackClient = createInstructorClient({
        provider,
        apiKey: `test-${provider}-key`,
        model: 'claude-2.1',
        enableAutoModeSelection: true,
      });

      expect(nativeClient.provider).toBe(provider);
      expect(fallbackClient.provider).toBe(provider);

      // Both should be able to handle the same schema
      const scenario = testScenarios[0]!;
      const mockResponse = createMockResponse(provider, scenario);

      const nativeMock = jest.fn().mockResolvedValue(mockResponse);
      const fallbackMock = jest.fn().mockResolvedValue(mockResponse);

      (nativeClient.client as any).generate = nativeMock;
      (fallbackClient.client as any).generate = fallbackMock;

      const nativeResult = await nativeClient.generateWithRetry({
        schema: scenario.schema,
        prompt: scenario.prompt,
        model: 'claude-3-5-sonnet-20241022',
      });

      const fallbackResult = await fallbackClient.generateWithRetry({
        schema: scenario.schema,
        prompt: scenario.prompt,
        model: 'claude-2.1',
      });

      expect(nativeResult).toBeDefined();
      expect(fallbackResult).toBeDefined();
    });
  });

  describe('Real-World Usage Patterns', () => {
    it('should handle batch processing scenario', async () => {
      const provider = 'claude';
      const client = createInstructorClient({
        provider,
        apiKey: `test-${provider}-key`,
        model: 'claude-3-5-sonnet-20241022',
      });

      const mockGenerate = jest.fn();
      (client.client as any).generate = mockGenerate;

      const scenario = testScenarios[0]!; // User registration
      const mockResponse = createMockResponse(provider, scenario);
      mockGenerate.mockResolvedValue(mockResponse);

      // Simulate batch processing of multiple user registrations
      const batchSize = 5;
      const promises = Array.from({ length: batchSize }, (_, i) =>
        client.generateWithRetry({
          schema: scenario.schema,
          prompt: `${scenario.prompt} User ${i + 1}`,
          model: 'claude-3-5-sonnet-20241022',
        })
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(batchSize);
      results.forEach(result => {
        expect(result).toBeDefined();
        scenario.validationRules.forEach(rule => {
          expect(rule(result)).toBe(true);
        });
      });

      expect(mockGenerate).toHaveBeenCalledTimes(batchSize);
    });

    it('should handle mixed schema types in sequence', async () => {
      const provider = 'gemini';
      const client = createInstructorClient({
        provider,
        apiKey: `test-${provider}-key`,
        model: 'gemini-1.5-pro-latest',
      });

      const mockGenerate = jest.fn();
      (client.client as any).generateStructuredOutput = mockGenerate;

      // Process different scenarios in sequence
      for (const scenario of testScenarios) {
        const mockResponse = createMockResponse(provider, scenario);
        mockGenerate.mockResolvedValueOnce(mockResponse);

        const result = await client.generateWithRetry({
          schema: scenario.schema,
          prompt: scenario.prompt,
          model: 'gemini-1.5-pro-latest',
        });

        expect(result).toBeDefined();
        scenario.validationRules.forEach(rule => {
          expect(rule(result)).toBe(true);
        });
      }

      expect(mockGenerate).toHaveBeenCalledTimes(testScenarios.length);
    });

    it('should handle long-running operations with timeouts', async () => {
      const provider = 'claude';
      const client = createInstructorClient({
        provider,
        apiKey: `test-${provider}-key`,
        model: 'claude-3-5-sonnet-20241022',
        retryConfig: {
          max_attempts: 1, // No retries for this test
          initial_delay: 100,
        },
      });

      const mockGenerate = jest.fn();
      (client.client as any).generate = mockGenerate;

      const scenario = testScenarios[1]!; // Product catalog (complex)
      
      // Mock a slow response
      mockGenerate.mockImplementation(() => 
        new Promise(resolve => {
          setTimeout(() => {
            const mockResponse = createMockResponse(provider, scenario);
            resolve(mockResponse);
          }, 2000); // 2 second delay
        })
      );

      const startTime = Date.now();
      const result = await client.generateWithRetry({
        schema: scenario.schema,
        prompt: scenario.prompt,
        model: 'claude-3-5-sonnet-20241022',
        maxTokens: 8000, // Large token limit for complex response
      });
      const endTime = Date.now();

      expect(result).toBeDefined();
      expect(endTime - startTime).toBeGreaterThan(1500); // Should take at least 1.5 seconds
      expect(endTime - startTime).toBeLessThan(5000); // But not more than 5 seconds

      scenario.validationRules.forEach(rule => {
        expect(rule(result)).toBe(true);
      });
    });
  });

  describe('Integration with Caching and Cost Calculation', () => {
    it('should work with caching enabled', async () => {
      const provider = 'claude';
      const client = createInstructorClient({
        provider,
        apiKey: `test-${provider}-key`,
        model: 'claude-3-5-sonnet-20241022',
        enableStructuredLogging: true,
      });

      const mockGenerate = jest.fn();
      (client.client as any).generate = mockGenerate;

      const scenario = testScenarios[0]!;
      const mockResponse = createMockResponse(provider, scenario);
      mockGenerate.mockResolvedValue(mockResponse);

      // First call
      const result1 = await client.generateWithRetry({
        schema: scenario.schema,
        prompt: scenario.prompt,
        model: 'claude-3-5-sonnet-20241022',
      });

      // Second call with same parameters (would hit cache in real implementation)
      const result2 = await client.generateWithRetry({
        schema: scenario.schema,
        prompt: scenario.prompt,
        model: 'claude-3-5-sonnet-20241022',
      });

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(mockGenerate).toHaveBeenCalledTimes(2); // Mock doesn't implement caching
    });
  });
});

// Helper functions for E2E tests
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => {
    if (!current) return undefined;
    
    if (key.includes('[') && key.includes(']')) {
      const arrayKey = key.substring(0, key.indexOf('['));
      const index = parseInt(key.substring(key.indexOf('[') + 1, key.indexOf(']')));
      return current[arrayKey]?.[index];
    }
    return current[key];
  }, obj);
}

function createMockResponse(provider: LLMProvider, scenario: E2ETestScenario): any {
  const baseData = generateMockData(scenario.name);
  
  if (provider === 'claude') {
    return {
      success: true,
      data: baseData,
    };
  } else {
    return {
      data: baseData,
    };
  }
}

function generateMockData(scenarioName: string): any {
  switch (scenarioName) {
    case 'User Registration Flow':
      return {
        user: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          email: 'john.smith@example.com',
          username: 'johnsmith',
          profile: {
            firstName: 'John',
            lastName: 'Smith',
            dateOfBirth: '1995-06-15',
            phoneNumber: '+1-555-123-4567',
            address: {
              street: '123 Main St',
              city: 'San Francisco',
              state: 'CA',
              zipCode: '94105',
              country: 'USA',
            },
          },
          preferences: {
            language: 'en',
            timezone: 'America/Los_Angeles',
            notifications: {
              email: true,
              sms: false,
              push: true,
            },
            privacy: {
              profileVisibility: 'friends',
              dataSharing: false,
            },
          },
        },
        metadata: {
          registrationSource: 'web',
          referralCode: 'REF123',
          marketingConsent: true,
          termsVersion: '2.1',
          registrationTimestamp: '2024-01-15T10:30:00Z',
        },
      };

    case 'E-commerce Product Catalog':
      return {
        catalog: {
          id: 'catalog-electronics-2024',
          name: 'Electronics Catalog',
          description: 'Complete electronics product catalog',
          version: '1.0',
          lastUpdated: '2024-01-15T10:00:00Z',
          categories: [
            {
              id: 'laptops',
              name: 'Laptops',
              description: 'Portable computers',
              products: [
                {
                  id: 'laptop-1',
                  sku: 'LAP-001',
                  name: 'MacBook Pro 16"',
                  description: 'High-performance laptop',
                  price: {
                    amount: 2499.99,
                    currency: 'USD',
                    discountedAmount: 2299.99,
                  },
                  inventory: {
                    inStock: true,
                    quantity: 25,
                    reserved: 5,
                    reorderLevel: 10,
                  },
                  attributes: {
                    brand: 'Apple',
                    screenSize: '16 inches',
                    processor: 'M3 Pro',
                  },
                  images: [
                    {
                      url: 'https://example.com/laptop1.jpg',
                      alt: 'MacBook Pro 16 inch',
                      isPrimary: true,
                    },
                  ],
                  reviews: {
                    averageRating: 4.5,
                    totalReviews: 128,
                    ratingDistribution: {
                      '5': 80,
                      '4': 32,
                      '3': 12,
                      '2': 3,
                      '1': 1,
                    },
                  },
                },
                {
                  id: 'laptop-2',
                  sku: 'LAP-002',
                  name: 'Dell XPS 15',
                  description: 'Premium Windows laptop',
                  price: {
                    amount: 1899.99,
                    currency: 'USD',
                  },
                  inventory: {
                    inStock: true,
                    quantity: 15,
                    reserved: 2,
                    reorderLevel: 5,
                  },
                  attributes: {
                    brand: 'Dell',
                    screenSize: '15 inches',
                    processor: 'Intel i7',
                  },
                  images: [
                    {
                      url: 'https://example.com/laptop2.jpg',
                      alt: 'Dell XPS 15',
                      isPrimary: true,
                    },
                  ],
                  reviews: {
                    averageRating: 4.2,
                    totalReviews: 95,
                    ratingDistribution: {
                      '5': 45,
                      '4': 35,
                      '3': 10,
                      '2': 3,
                      '1': 2,
                    },
                  },
                },
              ],
            },
            {
              id: 'smartphones',
              name: 'Smartphones',
              description: 'Mobile phones',
              products: [
                {
                  id: 'phone-1',
                  sku: 'PHN-001',
                  name: 'iPhone 15 Pro',
                  description: 'Latest iPhone model',
                  price: {
                    amount: 999.99,
                    currency: 'USD',
                  },
                  inventory: {
                    inStock: true,
                    quantity: 50,
                    reserved: 10,
                    reorderLevel: 20,
                  },
                  attributes: {
                    brand: 'Apple',
                    screenSize: '6.1 inches',
                    storage: '128GB',
                  },
                  images: [
                    {
                      url: 'https://example.com/phone1.jpg',
                      alt: 'iPhone 15 Pro',
                      isPrimary: true,
                    },
                  ],
                  reviews: {
                    averageRating: 4.7,
                    totalReviews: 256,
                    ratingDistribution: {
                      '5': 180,
                      '4': 50,
                      '3': 20,
                      '2': 4,
                      '1': 2,
                    },
                  },
                },
                {
                  id: 'phone-2',
                  sku: 'PHN-002',
                  name: 'Samsung Galaxy S24',
                  description: 'Premium Android phone',
                  price: {
                    amount: 899.99,
                    currency: 'USD',
                  },
                  inventory: {
                    inStock: true,
                    quantity: 30,
                    reserved: 5,
                    reorderLevel: 15,
                  },
                  attributes: {
                    brand: 'Samsung',
                    screenSize: '6.2 inches',
                    storage: '256GB',
                  },
                  images: [
                    {
                      url: 'https://example.com/phone2.jpg',
                      alt: 'Samsung Galaxy S24',
                      isPrimary: true,
                    },
                  ],
                  reviews: {
                    averageRating: 4.4,
                    totalReviews: 189,
                    ratingDistribution: {
                      '5': 120,
                      '4': 45,
                      '3': 18,
                      '2': 4,
                      '1': 2,
                    },
                  },
                },
              ],
            },
          ],
        },
        searchFilters: [
          {
            id: 'price-range',
            name: 'Price Range',
            type: 'range',
            options: [
              { value: '0-500', label: 'Under $500', count: 15 },
              { value: '500-1000', label: '$500 - $1000', count: 25 },
              { value: '1000-2000', label: '$1000 - $2000', count: 18 },
              { value: '2000+', label: 'Over $2000', count: 8 },
            ],
          },
          {
            id: 'brand',
            name: 'Brand',
            type: 'multiselect',
            options: [
              { value: 'apple', label: 'Apple', count: 12 },
              { value: 'samsung', label: 'Samsung', count: 8 },
              { value: 'dell', label: 'Dell', count: 6 },
            ],
          },
        ],
      };

    default:
      return {};
  }
}
