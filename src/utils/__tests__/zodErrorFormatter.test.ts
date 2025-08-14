import { z, ZodError } from 'zod';
import {
  formatZodError,
  formatValidationError,
  createErrorSummary,
  toStandardValidationErrors,
  isZodError,
  EnhancedValidationError
} from '../zodErrorFormatter.js';

describe('zodErrorFormatter', () => {
  describe('formatZodError', () => {
    it('should format invalid_type errors correctly', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      try {
        schema.parse({ name: 123, age: 'not-a-number' });
      } catch (error) {
        const formatted = formatZodError(error as ZodError);
        
        expect(formatted).toHaveLength(2);
        
        // Check name field error
        const nameError = formatted.find(e => e.field === 'name');
        expect(nameError).toBeDefined();
        expect(nameError?.message).toBe('name must be of type string, but received number');
        expect(nameError?.code).toBe('invalid_type');
        expect(nameError?.received).toBe(123);
        expect(nameError?.expected).toBe('string');
        expect(nameError?.path).toEqual(['name']);
        
        // Check age field error
        const ageError = formatted.find(e => e.field === 'age');
        expect(ageError).toBeDefined();
        expect(ageError?.message).toBe('age must be of type number, but received string');
        expect(ageError?.code).toBe('invalid_type');
        expect(ageError?.received).toBe('not-a-number');
        expect(ageError?.expected).toBe('number');
        expect(ageError?.path).toEqual(['age']);
      }
    });

    it('should format string validation errors correctly', () => {
      const schema = z.object({
        email: z.string().email(),
        url: z.string().url(),
        uuid: z.string().uuid(),
      });

      try {
        schema.parse({
          email: 'invalid-email',
          url: 'not-a-url',
          uuid: 'not-a-uuid',
        });
      } catch (error) {
        const formatted = formatZodError(error as ZodError);
        
        expect(formatted).toHaveLength(3);
        
        const emailError = formatted.find(e => e.field === 'email');
        expect(emailError?.message).toBe('email must be a valid email address');
        expect(emailError?.expected).toBe('string (email)');
        
        const urlError = formatted.find(e => e.field === 'url');
        expect(urlError?.message).toBe('url must be a valid URL');
        expect(urlError?.expected).toBe('string (url)');
        
        const uuidError = formatted.find(e => e.field === 'uuid');
        expect(uuidError?.message).toBe('uuid must be a valid UUID');
        expect(uuidError?.expected).toBe('string (uuid)');
      }
    });

    it('should format size constraint errors correctly', () => {
      const schema = z.object({
        shortString: z.string().min(5),
        longString: z.string().max(10),
        exactString: z.string().length(8),
        smallNumber: z.number().min(10),
        bigNumber: z.number().max(100),
        shortArray: z.array(z.string()).min(2),
        longArray: z.array(z.string()).max(3),
      });

      try {
        schema.parse({
          shortString: 'hi',
          longString: 'this is way too long',
          exactString: 'short',
          smallNumber: 5,
          bigNumber: 150,
          shortArray: ['one'],
          longArray: ['one', 'two', 'three', 'four'],
        });
      } catch (error) {
        const formatted = formatZodError(error as ZodError);
        
        const shortStringError = formatted.find(e => e.field === 'shortString');
        expect(shortStringError?.message).toBe('shortString must be at least 5 characters long');
        expect(shortStringError?.expected).toBe('string with minimum 5');
        
        const longStringError = formatted.find(e => e.field === 'longString');
        expect(longStringError?.message).toBe('longString must be at most 10 characters long');
        expect(longStringError?.expected).toBe('string with maximum 10');
        
        const exactStringError = formatted.find(e => e.field === 'exactString');
        expect(exactStringError?.message).toBe('exactString must be exactly 8 characters long');
        
        const smallNumberError = formatted.find(e => e.field === 'smallNumber');
        expect(smallNumberError?.message).toBe('smallNumber must be at least 10');
        expect(smallNumberError?.expected).toBe('number with minimum 10');
        
        const bigNumberError = formatted.find(e => e.field === 'bigNumber');
        expect(bigNumberError?.message).toBe('bigNumber must be at most 100');
        expect(bigNumberError?.expected).toBe('number with maximum 100');
        
        const shortArrayError = formatted.find(e => e.field === 'shortArray');
        expect(shortArrayError?.message).toBe('shortArray must contain at least 2 items');
        expect(shortArrayError?.expected).toBe('array with minimum 2');
        
        const longArrayError = formatted.find(e => e.field === 'longArray');
        expect(longArrayError?.message).toBe('longArray must contain at most 3 items');
        expect(longArrayError?.expected).toBe('array with maximum 3');
      }
    });

    it('should format enum errors correctly', () => {
      const schema = z.object({
        status: z.enum(['active', 'inactive', 'pending']),
      });

      try {
        schema.parse({ status: 'unknown' });
      } catch (error) {
        const formatted = formatZodError(error as ZodError);
        
        expect(formatted).toHaveLength(1);
        const statusError = formatted[0]!;
        expect(statusError).toBeDefined();
        expect(statusError.message).toBe('status must be one of: "active", "inactive", "pending"');
        expect(statusError.expected).toBe('enum: active | inactive | pending');
      }
    });

    it('should format unrecognized keys errors correctly', () => {
      const schema = z.object({
        name: z.string(),
      }).strict();

      try {
        schema.parse({ name: 'John', age: 30, city: 'NYC' });
      } catch (error) {
        const formatted = formatZodError(error as ZodError);
        
        expect(formatted).toHaveLength(1);
        const keysError = formatted[0]!;
        expect(keysError).toBeDefined();
        expect(keysError.message).toContain('Unrecognized keys');
        expect(keysError.message).toContain('age');
        expect(keysError.message).toContain('city');
      }
    });

    it('should format nested object errors correctly', () => {
      const schema = z.object({
        user: z.object({
          profile: z.object({
            email: z.string().email(),
          }),
        }),
      });

      try {
        schema.parse({
          user: {
            profile: {
              email: 'invalid-email',
            },
          },
        });
      } catch (error) {
        const formatted = formatZodError(error as ZodError);
        
        expect(formatted).toHaveLength(1);
        const emailError = formatted[0]!;
        expect(emailError).toBeDefined();
        expect(emailError.field).toBe('user.profile.email');
        expect(emailError.path).toEqual(['user', 'profile', 'email']);
        expect(emailError.message).toBe('user.profile.email must be a valid email address');
      }
    });

    it('should format array index errors correctly', () => {
      const schema = z.object({
        items: z.array(z.object({
          id: z.number(),
        })),
      });

      try {
        schema.parse({
          items: [
            { id: 1 },
            { id: 'not-a-number' },
            { id: 3 },
          ],
        });
      } catch (error) {
        const formatted = formatZodError(error as ZodError);
        
        expect(formatted).toHaveLength(1);
        const idError = formatted[0]!;
        expect(idError).toBeDefined();
        expect(idError.field).toBe('items.1.id');
        expect(idError.path).toEqual(['items', '1', 'id']);
        expect(idError.message).toBe('items.1.id must be of type number, but received string');
      }
    });

    it('should include context information', () => {
      const schema = z.string();

      try {
        schema.parse(123);
      } catch (error) {
        const formatted = formatZodError(error as ZodError);
        
        expect(formatted).toHaveLength(1);
        const stringError = formatted[0]!;
        expect(stringError).toBeDefined();
        expect(stringError.context).toBeDefined();
        expect(stringError.context?.['zodCode']).toBe('invalid_type');
        expect(stringError.context?.['originalMessage']).toBeDefined();
      }
    });
  });

  describe('formatValidationError', () => {
    it('should handle ZodError correctly', () => {
      const schema = z.string();
      
      try {
        schema.parse(123);
      } catch (error) {
        const formatted = formatValidationError(error);
        
        expect(formatted).toHaveLength(1);
        const firstError = formatted[0]!;
        expect(firstError).toBeDefined();
        expect(firstError.field).toBe('root');
        expect(firstError.code).toBe('invalid_type');
      }
    });

    it('should handle non-ZodError correctly', () => {
      const error = new Error('Custom error message');
      const formatted = formatValidationError(error);
      
        expect(formatted).toHaveLength(1);
        const firstError = formatted[0]!;
        expect(firstError).toBeDefined();
        expect(firstError.field).toBe('root');
        expect(firstError.message).toBe('Custom error message');
        expect(firstError.code).toBe('UNKNOWN_ERROR');
        expect(firstError.context?.['isZodError']).toBe(false);
        expect(firstError.context?.['errorType']).toBe('Error');
    });

    it('should handle string errors correctly', () => {
      const formatted = formatValidationError('String error');
      
        expect(formatted).toHaveLength(1);
        const firstError = formatted[0]!;
        expect(firstError).toBeDefined();
        expect(firstError.message).toBe('String error');
        expect(firstError.code).toBe('UNKNOWN_ERROR');
    });
  });

  describe('createErrorSummary', () => {
    it('should create correct summary for single error', () => {
      const errors: EnhancedValidationError[] = [{
        field: 'email',
        path: ['email'],
        message: 'Invalid email format',
        code: 'invalid_string',
        value: 'invalid@',
      }];

      const summary = createErrorSummary(errors);
      
      expect(summary.totalErrors).toBe(1);
      expect(summary.fieldErrors).toEqual({
        email: ['Invalid email format'],
      });
      expect(summary.summary).toBe('Validation failed with 1 error across 1 field');
    });

    it('should create correct summary for multiple errors', () => {
      const errors: EnhancedValidationError[] = [
        {
          field: 'email',
          path: ['email'],
          message: 'Invalid email format',
          code: 'invalid_string',
          value: 'invalid@',
        },
        {
          field: 'age',
          path: ['age'],
          message: 'Must be a number',
          code: 'invalid_type',
          value: 'not-a-number',
        },
        {
          field: 'email',
          path: ['email'],
          message: 'Email is required',
          code: 'too_small',
          value: '',
        },
      ];

      const summary = createErrorSummary(errors);
      
      expect(summary.totalErrors).toBe(3);
      expect(summary.fieldErrors).toEqual({
        email: ['Invalid email format', 'Email is required'],
        age: ['Must be a number'],
      });
      expect(summary.summary).toBe('Validation failed with 3 errors across 2 fields');
    });
  });

  describe('toStandardValidationErrors', () => {
    it('should convert enhanced errors to standard format', () => {
      const enhancedErrors: EnhancedValidationError[] = [{
        field: 'email',
        path: ['email'],
        message: 'Invalid email format',
        code: 'invalid_string',
        value: 'invalid@',
        received: 'invalid@',
        expected: 'string (email)',
        context: { zodCode: 'invalid_string' },
      }];

      const standardErrors = toStandardValidationErrors(enhancedErrors);
      
      expect(standardErrors).toHaveLength(1);
      expect(standardErrors[0]).toEqual({
        field: 'email',
        message: 'Invalid email format',
        code: 'invalid_string',
        value: 'invalid@',
      });
    });
  });

  describe('isZodError', () => {
    it('should correctly identify ZodError', () => {
      const schema = z.string();
      
      try {
        schema.parse(123);
      } catch (error) {
        expect(isZodError(error)).toBe(true);
      }
    });

    it('should correctly identify non-ZodError', () => {
      const error = new Error('Regular error');
      expect(isZodError(error)).toBe(false);
      
      expect(isZodError('string')).toBe(false);
      expect(isZodError(null)).toBe(false);
      expect(isZodError(undefined)).toBe(false);
      expect(isZodError({})).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle root-level validation errors', () => {
      const schema = z.string();
      
      try {
        schema.parse(123);
      } catch (error) {
        const formatted = formatZodError(error as ZodError);
        
        expect(formatted).toHaveLength(1);
        const firstError = formatted[0]!;
        expect(firstError).toBeDefined();
        expect(firstError.field).toBe('root');
        expect(firstError.path).toEqual([]);
      }
    });

    it('should handle custom validation errors', () => {
      const schema = z.string().refine(val => val.includes('@'), {
        message: 'Must contain @ symbol',
      });

      try {
        schema.parse('invalid');
      } catch (error) {
        const formatted = formatZodError(error as ZodError);
        
        expect(formatted).toHaveLength(1);
        const firstError = formatted[0]!;
        expect(firstError).toBeDefined();
        expect(firstError.code).toBe('custom');
        expect(firstError.message).toBe('Must contain @ symbol');
      }
    });

    it('should handle union validation errors', () => {
      const schema = z.union([z.string(), z.number()]);

      try {
        schema.parse(true);
      } catch (error) {
        const formatted = formatZodError(error as ZodError);
        
        expect(formatted).toHaveLength(1);
        const firstError = formatted[0]!;
        expect(firstError).toBeDefined();
        expect(firstError.code).toBe('invalid_union');
        expect(firstError.message).toBe('root does not match any of the expected formats');
        expect(firstError.expected).toBe('union type');
      }
    });
  });
});
