/**
 * R2 Presigned URL Generation
 *
 * Generates presigned PUT URLs for direct R2 uploads using aws4fetch.
 */

import { AwsClient } from 'aws4fetch';

// =============================================================================
// Types
// =============================================================================

export interface PresignOptions {
  bucket: string;
  key: string;
  contentType: string;
  contentLength?: number;
  expiresIn: number; // seconds
}

export interface PresignGetOptions {
  bucket: string;
  key: string;
  expiresIn: number; // seconds
}

export interface PresignResult {
  url: string;
  expiresAt: Date;
}

// =============================================================================
// Presigned URL Generation
// =============================================================================

/**
 * Generate a presigned PUT URL for R2.
 *
 * Signed headers:
 * - Content-Type: must match exactly
 * - Content-Length: must match exactly
 * - If-None-Match: * (prevent overwrite)
 */
export async function generatePresignedPutUrl(
  accountId: string,
  accessKeyId: string,
  secretAccessKey: string,
  options: PresignOptions,
): Promise<PresignResult> {
  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: 's3',
    region: 'auto',
  });

  const r2Url = `https://${accountId}.r2.cloudflarestorage.com`;
  const objectUrl = `${r2Url}/${options.bucket}/${options.key}`;

  // URL with expiry
  const urlWithExpiry = `${objectUrl}?X-Amz-Expires=${options.expiresIn}`;

  // Sign the request with required headers
  const headers: Record<string, string> = {
    'Content-Type': options.contentType,
    'If-None-Match': '*',
  };

  if (options.contentLength !== undefined) {
    headers['Content-Length'] = options.contentLength.toString();
  }

  const signedRequest = await client.sign(
    new Request(urlWithExpiry, {
      method: 'PUT',
      headers,
    }),
    { aws: { signQuery: true } },
  );

  const expiresAt = new Date(Date.now() + options.expiresIn * 1000);

  return {
    url: signedRequest.url,
    expiresAt,
  };
}

/**
 * Generate a presigned GET URL for R2.
 */
export async function generatePresignedGetUrl(
  accountId: string,
  accessKeyId: string,
  secretAccessKey: string,
  options: PresignGetOptions,
): Promise<PresignResult> {
  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: 's3',
    region: 'auto',
  });

  const r2Url = `https://${accountId}.r2.cloudflarestorage.com`;
  const objectUrl = `${r2Url}/${options.bucket}/${options.key}`;
  const urlWithExpiry = `${objectUrl}?X-Amz-Expires=${options.expiresIn}`;

  const signedRequest = await client.sign(
    new Request(urlWithExpiry, {
      method: 'GET',
    }),
    { aws: { signQuery: true } },
  );

  const expiresAt = new Date(Date.now() + options.expiresIn * 1000);

  return {
    url: signedRequest.url,
    expiresAt,
  };
}
