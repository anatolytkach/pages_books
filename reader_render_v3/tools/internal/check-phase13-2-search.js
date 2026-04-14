#!/usr/bin/env node

const { chromium } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

function getArgValue(name, fallback = "") {
  for (const item of process.argv.slice(2)) {
    if (item.startsWith(`--${name}=`)) return item.slice(name.length + 3);
  }
  return fallback;
}

const URL_TO_CHECK =
  getArgValue("url") ||
  "http://127.0.0.1:8788/reader/?id=19686&unprotectedRuntime=new";
const QUERY = getArgValue("query");
const EXECUTABLE_PATH =
  getArgValue("executable-path") ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function launchBrowser() {
  return chromium.launch({ headless: true, executablePath: EXECUTABLE_PATH });
}

async function waitReady(page) {
  await page.waitForFunction(() => !!(window.__READERPUB_UNPROTECTED_RUNTIME_STATE__ && window.__READERPUB_UNPROTECTED_RUNTIME_STATE__.status === "ready"), { timeout: 20000 });
  await page.waitForTimeout(1000);
}

async function snapshot(page) {
  return page.evaluate(() => {
    const state = window.__READERPUB_UNPROTECTED_RUNTIME_STATE__ || {};
    return JSON.parse(JSON.stringify({
      location: state.location || null,
      search: state.search || null,
      pageCountText: String(document.querySelector("#page-count")?.textContent || "").trim(),
      countDesktop: String(document.querySelector("#searchCountDesktop")?.textContent || "").trim(),
      rootText: String(document.querySelector("[data-readerpub-unprotected-runtime-root='true']")?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 260)
    }));
  });
}

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  try {
    await page.goto(URL_TO_CHECK, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    const initial = await snapshot(page);
    const query = QUERY || (String(initial.location && initial.location.title || "").toLowerCase().indexOf("anne") >= 0 ? "Anne" : "yellow");
    await page.evaluate((value) => {
      const input = document.querySelector("#searchInputDesktop");
      if (input) input.value = value;
      return window.__READERPUB_UNPROTECTED_RUNTIME_ADAPTER__.search(value);
    }, query);
    await waitReady(page);
    const afterSubmit = await snapshot(page);
    await page.evaluate(() => window.__READERPUB_UNPROTECTED_RUNTIME_ADAPTER__.searchNextResult());
    await waitReady(page);
    const afterNext = await snapshot(page);
    await page.evaluate(() => window.__READERPUB_UNPROTECTED_RUNTIME_ADAPTER__.searchPrevResult());
    await waitReady(page);
    const afterPrev = await snapshot(page);
    await page.evaluate(() => window.__READERPUB_UNPROTECTED_RUNTIME_ADAPTER__.clearSearch());
    await waitReady(page);
    const afterClear = await snapshot(page);

    const blockers = [];
    if (!afterSubmit.search || !afterSubmit.search.active) blockers.push("search-not-active");
    if (!afterSubmit.search || Number(afterSubmit.search.totalMatches || 0) < 1) blockers.push("search-no-results");
    if (
      Number(afterSubmit.search && afterSubmit.search.currentMatch || 0) ===
        Number(afterNext.search && afterNext.search.currentMatch || 0) &&
      Number(afterSubmit.search && afterSubmit.search.totalMatches || 0) > 1
    ) {
      blockers.push("search-next-did-not-move");
    }
    if (afterClear.search && afterClear.search.active) blockers.push("search-clear-failed");

    const result = {
      ok: blockers.length === 0,
      domainStatus: blockers.length === 0 ? "complete" : "blocked",
      blockers,
      warnings: [],
      query,
      initial,
      afterSubmit,
      afterNext,
      afterPrev,
      afterClear
    };
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
  } finally {
    await page.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
