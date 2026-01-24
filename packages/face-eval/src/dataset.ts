import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { findRepoRoot, getDatasetCachePath } from './repo.ts';

/**
 * Ignore map - image ID to boolean or reason string
 */
export type IgnoreMap = Record<string, boolean | string>;

/**
 * Ignore file format (ignore.json)
 */
export interface IgnoreFile {
  version?: string;
  updated_at?: string;
  updated_by?: string;
  description?: string;
  ignore: IgnoreMap;
}

/**
 * Identity in index.json format
 */
export interface DatasetIdentity {
  event: string;
  person_id: number | string;
  selfies: string[]; // face IDs like "228A9455_0"
  index_matches: string[]; // index image names like "10003_228A9844"
}

/**
 * index.json dataset format
 */
export interface DatasetIndex {
  description?: string;
  num_identities: number;
  num_index_images: number;
  selfies_per_person: number;
  index_images: string[];
  identities: Record<string, DatasetIdentity>;
  ignore?: IgnoreMap; // Optional inline ignore map
}

/**
 * Loaded dataset with resolved paths
 */
export interface LoadedDataset {
  /** Path to the index.json file */
  datasetPath: string;
  /** Filename of the dataset (e.g., "index.json") */
  datasetId: string;
  /** SHA256 hash of index.json content */
  datasetHash: string;
  /** Root directory containing selfies/ and index/ folders */
  datasetRoot: string;
  /** Parsed index.json */
  index: DatasetIndex;
  /** Merged ignore map (from index.json + ignore.json) */
  ignore: IgnoreMap;
  /** Number of ignored images */
  ignoreCount: number;
}

/**
 * Resolved index image with name and full path
 */
export interface ResolvedIndexImage {
  name: string;
  path: string;
}

/**
 * Resolved identity with full paths
 */
export interface ResolvedIdentity {
  personKey: string;
  event: string;
  personId: number | string;
  selfies: Array<{ id: string; path: string }>;
  indexMatches: Array<{ name: string; path: string }>;
}

/**
 * Load ignore.json if it exists
 */
async function loadIgnoreFile(datasetRoot: string): Promise<IgnoreMap> {
  const ignorePath = path.join(datasetRoot, 'ignore.json');
  try {
    const content = await fs.readFile(ignorePath, 'utf8');
    const ignoreFile = JSON.parse(content) as IgnoreFile;
    return ignoreFile.ignore || {};
  } catch {
    return {};
  }
}

/**
 * Load a dataset from index.json path
 */
export async function loadDataset(datasetPathArg: string): Promise<LoadedDataset> {
  const repoRoot = await findRepoRoot();
  const datasetPath = path.isAbsolute(datasetPathArg)
    ? datasetPathArg
    : path.resolve(repoRoot, datasetPathArg);

  const content = await fs.readFile(datasetPath);
  const datasetHash = crypto.createHash('sha256').update(content).digest('hex');

  const index = JSON.parse(content.toString('utf8')) as DatasetIndex;
  const datasetId = path.basename(datasetPath);
  const datasetRoot = path.dirname(datasetPath);

  // Validate it's the expected format
  if (!Array.isArray(index.index_images) || typeof index.identities !== 'object') {
    throw new Error(
      `Invalid dataset format: expected index.json with index_images[] and identities{}`,
    );
  }

  // Load ignore map from ignore.json (if exists) and merge with inline ignore
  const ignoreFromFile = await loadIgnoreFile(datasetRoot);
  const ignore: IgnoreMap = {
    ...ignoreFromFile,
    ...(index.ignore || {}), // Inline ignore takes precedence
  };
  const ignoreCount = Object.keys(ignore).length;

  return {
    datasetPath,
    datasetId,
    datasetHash,
    datasetRoot,
    index,
    ignore,
    ignoreCount,
  };
}

/**
 * Load a dataset by version from global cache.
 *
 * @param version - Dataset version (e.g., "v1")
 * @returns Loaded dataset from ~/.cache/sabaipics/eval-datasets/{version}/index.json
 */
export async function loadDatasetByVersion(version: string): Promise<LoadedDataset> {
  const versionPath = getDatasetCachePath(version);
  const indexPath = path.join(versionPath, 'index.json');

  try {
    await fs.access(indexPath);
  } catch {
    throw new Error(
      `Dataset version "${version}" not found in cache.\n` +
        `Expected: ${indexPath}\n` +
        `Run: pnpm --filter @sabaipics/face-eval dataset:download --version ${version}`,
    );
  }

  return loadDataset(indexPath);
}

/**
 * Check if an image ID is ignored
 */
export function isIgnored(dataset: LoadedDataset, imageId: string): boolean {
  return imageId in dataset.ignore;
}

/**
 * Get ignore reason for an image (or undefined if not ignored)
 */
export function getIgnoreReason(dataset: LoadedDataset, imageId: string): string | undefined {
  const value = dataset.ignore[imageId];
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return 'ignored';
  return value;
}

/**
 * Resolve all index images to full paths (excluding ignored)
 */
export function resolveIndexImages(
  dataset: LoadedDataset,
  includeIgnored = false,
): ResolvedIndexImage[] {
  return dataset.index.index_images
    .filter((name) => includeIgnored || !isIgnored(dataset, name))
    .map((name) => ({
      name,
      path: path.join(dataset.datasetRoot, 'index', `${name}.jpg`),
    }));
}

/**
 * Resolve a single identity to full paths (excluding ignored selfies)
 */
export function resolveIdentity(
  dataset: LoadedDataset,
  personKey: string,
  includeIgnored = false,
): ResolvedIdentity {
  const identity = dataset.index.identities[personKey];
  if (!identity) {
    throw new Error(`Identity not found: ${personKey}`);
  }

  return {
    personKey,
    event: identity.event,
    personId: identity.person_id,
    selfies: identity.selfies
      .filter((id) => includeIgnored || !isIgnored(dataset, id))
      .map((id) => ({
        id,
        path: path.join(dataset.datasetRoot, 'selfies', personKey, `${id}.jpg`),
      })),
    indexMatches: identity.index_matches
      .filter((name) => includeIgnored || !isIgnored(dataset, name))
      .map((name) => ({
        name,
        path: path.join(dataset.datasetRoot, 'index', `${name}.jpg`),
      })),
  };
}

/**
 * Resolve all identities to full paths (excluding ignored)
 */
export function resolveAllIdentities(
  dataset: LoadedDataset,
  includeIgnored = false,
): ResolvedIdentity[] {
  return Object.keys(dataset.index.identities)
    .map((key) => resolveIdentity(dataset, key, includeIgnored))
    .filter((identity) => identity.selfies.length > 0); // Exclude identities with no valid selfies
}

/**
 * Filter dataset to a subset of index images.
 * Useful for quick tests with smaller index.
 */
export function filterDatasetToSubset(
  dataset: LoadedDataset,
  indexSubset: string[],
): LoadedDataset {
  const subsetSet = new Set(indexSubset);

  // Filter index images
  const filteredIndexImages = dataset.index.index_images.filter((name) => subsetSet.has(name));

  // Filter identities - only keep matches that exist in subset
  const filteredIdentities: Record<string, DatasetIdentity> = {};

  for (const [personKey, identity] of Object.entries(dataset.index.identities)) {
    const filteredMatches = identity.index_matches.filter((name) => subsetSet.has(name));

    // Only include person if they have matches in the subset
    if (filteredMatches.length > 0) {
      filteredIdentities[personKey] = {
        ...identity,
        index_matches: filteredMatches,
      };
    }
  }

  return {
    ...dataset,
    index: {
      ...dataset.index,
      index_images: filteredIndexImages,
      num_index_images: filteredIndexImages.length,
      num_identities: Object.keys(filteredIdentities).length,
      identities: filteredIdentities,
    },
  };
}

/**
 * Get dataset statistics
 */
export function getDatasetStats(dataset: LoadedDataset): {
  totalIdentities: number;
  totalSelfies: number;
  totalIndexImages: number;
  ignoredImages: number;
  validSelfies: number;
  validIndexImages: number;
} {
  const allIdentities = resolveAllIdentities(dataset, true);
  const validIdentities = resolveAllIdentities(dataset, false);

  const totalSelfies = allIdentities.reduce((sum, id) => sum + id.selfies.length, 0);
  const validSelfies = validIdentities.reduce((sum, id) => sum + id.selfies.length, 0);

  const totalIndexImages = dataset.index.index_images.length;
  const validIndexImages = resolveIndexImages(dataset, false).length;

  return {
    totalIdentities: allIdentities.length,
    totalSelfies,
    totalIndexImages,
    ignoredImages: dataset.ignoreCount,
    validSelfies,
    validIndexImages,
  };
}
