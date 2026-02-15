import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import type { RunCommand } from './cli/parse.ts';
import {
  loadDataset,
  filterDatasetToSubset,
  resolveIndexImages,
  resolveAllIdentities,
} from './dataset.ts';
import { getGitInfo } from './git.ts';
import { calculateMetrics, type SearchResult } from './metrics.ts';
import { appendRunCsv, writeRunMetadata } from './persist.ts';
import { getPackageRoot } from './repo.ts';
import { createAWSProvider } from './providers/aws-provider.ts';
import { createSabaiFaceProvider } from './providers/sabaiface-provider.ts';
import type { FaceRecognitionProvider } from './providers/types.ts';

const CSV_HEADER = [
  'run_id',
  'timestamp_utc',
  'git_sha',
  'git_branch',
  'provider',
  'dataset_id',
  'dataset_hash',
  'max_results',
  'eval_ks',
  'min_similarity',
  'fetch_multiplier',
  'index_max_faces',
  'index_quality_filter',
  'precision_at_10',
  'precision_at_20',
  'recall_at_10',
  'recall_at_20',
  'avg_fp_at_10',
  'avg_fp_at_20',
  'fp_free_at_10',
  'fp_free_at_20',
  'rank1',
  'rank5',
  'mrr',
  'avgIndexTimeMs',
  'avgSearchTimeMs',
  'emptyRate',
];

function makeRunId(now: Date = new Date()): string {
  const ts = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  const rand = crypto.randomUUID().slice(0, 8);
  return `${ts}-${rand}`;
}

async function loadImage(filePath: string): Promise<ArrayBuffer> {
  const buf = await fs.readFile(filePath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function getProvider(cmd: RunCommand): { provider: FaceRecognitionProvider; providerConfig: any } {
  if (cmd.provider === 'sabaiface') {
    const endpoint = cmd.endpoint || process.env.SABAIFACE_ENDPOINT;
    if (!endpoint) {
      throw new Error('Missing --endpoint (or env SABAIFACE_ENDPOINT) for sabaiface provider');
    }
    return {
      provider: createSabaiFaceProvider({ endpoint }),
      providerConfig: { endpoint },
    };
  }

  const region = process.env.AWS_REGION || 'us-west-2';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('Missing AWS credentials in env (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)');
  }

  return {
    provider: createAWSProvider({
      region,
      credentials: { accessKeyId, secretAccessKey },
    }),
    providerConfig: {
      region,
      credentials: { source: 'env' },
    },
  };
}

function toFixedOrEmpty(n: number, digits: number): number {
  // Persist numeric types as numbers; rounding keeps CSV more readable.
  if (!Number.isFinite(n)) return 0;
  const pow = 10 ** digits;
  return Math.round(n * pow) / pow;
}

export async function runEval(cmd: RunCommand) {
  const packageRoot = getPackageRoot();
  const timestampUtc = new Date().toISOString();
  const runId = makeRunId(new Date(timestampUtc));

  const dataset = await loadDataset(cmd.dataset);
  const git = await getGitInfo();

  const minSimilarities =
    cmd.minSimilarityList.length > 0 ? cmd.minSimilarityList : [cmd.minSimilarity ?? 0.8];

  const planned = {
    runId,
    timestampUtc,
    provider: cmd.provider,
    dataset: {
      datasetId: dataset.datasetId,
      datasetHash: dataset.datasetHash,
      datasetPath: dataset.datasetPath,
      datasetRoot: dataset.datasetRoot,
    },
    params: {
      maxResults: cmd.maxResults,
      evalKs: cmd.evalKs,
      minSimilarities,
      fetchMultiplier: cmd.fetchMultiplier,
      indexMaxFaces: cmd.indexMaxFaces,
      indexQualityFilter: cmd.indexQualityFilter,
    },
  };

  if (cmd.dryRun) {
    console.log(JSON.stringify(planned, null, 2));
    return;
  }

  const { provider, providerConfig } = getProvider(cmd);

  const collectionId = `eval-${cmd.provider}-${Date.now()}`;

  const runMetaPath = path.join(packageRoot, 'runs', `${runId}.json`);
  const runsCsvPath = path.join(packageRoot, 'runs', 'runs.csv');

  await writeRunMetadata(runMetaPath, {
    runId,
    timestampUtc,
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    git,
    args: process.argv.slice(2),
    provider: cmd.provider,
    providerConfig,
    dataset: {
      datasetId: dataset.datasetId,
      datasetHash: dataset.datasetHash,
      datasetPath: path.isAbsolute(dataset.datasetPath)
        ? path.relative(process.cwd(), dataset.datasetPath)
        : dataset.datasetPath,
      datasetRoot: path.isAbsolute(dataset.datasetRoot)
        ? path.relative(process.cwd(), dataset.datasetRoot)
        : dataset.datasetRoot,
    },
    params: {
      maxResults: cmd.maxResults,
      evalKs: cmd.evalKs,
      minSimilarity: cmd.minSimilarity,
      minSimilarityList: cmd.minSimilarityList,
      fetchMultiplier: cmd.fetchMultiplier,
      indexMaxFaces: cmd.indexMaxFaces,
      indexQualityFilter: cmd.indexQualityFilter,
    },
    collectionId,
  });

  console.log(`[face-eval] run_id=${runId} provider=${cmd.provider} collection=${collectionId}`);
  console.log(
    `[face-eval] dataset=${dataset.datasetId} hash=${dataset.datasetHash.slice(0, 12)}...`,
  );

  const create = await provider.createCollection(collectionId);
  if (create.isErr()) {
    throw new Error(`Failed to create collection: ${create.error.type}`);
  }

  // Apply subset filter if specified
  let workingDataset = dataset;
  if (
    cmd.indexSubset &&
    cmd.indexSubset > 0 &&
    cmd.indexSubset < dataset.index.index_images.length
  ) {
    // Deterministic subset - take first N images
    const subsetImages = dataset.index.index_images.slice(0, cmd.indexSubset);
    workingDataset = filterDatasetToSubset(dataset, subsetImages);
    console.log(
      `[face-eval] using subset: ${cmd.indexSubset} of ${dataset.index.index_images.length} index images`,
    );
  }

  const indexImages = resolveIndexImages(workingDataset);
  const identities = resolveAllIdentities(workingDataset);
  const totalIndex = indexImages.length;

  console.log(
    `[face-eval] indexing images=${totalIndex} maxFaces=${cmd.indexMaxFaces} qualityFilter=${cmd.indexQualityFilter}`,
  );

  const indexStart = Date.now();
  let indexedImages = 0;
  let indexedFaces = 0;
  let indexErrors = 0;

  try {
    for (const indexImage of indexImages) {
      try {
        const imageBuffer = await loadImage(indexImage.path);

        const r = await provider.indexPhoto({
          eventId: collectionId,
          photoId: indexImage.name,
          imageData: imageBuffer,
          options: {
            maxFaces: Math.max(1, Math.min(100, cmd.indexMaxFaces)),
            qualityFilter: cmd.indexQualityFilter,
          },
        });

        if (r.isErr()) {
          indexErrors++;
          continue;
        }

        indexedImages++;
        indexedFaces += r.value.faces.length;
      } catch (e) {
        indexErrors++;
      }
    }

    const avgIndexTimeMs = (Date.now() - indexStart) / Math.max(1, indexedImages);
    console.log(
      `[face-eval] indexed images=${indexedImages}/${totalIndex} faces=${indexedFaces} avgIndexTimeMs=${avgIndexTimeMs.toFixed(1)} errors=${indexErrors}`,
    );

    const rows = [] as any[];

    for (const minSimilarity of minSimilarities) {
      console.log(`[face-eval] searching minSimilarity=${minSimilarity}`);

      const searchResults: SearchResult[] = [];

      for (const identity of identities) {
        for (const selfie of identity.selfies) {
          try {
            const imageBuffer = await loadImage(selfie.path);

            const start = Date.now();
            const r = await provider.findImagesByFace({
              eventId: collectionId,
              imageData: imageBuffer,
              maxResults: cmd.maxResults * Math.max(1, cmd.fetchMultiplier),
              minSimilarity,
            });
            const durationMs = Date.now() - start;

            if (r.isErr()) continue;

            const photos = r.value.photos
              .slice()
              .sort(
                (a: { similarity: number }, b: { similarity: number }) =>
                  b.similarity - a.similarity,
              )
              .slice(0, cmd.maxResults);

            // Expected images are the index_matches for this identity
            const expectedImages = identity.indexMatches.map((m) => m.name);

            searchResults.push({
              queryImage: selfie.id,
              queryPersonId:
                typeof identity.personId === 'number'
                  ? identity.personId
                  : parseInt(String(identity.personId), 10) || 0,
              expectedImages,
              results: photos.map((p: { photoId: string; similarity: number }) => ({
                image: p.photoId,
                similarity: p.similarity,
              })),
              durationMs,
            });
          } catch (e) {
            // ignore
          }
        }
      }

      const ksForMetrics = Array.from(
        new Set([...cmd.evalKs, Math.min(10, cmd.maxResults), Math.min(20, cmd.maxResults)]),
      )
        .filter((k) => k > 0)
        .sort((a, b) => a - b);

      const metrics = calculateMetrics(searchResults, ksForMetrics);
      metrics.avgIndexTimeMs = avgIndexTimeMs;

      const k10 = String(Math.min(10, cmd.maxResults));
      const k20 = String(Math.min(20, cmd.maxResults));
      const at10 = metrics.retrievalAtK[k10];
      const at20 = metrics.retrievalAtK[k20];

      rows.push({
        run_id: runId,
        timestamp_utc: timestampUtc,
        git_sha: git.sha ?? '',
        git_branch: git.branch ?? '',
        provider: cmd.provider,
        dataset_id: dataset.datasetId,
        dataset_hash: dataset.datasetHash,
        max_results: cmd.maxResults,
        eval_ks: cmd.evalKs.join(','),
        min_similarity: minSimilarity,
        fetch_multiplier: cmd.fetchMultiplier,
        index_max_faces: cmd.indexMaxFaces,
        index_quality_filter: cmd.indexQualityFilter,
        precision_at_10: toFixedOrEmpty(at10?.precision ?? 0, 6),
        precision_at_20: toFixedOrEmpty(at20?.precision ?? 0, 6),
        recall_at_10: toFixedOrEmpty(at10?.recall ?? 0, 6),
        recall_at_20: toFixedOrEmpty(at20?.recall ?? 0, 6),
        avg_fp_at_10: toFixedOrEmpty(at10?.avgFalsePositives ?? 0, 6),
        avg_fp_at_20: toFixedOrEmpty(at20?.avgFalsePositives ?? 0, 6),
        fp_free_at_10: toFixedOrEmpty(at10?.fpFreeRate ?? 0, 6),
        fp_free_at_20: toFixedOrEmpty(at20?.fpFreeRate ?? 0, 6),
        rank1: toFixedOrEmpty(metrics.rank1Accuracy, 6),
        rank5: toFixedOrEmpty(metrics.rank5Accuracy, 6),
        mrr: toFixedOrEmpty(metrics.meanReciprocalRank, 6),
        avgIndexTimeMs: toFixedOrEmpty(metrics.avgIndexTimeMs, 2),
        avgSearchTimeMs: toFixedOrEmpty(metrics.avgSearchTimeMs, 2),
        emptyRate: toFixedOrEmpty(metrics.emptyResultRate, 6),
      });

      console.log(
        `[face-eval] metrics rank1=${(metrics.rank1Accuracy * 100).toFixed(2)}% rank5=${(metrics.rank5Accuracy * 100).toFixed(2)}% mrr=${metrics.meanReciprocalRank.toFixed(3)}`,
      );
    }

    await appendRunCsv(runsCsvPath, CSV_HEADER, rows);
    console.log(
      `[face-eval] appended ${rows.length} row(s) to ${path.relative(process.cwd(), runsCsvPath)}`,
    );
  } finally {
    const del = await provider.deleteCollection(collectionId);
    if (del.isErr()) {
      console.error(`[face-eval] cleanup failed: ${del.error.type}`);
    }
  }
}
