#!/usr/bin/env tsx
/**
 * Manual Test Script for SabaiFace with Real Images
 *
 * Tests:
 * 1. Face detection accuracy (compare detected vs labeled face counts)
 * 2. Face indexing (store in database with vectors)
 * 3. Face search (find similar faces)
 * 4. End-to-end workflow
 */

import fs from 'fs';
import path from 'path';
import { createSabaiFaceService } from '../../src/factory/face-service-factory';
import { FaceDetector } from '../../src/core/face-detector';
import { createDb } from '@sabaipics/db';

// Configuration
const MODELS_PATH = path.join(process.cwd(), 'models');
const FIXTURES_PATH = path.join(process.cwd(), 'tests/fixtures/images');
const LABELS_FILE = path.join(FIXTURES_PATH, 'labels.json');
const TEST_COLLECTION = `test-collection-${Date.now()}`;

// Database connection
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  console.error('   Set it to your Neon connection string');
  process.exit(1);
}
const DATABASE_URL = process.env.DATABASE_URL;

interface ImageLabel {
  image: string;
  faceCount: number;
}

interface TestResult {
  image: string;
  expected: number;
  detected: number;
  match: boolean;
  duration: number;
  error?: string;
}

async function main() {
  console.log('SabaiFace Test\n');

  // Load labels
  const labels: ImageLabel[] = JSON.parse(fs.readFileSync(LABELS_FILE, 'utf-8'));

  // Initialize service
  const db = createDb(DATABASE_URL);
  const faceDetector = new FaceDetector({ modelsPath: MODELS_PATH });
  await faceDetector.loadModels();
  const faceService = createSabaiFaceService(faceDetector, db);

  const results: TestResult[] = [];
  let totalExpected = 0;
  let totalDetected = 0;
  let exactMatches = 0;

  for (const label of labels) {
    const imagePath = path.join(process.cwd(), label.image);
    const imageFilename = path.basename(label.image);

    try {
      const imageBuffer = fs.readFileSync(imagePath);

      // Index photo (no DB setup needed - photoId is nullable now)
      const result = await faceService.indexPhoto({
        eventId: TEST_COLLECTION,
        photoId: undefined, // photoId is nullable for testing
        imageData: imageBuffer.buffer,
        options: {
          maxFaces: 100,
          minConfidence: 0.5,
          detectAttributes: true,
        },
      });

      const detected = result.faces.length;
      const match = detected === label.faceCount;
      const symbol = match ? '✓' : '✗';

      console.log(`${imageFilename}: expected ${label.faceCount}, detected ${detected} ${symbol}`);

      results.push({
        image: imageFilename,
        expected: label.faceCount,
        detected,
        match,
        duration: 0,
      });

      totalExpected += label.faceCount;
      totalDetected += detected;
      if (match) exactMatches++;

    } catch (error) {
      console.log(`${imageFilename}: ERROR`);
      results.push({
        image: imageFilename,
        expected: label.faceCount,
        detected: 0,
        match: false,
        duration: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Print summary
  console.log(`\nSummary:`);
  console.log(`  Exact matches: ${exactMatches}/${labels.length} images (${Math.round(exactMatches / labels.length * 100)}%)`);
  console.log(`  Total faces: expected ${totalExpected}, detected ${totalDetected}`);
}

// Run tests
main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
