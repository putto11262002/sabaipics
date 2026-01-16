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
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/sabaiface';
const MODELS_PATH = process.env.MODELS_PATH || './models';

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
  console.log('🚀 SabaiFace API starting...');
  console.log(`   Database: ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);

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
    return c.json({
      __type: 'ResourceNotFoundException',
      message: 'The requested resource was not found',
    }, 404);
  });

  // Start HTTP server
  serve({
    fetch: app.fetch,
    port: PORT,
  });

  console.log(`✅ SabaiFace API ready on http://localhost:${PORT}`);
}

// Start server
startServer().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
