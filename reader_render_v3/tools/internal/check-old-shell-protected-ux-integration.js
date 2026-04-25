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
  "http://127.0.0.1:8790/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape";
const OLD_URL = getArgValue("old-url") || "http://127.0.0.1:8790/reader/?id=19686";

async function waitForHostReady(page, timeout = 15000) {
  await page.waitForFunction(() => {
    const frame = document.querySelector("#protectedOldShellFrame");
    try {
      const bridge = frame && frame.contentWindow ? frame.contentWindow.__PROTECTED_READER_BRIDGE__ : null;
      return !!(bridge && bridge.getSummary && bridge.getSummary().ready);
    } catch (error) {
      return false;
    }
  }, { timeout });
}

async function getBridgeSummary(page) {
  return await page.evaluate(() => {
    const frame = document.querySelector("#protectedOldShellFrame");
    const bridge = frame && frame.contentWindow ? frame.contentWindow.__PROTECTED_READER_BRIDGE__ : null;
    if (!bridge || typeof bridge.getSummary !== "function") return null;
    return bridge.getSummary();
  });
}

async function frameInfo(page) {
  return await page.evaluate(() => {
    const frame = document.querySelector("#protectedOldShellFrame");
    const doc = frame && frame.contentDocument ? frame.contentDocument : null;
    const readerFrame = doc ? doc.querySelector(".reader-frame") : null;
    return {
      tags: readerFrame ? [...readerFrame.children].map((node) => node.tagName) : [],
      text: readerFrame ? (readerFrame.textContent || "").trim() : ""
    };
  });
}

async function main() {
  const mark = (step) => console.error(`[old-shell] ${step}`);
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 }
  });
  page.setDefaultTimeout(15000);
  const debugRequests = [];
  page.on("request", (req) => {
    if (req.url().includes("/debug/")) debugRequests.push(req.url());
  });

  mark("goto-protected");
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  mark("wait-host-ready");
  await waitForHostReady(page);

  const oldShellPresent = await page.evaluate(() => {
    return !!(
      document.querySelector("#titlebar") &&
      document.querySelector("#overlay-menu") &&
      document.querySelector("#openNotes") &&
      document.querySelector("#viewerStack")
    );
  });

  let summary = await getBridgeSummary(page);
  const initialPage = summary ? summary.pageLabel : "n/a";
  const initialAnnotations = summary ? summary.annotationCount : -1;

  mark("frame-select");
  await page.evaluate(async () => {
    const frame = document.querySelector("#protectedOldShellFrame");
    const bridge = frame && frame.contentWindow ? frame.contentWindow.__PROTECTED_READER_BRIDGE__ : null;
    if (!bridge || typeof bridge.selectAutomationSample !== "function") {
      throw new Error("selectAutomationSample bridge missing");
    }
    await bridge.selectAutomationSample();
  });
  await page.waitForFunction(() => {
    const frame = document.querySelector("#protectedOldShellFrame");
    const bridge = frame && frame.contentWindow ? frame.contentWindow.__PROTECTED_READER_BRIDGE__ : null;
    const summary = bridge && bridge.getSummary ? bridge.getSummary() : null;
    return !!(summary && summary.selectionActive);
  }, { timeout: 5000 });

  mark("copy");
  await page.evaluate(async () => {
    const frame = document.querySelector("#protectedOldShellFrame");
    const bridge = frame && frame.contentWindow ? frame.contentWindow.__PROTECTED_READER_BRIDGE__ : null;
    if (!bridge || typeof bridge.copySelection !== "function") throw new Error("copySelection bridge missing");
    await bridge.copySelection();
  });
  await page.waitForFunction(() => {
    const frame = document.querySelector("#protectedOldShellFrame");
    const bridge = frame && frame.contentWindow ? frame.contentWindow.__PROTECTED_READER_BRIDGE__ : null;
    const summary = bridge && bridge.getSummary ? bridge.getSummary() : null;
    return !!(summary && /Copied selection/.test(summary.statusText || ""));
  }, { timeout: 5000 });

  mark("highlight");
  await page.evaluate(async () => {
    const frame = document.querySelector("#protectedOldShellFrame");
    const bridge = frame && frame.contentWindow ? frame.contentWindow.__PROTECTED_READER_BRIDGE__ : null;
    if (!bridge || typeof bridge.createHighlight !== "function") throw new Error("createHighlight bridge missing");
    await bridge.createHighlight();
  });
  await page.waitForFunction(() => {
    const frame = document.querySelector("#protectedOldShellFrame");
    const bridge = frame && frame.contentWindow ? frame.contentWindow.__PROTECTED_READER_BRIDGE__ : null;
    const summary = bridge && bridge.getSummary ? bridge.getSummary() : null;
    return !!(summary && /Created highlight/.test(summary.statusText || ""));
  }, { timeout: 5000 });

  mark("note");
  await page.evaluate(async () => {
    const frame = document.querySelector("#protectedOldShellFrame");
    const bridge = frame && frame.contentWindow ? frame.contentWindow.__PROTECTED_READER_BRIDGE__ : null;
    if (!bridge || typeof bridge.addNoteToSelection !== "function") throw new Error("addNoteToSelection bridge missing");
    await bridge.addNoteToSelection("old shell host note");
  });
  await page.waitForFunction(() => {
    const frame = document.querySelector("#protectedOldShellFrame");
    const bridge = frame && frame.contentWindow ? frame.contentWindow.__PROTECTED_READER_BRIDGE__ : null;
    const summary = bridge && bridge.getSummary ? bridge.getSummary() : null;
    return !!(summary && /Added note/.test(summary.statusText || ""));
  }, { timeout: 5000 });

  summary = await getBridgeSummary(page);
  const afterNoteAnnotations = summary.annotationCount;

  mark("open-notes");
  await page.evaluate(() => document.querySelector("#openNotes")?.click());
  await page.waitForFunction(() => !document.querySelector("#overlay-notes")?.classList.contains("hidden"));
  mark("read-notes");
  const notesState = await page.evaluate(() => ({
    count: document.querySelectorAll("#notes li").length,
    hasBookmarkLink: !!document.querySelector("#notes .bookmark_link"),
    hasBookmarkComment: !!document.querySelector("#notes .bookmark-comment")
  }));
  await page.evaluate(() => document.querySelector("#overlay-notes .overlay-close")?.click());
  await page.waitForFunction(() => document.querySelector("#overlay-notes")?.classList.contains("hidden"));

  mark("next");
  await page.click("#next");
  await page.waitForFunction(() => {
    const frame = document.querySelector("#protectedOldShellFrame");
    const bridge = frame && frame.contentWindow ? frame.contentWindow.__PROTECTED_READER_BRIDGE__ : null;
    const summary = bridge && bridge.getSummary ? bridge.getSummary() : null;
    return !!(summary && summary.pageLabel === "2 / 2");
  }, { timeout: 5000 });
  const afterNext = await getBridgeSummary(page);

  mark("prev");
  await page.click("#prev");
  await page.waitForFunction(() => {
    const frame = document.querySelector("#protectedOldShellFrame");
    const bridge = frame && frame.contentWindow ? frame.contentWindow.__PROTECTED_READER_BRIDGE__ : null;
    const summary = bridge && bridge.getSummary ? bridge.getSummary() : null;
    return !!(summary && summary.pageLabel === "1 / 2");
  }, { timeout: 5000 });
  const afterPrev = await getBridgeSummary(page);

  mark("reload");
  await page.reload({ waitUntil: "domcontentloaded" });
  mark("wait-host-ready-reload");
  await waitForHostReady(page);
  const afterReload = await getBridgeSummary(page);

  mark("reopen");
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  mark("wait-host-ready-reopen");
  await waitForHostReady(page);
  const afterReopen = await getBridgeSummary(page);

  mark("security");
  const security = await frameInfo(page);

  mark("goto-old");
  await page.goto(OLD_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!document.querySelector("#viewerStack"));
  const oldRouteState = await page.evaluate(() => ({
    hasProtectedHost: !!document.querySelector("#protectedOldShellFrame"),
    hasViewerStack: !!document.querySelector("#viewerStack"),
    oldTextVisible: !!((document.querySelector("#viewer")?.textContent || "").trim().length)
  }));

  console.log(JSON.stringify({
    ok: true,
    route: URL,
    oldShellPresent,
    protectedEngineActive: !!(summary && summary.readerMode === "protected"),
    embeddedMode: !!(summary && summary.embeddedMode),
    driveBlocking: false,
    driveStatus: summary ? summary.driveStatus : null,
    initialPage,
    afterNoteAnnotations,
    afterNextPage: afterNext ? afterNext.pageLabel : "n/a",
    afterPrevPage: afterPrev ? afterPrev.pageLabel : "n/a",
    afterReloadPage: afterReload ? afterReload.pageLabel : "n/a",
    afterReopenPage: afterReopen ? afterReopen.pageLabel : "n/a",
    initialAnnotations,
    notesState,
    afterPrevAnnotations: afterPrev ? afterPrev.annotationCount : -1,
    afterReloadAnnotations: afterReload ? afterReload.annotationCount : -1,
    afterReopenAnnotations: afterReopen ? afterReopen.annotationCount : -1,
    frameInfo: security,
    debugRequests,
    oldRouteState
  }, null, 2));

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
