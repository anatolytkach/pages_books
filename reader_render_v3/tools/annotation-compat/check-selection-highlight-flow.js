#!/usr/bin/env node

const { chromium } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

async function getMetaMap(page) {
  return await page.evaluate(() => {
    const dl = document.querySelector("#runtime-meta");
    if (!dl) return {};
    const out = {};
    const children = [...dl.children];
    for (let i = 0; i < children.length; i += 2) {
      const dt = children[i];
      const dd = children[i + 1];
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
      const make = (type, clientX, clientY) =>
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          buttons: type === "mouseup" ? 0 : 1
        });
      const startX = rect.left + x1;
      const startY = rect.top + y;
      const endX = rect.left + x2;
      const endY = rect.top + y;
      canvas.dispatchEvent(make("mousedown", startX, startY));
      for (let step = 1; step <= 12; step += 1) {
        const nextX = startX + ((endX - startX) * step) / 12;
        canvas.dispatchEvent(make("mousemove", nextX, startY));
      }
      window.dispatchEvent(make("mouseup", endX, endY));
      const kind = document.querySelector("#selection-kind");
      return !!(kind && /range/i.test(kind.textContent || ""));
    }, attempt);
    if (isRange) {
      return true;
    }
  }
  return false;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });

  const page = await browser.newPage();
  const url = "http://127.0.0.1:8788/books/reader/?id=19686&reader=protected&renderMode=shape&metricsMode=shape";
  const debugRequests = [];
  page.on("request", (req) => {
    if (req.url().includes("/debug/")) debugRequests.push(req.url());
  });

  await page.goto(url, { waitUntil: "networkidle" });
  await waitReady(page);

  const selected = await ensureRangeSelection(page);
  if (!selected) throw new Error("Failed to create a range selection in the protected reader.");

  const selectionMeta = await page.evaluate(() => {
    const dl = document.querySelector("#selection-meta");
    return dl ? dl.textContent : "";
  });

  await page.click("#copy-selection");
  await page.waitForFunction(() => {
    const status = document.querySelector("#status");
    return status && /Copied selection/.test(status.textContent || "");
  });
  const afterCopyStatus = await page.locator("#status").textContent();

  await page.click("#create-highlight");
  await page.waitForFunction(() => {
    const status = document.querySelector("#status");
    return status && /Created highlight/.test(status.textContent || "");
  });
  const afterHighlightStatus = await page.locator("#status").textContent();
  const afterHighlightMeta = await getMetaMap(page);
  const initialAnnotationCount = await page.locator("#annotation-count").textContent();

  await page.click("#next-page");
  await page.waitForFunction(() => {
    const dl = document.querySelector("#runtime-meta");
    return dl && (dl.textContent || "").includes("2 / 2");
  });
  const pageTwoMeta = await getMetaMap(page);

  await page.click("#prev-page");
  await page.waitForFunction(() => {
    const dl = document.querySelector("#runtime-meta");
    return dl && (dl.textContent || "").includes("1 / 2");
  });
  const backMeta = await getMetaMap(page);
  const backAnnotationCount = await page.locator("#annotation-count").textContent();
  const annotationItems = await page.locator(".annotation-item").count();

  console.log(JSON.stringify({
    selectionMetaIncludesRange: /range/i.test(selectionMeta),
    afterCopyStatus: (afterCopyStatus || "").trim(),
    afterHighlightStatus: (afterHighlightStatus || "").trim(),
    initialAnnotationCount: (initialAnnotationCount || "").trim(),
    afterHighlightAnnotations: afterHighlightMeta["Annotations"],
    pageTwoPage: pageTwoMeta["Page"],
    backPage: backMeta["Page"],
    backAnnotationCount: (backAnnotationCount || "").trim(),
    annotationItems,
    debugRequests
  }, null, 2));

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
