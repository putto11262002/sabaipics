#!/usr/bin/env tsx
/**
 * SabaiFace vs AWS Recognition Comparison (via API)
 *
 * Compares face recognition accuracy between:
 * - SabaiFace service (via HTTP API)
 * - AWS Rekognition (via AWS SDK)
 *
 * This test validates the SabaiFace API against AWS Rekognition directly.
 *
 * Usage:
 *   1. Start the server: pnpm dev
 *   2. Run the test: pnpm test:aws-vs-recognition
 *
 * Environment:
 *   SABAIFACE_ENDPOINT=http://localhost:8086
 *   AWS_REGION=...
 *   AWS_ACCESS_KEY_ID=...
 *   AWS_SECRET_ACCESS_KEY=...
 */

import { promises as fs } from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { SabaiFaceHTTPClient, createAWSRekognitionClient, type AWSRekognitionClient } from '../../client/src';
import type { IndexPhotoRequest, FindSimilarRequest } from '../../client/src/types';

// Load environment variables
dotenv.config();

// =============================================================================
// Configuration
// =============================================================================

// Prefer locally generated ground-truth with full paths, fall back to sample
const GROUND_TRUTH_LOCAL = path.join(
  process.cwd(),
  'tests/fixtures/eval/dataset/recognition/ground-truth.local.json'
);
const GROUND_TRUTH_SAMPLE = path.join(
  process.cwd(),
  'tests/fixtures/eval/dataset/recognition/ground-truth.sample.json'
);

// Determine which ground-truth file to use
async function getGroundTruthPath(): Promise<string> {
  try {
    await fs.access(GROUND_TRUTH_LOCAL);
    return GROUND_TRUTH_LOCAL;
  } catch {
    return GROUND_TRUTH_SAMPLE;
  }
}

const SABAIFACE_COLLECTION_ID = `eval-sabaiface-${Date.now()}`;
const AWS_COLLECTION_ID = `eval-aws-${Date.now()}`;
const MAX_RESULTS = 10;
const MIN_SIMILARITY = 0.4; // 40% similarity

// =============================================================================
// Types
// =============================================================================

interface GroundTruth {
  metadata: {
    datasetPath?: string;
    generatedAt?: string;
    numPeople: number;
    imagesPerPerson: number;
    indexSize: number;
    querySize: number;
    totalUniqueIndexImages: number;
    totalQueryImages: number;
  };
  // New format with paths
  indexSet: Array<{ name: string; path: string }> | string[];
  identities: {
    [personId: string]: {
      personId: number;
      name: string;
      indexImages: string[];
      indexImagePaths?: string[];
      queryImages: string[];
      queryImagePaths?: string[];
      containedInIndexImages: string[];
      containedInIndexPaths?: string[];
    };
  };
}

interface QueryResult {
  provider: 'sabaiface' | 'aws';
  queryImage: string;
  queryPersonId: number;
  expectedImages: string[];
  results: Array<{
    image: string;
    similarity?: number;
  }>;
  duration: number;
}

interface ComparisonMetrics {
  provider: string;
  rank1Accuracy: number;
  rank5Accuracy: number;
  meanReciprocalRank: number;
  avgSearchTime: number;
}

// =============================================================================
// Client Setup
// =============================================================================

function createSabaiFaceClient(): SabaiFaceHTTPClient {
  const endpoint = process.env.SABAIFACE_ENDPOINT || 'http://localhost:8086';
  return new SabaiFaceHTTPClient({ endpoint });
}

function createAWSClient(): AWSRekognitionClient {
  return createAWSRekognitionClient({
    region: process.env.AWS_REGION || 'us-west-2',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });
}

// =============================================================================
// Image Loading
// =============================================================================

async function loadImage(imagePath: string): Promise<ArrayBuffer> {
  const buffer = await fs.readFile(imagePath);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

// =============================================================================
// AWS Operations (via client library)
// =============================================================================

async function createAWSCollection(client: AWSRekognitionClient): Promise<boolean> {
  const result = await client.createCollection(AWS_COLLECTION_ID);
  if (result.isErr()) {
    const error = result.error;
    // Collection might already exist - check error type
    if (error.type === 'provider_failed' && 'cause' in error) {
      const cause = error.cause as any;
      if (cause.__type === 'ResourceAlreadyExistsException') {
        console.log(`  ⚠️  AWS collection already exists: ${AWS_COLLECTION_ID}`);
        return true;
      }
    }
    console.error(`  ⚠️  Failed to create AWS collection:`, error);
    return false;
  }
  console.log(`  ✅ Created AWS collection: ${AWS_COLLECTION_ID}`);
  return true;
}

async function indexFacesAWS(client: AWSRekognitionClient, imageBuffer: ArrayBuffer, imageName: string) {
  const startTime = Date.now();

  const request: IndexPhotoRequest = {
    eventId: AWS_COLLECTION_ID,
    photoId: imageName,
    imageData: imageBuffer,
    options: { maxFaces: 100, qualityFilter: 'auto' },
  };

  const result = await client.indexPhoto(request);
  const duration = Date.now() - startTime;

  if (result.isErr()) {
    return {
      success: false,
      faceCount: 0,
      error: result.error.type,
      duration,
    };
  }

  return {
    success: true,
    faceCount: result.value.faces.length,
    duration,
  };
}

async function searchFacesAWS(client: AWSRekognitionClient, imageBuffer: ArrayBuffer) {
  const startTime = Date.now();

  const request: FindSimilarRequest = {
    eventId: AWS_COLLECTION_ID,
    imageData: imageBuffer,
    maxResults: MAX_RESULTS,
    minSimilarity: MIN_SIMILARITY,
  };

  const result = await client.findSimilarFaces(request);
  const duration = Date.now() - startTime;

  if (result.isErr()) {
    return {
      success: false,
      results: [],
      error: result.error.type,
      duration,
    };
  }

  return {
    success: true,
    results: result.value.map((face) => ({
      image: face.externalImageId || '',
      similarity: face.similarity,
    })),
    duration,
  };
}

async function deleteAWSCollection(client: AWSRekognitionClient) {
  const result = await client.deleteCollection(AWS_COLLECTION_ID);
  if (result.isErr()) {
    console.log(`  ⚠️  Failed to delete AWS collection:`, result.error.type);
  } else {
    console.log(`  ✅ Deleted AWS collection: ${AWS_COLLECTION_ID}`);
  }
}

// =============================================================================
// Metrics Calculation
// =============================================================================

function calculateMetrics(results: QueryResult[], provider: string): ComparisonMetrics {
  let rank1Correct = 0;
  let rank5Correct = 0;
  let reciprocalRankSum = 0;
  let totalSearchTime = 0;

  for (const result of results) {
    if (!result.results || result.results.length === 0) {
      reciprocalRankSum += 0;
      continue;
    }

    const { expectedImages, results: searchResults } = result;

    // Find rank of first correct image
    let correctRank = -1;
    for (let i = 0; i < searchResults.length; i++) {
      if (expectedImages.includes(searchResults[i].image)) {
        correctRank = i + 1;
        break;
      }
    }

    if (correctRank === 1) rank1Correct++;
    if (correctRank <= 5 && correctRank > 0) rank5Correct++;
    if (correctRank > 0) reciprocalRankSum += 1 / correctRank;

    totalSearchTime += result.duration;
  }

  return {
    provider,
    rank1Accuracy: rank1Correct / results.length,
    rank5Accuracy: rank5Correct / results.length,
    meanReciprocalRank: reciprocalRankSum / results.length,
    avgSearchTime: totalSearchTime / results.length,
  };
}

function displayComparison(sabaiFaceMetrics: ComparisonMetrics, awsMetrics: ComparisonMetrics) {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              SabaiFace vs AWS Recognition Comparison                         ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  console.log('\n📊 Accuracy Metrics:');
  console.log('┌────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ Metric              │ SabaiFace    │ AWS          │ Winner     │');
  console.log('├────────────────────────────────────────────────────────────────────────────┤');

  const rank1Winner = sabaiFaceMetrics.rank1Accuracy > awsMetrics.rank1Accuracy ? 'SabaiFace' :
                      awsMetrics.rank1Accuracy > sabaiFaceMetrics.rank1Accuracy ? 'AWS' : 'Tie';
  const sabaiRank1Str = `${(sabaiFaceMetrics.rank1Accuracy * 100).toFixed(1)}%`;
  const awsRank1Str = `${(awsMetrics.rank1Accuracy * 100).toFixed(1)}%`;
  console.log(`│ Rank-1 Accuracy     │ ${sabaiRank1Str.padEnd(12)} │ ${awsRank1Str.padEnd(12)} │ ${rank1Winner.padEnd(11)} │`);

  const rank5Winner = sabaiFaceMetrics.rank5Accuracy > awsMetrics.rank5Accuracy ? 'SabaiFace' :
                      awsMetrics.rank5Accuracy > sabaiFaceMetrics.rank5Accuracy ? 'AWS' : 'Tie';
  const sabaiRank5Str = `${(sabaiFaceMetrics.rank5Accuracy * 100).toFixed(1)}%`;
  const awsRank5Str = `${(awsMetrics.rank5Accuracy * 100).toFixed(1)}%`;
  console.log(`│ Rank-5 Accuracy     │ ${sabaiRank5Str.padEnd(12)} │ ${awsRank5Str.padEnd(12)} │ ${rank5Winner.padEnd(11)} │`);

  const mrrWinner = sabaiFaceMetrics.meanReciprocalRank > awsMetrics.meanReciprocalRank ? 'SabaiFace' :
                     awsMetrics.meanReciprocalRank > sabaiFaceMetrics.meanReciprocalRank ? 'AWS' : 'Tie';
  const sabaiMrrStr = sabaiFaceMetrics.meanReciprocalRank.toFixed(3);
  const awsMrrStr = awsMetrics.meanReciprocalRank.toFixed(3);
  console.log(`│ Mean Reciprocal Rank │ ${sabaiMrrStr.padEnd(12)} │ ${awsMrrStr.padEnd(12)} │ ${mrrWinner.padEnd(11)} │`);

  console.log('└────────────────────────────────────────────────────────────────────────────┘');

  console.log('\n⚡ Performance:');
  console.log('┌────────────────────────────────────────────────────────────────────────────┐');

  const speedWinner = sabaiFaceMetrics.avgSearchTime < awsMetrics.avgSearchTime ? 'SabaiFace' :
                     awsMetrics.avgSearchTime < sabaiFaceMetrics.avgSearchTime ? 'AWS' : 'Tie';
  const speedup = awsMetrics.avgSearchTime / sabaiFaceMetrics.avgSearchTime;

  const sabaiTimeStr = `${sabaiFaceMetrics.avgSearchTime.toFixed(0)} ms`;
  const awsTimeStr = `${awsMetrics.avgSearchTime.toFixed(0)} ms`;
  console.log(`│ Avg Search Time     │ ${sabaiTimeStr.padEnd(12)} │ ${awsTimeStr.padEnd(12)} │ ${speedWinner.padEnd(11)} │`);
  if (speedWinner === 'SabaiFace') {
    console.log(`│ Speedup             │ ${speedup.toFixed(1)}x faster${' '.repeat(26)} │`);
  } else {
    console.log(`│ Speedup             │ ${(1 / speedup).toFixed(1)}x faster${' '.repeat(26)} │`);
  }

  console.log('└────────────────────────────────────────────────────────────────────────────┘');
}

// =============================================================================
// Main Evaluation Flow
// =============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║           SabaiFace vs AWS Recognition Comparison                             ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log(`\nSabaiFace Collection: ${SABAIFACE_COLLECTION_ID}`);
  console.log(`AWS Collection: ${AWS_COLLECTION_ID}`);
  console.log(`SabaiFace Endpoint: ${process.env.SABAIFACE_ENDPOINT || 'http://localhost:8086'}`);
  console.log(`Min similarity: ${MIN_SIMILARITY}`);

  // Load ground truth
  console.log('\n📂 Loading ground truth...');
  const groundTruthPath = await getGroundTruthPath();
  const groundTruthJson = await fs.readFile(groundTruthPath, 'utf-8');
  const groundTruth: GroundTruth = JSON.parse(groundTruthJson);

  console.log(`  People: ${groundTruth.metadata.numPeople}`);
  console.log(`  Index images: ${groundTruth.metadata.totalUniqueIndexImages}`);
  console.log(`  Query images: ${groundTruth.metadata.totalQueryImages}`);

  // Setup clients
  console.log('\n🔌 Setting up clients...');
  const sabaiFaceClient = createSabaiFaceClient();
  const awsClient = createAWSClient();

  // ========================================================================
  // Phase 1: Index Faces (both providers)
  // ========================================================================
  console.log('\n📸 Indexing faces...');

  // SabaiFace indexing (via API)
  console.log('\n[SabaiFace] Creating collection and indexing faces...');
  const sabaiCreateResult = await sabaiFaceClient.createCollection(SABAIFACE_COLLECTION_ID);
  if (sabaiCreateResult.isErr()) {
    console.error('  ❌ Failed to create SabaiFace collection:', sabaiCreateResult.error);
    process.exit(1);
  }

  const sabaiFaceIndexStart = Date.now();
  let sabaiIndexedCount = 0;

  // Determine if using new format (with paths) or old format (with names)
  const usePathFormat = Array.isArray(groundTruth.indexSet) &&
    groundTruth.indexSet.length > 0 &&
    typeof groundTruth.indexSet[0] === 'object';

  for (const indexItem of groundTruth.indexSet) {
    const imageName = typeof indexItem === 'string' ? indexItem : (indexItem as { name: string }).name;
    const imagePath = typeof indexItem === 'string' ? null : (indexItem as { path: string }).path;

    try {
      const imageBuffer = imagePath
        ? await loadImage(imagePath)
        : await loadImage(path.join(process.cwd(), '../../../dataset', '10002', `${imageName}.jpg`));

      const request: IndexPhotoRequest = {
        eventId: SABAIFACE_COLLECTION_ID,
        photoId: imageName,
        imageData: imageBuffer,
        options: { maxFaces: 100, qualityFilter: 'auto' },
      };

      const result = await sabaiFaceClient.indexPhoto(request);
      if (result.isErr()) {
        console.error(`  ⚠️  ${imageName}: ${result.error.type}`);
        continue;
      }

      sabaiIndexedCount += result.value.faces.length;
    } catch (error: any) {
      console.error(`  ⚠️  ${imageName}: ${error.message}`);
    }
  }

  const sabaiFaceIndexTime = Date.now() - sabaiFaceIndexStart;
  console.log(`  ✅ Indexed ${sabaiIndexedCount} faces in ${sabaiFaceIndexTime}ms`);

  // AWS indexing
  console.log('\n[AWS] Creating collection and indexing faces...');
  const awsCollectionCreated = await createAWSCollection(awsClient);
  if (!awsCollectionCreated) {
    console.error('  ❌ Failed to create AWS collection');
    process.exit(1);
  }

  const awsIndexStart = Date.now();
  let awsIndexedCount = 0;
  let awsIndexErrors = 0;

  for (const indexItem of groundTruth.indexSet) {
    const imageName = typeof indexItem === 'string' ? indexItem : (indexItem as { name: string }).name;
    const imagePath = typeof indexItem === 'string' ? null : (indexItem as { path: string }).path;

    try {
      const imageBuffer = imagePath
        ? await loadImage(imagePath)
        : await loadImage(path.join(process.cwd(), '../../../dataset', '10002', `${imageName}.jpg`));
      const result = await indexFacesAWS(awsClient, imageBuffer, imageName);

      if (result.success) {
        awsIndexedCount += result.faceCount;
      } else {
        awsIndexErrors++;
        console.error(`  ⚠️  ${imageName}: ${result.error}`);
      }
    } catch (error: any) {
      awsIndexErrors++;
      console.error(`  ⚠️  ${imageName}: ${error.message}`);
    }
  }

  const awsIndexTime = Date.now() - awsIndexStart;
  console.log(`  ✅ Indexed ${awsIndexedCount} faces in ${awsIndexTime}ms`);
  if (awsIndexErrors > 0) {
    console.log(`  ⚠️  ${awsIndexErrors} images failed to index`);
  }

  // ========================================================================
  // Phase 2: Search Queries (both providers)
  // ========================================================================
  console.log('\n🔍 Running searches...');

  const sabaiFaceResults: QueryResult[] = [];
  const awsResults: QueryResult[] = [];

  for (const [personId, personData] of Object.entries(groundTruth.identities)) {
    for (let i = 0; i < personData.queryImages.length; i++) {
      const queryImageName = personData.queryImages[i];
      const queryImagePath = personData.queryImagePaths?.[i];

      const imageBuffer = queryImagePath
        ? await loadImage(queryImagePath)
        : await loadImage(path.join(process.cwd(), '../../../dataset', '10002', `${queryImageName}.jpg`));

      // SabaiFace search (via API)
      try {
        const request: FindSimilarRequest = {
          eventId: SABAIFACE_COLLECTION_ID,
          imageData: imageBuffer,
          maxResults: MAX_RESULTS,
          minSimilarity: MIN_SIMILARITY,
        };

        const startTime = Date.now();
        const result = await sabaiFaceClient.findSimilarFaces(request);
        const duration = Date.now() - startTime;

        if (result.isErr()) {
          console.error(`  ⚠️  SabaiFace search failed for ${queryImageName}:`, result.error.type);
        } else {
          const similarFaces = result.value;
          sabaiFaceResults.push({
            provider: 'sabaiface',
            queryImage: queryImageName,
            queryPersonId: parseInt(personId),
            expectedImages: personData.containedInIndexImages,
            results: similarFaces.map((face) => ({
              image: face.externalImageId || '',
              similarity: face.similarity,
            })),
            duration,
          });
        }
      } catch (error: any) {
        console.error(`  ⚠️  SabaiFace search failed for ${queryImageName}:`, error.message);
      }

      // AWS search
      try {
        const awsSearch = await searchFacesAWS(awsClient, imageBuffer);
        awsResults.push({
          provider: 'aws',
          queryImage: queryImageName,
          queryPersonId: parseInt(personId),
          expectedImages: personData.containedInIndexImages,
          results: awsSearch.results,
          duration: awsSearch.duration,
        });
      } catch (error: any) {
        console.error(`  ⚠️  AWS search failed for ${queryImageName}:`, error.message);
      }

      process.stdout.write(`\r  Processed ${sabaiFaceResults.length + awsResults.length} searches`);
    }
  }

  console.log(`\n  ✅ SabaiFace: ${sabaiFaceResults.length} searches`);
  console.log(`  ✅ AWS: ${awsResults.length} searches`);

  // ========================================================================
  // Phase 3: Calculate Metrics
  // ========================================================================
  console.log('\n📊 Calculating metrics...');

  const sabaiFaceMetrics = calculateMetrics(sabaiFaceResults, 'SabaiFace');
  const awsMetrics = calculateMetrics(awsResults, 'AWS');

  displayComparison(sabaiFaceMetrics, awsMetrics);

  // ========================================================================
  // Phase 4: Cleanup
  // ========================================================================
  console.log('\n🧹 Cleaning up...');

  const sabaiDeleteResult = await sabaiFaceClient.deleteCollection(SABAIFACE_COLLECTION_ID);
  if (sabaiDeleteResult.isErr()) {
    console.error('  ⚠️  Failed to delete SabaiFace collection:', sabaiDeleteResult.error);
  } else {
    console.log(`  ✅ Deleted SabaiFace collection: ${SABAIFACE_COLLECTION_ID}`);
  }

  await deleteAWSCollection(awsClient);

  console.log('\n✅ Evaluation complete!');
}

main().catch((error) => {
  console.error('\n❌ Evaluation failed:', error);
  process.exit(1);
});
