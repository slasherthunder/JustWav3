/**
 * Input validation and sanitization utilities
 * Uses Zod for schema-based validation with strict type checking
 */

import { z } from 'zod';

// Constants for validation limits
export const VALIDATION_LIMITS = {
  EMAIL_MAX_LENGTH: 254, // RFC 5321
  EMAIL_LOCAL_MAX_LENGTH: 64, // RFC 5321
  PASSWORD_MIN_LENGTH: 6,
  PASSWORD_MAX_LENGTH: 128,
  MESSAGE_MAX_LENGTH: 5000,
  SEARCH_QUERY_MAX_LENGTH: 100,
  USER_NAME_MAX_LENGTH: 100,
  ROLE_MAX_LENGTH: 20,
  PASSWORD_ICONS_COUNT: 3,
} as const;

// Email validation schema
const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .max(VALIDATION_LIMITS.EMAIL_MAX_LENGTH, `Email must be ${VALIDATION_LIMITS.EMAIL_MAX_LENGTH} characters or less`)
  .email('Please enter a valid email address')
  .refine((email) => {
    const [localPart] = email.split('@');
    return localPart.length <= VALIDATION_LIMITS.EMAIL_LOCAL_MAX_LENGTH;
  }, `Email local part must be ${VALIDATION_LIMITS.EMAIL_LOCAL_MAX_LENGTH} characters or less`)
  .refine((email) => {
    // Reject dangerous characters
    const dangerousChars = /[<>\"'%;()&+]/.test(email);
    return !dangerousChars;
  }, 'Email contains invalid characters');

// Password validation schema (normal password)
const normalPasswordSchema = z
  .string()
  .min(VALIDATION_LIMITS.PASSWORD_MIN_LENGTH, `Password must be at least ${VALIDATION_LIMITS.PASSWORD_MIN_LENGTH} characters`)
  .max(VALIDATION_LIMITS.PASSWORD_MAX_LENGTH, `Password must be ${VALIDATION_LIMITS.PASSWORD_MAX_LENGTH} characters or less`)
  .refine((password) => {
    // Reject passwords with only whitespace
    return password.trim().length >= VALIDATION_LIMITS.PASSWORD_MIN_LENGTH;
  }, 'Password cannot be only whitespace');

// Password icons validation schema
const passwordIconsSchema = z
  .array(z.string())
  .length(VALIDATION_LIMITS.PASSWORD_ICONS_COUNT, `Must select exactly ${VALIDATION_LIMITS.PASSWORD_ICONS_COUNT} password icons`)
  .refine((icons) => {
    // Each icon should be a valid emoji or character (basic validation)
    return icons.every((icon) => typeof icon === 'string' && icon.length > 0);
  }, 'All password icons must be valid');

// User role validation schema
const userRoleSchema = z.enum(['parent', 'student', 'teacher']);

// Signup validation schema
export const signupSchema = z
  .object({
    email: emailSchema,
    password: normalPasswordSchema.optional(),
    passwordIcons: passwordIconsSchema.optional(),
    confirmPassword: z.string().optional(),
    confirmPasswordIcons: z.array(z.string()).optional(),
    role: userRoleSchema,
    useNormalPassword: z.boolean(),
  })
  .refine(
    (data) => {
      // If using normal password, password and confirmPassword must be provided and match
      if (data.useNormalPassword) {
        return (
          data.password !== undefined &&
          data.confirmPassword !== undefined &&
          data.password === data.confirmPassword
        );
      }
      // If using icon password, passwordIcons and confirmPasswordIcons must be provided and match
      if (data.passwordIcons === undefined || data.confirmPasswordIcons === undefined) {
        return false;
      }
      return (
        data.passwordIcons.length === data.confirmPasswordIcons.length &&
        data.passwordIcons.every((icon, index) => icon === data.confirmPasswordIcons![index])
      );
    },
    {
      message: 'Passwords do not match',
      path: ['confirmPassword'],
    }
  )
  .strict(); // Reject unexpected fields

// Login validation schema
export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().optional(),
    passwordIcons: z.array(z.string()).optional(),
    useNormalPassword: z.boolean(),
  })
  .refine(
    (data) => {
      // Either password or passwordIcons must be provided based on useNormalPassword
      if (data.useNormalPassword) {
        return data.password !== undefined && data.password.length > 0;
      }
      return data.passwordIcons !== undefined && data.passwordIcons.length >= VALIDATION_LIMITS.PASSWORD_ICONS_COUNT;
    },
    {
      message: 'Password is required',
      path: ['password'],
    }
  )
  .strict();

// Message validation schema
export const messageSchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(1, 'Message cannot be empty')
      .max(VALIDATION_LIMITS.MESSAGE_MAX_LENGTH, `Message must be ${VALIDATION_LIMITS.MESSAGE_MAX_LENGTH} characters or less`)
      .refine((content) => {
        // Reject messages that are only whitespace
        return content.trim().length > 0;
      }, 'Message cannot be only whitespace'),
    receiverId: z.string().min(1, 'Receiver ID is required').max(128, 'Receiver ID is too long'),
  })
  .strict();

// Search query validation schema
export const searchQuerySchema = z
  .string()
  .trim()
  .max(VALIDATION_LIMITS.SEARCH_QUERY_MAX_LENGTH, `Search query must be ${VALIDATION_LIMITS.SEARCH_QUERY_MAX_LENGTH} characters or less`)
  .refine((query) => {
    // Basic sanitization - reject potentially dangerous patterns
    const dangerousPatterns = /[<>\"'%;()&+{}[\]]/;
    return !dangerousPatterns.test(query);
  }, 'Search query contains invalid characters');

// Email verification request schema
export const emailVerificationSchema = z
  .object({
    email: emailSchema.optional(), // Optional if user is already logged in
  })
  .strict();

// Password reset request schema
export const passwordResetSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

// Contact request schema
export const contactRequestSchema = z
  .object({
    requestedId: z.string().min(1, 'User ID is required').max(128, 'User ID is too long'),
  })
  .strict();

// Connection request schema (for teachers/parents/students)
export const connectionRequestSchema = z
  .object({
    requestedId: z.string().min(1, 'User ID is required').max(128, 'User ID is too long'),
    requestorRole: userRoleSchema.optional(),
  })
  .strict();

/**
 * Sanitize string input
 */
export function sanitizeString(input: string): string {
  return input
    .trim()
    .replace(/\0/g, '') // Remove null bytes
    .replace(/[\x00-\x1F\x7F-\x9F]/g, ''); // Remove control characters (except newlines, tabs)
}

/**
 * Sanitize email input
 */
export function sanitizeEmail(input: string): string {
  return sanitizeString(input).toLowerCase();
}

/**
 * Sanitize and validate input using a Zod schema
 * When stripUnknown is false (default), uses strict mode to reject unexpected fields
 */
export function validateAndSanitize<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): {
  success: boolean;
  data?: T;
  errors?: z.ZodError;
  errorMessages?: string[];
} {
  try {
    // Zod schemas with .strict() automatically reject unknown fields
    const result = schema.parse(data);
    
    return {
      success: true,
      data: result,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map((err) => {
        const path = err.path.join('.');
        return path ? `${path}: ${err.message}` : err.message;
      });

      return {
        success: false,
        errors: error,
        errorMessages,
      };
    }
    throw error;
  }
}

/**
 * Validate signup input
 */
export function validateSignupInput(data: unknown) {
  return validateAndSanitize(signupSchema, data);
}

/**
 * Validate login input
 */
export function validateLoginInput(data: unknown) {
  return validateAndSanitize(loginSchema, data);
}

/**
 * Validate message input
 */
export function validateMessageInput(data: unknown) {
  return validateAndSanitize(messageSchema, data);
}

/**
 * Validate search query input
 */
export function validateSearchQuery(input: unknown): {
  success: boolean;
  data?: string;
  error?: string;
} {
  try {
    const sanitized = typeof input === 'string' ? sanitizeString(input) : String(input);
    const result = searchQuerySchema.parse(sanitized);
    return {
      success: true,
      data: result,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message || 'Invalid search query',
      };
    }
    return {
      success: false,
      error: 'Invalid search query',
    };
  }
}

/**
 * Type-safe validation result
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: z.ZodError; errorMessages: string[] };

/**
 * Extract type from Zod schema
 */
export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type MessageInput = z.infer<typeof messageSchema>;

