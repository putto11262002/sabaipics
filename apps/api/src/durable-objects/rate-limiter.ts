/**
 * RekognitionRateLimiter Durable Object
 *
 * Paces API calls to AWS Rekognition to stay within TPS limits.
 * Uses in-memory state for zero-latency coordination.
 *
 * us-west-2 limits:
 * - IndexFaces: 50 TPS
 * - SearchFacesByImage: 50 TPS
 *
 * Strategy:
 * - Track when last batch will finish
 * - New batches wait until previous batch completes
 * - Within batch, space requests at intervalMs (20ms = 50 TPS)
 *
 * If DO is evicted (idle >10s), state resets - safe to start fresh
 * since no recent API activity.
 */

import type { RateLimiterResponse } from "../types/photo-job";

// =============================================================================
// Configuration
// =============================================================================

/** AWS Rekognition TPS limit in us-west-2 */
const REKOGNITION_TPS = 50;

/** Milliseconds between requests to achieve TPS limit */
const INTERVAL_MS = Math.ceil(1000 / REKOGNITION_TPS); // 20ms

/** Safety margin - use 90% of limit to avoid edge cases */
const SAFETY_FACTOR = 0.9;

/** Effective interval with safety margin */
const SAFE_INTERVAL_MS = Math.ceil(INTERVAL_MS / SAFETY_FACTOR); // ~22ms

// =============================================================================
// Durable Object Interface (for type-safe RPC)
// =============================================================================

/**
 * Public methods exposed by RekognitionRateLimiter.
 * Used for type-safe stub calls.
 */
export interface IRateLimiter {
  reserveBatch(batchSize: number): Promise<RateLimiterResponse>;
  getStatus(): Promise<{
    lastBatchEndTime: number;
    currentBacklog: number;
    tps: number;
    intervalMs: number;
  }>;
  reset(): Promise<void>;
  reportThrottle(additionalDelayMs?: number): Promise<void>;
}

// =============================================================================
// Durable Object Class
// =============================================================================

/**
 * RekognitionRateLimiter Durable Object implementation.
 *
 * Note: Uses DurableObject pattern compatible with Cloudflare Workers runtime.
 * TypeScript types are handled via the IRateLimiter interface.
 */
export class RekognitionRateLimiter implements DurableObject {
  /**
   * Timestamp when the last reserved batch will finish.
   * Used to calculate delay for next batch.
   */
  private lastBatchEndTime: number = 0;

  constructor(
    private state: DurableObjectState,
    private env: unknown
  ) {}

  /**
   * HTTP fetch handler (required by DurableObject interface).
   * We use RPC methods instead, but this is required.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // RPC-style routing via fetch (fallback if RPC not available)
    if (path === "/reserveBatch") {
      const batchSize = parseInt(url.searchParams.get("batchSize") || "1", 10);
      const result = await this.reserveBatch(batchSize);
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (path === "/getStatus") {
      const result = await this.getStatus();
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (path === "/reset") {
      await this.reset();
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (path === "/reportThrottle") {
      const delay = parseInt(url.searchParams.get("delay") || "1000", 10);
      await this.reportThrottle(delay);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not Found", { status: 404 });
  }

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
   * Get current rate limiter status.
   * Useful for monitoring and debugging.
   */
  async getStatus(): Promise<{
    lastBatchEndTime: number;
    currentBacklog: number;
    tps: number;
    intervalMs: number;
  }> {
    const now = Date.now();
    const backlog = Math.max(0, this.lastBatchEndTime - now);

    return {
      lastBatchEndTime: this.lastBatchEndTime,
      currentBacklog: backlog,
      tps: REKOGNITION_TPS,
      intervalMs: SAFE_INTERVAL_MS,
    };
  }

  /**
   * Reset the rate limiter state.
   * Use with caution - only for testing or after service disruption.
   */
  async reset(): Promise<void> {
    this.lastBatchEndTime = 0;
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

// =============================================================================
// Export for wrangler binding
// =============================================================================

export { RekognitionRateLimiter as default };
