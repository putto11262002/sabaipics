/**
 * Modal Provider for face-eval
 *
 * Calls the v2 /extract endpoint (Modal or local) and stores embeddings
 * in memory. Search is done via cosine similarity against the in-memory store.
 * This tests the full extraction pipeline with the same eval metrics.
 */

import { Buffer } from 'node:buffer';
import { ResultAsync, err, ok, safeTry } from 'neverthrow';

import type {
  FaceRecognitionProvider,
  FaceServiceError,
  FindImagesByFaceRequest,
  FindImagesByFaceResponse,
  IndexPhotoRequest,
  PhotoIndexed,
} from './types.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExtractResponse {
  faces: Array<{
    embedding: number[];
    bounding_box: { x: number; y: number; width: number; height: number };
    confidence: number;
  }>;
  image_width: number;
  image_height: number;
  model: string;
  inference_ms: number;
}

interface StoredFace {
  photoId: string;
  embedding: number[];
  confidence: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function networkError(e: unknown): FaceServiceError {
  return { type: 'provider_failed', provider: 'sabaiface', retryable: true, throttle: false, cause: e };
}

function httpError(status: number, body: unknown): FaceServiceError {
  return {
    type: 'provider_failed',
    provider: 'sabaiface',
    retryable: status >= 500 || status === 429,
    throttle: status === 429,
    cause: body,
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface ModalProviderConfig {
  endpoint: string;
  modalKey?: string;
  modalSecret?: string;
}

export function createModalProvider(config: ModalProviderConfig): FaceRecognitionProvider {
  const endpoint = config.endpoint.replace(/\/$/, '');

  // Build auth headers for Modal proxy auth (requires_proxy_auth=True)
  const authHeaders: Record<string, string> = {};
  if (config.modalKey) authHeaders['Modal-Key'] = config.modalKey;
  if (config.modalSecret) authHeaders['Modal-Secret'] = config.modalSecret;

  // In-memory embedding store, keyed by collection ID
  const collections = new Map<string, StoredFace[]>();

  const callExtract = (imageData: ArrayBuffer): ResultAsync<ExtractResponse, FaceServiceError> =>
    safeTry(async function* () {
      const base64Image = Buffer.from(imageData).toString('base64');

      const response = yield* ResultAsync.fromPromise(
        fetch(`${endpoint}/extract`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ image: base64Image, max_faces: 100, min_confidence: 0.3 }),
        }),
        networkError,
      ).safeUnwrap();

      if (!response.ok) {
        let body: unknown = { message: response.statusText };
        try {
          body = await response.json();
        } catch {
          // ignore
        }
        return err(httpError(response.status, body));
      }

      const data = yield* ResultAsync.fromPromise(
        response.json() as Promise<ExtractResponse>,
        networkError,
      ).safeUnwrap();

      return ok(data);
    });

  const createCollection = (eventId: string): ResultAsync<string, FaceServiceError> => {
    collections.set(eventId, []);
    return ResultAsync.fromSafePromise(Promise.resolve(eventId));
  };

  const deleteCollection = (eventId: string): ResultAsync<void, FaceServiceError> => {
    collections.delete(eventId);
    return ResultAsync.fromSafePromise(Promise.resolve(undefined));
  };

  const indexPhoto = (request: IndexPhotoRequest): ResultAsync<PhotoIndexed, FaceServiceError> =>
    safeTry(async function* () {
      const result = yield* callExtract(request.imageData).safeUnwrap();

      const store = collections.get(request.eventId) ?? [];

      for (const face of result.faces) {
        store.push({
          photoId: request.photoId,
          embedding: face.embedding,
          confidence: face.confidence,
        });
      }

      collections.set(request.eventId, store);

      return ok<PhotoIndexed, FaceServiceError>({
        faces: result.faces.map((_, i) => ({
          faceId: `${request.photoId}-${i}`,
          externalImageId: request.photoId,
        })),
        unindexedFaces: [],
        modelVersion: result.model,
        provider: 'sabaiface',
      });
    });

  const findImagesByFace = (
    request: FindImagesByFaceRequest,
  ): ResultAsync<FindImagesByFaceResponse, FaceServiceError> =>
    safeTry(async function* () {
      const result = yield* callExtract(request.imageData).safeUnwrap();

      if (result.faces.length === 0) {
        return ok<FindImagesByFaceResponse, FaceServiceError>({
          photos: [],
          totalMatchedFaces: 0,
          provider: 'sabaiface',
        });
      }

      const queryEmbedding = result.faces[0].embedding;
      const store = collections.get(request.eventId) ?? [];
      const minSim = request.minSimilarity ?? 0.4;

      // Compute similarity for every stored face
      const photoMap = new Map<string, { similarity: number; faceCount: number }>();

      for (const storedFace of store) {
        const sim = cosineSimilarity(queryEmbedding, storedFace.embedding);
        if (sim < minSim) continue;

        const existing = photoMap.get(storedFace.photoId);
        if (existing) {
          if (sim > existing.similarity) existing.similarity = sim;
          existing.faceCount += 1;
        } else {
          photoMap.set(storedFace.photoId, { similarity: sim, faceCount: 1 });
        }
      }

      const photos = Array.from(photoMap.entries())
        .map(([photoId, v]) => ({ photoId, similarity: v.similarity, faceCount: v.faceCount }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, request.maxResults ?? 20);

      return ok<FindImagesByFaceResponse, FaceServiceError>({
        photos,
        totalMatchedFaces: photos.reduce((s, p) => s + p.faceCount, 0),
        provider: 'sabaiface',
      });
    });

  return { indexPhoto, findImagesByFace, deleteCollection, createCollection };
}
