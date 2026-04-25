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

async function waitForHostReady(page, timeout = 20000) {
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

async function waitForHostControlsReady(page, timeout = 12000) {
  await page.waitForFunction(() => {
    const pageCount = (document.querySelector("#page-count")?.textContent || "").trim();
    return !!(
      document.querySelector("#fontInc") &&
      document.querySelector("#fontDec") &&
      document.querySelector("#searchActionDesktop") &&
      document.querySelector("#themeToggle") &&
      pageCount
    );
  }, { timeout });
}

async function getSummary(page) {
  return page.evaluate(() => {
    const frame = document.querySelector("#protectedOldShellFrame");
    const bridge = frame && frame.contentWindow ? frame.contentWindow.__PROTECTED_READER_BRIDGE__ : null;
    return bridge && typeof bridge.getSummary === "function" ? bridge.getSummary() : null;
  });
}

async function waitForSummary(page, predicate, timeout = 8000) {
  await page.waitForFunction(
    (source) => {
      const frame = document.querySelector("#protectedOldShellFrame");
      try {
        const bridge = frame && frame.contentWindow ? frame.contentWindow.__PROTECTED_READER_BRIDGE__ : null;
        const summary = bridge && bridge.getSummary ? bridge.getSummary() : null;
        if (!summary) return false;
        const fn = new Function("summary", `return (${source})(summary);`);
        return !!fn(summary);
      } catch (error) {
        return false;
      }
    },
    predicate.toString(),
    { timeout }
  );
  return getSummary(page);
}

async function waitForSummaryChange(page, previousLabel, previousChunkOrder, timeout = 8000) {
  await page.waitForFunction(
    ({ expectedLabel, expectedChunkOrder }) => {
      const frame = document.querySelector("#protectedOldShellFrame");
      try {
        const bridge = frame && frame.contentWindow ? frame.contentWindow.__PROTECTED_READER_BRIDGE__ : null;
        const summary = bridge && bridge.getSummary ? bridge.getSummary() : null;
        if (!summary) return false;
        return summary.globalPageLabel !== expectedLabel || summary.chunkOrder !== expectedChunkOrder;
      } catch (error) {
        return false;
      }
    },
    { expectedLabel: previousLabel, expectedChunkOrder: previousChunkOrder },
    { timeout }
  );
  return getSummary(page);
}

async function waitForViewportReflow(page, previousViewportWidth, previousOffsets, timeout = 8000) {
  await page.waitForFunction(
    ({ width, offsets }) => {
      const frame = document.querySelector("#protectedOldShellFrame");
      try {
        const bridge = frame && frame.contentWindow ? frame.contentWindow.__PROTECTED_READER_BRIDGE__ : null;
        const summary = bridge && bridge.getSummary ? bridge.getSummary() : null;
        if (!summary) return false;
        const nextOffsets = `${summary.pageGlobalStartOffset || 0}..${summary.pageGlobalEndOffset || 0}`;
        return Number(summary.viewportWidth || 0) !== Number(width || 0) || nextOffsets !== offsets;
      } catch (error) {
        return false;
      }
    },
    { width: previousViewportWidth, offsets: previousOffsets },
    { timeout }
  );
  return getSummary(page);
}

async function waitForFooterSync(page, expected, timeout = 4000) {
  await page.waitForFunction(
    (value) => ((document.querySelector("#page-count")?.textContent || "").trim() === value),
    expected,
    { timeout }
  );
}

async function getLoaderState(page) {
  return page.evaluate(() => {
    const loader = document.querySelector("#loader");
    if (!loader) return { present: false, visible: false };
    const style = window.getComputedStyle(loader);
    return {
      present: true,
      visible: style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0
    };
  });
}

async function getSurfaceInfo(page) {
  return page.evaluate(() => {
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
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(20000);
  const debugRequests = [];
  page.on("request", (req) => {
    if (req.url().includes("/debug/")) debugRequests.push(req.url());
  });

  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await waitForHostReady(page);
  await waitForHostControlsReady(page);

  const initialSummary = await getSummary(page);
  const loaderAfterReady = await getLoaderState(page);

  await page.click("#fontInc");
  const afterFontInc = await waitForSummary(page, (summary) => summary.fontScale > 1);
  await waitForFooterSync(page, afterFontInc.globalPageLabel);

  await page.setViewportSize({ width: 1120, height: 980 });
  const afterResize = await waitForViewportReflow(
    page,
    afterFontInc.viewportWidth,
    `${afterFontInc.pageGlobalStartOffset}..${afterFontInc.pageGlobalEndOffset}`
  );
  await waitForFooterSync(page, afterResize.globalPageLabel);

  await page.click("#fontDec");
  const afterFontReset = await waitForSummary(page, (summary) => Math.abs((summary.fontScale || 1) - 1) < 0.001);
  await waitForFooterSync(page, afterFontReset.globalPageLabel);

  await page.evaluate(async () => {
    const frame = document.querySelector("#protectedOldShellFrame");
    const bridge = frame && frame.contentWindow ? frame.contentWindow.__PROTECTED_READER_BRIDGE__ : null;
    if (!bridge || typeof bridge.selectAutomationSample !== "function") throw new Error("selectAutomationSample bridge missing");
    await bridge.selectAutomationSample();
  });
  const selectionBeforeContext = await waitForSummary(page, (summary) => !!summary.selectionActive && (summary.selectedChars || 0) > 1);

  const contextFlow = await page.evaluate(() => {
    const frame = document.querySelector("#protectedOldShellFrame");
    const doc = frame && frame.contentDocument ? frame.contentDocument : null;
    const canvas = doc ? doc.querySelector(".reader-frame canvas") : null;
    const toolbar = document.querySelector("#selectionToolbar");
    if (!canvas || !toolbar) throw new Error("Protected selection surface missing");
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

  const selectionAfterContext = await getSummary(page);
  await page.click('#selectionToolbar [data-action="note"]');
  await page.waitForFunction(() => !document.querySelector("#commentSheet")?.classList.contains("hidden"));
  const noteComposerState = await page.evaluate(() => {
    const sheet = document.querySelector("#commentSheet");
    const toolbar = document.querySelector("#selectionToolbar");
    const input = document.querySelector("#commentInput");
    return {
      sheetVisible: !!sheet && !sheet.classList.contains("hidden"),
      toolbarHidden: !!toolbar && toolbar.classList.contains("hidden"),
      inputVisible: !!input && !!input.offsetParent
    };
  });
  const beforeNoteCount = Number((await getSummary(page)).annotationCount || 0);
  await page.fill("#commentInput", "full parity note");
  await page.evaluate(() => document.querySelector("#commentSave")?.click());
  const afterNote = await waitForSummary(
    page,
    (summary) =>
      (summary.annotationCount || 0) > 0 &&
      Array.isArray(summary.annotations) &&
      summary.annotations.some((annotation) => annotation.type === "note" && annotation.noteText === "full parity note"),
    10000
  );
  const createdNote = (afterNote.annotations || []).find((annotation) => annotation.type === "note" && annotation.noteText === "full parity note");

  await page.evaluate(() => document.querySelector("#openNotes")?.click());
  await page.waitForFunction(() => !document.querySelector("#overlay-notes")?.classList.contains("hidden"));
  await page.waitForFunction(() => document.querySelectorAll("#notes .bookmark-delete").length > 0, { timeout: 5000 });
  await page.evaluate((annotationId) => {
    const items = [...document.querySelectorAll("#notes .bookmark-item")];
    const target = items.find((item) => item.getAttribute("data-annotation-id") === annotationId)
      || [...document.querySelectorAll("#notes .list_item")].find((item) => item.getAttribute("data-annotation-id") === annotationId)
      || [...document.querySelectorAll("#notes .list_item")][0]
      || items[0]
      || null;
    const button = target ? target.querySelector(".bookmark-delete") : null;
    if (!button) throw new Error("No note jump button found");
    button.click();
  }, createdNote ? createdNote.annotationId : "");
  const afterNoteJump = await waitForSummary(
    page,
    (summary) => !!summary.focusedAnnotationId && (summary.focusHighlightCount || 0) > 0,
    8000
  );
  await waitForFooterSync(page, afterNoteJump.globalPageLabel);
  await page.waitForFunction(() => document.querySelector("#overlay-notes")?.classList.contains("hidden"));

  const beforeBoundary = await getSummary(page);
  const pageTurn = {
    startChunkOrder: beforeBoundary.chunkOrder,
    startGlobalPageLabel: beforeBoundary.globalPageLabel,
    previewSeen: false,
    crossedChapterBoundary: false,
    prevAcrossBoundary: false
  };
  let crossed = beforeBoundary;
  for (let i = 0; i < 12; i += 1) {
    const previousLabel = crossed.globalPageLabel;
    const previousChunkOrder = crossed.chunkOrder;
    await page.click("#next");
    try {
      await page.waitForFunction(() => document.body.classList.contains("turn-preview-next") || !!document.querySelector("#viewer-next .protected-turn-layer canvas"), { timeout: 1200 });
      pageTurn.previewSeen = true;
    } catch (error) {}
    crossed = await waitForSummaryChange(page, previousLabel, previousChunkOrder, 7000);
    await waitForFooterSync(page, crossed.globalPageLabel);
    if (crossed.chunkOrder > beforeBoundary.chunkOrder) {
      pageTurn.crossedChapterBoundary = true;
      break;
    }
  }
  pageTurn.afterBoundaryChunkOrder = crossed.chunkOrder;
  pageTurn.afterBoundaryGlobalPageLabel = crossed.globalPageLabel;
  const loaderAfterBoundary = await getLoaderState(page);

  let back = crossed;
  for (let i = 0; i < 12; i += 1) {
    const previousLabel = back.globalPageLabel;
    const previousChunkOrder = back.chunkOrder;
    await page.click("#prev");
    back = await waitForSummaryChange(page, previousLabel, previousChunkOrder, 7000);
    await waitForFooterSync(page, back.globalPageLabel);
    if (back.chunkOrder <= beforeBoundary.chunkOrder) {
      pageTurn.prevAcrossBoundary = true;
      break;
    }
  }
  pageTurn.afterBackChunkOrder = back.chunkOrder;
  pageTurn.afterBackGlobalPageLabel = back.globalPageLabel;

  const counterState = await page.evaluate(() => ({
    visibleCounter: (document.querySelector("#page-count")?.textContent || "").trim(),
    chapterLine: (document.querySelector("#chapter-title")?.textContent || "").trim()
  }));

  const security = await getSurfaceInfo(page);

  await page.goto(OLD_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!document.querySelector("#viewerStack"));
  const oldRouteState = await page.evaluate(() => ({
    hasProtectedHost: !!document.querySelector("#protectedOldShellFrame"),
    hasViewerStack: !!document.querySelector("#viewerStack"),
    hasOldSearch: !!document.querySelector("#searchOpen"),
    hasOldTheme: !!document.querySelector("#themeToggle")
  }));

  const report = {
    ok: true,
    route: URL,
    oldRoute: OLD_URL,
    metadata: {
      title: initialSummary.bookTitle,
      author: initialSummary.bookAuthor,
      coverUrlPresent: !!initialSummary.coverUrl
    },
    reflow: {
      initialFontScale: initialSummary.fontScale,
      afterFontIncScale: afterFontInc.fontScale,
      afterFontResetScale: afterFontReset.fontScale,
      initialViewportWidth: initialSummary.viewportWidth,
      afterResizeViewportWidth: afterResize.viewportWidth,
      initialLineCount: initialSummary.currentPageLineCount,
      afterFontIncLineCount: afterFontInc.currentPageLineCount,
      afterResizeLineCount: afterResize.currentPageLineCount,
      initialOffsets: `${initialSummary.pageGlobalStartOffset}..${initialSummary.pageGlobalEndOffset}`,
      afterFontIncOffsets: `${afterFontInc.pageGlobalStartOffset}..${afterFontInc.pageGlobalEndOffset}`,
      afterResizeOffsets: `${afterResize.pageGlobalStartOffset}..${afterResize.pageGlobalEndOffset}`
    },
    loader: {
      afterReady: loaderAfterReady,
      afterBoundaryTurn: loaderAfterBoundary
    },
    noteFlow: {
      beforeNoteCount,
      afterNoteCount: afterNote.annotationCount,
      selectedCharsBeforeContext: selectionBeforeContext.selectedChars,
      selectedCharsAfterContext: selectionAfterContext.selectedChars,
      contextDefaultPrevented: contextFlow.defaultPrevented,
      toolbarVisible: contextFlow.toolbarVisible,
      noteComposerState
    },
    noteJump: {
      createdNoteId: createdNote ? createdNote.annotationId : "",
      focusedAnnotationId: afterNoteJump.focusedAnnotationId,
      focusHighlightCount: afterNoteJump.focusHighlightCount,
      globalPageLabel: afterNoteJump.globalPageLabel
    },
    globalCounter: {
      visibleCounter: counterState.visibleCounter,
      chapterLine: counterState.chapterLine,
      summaryGlobalLabel: back.globalPageLabel,
      globalPageCount: back.globalPageCount,
      localPageLabel: back.localPageLabel
    },
    pageTurn,
    security: {
      frameInfo: security,
      debugRequests
    },
    oldRouteState
  };

  const regressions = [];
  const reflowChanged = (
    afterFontInc.fontScale !== initialSummary.fontScale &&
    (
      afterFontInc.currentPageLineCount !== initialSummary.currentPageLineCount ||
      afterFontInc.pageGlobalEndOffset !== initialSummary.pageGlobalEndOffset ||
      afterFontInc.pageGlobalStartOffset !== initialSummary.pageGlobalStartOffset
    )
  );
  const resizeChanged = (
    afterResize.viewportWidth !== afterFontInc.viewportWidth &&
    (
      afterResize.currentPageLineCount !== afterFontInc.currentPageLineCount ||
      afterResize.pageGlobalEndOffset !== afterFontInc.pageGlobalEndOffset ||
      afterResize.pageGlobalStartOffset !== afterFontInc.pageGlobalStartOffset
    )
  );
  if (!reflowChanged) regressions.push("font-reflow-not-changing-layout");
  if (!resizeChanged) regressions.push("viewport-resize-not-changing-layout");
  if (loaderAfterReady.visible) regressions.push("loader-visible-after-ready");
  if (loaderAfterBoundary.visible) regressions.push("loader-visible-after-page-turn");
  if (!contextFlow.defaultPrevented || !contextFlow.toolbarVisible) regressions.push("custom-context-popup-not-restored");
  if (selectionAfterContext.selectedChars < selectionBeforeContext.selectedChars) regressions.push("selection-collapsed-on-context-open");
  if (!noteComposerState.sheetVisible || !noteComposerState.inputVisible || !noteComposerState.toolbarHidden) regressions.push("note-composer-overlap-broken");
  if (!report.noteJump.createdNoteId) regressions.push("note-creation-missing");
  if (report.noteJump.focusedAnnotationId !== report.noteJump.createdNoteId) regressions.push("note-jump-focus-mismatch");
  if (!(report.noteJump.focusHighlightCount > 0)) regressions.push("note-jump-highlight-missing");
  if (report.globalCounter.visibleCounter !== report.globalCounter.summaryGlobalLabel) regressions.push("global-counter-out-of-sync");
  if (!(report.globalCounter.globalPageCount > 2)) regressions.push("global-counter-not-book-wide");
  if (!pageTurn.previewSeen) regressions.push("page-turn-preview-missing");
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
