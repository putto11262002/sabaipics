#!/usr/bin/env tsx
/**
 * Face Detection Comparison Test
 *
 * Compares face detection accuracy between SabaiFace (local) and AWS Rekognition
 * on the same fixture image test set.
 *
 * SabaiFace uses a 0.3 confidence threshold as specified for local use.
 *
 * Usage:
 *   pnpm tsx tests/manual/test-detection-comparison.ts
 *
 * Requirements:
 *   - .dev.vars file with AWS credentials (copy from apps/api/.dev.vars)
 *   - Models downloaded in ./models directory (for SabaiFace)
 */

import fs from 'fs';
import path from 'path';

// =============================================================================
// Load environment from .dev.vars (same format as Cloudflare Workers)
// =============================================================================

function loadDevVars() {
  const devVarsPath = path.join(process.cwd(), '.dev.vars');

  if (!fs.existsSync(devVarsPath)) {
    console.log('ℹ️  No .dev.vars file found. AWS tests will be skipped.');
    console.log('   Copy from apps/api/.dev.vars or create a symlink.\n');
    return;
  }

  const content = fs.readFileSync(devVarsPath, 'utf-8');
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Remove surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Only set if not already in environment
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }

  console.log('✓ Loaded environment from .dev.vars\n');
}

// Load env vars before other imports that might need them
loadDevVars();
import { FaceDetector } from '../../src/core/face-detector';
import {
  RekognitionClient,
  DetectFacesCommand,
} from '@aws-sdk/client-rekognition';

// =============================================================================
// Configuration
// =============================================================================

const FIXTURES_PATH = path.join(process.cwd(), 'tests/fixtures/images');
const LABELS_FILE = path.join(FIXTURES_PATH, 'labels.json');
const MODELS_PATH = path.join(process.cwd(), 'models');

// Thresholds
const SABAIFACE_THRESHOLD = 0.3; // User-specified threshold for local use
const AWS_THRESHOLD = 0.3; // Match threshold for fair comparison

interface ImageLabel {
  image: string;
  faceCount: number;
}

interface DetectionResult {
  image: string;
  expected: number;
  detected: number;
  match: boolean;
  error?: string;
  timeMs: number;
  confidences: number[];
}

interface ProviderSummary {
  provider: string;
  results: DetectionResult[];
  exactMatches: number;
  totalExpected: number;
  totalDetected: number;
  avgTimeMs: number;
}

// =============================================================================
// SabaiFace Detection (Local)
// =============================================================================

async function testSabaiFace(labels: ImageLabel[]): Promise<ProviderSummary> {
  console.log('\n' + '='.repeat(80));
  console.log('SABAIFACE (Local) - Threshold: ' + SABAIFACE_THRESHOLD);
  console.log('='.repeat(80) + '\n');

  // Initialize face detector
  const detector = new FaceDetector({
    modelsPath: MODELS_PATH,
    minConfidence: SABAIFACE_THRESHOLD,
    detectAttributes: false, // Faster without attributes
  });

  console.log('Loading models...');
  const modelLoadStart = Date.now();
  await detector.loadModels();
  console.log(`Models loaded in ${Date.now() - modelLoadStart}ms\n`);

  const results: DetectionResult[] = [];

  for (const label of labels) {
    const imagePath = path.join(process.cwd(), label.image);
    const imageFilename = path.basename(label.image);

    const startTime = Date.now();

    try {
      const imageBuffer = fs.readFileSync(imagePath);
      const arrayBuffer = imageBuffer.buffer.slice(
        imageBuffer.byteOffset,
        imageBuffer.byteOffset + imageBuffer.byteLength
      );

      const detections = await detector.detectFaces(arrayBuffer);
      const timeMs = Date.now() - startTime;

      const detected = detections.length;
      const match = detected === label.faceCount;
      const symbol = match ? '✓' : '✗';
      const confidences = detections.map((d) => d.confidence);

      console.log(
        `${imageFilename.padEnd(12)} expected ${label.faceCount}, detected ${detected} ${symbol} (${timeMs}ms)`
      );

      if (!match && detections.length > 0) {
        const confStr = confidences.map((c) => c.toFixed(2)).join(', ');
        console.log(`  └─ confidences: [${confStr}]`);
      }

      results.push({
        image: imageFilename,
        expected: label.faceCount,
        detected,
        match,
        timeMs,
        confidences,
      });
    } catch (error: any) {
      const timeMs = Date.now() - startTime;
      console.log(`${imageFilename.padEnd(12)} ERROR: ${error.message}`);

      results.push({
        image: imageFilename,
        expected: label.faceCount,
        detected: 0,
        match: false,
        error: error.message,
        timeMs,
        confidences: [],
      });
    }
  }

  const exactMatches = results.filter((r) => r.match).length;
  const totalExpected = results.reduce((sum, r) => sum + r.expected, 0);
  const totalDetected = results.reduce((sum, r) => sum + r.detected, 0);
  const avgTimeMs = Math.round(
    results.reduce((sum, r) => sum + r.timeMs, 0) / results.length
  );

  console.log(`\nSummary:`);
  console.log(
    `  Exact matches: ${exactMatches}/${labels.length} (${Math.round((exactMatches / labels.length) * 100)}%)`
  );
  console.log(
    `  Total faces: expected ${totalExpected}, detected ${totalDetected} (${Math.round((totalDetected / totalExpected) * 100)}%)`
  );
  console.log(`  Avg time per image: ${avgTimeMs}ms`);

  return {
    provider: 'sabaiface',
    results,
    exactMatches,
    totalExpected,
    totalDetected,
    avgTimeMs,
  };
}

// =============================================================================
// AWS Rekognition Detection
// =============================================================================

async function testAWSRekognition(labels: ImageLabel[]): Promise<ProviderSummary> {
  const awsRegion = process.env.AWS_REGION || 'us-east-1';

  console.log('\n' + '='.repeat(80));
  console.log(`AWS REKOGNITION - Threshold: ${AWS_THRESHOLD} - Region: ${awsRegion}`);
  console.log('='.repeat(80) + '\n');

  // Check for AWS credentials
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.log('⚠️  AWS credentials not found. Skipping AWS tests.');
    console.log('   Copy .dev.vars from apps/api/ or set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.\n');

    return {
      provider: 'aws',
      results: labels.map((l) => ({
        image: path.basename(l.image),
        expected: l.faceCount,
        detected: 0,
        match: false,
        error: 'AWS credentials not configured',
        timeMs: 0,
        confidences: [],
      })),
      exactMatches: 0,
      totalExpected: labels.reduce((sum, l) => sum + l.faceCount, 0),
      totalDetected: 0,
      avgTimeMs: 0,
    };
  }

  const client = new RekognitionClient({
    region: awsRegion,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const results: DetectionResult[] = [];

  for (const label of labels) {
    const imagePath = path.join(process.cwd(), label.image);
    const imageFilename = path.basename(label.image);

    const startTime = Date.now();

    try {
      const imageBuffer = fs.readFileSync(imagePath);

      // Use DetectFaces (no collection needed) for pure detection test
      const command = new DetectFacesCommand({
        Image: {
          Bytes: new Uint8Array(imageBuffer),
        },
        Attributes: ['DEFAULT'], // Faster than 'ALL'
      });

      const response = await client.send(command);
      const timeMs = Date.now() - startTime;

      // Filter by confidence threshold
      const allFaces = response.FaceDetails ?? [];
      const filteredFaces = allFaces.filter(
        (face) => (face.Confidence ?? 0) / 100 >= AWS_THRESHOLD
      );

      const detected = filteredFaces.length;
      const match = detected === label.faceCount;
      const symbol = match ? '✓' : '✗';
      const confidences = filteredFaces.map((f) => (f.Confidence ?? 0) / 100);

      console.log(
        `${imageFilename.padEnd(12)} expected ${label.faceCount}, detected ${detected} ${symbol} (${timeMs}ms)`
      );

      if (!match && filteredFaces.length > 0) {
        const confStr = confidences.map((c) => c.toFixed(2)).join(', ');
        console.log(`  └─ confidences: [${confStr}]`);
      }

      results.push({
        image: imageFilename,
        expected: label.faceCount,
        detected,
        match,
        timeMs,
        confidences,
      });

      // Rate limiting - AWS has TPS limits
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error: any) {
      const timeMs = Date.now() - startTime;
      console.log(`${imageFilename.padEnd(12)} ERROR: ${error.message}`);

      results.push({
        image: imageFilename,
        expected: label.faceCount,
        detected: 0,
        match: false,
        error: error.message,
        timeMs,
        confidences: [],
      });
    }
  }

  const exactMatches = results.filter((r) => r.match).length;
  const totalExpected = results.reduce((sum, r) => sum + r.expected, 0);
  const totalDetected = results.reduce((sum, r) => sum + r.detected, 0);
  const avgTimeMs = Math.round(
    results.reduce((sum, r) => sum + r.timeMs, 0) / results.length
  );

  console.log(`\nSummary:`);
  console.log(
    `  Exact matches: ${exactMatches}/${labels.length} (${Math.round((exactMatches / labels.length) * 100)}%)`
  );
  console.log(
    `  Total faces: expected ${totalExpected}, detected ${totalDetected} (${Math.round((totalDetected / totalExpected) * 100)}%)`
  );
  console.log(`  Avg time per image: ${avgTimeMs}ms`);

  return {
    provider: 'aws',
    results,
    exactMatches,
    totalExpected,
    totalDetected,
    avgTimeMs,
  };
}

// =============================================================================
// Comparison Report
// =============================================================================

function printComparison(sabaiface: ProviderSummary, aws: ProviderSummary, labels: ImageLabel[]) {
  console.log('\n' + '='.repeat(80));
  console.log('COMPARISON RESULTS');
  console.log('='.repeat(80));

  // Summary table
  console.log('\n┌─────────────┬───────────────┬────────────────┬───────────┬──────────┐');
  console.log('│ Provider    │ Exact Matches │ Detection Rate │ Accuracy  │ Avg Time │');
  console.log('├─────────────┼───────────────┼────────────────┼───────────┼──────────┤');

  const printRow = (s: ProviderSummary) => {
    const accuracy = Math.round((s.exactMatches / labels.length) * 100);
    const detectionRate = s.totalExpected > 0
      ? Math.round((s.totalDetected / s.totalExpected) * 100)
      : 0;
    console.log(
      `│ ${s.provider.padEnd(11)} │ ` +
        `${s.exactMatches}/${labels.length} (${accuracy.toString().padStart(3)}%) │ ` +
        `${s.totalDetected}/${s.totalExpected} (${detectionRate.toString().padStart(3)}%) │ ` +
        `${accuracy.toString().padStart(7)}% │ ` +
        `${s.avgTimeMs.toString().padStart(5)}ms │`
    );
  };

  printRow(sabaiface);
  printRow(aws);
  console.log('└─────────────┴───────────────┴────────────────┴───────────┴──────────┘');

  // Winner
  console.log('');
  if (sabaiface.exactMatches > aws.exactMatches) {
    const diff = sabaiface.exactMatches - aws.exactMatches;
    console.log(`🏆 Winner: SabaiFace (+${diff} more exact matches)`);
  } else if (aws.exactMatches > sabaiface.exactMatches) {
    const diff = aws.exactMatches - sabaiface.exactMatches;
    console.log(`🏆 Winner: AWS Rekognition (+${diff} more exact matches)`);
  } else {
    console.log(`🤝 Tie: Both providers have ${sabaiface.exactMatches} exact matches`);
  }

  // Per-image comparison
  console.log('\n' + '─'.repeat(80));
  console.log('PER-IMAGE COMPARISON');
  console.log('─'.repeat(80));
  console.log(
    '\n│ Image        │ Expected │ SabaiFace │  AWS  │ Winner     │'
  );
  console.log('├──────────────┼──────────┼───────────┼───────┼────────────┤');

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    const sf = sabaiface.results[i];
    const aw = aws.results[i];

    const sfDiff = Math.abs(sf.detected - label.faceCount);
    const awDiff = Math.abs(aw.detected - label.faceCount);

    let winner = '=';
    if (sfDiff < awDiff) {
      winner = 'SabaiFace';
    } else if (awDiff < sfDiff) {
      winner = 'AWS';
    }

    const sfStr = sf.error ? 'ERR' : sf.detected.toString();
    const awStr = aw.error ? 'ERR' : aw.detected.toString();
    const imageName = path.basename(label.image);

    console.log(
      `│ ${imageName.padEnd(12)} │ ` +
        `${label.faceCount.toString().padStart(8)} │ ` +
        `${sfStr.padStart(9)} │ ` +
        `${awStr.padStart(5)} │ ` +
        `${winner.padEnd(10)} │`
    );
  }

  console.log('└──────────────┴──────────┴───────────┴───────┴────────────┘');

  // Detection difference analysis
  console.log('\n' + '─'.repeat(80));
  console.log('DETECTION DIFFERENCES');
  console.log('─'.repeat(80));

  const sfOverDetect = sabaiface.results.filter((r) => r.detected > r.expected);
  const sfUnderDetect = sabaiface.results.filter((r) => r.detected < r.expected);
  const awOverDetect = aws.results.filter((r) => r.detected > r.expected && !r.error);
  const awUnderDetect = aws.results.filter((r) => r.detected < r.expected && !r.error);

  console.log(`\nSabaiFace (threshold: ${SABAIFACE_THRESHOLD}):`);
  console.log(`  Over-detected: ${sfOverDetect.length} images`);
  if (sfOverDetect.length > 0) {
    sfOverDetect.forEach((r) => {
      console.log(`    - ${r.image}: +${r.detected - r.expected} extra faces`);
    });
  }
  console.log(`  Under-detected: ${sfUnderDetect.length} images`);
  if (sfUnderDetect.length > 0) {
    sfUnderDetect.forEach((r) => {
      console.log(`    - ${r.image}: -${r.expected - r.detected} missed faces`);
    });
  }

  console.log(`\nAWS Rekognition (threshold: ${AWS_THRESHOLD}):`);
  console.log(`  Over-detected: ${awOverDetect.length} images`);
  if (awOverDetect.length > 0) {
    awOverDetect.forEach((r) => {
      console.log(`    - ${r.image}: +${r.detected - r.expected} extra faces`);
    });
  }
  console.log(`  Under-detected: ${awUnderDetect.length} images`);
  if (awUnderDetect.length > 0) {
    awUnderDetect.forEach((r) => {
      console.log(`    - ${r.image}: -${r.expected - r.detected} missed faces`);
    });
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║     Face Detection Comparison: SabaiFace vs AWS Rekognition                ║');
  console.log('║     SabaiFace threshold: 0.3 (local use)                                   ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');

  // Check for models directory
  if (!fs.existsSync(MODELS_PATH)) {
    console.error('\n❌ Models directory not found:', MODELS_PATH);
    console.error('   Please download face-api.js models first.');
    process.exit(1);
  }

  // Load labels
  if (!fs.existsSync(LABELS_FILE)) {
    console.error('\n❌ Labels file not found:', LABELS_FILE);
    console.error('   Please label the images first: pnpm label');
    process.exit(1);
  }

  const labels: ImageLabel[] = JSON.parse(fs.readFileSync(LABELS_FILE, 'utf-8'));
  const validLabels = labels.filter((l) => l.faceCount > 0);

  if (validLabels.length === 0) {
    console.error('\n❌ No labeled images found. Please label the images first.');
    console.error('   Run: pnpm label');
    process.exit(1);
  }

  console.log(`\nFound ${validLabels.length} labeled images for testing.\n`);

  // Run tests
  const sabaifaceResult = await testSabaiFace(validLabels);
  const awsResult = await testAWSRekognition(validLabels);

  // Print comparison
  printComparison(sabaifaceResult, awsResult, validLabels);

  console.log('\n✅ Test complete\n');
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});
