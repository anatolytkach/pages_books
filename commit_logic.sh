#!/usr/bin/env bash
set -euo pipefail

# Canonical project commit workflow.
# All requested commits must go through this script.
# It stages code/index/runtime changes, excludes content payloads,
# commits, and pushes to remote.

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

echo "[commit-logic] Staging code, indexes, and render/runtime files"

# Core logic and app sources
git add -A -- reader tests docs _worker.js .gitignore .wranglerignore
git add -A -- commit_logic.sh

# Docs are published from deploy/docs/index.html, so docs commits must include it.
git add -A -- deploy/docs/index.html

# Catalog/search/discovery indexes that drive Pages and R2 behavior
if [[ -d reader_lang_indexes ]]; then
  git add -A -- reader_lang_indexes
fi

# Config/entry points for books shell
git add -A -- books/index.html books/catalog.config.json

# Root UI assets used by app shell
git add -A -- '*.svg'

# Tooling scripts/configs only (no generated artifacts)
if [[ -d tools ]]; then
  while IFS= read -r -d '' f; do
    git add -A -- "$f"
  done < <(find tools -maxdepth 1 -type f \
    \( -name "*.py" -o -name "*.js" -o -name "*.mjs" -o -name "*.sh" -o -name "*.toml" \) -print0)
fi

# Explicitly keep data artifacts out of this commit even if staged before.
git reset -q -- \
  books/content \
  content \
  tools/__pycache__ \
  .wrangler \
  deploy

# deploy/ is generally generated and must stay out of commits,
# except for deploy/docs/index.html, which is the versioned docs publish source.
git add -A -- deploy/docs/index.html

if git diff --cached --quiet; then
  echo "[commit-logic] No staged logic changes to commit"
  exit 0
fi

echo "[commit-logic] Committing"
git commit -m "$MSG"

if git rev-parse --verify --quiet "@{upstream}" >/dev/null; then
  echo "[commit-logic] Pushing to upstream for $BRANCH"
  git push
else
  echo "[commit-logic] Pushing to origin/$BRANCH and setting upstream"
  git push --set-upstream origin "$BRANCH"
fi

echo "[commit-logic] Done"
