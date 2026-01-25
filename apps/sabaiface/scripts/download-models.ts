#!/usr/bin/env tsx
/**
 * Download face-api.js Models from R2
 *
 * Downloads required face-api.js model files to ./models directory.
 * Only downloads files that don't already exist locally.
 *
 * Usage:
 *   pnpm models:download
 *
 * Environment:
 *   MODELS_PATH - Target directory (default: ./models)
 *   R2_MODELS_URL - R2 public URL (default: production URL)
 *   SKIP_MODEL_DOWNLOAD - Set to "1" to skip download (for CI/CD, Docker builds)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Skip download if flag is set (useful for CI/CD, Docker builds, non-ML devs)
if (process.env.SKIP_MODEL_DOWNLOAD === '1') {
  console.log('[models] SKIP_MODEL_DOWNLOAD=1, skipping model download');
  process.exit(0);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = path.join(__dirname, '../models');

// R2 public URL for face models
const R2_PUBLIC_URL =
  process.env.R2_MODELS_URL || 'https://pub-9b5b2bc0a9bc4b03bbbd97fdd1168fed.r2.dev';

// All model files required
const MODEL_FILES = [
  // Face detection
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model.bin',
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model.bin',
  // Face landmarks
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model.bin',
  // Face recognition
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model.bin',
  // Age/gender
  'age_gender_model-weights_manifest.json',
  'age_gender_model.bin',
];

/**
 * Check if file exists locally
 */
function fileExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Download a file from URL to local path
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
}

/**
 * Download all models
 */
async function downloadModels(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    Face API Models Download                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  // Create models directory
  if (!fs.existsSync(MODELS_DIR)) {
    console.log(`\nCreating models directory: ${MODELS_DIR}`);
    fs.mkdirSync(MODELS_DIR, { recursive: true });
  }

  console.log(`\nModels directory: ${MODELS_DIR}`);
  console.log(`R2 URL: ${R2_PUBLIC_URL}\n`);

  // Check what's already downloaded
  const existingFiles: string[] = [];
  const missingFiles: string[] = [];

  for (const file of MODEL_FILES) {
    const localPath = path.join(MODELS_DIR, file);
    if (fileExists(localPath)) {
      existingFiles.push(file);
    } else {
      missingFiles.push(file);
    }
  }

  // Show status
  if (existingFiles.length > 0) {
    console.log(`✓ Already downloaded: ${existingFiles.length}/${MODEL_FILES.length} files\n`);
  }

  if (missingFiles.length === 0) {
    console.log('✅ All models already downloaded!\n');
    return;
  }

  console.log(`Downloading ${missingFiles.length} files...\n`);

  // Download missing files
  let downloaded = 0;
  let failed = 0;

  for (const file of missingFiles) {
    const url = `${R2_PUBLIC_URL}/${file}`;
    const destPath = path.join(MODELS_DIR, file);

    try {
      process.stdout.write(`  [${downloaded + 1}/${missingFiles.length}] Downloading: ${file}... `);
      await downloadFile(url, destPath);
      downloaded++;
      console.log('✓');
    } catch (error) {
      failed++;
      console.log(`✗`);
      console.error(`    Error: ${error.message}`);
    }
  }

  // Summary
  console.log('\n' + '─'.repeat(80));
  console.log(`Downloaded: ${downloaded}/${missingFiles.length} files`);
  if (failed > 0) {
    console.log(`Failed: ${failed} files`);
  }
  console.log(`Total local files: ${existingFiles.length + downloaded}/${MODEL_FILES.length}`);

  if (failed === 0 && downloaded > 0) {
    console.log('\n✅ Download complete!\n');
  } else if (failed > 0) {
    console.log('\n⚠️  Some downloads failed. Please try again.\n');
    process.exit(1);
  }
}

// Run download
downloadModels().catch((error) => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
