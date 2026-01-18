#!/usr/bin/env tsx
/**
 * Recognition Evaluation Test (via API)
 *
 * Tests face recognition accuracy using Kaggle dataset through the actual SabaiFace API.
 *
 * This test validates the complete HTTP API layer:
 * - Indexing via POST /collections/:eventId/index-faces
 * - Searching via POST /collections/:eventId/search-faces-by-image
 * - Cleanup via DELETE /collections/:eventId
 *
 * Usage:
 *   1. Start the server: pnpm dev
 *   2. Run the test: pnpm test:recognition-eval
 *
 * Environment:
 *   SABAIFACE_ENDPOINT=http://localhost:8086
 *   DATABASE_URL=postgresql://...
 */

import { promises as fs } from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { SabaiFaceHTTPClient } from '../../client/src/sabaiface';
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

const COLLECTION_ID = `eval-recognition-${Date.now()}`;
const MAX_RESULTS = 10;
const MIN_SIMILARITY = 0.4; // 40% similarity threshold

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

interface SearchResult {
  queryImage: string;
  queryPersonId: number;
  expectedImages: string[];
  results: Array<{
    faceId: string;
    image: string;
    similarity: number;
  }>;
  duration: number;
}

// =============================================================================
// Client Setup
// =============================================================================

function createClient(): SabaiFaceHTTPClient {
  const endpoint = process.env.SABAIFACE_ENDPOINT || 'http://localhost:8086';
  return new SabaiFaceHTTPClient({ endpoint });
}

// =============================================================================
// Image Loading
// =============================================================================

async function loadImage(imagePath: string): Promise<ArrayBuffer> {
  const buffer = await fs.readFile(imagePath);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

// =============================================================================
// Metrics Calculation
// =============================================================================

interface Metrics {
  rank1Accuracy: number;
  rank5Accuracy: number;
  meanReciprocalRank: number;
  avgIndexTime: number;
  avgSearchTime: number;
}

function calculateMetrics(searchResults: SearchResult[]): Metrics {
  let rank1Correct = 0;
  let rank5Correct = 0;
  let reciprocalRankSum = 0;
  let totalSearchTime = 0;

  for (const result of searchResults) {
    const { expectedImages, results } = result;

    // Find rank of first correct image
    let correctRank = -1;
    for (let i = 0; i < results.length; i++) {
      if (expectedImages.includes(results[i].image)) {
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
    rank1Accuracy: rank1Correct / searchResults.length,
    rank5Accuracy: rank5Correct / searchResults.length,
    meanReciprocalRank: reciprocalRankSum / searchResults.length,
    avgSearchTime: totalSearchTime / searchResults.length,
    avgIndexTime: 0, // Will be calculated separately
  };
}

function displayMetrics(metrics: Metrics, searchResults: SearchResult[]) {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                 Recognition Evaluation Results (via API)                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  console.log('\n📊 Accuracy Metrics:');
  console.log('┌────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ Metric                     │ Score        │ Target │ Status                │');
  console.log('├────────────────────────────────────────────────────────────────────────────┤');
  console.log(`│ Rank-1 Accuracy            │ ${(metrics.rank1Accuracy * 100).toFixed(2)}%        │ >95%   │ ${metrics.rank1Accuracy >= 0.95 ? '✅ PASS' : '❌ FAIL'}           │`);
  console.log(`│ Rank-5 Accuracy            │ ${(metrics.rank5Accuracy * 100).toFixed(2)}%        │ >98%   │ ${metrics.rank5Accuracy >= 0.98 ? '✅ PASS' : '❌ FAIL'}           │`);
  console.log(`│ Mean Reciprocal Rank (MRR) │ ${metrics.meanReciprocalRank.toFixed(3)}        │ >0.95  │ ${metrics.meanReciprocalRank >= 0.95 ? '✅ PASS' : '❌ FAIL'}           │`);
  console.log('└────────────────────────────────────────────────────────────────────────────┘');

  console.log('\n⚡ Performance:');
  console.log('┌────────────────────────────────────────────────────────────────────────────┐');
  console.log(`│ Avg Index Time             │ ${metrics.avgIndexTime.toFixed(0).toString().padStart(12)} ms│`);
  console.log(`│ Avg Search Time            │ ${metrics.avgSearchTime.toFixed(0).toString().padStart(12)} ms│`);
  console.log('└────────────────────────────────────────────────────────────────────────────┘');

  console.log('\n🔍 Sample Results (first 5):');
  console.log('┌────────────────────────────────────────────────────────────────────────────┐');
  for (let i = 0; i < Math.min(5, searchResults.length); i++) {
    const result = searchResults[i];
    const correctInTop1 = result.results.length > 0 &&
      result.expectedImages.includes(result.results[0].image);
    const correctInTop5 = result.results.some((r) => result.expectedImages.includes(r.image));

    console.log(`│ Query ${i + 1}: Person ${result.queryPersonId} (${result.queryImage})`);
    console.log(`│   Expected: ${result.expectedImages.length} images, Found: ${result.results.length} results`);
    console.log(`│   Top-1: ${correctInTop1 ? '✅' : '❌'} | Top-5: ${correctInTop5 ? '✅' : '❌'}`);
    if (i < Math.min(5, searchResults.length) - 1) {
      console.log('│');
    }
  }
  console.log('└────────────────────────────────────────────────────────────────────────────┘');
}

// =============================================================================
// Main Evaluation Flow
// =============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                 Face Recognition Evaluation (via API)                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log(`\nCollection ID: ${COLLECTION_ID}`);
  console.log(`Endpoint: ${process.env.SABAIFACE_ENDPOINT || 'http://localhost:8086'}`);
  console.log(`Min similarity: ${MIN_SIMILARITY}`);

  // Load ground truth
  console.log('\n📂 Loading ground truth...');
  const groundTruthPath = await getGroundTruthPath();
  const groundTruthJson = await fs.readFile(groundTruthPath, 'utf-8');
  const groundTruth: GroundTruth = JSON.parse(groundTruthJson);

  console.log(`  People: ${groundTruth.metadata.numPeople}`);
  console.log(`  Index images: ${groundTruth.metadata.totalUniqueIndexImages}`);
  console.log(`  Query images: ${groundTruth.metadata.totalQueryImages}`);

  // Setup client
  const endpoint = process.env.SABAIFACE_ENDPOINT || 'http://localhost:8086';
  console.log(`\n🔌 Connecting to SabaiFace API at ${endpoint}...`);
  const client = createClient();

  // Create collection
  console.log('\n📦 Creating collection...');
  const createResult = await client.createCollection(COLLECTION_ID);
  if (createResult.isErr()) {
    console.error('❌ Failed to create collection:', createResult.error);
    process.exit(1);
  }
  console.log(`  ✅ Collection created: ${createResult.value}`);

  // ========================================================================
  // Phase 1: Index faces via API
  // ========================================================================
  console.log('\n📸 Indexing faces via API...');

  // Determine if using new format (with paths) or old format (with names)
  const usePathFormat = Array.isArray(groundTruth.indexSet) &&
    groundTruth.indexSet.length > 0 &&
    typeof groundTruth.indexSet[0] === 'object';

  const indexStart = Date.now();
  let indexedCount = 0;
  let indexErrors = 0;
  const indexedImages = new Set<string>();

  for (const indexItem of groundTruth.indexSet) {
    const imageName = typeof indexItem === 'string' ? indexItem : (indexItem as { name: string }).name;
    const imagePath = typeof indexItem === 'string' ? null : (indexItem as { path: string }).path;

    try {
      // Use path if available (new format), otherwise search by name
      const imageBuffer = imagePath
        ? await loadImage(imagePath)
        : await loadImage(path.join(process.cwd(), '../../../dataset', '10002', `${imageName}.jpg`)); // Fallback for old format

      const request: IndexPhotoRequest = {
        eventId: COLLECTION_ID,
        photoId: imageName,
        imageData: imageBuffer,
        options: {
          maxFaces: 100,
          qualityFilter: 'auto',
        },
      };

      const result = await client.indexPhoto(request);

      if (result.isErr()) {
        console.error(`  ⚠️  ${imageName}: ${result.error.type}`);
        indexErrors++;
        continue;
      }

      const faces = result.value.faces;
      indexedCount += faces.length;

      if (faces.length > 0) {
        indexedImages.add(imageName);
      }

      const totalImages = usePathFormat
        ? (groundTruth.indexSet as Array<{ name: string }>).length
        : (groundTruth.indexSet as string[]).length;
      process.stdout.write(`\r  Processed ${indexedImages.size}/${totalImages} images, ${indexedCount} faces`);
    } catch (error: any) {
      console.error(`\n  ⚠️  ${imageName}: ${error.message}`);
      indexErrors++;
    }
  }

  const avgIndexTime = (Date.now() - indexStart) / indexedImages.size;
  console.log(`\n  ✅ Indexed ${indexedCount} faces from ${indexedImages.size} images in ${(Date.now() - indexStart).toFixed(0)}ms`);
  console.log(`     Average: ${avgIndexTime.toFixed(0)}ms per image`);
  if (indexErrors > 0) {
    console.log(`  ⚠️  ${indexErrors} images failed to index`);
  }

  // ========================================================================
  // Phase 2: Search via API
  // ========================================================================
  console.log('\n🔍 Running searches via API...');
  const searchResults: SearchResult[] = [];

  for (const [personId, personData] of Object.entries(groundTruth.identities)) {
    const queryImages = personData.queryImagePaths && personData.queryImagePaths.length > 0
      ? personData.queryImagePaths
      : personData.queryImages;

    for (let i = 0; i < personData.queryImages.length; i++) {
      const queryImageName = personData.queryImages[i];
      const queryImagePath = personData.queryImagePaths?.[i];

      try {
        const imageBuffer = queryImagePath
          ? await loadImage(queryImagePath)
          : await loadImage(path.join(process.cwd(), '../../../dataset', '10002', `${queryImageName}.jpg`));

        const request: FindSimilarRequest = {
          eventId: COLLECTION_ID,
          imageData: imageBuffer,
          maxResults: MAX_RESULTS,
          minSimilarity: MIN_SIMILARITY,
        };

        const startTime = Date.now();
        const result = await client.findSimilarFaces(request);
        const duration = Date.now() - startTime;

        if (result.isErr()) {
          console.error(`  ⚠️  Search failed for ${queryImageName}:`, result.error.type);
          continue;
        }

        const similarFaces = result.value;
        const results = similarFaces.map((face) => ({
          faceId: face.faceId,
          image: face.externalImageId || '',
          similarity: face.similarity,
        }));

        searchResults.push({
          queryImage: queryImageName,
          queryPersonId: parseInt(personId),
          expectedImages: personData.containedInIndexImages,
          results,
          duration,
        });

        process.stdout.write(`\r  Processed ${searchResults.length} queries`);
      } catch (error: any) {
        console.error(`\n  ⚠️  Failed to search ${queryImageName}:`, error.message);
      }
    }
  }

  console.log(`\n  ✅ Completed ${searchResults.length} queries`);

  // ========================================================================
  // Phase 3: Calculate Metrics
  // ========================================================================
  console.log('\n📊 Calculating metrics...');
  const metrics = calculateMetrics(searchResults);
  metrics.avgIndexTime = avgIndexTime;
  displayMetrics(metrics, searchResults);

  // ========================================================================
  // Phase 4: Cleanup
  // ========================================================================
  console.log('\n🧹 Cleaning up...');
  const deleteResult = await client.deleteCollection(COLLECTION_ID);
  if (deleteResult.isErr()) {
    console.error('  ⚠️  Failed to delete collection:', deleteResult.error);
  } else {
    console.log(`  ✅ Deleted collection: ${COLLECTION_ID}`);
  }

  console.log('\n✅ Evaluation complete!');
}

main().catch((error) => {
  console.error('\n❌ Evaluation failed:', error);
  process.exit(1);
});
