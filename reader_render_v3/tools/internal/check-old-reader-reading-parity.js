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

async function waitForHostControlsReady(page, timeout = 10000) {
  await page.waitForFunction(() => {
    const fontInc = document.getElementById("fontInc");
    const fontDec = document.getElementById("fontDec");
    const counter = document.getElementById("page-count");
    return !!(
      fontInc &&
      fontDec &&
      fontInc.getAttribute("aria-disabled") !== "true" &&
      fontDec.getAttribute("aria-disabled") !== "true" &&
      counter &&
      (counter.textContent || "").trim().length
    );
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

async function waitForSummary(page, predicate, timeout = 5000) {
  await page.waitForFunction(
    (predSource) => {
      const frame = document.querySelector("#protectedOldShellFrame");
      try {
        const bridge = frame && frame.contentWindow ? frame.contentWindow.__PROTECTED_READER_BRIDGE__ : null;
        const summary = bridge && bridge.getSummary ? bridge.getSummary() : null;
        if (!summary) return false;
        const pred = new Function("summary", `return (${predSource})(summary);`);
        return !!pred(summary);
      } catch (error) {
        return false;
      }
    },
    predicate.toString(),
    { timeout }
  );
  return getBridgeSummary(page);
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
  const mark = (step) => console.error(`[reading-parity] ${step}`);
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
  mark("wait-host-controls");
  await waitForHostControlsReady(page);

  const initial = await getBridgeSummary(page);

  mark("font-inc");
  await page.click("#fontInc");
  const afterFontInc = await waitForSummary(page, (summary) => summary.fontScale > 1);
  mark("font-dec");
  await page.click("#fontDec");
  const afterFontReset = await waitForSummary(page, (summary) => Math.abs((summary.fontScale || 1) - 1) < 0.001);

  const reflow = {
    initialFontScale: initial.fontScale,
    afterIncFontScale: afterFontInc.fontScale,
    initialOffsets: `${initial.pageGlobalStartOffset}..${initial.pageGlobalEndOffset}`,
    afterIncOffsets: `${afterFontInc.pageGlobalStartOffset}..${afterFontInc.pageGlobalEndOffset}`,
    initialGlobalLabel: initial.globalPageLabel,
    afterIncGlobalLabel: afterFontInc.globalPageLabel,
    changed: (
      afterFontInc.fontScale !== initial.fontScale &&
      (
        afterFontInc.pageGlobalEndOffset !== initial.pageGlobalEndOffset ||
        afterFontInc.pageGlobalStartOffset !== initial.pageGlobalStartOffset ||
        afterFontInc.globalPageCount !== initial.globalPageCount
      )
    )
  };

  mark("select-sample");
  await page.evaluate(async () => {
    const frame = document.querySelector("#protectedOldShellFrame");
    const bridge = frame && frame.contentWindow ? frame.contentWindow.__PROTECTED_READER_BRIDGE__ : null;
    if (!bridge || typeof bridge.selectAutomationSample !== "function") throw new Error("selectAutomationSample bridge missing");
    await bridge.selectAutomationSample();
  });
  await waitForSummary(page, (summary) => !!summary.selectionActive);

  mark("contextmenu");
  const contextMenu = await page.evaluate(() => {
    const frame = document.querySelector("#protectedOldShellFrame");
    const doc = frame && frame.contentDocument ? frame.contentDocument : null;
    const canvas = doc ? doc.querySelector(".reader-frame canvas") : null;
    const toolbar = document.getElementById("selectionToolbar");
    if (!canvas || !toolbar) throw new Error("Protected surface or selection toolbar missing");
    const rect = canvas.getBoundingClientRect();
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: Math.round(rect.left + rect.width * 0.55),
      clientY: Math.round(rect.top + rect.height * 0.45),
      button: 2
    });
    const dispatchReturned = canvas.dispatchEvent(event);
    return {
      dispatchReturned,
      defaultPrevented: event.defaultPrevented,
      toolbarVisible: !toolbar.classList.contains("hidden")
    };
  });

  mark("toolbar-note");
  await page.click('#selectionToolbar [data-action="note"]');
  await page.waitForFunction(() => !document.querySelector("#commentSheet")?.classList.contains("hidden"));
  await page.fill("#commentInput", "reading parity note");
  await page.click("#commentSave");
  const afterNote = await waitForSummary(page, (summary) => (summary.annotationCount || 0) >= 1);
  const createdNote = (afterNote.annotations || []).find((annotation) => annotation.type === "note" && annotation.noteText === "reading parity note") || null;

  mark("note-jump");
  await page.evaluate(() => document.querySelector("#openNotes")?.click());
  await page.waitForFunction(() => !document.querySelector("#overlay-notes")?.classList.contains("hidden"));
  await page.evaluate((noteText) => {
    const links = [...document.querySelectorAll("#notes .bookmark_link")];
    const target = links.find((link) => (link.textContent || "").trim() === noteText) || links[0] || null;
    if (!target) throw new Error("No note link found in notes list");
    target.click();
  }, createdNote ? createdNote.noteText : "reading parity note");
  let afterNoteJump = null;
  try {
    afterNoteJump = await waitForSummary(
      page,
      (summary) => !!summary.focusedAnnotationId && (summary.focusHighlightCount || 0) > 0,
      7000
    );
  } catch (error) {
    console.error("[reading-parity] note-jump-timeout-summary", JSON.stringify(await getBridgeSummary(page)));
    throw error;
  }

  mark("page-turn-next");
  const beforeBoundary = await getBridgeSummary(page);
  let boundaryCrossed = null;
  const pageTurn = {
    beforeBoundaryChunk: beforeBoundary.chunkOrder,
    beforeBoundaryGlobalPage: beforeBoundary.globalPageLabel,
    turnPreviewSeen: false,
    transitionLayerSeen: false
  };
  for (let step = 0; step < 8; step += 1) {
    await page.click("#next");
    try {
      await page.waitForFunction(() => {
        const body = document.body;
        return body.classList.contains("turn-preview-next") || !!document.querySelector("#viewer-next .protected-turn-layer canvas");
      }, { timeout: 1000 });
      pageTurn.turnPreviewSeen = true;
      pageTurn.transitionLayerSeen = true;
    } catch (error) {}
    const nextSummary = await waitForSummary(
      page,
      (summary) => (summary.globalPageIndex || 0) > 0,
      5000
    );
    if (nextSummary.chunkOrder > beforeBoundary.chunkOrder) {
      boundaryCrossed = nextSummary;
      break;
    }
  }
  if (!boundaryCrossed) {
    boundaryCrossed = await getBridgeSummary(page);
  }
  pageTurn.afterBoundaryChunk = boundaryCrossed.chunkOrder;
  pageTurn.afterBoundaryGlobalPage = boundaryCrossed.globalPageLabel;
  pageTurn.crossedChapterBoundary = boundaryCrossed.chunkOrder > beforeBoundary.chunkOrder;

  mark("page-turn-prev");
  let backAcrossBoundary = null;
  for (let step = 0; step < 8; step += 1) {
    await page.click("#prev");
    const prevSummary = await waitForSummary(
      page,
      (summary) => (summary.globalPageIndex || 0) >= 1,
      5000
    );
    if (prevSummary.chunkOrder <= beforeBoundary.chunkOrder) {
      backAcrossBoundary = prevSummary;
      break;
    }
  }
  if (!backAcrossBoundary) {
    backAcrossBoundary = await getBridgeSummary(page);
  }
  pageTurn.afterBackChunk = backAcrossBoundary.chunkOrder;
  pageTurn.afterBackGlobalPage = backAcrossBoundary.globalPageLabel;
  pageTurn.prevAcrossBoundary = backAcrossBoundary.chunkOrder <= beforeBoundary.chunkOrder;

  const globalCounter = await page.evaluate(() => ({
    visibleCounter: (document.querySelector("#page-count")?.textContent || "").trim(),
    chapterLine: (document.querySelector("#chapter-title")?.textContent || "").trim()
  }));

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

  const report = {
    ok: true,
    route: URL,
    reflow,
    contextMenu,
    noteJump: {
      createdNoteId: createdNote ? createdNote.annotationId : "",
      focusedAnnotationId: afterNoteJump.focusedAnnotationId,
      focusHighlightCount: afterNoteJump.focusHighlightCount,
      globalPageLabel: afterNoteJump.globalPageLabel
    },
    globalCounter: {
      visibleCounter: globalCounter.visibleCounter,
      chapterLine: globalCounter.chapterLine,
      summaryGlobalLabel: backAcrossBoundary.globalPageLabel,
      globalPageCount: backAcrossBoundary.globalPageCount,
      localPageLabel: backAcrossBoundary.localPageLabel
    },
    pageTurn,
    security: {
      frameInfo: security,
      debugRequests
    },
    oldRouteState
  };

  const regressions = [];
  if (!reflow.changed) regressions.push("reflow-font-size-not-changing-layout");
  if (!contextMenu.defaultPrevented || !contextMenu.toolbarVisible) regressions.push("context-note-popup-not-restored");
  if (!report.noteJump.createdNoteId) regressions.push("note-creation-missing");
  if (report.noteJump.focusedAnnotationId !== report.noteJump.createdNoteId) regressions.push("note-jump-focus-mismatch");
  if (!(report.noteJump.focusHighlightCount > 0)) regressions.push("note-jump-highlight-missing");
  if (report.globalCounter.visibleCounter !== report.globalCounter.summaryGlobalLabel) regressions.push("global-counter-out-of-sync");
  if (!(report.globalCounter.globalPageCount > 2)) regressions.push("global-counter-not-book-wide");
  if (!pageTurn.turnPreviewSeen || !pageTurn.transitionLayerSeen) regressions.push("page-turn-underlay-missing");
  if (!pageTurn.crossedChapterBoundary) regressions.push("chapter-boundary-next-broken");
  if (!pageTurn.prevAcrossBoundary) regressions.push("chapter-boundary-prev-broken");
  if (JSON.stringify(security.tags || []) !== JSON.stringify(["CANVAS", "CANVAS"])) regressions.push("surface-not-canvas-only");
  if (security.text) regressions.push("surface-text-leak");
  if (debugRequests.length) regressions.push("debug-request-detected");
  if (oldRouteState.hasProtectedHost || !oldRouteState.hasViewerStack) regressions.push("old-reader-regression");
  report.regressions = regressions;
  report.ok = regressions.length === 0;

  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
