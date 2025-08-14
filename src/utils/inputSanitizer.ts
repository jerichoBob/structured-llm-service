/**
 * Input sanitization utilities to prevent prompt injection attacks
 * and ensure safe processing of user-provided data before sending to LLMs
 */

/**
 * Configuration for input sanitization
 */
export interface SanitizationConfig {
  /** Enable removal of control characters */
  removeControlCharacters: boolean;
  /** Enable markdown sanitization */
  sanitizeMarkdown: boolean;
  /** Enable HTML tag removal */
  removeHtmlTags: boolean;
  /** Enable prompt injection pattern detection */
  detectPromptInjection: boolean;
  /** Maximum allowed input length */
  maxLength?: number;
  /** Custom patterns to detect and remove */
  customPatterns?: RegExp[];
  /** Enable logging of sanitization actions */
  enableLogging: boolean;
  /** Strict mode - reject inputs with potential injection attempts */
  strictMode: boolean;
}

/**
 * Result of sanitization process
 */
export interface SanitizationResult {
  /** Sanitized input text */
  sanitizedInput: string;
  /** Whether any modifications were made */
  wasModified: boolean;
  /** List of issues detected and resolved */
  issues: SanitizationIssue[];
  /** Whether input was rejected (in strict mode) */
  rejected: boolean;
  /** Reason for rejection if applicable */
  rejectionReason?: string;
}

/**
 * Individual sanitization issue
 */
export interface SanitizationIssue {
  /** Type of issue detected */
  type: 'control_chars' | 'markdown' | 'html_tags' | 'prompt_injection' | 'length_exceeded' | 'custom_pattern';
  /** Description of the issue */
  description: string;
  /** Action taken to resolve the issue */
  action: 'removed' | 'escaped' | 'truncated' | 'rejected';
  /** Original text that triggered the issue (truncated for security) */
  originalText?: string;
}

/**
 * Default sanitization configuration
 */
export const DEFAULT_SANITIZATION_CONFIG: SanitizationConfig = {
  removeControlCharacters: true,
  sanitizeMarkdown: true,
  removeHtmlTags: true,
  detectPromptInjection: true,
  maxLength: 50000, // 50KB limit
  enableLogging: true,
  strictMode: false,
};

/**
 * Known prompt injection patterns
 * These patterns are commonly used in prompt injection attacks
 */
const PROMPT_INJECTION_PATTERNS = [
  // Direct instruction overrides
  /(?:ignore|forget|disregard)\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|rules?|commands?)/gi,
  /(?:new|different|updated)\s+(?:instructions?|prompts?|rules?|commands?)/gi,
  
  // Role manipulation
  /(?:you\s+are\s+now|act\s+as|pretend\s+to\s+be|roleplay\s+as)\s+(?:a\s+)?(?:different|new|another)/gi,
  /(?:system|admin|developer|programmer)\s*:\s*/gi,
  
  // Goal hijacking
  /(?:your\s+)?(?:new\s+)?(?:goal|objective|purpose|task)\s+(?:is\s+)?(?:now\s+)?(?:to|is)/gi,
  /(?:instead|rather\s+than|but\s+actually)\s+(?:do|perform|execute|run)/gi,
  
  // Jailbreak attempts
  /(?:jailbreak|break\s+out|escape|bypass)\s+(?:the\s+)?(?:system|rules?|constraints?|limitations?)/gi,
  /(?:developer\s+mode|debug\s+mode|admin\s+mode|god\s+mode)/gi,
  
  // Instruction injection markers
  /\[(?:INST|INSTRUCTION|SYS|SYSTEM)\]/gi,
  /<(?:instruction|system|prompt)>/gi,
  
  // Common injection prefixes/suffixes
  /^\s*(?:---+|===+|\*\*\*+)\s*$/gm,
  /(?:end\s+of\s+)?(?:prompt|instruction|system\s+message)/gi,
  
  // Encoding attempts
  /(?:base64|hex|unicode|url)\s*(?:encoded?|decode?)/gi,
  
  // Multi-language injection attempts
  /(?:translate|in\s+(?:chinese|spanish|french|german|russian))\s*:/gi,
];

/**
 * Control characters that should be removed
 */
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g;

/**
 * HTML tag pattern for removal
 */
const HTML_TAG_PATTERN = /<[^>]*>/g;

/**
 * Markdown patterns that could be used for injection
 */
const DANGEROUS_MARKDOWN_PATTERNS = [
  // Code blocks that might contain instructions
  /```[\s\S]*?```/g,
  // Inline code with suspicious content
  /`[^`]*(?:system|instruction|prompt|ignore)[^`]*`/gi,
  // Links with javascript or data URIs
  /\[([^\]]*)\]\((?:javascript:|data:|vbscript:)[^)]*\)/gi,
  // Image tags with suspicious sources
  /!\[([^\]]*)\]\((?:javascript:|data:|vbscript:)[^)]*\)/gi,
];

/**
 * Input sanitizer class
 */
export class InputSanitizer {
  private config: SanitizationConfig;

  constructor(config: Partial<SanitizationConfig> = {}) {
    this.config = { ...DEFAULT_SANITIZATION_CONFIG, ...config };
  }

  /**
   * Sanitize input text according to configuration
   */
  sanitize(input: string, context?: string): SanitizationResult {
    const issues: SanitizationIssue[] = [];
    let sanitizedInput = input;
    let wasModified = false;

    // Check input length first
    if (this.config.maxLength && input.length > this.config.maxLength) {
      if (this.config.strictMode) {
        return {
          sanitizedInput: input,
          wasModified: false,
          issues: [{
            type: 'length_exceeded',
            description: `Input length ${input.length} exceeds maximum allowed ${this.config.maxLength}`,
            action: 'rejected',
          }],
          rejected: true,
          rejectionReason: 'Input too long',
        };
      } else {
        sanitizedInput = sanitizedInput.substring(0, this.config.maxLength);
        wasModified = true;
        issues.push({
          type: 'length_exceeded',
          description: `Input truncated from ${input.length} to ${this.config.maxLength} characters`,
          action: 'truncated',
        });
      }
    }

    // Detect prompt injection patterns
    if (this.config.detectPromptInjection) {
      const injectionResult = this.detectPromptInjection(sanitizedInput);
      if (injectionResult.detected) {
        if (this.config.strictMode) {
          return {
            sanitizedInput: input,
            wasModified: false,
            issues: injectionResult.issues,
            rejected: true,
            rejectionReason: 'Potential prompt injection detected',
          };
        } else {
          sanitizedInput = injectionResult.sanitizedText;
          wasModified = wasModified || injectionResult.wasModified;
          issues.push(...injectionResult.issues);
        }
      }
    }

    // Remove control characters
    if (this.config.removeControlCharacters) {
      const beforeLength = sanitizedInput.length;
      sanitizedInput = sanitizedInput.replace(CONTROL_CHAR_PATTERN, '');
      if (sanitizedInput.length !== beforeLength) {
        wasModified = true;
        issues.push({
          type: 'control_chars',
          description: 'Removed control characters',
          action: 'removed',
        });
      }
    }

    // Remove HTML tags
    if (this.config.removeHtmlTags) {
      const beforeLength = sanitizedInput.length;
      sanitizedInput = sanitizedInput.replace(HTML_TAG_PATTERN, '');
      if (sanitizedInput.length !== beforeLength) {
        wasModified = true;
        issues.push({
          type: 'html_tags',
          description: 'Removed HTML tags',
          action: 'removed',
        });
      }
    }

    // Sanitize dangerous markdown
    if (this.config.sanitizeMarkdown) {
      const markdownResult = this.sanitizeMarkdown(sanitizedInput);
      if (markdownResult.wasModified) {
        sanitizedInput = markdownResult.sanitizedText;
        wasModified = true;
        issues.push(...markdownResult.issues);
      }
    }

    // Apply custom patterns
    if (this.config.customPatterns) {
      for (const pattern of this.config.customPatterns) {
        const beforeLength = sanitizedInput.length;
        sanitizedInput = sanitizedInput.replace(pattern, '');
        if (sanitizedInput.length !== beforeLength) {
          wasModified = true;
          issues.push({
            type: 'custom_pattern',
            description: `Removed content matching custom pattern: ${pattern.source}`,
            action: 'removed',
          });
        }
      }
    }

    // Log sanitization if enabled
    if (this.config.enableLogging && (wasModified || issues.length > 0)) {
      this.logSanitization(input, sanitizedInput, issues, context);
    }

    return {
      sanitizedInput,
      wasModified,
      issues,
      rejected: false,
    };
  }

  /**
   * Detect potential prompt injection patterns
   */
  private detectPromptInjection(input: string): {
    detected: boolean;
    sanitizedText: string;
    wasModified: boolean;
    issues: SanitizationIssue[];
  } {
    const issues: SanitizationIssue[] = [];
    let sanitizedText = input;
    let wasModified = false;
    let detected = false;

    for (const pattern of PROMPT_INJECTION_PATTERNS) {
      const matches = input.match(pattern);
      if (matches) {
        detected = true;
        for (const match of matches) {
          sanitizedText = sanitizedText.replace(pattern, '[REDACTED]');
          wasModified = true;
          issues.push({
            type: 'prompt_injection',
            description: 'Potential prompt injection pattern detected',
            action: 'removed',
            originalText: match.substring(0, 50) + (match.length > 50 ? '...' : ''),
          });
        }
      }
    }

    return {
      detected,
      sanitizedText,
      wasModified,
      issues,
    };
  }

  /**
   * Sanitize dangerous markdown patterns
   */
  private sanitizeMarkdown(input: string): {
    sanitizedText: string;
    wasModified: boolean;
    issues: SanitizationIssue[];
  } {
    const issues: SanitizationIssue[] = [];
    let sanitizedText = input;
    let wasModified = false;

    for (const pattern of DANGEROUS_MARKDOWN_PATTERNS) {
      const matches = input.match(pattern);
      if (matches) {
        for (const match of matches) {
          sanitizedText = sanitizedText.replace(pattern, '[MARKDOWN_REMOVED]');
          wasModified = true;
          issues.push({
            type: 'markdown',
            description: 'Potentially dangerous markdown pattern removed',
            action: 'removed',
            originalText: match.substring(0, 50) + (match.length > 50 ? '...' : ''),
          });
        }
      }
    }

    return {
      sanitizedText,
      wasModified,
      issues,
    };
  }

  /**
   * Log sanitization actions
   */
  private logSanitization(
    originalInput: string,
    sanitizedInput: string,
    issues: SanitizationIssue[],
    context?: string
  ): void {
    if (process.env['NODE_ENV'] === 'test') {
      return; // Don't log during tests
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'SECURITY',
      service: 'InputSanitizer',
      event: 'input_sanitized',
      context: context || 'unknown',
      originalLength: originalInput.length,
      sanitizedLength: sanitizedInput.length,
      issuesCount: issues.length,
      issues: issues.map(issue => ({
        type: issue.type,
        description: issue.description,
        action: issue.action,
      })),
      // Never log the actual content for security reasons
      inputHash: this.hashInput(originalInput),
    };

    console.log(JSON.stringify(logEntry));
  }

  /**
   * Create a hash of input for logging purposes
   */
  private hashInput(input: string): string {
    // Simple hash for logging - not cryptographically secure
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Update sanitization configuration
   */
  updateConfig(newConfig: Partial<SanitizationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): SanitizationConfig {
    return { ...this.config };
  }

  /**
   * Test if input would be rejected in strict mode
   */
  wouldReject(input: string): boolean {
    const originalStrictMode = this.config.strictMode;
    this.config.strictMode = true;
    
    const result = this.sanitize(input);
    
    this.config.strictMode = originalStrictMode;
    
    return result.rejected;
  }
}

/**
 * Default sanitizer instance
 */
export const defaultSanitizer = new InputSanitizer();

/**
 * Convenience function to sanitize input with default configuration
 */
export function sanitizeInput(input: string, context?: string): SanitizationResult {
  return defaultSanitizer.sanitize(input, context);
}

/**
 * Convenience function to sanitize input in strict mode
 */
export function sanitizeInputStrict(input: string, context?: string): SanitizationResult {
  const strictSanitizer = new InputSanitizer({ ...DEFAULT_SANITIZATION_CONFIG, strictMode: true });
  return strictSanitizer.sanitize(input, context);
}

/**
 * Validate that input is safe for LLM processing
 */
export function validateInputSafety(input: string): {
  isSafe: boolean;
  issues: string[];
  recommendations: string[];
} {
  const result = sanitizeInputStrict(input, 'safety_validation');
  
  const issues: string[] = [];
  const recommendations: string[] = [];

  if (result.rejected) {
    issues.push(result.rejectionReason || 'Input rejected for security reasons');
    recommendations.push('Review and modify the input to remove potentially harmful content');
  }

  for (const issue of result.issues) {
    if (issue.type === 'prompt_injection') {
      issues.push('Potential prompt injection detected');
      recommendations.push('Remove instruction-like language and role manipulation attempts');
    }
    if (issue.type === 'length_exceeded') {
      issues.push('Input too long');
      recommendations.push('Reduce input length to stay within limits');
    }
  }

  return {
    isSafe: !result.rejected && result.issues.filter(i => i.type === 'prompt_injection').length === 0,
    issues,
    recommendations,
  };
}
