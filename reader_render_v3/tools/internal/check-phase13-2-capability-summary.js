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
    await page.click("#themeToggle");
    await page.waitForTimeout(400);
    await page.click("#fontInc");
    await page.waitForTimeout(600);
    await page.click("#slider");
    await page.waitForTimeout(400);
    const tocOpen = await page.isVisible("#overlay-toc:not(.hidden)");
    await page.click("#overlay-backdrop");
    await page.waitForTimeout(300);
    const result = await page.evaluate((tocOpenValue) => {
      const state = window.__READERPUB_UNPROTECTED_RUNTIME_STATE__ || {};
      return JSON.parse(JSON.stringify({
        ok: !!tocOpenValue && state.appearance && state.appearance.theme === "dark" && Number(state.appearance.fontScale || 1) > 1,
        domainStatus: !!tocOpenValue ? "complete" : "partial",
        blockers: [],
        warnings: [],
        shell: {
          tocOpen: !!tocOpenValue,
          theme: state.appearance && state.appearance.theme,
          fontScale: state.appearance && state.appearance.fontScale,
          counter: String(document.querySelector("#page-count")?.textContent || "").trim(),
          directRootPresent: !!document.querySelector("[data-readerpub-unprotected-runtime-root='true']")
        },
        corpus: {
          bookId: state.book && state.book.id,
          sectionCount: state.book && state.book.sectionCount,
          currentLocation: state.location || null
        }
      }));
    }, tocOpen);
    if (!result.shell.tocOpen) result.blockers.push("toc-open");
    if (result.shell.theme !== "dark") result.blockers.push("theme-toggle");
    if (!(Number(result.shell.fontScale || 1) > 1)) result.blockers.push("font-scale");
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
