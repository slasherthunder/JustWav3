import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { validateRequest, signupSchema, loginSchema } from './validation';

// Initialize Firebase Admin
admin.initializeApp();

const app = express();

// Rate limiting configuration
const rateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP/user to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: 15 * 60, // seconds
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Custom key generator for IP + user-based rate limiting
  keyGenerator: (req: Request): string => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userId = (req as any).user?.uid || 'anonymous';
    return `${ip}:${userId}`;
  },
  // Custom handler for 429 responses
  handler: (req: Request, res: Response) => {
    const retryAfter = Math.ceil(
      (rateLimitConfig.windowMs - (Date.now() - (req as any).rateLimit.resetTime)) / 1000
    );
    res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter,
      retryAfterSeconds: Math.ceil(retryAfter),
    });
  },
};

// Strict rate limiting for authentication endpoints
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit to 5 requests per window for auth endpoints
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: 15 * 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const email = req.body?.email || 'anonymous';
    return `auth:${ip}:${email}`;
  },
  handler: (req: Request, res: Response) => {
    const retryAfter = Math.ceil(
      (15 * 60 * 1000 - (Date.now() - (req as any).rateLimit.resetTime)) / 1000
    );
    res.status(429).json({
      error: 'Too many authentication attempts',
      message: 'Rate limit exceeded for authentication. Please try again later.',
      retryAfter,
      retryAfterSeconds: Math.ceil(retryAfter),
    });
  },
  skipSuccessfulRequests: false, // Count all requests, not just failures
});

// General API rate limiting middleware
const apiRateLimit = rateLimit(rateLimitConfig);

// Apply rate limiting to all routes
app.use(apiRateLimit);

// Health check endpoint (no rate limiting)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Example public API endpoints with rate limiting
app.get('/api/public', (req, res) => {
  res.json({ message: 'This is a public endpoint with rate limiting' });
});

// Apply strict rate limiting to auth-related endpoints
app.use('/api/auth', authRateLimit);

app.post('/api/auth/signup', validateRequest(signupSchema), async (req, res) => {
  try {
    // req.body is now validated and sanitized
    // This would typically call Firebase Admin SDK to create user
    // For now, this is a placeholder
    res.json({ message: 'Signup endpoint (implement with Firebase Admin)', data: req.body });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', validateRequest(loginSchema), async (req, res) => {
  try {
    // req.body is now validated and sanitized
    // This would typically validate credentials
    // For now, this is a placeholder
    res.json({ message: 'Login endpoint (implement with Firebase Admin)', data: req.body });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Export the Express app as a Firebase Function
export const api = functions.https.onRequest(app);

