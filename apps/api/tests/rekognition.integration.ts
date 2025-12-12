/**
 * AWS Rekognition Integration Tests
 *
 * Makes real AWS API calls.
 * Costs: ~$0.001 per IndexFaces call
 *
 * Run: pnpm test:integration
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRekognitionClient,
  createCollection,
  deleteCollection,
  indexFaces,
} from "../src/lib/rekognition";
import type { RekognitionClient } from "@aws-sdk/client-rekognition";
import { getFixture } from "./fixtures";

describe("AWS Rekognition Integration", () => {
  const testEventId = `test-${Date.now()}`;
  let client: RekognitionClient;

  beforeAll(() => {
    client = createRekognitionClient({
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID!,
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY!,
      AWS_REGION: process.env.AWS_REGION || "us-west-2",
    });
  });

  afterAll(async () => {
    // Cleanup: delete test collection
    try {
      await deleteCollection(client, testEventId);
    } catch {
      // Ignore if already deleted or never created
    }
  });

  it(
    "creates collection successfully",
    async () => {
      const arn = await createCollection(client, testEventId);

      expect(arn).toBeDefined();
      expect(typeof arn).toBe("string");
      expect(arn).toContain("collection");
    },
    30000
  );

  it(
    "indexes faces from real image",
    async () => {
      const testImage = await getFixture("aws-rekognition", "1.jpg");

      const result = await indexFaces(
        client,
        testEventId,
        testImage,
        "test-photo-001"
      );

      expect(result).toHaveProperty("faceRecords");
      expect(result).toHaveProperty("unindexedFaces");
      expect(Array.isArray(result.faceRecords)).toBe(true);
      expect(Array.isArray(result.unindexedFaces)).toBe(true);
      expect(result.faceRecords.length).toBeGreaterThan(0);
    },
    60000
  );

  it(
    "deletes collection successfully",
    async () => {
      await expect(deleteCollection(client, testEventId)).resolves.not.toThrow();
    },
    30000
  );
});
