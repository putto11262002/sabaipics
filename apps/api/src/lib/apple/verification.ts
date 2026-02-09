/**
 * Apple JWS Verification
 *
 * Verifies signed transactions and notifications from StoreKit 2
 * using Apple's official app-store-server-library.
 *
 * The SignedDataVerifier validates:
 * 1. JWS signature (ES256)
 * 2. Certificate chain (Apple Root CA → Intermediate → Leaf)
 * 3. Bundle ID matches our app
 * 4. Environment (Sandbox vs Production)
 */

import {
  SignedDataVerifier,
  Environment,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from '@apple/app-store-server-library';

export type DecodedTransaction = JWSTransactionDecodedPayload;
export type DecodedNotification = ResponseBodyV2DecodedPayload;

// Apple Root CA - G3 certificate (DER format, base64-encoded)
// Download from: https://www.apple.com/certificateauthority/
// Store as base64 in environment variable: APPLE_ROOT_CA_CERT
let cachedVerifier: SignedDataVerifier | null = null;
let cachedEnvKey: string | null = null;

interface AppleVerificationEnv {
  APPLE_ROOT_CA_CERT: string;
  APPLE_BUNDLE_ID: string;
  APPLE_ENVIRONMENT: string; // 'SANDBOX' or 'PRODUCTION'
}

function getVerifier(env: AppleVerificationEnv): SignedDataVerifier {
  // Cache verifier per environment to avoid re-creating on every request
  const envKey = `${env.APPLE_BUNDLE_ID}:${env.APPLE_ENVIRONMENT}`;
  if (cachedVerifier && cachedEnvKey === envKey) {
    return cachedVerifier;
  }

  const rootCertBuffer = Buffer.from(env.APPLE_ROOT_CA_CERT, 'base64');
  const environment =
    env.APPLE_ENVIRONMENT === 'PRODUCTION'
      ? Environment.PRODUCTION
      : Environment.SANDBOX;

  cachedVerifier = new SignedDataVerifier(
    [rootCertBuffer],
    true, // enableOnlineChecks
    environment,
    env.APPLE_BUNDLE_ID,
  );
  cachedEnvKey = envKey;

  return cachedVerifier;
}

/**
 * Verify and decode a StoreKit 2 signed transaction (JWS).
 * Returns the decoded payload or throws on verification failure.
 */
export async function verifyTransaction(
  signedTransaction: string,
  env: AppleVerificationEnv,
): Promise<DecodedTransaction> {
  const verifier = getVerifier(env);
  return await verifier.verifyAndDecodeTransaction(signedTransaction);
}

/**
 * Verify and decode an App Store Server Notification v2 (JWS).
 * Returns the decoded payload or throws on verification failure.
 */
export async function verifyNotification(
  signedPayload: string,
  env: AppleVerificationEnv,
): Promise<DecodedNotification> {
  const verifier = getVerifier(env);
  return await verifier.verifyAndDecodeNotification(signedPayload);
}
