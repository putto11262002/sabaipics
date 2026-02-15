export function printHelp(message?: string) {
  if (message) {
    console.error(message);
    console.error('');
  }

  console.log(`Usage:
  eval run sabaiface --endpoint <url> --dataset <path> [flags]
  eval run aws --dataset <path> [flags]
  eval dataset generate --source <path> --output <path> [flags]

Commands:
  run              Run evaluation against a provider
  dataset generate Generate evaluation dataset from Kaggle source

Run Flags:
  --dataset <path>                 Path to index.json dataset file
  --max-results <n>                Max results returned per query (default: 20)
  --eval-ks <csv>                  Ks used for additional reporting (default: 10,20)
  --min-similarity <0..1>          Min similarity (default: 0.94 for aws, 0.4 for sabaiface)
  --min-similarity-list <csv>      Sweep values; appends a CSV row per value
  --fetch-multiplier <n>           Provider request multiplier (default: 1)
  --index-max-faces <n>            Index maxFaces (default: 100)
  --index-quality-filter <auto|none>  Index qualityFilter (default: auto)
  --index-subset <n>               Use only first N index images (for quick tests)
  --dry-run                        Load dataset + print planned config; no provider calls

Provider flags:
  sabaiface:
    --endpoint <url>               SabaiFace HTTP endpoint (or env SABAIFACE_ENDPOINT)
  aws:
    Uses env AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY

Dataset Generate Flags:
  --source <path>                  Kaggle dataset root directory
  --output <path>                  Output directory for generated dataset
  --people <n>                     Number of people to include (default: 100)
  --images <n>                     Selfies per person (default: 5)

Examples:
  # Generate dataset
  eval dataset generate --source /path/to/kaggle --output ./testimages

  # Run AWS evaluation
  eval run aws --dataset ./testimages/index.json

  # Run SabaiFace evaluation
  eval run sabaiface --dataset ./testimages/index.json --endpoint http://localhost:8080
`);
}
