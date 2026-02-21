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

test("Unit: iPhone counter recovery keeps footer from staying empty", () => {
  const js = read("reader/js/reader.js");
  assert.match(js, /if \(pageCountEl && !String\(pageCountEl\.textContent \|\| ""\)\.trim\(\)\) \{\s*renderPageCountLabel\("…\/…"\);/);
  assert.match(js, /function renderPageCountLabel\(label\)/);
  assert.match(js, /function ensurePageCountTextEl\(\)/);
  assert.match(js, /var pageCountTextEl = null;/);
  assert.match(js, /var pageCounterForceIosPaint = false;/);
  assert.match(js, /pageCounterForceIosPaint = !!\(iOSP \|\| iPadOSP\);/);
  assert.match(js, /var textEl = ensurePageCountTextEl\(\);/);
  assert.match(js, /if \(textEl\) textEl\.textContent = text;/);
  assert.match(js, /pageCountEl\.setAttribute\("data-page-counter", text\)/);
  assert.match(js, /if \(!text\) text = "\.\.\.\/\.\.\.";/);
  assert.match(js, /pageCountEl\.setAttribute\("aria-label", text\)/);
  assert.match(js, /pageCountEl\.style\.display = "inline-block"/);
  assert.match(js, /pageCountEl\.style\.color = "#d0d0d0"/);
  assert.match(js, /textEl\.style\.fontVariantLigatures = "none"/);
  assert.match(js, /if \(pageCounterForceIosPaint\) pageCountEl\.style\.webkitTextFillColor = "#d0d0d0"/);
  assert.match(js, /function getCurrentLocationSafe\(\)/);
  assert.match(js, /function schedulePageCounterRecovery\(reason\)/);
  assert.match(js, /if \(isIosResizeNoiseContext\(\)\) return;/);
  assert.match(js, /if \(reader\._navInProgressUntil && Date\.now\(\) < reader\._navInProgressUntil\) \{/);
  assert.match(js, /function markNavigationInProgress\(ms\)/);
  assert.match(js, /reader\.__markNavigationInProgress = markNavigationInProgress;/);
  assert.match(js, /var waiting = !txt \|\| txt === "…\/…" \|\| reader\._pageCounterPending;/);
  assert.match(js, /document\.addEventListener\("visibilitychange", function \(\) \{/);
  assert.match(js, /window\.addEventListener\("pageshow", function \(\) \{ schedulePageCounterRecovery\("pageshow"\); \}/);
  assert.match(js, /if \(this\.__markNavigationInProgress\) this\.__markNavigationInProgress\(1600\);/);
  assert.match(js, /if \(reader\.__markNavigationInProgress\) reader\.__markNavigationInProgress\(1800\);/);
});

test("Unit: iOS CSS keeps page counter visible", () => {
  const css = read("reader/css/main.css");
  assert.match(css, /@supports \(-webkit-touch-callout: none\) \{/);
  assert.match(css, /#page-count \{/);
  assert.match(css, /-webkit-text-fill-color: var\(--fbbar-fg\) !important;/);
  assert.doesNotMatch(css, /#page-count::before \{/);
  assert.match(css, /\.page-count \.pc-text \{/);
});
