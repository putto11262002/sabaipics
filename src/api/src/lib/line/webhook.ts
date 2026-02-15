/**
 * LINE Webhook Signature Verification
 *
 * Uses Web Crypto API for Cloudflare Workers compatibility.
 * The official @line/bot-sdk middleware uses Node.js crypto which doesn't work on edge runtime.
 */

/**
 * Verify LINE webhook signature using HMAC-SHA256
 *
 * @param body - Raw request body string (must not be parsed/modified)
 * @param signature - X-Line-Signature header value (base64 encoded)
 * @param channelSecret - LINE Channel Secret
 * @returns true if signature is valid
 */
export async function verifyLineSignature(
	body: string,
	signature: string,
	channelSecret: string,
): Promise<boolean> {
	const encoder = new TextEncoder();

	// Import channel secret as HMAC key
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(channelSecret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);

	// Generate HMAC-SHA256 signature
	const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(body));

	// Convert to base64
	const computed = btoa(String.fromCharCode(...new Uint8Array(mac)));

	// Timing-safe comparison
	return timingSafeEqual(computed, signature);
}

/**
 * Timing-safe string comparison to prevent timing attacks
 *
 * Compares strings in constant time regardless of where they differ.
 */
function timingSafeEqual(a: string, b: string): boolean {
	const aLen = a.length;
	const bLen = b.length;

	// If lengths differ, we still do comparison but will return false
	// Use the longer string for comparison to maintain constant time
	const lengthsMatch = aLen === bLen;
	const compareLen = Math.max(aLen, bLen);

	let result = 0;
	for (let i = 0; i < compareLen; i++) {
		// Use 0 as fallback for out-of-bounds to avoid early exit
		const charA = i < aLen ? a.charCodeAt(i) : 0;
		const charB = i < bLen ? b.charCodeAt(i) : 0;
		result |= charA ^ charB;
	}

	return result === 0 && lengthsMatch;
}
