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
    return (
      window.location.pathname.includes("/reader_render_v3/integration/protected-reader.html") &&
      !!document.querySelector("#runtime-meta dt") &&
      /Opened /.test(document.querySelector("#status")?.textContent || "")
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
  if (!selected) throw new Error("Failed to create selection.");

  await page.click("#copy-selection");
  await page.waitForFunction(() => {
    const status = document.querySelector("#status");
    return status && /Copied selection/.test(status.textContent || "");
  });
  const copyStatus = await page.locator("#status").textContent();

  await page.fill("#note-input", "local-first persistence note");
  await page.click("#add-note-selection");
  await page.waitForFunction(() => {
    const status = document.querySelector("#status");
    return status && /Added note /.test(status.textContent || "");
  });

  const afterNoteMeta = await getMetaMap(page);
  const beforeNextState = await getPageState(page);
  await page.click("#next-page");
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

  await reopenPage.click("#export-annotations");
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

  await reopenPage.click("#export-snapshot-patch");
  await reopenPage.waitForFunction(() => {
    const status = document.querySelector("#status");
    return status && /Exported production-compatible snapshot patch/.test(status.textContent || "");
  });
  const exportedSnapshotPatch = await reopenPage.locator("#compat-json").inputValue();

  await reopenPage.click("#clear-local-state");
  await reopenPage.waitForFunction(() => {
    const status = document.querySelector("#status");
    return status && /Cleared local protected state/.test(status.textContent || "");
  });
  const afterClearMeta = await getMetaMap(reopenPage);

  await reopenPage.fill("#annotation-import", exportedSyncFile);
  await reopenPage.click("#import-annotations");
  await reopenPage.waitForFunction(() => {
    const status = document.querySelector("#status");
    return status && /Imported protected sync file/.test(status.textContent || "");
  });
  const afterImportMeta = await getMetaMap(reopenPage);

  await reopenPage.click("#clear-local-state");
  await reopenPage.waitForFunction(() => {
    const status = document.querySelector("#status");
    return status && /Cleared local protected state/.test(status.textContent || "");
  });

  await reopenPage.fill("#compat-json", exportedSnapshotPatch);
  await reopenPage.click("#import-production-payload");
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
    compatibilityStatus: afterReopenMeta["Bundle compatibility"],
    afterClearAnnotations: afterClearMeta["Annotations"],
    afterClearReadingStateSaved: afterClearMeta["Reading-state saved"],
    afterImportPage: afterImportMeta["Page"],
    afterImportGlobalOffset: afterImportMeta["Global offset"],
    afterImportAnnotations: afterImportMeta["Annotations"],
    afterImportCompatibility: afterImportMeta["Bundle compatibility"],
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
