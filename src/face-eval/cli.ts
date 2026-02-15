#!/usr/bin/env node

import dotenv from 'dotenv';

import { parseCli } from './cli/parse.ts';
import { printHelp } from './cli/help.ts';
import { runEval } from './run-eval.ts';
import { runDatasetGenerate } from './dataset-generate.ts';

dotenv.config();

async function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) {
    printHelp();
    return;
  }

  const parsed = parseCli(argv);
  if ('type' in parsed) {
    printHelp(parsed.message);
    return;
  }

  if (parsed.command === 'dataset') {
    await runDatasetGenerate(parsed);
    return;
  }

  if (parsed.command === 'run') {
    await runEval(parsed);
    return;
  }

  // Exhaustive check
  const _exhaustive: never = parsed;
  printHelp(`Unknown command: ${(_exhaustive as { command: string }).command}`);
  process.exitCode = 2;
}

main().catch((e) => {
  // Keep output minimal and actionable.
  const msg = e instanceof Error ? e.stack || e.message : String(e);
  console.error(msg);
  process.exit(1);
});
