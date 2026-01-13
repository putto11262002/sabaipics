/**
 * Domain Models Tests
 *
 * Test domain model validation and constraints.
 */

import { describe, it, expect } from 'vitest';
import type { BoundingBox, Face, FaceAttributes } from '../../src/domain/face-service';

describe('Domain Models', () => {
  describe('BoundingBox', () => {
    it('should have values in 0-1 range', () => {
      const box: BoundingBox = {
        width: 0.25,
        height: 0.3,
        left: 0.1,
        top: 0.15,
      };

      expect(box.width).toBeGreaterThanOrEqual(0);
      expect(box.width).toBeLessThanOrEqual(1);
      expect(box.height).toBeGreaterThanOrEqual(0);
      expect(box.height).toBeLessThanOrEqual(1);
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.left).toBeLessThanOrEqual(1);
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.top).toBeLessThanOrEqual(1);
    });
  });

  describe('Face', () => {
    it('should have confidence in 0-1 range', () => {
      const face: Face = {
        faceId: 'test-face-id',
        boundingBox: {
          width: 0.25,
          height: 0.3,
          left: 0.1,
          top: 0.15,
        },
        confidence: 0.95,
        provider: 'aws',
      };

      expect(face.confidence).toBeGreaterThanOrEqual(0);
      expect(face.confidence).toBeLessThanOrEqual(1);
    });

    it('should have valid provider', () => {
      const awsFace: Face = {
        faceId: 'test-1',
        boundingBox: { width: 0.2, height: 0.2, left: 0.1, top: 0.1 },
        confidence: 0.9,
        provider: 'aws',
      };

      const sabaiFace: Face = {
        faceId: 'test-2',
        boundingBox: { width: 0.2, height: 0.2, left: 0.1, top: 0.1 },
        confidence: 0.9,
        provider: 'sabaiface',
      };

      expect(['aws', 'sabaiface']).toContain(awsFace.provider);
      expect(['aws', 'sabaiface']).toContain(sabaiFace.provider);
    });

    it('should support optional attributes', () => {
      const attributes: FaceAttributes = {
        age: { low: 25, high: 35 },
        gender: { value: 'Male', confidence: 0.98 },
        emotions: [
          { type: 'HAPPY', confidence: 0.85 },
          { type: 'CALM', confidence: 0.15 },
        ],
      };

      const face: Face = {
        faceId: 'test-3',
        boundingBox: { width: 0.2, height: 0.2, left: 0.1, top: 0.1 },
        confidence: 0.95,
        attributes,
        provider: 'aws',
      };

      expect(face.attributes?.age?.low).toBe(25);
      expect(face.attributes?.gender?.value).toBe('Male');
      expect(face.attributes?.emotions).toHaveLength(2);
    });
  });

  describe('FaceAttributes', () => {
    it('should have confidence in 0-1 range for all attributes', () => {
      const attributes: FaceAttributes = {
        gender: { value: 'Female', confidence: 0.92 },
        smile: { value: true, confidence: 0.88 },
        eyeglasses: { value: false, confidence: 0.99 },
        emotions: [
          { type: 'HAPPY', confidence: 0.75 },
          { type: 'SURPRISED', confidence: 0.25 },
        ],
      };

      expect(attributes.gender?.confidence).toBeGreaterThanOrEqual(0);
      expect(attributes.gender?.confidence).toBeLessThanOrEqual(1);
      expect(attributes.smile?.confidence).toBeGreaterThanOrEqual(0);
      expect(attributes.smile?.confidence).toBeLessThanOrEqual(1);

      attributes.emotions?.forEach((emotion) => {
        expect(emotion.confidence).toBeGreaterThanOrEqual(0);
        expect(emotion.confidence).toBeLessThanOrEqual(1);
      });
    });
  });
});
