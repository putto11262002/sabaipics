#!/usr/bin/env tsx
/**
 * Upload Ignore File to R2
 *
 * Uploads an ignore.json file to R2, versioning it automatically.
 * This allows updating the ignore list without re-uploading images.
 *
 * Usage:
 *   pnpm --filter @sabaipics/face-eval eval ignore upload \
 *     --file ./ignore.json \
 *     --dataset-version v1
 *
 * Environment:
 *   R2_ACCOUNT_ID        - Cloudflare account ID
 *   R2_ACCESS_KEY_ID     - R2 access key
 *   R2_SECRET_ACCESS_KEY - R2 secret key
 *   R2_BUCKET_NAME       - R2 bucket name (default: sabai-dataset)
 */

import fs from 'node:fs';
import path from 'node:path';
import { AwsClient } from 'aws4fetch';

// Types
interface IgnoreFile {
  version?: string;
  updated_at?: string;
  updated_by?: string;
  description?: string;
  ignore: Record<string, boolean | string>;
}

interface UploadIgnoreOptions {
  file: string;
  datasetVersion: string;
  description?: string;
  dryRun?: boolean;
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
 * List existing ignore versions
 */
async function listIgnoreVersions(
  client: AwsClient,
  endpoint: string,
  bucketName: string,
  datasetVersion: string,
): Promise<string[]> {
  const prefix = `ignore/${datasetVersion}-ignore-`;
  const url = `${endpoint}/${bucketName}?list-type=2&prefix=${encodeURIComponent(prefix)}`;

  const response = await client.fetch(url);
  if (!response.ok) {
    return [];
  }

  const text = await response.text();
  // Parse XML response to get keys
  const keyMatches = text.matchAll(/<Key>([^<]+)<\/Key>/g);
  const keys: string[] = [];
  for (const match of keyMatches) {
    keys.push(match[1]);
  }

  return keys
    .filter((k) => k.startsWith(prefix) && k.endsWith('.json') && !k.includes('latest'))
    .sort();
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
export async function uploadIgnore(options: UploadIgnoreOptions): Promise<void> {
  const { file, datasetVersion, description, dryRun = false } = options;

  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    Upload Ignore File to R2                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  // Validate file
  const filePath = path.resolve(file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  // Parse ignore file
  const content = fs.readFileSync(filePath, 'utf-8');
  let ignoreData: IgnoreFile;
  try {
    ignoreData = JSON.parse(content);
  } catch {
    throw new Error(`Invalid JSON in file: ${filePath}`);
  }

  if (!ignoreData.ignore || typeof ignoreData.ignore !== 'object') {
    throw new Error('File must have an "ignore" object');
  }

  const ignoreCount = Object.keys(ignoreData.ignore).length;
  console.log(`\nFile:    ${filePath}`);
  console.log(`Dataset: ${datasetVersion}`);
  console.log(`Entries: ${ignoreCount}`);

  if (dryRun) {
    console.log('\n[DRY RUN] Would upload ignore file');
    return;
  }

  // Get R2 config
  const r2 = getR2Config();
  console.log(`Bucket:  ${r2.bucketName}\n`);

  // Create R2 client
  const client = new AwsClient({
    accessKeyId: r2.accessKeyId,
    secretAccessKey: r2.secretAccessKey,
  });

  // Find next version number
  console.log('Checking existing versions...');
  const existingVersions = await listIgnoreVersions(
    client,
    r2.endpoint,
    r2.bucketName,
    datasetVersion,
  );

  let nextVersion = 1;
  if (existingVersions.length > 0) {
    const lastVersion = existingVersions[existingVersions.length - 1];
    const match = lastVersion.match(/-(\d+)\.json$/);
    if (match) {
      nextVersion = parseInt(match[1], 10) + 1;
    }
  }

  const versionStr = String(nextVersion).padStart(3, '0');
  console.log(`  Existing versions: ${existingVersions.length}`);
  console.log(`  New version: ${versionStr}`);

  // Prepare final ignore file
  const finalIgnore: IgnoreFile = {
    version: versionStr,
    updated_at: new Date().toISOString(),
    updated_by: process.env.USER || 'unknown',
    description: description || ignoreData.description,
    ignore: ignoreData.ignore,
  };

  // Upload versioned file
  const versionedKey = `ignore/${datasetVersion}-ignore-${versionStr}.json`;
  console.log(`\nUploading ${versionedKey}...`);
  await uploadJson(client, r2.endpoint, r2.bucketName, versionedKey, finalIgnore);
  console.log('  ✓ Versioned file uploaded');

  // Upload as latest
  const latestKey = `ignore/${datasetVersion}-ignore-latest.json`;
  console.log(`Uploading ${latestKey}...`);
  await uploadJson(client, r2.endpoint, r2.bucketName, latestKey, finalIgnore);
  console.log('  ✓ Latest file uploaded');

  console.log('\n✅ Ignore file uploaded successfully!');
  console.log(`\nVersion: ${versionStr}`);
  console.log(`Entries: ${ignoreCount}`);
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);

  let file = '';
  let datasetVersion = 'v1';
  let description = '';
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' || args[i] === '-f') {
      file = args[++i];
    } else if (args[i] === '--dataset-version' || args[i] === '-d') {
      datasetVersion = args[++i];
    } else if (args[i] === '--description') {
      description = args[++i];
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`Usage: upload-ignore.ts --file <path> [--dataset-version <v1>] [--description <text>] [--dry-run]

Options:
  --file, -f           Path to ignore.json file
  --dataset-version, -d  Dataset version to associate with (default: v1)
  --description        Description of changes in this version
  --dry-run            Show what would be uploaded without uploading

Environment:
  R2_ACCOUNT_ID        Cloudflare account ID
  R2_ACCESS_KEY_ID     R2 access key
  R2_SECRET_ACCESS_KEY R2 secret key
  R2_BUCKET_NAME       R2 bucket name (default: sabai-dataset)

Example ignore.json:
  {
    "ignore": {
      "228A9455_0": true,
      "228A9460_0": "wrong person"
    }
  }
`);
      process.exit(0);
    }
  }

  if (!file) {
    console.error('Error: --file is required');
    process.exit(1);
  }

  await uploadIgnore({ file, datasetVersion, description, dryRun });
}

main().catch((error) => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
