import { Hono } from 'hono';
import type { Env } from '../types';

/**
 * R2 proxy endpoint - serves files from R2 bucket
 * Used for QR codes and other public assets
 */
export const r2Router = new Hono<Env>().get('/:key{.*}', async (c) => {
  const key = c.req.param('key');

  if (!key) {
    return c.json({ error: { code: 'INVALID_KEY', message: 'Missing key parameter' } }, 400);
  }

  try {
    // Fetch object from R2
    const object = await c.env.PHOTOS_BUCKET.get(key);

    if (!object) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'File not found' } }, 404);
    }

    // Stream the file back to the client
    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable', // Cache for 1 year
        ETag: object.httpEtag || '',
      },
    });
  } catch (error) {
    console.error('R2 fetch error:', error);
    return c.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch file from storage' } },
      500,
    );
  }
});
