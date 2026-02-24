/**
 * API Integration Tests
 *
 * Tests the HTTP API endpoints.
 * Requires server to be running on PORT 3000.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

// =============================================================================
// Test Configuration
// =============================================================================

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const TEST_COLLECTION = `test-collection-${Date.now()}`;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Make a fetch request and return JSON response
 */
async function fetchJSON(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const data = await response.json();
  return { response, data };
}

/**
 * Load and encode an image as base64
 */
function loadImageAsBase64(imagePath: string): string {
  const buffer = fs.readFileSync(imagePath);
  return buffer.toString('base64');
}

// =============================================================================
// Tests
// =============================================================================

describe('SabaiFace API Integration', () => {
  // Health check tests
  describe('GET /health', () => {
    it('should return health status', async () => {
      const { response, data } = await fetchJSON(`${BASE_URL}/health`);

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.service).toBe('sabaiface');
      expect(data.version).toBeDefined();
      expect(data.timestamp).toBeDefined();
    });
  });

  // Collection management tests
  describe('POST /collections', () => {
    it('should create a new collection', async () => {
      const { response, data } = await fetchJSON(`${BASE_URL}/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          CollectionId: TEST_COLLECTION,
        }),
      });

      expect(response.status).toBe(200);
      expect(data.StatusCode).toBe(200);
      expect(data.CollectionArn).toContain(TEST_COLLECTION);
      expect(data.FaceModelVersion).toBeDefined();
    });

    it('should reject invalid collection ID', async () => {
      const { response, data } = await fetchJSON(`${BASE_URL}/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          CollectionId: '', // Invalid: empty
        }),
      });

      expect(response.status).toBe(400);
      expect(data.__type).toBe('InvalidParameterException');
    });
  });

  // Note: The following tests require test images to be available
  // They are marked as skipped by default. To enable them:
  // 1. Place test images in tests/fixtures/
  // 2. Remove .skip from the test blocks

  describe.skip('POST /collections/:id/index-faces', () => {
    const TEST_IMAGE_PATH = path.join(__dirname, '../fixtures/test-face.jpg');

    beforeAll(() => {
      // Ensure test image exists
      if (!fs.existsSync(TEST_IMAGE_PATH)) {
        throw new Error(`Test image not found: ${TEST_IMAGE_PATH}`);
      }
    });

    it('should index faces from an image', async () => {
      const imageBase64 = loadImageAsBase64(TEST_IMAGE_PATH);

      const { response, data } = await fetchJSON(
        `${BASE_URL}/collections/${TEST_COLLECTION}/index-faces`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            Image: { Bytes: imageBase64 },
            ExternalImageId: 'test-photo-1',
            DetectionAttributes: ['ALL'],
            MaxFaces: 100,
          }),
        },
      );

      expect(response.status).toBe(200);
      expect(data.FaceRecords).toBeDefined();
      expect(Array.isArray(data.FaceRecords)).toBe(true);
      expect(data.FaceModelVersion).toBeDefined();

      // If faces were detected
      if (data.FaceRecords.length > 0) {
        const face = data.FaceRecords[0];
        expect(face.Face.FaceId).toBeDefined();
        expect(face.Face.BoundingBox).toBeDefined();
        expect(face.Face.Confidence).toBeGreaterThan(0);
        expect(face.Face.ExternalImageId).toBe('test-photo-1');

        // Check face details
        expect(face.FaceDetail).toBeDefined();
        expect(face.FaceDetail.Confidence).toBeGreaterThan(0);
      }
    });

    it('should reject invalid base64 image', async () => {
      const { response, data } = await fetchJSON(
        `${BASE_URL}/collections/${TEST_COLLECTION}/index-faces`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            Image: { Bytes: 'invalid-base64!!!' },
            ExternalImageId: 'test-photo-invalid',
          }),
        },
      );

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(data.__type).toBeDefined();
    });
  });

  describe.skip('POST /collections/:id/search-faces-by-image', () => {
    const QUERY_IMAGE_PATH = path.join(__dirname, '../fixtures/query-face.jpg');

    beforeAll(() => {
      // Ensure query image exists
      if (!fs.existsSync(QUERY_IMAGE_PATH)) {
        throw new Error(`Query image not found: ${QUERY_IMAGE_PATH}`);
      }
    });

    it('should search for similar faces', async () => {
      const imageBase64 = loadImageAsBase64(QUERY_IMAGE_PATH);

      const { response, data } = await fetchJSON(
        `${BASE_URL}/collections/${TEST_COLLECTION}/search-faces-by-image`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            Image: { Bytes: imageBase64 },
            MaxFaces: 10,
            FaceMatchThreshold: 80,
          }),
        },
      );

      expect(response.status).toBe(200);
      expect(data.FaceMatches).toBeDefined();
      expect(Array.isArray(data.FaceMatches)).toBe(true);
      expect(data.FaceModelVersion).toBeDefined();

      // If matches were found
      if (data.FaceMatches.length > 0) {
        const match = data.FaceMatches[0];
        expect(match.Similarity).toBeGreaterThanOrEqual(0);
        expect(match.Similarity).toBeLessThanOrEqual(100);
        expect(match.Face.FaceId).toBeDefined();
        expect(match.Face.BoundingBox).toBeDefined();
      }
    });

    it('should respect FaceMatchThreshold parameter', async () => {
      const imageBase64 = loadImageAsBase64(QUERY_IMAGE_PATH);

      // Search with high threshold (95%)
      const { response, data } = await fetchJSON(
        `${BASE_URL}/collections/${TEST_COLLECTION}/search-faces-by-image`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            Image: { Bytes: imageBase64 },
            MaxFaces: 10,
            FaceMatchThreshold: 95, // High threshold
          }),
        },
      );

      expect(response.status).toBe(200);
      expect(data.FaceMatches).toBeDefined();

      // All matches should have similarity >= 95
      data.FaceMatches.forEach((match: any) => {
        expect(match.Similarity).toBeGreaterThanOrEqual(95);
      });
    });
  });

  describe('DELETE /collections/:id', () => {
    it('should delete a collection', async () => {
      // Create a temporary collection first
      const tempCollection = `temp-collection-${Date.now()}`;
      await fetchJSON(`${BASE_URL}/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          CollectionId: tempCollection,
        }),
      });

      // Now delete it
      const { response, data } = await fetchJSON(`${BASE_URL}/collections/${tempCollection}`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(200);
      expect(data.StatusCode).toBe(200);
    });
  });

  // 404 handler tests
  describe('404 handler', () => {
    it('should return 404 for unknown routes', async () => {
      const { response, data } = await fetchJSON(`${BASE_URL}/unknown-route`);

      expect(response.status).toBe(404);
      expect(data.__type).toBe('ResourceNotFoundException');
    });
  });
});
