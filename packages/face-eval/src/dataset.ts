import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { findRepoRoot } from './repo.ts';

// Legacy format (ground-truth.json)
export interface GroundTruthIdentity {
  indexImages: string[];
  queryImages: string[];
  containedInIndexImages: string[];
  indexImagePaths?: string[];
  queryImagePaths?: string[];
  containedInIndexPaths?: string[];
}

export interface GroundTruth {
  metadata?: {
    datasetPath?: string;
    generatedAt?: string;
    numPeople?: number;
    imagesPerPerson?: number;
    indexSize?: number;
    querySize?: number;
    totalUniqueIndexImages?: number;
    totalQueryImages?: number;
  };
  indexSet: Array<string | { name: string; path: string }>;
  identities: Record<string, GroundTruthIdentity & { personId?: number; name?: string }>;
}

// New format (index.json)
export interface IndexJsonIdentity {
  event: string;
  person_id: number | string;
  selfies: string[]; // face IDs like "228A9455_0"
  index_matches: string[]; // index image names like "10003_228A9844"
}

export interface IndexJson {
  description?: string;
  num_identities: number;
  num_index_images: number;
  selfies_per_person: number;
  index_images: string[];
  identities: Record<string, IndexJsonIdentity>;
}

export interface LoadedDataset {
  datasetPath: string;
  datasetId: string;
  datasetHash: string;
  datasetRoot: string;
  groundTruth: GroundTruth;
  // New format fields
  isNewFormat: boolean;
  indexJson?: IndexJson;
}

/**
 * Detect if JSON is new format (index.json) or legacy (ground-truth.json)
 */
function isIndexJsonFormat(data: any): data is IndexJson {
  return (
    typeof data.num_identities === 'number' &&
    Array.isArray(data.index_images) &&
    typeof data.identities === 'object' &&
    Object.values(data.identities).some(
      (id: any) => Array.isArray(id.selfies) && Array.isArray(id.index_matches),
    )
  );
}

/**
 * Convert new index.json format to legacy GroundTruth format for compatibility
 */
function convertIndexJsonToGroundTruth(indexJson: IndexJson, datasetRoot: string): GroundTruth {
  const identities: Record<string, GroundTruthIdentity & { personId?: number; name?: string }> = {};

  for (const [personKey, identity] of Object.entries(indexJson.identities)) {
    // Build paths for selfies
    const queryImagePaths = identity.selfies.map((selfieId) =>
      path.join(datasetRoot, 'selfies', personKey, `${selfieId}.jpg`),
    );

    // Build paths for index images
    const indexImagePaths = identity.index_matches.map((imgName) =>
      path.join(datasetRoot, 'index', `${imgName}.jpg`),
    );

    identities[personKey] = {
      personId:
        typeof identity.person_id === 'number'
          ? identity.person_id
          : parseInt(identity.person_id as string, 10),
      name: personKey,
      indexImages: identity.index_matches,
      queryImages: identity.selfies,
      queryImagePaths,
      containedInIndexImages: identity.index_matches,
      containedInIndexPaths: indexImagePaths,
      indexImagePaths,
    };
  }

  // Build indexSet with paths
  const indexSet = indexJson.index_images.map((imgName) => ({
    name: imgName,
    path: path.join(datasetRoot, 'index', `${imgName}.jpg`),
  }));

  return {
    metadata: {
      numPeople: indexJson.num_identities,
      indexSize: indexJson.num_index_images,
      querySize: indexJson.num_identities * indexJson.selfies_per_person,
    },
    indexSet,
    identities,
  };
}

export async function loadDataset(datasetPathArg: string): Promise<LoadedDataset> {
  const repoRoot = await findRepoRoot();
  const datasetPath = path.isAbsolute(datasetPathArg)
    ? datasetPathArg
    : path.resolve(repoRoot, datasetPathArg);

  const content = await fs.readFile(datasetPath);
  const datasetHash = crypto.createHash('sha256').update(content).digest('hex');

  const rawData = JSON.parse(content.toString('utf8'));
  const datasetId = path.basename(datasetPath);

  // Determine format and get dataset root
  const isNewFormat = isIndexJsonFormat(rawData);

  let datasetRoot: string;
  let groundTruth: GroundTruth;
  let indexJson: IndexJson | undefined;

  if (isNewFormat) {
    // New format: datasetRoot is the directory containing index.json
    datasetRoot = path.dirname(datasetPath);
    indexJson = rawData as IndexJson;
    groundTruth = convertIndexJsonToGroundTruth(indexJson, datasetRoot);
  } else {
    // Legacy format
    groundTruth = rawData as GroundTruth;
    datasetRoot =
      groundTruth.metadata?.datasetPath ||
      process.env.SABAIFACE_DATASET_PATH ||
      path.resolve(repoRoot, 'dataset');
    datasetRoot = path.isAbsolute(datasetRoot) ? datasetRoot : path.resolve(repoRoot, datasetRoot);
  }

  return {
    datasetPath,
    datasetId,
    datasetHash,
    datasetRoot,
    groundTruth,
    isNewFormat,
    indexJson,
  };
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

  // Filter index set
  const filteredIndexSet = dataset.groundTruth.indexSet.filter((item) => {
    const name = typeof item === 'string' ? item : item.name;
    return subsetSet.has(name);
  });

  // Filter identities - only keep matches that exist in subset
  const filteredIdentities: Record<
    string,
    GroundTruthIdentity & { personId?: number; name?: string }
  > = {};

  for (const [personKey, identity] of Object.entries(dataset.groundTruth.identities)) {
    const filteredMatches = identity.containedInIndexImages.filter((img) => subsetSet.has(img));

    // Only include person if they have matches in the subset
    if (filteredMatches.length > 0) {
      filteredIdentities[personKey] = {
        ...identity,
        containedInIndexImages: filteredMatches,
        containedInIndexPaths: identity.containedInIndexPaths?.filter((_, i) =>
          subsetSet.has(identity.containedInIndexImages[i]),
        ),
      };
    }
  }

  return {
    ...dataset,
    groundTruth: {
      ...dataset.groundTruth,
      indexSet: filteredIndexSet,
      identities: filteredIdentities,
    },
  };
}
