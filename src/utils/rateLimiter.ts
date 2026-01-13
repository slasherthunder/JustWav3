/**
 * Client-side rate limiter utility
 * Provides in-memory rate limiting for Firebase operations
 * This is a client-side safety layer - server-side rate limiting is the primary protection
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
  requests: number[];
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
}

class RateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private configs: Map<string, RateLimitConfig> = new Map();

  /**
   * Configure rate limiting for a specific endpoint
   */
  configure(key: string, config: RateLimitConfig): void {
    this.configs.set(key, config);
  }

  /**
   * Check if a request should be allowed
   * @param key - Unique key for rate limiting (e.g., 'auth:signup:user@example.com')
   * @param identifier - Additional identifier (IP, user ID, etc.)
   * @returns Object with allowed status and retry information
   */
  check(key: string, identifier?: string): {
    allowed: boolean;
    retryAfter?: number;
    remaining?: number;
  } {
    const fullKey = identifier ? `${key}:${identifier}` : key;
    const config = this.configs.get(key);
    
    if (!config) {
      // No rate limiting configured for this key
      return { allowed: true };
    }

    const now = Date.now();
    let entry = this.store.get(fullKey);

    // Clean up old entries
    if (entry && entry.resetTime < now) {
      this.store.delete(fullKey);
      entry = undefined;
    }

    if (!entry) {
      // First request or window expired
      entry = {
        count: 1,
        resetTime: now + config.windowMs,
        requests: [now],
      };
      this.store.set(fullKey, entry);
      return {
        allowed: true,
        remaining: config.maxRequests - 1,
      };
    }

    // Remove requests outside the window
    entry.requests = entry.requests.filter((time) => now - time < config.windowMs);
    entry.count = entry.requests.length;

    if (entry.count >= config.maxRequests) {
      // Rate limit exceeded
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      return {
        allowed: false,
        retryAfter,
      };
    }

    // Allow request and increment
    entry.requests.push(now);
    entry.count = entry.requests.length;
    this.store.set(fullKey, entry);

    return {
      allowed: true,
      remaining: config.maxRequests - entry.count,
    };
  }

  /**
   * Reset rate limit for a key (useful for testing or manual resets)
   */
  reset(key: string, identifier?: string): void {
    const fullKey = identifier ? `${key}:${identifier}` : key;
    this.store.delete(fullKey);
  }

  /**
   * Clear all rate limit entries
   */
  clear(): void {
    this.store.clear();
  }
}

// Create singleton instance
const rateLimiter = new RateLimiter();

// Configure default rate limits
rateLimiter.configure('auth:signup', {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 signup attempts per 15 minutes
});

rateLimiter.configure('auth:login', {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10, // 10 login attempts per 15 minutes
});

rateLimiter.configure('auth:passwordReset', {
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 3, // 3 password reset requests per hour
});

rateLimiter.configure('auth:emailVerification', {
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 5, // 5 verification emails per hour
});

rateLimiter.configure('api:firestore:write', {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60, // 60 writes per minute
});

rateLimiter.configure('api:firestore:read', {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 reads per minute
});

/**
 * Rate limit wrapper for async functions
 */
export async function withRateLimit<T>(
  key: string,
  fn: () => Promise<T>,
  identifier?: string
): Promise<T> {
  const result = rateLimiter.check(key, identifier);
  
  if (!result.allowed) {
    const error: any = new Error('Rate limit exceeded. Please try again later.');
    error.code = 'rate-limit-exceeded';
    error.retryAfter = result.retryAfter;
    error.status = 429;
    throw error;
  }

  try {
    return await fn();
  } catch (error: any) {
    // On certain errors, you might want to not count them against rate limit
    // For now, we count all requests
    throw error;
  }
}

/**
 * Get rate limit status for a key
 */
export function getRateLimitStatus(key: string, identifier?: string): {
  allowed: boolean;
  retryAfter?: number;
  remaining?: number;
} {
  return rateLimiter.check(key, identifier);
}

/**
 * Reset rate limit for a key (useful for testing)
 */
export function resetRateLimit(key: string, identifier?: string): void {
  rateLimiter.reset(key, identifier);
}

export default rateLimiter;


