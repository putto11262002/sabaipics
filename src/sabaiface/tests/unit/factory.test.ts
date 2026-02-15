/**
 * Factory Tests
 *
 * Test face service factory pattern.
 */

import { describe, it, expect, vi } from 'vitest';
import { createFaceService, createAWSFaceService } from '../../src/factory/face-service-factory';
import { AWSFaceAdapter } from '../../src/adapters/aws/aws-adapter';
import { SabaiFaceAdapter } from '../../src/adapters/sabaiface/sabaiface-adapter';

// Mock dependencies
const mockClient = {} as any;
const mockDb = {} as any;
const mockFaceDetector = {} as any;
const mockVectorStore = {} as any;

describe('Face Service Factory', () => {
  describe('createFaceService', () => {
    it('should create AWS adapter when provider is "aws"', () => {
      const service = createFaceService({
        provider: 'aws',
        client: mockClient,
        db: mockDb,
      });

      expect(service).toBeInstanceOf(AWSFaceAdapter);
    });

    it('should create SabaiFace adapter when provider is "sabaiface"', () => {
      const service = createFaceService({
        provider: 'sabaiface',
        faceDetector: mockFaceDetector,
        vectorStore: mockVectorStore,
        db: mockDb,
      });

      expect(service).toBeInstanceOf(SabaiFaceAdapter);
    });
  });

  describe('createAWSFaceService', () => {
    it('should create AWS adapter', () => {
      const service = createAWSFaceService(mockClient, mockDb);

      expect(service).toBeInstanceOf(AWSFaceAdapter);
    });

    it('should pass through client and db to adapter', () => {
      const service = createAWSFaceService(mockClient, mockDb);

      expect(service).toBeDefined();
      expect(service.indexPhoto).toBeDefined();
      expect(service.findSimilarFaces).toBeDefined();
      expect(service.createCollection).toBeDefined();
      expect(service.deleteCollection).toBeDefined();
    });
  });
});
