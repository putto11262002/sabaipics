/**
 * Test Fixtures Utility
 *
 * Downloads test fixtures from R2 and caches them locally.
 * Files are only downloaded once per machine.
 *
 * R2 bucket: pabaipics-tests-fixtures
 * Public URL: https://pub-cbdd4e8b0a094bcc89514e8669505427.r2.dev
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CACHE_DIR = join(__dirname, '.cache');
const R2_BASE_URL = 'https://pub-cbdd4e8b0a094bcc89514e8669505427.r2.dev';

/**
 * Get a test fixture from local cache or download from R2.
 * Caches locally to avoid repeated downloads.
 *
 * @param folder - Folder path in R2 (e.g., "aws-rekognition")
 * @param filename - File name (e.g., "1.jpg")
 * @returns File contents as Buffer
 *
 * @example
 * const image = await getFixture("aws-rekognition", "1.jpg");
 */
export async function getFixture(folder: string, filename: string): Promise<Buffer> {
  const cacheFolder = join(CACHE_DIR, folder);
  const cachePath = join(cacheFolder, filename);

  // Return from cache if exists
  if (existsSync(cachePath)) {
    return readFileSync(cachePath);
  }

  // Download from R2
  const url = `${R2_BASE_URL}/${folder}/${filename}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to download fixture: ${folder}/${filename} (${response.status} ${response.statusText})`,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  // Cache locally
  mkdirSync(cacheFolder, { recursive: true });
  writeFileSync(cachePath, buffer);

  return buffer;
}

/**
 * Clear local fixture cache.
 * Useful for CI or refreshing files.
 */
export function clearFixtureCache(): void {
  if (existsSync(CACHE_DIR)) {
    rmSync(CACHE_DIR, { recursive: true });
  }
}
