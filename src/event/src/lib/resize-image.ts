/**
 * Client-side image resize using canvas.
 *
 * Scales down large images before upload to reduce payload size.
 * Only resizes if the image exceeds the target dimensions;
 * smaller images pass through unchanged.
 */

const MAX_DIMENSION = 2048;
const JPEG_QUALITY = 0.85;

/**
 * Resize an image file if it exceeds MAX_DIMENSION on either side.
 * Returns a compressed JPEG File ready for upload.
 * If the image is already small enough, returns the original file.
 */
export async function resizeImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  // No resize needed
  if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
    bitmap.close();
    return file;
  }

  // Calculate scaled dimensions preserving aspect ratio
  const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
  const newWidth = Math.round(width * scale);
  const newHeight = Math.round(height * scale);

  const canvas = new OffscreenCanvas(newWidth, newHeight);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, newWidth, newHeight);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
  return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
    type: 'image/jpeg',
    lastModified: file.lastModified,
  });
}
