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
    const externalImageId = body.ExternalImageId || `photo-${Date.now()}`;

    console.log('[Faces] IndexFaces request:', {
      collectionId,
      externalImageId,
      maxFaces: body.MaxFaces || 100,
      qualityFilter: body.QualityFilter || 'AUTO',
    });

    // Decode base64 image
    let imageBytes: Buffer;
    if ('Bytes' in body.Image) {
      try {
        imageBytes = Buffer.from(body.Image.Bytes, 'base64');
        console.log('[Faces] Image decoded:', { size: imageBytes.length, externalImageId });
      } catch (e) {
        console.error('[Faces] Failed to decode base64 image:', { externalImageId, error: e });
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
      console.error('[Faces] S3Object not supported:', { externalImageId });
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
      const result = await faceService.indexPhoto({
        eventId: collectionId,
        photoId: externalImageId,
        imageData,
        options: {
          maxFaces: body.MaxFaces || 100,
          minConfidence: 0.5,
          qualityFilter: body.QualityFilter?.toLowerCase() as 'auto' | 'none' | undefined,
        },
      });

      // Use .isOk() / .isErr() pattern for Hono type compatibility
      if (result.isOk()) {
        const indexed = result.value;
        console.log('[Faces] IndexFaces success:', {
          collectionId,
          externalImageId,
          facesIndexed: indexed.faces.length,
          unindexedFaces: indexed.unindexedFaces.length,
        });
        const response: IndexFacesResponse = toAWSIndexFacesResponse(indexed, body.ExternalImageId);
        return c.json(response);
      }

      // Handle error case
      const err = result.error;
      console.error('[Faces] IndexFaces failed:', {
        collectionId,
        externalImageId,
        error: err.type,
        retryable: err.retryable,
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
    } catch (error) {
      console.error('[Faces] IndexFaces unexpected error:', { collectionId, externalImageId, error });
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
    const maxFaces = body.MaxFaces || 10;
    const threshold = body.FaceMatchThreshold || 80;

    console.log('[Faces] SearchFacesByImage request:', {
      collectionId,
      maxFaces,
      threshold,
    });

    // Decode base64 image
    const imageBytes = Buffer.from(body.Image.Bytes, 'base64');
    console.log('[Faces] Search image decoded:', { size: imageBytes.length });

    // Convert Buffer to ArrayBuffer
    const imageData = imageBytes.buffer.slice(
      imageBytes.byteOffset,
      imageBytes.byteOffset + imageBytes.byteLength
    ) as ArrayBuffer;

    try {
      // Search for similar faces with ResultAsync
      const result = await faceService.findSimilarFaces({
        eventId: collectionId,
        imageData,
        maxResults: maxFaces,
        minSimilarity: threshold / 100, // AWS: 0-100 -> Domain: 0-1
      });

      // Use .isOk() / .isErr() pattern for Hono type compatibility
      if (result.isOk()) {
        const matches = result.value;
        console.log('[Faces] SearchFacesByImage success:', {
          collectionId,
          matchesFound: matches.length,
        });

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
      }

      // Handle error case
      const err = result.error;
      console.error('[Faces] SearchFacesByImage failed:', {
        collectionId,
        error: err.type,
        retryable: err.retryable,
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
    } catch (error) {
      console.error('[Faces] SearchFacesByImage unexpected error:', { collectionId, error });
      return c.json({ StatusCode: 500, error: 'Internal server error' }, 500);
    }
  });

  return app;
}
