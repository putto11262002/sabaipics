import { spawn } from 'node:child_process';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import type { DatasetGenerateCommand } from './cli/parse.ts';
import { findRepoRoot } from './repo.ts';

/**
 * Run dataset generation by wrapping the existing Python script.
 *
 * The Python script uses numpy to parse .npy files from the Kaggle dataset,
 * which makes pure TypeScript porting impractical. Instead, we call the
 * Python script and capture its output.
 */
export async function runDatasetGenerate(cmd: DatasetGenerateCommand): Promise<void> {
  const repoRoot = await findRepoRoot();

  // Resolve paths
  const sourcePath = path.isAbsolute(cmd.source) ? cmd.source : path.resolve(repoRoot, cmd.source);
  const outputPath = path.isAbsolute(cmd.output)
    ? cmd.output
    : path.resolve(process.cwd(), cmd.output);

  // Check source exists
  try {
    const stat = await fs.stat(sourcePath);
    if (!stat.isDirectory()) {
      throw new Error(`Source path is not a directory: ${sourcePath}`);
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `Kaggle dataset not found at: ${sourcePath}\n\nDownload from: https://www.kaggle.com/datasets/hereisburak/pins-face-recognition`,
      );
    }
    throw e;
  }

  // Create output directory if needed
  const outputDir = path.dirname(outputPath);
  await fs.mkdir(outputDir, { recursive: true });

  // Find the Python script
  const pythonScript = path.join(repoRoot, 'apps/sabaiface/scripts/extract-recognition-dataset.py');

  try {
    await fs.access(pythonScript);
  } catch {
    throw new Error(`Python script not found: ${pythonScript}`);
  }

  console.log('Dataset Generation');
  console.log('==================');
  console.log(`Source:  ${sourcePath}`);
  console.log(`Output:  ${outputPath}`);
  console.log(`People:  ${cmd.people}`);
  console.log(`Images:  ${cmd.images}`);
  console.log(
    `Ratio:   ${(cmd.ratio * 100).toFixed(0)}% index / ${((1 - cmd.ratio) * 100).toFixed(0)}% query`,
  );
  console.log(`Seed:    ${cmd.seed}`);
  console.log('');

  // We need to modify the Python script to accept --output, or we can do the following:
  // Run the Python script and then move/copy the output file
  // For now, let's just invoke the Python script and then read + write the output ourselves

  // Actually, let's just call the Python script directly and let it write to its default location,
  // then copy to the desired output path. The Python script writes to:
  // apps/sabaiface/tests/fixtures/eval/dataset/recognition/ground-truth.local.json

  const defaultOutputPath = path.join(
    repoRoot,
    'apps/sabaiface/tests/fixtures/eval/dataset/recognition/ground-truth.local.json',
  );

  const args = [
    pythonScript,
    '--dataset',
    sourcePath,
    '--people',
    String(cmd.people),
    '--images',
    String(cmd.images),
    '--ratio',
    String(cmd.ratio),
    '--seed',
    String(cmd.seed),
  ];

  console.log('Running Python script...');
  console.log('');

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('python3', args, {
      stdio: 'inherit',
      cwd: path.join(repoRoot, 'apps/sabaiface'),
    });

    proc.on('error', (err) => {
      reject(
        new Error(
          `Failed to start Python: ${err.message}\n\nMake sure python3 and numpy are installed.`,
        ),
      );
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Python script exited with code ${code}`));
      }
    });
  });

  // Copy to desired output location if different
  if (path.resolve(outputPath) !== path.resolve(defaultOutputPath)) {
    console.log('');
    console.log(`Copying to: ${outputPath}`);
    await fs.copyFile(defaultOutputPath, outputPath);
  }

  console.log('');
  console.log('Done! Use this file with:');
  console.log(`  eval run sabaiface --dataset ${outputPath}`);
  console.log(`  eval run aws --dataset ${outputPath}`);
}
