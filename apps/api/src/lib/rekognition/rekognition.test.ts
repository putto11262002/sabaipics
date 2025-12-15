/**
 * Rekognition Client & Error Handling Tests
 *
 * Runs in Node.js with mocked AWS SDK.
 * Tests error classification, backoff logic, and SDK interactions.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
	RekognitionClient,
	IndexFacesCommand,
} from "@aws-sdk/client-rekognition";
import {
	createRekognitionClient,
	indexFaces,
	isThrottlingError,
	isNonRetryableError,
	isRetryableError,
	getBackoffDelay,
	getThrottleBackoffDelay,
} from "./index";

// Mock AWS Rekognition client
const rekognitionMock = mockClient(RekognitionClient);

// =============================================================================
// Error Classification Tests
// =============================================================================

describe("Error Classification", () => {
	it("identifies throttling errors", () => {
		const throttleError = new Error("Rate exceeded");
		throttleError.name = "ThrottlingException";

		expect(isThrottlingError(throttleError)).toBe(true);
	});

	it("identifies ProvisionedThroughputExceededException as throttling", () => {
		const error = new Error("Throughput exceeded");
		error.name = "ProvisionedThroughputExceededException";

		expect(isThrottlingError(error)).toBe(true);
	});

	it("identifies non-retryable errors", () => {
		const invalidImageError = new Error("Invalid image");
		invalidImageError.name = "InvalidImageFormatException";

		expect(isNonRetryableError(invalidImageError)).toBe(true);
	});

	it("identifies retryable errors", () => {
		const serverError = new Error("Internal error");
		serverError.name = "InternalServerError";

		expect(isRetryableError(serverError)).toBe(true);
	});

	it("returns false for non-errors", () => {
		expect(isThrottlingError("not an error")).toBe(false);
		expect(isThrottlingError(null)).toBe(false);
		expect(isThrottlingError(undefined)).toBe(false);
	});
});

// =============================================================================
// Backoff Calculation Tests
// =============================================================================

describe("Backoff Calculation", () => {
	it("calculates exponential backoff", () => {
		const attempt1 = getBackoffDelay(1);
		const attempt2 = getBackoffDelay(2);
		const attempt3 = getBackoffDelay(3);

		// Should roughly double each time (with jitter)
		expect(attempt1).toBeGreaterThanOrEqual(1);
		expect(attempt1).toBeLessThanOrEqual(3);

		expect(attempt2).toBeGreaterThanOrEqual(3);
		expect(attempt2).toBeLessThanOrEqual(6);

		expect(attempt3).toBeGreaterThanOrEqual(6);
		expect(attempt3).toBeLessThanOrEqual(12);
	});

	it("caps at max delay", () => {
		// After many attempts, should cap at 300s
		const attempt10 = getBackoffDelay(10);
		expect(attempt10).toBeLessThanOrEqual(360); // 300 + 20% jitter
	});

	it("throttle backoff starts higher", () => {
		const normalBackoff = getBackoffDelay(1);
		const throttleBackoff = getThrottleBackoffDelay(1);

		expect(throttleBackoff).toBeGreaterThan(normalBackoff);
	});
});

// =============================================================================
// AWS SDK Mock Tests
// =============================================================================

describe("Rekognition Client (Mocked)", () => {
	beforeEach(() => {
		rekognitionMock.reset();
	});

	afterAll(() => {
		rekognitionMock.restore();
	});

	it("indexFaces returns face records", async () => {
		rekognitionMock.on(IndexFacesCommand).resolves({
			FaceRecords: [
				{
					Face: {
						FaceId: "face-001",
						BoundingBox: { Width: 0.25, Height: 0.3, Left: 0.1, Top: 0.15 },
						Confidence: 99.5,
					},
				},
			],
			UnindexedFaces: [],
			FaceModelVersion: "6.0",
		});

		const client = createRekognitionClient({
			AWS_ACCESS_KEY_ID: "test-key",
			AWS_SECRET_ACCESS_KEY: "test-secret",
			AWS_REGION: "us-west-2",
		});

		const result = await indexFaces(
			client,
			"event-123",
			new ArrayBuffer(100),
			"photo-456",
		);

		expect(result.faceRecords).toHaveLength(1);
		expect(result.faceRecords[0].Face?.FaceId).toBe("face-001");
		expect(result.unindexedFaces).toHaveLength(0);
	});

	it("indexFaces handles unindexed faces", async () => {
		rekognitionMock.on(IndexFacesCommand).resolves({
			FaceRecords: [],
			UnindexedFaces: [
				{
					FaceDetail: {
						BoundingBox: { Width: 0.1, Height: 0.1, Left: 0, Top: 0 },
					},
					Reasons: ["SMALL_BOUNDING_BOX", "LOW_BRIGHTNESS"],
				},
			],
		});

		const client = createRekognitionClient({
			AWS_ACCESS_KEY_ID: "test-key",
			AWS_SECRET_ACCESS_KEY: "test-secret",
			AWS_REGION: "us-west-2",
		});

		const result = await indexFaces(
			client,
			"event-123",
			new ArrayBuffer(100),
			"photo-456",
		);

		expect(result.faceRecords).toHaveLength(0);
		expect(result.unindexedFaces).toHaveLength(1);
		expect(result.unindexedFaces[0].Reasons).toContain("SMALL_BOUNDING_BOX");
	});

	it("handles throttling error from AWS", async () => {
		const throttleError = new Error("Rate exceeded");
		throttleError.name = "ThrottlingException";
		rekognitionMock.on(IndexFacesCommand).rejects(throttleError);

		const client = createRekognitionClient({
			AWS_ACCESS_KEY_ID: "test-key",
			AWS_SECRET_ACCESS_KEY: "test-secret",
			AWS_REGION: "us-west-2",
		});

		await expect(
			indexFaces(client, "event-123", new ArrayBuffer(100), "photo-456"),
		).rejects.toThrow("Rate exceeded");
	});
});
