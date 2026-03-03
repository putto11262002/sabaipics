#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
RULES_FILE="$ROOT_DIR/infra/observability/grafana/alerts/rules.json"

read_var() {
  local key="$1"
  local file="$2"
  grep -E "^${key}=" "$file" | tail -n1 | cut -d= -f2- || true
}

if [[ -f "$ROOT_DIR/.dev.vars" ]]; then
  DEV_VARS="$ROOT_DIR/.dev.vars"
else
  DEV_VARS=""
fi

GRAFANA_API_TOKEN="${GRAFANA_API_TOKEN:-}"
if [[ -z "$GRAFANA_API_TOKEN" && -n "$DEV_VARS" ]]; then
  GRAFANA_API_TOKEN="$(read_var GRAFANA_API_TOKEN "$DEV_VARS")"
fi
: "${GRAFANA_API_TOKEN:?GRAFANA_API_TOKEN is required (env or .dev.vars)}"

GRAFANA_URL="${GRAFANA_URL:-}"
if [[ -z "$GRAFANA_URL" && -n "$DEV_VARS" ]]; then
  GRAFANA_URL="$(read_var GRAFANA_URL "$DEV_VARS")"
fi
GRAFANA_URL="${GRAFANA_URL:-https://putto11262002.grafana.net}"

GRAFANA_FOLDER_UID="${GRAFANA_FOLDER_UID:-framefast-observability}"
PROM_DS_UID="${GRAFANA_PROM_DS_UID:-grafanacloud-prom}"
RULE_GROUP="${GRAFANA_ALERT_RULE_GROUP:-framefast-core}"

api() {
  local method="$1"
  local path="$2"
  local data="${3:-}"

  if [[ -n "$data" ]]; then
    curl -fsS -X "$method" \
      -H "Authorization: Bearer $GRAFANA_API_TOKEN" \
      -H "Content-Type: application/json" \
      -H "X-Disable-Provenance: true" \
      "$GRAFANA_URL$path" \
      -d "$data"
  else
    curl -fsS -X "$method" \
      -H "Authorization: Bearer $GRAFANA_API_TOKEN" \
      "$GRAFANA_URL$path"
  fi
}

echo "[grafana-alerts] stack: $GRAFANA_URL"
echo "[grafana-alerts] folder: $GRAFANA_FOLDER_UID"

if ! api GET "/api/folders/$GRAFANA_FOLDER_UID" >/dev/null 2>&1; then
  echo "[grafana-alerts] folder does not exist, run dashboard provisioning first" >&2
  exit 1
fi

existing_json="$(api GET "/api/v1/provisioning/alert-rules")"
managed_existing_titles="$(echo "$existing_json" | jq -r '.[] | select(.labels.managed_by == "framefast_observability") | .title')"
desired_titles="$(jq -r '.[].title' "$RULES_FILE")"

build_payload() {
  local rule_json="$1"
  local uid="${2:-}"
  local title expr op threshold rule_for severity service summary runbook rel_from
  title="$(echo "$rule_json" | jq -r '.title')"
  expr="$(echo "$rule_json" | jq -r '.expr')"
  op="$(echo "$rule_json" | jq -r '.op')"
  threshold="$(echo "$rule_json" | jq -r '.threshold')"
  rule_for="$(echo "$rule_json" | jq -r '.for')"
  severity="$(echo "$rule_json" | jq -r '.severity')"
  service="$(echo "$rule_json" | jq -r '.service')"
  summary="$(echo "$rule_json" | jq -r '.summary')"
  runbook="$(echo "$rule_json" | jq -r '.runbook')"
  rel_from="$(echo "$rule_json" | jq -r '.relativeFrom // 600')"

  jq -cn \
    --arg uid "$uid" \
    --arg title "$title" \
    --arg folderUID "$GRAFANA_FOLDER_UID" \
    --arg ruleGroup "$RULE_GROUP" \
    --arg ruleFor "$rule_for" \
    --arg datasourceUid "$PROM_DS_UID" \
    --arg expr "$expr" \
    --arg op "$op" \
    --argjson threshold "$threshold" \
    --argjson relFrom "$rel_from" \
    --arg severity "$severity" \
    --arg service "$service" \
    --arg summary "$summary" \
    --arg runbook "$runbook" \
    '{
      title: $title,
      ruleGroup: $ruleGroup,
      folderUID: $folderUID,
      noDataState: "NoData",
      execErrState: "Error",
      for: $ruleFor,
      condition: "B",
      annotations: {
        summary: $summary,
        runbook_path: $runbook
      },
      labels: {
        managed_by: "framefast_observability",
        severity: $severity,
        service: $service
      },
      data: [
        {
          refId: "A",
          queryType: "",
          relativeTimeRange: { from: $relFrom, to: 0 },
          datasourceUid: $datasourceUid,
          model: {
            editorMode: "code",
            expr: $expr,
            instant: true,
            intervalMs: 1000,
            maxDataPoints: 43200,
            refId: "A"
          }
        },
        {
          refId: "B",
          queryType: "",
          relativeTimeRange: { from: 0, to: 0 },
          datasourceUid: "__expr__",
          model: {
            type: "threshold",
            expression: "A",
            refId: "B",
            intervalMs: 1000,
            maxDataPoints: 43200,
            conditions: [
              {
                type: "query",
                query: { params: ["B"] },
                reducer: { type: "last", params: [] },
                evaluator: { type: $op, params: [$threshold] },
                operator: { type: "and" }
              }
            ]
          }
        }
      ]
    }
    | if $uid != "" then . + {uid: $uid} else . end'
}

while IFS= read -r rule; do
  title="$(echo "$rule" | jq -r '.title')"
  uid="$(echo "$existing_json" | jq -r --arg title "$title" '.[] | select(.title == $title and .labels.managed_by == "framefast_observability") | .uid' | head -n1)"

  payload="$(build_payload "$rule" "$uid")"

  if [[ -n "$uid" ]]; then
    echo "[grafana-alerts] update: $title"
    api PUT "/api/v1/provisioning/alert-rules/$uid" "$payload" >/dev/null
  else
    echo "[grafana-alerts] create: $title"
    api POST "/api/v1/provisioning/alert-rules" "$payload" >/dev/null
  fi
done < <(jq -c '.[]' "$RULES_FILE")

# Delete managed rules no longer present in desired set
while IFS= read -r existing_title; do
  [[ -z "$existing_title" ]] && continue
  if ! echo "$desired_titles" | grep -Fxq "$existing_title"; then
    uid="$(echo "$existing_json" | jq -r --arg title "$existing_title" '.[] | select(.title == $title and .labels.managed_by == "framefast_observability") | .uid' | head -n1)"
    if [[ -n "$uid" ]]; then
      echo "[grafana-alerts] delete: $existing_title"
      api DELETE "/api/v1/provisioning/alert-rules/$uid" >/dev/null
    fi
  fi
done <<< "$managed_existing_titles"

echo "[grafana-alerts] provisioned"
