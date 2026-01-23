import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { findRepoRoot } from './repo.ts';

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

export interface LoadedDataset {
  datasetPath: string;
  datasetId: string;
  datasetHash: string;
  datasetRoot: string;
  groundTruth: GroundTruth;
}

export async function loadDataset(datasetPathArg: string): Promise<LoadedDataset> {
  const repoRoot = await findRepoRoot();
  const datasetPath = path.isAbsolute(datasetPathArg)
    ? datasetPathArg
    : path.resolve(repoRoot, datasetPathArg);

  const content = await fs.readFile(datasetPath);
  const datasetHash = crypto.createHash('sha256').update(content).digest('hex');

  const groundTruth = JSON.parse(content.toString('utf8')) as GroundTruth;
  const datasetId = path.basename(datasetPath);

  const datasetRoot =
    groundTruth.metadata?.datasetPath ||
    process.env.SABAIFACE_DATASET_PATH ||
    path.resolve(repoRoot, 'dataset');

  return {
    datasetPath,
    datasetId,
    datasetHash,
    datasetRoot: path.isAbsolute(datasetRoot) ? datasetRoot : path.resolve(repoRoot, datasetRoot),
    groundTruth,
  };
}
