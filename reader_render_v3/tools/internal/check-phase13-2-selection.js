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
    const selected = await page.evaluate(() => {
      const paragraph = document.querySelector(".readerpub-unprotected-runtime-paragraph");
      if (!paragraph || !paragraph.firstChild) return false;
      const textNode = paragraph.firstChild;
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, Math.min(24, String(textNode.textContent || "").length));
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
      return true;
    });
    await page.waitForTimeout(700);
    const result = await page.evaluate((selectedOk) => {
      const state = window.__READERPUB_UNPROTECTED_RUNTIME_STATE__ || {};
      return JSON.parse(JSON.stringify({
        ok: !!selectedOk && !!(state.selection && state.selection.active && state.selection.text),
        domainStatus: !!selectedOk && !!(state.selection && state.selection.active && state.selection.text) ? "complete" : "blocked",
        blockers: selectedOk ? [] : ["selection-not-created"],
        warnings: [],
        selection: state.selection || null,
        toolbarVisible: !document.querySelector("#selectionToolbar")?.classList.contains("hidden")
      }));
    }, selected);
    if (!result.toolbarVisible) result.blockers.push("selection-toolbar-hidden");
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
