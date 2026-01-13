/**
 * SabaiFace Adapter - Self-hosted face recognition
 *
 * Self-hosted face recognition using face-api.js + vector database.
 * Provides AWS Rekognition-compatible interface with internal vector storage.
 *
 * All operations wrapped in ResultAsync for typed error handling.
 */

import type { InternalDatabase } from '../../db';
import { faces } from '../../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import type {
  FaceService,
  PhotoIndexed,
  SimilarFace,
  IndexPhotoParams,
  FindSimilarParams,
  Face,
  UnindexedFace,
  BoundingBox,
} from '../../domain/face-service';
import type { FaceDetector, DetectedFace } from '../../core/face-detector';
import type { VectorStore, FaceData } from '../../core/vector-store';
import { pixelBoxToRatio } from '../../core/face-detector';
import { distanceToSimilarity, similarityToDistance } from '../../core/vector-store';
import { ResultAsync, ok, err } from 'neverthrow';
import type { FaceServiceError } from '../../domain/errors';
import {
  sabaifaceProviderFailed,
  databaseError,
} from '../../domain/errors';

// =============================================================================
// SabaiFace Raw Response Types
// =============================================================================

/**
 * Raw SabaiFace response structure for storage
 */
interface SabaiFaceRawResponse {
  provider: 'sabaiface';
  faceApiResponse: {
    detections: Array<{
      detection: {
        box: { x: number; y: number; width: number; height: number };
        score: number;
      };
      landmarks?: Array<{ x: number; y: number }>;
      descriptor: number[]; // Float32Array converted to regular array for JSON storage
      age?: number;
      gender?: string;
      genderProbability?: number;
    }>;
    modelVersion: string;
    processingTimeMs: number;
  };
}

// =============================================================================
// SabaiFace Adapter Implementation
// =============================================================================

/**
 * SabaiFace adapter implementing FaceService interface.
 *
 * Uses face-api.js for face detection and descriptor extraction,
 * and PostgresVectorStore (pgvector) for similarity search.
 */
export class SabaiFaceAdapter implements FaceService {
  constructor(
    private faceDetector: FaceDetector,
    private vectorStore: VectorStore,
    private db: InternalDatabase
  ) {}

  /**
   * Index faces from a photo using face-api.js.
   *
   * WORKFLOW:
   * 1. Use FaceDetector to detect faces and extract 128-D descriptors
   * 2. Store descriptors in VectorStore (PostgresVectorStore with pgvector)
   * 3. Store faces in database with full metadata
   *
   * All operations wrapped in ResultAsync for error handling.
   */
  async indexPhoto(params: IndexPhotoParams): Promise<ResultAsync<PhotoIndexed, FaceServiceError>> {
    const startTime = Date.now();

    // Wrap face detection in ResultAsync
    const detectResult = await ResultAsync.fromPromise(
      this.faceDetector.detectFaces(params.imageData),
      (cause) => sabaifaceProviderFailed(cause)
    );

    if (detectResult.isErr()) {
      return err(detectResult.error);
    }

    const detections = detectResult.value;

    if (detections.length === 0) {
      console.log(`[SabaiFace] No faces detected in photo ${params.photoId}`);
      return ok({
        faces: [],
        unindexedFaces: [],
        provider: 'sabaiface',
      });
    }

    // Get image dimensions from first detection (assuming all from same image)
    // We need this to convert pixel coordinates to ratios
    const imageWidth = detections[0].boundingBox.x + detections[0].boundingBox.width;
    const imageHeight = detections[0].boundingBox.y + detections[0].boundingBox.height;

    // 2. Convert detections to domain Face objects
    const facesData: Array<{ face: Face; detection: DetectedFace }> = detections.map((det) => {
      const faceId = crypto.randomUUID();
      const boundingBox = pixelBoxToRatio(
        det.boundingBox,
        imageWidth,
        imageHeight
      );

      const face: Face = {
        faceId,
        boundingBox,
        confidence: det.confidence,
        externalImageId: params.photoId,
        attributes: {
          age: det.age ? { low: det.age - 5, high: det.age + 5 } : undefined,
          gender: det.gender
            ? { value: det.gender, confidence: det.genderConfidence ?? 0 }
            : undefined,
        },
        provider: 'sabaiface',
      };

      return { face, detection: det };
    });

    // 3. Store in database (faces table)
    // NOTE: We insert directly here instead of using vectorStore.addFaces()
    // because we need to store additional metadata (attributes, rawResponse)
    // that the vectorStore doesn't handle. The vectors are stored in the
    // same faces table via the descriptor column (pgvector).
    const processingTimeMs = Date.now() - startTime;
    const rawResponse = this.buildRawResponse(detections, processingTimeMs);

    const rowsToInsert = facesData.map(({ face, detection }) => {
      return {
        id: face.faceId,
        eventId: params.eventId,
        photoId: params.photoId || null,
        provider: 'sabaiface' as const,
        confidence: face.confidence?.toString(),
        boundingBox: JSON.stringify({
          Width: face.boundingBox.width,
          Height: face.boundingBox.height,
          Left: face.boundingBox.left,
          Top: face.boundingBox.top,
        }),
        descriptor: Array.from(detection.descriptor), // Convert Float32Array to array for pgvector
      };
    });

    // Wrap DB insert in ResultAsync
    const insertResult = await ResultAsync.fromPromise(
      this.db.insert(faces).values(rowsToInsert),
      (cause) => databaseError('insert_faces', cause)
    );

    if (insertResult.isErr()) {
      return err(insertResult.error);
    }

    return ok({
      faces: facesData.map(({ face }) => face),
      unindexedFaces: [],
      provider: 'sabaiface',
    });
  }

  /**
   * Find similar faces using vector similarity search.
   *
   * WORKFLOW:
   * 1. Use FaceDetector to extract descriptor from query image
   * 2. Use VectorStore (PostgresVectorStore) for similarity search with pgvector
   * 3. Load face domain models from database
   * 4. Return similar faces sorted by similarity
   *
   * All operations wrapped in ResultAsync for error handling.
   */
  async findSimilarFaces(params: FindSimilarParams): Promise<ResultAsync<SimilarFace[], FaceServiceError>> {
    // Wrap face detection in ResultAsync
    const detectResult = await ResultAsync.fromPromise(
      this.faceDetector.detectFaces(params.imageData),
      (cause) => sabaifaceProviderFailed(cause)
    );

    if (detectResult.isErr()) {
      return err(detectResult.error);
    }

    const detections = detectResult.value;

    if (detections.length === 0) {
      console.log('[SabaiFace] No faces detected in query image');
      return ok([]);
    }

    // 2. Use first face as query descriptor
    const queryDescriptor = detections[0].descriptor;

    // 3. Search using PostgresVectorStore with pgvector
    const threshold = similarityToDistance(params.minSimilarity ?? 0.8);
    const matchesResult = await ResultAsync.fromPromise(
      this.vectorStore.searchFaces(
        params.eventId,
        queryDescriptor,
        params.maxResults ?? 10,
        threshold
      ),
      (cause) => sabaifaceProviderFailed(cause)
    );

    if (matchesResult.isErr()) {
      return err(matchesResult.error);
    }

    const matches = matchesResult.value;

    if (matches.length === 0) {
      console.log('[SabaiFace] No similar faces found');
      return ok([]);
    }

    // 4. Load face domain models from database
    const faceIds = matches.map((m) => m.faceId);
    const faceRowsResult = await ResultAsync.fromPromise(
      this.db.query.faces.findMany({
        where: and(
          eq(faces.provider, 'sabaiface'),
          inArray(faces.id, faceIds)
        ),
      }),
      (cause) => databaseError('find_faces', cause)
    );

    if (faceRowsResult.isErr()) {
      return err(faceRowsResult.error);
    }

    const faceRows = faceRowsResult.value;

    // 5. Convert to domain SimilarFace objects
    const similarFaces: SimilarFace[] = [];
    for (const match of matches) {
      const faceRow = faceRows.find((f) => f.id === match.faceId);

      if (!faceRow) {
        console.warn(`[SabaiFace] Face ${match.faceId} not found in database`);
        continue;
      }

      const boundingBox = faceRow.boundingBox
        ? this.convertBoundingBoxFromDB(faceRow.boundingBox)
        : undefined;

      similarFaces.push({
        faceId: match.faceId,
        similarity: match.similarity / 100, // Convert percentage to 0-1 scale
        boundingBox,
        confidence: faceRow.confidence ? parseFloat(faceRow.confidence) : undefined,
        externalImageId: match.metadata.externalImageId || '',
        provider: 'sabaiface' as const,
      });
    }

    console.log(
      `[SabaiFace] Found ${similarFaces.length} similar faces (threshold: ${params.minSimilarity ?? 0.8})`
    );

    return ok(similarFaces);
  }

  /**
   * Delete faces from vector store and database.
   *
   * All operations wrapped in ResultAsync for error handling.
   */
  async deleteFaces(eventId: string, faceIds: string[]): Promise<ResultAsync<void, FaceServiceError>> {
    // Wrap vector store delete in ResultAsync
    const vectorDeleteResult = await ResultAsync.fromPromise(
      this.vectorStore.deleteFaces(eventId, faceIds),
      (cause) => sabaifaceProviderFailed(cause)
    );

    if (vectorDeleteResult.isErr()) {
      return err(vectorDeleteResult.error);
    }

    // Delete from database
    const dbDeleteResult = await ResultAsync.fromPromise(
      this.db
        .delete(faces)
        .where(
          and(
            eq(faces.provider, 'sabaiface'),
            inArray(faces.id, faceIds)
          )
        ),
      (cause) => databaseError('delete_faces', cause)
    );

    if (dbDeleteResult.isErr()) {
      return err(dbDeleteResult.error);
    }

    console.log(`[SabaiFace] Deleted ${faceIds.length} faces from event ${eventId}`);
    return ok(undefined);
  }

  /**
   * Delete entire collection from vector store.
   *
   * All operations wrapped in ResultAsync for error handling.
   */
  async deleteCollection(eventId: string): Promise<ResultAsync<void, FaceServiceError>> {
    const result = await ResultAsync.fromPromise(
      this.vectorStore.deleteCollection(eventId),
      (cause) => sabaifaceProviderFailed(cause)
    );

    if (result.isErr()) {
      return err(result.error);
    }

    console.log(`[SabaiFace] Deleted collection ${eventId}`);
    return ok(undefined);
  }

  /**
   * Create a new collection in vector store.
   *
   * All operations wrapped in ResultAsync for error handling.
   */
  async createCollection(eventId: string): Promise<ResultAsync<string, FaceServiceError>> {
    const result = await ResultAsync.fromPromise(
      this.vectorStore.createCollection(eventId),
      (cause) => sabaifaceProviderFailed(cause)
    );

    if (result.isErr()) {
      return err(result.error);
    }

    console.log(`[SabaiFace] Created collection ${eventId}`);
    return ok(`sabaiface:${eventId}`);
  }

  // =============================================================================
  // Helper Methods
  // =============================================================================

  /**
   * Build raw response for storage.
   */
  private buildRawResponse(
    detections: DetectedFace[],
    processingTimeMs: number
  ): SabaiFaceRawResponse {
    return {
      provider: 'sabaiface',
      faceApiResponse: {
        detections: detections.map((det) => ({
          detection: {
            box: det.boundingBox,
            score: det.confidence,
          },
          landmarks: det.landmarks,
          descriptor: Array.from(det.descriptor),
          age: det.age,
          gender: det.gender,
          genderProbability: det.genderConfidence,
        })),
        modelVersion: 'face-api.js-v1.7.15',
        processingTimeMs,
      },
    };
  }

  /**
   * Convert domain BoundingBox (ratios) to database format.
   */
  private convertBoundingBox(box: BoundingBox): {
    Width: number;
    Height: number;
    Left: number;
    Top: number;
  } {
    return {
      Width: box.width,
      Height: box.height,
      Left: box.left,
      Top: box.top,
    };
  }

  /**
   * Convert database BoundingBox to domain format.
   */
  private convertBoundingBoxFromDB(box: any): BoundingBox {
    return {
      width: box.Width,
      height: box.Height,
      left: box.Left,
      top: box.Top,
    };
  }
}
