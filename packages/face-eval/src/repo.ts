import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function exists(p: string): Promise<boolean> {
  return fs
    .access(p)
    .then(() => true)
    .catch(() => false);
}

export async function findRepoRoot(startDir: string = process.cwd()): Promise<string> {
  let current = path.resolve(startDir);
  while (true) {
    if (await exists(path.join(current, '.git'))) return current;
    if (await exists(path.join(current, 'pnpm-workspace.yaml'))) return current;

    const parent = path.dirname(current);
    if (parent === current) return startDir;
    current = parent;
  }
}

/**
 * Get the package root directory (where package.json lives)
 */
export function getPackageRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // src/repo.ts -> package root is ../
  return path.resolve(__dirname, '..');
}

/**
 * Get global cache directory for eval datasets.
 * Shared across all clones of the project.
 *
 * Default: ~/.cache/sabaipics/eval-datasets
 * Override: SABAIPICS_CACHE_DIR environment variable
 */
export function getGlobalCacheDir(): string {
  if (process.env.SABAIPICS_CACHE_DIR) {
    return process.env.SABAIPICS_CACHE_DIR;
  }

  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (!home) {
    throw new Error('Cannot determine home directory. Set SABAIPICS_CACHE_DIR.');
  }

  return path.join(home, '.cache', 'sabaipics', 'eval-datasets');
}

/**
 * Get path to a specific dataset version in global cache
 */
export function getDatasetCachePath(version: string): string {
  return path.join(getGlobalCacheDir(), version);
}
