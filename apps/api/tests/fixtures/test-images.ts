/**
 * Test Image Utility
 *
 * Downloads test images from R2 and caches them locally.
 * Images are only downloaded once per machine.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CACHE_DIR = join(__dirname, ".cache");
const R2_BASE_URL = "https://pub-cbdd4e8b0a094bcc89514e8669505427.r2.dev/aws-rekognition";

/**
 * Available test images
 * - 1.jpg: 4 dancers (4 faces)
 * - 2.jpg: 3 men at podiums (3+ faces)
 * - 3.jpg: 3 people + Mickey mascot (3 faces)
 * - 4.jpg: Group with mascots (4 faces)
 */
export type TestImageName = "1" | "2" | "3" | "4";

/**
 * Get test image from local cache or download from R2.
 * Caches locally to avoid repeated downloads.
 *
 * @param name - Image name (1, 2, 3, or 4)
 * @returns Image as Buffer
 */
export async function getTestImage(name: TestImageName): Promise<Buffer> {
  const filename = `${name}.jpg`;
  const cachePath = join(CACHE_DIR, filename);

  // Return from cache if exists
  if (existsSync(cachePath)) {
    return readFileSync(cachePath);
  }

  // Download from R2
  const url = `${R2_BASE_URL}/${filename}`;
  console.log(`[TestImages] Downloading: ${url}`);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to download test image: ${name} (${response.status} ${response.statusText})`
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  // Cache locally
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachePath, buffer);

  console.log(`[TestImages] Cached: ${cachePath} (${buffer.length} bytes)`);

  return buffer;
}

/**
 * Clear local cache.
 * Useful for CI or refreshing images.
 */
export function clearCache(): void {
  if (existsSync(CACHE_DIR)) {
    const fs = require("fs");
    fs.rmSync(CACHE_DIR, { recursive: true });
    console.log(`[TestImages] Cache cleared: ${CACHE_DIR}`);
  }
}
