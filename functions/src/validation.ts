/**
 * Validation middleware for Firebase Functions
 * Uses Zod for schema-based validation
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

// Re-export validation schemas (or define server-side versions)
export const signupSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(6).max(128).optional(),
  role: z.enum(['parent', 'student', 'teacher']),
}).strict();

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1),
}).strict();

export const messageSchema = z.object({
  content: z.string().min(1).max(5000),
  receiverId: z.string().min(1).max(128),
}).strict();

/**
 * Validation middleware factory
 */
export function validateRequest(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Validate request body and reject unknown fields
      const validated = schema.parse(req.body);
      req.body = validated; // Replace with validated data
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors.map((err) => {
          const path = err.path.join('.');
          return path ? `${path}: ${err.message}` : err.message;
        });

        res.status(400).json({
          error: 'Validation failed',
          message: 'Invalid input data',
          details: errorMessages,
        });
        return;
      }
      
      res.status(500).json({
        error: 'Internal server error',
        message: 'An error occurred during validation',
      });
      return;
    }
  };
}

/**
 * Sanitize string input (server-side)
 */
export function sanitizeString(input: string): string {
  return input
    .trim()
    .replace(/\0/g, '') // Remove null bytes
    .replace(/[\x00-\x1F\x7F-\x9F]/g, ''); // Remove control characters
}


