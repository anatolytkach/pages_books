#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${PROJECT_NAME:-readerpub-books-staging}"
PAGES_BRANCH="${PAGES_BRANCH:-develop}"
CANONICAL_URL="${CANONICAL_URL:-https://books-staging.reader.pub/books/}"

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$repo_root" ]]; then
  echo "Could not determine repository root. Run this script from inside a Git worktree." >&2
  exit 1
fi

cd "$repo_root"

resolve_wrangler() {
  local candidate

  if [[ -n "${WRANGLER_BIN:-}" && -x "${WRANGLER_BIN:-}" ]]; then
    printf '%s\n' "$WRANGLER_BIN"
    return 0
  fi

  for candidate in \
    "$repo_root/reader_render_v3/node_modules/.bin/wrangler" \
    "$repo_root/node_modules/.bin/wrangler"; do
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  if command -v wrangler >/dev/null 2>&1; then
    command -v wrangler
    return 0
  fi

  return 1
}

copy_tree() {
  local source="$1"
  local destination="$2"
  shift 2

  if [[ ! -d "$source" ]]; then
    echo "Missing source path: $source" >&2
    exit 1
  fi

  mkdir -p "$destination"
  rsync -a --delete "$@" "$source/" "$destination/"
}

if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync is required for the macOS staging deploy script." >&2
  exit 1
fi

wrangler_path="$(resolve_wrangler || true)"
if [[ -z "$wrangler_path" ]]; then
  cat >&2 <<'EOF'
Could not find a Wrangler executable in this repo or PATH.
Checked WRANGLER_BIN, reader_render_v3/node_modules/.bin/wrangler,
root node_modules/.bin/wrangler, and PATH.
EOF
  exit 1
fi

source_branch="$(git branch --show-current)"
commit="$(git rev-parse HEAD)"
deploy_dir="$(mktemp -d "${TMPDIR:-/tmp}/readerpub-books-staging-deploy-XXXXXXXX")"

cleanup() {
  rm -rf "$deploy_dir"
}
trap cleanup EXIT

cp "$repo_root/_worker.js" "$deploy_dir/_worker.js"
copy_tree "$repo_root/api" "$deploy_dir/api"
copy_tree "$repo_root/publisher_tasks" "$deploy_dir/publisher_tasks"
copy_tree "$repo_root/books" "$deploy_dir/books" \
  --exclude='content/' \
  --exclude='gutenberg_protected_epub3_sources/'
copy_tree "$repo_root/reader" "$deploy_dir/reader"
copy_tree "$repo_root/reader1" "$deploy_dir/reader1"
copy_tree "$repo_root/reader_render_v3" "$deploy_dir/reader_render_v3" \
  --exclude='node_modules/' \
  --exclude='artifacts/'

if [[ -d "$repo_root/reader_render_v5" ]]; then
  copy_tree "$repo_root/reader_render_v5" "$deploy_dir/reader_render_v5" \
    --exclude='node_modules/' \
    --exclude='artifacts/'
fi

printf '[deploy-staging] Repo root: %s\n' "$repo_root"
printf '[deploy-staging] Branch: %s\n' "$source_branch"
printf '[deploy-staging] Commit: %s\n' "$commit"
printf '[deploy-staging] Wrangler: %s\n' "$wrangler_path"
printf '[deploy-staging] Bundle: %s\n' "$deploy_dir"

deploy_output="$("$wrangler_path" pages deploy "$deploy_dir" \
  --project-name "$PROJECT_NAME" \
  --branch "$PAGES_BRANCH" \
  --commit-dirty=true 2>&1)"
printf '%s\n' "$deploy_output"

preview_url="$(printf '%s\n' "$deploy_output" | grep -Eo 'https://[A-Za-z0-9.-]+\.pages\.dev' | tail -n 1 || true)"
if [[ -z "$preview_url" ]]; then
  echo "Wrangler deploy succeeded but no Pages preview URL was found in the output." >&2
  exit 1
fi

node "$repo_root/tools/deploy/record-deployment.mjs" \
  --environment staging \
  --project "$PROJECT_NAME" \
  --pages-branch "$PAGES_BRANCH" \
  --source-branch "$source_branch" \
  --commit "$commit" \
  --url "$CANONICAL_URL" \
  --deployment-url "$preview_url"

printf '[deploy-staging] Canonical URL: %s\n' "$CANONICAL_URL"
printf '[deploy-staging] Preview URL: %s\n' "$preview_url"
