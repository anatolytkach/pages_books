#!/usr/bin/env bash
# Recreate Windows symlinks in the deploy/ directory.
# Run this once after cloning on a new machine.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/../deploy" && pwd)"

cd "$DEPLOY_DIR"

# Remove stale files/symlinks
rm -f books reader catalog _worker.js 2>/dev/null || true

# Create directory symlinks
cmd //c "mklink /D books ..\\books"
cmd //c "mklink /D reader ..\\reader"
cmd //c "mklink /D catalog ..\\catalog"

# Create file symlink
cmd //c "mklink _worker.js ..\\_worker.js"

echo "Deploy symlinks created successfully."
ls -la "$DEPLOY_DIR"
