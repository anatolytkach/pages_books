#!/usr/bin/env node

const { chromium } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

function getArgValue(name) {
  for (const item of process.argv.slice(2)) {
    if (item.startsWith(`--${name}=`)) return item.slice(name.length + 3);
  }
  return "";
}

const TARGET_URL =
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

async function waitIntegrationReady(page) {
  await page.waitForFunction(() => {
    const path = window.location.pathname || "";
    const runtimeMeta = document.querySelector("#runtime-meta");
    const metaText = runtimeMeta ? runtimeMeta.textContent || "" : "";
    return (
      (path.includes("/reader_new/") ||
        path.includes("/books/reader_new/") ||
        /Reader host\s*reader_new/i.test(metaText)) &&
      !!document.querySelector("#runtime-meta dt")
    );
  });
}

async function ensureRangeSelection(page) {
  const automated = await page.evaluate(async () => {
    const debug = window.__PROTECTED_READER_DEBUG__;
    if (!debug || typeof debug.selectAutomationSample !== "function") {
      window.__PROTECTED_LAST_AUTOMATION_SELECTION__ = { ok: false, reason: "missing-debug-surface" };
      return { ok: false, reason: "missing-debug-surface" };
    }
    try {
      const result = await debug.selectAutomationSample();
      const summary = typeof debug.getSummary === "function" ? debug.getSummary() : null;
      const ok = !!(summary && summary.selectionActive && Number(summary.selectedChars || 0) > 1);
      const payload = { ok, reason: ok ? "selected" : "no-selection", result, summary };
      window.__PROTECTED_LAST_AUTOMATION_SELECTION__ = payload;
      return payload;
    } catch (error) {
      const payload = { ok: false, reason: error && error.message ? error.message : String(error) };
      window.__PROTECTED_LAST_AUTOMATION_SELECTION__ = payload;
      return payload;
    }
  });
  if (automated && automated.ok) return true;
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
  const context = await browser.newContext({
    acceptDownloads: true
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(TARGET_URL).origin });
  const page = await context.newPage();
  const debugRequests = [];
  page.on("request", (req) => {
    if (req.url().includes("/debug/")) debugRequests.push(req.url());
  });

  await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
  await waitIntegrationReady(page);
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
        automationSelection: window.__PROTECTED_LAST_AUTOMATION_SELECTION__ || null,
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

  await triggerHarnessControl(page, "#create-highlight");
  await page.waitForFunction(() => /Created highlight /.test(document.querySelector("#status")?.textContent || ""));
  await setHarnessInputValue(page, "#note-input", "transport handoff note");
  await triggerHarnessControl(page, "#add-note-highlight");
  await page.waitForFunction(() => /Added note /.test(document.querySelector("#status")?.textContent || ""));
  const beforeNextState = await getPageState(page);
  await triggerHarnessControl(page, "#next-page");
  await waitForStateChange(page, beforeNextState);

  await triggerHarnessControl(page, "#export-annotations");
  await page.waitForFunction(() => /Exported protected sync file/.test(document.querySelector("#status")?.textContent || ""));

  const handoffBeforeDownload = await page.locator("#handoff-state").inputValue();
  const syncFileBeforeDownload = await page.locator("#annotation-import").inputValue();

  const downloadPromise = page.waitForEvent("download");
  await triggerHarnessControl(page, "#download-sync-file");
  const download = await downloadPromise;
  const downloadPath = await download.path();
  const downloadedText = require("node:fs").readFileSync(downloadPath, "utf8");

  await triggerHarnessControl(page, "#copy-handoff-state");
  await page.waitForFunction(() => /Copied protected handoff state/.test(document.querySelector("#status")?.textContent || ""));
  const copiedHandoff = await page.evaluate(async () => navigator.clipboard.readText());

  await triggerHarnessControl(page, "#clear-local-state");
  await page.waitForFunction(() => /Cleared local protected state/.test(document.querySelector("#status")?.textContent || ""));

  await page.setInputFiles("#sync-file-input", downloadPath);
  await page.waitForFunction(() => /Loaded protected sync file/.test(document.querySelector("#status")?.textContent || ""));
  const afterLoadMeta = await getMetaMap(page);

  await triggerHarnessControl(page, "#import-annotations");
  await page.waitForFunction(() => /Imported protected sync file/.test(document.querySelector("#status")?.textContent || ""));
  const afterImportMeta = await getMetaMap(page);

  await triggerHarnessControl(page, "#export-snapshot-patch");
  await page.waitForFunction(() => /Exported production-compatible snapshot patch/.test(document.querySelector("#status")?.textContent || ""));

  const selectedAgain = await ensureRangeSelection(page);
  if (!selectedAgain) throw new Error("Failed to re-create selection after transport import.");
  await triggerHarnessControl(page, "#copy-selection");
  await page.waitForFunction(() => /Copied selection/.test(document.querySelector("#status")?.textContent || ""));
  const copyStatus = await page.locator("#status").textContent();

  const frameInfo = await page.evaluate(() => {
    const root = document.querySelector(".reader-frame");
    return {
      tags: root ? [...root.children].map((item) => item.tagName) : [],
      text: root ? (root.textContent || "").trim() : ""
    };
  });

  const parsedDownloaded = JSON.parse(downloadedText);
  const syncFileHasTextLikeFields = (parsedDownloaded.state?.annotations || []).some((annotation) => {
    const metadata = annotation.metadata || {};
    const compat = parsedDownloaded.compat || {};
    return (
      Object.prototype.hasOwnProperty.call(annotation, "quote") ||
      Object.prototype.hasOwnProperty.call(annotation, "contextBefore") ||
      Object.prototype.hasOwnProperty.call(annotation, "contextAfter") ||
      Object.prototype.hasOwnProperty.call(metadata, "quote") ||
      Object.prototype.hasOwnProperty.call(metadata, "contextBefore") ||
      Object.prototype.hasOwnProperty.call(metadata, "contextAfter") ||
      Object.prototype.hasOwnProperty.call(compat, "productionNotes") ||
      Object.prototype.hasOwnProperty.call(compat, "productionSnapshotPatch") ||
      Object.prototype.hasOwnProperty.call(compat, "sharePayload")
    );
  });

  console.log(JSON.stringify({
    exportedSyncKind: parsedDownloaded.kind,
    handoffStateKind: JSON.parse(handoffBeforeDownload).kind,
    downloadedFileName: download.suggestedFilename(),
    syncFileSize: downloadedText.length,
    handoffCopiedMatchesTextarea: copiedHandoff.trim() === handoffBeforeDownload.trim(),
    loadedCompatibility: afterLoadMeta["File sync compatibility"],
    importedPage: afterImportMeta["Page"],
    importedGlobalOffset: afterImportMeta["Global offset"],
    importedAnnotations: afterImportMeta["Annotations"],
    importedSource: afterImportMeta["Reading state source"],
    lastFileTransfer: afterImportMeta["Last file transfer"],
    copyStatus: (copyStatus || "").trim(),
    syncFileHasTextLikeFields,
    frameInfo,
    debugRequests,
    snapshotPatchLength: (await page.locator("#compat-json").inputValue()).length,
    handoffPreviewLength: handoffBeforeDownload.length,
    syncPreviewLength: syncFileBeforeDownload.length
  }, null, 2));

  await page.close();
  await context.close();
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
