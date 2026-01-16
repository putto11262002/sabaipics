/**
 * Collections Router
 *
 * Handles collection management operations:
 * - POST /collections - Create collection
 * - DELETE /collections/:id - Delete collection
 *
 * All routes use .match() for typed error handling with FaceServiceError.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { FaceService } from '../../domain/face-service';
import {
  CreateCollectionRequestSchema,
  type CreateCollectionResponse,
  type DeleteCollectionResponse,
} from '../types';
import { errorToHttpStatus, errorMessage } from '../../domain/errors';

type StatusCode = 200 | 400 | 404 | 500 | 503;

/**
 * Create collections router.
 *
 * @param faceService - Face service instance
 * @returns Hono router
 */
export function createCollectionsRouter(faceService: FaceService) {
  const app = new Hono();

  /**
   * POST /collections
   * Create a new face collection.
   */
  app.post('/', zValidator('json', CreateCollectionRequestSchema), async (c) => {
    const { CollectionId } = c.req.valid('json');

    try {
      // Create collection with ResultAsync
      const result = await faceService.createCollection(CollectionId);

      // Use .isOk() / .isErr() pattern for Hono type compatibility
      if (result.isOk()) {
        const response: CreateCollectionResponse = {
          StatusCode: 200,
          CollectionArn: result.value,
          FaceModelVersion: 'face-api.js-1.7.15',
        };
        return c.json(response);
      }

      // Handle error case
      const err = result.error;
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
      return c.json({ StatusCode: 500, error: 'Internal server error' }, 500);
    }
  });

  /**
   * DELETE /collections/:id
   * Delete a collection and all its faces.
   */
  app.delete('/:id', async (c) => {
    const collectionId = c.req.param('id');

    try {
      // Delete collection with ResultAsync
      const result = await faceService.deleteCollection(collectionId);

      // Use .isOk() / .isErr() pattern for Hono type compatibility
      if (result.isOk()) {
        const response: DeleteCollectionResponse = {
          StatusCode: 200,
        };
        return c.json(response);
      }

      // Handle error case
      const err = result.error;
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
      return c.json({ StatusCode: 500, error: 'Internal server error' }, 500);
    }
  });

  return app;
}
