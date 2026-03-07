/**
 * Photo Pipeline V2 — CF ↔ Modal Contracts
 *
 * CF sends a batch of jobs to Modal (PipelineBatchRequest).
 * Modal processes all jobs and POSTs results back (PipelineBatchCallback).
 */

import type { DetectedFace } from '../lib/recognition/types';

// =============================================================================
// CF → Modal (batch request)
// =============================================================================

export interface PipelineBatchRequest {
  jobs: PipelineJob[];
  traceparent?: string;
  baggage?: string;
}

export interface PipelineJob {
  jobId: string; // photo_jobs.id
  eventId: string;
  photographerId: string;
  source: 'web' | 'ios' | 'ftp' | 'desktop';

  // Presigned URLs
  inputUrl: string; // GET raw upload from R2
  originalPutUrl: string; // PUT normalized original to R2
  processedPutUrl?: string; // PUT processed to R2 (if auto-edit enabled)

  // R2 keys (for DB records)
  sourceR2Key: string;
  originalR2Key: string;
  processedR2Key?: string;

  contentType: string;

  options?: PipelineJobOptions;
}

export interface PipelineJobOptions {
  autoEdit?: boolean;
  autoEditIntensity?: number;
  lutId?: string | null;
  lutIntensity?: number;
  maxFaces?: number;
}

// =============================================================================
// Modal → CF (batch callback)
// =============================================================================

export interface PipelineBatchCallback {
  results: PipelineJobResult[];
}

export interface PipelineJobResult {
  jobId: string;
  status: 'completed' | 'failed';

  // On success
  artifacts?: {
    originalR2Key: string;
    processedR2Key?: string; // only if auto-edit succeeded
    autoEditSucceeded?: boolean;
    embeddingCount: number;
    faces: DetectedFace[];
    exif?: Record<string, unknown>;
    width?: number;
    height?: number;
  };

  // On failure
  error?: {
    code: string;
    message: string;
  };
}
