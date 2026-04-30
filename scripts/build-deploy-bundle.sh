#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT_DIR="${1:?output dir is required}"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

cp "$ROOT_DIR/_worker.js" "$OUT_DIR/_worker.js"
cp -a "$ROOT_DIR/api" "$OUT_DIR/api"

cp -a "$ROOT_DIR/books" "$OUT_DIR/books"
rm -rf "$OUT_DIR/books/content"
rm -rf "$OUT_DIR/books/gutenberg_protected_epub3_sources"

cp -a "$ROOT_DIR/reader" "$OUT_DIR/reader"
cp -a "$ROOT_DIR/reader1" "$OUT_DIR/reader1"
cp -a "$ROOT_DIR/reader_render_v3" "$OUT_DIR/reader_render_v3"
rm -rf "$OUT_DIR/reader_render_v3/node_modules"
rm -rf "$OUT_DIR/reader_render_v3/artifacts"
if [[ -d "$ROOT_DIR/reader_render_v5" ]]; then
  cp -a "$ROOT_DIR/reader_render_v5" "$OUT_DIR/reader_render_v5"
  rm -rf "$OUT_DIR/reader_render_v5/node_modules"
  rm -rf "$OUT_DIR/reader_render_v5/artifacts"
fi
cp -a "$ROOT_DIR/publisher_tasks" "$OUT_DIR/publisher_tasks"

if [[ -d "$ROOT_DIR/docs" ]]; then
  cp -a "$ROOT_DIR/docs" "$OUT_DIR/docs"
fi

echo "Deploy bundle created at: $OUT_DIR"
