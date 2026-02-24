/**
 * Rate Limiter Durable Object Tests
 *
 * Runs in workerd runtime via miniflare.
 * Tests DO behavior without external dependencies.
 */

import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';

describe('RekognitionRateLimiter DO', () => {
  it('returns zero delay for first batch (cold start)', async () => {
    const id = env.AWS_REKOGNITION_RATE_LIMITER.idFromName('test-cold');
    const rateLimiter = env.AWS_REKOGNITION_RATE_LIMITER.get(id);

    const result = await rateLimiter.reserveBatch(10);

    expect(result.delay).toBe(0);
    expect(result.intervalMs).toBeGreaterThan(0);
    expect(result.intervalMs).toBeLessThanOrEqual(40); // ~37ms expected (30 TPS)
  });

  it('returns delay for back-to-back batches', async () => {
    const id = env.AWS_REKOGNITION_RATE_LIMITER.idFromName('test-backtoback');
    const rateLimiter = env.AWS_REKOGNITION_RATE_LIMITER.get(id);

    // First batch - no delay
    const first = await rateLimiter.reserveBatch(10);
    expect(first.delay).toBe(0);

    // Second batch immediately - should have delay
    const second = await rateLimiter.reserveBatch(10);
    expect(second.delay).toBeGreaterThan(0);

    // Delay should be approximately: 10 * intervalMs
    const expectedDelay = 10 * first.intervalMs;
    expect(second.delay).toBeGreaterThanOrEqual(expectedDelay - 50); // Allow 50ms tolerance
  });

  it('increases delay after throttle report', async () => {
    const id = env.AWS_REKOGNITION_RATE_LIMITER.idFromName('test-throttle');
    const rateLimiter = env.AWS_REKOGNITION_RATE_LIMITER.get(id);

    // Reserve a batch
    await rateLimiter.reserveBatch(1);

    // Report throttle with 2000ms additional delay
    await rateLimiter.reportThrottle(2000);

    // Next batch should have at least 2000ms delay
    const next = await rateLimiter.reserveBatch(1);
    expect(next.delay).toBeGreaterThanOrEqual(2000);
  });

  it('calculates correct interval for 30 TPS', async () => {
    const id = env.AWS_REKOGNITION_RATE_LIMITER.idFromName('test-interval');
    const rateLimiter = env.AWS_REKOGNITION_RATE_LIMITER.get(id);

    const result = await rateLimiter.reserveBatch(1);

    // 30 TPS = 33ms interval, with 90% safety = ~37ms
    expect(result.intervalMs).toBeGreaterThanOrEqual(33);
    expect(result.intervalMs).toBeLessThanOrEqual(40);
  });
});
