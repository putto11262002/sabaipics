/**
 * Face Recognition Provider & Error Handling Tests
 *
 * Tests error classification, backoff logic, and provider interface.
 * Note: Provider integration tests require mocking fetch (not AWS SDK).
 */

import { describe, it, expect } from 'vitest';
import {
  isThrottlingError,
  isNonRetryableError,
  isRetryableError,
  isResourceAlreadyExistsError,
  isResourceNotFoundError,
  getBackoffDelay,
  getThrottleBackoffDelay,
} from './index';

// =============================================================================
// Error Classification Tests
// =============================================================================

describe('Error Classification', () => {
  it('identifies throttling errors', () => {
    const throttleError = new Error('Rate exceeded');
    throttleError.name = 'ThrottlingException';

    expect(isThrottlingError(throttleError)).toBe(true);
  });

  it('identifies ProvisionedThroughputExceededException as throttling', () => {
    const error = new Error('Throughput exceeded');
    error.name = 'ProvisionedThroughputExceededException';

    expect(isThrottlingError(error)).toBe(true);
  });

  it('identifies non-retryable errors', () => {
    const invalidImageError = new Error('Invalid image');
    invalidImageError.name = 'InvalidImageFormatException';

    expect(isNonRetryableError(invalidImageError)).toBe(true);
  });

  it('identifies retryable errors', () => {
    const serverError = new Error('Internal error');
    serverError.name = 'InternalServerError';

    expect(isRetryableError(serverError)).toBe(true);
  });

  it('returns false for non-errors', () => {
    expect(isThrottlingError('not an error')).toBe(false);
    expect(isThrottlingError(null)).toBe(false);
    expect(isThrottlingError(undefined)).toBe(false);
  });

  it('identifies ResourceAlreadyExistsException', () => {
    expect(isResourceAlreadyExistsError('ResourceAlreadyExistsException')).toBe(true);
    expect(isResourceAlreadyExistsError('ResourceNotFoundException')).toBe(false);
    expect(isResourceAlreadyExistsError(undefined)).toBe(false);
  });

  it('identifies ResourceNotFoundException', () => {
    expect(isResourceNotFoundError('ResourceNotFoundException')).toBe(true);
    expect(isResourceNotFoundError('ResourceAlreadyExistsException')).toBe(false);
    expect(isResourceNotFoundError(undefined)).toBe(false);
  });
});

// =============================================================================
// Backoff Calculation Tests
// =============================================================================

describe('Backoff Calculation', () => {
  it('calculates exponential backoff', () => {
    const attempt1 = getBackoffDelay(1);
    const attempt2 = getBackoffDelay(2);
    const attempt3 = getBackoffDelay(3);

    // Should roughly double each time (with jitter)
    expect(attempt1).toBeGreaterThanOrEqual(1);
    expect(attempt1).toBeLessThanOrEqual(3);

    expect(attempt2).toBeGreaterThanOrEqual(3);
    expect(attempt2).toBeLessThanOrEqual(6);

    expect(attempt3).toBeGreaterThanOrEqual(6);
    expect(attempt3).toBeLessThanOrEqual(12);
  });

  it('caps at max delay', () => {
    // After many attempts, should cap at 300s
    const attempt10 = getBackoffDelay(10);
    expect(attempt10).toBeLessThanOrEqual(360); // 300 + 20% jitter
  });

  it('throttle backoff starts higher', () => {
    const normalBackoff = getBackoffDelay(1);
    const throttleBackoff = getThrottleBackoffDelay(1);

    expect(throttleBackoff).toBeGreaterThan(normalBackoff);
  });
});

// =============================================================================
// Provider Factory Tests (unit tests only, no external calls)
// =============================================================================

describe('Provider Factory', () => {
  it('throws when AWS credentials missing for aws provider', async () => {
    const { createFaceProvider } = await import('./provider');

    expect(() =>
      createFaceProvider({
        FACE_PROVIDER: 'aws',
        AWS_ACCESS_KEY_ID: '',
        AWS_SECRET_ACCESS_KEY: '',
        AWS_REGION: '',
      }),
    ).toThrow('AWS credentials');
  });

  it('throws when SABAIFACE_ENDPOINT missing for sabaiface provider', async () => {
    const { createFaceProvider } = await import('./provider');

    expect(() =>
      createFaceProvider({
        FACE_PROVIDER: 'sabaiface',
        AWS_ACCESS_KEY_ID: 'test',
        AWS_SECRET_ACCESS_KEY: 'test',
        AWS_REGION: 'us-west-2',
      }),
    ).toThrow('SABAIFACE_ENDPOINT');
  });

  it('creates AWS provider when credentials provided', async () => {
    const { createFaceProvider } = await import('./provider');

    const provider = createFaceProvider({
      FACE_PROVIDER: 'aws',
      AWS_ACCESS_KEY_ID: 'test-key',
      AWS_SECRET_ACCESS_KEY: 'test-secret',
      AWS_REGION: 'us-west-2',
    });

    expect(provider).toBeDefined();
    expect(provider.indexPhoto).toBeInstanceOf(Function);
    expect(provider.findSimilarFaces).toBeInstanceOf(Function);
    expect(provider.deleteFaces).toBeInstanceOf(Function);
    expect(provider.deleteCollection).toBeInstanceOf(Function);
    expect(provider.createCollection).toBeInstanceOf(Function);
  });

  it('creates SabaiFace provider when endpoint provided', async () => {
    const { createFaceProvider } = await import('./provider');

    const provider = createFaceProvider({
      FACE_PROVIDER: 'sabaiface',
      SABAIFACE_ENDPOINT: 'http://localhost:3001',
      AWS_ACCESS_KEY_ID: 'test-key',
      AWS_SECRET_ACCESS_KEY: 'test-secret',
      AWS_REGION: 'us-west-2',
    });

    expect(provider).toBeDefined();
    expect(provider.indexPhoto).toBeInstanceOf(Function);
  });
});
