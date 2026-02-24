/**
 * Image Loading Utilities
 *
 * Utilities for loading and processing images in Node.js environment.
 * Handles canvas setup for face-api.js compatibility.
 */

import * as faceapi from '@vladmandic/face-api';
import canvas from 'canvas';

// Extract Canvas types and Image constructor
const { Canvas, Image, ImageData } = canvas;

// Set up canvas polyfills for face-api.js to work in Node.js
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

// =============================================================================
// Types
// =============================================================================

/**
 * Canvas-compatible Image type
 */
export type CanvasImage = typeof Image.prototype;

/**
 * Image dimensions
 */
export interface ImageDimensions {
  width: number;
  height: number;
}

// =============================================================================
// Image Loading Functions
// =============================================================================

/**
 * Load image from ArrayBuffer.
 * Supports JPEG, PNG, WebP, and other formats supported by canvas.
 *
 * @param buffer - Image data as ArrayBuffer
 * @returns Canvas Image instance
 * @throws Error if image loading fails
 */
export async function loadImageFromBuffer(buffer: ArrayBuffer): Promise<CanvasImage> {
  const img = new Image();

  return new Promise((resolve, reject) => {
    img.onload = () => resolve(img as any);
    img.onerror = (err) => reject(new Error(`Failed to load image: ${err}`));

    // Convert ArrayBuffer to Buffer for canvas
    img.src = Buffer.from(buffer);
  });
}

/**
 * Get dimensions of a loaded image.
 *
 * @param img - Canvas Image instance
 * @returns Image width and height in pixels
 */
export function getImageDimensions(img: CanvasImage): ImageDimensions {
  return {
    width: (img as any).width,
    height: (img as any).height,
  };
}

/**
 * Create a canvas from an image.
 * Useful for cropping or preprocessing.
 *
 * @param img - Canvas Image instance
 * @returns Canvas instance
 */
export function imageToCanvas(img: CanvasImage): canvas.Canvas {
  const { width, height } = getImageDimensions(img);
  const cvs = new Canvas(width, height);
  const ctx = cvs.getContext('2d');
  ctx.drawImage(img as any, 0, 0);
  return cvs;
}

/**
 * Crop a region from an image.
 *
 * @param img - Canvas Image instance
 * @param box - Bounding box in pixel coordinates
 * @returns Cropped canvas
 */
export function cropImage(
  img: CanvasImage,
  box: { x: number; y: number; width: number; height: number },
): canvas.Canvas {
  const cvs = new Canvas(box.width, box.height);
  const ctx = cvs.getContext('2d');

  ctx.drawImage(img as any, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);

  return cvs;
}
