/**
 * RekognitionRateLimiter Durable Object
 *
 * Paces API calls to AWS Rekognition IndexFaces to stay within TPS limits.
 * Uses in-memory state for zero-latency coordination.
 *
 * us-west-2 limits (shared quota):
 * - IndexFaces + SearchFacesByImage: 50 TPS (shared)
 *
 * Quota allocation:
 * - IndexFaces: 30 TPS (this DO, background processing, can wait)
 * - SearchFacesByImage: 20 TPS (CF rate limiter, user-facing, reject immediately)
 *
 * Strategy:
 * - Track when last batch will finish
 * - New batches wait until previous batch completes
 * - Within batch, space requests at intervalMs (~33ms = 30 TPS)
 *
 * If DO is evicted (idle >10s), state resets - safe to start fresh
 * since no recent API activity.
 */

import { DurableObject } from 'cloudflare:workers';
import type { RateLimiterResponse } from '../types/photo-job';

// =============================================================================
// Configuration
// =============================================================================

/** AWS Rekognition TPS allocation for IndexFaces (30 out of 50 shared quota) */
const REKOGNITION_TPS = 30;

/** Milliseconds between requests to achieve TPS limit */
const INTERVAL_MS = Math.ceil(1000 / REKOGNITION_TPS); // 33ms

/** Safety margin - use 90% of limit to avoid edge cases */
const SAFETY_FACTOR = 0.9;

/** Effective interval with safety margin */
const SAFE_INTERVAL_MS = Math.ceil(INTERVAL_MS / SAFETY_FACTOR); // ~37ms

// =============================================================================
// Durable Object Class (RPC-enabled)
// =============================================================================

/**
 * RekognitionRateLimiter Durable Object implementation.
 * Uses RPC method invocation (requires compatibility_date >= 2024-04-03).
 */
export class RekognitionRateLimiter extends DurableObject {
  /**
   * Timestamp when the last reserved batch will finish.
   * Used to calculate delay for next batch.
   */
  private lastBatchEndTime: number = 0;

  /**
   * Reserve a time slot for processing a batch of photos.
   *
   * Called by queue consumer before processing each batch.
   * Returns how long to wait and the pacing interval.
   *
   * @param batchSize - Number of photos in this batch (typically 1-50)
   * @returns { delay, intervalMs } - Wait delay ms, then space requests by intervalMs
   */
  async reserveBatch(batchSize: number): Promise<RateLimiterResponse> {
    const now = Date.now();

    // Calculate how long this batch will take
    const batchDuration = batchSize * SAFE_INTERVAL_MS;

    // Calculate delay: how long until our slot starts
    const delay = Math.max(0, this.lastBatchEndTime - now);

    // Reserve our time slot
    const slotStart = now + delay;
    this.lastBatchEndTime = slotStart + batchDuration;

    return {
      delay,
      intervalMs: SAFE_INTERVAL_MS,
    };
  }

  /**
   * Report that a throttling error occurred.
   * Adds extra delay to the slot to allow rate limits to reset.
   *
   * @param additionalDelayMs - Extra delay to add (default: 1000ms)
   */
  async reportThrottle(additionalDelayMs = 1000): Promise<void> {
    const now = Date.now();
    this.lastBatchEndTime = Math.max(this.lastBatchEndTime, now) + additionalDelayMs;
  }
}
