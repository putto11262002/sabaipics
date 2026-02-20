/**
 * Upload Consumer Tests
 *
 * Tests the upload processing queue consumer with mocked DB/Sentry/normalize/exif
 * and real R2 via miniflare. Runs in workerd via @cloudflare/vitest-pool-workers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import { ok, err, ResultAsync } from 'neverthrow';
import type { R2EventMessage } from '../src/types/r2-event';
import { PHOTO_MAX_FILE_SIZE } from '../src/lib/upload/constants';

// =============================================================================
// Module Mocks — vi.hoisted() ensures these exist before hoisted vi.mock() runs
// =============================================================================

const {
  mockFindFirstIntent,
  mockFindFirstPhotoLut,
  mockUpdateWhere,
  mockUpdateSet,
  mockUpdateFn,
  mockTxTransaction,
  mockNormalizeCfImages,
  mockApplyPostProcess,
  mockExtractExif,
} = vi.hoisted(() => {
  const mockUpdateWhere = vi.fn().mockResolvedValue([]);
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockUpdateFn = vi.fn().mockReturnValue({ set: mockUpdateSet });
  return {
    mockFindFirstIntent: vi.fn(),
    mockFindFirstPhotoLut: vi.fn(),
    mockUpdateWhere,
    mockUpdateSet,
    mockUpdateFn,
    mockTxTransaction: vi.fn(),
    mockNormalizeCfImages: vi.fn(),
    mockApplyPostProcess: vi.fn(),
    mockExtractExif: vi.fn(),
  };
});

vi.mock('drizzle-orm', () => {
  const sqlTag: any = (...args: any[]) => ({ __sql: true, args });
  sqlTag.raw = vi.fn((s: string) => s);
  return {
    eq: vi.fn((...args: any[]) => ({ __op: 'eq', args })),
    and: vi.fn((...args: any[]) => ({ __op: 'and', args })),
    gt: vi.fn((...args: any[]) => ({ __op: 'gt', args })),
    asc: vi.fn((...args: any[]) => ({ __op: 'asc', args })),
    sql: sqlTag,
  };
});

vi.mock('@/db', () => {
  const createMockDb = () => ({
    query: {
      uploadIntents: { findFirst: mockFindFirstIntent },
      photoLuts: { findFirst: mockFindFirstPhotoLut },
    },
    update: mockUpdateFn,
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  });

  return {
    createDb: vi.fn(() => createMockDb()),
    createDbTx: vi.fn(() => ({ transaction: mockTxTransaction })),
    // Schema table stubs (only shape matters; drizzle-orm is also mocked)
    uploadIntents: { id: 'id', r2Key: 'r2_key', status: 'status' },
    activeEvents: { id: 'id', settings: 'settings' },
    events: { id: 'id', settings: 'settings' },
    photoLuts: { id: 'id', photographerId: 'photographer_id' },
    photos: { id: 'id' },
    creditLedger: { photographerId: 'photographer_id', amount: 'amount', expiresAt: 'expires_at' },
    photographers: { id: 'id' },
  };
});

vi.mock('@sentry/cloudflare', () => ({
  startSpan: vi.fn((_opts: any, cb: any) => cb({ setAttribute: vi.fn() })),
  withScope: vi.fn((cb: any) =>
    cb({ setTag: vi.fn(), setExtra: vi.fn(), setLevel: vi.fn() }),
  ),
  captureMessage: vi.fn(),
}));

vi.mock('@/api/src/lib/images/normalize', () => ({
  normalizeWithCfImages: mockNormalizeCfImages,
  applyPostProcessPhoton: mockApplyPostProcess,
}));

vi.mock('@/api/src/lib/images/exif', () => ({
  extractExif: mockExtractExif,
}));

// Import the queue handler AFTER mocks are declared
import { queue } from '../src/queue/upload-consumer';
import * as Sentry from '@sentry/cloudflare';

// =============================================================================
// Test Data
// =============================================================================

// Minimal JPEG: valid magic bytes + SOF0 with 100×100 dimensions (18 bytes)
const VALID_JPEG_100x100 = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, // SOI + minimal APP0 (length=2)
  0xff, 0xc0, 0x00, 0x0b, 0x08, // SOF0 marker
  0x00, 0x64, 0x00, 0x64, // height=100, width=100
  0x01, 0x01, 0x11, 0x00, // 1 component
]);

// JPEG with dimensions exceeding 25 MP (5001×5001 = 25,010,001)
const OVERSIZED_DIM_JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02,
  0xff, 0xc0, 0x00, 0x0b, 0x08,
  0x13, 0x89, 0x13, 0x89, // height=5001, width=5001
  0x01, 0x01, 0x11, 0x00,
]);

// Valid JPEG magic bytes but no SOF marker → dimension parse fails
const NO_SOF_JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, // SOI + minimal APP0
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // padding (no SOF)
]);

// Invalid magic bytes
const INVALID_MAGIC = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);

// =============================================================================
// Helpers
// =============================================================================

const TEST_EVENT_ID = 'evt-test-1234';
const TEST_PHOTOGRAPHER_ID = 'phot-test-5678';
const TEST_R2_KEY = `uploads/${TEST_EVENT_ID}/test-file.jpg`;
const TEST_INTENT_ID = 'intent-test-9999';

function makeR2Event(overrides?: Partial<R2EventMessage>): R2EventMessage {
  return {
    account: 'test-account',
    action: 'PutObject',
    bucket: 'framefast-photos-dev',
    object: { key: TEST_R2_KEY, size: 1000, eTag: 'test-etag' },
    eventTime: new Date().toISOString(),
    ...overrides,
  };
}

function makePendingIntent(overrides?: Record<string, any>) {
  return {
    id: TEST_INTENT_ID,
    photographerId: TEST_PHOTOGRAPHER_ID,
    eventId: TEST_EVENT_ID,
    r2Key: TEST_R2_KEY,
    contentType: 'image/jpeg',
    contentLength: 1000,
    status: 'pending',
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(), // 1 hour from now
    ...overrides,
  };
}

type MockMessage<T> = {
  readonly id: string;
  readonly timestamp: Date;
  readonly body: T;
  readonly attempts: number;
  ack: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
};

function createMockMessage(
  body: R2EventMessage,
  id?: string,
): MockMessage<R2EventMessage> {
  return {
    id: id ?? crypto.randomUUID(),
    timestamp: new Date(),
    body,
    attempts: 1,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

function createMockBatch(
  messages: MockMessage<R2EventMessage>[],
): MessageBatch<R2EventMessage> {
  return {
    queue: 'upload-processing-dev',
    messages: messages as unknown as Message<R2EventMessage>[],
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('upload-consumer', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Re-initialize the update chain after clearAllMocks
    mockUpdateWhere.mockResolvedValue([]);
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateFn.mockReturnValue({ set: mockUpdateSet });

    // Default mock behaviors
    mockFindFirstIntent.mockResolvedValue(makePendingIntent());
    mockNormalizeCfImages.mockReturnValue(
      ResultAsync.fromSafePromise(
        Promise.resolve({ bytes: new ArrayBuffer(1000), width: 800, height: 600 }),
      ),
    );
    mockApplyPostProcess.mockReturnValue(
      ok({ bytes: new ArrayBuffer(1000), width: 800, height: 600 }),
    );
    mockExtractExif.mockReturnValue(ok(null));
    mockTxTransaction.mockResolvedValue({
      id: 'photo-id-success',
      eventId: TEST_EVENT_ID,
      r2Key: `${TEST_EVENT_ID}/photo-id-success.jpg`,
    });

    // Seed R2 with valid JPEG
    await env.PHOTOS_BUCKET.put(TEST_R2_KEY, VALID_JPEG_100x100);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Group 1: Message Filtering
  // ---------------------------------------------------------------------------

  describe('message filtering', () => {
    it('1.1 — skips non-PutObject actions', async () => {
      const msg = createMockMessage(makeR2Event({ action: 'DeleteObject' }));
      const batch = createMockBatch([msg]);

      await queue(batch, env as any, {} as ExecutionContext);

      expect(msg.ack).toHaveBeenCalled();
      expect(mockFindFirstIntent).not.toHaveBeenCalled();
    });

    it('1.2 — skips non-uploads/ prefix', async () => {
      const msg = createMockMessage(
        makeR2Event({ object: { key: 'other/file.jpg', size: 1000, eTag: 'x' } }),
      );
      const batch = createMockBatch([msg]);

      await queue(batch, env as any, {} as ExecutionContext);

      expect(msg.ack).toHaveBeenCalled();
      expect(mockFindFirstIntent).not.toHaveBeenCalled();
    });

    it('1.3 — processes PutObject with uploads/ prefix', async () => {
      const msg = createMockMessage(makeR2Event());
      const batch = createMockBatch([msg]);

      await queue(batch, env as any, {} as ExecutionContext);

      expect(mockFindFirstIntent).toHaveBeenCalled();
    });

    it('1.4 — processes CompleteMultipartUpload', async () => {
      const msg = createMockMessage(
        makeR2Event({ action: 'CompleteMultipartUpload' }),
      );
      const batch = createMockBatch([msg]);

      await queue(batch, env as any, {} as ExecutionContext);

      expect(mockFindFirstIntent).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Group 2: Idempotency Guard
  // ---------------------------------------------------------------------------

  describe('idempotency guard', () => {
    it('2.1 — skips completed intent', async () => {
      mockFindFirstIntent.mockResolvedValue(makePendingIntent({ status: 'completed' }));
      const headSpy = vi.spyOn(env.PHOTOS_BUCKET, 'head');
      const msg = createMockMessage(makeR2Event());
      const batch = createMockBatch([msg]);

      await queue(batch, env as any, {} as ExecutionContext);

      expect(msg.ack).toHaveBeenCalled();
      expect(headSpy).not.toHaveBeenCalled();
    });

    it('2.2 — skips failed intent', async () => {
      mockFindFirstIntent.mockResolvedValue(makePendingIntent({ status: 'failed' }));
      const headSpy = vi.spyOn(env.PHOTOS_BUCKET, 'head');
      const msg = createMockMessage(makeR2Event());
      const batch = createMockBatch([msg]);

      await queue(batch, env as any, {} as ExecutionContext);

      expect(msg.ack).toHaveBeenCalled();
      expect(headSpy).not.toHaveBeenCalled();
    });

    it('2.3 — skips expired intent', async () => {
      mockFindFirstIntent.mockResolvedValue(makePendingIntent({ status: 'expired' }));
      const headSpy = vi.spyOn(env.PHOTOS_BUCKET, 'head');
      const msg = createMockMessage(makeR2Event());
      const batch = createMockBatch([msg]);

      await queue(batch, env as any, {} as ExecutionContext);

      expect(msg.ack).toHaveBeenCalled();
      expect(headSpy).not.toHaveBeenCalled();
    });

    it('2.4 — processes pending intent', async () => {
      const headSpy = vi.spyOn(env.PHOTOS_BUCKET, 'head');
      const msg = createMockMessage(makeR2Event());
      const batch = createMockBatch([msg]);

      await queue(batch, env as any, {} as ExecutionContext);

      expect(headSpy).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Group 3: Orphan Handling
  // ---------------------------------------------------------------------------

  describe('orphan handling', () => {
    it('3.1 — no matching intent → orphan ack', async () => {
      mockFindFirstIntent.mockResolvedValue(null);
      const msg = createMockMessage(makeR2Event());
      const batch = createMockBatch([msg]);

      await queue(batch, env as any, {} as ExecutionContext);

      expect(msg.ack).toHaveBeenCalled();
      // No intent update since there's no intent
      expect(mockUpdateSet).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Group 4: Intent Expiry
  // ---------------------------------------------------------------------------

  describe('intent expiry', () => {
    it('4.1 — expired intent is marked expired', async () => {
      mockFindFirstIntent.mockResolvedValue(
        makePendingIntent({
          expiresAt: new Date(Date.now() - 3_600_000).toISOString(), // 1 hour ago
        }),
      );
      const msg = createMockMessage(makeR2Event());
      const batch = createMockBatch([msg]);

      await queue(batch, env as any, {} as ExecutionContext);

      expect(msg.ack).toHaveBeenCalled();
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'expired', retryable: false }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Group 5: File Validation (real R2)
  // ---------------------------------------------------------------------------

  describe('file validation', () => {
    it('5.1 — R2 HEAD returns null → r2 error', async () => {
      // Don't seed R2 — use a key that doesn't exist
      const uniqueKey = `uploads/${TEST_EVENT_ID}/nonexistent.jpg`;
      mockFindFirstIntent.mockResolvedValue(
        makePendingIntent({ r2Key: uniqueKey }),
      );
      const msg = createMockMessage(
        makeR2Event({ object: { key: uniqueKey, size: 1000, eTag: 'x' } }),
      );
      const batch = createMockBatch([msg]);

      await queue(batch, env as any, {} as ExecutionContext);

      expect(msg.ack).toHaveBeenCalled();
      expect(Sentry.captureMessage).toHaveBeenCalled();
    });

    it('5.2 — file too large → invalid_file size_exceeded', async () => {
      const largeKey = `uploads/${TEST_EVENT_ID}/large.jpg`;
      // Seed R2 with file larger than PHOTO_MAX_FILE_SIZE (10 MB)
      const largeFile = new ArrayBuffer(PHOTO_MAX_FILE_SIZE + 1);
      await env.PHOTOS_BUCKET.put(largeKey, largeFile);

      mockFindFirstIntent.mockResolvedValue(
        makePendingIntent({ r2Key: largeKey }),
      );
      const msg = createMockMessage(
        makeR2Event({ object: { key: largeKey, size: largeFile.byteLength, eTag: 'x' } }),
      );
      const batch = createMockBatch([msg]);

      await queue(batch, env as any, {} as ExecutionContext);

      expect(msg.ack).toHaveBeenCalled();
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          errorCode: 'size_exceeded',
          retryable: false,
        }),
      );
    });

    it('5.3 — invalid magic bytes → invalid_file', async () => {
      const badKey = `uploads/${TEST_EVENT_ID}/bad-magic.dat`;
      await env.PHOTOS_BUCKET.put(badKey, INVALID_MAGIC);

      mockFindFirstIntent.mockResolvedValue(
        makePendingIntent({ r2Key: badKey }),
      );
      const msg = createMockMessage(
        makeR2Event({ object: { key: badKey, size: INVALID_MAGIC.length, eTag: 'x' } }),
      );
      const batch = createMockBatch([msg]);

      await queue(batch, env as any, {} as ExecutionContext);

      expect(msg.ack).toHaveBeenCalled();
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          errorCode: 'invalid_magic_bytes',
          retryable: false,
        }),
      );
    });

    it('5.4 — dimensions too large → invalid_file dimensions_too_large', async () => {
      const bigDimKey = `uploads/${TEST_EVENT_ID}/big-dim.jpg`;
      await env.PHOTOS_BUCKET.put(bigDimKey, OVERSIZED_DIM_JPEG);

      mockFindFirstIntent.mockResolvedValue(
        makePendingIntent({ r2Key: bigDimKey }),
      );
      const msg = createMockMessage(
        makeR2Event({
          object: { key: bigDimKey, size: OVERSIZED_DIM_JPEG.length, eTag: 'x' },
        }),
      );
      const batch = createMockBatch([msg]);

      await queue(batch, env as any, {} as ExecutionContext);

      expect(msg.ack).toHaveBeenCalled();
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          errorCode: 'dimensions_too_large',
          retryable: false,
        }),
      );
    });

    it('5.5 — dimension parse fails → invalid_file dimension_parse_failed', async () => {
      const noSofKey = `uploads/${TEST_EVENT_ID}/no-sof.jpg`;
      await env.PHOTOS_BUCKET.put(noSofKey, NO_SOF_JPEG);

      mockFindFirstIntent.mockResolvedValue(
        makePendingIntent({ r2Key: noSofKey }),
      );
      const msg = createMockMessage(
        makeR2Event({
          object: { key: noSofKey, size: NO_SOF_JPEG.length, eTag: 'x' },
        }),
      );
      const batch = createMockBatch([msg]);

      await queue(batch, env as any, {} as ExecutionContext);

      expect(msg.ack).toHaveBeenCalled();
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          errorCode: 'dimension_parse_failed',
          retryable: false,
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Group 6: Normalization Failure
  // ---------------------------------------------------------------------------

  describe('normalization failure', () => {
    it('6.1 — CF Images error → normalization_failed', async () => {
      mockNormalizeCfImages.mockReturnValue(
        ResultAsync.fromPromise(
          Promise.reject(new Error('cf images transform failed')),
          (cause) => ({ stage: 'cf_images_transform', cause }),
        ),
      );
      const msg = createMockMessage(makeR2Event());
      const batch = createMockBatch([msg]);

      await queue(batch, env as any, {} as ExecutionContext);

      expect(msg.ack).toHaveBeenCalled();
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          errorCode: 'normalization_failed',
          retryable: false,
        }),
      );
    });

    it('6.2 — no retry on normalization failure', async () => {
      mockNormalizeCfImages.mockReturnValue(
        ResultAsync.fromPromise(
          Promise.reject(new Error('fail')),
          (cause) => ({ stage: 'cf_images_transform', cause }),
        ),
      );
      const msg = createMockMessage(makeR2Event());
      const batch = createMockBatch([msg]);

      await queue(batch, env as any, {} as ExecutionContext);

      expect(msg.retry).not.toHaveBeenCalled();
      expect(msg.ack).toHaveBeenCalled();
    });

    it('6.3 — LUT apply fails → upload succeeds with un-graded output + warning', async () => {
      mockApplyPostProcess.mockReturnValue(
        err({ stage: 'post_process', cause: new Error('LUT apply crashed') }),
      );

      // Minimal valid .cube LUT (size=2, 8 triplets = identity)
      const validCubeLut = [
        'LUT_3D_SIZE 2',
        '0.0 0.0 0.0',
        '1.0 0.0 0.0',
        '0.0 1.0 0.0',
        '1.0 1.0 0.0',
        '0.0 0.0 1.0',
        '1.0 0.0 1.0',
        '0.0 1.0 1.0',
        '1.0 1.0 1.0',
      ].join('\n');

      // Simulate event with color grading enabled + valid LUT
      const dbSelectMock = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{
              settings: { colorGrade: { enabled: true, lutId: 'lut-1', intensity: 75, includeLuminance: false } },
            }]),
          }),
        }),
      });

      // Re-mock createDb to include the select chain for event settings
      const { createDb } = await import('@/db');
      (createDb as any).mockReturnValue({
        query: {
          uploadIntents: { findFirst: mockFindFirstIntent },
          photoLuts: {
            findFirst: vi.fn().mockResolvedValue({
              status: 'completed',
              lutR2Key: 'luts/test-lut.cube',
            }),
          },
        },
        update: mockUpdateFn,
        select: dbSelectMock,
      });

      // Seed R2 with valid .cube LUT file
      await env.PHOTOS_BUCKET.put('luts/test-lut.cube', validCubeLut);

      const msg = createMockMessage(makeR2Event());
      const batch = createMockBatch([msg]);

      await queue(batch, env as any, {} as ExecutionContext);

      expect(msg.ack).toHaveBeenCalled();
      // Upload still succeeds — transaction should have been called
      expect(mockTxTransaction).toHaveBeenCalled();
      // Warning captured for LUT failure
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('color_grade_apply_failed'),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Group 7: Step 8b — photoId Pre-write
  // ---------------------------------------------------------------------------

  describe('photoId pre-write (step 8b)', () => {
    it('7.1 — photoId written before R2 PUT', async () => {
      const callOrder: string[] = [];

      // Track step 8b update (set called with { photoId })
      mockUpdateSet.mockImplementation((values: any) => {
        if (values.photoId) callOrder.push('db_update_photoId');
        return { where: mockUpdateWhere };
      });

      // Track R2 PUT for normalized image
      const originalPut = env.PHOTOS_BUCKET.put.bind(env.PHOTOS_BUCKET);
      const putSpy = vi.spyOn(env.PHOTOS_BUCKET, 'put').mockImplementation(
        async (key: string, ...args: any[]) => {
          // Only track puts to the normalized key (eventId/photoId.jpg), not uploads/
          if (!key.startsWith('uploads/')) callOrder.push('r2_put_normalized');
          return originalPut(key, ...args);
        },
      );

      const msg = createMockMessage(makeR2Event());
      const batch = createMockBatch([msg]);

      await queue(batch, env as any, {} as ExecutionContext);

      expect(callOrder).toEqual(['db_update_photoId', 'r2_put_normalized']);
      putSpy.mockRestore();
    });

    it('7.2 — intent_update failure → mark failed', async () => {
      // Step 8b update rejects on first call
      mockUpdateWhere.mockRejectedValueOnce(new Error('DB timeout'));

      const msg = createMockMessage(makeR2Event());
      const batch = createMockBatch([msg]);

      await queue(batch, env as any, {} as ExecutionContext);

      expect(msg.ack).toHaveBeenCalled();
      // Error handler update (second call to set) marks intent_update_failed
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          errorCode: 'intent_update_failed',
          retryable: false,
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Group 8: R2 PUT Failure
  // ---------------------------------------------------------------------------

  describe('R2 PUT failure', () => {
    it('8.1 — R2 PUT normalized fails → best-effort mark failed + ack', async () => {
      const putSpy = vi.spyOn(env.PHOTOS_BUCKET, 'put');

      // First call is the beforeEach seed (already done).
      // The consumer will call PUT for the normalized image — make it reject.
      putSpy.mockRejectedValueOnce(new Error('R2 PUT failed'));

      const msg = createMockMessage(makeR2Event());
      const batch = createMockBatch([msg]);

      await queue(batch, env as any, {} as ExecutionContext);

      expect(msg.ack).toHaveBeenCalled();
      expect(msg.retry).not.toHaveBeenCalled();
      putSpy.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // Group 9: Credit / Transaction
  // ---------------------------------------------------------------------------

  describe('credit / transaction', () => {
    it('9.1 — insufficient credits → retryable failed', async () => {
      mockTxTransaction.mockRejectedValue(new Error('INSUFFICIENT_CREDITS'));
      const msg = createMockMessage(makeR2Event());
      const batch = createMockBatch([msg]);

      await queue(batch, env as any, {} as ExecutionContext);

      expect(msg.ack).toHaveBeenCalled();
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          errorCode: 'insufficient_credits',
          retryable: true,
        }),
      );
    });

    it('9.2 — transaction DB error → non-retryable failed', async () => {
      mockTxTransaction.mockRejectedValue(new Error('connection timeout'));
      const msg = createMockMessage(makeR2Event());
      const batch = createMockBatch([msg]);

      await queue(batch, env as any, {} as ExecutionContext);

      expect(msg.ack).toHaveBeenCalled();
      // database error → best-effort find + mark failed
      expect(Sentry.captureMessage).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Group 10: Success Path
  // ---------------------------------------------------------------------------

  describe('success path', () => {
    it('10.1 — full success → completed + enqueued', async () => {
      const queueSpy = vi.spyOn(env.PHOTO_QUEUE, 'send');
      const msg = createMockMessage(makeR2Event());
      const batch = createMockBatch([msg]);

      await queue(batch, env as any, {} as ExecutionContext);

      expect(msg.ack).toHaveBeenCalled();
      expect(msg.retry).not.toHaveBeenCalled();

      // Step 8b: photoId written to intent
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ photoId: expect.any(String) }),
      );

      // Step 10: transaction called
      expect(mockTxTransaction).toHaveBeenCalled();

      // Step 12: photo job enqueued
      expect(queueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          photo_id: 'photo-id-success',
          event_id: TEST_EVENT_ID,
        }),
      );

      queueSpy.mockRestore();
    });

    it('10.2 — enqueue fails after success → still ack', async () => {
      const queueSpy = vi
        .spyOn(env.PHOTO_QUEUE, 'send')
        .mockRejectedValueOnce(new Error('Queue full'));

      const msg = createMockMessage(makeR2Event());
      const batch = createMockBatch([msg]);

      await queue(batch, env as any, {} as ExecutionContext);

      // Still acked — transaction already committed
      expect(msg.ack).toHaveBeenCalled();
      expect(msg.retry).not.toHaveBeenCalled();

      // Sentry captures the enqueue failure
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('enqueue_failed'),
      );

      queueSpy.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // Group 11: Always-ack Invariant
  // ---------------------------------------------------------------------------

  describe('always-ack invariant', () => {
    it('11.1 — every error type results in ack', async () => {
      // Run multiple messages triggering different error paths
      const orphanKey = `uploads/${TEST_EVENT_ID}/orphan.jpg`;
      const invalidKey = `uploads/${TEST_EVENT_ID}/invalid.dat`;
      await env.PHOTOS_BUCKET.put(invalidKey, INVALID_MAGIC);

      const messages = [
        // 1. Orphan (no intent)
        createMockMessage(
          makeR2Event({ object: { key: orphanKey, size: 100, eTag: 'a' } }),
        ),
        // 2. Invalid magic bytes
        createMockMessage(
          makeR2Event({ object: { key: invalidKey, size: 8, eTag: 'b' } }),
        ),
      ];

      // First findFirst → null (orphan), second → intent for invalid file
      mockFindFirstIntent
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makePendingIntent({ r2Key: invalidKey }));

      const batch = createMockBatch(messages);
      await queue(batch, env as any, {} as ExecutionContext);

      for (const msg of messages) {
        expect(msg.ack).toHaveBeenCalled();
      }
    });

    it('11.2 — no message ever has retry called', async () => {
      const messages = [
        createMockMessage(makeR2Event({ action: 'DeleteObject' })),
        createMockMessage(makeR2Event()),
      ];
      const batch = createMockBatch(messages);

      await queue(batch, env as any, {} as ExecutionContext);

      for (const msg of messages) {
        expect(msg.retry).not.toHaveBeenCalled();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Group 12: DB-down Resilience
  // ---------------------------------------------------------------------------

  describe('DB-down resilience', () => {
    it('12.1 — DB update in error handler fails → still ack, no throw', async () => {
      // Make normalization fail (triggers error handler)
      mockNormalizeCfImages.mockReturnValue(
        ResultAsync.fromPromise(
          Promise.reject(new Error('fail')),
          (cause) => ({ stage: 'cf_images_transform', cause }),
        ),
      );
      // Make the error handler's DB update reject
      mockUpdateWhere.mockRejectedValue(new Error('DB is down'));

      const msg = createMockMessage(makeR2Event());
      const batch = createMockBatch([msg]);

      // Should not throw — .catch(() => {}) in error handler absorbs it
      await queue(batch, env as any, {} as ExecutionContext);

      expect(msg.ack).toHaveBeenCalled();
    });
  });
});
