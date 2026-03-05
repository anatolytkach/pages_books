#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONTENT_DIR="$SCRIPT_DIR"
INDEX_TOOL="$ROOT_DIR/tools/build_lang_indexes.py"
INDEX_DIR="$ROOT_DIR/reader_lang_indexes"
DEPLOY_DIR="$ROOT_DIR/deploy"

WRANGLER_BIN="${WRANGLER_BIN:-wrangler}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
R2_BUCKET="${EPUB_INGEST_R2_BUCKET:-reader-books}"
PAGES_PROJECT="${EPUB_INGEST_PAGES_PROJECT:-reader-books}"
PAGES_BRANCH="${EPUB_INGEST_PAGES_BRANCH:-}"

DRY_RUN=0

usage() {
  cat <<USAGE
Usage:
  $(basename "$0") import-all [--dry-run]
  $(basename "$0") replace <book_id> [--dry-run]
  $(basename "$0") upload-ids <id1> [id2 ...] [--dry-run]
  $(basename "$0") upload-ids <id1,id2,id3> [--dry-run]
  $(basename "$0") reindex-ids <id1> [id2 ...] [--dry-run]
  $(basename "$0") reindex-ids <id1,id2,id3> [--dry-run]

What it does:
  import-all
    1) Takes ALL *.epub files from $CONTENT_DIR
    2) Unpacks into numeric folders starting at (max existing numeric id + 1)
    3) Deletes source .epub files
    4) Uploads unpacked book files to R2: content/<id>/...
    5) Rebuilds catalog indexes incrementally
    6) Uploads changed index files to R2: api/...
    7) Deploys $DEPLOY_DIR to Cloudflare Pages project '$PAGES_PROJECT'

  replace <book_id>
    1) Requires EXACTLY one *.epub file in $CONTENT_DIR
    2) Replaces folder $CONTENT_DIR/<book_id>
    3) Deletes source .epub file
    4) Uploads unpacked book files to R2: content/<book_id>/...
    5) Rebuilds catalog indexes for this book id
    6) Uploads changed index files to R2: api/...
    7) Deploys $DEPLOY_DIR to Cloudflare Pages project '$PAGES_PROJECT'

  upload-ids <id...>
    1) Takes existing unpacked folders from $CONTENT_DIR/<id>
    2) Uploads selected books to R2: content/<id>/...
    3) Rebuilds catalog indexes for selected ids
    4) Uploads changed index files to R2: api/...
    5) Deploys $DEPLOY_DIR to Cloudflare Pages project '$PAGES_PROJECT'

  reindex-ids <id...>
    1) Uses existing unpacked folders from $CONTENT_DIR/<id>
    2) Rebuilds catalog indexes for selected ids
    3) Uploads hash-changed index files to R2: api/...
    4) Deploys $DEPLOY_DIR to Cloudflare Pages project '$PAGES_PROJECT'

Options:
  --dry-run   Print commands without executing them.

Notes:
  - All .epub files are processed regardless of filename or timestamp.
  - Requires: unzip, $PYTHON_BIN, $WRANGLER_BIN
  - For non-interactive shells, set CLOUDFLARE_API_TOKEN.
USAGE
}

log() {
  printf '[epub-ingest] %s\n' "$*"
}

die() {
  printf '[epub-ingest] ERROR: %s\n' "$*" >&2
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

next_numeric_id() {
  local max_id=0
  local entry name
  shopt -s nullglob
  for entry in "$CONTENT_DIR"/*; do
    [[ -d "$entry" ]] || continue
    name="$(basename "$entry")"
    [[ "$name" =~ ^[0-9]+$ ]] || continue
    if (( name > max_id )); then
      max_id=$name
    fi
  done
  shopt -u nullglob
  printf '%s' "$((max_id + 1))"
}

unpack_epub_to_id_dir() {
  local epub_path="$1"
  local book_id="$2"
  local dest_dir="$CONTENT_DIR/$book_id"
  local tmp_dir="$CONTENT_DIR/.tmp_unpack_${book_id}_$$"

  log "Unpacking $(basename "$epub_path") -> $book_id"
  run_cmd rm -rf "$tmp_dir"
  run_cmd mkdir -p "$tmp_dir"
  run_cmd unzip -q "$epub_path" -d "$tmp_dir"

  if [[ ! -f "$tmp_dir/META-INF/container.xml" ]]; then
    run_cmd rm -rf "$tmp_dir"
    die "Unpacked EPUB does not contain META-INF/container.xml: $epub_path"
  fi

  run_cmd rm -rf "$dest_dir"
  run_cmd mv "$tmp_dir" "$dest_dir"
  run_cmd rm -f "$epub_path"
}

upload_dir_to_r2_prefix() {
  local local_dir="$1"
  local r2_prefix="$2"
  local file rel key

  [[ -d "$local_dir" ]] || die "Directory not found: $local_dir"

  while IFS= read -r -d '' file; do
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

upload_changed_indexes_to_r2() {
  local stamp_file="$1"
  local file rel key

  [[ -d "$INDEX_DIR" ]] || die "Index dir not found: $INDEX_DIR"

  while IFS= read -r -d '' file; do
    rel="${file#"$INDEX_DIR"/}"
    key="api/$rel"
    wrangler_r2_put_with_retry "$R2_BUCKET/$key" "$file"
  done < <(find "$INDEX_DIR" -type f -newer "$stamp_file" -print0)
}

snapshot_index_hashes() {
  local out_file="$1"
  [[ -d "$INDEX_DIR" ]] || die "Index dir not found: $INDEX_DIR"
  find "$INDEX_DIR" -type f -print0 | sort -z | xargs -0 shasum -a 256 > "$out_file"
}

diff_index_hashes() {
  local pre_file="$1"
  local post_file="$2"
  local out_file="$3"

  "$PYTHON_BIN" - "$pre_file" "$post_file" "$out_file" <<'PY'
import sys

pre_path, post_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]

def load(path):
    data = {}
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if not line:
                continue
            h, p = line.split("  ", 1)
            data[p] = h
    return data

pre = load(pre_path)
post = load(post_path)
changed = sorted([p for p, h in post.items() if pre.get(p) != h])
with open(out_path, "w", encoding="utf-8") as f:
    for p in changed:
        f.write(p + "\n")
print(len(changed))
PY
}

build_selective_index_upload_list() {
  local out_file="$1"
  shift
  local -a ids=("$@")
  local tmp_files tmp_authors
  local id file rel key lang entry prefix token i

  tmp_files="$(mktemp)"
  tmp_authors="$(mktemp)"
  : > "$tmp_files"
  : > "$tmp_authors"

  # Core catalog index files
  [[ -f "$INDEX_DIR/letters.json" ]] && echo "$INDEX_DIR/letters.json" >> "$tmp_files"
  [[ -f "$INDEX_DIR/languages.json" ]] && echo "$INDEX_DIR/languages.json" >> "$tmp_files"

  # Files that directly contain target ids (book search hits, author book lists, etc.)
  for id in "${ids[@]}"; do
    rg -l "\"id\"\\s*:\\s*\"$id\"" "$INDEX_DIR/a" "$INDEX_DIR/search" "$INDEX_DIR/lang" -S 2>/dev/null >> "$tmp_files" || true
  done

  # Derive author keys/langs from selected author files; add required prefix/search/letters files.
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

    # Prefix browse files p/{prefix}.json (up to 5 chars, same as index builder defaults).
    for i in 1 2 3 4 5; do
      [[ ${#key} -ge $i ]] || break
      prefix="${key:0:$i}"
      if [[ "$lang" == "all" ]]; then
        [[ -f "$INDEX_DIR/p/$prefix.json" ]] && echo "$INDEX_DIR/p/$prefix.json" >> "$tmp_files"
      else
        [[ -f "$INDEX_DIR/lang/$lang/p/$prefix.json" ]] && echo "$INDEX_DIR/lang/$lang/p/$prefix.json" >> "$tmp_files"
      fi
    done

    # Author search bucket (2-char token) contains author entries without book id.
    if [[ ${#key} -ge 2 ]]; then
      token="${key:0:2}"
      if [[ "$lang" == "all" ]]; then
        [[ -f "$INDEX_DIR/search/$token.json" ]] && echo "$INDEX_DIR/search/$token.json" >> "$tmp_files"
      else
        [[ -f "$INDEX_DIR/lang/$lang/search/$token.json" ]] && echo "$INDEX_DIR/lang/$lang/search/$token.json" >> "$tmp_files"
      fi
    fi

    # Robust matching by exact author key in prefix/search indexes (covers non-trivial key layouts).
    if [[ "$lang" == "all" ]]; then
      rg -l "\"key\"\\s*:\\s*\"$key\"" "$INDEX_DIR/p" "$INDEX_DIR/search" -S 2>/dev/null >> "$tmp_files" || true
    else
      rg -l "\"key\"\\s*:\\s*\"$key\"" "$INDEX_DIR/lang/$lang/p" "$INDEX_DIR/lang/$lang/search" -S 2>/dev/null >> "$tmp_files" || true
    fi

    # Language letters list is needed for language-scoped prefix browse.
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
  log "Uploaded changed index files: $count"
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

main() {
  local -a args=()
  local command=""
  local replace_id=""
  local -a upload_ids=()
  local only_reindex=0

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run)
        DRY_RUN=1
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

  [[ $# -ge 1 ]] || {
    usage
    exit 2
  }

  command="$1"
  shift

  case "$command" in
    import-all)
      [[ $# -eq 0 ]] || die "Unexpected args for import-all: $*"
      ;;
    replace)
      [[ $# -eq 1 ]] || die "Usage: $(basename "$0") replace <book_id> [--dry-run]"
      replace_id="$1"
      [[ "$replace_id" =~ ^[0-9]+$ ]] || die "book_id must be numeric: $replace_id"
      ;;
    upload-ids|reindex-ids)
      [[ $# -ge 1 ]] || die "Usage: $(basename "$0") $command <id1> [id2 ...] [--dry-run]"
      local token part
      for token in "$@"; do
        IFS=',' read -r -a parts <<< "$token"
        for part in "${parts[@]}"; do
          part="$(printf '%s' "$part" | tr -d '[:space:]')"
          [[ -n "$part" ]] || continue
          [[ "$part" =~ ^[0-9]+$ ]] || die "book_id must be numeric: $part"
          upload_ids+=("$part")
        done
      done
      [[ ${#upload_ids[@]} -gt 0 ]] || die "No valid IDs provided to upload-ids"
      if [[ "$command" == "reindex-ids" ]]; then
        only_reindex=1
      fi
      ;;
    *)
      die "Unknown command: $command"
      ;;
  esac

  require_cmd unzip
  require_cmd "$PYTHON_BIN"
  require_cmd "$WRANGLER_BIN"

  local -a epubs=()
  if [[ "$command" == "import-all" || "$command" == "replace" ]]; then
    shopt -s nullglob nocaseglob
    epubs=("$CONTENT_DIR"/*.epub)
    shopt -u nocaseglob nullglob

    if [[ "$command" == "import-all" ]]; then
      [[ ${#epubs[@]} -gt 0 ]] || die "No .epub files found in $CONTENT_DIR"
    else
      [[ ${#epubs[@]} -eq 1 ]] || die "replace requires exactly one .epub file in $CONTENT_DIR (found: ${#epubs[@]})"
    fi
  fi

  local pre_hash_file post_hash_file changed_list_file selective_list_file
  pre_hash_file="$(mktemp)"
  post_hash_file="$(mktemp)"
  changed_list_file="$(mktemp)"
  selective_list_file="$(mktemp)"
  trap 'rm -f "${pre_hash_file:-}" "${post_hash_file:-}" "${changed_list_file:-}" "${selective_list_file:-}"' EXIT

  local -a changed_ids=()

  if [[ "$command" == "import-all" ]]; then
    local next_id
    next_id="$(next_numeric_id)"

    local epub
    for epub in "${epubs[@]}"; do
      unpack_epub_to_id_dir "$epub" "$next_id"
      changed_ids+=("$next_id")
      next_id="$((next_id + 1))"
    done
  elif [[ "$command" == "replace" ]]; then
    unpack_epub_to_id_dir "${epubs[0]}" "$replace_id"
    changed_ids+=("$replace_id")
  else
    local id dir
    for id in "${upload_ids[@]}"; do
      dir="$CONTENT_DIR/$id"
      [[ -d "$dir" ]] || die "Directory not found for id $id: $dir"
      [[ -f "$dir/META-INF/container.xml" ]] || die "Invalid unpacked EPUB for id $id (missing META-INF/container.xml)"
      changed_ids+=("$id")
    done
  fi

  local id
  if [[ "$only_reindex" -eq 0 ]]; then
    for id in "${changed_ids[@]}"; do
      log "Uploading book $id to R2"
      upload_dir_to_r2_prefix "$CONTENT_DIR/$id" "content/$id"
    done
  else
    log "Skipping content upload (reindex-ids mode)"
  fi

  snapshot_index_hashes "$pre_hash_file"
  rebuild_catalog_indexes_for_ids "${changed_ids[@]}"
  snapshot_index_hashes "$post_hash_file"
  changed_count="$(diff_index_hashes "$pre_hash_file" "$post_hash_file" "$changed_list_file")"
  log "Changed index files detected by hash: $changed_count"
  build_selective_index_upload_list "$selective_list_file" "${changed_ids[@]}"
  selective_count="$(wc -l < "$selective_list_file" | tr -d '[:space:]')"
  log "Selective index upload files for processed ids: $selective_count"

  log "Uploading selective catalog index files to R2"
  upload_index_files_from_list "$selective_list_file"

  deploy_pages

  log "Done. Processed book ids: ${changed_ids[*]}"
}

main "$@"
