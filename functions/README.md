# Firebase Functions with Rate Limiting

This directory contains Firebase Cloud Functions with integrated rate limiting for all public endpoints.

## Setup

1. Install dependencies:
```bash
cd functions
npm install
```

2. Build TypeScript:
```bash
npm run build
```

3. Deploy functions:
```bash
npm run deploy
```

Or deploy from the root directory:
```bash
firebase deploy --only functions
```

## Rate Limiting Configuration

### Default Rate Limits

- **General API endpoints**: 100 requests per 15 minutes per IP/user
- **Authentication endpoints**: 5 requests per 15 minutes per IP/email
- **Rate limit response**: HTTP 429 (Too Many Requests) with retry information

### Customization

Rate limits can be customized in `src/index.ts`:

```typescript
const rateLimitConfig = {
  windowMs: 15 * 60 * 1000, // Time window in milliseconds
  max: 100, // Maximum requests per window
};
```

### Key Features

- **IP + User-based**: Combines IP address and user ID for rate limiting
- **Graceful 429 responses**: Returns helpful error messages with retry information
- **Standard headers**: Includes `RateLimit-*` headers in responses
- **Separate auth limits**: Stricter limits for authentication endpoints

## Endpoints

- `GET /health` - Health check (no rate limiting)
- `GET /api/public` - Example public endpoint
- `POST /api/auth/signup` - Signup endpoint (strict rate limiting)
- `POST /api/auth/login` - Login endpoint (strict rate limiting)

## Development

Run functions locally:
```bash
npm run serve
```

This starts the Firebase emulators. Functions will be available at:
- `http://localhost:5001/<project-id>/us-central1/api`

## Testing Rate Limits

You can test rate limiting by making multiple requests:

```bash
# Make multiple requests quickly
for i in {1..10}; do
  curl http://localhost:5001/your-project/us-central1/api/api/public
done
```

After exceeding the limit, you'll receive a 429 response with retry information.


