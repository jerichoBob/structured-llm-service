import {
  calculateCost,
  calculateCostFromUsage,
  getModelPricing,
  detectProviderFromModel,
  getSupportedModels,
  getSupportedProviders,
  isModelSupported,
  estimateCost,
  updateModelPricing,
  getPricingSummary,
  PRICING_CONFIG,
  DEFAULT_PRICING,
  type TokenUsage,
  type ModelPricing
} from '../costCalculator.js';

describe('Cost Calculator', () => {
  describe('calculateCost', () => {
    it('should calculate cost correctly for Claude models', () => {
      const result = calculateCost(1000, 500, 'claude-3-5-sonnet-20241022', 'claude');
      
      expect(result.provider).toBe('claude');
      expect(result.model).toBe('claude-3-5-sonnet-20241022');
      expect(result.currency).toBe('USD');
      expect(result.inputCost).toBe(0.003); // (1000/1M) * 3.00
      expect(result.outputCost).toBe(0.0075); // (500/1M) * 15.00
      expect(result.totalCost).toBe(0.0105);
      expect(result.pricingDate).toBe('2024-12-01');
    });

    it('should calculate cost correctly for Gemini models', () => {
      const result = calculateCost(2000, 1000, 'gemini-1.5-flash', 'gemini');
      
      expect(result.provider).toBe('gemini');
      expect(result.model).toBe('gemini-1.5-flash');
      expect(result.inputCost).toBe(0.00015); // (2000/1M) * 0.075
      expect(result.outputCost).toBe(0.0003); // (1000/1M) * 0.30
      expect(result.totalCost).toBe(0.00045);
    });

    it('should calculate cost correctly for OpenAI models', () => {
      const result = calculateCost(1500, 750, 'gpt-4o', 'openai');
      
      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-4o');
      expect(result.inputCost).toBe(0.00375); // (1500/1M) * 2.50
      expect(result.outputCost).toBe(0.0075); // (750/1M) * 10.00
      expect(result.totalCost).toBe(0.01125);
    });

    it('should auto-detect provider when not specified', () => {
      const claudeResult = calculateCost(1000, 500, 'claude-3-5-sonnet-20241022');
      expect(claudeResult.provider).toBe('claude');

      const geminiResult = calculateCost(1000, 500, 'gemini-1.5-pro');
      expect(geminiResult.provider).toBe('gemini');

      const openaiResult = calculateCost(1000, 500, 'gpt-4o');
      expect(openaiResult.provider).toBe('openai');
    });

    it('should handle zero tokens', () => {
      const result = calculateCost(0, 0, 'claude-3-5-sonnet-20241022', 'claude');
      
      expect(result.inputCost).toBe(0);
      expect(result.outputCost).toBe(0);
      expect(result.totalCost).toBe(0);
    });

    it('should throw error for negative token counts', () => {
      expect(() => calculateCost(-1, 500, 'claude-3-5-sonnet-20241022')).toThrow('Token counts cannot be negative');
      expect(() => calculateCost(1000, -1, 'claude-3-5-sonnet-20241022')).toThrow('Token counts cannot be negative');
    });

    it('should use default pricing for unknown models', () => {
      const result = calculateCost(1000, 500, 'unknown-model', 'claude');
      
      expect(result.inputCost).toBe(0.005); // (1000/1M) * 5.00 (default)
      expect(result.outputCost).toBe(0.0075); // (500/1M) * 15.00 (default)
      expect(result.totalCost).toBe(0.0125);
    });

    it('should round costs to 6 decimal places', () => {
      // Use a calculation that would result in many decimal places
      const result = calculateCost(1, 1, 'claude-3-5-sonnet-20241022', 'claude');
      
      // Should be rounded to 6 decimal places
      expect(result.inputCost.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(6);
      expect(result.outputCost.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(6);
      expect(result.totalCost.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(6);
    });
  });

  describe('calculateCostFromUsage', () => {
    it('should calculate cost from TokenUsage object', () => {
      const tokenUsage: TokenUsage = {
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500
      };

      const result = calculateCostFromUsage(tokenUsage, 'claude-3-5-sonnet-20241022', 'claude');
      
      expect(result.inputCost).toBe(0.003);
      expect(result.outputCost).toBe(0.0075);
      expect(result.totalCost).toBe(0.0105);
    });
  });

  describe('getModelPricing', () => {
    it('should return correct pricing for known models', () => {
      const pricing = getModelPricing('claude', 'claude-3-5-sonnet-20241022');
      
      expect(pricing.inputCostPer1M).toBe(3.00);
      expect(pricing.outputCostPer1M).toBe(15.00);
      expect(pricing.lastUpdated).toBe('2024-12-01');
    });

    it('should return default pricing for unknown providers', () => {
      const pricing = getModelPricing('unknown-provider', 'some-model');
      
      expect(pricing).toEqual(DEFAULT_PRICING);
    });

    it('should return default pricing for unknown models', () => {
      const pricing = getModelPricing('claude', 'unknown-model');
      
      expect(pricing).toEqual(DEFAULT_PRICING);
    });

    it('should be case insensitive for provider names', () => {
      const pricing1 = getModelPricing('CLAUDE', 'claude-3-5-sonnet-20241022');
      const pricing2 = getModelPricing('claude', 'claude-3-5-sonnet-20241022');
      
      expect(pricing1).toEqual(pricing2);
    });
  });

  describe('detectProviderFromModel', () => {
    it('should detect Claude provider', () => {
      expect(detectProviderFromModel('claude-3-5-sonnet-20241022')).toBe('claude');
      expect(detectProviderFromModel('CLAUDE-3-OPUS')).toBe('claude');
    });

    it('should detect Gemini provider', () => {
      expect(detectProviderFromModel('gemini-1.5-pro')).toBe('gemini');
      expect(detectProviderFromModel('GEMINI-1.5-FLASH')).toBe('gemini');
    });

    it('should detect OpenAI provider', () => {
      expect(detectProviderFromModel('gpt-4o')).toBe('openai');
      expect(detectProviderFromModel('GPT-4-TURBO')).toBe('openai');
      expect(detectProviderFromModel('openai-gpt-3.5')).toBe('openai');
    });

    it('should default to claude for unknown models', () => {
      expect(detectProviderFromModel('unknown-model')).toBe('claude');
      expect(detectProviderFromModel('')).toBe('claude');
    });
  });

  describe('getSupportedModels', () => {
    it('should return models for known providers', () => {
      const claudeModels = getSupportedModels('claude');
      expect(claudeModels).toContain('claude-3-5-sonnet-20241022');
      expect(claudeModels).toContain('claude-3-5-haiku-20241022');
      expect(claudeModels.length).toBeGreaterThan(0);

      const geminiModels = getSupportedModels('gemini');
      expect(geminiModels).toContain('gemini-1.5-pro');
      expect(geminiModels).toContain('gemini-1.5-flash');
    });

    it('should return empty array for unknown providers', () => {
      const models = getSupportedModels('unknown-provider');
      expect(models).toEqual([]);
    });

    it('should be case insensitive', () => {
      const models1 = getSupportedModels('CLAUDE');
      const models2 = getSupportedModels('claude');
      expect(models1).toEqual(models2);
    });
  });

  describe('getSupportedProviders', () => {
    it('should return all supported providers', () => {
      const providers = getSupportedProviders();
      expect(providers).toContain('claude');
      expect(providers).toContain('gemini');
      expect(providers).toContain('openai');
      expect(providers.length).toBe(3);
    });
  });

  describe('isModelSupported', () => {
    it('should return true for supported models', () => {
      expect(isModelSupported('claude-3-5-sonnet-20241022', 'claude')).toBe(true);
      expect(isModelSupported('gemini-1.5-pro', 'gemini')).toBe(true);
      expect(isModelSupported('gpt-4o', 'openai')).toBe(true);
    });

    it('should return false for unsupported models', () => {
      expect(isModelSupported('unknown-model', 'claude')).toBe(false);
      expect(isModelSupported('claude-model', 'unknown-provider')).toBe(false);
    });

    it('should auto-detect provider when not specified', () => {
      expect(isModelSupported('claude-3-5-sonnet-20241022')).toBe(true);
      expect(isModelSupported('gemini-1.5-pro')).toBe(true);
      expect(isModelSupported('gpt-4o')).toBe(true);
    });
  });

  describe('estimateCost', () => {
    it('should estimate cost with default ratio', () => {
      const result = estimateCost(1000, 'claude-3-5-sonnet-20241022', 'claude');
      
      // Default ratio is 0.7 input, 0.3 output
      // So 700 input tokens, 300 output tokens
      expect(result.inputCost).toBe(0.0021); // (700/1M) * 3.00
      expect(result.outputCost).toBe(0.0045); // (300/1M) * 15.00
      expect(result.totalCost).toBe(0.0066);
    });

    it('should estimate cost with custom ratio', () => {
      const result = estimateCost(1000, 'claude-3-5-sonnet-20241022', 'claude', 0.5);
      
      // 0.5 ratio means 500 input tokens, 500 output tokens
      expect(result.inputCost).toBe(0.0015); // (500/1M) * 3.00
      expect(result.outputCost).toBe(0.0075); // (500/1M) * 15.00
      expect(result.totalCost).toBe(0.009);
    });

    it('should throw error for invalid ratios', () => {
      expect(() => estimateCost(1000, 'claude-3-5-sonnet-20241022', 'claude', -0.1)).toThrow('Input/output ratio must be between 0 and 1');
      expect(() => estimateCost(1000, 'claude-3-5-sonnet-20241022', 'claude', 1.1)).toThrow('Input/output ratio must be between 0 and 1');
    });

    it('should handle edge case ratios', () => {
      // All input tokens
      const allInput = estimateCost(1000, 'claude-3-5-sonnet-20241022', 'claude', 1.0);
      expect(allInput.inputCost).toBe(0.003);
      expect(allInput.outputCost).toBe(0);

      // All output tokens
      const allOutput = estimateCost(1000, 'claude-3-5-sonnet-20241022', 'claude', 0.0);
      expect(allOutput.inputCost).toBe(0);
      expect(allOutput.outputCost).toBe(0.015);
    });
  });

  describe('updateModelPricing', () => {
    it('should update pricing for existing models', () => {
      const newPricing: ModelPricing = {
        inputCostPer1M: 10.00,
        outputCostPer1M: 20.00,
        lastUpdated: '2024-12-15'
      };

      updateModelPricing('claude', 'claude-3-5-sonnet-20241022', newPricing);
      
      const updatedPricing = getModelPricing('claude', 'claude-3-5-sonnet-20241022');
      expect(updatedPricing).toEqual(newPricing);

      // Restore original pricing
      updateModelPricing('claude', 'claude-3-5-sonnet-20241022', {
        inputCostPer1M: 3.00,
        outputCostPer1M: 15.00,
        lastUpdated: '2024-12-01'
      });
    });

    it('should add pricing for new models', () => {
      const newPricing: ModelPricing = {
        inputCostPer1M: 5.00,
        outputCostPer1M: 10.00,
        lastUpdated: '2024-12-15'
      };

      updateModelPricing('claude', 'new-claude-model', newPricing);
      
      const retrievedPricing = getModelPricing('claude', 'new-claude-model');
      expect(retrievedPricing).toEqual(newPricing);
    });

    it('should create new provider if it does not exist', () => {
      const newPricing: ModelPricing = {
        inputCostPer1M: 1.00,
        outputCostPer1M: 2.00,
        lastUpdated: '2024-12-15'
      };

      updateModelPricing('new-provider', 'new-model', newPricing);
      
      const retrievedPricing = getModelPricing('new-provider', 'new-model');
      expect(retrievedPricing).toEqual(newPricing);
    });
  });

  describe('getPricingSummary', () => {
    it('should return complete pricing configuration', () => {
      const summary = getPricingSummary();
      
      expect(summary).toHaveProperty('claude');
      expect(summary).toHaveProperty('gemini');
      expect(summary).toHaveProperty('openai');
      
      expect(summary['claude']).toHaveProperty('claude-3-5-sonnet-20241022');
      expect(summary['gemini']).toHaveProperty('gemini-1.5-pro');
      expect(summary['openai']).toHaveProperty('gpt-4o');
    });

    it('should return a copy, not the original object', () => {
      const summary = getPricingSummary();
      
      // Modify the returned object
      if (summary['claude']) {
        summary['claude']['test-model'] = {
          inputCostPer1M: 999,
          outputCostPer1M: 999,
          lastUpdated: 'test'
        };
      }
      
      // Original should not be affected
      expect(PRICING_CONFIG['claude']).not.toHaveProperty('test-model');
    });
  });

  describe('Integration tests', () => {
    it('should handle complete workflow for Claude', () => {
      const tokenUsage: TokenUsage = {
        promptTokens: 2500,
        completionTokens: 1200,
        totalTokens: 3700
      };

      const result = calculateCostFromUsage(tokenUsage, 'claude-3-5-sonnet-20241022');
      
      expect(result.provider).toBe('claude');
      expect(result.model).toBe('claude-3-5-sonnet-20241022');
      expect(result.totalCost).toBe(0.0255); // (2500/1M)*3 + (1200/1M)*15
      expect(result.currency).toBe('USD');
      expect(result.pricingDate).toBe('2024-12-01');
    });

    it('should handle complete workflow for Gemini', () => {
      const tokenUsage: TokenUsage = {
        promptTokens: 5000,
        completionTokens: 2000,
        totalTokens: 7000
      };

      const result = calculateCostFromUsage(tokenUsage, 'gemini-1.5-flash');
      
      expect(result.provider).toBe('gemini');
      expect(result.model).toBe('gemini-1.5-flash');
      expect(result.totalCost).toBe(0.000975); // (5000/1M)*0.075 + (2000/1M)*0.30
      expect(result.currency).toBe('USD');
    });

    it('should handle high-volume token usage', () => {
      const result = calculateCost(1_000_000, 500_000, 'claude-3-opus-20240229', 'claude');
      
      expect(result.inputCost).toBe(15.00); // (1M/1M) * 15.00
      expect(result.outputCost).toBe(37.50); // (0.5M/1M) * 75.00
      expect(result.totalCost).toBe(52.50);
    });
  });
});
