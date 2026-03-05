#!/usr/bin/env bash
set -euo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[commit-logic] Not inside a git repository" >&2
  exit 1
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if [[ $# -lt 1 ]]; then
  echo "Usage: ./commit_logic.sh \"commit message\""
  exit 1
fi

MSG="$1"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" == "HEAD" ]]; then
  echo "[commit-logic] Detached HEAD is not supported" >&2
  exit 1
fi

echo "[commit-logic] Staging only project logic files"

# Core logic and app sources
git add -A -- reader tests docs _worker.js .gitignore .wranglerignore
git add -A -- commit_logic.sh

# Config/entry points for catalog/books shells
git add -A -- catalog/index.html catalog/catalog.config.json
git add -A -- books/index.html books/catalog.config.json

# Root UI assets used by app shell
git add -A -- '*.svg'

# Tooling scripts/configs only (no generated artifacts)
if [[ -d tools ]]; then
  while IFS= read -r -d '' f; do
    git add -A -- "$f"
  done < <(find tools -maxdepth 1 -type f \
    \( -name "*.py" -o -name "*.js" -o -name "*.sh" -o -name "*.toml" \) -print0)
fi

# Explicitly keep data artifacts out of this commit even if staged before.
git reset -q -- \
  books/content \
  content \
  reader_lang_indexes \
  tools/__pycache__ \
  .wrangler \
  deploy

if git diff --cached --quiet; then
  echo "[commit-logic] No staged logic changes to commit"
  exit 0
fi

echo "[commit-logic] Committing"
git commit -m "$MSG"

echo "[commit-logic] Pushing to origin/$BRANCH"
git push origin "$BRANCH"

echo "[commit-logic] Done"
