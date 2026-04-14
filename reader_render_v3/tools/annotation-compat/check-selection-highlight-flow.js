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

function parsePageLabel(label = "") {
  const match = String(label).trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) return null;
  return {
    index: Number(match[1]),
    total: Number(match[2])
  };
}

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

async function getPageState(page) {
  return await page.evaluate(() => {
    const dl = document.querySelector("#runtime-meta");
    const out = {};
    if (dl) {
      const children = [...dl.children];
      for (let i = 0; i < children.length; i += 2) {
        const dt = children[i];
        const dd = children[i + 1];
        if (dt && dd) out[dt.textContent.trim()] = dd.textContent.trim();
      }
    }
    return {
      page: out["Page"] || "n/a",
      globalOffset: out["Global offset"] || "n/a",
      order: out["Order"] || "n/a",
      status: (document.querySelector("#status")?.textContent || "").trim()
    };
  });
}

async function waitForExactPage(page, expectedPage, previousGlobalOffset = null, expectedOrder = null) {
  await page.waitForFunction(
    ({ expectedPage, previousGlobalOffset, expectedOrder }) => {
      const dl = document.querySelector("#runtime-meta");
      if (!dl) return false;
      const children = [...dl.children];
      const values = {};
      for (let i = 0; i < children.length; i += 2) {
        const dt = children[i];
        const dd = children[i + 1];
        if (dt && dd) values[dt.textContent.trim()] = dd.textContent.trim();
      }
      const pageValue = values["Page"] || "";
      const globalOffsetValue = values["Global offset"] || "";
      const orderValue = values["Order"] || "";
      if (pageValue !== expectedPage) return false;
      if (expectedOrder != null && orderValue !== expectedOrder) return false;
      if (previousGlobalOffset == null) return true;
      return globalOffsetValue !== previousGlobalOffset;
    },
    { expectedPage, previousGlobalOffset, expectedOrder }
  );
}

async function waitForStateChange(page, previousState, timeout = 30000) {
  await page.waitForFunction(
    ({ previousPage, previousOrder, previousGlobalOffset }) => {
      const dl = document.querySelector("#runtime-meta");
      if (!dl) return false;
      const children = [...dl.children];
      const values = {};
      for (let i = 0; i < children.length; i += 2) {
        const dt = children[i];
        const dd = children[i + 1];
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
  const debugSelected = await page.evaluate(async () => {
    const debug = window.__PROTECTED_READER_DEBUG__;
    if (!debug || typeof debug.selectAutomationSample !== "function") return false;
    try {
      await debug.selectAutomationSample();
      const kind = document.querySelector("#selection-kind");
      return !!(kind && /range/i.test(kind.textContent || ""));
    } catch (_error) {
      return false;
    }
  });
  if (debugSelected) return true;
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

  const page = await browser.newPage();
  const debugRequests = [];
  page.on("request", (req) => {
    if (req.url().includes("/debug/")) debugRequests.push(req.url());
  });

  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await waitReady(page);
  const initialState = await getPageState(page);

  const selected = await ensureRangeSelection(page);
  if (!selected) throw new Error("Failed to create a range selection in the protected reader.");

  const selectionMeta = await page.evaluate(() => {
    const dl = document.querySelector("#selection-meta");
    return dl ? dl.textContent : "";
  });

  await triggerHarnessControl(page, "#copy-selection");
  await page.waitForFunction(() => {
    const status = document.querySelector("#status");
    return status && /Copied selection/.test(status.textContent || "");
  });
  const afterCopyStatus = await page.locator("#status").textContent();

  await triggerHarnessControl(page, "#create-highlight");
  await page.waitForFunction(() => {
    const status = document.querySelector("#status");
    return status && /Created highlight/.test(status.textContent || "");
  });
  const afterHighlightStatus = await page.locator("#status").textContent();
  const afterHighlightMeta = await getMetaMap(page);
  await setHarnessInputValue(page, "#note-input", "selection api smoke note");
  await triggerHarnessControl(page, "#add-note-selection");
  await page.waitForFunction(() => {
    const status = document.querySelector("#status");
    return status && /Added note/.test(status.textContent || "");
  });
  const afterNoteStatus = await page.locator("#status").textContent();
  const initialAnnotationCount = await page.locator("#annotation-count").textContent();

  await triggerHarnessControl(page, "#next-page");
  const initialPage = parsePageLabel(initialState.page);
  if (initialPage && initialPage.total >= 2) {
    await waitForExactPage(
      page,
      `${Math.min(initialPage.index + 1, initialPage.total)} / ${initialPage.total}`,
      initialState.globalOffset
    );
  } else {
    await waitForStateChange(page, initialState);
  }
  const pageTwoMeta = await getMetaMap(page);
  const pageTwoState = await getPageState(page);

  await triggerHarnessControl(page, "#prev-page");
  await waitForExactPage(page, initialState.page, pageTwoState.globalOffset, initialState.order);
  const backMeta = await getMetaMap(page);
  const backState = await getPageState(page);
  const backAnnotationCount = await page.locator("#annotation-count").textContent();
  const annotationItems = await page.locator(".annotation-item").count();

  console.log(JSON.stringify({
    selectionMetaIncludesRange: /range/i.test(selectionMeta),
    initialPage: initialState.page,
    initialGlobalOffset: initialState.globalOffset,
    afterCopyStatus: (afterCopyStatus || "").trim(),
    afterHighlightStatus: (afterHighlightStatus || "").trim(),
    afterNoteStatus: (afterNoteStatus || "").trim(),
    initialAnnotationCount: (initialAnnotationCount || "").trim(),
    afterHighlightAnnotations: afterHighlightMeta["Annotations"],
    pageTwoPage: pageTwoMeta["Page"],
    pageTwoGlobalOffset: pageTwoState.globalOffset,
    backPage: backMeta["Page"],
    backGlobalOffset: backState.globalOffset,
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
