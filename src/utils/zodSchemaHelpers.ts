import { z } from 'zod';

/**
 * Enhanced Zod schema helpers with built-in data cleaning and transformation
 * These utilities apply automatic data cleaning before validation to ensure
 * consistent data processing and reduce validation errors.
 */

/**
 * Creates a string schema with automatic trimming
 * Removes leading and trailing whitespace before validation
 */
export function cleanString() {
  return z.string().trim();
}

/**
 * Creates a string schema with trimming and optional additional constraints
 */
export function cleanStringWithConstraints(options?: {
  min?: number;
  max?: number;
  email?: boolean;
  url?: boolean;
  uuid?: boolean;
  regex?: RegExp;
  nonempty?: boolean;
}) {
  let schema = z.string().trim();
  
  if (options?.nonempty) {
    schema = schema.min(1, 'Field cannot be empty');
  }
  
  if (options?.min !== undefined) {
    schema = schema.min(options.min);
  }
  
  if (options?.max !== undefined) {
    schema = schema.max(options.max);
  }
  
  if (options?.email) {
    schema = schema.email();
  }
  
  if (options?.url) {
    schema = schema.url();
  }
  
  if (options?.uuid) {
    schema = schema.uuid();
  }
  
  if (options?.regex) {
    schema = schema.regex(options.regex);
  }
  
  return schema;
}

/**
 * Creates a number schema with automatic coercion from strings
 * Converts string representations of numbers to actual numbers
 */
export function cleanNumber(options?: {
  min?: number;
  max?: number;
  int?: boolean;
  positive?: boolean;
  nonnegative?: boolean;
  finite?: boolean;
}) {
  let schema = z.coerce.number();
  
  if (options?.finite !== false) {
    schema = schema.finite();
  }
  
  if (options?.int) {
    schema = schema.int();
  }
  
  if (options?.positive) {
    schema = schema.positive();
  }
  
  if (options?.nonnegative) {
    schema = schema.nonnegative();
  }
  
  if (options?.min !== undefined) {
    schema = schema.min(options.min);
  }
  
  if (options?.max !== undefined) {
    schema = schema.max(options.max);
  }
  
  return schema;
}

/**
 * Creates a boolean schema with automatic coercion from strings
 * Converts string representations like "true", "false", "1", "0" to booleans
 */
export function cleanBoolean() {
  return z.coerce.boolean();
}

/**
 * Creates a date schema with automatic coercion from strings and numbers
 * Converts ISO date strings and timestamps to Date objects
 */
export function cleanDate(options?: {
  min?: Date;
  max?: Date;
}) {
  let schema = z.coerce.date();
  
  if (options?.min) {
    schema = schema.min(options.min);
  }
  
  if (options?.max) {
    schema = schema.max(options.max);
  }
  
  return schema;
}

/**
 * Creates an array schema with automatic cleaning of string elements
 * Trims all string elements in the array
 */
export function cleanStringArray(options?: {
  min?: number;
  max?: number;
  nonempty?: boolean;
}) {
  let schema = z.array(cleanString());
  
  if (options?.nonempty) {
    schema = schema.nonempty() as any;
  }
  
  if (options?.min !== undefined) {
    schema = schema.min(options.min);
  }
  
  if (options?.max !== undefined) {
    schema = schema.max(options.max);
  }
  
  return schema;
}

/**
 * Creates an array schema with automatic coercion of number elements
 */
export function cleanNumberArray(options?: {
  min?: number;
  max?: number;
  nonempty?: boolean;
  elementMin?: number;
  elementMax?: number;
}) {
  const elementSchema = cleanNumber({
    ...(options?.elementMin !== undefined && { min: options.elementMin }),
    ...(options?.elementMax !== undefined && { max: options.elementMax }),
  });
  
  let schema = z.array(elementSchema);
  
  if (options?.nonempty) {
    schema = schema.nonempty() as any;
  }
  
  if (options?.min !== undefined) {
    schema = schema.min(options.min);
  }
  
  if (options?.max !== undefined) {
    schema = schema.max(options.max);
  }
  
  return schema;
}

/**
 * Creates an enum schema with automatic string trimming and case normalization
 */
export function cleanEnum<T extends readonly [string, ...string[]]>(
  values: T,
  options?: {
    caseSensitive?: boolean;
  }
) {
  if (options?.caseSensitive === false) {
    // Create a preprocessing transform that normalizes case
    return z.string()
      .trim()
      .toLowerCase()
      .refine((val) => values.map(v => v.toLowerCase()).includes(val), {
        message: `Must be one of: ${values.join(', ')}`,
      })
      .transform((val) => {
        // Find the original case version
        const index = values.map(v => v.toLowerCase()).indexOf(val);
        return values[index] as T[number];
      });
  }
  
  return z.string().trim().refine((val) => values.includes(val), {
    message: `Must be one of: ${values.join(', ')}`,
  }) as z.ZodType<T[number]>;
}

/**
 * Creates an optional string schema with trimming and empty string handling
 * Converts empty strings to undefined for optional fields
 */
export function optionalCleanString(options?: {
  min?: number;
  max?: number;
  email?: boolean;
  url?: boolean;
  uuid?: boolean;
  regex?: RegExp;
}) {
  return z.string()
    .trim()
    .transform((val) => val === '' ? undefined : val)
    .optional()
    .refine((val) => {
      if (val === undefined) return true;
      
      if (options?.min !== undefined && val.length < options.min) return false;
      if (options?.max !== undefined && val.length > options.max) return false;
      if (options?.email && !z.string().email().safeParse(val).success) return false;
      if (options?.url && !z.string().url().safeParse(val).success) return false;
      if (options?.uuid && !z.string().uuid().safeParse(val).success) return false;
      if (options?.regex && !options.regex.test(val)) return false;
      
      return true;
    });
}

/**
 * Creates an optional number schema with coercion and empty string handling
 * Converts empty strings to undefined for optional numeric fields
 */
export function optionalCleanNumber(options?: {
  min?: number;
  max?: number;
  int?: boolean;
  positive?: boolean;
  nonnegative?: boolean;
}) {
  return z.union([
    z.string().trim().transform((val) => val === '' ? undefined : val),
    z.number(),
    z.undefined(),
  ])
    .optional()
    .transform((val) => {
      if (val === undefined || val === '') return undefined;
      const num = Number(val);
      return isNaN(num) ? val : num; // Return original if not a valid number for validation
    })
    .refine((val) => {
      if (val === undefined) return true;
      if (typeof val !== 'number') return false;
      if (!isFinite(val)) return false;
      
      if (options?.int && !Number.isInteger(val)) return false;
      if (options?.positive && val <= 0) return false;
      if (options?.nonnegative && val < 0) return false;
      if (options?.min !== undefined && val < options.min) return false;
      if (options?.max !== undefined && val > options.max) return false;
      
      return true;
    });
}

/**
 * Utility to clean an entire object by trimming all string values recursively
 */
export function createObjectCleaner<T extends z.ZodRawShape>(shape: T) {
  const cleanedShape: { [K in keyof T]: z.ZodType<any> } = {} as any;
  
  for (const [key, schema] of Object.entries(shape)) {
    if (schema instanceof z.ZodString) {
      cleanedShape[key as keyof T] = schema.trim() as any;
    } else if (schema instanceof z.ZodOptional && schema._def.innerType instanceof z.ZodString) {
      cleanedShape[key as keyof T] = schema._def.innerType.trim().optional() as any;
    } else {
      cleanedShape[key as keyof T] = schema as any;
    }
  }
  
  return z.object(cleanedShape);
}

/**
 * Advanced data cleaning transformations
 */
export const dataCleaners = {
  /**
   * Normalizes whitespace in strings (converts multiple spaces to single space)
   */
  normalizeWhitespace: (str: string) => str.replace(/\s+/g, ' ').trim(),
  
  /**
   * Removes all non-alphanumeric characters except spaces and common punctuation
   */
  sanitizeText: (str: string) => str.replace(/[^\w\s.,!?-]/g, '').trim(),
  
  /**
   * Normalizes phone numbers by removing all non-digit characters
   */
  normalizePhone: (phone: string) => phone.replace(/\D/g, ''),
  
  /**
   * Normalizes email addresses to lowercase
   */
  normalizeEmail: (email: string) => email.toLowerCase().trim(),
  
  /**
   * Removes leading zeros from numeric strings (except for "0")
   */
  removeLeadingZeros: (str: string) => str === '0' ? str : str.replace(/^0+/, '') || '0',
  
  /**
   * Capitalizes the first letter of each word
   */
  titleCase: (str: string) => str.replace(/\w\S*/g, (txt) => 
    txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  ),
};

/**
 * Creates a string schema with custom cleaning transformation
 */
export function customCleanString(
  cleaner: (value: string) => string,
  options?: {
    min?: number;
    max?: number;
    email?: boolean;
    url?: boolean;
    uuid?: boolean;
    regex?: RegExp;
  }
) {
  let schema: z.ZodEffects<z.ZodString, string, string> = z.string().transform(cleaner);
  
  if (options?.min !== undefined) {
    schema = schema.refine(val => val.length >= options.min!, `Must be at least ${options.min} characters`) as any;
  }
  
  if (options?.max !== undefined) {
    schema = schema.refine(val => val.length <= options.max!, `Must be at most ${options.max} characters`) as any;
  }
  
  if (options?.email) {
    schema = schema.refine(val => z.string().email().safeParse(val).success, 'Must be a valid email') as any;
  }
  
  if (options?.url) {
    schema = schema.refine(val => z.string().url().safeParse(val).success, 'Must be a valid URL') as any;
  }
  
  if (options?.uuid) {
    schema = schema.refine(val => z.string().uuid().safeParse(val).success, 'Must be a valid UUID') as any;
  }
  
  if (options?.regex) {
    schema = schema.refine(val => options.regex!.test(val), 'Invalid format') as any;
  }
  
  return schema;
}

/**
 * Example schemas demonstrating the cleaning utilities
 */
export const exampleSchemas = {
  // User registration form with comprehensive cleaning
  userRegistration: z.object({
    email: cleanStringWithConstraints({ email: true, nonempty: true }),
    password: cleanStringWithConstraints({ min: 8, max: 128, nonempty: true }),
    firstName: customCleanString(dataCleaners.titleCase, { min: 1, max: 50 }),
    lastName: customCleanString(dataCleaners.titleCase, { min: 1, max: 50 }),
    age: cleanNumber({ min: 13, max: 120, int: true }),
    phone: optionalCleanString().transform(val => 
      val ? dataCleaners.normalizePhone(val) : undefined
    ),
    acceptTerms: cleanBoolean(),
  }),
  
  // Product data with various cleaning needs
  product: z.object({
    name: cleanStringWithConstraints({ min: 1, max: 200, nonempty: true }),
    description: customCleanString(dataCleaners.normalizeWhitespace, { max: 1000 }),
    price: cleanNumber({ min: 0, nonnegative: true }),
    category: cleanEnum(['electronics', 'clothing', 'books', 'home'] as const),
    tags: cleanStringArray({ max: 10 }),
    inStock: cleanBoolean(),
    sku: cleanStringWithConstraints({ regex: /^[A-Z0-9-]+$/, min: 3, max: 20 }),
    weight: optionalCleanNumber({ min: 0, nonnegative: true }),
  }),
  
  // API response with mixed data types
  apiResponse: z.object({
    id: cleanNumber({ int: true, positive: true }),
    status: cleanEnum(['success', 'error', 'pending'] as const, { caseSensitive: false }),
    message: optionalCleanString({ max: 500 }),
    data: z.record(z.unknown()).optional(),
    timestamp: cleanDate(),
    metadata: z.object({
      version: cleanStringWithConstraints({ regex: /^\d+\.\d+\.\d+$/ }),
      source: optionalCleanString(),
    }).optional(),
  }),
};
