import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { REPO_ROOT as ROOT } from "./helpers/repo-root.mjs";

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

test("Unit: reader html loads Google Drive sync module", () => {
  const html = read("reader/index.html");
  assert.match(html, /<script src="\/books\/shared\/drive-sync\.js"><\/script>/);
});

test("Unit: reader mybooks schedules Drive sync on open/add", () => {
  const js = read("reader/js/reader.js");
  assert.match(js, /function scheduleDriveStateSync\(/);
  assert.match(js, /sync\.scheduleCurrentReaderStateSync\(/);
  assert.match(js, /scheduleDriveStateSync\(\{[\s\S]*id:\s*String\(entry\.id\)/);
});

test("Unit: reader mybooks deletes through Drive cascade", () => {
  const js = read("reader/js/reader.js");
  assert.match(js, /sync\.deleteBooksCascade\(\[String\(id\)\],\s*\{\s*interactive:\s*false\s*\}\)/);
  assert.match(js, /sync\.applySnapshotToLocalReader\(snapshot\)/);
});

test("Unit: reader captures cover hint from URL into My Books sync payload", () => {
  const js = read("reader/js/reader.js");
  assert.match(js, /function getBookCoverHint\(/);
  assert.match(js, /upsertBook\(\{\s*id:\s*id,\s*title:\s*\"\",\s*author:\s*\"\",\s*cover:\s*getBookCoverHint\(\)\s*\}\)/);
});

test("Unit: catalog reader URL includes cover hint for cloud sync", () => {
  const html = read("books/index.html");
  assert.match(html, /function openReaderUrl\(bookOrId,\s*cover,\s*sourceOverride,\s*entryOverride\)/);
  assert.match(html, /url \+= `&cover=\$\{encodeURIComponent\(coverHint\)\}`/);
});

test("Unit: catalog keeps absolute cover paths unchanged", () => {
  const html = read("books/index.html");
  assert.match(html, /if \(cover\.startsWith\(\"\/\"\)\) return cover;/);
  assert.match(html, /if \(cover\.startsWith\(\"books\/\"\)\) return `\/\$\{cover\}`;/);
});

test("Unit: catalog hydrates My Books cover directly from book page", () => {
  const html = read("books/index.html");
  assert.match(html, /async function fetchBookCoverById\(id,\s*source\)/);
  assert.match(html, /const url = openBookUrl\(\{ id: bookId, source: source \|\| "" \}\);/);
  assert.match(html, /property=\["'\]og:image\["'\]/);
});

test("Unit: catalog retries broken My Books covers via catalog fallback", () => {
  const html = read("books/index.html");
  assert.match(html, /img\.onerror = async \(\) => \{/);
  assert.match(html, /const fallback = await fetchBookCoverById\(bookId,\s*book\.source\);/);
  assert.match(html, /if \(fallback && fallback !== coverUrl\) \{/);
});
