/**
 * Cleanup Job Queue Message
 *
 * Message format for rekognition-cleanup queue.
 * Sent by cron handler, processed by cleanup-consumer.
 */

export interface CleanupJob {
  event_id: string;
  collection_id: string | null;
}
