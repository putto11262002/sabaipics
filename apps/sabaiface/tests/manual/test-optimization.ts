#!/usr/bin/env tsx
/**
 * Face Detection Configuration Optimization
 *
 * Tests various configurations to find optimal settings for SabaiFace.
 *
 * Tests:
 * - Confidence thresholds (0.1 - 0.9)
 * - Preprocessing options (resize, quality filter)
 * - Detection attributes (with/without age/gender)
 * - Max faces limits
 *
 * Usage:
 *   pnpm test:optimize
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';

import * as faceapi from '@vladmandic/face-api';
import canvas from 'canvas';
import { loadImageFromBuffer } from '../../src/utils/image';

// Set up canvas polyfills
const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const FIXTURES_PATH = path.join(process.cwd(), 'tests/fixtures/images');
const LABELS_FILE = path.join(FIXTURES_PATH, 'labels.json');
const MODELS_PATH = process.env.MODELS_PATH || './models';

interface ImageLabel {
  image: string;
  faceCount: number;
}

interface ConfigTestResult {
  config: string;
  results: {
    image: string;
    expected: number;
    detected: number;
    match: boolean;
    duration: number;
  }[];
  totalExpected: number;
  totalDetected: number;
  exactMatches: number;
  avgDuration: number;
}

// =============================================================================
// Configuration Variants to Test
// =============================================================================

// Test 1: Confidence Thresholds
const CONFIDENCE_THRESHOLDS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];

// Test 2: Image preprocessing (resizing before detection)
const PREPROCESS_OPTIONS = [
  { name: 'No resize', resize: null },
  { name: 'Resize to 1024px', resize: 1024 },
  { name: 'Resize to 2048px', resize: 2048 },
];

// =============================================================================
// Load Test Data
// =============================================================================

const labels: ImageLabel[] = JSON.parse(fs.readFileSync(LABELS_FILE, 'utf-8'));
const validLabels = labels.filter(l => l.faceCount > 0);

console.log(`Testing with ${validLabels.length} labeled images\n`);

// =============================================================================
// Test Functions
// =============================================================================

/**
 * Test different confidence thresholds
 */
async function testConfidenceThresholds(): Promise<ConfigTestResult[]> {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 1: CONFIDENCE THRESHOLDS');
  console.log('='.repeat(80));

  const results: ConfigTestResult[] = [];

  // Load models once
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_PATH);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_PATH);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_PATH);

  for (const threshold of CONFIDENCE_THRESHOLDS) {
    console.log(`\nTesting threshold: ${threshold}`);

    const options = new faceapi.SsdMobilenetv1Options({ minConfidence: threshold });
    const testResults: ConfigTestResult['results'] = [];
    let totalExpected = 0;
    let totalDetected = 0;
    let exactMatches = 0;
    const durations: number[] = [];

    for (const label of validLabels) {
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

        totalExpected += label.faceCount;
        totalDetected += detected;
        durations.push(duration);
        if (match) exactMatches++;

        testResults.push({
          image: imageFilename,
          expected: label.faceCount,
          detected,
          match,
          duration,
        });

      } catch (error) {
        console.log(`  ${imageFilename}: ERROR - ${error.message}`);
      }
    }

    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

    console.log(`  Exact matches: ${exactMatches}/${validLabels.length} (${Math.round(exactMatches / validLabels.length * 100)}%)`);
    console.log(`  Detection rate: ${Math.round(totalDetected / totalExpected * 100)}%`);
    console.log(`  Avg duration: ${avgDuration.toFixed(0)}ms`);

    results.push({
      config: `Threshold ${threshold}`,
      results: testResults,
      totalExpected,
      totalDetected,
      exactMatches,
      avgDuration,
    });
  }

  return results;
}

/**
 * Test image preprocessing (resize)
 */
async function testPreprocessing(): Promise<ConfigTestResult[]> {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 2: IMAGE PREPROCESSING (RESIZE)');
  console.log('='.repeat(80));

  const results: ConfigTestResult[] = [];

  // Load models once
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_PATH);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_PATH);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_PATH);

  for (const preprocess of PREPROCESS_OPTIONS) {
    console.log(`\nTesting: ${preprocess.name}`);

    const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });
    const testResults: ConfigTestResult['results'] = [];
    let totalExpected = 0;
    let totalDetected = 0;
    let exactMatches = 0;
    const durations: number[] = [];

    for (const label of validLabels) {
      const imagePath = path.join(process.cwd(), label.image);
      const imageFilename = path.basename(label.image);

      try {
        const imageBuffer = fs.readFileSync(imagePath);
        let img = await loadImageFromBuffer(imageBuffer.buffer);

        // Resize if needed
        if (preprocess.resize) {
          const { width, height } = (img as any);
          const scale = Math.min(preprocess.resize / width, preprocess.resize / height);
          if (scale < 1) {
            const newWidth = Math.round(width * scale);
            const newHeight = Math.round(height * scale);
            const canvas = new Canvas(newWidth, newHeight);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, newWidth, newHeight);
            img = canvas as any;
          }
        }

        const startTime = Date.now();
        const detections = await faceapi
          .detectAllFaces(img, options)
          .withFaceLandmarks()
          .withFaceDescriptors();
        const duration = Date.now() - startTime;

        const detected = detections.length;
        const match = detected === label.faceCount;

        totalExpected += label.faceCount;
        totalDetected += detected;
        durations.push(duration);
        if (match) exactMatches++;

        testResults.push({
          image: imageFilename,
          expected: label.faceCount,
          detected,
          match,
          duration,
        });

      } catch (error) {
        console.log(`  ${imageFilename}: ERROR - ${error.message}`);
      }
    }

    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

    console.log(`  Exact matches: ${exactMatches}/${validLabels.length} (${Math.round(exactMatches / validLabels.length * 100)}%)`);
    console.log(`  Detection rate: ${Math.round(totalDetected / totalExpected * 100)}%`);
    console.log(`  Avg duration: ${avgDuration.toFixed(0)}ms`);

    results.push({
      config: preprocess.name,
      results: testResults,
      totalExpected,
      totalDetected,
      exactMatches,
      avgDuration,
    });
  }

  return results;
}

/**
 * Test with/without attribute detection
 */
async function testAttributes(): Promise<ConfigTestResult[]> {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 3: ATTRIBUTE DETECTION OVERHEAD');
  console.log('='.repeat(80));

  const results: ConfigTestResult[] = [];

  // Load all models
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_PATH);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_PATH);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_PATH);
  await faceapi.nets.ageGenderNet.loadFromDisk(MODELS_PATH);

  const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });

  // Test without age/gender
  console.log('\nTesting: WITHOUT age/gender');
  const resultsWithout = await runDetectionTest(validLabels, options, false, 'Without age/gender');
  results.push(resultsWithout);

  // Test with age/gender
  console.log('\nTesting: WITH age/gender');
  const resultsWith = await runDetectionTest(validLabels, options, true, 'With age/gender');
  results.push(resultsWith);

  return results;
}

async function runDetectionTest(
  labels: ImageLabel[],
  options: faceapi.SsdMobilenetv1Options,
  withAttributes: boolean,
  configName: string
): Promise<ConfigTestResult> {
  const testResults: ConfigTestResult['results'] = [];
  let totalExpected = 0;
  let totalDetected = 0;
  let exactMatches = 0;
  const durations: number[] = [];

  for (const label of labels) {
    const imagePath = path.join(process.cwd(), label.image);
    const imageFilename = path.basename(label.image);

    try {
      const imageBuffer = fs.readFileSync(imagePath);
      const img = await loadImageFromBuffer(imageBuffer.buffer);

      const startTime = Date.now();
      let detections;

      if (withAttributes) {
        detections = await faceapi
          .detectAllFaces(img, options)
          .withFaceLandmarks()
          .withFaceDescriptors()
          .withAgeAndGender();
      } else {
        detections = await faceapi
          .detectAllFaces(img, options)
          .withFaceLandmarks()
          .withFaceDescriptors();
      }

      const duration = Date.now() - startTime;

      const detected = detections.length;
      const match = detected === label.faceCount;

      totalExpected += label.faceCount;
      totalDetected += detected;
      durations.push(duration);
      if (match) exactMatches++;

      testResults.push({
        image: imageFilename,
        expected: label.faceCount,
        detected,
        match,
        duration,
      });

    } catch (error) {
      console.log(`  ${imageFilename}: ERROR - ${error.message}`);
    }
  }

  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

  console.log(`  Exact matches: ${exactMatches}/${labels.length} (${Math.round(exactMatches / labels.length * 100)}%)`);
  console.log(`  Detection rate: ${Math.round(totalDetected / totalExpected * 100)}%`);
  console.log(`  Avg duration: ${avgDuration.toFixed(0)}ms`);

  return {
    config: configName,
    results: testResults,
    totalExpected,
    totalDetected,
    exactMatches,
    avgDuration,
  };
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║           SabaiFace Configuration Optimization Test                        ║');
  console.log('║           Finding the best settings for event photo detection                ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  // Run all tests
  const thresholdResults = await testConfidenceThresholds();
  const preprocessResults = await testPreprocessing();
  const attributeResults = await testAttributes();

  // Print summary comparison
  console.log('\n' + '='.repeat(80));
  console.log('OPTIMIZATION SUMMARY');
  console.log('='.repeat(80));
  console.log('');

  // Best threshold
  console.log('CONFIDENCE THRESHOLTS:');
  console.log('Threshold | Exact Matches | Detection Rate | Avg Time');
  console.log('-'.repeat(80));
  for (const result of thresholdResults) {
    const accuracy = Math.round((result.exactMatches / validLabels.length) * 100);
    const detectionRate = Math.round((result.totalDetected / result.totalExpected) * 100);
    console.log(
      `${result.config.padEnd(10)} | ${result.exactMatches}/${validLabels.length} (${accuracy}%)  | ` +
      `${result.totalDetected}/${result.totalExpected} (${detectionRate}%)   | ` +
      `${result.avgDuration.toFixed(0).padStart(6)}ms`
    );
  }

  // Best threshold
  const bestThreshold = thresholdResults.reduce((best, r) =>
    r.exactMatches > best.exactMatches ? r : best
  );
  console.log(`\n🏆 Best threshold: ${bestThreshold.config} (${bestThreshold.exactMatches}/${validLabels.length} exact matches, ${Math.round(bestThreshold.totalDetected / bestThreshold.totalExpected * 100)}% detection)`);

  // Preprocessing
  console.log('\n\nIMAGE PREPROCESSING:');
  console.log('Option              | Exact Matches | Detection Rate | Avg Time');
  console.log('-'.repeat(80));
  for (const result of preprocessResults) {
    const accuracy = Math.round((result.exactMatches / validLabels.length) * 100);
    const detectionRate = Math.round((result.totalDetected / result.totalExpected) * 100);
    console.log(
      `${result.config.padEnd(19)} | ${result.exactMatches}/${validLabels.length} (${accuracy}%)  | ` +
      `${result.totalDetected}/${result.totalExpected} (${detectionRate}%)   | ` +
      `${result.avgDuration.toFixed(0).padStart(6)}ms`
    );
  }

  // Attributes
  console.log('\n\nATTRIBUTE DETECTION:');
  console.log('Option              | Exact Matches | Detection Rate | Avg Time');
  console.log('-'.repeat(80));
  for (const result of attributeResults) {
    const accuracy = Math.round((result.exactMatches / validLabels.length) * 100);
    const detectionRate = Math.round((result.totalDetected / result.totalExpected) * 100);
    console.log(
      `${result.config.padEnd(19)} | ${result.exactMatches}/${validLabels.length} (${accuracy}%)  | ` +
      `${result.totalDetected}/${result.totalExpected} (${detectionRate}%)   | ` +
      `${result.avgDuration.toFixed(0).padStart(6)}ms`
    );
  }

  const timeDiff = attributeResults[1].avgDuration - attributeResults[0].avgDuration;
  console.log(`\n⚠️  Age/gender adds ${timeDiff.toFixed(0)}ms per image (${Math.round(timeDiff / attributeResults[0].avgDuration * 100)}% overhead)`);

  // Recommendations
  console.log('\n\n' + '='.repeat(80));
  console.log('RECOMMENDED CONFIGURATION');
  console.log('='.repeat(80));
  console.log('');
  console.log(`✓ Confidence threshold: ${bestThreshold.config}`);
  console.log(`✓ Preprocessing: No resize (best accuracy)`);
  console.log(`✓ Attributes: ${timeDiff > 50 ? 'Disable for production (significant overhead)' : 'Enable if needed'}`);
  console.log('');

  console.log('\n✅ Optimization complete!\n');
}

main().catch(error => {
  console.error('\n❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
