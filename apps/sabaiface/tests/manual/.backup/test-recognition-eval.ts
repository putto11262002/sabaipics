#!/usr/bin/env tsx
/**
 * Recognition Evaluation Test
 *
 * Tests face recognition accuracy using Kaggle dataset:
 * 1. Load index set images and extract faces
 * 2. Index faces into vector collection
 * 3. Search with query faces
 * 4. Calculate metrics (Rank-1, Rank-5, MRR, Precision, Recall)
 * 5. Clean up collection
 *
 * Usage:
 *   pnpm test:recognition-eval
 *
 * Environment:
 *   DATABASE_URL=postgresql://...
 *   FACE_CONFIDENCE_THRESHOLD=0.3 (optional)
 */

import * as tf from '@tensorflow/tfjs-node';
import * as faceapi from '@vladmandic/face-api';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import canvas from 'canvas';
import { loadImageFromBuffer } from '../../src/utils/image';
import { createInternalDb, type InternalDatabase } from '../../src/db/client';

// Load environment variables
dotenv.config();

// Set up canvas polyfills for face-api.js
const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

// =============================================================================
// Configuration
// =============================================================================

const MODELS_PATH = path.join(process.cwd(), 'models');
const KAGGLE_DATASET_PATH = path.join(process.cwd(), '../../../dataset');
const GROUND_TRUTH_PATH = path.join(
  process.cwd(),
  'tests/fixtures/eval/dataset/recognition/ground-truth.json'
);

const COLLECTION_ID = `eval-recognition-${Date.now()}`;
const FACE_CONFIDENCE_THRESHOLD = parseFloat(process.env.FACE_CONFIDENCE_THRESHOLD || '0.3');
const SEARCH_THRESHOLD = parseFloat(process.env.SEARCH_THRESHOLD || '0.4'); // Lower = stricter matching
const MAX_RESULTS = 10;

// =============================================================================
// Types
// =============================================================================

interface GroundTruth {
  metadata: {
    numPeople: number;
    imagesPerPerson: number;
    indexSize: number;
    querySize: number;
    totalUniqueIndexImages: number;
    totalQueryImages: number;
  };
  indexSet: string[]; // image names
  identities: {
    [personId: string]: {
      personId: number;
      name: string;
      totalImages: number;
      selectedImages: number;
      indexImageCount: number;
      queryImageCount: number;
      indexImages: string[];
      queryImages: string[];
      containedInIndexImages: string[]; // which global index images contain this person
    };
  };
}

interface IndexedFace {
  faceId: string;
  image: string;
  personId: number;
  descriptor: Float32Array;
  confidence: number;
}

interface SearchResult {
  queryImage: string;
  queryPersonId: number;
  expectedImages: string[]; // index images that should contain this person
  results: Array<{
    faceId: string;
    image: string;
    personId: number;
    distance: number;
    similarity: number;
  }>;
}

// =============================================================================
// Database Setup (Postgres + pgvector)
// =============================================================================

import { sql } from 'drizzle-orm';
import { faces } from '../../src/db/schema/index';

async function createDbConnection(): Promise<InternalDatabase> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable not set');
  }

  return createInternalDb(process.env.DATABASE_URL);
}

// =============================================================================
// Face Detection
// =============================================================================

async function loadModels() {
  console.log('Loading face-api.js models...');
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_PATH);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_PATH);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_PATH);
  console.log('Models loaded.');
}

async function loadImage(imageName: string): Promise<ArrayBuffer> {
  // Search all folders for the image
  const folders = ['10002', '10003', '10004', '10005', '10006', '10007'];

  for (const folder of folders) {
    const imagePath = path.join(KAGGLE_DATASET_PATH, folder, `${imageName}.jpg`);
    try {
      const buffer = await fs.readFile(imagePath);
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    } catch {
      continue;
    }
  }

  throw new Error(`Image not found: ${imageName}`);
}

async function detectFaces(imageBuffer: ArrayBuffer) {
  // Load image using canvas polyfill
  const img = await loadImageFromBuffer(imageBuffer);
  const options = new faceapi.SsdMobilenetv1Options({
    minConfidence: FACE_CONFIDENCE_THRESHOLD,
  });

  const detections = await faceapi
    .detectAllFaces(img as any, options)
    .withFaceLandmarks()
    .withFaceDescriptors();

  return detections.map((d) => ({
    descriptor: d.descriptor as Float32Array,
    confidence: d.detection.score,
    box: {
      x: d.detection.box.x,
      y: d.detection.box.y,
      width: d.detection.box.width,
      height: d.detection.box.height,
    },
  }));
}

// =============================================================================
// Vector Store Operations
// =============================================================================

async function addFacesToCollection(db: InternalDatabase, facesToAdd: IndexedFace[]) {
  if (facesToAdd.length === 0) return;

  const faceRows = facesToAdd.map((face) => ({
    // Don't provide id - let Postgres auto-generate UUID
    eventId: COLLECTION_ID,
    photoId: face.image,
    provider: 'sabaiface' as const,
    confidence: face.confidence.toString(),
    descriptor: Array.from(face.descriptor),
    boundingBox: JSON.stringify({
      Width: 0, // Not needed for eval
      Height: 0,
      Left: 0,
      Top: 0,
    }),
  }));

  await db.insert(faces).values(faceRows);
}

async function searchFaces(
  db: InternalDatabase,
  queryDescriptor: Float32Array,
  maxResults: number,
  threshold: number
) {
  const queryVector = Array.from(queryDescriptor);

  // Use raw SQL string for vector operations
  const vectorStr = `[${queryVector.join(',')}]`;

  const result = await db.execute<{
    id: string;
    photo_id: string;
    distance: number;
  }>(sql.raw(`
    SELECT
      id,
      photo_id,
      (descriptor <=> '${vectorStr}'::vector) as distance
    FROM faces
    WHERE event_id = '${COLLECTION_ID}'
      AND provider = 'sabaiface'
      AND descriptor IS NOT NULL
      AND (descriptor <=> '${vectorStr}'::vector) < ${threshold}
    ORDER BY descriptor <=> '${vectorStr}'::vector
    LIMIT ${maxResults}
  `));

  // neon-http returns { rows: [...] }
  const rows = 'rows' in result ? result.rows : result;

  return rows.map((row: any) => ({
    faceId: row.id,
    image: row.photo_id,
    distance: row.distance,
  }));
}

async function cleanupCollection(db: InternalDatabase) {
  await db.delete(faces).where(sql`event_id = ${COLLECTION_ID}`);
  console.log(`\n✅ Cleaned up collection: ${COLLECTION_ID}`);
}

// =============================================================================
// Evaluation Metrics
// =============================================================================

interface Metrics {
  rank1Accuracy: number; // Correct match is #1
  rank5Accuracy: number; // Correct match in top 5
  meanReciprocalRank: number; // Average of 1/rank
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1Score: number;
}

function calculateMetrics(searchResults: SearchResult[], groundTruth: GroundTruth): Metrics {
  let rank1Correct = 0;
  let rank5Correct = 0;
  let reciprocalRankSum = 0;
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;

  for (const result of searchResults) {
    const { queryPersonId, expectedImages, results } = result;

    // Check if any result matches expected images (same person)
    let correctRank = -1;
    for (let i = 0; i < results.length; i++) {
      const resultImage = results[i].image;
      if (expectedImages.includes(resultImage)) {
        correctRank = i + 1;
        break;
      }
    }

    // Rank metrics
    if (correctRank === 1) rank1Correct++;
    if (correctRank <= 5 && correctRank > 0) rank5Correct++;
    if (correctRank > 0) reciprocalRankSum += 1 / correctRank;

    // Precision/Recall
    if (results.length > 0) {
      // Count how many results are correct (same person)
      const correctResults = results.filter((r) => expectedImages.includes(r.image)).length;
      const incorrectResults = results.length - correctResults;

      truePositives += correctResults;
      falsePositives += incorrectResults;
      falseNegatives += expectedImages.length > 0 ? 0 : 1; // If expected images exist but none found
    } else if (expectedImages.length > 0) {
      falseNegatives += expectedImages.length;
    }
  }

  const totalQueries = searchResults.length;
  const precision = truePositives + falsePositives > 0
    ? truePositives / (truePositives + falsePositives)
    : 0;
  const recall = truePositives + falseNegatives > 0
    ? truePositives / (truePositives + falseNegatives)
    : 0;
  const f1Score = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

  return {
    rank1Accuracy: rank1Correct / totalQueries,
    rank5Accuracy: rank5Correct / totalQueries,
    meanReciprocalRank: reciprocalRankSum / totalQueries,
    truePositives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    f1Score,
  };
}

function displayMetrics(metrics: Metrics, searchResults: SearchResult[]) {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                        Recognition Evaluation Results                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  console.log('\n📊 Accuracy Metrics:');
  console.log('┌────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ Metric                     │ Score        │ Target │ Status                │');
  console.log('├────────────────────────────────────────────────────────────────────────────┤');
  console.log(`│ Rank-1 Accuracy            │ ${(metrics.rank1Accuracy * 100).toFixed(2)}%        │ >95%   │ ${metrics.rank1Accuracy >= 0.95 ? '✅ PASS' : '❌ FAIL'}           │`);
  console.log(`│ Rank-5 Accuracy            │ ${(metrics.rank5Accuracy * 100).toFixed(2)}%        │ >98%   │ ${metrics.rank5Accuracy >= 0.98 ? '✅ PASS' : '❌ FAIL'}           │`);
  console.log(`│ Mean Reciprocal Rank (MRR) │ ${metrics.meanReciprocalRank.toFixed(3)}        │ >0.95  │ ${metrics.meanReciprocalRank >= 0.95 ? '✅ PASS' : '❌ FAIL'}           │`);
  console.log('└────────────────────────────────────────────────────────────────────────────┘');

  console.log('\n📈 Precision/Recall:');
  console.log('┌────────────────────────────────────────────────────────────────────────────┐');
  console.log(`│ True Positives             │ ${metrics.truePositives.toString().padStart(12)} │`);
  console.log(`│ False Positives            │ ${metrics.falsePositives.toString().padStart(12)} │`);
  console.log(`│ False Negatives            │ ${metrics.falseNegatives.toString().padStart(12)} │`);
  console.log('├────────────────────────────────────────────────────────────────────────────┤');
  console.log(`│ Precision                  │ ${(metrics.precision * 100).toFixed(2)}%${''.padStart(9)}  │`);
  console.log(`│ Recall                     │ ${(metrics.recall * 100).toFixed(2)}%${''.padStart(9)}  │`);
  console.log(`│ F1 Score                   │ ${metrics.f1Score.toFixed(3)}${''.padStart(11)}  │`);
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
  console.log('║                    Face Recognition Evaluation                             ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log(`\nCollection ID: ${COLLECTION_ID}`);
  console.log(`Face confidence threshold: ${FACE_CONFIDENCE_THRESHOLD}`);
  console.log(`Search threshold: ${SEARCH_THRESHOLD}`);

  // Load ground truth
  console.log('\n📂 Loading ground truth...');
  const groundTruthJson = await fs.readFile(GROUND_TRUTH_PATH, 'utf-8');
  const groundTruth: GroundTruth = JSON.parse(groundTruthJson);

  console.log(`  People: ${groundTruth.metadata.numPeople}`);
  console.log(`  Index images: ${groundTruth.metadata.totalUniqueIndexImages}`);
  console.log(`  Query images: ${groundTruth.metadata.totalQueryImages}`);

  // Setup database
  console.log('\n🔌 Connecting to database...');
  const db = await createDbConnection();

  // Load face detection models
  await loadModels();

  // Step 1: Index faces from index set
  console.log('\n📸 Detecting and indexing faces from index set...');
  const indexedFaces: IndexedFace[] = [];
  const indexedImages = new Set<string>();

  for (const imageName of groundTruth.indexSet) {
    try {
      const imageBuffer = await loadImage(imageName);
      const faces = await detectFaces(imageBuffer);

      // Store ALL detected faces (don't limit to expected people count)
      for (let i = 0; i < faces.length; i++) {
        const faceId = `${imageName}_${i}`;
        indexedFaces.push({
          faceId,
          image: imageName,
          personId: 0, // Not needed for recognition test
          descriptor: faces[i].descriptor,
          confidence: faces[i].confidence,
        });
      }

      if (faces.length > 0) {
        indexedImages.add(imageName);
      }

      process.stdout.write(`\r  Processed ${indexedFaces.length} faces from ${indexedImages.size}/${groundTruth.indexSet.length} images`);
    } catch (error) {
      console.error(`\n  ⚠️  Failed to process image: ${imageName}`, error);
    }
  }

  console.log(`\n  ✅ Detected ${indexedFaces.length} faces from ${indexedImages.size} images`);

  // Add to collection
  console.log('\n💾 Adding faces to collection...');
  await addFacesToCollection(db, indexedFaces);
  console.log(`  ✅ Added ${indexedFaces.length} faces to collection ${COLLECTION_ID}`);

  // Step 2: Search with query faces
  console.log('\n🔍 Running searches with query faces...');
  const searchResults: SearchResult[] = [];

  for (const [personId, personData] of Object.entries(groundTruth.identities)) {
    for (const queryImage of personData.queryImages) {
      try {
        const imageBuffer = await loadImage(queryImage);
        const faces = await detectFaces(imageBuffer);

        if (faces.length === 0) {
          console.log(`  ⚠️  No faces detected in query image: ${queryImage}`);
          continue;
        }

        // Use first detected face as query
        const queryFace = faces[0];
        const results = await searchFaces(db, queryFace.descriptor, MAX_RESULTS, SEARCH_THRESHOLD);

        searchResults.push({
          queryImage,
          queryPersonId: parseInt(personId),
          expectedImages: personData.containedInIndexImages,
          results: results.map((r) => ({
            ...r,
            personId: 0, // Will be filled in from indexedFaces
            similarity: Math.max(0, 100 - (r.distance * 100 / 1.5)), // Convert distance to similarity
          })),
        });

        process.stdout.write(`\r  Processed ${searchResults.length} queries`);
      } catch (error) {
        console.error(`\n  ⚠️  Failed to process query image: ${queryImage}`, error);
      }
    }
  }

  console.log(`\n  ✅ Completed ${searchResults.length} queries`);

  // Step 3: Calculate metrics
  console.log('\n📊 Calculating metrics...');
  const metrics = calculateMetrics(searchResults, groundTruth);
  displayMetrics(metrics, searchResults);

  // Step 4: Cleanup
  await cleanupCollection(db);

  console.log('\n✅ Evaluation complete!');
}

// =============================================================================
// Run
// =============================================================================

main().catch((error) => {
  console.error('\n❌ Evaluation failed:', error);
  process.exit(1);
});
