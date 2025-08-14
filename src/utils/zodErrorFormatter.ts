import { ZodError, ZodIssue } from 'zod';
import { ValidationError } from '../interfaces/llm.interfaces.js';

/**
 * Enhanced validation error with additional context
 */
export interface EnhancedValidationError extends ValidationError {
  /** The path to the field that failed validation */
  path: string[];
  /** The expected type or constraint */
  expected?: string | undefined;
  /** The actual received value */
  received?: unknown;
  /** Additional context about the error */
  context?: Record<string, unknown>;
}

/**
 * Formats a Zod ValidationError into a structured, user-friendly JSON object
 * Transforms the issues array into predictable error objects with field paths,
 * messages, and received values for enhanced error reporting.
 * 
 * @param zodError - The ZodError to format
 * @returns Array of structured validation errors
 */
export function formatZodError(zodError: ZodError): EnhancedValidationError[] {
  return zodError.issues.map((issue: ZodIssue) => {
    const fieldPath = issue.path.length > 0 ? issue.path.join('.') : 'root';
    
    // Extract the received value from the issue
    const receivedValue = extractReceivedValue(issue);
    
    // Generate a user-friendly error message
    const userFriendlyMessage = generateUserFriendlyMessage(issue);
    
    // Determine expected type/constraint
    const expected = extractExpectedConstraint(issue);
    
    return {
      field: fieldPath,
      path: issue.path.map(p => String(p)),
      message: userFriendlyMessage,
      code: issue.code,
      value: receivedValue,
      received: receivedValue,
      expected,
      context: {
        zodCode: issue.code,
        originalMessage: issue.message,
        ...(issue.code === 'custom' && 'params' in issue ? { params: issue.params } : {}),
        ...(issue.code === 'invalid_union' && 'unionErrors' in issue ? { 
          unionErrors: issue.unionErrors.map(err => err.issues.length) 
        } : {}),
      }
    };
  });
}

/**
 * Extract the received value from a Zod issue
 */
function extractReceivedValue(issue: ZodIssue): unknown {
  // For invalid_type issues, we can extract the received value
  if (issue.code === 'invalid_type') {
    return issue.received;
  }
  
  // For most other issue types, the received value might be available
  if ('received' in issue) {
    return (issue as any).received;
  }
  
  // For other cases, return undefined
  return undefined;
}

/**
 * Generate user-friendly error messages based on Zod issue types
 */
function generateUserFriendlyMessage(issue: ZodIssue): string {
  const fieldName = issue.path.length > 0 ? issue.path.join('.') : 'field';
  
  switch (issue.code) {
    case 'invalid_type':
      return `${fieldName} must be of type ${issue.expected}, but received ${issue.received}`;
    
    case 'invalid_string':
      if (issue.validation === 'email') {
        return `${fieldName} must be a valid email address`;
      }
      if (issue.validation === 'url') {
        return `${fieldName} must be a valid URL`;
      }
      if (issue.validation === 'uuid') {
        return `${fieldName} must be a valid UUID`;
      }
      if (issue.validation === 'regex') {
        return `${fieldName} format is invalid`;
      }
      return `${fieldName} is not a valid string format`;
    
    case 'too_small':
      if (issue.type === 'string') {
        return issue.exact 
          ? `${fieldName} must be exactly ${issue.minimum} characters long`
          : `${fieldName} must be at least ${issue.minimum} characters long`;
      }
      if (issue.type === 'number') {
        return issue.exact
          ? `${fieldName} must be exactly ${issue.minimum}`
          : `${fieldName} must be at least ${issue.minimum}`;
      }
      if (issue.type === 'array') {
        return issue.exact
          ? `${fieldName} must contain exactly ${issue.minimum} items`
          : `${fieldName} must contain at least ${issue.minimum} items`;
      }
      return `${fieldName} is too small`;
    
    case 'too_big':
      if (issue.type === 'string') {
        return issue.exact
          ? `${fieldName} must be exactly ${issue.maximum} characters long`
          : `${fieldName} must be at most ${issue.maximum} characters long`;
      }
      if (issue.type === 'number') {
        return issue.exact
          ? `${fieldName} must be exactly ${issue.maximum}`
          : `${fieldName} must be at most ${issue.maximum}`;
      }
      if (issue.type === 'array') {
        return issue.exact
          ? `${fieldName} must contain exactly ${issue.maximum} items`
          : `${fieldName} must contain at most ${issue.maximum} items`;
      }
      return `${fieldName} is too big`;
    
    case 'invalid_enum_value': {
      const options = issue.options.map(opt => `"${opt}"`).join(', ');
      return `${fieldName} must be one of: ${options}`;
    }
    
    case 'unrecognized_keys': {
      const keys = issue.keys.map(key => `"${key}"`).join(', ');
      return `Unrecognized keys in ${fieldName}: ${keys}`;
    }
    
    case 'invalid_arguments':
      return `${fieldName} has invalid function arguments`;
    
    case 'invalid_return_type':
      return `${fieldName} function has invalid return type`;
    
    case 'invalid_date':
      return `${fieldName} must be a valid date`;
    
    case 'invalid_union':
      return `${fieldName} does not match any of the expected formats`;
    
    case 'invalid_intersection_types':
      return `${fieldName} does not satisfy all required conditions`;
    
    case 'not_multiple_of':
      return `${fieldName} must be a multiple of ${issue.multipleOf}`;
    
    case 'not_finite':
      return `${fieldName} must be a finite number`;
    
    case 'custom':
      // For custom validations, use the provided message or a default
      return issue.message || `${fieldName} failed custom validation`;
    
    default:
      // Fallback to the original Zod message
      return issue.message;
  }
}

/**
 * Extract expected constraint information from a Zod issue
 */
function extractExpectedConstraint(issue: ZodIssue): string | undefined {
  switch (issue.code) {
    case 'invalid_type':
      return issue.expected;
    
    case 'invalid_string':
      return `string (${issue.validation})`;
    
    case 'too_small':
      return `${issue.type} with minimum ${issue.minimum}`;
    
    case 'too_big':
      return `${issue.type} with maximum ${issue.maximum}`;
    
    case 'invalid_enum_value':
      return `enum: ${issue.options.join(' | ')}`;
    
    case 'not_multiple_of':
      return `multiple of ${issue.multipleOf}`;
    
    case 'invalid_date':
      return 'valid date';
    
    case 'invalid_union':
      return 'union type';
    
    case 'invalid_intersection_types':
      return 'intersection type';
    
    default:
      return undefined;
  }
}

/**
 * Create a summary of validation errors for logging or user display
 */
export function createErrorSummary(errors: EnhancedValidationError[]): {
  totalErrors: number;
  fieldErrors: Record<string, string[]>;
  summary: string;
} {
  const fieldErrors: Record<string, string[]> = {};
  
  errors.forEach(error => {
    if (!fieldErrors[error.field]) {
      fieldErrors[error.field] = [];
    }
    fieldErrors[error.field]!.push(error.message);
  });
  
  const errorCount = errors.length;
  const fieldCount = Object.keys(fieldErrors).length;
  
  const summary = `Validation failed with ${errorCount} error${errorCount !== 1 ? 's' : ''} across ${fieldCount} field${fieldCount !== 1 ? 's' : ''}`;
  
  return {
    totalErrors: errorCount,
    fieldErrors,
    summary
  };
}

/**
 * Convert enhanced validation errors back to the standard ValidationError format
 * for compatibility with existing interfaces
 */
export function toStandardValidationErrors(errors: EnhancedValidationError[]): ValidationError[] {
  return errors.map(error => ({
    field: error.field,
    message: error.message,
    code: error.code,
    value: error.value
  }));
}

/**
 * Utility function to check if an error is a ZodError
 */
export function isZodError(error: unknown): error is ZodError {
  return error instanceof ZodError;
}

/**
 * Main utility function that handles both ZodError and other error types
 * Returns formatted errors or wraps non-Zod errors in a standard format
 */
export function formatValidationError(error: unknown): EnhancedValidationError[] {
  if (isZodError(error)) {
    return formatZodError(error);
  }
  
  // Handle other error types
  const message = error instanceof Error ? error.message : String(error);
  return [{
    field: 'root',
    path: [],
    message,
    code: 'UNKNOWN_ERROR',
    value: error,
    received: error,
    context: {
      errorType: error?.constructor?.name || 'Unknown',
      isZodError: false
    }
  }];
}
