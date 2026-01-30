#!/usr/bin/env bash
set -euo pipefail

GHCR_USER="${GHCR_USER:-putto11262002}"
GHCR_TOKEN="${GHCR_TOKEN:-}"

if [[ -z "${GHCR_TOKEN}" ]]; then
  echo "GHCR_TOKEN is required" >&2
  exit 1
fi

echo "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USER}" --password-stdin

cd /opt/sabaipics-ftp
docker compose pull
docker compose up -d
