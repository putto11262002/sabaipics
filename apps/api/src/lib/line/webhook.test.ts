/**
 * LINE Webhook Signature Verification Tests
 *
 * Tests the HMAC-SHA256 signature verification for LINE webhooks.
 * Runs in Node.js environment.
 */

import { describe, it, expect } from "vitest";
import { verifyLineSignature } from "./webhook";

// Test channel secret (not a real secret)
const TEST_CHANNEL_SECRET = "test_channel_secret_12345";

/**
 * Generate a valid LINE signature for testing
 *
 * Uses Web Crypto API to generate the expected signature.
 */
async function generateValidSignature(
	body: string,
	secret: string,
): Promise<string> {
	const encoder = new TextEncoder();

	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);

	const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(body));

	return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

// =============================================================================
// Signature Verification Tests
// =============================================================================

describe("LINE Webhook Signature Verification", () => {
	it("accepts valid signature", async () => {
		const body = JSON.stringify({
			destination: "U1234567890abcdef",
			events: [],
		});

		const signature = await generateValidSignature(body, TEST_CHANNEL_SECRET);

		const isValid = await verifyLineSignature(
			body,
			signature,
			TEST_CHANNEL_SECRET,
		);

		expect(isValid).toBe(true);
	});

	it("rejects invalid signature", async () => {
		const body = JSON.stringify({
			destination: "U1234567890abcdef",
			events: [],
		});

		const invalidSignature = "aW52YWxpZF9zaWduYXR1cmU="; // base64 of "invalid_signature"

		const isValid = await verifyLineSignature(
			body,
			invalidSignature,
			TEST_CHANNEL_SECRET,
		);

		expect(isValid).toBe(false);
	});

	it("rejects tampered body", async () => {
		const originalBody = JSON.stringify({
			destination: "U1234567890abcdef",
			events: [],
		});

		const signature = await generateValidSignature(
			originalBody,
			TEST_CHANNEL_SECRET,
		);

		// Tamper with the body
		const tamperedBody = JSON.stringify({
			destination: "U1234567890abcdef",
			events: [{ type: "message" }],
		});

		const isValid = await verifyLineSignature(
			tamperedBody,
			signature,
			TEST_CHANNEL_SECRET,
		);

		expect(isValid).toBe(false);
	});

	it("rejects wrong channel secret", async () => {
		const body = JSON.stringify({
			destination: "U1234567890abcdef",
			events: [],
		});

		const signature = await generateValidSignature(body, TEST_CHANNEL_SECRET);

		const isValid = await verifyLineSignature(
			body,
			signature,
			"wrong_channel_secret",
		);

		expect(isValid).toBe(false);
	});

	it("handles empty events array (verification request)", async () => {
		// LINE sends this when verifying webhook URL
		const body = JSON.stringify({
			destination: "U1234567890abcdef",
			events: [],
		});

		const signature = await generateValidSignature(body, TEST_CHANNEL_SECRET);

		const isValid = await verifyLineSignature(
			body,
			signature,
			TEST_CHANNEL_SECRET,
		);

		expect(isValid).toBe(true);
	});

	it("handles follow event body", async () => {
		const body = JSON.stringify({
			destination: "U1234567890abcdef",
			events: [
				{
					type: "follow",
					timestamp: 1462629479859,
					source: {
						type: "user",
						userId: "U206d25c2ea6bd87c17655609a1c37cb8",
					},
					replyToken: "nHuyWiB7yP5Zw52FIkcQobQuGDXCTA",
				},
			],
		});

		const signature = await generateValidSignature(body, TEST_CHANNEL_SECRET);

		const isValid = await verifyLineSignature(
			body,
			signature,
			TEST_CHANNEL_SECRET,
		);

		expect(isValid).toBe(true);
	});

	it("handles message event body", async () => {
		const body = JSON.stringify({
			destination: "U1234567890abcdef",
			events: [
				{
					type: "message",
					timestamp: 1462629479859,
					source: {
						type: "user",
						userId: "U206d25c2ea6bd87c17655609a1c37cb8",
					},
					replyToken: "nHuyWiB7yP5Zw52FIkcQobQuGDXCTA",
					message: {
						type: "text",
						id: "325708",
						text: "Hello, world!",
					},
				},
			],
		});

		const signature = await generateValidSignature(body, TEST_CHANNEL_SECRET);

		const isValid = await verifyLineSignature(
			body,
			signature,
			TEST_CHANNEL_SECRET,
		);

		expect(isValid).toBe(true);
	});

	it("handles unfollow event body", async () => {
		const body = JSON.stringify({
			destination: "U1234567890abcdef",
			events: [
				{
					type: "unfollow",
					timestamp: 1462629479859,
					source: {
						type: "user",
						userId: "U206d25c2ea6bd87c17655609a1c37cb8",
					},
				},
			],
		});

		const signature = await generateValidSignature(body, TEST_CHANNEL_SECRET);

		const isValid = await verifyLineSignature(
			body,
			signature,
			TEST_CHANNEL_SECRET,
		);

		expect(isValid).toBe(true);
	});

	it("handles multiple events in single request", async () => {
		const body = JSON.stringify({
			destination: "U1234567890abcdef",
			events: [
				{
					type: "follow",
					timestamp: 1462629479859,
					source: { type: "user", userId: "U111" },
					replyToken: "token1",
				},
				{
					type: "message",
					timestamp: 1462629479860,
					source: { type: "user", userId: "U222" },
					replyToken: "token2",
					message: { type: "text", id: "123", text: "Hi" },
				},
			],
		});

		const signature = await generateValidSignature(body, TEST_CHANNEL_SECRET);

		const isValid = await verifyLineSignature(
			body,
			signature,
			TEST_CHANNEL_SECRET,
		);

		expect(isValid).toBe(true);
	});
});

// =============================================================================
// Edge Cases
// =============================================================================

describe("LINE Webhook Edge Cases", () => {
	it("handles empty string body", async () => {
		const body = "";
		const signature = await generateValidSignature(body, TEST_CHANNEL_SECRET);

		const isValid = await verifyLineSignature(
			body,
			signature,
			TEST_CHANNEL_SECRET,
		);

		expect(isValid).toBe(true);
	});

	it("handles unicode characters in body", async () => {
		const body = JSON.stringify({
			destination: "U1234567890abcdef",
			events: [
				{
					type: "message",
					message: { type: "text", text: "สวัสดี 你好 🎉" },
				},
			],
		});

		const signature = await generateValidSignature(body, TEST_CHANNEL_SECRET);

		const isValid = await verifyLineSignature(
			body,
			signature,
			TEST_CHANNEL_SECRET,
		);

		expect(isValid).toBe(true);
	});

	it("is case-sensitive for signature comparison", async () => {
		const body = JSON.stringify({ destination: "U123", events: [] });
		const signature = await generateValidSignature(body, TEST_CHANNEL_SECRET);

		// Modify case of signature (shouldn't match)
		const modifiedSignature = signature.toUpperCase();

		// Only check if case would be different
		if (signature !== modifiedSignature) {
			const isValid = await verifyLineSignature(
				body,
				modifiedSignature,
				TEST_CHANNEL_SECRET,
			);
			expect(isValid).toBe(false);
		}
	});

	it("rejects signature with different length", async () => {
		const body = JSON.stringify({ destination: "U123", events: [] });

		// Short signature
		const isValid = await verifyLineSignature(body, "abc", TEST_CHANNEL_SECRET);
		expect(isValid).toBe(false);
	});
});
