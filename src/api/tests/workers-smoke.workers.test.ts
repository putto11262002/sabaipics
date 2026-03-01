import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';

describe('workers runtime smoke', () => {
  it('can read and write PHOTOS_BUCKET binding', async () => {
    const key = `tests/workers-smoke/${crypto.randomUUID()}.txt`;
    await env.PHOTOS_BUCKET.put(key, 'ok');

    const obj = await env.PHOTOS_BUCKET.get(key);
    expect(obj).not.toBeNull();
    expect(await obj!.text()).toBe('ok');
  });
});
