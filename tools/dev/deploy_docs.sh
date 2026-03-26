#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

PROJECT_NAME="reader-books"
DOCS_BRANCH="master"
DEPLOY_DIR="$ROOT/deploy"
PAGES_ALIAS_URL="https://master.reader-books.pages.dev/docs/"
STAGING_URL="https://staging.reader.pub/docs/"

echo "[deploy-docs] Publishing docs for ${STAGING_URL}"
echo "[deploy-docs] Source branch target: ${DOCS_BRANCH} (served by docs gateway via ${PAGES_ALIAS_URL})"

if [[ ! -f "$ROOT/deploy/docs/index.html" ]]; then
  echo "[deploy-docs] Missing deploy/docs/index.html" >&2
  exit 1
fi

wrangler pages deploy "$DEPLOY_DIR" \
  --project-name "$PROJECT_NAME" \
  --branch "$DOCS_BRANCH" \
  --commit-dirty=true

echo "[deploy-docs] Done"
echo "[deploy-docs] Verify through:"
echo "  - ${PAGES_ALIAS_URL}"
echo "  - ${STAGING_URL}"
