/**
 * Faces Router
 *
 * Handles face operations:
 * - POST /collections/:id/index-faces - Index faces from image
 * - POST /collections/:id/search-faces-by-image - Search for similar faces
 *
 * All routes use .match() for typed error handling with FaceServiceError.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { FaceService } from '../../domain/face-service';
import {
  IndexFacesRequestSchema,
  SearchFacesByImageRequestSchema,
  type IndexFacesResponse,
  type SearchFacesByImageResponse,
} from '../types';
import {
  toAWSIndexFacesResponse,
  toAWSFaceMatch,
  toAWSBoundingBox,
} from '../mappers';
import { errorToHttpStatus, errorMessage } from '../../domain/errors';

type StatusCode = 200 | 400 | 404 | 500 | 503;

/**
 * Create faces router.
 *
 * @param faceService - Face service instance
 * @returns Hono router
 */
export function createFacesRouter(faceService: FaceService) {
  const app = new Hono();

  /**
   * POST /collections/:id/index-faces
   * Index faces from an image.
   */
  app.post('/:id/index-faces', zValidator('json', IndexFacesRequestSchema), async (c) => {
    const collectionId = c.req.param('id');
    const body = c.req.valid('json');

    console.log(`[Faces] Received index-faces request for collection: ${collectionId}`);
    console.log(`[Faces] Request body keys:`, Object.keys(body));
    console.log(`[Faces] Has Image.Bytes:`, 'Bytes' in body.Image);
    console.log(`[Faces] Has ExternalImageId:`, 'ExternalImageId' in body);

    // Decode base64 image
    let imageBytes: Buffer;
    if ('Bytes' in body.Image) {
      try {
        imageBytes = Buffer.from(body.Image.Bytes, 'base64');
        console.log(`[Faces] Decoded image buffer, size: ${imageBytes.length} bytes`);
      } catch (e) {
        console.error('[Faces] Failed to decode base64 image:', e);
        return c.json(
          {
            StatusCode: 400,
            error: 'Failed to decode base64 image data',
          },
          400
        );
      }
    } else {
      // S3Object not supported yet
      console.error('[Faces] S3Object not supported');
      return c.json(
        {
          StatusCode: 400,
          error: 'S3Object image source not supported yet. Use Bytes instead.',
        },
        400
      );
    }

    // Convert Buffer to ArrayBuffer
    const imageData = imageBytes.buffer.slice(
      imageBytes.byteOffset,
      imageBytes.byteOffset + imageBytes.byteLength
    ) as ArrayBuffer;

    try {
      // Index photo with ResultAsync
      const resultAsync = await faceService.indexPhoto({
        eventId: collectionId,
        photoId: body.ExternalImageId || `photo-${Date.now()}`,
        imageData,
        options: {
          maxFaces: body.MaxFaces || 100,
          minConfidence: 0.5,
          qualityFilter: body.QualityFilter?.toLowerCase() as 'auto' | 'none' | undefined,
        },
      });

      // Use .match() to handle ResultAsync at HTTP boundary
      return resultAsync.match(
        (photoIndexed) => {
          // Convert to AWS format
          const response: IndexFacesResponse = toAWSIndexFacesResponse(photoIndexed, body.ExternalImageId);
          return c.json(response);
        },
        (err) => {
          // Log error for debugging
          console.error(`[Faces] Error indexing faces for collection ${collectionId}:`, {
            type: err.type,
            retryable: err.retryable,
            throttle: err.throttle,
            cause: err.cause,
          });

          const statusCode = errorToHttpStatus(err);
          return c.json(
            {
              StatusCode: statusCode,
              error: errorMessage(err),
              type: err.type,
              retryable: err.retryable,
              throttle: err.throttle,
            },
            statusCode as StatusCode
          );
        }
      );
    } catch (error) {
      console.error('[Faces] Unexpected error:', error);
      return c.json({ StatusCode: 500, error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' }, 500);
    }
  });

  /**
   * POST /collections/:id/search-faces-by-image
   * Search for faces similar to the query image.
   */
  app.post('/:id/search-faces-by-image', zValidator('json', SearchFacesByImageRequestSchema), async (c) => {
    const collectionId = c.req.param('id');
    const body = c.req.valid('json');

    // Decode base64 image
    const imageBytes = Buffer.from(body.Image.Bytes, 'base64');

    // Convert Buffer to ArrayBuffer
    const imageData = imageBytes.buffer.slice(
      imageBytes.byteOffset,
      imageBytes.byteOffset + imageBytes.byteLength
    ) as ArrayBuffer;

    try {
      // Search for similar faces with ResultAsync
      const resultAsync = await faceService.findSimilarFaces({
        eventId: collectionId,
        imageData,
        maxResults: body.MaxFaces || 10,
        minSimilarity: (body.FaceMatchThreshold || 80) / 100, // AWS: 0-100 → Domain: 0-1
      });

      // Use .match() to handle ResultAsync at HTTP boundary
      return resultAsync.match(
        (matches) => {
          // Get search face info (detect face in query image first)
          // For now, use first match's bounding box
          const searchedFace = matches.length > 0 ? matches[0] : null;

          const response: SearchFacesByImageResponse = {
            SearchedFaceBoundingBox: searchedFace?.boundingBox
              ? toAWSBoundingBox(searchedFace.boundingBox)
              : undefined,
            SearchedFaceConfidence: searchedFace ? (searchedFace.confidence ?? 1.0) * 100 : undefined,
            FaceMatches: matches.map(toAWSFaceMatch),
            FaceModelVersion: 'face-api.js-1.7.15',
          };

          return c.json(response);
        },
        (err) => {
          const statusCode = errorToHttpStatus(err);
          return c.json(
            {
              StatusCode: statusCode,
              error: errorMessage(err),
              type: err.type,
              retryable: err.retryable,
              throttle: err.throttle,
            },
            statusCode as StatusCode
          );
        }
      );
    } catch (error) {
      return c.json({ StatusCode: 500, error: 'Internal server error' }, 500);
    }
  });

  return app;
}
