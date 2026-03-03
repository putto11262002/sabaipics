#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"

if [[ -f "$ROOT_DIR/.dev.vars" ]]; then
  set -a
  source "$ROOT_DIR/.dev.vars"
  set +a
fi

: "${GRAFANA_API_TOKEN:?GRAFANA_API_TOKEN is required (set in .dev.vars)}"

GRAFANA_URL="${GRAFANA_URL:-https://putto11262002.grafana.net}"
GRAFANA_FOLDER_UID="${GRAFANA_FOLDER_UID:-framefast-observability}"
GRAFANA_FOLDER_TITLE="${GRAFANA_FOLDER_TITLE:-FrameFast / Observability}"

DASHBOARD_DIR="$ROOT_DIR/infra/observability/grafana/dashboards"

api() {
  local method="$1"
  local path="$2"
  local data="${3:-}"

  if [[ -n "$data" ]]; then
    curl -fsS -X "$method" \
      -H "Authorization: Bearer $GRAFANA_API_TOKEN" \
      -H "Content-Type: application/json" \
      "$GRAFANA_URL$path" \
      -d "$data"
  else
    curl -fsS -X "$method" \
      -H "Authorization: Bearer $GRAFANA_API_TOKEN" \
      "$GRAFANA_URL$path"
  fi
}

echo "[grafana] stack: $GRAFANA_URL"
echo "[grafana] ensuring folder: $GRAFANA_FOLDER_UID"

if ! api GET "/api/folders/$GRAFANA_FOLDER_UID" >/dev/null 2>&1; then
  create_folder_payload="$(jq -cn \
    --arg uid "$GRAFANA_FOLDER_UID" \
    --arg title "$GRAFANA_FOLDER_TITLE" \
    '{uid: $uid, title: $title}')"
  api POST "/api/folders" "$create_folder_payload" >/dev/null
  echo "[grafana] folder created"
else
  echo "[grafana] folder exists"
fi

for dashboard_file in "$DASHBOARD_DIR"/*.json; do
  echo "[grafana] provisioning: $(basename "$dashboard_file")"
  payload="$(jq -c \
    --arg folderUid "$GRAFANA_FOLDER_UID" \
    '{dashboard: ., folderUid: $folderUid, overwrite: true, message: "Provisioned by infra/observability/grafana/scripts/provision.sh"}' \
    "$dashboard_file")"
  api POST "/api/dashboards/db" "$payload" >/dev/null
  echo "[grafana] ok: $(basename "$dashboard_file")"
done

echo "[grafana] all dashboards provisioned"

if [[ "${PROVISION_ALERTS:-1}" == "1" ]]; then
  echo "[grafana] provisioning alert rules"
  "$ROOT_DIR/infra/observability/grafana/scripts/provision-alerts.sh"
else
  echo "[grafana] alert provisioning skipped (PROVISION_ALERTS=0)"
fi
