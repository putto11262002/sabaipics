/**
 * Upload orchestration contracts (draft v2).
 *
 * These types are intentionally independent from the current queue/message contracts
 * so we can iterate the new architecture without touching the existing pipeline.
 */

export type OrchestrationPhase =
  | 'accepted'
  | 'started'
  | 'normalized'
  | 'image_processed'
  | 'face_extracted'
  | 'completed'
  | 'failed';

export interface StartUploadOrchestrationRequest {
  /** Stable id from CF side (upload_intents.id). */
  jobId: string;
  eventId: string;
  photographerId: string;
  source: 'web' | 'ios' | 'ftp';

  /** R2 key of uploaded source object. */
  sourceR2Key: string;
  originalR2Key: string;
  processedR2Key: string;

  /** Optional normalized object key when CF pre-normalization is enabled. */
  normalizedR2Key?: string;

  contentType: string;
  contentLength?: number | null;

  /** W3C trace context propagated from CF. */
  traceparent?: string;
  baggage?: string;

  /** Direct pipeline URLs passed by CF control plane. */
  inputUrl: string;
  outputUrl: string;
  outputHeaders: Record<string, string>;
  extractImageUrl: string;

  /** CF callback endpoint for progress/final state. */
  callback: {
    url: string;
    token?: string;
  };

  /** Controls auto-edit and extraction behavior. */
  options?: {
    autoEdit?: boolean;
    autoEditIntensity?: number;
    lutId?: string | null;
    lutIntensity?: number;
    includeLuminance?: boolean;
    maxFaces?: number;
  };
}

export interface StartUploadOrchestrationResult {
  /** Modal-side execution id. */
  runId: string;
  /** Echo of CF authoritative job id. */
  jobId: string;
  phase: 'accepted' | 'completed' | 'failed';
  acceptedAt: string;
  completedAt?: string;
  artifacts?: {
    normalizedR2Key?: string;
    processedR2Key?: string;
    embeddingCount?: number;
    operationsApplied?: string[];
    outputSize?: number;
  };
  error?: {
    code: string;
    message: string;
    retryable?: boolean;
  };
}

export interface UploadOrchestrationCallback {
  runId: string;
  jobId: string;
  phase: Exclude<OrchestrationPhase, 'accepted'>;
  timestamp: string;

  /** Present on terminal failure. */
  error?: {
    code: string;
    message: string;
    retryable?: boolean;
  };

  /** Optional artifacts/materialized outputs from model processing. */
  artifacts?: {
    normalizedR2Key?: string;
    processedR2Key?: string;
    embeddingCount?: number;
  };
}
