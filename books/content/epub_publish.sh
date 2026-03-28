#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONTENT_DIR="$SCRIPT_DIR"
INDEX_TOOL="$ROOT_DIR/tools/catalog/build_lang_indexes.py"
BOOK_LOCATIONS_TOOL="$ROOT_DIR/tools/catalog/build_book_locations.py"
INDEX_DIR="$ROOT_DIR/reader_lang_indexes"
DEPLOY_DIR="$ROOT_DIR/deploy"

WRANGLER_BIN="${WRANGLER_BIN:-wrangler}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
R2_BUCKET="${EPUB_PUBLISH_R2_BUCKET:-reader-books}"
PAGES_PROJECT="${EPUB_PUBLISH_PAGES_PROJECT:-reader-books}"
PAGES_BRANCH="${EPUB_PUBLISH_PAGES_BRANCH:-}"

DRY_RUN=0
SKIP_IMAGE_UPLOAD=0

usage() {
  cat <<USAGE
Usage:
  $(basename "$0") upload-ids <id1> [id2 ...] [--no-image-upload] [--dry-run]
  $(basename "$0") upload-ids <id1,id2,id3> [--no-image-upload] [--dry-run]
  $(basename "$0") reindex-ids <id1> [id2 ...] [--dry-run]
  $(basename "$0") reindex-ids <id1,id2,id3> [--dry-run]

What it does:
  upload-ids
    1) Takes existing unpacked folders from $CONTENT_DIR/<id>
    2) Uploads selected books to R2: content/<id>/...
    3) Rebuilds catalog indexes for selected ids
    4) Uploads only related catalog index files to R2: api/...
    5) Deploys $DEPLOY_DIR to Cloudflare Pages project '$PAGES_PROJECT'

  reindex-ids
    1) Uses existing unpacked folders from $CONTENT_DIR/<id>
    2) Rebuilds catalog indexes for selected ids
    3) Uploads only related catalog index files to R2: api/...
    4) Deploys $DEPLOY_DIR to Cloudflare Pages project '$PAGES_PROJECT'

Notes:
  - If content/<id>/... already exists on R2, it is replaced in-place.
  - Catalog update is incremental via tools/catalog/build_lang_indexes.py --book-id <id>.
  - book-locations.json and shard files are rebuilt after catalog index updates.
  - Option --no-image-upload skips uploading image files from books.
    Existing images in R2 remain unchanged.
USAGE
}

log() {
  printf '[epub-publish] %s\n' "$*"
}

die() {
  printf '[epub-publish] ERROR: %s\n' "$*" >&2
  exit 1
}

run_cmd() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '[dry-run]'
    for arg in "$@"; do
      printf ' %q' "$arg"
    done
    printf '\n'
    return 0
  fi
  "$@"
}

wrangler_r2_put_with_retry() {
  local object_path="$1"
  local file_path="$2"
  local max_attempts=8
  local attempt=1
  local delay=2

  if [[ "$DRY_RUN" -eq 1 ]]; then
    run_cmd "$WRANGLER_BIN" r2 object put "$object_path" --file "$file_path" --remote
    return 0
  fi

  while true; do
    if "$WRANGLER_BIN" r2 object put "$object_path" --file "$file_path" --remote; then
      return 0
    fi
    if (( attempt >= max_attempts )); then
      die "R2 upload failed after $max_attempts attempts: $object_path"
    fi
    log "R2 upload failed (attempt $attempt/$max_attempts): $object_path; retry in ${delay}s"
    sleep "$delay"
    attempt=$((attempt + 1))
    if (( delay < 20 )); then
      delay=$((delay * 2))
      if (( delay > 20 )); then
        delay=20
      fi
    fi
  done
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

is_image_file() {
  local file="$1"
  local lower
  lower="$(printf '%s' "${file##*/}" | tr '[:upper:]' '[:lower:]')"
  case "$lower" in
    *.jpg|*.jpeg|*.png|*.gif|*.webp|*.bmp|*.svg|*.tif|*.tiff|*.avif)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

upload_dir_to_r2_prefix() {
  local local_dir="$1"
  local r2_prefix="$2"
  local file rel key

  [[ -d "$local_dir" ]] || die "Directory not found: $local_dir"

  while IFS= read -r -d '' file; do
    if [[ "$SKIP_IMAGE_UPLOAD" -eq 1 ]] && is_image_file "$file"; then
      continue
    fi
    rel="${file#"$local_dir"/}"
    key="$r2_prefix/$rel"
    wrangler_r2_put_with_retry "$R2_BUCKET/$key" "$file"
  done < <(find "$local_dir" -type f -print0)
}

rebuild_catalog_indexes_for_ids() {
  local -a ids=("$@")
  local id

  [[ -f "$INDEX_TOOL" ]] || die "Index builder not found: $INDEX_TOOL"

  for id in "${ids[@]}"; do
    log "Rebuilding catalog indexes for book id: $id"
    run_cmd "$PYTHON_BIN" "$INDEX_TOOL" \
      --input "$CONTENT_DIR" \
      --output "$INDEX_DIR" \
      --book-id "$id"
  done
}

rebuild_book_locations() {
  [[ -f "$BOOK_LOCATIONS_TOOL" ]] || die "Book locations builder not found: $BOOK_LOCATIONS_TOOL"
  log "Rebuilding book-locations indexes"
  run_cmd "$PYTHON_BIN" "$BOOK_LOCATIONS_TOOL" --index-root "$INDEX_DIR"
}

shard_for_reader_id() {
  local raw="$1"
  if [[ "$raw" =~ ^[0-9]+$ ]]; then
    printf '%02d\n' "$((10#$raw % 100))"
    return
  fi
  "$PYTHON_BIN" - "$raw" <<'PY'
import sys
raw = str(sys.argv[1] or "").strip()
total = 0
for char in raw:
    total = (total + ord(char)) % 100
print(f"{total:02d}")
PY
}

json_get_author_tokens() {
  local author_file="$1"
  "$PYTHON_BIN" - "$author_file" <<'PY'
import json, re, sys, unicodedata

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    data = json.load(f)

def clean_text(value: str) -> str:
    return " ".join(str(value or "").split())

def strip_diacritics(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")

def normalize_search_match(value: str) -> str:
    return strip_diacritics(clean_text(value)).lower()

def normalize_search_token(value: str) -> str:
    base = normalize_search_match(value)
    base = re.sub(r"[^\w]+", "", base, flags=re.UNICODE).replace("_", "")
    return base[:3] if len(base) >= 3 else ""

name = str(data.get("name") or "").strip()
books = data.get("books") or []
tokens = set()
token = normalize_search_token(name)
if token:
    tokens.add(token)
for book in books:
    token = normalize_search_token(book.get("title") or "")
    if token:
        tokens.add(token)
for token in sorted(tokens):
    print(token)
PY
}

verify_selective_index_consistency() {
  local list_file="$1"
  shift
  local -a ids=("$@")
  local tmp_authors tmp_listed author_file lang key search_file
  local file rel

  [[ -f "$list_file" ]] || die "Selective list not found: $list_file"

  tmp_authors="$(mktemp)"
  tmp_listed="$(mktemp)"
  : > "$tmp_authors"
  sort -u "$list_file" > "$tmp_listed"
  trap 'rm -f "${selective_list_file:-}" "${tmp_authors:-}" "${tmp_listed:-}"' EXIT

  for id in "${ids[@]}"; do
    rg -l "\"id\"\\s*:\\s*\"$id\"" "$INDEX_DIR/a" "$INDEX_DIR/lang" -S 2>/dev/null >> "$tmp_authors" || true
  done

  sort -u "$tmp_authors" | while IFS= read -r author_file; do
    [[ -n "$author_file" ]] || continue
    if [[ "$author_file" =~ ^$INDEX_DIR/a/([^/]+)\.json$ ]]; then
      lang="all"
      key="${BASH_REMATCH[1]}"
    elif [[ "$author_file" =~ ^$INDEX_DIR/lang/([^/]+)/a/([^/]+)\.json$ ]]; then
      lang="${BASH_REMATCH[1]}"
      key="${BASH_REMATCH[2]}"
    else
      continue
    fi

    if ! rg -Fxq -- "$author_file" "$tmp_listed"; then
      die "Selective publish list missed author file: $author_file"
    fi

    while IFS= read -r token; do
      [[ -n "$token" ]] || continue
      search_file="$INDEX_DIR/search/$token.json"
      [[ -f "$search_file" ]] || die "Missing search index file for author '$key': $search_file"
      rg -Fxq -- "$search_file" "$tmp_listed" || die "Selective publish list missed search file for author '$key': $search_file"
    done < <(json_get_author_tokens "$author_file")
  done
}

build_selective_index_upload_list() {
  local out_file="$1"
  shift
  local -a ids=("$@")
  local tmp_files tmp_authors
  local id file key lang prefix token i

  tmp_files="$(mktemp)"
  tmp_authors="$(mktemp)"
  : > "$tmp_files"
  : > "$tmp_authors"

  [[ -f "$INDEX_DIR/letters.json" ]] && echo "$INDEX_DIR/letters.json" >> "$tmp_files"
  [[ -f "$INDEX_DIR/languages.json" ]] && echo "$INDEX_DIR/languages.json" >> "$tmp_files"
  [[ -f "$INDEX_DIR/book-locations.json" ]] && echo "$INDEX_DIR/book-locations.json" >> "$tmp_files"

  for id in "${ids[@]}"; do
    local legacy_shard
    legacy_shard="$(shard_for_reader_id "$id")"
    [[ -f "$INDEX_DIR/book-locations/$legacy_shard.json" ]] && echo "$INDEX_DIR/book-locations/$legacy_shard.json" >> "$tmp_files"
    rg -l "\"id\"\\s*:\\s*\"$id\"" "$INDEX_DIR/a" "$INDEX_DIR/search" "$INDEX_DIR/lang" -S 2>/dev/null >> "$tmp_files" || true
  done

  while IFS= read -r file; do
    [[ -n "$file" ]] || continue
    if [[ "$file" =~ ^$INDEX_DIR/a/([^/]+)\.json$ ]]; then
      key="${BASH_REMATCH[1]}"
      echo "all|$key" >> "$tmp_authors"
      continue
    fi
    if [[ "$file" =~ ^$INDEX_DIR/lang/([^/]+)/a/([^/]+)\.json$ ]]; then
      lang="${BASH_REMATCH[1]}"
      key="${BASH_REMATCH[2]}"
      echo "$lang|$key" >> "$tmp_authors"
      continue
    fi
  done < "$tmp_files"

  sort -u "$tmp_authors" | while IFS='|' read -r lang key; do
    [[ -n "$key" ]] || continue
    for i in 1 2 3 4 5; do
      [[ ${#key} -ge $i ]] || break
      prefix="${key:0:$i}"
      if [[ "$lang" == "all" ]]; then
        [[ -f "$INDEX_DIR/p/$prefix.json" ]] && echo "$INDEX_DIR/p/$prefix.json" >> "$tmp_files"
      else
        [[ -f "$INDEX_DIR/lang/$lang/p/$prefix.json" ]] && echo "$INDEX_DIR/lang/$lang/p/$prefix.json" >> "$tmp_files"
      fi
    done

    while IFS= read -r token; do
      [[ -n "$token" ]] || continue
      [[ -f "$INDEX_DIR/search/$token.json" ]] && echo "$INDEX_DIR/search/$token.json" >> "$tmp_files"
    done < <(
      if [[ "$lang" == "all" ]]; then
        json_get_author_tokens "$INDEX_DIR/a/$key.json"
      else
        json_get_author_tokens "$INDEX_DIR/lang/$lang/a/$key.json"
      fi
    )

    if [[ "$lang" == "all" ]]; then
      rg -l "\"key\"\\s*:\\s*\"$key\"|\"k\"\\s*:\\s*\"$key\"" "$INDEX_DIR/p" "$INDEX_DIR/search" -S 2>/dev/null >> "$tmp_files" || true
    else
      rg -l "\"key\"\\s*:\\s*\"$key\"|\"k\"\\s*:\\s*\"$key\"" "$INDEX_DIR/lang/$lang/p" -S 2>/dev/null >> "$tmp_files" || true
    fi

    if [[ "$lang" != "all" ]]; then
      [[ -f "$INDEX_DIR/lang/$lang/letters.json" ]] && echo "$INDEX_DIR/lang/$lang/letters.json" >> "$tmp_files"
    fi
  done

  sort -u "$tmp_files" > "$out_file"
  rm -f "$tmp_files" "$tmp_authors"
}

upload_index_files_from_list() {
  local list_file="$1"
  local file rel key count=0

  [[ -f "$list_file" ]] || die "Changed-list file not found: $list_file"
  [[ -d "$INDEX_DIR" ]] || die "Index dir not found: $INDEX_DIR"

  while IFS= read -r file; do
    [[ -n "$file" ]] || continue
    rel="${file#"$INDEX_DIR"/}"
    key="api/$rel"
    wrangler_r2_put_with_retry "$R2_BUCKET/$key" "$file"
    count=$((count + 1))
  done < "$list_file"
  log "Uploaded catalog index files: $count"
}

deploy_pages() {
  local -a cmd
  [[ -d "$DEPLOY_DIR" ]] || die "Deploy dir not found: $DEPLOY_DIR"

  cmd=("$WRANGLER_BIN" pages deploy "$DEPLOY_DIR" --project-name "$PAGES_PROJECT")
  if [[ -n "$PAGES_BRANCH" ]]; then
    cmd+=(--branch "$PAGES_BRANCH")
  fi

  log "Deploying Pages project '$PAGES_PROJECT'"
  run_cmd "${cmd[@]}"
}

parse_ids() {
  local token part
  local -a parsed=()
  for token in "$@"; do
    IFS=',' read -r -a parts <<< "$token"
    for part in "${parts[@]}"; do
      part="$(printf '%s' "$part" | tr -d '[:space:]')"
      [[ -n "$part" ]] || continue
      [[ "$part" =~ ^[0-9]+$ ]] || die "book_id must be numeric: $part"
      parsed+=("$part")
    done
  done
  [[ ${#parsed[@]} -gt 0 ]] || die "No valid IDs provided"
  printf '%s\n' "${parsed[@]}"
}

main() {
  local -a args=()
  local command=""
  local only_reindex=0
  local -a ids=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run)
        DRY_RUN=1
        shift
        ;;
      --no-image-upload)
        SKIP_IMAGE_UPLOAD=1
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        args+=("$1")
        shift
        ;;
    esac
  done

  set -- "${args[@]}"
  [[ $# -ge 2 ]] || {
    usage
    exit 2
  }

  command="$1"
  shift
  case "$command" in
    upload-ids)
      only_reindex=0
      ;;
    reindex-ids)
      only_reindex=1
      ;;
    *)
      die "Unknown command: $command"
      ;;
  esac

  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    ids+=("$id")
  done < <(parse_ids "$@")

  require_cmd "$PYTHON_BIN"
  require_cmd "$WRANGLER_BIN"

  local id dir
  for id in "${ids[@]}"; do
    dir="$CONTENT_DIR/$id"
    [[ -d "$dir" ]] || die "Directory not found for id $id: $dir"
    [[ -f "$dir/META-INF/container.xml" ]] || die "Invalid unpacked EPUB for id $id (missing META-INF/container.xml)"
  done

  if [[ "$only_reindex" -eq 0 ]]; then
    if [[ "$SKIP_IMAGE_UPLOAD" -eq 1 ]]; then
      log "Image upload is disabled (--no-image-upload). Existing R2 images will be kept."
    fi
    for id in "${ids[@]}"; do
      log "Uploading book $id to R2"
      upload_dir_to_r2_prefix "$CONTENT_DIR/$id" "content/$id"
    done
  else
    log "Skipping content upload (reindex-ids mode)"
  fi

  rebuild_catalog_indexes_for_ids "${ids[@]}"
  rebuild_book_locations

  local selective_list_file selective_count
  selective_list_file="$(mktemp)"
  trap 'rm -f "${selective_list_file:-}"' EXIT
  build_selective_index_upload_list "$selective_list_file" "${ids[@]}"
  verify_selective_index_consistency "$selective_list_file" "${ids[@]}"
  selective_count="$(wc -l < "$selective_list_file" | tr -d '[:space:]')"
  log "Selective catalog index files for processed ids: $selective_count"

  log "Uploading selective catalog index files to R2"
  upload_index_files_from_list "$selective_list_file"

  deploy_pages

  log "Done. Processed book ids: ${ids[*]}"
}

main "$@"
