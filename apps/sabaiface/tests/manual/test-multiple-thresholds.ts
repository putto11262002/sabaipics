#!/usr/bin/env tsx
/**
 * Test SabaiFace with Multiple Confidence Thresholds
 *
 * Runs face detection tests with different confidence thresholds
 * to find the optimal setting for accuracy.
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
const CONFIDENCE_THRESHOLDS = [0.3, 0.4, 0.5, 0.6, 0.7];

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

interface ThresholdResult {
  threshold: number;
  exactMatches: number;
  totalExpected: number;
  totalDetected: number;
  imageResults: Array<{
    image: string;
    expected: number;
    detected: number;
    match: boolean;
  }>;
}

async function testWithThreshold(
  threshold: number,
  labels: ImageLabel[]
): Promise<ThresholdResult> {
  const db = createDb(DATABASE_URL);
  const faceDetector = new FaceDetector({
    modelsPath: MODELS_PATH,
    minConfidence: threshold,
  });
  await faceDetector.loadModels();
  const faceService = createSabaiFaceService(faceDetector, db);

  let totalExpected = 0;
  let totalDetected = 0;
  let exactMatches = 0;
  const imageResults = [];

  for (const label of labels) {
    const imagePath = path.join(process.cwd(), label.image);
    const imageFilename = path.basename(label.image);

    try {
      const imageBuffer = fs.readFileSync(imagePath);

      const result = await faceService.indexPhoto({
        eventId: `test-threshold-${threshold}`,
        photoId: undefined,
        imageData: imageBuffer.buffer,
        options: {
          maxFaces: 100,
          minConfidence: threshold,
          detectAttributes: false, // Faster without attributes
        },
      });

      const detected = result.faces.length;
      const match = detected === label.faceCount;

      imageResults.push({
        image: imageFilename,
        expected: label.faceCount,
        detected,
        match,
      });

      totalExpected += label.faceCount;
      totalDetected += detected;
      if (match) exactMatches++;
    } catch (error) {
      imageResults.push({
        image: imageFilename,
        expected: label.faceCount,
        detected: 0,
        match: false,
      });
    }
  }

  return {
    threshold,
    exactMatches,
    totalExpected,
    totalDetected,
    imageResults,
  };
}

async function main() {
  console.log('SabaiFace Multi-Threshold Test\n');
  console.log('Testing confidence thresholds:', CONFIDENCE_THRESHOLDS.join(', '));
  console.log('');

  // Load labels
  const labels: ImageLabel[] = JSON.parse(fs.readFileSync(LABELS_FILE, 'utf-8'));

  const allResults: ThresholdResult[] = [];

  // Test each threshold
  for (const threshold of CONFIDENCE_THRESHOLDS) {
    console.log(`Testing threshold ${threshold}...`);
    const result = await testWithThreshold(threshold, labels);
    allResults.push(result);
  }

  // Print summary table
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log('');
  console.log('Threshold | Exact Matches | Total Detected | Accuracy');
  console.log('-'.repeat(80));

  for (const result of allResults) {
    const accuracy = Math.round((result.exactMatches / labels.length) * 100);
    const detectionRate = Math.round((result.totalDetected / result.totalExpected) * 100);
    console.log(
      `   ${result.threshold.toFixed(1)}    | ` +
      `    ${result.exactMatches}/${labels.length} (${accuracy}%)  | ` +
      `   ${result.totalDetected}/${result.totalExpected} (${detectionRate}%)   | ` +
      `${accuracy}%`
    );
  }

  // Find best threshold
  const bestResult = allResults.reduce((best, current) =>
    current.exactMatches > best.exactMatches ? current : best
  );

  console.log('');
  console.log(`Best threshold: ${bestResult.threshold} with ${bestResult.exactMatches}/${labels.length} exact matches`);

  // Show detailed results for best threshold
  console.log('\n' + '='.repeat(80));
  console.log(`DETAILED RESULTS FOR THRESHOLD ${bestResult.threshold}`);
  console.log('='.repeat(80));
  console.log('');

  for (const img of bestResult.imageResults) {
    const symbol = img.match ? '✓' : '✗';
    console.log(`${img.image.padEnd(12)} expected ${img.expected}, detected ${img.detected} ${symbol}`);
  }

  // Clean up test data
  console.log('\nCleaning up test data...');
  const db = createDb(DATABASE_URL);
  const { sql } = await import('drizzle-orm');
  await db.execute(sql`DELETE FROM faces WHERE provider = 'sabaiface'`);
  console.log('✅ Done');
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
