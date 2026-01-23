export function printHelp(message?: string) {
  if (message) {
    console.error(message);
    console.error('');
  }

  console.log(`Usage:
  eval run sabaiface --endpoint <url> [flags]
  eval run aws [flags]
  eval dataset generate --source <path> [flags]

Commands:
  run              Run evaluation against a provider
  dataset generate Generate ground-truth JSON from Kaggle dataset

Run Flags:
  --dataset <path>                 Ground-truth JSON file path
  --max-results <n>                Max results returned per query (default: 20)
  --eval-ks <csv>                  Ks used for additional reporting (default: 10,20)
  --min-similarity <0..1>          Min similarity (default: 0.94 for aws, 0.4 for sabaiface)
  --min-similarity-list <csv>      Sweep values; appends a CSV row per value
  --fetch-multiplier <n>           Provider request multiplier (default: 1)
  --index-max-faces <n>            Index maxFaces (default: 100)
  --index-quality-filter <auto|none>  Index qualityFilter (default: auto)
  --dry-run                        Load dataset + print planned config; no provider calls

Provider flags:
  sabaiface:
    --endpoint <url>               SabaiFace HTTP endpoint (or env SABAIFACE_ENDPOINT)
  aws:
    Uses env AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY

Dataset Generate Flags:
  --source <path>                  Kaggle dataset root (or env SABAIFACE_DATASET_PATH)
  --output <path>                  Output JSON path (default: ground-truth.json)
  --people <n>                     Number of people to include (default: 10)
  --images <n>                     Images per person (default: 10)
  --ratio <0-1>                    Index/query ratio (default: 0.8 = 80% index)
  --seed <n>                       Random seed for reproducibility (default: 42)
`);
}
