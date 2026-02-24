# Codebase Exemplars for T-17: Photo Queue Consumer for Rekognition Indexing

**Task**: Implement queue consumer that processes photo upload messages and calls AWS Rekognition IndexFaces API.

**Surface**: Jobs/Queue (Cloudflare Workers Queue Consumer)

---

## Exemplar 1: Queue Consumer Pattern (Photo Consumer)

**File**: `/apps/api/src/queue/photo-consumer.ts`

This is the **primary exemplar** - it's already implemented and is the exact file we need to study for T-17.

### Key Patterns to Follow

#### 1. Queue Handler Signature

```typescript
export async function queue(
  batch: MessageBatch<PhotoJob>,
  env: CloudflareBindings,
  ctx: ExecutionContext,
): Promise<void>;
```

**Pattern**: Queue handlers are standalone exported functions that receive batch, env, and execution context.

#### 2. Batch Processing with Rate Limiting

```typescript
// Get rate limiter DO (singleton) - uses RPC
const rateLimiterId = env.AWS_REKOGNITION_RATE_LIMITER.idFromName('global');
const rateLimiter = env.AWS_REKOGNITION_RATE_LIMITER.get(rateLimiterId);

// Reserve time slot for this batch
const { delay, intervalMs } = await rateLimiter.reserveBatch(batch.messages.length);

if (delay > 0) {
  await sleep(delay);
}
```

**Pattern**: For AWS API calls, coordinate with Durable Object rate limiter to avoid throttling.

#### 3. Paced Parallel Execution

```typescript
const results = await Promise.all(
  batch.messages.map(async (message, index): Promise<ProcessingResult> => {
    // Pace request initiation to stay within TPS limit
    if (index > 0) {
      await sleep(index * intervalMs);
    }
    // ... process message
  }),
);
```

**Pattern**:

- Start all promises in parallel
- Use indexed delays to pace initiation
- Collect results with [data, error] pattern (promises always resolve)

#### 4. Result Shape (No Thrown Errors)

```typescript
interface ProcessingResult {
  message: Message<PhotoJob>;
  data: IndexFacesResult | null;
  error: unknown;
}
```

**Pattern**: Never throw in map handlers. Always return `{ data, error }` so Promise.all succeeds.

#### 5. Individual Message Ack/Retry Logic

```typescript
for (const { message, data, error } of results) {
  if (error) {
    if (isThrottlingError(error)) {
      message.retry({ delaySeconds: getThrottleBackoffDelay(message.attempts) });
    } else if (isNonRetryableError(error)) {
      message.ack(); // Don't retry
    } else if (isRetryableError(error)) {
      message.retry({ delaySeconds: getBackoffDelay(message.attempts) });
    } else {
      message.retry({ delaySeconds: getBackoffDelay(message.attempts) });
    }
  } else {
    message.ack();
  }
}
```

**Pattern**:

- Process each result individually
- Use error classification helpers to decide ack vs retry
- Use exponential backoff based on `message.attempts`
- Default to retry for unknown errors (safe fallback)

#### 6. R2 Fetch Pattern

```typescript
const object = await env.PHOTOS_BUCKET.get(job.r2_key);

if (!object) {
  return {
    message,
    data: null,
    error: new Error(`Image not found: ${job.r2_key}`),
  };
}

const imageBytes = await object.arrayBuffer();
```

**Pattern**:

- Check for null (object not found)
- Convert to ArrayBuffer for AWS SDK
- Handle missing objects as errors, not exceptions

---

## Exemplar 2: AWS SDK Integration (Rekognition Client)

**Files**:

- `/apps/api/src/lib/rekognition/client.ts` - SDK wrapper
- `/apps/api/src/lib/rekognition/errors.ts` - Error classification
- `/apps/api/src/lib/rekognition/index.ts` - Clean exports

### Key Patterns to Follow

#### 1. Client Creation (Singleton per Batch)

```typescript
import { RekognitionClient } from '@aws-sdk/client-rekognition';

export function createRekognitionClient(env: RekognitionEnv): RekognitionClient {
  return new RekognitionClient({
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

// In consumer:
const client = createRekognitionClient({
  AWS_ACCESS_KEY_ID: env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY,
  AWS_REGION: env.AWS_REGION,
});
```

**Pattern**:

- Create client once per batch (not per message)
- Pass env bindings, not entire env object
- Keep client creation pure (testable)

#### 2. Command Pattern (AWS SDK v3)

```typescript
import { IndexFacesCommand } from '@aws-sdk/client-rekognition';

export async function indexFaces(
  client: RekognitionClient,
  eventId: string,
  imageBytes: ArrayBuffer,
  photoId: string,
): Promise<IndexFacesResult> {
  const collectionId = getCollectionId(eventId);

  const command = new IndexFacesCommand({
    CollectionId: collectionId,
    Image: {
      Bytes: new Uint8Array(imageBytes),
    },
    ExternalImageId: photoId,
    DetectionAttributes: ['ALL'],
    MaxFaces: 100,
    QualityFilter: 'AUTO',
  });

  const response = await client.send(command);

  return {
    faceRecords: response.FaceRecords ?? [],
    unindexedFaces: response.UnindexedFaces ?? [],
    faceModelVersion: response.FaceModelVersion,
  };
}
```

**Pattern**:

- Create command object with typed parameters
- Send via client
- Map SDK response to our domain types
- Always provide defaults for optional arrays (`?? []`)

#### 3. Error Classification

```typescript
// errors.ts

// Non-retryable errors (bad input, won't succeed on retry)
const NON_RETRYABLE_ERROR_NAMES = new Set([
  'InvalidImageFormatException',
  'ImageTooLargeException',
  'InvalidParameterException',
  'ResourceNotFoundException',
  'AccessDeniedException',
]);

// Retryable errors (transient failures)
const RETRYABLE_ERROR_NAMES = new Set([
  'ProvisionedThroughputExceededException',
  'ThrottlingException',
  'InternalServerError',
  'ServiceUnavailableException',
  'TimeoutError',
]);

export function isNonRetryableError(error: unknown): boolean {
  if (!isError(error)) return false;
  if (NON_RETRYABLE_ERROR_NAMES.has(error.name)) return true;

  const awsError = error as { $metadata?: { httpStatusCode?: number } };
  const status = awsError.$metadata?.httpStatusCode;

  // 4xx except 429
  if (status && status >= 400 && status < 500 && status !== 429) {
    return true;
  }
  return false;
}

export function isRetryableError(error: unknown): boolean {
  if (!isError(error)) return false;
  if (RETRYABLE_ERROR_NAMES.has(error.name)) return true;

  const awsError = error as { $metadata?: { httpStatusCode?: number } };

  // 5xx server errors
  if (awsError.$metadata?.httpStatusCode && awsError.$metadata.httpStatusCode >= 500) {
    return true;
  }

  // 429 rate limited
  if (awsError.$metadata?.httpStatusCode === 429) {
    return true;
  }

  return false;
}
```

**Pattern**:

- Classify by error name first
- Fall back to HTTP status code
- Use type guards (`isError`)
- Check `$metadata.httpStatusCode` (AWS SDK v3 shape)

#### 4. Exponential Backoff with Jitter

```typescript
export function getBackoffDelay(
  attempts: number,
  baseDelaySeconds = 2,
  maxDelaySeconds = 300,
): number {
  // Exponential: 2, 4, 8, 16, 32, 64, 128, 256, 300 (capped)
  const exponentialDelay = baseDelaySeconds * Math.pow(2, attempts - 1);
  const cappedDelay = Math.min(exponentialDelay, maxDelaySeconds);

  // Add jitter (±20%) to prevent thundering herd
  const jitter = cappedDelay * 0.2 * (Math.random() - 0.5);

  return Math.round(cappedDelay + jitter);
}

export function getThrottleBackoffDelay(attempts: number): number {
  // Start at 5 seconds for throttling (longer than normal errors)
  return getBackoffDelay(attempts, 5, 300);
}
```

**Pattern**:

- Exponential backoff with power of 2
- Cap at max delay (5 minutes)
- Add jitter to avoid synchronized retries
- Longer base delay for throttling errors

---

## Exemplar 3: Durable Object Rate Limiter

**File**: `/apps/api/src/durable-objects/rate-limiter.ts`

### Key Patterns to Follow

#### 1. Durable Object Class (RPC-enabled)

```typescript
import { DurableObject } from 'cloudflare:workers';

export class RekognitionRateLimiter extends DurableObject {
  private lastBatchEndTime: number = 0;

  async reserveBatch(batchSize: number): Promise<RateLimiterResponse> {
    const now = Date.now();
    const batchDuration = batchSize * SAFE_INTERVAL_MS;
    const delay = Math.max(0, this.lastBatchEndTime - now);

    const slotStart = now + delay;
    this.lastBatchEndTime = slotStart + batchDuration;

    return { delay, intervalMs: SAFE_INTERVAL_MS };
  }

  async reportThrottle(additionalDelayMs = 1000): Promise<void> {
    const now = Date.now();
    this.lastBatchEndTime = Math.max(this.lastBatchEndTime, now) + additionalDelayMs;
  }
}
```

**Pattern**:

- Use in-memory state (no storage needed for rate limiting)
- RPC methods are async and return typed objects
- Simple time-slot reservation algorithm
- Throttle reporting adjusts future delay

#### 2. RPC Invocation from Consumer

```typescript
// Get singleton DO
const rateLimiterId = env.AWS_REKOGNITION_RATE_LIMITER.idFromName('global');
const rateLimiter = env.AWS_REKOGNITION_RATE_LIMITER.get(rateLimiterId);

// Call methods directly (RPC)
const { delay, intervalMs } = await rateLimiter.reserveBatch(batch.messages.length);
```

**Pattern**:

- Use `.idFromName("global")` for singleton
- Call methods directly (no fetch/JSON RPC)
- Requires `compatibility_date >= 2024-04-03`

---

## Exemplar 4: Worker Export with Queue Handler

**File**: `/apps/api/src/index.ts`

```typescript
import { queue } from './queue/photo-consumer';

export default {
  fetch: app.fetch,
  queue,
};
```

**Pattern**:

- Export both `fetch` (HTTP) and `queue` (queue consumer) handlers
- Queue handler is imported and re-exported
- No wrapping needed - direct function export

---

## Test Patterns

### 1. AWS SDK Mocking (Vitest + aws-sdk-client-mock)

**File**: `/apps/api/src/lib/rekognition/rekognition.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { RekognitionClient, IndexFacesCommand } from '@aws-sdk/client-rekognition';

const rekognitionMock = mockClient(RekognitionClient);

describe('Rekognition Client', () => {
  beforeEach(() => {
    rekognitionMock.reset();
  });

  afterAll(() => {
    rekognitionMock.restore();
  });

  it('indexes faces successfully', async () => {
    rekognitionMock.on(IndexFacesCommand).resolves({
      FaceRecords: [
        {
          Face: {
            FaceId: 'face-001',
            BoundingBox: { Width: 0.25, Height: 0.3, Left: 0.1, Top: 0.15 },
            Confidence: 99.5,
          },
        },
      ],
      UnindexedFaces: [],
    });

    const client = createRekognitionClient({
      AWS_ACCESS_KEY_ID: 'test-key',
      AWS_SECRET_ACCESS_KEY: 'test-secret',
      AWS_REGION: 'us-west-2',
    });

    const result = await indexFaces(client, 'event-123', new ArrayBuffer(100), 'photo-456');

    expect(result.faceRecords).toHaveLength(1);
    expect(result.faceRecords[0].Face?.FaceId).toBe('face-001');
  });
});
```

**Pattern**:

- Use `aws-sdk-client-mock` for SDK mocking
- Mock at command level, not client level
- Reset before each test, restore after all
- Mock resolves/rejects, not implementation

### 2. Error Classification Tests

```typescript
it('identifies throttling errors', () => {
  const throttleError = new Error('Rate exceeded');
  throttleError.name = 'ThrottlingException';

  expect(isThrottlingError(throttleError)).toBe(true);
});

it('identifies non-retryable errors', () => {
  const invalidImageError = new Error('Invalid image');
  invalidImageError.name = 'InvalidImageFormatException';

  expect(isNonRetryableError(invalidImageError)).toBe(true);
});
```

**Pattern**:

- Test error classification logic in isolation
- Create mock errors with AWS SDK error shapes
- Test both error name and HTTP status code paths

---

## Validation & Error Response Patterns (for Queue Consumer)

### 1. Logging Pattern

```typescript
console.error(`[Queue] Throttled: ${job.photo_id} - ${errorMessage}`);
console.error(`[Queue] Non-retryable: ${job.photo_id} - ${errorMessage}`);
console.error(`[Queue] Retryable: ${job.photo_id} - ${errorMessage}`);
```

**Pattern**:

- Prefix with `[Queue]` for easy filtering
- Include job ID (photo_id) for tracking
- Use formatted error messages

### 2. Error Message Formatting

```typescript
export function formatErrorMessage(error: unknown): string {
  if (!isError(error)) {
    return String(error);
  }

  const awsError = error as {
    name: string;
    message: string;
    code?: string;
    $metadata?: { httpStatusCode?: number };
  };

  const parts: string[] = [awsError.name];

  if (awsError.code && awsError.code !== awsError.name) {
    parts.push(`(${awsError.code})`);
  }

  if (awsError.$metadata?.httpStatusCode) {
    parts.push(`[${awsError.$metadata.httpStatusCode}]`);
  }

  parts.push(':', awsError.message);

  return parts.join(' ');
}
```

**Pattern**:

- Extract structured info from AWS errors
- Format as: `ErrorName (code) [statusCode]: message`
- Handle non-Error values gracefully

---

## Summary: What to Copy

### For T-17 Queue Consumer Implementation:

1. **Queue handler signature**: `queue(batch, env, ctx) => Promise<void>`
2. **Rate limiting**: Use Durable Object RPC for AWS API coordination
3. **Batch processing**: Paced parallel execution with indexed delays
4. **Result shape**: `{ message, data, error }` - never throw in map
5. **Ack/retry logic**: Individual message handling with error classification
6. **R2 integration**: `env.BUCKET.get(key)` → check null → `.arrayBuffer()`
7. **AWS SDK patterns**: Create client once, use Command pattern, handle errors
8. **Error classification**: Sets of error names + HTTP status codes
9. **Backoff**: Exponential with jitter, longer for throttling
10. **Testing**: Mock AWS SDK at command level with `aws-sdk-client-mock`

### Files to Reference During Implementation:

- `/apps/api/src/queue/photo-consumer.ts` - **Main exemplar**
- `/apps/api/src/lib/rekognition/client.ts` - AWS SDK patterns
- `/apps/api/src/lib/rekognition/errors.ts` - Error handling
- `/apps/api/src/durable-objects/rate-limiter.ts` - Rate limiting
- `/apps/api/src/lib/rekognition/rekognition.test.ts` - Test patterns
- `/apps/api/src/types/photo-job.ts` - Job type definition
