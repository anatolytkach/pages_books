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
      document.querySelector("#bookmark") &&
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

async function waitForSummary(page, predicate, timeout = 8000, arg = null) {
  await page.waitForFunction(
    ({ source, arg: extraArg }) => {
      const frame = document.querySelector("#protectedOldShellFrame");
      try {
        const bridge = frame && frame.contentWindow ? frame.contentWindow.__PROTECTED_READER_BRIDGE__ : null;
        const summary = bridge && bridge.getSummary ? bridge.getSummary() : null;
        if (!summary) return false;
        const fn = new Function("summary", "arg", `return (${source})(summary, arg);`);
        return !!fn(summary, extraArg);
      } catch (error) {
        return false;
      }
    },
    { source: predicate.toString(), arg },
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

async function openOverlay(page, id) {
  await page.evaluate((overlayId) => {
    const node = document.getElementById(overlayId);
    if (!node) throw new Error(`Missing overlay ${overlayId}`);
    node.classList.remove("hidden");
    node.setAttribute("aria-hidden", "false");
  }, id);
}

async function closeOverlay(page, id) {
  await page.evaluate((overlayId) => {
    const node = document.getElementById(overlayId);
    if (!node) return;
    node.classList.add("hidden");
    node.setAttribute("aria-hidden", "true");
  }, id);
}

async function createTouchPage(browser) {
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  return { context, page };
}

async function runMainScenario(page, url, oldUrl) {
  const debugRequests = [];
  page.on("request", (req) => {
    if (req.url().includes("/debug/")) debugRequests.push(req.url());
  });

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitForHostReady(page);
  await waitForHostControlsReady(page);

  const initialSummary = await getSummary(page);
  const loaderAfterReady = await getLoaderState(page);
  const initialMeta = await page.evaluate(() => ({
    title: (document.querySelector("#menuBookTitle")?.textContent || "").trim(),
    author: (document.querySelector("#menuBookAuthor")?.textContent || "").trim(),
    coverVisible: !!document.querySelector("#menuBookCover:not(.hidden), #menuBookCoverPlaceholder"),
    topControlsPresent: !!(
      document.querySelector("#searchActionDesktop") &&
      document.querySelector("#themeToggle") &&
      document.querySelector("#bookmark") &&
      document.querySelector("#fontInc") &&
      document.querySelector("#fontDec")
    ),
    techPanelVisible: !!document.querySelector("body.protected-dev-panel #protectedShellActionBar")
  }));

  await page.click("#fontInc");
  await page.click("#fontInc");
  const afterFontInc = await waitForSummary(page, (summary) => summary.fontScale >= 1.2);
  await waitForFooterSync(page, afterFontInc.globalPageLabel);

  await page.setViewportSize({ width: 860, height: 980 });
  const afterNarrow = await waitForSummary(page, (summary) => summary.viewportWidth < 1000 && summary.columnCount === 1, 8000);
  await waitForFooterSync(page, afterNarrow.globalPageLabel);

  await page.setViewportSize({ width: 1440, height: 1100 });
  const afterWide = await waitForSummary(page, (summary) => summary.viewportWidth > 1200 && summary.columnCount === 2, 8000);
  await waitForFooterSync(page, afterWide.globalPageLabel);

  await page.click("#fontDec");
  await page.click("#fontDec");
  const afterFontReset = await waitForSummary(page, (summary) => Math.abs((summary.fontScale || 1) - 1) < 0.001);
  await waitForFooterSync(page, afterFontReset.globalPageLabel);

  const pageTurnStart = await page.evaluate(() => {
    const frame = document.querySelector("#protectedOldShellFrame");
    const rect = frame ? frame.getBoundingClientRect() : { left: 0, top: 0 };
    return { left: rect.left, top: rect.top };
  });

  const beforeTurn = await getSummary(page);
  await page.click("#next");
  const turnPreview = await page.evaluate(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    await wait(80);
    const frame = document.querySelector("#protectedOldShellFrame");
    const rect = frame ? frame.getBoundingClientRect() : { left: 0, top: 0 };
    const nextLayer = document.querySelector("#viewer-next .protected-turn-layer");
    const prevLayer = document.querySelector("#viewer-prev .protected-turn-layer");
    const shadow = document.querySelector("#swipe-shadow");
    const style = shadow ? window.getComputedStyle(shadow) : null;
    return {
      frameLeft: rect.left,
      frameTop: rect.top,
      underlayPresent: !!((nextLayer || prevLayer) && (nextLayer || prevLayer).querySelector("canvas")),
      shadowOpacity: style ? Number(style.opacity || "0") : 0
    };
  });
  const afterTurn = await waitForSummaryChange(page, beforeTurn.globalPageLabel, beforeTurn.chunkOrder, 8000);
  await waitForFooterSync(page, afterTurn.globalPageLabel);

  await page.evaluate(async () => {
    const frame = document.querySelector("#protectedOldShellFrame");
    const bridge = frame && frame.contentWindow ? frame.contentWindow.__PROTECTED_READER_BRIDGE__ : null;
    if (!bridge || typeof bridge.selectAutomationSample !== "function") {
      throw new Error("selectAutomationSample bridge missing");
    }
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
    canvas.dispatchEvent(event);
    return {
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
    const sheetRect = sheet && !sheet.classList.contains("hidden") ? sheet.getBoundingClientRect() : null;
    const toolbarRect = toolbar && !toolbar.classList.contains("hidden") ? toolbar.getBoundingClientRect() : null;
    const overlaps = !!(sheetRect && toolbarRect) && !(toolbarRect.right < sheetRect.left || toolbarRect.left > sheetRect.right || toolbarRect.bottom < sheetRect.top || toolbarRect.top > sheetRect.bottom);
    return {
      sheetVisible: !!sheet && !sheet.classList.contains("hidden"),
      toolbarHidden: !!toolbar && toolbar.classList.contains("hidden"),
      inputVisible: !!input && !!input.offsetParent,
      overlaps
    };
  });
  await page.fill("#commentInput", "ux conformance note");
  await page.evaluate(() => document.querySelector("#commentSave")?.click());
  const afterNote = await waitForSummary(
    page,
    (summary) => Array.isArray(summary.annotations) && summary.annotations.some((annotation) => annotation.type === "note" && annotation.noteText === "ux conformance note"),
    10000
  );
  const createdNote = (afterNote.annotations || []).find((annotation) => annotation.type === "note" && annotation.noteText === "ux conformance note");

  await openOverlay(page, "overlay-notes");
  await page.waitForFunction(
    (annotationId) => [...document.querySelectorAll("#notes .list_item")].some((item) => item.getAttribute("data-annotation-id") === annotationId),
    createdNote.annotationId,
    { timeout: 5000 }
  );
  const noteListState = await page.evaluate((annotationId) => {
    const items = [...document.querySelectorAll("#notes .list_item")];
    return {
      count: items.length,
      containsCreated: items.some((item) => item.getAttribute("data-annotation-id") === annotationId)
    };
  }, createdNote.annotationId);
  await page.evaluate((annotationId) => {
    const target = [...document.querySelectorAll("#notes .list_item")].find((item) => item.getAttribute("data-annotation-id") === annotationId);
    const button = target ? target.querySelector(".bookmark-delete") : null;
    if (!button) throw new Error("No note jump button found");
    button.click();
  }, createdNote.annotationId);
  const afterNoteJump = await waitForSummary(page, (summary) => summary.focusedAnnotationId && (summary.focusHighlightCount || 0) > 0, 8000);

  await openOverlay(page, "overlay-toc");
  const tocLight = await page.evaluate(() => {
    const firstLink = document.querySelector("#tocView .toc_link");
    const firstButton = document.querySelector("#tocView button");
    const style = firstLink ? window.getComputedStyle(firstLink) : null;
    return {
      count: document.querySelectorAll("#tocView .toc_link").length,
      hasButtons: !!firstButton,
      backgroundColor: style ? style.backgroundColor : "",
      borderTopWidth: style ? style.borderTopWidth : "",
      color: style ? style.color : ""
    };
  });
  const tocBefore = await getSummary(page);
  await page.evaluate(() => {
    const currentId = (() => {
      const frame = document.querySelector("#protectedOldShellFrame");
      const bridge = frame && frame.contentWindow ? frame.contentWindow.__PROTECTED_READER_BRIDGE__ : null;
      const summary = bridge && bridge.getSummary ? bridge.getSummary() : null;
      return summary && Array.isArray(summary.tocItems) ? (summary.tocItems.find((item) => item.active) || {}).id || "" : "";
    })();
    const links = [...document.querySelectorAll("#tocView .toc_link")];
    const target = links.find((node) => node.getAttribute("data-toc-id") !== currentId) || links[1] || links[0];
    if (!target) throw new Error("No TOC target found");
    target.click();
  });
  const afterToc = await waitForSummaryChange(page, tocBefore.globalPageLabel, tocBefore.chunkOrder, 8000);
  await page.click("#themeToggle");
  const afterDark = await waitForSummary(page, (summary) => summary.theme === "dark", 4000);
  await openOverlay(page, "overlay-toc");
  const tocDark = await page.evaluate(() => {
    const current = document.querySelector("#tocView li.currentChapter .toc_link") || document.querySelector("#tocView .toc_link");
    const style = current ? window.getComputedStyle(current) : null;
    return {
      backgroundColor: style ? style.backgroundColor : "",
      color: style ? style.color : ""
    };
  });
  await closeOverlay(page, "overlay-toc");

  const bookmarkStart = await getSummary(page);
  const bookmarkExpectedLabel = bookmarkStart.globalPageLabel;
  await page.click("#bookmark");
  const bookmarkState = await page.evaluate(() => ({
    filled: document.querySelector("#bookmark")?.classList.contains("icon-bookmark") || false
  }));
  await openOverlay(page, "overlay-bookmarks");
  await page.waitForFunction(() => document.querySelectorAll("#bookmarks .list_item").length > 0, { timeout: 5000 });
  const bookmarkList = await page.evaluate(() => ({
    count: document.querySelectorAll("#bookmarks .list_item").length,
    label: (document.querySelector("#bookmarks .bookmark_link")?.textContent || "").trim()
  }));
  const beforeBookmarkJump = await getSummary(page);
  await page.click("#next");
  await waitForSummaryChange(page, beforeBookmarkJump.globalPageLabel, beforeBookmarkJump.chunkOrder, 8000);
  await page.evaluate(() => document.querySelector("#bookmarks .bookmark_link")?.click());
  const afterBookmarkJump = await waitForSummary(page, (summary, expectedLabel) => summary.globalPageLabel === expectedLabel, 8000, bookmarkExpectedLabel);
  await page.waitForFunction(() => {
    const loader = document.querySelector("#loader");
    if (!loader) return true;
    const style = window.getComputedStyle(loader);
    return style.display === "none" || style.visibility === "hidden" || Number(style.opacity || "1") === 0;
  }, { timeout: 4000 });

  const loaderAfterBookmarkJump = await getLoaderState(page);

  const beforeBoundary = await getSummary(page);
  const chapterBoundary = {
    startChunkOrder: beforeBoundary.chunkOrder,
    crossedNext: false,
    crossedPrev: false
  };
  let boundary = beforeBoundary;
  for (let i = 0; i < 20; i += 1) {
    const prevLabel = boundary.globalPageLabel;
    const prevChunk = boundary.chunkOrder;
    await page.click("#next");
    boundary = await waitForSummaryChange(page, prevLabel, prevChunk, 8000);
    if (boundary.chunkOrder > beforeBoundary.chunkOrder) {
      chapterBoundary.crossedNext = true;
      break;
    }
  }
  let boundaryBack = boundary;
  for (let i = 0; i < 20; i += 1) {
    const prevLabel = boundaryBack.globalPageLabel;
    const prevChunk = boundaryBack.chunkOrder;
    await page.click("#prev");
    boundaryBack = await waitForSummaryChange(page, prevLabel, prevChunk, 8000);
    if (boundaryBack.chunkOrder <= beforeBoundary.chunkOrder) {
      chapterBoundary.crossedPrev = true;
      break;
    }
  }
  const counterState = await page.evaluate(() => ({
    visibleCounter: (document.querySelector("#page-count")?.textContent || "").trim(),
    chapterLine: (document.querySelector("#chapter-title")?.textContent || "").trim()
  }));
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForHostReady(page);
  await waitForHostControlsReady(page);
  const afterReload = await getSummary(page);
  await openOverlay(page, "overlay-bookmarks");
  const bookmarksAfterReload = await page.evaluate(() => document.querySelectorAll("#bookmarks .list_item").length);

  const security = await getSurfaceInfo(page);

  await page.goto(oldUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!document.querySelector("#viewerStack"));
  const oldRouteState = await page.evaluate(() => ({
    hasProtectedHost: !!document.querySelector("#protectedOldShellFrame"),
    hasViewerStack: !!document.querySelector("#viewerStack"),
    hasOldSearch: !!document.querySelector("#searchOpen"),
    hasOldTheme: !!document.querySelector("#themeToggle")
  }));

  return {
    initialMeta,
    reflow: {
      initialColumnCount: initialSummary.columnCount,
      afterFontIncScale: afterFontInc.fontScale,
      afterWideColumnCount: afterWide.columnCount,
      afterNarrowColumnCount: afterNarrow.columnCount,
      initialLineCount: initialSummary.currentPageLineCount,
      afterFontIncLineCount: afterFontInc.currentPageLineCount,
      afterNarrowLineCount: afterNarrow.currentPageLineCount,
      afterWideLineCount: afterWide.currentPageLineCount,
      initialOffsets: `${initialSummary.pageGlobalStartOffset}..${initialSummary.pageGlobalEndOffset}`,
      afterFontIncOffsets: `${afterFontInc.pageGlobalStartOffset}..${afterFontInc.pageGlobalEndOffset}`,
      afterNarrowOffsets: `${afterNarrow.pageGlobalStartOffset}..${afterNarrow.pageGlobalEndOffset}`,
      initialLineRange: initialSummary.currentPageLineRange,
      afterFontIncLineRange: afterFontInc.currentPageLineRange,
      initialLayoutFingerprint: initialSummary.pageLayoutFingerprint,
      afterFontIncLayoutFingerprint: afterFontInc.pageLayoutFingerprint,
      afterNarrowLayoutFingerprint: afterNarrow.pageLayoutFingerprint
    },
    pageTurn: {
      underlayPresent: turnPreview.underlayPresent,
      shadowOpacity: turnPreview.shadowOpacity,
      horizontalJumpPx: Math.abs(turnPreview.frameLeft - pageTurnStart.left),
      afterTurnLabel: afterTurn.globalPageLabel,
      loaderAfterReady,
      loaderAfterBookmarkJump,
      chapterBoundary
    },
    noteFlow: {
      selectedCharsBeforeContext: selectionBeforeContext.selectedChars,
      selectedCharsAfterContext: selectionAfterContext.selectedChars,
      contextDefaultPrevented: contextFlow.defaultPrevented,
      toolbarVisible: contextFlow.toolbarVisible,
      noteComposerState,
      noteListState,
      noteJump: {
        createdNoteId: createdNote.annotationId,
        focusedAnnotationId: afterNoteJump.focusedAnnotationId,
        focusHighlightCount: afterNoteJump.focusHighlightCount
      }
    },
    toc: {
      light: tocLight,
      dark: tocDark,
      beforeLabel: tocBefore.globalPageLabel,
      afterLabel: afterToc.globalPageLabel,
      afterChunkOrder: afterToc.chunkOrder,
      activeChapterLabel: afterToc.chapterLabel
    },
    bookmarks: {
      filled: bookmarkState.filled,
      list: bookmarkList,
      jumpedLabel: afterBookmarkJump.globalPageLabel,
      expectedLabel: bookmarkExpectedLabel,
      countAfterReload: bookmarksAfterReload
    },
    counter: {
      visibleCounter: counterState.visibleCounter,
      summaryCounter: boundaryBack.globalPageLabel,
      globalPageCount: boundaryBack.globalPageCount,
      localPageLabel: boundaryBack.localPageLabel,
      chapterLine: counterState.chapterLine
    },
    afterReload: {
      globalPageLabel: afterReload.globalPageLabel,
      bookmarkCount: bookmarksAfterReload
    },
    security,
    oldRouteState,
    debugRequests
  };
}

async function runTouchScenario(browser, url) {
  const { context, page } = await createTouchPage(browser);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitForHostReady(page);
  await waitForHostControlsReady(page);
  const start = await getSummary(page);
  await page.evaluate(async () => {
    const host = document.querySelector("#protectedOldShellHost");
    if (!host) throw new Error("Protected host missing");
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const rect = host.getBoundingClientRect();
    const startX = Math.round(rect.left + rect.width * 0.78);
    const endX = Math.round(rect.left + rect.width * 0.22);
    const y = Math.round(rect.top + rect.height * 0.52);
    const makeTouch = (x) => new Touch({
      identifier: 1,
      target: host,
      clientX: x,
      clientY: y,
      pageX: x,
      pageY: y,
      screenX: x,
      screenY: y,
      radiusX: 12,
      radiusY: 12,
      force: 0.5
    });
    const startTouch = makeTouch(startX);
    host.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [startTouch], targetTouches: [startTouch], changedTouches: [startTouch] }));
    await wait(16);
    const moveTouch = makeTouch(endX);
    host.dispatchEvent(new TouchEvent("touchmove", { bubbles: true, cancelable: true, touches: [moveTouch], targetTouches: [moveTouch], changedTouches: [moveTouch] }));
    await wait(16);
    host.dispatchEvent(new TouchEvent("touchend", { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [moveTouch] }));
  });
  const afterNext = await waitForSummaryChange(page, start.globalPageLabel, start.chunkOrder, 8000);
  await page.evaluate(async () => {
    const host = document.querySelector("#protectedOldShellHost");
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const rect = host.getBoundingClientRect();
    const startX = Math.round(rect.left + rect.width * 0.22);
    const endX = Math.round(rect.left + rect.width * 0.78);
    const y = Math.round(rect.top + rect.height * 0.52);
    const makeTouch = (x) => new Touch({
      identifier: 2,
      target: host,
      clientX: x,
      clientY: y,
      pageX: x,
      pageY: y,
      screenX: x,
      screenY: y,
      radiusX: 12,
      radiusY: 12,
      force: 0.5
    });
    const startTouch = makeTouch(startX);
    host.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [startTouch], targetTouches: [startTouch], changedTouches: [startTouch] }));
    await wait(16);
    const moveTouch = makeTouch(endX);
    host.dispatchEvent(new TouchEvent("touchmove", { bubbles: true, cancelable: true, touches: [moveTouch], targetTouches: [moveTouch], changedTouches: [moveTouch] }));
    await wait(16);
    host.dispatchEvent(new TouchEvent("touchend", { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [moveTouch] }));
  });
  const afterPrev = await waitForSummaryChange(page, afterNext.globalPageLabel, afterNext.chunkOrder, 8000);
  await context.close();
  return {
    start: start.globalPageLabel,
    afterNext: afterNext.globalPageLabel,
    afterPrev: afterPrev.globalPageLabel
  };
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(20000);

  const desktop = await runMainScenario(page, URL, OLD_URL);
  const touch = await runTouchScenario(browser, URL);

  const report = {
    ok: true,
    route: URL,
    oldRoute: OLD_URL,
    desktop,
    touch,
    warnings: [],
    regressions: []
  };

  const regressions = report.regressions;
  if (!desktop.initialMeta.coverVisible) regressions.push("cover-missing");
  if (!desktop.initialMeta.title || !desktop.initialMeta.author) regressions.push("metadata-missing");
  if (!desktop.initialMeta.topControlsPresent) regressions.push("top-controls-missing");
  if (desktop.initialMeta.techPanelVisible) regressions.push("tech-panel-visible");
  if (desktop.reflow.initialColumnCount !== 2) regressions.push("wide-two-column-missing");
  if (desktop.reflow.afterNarrowColumnCount !== 1) regressions.push("narrow-one-column-missing");
  if (!(desktop.reflow.afterFontIncScale > 1)) regressions.push("font-scale-change-missing");
  const fontReflowChanged =
    desktop.reflow.initialOffsets !== desktop.reflow.afterFontIncOffsets ||
    desktop.reflow.initialLineRange !== desktop.reflow.afterFontIncLineRange ||
    desktop.reflow.initialLayoutFingerprint !== desktop.reflow.afterFontIncLayoutFingerprint;
  if (!fontReflowChanged) regressions.push("font-reflow-missing");
  const resizeReflowChanged =
    desktop.reflow.afterNarrowOffsets !== desktop.reflow.afterFontIncOffsets ||
    desktop.reflow.afterNarrowLineCount !== desktop.reflow.afterFontIncLineCount ||
    desktop.reflow.afterNarrowColumnCount !== desktop.reflow.afterWideColumnCount ||
    desktop.reflow.afterNarrowLayoutFingerprint !== desktop.reflow.afterFontIncLayoutFingerprint;
  if (!resizeReflowChanged) regressions.push("resize-reflow-missing");
  if (desktop.pageTurn.horizontalJumpPx > 1.5) regressions.push("horizontal-page-jump-detected");
  if (!desktop.pageTurn.underlayPresent || !(desktop.pageTurn.shadowOpacity > 0.1)) regressions.push("page-underlay-missing");
  if (desktop.pageTurn.loaderAfterReady.visible || desktop.pageTurn.loaderAfterBookmarkJump.visible) regressions.push("loader-stuck-visible");
  if (!desktop.noteFlow.contextDefaultPrevented) regressions.push("browser-context-menu-path-active");
  if (desktop.noteFlow.selectedCharsAfterContext < desktop.noteFlow.selectedCharsBeforeContext) regressions.push("selection-collapsed-on-context");
  if (!desktop.noteFlow.noteComposerState.sheetVisible || !desktop.noteFlow.noteComposerState.inputVisible || !desktop.noteFlow.noteComposerState.toolbarHidden || desktop.noteFlow.noteComposerState.overlaps) regressions.push("note-composer-layout-broken");
  if (!desktop.noteFlow.noteListState.containsCreated || desktop.noteFlow.noteListState.count < 1) regressions.push("note-list-not-refreshed");
  if (!(desktop.noteFlow.noteJump.focusHighlightCount > 0) || desktop.noteFlow.noteJump.focusedAnnotationId !== desktop.noteFlow.noteJump.createdNoteId) regressions.push("note-jump-highlight-missing");
  if (desktop.toc.light.count < 2) regressions.push("toc-items-missing");
  if (desktop.toc.light.hasButtons) regressions.push("toc-button-shell-regression");
  if (desktop.toc.beforeLabel === desktop.toc.afterLabel && desktop.toc.afterChunkOrder === 1) regressions.push("toc-click-no-navigation");
  if (desktop.bookmarks.list.count < 1 || !desktop.bookmarks.filled) regressions.push("bookmark-create-missing");
  if (desktop.bookmarks.jumpedLabel !== desktop.bookmarks.expectedLabel) regressions.push("bookmark-jump-mismatch");
  if (desktop.bookmarks.countAfterReload < 1) regressions.push("bookmark-persistence-missing");
  if (desktop.counter.visibleCounter !== desktop.counter.summaryCounter) regressions.push("whole-book-counter-desync");
  if (!(desktop.counter.globalPageCount > 2)) regressions.push("whole-book-counter-not-global");
  if ((desktop.counter.chapterLine || "").includes("· none ·")) regressions.push("chapter-label-missing");
  if (!desktop.pageTurn.chapterBoundary.crossedNext) regressions.push("chapter-boundary-next-broken");
  if (!desktop.pageTurn.chapterBoundary.crossedPrev) regressions.push("chapter-boundary-prev-broken");
  if (!(touch.start !== touch.afterNext && touch.afterPrev === touch.start)) regressions.push("touch-swipe-broken");
  if (JSON.stringify(desktop.security.tags || []) !== JSON.stringify(["CANVAS", "CANVAS"])) regressions.push("surface-not-canvas-only");
  if (desktop.security.text) regressions.push("surface-text-leak");
  if ((desktop.debugRequests || []).length) regressions.push("debug-request-detected");
  if (desktop.oldRouteState.hasProtectedHost || !desktop.oldRouteState.hasViewerStack) regressions.push("old-reader-regression");

  report.ok = regressions.length === 0;

  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
