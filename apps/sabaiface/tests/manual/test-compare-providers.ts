#!/usr/bin/env tsx
/**
 * Compare SabaiFace vs AWS Rekognition
 *
 * Runs both providers on the same test set and compares results.
 * Uses SabaiFace with 0.3 threshold and AWS with default settings.
 */

import fs from 'fs';
import path from 'path';
import { createFaceClient } from '../../src/sdk';
import { createDb } from '@sabaipics/db';
import { sql } from 'drizzle-orm';

// Configuration
const FIXTURES_PATH = path.join(process.cwd(), 'tests/fixtures/images');
const LABELS_FILE = path.join(FIXTURES_PATH, 'labels.json');

// Database connection
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const db = createDb(process.env.DATABASE_URL);

interface ImageLabel {
  image: string;
  faceCount: number;
}

interface ProviderResult {
  provider: 'sabaiface' | 'aws';
  exactMatches: number;
  totalExpected: number;
  totalDetected: number;
  imageResults: Array<{
    image: string;
    expected: number;
    detected: number;
    match: boolean;
    error?: string;
  }>;
}

async function testProvider(
  provider: 'sabaiface' | 'aws',
  labels: ImageLabel[]
): Promise<ProviderResult> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing ${provider.toUpperCase()}`);
  console.log('='.repeat(80));

  // Create client for this provider
  const client = createFaceClient({
    provider,
    database: db,
    sabaiface: provider === 'sabaiface' ? {
      minConfidence: 0.3,
    } : undefined,
    aws: provider === 'aws' ? {
      region: process.env.AWS_REGION || 'us-east-1',
    } : undefined,
  });

  // Create collection
  const eventId = `test-${provider}-${Date.now()}`;
  try {
    await client.createCollection(eventId);
    console.log(`✓ Created collection: ${eventId}\n`);
  } catch (error) {
    console.log(`ℹ Collection creation: ${error.message}\n`);
  }

  let totalExpected = 0;
  let totalDetected = 0;
  let exactMatches = 0;
  const imageResults = [];

  // Test each image
  for (const label of labels) {
    const imagePath = path.join(process.cwd(), label.image);
    const imageFilename = path.basename(label.image);

    try {
      const imageBuffer = fs.readFileSync(imagePath);

      const result = await client.indexPhoto({
        eventId,
        photoId: `photo-${imageFilename}`,
        imageBuffer,
        options: {
          maxFaces: 100,
          detectAttributes: false, // Faster
        },
      });

      const detected = result.faces.length;
      const match = detected === label.faceCount;
      const symbol = match ? '✓' : '✗';

      console.log(`${imageFilename.padEnd(12)} expected ${label.faceCount}, detected ${detected} ${symbol}`);

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
      console.log(`${imageFilename.padEnd(12)} ERROR: ${error.message}`);
      imageResults.push({
        image: imageFilename,
        expected: label.faceCount,
        detected: 0,
        match: false,
        error: error.message,
      });
    }
  }

  console.log(`\nResults:`);
  console.log(`  Exact matches: ${exactMatches}/${labels.length} (${Math.round(exactMatches / labels.length * 100)}%)`);
  console.log(`  Total faces: expected ${totalExpected}, detected ${totalDetected} (${Math.round(totalDetected / totalExpected * 100)}%)`);

  return {
    provider,
    exactMatches,
    totalExpected,
    totalDetected,
    imageResults,
  };
}

async function main() {
  console.log('SabaiFace vs AWS Rekognition Comparison\n');

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

  // Test both providers
  const sabaiFaceResult = await testProvider('sabaiface', validLabels);
  const awsResult = await testProvider('aws', validLabels);

  // Print comparison
  console.log(`\n${'='.repeat(80)}`);
  console.log('COMPARISON');
  console.log('='.repeat(80));
  console.log('');

  // Summary table
  console.log('Provider   | Exact Matches | Detection Rate | Accuracy');
  console.log('-'.repeat(80));

  const printRow = (result: ProviderResult) => {
    const accuracy = Math.round((result.exactMatches / validLabels.length) * 100);
    const detectionRate = Math.round((result.totalDetected / result.totalExpected) * 100);
    console.log(
      `${result.provider.padEnd(10)} | ` +
      `${result.exactMatches}/${validLabels.length} (${accuracy}%)  | ` +
      `${result.totalDetected}/${result.totalExpected} (${detectionRate}%)   | ` +
      `${accuracy}%`
    );
  };

  printRow(sabaiFaceResult);
  printRow(awsResult);

  // Winner
  console.log('');
  if (sabaiFaceResult.exactMatches > awsResult.exactMatches) {
    console.log(`🏆 Winner: SabaiFace (+${sabaiFaceResult.exactMatches - awsResult.exactMatches} more exact matches)`);
  } else if (awsResult.exactMatches > sabaiFaceResult.exactMatches) {
    console.log(`🏆 Winner: AWS Rekognition (+${awsResult.exactMatches - sabaiFaceResult.exactMatches} more exact matches)`);
  } else {
    console.log(`🤝 Tie: Both providers have ${sabaiFaceResult.exactMatches} exact matches`);
  }

  // Detailed comparison per image
  console.log(`\n${'='.repeat(80)}`);
  console.log('PER-IMAGE COMPARISON');
  console.log('='.repeat(80));
  console.log('');
  console.log('Image        | Expected | SabaiFace | AWS | Better');
  console.log('-'.repeat(80));

  for (let i = 0; i < validLabels.length; i++) {
    const label = validLabels[i];
    const sabaiFace = sabaiFaceResult.imageResults[i];
    const aws = awsResult.imageResults[i];

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

  // Clean up
  console.log('\nCleaning up test data...');
  await db.execute(sql`DELETE FROM faces WHERE provider = 'sabaiface'`);
  await db.execute(sql`DELETE FROM faces WHERE provider = 'aws'`);
  console.log('✅ Done');
}

main().catch(error => {
  console.error('\n❌ Error:', error.message);
  if (error.code === 'ResourceNotFoundException') {
    console.error('\nℹ AWS collection not found. This is normal for first-time setup.');
  }
  process.exit(1);
});
