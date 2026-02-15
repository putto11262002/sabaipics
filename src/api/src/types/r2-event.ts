/**
 * R2 Event Notification Types
 *
 * Payload structure for R2 bucket event notifications
 * triggered by object creation/deletion.
 */

export interface R2EventMessage {
  account: string;
  action: 'PutObject' | 'CopyObject' | 'CompleteMultipartUpload' | 'DeleteObject' | 'LifecycleDeletion';
  bucket: string;
  object: {
    key: string;
    size: number;
    eTag: string;
  };
  eventTime: string; // ISO timestamp
  copySource?: {
    bucket: string;
    object: string;
  };
}
