import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import staticAssetsIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache';

export default {
  ...defineCloudflareConfig({
    // Use Workers Static Assets for SSG incremental cache
    // This serves pre-rendered pages from the assets binding at the edge
    // https://opennext.js.org/cloudflare/caching
    incrementalCache: staticAssetsIncrementalCache,
    // Enable Cloudflare Cache API to cache responses at the edge
    // This reduces TTFB by serving static pages from CF edge instead of worker
    enableCacheInterception: true,
  }),
  buildCommand: 'cd ../.. && pnpm build:www',
};
