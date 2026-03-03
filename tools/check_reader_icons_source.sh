#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
icons=(hamburger speaker speaker_back search theme full full_back dots)
for n in "${icons[@]}"; do
  src="${n}.svg"
  dst="reader/icons/${n}.svg"
  [[ -f "$src" ]] || { echo "ERROR: missing $src"; exit 1; }
  [[ -f "$dst" ]] || { echo "ERROR: missing $dst"; exit 1; }
  [[ ! -L "$dst" ]] || { echo "ERROR: $dst must be regular file (not symlink)"; exit 1; }
  cmp -s "$src" "$dst" || { echo "ERROR: $dst differs from $src"; exit 1; }
  rg -q "<svg" "$dst" || { echo "ERROR: $dst is not valid svg content"; exit 1; }
done
echo "OK: reader/icons are regular files and are synced from root SVGs."
