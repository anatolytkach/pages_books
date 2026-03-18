#!/usr/bin/env bash
# Deploy current working tree to the staging environment (staging.reader.pub)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="$ROOT_DIR/deploy"
ACCOUNT_ID="764a8c94ce002764fc1d3d29faa4bb09"
PROJECT="readerpub-website-staging"

echo "=== Deploying to STAGING ($PROJECT) ==="
echo "Deploy dir: $DEPLOY_DIR"

CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID" \
  npx wrangler pages deploy "$DEPLOY_DIR" \
  --project-name "$PROJECT" \
  --branch staging \
  --commit-dirty=true

echo "=== Staging deploy complete ==="
echo "Preview: https://staging.reader.pub/books/"
