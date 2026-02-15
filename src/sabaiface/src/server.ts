/**
 * SabaiFace HTTP Server
 *
 * AWS Rekognition-compatible HTTP API using Hono.
 */

import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createFaceService } from './factory/face-service-factory';
import { createInternalDb } from './db';
import { createCollectionsRouter } from './api/routes/collections';
import { createFacesRouter } from './api/routes/faces';
import { errorHandler, requestLogger, cors } from './api/middleware';
import { FaceDetector } from './core/face-detector';
import type { FaceService } from './domain/face-service';

// =============================================================================
// Configuration
// =============================================================================

const PORT = parseInt(process.env.PORT || '8086');
const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/sabaiface';
const MODELS_PATH = process.env.MODELS_PATH || './models';

// =============================================================================
// ML Tuning Parameters (Low False-Positive Defaults)
// =============================================================================
// These parameters are tuned for production use with emphasis on precision
// over recall - better to miss a match than return a wrong one.

/** Minimum cosine similarity for face search matches (0-1). Higher = stricter. */
const SEARCH_MIN_SIMILARITY = Math.max(
  0,
  Math.min(1, parseFloat(process.env.SEARCH_MIN_SIMILARITY || '0.97')),
);

/** Quality filter mode for indexing: 'auto' filters low-quality faces, 'none' indexes all */
const INDEX_QUALITY_FILTER = (
  ['auto', 'none'].includes(process.env.INDEX_QUALITY_FILTER || '')
    ? process.env.INDEX_QUALITY_FILTER
    : 'none'
) as 'auto' | 'none';

/** Minimum detection confidence for indexing faces (0-1) */
const INDEX_MIN_CONFIDENCE = Math.max(
  0,
  Math.min(
    1,
    parseFloat(process.env.INDEX_MIN_CONFIDENCE || process.env.FACE_CONFIDENCE_THRESHOLD || '0.5'),
  ),
);

/**
 * Exported configuration for use by other modules.
 */
export const config = {
  PORT,
  DATABASE_URL,
  MODELS_PATH,
  // ML tuning
  SEARCH_MIN_SIMILARITY,
  INDEX_QUALITY_FILTER,
  INDEX_MIN_CONFIDENCE,
} as const;

// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize SabaiFace service.
 */
async function initializeFaceService(): Promise<FaceService> {
  console.log('[Server] Initializing SabaiFace provider...');

  const db = createInternalDb(DATABASE_URL);

  // Create and load face detector
  const detector = new FaceDetector({
    modelsPath: MODELS_PATH,
    minConfidence: parseFloat(process.env.FACE_CONFIDENCE_THRESHOLD || '0.5'),
    detectAttributes: process.env.DETECT_ATTRIBUTES !== 'false',
  });

  await detector.loadModels();

  // Create face service
  return createFaceService({
    provider: 'sabaiface',
    faceDetector: detector,
    db,
  });
}

// =============================================================================
// Server Startup
// =============================================================================

/**
 * Start the HTTP server.
 */
async function startServer() {
  console.log('[SabaiFace] Starting server...');
  console.log('[SabaiFace] Config:', {
    port: PORT,
    database: DATABASE_URL.replace(/:[^:@]+@/, ':****@'),
    modelsPath: MODELS_PATH,
    // ML tuning
    searchMinSimilarity: SEARCH_MIN_SIMILARITY,
    indexQualityFilter: INDEX_QUALITY_FILTER,
    indexMinConfidence: INDEX_MIN_CONFIDENCE,
  });

  // Initialize face service
  const faceService = await initializeFaceService();

  // Create Hono app
  const app = new Hono();

  // Global middleware (order matters!)
  app.use('*', cors);
  app.use('*', requestLogger);
  app.use('*', errorHandler);

  // Health check
  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
      service: 'sabaiface',
      provider: 'sabaiface',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  // API routes
  app.route('/collections', createCollectionsRouter(faceService));
  app.route('/collections', createFacesRouter(faceService));

  // 404 handler
  app.notFound((c) => {
    return c.json(
      {
        __type: 'ResourceNotFoundException',
        message: 'The requested resource was not found',
      },
      404,
    );
  });

  // Start HTTP server
  serve({
    fetch: app.fetch,
    port: PORT,
  });

  console.log(`[SabaiFace] Server ready on http://localhost:${PORT}`);
}

// Start server
startServer().catch((error) => {
  console.error('[SabaiFace] Failed to start server:', error);
  process.exit(1);
});
