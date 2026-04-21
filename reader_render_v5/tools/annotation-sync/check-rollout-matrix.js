#!/usr/bin/env node

const { chromium } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

function getArgValue(name) {
  for (const item of process.argv.slice(2)) {
    if (item.startsWith(`--${name}=`)) return item.slice(name.length + 3);
  }
  return "";
}

const BASE_URL = getArgValue("base-url") || process.env.READER_V3_BASE_URL || "http://127.0.0.1:8790";
const READER_PATH = getArgValue("reader-path") || (BASE_URL.includes(".pages.dev") ? "/reader/" : "/books/reader/");

function pageUrl(pathname) {
  return `${BASE_URL}${pathname}`;
}

async function getMetaMap(page) {
  return await page.evaluate(() => {
    const dl = document.querySelector("#runtime-meta");
    if (!dl) return {};
    const out = {};
    const children = [...dl.children];
    for (let index = 0; index < children.length; index += 2) {
      const dt = children[index];
      const dd = children[index + 1];
      if (dt && dd) out[dt.textContent.trim()] = dd.textContent.trim();
    }
    return out;
  });
}

async function captureReaderState(page) {
  return await page.evaluate(() => {
    const root = document.querySelector(".reader-frame");
    return {
      url: window.location.href,
      status: (document.querySelector("#status")?.textContent || "").trim(),
      host: (document.querySelector("#runtime-meta dd") ? ((() => {
        const dl = document.querySelector("#runtime-meta");
        const children = [...dl.children];
        for (let index = 0; index < children.length; index += 2) {
          const dt = children[index];
          const dd = children[index + 1];
          if (dt && dd && dt.textContent.trim() === "Reader host") return dd.textContent.trim();
        }
        return "";
      })()) : ""),
      runtimeMetaPresent: !!document.querySelector("#runtime-meta"),
      protectedCanvas: !!document.querySelector("#reader-canvas"),
      frameTags: root ? [...root.children].map((item) => item.tagName) : [],
      frameText: root ? (root.textContent || "").trim() : ""
    };
  });
}

async function runOldReaderScenario(page, pathname) {
  await page.goto(pageUrl(pathname), { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  return await page.evaluate(() => ({
    url: window.location.href,
    protectedCanvas: !!document.querySelector("#reader-canvas"),
    viewerStack: !!document.querySelector("#viewer") || !!document.querySelector(".viewer"),
    pageTextVisible: !!((document.body?.textContent || "").trim()),
    hash: window.location.hash || ""
  }));
}

async function runProtectedScenario(page, pathname) {
  await page.goto(pageUrl(pathname), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    if (document.querySelector("#runtime-meta dt")) return true;
    if (document.querySelector("#reader-canvas")) return true;
    if (window.location.search.includes("protectedFallbackReason=")) return true;
    return false;
  }, { timeout: 15000 });
  await page.waitForFunction(() => {
    if (window.location.search.includes("protectedFallbackReason=")) return true;
    const status = String(document.querySelector("#status")?.textContent || "").trim();
    const runtimeMeta = document.querySelector("#runtime-meta");
    const metaChildren = runtimeMeta ? runtimeMeta.querySelectorAll("dt").length : 0;
    if (/Protected mode is unavailable/i.test(status)) return true;
    if (/Opened chunk-/i.test(status) && metaChildren > 0) return true;
    return false;
  }, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  const state = await captureReaderState(page);
  const meta = await getMetaMap(page);
  return {
    ...state,
    meta
  };
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

  const results = {
    oldReaderDefault: await runOldReaderScenario(page, `${READER_PATH}?id=19686`),
    protectedAllowed: await runProtectedScenario(
      page,
      `${READER_PATH}?id=19686&reader=protected&renderMode=shape&metricsMode=shape`
    ),
    protectedRolloutDisabled: await runProtectedScenario(
      page,
      `${READER_PATH}?id=19686&reader=protected&renderMode=shape&metricsMode=shape&protectedRollout=off`
    ),
    protectedDenylisted: await runProtectedScenario(
      page,
      `${READER_PATH}?id=19686&reader=protected&renderMode=shape&metricsMode=shape&protectedDenyBooks=19686`
    ),
    protectedWorkerUnavailable: await runProtectedScenario(
      page,
      `${READER_PATH}?id=19686&reader=protected&renderMode=shape&metricsMode=shape&worker=disabled`
    ),
    protectedArtifactMissing: await runProtectedScenario(
      page,
      `${READER_PATH}?id=999999&reader=protected&renderMode=shape&metricsMode=shape&protectedAllowAll=1`
    ),
    protectedAllowlistOverride: await runProtectedScenario(
      page,
      `${READER_PATH}?id=19686&reader=protected&renderMode=shape&metricsMode=shape&protectedAllowAll=0&protectedBooks=19686`
    ),
    debugRequests
  };

  console.log(JSON.stringify(results, null, 2));

  await page.close();
  await context.close();
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
