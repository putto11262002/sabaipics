#!/usr/bin/env tsx
/**
 * Upload Eval Dataset to R2
 *
 * Uploads a local generated dataset to R2 for distribution.
 * Creates a manifest.json for integrity verification.
 *
 * Usage:
 *   pnpm --filter @sabaipics/face-eval eval dataset upload \
 *     --source ./testimages \
 *     --version v1
 *
 * Environment:
 *   R2_ACCOUNT_ID       - Cloudflare account ID
 *   R2_ACCESS_KEY_ID    - R2 access key
 *   R2_SECRET_ACCESS_KEY - R2 secret key
 *   R2_BUCKET_NAME      - R2 bucket name (default: sabaipics-eval-datasets)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AwsClient } from 'aws4fetch';

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

interface UploadOptions {
  source: string;
  version: string;
  dryRun?: boolean;
  force?: boolean;
}

// R2 Configuration
function getR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME || 'sabaipics-eval-datasets';

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
 * Recursively get all files in a directory
 */
function getAllFiles(dir: string, baseDir: string = dir): ManifestFile[] {
  const files: ManifestFile[] = [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      const relativePath = path.relative(baseDir, fullPath);
      const stat = fs.statSync(fullPath);
      files.push({
        path: relativePath,
        size: stat.size,
        sha256: hashFile(fullPath),
      });
    }
  }

  return files;
}

/**
 * Upload a single file to R2
 */
async function uploadFile(
  client: AwsClient,
  endpoint: string,
  bucketName: string,
  key: string,
  filePath: string,
): Promise<void> {
  const content = fs.readFileSync(filePath);
  const contentType = key.endsWith('.json')
    ? 'application/json'
    : key.endsWith('.jpg') || key.endsWith('.jpeg')
      ? 'image/jpeg'
      : 'application/octet-stream';

  const url = `${endpoint}/${bucketName}/${key}`;
  const response = await client.fetch(url, {
    method: 'PUT',
    body: content,
    headers: {
      'Content-Type': contentType,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to upload ${key}: ${response.status} ${text}`);
  }
}

/**
 * Check if a version already exists in R2
 */
async function versionExists(
  client: AwsClient,
  endpoint: string,
  bucketName: string,
  version: string,
): Promise<boolean> {
  const url = `${endpoint}/${bucketName}/${version}/manifest.json`;
  const response = await client.fetch(url, { method: 'HEAD' });
  return response.ok;
}

/**
 * Upload JSON content to R2
 */
async function uploadJson(
  client: AwsClient,
  endpoint: string,
  bucketName: string,
  key: string,
  data: unknown,
): Promise<void> {
  const content = JSON.stringify(data, null, 2);
  const url = `${endpoint}/${bucketName}/${key}`;
  const response = await client.fetch(url, {
    method: 'PUT',
    body: content,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to upload ${key}: ${response.status} ${text}`);
  }
}

/**
 * Main upload function
 */
export async function uploadDataset(options: UploadOptions): Promise<void> {
  const { source, version, dryRun = false, force = false } = options;

  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    Eval Dataset Upload to R2                                 ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  // Validate source directory
  const sourcePath = path.resolve(source);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source directory not found: ${sourcePath}`);
  }

  // Validate index.json exists and has valid structure
  const indexJsonPath = path.join(sourcePath, 'index.json');
  if (!fs.existsSync(indexJsonPath)) {
    throw new Error(`index.json not found in source: ${indexJsonPath}`);
  }

  let indexJson: any;
  try {
    indexJson = JSON.parse(fs.readFileSync(indexJsonPath, 'utf-8'));
  } catch (e) {
    throw new Error(`Invalid JSON in index.json: ${(e as Error).message}`);
  }

  // Validate index.json schema
  const requiredFields = ['num_identities', 'num_index_images', 'index_images', 'identities'];
  for (const field of requiredFields) {
    if (!(field in indexJson)) {
      throw new Error(`index.json missing required field: ${field}`);
    }
  }

  if (!Array.isArray(indexJson.index_images)) {
    throw new Error('index.json: index_images must be an array');
  }

  if (typeof indexJson.identities !== 'object') {
    throw new Error('index.json: identities must be an object');
  }

  const selfiesDir = path.join(sourcePath, 'selfies');
  const indexDir = path.join(sourcePath, 'index');

  console.log(`\nSource:  ${sourcePath}`);
  console.log(`Version: ${version}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(
    `\nindex.json: ✓ valid (${Object.keys(indexJson.identities).length} identities, ${indexJson.index_images.length} index images)\n`,
  );

  // Get R2 config
  const r2 = dryRun ? null : getR2Config();
  if (r2) {
    console.log(`Bucket:  ${r2.bucketName}`);
    console.log(`Prefix:  ${version}/\n`);

    // Check if version already exists
    const client = new AwsClient({
      accessKeyId: r2.accessKeyId,
      secretAccessKey: r2.secretAccessKey,
    });

    const exists = await versionExists(client, r2.endpoint, r2.bucketName, version);
    if (exists && !force) {
      throw new Error(`Version "${version}" already exists in R2. Use --force to overwrite.`);
    }
    if (exists && force) {
      console.log(`⚠️  Version "${version}" exists - will overwrite (--force)\n`);
    }
  }

  // Scan all files
  console.log('Scanning files...');
  const files: ManifestFile[] = [];

  // Add index.json
  const indexJsonStat = fs.statSync(indexJsonPath);
  files.push({
    path: 'index.json',
    size: indexJsonStat.size,
    sha256: hashFile(indexJsonPath),
  });

  // Add selfies
  if (fs.existsSync(selfiesDir)) {
    const selfieFiles = getAllFiles(selfiesDir, sourcePath);
    files.push(...selfieFiles);
  }

  // Add index images
  if (fs.existsSync(indexDir)) {
    const indexFiles = getAllFiles(indexDir, sourcePath);
    files.push(...indexFiles);
  }

  // Calculate totals
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);

  console.log(`\nFound ${files.length} files (${totalSizeMB} MB total)`);

  // Create manifest
  const manifest: Manifest = {
    version,
    created_at: new Date().toISOString(),
    total_files: files.length,
    total_size_bytes: totalSize,
    files,
  };

  // Summary by type
  const selfieCount = files.filter((f) => f.path.startsWith('selfies/')).length;
  const indexCount = files.filter((f) => f.path.startsWith('index/')).length;
  console.log(`  - index.json: 1`);
  console.log(`  - selfies: ${selfieCount}`);
  console.log(`  - index images: ${indexCount}`);

  if (dryRun) {
    console.log('\n[DRY RUN] Would upload:');
    console.log(`  - ${version}/manifest.json`);
    console.log(`  - ${version}/index.json`);
    console.log(`  - ${files.length - 1} image files`);
    console.log('\nManifest preview:');
    console.log(JSON.stringify({ ...manifest, files: `[${files.length} files]` }, null, 2));
    return;
  }

  // Create R2 client
  const client = new AwsClient({
    accessKeyId: r2!.accessKeyId,
    secretAccessKey: r2!.secretAccessKey,
  });

  // Upload files
  console.log('\nUploading files...\n');

  let uploaded = 0;
  let failed = 0;
  const startTime = Date.now();

  // Upload manifest first
  try {
    process.stdout.write(`  [${uploaded + 1}/${files.length + 1}] manifest.json... `);
    await uploadJson(client, r2!.endpoint, r2!.bucketName, `${version}/manifest.json`, manifest);
    console.log('✓');
    uploaded++;
  } catch (error) {
    console.log('✗');
    console.error(`    Error: ${(error as Error).message}`);
    failed++;
  }

  // Upload all files
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const key = `${version}/${file.path}`;
    const localPath = path.join(sourcePath, file.path);

    try {
      process.stdout.write(`  [${i + 2}/${files.length + 1}] ${file.path}... `);
      await uploadFile(client, r2!.endpoint, r2!.bucketName, key, localPath);
      console.log('✓');
      uploaded++;
    } catch (error) {
      console.log('✗');
      console.error(`    Error: ${(error as Error).message}`);
      failed++;
    }

    // Progress every 100 files
    if ((i + 1) % 100 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`    ... ${i + 1}/${files.length} files uploaded (${elapsed}s elapsed)`);
    }
  }

  // Summary
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '─'.repeat(80));
  console.log(`Uploaded: ${uploaded}/${files.length + 1} files in ${totalTime}s`);
  if (failed > 0) {
    console.log(`Failed: ${failed} files`);
  }

  if (failed === 0) {
    console.log('\n✅ Upload complete!');
    console.log(`\nDataset available at: ${version}/`);
  } else {
    console.log('\n⚠️  Some uploads failed. Please retry.');
    process.exit(1);
  }
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);

  let source = '';
  let version = 'v1';
  let dryRun = false;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source' || args[i] === '-s') {
      source = args[++i];
    } else if (args[i] === '--version' || args[i] === '-v') {
      version = args[++i];
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--force' || args[i] === '-f') {
      force = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`Usage: upload-eval-dataset.ts --source <path> [--version <v1>] [--dry-run] [--force]

Options:
  --source, -s   Source directory containing index.json, selfies/, index/
  --version, -v  Dataset version (default: v1)
  --dry-run      Show what would be uploaded without uploading
  --force, -f    Overwrite if version already exists

Environment:
  R2_ACCOUNT_ID        Cloudflare account ID
  R2_ACCESS_KEY_ID     R2 access key
  R2_SECRET_ACCESS_KEY R2 secret key
  R2_BUCKET_NAME       R2 bucket name (default: sabaipics-eval-datasets)
`);
      process.exit(0);
    }
  }

  if (!source) {
    console.error('Error: --source is required');
    process.exit(1);
  }

  await uploadDataset({ source, version, dryRun, force });
}

main().catch((error) => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
