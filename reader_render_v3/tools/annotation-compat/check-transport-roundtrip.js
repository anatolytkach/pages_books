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
    return (
      window.location.pathname.includes("/reader_render_v3/integration/protected-reader.html") &&
      !!document.querySelector("#runtime-meta dt") &&
      /Opened /.test(document.querySelector("#status")?.textContent || "")
    );
  });
}

async function waitIntegrationReady(page) {
  await page.waitForFunction(() => {
    return (
      window.location.pathname.includes("/reader_render_v3/integration/protected-reader.html") &&
      !!document.querySelector("#runtime-meta dt")
    );
  });
}

async function ensureRangeSelection(page) {
  const attempts = [];
  for (const y of [80, 120, 160, 200, 240, 280, 320, 360, 420]) {
    attempts.push({ x1: 120, y, x2: 320 });
    attempts.push({ x1: 160, y, x2: 420 });
  }
  for (const attempt of attempts) {
    const isRange = await page.evaluate(({ x1, y, x2 }) => {
      const canvas = document.querySelector("#reader-canvas");
      if (!canvas) return false;
      const rect = canvas.getBoundingClientRect();
      const make = (type, clientX, clientY) => new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
        buttons: type === "mouseup" ? 0 : 1
      });
      const startX = rect.left + x1;
      const startY = rect.top + y;
      const endX = rect.left + x2;
      canvas.dispatchEvent(make("mousedown", startX, startY));
      for (let step = 1; step <= 12; step += 1) {
        const nextX = startX + ((endX - startX) * step) / 12;
        canvas.dispatchEvent(make("mousemove", nextX, startY));
      }
      window.dispatchEvent(make("mouseup", endX, startY));
      const kind = document.querySelector("#selection-kind");
      return !!(kind && /range/i.test(kind.textContent || ""));
    }, attempt);
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
  if (!selected) throw new Error("Failed to create selection.");

  await page.click("#create-highlight");
  await page.waitForFunction(() => /Created highlight /.test(document.querySelector("#status")?.textContent || ""));
  await page.fill("#note-input", "transport handoff note");
  await page.click("#add-note-highlight");
  await page.waitForFunction(() => /Added note /.test(document.querySelector("#status")?.textContent || ""));
  const beforeNextState = await getPageState(page);
  await page.click("#next-page");
  await waitForStateChange(page, beforeNextState);

  await page.click("#export-annotations");
  await page.waitForFunction(() => /Exported protected sync file/.test(document.querySelector("#status")?.textContent || ""));

  const handoffBeforeDownload = await page.locator("#handoff-state").inputValue();
  const syncFileBeforeDownload = await page.locator("#annotation-import").inputValue();

  const downloadPromise = page.waitForEvent("download");
  await page.click("#download-sync-file");
  const download = await downloadPromise;
  const downloadPath = await download.path();
  const downloadedText = require("node:fs").readFileSync(downloadPath, "utf8");

  await page.click("#copy-handoff-state");
  await page.waitForFunction(() => /Copied protected handoff state/.test(document.querySelector("#status")?.textContent || ""));
  const copiedHandoff = await page.evaluate(async () => navigator.clipboard.readText());

  await page.click("#clear-local-state");
  await page.waitForFunction(() => /Cleared local protected state/.test(document.querySelector("#status")?.textContent || ""));

  await page.setInputFiles("#sync-file-input", downloadPath);
  await page.waitForFunction(() => /Loaded protected sync file/.test(document.querySelector("#status")?.textContent || ""));
  const afterLoadMeta = await getMetaMap(page);

  await page.click("#import-annotations");
  await page.waitForFunction(() => /Imported protected sync file/.test(document.querySelector("#status")?.textContent || ""));
  const afterImportMeta = await getMetaMap(page);

  await page.click("#export-snapshot-patch");
  await page.waitForFunction(() => /Exported production-compatible snapshot patch/.test(document.querySelector("#status")?.textContent || ""));

  const selectedAgain = await ensureRangeSelection(page);
  if (!selectedAgain) throw new Error("Failed to re-create selection after transport import.");
  await page.click("#copy-selection");
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
