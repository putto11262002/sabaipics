/**
 * PostgresVectorStore Unit Tests
 *
 * Tests the PostgresVectorStore adapter without requiring actual Postgres.
 * Uses mocks for database operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostgresVectorStore } from '../../src/adapters/postgres/postgres-vector-store';
import type { Database } from '@sabaipics/db';

// =============================================================================
// Mock Setup
// =============================================================================

/**
 * Create a mock database instance for testing.
 */
function createMockDatabase(): Database {
  return {
    execute: vi.fn(),
    insert: vi.fn(() => ({
      values: vi.fn(),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(),
    })),
  } as any;
}

// =============================================================================
// Tests
// =============================================================================

describe('PostgresVectorStore', () => {
  let db: Database;
  let vectorStore: PostgresVectorStore;

  beforeEach(() => {
    db = createMockDatabase();
    vectorStore = new PostgresVectorStore(db);
  });

  describe('createCollection', () => {
    it('should create a logical collection (no-op)', async () => {
      await vectorStore.createCollection('event-123');

      // No database operations expected (logical collections only)
      expect(db.execute).not.toHaveBeenCalled();
    });
  });

  describe('addFaces', () => {
    it('should insert faces with vector descriptors', async () => {
      const mockInsert = vi.fn();
      const mockValues = vi.fn();
      (db.insert as any).mockReturnValue({
        values: mockValues,
      });

      const faces = [
        {
          faceId: 'face-1',
          descriptor: new Float32Array([0.1, 0.2, 0.3]),
          metadata: {
            externalImageId: 'photo-123',
            boundingBox: { x: 10, y: 20, width: 100, height: 120 },
            confidence: 0.95,
            indexedAt: '2025-01-13T10:00:00Z',
          },
        },
      ];

      await vectorStore.addFaces('event-123', faces);

      expect(db.insert).toHaveBeenCalled();

      // Verify the values were called
      const callArgs = mockValues.mock.calls[0][0];
      expect(callArgs).toHaveLength(1);
      expect(callArgs[0].id).toBe('face-1');
      expect(callArgs[0].photoId).toBe('photo-123');
      expect(callArgs[0].provider).toBe('sabaiface');
      expect(callArgs[0].confidence).toBe(0.95);
      expect(callArgs[0].descriptor).not.toBeInstanceOf(Float32Array);
      expect(callArgs[0].descriptor).toHaveLength(3);
      // Check approximate values (Float32Array precision)
      expect(callArgs[0].descriptor[0]).toBeCloseTo(0.1, 1);
      expect(callArgs[0].descriptor[1]).toBeCloseTo(0.2, 1);
      expect(callArgs[0].descriptor[2]).toBeCloseTo(0.3, 1);
    });

    it('should handle empty face array', async () => {
      await vectorStore.addFaces('event-123', []);

      expect(db.insert).not.toHaveBeenCalled();
    });

    it('should convert Float32Array to regular array', async () => {
      const mockValues = vi.fn();
      (db.insert as any).mockReturnValue({
        values: mockValues,
      });

      const descriptor = new Float32Array([0.1, 0.2, 0.3, 0.4]);
      const faces = [
        {
          faceId: 'face-1',
          descriptor,
          metadata: {
            externalImageId: 'photo-123',
            boundingBox: { x: 10, y: 20, width: 100, height: 120 },
            confidence: 0.95,
            indexedAt: '2025-01-13T10:00:00Z',
          },
        },
      ];

      await vectorStore.addFaces('event-123', faces);

      const callArgs = mockValues.mock.calls[0][0];
      expect(callArgs[0].descriptor).not.toBeInstanceOf(Float32Array);
      expect(callArgs[0].descriptor).toHaveLength(4);
      // Check approximate values (Float32Array precision)
      expect(callArgs[0].descriptor[0]).toBeCloseTo(0.1, 1);
      expect(callArgs[0].descriptor[1]).toBeCloseTo(0.2, 1);
      expect(callArgs[0].descriptor[2]).toBeCloseTo(0.3, 1);
      expect(callArgs[0].descriptor[3]).toBeCloseTo(0.4, 1);
    });
  });

  describe('searchFaces', () => {
    it('should search for similar faces using cosine distance', async () => {
      const mockResults = {
        rows: [
          {
            id: 'face-1',
            photo_id: 'photo-123',
            confidence: 0.95,
            bounding_box: { Width: 100, Height: 120, Left: 10, Top: 20 },
            indexed_at: '2025-01-13T10:00:00Z',
            distance: 0.3,
          },
        ],
      };

      (db.execute as any).mockResolvedValue(mockResults);

      const queryDescriptor = new Float32Array([0.1, 0.2, 0.3]);
      const results = await vectorStore.searchFaces(
        'event-123',
        queryDescriptor,
        10,
        0.6
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        faceId: 'face-1',
        distance: 0.3,
        metadata: {
          externalImageId: 'photo-123',
          boundingBox: { x: 10, y: 20, width: 100, height: 120 },
          confidence: 0.95,
        },
      });

      // Verify SQL query was called
      expect(db.execute).toHaveBeenCalled();
    });

    it('should convert distance to similarity percentage', async () => {
      const mockResults = {
        rows: [
          {
            id: 'face-1',
            photo_id: 'photo-123',
            confidence: 0.95,
            bounding_box: { Width: 100, Height: 120, Left: 10, Top: 20 },
            indexed_at: '2025-01-13T10:00:00Z',
            distance: 0.6, // Should map to ~60% similarity
          },
        ],
      };

      (db.execute as any).mockResolvedValue(mockResults);

      const queryDescriptor = new Float32Array([0.1, 0.2, 0.3]);
      const results = await vectorStore.searchFaces(
        'event-123',
        queryDescriptor,
        10,
        1.0
      );

      // Distance of 0.6 should map to similarity around 60%
      expect(results[0].similarity).toBeGreaterThan(50);
      expect(results[0].similarity).toBeLessThan(70);
    });

    it('should handle empty results', async () => {
      const mockResults = { rows: [] };
      (db.execute as any).mockResolvedValue(mockResults);

      const queryDescriptor = new Float32Array([0.1, 0.2, 0.3]);
      const results = await vectorStore.searchFaces(
        'event-123',
        queryDescriptor,
        10,
        0.6
      );

      expect(results).toEqual([]);
    });
  });

  describe('deleteFaces', () => {
    it('should delete faces by ID', async () => {
      const mockWhere = vi.fn();
      (db.delete as any).mockReturnValue({
        where: mockWhere,
      });

      await vectorStore.deleteFaces('event-123', ['face-1', 'face-2']);

      expect(db.delete).toHaveBeenCalled();
      expect(mockWhere).toHaveBeenCalled();
    });

    it('should handle empty face IDs array', async () => {
      await vectorStore.deleteFaces('event-123', []);

      expect(db.delete).not.toHaveBeenCalled();
    });
  });

  describe('deleteCollection', () => {
    it('should delete all faces for an event', async () => {
      (db.execute as any).mockResolvedValue({ rows: [] });

      await vectorStore.deleteCollection('event-123');

      expect(db.execute).toHaveBeenCalled();
    });
  });

  describe('listCollections', () => {
    it('should return distinct event IDs with indexed faces', async () => {
      const mockResults = {
        rows: [
          { event_id: 'event-123' },
          { event_id: 'event-456' },
        ],
      };

      (db.execute as any).mockResolvedValue(mockResults);

      const collections = await vectorStore.listCollections();

      expect(collections).toEqual(['event-123', 'event-456']);
    });

    it('should handle no collections', async () => {
      const mockResults = { rows: [] };
      (db.execute as any).mockResolvedValue(mockResults);

      const collections = await vectorStore.listCollections();

      expect(collections).toEqual([]);
    });
  });

  describe('getFace', () => {
    it('should retrieve face with descriptor', async () => {
      const mockResults = {
        rows: [
          {
            id: 'face-1',
            photo_id: 'photo-123',
            confidence: 0.95,
            descriptor: [0.1, 0.2, 0.3],
            bounding_box: { Width: 100, Height: 120, Left: 10, Top: 20 },
            indexed_at: '2025-01-13T10:00:00Z',
          },
        ],
      };

      (db.execute as any).mockResolvedValue(mockResults);

      const face = await vectorStore.getFace('event-123', 'face-1');

      expect(face).not.toBeNull();
      expect(face?.faceId).toBe('face-1');
      expect(face?.descriptor).toBeInstanceOf(Float32Array);
      expect(face!.descriptor).toHaveLength(3);
      // Check approximate values (Float32Array precision)
      const descriptorArray = Array.from(face!.descriptor);
      expect(descriptorArray[0]).toBeCloseTo(0.1, 1);
      expect(descriptorArray[1]).toBeCloseTo(0.2, 1);
      expect(descriptorArray[2]).toBeCloseTo(0.3, 1);
    });

    it('should return null if face not found', async () => {
      const mockResults = { rows: [] };
      (db.execute as any).mockResolvedValue(mockResults);

      const face = await vectorStore.getFace('event-123', 'face-1');

      expect(face).toBeNull();
    });

    it('should convert array to Float32Array for descriptor', async () => {
      const mockResults = {
        rows: [
          {
            id: 'face-1',
            photo_id: 'photo-123',
            confidence: 0.95,
            descriptor: [0.1, 0.2, 0.3, 0.4],
            bounding_box: { Width: 100, Height: 120, Left: 10, Top: 20 },
            indexed_at: '2025-01-13T10:00:00Z',
          },
        ],
      };

      (db.execute as any).mockResolvedValue(mockResults);

      const face = await vectorStore.getFace('event-123', 'face-1');

      expect(face?.descriptor).toBeInstanceOf(Float32Array);
      expect(face?.descriptor.length).toBe(4);
    });
  });
});
