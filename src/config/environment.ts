/**
 * Environment Configuration and Validation
 * 
 * This module handles loading and validating environment variables,
 * particularly API keys for various LLM providers.
 */

export interface EnvironmentConfig {
  googleApiKey: string | undefined;
  openaiApiKey: string | undefined;
  anthropicApiKey: string | undefined;
}

export class EnvironmentConfigError extends Error {
  constructor(message: string, public missingKeys: string[] = []) {
    super(message);
    this.name = 'EnvironmentConfigError';
  }
}

/**
 * Load and validate environment configuration
 */
export class EnvironmentValidator {
  private static instance: EnvironmentValidator;
  private config: EnvironmentConfig;

  private constructor() {
    this.config = this.loadEnvironmentConfig();
  }

  public static getInstance(): EnvironmentValidator {
    if (!EnvironmentValidator.instance) {
      EnvironmentValidator.instance = new EnvironmentValidator();
    }
    return EnvironmentValidator.instance;
  }

  /**
   * Load environment variables
   */
  private loadEnvironmentConfig(): EnvironmentConfig {
    return {
      googleApiKey: process.env['GOOGLE_API_KEY'],
      openaiApiKey: process.env['OPENAI_API_KEY'],
      anthropicApiKey: process.env['ANTHROPIC_API_KEY'],
    };
  }

  /**
   * Get the current environment configuration
   */
  public getConfig(): EnvironmentConfig {
    return { ...this.config };
  }

  /**
   * Validate that required API keys are present
   * @param requiredKeys - Array of required environment variable names
   * @throws {EnvironmentConfigError} If any required keys are missing
   */
  public validateRequiredKeys(requiredKeys: (keyof EnvironmentConfig)[]): void {
    const missingKeys: string[] = [];
    
    for (const key of requiredKeys) {
      if (!this.config[key]) {
        // Convert camelCase to UPPER_SNAKE_CASE for error messages
        const envVarName = this.camelToSnakeCase(key).toUpperCase();
        missingKeys.push(envVarName);
      }
    }

    if (missingKeys.length > 0) {
      throw new EnvironmentConfigError(
        `Missing required environment variables: ${missingKeys.join(', ')}. ` +
        `Please set these variables in your .env file or environment.`,
        missingKeys
      );
    }
  }

  /**
   * Get a specific API key with validation
   * @param provider - The provider name
   * @returns The API key
   * @throws {EnvironmentConfigError} If the key is missing
   */
  public getApiKey(provider: 'google' | 'openai' | 'anthropic'): string {
    const keyMap = {
      google: 'googleApiKey' as const,
      openai: 'openaiApiKey' as const,
      anthropic: 'anthropicApiKey' as const,
    };

    const configKey = keyMap[provider];
    const apiKey = this.config[configKey];

    if (!apiKey) {
      const envVarName = this.camelToSnakeCase(configKey).toUpperCase();
      throw new EnvironmentConfigError(
        `${envVarName} environment variable is required but not found. ` +
        `Please set your ${provider} API key in the environment variables.`,
        [envVarName]
      );
    }

    return apiKey;
  }

  /**
   * Check if a specific API key is available
   * @param provider - The provider name
   * @returns True if the API key is available
   */
  public hasApiKey(provider: 'google' | 'openai' | 'anthropic'): boolean {
    const keyMap = {
      google: 'googleApiKey' as const,
      openai: 'openaiApiKey' as const,
      anthropic: 'anthropicApiKey' as const,
    };

    const configKey = keyMap[provider];
    return !!this.config[configKey];
  }

  /**
   * Reload environment configuration (useful for testing)
   */
  public reload(): void {
    this.config = this.loadEnvironmentConfig();
  }

  /**
   * Convert camelCase to snake_case
   */
  private camelToSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }
}

// Convenience functions for common operations
export const getEnvironmentValidator = (): EnvironmentValidator => {
  return EnvironmentValidator.getInstance();
};

export const validateGoogleApiKey = (): string => {
  return getEnvironmentValidator().getApiKey('google');
};

export const hasGoogleApiKey = (): boolean => {
  return getEnvironmentValidator().hasApiKey('google');
};
