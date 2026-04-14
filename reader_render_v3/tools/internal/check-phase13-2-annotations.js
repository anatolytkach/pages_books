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

    await page.evaluate(() => {
      const paragraph = document.querySelector(".readerpub-unprotected-runtime-paragraph");
      if (!paragraph || !paragraph.firstChild) return;
      const textNode = paragraph.firstChild;
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, Math.min(18, String(textNode.textContent || "").length));
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
    await page.waitForTimeout(500);

    const selectionState = await page.evaluate(() => window.__READERPUB_UNPROTECTED_RUNTIME_ADAPTER__.getSelectionState());
    await page.evaluate(() => window.__READERPUB_UNPROTECTED_RUNTIME_ADAPTER__.createHighlight());
    await page.waitForTimeout(400);

    await page.evaluate((selection) => window.__READERPUB_UNPROTECTED_RUNTIME_ADAPTER__.addNote(selection, "runtime note"), selectionState);
    await page.waitForTimeout(700);

    const result = await page.evaluate(() => {
      const state = window.__READERPUB_UNPROTECTED_RUNTIME_STATE__ || {};
      const items = state.annotations && Array.isArray(state.annotations.items) ? state.annotations.items : [];
      return JSON.parse(JSON.stringify({
        ok: items.length >= 2,
        domainStatus: items.length >= 2 ? "complete" : "blocked",
        blockers: items.length >= 2 ? [] : ["annotations-not-created"],
        warnings: [],
        annotationCount: items.length,
        noteCount: items.filter((item) => item.type === "note").length,
        highlightCount: items.filter((item) => item.type === "highlight").length,
        notesDomCount: document.querySelectorAll("#notes [data-note-id]").length,
        marksOnPage: document.querySelectorAll(".readerpub-unprotected-runtime-highlight-hit, .readerpub-unprotected-runtime-note-hit").length
      }));
    });
    if (result.notesDomCount < 1) result.blockers.push("notes-overlay-empty");
    if (result.marksOnPage < 1) result.blockers.push("annotation-mark-missing");
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
