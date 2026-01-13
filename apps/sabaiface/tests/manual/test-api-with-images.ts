#!/usr/bin/env tsx
/**
 * Manual Test Script for SabaiFace HTTP API with Real Images
 *
 * Prerequisites:
 * - Server must be running: pnpm dev
 * - Test images in tests/fixtures/images/
 *
 * Tests:
 * 1. Health check
 * 2. Create collection
 * 3. Index faces from images
 * 4. Search for similar faces
 * 5. Delete collection
 */

import fs from 'fs';
import path from 'path';

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const FIXTURES_PATH = path.join(process.cwd(), 'tests/fixtures/images');
const LABELS_FILE = path.join(FIXTURES_PATH, 'labels.json');
const TEST_COLLECTION = `test-api-${Date.now()}`;

interface ImageLabel {
  image: string;
  faceCount: number;
}

async function main() {
  console.log('🧪 SabaiFace HTTP API Test\n');
  console.log('=' .repeat(60));
  console.log(`API URL: ${API_BASE_URL}`);
  console.log('=' .repeat(60));

  // Load labels
  const labels: ImageLabel[] = JSON.parse(fs.readFileSync(LABELS_FILE, 'utf-8'));
  console.log(`\n📋 Loaded ${labels.length} labeled images`);

  // Test 1: Health Check
  console.log('\n' + '='.repeat(60));
  console.log('TEST 1: Health Check');
  console.log('='.repeat(60));

  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    const data = await response.json();

    console.log(`\n   Status: ${response.status}`);
    console.log(`   Service: ${data.service}`);
    console.log(`   Provider: ${data.provider}`);
    console.log(`   Version: ${data.version}`);
    console.log('   ✅ Health check passed');
  } catch (error) {
    console.log(`   ❌ Health check failed: ${error instanceof Error ? error.message : String(error)}`);
    console.log('\n⚠️  Make sure the server is running: pnpm dev\n');
    process.exit(1);
  }

  // Test 2: Create Collection
  console.log('\n' + '='.repeat(60));
  console.log('TEST 2: Create Collection');
  console.log('='.repeat(60));

  try {
    const response = await fetch(`${API_BASE_URL}/collections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ CollectionId: TEST_COLLECTION }),
    });

    const data = await response.json();

    if (response.status === 200) {
      console.log(`\n   Collection created: ${TEST_COLLECTION}`);
      console.log(`   ARN: ${data.CollectionArn}`);
      console.log(`   Model version: ${data.FaceModelVersion}`);
      console.log('   ✅ Collection creation passed');
    } else {
      throw new Error(`Failed to create collection: ${data.message || response.statusText}`);
    }
  } catch (error) {
    console.log(`   ❌ Collection creation failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  // Test 3: Index Faces
  console.log('\n' + '='.repeat(60));
  console.log('TEST 3: Index Faces');
  console.log('='.repeat(60));

  const indexResults: Array<{
    image: string;
    expected: number;
    detected: number;
    duration: number;
  }> = [];

  // Test with first 5 images for speed
  const testImages = labels.slice(0, 5);

  for (const label of testImages) {
    const imagePath = path.join(process.cwd(), label.image);
    const imageFilename = path.basename(label.image);

    process.stdout.write(`\n📸 Indexing ${imageFilename}... `);

    try {
      // Read and encode image
      const imageBuffer = fs.readFileSync(imagePath);
      const imageBase64 = imageBuffer.toString('base64');

      const start = Date.now();
      const response = await fetch(`${API_BASE_URL}/collections/${TEST_COLLECTION}/index-faces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          Image: { Bytes: imageBase64 },
          ExternalImageId: imageFilename,
          MaxFaces: 100,
          DetectionAttributes: ['ALL'],
        }),
      });

      const data = await response.json();
      const duration = Date.now() - start;

      if (response.status === 200) {
        const detected = data.FaceRecords.length;
        const match = detected === label.faceCount;
        const status = match ? '✅' : '⚠️';

        indexResults.push({
          image: imageFilename,
          expected: label.faceCount,
          detected,
          duration,
        });

        console.log(`${status} Expected: ${label.faceCount}, Got: ${detected} (${duration}ms)`);
      } else {
        throw new Error(data.message || response.statusText);
      }
    } catch (error) {
      console.log(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Print indexing summary
  const totalExpected = indexResults.reduce((sum, r) => sum + r.expected, 0);
  const totalDetected = indexResults.reduce((sum, r) => sum + r.detected, 0);
  const avgDuration = indexResults.reduce((sum, r) => sum + r.duration, 0) / indexResults.length;

  console.log('\n   Summary:');
  console.log(`   Total faces expected: ${totalExpected}`);
  console.log(`   Total faces detected: ${totalDetected}`);
  console.log(`   Accuracy: ${((totalDetected/totalExpected)*100).toFixed(1)}%`);
  console.log(`   Avg processing time: ${avgDuration.toFixed(0)}ms`);

  // Test 4: Search Faces
  console.log('\n' + '='.repeat(60));
  console.log('TEST 4: Search Similar Faces');
  console.log('='.repeat(60));

  if (indexResults.length > 0) {
    // Use first indexed image as query
    const queryImage = indexResults[0];
    const queryPath = path.join(process.cwd(), 'tests/fixtures/images', queryImage.image);

    console.log(`\n🔍 Searching with query: ${queryImage.image}`);

    try {
      const queryBuffer = fs.readFileSync(queryPath);
      const queryBase64 = queryBuffer.toString('base64');

      const start = Date.now();
      const response = await fetch(`${API_BASE_URL}/collections/${TEST_COLLECTION}/search-faces-by-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          Image: { Bytes: queryBase64 },
          MaxFaces: 10,
          FaceMatchThreshold: 80,
        }),
      });

      const data = await response.json();
      const duration = Date.now() - start;

      if (response.status === 200) {
        console.log(`\n   Found ${data.FaceMatches.length} matches (${duration}ms)`);

        if (data.FaceMatches.length > 0) {
          console.log('\n   Top 5 matches:');
          data.FaceMatches.slice(0, 5).forEach((match: any, idx: number) => {
            console.log(`   ${idx + 1}. ${match.Face.ExternalImageId} - Similarity: ${match.Similarity.toFixed(1)}%`);
          });
        }

        console.log('   ✅ Search passed');
      } else {
        throw new Error(data.message || response.statusText);
      }
    } catch (error) {
      console.log(`   ❌ Search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    console.log('   ⚠️  No indexed images available for search');
  }

  // Test 5: Delete Collection
  console.log('\n' + '='.repeat(60));
  console.log('TEST 5: Delete Collection (Cleanup)');
  console.log('='.repeat(60));

  try {
    const response = await fetch(`${API_BASE_URL}/collections/${TEST_COLLECTION}`, {
      method: 'DELETE',
    });

    const data = await response.json();

    if (response.status === 200) {
      console.log(`\n   Collection deleted: ${TEST_COLLECTION}`);
      console.log('   ✅ Cleanup passed');
    } else {
      throw new Error(data.message || response.statusText);
    }
  } catch (error) {
    console.log(`   ⚠️  Cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('TEST COMPLETE');
  console.log('='.repeat(60));
  console.log('\n✅ All HTTP API tests completed!\n');
}

// Run tests
main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
