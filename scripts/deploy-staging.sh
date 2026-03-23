#!/usr/bin/env bash
# Deploy current working tree to the staging environment (books-staging.reader.pub)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="$ROOT_DIR/deploy"
ACCOUNT_ID="764a8c94ce002764fc1d3d29faa4bb09"
PROJECT="readerpub-books-staging"

echo "=== Deploying to STAGING ($PROJECT) ==="
echo "Deploy dir: $DEPLOY_DIR"

CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID" \
  npx wrangler pages deploy "$DEPLOY_DIR" \
  --project-name "$PROJECT" \
  --branch develop \
  --commit-dirty=true

echo "=== Staging deploy complete ==="
echo "Preview: https://books-staging.reader.pub/books/"
echo "Or: https://readerpub-books-staging.pages.dev/books/"
