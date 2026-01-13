#!/usr/bin/env tsx
/**
 * Optimized SabaiFace vs AWS Rekognition Comparison
 *
 * Tests the optimized configuration (0.3 threshold, 1024px resize)
 * against AWS Rekognition.
 *
 * Usage:
 *   pnpm test:aws-vs-optimized
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';

import * as faceapi from '@vladmandic/face-api';
import canvas from 'canvas';
import { loadImageFromBuffer } from '../../src/utils/image';
import { FaceRecognitionClient } from '../../client/src/index';

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

interface Result {
  image: string;
  expected: number;
  awsDetected: number;
  sabaiDetected: number;
  awsMatch: boolean;
  sabaiMatch: boolean;
  winner: 'aws' | 'sabai' | 'tie' | 'both-wrong';
  awsTime: number;
  sabaiTime: number;
}

interface Summary {
  provider: string;
  exactMatches: number;
  totalDetected: number;
  avgTime: number;
}

// =============================================================================
// Load Test Data
// =============================================================================

const labels: ImageLabel[] = JSON.parse(fs.readFileSync(LABELS_FILE, 'utf-8'));
const validLabels = labels.filter(l => l.faceCount > 0);

console.log(`Testing with ${validLabels.length} labeled images\n`);

// =============================================================================
// Optimized SabaiFace Detection
// =============================================================================

async function testOptimizedSabaiFace(labels: ImageLabel[]): Promise<{ results: Result[]; summary: Summary }> {
  console.log('\n' + '='.repeat(80));
  console.log('OPTIMIZED SABAIFACE (0.3 threshold, 1024px resize)');
  console.log('='.repeat(80));

  // Load models
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_PATH);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_PATH);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_PATH);

  const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 });
  const results: Result[] = [];
  let totalDetected = 0;
  let exactMatches = 0;
  const times: number[] = [];

  for (const label of labels) {
    const imagePath = path.join(process.cwd(), label.image);
    const imageFilename = path.basename(label.image);

    try {
      const imageBuffer = fs.readFileSync(imagePath);
      let img = await loadImageFromBuffer(imageBuffer.buffer);

      // Resize to 1024px (optimized)
      const { width, height } = (img as any);
      const maxDim = 1024;
      const scale = Math.min(maxDim / width, maxDim / height);
      if (scale < 1) {
        const newWidth = Math.round(width * scale);
        const newHeight = Math.round(height * scale);
        const cvs = new canvas.Canvas(newWidth, newHeight);
        const ctx = cvs.getContext('2d');
        ctx.drawImage(img, 0, 0, newWidth, newHeight);
        img = cvs as any;
      }

      const startTime = Date.now();
      const detections = await faceapi
        .detectAllFaces(img, options)
        .withFaceLandmarks()
        .withFaceDescriptors();
      const duration = Date.now() - startTime;

      const detected = detections.length;
      const match = detected === label.faceCount;

      totalDetected += detected;
      times.push(duration);
      if (match) exactMatches++;

      console.log(
        `${imageFilename.padEnd(12)} expected ${label.faceCount}, ` +
        `detected ${detected} ${match ? '✓' : '✗'} (${duration}ms)`
      );

      results.push({
        image: imageFilename,
        expected: label.faceCount,
        awsDetected: 0,
        sabaiDetected: detected,
        awsMatch: false,
        sabaiMatch: match,
        winner: 'sabai',
        awsTime: 0,
        sabaiTime: duration,
      });

    } catch (error) {
      console.log(`${imageFilename.padEnd(12)} ERROR: ${error.message}`);
      results.push({
        image: imageFilename,
        expected: label.faceCount,
        awsDetected: 0,
        sabaiDetected: 0,
        awsMatch: false,
        sabaiMatch: false,
        winner: 'both-wrong',
        awsTime: 0,
        sabaiTime: 0,
      });
    }
  }

  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;

  console.log(`\nSummary for Optimized SabaiFace:`);
  console.log(`  Exact matches: ${exactMatches}/${labels.length} (${Math.round(exactMatches / labels.length * 100)}%)`);
  console.log(`  Total faces: expected ${labels.reduce((s, l) => s + l.faceCount, 0)}, detected ${totalDetected}`);
  console.log(`  Detection rate: ${Math.round(totalDetected / labels.reduce((s, l) => s + l.faceCount, 0) * 100)}%`);
  console.log(`  Avg duration: ${avgTime.toFixed(0)}ms`);

  return {
    results,
    summary: {
      provider: 'sabai',
      exactMatches,
      totalDetected,
      avgTime,
    },
  };
}

// =============================================================================
// AWS Rekognition Detection
// =============================================================================

async function testAWS(labels: ImageLabel[]): Promise<{ results: Result[]; summary: Summary }> {
  console.log('\n' + '='.repeat(80));
  console.log('AWS REKOGNITION');
  console.log('='.repeat(80));

  // Check if AWS credentials are available
  if (!process.env.AWS_ACCESS_KEY_ID) {
    console.log('⚠️  AWS credentials not found. Skipping AWS tests.\n');
    return {
      results: labels.map(l => ({
        image: path.basename(l.image),
        expected: l.faceCount,
        awsDetected: 0,
        sabaiDetected: 0,
        awsMatch: false,
        sabaiMatch: false,
        winner: 'sabai' as const,
        awsTime: 0,
        sabaiTime: 0,
      })),
      summary: {
        provider: 'aws',
        exactMatches: 0,
        totalDetected: 0,
        avgTime: 0,
      },
    };
  }

  const client = new FaceRecognitionClient({
    provider: 'aws',
    aws: {
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    },
  });

  // Create collection
  const eventId = `test-optimized-${Date.now()}`;
  console.log(`Creating collection: ${eventId}`);
  await client.createCollection(eventId);
  console.log(`✓ Collection created\n`);

  const results: Result[] = [];
  let totalDetected = 0;
  let exactMatches = 0;
  const times: number[] = [];

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
        console.log(`${imageFilename.padEnd(12)} ERROR: ${result.error.type}`);
        results.push({
          image: imageFilename,
          expected: label.faceCount,
          awsDetected: 0,
          sabaiDetected: 0,
          awsMatch: false,
          sabaiMatch: false,
          winner: 'both-wrong',
          awsTime: 0,
          sabaiTime: 0,
        });
        continue;
      }

      const detected = result.value.faces.length;
      const match = detected === label.faceCount;

      totalDetected += detected;
      times.push(duration);
      if (match) exactMatches++;

      console.log(
        `${imageFilename.padEnd(12)} expected ${label.faceCount}, ` +
        `detected ${detected} ${match ? '✓' : '✗'} (${duration}ms)`
      );

      results.push({
        image: imageFilename,
        expected: label.faceCount,
        awsDetected: detected,
        sabaiDetected: 0,
        awsMatch: match,
        sabaiMatch: false,
        winner: 'aws',
        awsTime: duration,
        sabaiTime: 0,
      });

    } catch (error) {
      console.log(`${imageFilename.padEnd(12)} ERROR: ${error.message}`);
      results.push({
        image: imageFilename,
        expected: label.faceCount,
        awsDetected: 0,
        sabaiDetected: 0,
        awsMatch: false,
        sabaiMatch: false,
        winner: 'both-wrong',
        awsTime: 0,
        sabaiTime: 0,
      });
    }
  }

  const avgTime = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;

  console.log(`\nSummary for AWS Rekognition:`);
  console.log(`  Exact matches: ${exactMatches}/${labels.length} (${Math.round(exactMatches / labels.length * 100)}%)`);
  console.log(`  Total faces: expected ${labels.reduce((s, l) => s + l.faceCount, 0)}, detected ${totalDetected}`);
  console.log(`  Detection rate: ${Math.round(totalDetected / labels.reduce((s, l) => s + l.faceCount, 0) * 100)}%`);
  console.log(`  Avg duration: ${avgTime.toFixed(0)}ms`);

  return {
    results,
    summary: {
      provider: 'aws',
      exactMatches,
      totalDetected,
      avgTime,
    },
  };
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║     Optimized SabaiFace vs AWS Rekognition Comparison                       ║');
  console.log('║     Config: 0.3 threshold, 1024px resize, no age/gender                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  // Skip AWS if requested
  const skipAWS = process.env.SKIP_AWS === 'true' || process.env.SKIP_AWS === '1';
  if (skipAWS) {
    console.log('\nℹ️  AWS tests skipped (SKIP_AWS=true)');
  }

  // Test both providers
  const { results: sabaiResults, summary: sabaiSummary } = await testOptimizedSabaiFace(validLabels);

  let awsSummary: Summary;
  let awsResults: Result[];

  if (!skipAWS) {
    const awsResult = await testAWS(validLabels);
    awsSummary = awsResult.summary;
    awsResults = awsResult.results;

    // Merge results
    for (let i = 0; i < validLabels.length; i++) {
      sabaiResults[i].awsDetected = awsResults[i].awsDetected;
      sabaiResults[i].awsMatch = awsResults[i].awsMatch;
      sabaiResults[i].awsTime = awsResults[i].awsTime;

      // Determine winner
      const sabaiDiff = Math.abs(sabaiResults[i].sabaiDetected - sabaiResults[i].expected);
      const awsDiff = Math.abs(sabaiResults[i].awsDetected - sabaiResults[i].expected);

      if (sabaiResults[i].sabaiMatch && !sabaiResults[i].awsMatch) {
        sabaiResults[i].winner = 'sabai';
      } else if (sabaiResults[i].awsMatch && !sabaiResults[i].sabaiMatch) {
        sabaiResults[i].winner = 'aws';
      } else if (sabaiResults[i].sabaiMatch && sabaiResults[i].awsMatch) {
        sabaiResults[i].winner = 'tie';
      } else if (sabaiDiff < awsDiff) {
        sabaiResults[i].winner = 'sabai';
      } else if (awsDiff < sabaiDiff) {
        sabaiResults[i].winner = 'aws';
      } else {
        sabaiResults[i].winner = 'tie';
      }
    }
  }

  // Print comparison
  if (!skipAWS && awsSummary.avgTime > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('COMPARISON RESULTS');
    console.log('='.repeat(80));
    console.log('');

    console.log('Provider    | Exact Matches | Detection Rate | Avg Time');
    console.log('-'.repeat(80));

    const totalExpected = validLabels.reduce((s, l) => s + l.faceCount, 0);

    const sabaiAccuracy = Math.round((sabaiSummary.exactMatches / validLabels.length) * 100);
    const sabaiDetectionRate = Math.round((sabaiSummary.totalDetected / totalExpected) * 100);

    const awsAccuracy = Math.round((awsSummary.exactMatches / validLabels.length) * 100);
    const awsDetectionRate = Math.round((awsSummary.totalDetected / totalExpected) * 100);

    console.log(
      `SabaiFace   | ${sabaiSummary.exactMatches}/${validLabels.length} (${sabaiAccuracy}%)  | ` +
      `${sabaiSummary.totalDetected}/${totalExpected} (${sabaiDetectionRate}%)   | ` +
      `${sabaiSummary.avgTime.toFixed(0).padStart(6)}ms`
    );

    console.log(
      `AWS Rekog   | ${awsSummary.exactMatches}/${validLabels.length} (${awsAccuracy}%)  | ` +
      `${awsSummary.totalDetected}/${totalExpected} (${awsDetectionRate}%)   | ` +
      `${awsSummary.avgTime.toFixed(0).padStart(6)}ms`
    );

    // Winner
    console.log('\n');
    if (sabaiSummary.exactMatches > awsSummary.exactMatches) {
      console.log(`🏆 SabaiFace wins: +${sabaiSummary.exactMatches - awsSummary.exactMatches} more exact matches`);
    } else if (awsSummary.exactMatches > sabaiSummary.exactMatches) {
      console.log(`🏆 AWS wins: +${awsSummary.exactMatches - sabaiSummary.exactMatches} more exact matches`);
    } else {
      console.log(`🤝 Tie: Both have ${sabaiSummary.exactMatches} exact matches`);
    }

    // Speed comparison
    const speedup = awsSummary.avgTime / sabaiSummary.avgTime;
    if (speedup > 1) {
      console.log(`⚡ SabaiFace is ${speedup.toFixed(1)}x faster`);
    } else {
      console.log(`⚡ AWS is ${(1 / speedup).toFixed(1)}x faster`);
    }

    // Per-image comparison
    console.log('\n' + '='.repeat(80));
    console.log('PER-IMAGE COMPARISON');
    console.log('='.repeat(80));
    console.log('');
    console.log('Image        | Expected | SabaiFace | AWS | Better');
    console.log('-'.repeat(80));

    for (let i = 0; i < validLabels.length; i++) {
      const result = sabaiResults[i];
      const winner =
        result.winner === 'sabai' ? 'SabaiFace' :
        result.winner === 'aws' ? 'AWS' :
        result.winner === 'tie' ? '=' : '-';

      console.log(
        `${result.image.padEnd(12)} | ` +
        `${result.expected.toString().padStart(8)} | ` +
        `${result.sabaiDetected.toString().padStart(9)} | ` +
        `${result.awsDetected.toString().padStart(3)} | ` +
        `${winner}`
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
