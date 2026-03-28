#!/usr/bin/env bash
# Recreate Windows symlinks in the deploy/ directory.
# Run this once after cloning on a new machine.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/../deploy" && pwd)"
CMD_EXE="${COMSPEC:-/mnt/c/Windows/System32/cmd.exe}"

cd "$DEPLOY_DIR"

# Remove stale files/symlinks
rm -f books reader catalog _worker.js 2>/dev/null || true

# Create directory symlinks
"$CMD_EXE" //c "mklink /D books ..\\books"
"$CMD_EXE" //c "mklink /D reader ..\\reader"

# Create file symlink
"$CMD_EXE" //c "mklink _worker.js ..\\_worker.js"

echo "Deploy symlinks created successfully."
echo "Note: deploy/catalog is intentionally not recreated; books/index.html is the live catalog."
ls -la "$DEPLOY_DIR"
