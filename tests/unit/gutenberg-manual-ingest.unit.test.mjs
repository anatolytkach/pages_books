import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { REPO_ROOT as ROOT } from "./helpers/repo-root.mjs";

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

test("Unit: manual Gutenberg ingest supports rclone options and passes them into bulk uploads", () => {
  const script = read("tools/gutenberg/gutenberg_manual_ingest.py");
  assert.match(script, /parser\.add_argument\("--rclone-bin"/);
  assert.match(script, /parser\.add_argument\("--rclone-remote"/);
  assert.match(script, /parser\.add_argument\("--skip-rclone"/);
  assert.match(script, /args\.rclone_remote_effective = "" if args\.skip_rclone else detect_rclone_remote/);
  assert.match(script, /upload_content_directory\(\s*f"content\/\{book_id\}",[\s\S]*rclone_bin=args\.rclone_bin,[\s\S]*rclone_remote=args\.rclone_remote_effective/s);
  assert.match(script, /upload_api_files\([\s\S]*rclone_bin=args\.rclone_bin,[\s\S]*rclone_remote=args\.rclone_remote_effective/s);
});

test("Unit: manual Gutenberg ingest removes language search indexes locally and remotely", () => {
  const script = read("tools/gutenberg/gutenberg_manual_ingest.py");
  assert.match(script, /remove_local_language_search_dirs\(INDEX_ROOT\)/);
  assert.match(script, /purge_remote_language_search_dirs\(/);
  assert.match(script, /\[index\] removed \{len\(removed_local_language_search_dirs\)\} stale local language search dirs/);
});
