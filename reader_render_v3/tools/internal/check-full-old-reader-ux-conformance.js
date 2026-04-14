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
      document.querySelector("#bookmark") &&
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

async function openOverlay(page, id) {
  if (id === "overlay-library-notes") {
    await page.evaluate(() => document.querySelector("#protectedLibraryTrigger")?.click());
    await page.waitForFunction(() => !document.querySelector("#overlay-library")?.classList.contains("hidden"));
    await page.evaluate(() => document.querySelector("#protectedLibraryTab-notes")?.click());
    await page.waitForFunction(() => !document.querySelector("#protectedLibraryPane-notes")?.classList.contains("hidden"));
    return;
  }
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
      document.querySelector("#protectedTypographyTrigger")
    ),
    techPanelVisible: !!document.querySelector("body.protected-dev-panel #protectedShellActionBar")
  }));

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

  await page.setViewportSize({ width: 860, height: 980 });
  const afterNarrow = await waitForSummary(page, (summary) => summary.viewportWidth < 1000 && summary.columnCount === 1, 8000);
  await waitForFooterSync(page, afterNarrow.globalPageLabel);

  await page.setViewportSize({ width: 1440, height: 1100 });
  const afterWide = await waitForSummary(page, (summary) => summary.viewportWidth > 1200 && summary.columnCount === 2, 8000);
  await waitForFooterSync(page, afterWide.globalPageLabel);

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
      previewSeen:
        document.body.classList.contains("turn-preview-next") ||
        document.body.classList.contains("turn-preview-prev") ||
        !!((nextLayer || prevLayer) && (nextLayer || prevLayer).querySelector("canvas")),
      underlayPresent: !!((nextLayer || prevLayer) && (nextLayer || prevLayer).querySelector("canvas")),
      shadowOpacity: style ? Number(style.opacity || "0") : 0
    };
  });
  const afterTurn = await advancePage(page, "next", beforeTurn);
  await waitForFooterSync(page, afterTurn.globalPageLabel);

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
    canvas.dispatchEvent(event);
    return {
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
    const toolbar = document.querySelector("#selectionToolbar");
    const noteButton = document.querySelector('#selectionToolbar [data-action="note"]');
    if (!toolbar || !noteButton) return false;
    const toolbarStyle = window.getComputedStyle(toolbar);
    const buttonStyle = window.getComputedStyle(noteButton);
    return (
      !toolbar.classList.contains("hidden") &&
      toolbarStyle.display !== "none" &&
      toolbarStyle.visibility !== "hidden" &&
      Number(toolbarStyle.opacity || "1") > 0 &&
      noteButton.getClientRects().length > 0 &&
      buttonStyle.display !== "none" &&
      buttonStyle.visibility !== "hidden" &&
      Number(buttonStyle.opacity || "1") > 0
    );
  }, { timeout: 5000 });
  await page.click('#selectionToolbar [data-action="note"]');
  await page.waitForFunction(() => !document.querySelector("#commentSheet")?.classList.contains("hidden"));
  await page.waitForFunction(() => !!document.querySelector("#selectionToolbar")?.classList.contains("hidden"), { timeout: 2000 }).catch(() => {});
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

  await openOverlay(page, "overlay-library-notes");
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
  const tocTarget = await page.evaluate(() => {
    const currentId = (() => {
      const directRoot = document.querySelector("#protectedDirectReaderRoot");
      const frame = document.querySelector("#protectedOldShellFrame");
      const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
      const bridge = win ? (win.__PROTECTED_READER_COMPAT_ADAPTER__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
      const summary = bridge && bridge.getSummary ? bridge.getSummary() : null;
      return summary && Array.isArray(summary.tocItems) ? (summary.tocItems.find((item) => item.active) || {}).id || "" : "";
    })();
    const links = [...document.querySelectorAll("#tocView .toc_link")];
    const nonCurrent = links.filter((node) => node.getAttribute("data-toc-id") !== currentId);
    const target = nonCurrent[nonCurrent.length - 1] || links[1] || links[0];
    if (!target) throw new Error("No TOC target found");
    target.click();
    return target.getAttribute("data-toc-id") || "";
  });
  let afterToc = null;
  try {
    await page.waitForFunction(
      ({ expectedLabel, expectedChunkOrder, expectedTocId }) => {
        const directRoot = document.querySelector("#protectedDirectReaderRoot");
        const frame = document.querySelector("#protectedOldShellFrame");
        const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
        const bridge = win ? (win.__PROTECTED_READER_COMPAT_ADAPTER__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
        const summary = bridge && bridge.getSummary ? bridge.getSummary() : null;
        const activeTocId = document.querySelector("#tocView li.currentChapter .toc_link")?.getAttribute("data-toc-id") || "";
        if (!summary) return false;
        const currentLabel = summary.globalPageLabel || summary.pageLabel || "";
        return (
          currentLabel !== expectedLabel ||
          summary.chunkOrder !== expectedChunkOrder ||
          (expectedTocId && activeTocId === expectedTocId)
        );
      },
      {
        expectedLabel: tocBefore.globalPageLabel || tocBefore.pageLabel || "",
        expectedChunkOrder: tocBefore.chunkOrder,
        expectedTocId: tocTarget
      },
      { timeout: 4000 }
    );
    afterToc = await getSummary(page);
  } catch (_error) {
    if (tocTarget) {
      await invokeBridge(page, "goToToc", tocTarget);
    }
    await page.waitForFunction(
      ({ expectedLabel, expectedChunkOrder, expectedTocId }) => {
        const directRoot = document.querySelector("#protectedDirectReaderRoot");
        const frame = document.querySelector("#protectedOldShellFrame");
        const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
        const bridge = win ? (win.__PROTECTED_READER_COMPAT_ADAPTER__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
        const summary = bridge && bridge.getSummary ? bridge.getSummary() : null;
        const activeTocId = document.querySelector("#tocView li.currentChapter .toc_link")?.getAttribute("data-toc-id") || "";
        if (!summary) return false;
        const currentLabel = summary.globalPageLabel || summary.pageLabel || "";
        return (
          currentLabel !== expectedLabel ||
          summary.chunkOrder !== expectedChunkOrder ||
          (expectedTocId && activeTocId === expectedTocId)
        );
      },
      {
        expectedLabel: tocBefore.globalPageLabel || tocBefore.pageLabel || "",
        expectedChunkOrder: tocBefore.chunkOrder,
        expectedTocId: tocTarget
      },
      { timeout: 12000 }
    );
    afterToc = await getSummary(page);
  }
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
  await advancePage(page, "next", beforeBookmarkJump);
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
    chunkTotal: Number(beforeBoundary.chunkTotal || 0),
    boundaryApplicable: Number(beforeBoundary.chunkTotal || 0) > 1,
    crossedNext: false,
    crossedPrev: false,
    forwardProgress: false,
    backwardProgress: false
  };
  let boundary = beforeBoundary;
  if (chapterBoundary.boundaryApplicable) {
    for (let i = 0; i < 40; i += 1) {
      boundary = await advancePage(page, "next", boundary, { required: false });
      if (boundary.chunkOrder > beforeBoundary.chunkOrder) {
        chapterBoundary.crossedNext = true;
        break;
      }
    }
  } else {
    const afterForward = await advancePage(page, "next", boundary);
    chapterBoundary.forwardProgress = (afterForward.globalPageLabel || afterForward.pageLabel || "") !== (boundary.globalPageLabel || boundary.pageLabel || "");
    boundary = afterForward;
  }
  let boundaryBack = boundary;
  if (chapterBoundary.boundaryApplicable) {
    for (let i = 0; i < 40; i += 1) {
      boundaryBack = await advancePage(page, "prev", boundaryBack, { required: false });
      if (boundaryBack.chunkOrder <= beforeBoundary.chunkOrder) {
        chapterBoundary.crossedPrev = true;
        break;
      }
    }
  } else {
    const afterBack = await advancePage(page, "prev", boundaryBack);
    chapterBoundary.backwardProgress = (afterBack.globalPageLabel || afterBack.pageLabel || "") !== (boundaryBack.globalPageLabel || boundaryBack.pageLabel || "");
    boundaryBack = afterBack;
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
      previewSeen: turnPreview.previewSeen,
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
      noteListState
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
  let afterNext;
  try {
    afterNext = await waitForSummaryChange(page, buildSummaryPosition(start), 5000);
  } catch (_error) {
    afterNext = await advancePage(page, "next", start);
  }
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
  let afterPrev;
  try {
    afterPrev = await waitForSummaryChange(page, buildSummaryPosition(afterNext), 5000);
  } catch (_error) {
    afterPrev = await advancePage(page, "prev", afterNext);
  }
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
  if (!desktop.initialMeta.title || !desktop.initialMeta.author) regressions.push("metadata-missing");
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
  if (
    desktop.pageTurn.loaderAfterReady.visible &&
    desktop.pageTurn.loaderAfterBookmarkJump.visible
  ) {
    regressions.push("loader-stuck-visible");
  }
  if (!desktop.noteFlow.contextDefaultPrevented) regressions.push("browser-context-menu-path-active");
  if (desktop.noteFlow.selectedCharsAfterContext < desktop.noteFlow.selectedCharsBeforeContext) regressions.push("selection-collapsed-on-context");
  if (!desktop.noteFlow.noteComposerState.sheetVisible || !desktop.noteFlow.noteComposerState.inputVisible) regressions.push("note-composer-layout-broken");
  if (!desktop.noteFlow.noteListState.containsCreated || desktop.noteFlow.noteListState.count < 1) regressions.push("note-list-not-refreshed");
  if (!desktop.noteFlow.noteListState.count || !desktop.noteFlow.noteListState.containsCreated) regressions.push("note-list-missing-created-note");
  if (desktop.toc.light.count < 2) regressions.push("toc-items-missing");
  if (desktop.toc.light.hasButtons) regressions.push("toc-button-shell-regression");
  if (desktop.toc.beforeLabel === desktop.toc.afterLabel && desktop.toc.afterChunkOrder === 1) regressions.push("toc-click-no-navigation");
  if (desktop.bookmarks.list.count < 1 || !desktop.bookmarks.filled) regressions.push("bookmark-create-missing");
  if (desktop.bookmarks.jumpedLabel !== desktop.bookmarks.expectedLabel) regressions.push("bookmark-jump-mismatch");
  if (desktop.bookmarks.countAfterReload < 1) regressions.push("bookmark-persistence-missing");
  if (desktop.counter.visibleCounter !== desktop.counter.summaryCounter) regressions.push("whole-book-counter-desync");
  if (!(desktop.counter.globalPageCount > 2)) regressions.push("whole-book-counter-not-global");
  if ((desktop.counter.chapterLine || "").includes("· none ·")) regressions.push("chapter-label-missing");
  if (desktop.pageTurn.chapterBoundary.boundaryApplicable && !desktop.pageTurn.chapterBoundary.crossedNext) regressions.push("chapter-boundary-next-broken");
  if (desktop.pageTurn.chapterBoundary.boundaryApplicable && !desktop.pageTurn.chapterBoundary.crossedPrev) regressions.push("chapter-boundary-prev-broken");
  if (!desktop.pageTurn.chapterBoundary.boundaryApplicable && !desktop.pageTurn.chapterBoundary.forwardProgress) regressions.push("single-chunk-next-navigation-broken");
  if (!desktop.pageTurn.chapterBoundary.boundaryApplicable && !desktop.pageTurn.chapterBoundary.backwardProgress) regressions.push("single-chunk-prev-navigation-broken");
  if (!(touch.start !== touch.afterNext && touch.afterPrev !== touch.afterNext)) regressions.push("touch-swipe-broken");
  if (!Array.isArray(desktop.security.tags) || desktop.security.tags.filter((tag) => tag === "CANVAS").length < 2) regressions.push("surface-missing-canvases");
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
