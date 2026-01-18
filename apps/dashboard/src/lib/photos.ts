/**
 * Photo URL generation utilities
 * These must match the server-side generation in apps/api/src/routes/photos.ts
 */

/**
 * Check if we're in development mode
 */
function isDevelopment(): boolean {
  return import.meta.env.DEV;
}

/**
 * Get R2 base URL from environment
 */
function getR2BaseUrl(): string {
  // This should match the API's PHOTO_R2_BASE_URL
  return import.meta.env.VITE_PHOTO_R2_BASE_URL || '';
}

/**
 * Get Cloudflare zone domain from environment
 */
function getCfDomain(): string {
  // This should match the API's CF_ZONE
  return import.meta.env.VITE_CF_ZONE || '';
}

/**
 * Generate thumbnail URL for a photo
 * Matches server-side generation in apps/api/src/routes/photos.ts
 */
export function generateThumbnailUrl(r2Key: string): string {
  const r2BaseUrl = getR2BaseUrl();
  const cfDomain = getCfDomain();

  if (isDevelopment() || !cfDomain) {
    return `${r2BaseUrl}/${r2Key}`;
  }

  return `${cfDomain}/cdn-cgi/image/width=400,fit=cover,format=auto,quality=75/${r2BaseUrl}/${r2Key}`;
}

/**
 * Generate preview URL for a photo
 * Matches server-side generation in apps/api/src/routes/photos.ts
 */
export function generatePreviewUrl(r2Key: string): string {
  const r2BaseUrl = getR2BaseUrl();
  const cfDomain = getCfDomain();

  if (isDevelopment() || !cfDomain) {
    return `${r2BaseUrl}/${r2Key}`;
  }

  return `${cfDomain}/cdn-cgi/image/width=1200,fit=contain,format=auto,quality=85/${r2BaseUrl}/${r2Key}`;
}
