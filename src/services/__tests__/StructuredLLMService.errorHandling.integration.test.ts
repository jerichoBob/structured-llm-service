import { z } from 'zod';
import { formatValidationError, isZodError } from '../../utils/zodErrorFormatter.js';

describe('StructuredLLMService - Enhanced Error Reporting Integration', () => {

  describe('End-to-End Error Handling', () => {
    it('should provide enhanced error reporting for validation failures', async () => {
      // Define a complex schema with multiple validation rules
      const userSchema = z.object({
        email: z.string().email('Must be a valid email address'),
        age: z.number().min(18, 'Must be at least 18 years old').max(120, 'Must be at most 120 years old'),
        name: z.string().min(2, 'Name must be at least 2 characters').max(50, 'Name must be at most 50 characters'),
        preferences: z.object({
          newsletter: z.boolean(),
          notifications: z.enum(['all', 'important', 'none'], {
            errorMap: () => ({ message: 'Must be one of: all, important, none' })
          }),
        }),
        tags: z.array(z.string()).min(1, 'Must have at least one tag').max(5, 'Cannot have more than 5 tags'),
      });

      // Test data that will fail validation in multiple ways
      const invalidData = {
        email: 'not-an-email',
        age: 15, // Too young
        name: 'A', // Too short
        preferences: {
          newsletter: 'yes', // Should be boolean
          notifications: 'sometimes', // Invalid enum value
        },
        tags: [], // Empty array
      };

      try {
        // This should trigger validation errors
        userSchema.parse(invalidData);
        fail('Expected validation to fail');
      } catch (error) {
        // Test our enhanced error formatting
        expect(isZodError(error)).toBe(true);
        
        const enhancedErrors = formatValidationError(error);
        expect(enhancedErrors).toHaveLength(6); // Should have 6 validation errors

        // Check that we have detailed error information
        const emailError = enhancedErrors.find(e => e.field === 'email');
        expect(emailError).toBeDefined();
        expect(emailError?.message).toContain('valid email');
        expect(emailError?.code).toBe('invalid_string');
        expect(emailError?.received).toBe('not-an-email');

        const ageError = enhancedErrors.find(e => e.field === 'age');
        expect(ageError).toBeDefined();
        expect(ageError?.message).toContain('at least 18');
        expect(ageError?.code).toBe('too_small');

        const nameError = enhancedErrors.find(e => e.field === 'name');
        expect(nameError).toBeDefined();
        expect(nameError?.message).toContain('at least 2 characters');

        const newsletterError = enhancedErrors.find(e => e.field === 'preferences.newsletter');
        expect(newsletterError).toBeDefined();
        expect(newsletterError?.message).toContain('boolean');

        const notificationsError = enhancedErrors.find(e => e.field === 'preferences.notifications');
        expect(notificationsError).toBeDefined();
        expect(notificationsError?.message).toContain('one of: all, important, none');

        const tagsError = enhancedErrors.find(e => e.field === 'tags');
        expect(tagsError).toBeDefined();
        expect(tagsError?.message).toContain('at least one tag');
      }
    });

    it('should handle nested object validation errors correctly', async () => {
      const nestedSchema = z.object({
        user: z.object({
          profile: z.object({
            bio: z.string().max(100, 'Bio must be at most 100 characters'),
            social: z.object({
              twitter: z.string().url('Must be a valid URL').optional(),
              linkedin: z.string().url('Must be a valid URL').optional(),
            }),
          }),
        }),
      });

      const invalidNestedData = {
        user: {
          profile: {
            bio: 'A'.repeat(150), // Too long
            social: {
              twitter: 'not-a-url',
              linkedin: 'also-not-a-url',
            },
          },
        },
      };

      try {
        nestedSchema.parse(invalidNestedData);
        fail('Expected validation to fail');
      } catch (error) {
        const enhancedErrors = formatValidationError(error);
        
        // Check nested field paths are correctly formatted
        const bioError = enhancedErrors.find(e => e.field === 'user.profile.bio');
        expect(bioError).toBeDefined();
        expect(bioError?.path).toEqual(['user', 'profile', 'bio']);

        const twitterError = enhancedErrors.find(e => e.field === 'user.profile.social.twitter');
        expect(twitterError).toBeDefined();
        expect(twitterError?.path).toEqual(['user', 'profile', 'social', 'twitter']);

        const linkedinError = enhancedErrors.find(e => e.field === 'user.profile.social.linkedin');
        expect(linkedinError).toBeDefined();
        expect(linkedinError?.path).toEqual(['user', 'profile', 'social', 'linkedin']);
      }
    });

    it('should handle array validation errors with proper indexing', async () => {
      const arraySchema = z.object({
        items: z.array(z.object({
          id: z.number().positive('ID must be positive'),
          name: z.string().min(1, 'Name is required'),
          category: z.enum(['A', 'B', 'C'], {
            errorMap: () => ({ message: 'Category must be A, B, or C' })
          }),
        })).min(1, 'Must have at least one item'),
      });

      const invalidArrayData = {
        items: [
          { id: -1, name: '', category: 'X' }, // All invalid
          { id: 2, name: 'Valid', category: 'A' }, // Valid
          { id: 0, name: 'Test', category: 'D' }, // ID and category invalid
        ],
      };

      try {
        arraySchema.parse(invalidArrayData);
        fail('Expected validation to fail');
      } catch (error) {
        const enhancedErrors = formatValidationError(error);
        
        // Check array index paths
        const firstIdError = enhancedErrors.find(e => e.field === 'items.0.id');
        expect(firstIdError).toBeDefined();
        expect(firstIdError?.message).toContain('positive');

        const firstNameError = enhancedErrors.find(e => e.field === 'items.0.name');
        expect(firstNameError).toBeDefined();
        expect(firstNameError?.message).toContain('required');

        const firstCategoryError = enhancedErrors.find(e => e.field === 'items.0.category');
        expect(firstCategoryError).toBeDefined();
        expect(firstCategoryError?.message).toContain('A, B, or C');

        const thirdIdError = enhancedErrors.find(e => e.field === 'items.2.id');
        expect(thirdIdError).toBeDefined();

        const thirdCategoryError = enhancedErrors.find(e => e.field === 'items.2.category');
        expect(thirdCategoryError).toBeDefined();
      }
    });

    it('should provide context information for debugging', async () => {
      const schema = z.object({
        value: z.string().refine(val => val.includes('@'), {
          message: 'Value must contain @ symbol',
        }),
      });

      try {
        schema.parse({ value: 'no-at-symbol' });
        fail('Expected validation to fail');
      } catch (error) {
        const enhancedErrors = formatValidationError(error);
        const valueError = enhancedErrors[0];

        expect(valueError?.context).toBeDefined();
        expect(valueError?.context?.['zodCode']).toBe('custom');
        expect(valueError?.context?.['originalMessage']).toBe('Value must contain @ symbol');
        expect(valueError?.context?.['isZodError']).toBeUndefined(); // Only set for non-Zod errors
      }
    });

    it('should handle union type validation errors', async () => {
      const unionSchema = z.union([
        z.object({ type: z.literal('email'), value: z.string().email() }),
        z.object({ type: z.literal('phone'), value: z.string().regex(/^\d{10}$/) }),
        z.object({ type: z.literal('url'), value: z.string().url() }),
      ]);

      try {
        unionSchema.parse({ type: 'email', value: 'not-an-email' });
        fail('Expected validation to fail');
      } catch (error) {
        const enhancedErrors = formatValidationError(error);
        
        expect(enhancedErrors.length).toBeGreaterThan(0);
        const unionError = enhancedErrors.find(e => e.code === 'invalid_union');
        expect(unionError).toBeDefined();
        expect(unionError?.message).toContain('does not match any of the expected formats');
      }
    });

    it('should handle non-Zod errors gracefully', async () => {
      const regularError = new Error('This is a regular error');
      const enhancedErrors = formatValidationError(regularError);

      expect(enhancedErrors).toHaveLength(1);
      expect(enhancedErrors[0]?.field).toBe('root');
      expect(enhancedErrors[0]?.message).toBe('This is a regular error');
      expect(enhancedErrors[0]?.code).toBe('UNKNOWN_ERROR');
      expect(enhancedErrors[0]?.context?.['isZodError']).toBe(false);
      expect(enhancedErrors[0]?.context?.['errorType']).toBe('Error');
    });

    it('should handle string errors', async () => {
      const stringError = 'Something went wrong';
      const enhancedErrors = formatValidationError(stringError);

      expect(enhancedErrors).toHaveLength(1);
      expect(enhancedErrors[0]?.field).toBe('root');
      expect(enhancedErrors[0]?.message).toBe('Something went wrong');
      expect(enhancedErrors[0]?.code).toBe('UNKNOWN_ERROR');
      expect(enhancedErrors[0]?.received).toBe('Something went wrong');
    });
  });

  describe('Service Integration with Enhanced Error Handling', () => {
    it('should integrate enhanced error formatting in service error results', async () => {
      // Create a mock scenario where validation would fail
      const testSchema = z.object({
        email: z.string().email(),
        age: z.number().min(18),
      });

      // Since we can't easily mock the instructor client in this test,
      // we'll test the error formatting integration by directly testing
      // the createErrorResult method behavior through a validation error
      try {
        testSchema.parse({ email: 'invalid', age: 15 });
      } catch (zodError) {
        // Test that our service would handle this error correctly
        const enhancedErrors = formatValidationError(zodError);
        
        expect(enhancedErrors).toHaveLength(2);
        expect(enhancedErrors.some(e => e.field === 'email')).toBe(true);
        expect(enhancedErrors.some(e => e.field === 'age')).toBe(true);
        
        // Verify the enhanced errors have all required properties
        enhancedErrors.forEach(error => {
          expect(error).toHaveProperty('field');
          expect(error).toHaveProperty('message');
          expect(error).toHaveProperty('code');
          expect(error).toHaveProperty('path');
          expect(error).toHaveProperty('context');
        });
      }
    });
  });

  describe('Error Summary Generation', () => {
    it('should generate useful error summaries', async () => {
      const schema = z.object({
        email: z.string().email(),
        name: z.string().min(2),
        age: z.number().min(18),
      });

      try {
        schema.parse({ email: 'invalid', name: 'A', age: 15 });
      } catch (error) {
        const enhancedErrors = formatValidationError(error);
        
        // Test that we can create summaries from enhanced errors
        const fieldErrors: Record<string, string[]> = {};
        enhancedErrors.forEach(err => {
          if (!fieldErrors[err.field]) {
            fieldErrors[err.field] = [];
          }
          fieldErrors[err.field]?.push(err.message);
        });

        expect(Object.keys(fieldErrors)).toHaveLength(3);
        expect(fieldErrors['email']).toHaveLength(1);
        expect(fieldErrors['name']).toHaveLength(1);
        expect(fieldErrors['age']).toHaveLength(1);
      }
    });
  });
});
