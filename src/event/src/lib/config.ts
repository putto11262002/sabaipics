/**
 * Event frontend configuration
 */

export const LINE_DELIVERY_CONFIG = {
  /** Interval between friendship status polls (ms) */
  POLL_INTERVAL_MS: 3000,
  /** Maximum number of polling attempts before timing out */
  POLL_MAX_ATTEMPTS: 60,
  /** Total maximum polling duration (ms) - POLL_INTERVAL_MS * POLL_MAX_ATTEMPTS */
  get POLL_MAX_DURATION_MS() {
    return this.POLL_INTERVAL_MS * this.POLL_MAX_ATTEMPTS;
  },
} as const;
