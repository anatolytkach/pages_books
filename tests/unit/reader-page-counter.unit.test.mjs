import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = "/Volumes/2T/se_ingest/pages_books";

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

test("Unit: page counter pending has touch fail-open guard", () => {
  const js = read("reader/js/reader.js");
  assert.match(js, /this\._pageCounterPendingSince = 0;/);
  assert.match(js, /allowFailOpen = coarse \|\| touchCapable \|\| isIosResizeNoiseContext\(\);/);
  assert.match(js, /setPageCounterPending\(false\);\s*try \{\s*if \(pageCountEl && reader\._lastStablePageCounterText\)/);
});

test("Unit: global page map build has watchdog fallback", () => {
  const js = read("reader/js/reader.js");
  assert.match(js, /this\._globalPageMapBuildWatchdog = null;/);
  assert.match(js, /reader\._globalPageMapBuildWatchdog = setTimeout\(function \(\) \{/);
  assert.match(js, /if \(token !== reader\._globalPageMapBuildToken\) return;/);
  assert.match(js, /setPageCounterPending\(false\);/);
});

test("Unit: updatePageCount releases stale pending state", () => {
  const js = read("reader/js/reader.js");
  assert.match(js, /pendingTooLong = pendingSince > 0 && \(\(Date\.now\(\) - pendingSince\) > 7000\)/);
  assert.match(js, /if \(pendingTooLong \|\| mapReady\) \{\s*setPageCounterPending\(false\);/);
});
