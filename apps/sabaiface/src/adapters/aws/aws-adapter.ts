/**
 * AWS Rekognition Adapter
 *
 * Wraps existing AWS Rekognition code and translates to domain interface.
 * Reuses functions from lib/rekognition/client.ts with safe wrappers.
 *
 * Key responsibilities:
 * - Translate AWS responses to domain models
 * - Normalize confidence (0-100 → 0-1)
 * - Extract and normalize attributes
 * - Preserve raw AWS responses for training
 * - Store results in database with provider='aws'
 * - Use ResultAsync for typed error handling
 */

import {
  RekognitionClient,
  type FaceRecord as AWSFaceRecord,
  type UnindexedFace as AWSUnindexedFace,
  type BoundingBox as AWSBoundingBox,
  type FaceDetail as AWSFaceDetail,
} from '@aws-sdk/client-rekognition';
import type { InternalDatabase } from '../../db';
import { faces } from '../../db/schema';
import { ResultAsync, err, ok } from 'neverthrow';
import {
  indexFacesSafe,
  createCollectionSafe,
  deleteCollectionSafe,
  type IndexFacesResult,
} from '../../lib/rekognition/client';
import type {
  FaceService,
  PhotoIndexed,
  SimilarFace,
  IndexPhotoParams,
  FindSimilarParams,
  Face,
  UnindexedFace,
  BoundingBox,
  FaceAttributes,
  AWSRawResponse,
} from '../../domain/face-service';
import type { FaceServiceError } from '../../domain/errors';
import {
  awsProviderFailed,
  databaseError,
  sabaifaceProviderFailed,
} from '../../domain/errors';

// =============================================================================
// AWS Adapter Implementation
// =============================================================================

/**
 * AWS Rekognition adapter implementing FaceService interface.
 *
 * Wraps existing rekognition client functions and translates to domain models.
 */
export class AWSFaceAdapter implements FaceService {
  constructor(
    private client: RekognitionClient,
    private db: InternalDatabase
  ) {}

  /**
   * Index faces from a photo using AWS Rekognition.
   *
   * Uses indexFacesSafe from lib/rekognition/client.ts for typed error handling.
   * Maps AWSRekognitionError to FaceServiceError.
   */
  async indexPhoto(params: IndexPhotoParams): Promise<ResultAsync<PhotoIndexed, FaceServiceError>> {
    // Use indexFacesSafe for typed error handling
    const indexResult = await indexFacesSafe(
      this.client,
      params.eventId,
      params.imageData,
      params.photoId
    );

    if (indexResult.isErr()) {
      return err(awsProviderFailed(indexResult.error));
    }

    const result = indexResult.value;

    // Translate to domain model
    const translatedFaces = result.faceRecords.map((record) =>
      this.translateFaceRecord(record, params.photoId)
    );

    const translatedUnindexed = result.unindexedFaces.map((face) =>
      this.translateUnindexedFace(face)
    );

    // Store in database with provider='aws'
    if (translatedFaces.length > 0) {
      const storeResult = await this.storeFaces(params.eventId, params.photoId, result.faceRecords);
      if (storeResult.isErr()) {
        return err(storeResult.error);
      }
    }

    return ok({
      faces: translatedFaces,
      unindexedFaces: translatedUnindexed,
      modelVersion: result.faceModelVersion,
      provider: 'aws',
    });
  }

  /**
   * Find similar faces using AWS SearchFacesByImage.
   *
   * NOTE: This requires implementing SearchFacesByImage in the rekognition client.
   * For now, this is a stub that returns an error.
   */
  async findSimilarFaces(params: FindSimilarParams): Promise<ResultAsync<SimilarFace[], FaceServiceError>> {
    // TODO: Implement AWS SearchFacesByImage
    // This would call AWS Rekognition SearchFacesByImage API
    return err(sabaifaceProviderFailed(new Error('findSimilarFaces not yet implemented for AWS adapter')));
  }

  /**
   * Delete faces from AWS collection.
   *
   * NOTE: This requires implementing DeleteFaces in the rekognition client.
   * For now, this is a stub that returns an error.
   */
  async deleteFaces(eventId: string, faceIds: string[]): Promise<ResultAsync<void, FaceServiceError>> {
    // TODO: Implement AWS DeleteFaces
    // This would call AWS Rekognition DeleteFaces API
    return err(sabaifaceProviderFailed(new Error('deleteFaces not yet implemented for AWS adapter')));
  }

  /**
   * Delete AWS collection.
   *
   * Uses deleteCollectionSafe from lib/rekognition/client.ts.
   */
  async deleteCollection(eventId: string): Promise<ResultAsync<void, FaceServiceError>> {
    const result = await deleteCollectionSafe(this.client, eventId);
    if (result.isErr()) {
      return err(awsProviderFailed(result.error));
    }
    return ok(undefined);
  }

  /**
   * Create AWS collection.
   *
   * Uses createCollectionSafe from lib/rekognition/client.ts.
   */
  async createCollection(eventId: string): Promise<ResultAsync<string, FaceServiceError>> {
    const result = await createCollectionSafe(this.client, eventId);
    if (result.isErr()) {
      return err(awsProviderFailed(result.error));
    }
    return ok(result.value);
  }

  // =============================================================================
  // Translation Helpers
  // =============================================================================

  /**
   * Translate AWS FaceRecord to domain Face model.
   */
  private translateFaceRecord(record: AWSFaceRecord, photoId: string): Face {
    const awsFace = record.Face;
    const awsDetail = record.FaceDetail;

    if (!awsFace) {
      throw new Error('FaceRecord missing Face object');
    }

    return {
      faceId: awsFace.FaceId ?? '',
      boundingBox: this.normalizeBox(awsFace.BoundingBox),
      confidence: this.normalizeConfidence(awsFace.Confidence),
      externalImageId: photoId,
      attributes: this.extractAttributes(awsDetail),
      provider: 'aws',
    };
  }

  /**
   * Translate AWS UnindexedFace to domain model.
   */
  private translateUnindexedFace(face: AWSUnindexedFace): UnindexedFace {
    return {
      faceDetail: face.FaceDetail
        ? {
            boundingBox: this.normalizeBox(face.FaceDetail.BoundingBox),
            confidence: this.normalizeConfidence(face.FaceDetail.Confidence),
          }
        : undefined,
      reasons: face.Reasons?.map((r) => String(r)) ?? [],
    };
  }

  /**
   * Normalize AWS BoundingBox to domain BoundingBox.
   * AWS uses Width/Height/Left/Top (capitalized)
   * Domain uses width/height/left/top (lowercase)
   */
  private normalizeBox(box?: AWSBoundingBox): BoundingBox {
    return {
      width: box?.Width ?? 0,
      height: box?.Height ?? 0,
      left: box?.Left ?? 0,
      top: box?.Top ?? 0,
    };
  }

  /**
   * Normalize AWS confidence (0-100) to domain confidence (0-1).
   */
  private normalizeConfidence(confidence?: number): number {
    if (confidence === undefined) return 0;
    return confidence / 100;
  }

  /**
   * Extract face attributes from AWS FaceDetail.
   * Converts AWS capitalized fields to domain lowercase fields.
   */
  private extractAttributes(detail?: AWSFaceDetail): FaceAttributes | undefined {
    if (!detail) return undefined;

    return {
      age: detail.AgeRange
        ? {
            low: detail.AgeRange.Low,
            high: detail.AgeRange.High,
          }
        : undefined,
      gender: detail.Gender
        ? {
            value: detail.Gender.Value ?? '',
            confidence: this.normalizeConfidence(detail.Gender.Confidence),
          }
        : undefined,
      emotions: detail.Emotions?.map((e) => ({
        type: e.Type ?? '',
        confidence: this.normalizeConfidence(e.Confidence),
      })),
      smile: detail.Smile
        ? {
            value: detail.Smile.Value ?? false,
            confidence: this.normalizeConfidence(detail.Smile.Confidence),
          }
        : undefined,
      eyeglasses: detail.Eyeglasses
        ? {
            value: detail.Eyeglasses.Value ?? false,
            confidence: this.normalizeConfidence(detail.Eyeglasses.Confidence),
          }
        : undefined,
      sunglasses: detail.Sunglasses
        ? {
            value: detail.Sunglasses.Value ?? false,
            confidence: this.normalizeConfidence(detail.Sunglasses.Confidence),
          }
        : undefined,
      beard: detail.Beard
        ? {
            value: detail.Beard.Value ?? false,
            confidence: this.normalizeConfidence(detail.Beard.Confidence),
          }
        : undefined,
      mustache: detail.Mustache
        ? {
            value: detail.Mustache.Value ?? false,
            confidence: this.normalizeConfidence(detail.Mustache.Confidence),
          }
        : undefined,
      eyesOpen: detail.EyesOpen
        ? {
            value: detail.EyesOpen.Value ?? false,
            confidence: this.normalizeConfidence(detail.EyesOpen.Confidence),
          }
        : undefined,
      mouthOpen: detail.MouthOpen
        ? {
            value: detail.MouthOpen.Value ?? false,
            confidence: this.normalizeConfidence(detail.MouthOpen.Confidence),
          }
        : undefined,
    };
  }

  /**
   * Store faces in database with provider='aws'.
   * Note: AWS adapter stores minimal metadata since vectors are managed by AWS.
   *
   * Returns ResultAsync for error handling.
   */
  private async storeFaces(
    eventId: string,
    photoId: string,
    faceRecords: AWSFaceRecord[]
  ): Promise<ResultAsync<void, FaceServiceError>> {
    const faceRows = faceRecords.map((record) => {
      const awsFace = record.Face;
      const awsDetail = record.FaceDetail;

      // Build raw response (preserving AWS structure)
      const rawResponse: AWSRawResponse = {
        Face: awsFace
          ? {
              FaceId: awsFace.FaceId,
              BoundingBox: awsFace.BoundingBox,
              ImageId: awsFace.ImageId,
              ExternalImageId: awsFace.ExternalImageId,
              Confidence: awsFace.Confidence,
              IndexFacesModelVersion: awsFace.IndexFacesModelVersion,
            }
          : undefined,
        FaceDetail: awsDetail
          ? {
              BoundingBox: awsDetail.BoundingBox,
              AgeRange: awsDetail.AgeRange,
              Smile: awsDetail.Smile,
              Eyeglasses: awsDetail.Eyeglasses,
              Sunglasses: awsDetail.Sunglasses,
              Gender: awsDetail.Gender,
              Beard: awsDetail.Beard,
              Mustache: awsDetail.Mustache,
              EyesOpen: awsDetail.EyesOpen,
              MouthOpen: awsDetail.MouthOpen,
              Emotions: awsDetail.Emotions,
              Landmarks: awsDetail.Landmarks,
              Pose: awsDetail.Pose,
              Quality: awsDetail.Quality,
              Confidence: awsDetail.Confidence,
              FaceOccluded: awsDetail.FaceOccluded,
              EyeDirection: awsDetail.EyeDirection,
            }
          : undefined,
      };

      return {
        id: awsFace?.FaceId || crypto.randomUUID(),
        eventId, // For internal DB tracking
        photoId, // Reference to main app photo
        provider: 'aws' as const,
        confidence: this.normalizeConfidence(awsFace?.Confidence)?.toString(),
        descriptor: null, // AWS manages vectors internally
        boundingBox: awsFace?.BoundingBox ? JSON.stringify(awsFace.BoundingBox) : null,
      };
    });

    // Insert face metadata to internal DB (AWS faces have null descriptor)
    const result = await ResultAsync.fromPromise(
      this.db.insert(faces).values(faceRows),
      (cause) => databaseError('insert_faces', cause)
    );

    if (result.isErr()) {
      return err(result.error);
    }

    return ok(undefined);
  }

  /**
   * Get AWS FaceId from domain faceId.
   * For AWS adapter, faceId IS the AWS FaceId.
   */
  private getAWSFaceId(faceId: string): string {
    return faceId;
  }
}
