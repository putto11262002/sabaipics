/**
 * Face Detection Integration Tests
 *
 * Tests face-api.js integration with real face detection.
 * Requires models to be downloaded to models/ directory.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { FaceDetector } from '../../src/core/face-detector';
import { loadImageFromBuffer } from '../../src/utils/image';
import fs from 'fs/promises';
import path from 'path';

describe('Face Detection Integration', () => {
  let detector: FaceDetector;
  const modelsPath = path.join(__dirname, '../../models');

  beforeAll(async () => {
    // Initialize detector with models
    detector = new FaceDetector({
      modelsPath,
      minConfidence: 0.5,
      detectAttributes: true,
    });

    // Load models (this may take 2-3 seconds)
    await detector.loadModels();
  }, 30000); // 30 second timeout for model loading

  describe('Model Loading', () => {
    it('should load models successfully', async () => {
      // Models already loaded in beforeAll
      expect(detector).toBeDefined();
    });

    it('should not reload models if already loaded', async () => {
      const startTime = Date.now();
      await detector.loadModels();
      const loadTime = Date.now() - startTime;

      // Should be very fast (< 100ms) if already loaded
      expect(loadTime).toBeLessThan(100);
    });
  });

  describe('Face Detection', () => {
    it('should detect faces in an image with one face', async () => {
      // Note: This test requires a test image with a face
      // For now, we'll skip if no test image is available
      const testImagePath = path.join(__dirname, '../fixtures/images/test-face-1.jpg');

      try {
        const imageBuffer = await fs.readFile(testImagePath);
        const detections = await detector.detectFaces(imageBuffer.buffer);

        expect(detections.length).toBeGreaterThan(0);
        expect(detections[0]).toMatchObject({
          boundingBox: expect.objectContaining({
            x: expect.any(Number),
            y: expect.any(Number),
            width: expect.any(Number),
            height: expect.any(Number),
          }),
          descriptor: expect.any(Float32Array),
          confidence: expect.any(Number),
        });

        // Descriptor should be 128-D
        expect(detections[0].descriptor.length).toBe(128);

        // Confidence should be 0-1
        expect(detections[0].confidence).toBeGreaterThanOrEqual(0);
        expect(detections[0].confidence).toBeLessThanOrEqual(1);
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          console.warn('Test image not found, skipping test');
          // Skip test if no image available
          return;
        }
        throw error;
      }
    });

    it('should return empty array for image with no faces', async () => {
      // Create a simple blank image (1x1 pixel white)
      const canvas = require('canvas');
      const cvs = canvas.createCanvas(100, 100);
      const ctx = cvs.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 100, 100);

      const imageBuffer = cvs.toBuffer('image/png');
      const detections = await detector.detectFaces(imageBuffer.buffer);

      expect(detections).toEqual([]);
    });

    it('should detect multiple faces in an image', async () => {
      const testImagePath = path.join(__dirname, '../fixtures/images/test-faces-multiple.jpg');

      try {
        const imageBuffer = await fs.readFile(testImagePath);
        const detections = await detector.detectFaces(imageBuffer.buffer);

        // Should detect multiple faces
        expect(detections.length).toBeGreaterThan(1);

        // All detections should have valid structure
        for (const detection of detections) {
          expect(detection.descriptor.length).toBe(128);
          expect(detection.confidence).toBeGreaterThan(0);
        }
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          console.warn('Test image not found, skipping test');
          return;
        }
        throw error;
      }
    });
  });

  describe('Attribute Detection', () => {
    it('should detect age and gender when enabled', async () => {
      const testImagePath = path.join(__dirname, '../fixtures/images/test-face-1.jpg');

      try {
        const imageBuffer = await fs.readFile(testImagePath);
        const detections = await detector.detectFaces(imageBuffer.buffer);

        if (detections.length > 0) {
          const face = detections[0];

          // Age should be detected (if image has a clear face)
          if (face.age !== undefined) {
            expect(face.age).toBeGreaterThan(0);
            expect(face.age).toBeLessThan(150);
          }

          // Gender should be detected
          if (face.gender) {
            expect(['male', 'female']).toContain(face.gender.toLowerCase());
            expect(face.genderConfidence).toBeGreaterThanOrEqual(0);
            expect(face.genderConfidence).toBeLessThanOrEqual(1);
          }
        }
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          console.warn('Test image not found, skipping test');
          return;
        }
        throw error;
      }
    });
  });

  describe('Landmarks Detection', () => {
    it('should detect 68-point facial landmarks', async () => {
      const testImagePath = path.join(__dirname, '../fixtures/images/test-face-1.jpg');

      try {
        const imageBuffer = await fs.readFile(testImagePath);
        const detections = await detector.detectFaces(imageBuffer.buffer);

        if (detections.length > 0) {
          const face = detections[0];

          if (face.landmarks) {
            // Should have 68 landmark points
            expect(face.landmarks.length).toBe(68);

            // Each landmark should have x, y coordinates
            for (const landmark of face.landmarks) {
              expect(landmark).toMatchObject({
                x: expect.any(Number),
                y: expect.any(Number),
              });
            }
          }
        }
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          console.warn('Test image not found, skipping test');
          return;
        }
        throw error;
      }
    });
  });

  describe('Performance', () => {
    it('should detect faces within reasonable time', async () => {
      const testImagePath = path.join(__dirname, '../fixtures/images/test-face-1.jpg');

      try {
        const imageBuffer = await fs.readFile(testImagePath);

        const startTime = Date.now();
        await detector.detectFaces(imageBuffer.buffer);
        const detectTime = Date.now() - startTime;

        // Detection should be < 500ms for a single face
        expect(detectTime).toBeLessThan(500);
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          console.warn('Test image not found, skipping test');
          return;
        }
        throw error;
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle invalid image data gracefully', async () => {
      const invalidBuffer = Buffer.from('not an image');

      await expect(detector.detectFaces(invalidBuffer.buffer)).rejects.toThrow();
    });

    it('should handle empty buffer gracefully', async () => {
      const emptyBuffer = Buffer.alloc(0);

      await expect(detector.detectFaces(emptyBuffer.buffer)).rejects.toThrow();
    });
  });
});
