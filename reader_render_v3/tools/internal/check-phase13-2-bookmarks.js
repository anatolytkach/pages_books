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
const EXECUTABLE_PATH =
  getArgValue("executable-path") ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function launchBrowser() {
  return chromium.launch({ headless: true, executablePath: EXECUTABLE_PATH });
}

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  try {
    await page.goto(URL_TO_CHECK, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!(window.__READERPUB_UNPROTECTED_RUNTIME_STATE__ && window.__READERPUB_UNPROTECTED_RUNTIME_STATE__.status === "ready"), { timeout: 20000 });
    await page.waitForTimeout(1000);
    const firstToken = await page.evaluate(() => window.__READERPUB_UNPROTECTED_RUNTIME_STATE__.location.pageToken);
    await page.evaluate(() => window.__READERPUB_UNPROTECTED_RUNTIME_ADAPTER__.toggleBookmark());
    await page.waitForTimeout(300);
    await page.click("#next");
    await page.waitForTimeout(800);
    await page.evaluate(() => window.__READERPUB_UNPROTECTED_RUNTIME_ADAPTER__.toggleBookmark());
    await page.waitForTimeout(300);
    const secondToken = await page.evaluate(() => window.__READERPUB_UNPROTECTED_RUNTIME_STATE__.location.pageToken);
    await page.evaluate(() => window.__READERPUB_UNPROTECTED_RUNTIME_ADAPTER__.goToBookmark((window.__READERPUB_UNPROTECTED_RUNTIME_STATE__.bookmarks.items || [])[0].id));
    await page.waitForTimeout(1000);
    const result = await page.evaluate(({ expectedFirst, expectedSecond }) => {
      const state = window.__READERPUB_UNPROTECTED_RUNTIME_STATE__ || {};
      const items = state.bookmarks && Array.isArray(state.bookmarks.items) ? state.bookmarks.items : [];
      return JSON.parse(JSON.stringify({
        ok: items.length >= 2 && items.some((item) => item.pageToken === expectedFirst) && items.some((item) => item.pageToken === expectedSecond),
        domainStatus: items.length >= 2 ? "complete" : "blocked",
        blockers: [],
        warnings: [],
        bookmarkCount: items.length,
        currentPageToken: state.location && state.location.pageToken,
        expectedFirst,
        expectedSecond,
        bookmarksDomCount: document.querySelectorAll("#bookmarks [data-bookmark-id]").length
      }));
    }, { expectedFirst: firstToken, expectedSecond: secondToken });
    if (result.bookmarkCount < 2) result.blockers.push("bookmark-count");
    if (result.bookmarksDomCount < 2) result.blockers.push("bookmark-overlay");
    result.ok = result.blockers.length === 0;
    if (!result.ok) result.domainStatus = "blocked";
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
