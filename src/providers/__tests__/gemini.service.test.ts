import { GeminiService, createGeminiService, validateApiKey } from '../gemini.service';
import { EnvironmentConfigError, validateGoogleApiKey } from '../../config/environment';

// Mock the dependencies
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    // Mock Google client methods if needed
  }))
}));

jest.mock('@instructor-ai/instructor', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn()
      }
    }
  }))
}));

// Mock the environment validator to avoid singleton issues in tests
jest.mock('../../config/environment', () => {
  const originalModule = jest.requireActual('../../config/environment');
  return {
    ...originalModule,
    validateGoogleApiKey: jest.fn(),
    EnvironmentConfigError: originalModule.EnvironmentConfigError
  };
});

describe('GeminiService', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Clear environment variables for clean testing
    delete process.env['GOOGLE_API_KEY'];
    
    // Clear module cache to ensure fresh imports
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should instantiate successfully with provided API key', () => {
      const mockApiKey = 'test-api-key';
      
      expect(() => {
        new GeminiService(mockApiKey);
      }).not.toThrow();
    });

    it('should instantiate successfully when GOOGLE_API_KEY is in environment', () => {
      const mockValidateGoogleApiKey = validateGoogleApiKey as jest.MockedFunction<typeof validateGoogleApiKey>;
      mockValidateGoogleApiKey.mockReturnValue('test-env-api-key');
      
      expect(() => {
        new GeminiService();
      }).not.toThrow();
    });

    it('should throw EnvironmentConfigError when no API key is provided and none in environment', () => {
      const mockValidateGoogleApiKey = validateGoogleApiKey as jest.MockedFunction<typeof validateGoogleApiKey>;
      mockValidateGoogleApiKey.mockImplementation(() => {
        throw new EnvironmentConfigError('GOOGLE_API_KEY environment variable is required but not found.', ['GOOGLE_API_KEY']);
      });
      
      expect(() => {
        new GeminiService();
      }).toThrow(EnvironmentConfigError);
    });

    it('should throw EnvironmentConfigError with proper message when API key is missing', () => {
      const mockValidateGoogleApiKey = validateGoogleApiKey as jest.MockedFunction<typeof validateGoogleApiKey>;
      mockValidateGoogleApiKey.mockImplementation(() => {
        throw new EnvironmentConfigError('GOOGLE_API_KEY environment variable is required but not found.', ['GOOGLE_API_KEY']);
      });
      
      try {
        new GeminiService();
        fail('Expected EnvironmentConfigError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EnvironmentConfigError);
        const configError = error as EnvironmentConfigError;
        expect(configError.message).toContain('GOOGLE_API_KEY');
        expect(configError.missingKeys).toContain('GOOGLE_API_KEY');
      }
    });
  });

  describe('getInstructorClient', () => {
    it('should return the instructor client instance', () => {
      const service = new GeminiService('test-api-key');
      const client = service.getInstructorClient();
      
      expect(client).toBeDefined();
    });
  });

  describe('getGoogleClient', () => {
    it('should return the Google Generative AI client instance', () => {
      const service = new GeminiService('test-api-key');
      const client = service.getGoogleClient();
      
      expect(client).toBeDefined();
    });
  });

  describe('testConnection', () => {
    it('should be defined and callable', () => {
      const service = new GeminiService('test-api-key');
      
      expect(service.testConnection).toBeDefined();
      expect(typeof service.testConnection).toBe('function');
    });
  });

  describe('generateStructuredOutput', () => {
    it('should be defined and callable', () => {
      const service = new GeminiService('test-api-key');
      
      expect(service.generateStructuredOutput).toBeDefined();
      expect(typeof service.generateStructuredOutput).toBe('function');
    });
  });

  describe('factory functions', () => {
    describe('createGeminiService', () => {
      it('should create a GeminiService instance with provided API key', () => {
        const service = createGeminiService('test-api-key');
        
        expect(service).toBeInstanceOf(GeminiService);
      });

      it('should create a GeminiService instance without API key when env var is set', () => {
        const mockValidateGoogleApiKey = validateGoogleApiKey as jest.MockedFunction<typeof validateGoogleApiKey>;
        mockValidateGoogleApiKey.mockReturnValue('test-env-api-key');
        
        const service = createGeminiService();
        
        expect(service).toBeInstanceOf(GeminiService);
      });
    });

    describe('validateApiKey', () => {
      it('should return true when API key is provided', () => {
        const result = validateApiKey('test-api-key');
        
        expect(result).toBe(true);
      });

      it('should return true when API key is in environment', () => {
        process.env['GOOGLE_API_KEY'] = 'test-env-api-key';
        
        const result = validateApiKey();
        
        expect(result).toBe(true);
      });

      it('should return false when no API key is provided and none in environment', () => {
        const result = validateApiKey();
        
        expect(result).toBe(false);
      });

      it('should return false when empty string is provided', () => {
        const result = validateApiKey('');
        
        expect(result).toBe(false);
      });

      it('should return false when empty string is in environment', () => {
        process.env['GOOGLE_API_KEY'] = '';
        
        const result = validateApiKey();
        
        expect(result).toBe(false);
      });
    });
  });

  describe('integration with environment validator', () => {
    it('should use environment validator for API key loading', () => {
      const mockValidateGoogleApiKey = validateGoogleApiKey as jest.MockedFunction<typeof validateGoogleApiKey>;
      mockValidateGoogleApiKey.mockReturnValue('test-env-key');
      
      const service = new GeminiService();
      
      // Verify that the service was created successfully
      expect(service).toBeInstanceOf(GeminiService);
      expect(service.getInstructorClient()).toBeDefined();
      expect(service.getGoogleClient()).toBeDefined();
    });

    it('should propagate EnvironmentConfigError from environment validator', () => {
      const mockValidateGoogleApiKey = validateGoogleApiKey as jest.MockedFunction<typeof validateGoogleApiKey>;
      mockValidateGoogleApiKey.mockImplementation(() => {
        throw new EnvironmentConfigError('GOOGLE_API_KEY environment variable is required but not found.', ['GOOGLE_API_KEY']);
      });
      
      expect(() => {
        new GeminiService();
      }).toThrow(EnvironmentConfigError);
    });
  });
});
