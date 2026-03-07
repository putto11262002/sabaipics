/**
 * Photo Pipeline V2/V3 — CF ↔ Modal Contracts
 *
 * V3: CF normalizes at the edge, then dispatches single recognition jobs to Modal.
 * Modal processes auto-edit (optional) + recognition, then POSTs per-image callback.
 *
 * V2 batch types are kept for backwards compatibility during rollout.
 */

import type { DetectedFace } from '../lib/recognition/types';

// =============================================================================
// CF → Modal (single job — V3)
// =============================================================================

export interface PipelineSingleJobRequest {
  job: PipelineJob;
  callback: { url: string; token?: string };
  traceparent?: string;
  baggage?: string;
}

// =============================================================================
// CF → Modal (batch request — V2 legacy)
// =============================================================================

export interface PipelineBatchRequest {
  jobs: PipelineJob[];
  traceparent?: string;
  baggage?: string;
}

export interface PipelineJob {
  jobId: string; // photo_jobs.id
  photoId?: string; // photos.id (V3: created before recognition)
  eventId: string;
  photographerId: string;
  source: 'web' | 'ios' | 'ftp';

  // Presigned URLs
  inputUrl: string; // GET normalized image from R2
  originalPutUrl?: string; // PUT normalized original to R2 (V2 only)
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
  autoEditPresetId?: string | null;
  contrast?: number;
  brightness?: number;
  saturation?: number;
  sharpness?: number;
  autoContrast?: boolean;
  lutId?: string | null;
  lutBase64?: string | null;
  lutIntensity?: number;
  maxFaces?: number;
}

// =============================================================================
// Modal → CF (callback — works for both single and batch)
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
