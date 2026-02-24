/**
 * Centralized photo upload constants.
 * All photo upload validation (routes, queue consumer) should import from here.
 */

export const PHOTO_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export const PHOTO_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
