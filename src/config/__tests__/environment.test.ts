import { 
  EnvironmentValidator, 
  EnvironmentConfigError, 
  getEnvironmentValidator,
  validateGoogleApiKey,
  hasGoogleApiKey 
} from '../environment';

describe('EnvironmentValidator', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Clear environment variables for clean testing
    delete process.env['GOOGLE_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    delete process.env['ANTHROPIC_API_KEY'];
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('getInstance', () => {
    it('should return a singleton instance', () => {
      const instance1 = EnvironmentValidator.getInstance();
      const instance2 = EnvironmentValidator.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('getConfig', () => {
    it('should return environment configuration with undefined values when no env vars are set', () => {
      const validator = EnvironmentValidator.getInstance();
      validator.reload(); // Reload to pick up cleared environment
      
      const config = validator.getConfig();
      expect(config).toEqual({
        googleApiKey: undefined,
        openaiApiKey: undefined,
        anthropicApiKey: undefined,
      });
    });

    it('should return environment configuration with values when env vars are set', () => {
      process.env['GOOGLE_API_KEY'] = 'test-google-key';
      process.env['OPENAI_API_KEY'] = 'test-openai-key';
      
      const validator = EnvironmentValidator.getInstance();
      validator.reload(); // Reload to pick up new environment
      
      const config = validator.getConfig();
      expect(config).toEqual({
        googleApiKey: 'test-google-key',
        openaiApiKey: 'test-openai-key',
        anthropicApiKey: undefined,
      });
    });
  });

  describe('validateRequiredKeys', () => {
    it('should not throw when all required keys are present', () => {
      process.env['GOOGLE_API_KEY'] = 'test-google-key';
      process.env['OPENAI_API_KEY'] = 'test-openai-key';
      
      const validator = EnvironmentValidator.getInstance();
      validator.reload();
      
      expect(() => {
        validator.validateRequiredKeys(['googleApiKey', 'openaiApiKey']);
      }).not.toThrow();
    });

    it('should throw EnvironmentConfigError when required keys are missing', () => {
      const validator = EnvironmentValidator.getInstance();
      validator.reload();
      
      expect(() => {
        validator.validateRequiredKeys(['googleApiKey', 'openaiApiKey']);
      }).toThrow(EnvironmentConfigError);
    });

    it('should include missing keys in error message', () => {
      const validator = EnvironmentValidator.getInstance();
      validator.reload();
      
      try {
        validator.validateRequiredKeys(['googleApiKey', 'openaiApiKey']);
        fail('Expected EnvironmentConfigError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EnvironmentConfigError);
        const configError = error as EnvironmentConfigError;
        expect(configError.message).toContain('GOOGLE_API_KEY');
        expect(configError.message).toContain('OPENAI_API_KEY');
        expect(configError.missingKeys).toEqual(['GOOGLE_API_KEY', 'OPENAI_API_KEY']);
      }
    });
  });

  describe('getApiKey', () => {
    it('should return API key when present', () => {
      process.env['GOOGLE_API_KEY'] = 'test-google-key';
      
      const validator = EnvironmentValidator.getInstance();
      validator.reload();
      
      const apiKey = validator.getApiKey('google');
      expect(apiKey).toBe('test-google-key');
    });

    it('should throw EnvironmentConfigError when API key is missing', () => {
      const validator = EnvironmentValidator.getInstance();
      validator.reload();
      
      expect(() => {
        validator.getApiKey('google');
      }).toThrow(EnvironmentConfigError);
    });

    it('should include correct environment variable name in error', () => {
      const validator = EnvironmentValidator.getInstance();
      validator.reload();
      
      try {
        validator.getApiKey('google');
        fail('Expected EnvironmentConfigError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EnvironmentConfigError);
        const configError = error as EnvironmentConfigError;
        expect(configError.message).toContain('GOOGLE_API_KEY');
        expect(configError.missingKeys).toEqual(['GOOGLE_API_KEY']);
      }
    });
  });

  describe('hasApiKey', () => {
    it('should return true when API key is present', () => {
      process.env['GOOGLE_API_KEY'] = 'test-google-key';
      
      const validator = EnvironmentValidator.getInstance();
      validator.reload();
      
      expect(validator.hasApiKey('google')).toBe(true);
    });

    it('should return false when API key is missing', () => {
      const validator = EnvironmentValidator.getInstance();
      validator.reload();
      
      expect(validator.hasApiKey('google')).toBe(false);
    });

    it('should return false when API key is empty string', () => {
      process.env['GOOGLE_API_KEY'] = '';
      
      const validator = EnvironmentValidator.getInstance();
      validator.reload();
      
      expect(validator.hasApiKey('google')).toBe(false);
    });
  });

  describe('convenience functions', () => {
    describe('getEnvironmentValidator', () => {
      it('should return the singleton instance', () => {
        const validator1 = getEnvironmentValidator();
        const validator2 = EnvironmentValidator.getInstance();
        expect(validator1).toBe(validator2);
      });
    });

    describe('validateGoogleApiKey', () => {
      it('should return API key when present', () => {
        process.env['GOOGLE_API_KEY'] = 'test-google-key';
        
        const validator = EnvironmentValidator.getInstance();
        validator.reload();
        
        const apiKey = validateGoogleApiKey();
        expect(apiKey).toBe('test-google-key');
      });

      it('should throw when API key is missing', () => {
        const validator = EnvironmentValidator.getInstance();
        validator.reload();
        
        expect(() => validateGoogleApiKey()).toThrow(EnvironmentConfigError);
      });
    });

    describe('hasGoogleApiKey', () => {
      it('should return true when API key is present', () => {
        process.env['GOOGLE_API_KEY'] = 'test-google-key';
        
        const validator = EnvironmentValidator.getInstance();
        validator.reload();
        
        expect(hasGoogleApiKey()).toBe(true);
      });

      it('should return false when API key is missing', () => {
        const validator = EnvironmentValidator.getInstance();
        validator.reload();
        
        expect(hasGoogleApiKey()).toBe(false);
      });
    });
  });
});
