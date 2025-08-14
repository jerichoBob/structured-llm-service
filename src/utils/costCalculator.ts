/**
 * Centralized cost calculation utility for LLM token usage
 * Provides accurate pricing for different providers and models
 */

/**
 * Token usage information
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Cost calculation result
 */
export interface CostCalculationResult {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: string;
  model: string;
  provider: string;
  pricingDate: string;
}

/**
 * Pricing configuration for a model
 */
export interface ModelPricing {
  /** Cost per 1M input tokens in USD */
  inputCostPer1M: number;
  /** Cost per 1M output tokens in USD */
  outputCostPer1M: number;
  /** When this pricing was last updated */
  lastUpdated: string;
}

/**
 * Provider pricing configuration
 */
export interface ProviderPricing {
  [modelName: string]: ModelPricing;
}

/**
 * Complete pricing configuration for all providers
 * Prices are per 1M tokens in USD as of December 2024
 */
export const PRICING_CONFIG: Record<string, ProviderPricing> = {
  claude: {
    'claude-3-5-sonnet-20241022': {
      inputCostPer1M: 3.00,
      outputCostPer1M: 15.00,
      lastUpdated: '2024-12-01'
    },
    'claude-3-5-haiku-20241022': {
      inputCostPer1M: 0.25,
      outputCostPer1M: 1.25,
      lastUpdated: '2024-12-01'
    },
    'claude-3-opus-20240229': {
      inputCostPer1M: 15.00,
      outputCostPer1M: 75.00,
      lastUpdated: '2024-12-01'
    },
    'claude-3-sonnet-20240229': {
      inputCostPer1M: 3.00,
      outputCostPer1M: 15.00,
      lastUpdated: '2024-12-01'
    },
    'claude-3-haiku-20240307': {
      inputCostPer1M: 0.25,
      outputCostPer1M: 1.25,
      lastUpdated: '2024-12-01'
    }
  },
  gemini: {
    'gemini-1.5-pro-latest': {
      inputCostPer1M: 1.25,
      outputCostPer1M: 5.00,
      lastUpdated: '2024-12-01'
    },
    'gemini-1.5-pro': {
      inputCostPer1M: 1.25,
      outputCostPer1M: 5.00,
      lastUpdated: '2024-12-01'
    },
    'gemini-1.5-flash': {
      inputCostPer1M: 0.075,
      outputCostPer1M: 0.30,
      lastUpdated: '2024-12-01'
    },
    'gemini-1.5-flash-8b': {
      inputCostPer1M: 0.0375,
      outputCostPer1M: 0.15,
      lastUpdated: '2024-12-01'
    },
    'gemini-2.0-flash-exp': {
      inputCostPer1M: 0.075,
      outputCostPer1M: 0.30,
      lastUpdated: '2024-12-01'
    }
  },
  openai: {
    'gpt-4o': {
      inputCostPer1M: 2.50,
      outputCostPer1M: 10.00,
      lastUpdated: '2024-12-01'
    },
    'gpt-4o-mini': {
      inputCostPer1M: 0.15,
      outputCostPer1M: 0.60,
      lastUpdated: '2024-12-01'
    },
    'gpt-4-turbo': {
      inputCostPer1M: 10.00,
      outputCostPer1M: 30.00,
      lastUpdated: '2024-12-01'
    },
    'gpt-4': {
      inputCostPer1M: 30.00,
      outputCostPer1M: 60.00,
      lastUpdated: '2024-12-01'
    },
    'gpt-3.5-turbo': {
      inputCostPer1M: 0.50,
      outputCostPer1M: 1.50,
      lastUpdated: '2024-12-01'
    }
  }
};

/**
 * Default pricing for unknown models (conservative estimate)
 */
export const DEFAULT_PRICING: ModelPricing = {
  inputCostPer1M: 5.00,  // Conservative estimate
  outputCostPer1M: 15.00, // Conservative estimate
  lastUpdated: '2024-12-01'
};

/**
 * Calculate the cost of an LLM API call based on token usage
 * 
 * @param promptTokens - Number of input/prompt tokens
 * @param completionTokens - Number of output/completion tokens
 * @param modelName - Name of the model used
 * @param provider - Provider name (claude, gemini, openai)
 * @returns Detailed cost calculation result
 */
export function calculateCost(
  promptTokens: number,
  completionTokens: number,
  modelName: string,
  provider?: string
): CostCalculationResult {
  // Validate inputs
  if (promptTokens < 0 || completionTokens < 0) {
    throw new Error('Token counts cannot be negative');
  }

  // Auto-detect provider from model name if not provided
  const detectedProvider = provider || detectProviderFromModel(modelName);
  
  // Get pricing for the model
  const pricing = getModelPricing(detectedProvider, modelName);
  
  // Calculate costs
  const inputCost = (promptTokens / 1_000_000) * pricing.inputCostPer1M;
  const outputCost = (completionTokens / 1_000_000) * pricing.outputCostPer1M;
  const totalCost = inputCost + outputCost;

  return {
    inputCost: Math.round(inputCost * 1000000) / 1000000, // Round to 6 decimal places
    outputCost: Math.round(outputCost * 1000000) / 1000000,
    totalCost: Math.round(totalCost * 1000000) / 1000000,
    currency: 'USD',
    model: modelName,
    provider: detectedProvider,
    pricingDate: pricing.lastUpdated
  };
}

/**
 * Calculate cost from a TokenUsage object
 * 
 * @param tokenUsage - Token usage information
 * @param modelName - Name of the model used
 * @param provider - Provider name (optional, will be auto-detected)
 * @returns Detailed cost calculation result
 */
export function calculateCostFromUsage(
  tokenUsage: TokenUsage,
  modelName: string,
  provider?: string
): CostCalculationResult {
  return calculateCost(
    tokenUsage.promptTokens,
    tokenUsage.completionTokens,
    modelName,
    provider
  );
}

/**
 * Get pricing information for a specific model
 * 
 * @param provider - Provider name
 * @param modelName - Model name
 * @returns Model pricing information
 */
export function getModelPricing(provider: string, modelName: string): ModelPricing {
  const providerPricing = PRICING_CONFIG[provider.toLowerCase()];
  
  if (!providerPricing) {
    console.warn(`Unknown provider: ${provider}. Using default pricing.`);
    return DEFAULT_PRICING;
  }

  const modelPricing = providerPricing[modelName];
  
  if (!modelPricing) {
    console.warn(`Unknown model: ${modelName} for provider: ${provider}. Using default pricing.`);
    return DEFAULT_PRICING;
  }

  return modelPricing;
}

/**
 * Auto-detect provider from model name
 * 
 * @param modelName - Name of the model
 * @returns Detected provider name
 */
export function detectProviderFromModel(modelName: string): string {
  const lowerModel = modelName.toLowerCase();
  
  if (lowerModel.includes('claude')) {
    return 'claude';
  }
  
  if (lowerModel.includes('gemini')) {
    return 'gemini';
  }
  
  if (lowerModel.includes('gpt') || lowerModel.includes('openai')) {
    return 'openai';
  }
  
  // Default to claude if unknown
  console.warn(`Could not detect provider for model: ${modelName}. Defaulting to claude.`);
  return 'claude';
}

/**
 * Get all supported models for a provider
 * 
 * @param provider - Provider name
 * @returns Array of supported model names
 */
export function getSupportedModels(provider: string): string[] {
  const providerPricing = PRICING_CONFIG[provider.toLowerCase()];
  
  if (!providerPricing) {
    return [];
  }
  
  return Object.keys(providerPricing);
}

/**
 * Get all supported providers
 * 
 * @returns Array of supported provider names
 */
export function getSupportedProviders(): string[] {
  return Object.keys(PRICING_CONFIG);
}

/**
 * Check if a model is supported for cost calculation
 * 
 * @param modelName - Model name to check
 * @param provider - Provider name (optional, will be auto-detected)
 * @returns True if the model has pricing information
 */
export function isModelSupported(modelName: string, provider?: string): boolean {
  const detectedProvider = provider || detectProviderFromModel(modelName);
  const providerPricing = PRICING_CONFIG[detectedProvider.toLowerCase()];
  
  if (!providerPricing) {
    return false;
  }
  
  return modelName in providerPricing;
}

/**
 * Estimate cost for a given number of tokens using average pricing
 * Useful when you don't know the exact input/output split
 * 
 * @param totalTokens - Total number of tokens
 * @param modelName - Model name
 * @param provider - Provider name (optional)
 * @param inputOutputRatio - Ratio of input to output tokens (default: 0.7 input, 0.3 output)
 * @returns Estimated cost calculation result
 */
export function estimateCost(
  totalTokens: number,
  modelName: string,
  provider?: string,
  inputOutputRatio: number = 0.7
): CostCalculationResult {
  if (inputOutputRatio < 0 || inputOutputRatio > 1) {
    throw new Error('Input/output ratio must be between 0 and 1');
  }
  
  const estimatedInputTokens = Math.round(totalTokens * inputOutputRatio);
  const estimatedOutputTokens = totalTokens - estimatedInputTokens;
  
  return calculateCost(estimatedInputTokens, estimatedOutputTokens, modelName, provider);
}

/**
 * Update pricing for a specific model
 * Useful for keeping pricing up to date
 * 
 * @param provider - Provider name
 * @param modelName - Model name
 * @param pricing - New pricing information
 */
export function updateModelPricing(
  provider: string,
  modelName: string,
  pricing: ModelPricing
): void {
  const providerKey = provider.toLowerCase();
  
  if (!PRICING_CONFIG[providerKey]) {
    PRICING_CONFIG[providerKey] = {};
  }
  
  PRICING_CONFIG[providerKey][modelName] = pricing;
}

/**
 * Get pricing summary for all providers and models
 * 
 * @returns Complete pricing configuration
 */
export function getPricingSummary(): Record<string, ProviderPricing> {
  return { ...PRICING_CONFIG };
}
