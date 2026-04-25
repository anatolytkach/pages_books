import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { REPO_ROOT as ROOT } from "./helpers/repo-root.mjs";

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

test("Unit: reader uses flipped catalog icon as favicon", () => {
  const html = read("reader/index.html");
  assert.match(html, /href="\/books\/assets\/logo-flip\.svg\?v=20260218-1"/);
});

test("Unit: flipped favicon asset exists", () => {
  const file = path.join(ROOT, "books/assets/logo-flip.svg");
  assert.equal(fs.existsSync(file), true);
});

