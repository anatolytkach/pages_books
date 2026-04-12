#!/usr/bin/env bash
# Deploy current working tree to the staging environment (books-staging.reader.pub)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="$(mktemp -d "${TMPDIR:-/tmp}/readerpub-staging-deploy.XXXXXX")"
ACCOUNT_ID="764a8c94ce002764fc1d3d29faa4bb09"
PROJECT="readerpub-books-staging"
WRANGLER_BIN="${WRANGLER_BIN:-npx wrangler}"

trap 'rm -rf "$DEPLOY_DIR"' EXIT

"$SCRIPT_DIR/build-deploy-bundle.sh" "$DEPLOY_DIR"

BRANCH=$(git -c safe.directory="$ROOT_DIR" -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
COMMIT=$(git -c safe.directory="$ROOT_DIR" -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || echo "unknown")
STAGING_URL="https://books-staging.reader.pub/books/"

echo "=== Deploying to STAGING ($PROJECT) ==="
echo "Deploy dir: $DEPLOY_DIR"

CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID" \
  sh -c "\"$WRANGLER_BIN\" pages deploy \"$DEPLOY_DIR\" --project-name \"$PROJECT\" --branch develop --commit-dirty=true"

node "$ROOT_DIR/tools/deploy/record-deployment.mjs" \
  --environment staging \
  --project "$PROJECT" \
  --pages-branch develop \
  --source-branch "$BRANCH" \
  --commit "$COMMIT" \
  --url "$STAGING_URL"

echo "=== Staging deploy complete ==="
echo "Preview: $STAGING_URL"
echo "Or: https://readerpub-books-staging.pages.dev/books/"
