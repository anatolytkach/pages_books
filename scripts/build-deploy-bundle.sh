#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT_DIR="${1:?output dir is required}"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

cp "$ROOT_DIR/_worker.js" "$OUT_DIR/_worker.js"
cp "$ROOT_DIR/deploy/.wranglerignore" "$OUT_DIR/.wranglerignore"

cp -a "$ROOT_DIR/books" "$OUT_DIR/books"
rm -rf "$OUT_DIR/books/content"

cp -a "$ROOT_DIR/reader" "$OUT_DIR/reader"
cp -a "$ROOT_DIR/publisher_tasks" "$OUT_DIR/publisher_tasks"

mkdir -p "$OUT_DIR/docs"
cp -a "$ROOT_DIR/deploy/docs/." "$OUT_DIR/docs/"

echo "Deploy bundle created at: $OUT_DIR"
