#!/usr/bin/env node

const { chromium } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

const URL = "http://127.0.0.1:8788/books/reader/?id=19686&reader=protected&renderMode=shape&metricsMode=shape";
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

async function waitReady(page) {
  await page.waitForSelector("#runtime-meta dt");
  await page.waitForFunction(() => {
    const status = document.querySelector("#status");
    return status && /Opened /.test(status.textContent || "");
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

  await page.goto(URL, { waitUntil: "networkidle" });
  await clearProtectedLocalState(page);
  await page.reload({ waitUntil: "networkidle" });
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
  await page.click("#next-page");
  await page.waitForFunction(() => {
    const dl = document.querySelector("#runtime-meta");
    return dl && (dl.textContent || "").includes("2 / 2");
  });
  const afterNextMeta = await getMetaMap(page);

  await page.reload({ waitUntil: "networkidle" });
  await waitReady(page);
  const afterReloadMeta = await getMetaMap(page);

  await page.close();
  const reopenPage = await context.newPage();
  reopenPage.on("request", (req) => {
    if (req.url().includes("/debug/")) debugRequests.push(req.url());
  });
  await reopenPage.goto(URL, { waitUntil: "networkidle" });
  await waitReady(reopenPage);
  const afterReopenMeta = await getMetaMap(reopenPage);

  await reopenPage.click("#export-annotations");
  await reopenPage.waitForFunction(() => {
    const status = document.querySelector("#status");
    return status && /Exported protected bundle/.test(status.textContent || "");
  });
  const exportedBundle = await reopenPage.locator("#annotation-import").inputValue();

  await reopenPage.click("#clear-local-state");
  await reopenPage.waitForFunction(() => {
    const status = document.querySelector("#status");
    return status && /Cleared local protected state/.test(status.textContent || "");
  });
  const afterClearMeta = await getMetaMap(reopenPage);

  await reopenPage.fill("#annotation-import", exportedBundle);
  await reopenPage.click("#import-annotations");
  await reopenPage.waitForFunction(() => {
    const status = document.querySelector("#status");
    return status && /Imported protected bundle/.test(status.textContent || "");
  });
  const afterImportMeta = await getMetaMap(reopenPage);

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
    afterReloadPage: afterReloadMeta["Page"],
    afterReloadAnnotations: afterReloadMeta["Annotations"],
    afterReloadSource: afterReloadMeta["Reading state source"],
    afterReopenPage: afterReopenMeta["Page"],
    afterReopenAnnotations: afterReopenMeta["Annotations"],
    bundleSchemaVersion: afterReopenMeta["Bundle schema version"],
    storageBackend: afterReopenMeta["Storage backend"],
    compatibilityStatus: afterReopenMeta["Bundle compatibility"],
    afterClearAnnotations: afterClearMeta["Annotations"],
    afterClearReadingStateSaved: afterClearMeta["Reading-state saved"],
    afterImportPage: afterImportMeta["Page"],
    afterImportAnnotations: afterImportMeta["Annotations"],
    afterImportCompatibility: afterImportMeta["Bundle compatibility"],
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
