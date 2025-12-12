/**
 * AWS Rekognition Integration Tests
 *
 * Makes real AWS API calls - opt-in via INTEGRATION=true
 * Costs: ~$0.001 per IndexFaces call
 *
 * Run: INTEGRATION=true pnpm test:integration
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRekognitionClient,
  createCollection,
  deleteCollection,
  indexFaces,
} from "../src/lib/rekognition";
import type { RekognitionClient } from "@aws-sdk/client-rekognition";
import { getTestImage } from "./fixtures/test-images";

// Only run when INTEGRATION=true
describe.runIf(process.env.INTEGRATION === "true")(
  "AWS Rekognition Integration",
  () => {
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
        console.log(`[Cleanup] Deleted collection: ${testEventId}`);
      } catch (error) {
        // Ignore if already deleted or never created
        console.log(`[Cleanup] Collection ${testEventId} not found or already deleted`);
      }
    });

    it(
      "creates collection successfully",
      async () => {
        const arn = await createCollection(client, testEventId);

        expect(arn).toBeDefined();
        expect(typeof arn).toBe("string");
        // ARN format: arn:aws:rekognition:region:account:collection/id
        expect(arn).toContain("collection");
      },
      30000
    ); // 30s timeout

    it(
      "indexes faces from real image",
      async () => {
        // Download real test image from R2 (cached locally)
        const testImage = await getTestImage("1");

        const result = await indexFaces(
          client,
          testEventId,
          testImage,
          "test-photo-001"
        );

        // Verify response structure
        expect(result).toHaveProperty("faceRecords");
        expect(result).toHaveProperty("unindexedFaces");
        expect(Array.isArray(result.faceRecords)).toBe(true);
        expect(Array.isArray(result.unindexedFaces)).toBe(true);

        // Image 1 has 4 dancers - expect faces detected
        expect(result.faceRecords.length).toBeGreaterThan(0);
        console.log(
          `[IndexFaces] Faces found: ${result.faceRecords.length}, ` +
            `Unindexed: ${result.unindexedFaces.length}`
        );
      },
      60000
    ); // 60s timeout for download + API call

    it(
      "deletes collection successfully",
      async () => {
        // This also serves as cleanup
        await expect(deleteCollection(client, testEventId)).resolves.not.toThrow();
      },
      30000
    );
  }
);
