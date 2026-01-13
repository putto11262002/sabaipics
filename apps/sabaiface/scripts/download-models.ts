#!/usr/bin/env tsx
/**
 * Download face-api.js Models
 *
 * Downloads required face-api.js model files to ./models directory.
 *
 * Usage:
 *   pnpm models:download
 *
 * Available models:
 *   - SSD MobileNetV1 (default, high accuracy)
 *   - Tiny Face Detector (fast, various input sizes)
 *   - Face Landmark 68
 *   - Face Recognition
 *   - Age/Gender
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = path.join(__dirname, '../models');

// Model URLs from @vladmandic/face-api GitHub
const MODEL_BASE_URL = 'https://raw.githubusercontent.com/vladmandic/face-api/master/model/';

const MODELS = [
  // Face detection models
  {
    name: 'SSD MobileNetV1',
    files: [
      'ssd_mobilenetv1_model-weights_manifest.json',
      'ssd_mobilenetv1_model.bin',
    ],
  },
  {
    name: 'Tiny Face Detector',
    files: [
      'tiny_face_detector_model-weights_manifest.json',
      'tiny_face_detector_model.bin',
    ],
  },
  // Face landmark model
  {
    name: 'Face Landmark 68',
    files: [
      'face_landmark_68_model-weights_manifest.json',
      'face_landmark_68_model.bin',
    ],
  },
  // Face recognition model
  {
    name: 'Face Recognition',
    files: [
      'face_recognition_model-weights_manifest.json',
      'face_recognition_model.bin',
    ],
  },
  // Age/gender model
  {
    name: 'Age/Gender',
    files: [
      'age_gender_model-weights_manifest.json',
      'age_gender_model.bin',
    ],
  },
];

/**
 * Download a file from URL to local path
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  console.log(`  Downloading: ${path.basename(destPath)}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
}

/**
 * Download a model set
 */
async function downloadModel(model: typeof MODELS[0]): Promise<void> {
  console.log(`\n${model.name}:`);

  for (const file of model.files) {
    const url = `${MODEL_BASE_URL}${file}`;
    const destPath = path.join(MODELS_DIR, file);

    // Skip if already exists
    if (fs.existsSync(destPath)) {
      console.log(`  ✓ ${file} (already exists)`);
      continue;
    }

    await downloadFile(url, destPath);
  }

  console.log(`  ✓ ${model.name} complete`);
}

/**
 * Main download function
 */
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    Face API Models Download                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  // Create models directory
  if (!fs.existsSync(MODELS_DIR)) {
    console.log(`\nCreating models directory: ${MODELS_DIR}`);
    fs.mkdirSync(MODELS_DIR, { recursive: true });
  }

  console.log(`\nModels directory: ${MODELS_DIR}`);
  console.log(`\nDownloading models from: ${MODEL_BASE_URL}`);

  // Download all models
  for (const model of MODELS) {
    try {
      await downloadModel(model);
    } catch (error) {
      console.error(`  ✗ ${model.name} failed:`, error.message);
    }
  }

  console.log('\n✅ Download complete!\n');
}

main().catch((error) => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
