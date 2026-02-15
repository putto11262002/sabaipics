/**
 * Example: Using the Face Recognition SDK in API Routes
 *
 * This example shows how to use the SDK in your Hono API.
 */

import { Hono } from 'hono';
import { createDb } from '@/db';
import {
  createFaceClient,
  InvalidImageError,
  NoFacesDetectedError,
  FaceRecognitionError,
} from '../src/index';

// =============================================================================
// Initialize Face Recognition Client
// =============================================================================

const db = createDb(process.env.DATABASE_URL!);

const faceClient = createFaceClient({
  provider: 'sabaiface', // or 'aws'
  database: db,
  sabaiface: {
    minConfidence: 0.3, // Lower = detect more faces, higher = more conservative
  },
});

// =============================================================================
// API Routes
// =============================================================================

const app = new Hono();

/**
 * POST /events/:eventId/photos/:photoId/index
 * Index faces in a photo
 */
app.post('/events/:eventId/photos/:photoId/index', async (c) => {
  const { eventId, photoId } = c.req.param();
  const { imageUrl } = await c.req.json();

  try {
    const result = await faceClient.indexPhoto({
      eventId,
      photoId,
      imageUrl,
      options: {
        maxFaces: 100,
        detectAttributes: true,
      },
    });

    return c.json({
      success: true,
      facesDetected: result.faces.length,
      faces: result.faces.map((face) => ({
        faceId: face.faceId,
        confidence: face.confidence,
        boundingBox: face.boundingBox,
        attributes: face.attributes,
      })),
      unindexedFaces: result.unindexedFaces.length,
    });
  } catch (error) {
    if (error instanceof InvalidImageError) {
      return c.json({ error: error.message }, 400);
    }
    if (error instanceof NoFacesDetectedError) {
      return c.json({
        success: true,
        facesDetected: 0,
        faces: [],
      });
    }
    console.error('Failed to index photo:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * POST /events/:eventId/search
 * Search for similar faces
 */
app.post('/events/:eventId/search', async (c) => {
  const { eventId } = c.req.param();
  const { imageUrl, minSimilarity = 0.8, maxResults = 10 } = await c.req.json();

  try {
    const result = await faceClient.searchSimilar({
      eventId,
      imageUrl,
      minSimilarity,
      maxResults,
    });

    return c.json({
      success: true,
      matches: result.faces.map((face) => ({
        faceId: face.faceId,
        similarity: Math.round(face.similarity * 100), // Convert to percentage
        photoId: face.externalImageId,
        boundingBox: face.boundingBox,
      })),
      count: result.faces.length,
    });
  } catch (error) {
    if (error instanceof InvalidImageError) {
      return c.json({ error: error.message }, 400);
    }
    if (error instanceof NoFacesDetectedError) {
      return c.json({
        success: true,
        matches: [],
        count: 0,
      });
    }
    console.error('Failed to search faces:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * DELETE /events/:eventId/collection
 * Delete entire collection (all faces for an event)
 */
app.delete('/events/:eventId/collection', async (c) => {
  const { eventId } = c.req.param();

  try {
    await faceClient.deleteCollection(eventId);

    return c.json({
      success: true,
      message: `Collection ${eventId} deleted`,
    });
  } catch (error) {
    console.error('Failed to delete collection:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * POST /events/:eventId/collection
 * Create a new collection for an event
 */
app.post('/events/:eventId/collection', async (c) => {
  const { eventId } = c.req.param();

  try {
    const collectionId = await faceClient.createCollection(eventId);

    return c.json({
      success: true,
      collectionId,
    });
  } catch (error) {
    console.error('Failed to create collection:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// =============================================================================
// Background Job Example
// =============================================================================

/**
 * Background job: Index a photo after upload
 */
async function indexPhotoJob(eventId: string, photoId: string, imageUrl: string) {
  console.log(`[Job] Indexing photo ${photoId} for event ${eventId}`);

  try {
    const result = await faceClient.indexPhoto({
      eventId,
      photoId,
      imageUrl,
      options: {
        maxFaces: 100,
        detectAttributes: true,
      },
    });

    console.log(`[Job] Indexed ${result.faces.length} faces in photo ${photoId}`);

    // Update photo metadata in database
    // await updatePhotoMetadata(photoId, {
    //   faceCount: result.faces.length,
    //   indexed: true,
    // });

    return {
      success: true,
      facesDetected: result.faces.length,
    };
  } catch (error) {
    console.error(`[Job] Failed to index photo ${photoId}:`, error);

    // Mark photo as failed
    // await updatePhotoMetadata(photoId, {
    //   indexed: false,
    //   indexError: error.message,
    // });

    throw error;
  }
}

// =============================================================================
// Export
// =============================================================================

export default app;
export { indexPhotoJob };
