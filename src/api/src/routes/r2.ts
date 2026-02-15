import { Hono } from 'hono';
import { ResultAsync, safeTry, ok, err } from 'neverthrow';
import type { Env } from '../types';
import { apiError, type HandlerError } from '../lib/error';

/**
 * R2 proxy endpoint - serves files from R2 bucket
 * Used for QR codes and other public assets
 */
export const r2Router = new Hono<Env>().get('/:key{.*}', async (c) => {
  const key = c.req.param('key');

  return safeTry(async function* () {
    if (!key) {
      return err<never, HandlerError>({ code: 'BAD_REQUEST', message: 'Missing key parameter' });
    }

    // Fetch object from R2
    const object = yield* ResultAsync.fromPromise(
      c.env.PHOTOS_BUCKET.get(key),
      (cause): HandlerError => ({
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch file from storage',
        cause,
      }),
    );

    if (!object) {
      return err<never, HandlerError>({ code: 'NOT_FOUND', message: 'File not found' });
    }

    // Stream the file back to the client
    return ok(
      new Response(object.body, {
        headers: {
          'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
          'Cache-Control': 'public, max-age=31536000, immutable', // Cache for 1 year
          ETag: object.httpEtag || '',
        },
      }),
    );
  })
    .orTee((e) => e.cause && console.error('[R2]', e.code, e.cause))
    .match(
      (response) => response,
      (e) => apiError(c, e),
    );
});
