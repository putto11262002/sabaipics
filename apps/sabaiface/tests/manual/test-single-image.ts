#!/usr/bin/env tsx
/**
 * Quick Single Image Test
 *
 * Usage:
 *   pnpm tsx tests/manual/test-single-image.ts <image-path>
 *
 * Example:
 *   pnpm tsx tests/manual/test-single-image.ts tests/fixtures/images/1.jpg
 */

import fs from 'fs';
import path from 'path';
import { createSabaiFaceService } from '../../src/factory/face-service-factory';
import { FaceDetector } from '../../src/core/face-detector';
import { createDb } from '@sabaipics/db';

const imagePath = process.argv[2];

if (!imagePath) {
  console.error('Usage: tsx test-single-image.ts <image-path>');
  console.error('Example: tsx test-single-image.ts tests/fixtures/images/1.jpg');
  process.exit(1);
}

if (!fs.existsSync(imagePath)) {
  console.error(`Error: Image not found: ${imagePath}`);
  process.exit(1);
}

async function main() {
  console.log('🧪 Single Image Face Detection Test\n');

  const imageName = path.basename(imagePath);
  console.log(`📸 Image: ${imageName}`);

  // Initialize service
  console.log('🚀 Initializing face detector...');

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    console.error('   Set it to your Neon connection string');
    process.exit(1);
  }

  const db = createDb(process.env.DATABASE_URL);

  // Create and initialize face detector
  const modelsPath = path.join(process.cwd(), 'models');
  const faceDetector = new FaceDetector({ modelsPath });
  await faceDetector.loadModels();

  // Create face service
  const faceService = createSabaiFaceService(faceDetector, db);

  // Read image
  const imageBuffer = fs.readFileSync(imagePath);
  console.log(`   Size: ${(imageBuffer.length / 1024).toFixed(2)} KB`);

  // Detect faces
  console.log('\n🔍 Detecting faces...');
  const start = Date.now();

  const result = await faceService.indexPhoto({
    eventId: 'test-single-image',
    photoId: undefined, // photoId is nullable for testing
    imageData: imageBuffer.buffer,
    options: {
      maxFaces: 100,
      minConfidence: 0.5,
      detectAttributes: true,
    },
  });

  const duration = Date.now() - start;

  // Print results
  console.log(`\n✅ Detection complete (${duration}ms)\n`);
  console.log(`Faces detected: ${result.faces.length}`);

  if (result.faces.length > 0) {
    console.log('\nFace Details:');
    result.faces.forEach((face, idx) => {
      console.log(`\n  Face ${idx + 1}:`);
      console.log(`    Confidence: ${(face.confidence * 100).toFixed(1)}%`);
      console.log(`    Bounding Box: [${face.boundingBox.left.toFixed(2)}, ${face.boundingBox.top.toFixed(2)}, ${face.boundingBox.width.toFixed(2)}, ${face.boundingBox.height.toFixed(2)}]`);

      if (face.attributes?.age) {
        console.log(`    Age: ${face.attributes.age.min}-${face.attributes.age.max} years`);
      }

      if (face.attributes?.gender) {
        console.log(`    Gender: ${face.attributes.gender.value} (${(face.attributes.gender.confidence * 100).toFixed(1)}%)`);
      }
    });
  }

  if (result.unindexedFaces.length > 0) {
    console.log(`\n⚠️  Unindexed faces: ${result.unindexedFaces.length}`);
    result.unindexedFaces.forEach((uf, idx) => {
      console.log(`  ${idx + 1}. Reasons: ${uf.reasons.join(', ')}`);
    });
  }

  console.log();
}

main().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
