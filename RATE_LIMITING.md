# Rate Limiting Implementation

This document describes the rate limiting implementation for JustWav3.

## Overview

Rate limiting is implemented at two levels:
1. **Server-side**: Firebase Cloud Functions with express-rate-limit middleware
2. **Client-side**: In-memory rate limiter for Firebase operations (safety layer)

## Server-Side Rate Limiting (Firebase Functions)

### Configuration

Located in `functions/src/index.ts`:

- **General endpoints**: 100 requests per 15 minutes per IP/user combination
- **Authentication endpoints**: 5 requests per 15 minutes per IP/email combination
- **Response format**: HTTP 429 with JSON error message and retry information

### Key Features

- **IP + User-based**: Uses combination of IP address and user identifier
- **Graceful 429 responses**: Includes retry-after information
- **Standard headers**: Returns `RateLimit-*` headers
- **Separate auth limits**: Stricter limits for authentication endpoints

### Deployment

```bash
cd functions
npm install
npm run build
npm run deploy
```

## Client-Side Rate Limiting

### Configuration

Located in `src/utils/rateLimiter.ts`:

- **Signup**: 5 attempts per 15 minutes
- **Login**: 10 attempts per 15 minutes
- **Password Reset**: 3 attempts per hour
- **Email Verification**: 5 attempts per hour
- **Firestore Writes**: 60 per minute
- **Firestore Reads**: 100 per minute

### Usage

```typescript
import { withRateLimit } from '../utils/rateLimiter';

// Wrap async function with rate limiting
await withRateLimit('auth:signup', async () => {
  // Your Firebase operation
  await createUserWithEmailAndPassword(auth, email, password);
}, email); // Optional identifier (email, IP, etc.)
```

### Error Handling

Rate limit errors include:
- `error.code`: 'rate-limit-exceeded'
- `error.retryAfter`: Seconds until retry is allowed
- `error.status`: 429

## Integration Points

Rate limiting is integrated into:

1. **AuthContext** (`src/contexts/AuthContext.tsx`):
   - `signup()` - Rate limited to 5 attempts per 15 minutes
   - `login()` - Rate limited to 10 attempts per 15 minutes
   - `sendVerificationEmail()` - Rate limited to 5 attempts per hour

2. **Firebase Functions** (`functions/src/index.ts`):
   - All public API endpoints
   - Authentication endpoints with stricter limits

## Default Limits Summary

| Endpoint/Operation | Limit | Window |
|-------------------|-------|--------|
| General API | 100 requests | 15 minutes |
| Auth (Signup/Login) | 5 requests | 15 minutes |
| Email Verification | 5 requests | 1 hour |
| Password Reset | 3 requests | 1 hour |
| Firestore Writes | 60 requests | 1 minute |
| Firestore Reads | 100 requests | 1 minute |

## Customization

### Adjusting Server-Side Limits

Edit `functions/src/index.ts`:

```typescript
const rateLimitConfig = {
  windowMs: 15 * 60 * 1000, // Adjust window
  max: 100, // Adjust max requests
};
```

### Adjusting Client-Side Limits

Edit `src/utils/rateLimiter.ts`:

```typescript
rateLimiter.configure('auth:signup', {
  windowMs: 15 * 60 * 1000, // Adjust window
  maxRequests: 5, // Adjust max requests
});
```

## Testing

### Server-Side Testing

```bash
# Start emulators
cd functions
npm run serve

# Test rate limiting
for i in {1..10}; do
  curl http://localhost:5001/your-project/us-central1/api/api/public
done
```

### Client-Side Testing

The client-side rate limiter is automatically tested when using authentication functions. Rate limit errors will be thrown and can be caught in your error handlers.

## Notes

- Client-side rate limiting is a **safety layer** only
- Server-side rate limiting is the **primary protection**
- Firebase Authentication endpoints are managed by Google and have their own rate limits
- Rate limits reset after the time window expires
- Rate limit status is stored in memory (client-side) and may reset on page refresh

## Future Enhancements

Potential improvements:
- Persistent rate limit storage (localStorage/IndexedDB)
- Distributed rate limiting (Redis) for server-side
- Adaptive rate limiting based on user behavior
- Rate limit status API endpoint
- Rate limit dashboard/monitoring


