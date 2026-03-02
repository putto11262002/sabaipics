/**
 * OAuth State Parameter Signing
 *
 * Provides HMAC-based signing for OAuth state parameters to prevent tampering.
 */

interface SignedState {
  payload: string;
  signature: string;
  timestamp: number;
}

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function hmacSha256(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * Sign a state payload with HMAC
 */
export async function signState(payload: string, secret: string): Promise<SignedState> {
  const timestamp = Date.now();
  const message = `${payload}:${timestamp}`;
  const signature = await hmacSha256(message, secret);

  return { payload, signature, timestamp };
}

/**
 * Verify a signed state parameter
 * Returns the payload if valid, null if invalid or expired
 */
export async function verifyState(
  state: SignedState,
  secret: string,
): Promise<string | null> {
  const { payload, signature, timestamp } = state;

  // Check expiration
  if (Date.now() - timestamp > STATE_TTL_MS) {
    return null;
  }

  // Verify signature using timing-safe comparison
  const message = `${payload}:${timestamp}`;
  const expectedSignature = await hmacSha256(message, secret);

  // Use timing-safe comparison to prevent timing attacks
  const sigBytes = new Uint8Array(Array.from(atob(signature), (c) => c.charCodeAt(0)));
  const expectedBytes = new Uint8Array(Array.from(atob(expectedSignature), (c) => c.charCodeAt(0)));

  if (sigBytes.length !== expectedBytes.length) {
    return null;
  }

  // Manual timing-safe comparison (crypto.subtle.timingSafeEqual not available)
  let result = 0;
  for (let i = 0; i < sigBytes.length; i++) {
    result |= sigBytes[i] ^ expectedBytes[i];
  }
  if (result !== 0) {
    return null;
  }

  return payload;
}
