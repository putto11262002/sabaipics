import { spawn } from 'node:child_process';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import type { DatasetGenerateCommand } from './cli/parse.ts';
import { getPackageRoot } from './repo.ts';

/**
 * Run dataset generation using the Python script.
 *
 * The Python script uses numpy/opencv to parse .npz files from the Kaggle dataset,
 * which makes pure TypeScript porting impractical.
 */
export async function runDatasetGenerate(cmd: DatasetGenerateCommand): Promise<void> {
  const packageRoot = getPackageRoot();

  // Resolve paths
  const sourcePath = path.isAbsolute(cmd.source)
    ? cmd.source
    : path.resolve(process.cwd(), cmd.source);
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
  await fs.mkdir(outputPath, { recursive: true });

  // Find the Python script relative to package root
  const pythonScript = path.join(packageRoot, 'scripts', 'generate-eval-dataset.py');

  try {
    await fs.access(pythonScript);
  } catch {
    throw new Error(
      `Python script not found: ${pythonScript}\n\nExpected at: packages/face-eval/scripts/generate-eval-dataset.py`,
    );
  }

  console.log('Dataset Generation');
  console.log('==================');
  console.log(`Source:  ${sourcePath}`);
  console.log(`Output:  ${outputPath}`);
  console.log(`People:  ${cmd.people}`);
  console.log(`Images:  ${cmd.images}`);
  console.log('');

  const args = [
    pythonScript,
    '--dataset',
    sourcePath,
    '--output',
    outputPath,
    '--num-people',
    String(cmd.people),
    '--selfies-per-person',
    String(cmd.images),
    '--min-images',
    String(Math.max(cmd.images + 10, 20)), // Need enough for selfies + index
  ];

  console.log('Running Python script...');
  console.log(`  python3 ${args.slice(1).join(' ')}`);
  console.log('');

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('python3', args, {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    proc.on('error', (err) => {
      reject(
        new Error(
          `Failed to start Python: ${err.message}\n\nMake sure python3, numpy, opencv-python, and pillow are installed.`,
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

  const indexJsonPath = path.join(outputPath, 'index.json');

  console.log('');
  console.log('Done! Generated dataset at:');
  console.log(`  ${outputPath}/`);
  console.log('');
  console.log('Use with eval:');
  console.log(`  pnpm --filter @sabaipics/face-eval eval run aws --dataset ${indexJsonPath}`);
  console.log(
    `  pnpm --filter @sabaipics/face-eval eval run sabaiface --dataset ${indexJsonPath} --endpoint <url>`,
  );
}
