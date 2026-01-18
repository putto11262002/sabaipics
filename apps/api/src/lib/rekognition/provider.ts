/**
 * Face Recognition Provider Factory
 *
 * Creates the appropriate face recognition provider based on environment config.
 * In development: Uses SabaiFace (self-hosted, no AWS costs)
 * In production: Uses AWS Rekognition
 *
 * Environment variables:
 * - FACE_PROVIDER: 'aws' | 'sabaiface' (defaults to 'aws')
 * - SABAIFACE_ENDPOINT: SabaiFace server URL (required when FACE_PROVIDER='sabaiface')
 * - AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION: AWS credentials (required when FACE_PROVIDER='aws')
 */

import type { FaceRecognitionProvider } from './types';
import { createAWSProvider } from './aws-provider';
import { createSabaiFaceProvider } from './sabaiface-provider';

// =============================================================================
// Types
// =============================================================================

/**
 * Environment bindings required for face recognition.
 * Subset of Cloudflare.Env for type safety.
 */
export interface FaceProviderEnv {
  // Provider selection
  FACE_PROVIDER?: string; // 'aws' | 'sabaiface', defaults to 'aws'

  // SabaiFace configuration
  SABAIFACE_ENDPOINT?: string; // Required when FACE_PROVIDER='sabaiface'

  // AWS configuration
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
}

// =============================================================================
// Provider Factory
// =============================================================================

/**
 * Create face recognition provider based on environment configuration.
 *
 * @param env - Environment bindings
 * @returns FaceRecognitionProvider instance
 * @throws Error if required configuration is missing
 *
 * @example
 * ```typescript
 * // In queue handler or route
 * const provider = createFaceProvider(env);
 * const result = await provider.indexPhoto({
 *   eventId: 'event-123',
 *   photoId: 'photo-456',
 *   imageData: imageBytes,
 * });
 * ```
 */
export function createFaceProvider(env: FaceProviderEnv): FaceRecognitionProvider {
  const providerType = env.FACE_PROVIDER || 'aws';

  if (providerType === 'sabaiface') {
    if (!env.SABAIFACE_ENDPOINT) {
      throw new Error('SABAIFACE_ENDPOINT is required when FACE_PROVIDER=sabaiface');
    }
    return createSabaiFaceProvider({ endpoint: env.SABAIFACE_ENDPOINT });
  }

  // Default to AWS
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY || !env.AWS_REGION) {
    throw new Error('AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION) are required');
  }

  return createAWSProvider({
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

/**
 * Get collection ID from event ID.
 * Uses event UUID directly as collection ID for both providers.
 */
export function getCollectionId(eventId: string): string {
  return eventId;
}
