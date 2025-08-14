import { z } from 'zod';
import {
  cleanString,
  cleanStringWithConstraints,
  cleanNumber,
  cleanBoolean,
  cleanDate,
  cleanStringArray,
  cleanNumberArray,
  cleanEnum,
  optionalCleanString,
  optionalCleanNumber,
  createObjectCleaner,
  customCleanString,
  dataCleaners,
  exampleSchemas,
} from '../zodSchemaHelpers.js';

describe('zodSchemaHelpers', () => {
  describe('cleanString', () => {
    it('should trim whitespace from strings', () => {
      const schema = cleanString();
      
      expect(schema.parse('  hello  ')).toBe('hello');
      expect(schema.parse('\t\nworld\t\n')).toBe('world');
      expect(schema.parse('no-trim')).toBe('no-trim');
    });
  });

  describe('cleanStringWithConstraints', () => {
    it('should trim and apply constraints', () => {
      const schema = cleanStringWithConstraints({
        min: 3,
        max: 10,
        nonempty: true,
      });
      
      expect(schema.parse('  hello  ')).toBe('hello');
      expect(() => schema.parse('  hi  ')).toThrow(); // Too short after trim
      expect(() => schema.parse('  this is too long  ')).toThrow(); // Too long after trim
      expect(() => schema.parse('   ')).toThrow(); // Empty after trim
    });

    it('should validate email format after trimming', () => {
      const schema = cleanStringWithConstraints({ email: true });
      
      expect(schema.parse('  test@example.com  ')).toBe('test@example.com');
      expect(() => schema.parse('  invalid-email  ')).toThrow();
    });

    it('should validate URL format after trimming', () => {
      const schema = cleanStringWithConstraints({ url: true });
      
      expect(schema.parse('  https://example.com  ')).toBe('https://example.com');
      expect(() => schema.parse('  not-a-url  ')).toThrow();
    });

    it('should validate regex pattern after trimming', () => {
      const schema = cleanStringWithConstraints({ regex: /^\d{3}-\d{3}-\d{4}$/ });
      
      expect(schema.parse('  123-456-7890  ')).toBe('123-456-7890');
      expect(() => schema.parse('  invalid-format  ')).toThrow();
    });
  });

  describe('cleanNumber', () => {
    it('should coerce strings to numbers', () => {
      const schema = cleanNumber();
      
      expect(schema.parse('123')).toBe(123);
      expect(schema.parse('123.45')).toBe(123.45);
      expect(schema.parse('-42')).toBe(-42);
      expect(schema.parse(456)).toBe(456);
    });

    it('should apply numeric constraints', () => {
      const schema = cleanNumber({
        min: 0,
        max: 100,
        int: true,
        nonnegative: true,
      });
      
      expect(schema.parse('50')).toBe(50);
      expect(schema.parse(75)).toBe(75);
      expect(() => schema.parse('-5')).toThrow(); // Negative
      expect(() => schema.parse('150')).toThrow(); // Too large
      expect(() => schema.parse('50.5')).toThrow(); // Not integer
    });

    it('should handle positive and nonnegative constraints', () => {
      const positiveSchema = cleanNumber({ positive: true });
      const nonnegativeSchema = cleanNumber({ nonnegative: true });
      
      expect(positiveSchema.parse('5')).toBe(5);
      expect(() => positiveSchema.parse('0')).toThrow(); // Zero not positive
      expect(() => positiveSchema.parse('-1')).toThrow(); // Negative
      
      expect(nonnegativeSchema.parse('0')).toBe(0);
      expect(nonnegativeSchema.parse('5')).toBe(5);
      expect(() => nonnegativeSchema.parse('-1')).toThrow(); // Negative
    });
  });

  describe('cleanBoolean', () => {
    it('should coerce various values to booleans', () => {
      const schema = cleanBoolean();
      
      expect(schema.parse('true')).toBe(true);
      expect(schema.parse('false')).toBe(true); // z.coerce.boolean treats non-empty strings as true
      expect(schema.parse('1')).toBe(true);
      expect(schema.parse('0')).toBe(true); // z.coerce.boolean treats non-empty strings as true
      expect(schema.parse(1)).toBe(true);
      expect(schema.parse(0)).toBe(false);
      expect(schema.parse(true)).toBe(true);
      expect(schema.parse(false)).toBe(false);
      expect(schema.parse('')).toBe(false); // Empty string is falsy
    });
  });

  describe('cleanDate', () => {
    it('should coerce strings and numbers to dates', () => {
      const schema = cleanDate();
      
      const isoString = '2023-12-25T00:00:00.000Z';
      const timestamp = 1703462400000; // Same date as timestamp
      
      expect(schema.parse(isoString)).toEqual(new Date(isoString));
      expect(schema.parse(timestamp)).toEqual(new Date(timestamp));
      expect(schema.parse(new Date(isoString))).toEqual(new Date(isoString));
    });

    it('should apply date range constraints', () => {
      const minDate = new Date('2023-01-01');
      const maxDate = new Date('2023-12-31');
      const schema = cleanDate({ min: minDate, max: maxDate });
      
      expect(schema.parse('2023-06-15')).toEqual(new Date('2023-06-15'));
      expect(() => schema.parse('2022-12-31')).toThrow(); // Before min
      expect(() => schema.parse('2024-01-01')).toThrow(); // After max
    });
  });

  describe('cleanStringArray', () => {
    it('should trim all string elements', () => {
      const schema = cleanStringArray();
      
      const result = schema.parse(['  hello  ', '  world  ', 'test']);
      expect(result).toEqual(['hello', 'world', 'test']);
    });

    it('should apply array constraints', () => {
      const schema = cleanStringArray({ min: 2, max: 4, nonempty: true });
      
      expect(schema.parse(['  a  ', '  b  ', '  c  '])).toEqual(['a', 'b', 'c']);
      expect(() => schema.parse(['  a  '])).toThrow(); // Too few items
      expect(() => schema.parse(['a', 'b', 'c', 'd', 'e'])).toThrow(); // Too many items
      expect(() => schema.parse([])).toThrow(); // Empty array
    });
  });

  describe('cleanNumberArray', () => {
    it('should coerce all elements to numbers', () => {
      const schema = cleanNumberArray();
      
      const result = schema.parse(['1', '2.5', 3, '4']);
      expect(result).toEqual([1, 2.5, 3, 4]);
    });

    it('should apply array and element constraints', () => {
      const schema = cleanNumberArray({
        min: 2,
        max: 4,
        elementMin: 0,
        elementMax: 100,
      });
      
      expect(schema.parse(['10', '20', '30'])).toEqual([10, 20, 30]);
      expect(() => schema.parse(['10'])).toThrow(); // Too few items
      expect(() => schema.parse(['-5', '10'])).toThrow(); // Element below min
      expect(() => schema.parse(['150', '10'])).toThrow(); // Element above max
    });
  });

  describe('cleanEnum', () => {
    it('should trim and validate enum values', () => {
      const schema = cleanEnum(['red', 'green', 'blue'] as const);
      
      expect(schema.parse('  red  ')).toBe('red');
      expect(schema.parse('green')).toBe('green');
      expect(() => schema.parse('yellow')).toThrow();
    });

    it('should handle case-insensitive matching', () => {
      const schema = cleanEnum(['Red', 'Green', 'Blue'] as const, { caseSensitive: false });
      
      expect(schema.parse('  red  ')).toBe('Red');
      expect(schema.parse('GREEN')).toBe('Green');
      expect(schema.parse('bLuE')).toBe('Blue');
      expect(() => schema.parse('yellow')).toThrow();
    });
  });

  describe('optionalCleanString', () => {
    it('should convert empty strings to undefined', () => {
      const schema = optionalCleanString();
      
      expect(schema.parse('  hello  ')).toBe('hello');
      expect(schema.parse('   ')).toBeUndefined();
      expect(schema.parse('')).toBeUndefined();
      expect(schema.parse(undefined)).toBeUndefined();
    });

    it('should validate non-empty values', () => {
      const schema = optionalCleanString({ min: 3, email: true });
      
      expect(schema.parse('  test@example.com  ')).toBe('test@example.com');
      expect(schema.parse('   ')).toBeUndefined(); // Empty becomes undefined
      expect(() => schema.parse('  hi  ')).toThrow(); // Too short
      expect(() => schema.parse('  invalid-email  ')).toThrow(); // Invalid email
    });
  });

  describe('optionalCleanNumber', () => {
    it('should convert empty strings to undefined and coerce numbers', () => {
      const schema = optionalCleanNumber();
      
      expect(schema.parse('123')).toBe(123);
      expect(schema.parse(456)).toBe(456);
      expect(schema.parse('   ')).toBeUndefined();
      expect(schema.parse('')).toBeUndefined();
      expect(schema.parse(undefined)).toBeUndefined();
    });

    it('should validate numeric constraints', () => {
      const schema = optionalCleanNumber({ min: 0, max: 100, int: true });
      
      expect(schema.parse('50')).toBe(50);
      expect(schema.parse('   ')).toBeUndefined();
      expect(() => schema.parse('-5')).toThrow(); // Below min
      expect(() => schema.parse('150')).toThrow(); // Above max
      expect(() => schema.parse('50.5')).toThrow(); // Not integer
    });
  });

  describe('createObjectCleaner', () => {
    it('should automatically trim string fields in objects', () => {
      const originalShape = {
        name: z.string(),
        email: z.string().email(),
        age: z.number(),
        bio: z.string().optional(),
      };
      
      const cleanedSchema = createObjectCleaner(originalShape);
      
      const result = cleanedSchema.parse({
        name: '  John Doe  ',
        email: '  john@example.com  ',
        age: 30,
        bio: '  Software developer  ',
      });
      
      expect(result).toEqual({
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
        bio: 'Software developer',
      });
    });
  });

  describe('dataCleaners', () => {
    describe('normalizeWhitespace', () => {
      it('should convert multiple spaces to single space', () => {
        expect(dataCleaners.normalizeWhitespace('  hello    world  ')).toBe('hello world');
        expect(dataCleaners.normalizeWhitespace('test\t\n\r  text')).toBe('test text');
      });
    });

    describe('sanitizeText', () => {
      it('should remove special characters except common punctuation', () => {
        expect(dataCleaners.sanitizeText('Hello, world! @#$%')).toBe('Hello, world!');
        expect(dataCleaners.sanitizeText('Test-text.123?')).toBe('Test-text.123?');
      });
    });

    describe('normalizePhone', () => {
      it('should remove all non-digit characters', () => {
        expect(dataCleaners.normalizePhone('(123) 456-7890')).toBe('1234567890');
        expect(dataCleaners.normalizePhone('+1-123-456-7890')).toBe('11234567890');
      });
    });

    describe('normalizeEmail', () => {
      it('should convert to lowercase and trim', () => {
        expect(dataCleaners.normalizeEmail('  TEST@EXAMPLE.COM  ')).toBe('test@example.com');
        expect(dataCleaners.normalizeEmail('User@Domain.org')).toBe('user@domain.org');
      });
    });

    describe('removeLeadingZeros', () => {
      it('should remove leading zeros except for "0"', () => {
        expect(dataCleaners.removeLeadingZeros('00123')).toBe('123');
        expect(dataCleaners.removeLeadingZeros('0')).toBe('0');
        expect(dataCleaners.removeLeadingZeros('000')).toBe('0');
        expect(dataCleaners.removeLeadingZeros('123')).toBe('123');
      });
    });

    describe('titleCase', () => {
      it('should capitalize first letter of each word', () => {
        expect(dataCleaners.titleCase('hello world')).toBe('Hello World');
        expect(dataCleaners.titleCase('JOHN DOE')).toBe('John Doe');
        expect(dataCleaners.titleCase('mixed CaSe text')).toBe('Mixed Case Text');
      });
    });
  });

  describe('customCleanString', () => {
    it('should apply custom cleaning function', () => {
      const upperCaseSchema = customCleanString(str => str.toUpperCase());
      
      expect(upperCaseSchema.parse('hello world')).toBe('HELLO WORLD');
    });

    it('should apply custom cleaning with constraints', () => {
      const normalizeSchema = customCleanString(
        dataCleaners.normalizeWhitespace,
        { min: 5, max: 20 }
      );
      
      expect(normalizeSchema.parse('  hello    world  ')).toBe('hello world');
      expect(() => normalizeSchema.parse('  hi  ')).toThrow(); // Too short after cleaning
    });
  });

  describe('exampleSchemas', () => {
    describe('userRegistration', () => {
      it('should clean and validate user registration data', () => {
        const validData = {
          email: '  test@example.com  ',
          password: '  password123  ',
          firstName: '  john  ',
          lastName: '  doe  ',
          age: '25',
          phone: '  (123) 456-7890  ',
          acceptTerms: 'true',
        };

        const result = exampleSchemas.userRegistration.parse(validData);
        
        expect(result).toEqual({
          email: 'test@example.com',
          password: 'password123',
          firstName: 'John',
          lastName: 'Doe',
          age: 25,
          phone: '1234567890',
          acceptTerms: true,
        });
      });

      it('should reject invalid user registration data', () => {
        const invalidData = {
          email: 'invalid-email',
          password: 'short',
          firstName: '',
          lastName: '',
          age: '12', // Too young
          acceptTerms: 'false',
        };

        expect(() => exampleSchemas.userRegistration.parse(invalidData)).toThrow();
      });
    });

    describe('product', () => {
      it('should clean and validate product data', () => {
        const validData = {
          name: '  Awesome Product  ',
          description: '  This    is   a   great    product  ',
          price: '29.99',
          category: '  ELECTRONICS  ',
          tags: ['  tech  ', '  gadget  '],
          inStock: 'true',
          sku: '  PROD-123  ',
          weight: '1.5',
        };

        const result = exampleSchemas.product.parse(validData);
        
        expect(result.name).toBe('Awesome Product');
        expect(result.description).toBe('This is a great product');
        expect(result.price).toBe(29.99);
        expect(result.category).toBe('electronics');
        expect(result.tags).toEqual(['tech', 'gadget']);
        expect(result.inStock).toBe(true);
        expect(result.sku).toBe('PROD-123');
        expect(result.weight).toBe(1.5);
      });
    });

    describe('apiResponse', () => {
      it('should clean and validate API response data', () => {
        const validData = {
          id: '123',
          status: '  SUCCESS  ',
          message: '  Operation completed  ',
          timestamp: '2023-12-25T00:00:00.000Z',
          metadata: {
            version: '  1.2.3  ',
            source: '  api-server  ',
          },
        };

        const result = exampleSchemas.apiResponse.parse(validData);
        
        expect(result.id).toBe(123);
        expect(result.status).toBe('success');
        expect(result.message).toBe('Operation completed');
        expect(result.timestamp).toEqual(new Date('2023-12-25T00:00:00.000Z'));
        expect(result.metadata?.version).toBe('1.2.3');
        expect(result.metadata?.source).toBe('api-server');
      });
    });
  });

  describe('edge cases', () => {
    it('should handle null and undefined inputs appropriately', () => {
      const optionalSchema = optionalCleanString();
      
      expect(optionalSchema.parse(undefined)).toBeUndefined();
      // Note: null would need to be handled differently depending on requirements
    });

    it('should handle very long strings', () => {
      const longString = 'a'.repeat(1000);
      const schema = cleanStringWithConstraints({ max: 500 });
      
      expect(() => schema.parse(longString)).toThrow();
    });

    it('should handle special numeric values', () => {
      const schema = cleanNumber();
      
      expect(() => schema.parse('Infinity')).toThrow(); // Should be finite by default
      expect(() => schema.parse('NaN')).toThrow();
    });

    it('should handle empty arrays', () => {
      const requiredArraySchema = cleanStringArray({ nonempty: true });
      const optionalArraySchema = cleanStringArray();
      
      expect(() => requiredArraySchema.parse([])).toThrow();
      expect(optionalArraySchema.parse([])).toEqual([]);
    });
  });
});
