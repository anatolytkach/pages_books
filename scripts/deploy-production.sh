#!/usr/bin/env bash
# Deploy current working tree to the production environment (reader.pub)
#
# Workflow:
#   1. Develop and test on 'develop' branch, deploy with deploy-staging.sh
#   2. When ready, merge develop → master and run this script
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="$ROOT_DIR/deploy"
ACCOUNT_ID="764a8c94ce002764fc1d3d29faa4bb09"
PROJECT="reader-books"

# Safety check: should be on master branch
BRANCH=$(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
if [[ "$BRANCH" != "master" ]]; then
  echo "WARNING: You are on branch '$BRANCH', not 'master'."
  read -rp "Continue anyway? [y/N] " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || exit 1
fi

echo "=== Deploying to PRODUCTION ($PROJECT) ==="
echo "Deploy dir: $DEPLOY_DIR"

CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID" \
  npx wrangler pages deploy "$DEPLOY_DIR" \
  --project-name "$PROJECT" \
  --branch production \
  --commit-dirty=true

echo "=== Production deploy complete ==="
echo "Live: https://reader.pub/books/"
