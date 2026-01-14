#!/usr/bin/env tsx
/**
 * Recognition Comparison: SabaiFace vs AWS Rekognition
 *
 * Compares face recognition accuracy between local SabaiFace service
 * and AWS Rekognition using the Kaggle evaluation dataset.
 *
 * Usage:
 *   pnpm test:aws-vs-recognition
 *
 * Environment:
 *   DATABASE_URL=postgresql://...
 *   AWS_REGION=...
 *   AWS_ACCESS_KEY_ID=...
 *   AWS_SECRET_ACCESS_KEY=...
 */

import * as tf from '@tensorflow/tfjs-node';
import * as faceapi from '@vladmandic/face-api';
import { promises as fs } from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import canvas from 'canvas';
import { loadImageFromBuffer } from '../../src/utils/image';
import { createInternalDb, type InternalDatabase } from '../../src/db/client';
import { sql } from 'drizzle-orm';
import { faces } from '../../src/db/schema/index';
import {
  RekognitionClient,
  SearchFacesByImageCommand,
  IndexFacesCommand,
  CreateCollectionCommand,
  DeleteCollectionCommand,
} from '@aws-sdk/client-rekognition';

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

const SABAIFACE_COLLECTION_ID = `eval-sabaiface-${Date.now()}`;
const AWS_COLLECTION_ID = `eval-aws-${Date.now()}`;
const FACE_CONFIDENCE_THRESHOLD = 0.3;
const SEARCH_THRESHOLD = 0.4;
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
  indexSet: string[];
  identities: {
    [personId: string]: {
      personId: number;
      name: string;
      indexImages: string[];
      queryImages: string[];
      containedInIndexImages: string[];
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
    distance?: number;
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
// Database Setup
// =============================================================================

async function createDbConnection(): Promise<InternalDatabase> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable not set');
  }
  return createInternalDb(process.env.DATABASE_URL);
}

// =============================================================================
// Face Detection (SabaiFace)
// =============================================================================

async function loadModels() {
  console.log('Loading face-api.js models...');
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_PATH);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_PATH);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_PATH);
  console.log('Models loaded.');
}

async function loadImage(imageName: string): Promise<ArrayBuffer> {
  const folders = ['10002', '10003', '10004', '10005', '10006', '10007'];
  for (const folder of folders) {
    try {
      const buffer = await fs.readFile(path.join(KAGGLE_DATASET_PATH, folder, `${imageName}.jpg`));
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    } catch {
      continue;
    }
  }
  throw new Error(`Image not found: ${imageName}`);
}

async function detectFaces(imageBuffer: ArrayBuffer) {
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
  }));
}

// =============================================================================
// SabaiFace Vector Operations
// =============================================================================

async function addFacesToCollection(db: InternalDatabase, facesToAdd: Array<{ descriptor: Float32Array; image: string }>) {
  if (facesToAdd.length === 0) return;

  const faceRows = facesToAdd.map((face) => ({
    eventId: SABAIFACE_COLLECTION_ID,
    photoId: face.image,
    provider: 'sabaiface' as const,
    confidence: '1.0',
    descriptor: Array.from(face.descriptor),
    boundingBox: JSON.stringify({ Width: 0, Height: 0, Left: 0, Top: 0 }),
  }));

  await db.insert(faces).values(faceRows);
}

async function searchFacesSabaiFace(db: InternalDatabase, queryDescriptor: Float32Array) {
  const startTime = Date.now();
  const queryVector = Array.from(queryDescriptor);
  const vectorStr = `[${queryVector.join(',')}]`;

  const result = await db.execute<{
    photo_id: string;
    distance: number;
  }>(sql.raw(`
    SELECT
      photo_id,
      (descriptor <=> '${vectorStr}'::vector) as distance
    FROM faces
    WHERE event_id = '${SABAIFACE_COLLECTION_ID}'
      AND provider = 'sabaiface'
      AND descriptor IS NOT NULL
      AND (descriptor <=> '${vectorStr}'::vector) < ${SEARCH_THRESHOLD}
    ORDER BY descriptor <=> '${vectorStr}'::vector
    LIMIT ${MAX_RESULTS}
  `));

  const rows = 'rows' in result ? result.rows : result;
  const duration = Date.now() - startTime;

  return {
    results: rows.map((row: any) => ({
      image: row.photo_id,
      distance: row.distance,
    })),
    duration,
  };
}

async function cleanupSabaiFaceCollection(db: InternalDatabase) {
  await db.delete(faces).where(sql`event_id = ${SABAIFACE_COLLECTION_ID}`);
}

// =============================================================================
// AWS Rekognition Operations
// =============================================================================

function createAWSClient() {
  return new RekognitionClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });
}

async function createAWSCollection(client: RekognitionClient) {
  const command = new CreateCollectionCommand({
    CollectionId: AWS_COLLECTION_ID,
  });

  try {
    const response = await client.send(command);
    console.log(`  ✅ Created AWS collection: ${AWS_COLLECTION_ID}`);
    return true;
  } catch (error: any) {
    // Collection might already exist
    if (error.__type === 'ResourceAlreadyExistsException') {
      console.log(`  ⚠️  AWS collection already exists: ${AWS_COLLECTION_ID}`);
      return true;
    }
    console.error(`  ⚠️  Failed to create AWS collection:`, error.message);
    return false;
  }
}

async function indexFacesAWS(client: RekognitionClient, imageBuffer: ArrayBuffer, imageName: string) {
  const startTime = Date.now();

  const command = new IndexFacesCommand({
    CollectionId: AWS_COLLECTION_ID,
    Image: {
      Bytes: new Uint8Array(imageBuffer),
    },
    ExternalImageId: imageName,
  });

  try {
    const response = await client.send(command);
    return {
      success: true,
      faceCount: response.FaceRecords?.length || 0,
      duration: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      success: false,
      faceCount: 0,
      error: error.message,
      duration: Date.now() - startTime,
    };
  }
}

async function searchFacesAWS(client: RekognitionClient, imageBuffer: ArrayBuffer) {
  const startTime = Date.now();

  const command = new SearchFacesByImageCommand({
    CollectionId: AWS_COLLECTION_ID,
    Image: {
      Bytes: new Uint8Array(imageBuffer),
    },
    FaceMatchThreshold: 80, // AWS uses similarity percentage (0-100)
    MaxFaces: MAX_RESULTS,
  });

  try {
    const response = await client.send(command);
    const duration = Date.now() - startTime;

    return {
      success: true,
      results: (response.FaceMatches || []).map((match) => ({
        image: match.Face?.ExternalImageId || '',
        similarity: match.Similarity || 0,
      })),
      duration,
    };
  } catch (error: any) {
    return {
      success: false,
      results: [],
      error: error.message,
      duration: Date.now() - startTime,
    };
  }
}

async function deleteAWSCollection(client: RekognitionClient) {
  try {
    const command = new DeleteCollectionCommand({
      CollectionId: AWS_COLLECTION_ID,
    });
    await client.send(command);
    console.log(`  ✅ Deleted AWS collection: ${AWS_COLLECTION_ID}`);
  } catch (error: any) {
    console.log(`  ⚠️  Failed to delete AWS collection:`, error.message);
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
  console.log(`Detection confidence: ${FACE_CONFIDENCE_THRESHOLD}`);
  console.log(`Search threshold: ${SEARCH_THRESHOLD}`);

  // Load ground truth
  console.log('\n📂 Loading ground truth...');
  const groundTruthJson = await fs.readFile(GROUND_TRUTH_PATH, 'utf-8');
  const groundTruth: GroundTruth = JSON.parse(groundTruthJson);

  console.log(`  People: ${groundTruth.metadata.numPeople}`);
  console.log(`  Index images: ${groundTruth.metadata.totalUniqueIndexImages}`);
  console.log(`  Query images: ${groundTruth.metadata.totalQueryImages}`);

  // Setup databases
  console.log('\n🔌 Setting up databases...');
  const db = await createDbConnection();
  const awsClient = createAWSClient();

  // Load models
  await loadModels();

  // ========================================================================
  // Phase 1: Index Faces (both providers)
  // ========================================================================
  console.log('\n📸 Indexing faces...');

  // SabaiFace indexing
  console.log('\n[SabaiFace] Detecting and indexing faces...');
  const sabaiFaceIndexStart = Date.now();
  const indexedFaces: Array<{ descriptor: Float32Array; image: string }> = [];

  for (const imageName of groundTruth.indexSet) {
    try {
      const imageBuffer = await loadImage(imageName);
      const faces = await detectFaces(imageBuffer);

      for (const face of faces) {
        indexedFaces.push({
          descriptor: face.descriptor,
          image: imageName,
        });
      }
    } catch (error) {
      console.error(`  ⚠️  Failed to index ${imageName}:`, error);
    }
  }

  await addFacesToCollection(db, indexedFaces);
  const sabaiFaceIndexTime = Date.now() - sabaiFaceIndexStart;
  console.log(`  ✅ Indexed ${indexedFaces.length} faces in ${sabaiFaceIndexTime}ms`);

  // AWS indexing
  console.log('\n[AWS] Creating collection...');
  const awsCollectionCreated = await createAWSCollection(awsClient);
  if (!awsCollectionCreated) {
    console.error('  ❌ Failed to create AWS collection, skipping AWS indexing');
    // Continue with SabaiFace only
  }

  console.log('\n[AWS] Indexing faces...');
  const awsIndexStart = Date.now();
  let awsIndexedCount = 0;
  let awsIndexErrors = 0;

  for (const imageName of groundTruth.indexSet) {
    try {
      const imageBuffer = await loadImage(imageName);
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
    for (const queryImage of personData.queryImages) {
      const imageBuffer = await loadImage(queryImage);
      const faces = await detectFaces(imageBuffer);

      if (faces.length === 0) {
        console.log(`  ⚠️  No faces detected in ${queryImage}`);
        continue;
      }

      const queryFace = faces[0];

      // SabaiFace search
      try {
        const sabaiFaceSearch = await searchFacesSabaiFace(db, queryFace.descriptor);
        sabaiFaceResults.push({
          provider: 'sabaiface',
          queryImage,
          queryPersonId: parseInt(personId),
          expectedImages: personData.containedInIndexImages,
          results: sabaiFaceSearch.results,
          duration: sabaiFaceSearch.duration,
        });
      } catch (error: any) {
        console.error(`  ⚠️  SabaiFace search failed for ${queryImage}:`, error.message);
      }

      // AWS search
      try {
        const awsSearch = await searchFacesAWS(awsClient, imageBuffer);
        awsResults.push({
          provider: 'aws',
          queryImage,
          queryPersonId: parseInt(personId),
          expectedImages: personData.containedInIndexImages,
          results: awsSearch.results,
          duration: awsSearch.duration,
        });
      } catch (error: any) {
        console.error(`  ⚠️  AWS search failed for ${queryImage}:`, error.message);
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
  await cleanupSabaiFaceCollection(db);
  await deleteAWSCollection(awsClient);

  console.log('\n✅ Evaluation complete!');
}

main().catch((error) => {
  console.error('\n❌ Evaluation failed:', error);
  process.exit(1);
});
