import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GitInfo {
  sha: string | null;
  branch: string | null;
}

async function git(args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', args, { timeout: 3000 });
    const v = String(stdout).trim();
    return v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export async function getGitInfo(): Promise<GitInfo> {
  const sha = await git(['rev-parse', 'HEAD']);
  const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
  return { sha, branch };
}
