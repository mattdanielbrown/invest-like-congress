#!/usr/bin/env bash

set -euo pipefail

usage() {
	echo "Usage: HOSTED_BASE_URL=<url> DATABASE_URL=<postgres-url> $0 [HOSTED_BASE_URL] [DATABASE_URL]" >&2
	echo "Example: HOSTED_BASE_URL=https://congress-portfolio-web.onrender.com DATABASE_URL=postgres://... $0" >&2
}

HOSTED_BASE_URL="${1:-${HOSTED_BASE_URL:-}}"
DATABASE_URL_INPUT="${2:-${DATABASE_URL:-}}"

if [ -z "$HOSTED_BASE_URL" ] || [ -z "$DATABASE_URL_INPUT" ]; then
	echo "error: HOSTED_BASE_URL and DATABASE_URL are required." >&2
	usage
	exit 1
fi

VERIFY_OUTPUT="$(HOSTED_BASE_URL="$HOSTED_BASE_URL" DATABASE_URL="$DATABASE_URL_INPUT" ./scripts/ops/verify-hosted-m5.sh)"
printf '%s\n' "$VERIFY_OUTPUT"

ARTIFACT_TEXT="$(printf '%s\n' "$VERIFY_OUTPUT" | awk -F '=' '/^artifact_text=/{print $2}')"
ARTIFACT_JSON="$(printf '%s\n' "$VERIFY_OUTPUT" | awk -F '=' '/^artifact_json=/{print $2}')"
STATUS_JSON="$(printf '%s\n' "$VERIFY_OUTPUT" | awk -F '=' '/^status_json=/{print $2}')"

if [ -z "$ARTIFACT_TEXT" ] || [ -z "$ARTIFACT_JSON" ] || [ -z "$STATUS_JSON" ]; then
	echo "error: verification output missing artifact paths." >&2
	echo "recovery: re-run verification and ensure artifact_* lines are present." >&2
	exit 1
fi

SNAPSHOT_DATE="$(date -u +"%Y-%m-%d")"
TARGET_DIR="docs/operations/evidence/milestone-5/${SNAPSHOT_DATE}"
mkdir -p "$TARGET_DIR"

cp "$ARTIFACT_TEXT" "$TARGET_DIR/"
cp "$ARTIFACT_JSON" "$TARGET_DIR/"
cp "$STATUS_JSON" "$TARGET_DIR/"

echo "archived_dir=${TARGET_DIR}"
echo "archived_text=${TARGET_DIR}/$(basename "$ARTIFACT_TEXT")"
echo "archived_json=${TARGET_DIR}/$(basename "$ARTIFACT_JSON")"
echo "archived_status=${TARGET_DIR}/$(basename "$STATUS_JSON")"
