#!/usr/bin/env tsx
/**
 * Face Detection Model Comparison Test
 *
 * Compares all face-api.js model variants with 0.3 threshold.
 * Tests: SSD MobileNetV1, Tiny Face Detector (various input sizes), MTCNN
 *
 * Usage:
 *   pnpm test:model-compare
 *
 * Requirements:
 *   - DATABASE_URL set
 *   - Labeled test images
 *   - Models downloaded
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';

import * as faceapi from '@vladmandic/face-api';
import canvas from 'canvas';
import { loadImageFromBuffer } from '../../src/utils/image';
import { createInternalDb } from '../../src/db';
import { faces } from '../../src/db/schema';

// Set up canvas polyfills for face-api.js to work in Node.js
const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const FIXTURES_PATH = path.join(process.cwd(), 'tests/fixtures/images');
const LABELS_FILE = path.join(FIXTURES_PATH, 'labels.json');
const MODELS_PATH = process.env.MODELS_PATH || './models';

// Database
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const db = createInternalDb(process.env.DATABASE_URL);

interface ImageLabel {
  image: string;
  faceCount: number;
}

interface ModelTestResult {
  image: string;
  expected: number;
  detected: number;
  match: boolean;
  duration: number;
}

interface ModelSummary {
  modelName: string;
  results: ModelTestResult[];
  totalExpected: number;
  totalDetected: number;
  exactMatches: number;
  avgDuration: number;
}

// =============================================================================
// Model Configurations
// =============================================================================

const MODELS = [
  {
    name: 'SSD MobileNetV1',
    loader: async () => {
      await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_PATH);
      return new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 });
    },
  },
  {
    name: 'Tiny Face Detector (160)',
    loader: async () => {
      await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS_PATH);
      return new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.3 });
    },
  },
  {
    name: 'Tiny Face Detector (224)',
    loader: async () => {
      await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS_PATH);
      return new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 });
    },
  },
  {
    name: 'Tiny Face Detector (320)',
    loader: async () => {
      await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS_PATH);
      return new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.3 });
    },
  },
  {
    name: 'Tiny Face Detector (416)',
    loader: async () => {
      await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS_PATH);
      return new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 });
    },
  },
  {
    name: 'Tiny Face Detector (512)',
    loader: async () => {
      await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS_PATH);
      return new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.3 });
    },
  },
  {
    name: 'Tiny Face Detector (608)',
    loader: async () => {
      await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS_PATH);
      return new faceapi.TinyFaceDetectorOptions({ inputSize: 608, scoreThreshold: 0.3 });
    },
  },
];

// =============================================================================
// Test Functions
// =============================================================================

async function testModel(modelConfig: typeof MODELS[0], labels: ImageLabel[]): Promise<ModelSummary> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing: ${modelConfig.name}`);
  console.log('='.repeat(80));

  // Load models
  console.log('Loading models...');
  await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_PATH);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_PATH);

  const options = await modelConfig.loader();
  console.log(`✓ Models loaded\n`);

  const results: ModelTestResult[] = [];
  let totalExpected = 0;
  let totalDetected = 0;
  let exactMatches = 0;
  const durations: number[] = [];

  // Test each image
  for (const label of labels) {
    const imagePath = path.join(process.cwd(), label.image);
    const imageFilename = path.basename(label.image);

    try {
      const imageBuffer = fs.readFileSync(imagePath);
      const img = await loadImageFromBuffer(imageBuffer.buffer);

      const startTime = Date.now();
      const detections = await faceapi
        .detectAllFaces(img, options)
        .withFaceLandmarks()
        .withFaceDescriptors();
      const duration = Date.now() - startTime;

      const detected = detections.length;
      const match = detected === label.faceCount;
      const symbol = match ? '✓' : '✗';

      console.log(
        `${imageFilename.padEnd(12)} expected ${label.faceCount}, ` +
        `detected ${detected} ${symbol} (${duration}ms)`
      );

      results.push({
        image: imageFilename,
        expected: label.faceCount,
        detected,
        match,
        duration,
      });

      totalExpected += label.faceCount;
      totalDetected += detected;
      durations.push(duration);
      if (match) exactMatches++;

    } catch (error) {
      console.log(`${imageFilename.padEnd(12)} ERROR: ${error.message}`);
      results.push({
        image: imageFilename,
        expected: label.faceCount,
        detected: 0,
        match: false,
        duration: 0,
      });
    }
  }

  const avgDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;

  console.log(`\nSummary for ${modelConfig.name}:`);
  console.log(`  Exact matches: ${exactMatches}/${labels.length} (${Math.round(exactMatches / labels.length * 100)}%)`);
  console.log(`  Total faces: expected ${totalExpected}, detected ${totalDetected}`);
  if (totalExpected > 0) {
    console.log(`  Detection rate: ${Math.round(totalDetected / totalExpected * 100)}%`);
  }
  console.log(`  Avg duration: ${avgDuration.toFixed(0)}ms`);

  return {
    modelName: modelConfig.name,
    results,
    totalExpected,
    totalDetected,
    exactMatches,
    avgDuration,
  };
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              Face Detection Model Comparison (0.3 Threshold)                ║');
  console.log('║           Testing all face-api.js model variants on SabaiFace                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  // Load labels
  const labels: ImageLabel[] = JSON.parse(fs.readFileSync(LABELS_FILE, 'utf-8'));

  // Skip images with 0 expected faces
  const validLabels = labels.filter(l => l.faceCount > 0);

  if (validLabels.length === 0) {
    console.error('❌ No labeled images found. Please label the images first.');
    console.error('   Run: pnpm label');
    process.exit(1);
  }

  console.log(`\nTesting with ${validLabels.length} labeled images`);
  console.log(`All models using 0.3 threshold\n`);

  // Test each model
  const summaries: ModelSummary[] = [];
  for (const model of MODELS) {
    summaries.push(await testModel(model, validLabels));
  }

  // Print comparison table
  console.log(`\n${'='.repeat(80)}`);
  console.log('COMPARISON RESULTS');
  console.log('='.repeat(80));
  console.log('');

  console.log('Model                          | Exact Matches | Detection Rate | Avg Time');
  console.log('-'.repeat(80));

  for (const summary of summaries) {
    const accuracy = Math.round((summary.exactMatches / validLabels.length) * 100);
    const detectionRate = summary.totalExpected > 0
      ? Math.round((summary.totalDetected / summary.totalExpected) * 100)
      : 0;

    console.log(
      `${summary.modelName.padEnd(31)} | ` +
      `${summary.exactMatches}/${validLabels.length} (${accuracy}%)  | ` +
      `${summary.totalDetected}/${summary.totalExpected} (${detectionRate}%)   | ` +
      `${summary.avgDuration.toFixed(0).padStart(6)}ms`
    );
  }

  // Find winner
  console.log('\n');
  const bestAccuracy = summaries.reduce((best, s) =>
    s.exactMatches > best.exactMatches ? s : best
  );

  const bestDetectionRate = summaries.reduce((best, s) => {
    const bestRate = best.totalExpected > 0 ? best.totalDetected / best.totalExpected : 0;
    const sRate = s.totalExpected > 0 ? s.totalDetected / s.totalExpected : 0;
    return sRate > bestRate ? s : best;
  });

  const fastest = summaries.reduce((fastest, s) =>
    s.avgDuration < fastest.avgDuration ? s : fastest
  );

  console.log(`🏆 Best Accuracy: ${bestAccuracy.modelName} (${bestAccuracy.exactMatches}/${validLabels.length} exact matches)`);
  console.log(`🎯 Best Detection Rate: ${bestDetectionRate.modelName} (${bestDetectionRate.totalDetected}/${bestDetectionRate.totalExpected} faces detected)`);
  console.log(`⚡ Fastest: ${fastest.modelName} (${fastest.avgDuration.toFixed(0)}ms average)`);

  // Per-image comparison
  console.log(`\n${'='.repeat(80)}`);
  console.log('PER-IMAGE COMPARISON');
  console.log('='.repeat(80));
  console.log('');

  for (let i = 0; i < validLabels.length; i++) {
    const label = validLabels[i];
    const imageFilename = path.basename(label.image);

    console.log(`${imageFilename}:`);
    console.log('  Model                          | Detected | Match | Time');
    console.log('  '.padEnd(32) + '-'.repeat(40));

    for (const summary of summaries) {
      const result = summary.results[i];
      const symbol = result.match ? '✓' : '✗';
      console.log(`  ${summary.modelName.padEnd(31)} | ${result.detected.toString().padStart(8)} | ${symbol.padStart(6)} | ${result.duration.toString().padStart(5)}ms`);
    }
    console.log('');
  }

  console.log('✅ Test complete!\n');
}

main().catch(error => {
  console.error('\n❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
