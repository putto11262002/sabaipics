#!/usr/bin/env tsx
/**
 * Download Eval Dataset from R2
 *
 * Downloads dataset from R2 with local caching.
 * Only downloads files that don't exist locally or have different hashes.
 *
 * Cache Location (shared across all project clones):
 *   Default: ~/.cache/sabaipics/eval-datasets/
 *   Override: SABAIPICS_CACHE_DIR environment variable
 *
 * Usage:
 *   pnpm --filter @sabaipics/face-eval dataset:download --version v1
 *
 * Environment:
 *   R2_ACCOUNT_ID         - Cloudflare account ID
 *   R2_ACCESS_KEY_ID      - R2 access key
 *   R2_SECRET_ACCESS_KEY  - R2 secret key
 *   R2_BUCKET_NAME        - R2 bucket name (default: sabai-dataset)
 *   SABAIPICS_CACHE_DIR   - Override global cache directory
 *   SKIP_DATASET_DOWNLOAD - Set to "1" to skip download
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AwsClient } from 'aws4fetch';
import { getGlobalCacheDir } from '../src/repo.ts';

// Types
interface ManifestFile {
  path: string;
  size: number;
  sha256: string;
}

interface Manifest {
  version: string;
  created_at: string;
  total_files: number;
  total_size_bytes: number;
  files: ManifestFile[];
}

interface IgnoreFile {
  version?: string;
  updated_at?: string;
  updated_by?: string;
  description?: string;
  ignore: Record<string, boolean | string>;
}

interface DownloadOptions {
  version: string;
  output?: string; // If not provided, uses global cache
  skipIgnore?: boolean;
}

// R2 Configuration
function getR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME || 'sabai-dataset';

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Missing R2 credentials. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY',
    );
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  };
}

/**
 * Calculate SHA256 hash of a file
 */
function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Check if local file matches manifest
 */
function fileMatchesManifest(localPath: string, manifestFile: ManifestFile): boolean {
  if (!fs.existsSync(localPath)) {
    return false;
  }

  const stat = fs.statSync(localPath);
  if (stat.size !== manifestFile.size) {
    return false;
  }

  // Check hash
  const localHash = hashFile(localPath);
  return localHash === manifestFile.sha256;
}

/**
 * Download a file from R2
 */
async function downloadFile(
  client: AwsClient,
  endpoint: string,
  bucketName: string,
  key: string,
  destPath: string,
): Promise<void> {
  const url = `${endpoint}/${bucketName}/${key}`;
  const response = await client.fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`File not found: ${key}`);
    }
    const text = await response.text();
    throw new Error(`Failed to download ${key}: ${response.status} ${text}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  // Ensure directory exists
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(destPath, buffer);
}

/**
 * Download JSON from R2
 */
async function downloadJson<T>(
  client: AwsClient,
  endpoint: string,
  bucketName: string,
  key: string,
): Promise<T | null> {
  const url = `${endpoint}/${bucketName}/${key}`;
  const response = await client.fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    const text = await response.text();
    throw new Error(`Failed to download ${key}: ${response.status} ${text}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Main download function
 */
export async function downloadDataset(options: DownloadOptions): Promise<void> {
  const { version, output, skipIgnore = false } = options;

  // Skip if flag is set
  if (process.env.SKIP_DATASET_DOWNLOAD === '1') {
    console.log('[dataset] SKIP_DATASET_DOWNLOAD=1, skipping download');
    return;
  }

  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    Eval Dataset Download from R2                             ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  // Use global cache if no output specified
  const cacheDir = output ? path.resolve(output) : getGlobalCacheDir();
  const versionPath = path.join(cacheDir, version);

  console.log(`\nVersion: ${version}`);
  console.log(`Output:  ${versionPath}\n`);

  // Get R2 config
  const r2 = getR2Config();
  console.log(`Bucket:  ${r2.bucketName}`);

  // Create R2 client
  const client = new AwsClient({
    accessKeyId: r2.accessKeyId,
    secretAccessKey: r2.secretAccessKey,
  });

  // Download manifest
  console.log('\nFetching manifest...');
  const manifest = await downloadJson<Manifest>(
    client,
    r2.endpoint,
    r2.bucketName,
    `${version}/manifest.json`,
  );

  if (!manifest) {
    throw new Error(`Manifest not found for version: ${version}`);
  }

  console.log(`  Version: ${manifest.version}`);
  console.log(`  Created: ${manifest.created_at}`);
  console.log(`  Files: ${manifest.total_files}`);
  console.log(`  Size: ${(manifest.total_size_bytes / 1024 / 1024).toFixed(2)} MB`);

  // Check which files need downloading
  console.log('\nChecking local cache...');
  const toDownload: ManifestFile[] = [];
  const alreadyCached: ManifestFile[] = [];

  for (const file of manifest.files) {
    const localPath = path.join(versionPath, file.path);
    if (fileMatchesManifest(localPath, file)) {
      alreadyCached.push(file);
    } else {
      toDownload.push(file);
    }
  }

  console.log(`  Cached: ${alreadyCached.length} files`);
  console.log(`  To download: ${toDownload.length} files`);

  if (toDownload.length === 0) {
    console.log('\n✅ All files already cached!');
  } else {
    // Download missing files
    const downloadSize = toDownload.reduce((sum, f) => sum + f.size, 0);
    console.log(`  Download size: ${(downloadSize / 1024 / 1024).toFixed(2)} MB`);
    console.log('\nDownloading files...\n');

    let downloaded = 0;
    let failed = 0;
    const startTime = Date.now();

    for (let i = 0; i < toDownload.length; i++) {
      const file = toDownload[i];
      const key = `${version}/${file.path}`;
      const localPath = path.join(versionPath, file.path);

      try {
        process.stdout.write(`  [${i + 1}/${toDownload.length}] ${file.path}... `);
        await downloadFile(client, r2.endpoint, r2.bucketName, key, localPath);

        // Verify hash
        const localHash = hashFile(localPath);
        if (localHash !== file.sha256) {
          throw new Error('Hash mismatch after download');
        }

        console.log('✓');
        downloaded++;
      } catch (error) {
        console.log('✗');
        console.error(`    Error: ${(error as Error).message}`);
        failed++;
      }

      // Progress every 100 files
      if ((i + 1) % 100 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`    ... ${i + 1}/${toDownload.length} files downloaded (${elapsed}s elapsed)`);
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n' + '─'.repeat(80));
    console.log(`Downloaded: ${downloaded}/${toDownload.length} files in ${totalTime}s`);
    if (failed > 0) {
      console.log(`Failed: ${failed} files`);
    }
  }

  // Download ignore file (separate from manifest)
  if (!skipIgnore) {
    console.log('\nFetching ignore file...');
    const ignoreFile = await downloadJson<IgnoreFile>(
      client,
      r2.endpoint,
      r2.bucketName,
      `ignore/${version}-ignore-latest.json`,
    );

    if (ignoreFile) {
      const ignorePath = path.join(versionPath, 'ignore.json');
      fs.writeFileSync(ignorePath, JSON.stringify(ignoreFile, null, 2));
      const ignoreCount = Object.keys(ignoreFile.ignore || {}).length;
      console.log(`  Downloaded ignore.json (${ignoreCount} entries)`);
      if (ignoreFile.updated_at) {
        console.log(`  Updated: ${ignoreFile.updated_at}`);
      }
    } else {
      console.log('  No ignore file found (this is normal for new datasets)');
    }
  }

  // Summary
  console.log('\n✅ Download complete!');
  console.log(`\nDataset ready at: ${versionPath}/`);
  console.log(`  index.json:  ${path.join(versionPath, 'index.json')}`);
  console.log(`  selfies/:    ${path.join(versionPath, 'selfies/')}`);
  console.log(`  index/:      ${path.join(versionPath, 'index/')}`);
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);

  let version = 'v1';
  let output: string | undefined;
  let skipIgnore = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--version' || args[i] === '-v') {
      version = args[++i];
    } else if (args[i] === '--output' || args[i] === '-o') {
      output = args[++i];
    } else if (args[i] === '--skip-ignore') {
      skipIgnore = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      const defaultCache = getGlobalCacheDir();
      console.log(`Usage: download-eval-dataset.ts [--version <v1>] [--output <path>] [--skip-ignore]

Options:
  --version, -v   Dataset version (default: v1)
  --output, -o    Output directory (default: global cache)
  --skip-ignore   Don't download ignore.json

Global Cache (shared across all project clones):
  ${defaultCache}

Environment:
  SABAIPICS_CACHE_DIR   Override global cache directory
  R2_ACCOUNT_ID         Cloudflare account ID
  R2_ACCESS_KEY_ID      R2 access key
  R2_SECRET_ACCESS_KEY  R2 secret key
  R2_BUCKET_NAME        R2 bucket name (default: sabai-dataset)
  SKIP_DATASET_DOWNLOAD Set to "1" to skip download entirely
`);
      process.exit(0);
    }
  }

  await downloadDataset({ version, output, skipIgnore });
}

main().catch((error) => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
