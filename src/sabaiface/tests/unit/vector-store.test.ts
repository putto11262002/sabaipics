/**
 * Vector Store Utility Tests
 *
 * Test distance/similarity conversion functions.
 */

import { describe, it, expect } from 'vitest';
import { distanceToSimilarity, similarityToDistance } from '../../src/core/vector-store';

describe('Vector Store Utilities', () => {
  describe('distanceToSimilarity', () => {
    it('should convert 0 distance to 100% similarity', () => {
      expect(distanceToSimilarity(0)).toBe(100);
    });

    it('should convert 0.6 distance to ~60% similarity', () => {
      const similarity = distanceToSimilarity(0.6);
      expect(similarity).toBeGreaterThanOrEqual(59);
      expect(similarity).toBeLessThanOrEqual(61);
    });

    it('should convert 1.5 distance to 0% similarity', () => {
      expect(distanceToSimilarity(1.5)).toBe(0);
    });

    it('should clamp negative distances to 100%', () => {
      expect(distanceToSimilarity(-0.5)).toBe(100);
    });

    it('should clamp large distances to 0%', () => {
      expect(distanceToSimilarity(10)).toBe(0);
    });

    it('should round to 2 decimal places', () => {
      const similarity = distanceToSimilarity(0.123);
      const decimalPlaces = (similarity.toString().split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(2);
    });
  });

  describe('similarityToDistance', () => {
    it('should convert 100% similarity to 0 distance', () => {
      expect(similarityToDistance(100)).toBe(0);
    });

    it('should convert 60% similarity to ~0.6 distance', () => {
      const distance = similarityToDistance(60);
      expect(distance).toBeGreaterThanOrEqual(0.59);
      expect(distance).toBeLessThanOrEqual(0.61);
    });

    it('should convert 0% similarity to 1.5 distance', () => {
      expect(similarityToDistance(0)).toBe(1.5);
    });

    it('should be inverse of distanceToSimilarity', () => {
      const originalSimilarity = 80;
      const distance = similarityToDistance(originalSimilarity);
      const roundTripSimilarity = distanceToSimilarity(distance);

      // Allow small rounding error
      expect(Math.abs(roundTripSimilarity - originalSimilarity)).toBeLessThan(1);
    });
  });

  describe('Conversion consistency', () => {
    it('should maintain consistency across common thresholds', () => {
      const testCases = [
        { similarity: 95, expectedDistance: 0.075 },
        { similarity: 90, expectedDistance: 0.15 },
        { similarity: 80, expectedDistance: 0.3 },
        { similarity: 70, expectedDistance: 0.45 },
        { similarity: 60, expectedDistance: 0.6 },
      ];

      testCases.forEach(({ similarity, expectedDistance }) => {
        const distance = similarityToDistance(similarity);
        expect(Math.abs(distance - expectedDistance)).toBeLessThan(0.01);
      });
    });
  });
});
