import { promises as fs } from 'node:fs';
import path from 'node:path';

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
