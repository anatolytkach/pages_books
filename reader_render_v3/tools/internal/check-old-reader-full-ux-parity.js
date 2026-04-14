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
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    try {
      const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
      const surface = win ? (win.__PROTECTED_READER_COMPAT_ADAPTER__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
      return !!(surface && surface.getSummary && surface.getSummary().ready);
    } catch (error) {
      return false;
    }
  }, {}, { timeout });
}

async function waitForHostControlsReady(page, timeout = 12000) {
  await page.waitForFunction(() => {
    const pageCount = (document.querySelector("#page-count")?.textContent || "").trim();
    return !!(
      document.querySelector("#protectedTypographyTrigger") &&
      document.querySelector("#searchActionDesktop") &&
      document.querySelector("#themeToggle") &&
      pageCount
    );
  }, { timeout });
}

async function openSettingsOverlay(page) {
  await page.evaluate(() => document.querySelector("#protectedTypographyTrigger")?.click());
  await page.waitForFunction(() => !document.querySelector("#overlay-settings")?.classList.contains("hidden"));
}

async function closeSettingsOverlay(page) {
  await page.evaluate(() => document.querySelector("#overlay-settings .overlay-close")?.click());
  await page.waitForFunction(() => document.querySelector("#overlay-settings")?.classList.contains("hidden"));
}

async function selectRangeInEmbeddedFrame(page) {
  const automationSelected = await page.evaluate(async () => {
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
    const surface = win ? (win.__PROTECTED_READER_COMPAT_ADAPTER__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
    if (!surface || typeof surface.selectAutomationSample !== "function") return false;
    try {
      await surface.selectAutomationSample();
      const summary = surface.getSummary ? surface.getSummary() : null;
      return !!(summary && summary.selectionActive && Number(summary.selectedChars || 0) > 1);
    } catch (_error) {
      return false;
    }
  });
  if (automationSelected) return;
  await page.waitForFunction(() => {
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
    const surface = win ? (win.__PROTECTED_READER_COMPAT_ADAPTER__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
    const debug = surface && typeof surface.getDebugLayoutState === "function"
      ? surface.getDebugLayoutState()
      : null;
    return !!(debug && debug.ready && Array.isArray(debug.lines) && debug.lines.length);
  }, {}, { timeout: 10000 });
  const attempts = await page.evaluate(() => {
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
    const surface = win ? (win.__PROTECTED_READER_COMPAT_ADAPTER__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
    const debug = surface && typeof surface.getDebugLayoutState === "function"
      ? surface.getDebugLayoutState()
      : null;
    const host = directRoot || frame;
    const rect = host ? host.getBoundingClientRect() : null;
    const lines = debug && Array.isArray(debug.lines) ? debug.lines : [];
    const candidates = lines.filter((line) => {
      const y = Number(line.y || 0);
      const width = Number(line.width || 0);
      return width > 220 && y > 80;
    });
    if (!rect || candidates.length < 2) return [];
    return candidates.slice(0, 6).map((start, index) => {
      const end = candidates[Math.min(index + 1, candidates.length - 1)];
      return {
        startX: Math.round(rect.left + Number(start.x || 0) + 16),
        startY: Math.round(rect.top + Number(start.y || 0) + Math.max(8, Math.min(18, Number(start.height || 18) / 2))),
        endX: Math.round(rect.left + Math.max(Number(end.x || 0) + 140, Number(end.x || 0) + Number(end.width || 0) - 16)),
        endY: Math.round(rect.top + Number(end.y || 0) + Math.max(8, Math.min(18, Number(end.height || 18) / 2)))
      };
    });
  });
  if (!attempts.length) throw new Error("selection geometry unavailable");
  for (const geometry of attempts) {
    await page.mouse.move(geometry.startX, geometry.startY);
    await page.mouse.down();
    await page.mouse.move(geometry.endX, geometry.endY, { steps: 20 });
    await page.mouse.up();
    const selected = await page.evaluate(() => {
      const directRoot = document.querySelector("#protectedDirectReaderRoot");
      const frame = document.querySelector("#protectedOldShellFrame");
      const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
      const surface = win ? (win.__PROTECTED_READER_COMPAT_ADAPTER__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
      const summary = surface && surface.getSummary ? surface.getSummary() : null;
      return !!(summary && summary.selectionActive && Number(summary.selectedChars || 0) > 1);
    });
    if (selected) return;
  }
  throw new Error("selection drag did not activate selection");
}

async function getSummary(page) {
  return page.evaluate(() => {
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
    const surface = win ? (win.__PROTECTED_READER_COMPAT_ADAPTER__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
    return surface && typeof surface.getSummary === "function" ? surface.getSummary() : null;
  });
}

async function invokeBridge(page, method, ...args) {
  return page.evaluate(async ({ method, args }) => {
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
    const bridge = win ? (win.__PROTECTED_READER_COMPAT_ADAPTER__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
    if (!bridge || typeof bridge[method] !== "function") throw new Error(`Bridge method ${method} missing`);
    return bridge[method](...args);
  }, { method, args });
}

async function waitForSummary(page, predicate, timeout = 8000, arg = null) {
  await page.waitForFunction(
    ({ source, arg: extraArg }) => {
      const directRoot = document.querySelector("#protectedDirectReaderRoot");
      const frame = document.querySelector("#protectedOldShellFrame");
      try {
        const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
        const bridge = win ? (win.__PROTECTED_READER_COMPAT_ADAPTER__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
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

function buildSummaryPosition(summary) {
  if (!summary) return null;
  return {
    label: summary.globalPageLabel || summary.pageLabel || "",
    chunkOrder: Number(summary.chunkOrder || 0),
    globalPageIndex: Number(summary.globalPageIndex || 0),
    startOffset: Number(summary.pageGlobalStartOffset || 0),
    endOffset: Number(summary.pageGlobalEndOffset || 0),
    globalOffsetLabel: summary.globalOffsetLabel || ""
  };
}

async function waitForSummaryChange(page, previousPosition, timeout = 12000) {
  await page.waitForFunction(
    ({ previous }) => {
      const directRoot = document.querySelector("#protectedDirectReaderRoot");
      const frame = document.querySelector("#protectedOldShellFrame");
      try {
        const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
        const bridge = win ? (win.__PROTECTED_READER_COMPAT_ADAPTER__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
        const summary = bridge && bridge.getSummary ? bridge.getSummary() : null;
        if (!summary) return false;
        const current = {
          label: summary.globalPageLabel || summary.pageLabel || "",
          chunkOrder: Number(summary.chunkOrder || 0),
          globalPageIndex: Number(summary.globalPageIndex || 0),
          startOffset: Number(summary.pageGlobalStartOffset || 0),
          endOffset: Number(summary.pageGlobalEndOffset || 0),
          globalOffsetLabel: summary.globalOffsetLabel || ""
        };
        return (
          current.label !== previous.label ||
          current.chunkOrder !== previous.chunkOrder ||
          current.globalPageIndex !== previous.globalPageIndex ||
          current.startOffset !== previous.startOffset ||
          current.endOffset !== previous.endOffset ||
          current.globalOffsetLabel !== previous.globalOffsetLabel
        );
      } catch (error) {
        return false;
      }
    },
    { previous: previousPosition },
    { timeout }
  );
  return getSummary(page);
}

function positionsMatch(left, right) {
  if (!left || !right) return false;
  return (
    left.label === right.label &&
    left.chunkOrder === right.chunkOrder &&
    left.globalPageIndex === right.globalPageIndex &&
    left.startOffset === right.startOffset &&
    left.endOffset === right.endOffset &&
    left.globalOffsetLabel === right.globalOffsetLabel
  );
}

async function advancePage(page, direction, previousSummary, { required = true } = {}) {
  const previousPosition = buildSummaryPosition(previousSummary);
  const buttonSelector = direction === "next" ? "#next" : "#prev";
  const bridgeMethod = direction === "next" ? "nextPage" : "prevPage";
  const maxAttempts = required ? 3 : 1;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await page.click(buttonSelector);
    try {
      return await waitForSummaryChange(page, previousPosition, required ? 2500 : 1200);
    } catch (_error) {}
    const bridgeSummary = await invokeBridge(page, bridgeMethod);
    const bridgePosition = buildSummaryPosition(bridgeSummary);
    if (bridgePosition && !positionsMatch(bridgePosition, previousPosition)) {
      return bridgeSummary;
    }
    try {
      return await waitForSummaryChange(page, previousPosition, required ? 4000 : 1500);
    } catch (_error) {}
  }
  if (!required) {
    return getSummary(page);
  }
  return waitForSummaryChange(page, previousPosition, 12000);
}

async function waitForViewportReflow(page, previousViewportWidth, previousOffsets, timeout = 8000) {
  await page.waitForFunction(
    ({ width, offsets }) => {
      const directRoot = document.querySelector("#protectedDirectReaderRoot");
      const frame = document.querySelector("#protectedOldShellFrame");
      try {
        const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
        const bridge = win ? (win.__PROTECTED_READER_COMPAT_ADAPTER__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
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
    const rect = loader.getBoundingClientRect();
    return {
      present: true,
      visible:
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity || "1") > 0 &&
        rect.width > 2 &&
        rect.height > 2
    };
  });
}

async function getSurfaceInfo(page) {
  return page.evaluate(() => {
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const doc = directRoot ? document : (frame && frame.contentDocument ? frame.contentDocument : null);
    const readerFrame = directRoot
      ? directRoot.querySelector(".reader-frame")
      : (doc ? doc.querySelector(".reader-frame") : null);
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

  await openSettingsOverlay(page);
  const increasedScale = Math.min(1.6, Math.round((((initialSummary.fontScale || 1) + 0.1) * 100)) / 100);
  await page.evaluate((nextScale) => {
    const input = document.querySelector("#protectedTypographyScale");
    if (!input) throw new Error("Missing #protectedTypographyScale");
    input.value = String(nextScale);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, increasedScale);
  const afterFontInc = await waitForSummary(
    page,
    (summary, baseline) => (summary.fontScale || 1) > baseline,
    8000,
    initialSummary.fontScale || 1
  );
  await waitForFooterSync(page, afterFontInc.globalPageLabel);
  await closeSettingsOverlay(page);

  await page.setViewportSize({ width: 1120, height: 980 });
  const afterResize = await waitForViewportReflow(
    page,
    afterFontInc.viewportWidth,
    `${afterFontInc.pageGlobalStartOffset}..${afterFontInc.pageGlobalEndOffset}`
  );
  await waitForFooterSync(page, afterResize.globalPageLabel);

  await openSettingsOverlay(page);
  await page.evaluate(() => {
    const input = document.querySelector("#protectedTypographyScale");
    if (!input) throw new Error("Missing #protectedTypographyScale");
    input.value = "1";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const afterFontReset = await waitForSummary(page, (summary) => Math.abs((summary.fontScale || 1) - 1) < 0.001);
  await closeSettingsOverlay(page);
  await waitForFooterSync(page, afterFontReset.globalPageLabel);

  await selectRangeInEmbeddedFrame(page);
  const selectionBeforeContext = await waitForSummary(page, (summary) => !!summary.selectionActive && (summary.selectedChars || 0) > 1);

  const contextFlow = await page.evaluate(() => {
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const doc = directRoot ? document : (frame && frame.contentDocument ? frame.contentDocument : null);
    const canvas = directRoot
      ? directRoot.querySelector(".reader-frame canvas")
      : (doc ? doc.querySelector(".reader-frame canvas") : null);
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
  await page.evaluate(() => {
    const toolbar = document.querySelector("#selectionToolbar");
    if (toolbar && !toolbar.classList.contains("hidden")) return;
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
    const surface = win ? (win.__PROTECTED_READER_COMPAT_ADAPTER__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
    const summary = surface && typeof surface.getSummary === "function" ? surface.getSummary() : null;
    const bounds = summary && summary.selectionBounds ? summary.selectionBounds : null;
    if (!summary || !bounds || typeof window.__PROTECTED_OLD_SHELL_SHOW_SELECTION_TOOLBAR__ !== "function") return;
    const host = directRoot || frame;
    const hostRect = host ? host.getBoundingClientRect() : { left: 0, top: 0 };
    const x = Number(hostRect.left || 0) + Number(bounds.left || 0) + Math.max(8, Number(bounds.width || 0) / 2);
    const y = Number(hostRect.top || 0) + Number(bounds.top || 0) + Math.max(8, Number(bounds.height || 0) / 2);
    window.__PROTECTED_OLD_SHELL_SHOW_SELECTION_TOOLBAR__(summary, x, y, "pointer");
  });
  await page.waitForFunction(() => {
    const noteButton = document.querySelector('#selectionToolbar [data-action="note"]');
    return !!(noteButton && noteButton.getClientRects().length > 0);
  }, {}, { timeout: 5000 });
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

  await page.evaluate(() => document.querySelector("#protectedLibraryTrigger")?.click());
  await page.waitForFunction(() => !document.querySelector("#overlay-library")?.classList.contains("hidden"));
  await page.evaluate(() => document.querySelector("#protectedLibraryTab-notes")?.click());
  await page.waitForFunction(() => !document.querySelector("#protectedLibraryPane-notes")?.classList.contains("hidden"));
  await page.waitForFunction(() => document.querySelectorAll("#notes .bookmark-delete").length > 0, { timeout: 5000 });
  const noteListState = await page.evaluate((annotationId) => {
    const items = [...document.querySelectorAll("#notes .list_item")];
    return {
      count: items.length,
      containsCreated: items.some((item) => item.getAttribute("data-annotation-id") === annotationId)
    };
  }, createdNote ? createdNote.annotationId : "");
  await page.evaluate(() => document.querySelector("#overlay-library .overlay-close")?.click());
  await page.waitForFunction(() => document.querySelector("#overlay-library")?.classList.contains("hidden"));

  const beforeBoundary = await getSummary(page);
  const pageTurn = {
    startChunkOrder: beforeBoundary.chunkOrder,
    startGlobalPageLabel: beforeBoundary.globalPageLabel,
    chunkTotal: Number(beforeBoundary.chunkTotal || 0),
    boundaryApplicable: Number(beforeBoundary.chunkTotal || 0) > 1,
    previewSeen: false,
    crossedChapterBoundary: false,
    prevAcrossBoundary: false,
    forwardProgress: false,
    backwardProgress: false
  };
  let crossed = beforeBoundary;
  if (pageTurn.boundaryApplicable) {
    for (let i = 0; i < 36; i += 1) {
      try {
        await page.waitForFunction(() => document.body.classList.contains("turn-preview-next") || !!document.querySelector("#viewer-next .protected-turn-layer canvas"), { timeout: 1200 });
        pageTurn.previewSeen = true;
      } catch (error) {}
      crossed = await advancePage(page, "next", crossed, { required: false });
      await waitForFooterSync(page, crossed.globalPageLabel);
      if (crossed.chunkOrder > beforeBoundary.chunkOrder) {
        pageTurn.crossedChapterBoundary = true;
        break;
      }
    }
  } else {
    const afterForward = await advancePage(page, "next", crossed);
    pageTurn.forwardProgress = (afterForward.globalPageLabel || afterForward.pageLabel || "") !== (crossed.globalPageLabel || crossed.pageLabel || "");
    crossed = afterForward;
    await waitForFooterSync(page, crossed.globalPageLabel);
  }
  pageTurn.afterBoundaryChunkOrder = crossed.chunkOrder;
  pageTurn.afterBoundaryGlobalPageLabel = crossed.globalPageLabel;
  const loaderAfterBoundary = await getLoaderState(page);

  let back = crossed;
  if (pageTurn.boundaryApplicable) {
    for (let i = 0; i < 36; i += 1) {
      back = await advancePage(page, "prev", back, { required: false });
      await waitForFooterSync(page, back.globalPageLabel);
      if (back.chunkOrder <= beforeBoundary.chunkOrder) {
        pageTurn.prevAcrossBoundary = true;
        break;
      }
    }
  } else {
    const afterBack = await advancePage(page, "prev", back);
    pageTurn.backwardProgress = (afterBack.globalPageLabel || afterBack.pageLabel || "") !== (back.globalPageLabel || back.pageLabel || "");
    back = afterBack;
    await waitForFooterSync(page, back.globalPageLabel);
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
      noteComposerState,
      noteListState
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
  if (!contextFlow.defaultPrevented || !noteComposerState.sheetVisible) regressions.push("custom-context-popup-not-restored");
  if (selectionAfterContext.selectedChars < selectionBeforeContext.selectedChars) regressions.push("selection-collapsed-on-context-open");
  if (!noteComposerState.sheetVisible || !noteComposerState.inputVisible) regressions.push("note-composer-overlap-broken");
  if (!createdNote || !createdNote.annotationId) regressions.push("note-creation-missing");
  if (!noteListState.count || !noteListState.containsCreated) regressions.push("note-list-missing-created-note");
  if (report.globalCounter.visibleCounter !== report.globalCounter.summaryGlobalLabel) regressions.push("global-counter-out-of-sync");
  if (!(report.globalCounter.globalPageCount > 2)) regressions.push("global-counter-not-book-wide");
  if (pageTurn.boundaryApplicable && !pageTurn.crossedChapterBoundary) regressions.push("chapter-boundary-next-broken");
  if (pageTurn.boundaryApplicable && !pageTurn.prevAcrossBoundary) regressions.push("chapter-boundary-prev-broken");
  if (!pageTurn.boundaryApplicable && !pageTurn.forwardProgress) regressions.push("single-chunk-next-navigation-broken");
  if (!pageTurn.boundaryApplicable && !pageTurn.backwardProgress) regressions.push("single-chunk-prev-navigation-broken");
  if (!Array.isArray(security.tags) || security.tags.filter((tag) => tag === "CANVAS").length < 2) regressions.push("surface-missing-canvases");
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
