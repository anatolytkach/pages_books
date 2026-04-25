#!/usr/bin/env node

const { chromium } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

function getArgValue(name) {
  for (const item of process.argv.slice(2)) {
    if (item.startsWith(`--${name}=`)) return item.slice(name.length + 3);
  }
  return "";
}

const URL =
  getArgValue("url") ||
  process.env.READER_V3_URL ||
  "http://127.0.0.1:8788/books/reader/?id=19686&reader=protected&renderMode=shape&metricsMode=shape";
const STORAGE_PREFIX = "reader_render_v3:integration";

async function getMetaMap(page) {
  return await page.evaluate(() => {
    const dl = document.querySelector("#runtime-meta");
    const out = {};
    if (!dl) return out;
    const children = [...dl.children];
    for (let index = 0; index < children.length; index += 2) {
      const dt = children[index];
      const dd = children[index + 1];
      if (dt && dd) out[dt.textContent.trim()] = dd.textContent.trim();
    }
    return out;
  });
}

async function getPageState(page) {
  const meta = await getMetaMap(page);
  return {
    page: meta["Page"] || "n/a",
    globalOffset: meta["Global offset"] || "n/a",
    order: meta["Order"] || "n/a"
  };
}

async function waitForStateChange(page, previousState, timeout = 30000) {
  await page.waitForFunction(
    ({ previousPage, previousOrder, previousGlobalOffset }) => {
      const dl = document.querySelector("#runtime-meta");
      if (!dl) return false;
      const children = [...dl.children];
      const values = {};
      for (let index = 0; index < children.length; index += 2) {
        const dt = children[index];
        const dd = children[index + 1];
        if (dt && dd) values[dt.textContent.trim()] = dd.textContent.trim();
      }
      return (
        (values["Page"] || "") !== previousPage ||
        (values["Order"] || "") !== previousOrder ||
        (values["Global offset"] || "") !== previousGlobalOffset
      );
    },
    {
      previousPage: previousState.page,
      previousOrder: previousState.order,
      previousGlobalOffset: previousState.globalOffset
    },
    { timeout }
  );
}

async function waitReady(page) {
  await page.waitForFunction(() => {
    const path = window.location.pathname || "";
    const runtimeMeta = document.querySelector("#runtime-meta");
    const metaText = runtimeMeta ? runtimeMeta.textContent || "" : "";
    return (
      (path.includes("/reader_new/") ||
        path.includes("/books/reader_new/") ||
        /Reader host\s*reader_new/i.test(metaText)) &&
      !!document.querySelector("#runtime-meta dt") &&
      /Opened /.test(document.querySelector("#status")?.textContent || "")
    );
  });
}

async function ensureRangeSelection(page) {
  const automated = await page.evaluate(async () => {
    const debug = window.__PROTECTED_READER_DEBUG__;
    if (!debug || typeof debug.selectAutomationSample !== "function") return false;
    try {
      await debug.selectAutomationSample();
      const summary = typeof debug.getSummary === "function" ? debug.getSummary() : null;
      return !!(summary && summary.selectionActive && Number(summary.selectedChars || 0) > 1);
    } catch (_error) {
      return false;
    }
  });
  if (automated) return true;
  await page.waitForFunction(() => {
    const debug = window.__PROTECTED_READER_DEBUG__;
    if (!debug || typeof debug.getDebugLayoutState !== "function") return false;
    const layout = debug.getDebugLayoutState();
    return !!(layout && layout.ready && Array.isArray(layout.lines) && layout.lines.length);
  }, { timeout: 10000 });
  const attempts = await page.evaluate(() => {
    const rect = document.querySelector("#reader-canvas")?.getBoundingClientRect();
    const debug = window.__PROTECTED_READER_DEBUG__;
    const layout = debug && typeof debug.getDebugLayoutState === "function"
      ? debug.getDebugLayoutState()
      : null;
    const lines = layout && Array.isArray(layout.lines) ? layout.lines : [];
    const candidates = lines.filter((line) => {
      const y = Number(line.y || 0);
      const width = Number(line.width || 0);
      return width > 220 && y > 80;
    });
    if (!rect || candidates.length < 2) return [];
    return candidates.slice(0, 6).map((start, index) => {
      const end = candidates[Math.min(index + 1, candidates.length - 1)];
      return {
        startX: Math.round(rect.left + Number(start.x || 0) + 16),
        startY: Math.round(rect.top + Number(start.y || 0) + Math.max(8, Math.min(18, Number(start.height || 18) / 2))),
        endX: Math.round(rect.left + Math.max(Number(end.x || 0) + 140, Number(end.x || 0) + Number(end.width || 0) - 16)),
        endY: Math.round(rect.top + Number(end.y || 0) + Math.max(8, Math.min(18, Number(end.height || 18) / 2)))
      };
    });
  });
  for (const geometry of attempts) {
    await page.mouse.move(geometry.startX, geometry.startY);
    await page.mouse.down();
    await page.mouse.move(geometry.endX, geometry.endY, { steps: 20 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const isRange = await page.evaluate(() => {
      const debug = window.__PROTECTED_READER_DEBUG__;
      const summary = debug && typeof debug.getSummary === "function" ? debug.getSummary() : null;
      return !!(summary && summary.selectionActive && Number(summary.selectedChars || 0) > 1);
    });
    if (isRange) return true;
  }
  return false;
}

async function clearProtectedLocalState(page) {
  await page.evaluate((prefix) => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(prefix)) window.localStorage.removeItem(key);
    }
  }, STORAGE_PREFIX);
}

async function triggerHarnessControl(page, selector) {
  await page.evaluate((targetSelector) => {
    const node = document.querySelector(targetSelector);
    if (!node) throw new Error(`Missing control ${targetSelector}`);
    node.click();
  }, selector);
}

async function setHarnessInputValue(page, selector, value) {
  await page.evaluate(({ targetSelector, targetValue }) => {
    const node = document.querySelector(targetSelector);
    if (!node) throw new Error(`Missing input ${targetSelector}`);
    node.value = targetValue;
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }, { targetSelector: selector, targetValue: value });
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });
  const context = await browser.newContext();

  const page = await context.newPage();
  const debugRequests = [];
  page.on("request", (req) => {
    if (req.url().includes("/debug/")) debugRequests.push(req.url());
  });

  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await waitReady(page);
  await clearProtectedLocalState(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitReady(page);

  const selected = await ensureRangeSelection(page);
  if (!selected) {
    const diagnostics = await page.evaluate(() => {
      const debug = window.__PROTECTED_READER_DEBUG__ || null;
      const summary = debug && typeof debug.getSummary === "function" ? debug.getSummary() : null;
      const layout = debug && typeof debug.getDebugLayoutState === "function" ? debug.getDebugLayoutState() : null;
      return {
        debugKeys: debug ? Object.keys(debug) : [],
        selectionKind: document.querySelector("#selection-kind")?.textContent || "",
        summary,
        layoutReady: !!(layout && layout.ready),
        layoutLines: layout && Array.isArray(layout.lines) ? layout.lines.length : 0,
        statusText: document.querySelector("#status")?.textContent || ""
      };
    });
    console.error(JSON.stringify({ selectionDiagnostics: diagnostics }, null, 2));
    throw new Error("Failed to create selection.");
  }

  await triggerHarnessControl(page, "#copy-selection");
  await page.waitForFunction(() => {
    const status = document.querySelector("#status");
    return status && /Copied selection/.test(status.textContent || "");
  });
  const copyStatus = await page.locator("#status").textContent();

  await setHarnessInputValue(page, "#note-input", "local-first persistence note");
  await triggerHarnessControl(page, "#add-note-selection");
  await page.waitForFunction(() => {
    const status = document.querySelector("#status");
    return status && /Added note /.test(status.textContent || "");
  });

  const afterNoteMeta = await getMetaMap(page);
  const beforeNextState = await getPageState(page);
  await triggerHarnessControl(page, "#next-page");
  await waitForStateChange(page, beforeNextState);
  const afterNextMeta = await getMetaMap(page);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitReady(page);
  const afterReloadMeta = await getMetaMap(page);

  await page.close();
  const reopenPage = await context.newPage();
  reopenPage.on("request", (req) => {
    if (req.url().includes("/debug/")) debugRequests.push(req.url());
  });
  await reopenPage.goto(URL, { waitUntil: "domcontentloaded" });
  await waitReady(reopenPage);
  const afterReopenMeta = await getMetaMap(reopenPage);

  await triggerHarnessControl(reopenPage, "#export-annotations");
  await reopenPage.waitForFunction(() => {
    const status = document.querySelector("#status");
    return status && /Exported protected sync file/.test(status.textContent || "");
  });
  const exportedSyncFile = await reopenPage.locator("#annotation-import").inputValue();
  const parsedSyncFile = JSON.parse(exportedSyncFile);
  const syncFileHasTextLikeFields = (parsedSyncFile.state?.annotations || []).some((annotation) => {
    const metadata = annotation.metadata || {};
    return (
      Object.prototype.hasOwnProperty.call(annotation, "quote") ||
      Object.prototype.hasOwnProperty.call(annotation, "contextBefore") ||
      Object.prototype.hasOwnProperty.call(annotation, "contextAfter") ||
      Object.prototype.hasOwnProperty.call(metadata, "quote") ||
      Object.prototype.hasOwnProperty.call(metadata, "contextBefore") ||
      Object.prototype.hasOwnProperty.call(metadata, "contextAfter")
    );
  });

  await triggerHarnessControl(reopenPage, "#export-snapshot-patch");
  await reopenPage.waitForFunction(() => {
    const status = document.querySelector("#status");
    return status && /Exported production-compatible snapshot patch/.test(status.textContent || "");
  });
  const exportedSnapshotPatch = await reopenPage.locator("#compat-json").inputValue();

  await triggerHarnessControl(reopenPage, "#clear-local-state");
  await reopenPage.waitForFunction(() => {
    const status = document.querySelector("#status");
    return status && /Cleared local protected state/.test(status.textContent || "");
  });
  const afterClearMeta = await getMetaMap(reopenPage);

  await setHarnessInputValue(reopenPage, "#annotation-import", exportedSyncFile);
  await triggerHarnessControl(reopenPage, "#import-annotations");
  await reopenPage.waitForFunction(() => {
    const status = document.querySelector("#status");
    return status && /Imported protected sync file/.test(status.textContent || "");
  });
  const afterImportMeta = await getMetaMap(reopenPage);

  await triggerHarnessControl(reopenPage, "#clear-local-state");
  await reopenPage.waitForFunction(() => {
    const status = document.querySelector("#status");
    return status && /Cleared local protected state/.test(status.textContent || "");
  });

  await setHarnessInputValue(reopenPage, "#compat-json", exportedSnapshotPatch);
  await triggerHarnessControl(reopenPage, "#import-production-payload");
  await reopenPage.waitForFunction(() => {
    const status = document.querySelector("#status");
    return status && /Imported production payload/.test(status.textContent || "");
  });
  const afterSnapshotImportMeta = await getMetaMap(reopenPage);

  const frameInfo = await reopenPage.evaluate(() => {
    const root = document.querySelector(".reader-frame");
    return {
      tags: root ? [...root.children].map((item) => item.tagName) : [],
      text: root ? (root.textContent || "").trim() : ""
    };
  });

  console.log(JSON.stringify({
    copyStatus: (copyStatus || "").trim(),
    afterNoteAnnotations: afterNoteMeta["Annotations"],
    afterNextPage: afterNextMeta["Page"],
    afterNextGlobalOffset: afterNextMeta["Global offset"],
    afterReloadPage: afterReloadMeta["Page"],
    afterReloadGlobalOffset: afterReloadMeta["Global offset"],
    afterReloadAnnotations: afterReloadMeta["Annotations"],
    afterReloadSource: afterReloadMeta["Reading state source"],
    afterReopenPage: afterReopenMeta["Page"],
    afterReopenGlobalOffset: afterReopenMeta["Global offset"],
    afterReopenAnnotations: afterReopenMeta["Annotations"],
    bundleSchemaVersion: afterReopenMeta["Bundle schema version"],
    storageBackend: afterReopenMeta["Storage backend"],
    persistenceStatus: afterReopenMeta["Bundle status"],
    afterClearAnnotations: afterClearMeta["Annotations"],
    afterClearReadingStateSaved: afterClearMeta["Reading-state saved"],
    afterImportPage: afterImportMeta["Page"],
    afterImportGlobalOffset: afterImportMeta["Global offset"],
    afterImportAnnotations: afterImportMeta["Annotations"],
    afterImportStatus: afterImportMeta["Bundle status"],
    afterSnapshotImportPage: afterSnapshotImportMeta["Page"],
    afterSnapshotImportAnnotations: afterSnapshotImportMeta["Annotations"],
    afterSnapshotImportStatus: afterSnapshotImportMeta["Compat share import"],
    syncFileHasTextLikeFields,
    frameInfo,
    debugRequests
  }, null, 2));

  await reopenPage.close();
  await context.close();
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
