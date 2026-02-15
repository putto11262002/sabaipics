import type { ResultAsync } from 'neverthrow';

export interface IndexPhotoRequest {
  eventId: string;
  photoId: string;
  imageData: ArrayBuffer;
  options?: {
    maxFaces?: number;
    qualityFilter?: 'auto' | 'none';
  };
}

export interface FindImagesByFaceRequest {
  eventId: string;
  imageData: ArrayBuffer;
  maxResults?: number;
  minSimilarity?: number;
}

export interface PhotoMatch {
  photoId: string;
  similarity: number;
  faceCount?: number;
}

export interface FindImagesByFaceResponse {
  photos: PhotoMatch[];
  totalMatchedFaces: number;
  provider: 'aws' | 'sabaiface';
}

export interface PhotoIndexed {
  faces: Array<{ faceId: string; externalImageId?: string }>;
  unindexedFaces: Array<{ reasons: string[] }>;
  modelVersion?: string;
  provider: 'aws' | 'sabaiface';
}

export type FaceServiceError =
  | {
      type: 'not_found';
      resource: 'collection' | 'face';
      id: string;
      retryable: false;
      throttle: false;
    }
  | { type: 'invalid_input'; field: string; reason: string; retryable: false; throttle: false }
  | {
      type: 'provider_failed';
      provider: 'aws' | 'sabaiface';
      retryable: boolean;
      throttle: boolean;
      cause: unknown;
      errorName?: string;
    };

export interface FaceRecognitionProvider {
  indexPhoto(request: IndexPhotoRequest): ResultAsync<PhotoIndexed, FaceServiceError>;
  findImagesByFace(
    request: FindImagesByFaceRequest,
  ): ResultAsync<FindImagesByFaceResponse, FaceServiceError>;
  deleteCollection(eventId: string): ResultAsync<void, FaceServiceError>;
  createCollection(eventId: string): ResultAsync<string, FaceServiceError>;
}
