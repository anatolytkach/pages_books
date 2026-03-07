#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTENT_DIR="$SCRIPT_DIR"

DRY_RUN=0

usage() {
  cat <<USAGE
Usage:
  $(basename "$0") import-all [--dry-run]
  $(basename "$0") replace <book_id> [epub_file] [--dry-run]

What it does:
  import-all
    1) Takes ALL *.epub files from $CONTENT_DIR
    2) Unpacks into numeric folders starting at (max existing numeric id + 1)
    3) Deletes source .epub files

  replace <book_id> [epub_file]
    1) Replaces folder $CONTENT_DIR/<book_id>
    2) Uses [epub_file] if provided; otherwise requires exactly one *.epub in $CONTENT_DIR
    3) Deletes source .epub file

Options:
  --dry-run   Print commands without executing them.
USAGE
}

log() {
  printf '[epub-unpack] %s\n' "$*"
}

die() {
  printf '[epub-unpack] ERROR: %s\n' "$*" >&2
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

resolve_replace_epub() {
  local user_arg="${1:-}"
  local -a epubs=()

  if [[ -n "$user_arg" ]]; then
    if [[ "$user_arg" == /* ]]; then
      printf '%s' "$user_arg"
    else
      printf '%s' "$PWD/$user_arg"
    fi
    return 0
  fi

  shopt -s nullglob nocaseglob
  epubs=("$CONTENT_DIR"/*.epub)
  shopt -u nocaseglob nullglob

  [[ ${#epubs[@]} -eq 1 ]] || die "replace requires exactly one .epub in $CONTENT_DIR when epub_file is not provided"
  printf '%s' "${epubs[0]}"
}

unpack_epub_to_id_dir() {
  local epub_path="$1"
  local book_id="$2"
  local dest_dir="$CONTENT_DIR/$book_id"
  local tmp_dir="$CONTENT_DIR/.tmp_unpack_${book_id}_$$"

  [[ -f "$epub_path" ]] || die "EPUB not found: $epub_path"
  [[ "$book_id" =~ ^[0-9]+$ ]] || die "book_id must be numeric: $book_id"

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

main() {
  local -a args=()
  local command=""
  local replace_id=""
  local replace_epub_arg=""
  local -a epubs=()

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
      [[ $# -eq 1 || $# -eq 2 ]] || die "Usage: $(basename "$0") replace <book_id> [epub_file] [--dry-run]"
      replace_id="$1"
      [[ "$replace_id" =~ ^[0-9]+$ ]] || die "book_id must be numeric: $replace_id"
      if [[ $# -eq 2 ]]; then
        replace_epub_arg="$2"
      fi
      ;;
    *)
      die "Unknown command: $command"
      ;;
  esac

  require_cmd unzip

  if [[ "$command" == "import-all" ]]; then
    shopt -s nullglob nocaseglob
    epubs=("$CONTENT_DIR"/*.epub)
    shopt -u nocaseglob nullglob
    [[ ${#epubs[@]} -gt 0 ]] || die "No .epub files found in $CONTENT_DIR"

    local next_id epub
    next_id="$(next_numeric_id)"
    for epub in "${epubs[@]}"; do
      unpack_epub_to_id_dir "$epub" "$next_id"
      next_id="$((next_id + 1))"
    done
    log "Done. Imported EPUBs: ${#epubs[@]}"
    exit 0
  fi

  local replace_epub
  replace_epub="$(resolve_replace_epub "$replace_epub_arg")"
  unpack_epub_to_id_dir "$replace_epub" "$replace_id"
  log "Done. Replaced book id: $replace_id"
}

main "$@"
