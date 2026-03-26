#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SEO_DIR="${1:-$ROOT_DIR/reader_seo_indexes}"
WRANGLER_BIN="${WRANGLER_BIN:-wrangler}"
R2_BUCKET="${R2_BUCKET:-reader-books}"
JOBS="${JOBS:-4}"
UPLOAD_TIMEOUT="${UPLOAD_TIMEOUT:-180}"
UPLOAD_RETRIES="${UPLOAD_RETRIES:-3}"

if [[ ! -d "$SEO_DIR" ]]; then
  echo "SEO directory not found: $SEO_DIR" >&2
  exit 1
fi

export SEO_DIR WRANGLER_BIN R2_BUCKET UPLOAD_TIMEOUT UPLOAD_RETRIES
find "$SEO_DIR" -type f | sort | xargs -P "$JOBS" -I {} /bin/zsh -lc '
  file="$1"
  rel="${file#"$SEO_DIR"/}"
  attempt=1
  while (( attempt <= UPLOAD_RETRIES )); do
    if perl -e '"'"'alarm shift; exec @ARGV'"'"' "$UPLOAD_TIMEOUT" \
      "$WRANGLER_BIN" r2 object put "$R2_BUCKET/seo/$rel" --file "$file" --remote >/dev/null
    then
      exit 0
    fi
    if (( attempt == UPLOAD_RETRIES )); then
      echo "Upload failed after $UPLOAD_RETRIES attempts: $rel" >&2
      exit 1
    fi
    sleep "$attempt"
    attempt=$((attempt + 1))
  done
' _ {}

echo "Uploaded SEO manifests from $SEO_DIR to $R2_BUCKET/seo/ using $JOBS parallel jobs."
