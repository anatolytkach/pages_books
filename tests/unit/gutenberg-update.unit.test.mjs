import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { REPO_ROOT as ROOT } from "./helpers/repo-root.mjs";

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

test("Unit: Gutenberg catalog updater supports rclone bulk sync for content and api files", () => {
  const script = read("tools/gutenberg/update_gutenberg_catalog.py");
  assert.match(script, /def detect_rclone_remote\(rclone_bin: str, preferred_remote: str = ""\)/);
  assert.match(script, /parser\.add_argument\("--rclone-bin"/);
  assert.match(script, /parser\.add_argument\("--rclone-remote"/);
  assert.match(script, /parser\.add_argument\("--skip-rclone"/);
  assert.match(script, /\[rclone_bin, "copy", str\(book_root\), rclone_target\(rclone_remote, bucket, prefix\)\]/);
  assert.match(script, /\[rclone_bin, "copy", str\(tmp_dir\), rclone_target\(rclone_remote, bucket, "api"\)\]/);
});

test("Unit: Gutenberg catalog updater removes language search indexes locally and remotely", () => {
  const script = read("tools/gutenberg/update_gutenberg_catalog.py");
  assert.match(script, /def remove_local_language_search_dirs\(index_root: Path\) -> List\[Path\]/);
  assert.match(script, /index_root\.glob\("lang\/\*\/search"\)/);
  assert.match(script, /def purge_remote_language_search_dirs\(/);
  assert.match(script, /rclone_target\(rclone_remote, bucket, "api\/lang"\)/);
  assert.match(script, /rclone_target\(rclone_remote, bucket, f"api\/lang\/\{lang\}\/search"\)/);
  assert.match(script, /removed_local_language_search_dirs = remove_local_language_search_dirs\(INDEX_ROOT\)/);
  assert.match(script, /purge_remote_language_search_dirs\(/);
});
