/**
 * Photo Processing Queue Types
 *
 * Data shapes for the image processing pipeline:
 * Upload API → Queue → Consumer → InsightFace /extract
 */

// =============================================================================
// Queue Message
// =============================================================================

/**
 * Message payload sent to photo-processing queue.
 * Created by upload endpoint, consumed by queue handler.
 */
export interface PhotoJob {
  /** UUID - matches photos.id in database */
  photo_id: string;

  /** UUID - matches events.id in database */
  event_id: string;

  /** R2 object key: "{event_id}/{photo_id}.{ext}" */
  r2_key: string;
}
