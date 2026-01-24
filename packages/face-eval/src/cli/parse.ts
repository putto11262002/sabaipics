import { parseArgs } from 'node:util';

export type ProviderName = 'sabaiface' | 'aws';

export interface RunCommand {
  command: 'run';
  provider: ProviderName;
  dataset: string;
  endpoint?: string;
  maxResults: number;
  evalKs: number[];
  minSimilarity?: number;
  minSimilarityList: number[];
  fetchMultiplier: number;
  indexMaxFaces: number;
  indexQualityFilter: 'auto' | 'none';
  indexSubset?: number; // Optional: limit index to first N images for quick tests
  dryRun: boolean;
}

export interface DatasetGenerateCommand {
  command: 'dataset';
  subcommand: 'generate';
  source: string;
  output: string;
  people: number;
  images: number;
  ratio: number;
  seed: number;
}

export type ParsedCli = RunCommand | DatasetGenerateCommand | { type: 'help'; message?: string };

function parseCsvNumbers(value: string): number[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => Number.parseFloat(v))
    .filter((n) => Number.isFinite(n));
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function parseDatasetCommand(argv: string[]): ParsedCli {
  const [subcommand, ...rest] = argv;

  if (subcommand !== 'generate') {
    return { type: 'help', message: `Unknown dataset subcommand: ${subcommand ?? '(none)'}` };
  }

  const { values } = parseArgs({
    args: rest,
    options: {
      source: { type: 'string' },
      output: { type: 'string' },
      people: { type: 'string' },
      images: { type: 'string' },
      ratio: { type: 'string' },
      seed: { type: 'string' },
      help: { type: 'boolean' },
      h: { type: 'boolean' },
    },
    allowPositionals: true,
  });

  if (values.help || values.h) return { type: 'help' };

  const source = values.source || process.env.SABAIFACE_DATASET_PATH;
  if (!source) {
    return {
      type: 'help',
      message: '--source is required (or set SABAIFACE_DATASET_PATH env var)',
    };
  }

  const output = values.output || 'ground-truth.json';
  const people = Math.max(1, Number.parseInt(values.people ?? '10', 10));
  const images = Math.max(1, Number.parseInt(values.images ?? '10', 10));
  const ratio = Math.max(0.1, Math.min(0.99, Number.parseFloat(values.ratio ?? '0.8')));
  const seed = Number.parseInt(values.seed ?? '42', 10);

  return {
    command: 'dataset',
    subcommand: 'generate',
    source,
    output,
    people,
    images,
    ratio,
    seed,
  };
}

export function parseCli(argv: string[]): ParsedCli {
  const [command, ...rest] = argv;

  if (!command) return { type: 'help' };

  if (command === 'dataset') {
    return parseDatasetCommand(rest);
  }

  if (command !== 'run') return { type: 'help', message: `Unknown command: ${command}` };

  const [provider, ...runRest] = rest;

  if (provider !== 'sabaiface' && provider !== 'aws') {
    return { type: 'help', message: `Unknown provider: ${provider ?? ''}` };
  }

  const { values } = parseArgs({
    args: runRest,
    options: {
      dataset: { type: 'string' },
      endpoint: { type: 'string' },
      'max-results': { type: 'string' },
      'eval-ks': { type: 'string' },
      'min-similarity': { type: 'string' },
      'min-similarity-list': { type: 'string' },
      'fetch-multiplier': { type: 'string' },
      'index-max-faces': { type: 'string' },
      'index-quality-filter': { type: 'string' },
      'index-subset': { type: 'string' },
      'dry-run': { type: 'boolean' },
      help: { type: 'boolean' },
      h: { type: 'boolean' },
    },
    allowPositionals: true,
  });

  if (values.help || values.h) return { type: 'help' };

  const dataset = values.dataset;
  if (!dataset) return { type: 'help', message: '--dataset is required' };

  const maxResults = Math.max(1, Number.parseInt(values['max-results'] ?? '20', 10));
  const evalKs = Array.from(
    new Set(
      parseCsvNumbers(values['eval-ks'] ?? '10,20')
        .map((n) => Math.max(1, Math.floor(n)))
        .map((n) => Math.min(n, maxResults)),
    ),
  ).sort((a, b) => a - b);

  const minSimilarityDefault = provider === 'aws' ? 0.94 : 0.4;
  const minSimilarity = values['min-similarity']
    ? clamp01(Number.parseFloat(values['min-similarity']))
    : undefined;
  const minSimilarityList = values['min-similarity-list']
    ? parseCsvNumbers(values['min-similarity-list']).map(clamp01)
    : [];

  const fetchMultiplier = Math.max(1, Number.parseInt(values['fetch-multiplier'] ?? '1', 10));
  const indexMaxFaces = Math.max(1, Number.parseInt(values['index-max-faces'] ?? '100', 10));
  const indexSubset = values['index-subset']
    ? Math.max(1, Number.parseInt(values['index-subset'], 10))
    : undefined;
  const indexQualityFilterRaw = String(values['index-quality-filter'] ?? 'auto');
  if (indexQualityFilterRaw !== 'auto' && indexQualityFilterRaw !== 'none') {
    return {
      type: 'help',
      message: `--index-quality-filter must be 'auto' or 'none' (got '${indexQualityFilterRaw}')`,
    };
  }

  return {
    command: 'run',
    provider,
    dataset,
    endpoint: values.endpoint,
    maxResults,
    evalKs,
    minSimilarity:
      minSimilarity ?? (minSimilarityList.length > 0 ? undefined : minSimilarityDefault),
    minSimilarityList,
    fetchMultiplier,
    indexMaxFaces,
    indexQualityFilter: indexQualityFilterRaw,
    indexSubset,
    dryRun: Boolean(values['dry-run']),
  };
}
