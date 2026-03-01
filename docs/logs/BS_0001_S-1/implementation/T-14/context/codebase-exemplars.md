# Codebase Exemplar Scout Report

Task: T-14 (QR code generation library)
Root: BS_0001_S-1
Date: 2026-01-10
Surface: API (utility library)

## Best exemplars found

### Exemplar 1: Stripe Integration Library

**Location:** `/apps/api/src/lib/stripe/`

**Purpose:** External SDK wrapper for Stripe with typed interfaces, error handling, and Cloudflare Workers compatibility.

**Relevant patterns:**

- **Structure:** Organized as a library module under `apps/api/src/lib/<vendor>/`
- **Entry point:** `index.ts` re-exports all public APIs for clean imports
- **Client factory:** `client.ts` provides typed factory function (`createStripeClient`)
- **Environment typing:** Uses interface for env vars (e.g., `StripeEnv`)
- **Error handling:** Dedicated `errors.ts` with classification, backoff, and formatting utilities
- **Re-exports:** Types from SDK re-exported for convenience

**Key code snippets:**

```typescript
// index.ts - Clean barrel exports
export { createStripeClient, webCrypto, type StripeEnv } from './client';
export {
  isRetryableError,
  isRateLimitError,
  getBackoffDelay,
  formatStripeError,
  type FormattedStripeError,
} from './errors';
export type { default as Stripe } from 'stripe';
```

```typescript
// client.ts - Factory with platform-specific config
export interface StripeEnv {
  STRIPE_SECRET_KEY: string;
}

export function createStripeClient(env: StripeEnv): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is required');
  }

  return new Stripe(env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(), // Cloudflare Workers compat
    maxNetworkRetries: 2,
    timeout: 20000,
  });
}
```

```typescript
// errors.ts - Error classification and backoff
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Stripe.errors.StripeConnectionError) return true;
  if (error instanceof Stripe.errors.StripeRateLimitError) return true;
  if (error instanceof Stripe.errors.StripeAPIError) return true;
  return false;
}

export function getBackoffDelay(
  attempt: number,
  baseDelayMs: number = 1000,
  maxDelayMs: number = 30000,
): number {
  const exponentialDelay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
  const jitter = Math.random() * 1000; // Prevent thundering herd
  return exponentialDelay + jitter;
}

export interface FormattedStripeError {
  code: string;
  message: string;
  type: string;
  retryable: boolean;
  declineCode?: string;
  param?: string;
}
```

**Why it matters for T-14:**

- Shows exact file structure pattern for wrapping external libraries
- Demonstrates typed environment interface pattern
- Shows how to handle platform-specific requirements (Cloudflare Workers)
- Provides error handling patterns with retry logic

---

### Exemplar 2: AWS Rekognition Integration

**Location:** `/apps/api/src/lib/rekognition/`

**Purpose:** AWS SDK wrapper with typed operations, comprehensive error handling, and retry classification.

**Relevant patterns:**

- **Same directory structure** as Stripe (`client.ts`, `errors.ts`, `index.ts`)
- **Typed results:** Custom interfaces wrapping SDK types (`IndexFacesResult`)
- **Error classification:** Separate retryable vs non-retryable error sets
- **Helper functions:** Domain-specific utilities (e.g., `getCollectionId`)

**Key code snippets:**

```typescript
// client.ts - Typed wrapper functions
export interface RekognitionEnv {
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
}

export interface IndexFacesResult {
  faceRecords: FaceRecord[];
  unindexedFaces: UnindexedFace[];
  faceModelVersion?: string;
}

export function createRekognitionClient(env: RekognitionEnv): RekognitionClient {
  return new RekognitionClient({
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

// Re-export SDK types for convenience
export type {
  FaceRecord,
  UnindexedFace,
  FaceDetail,
  // ... more types
} from '@aws-sdk/client-rekognition';
```

```typescript
// errors.ts - Set-based error classification
const NON_RETRYABLE_ERROR_NAMES = new Set([
  'InvalidImageFormatException',
  'ImageTooLargeException',
  'InvalidParameterException',
  // ...
]);

const RETRYABLE_ERROR_NAMES = new Set([
  'ProvisionedThroughputExceededException',
  'ThrottlingException',
  'InternalServerError',
  // ...
]);

export function isRetryableError(error: unknown): boolean {
  if (!isError(error)) return false;
  if (RETRYABLE_ERROR_NAMES.has(error.name)) return true;

  // Check AWS SDK metadata
  const awsError = error as { $metadata?: { httpStatusCode?: number } };
  if (awsError.$metadata?.httpStatusCode && awsError.$metadata.httpStatusCode >= 500) {
    return true;
  }

  return false;
}
```

**Why it matters for T-14:**

- Shows pattern for wrapping synchronous utility operations (QR generation)
- Demonstrates typed result interfaces
- Shows comprehensive error classification approach
- Pattern for helper functions alongside main operations

---

### Exemplar 3: LINE Client (Minimal Pattern)

**Location:** `/apps/api/src/lib/line/client.ts`

**Purpose:** Minimal SDK wrapper with just factory function and env typing.

**Relevant patterns:**

- **Simpler structure** for libraries with no special error handling needs
- **Single client.ts** when operations are straightforward
- **Typed env interface** consistently used

**Key code snippets:**

```typescript
// client.ts - Minimal wrapper
export interface LineEnv {
  LINE_CHANNEL_ACCESS_TOKEN: string;
}

export function createLineClient(env: LineEnv): messagingApi.MessagingApiClient {
  return new messagingApi.MessagingApiClient({
    channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
  });
}
```

**Why it matters for T-14:**

- Shows that simple libraries don't need complex structure
- QR generation (synchronous, no network) likely closer to this pattern
- Can expand to Stripe-like structure if error handling becomes complex

---

## Test patterns

### Location

- Co-located with source: `src/lib/<library>/<library>.test.ts`
- Separate fixtures: `tests/fixtures/` for reusable test data
- Config: `vitest.node.config.ts` for unit tests (Node.js environment)

### Structure

**Unit tests (Node.js environment):**

```typescript
// tests/stripe.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Stripe from 'stripe';
import { isRetryableError, getBackoffDelay, formatStripeError } from '../src/lib/stripe/errors';

describe('Error Classification', () => {
  describe('isRetryableError', () => {
    it('identifies rate limit errors as retryable', () => {
      const error = new Stripe.errors.StripeRateLimitError({
        message: 'Rate limit exceeded',
      });
      expect(isRetryableError(error)).toBe(true);
    });

    it('handles null/undefined', () => {
      expect(isRetryableError(null)).toBe(false);
      expect(isRetryableError(undefined)).toBe(false);
    });
  });
});

describe('Backoff Calculation', () => {
  it('calculates exponential backoff with base delay', () => {
    const delay1 = getBackoffDelay(1);
    const delay2 = getBackoffDelay(2);

    expect(delay1).toBeGreaterThanOrEqual(1000);
    expect(delay1).toBeLessThanOrEqual(2000);
    expect(delay2).toBeGreaterThanOrEqual(2000);
    expect(delay2).toBeLessThanOrEqual(3000);
  });

  it('caps at maximum delay', () => {
    const delay = getBackoffDelay(100);
    expect(delay).toBeLessThanOrEqual(45000);
  });
});
```

**Mocking external SDKs:**

```typescript
// Rekognition tests with AWS SDK mock
import { mockClient } from 'aws-sdk-client-mock';
import { RekognitionClient, IndexFacesCommand } from '@aws-sdk/client-rekognition';

const rekognitionMock = mockClient(RekognitionClient);

describe('Rekognition Client (Mocked)', () => {
  beforeEach(() => {
    rekognitionMock.reset();
  });

  it('indexFaces returns face records', async () => {
    rekognitionMock.on(IndexFacesCommand).resolves({
      FaceRecords: [{ Face: { FaceId: 'face-001', Confidence: 99.5 } }],
      UnindexedFaces: [],
    });

    const client = createRekognitionClient({
      /* env */
    });
    const result = await indexFaces(client, 'event-123', buffer, 'photo-456');

    expect(result.faceRecords).toHaveLength(1);
    expect(result.faceRecords[0].Face?.FaceId).toBe('face-001');
  });
});
```

### Assertions

- Error type guards: `expect(isRetryableError(error)).toBe(true)`
- Range checks for backoff: `toBeGreaterThanOrEqual`, `toBeLessThanOrEqual`
- Null/undefined safety: Always test edge cases
- Mock verification: `toHaveBeenCalledOnce()`, `toHaveBeenCalledWith()`

---

## Error handling patterns

### Classification approach

1. **Type guards** for specific error types (e.g., `isRetryableError`, `isCardError`)
2. **Set-based lookup** for known error names/codes (Rekognition pattern)
3. **HTTP status code checking** for SDK errors with metadata
4. **Always handle unknown errors** with fallback behavior

### Error response shape

From `stripe/errors.ts`:

```typescript
export interface FormattedStripeError {
  code: string; // Error code (e.g., "card_declined")
  message: string; // Human-readable message
  type: string; // Error type category
  retryable: boolean; // Whether safe to retry
  declineCode?: string; // Optional decline reason
  param?: string; // Optional invalid parameter name
}
```

### Retry logic

- **Exponential backoff** with jitter to prevent thundering herd
- **Max delay cap** to prevent excessive waits
- **Attempt-based calculation**: `baseDelay * 2^(attempt-1)`
- **Special handling** for rate limits (longer backoff)

### Utility error helper

From `utils/error.ts`:

```typescript
export function isError(value: unknown): value is Error {
  return (
    value instanceof Error ||
    (typeof value === 'object' && value !== null && 'name' in value && 'message' in value)
  );
}
```

---

## Integration patterns

### How external deps are wrapped

1. **Factory function pattern:**
   - Named `create<Service>Client(env: <Service>Env)`
   - Takes typed environment interface
   - Returns SDK client instance
   - Validates required env vars

2. **Environment typing:**
   - Interface per service (e.g., `StripeEnv`, `RekognitionEnv`)
   - Only includes vars needed by that service
   - Exported from client module

3. **Platform adaptations:**
   - Cloudflare Workers needs special config (Fetch API, Web Crypto)
   - Example: `Stripe.createFetchHttpClient()` for Workers
   - Documented in comments

4. **Operation wrappers:**
   - Wrap SDK methods with domain-specific functions
   - Add typed result interfaces
   - Handle common error cases
   - Example: `indexFaces()` wraps `IndexFacesCommand`

### Export conventions

**Barrel exports from index.ts:**

```typescript
// Clean public API
export { createClient, type ClientEnv } from './client';
export { operation1, operation2, type Result } from './operations';
export { isRetryableError, formatError } from './errors';
export type { SdkType } from 'external-sdk'; // Re-export SDK types
```

**Import usage:**

```typescript
// Consumers use barrel import
import { createStripeClient, isRetryableError } from '../lib/stripe';
```

### Testing conventions

- **Unit tests:** Node.js environment, mocked SDKs
- **Location:** `tests/<library>.test.ts` OR co-located `src/lib/<library>/<library>.test.ts`
- **Mocking:** Use `aws-sdk-client-mock`, `vitest.mock()`, or manual mocks
- **Fixtures:** Shared test data in `tests/fixtures/`

---

## Gaps

### [GAP] QR generation is simpler than these exemplars

- QR generation is **synchronous** (no network calls, no retry logic)
- No complex error classification needed
- Likely closer to LINE's minimal pattern than Stripe's complex one

### [GAP] No existing pure-utility exemplar

- All exemplars wrap external **network services** (Stripe, AWS, LINE)
- QR generation is a **pure utility** (input → output, no external state)
- May need simpler structure: just `qr.ts` or `qr/index.ts`

### [GAP] Unclear if QR lib needs client factory pattern

- Factory pattern (`createClient`) makes sense for stateful/configured clients
- QR generation might just be a function: `generateQrCode(data: string): Buffer`
- Need to check if chosen QR library requires configuration/state

### Recommendation for T-14

**Start with minimal pattern (LINE-style), expand if needed:**

```
/apps/api/src/lib/qr/
  index.ts          # Main QR generation function + types
  qr.test.ts        # Co-located tests
```

If QR library needs config or complex error handling, expand to:

```
/apps/api/src/lib/qr/
  index.ts          # Barrel exports
  generator.ts      # generateQr function
  errors.ts         # Error classification (if needed)
  qr.test.ts        # Tests
```

**Key decisions needed:**

1. Which QR library to use (impacts structure)
2. Does it need configuration? (impacts factory pattern need)
3. What error modes exist? (impacts error handling complexity)
