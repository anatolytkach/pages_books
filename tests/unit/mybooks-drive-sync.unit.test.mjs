import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = "/Volumes/2T/se_ingest/pages_books";

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

test("Unit: reader html loads Google Drive sync module", () => {
  const html = read("reader/index.html");
  assert.match(html, /<script src="\/books\/shared\/drive-sync\.js"><\/script>/);
});

test("Unit: v5 protected reader html loads Google Drive sync module", () => {
  const html = read("reader/reader_new_v5.html");
  assert.match(html, /<meta content="" name="google-drive-client-id"\/>/);
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

test("Unit: v5 protected My Library schedules Google Drive sync", () => {
  const js = read("reader_render_v5/reader_new/protected-host-ui.js");
  assert.match(js, /function scheduleProtectedMyBooksDriveSync\(item\)/);
  assert.match(js, /sync\.scheduleCurrentReaderStateSync\(null,\s*item \|\| null,\s*300\)/);
  assert.match(js, /scheduleProtectedMyBooksDriveSync\(nextItem\)/);
});

test("Unit: v5 protected My Library deletes the source-qualified Drive entry", () => {
  const js = read("reader_render_v5/reader_new/protected-host-ui.js");
  assert.match(js, /function deleteProtectedMyBooksDriveEntry\(item\)/);
  assert.match(js, /sync\.deleteBookEntry\(item,\s*\{\s*interactive:\s*false\s*\}\)/);
});

test("Unit: Drive sync keeps protected books source-qualified", () => {
  const js = read("books/shared/drive-sync.js");
  assert.match(js, /function buildBookSnapshotKey\(entry\)/);
  assert.match(js, /return \["protected", source \|\| "default", artifactId \|\| id\]\.join\(":"\);/);
  assert.match(js, /function writeBookPayloadToSnapshot\(snapshot,\s*payload,\s*ts\)/);
  assert.match(js, /deleteBookEntry: deleteBookEntry/);
});

test("Unit: Drive sync does not write protected reader state under bare id", () => {
  const js = read("books/shared/drive-sync.js");
  assert.match(js, /var snapshotKey = writeBookPayloadToSnapshot\(snapshot,\s*payload,\s*ts\);/);
  assert.match(js, /if \(!snapshotKey \|\| snapshotKey === id\) \{\s*if \(payload\.cfi\) snapshot\.positions\[id\]/);
  assert.match(js, /if \(snapshotKey !== id\) return;/);
});

test("Unit: reader captures cover hint from URL into My Books sync payload", () => {
  const js = read("reader/js/reader.js");
  assert.match(js, /function getBookCoverHint\(/);
  assert.match(js, /upsertBook\(\{\s*id:\s*id,\s*title:\s*\"\",\s*author:\s*\"\",\s*cover:\s*getBookCoverHint\(\)\s*\}\)/);
});

test("Unit: catalog reader URL includes cover hint for cloud sync", () => {
  const html = read("books/index.html");
  assert.match(html, /function openReaderUrl\(bookOrId,\s*cover,\s*sourceOverride,\s*entryOverride\)/);
  assert.match(html, /function buildLegacyReaderUrl\(bookOrId,\s*cover,\s*sourceOverride,\s*entryOverride,\s*queryOverrides\)/);
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
  assert.match(html, /const url = openBookUrl\(\{\s*id:\s*bookId,\s*source:\s*source \|\| ""\s*\}\);/);
  assert.match(html, /property=\["'\]og:image\["'\]/);
});

test("Unit: catalog falls back to cover lookup while hydrating My Library", () => {
  const html = read("books/index.html");
  assert.match(html, /async function hydrateMyBooksCovers\(itemsInput,\s*expectedNonce\)/);
  assert.match(html, /const coverById = await fetchBookCoverById\(id,\s*item\.source\);/);
});
