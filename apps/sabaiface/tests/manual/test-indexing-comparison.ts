#!/usr/bin/env tsx
/**
 * Face Indexing Comparison Test
 *
 * Compares face indexing (indexFaces) between AWS Rekognition and SabaiFace
 * using the new SDK client.
 *
 * Tests:
 * - How many faces each provider can detect
 * - Detection accuracy against labeled ground truth
 * - Confidence scores
 *
 * Usage:
 *   pnpm test:indexing-compare
 *
 * Requirements:
 *   - .env file with AWS credentials and DATABASE_URL
 *   - SabaiFace server running (for SabaiFace tests)
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';

import { FaceRecognitionClient } from '../../client/src/index';
import type { FaceServiceError } from '../../client/src/types';

// =============================================================================
// Configuration
// =============================================================================

const FIXTURES_PATH = path.join(process.cwd(), 'tests/fixtures/images');
const LABELS_FILE = path.join(FIXTURES_PATH, 'labels.json');

interface ImageLabel {
  image: string;
  faceCount: number;
}

interface IndexingResult {
  image: string;
  expected: number;
  detected: number;
  confidences: number[];
  error?: string;
}

interface ProviderSummary {
  provider: 'aws' | 'sabaiface';
  results: IndexingResult[];
  totalExpected: number;
  totalDetected: number;
  exactMatches: number;
  avgConfidence: number;
}

// =============================================================================
// Test Functions
// =============================================================================

async function testProvider(
  provider: 'aws' | 'sabaiface',
  labels: ImageLabel[]
): Promise<ProviderSummary> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing ${provider.toUpperCase()}`);
  console.log('='.repeat(80));

  // Skip if credentials not available
  if (provider === 'aws' && !process.env.AWS_ACCESS_KEY_ID) {
    console.log('⚠️  AWS credentials not found. Skipping AWS tests.\n');
    return {
      provider,
      results: [],
      totalExpected: 0,
      totalDetected: 0,
      exactMatches: 0,
      avgConfidence: 0,
    };
  }

  if (provider === 'sabaiface' && !process.env.DATABASE_URL) {
    console.log('⚠️  DATABASE_URL not found. Skipping SabaiFace tests.\n');
    return {
      provider,
      results: [],
      totalExpected: 0,
      totalDetected: 0,
      exactMatches: 0,
      avgConfidence: 0,
    };
  }

  // Create client
  const client = new FaceRecognitionClient({
    provider,
    endpoint: process.env.SABAIFACE_ENDPOINT || 'http://localhost:8086',
    aws: {
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    },
  });

  // Create collection
  const eventId = `test-${provider}-${Date.now()}`;
  console.log(`Creating collection: ${ eventId}`);

  const collectionResult = await client.createCollection(eventId);
  if (collectionResult.isErr()) {
    console.log(`⚠️  Collection creation: ${collectionResult.error.type}`);
  } else {
    console.log(`✓ Created collection\n`);
  }

  const results: IndexingResult[] = [];
  let totalExpected = 0;
  let totalDetected = 0;
  let exactMatches = 0;
  const allConfidences: number[] = [];

  // Test each image
  for (const label of labels) {
    const imagePath = path.join(process.cwd(), label.image);
    const imageFilename = path.basename(label.image);

    try {
      const imageBuffer = fs.readFileSync(imagePath);

      const startTime = Date.now();
      const result = await client.indexPhoto({
        eventId,
        photoId: `photo-${imageFilename}`,
        imageData: imageBuffer.buffer,
        options: {
          maxFaces: 100,
          qualityFilter: 'auto',
        },
      });
      const duration = Date.now() - startTime;

      if (result.isErr()) {
        const error = result.error;
        console.log(`${imageFilename.padEnd(12)} ERROR: ${error.type}`);
        console.log(''.padEnd(14) + `  Details:`, error);
        if (error.type === 'provider_failed' && error.cause) {
          console.log(''.padEnd(14) + `  Cause:`, JSON.stringify(error.cause));
        }

        results.push({
          image: imageFilename,
          expected: label.faceCount,
          detected: 0,
          confidences: [],
          error: `${error.type}: ${JSON.stringify(error)}`,
        });
        continue;
      }

      const indexed = result.value;
      const detected = indexed.faces.length;
      const confidences = indexed.faces.map(f => f.confidence);
      const match = detected === label.faceCount;
      const symbol = match ? '✓' : '✗';

      console.log(
        `${imageFilename.padEnd(12)} expected ${label.faceCount}, ` +
        `detected ${detected} ${symbol} (${duration}ms)`
      );

      if (confidences.length > 0) {
        const avgConf = confidences.reduce((a, b) => a + b, 0) / confidences.length;
        console.log(''.padEnd(14) + `  Confidences: ${confidences.map(c => c.toFixed(2)).join(', ')} (avg: ${avgConf.toFixed(2)})`);
      }

      results.push({
        image: imageFilename,
        expected: label.faceCount,
        detected,
        confidences,
      });

      totalExpected += label.faceCount;
      totalDetected += detected;
      allConfidences.push(...confidences);
      if (match) exactMatches++;

    } catch (error) {
      console.log(`${imageFilename.padEnd(12)} UNEXPECTED ERROR: ${error.message}`);
      results.push({
        image: imageFilename,
        expected: label.faceCount,
        detected: 0,
        confidences: [],
        error: error.message,
      });
    }
  }

  // Calculate average confidence
  const avgConfidence = allConfidences.length > 0
    ? allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length
    : 0;

  // Print summary
  console.log(`\nSummary for ${provider}:`);
  console.log(`  Exact matches: ${exactMatches}/${labels.length} (${Math.round(exactMatches / labels.length * 100)}%)`);
  console.log(`  Total faces: expected ${totalExpected}, detected ${totalDetected}`);
  if (totalExpected > 0) {
    console.log(`  Detection rate: ${Math.round(totalDetected / totalExpected * 100)}%`);
  }
  console.log(`  Avg confidence: ${avgConfidence.toFixed(3)}`);

  return {
    provider,
    results,
    totalExpected,
    totalDetected,
    exactMatches,
    avgConfidence,
  };
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║           Face Indexing Comparison: AWS Rekognition vs SabaiFace           ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log('\nThis test compares how many faces each provider can detect in test images.\n');

  // Check if AWS should be skipped
  const skipAWS = process.env.SKIP_AWS === 'true' || process.env.SKIP_AWS === '1';
  if (skipAWS) {
    console.log('ℹ️  AWS tests skipped (SKIP_AWS=true)\n');
  }

  // Load labels
  const labels: ImageLabel[] = JSON.parse(fs.readFileSync(LABELS_FILE, 'utf-8'));

  // Skip images with 0 expected faces
  const validLabels = labels.filter(l => l.faceCount > 0);

  if (validLabels.length === 0) {
    console.error('❌ No labeled images found. Please label the images first.');
    console.error('   Run: pnpm label');
    process.exit(1);
  }

  console.log(`Testing with ${validLabels.length} labeled images\n`);

  // Test AWS (unless skipped)
  let awsResult: ProviderSummary;
  if (skipAWS) {
    awsResult = {
      provider: 'aws',
      results: [],
      totalExpected: 0,
      totalDetected: 0,
      exactMatches: 0,
      avgConfidence: 0,
    };
  } else {
    awsResult = await testProvider('aws', validLabels);
  }

  // Test SabaiFace
  const sabaiFaceResult = await testProvider('sabaiface', validLabels);

  // Skip comparison if no results
  if (awsResult.results.length === 0 && sabaiFaceResult.results.length === 0) {
    console.log('\n⚠️  No test results. Both providers were skipped.');
    console.log('   Make sure .env has credentials and DATABASE_URL is set.');
    console.log('   Set SKIP_AWS=true to skip AWS tests.\n');
    return;
  }

  // Print comparison
  console.log(`\n${'='.repeat(80)}`);
  console.log('COMPARISON RESULTS');
  console.log('='.repeat(80));
  console.log('');

  console.log('Provider    | Exact Matches | Detection Rate | Avg Confidence');
  console.log('-'.repeat(80));

  const printRow = (result: ProviderSummary) => {
    if (result.results.length === 0) {
      console.log(`${result.provider.padEnd(11)} | SKIPPED        | -               | -`);
      return;
    }

    const accuracy = Math.round((result.exactMatches / validLabels.length) * 100);
    const detectionRate = result.totalExpected > 0
      ? Math.round((result.totalDetected / result.totalExpected) * 100)
      : 0;
    const avgConf = result.avgConfidence.toFixed(3);

    console.log(
      `${result.provider.padEnd(11)} | ` +
      `${result.exactMatches}/${validLabels.length} (${accuracy}%)  | ` +
      `${result.totalDetected}/${result.totalExpected} (${detectionRate}%)   | ` +
      `${avgConf}`
    );
  };

  printRow(awsResult);
  printRow(sabaiFaceResult);

  // Winner
  if (awsResult.results.length > 0 && sabaiFaceResult.results.length > 0) {
    console.log('');
    if (sabaiFaceResult.exactMatches > awsResult.exactMatches) {
      console.log(`🏆 Winner: SabaiFace (+${sabaiFaceResult.exactMatches - awsResult.exactMatches} more exact matches)`);
    } else if (awsResult.exactMatches > sabaiFaceResult.exactMatches) {
      console.log(`🏆 Winner: AWS Rekognition (+${awsResult.exactMatches - sabaiFaceResult.exactMatches} more exact matches)`);
    } else {
      console.log(`🤝 Tie: Both providers have ${awsResult.exactMatches} exact matches`);
    }
  }

  // Per-image comparison
  if (awsResult.results.length > 0 && sabaiFaceResult.results.length > 0) {
    console.log(`\n${'='.repeat(80)}`);
    console.log('PER-IMAGE COMPARISON');
    console.log('='.repeat(80));
    console.log('');
    console.log('Image        | Expected | SabaiFace | AWS | Better');
    console.log('-'.repeat(80));

    for (let i = 0; i < validLabels.length; i++) {
      const label = validLabels[i];
      const sabaiFace = sabaiFaceResult.results[i];
      const aws = awsResult.results[i];

      if (sabaiFace.error || aws.error) {
        console.log(
          `${label.image.split('/').pop()?.padEnd(12)} | ` +
          `${label.faceCount.toString().padStart(8)} | ` +
          `${sabaiFace.error ? 'ERROR' : sabaiFace.detected.toString().padStart(9)} | ` +
          `${aws.error ? 'ERROR' : aws.detected.toString().padStart(3)} | ` +
          `-`
        );
        continue;
      }

      const sabaiFaceDiff = Math.abs(sabaiFace.detected - label.faceCount);
      const awsDiff = Math.abs(aws.detected - label.faceCount);

      let better = '=';
      if (sabaiFaceDiff < awsDiff) {
        better = 'SabaiFace';
      } else if (awsDiff < sabaiFaceDiff) {
        better = 'AWS';
      }

      const sabaiFaceStr = sabaiFace.detected.toString().padStart(9);
      const awsStr = aws.detected.toString().padStart(3);

      console.log(
        `${label.image.split('/').pop()?.padEnd(12)} | ` +
        `${label.faceCount.toString().padStart(8)} | ` +
        `${sabaiFaceStr} | ` +
        `${awsStr} | ` +
        `${better}`
      );
    }
  }

  console.log('\n✅ Test complete!\n');
}

main().catch(error => {
  console.error('\n❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
