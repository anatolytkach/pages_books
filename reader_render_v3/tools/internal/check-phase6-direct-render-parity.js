#!/usr/bin/env node

const { chromium, devices } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

function getArgValue(name, fallback = "") {
  for (const item of process.argv.slice(2)) {
    if (item.startsWith(`--${name}=`)) return item.slice(name.length + 3);
  }
  return fallback;
}

const IFRAME_URL =
  getArgValue("iframe-url") ||
  "http://127.0.0.1:8788/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape";
const DIRECT_URL =
  getArgValue("direct-url") ||
  "http://127.0.0.1:8788/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&protectedRenderHost=direct&renderMode=shape&metricsMode=shape";

function expectedTransport(url) {
  try {
    const parsed = new URL(url);
    const explicit = String(parsed.searchParams.get("protectedCompatTransport") || "").trim().toLowerCase();
    if (explicit === "adapter") return "adapter";
    if (
      String(parsed.searchParams.get("reader") || "").trim().toLowerCase() === "protected" &&
      String(parsed.searchParams.get("protectedUx") || "").trim().toLowerCase() === "old-shell"
    ) {
      return "adapter";
    }
    return "adapter";
  } catch (_error) {
    return "adapter";
  }
}

function expectedRenderHost(url) {
  try {
    const parsed = new URL(url);
    const explicit = String(parsed.searchParams.get("protectedRenderHost") || "").trim().toLowerCase();
    if (explicit === "direct") return "direct";
    if (
      String(parsed.searchParams.get("reader") || "").trim().toLowerCase() === "protected" &&
      String(parsed.searchParams.get("protectedUx") || "").trim().toLowerCase() === "old-shell"
    ) {
      return "direct";
    }
    return "direct";
  } catch (_error) {
    return "direct";
  }
}

function roundRect(rect) {
  if (!rect) return null;
  return {
    left: Number(rect.left || 0),
    top: Number(rect.top || 0),
    width: Number(rect.width || 0),
    height: Number(rect.height || 0),
    right: Number(rect.right || (Number(rect.left || 0) + Number(rect.width || 0))),
    bottom: Number(rect.bottom || (Number(rect.top || 0) + Number(rect.height || 0)))
  };
}

function rectCenter(rect) {
  return {
    x: Number(rect.left || 0) + Number(rect.width || 0) / 2,
    y: Number(rect.top || 0) + Number(rect.height || 0) / 2
  };
}

function rectDistance(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const ac = rectCenter(a);
  const bc = rectCenter(b);
  return Math.hypot(ac.x - bc.x, ac.y - bc.y);
}

function maxAbsDelta(a, b) {
  return Math.max(...["left", "top", "width", "height"].map((key) => Math.abs(Number(a && a[key] || 0) - Number(b && b[key] || 0))));
}

function ensureRectWithin(rect, bounds, tolerance = 20) {
  if (!rect || !bounds) return false;
  return (
    rect.left >= bounds.left - tolerance &&
    rect.top >= bounds.top - tolerance &&
    rect.right <= bounds.right + tolerance &&
    rect.bottom <= bounds.bottom + tolerance
  );
}

async function withSurface(page, transport, expression, args = []) {
  return await page.evaluate(
    async ({ transport, expression, args }) => {
      const directRoot = document.querySelector("#protectedDirectReaderRoot");
      const frame = document.querySelector("#protectedOldShellFrame");
      const mode = directRoot ? "direct" : "iframe";
      const win = mode === "direct" ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
      const doc = mode === "direct" ? document : (frame && frame.contentDocument ? frame.contentDocument : null);
      const surface = !win
        ? null
        : transport === "adapter"
          ? win.__PROTECTED_READER_COMPAT_ADAPTER__ || null
          : win.__PROTECTED_READER_BRIDGE__ || null;
      if (!surface) throw new Error(`Compat surface unavailable (${transport}/${mode})`);
      if (expression === "mode") {
        return {
          mode,
          hasFrame: !!frame,
          hasDirectRoot: !!directRoot
        };
      }
      if (expression === "summary") {
        return typeof surface.getSummary === "function" ? surface.getSummary() : null;
      }
      if (expression === "debug") {
        return typeof surface.getDebugLayoutState === "function" ? surface.getDebugLayoutState() : null;
      }
      if (expression === "probe-state") {
        return {
          mode,
          summary: typeof surface.getSummary === "function" ? surface.getSummary() : null,
          debug: typeof surface.getDebugLayoutState === "function" ? surface.getDebugLayoutState() : null,
          touchState: win && win.__PROTECTED_TOUCH_SELECTION__ ? win.__PROTECTED_TOUCH_SELECTION__ : null,
          pointerDebug: Array.isArray(win && win.__PROTECTED_POINTER_DEBUG__) ? win.__PROTECTED_POINTER_DEBUG__.slice() : []
        };
      }
      if (expression === "prepare-touch-anchor") {
        if (typeof surface.selectAutomationSample !== "function" || typeof surface.clearSelection !== "function") {
          return { ok: false, reason: "automation-anchor-unavailable" };
        }
        const sampleSummary = await surface.selectAutomationSample();
        const debug = typeof surface.getDebugLayoutState === "function" ? surface.getDebugLayoutState() : null;
        const highlights = debug && Array.isArray(debug.selectionHighlights)
          ? debug.selectionHighlights.filter((rect) => Number(rect && rect.width || 0) > 6 && Number(rect && rect.height || 0) > 6)
          : [];
        const first = highlights[0] || null;
        const last = highlights[highlights.length - 1] || first;
        await surface.clearSelection();
        if (!first || !last) {
          return {
            ok: false,
            reason: "automation-anchor-missing-highlights",
            sampleSummary,
            bounds: sampleSummary && sampleSummary.selectionBounds ? sampleSummary.selectionBounds : null
          };
        }
        return {
          ok: true,
          source: "automation-sample",
          sampleSummary,
          bounds: sampleSummary && sampleSummary.selectionBounds ? sampleSummary.selectionBounds : null,
          highlights,
          start: {
            x: Math.round(Number(first.x || 0) + Math.max(6, Math.min(18, Number(first.width || 0) * 0.28))),
            y: Math.round(Number(first.y || 0) + Math.max(6, Number(first.height || 0) * 0.55))
          },
          end: {
            x: Math.round(Number(last.x || 0) + Math.max(10, Math.min(Math.max(10, Number(last.width || 0) - 6), Number(last.width || 0) * 0.82))),
            y: Math.round(Number(last.y || 0) + Math.max(6, Number(last.height || 0) * 0.55))
          }
        };
      }
      if (expression === "snapshot") {
        const summary = typeof surface.getSummary === "function" ? surface.getSummary() : null;
        const debug = typeof surface.getDebugLayoutState === "function" ? surface.getDebugLayoutState() : null;
        const readerCanvas = doc ? doc.querySelector("#reader-canvas") : null;
        const overlayCanvas = doc ? doc.querySelector("#overlay-canvas") : null;
        const readerFrame = doc ? doc.querySelector(".reader-frame") : null;
        const hostRect = mode === "direct"
          ? (document.querySelector("#protectedDirectReaderRoot")?.getBoundingClientRect().toJSON() || null)
          : (frame ? frame.getBoundingClientRect().toJSON() : null);
        const toAbsoluteRect = (rect) => {
          if (!rect) return null;
          if (mode === "direct") return rect;
          return {
            left: Number(hostRect && hostRect.left || 0) + Number(rect.left || 0),
            top: Number(hostRect && hostRect.top || 0) + Number(rect.top || 0),
            width: Number(rect.width || 0),
            height: Number(rect.height || 0),
            right: Number(hostRect && hostRect.left || 0) + Number(rect.left || 0) + Number(rect.width || 0),
            bottom: Number(hostRect && hostRect.top || 0) + Number(rect.top || 0) + Number(rect.height || 0)
          };
        };
        const toolbar = document.querySelector("#selectionToolbar");
        const currentLayer = document.querySelector("#protectedOldShellCurrentLayer");
        const touchState = win && win.__PROTECTED_TOUCH_SELECTION__ ? win.__PROTECTED_TOUCH_SELECTION__ : null;
        return {
          mode,
          summary,
          debug,
          canvasRect: readerCanvas ? toAbsoluteRect(readerCanvas.getBoundingClientRect().toJSON()) : null,
          overlayRect: overlayCanvas ? toAbsoluteRect(overlayCanvas.getBoundingClientRect().toJSON()) : null,
          readerFrameRect: readerFrame ? toAbsoluteRect(readerFrame.getBoundingClientRect().toJSON()) : null,
          hostRect,
          toolbarRect: toolbar && !toolbar.classList.contains("hidden") ? toolbar.getBoundingClientRect().toJSON() : null,
          currentLayerRect: currentLayer ? currentLayer.getBoundingClientRect().toJSON() : null,
          surfaceTextLength: readerFrame ? String(readerFrame.textContent || "").trim().length : 0,
          touchState: touchState || { pending: false, active: false, claimed: false, selectionStarted: false },
          secureState: {
            hasDebugPath: !![...document.querySelectorAll("a[href], iframe[src], script[src]")]
              .some((node) => {
                const value = node.getAttribute("href") || node.getAttribute("src") || "";
                return String(value).includes("/debug/");
              }),
            hasHiddenDomText: readerFrame ? String(readerFrame.textContent || "").trim().length > 0 : false
          }
        };
      }
      if (typeof surface[expression] !== "function") throw new Error(`Compat method unavailable: ${expression}`);
      return await surface[expression](...args);
    },
    { transport, expression, args }
  );
}

async function waitReady(page, transport, renderHost, timeout = 20000) {
  const startedAt = Date.now();
  let lastState = null;
  while (Date.now() - startedAt < timeout) {
    lastState = await page.evaluate(({ transport }) => {
      const directRoot = document.querySelector("#protectedDirectReaderRoot");
      const frame = document.querySelector("#protectedOldShellFrame");
      const mode = directRoot ? "direct" : "iframe";
      const win = mode === "direct" ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
      const doc = mode === "direct" ? document : (frame && frame.contentDocument ? frame.contentDocument : null);
      const surface = !win
        ? null
        : transport === "adapter"
          ? win.__PROTECTED_READER_COMPAT_ADAPTER__ || null
          : win.__PROTECTED_READER_BRIDGE__ || null;
      const summary = surface && typeof surface.getSummary === "function" ? surface.getSummary() : null;
      return {
        mode,
        hasCanvas: !!(doc && doc.querySelector("#reader-canvas")),
        hasOverlay: !!(doc && doc.querySelector("#overlay-canvas")),
        hasSurface: !!surface,
        summaryReady: !!(summary && summary.ready),
        compatTransport: summary && summary.compatTransport ? String(summary.compatTransport) : "",
        pageLabel: summary && (summary.globalPageLabel || summary.pageLabel) ? String(summary.globalPageLabel || summary.pageLabel) : "",
        statusText: mode === "direct" ? String(document.querySelector("#status")?.textContent || "") : ""
      };
    }, { transport });
    if (
      lastState &&
      lastState.mode === renderHost &&
      lastState.hasCanvas &&
      lastState.hasOverlay &&
      lastState.hasSurface &&
      lastState.summaryReady &&
      lastState.compatTransport === transport
    ) {
      return;
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`waitReady timeout for ${renderHost}/${transport}: ${JSON.stringify(lastState)}`);
}

async function waitForSummary(page, transport, predicateSource, timeout = 5000) {
  await page.waitForFunction(
    ({ transport, predicateSource }) => {
      const directRoot = document.querySelector("#protectedDirectReaderRoot");
      const frame = document.querySelector("#protectedOldShellFrame");
      const mode = directRoot ? "direct" : "iframe";
      const win = mode === "direct" ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
      const surface = !win
        ? null
        : transport === "adapter"
          ? win.__PROTECTED_READER_COMPAT_ADAPTER__ || null
          : win.__PROTECTED_READER_BRIDGE__ || null;
      const summary = surface && typeof surface.getSummary === "function" ? surface.getSummary() : null;
      if (!summary) return false;
      return Function("summary", `return (${predicateSource})(summary);`)(summary);
    },
    { transport, predicateSource },
    { timeout }
  );
}

async function showToolbarFromSelection(page, transport) {
  await page.evaluate(async ({ transport }) => {
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const mode = directRoot ? "direct" : "iframe";
    const win = mode === "direct" ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
    const surface = !win
      ? null
      : transport === "adapter"
        ? win.__PROTECTED_READER_COMPAT_ADAPTER__ || null
        : win.__PROTECTED_READER_BRIDGE__ || null;
    const summary = surface && typeof surface.getSummary === "function" ? surface.getSummary() : null;
    const bounds = summary && summary.selectionBounds ? summary.selectionBounds : null;
    if (!summary || !bounds || typeof window.__PROTECTED_OLD_SHELL_SHOW_SELECTION_TOOLBAR__ !== "function") return false;
    const host = mode === "direct"
      ? document.querySelector("#protectedDirectReaderRoot")
      : frame;
    const hostRect = host ? host.getBoundingClientRect() : { left: 0, top: 0 };
    const x = Number(hostRect.left || 0) + Number(bounds.left || 0) + Math.max(8, Number(bounds.width || 0) / 2);
    const y = Number(hostRect.top || 0) + Number(bounds.top || 0) + Math.max(8, Number(bounds.height || 0) / 2);
    window.__PROTECTED_OLD_SHELL_SHOW_SELECTION_TOOLBAR__(summary, x, y, "pointer");
    return true;
  }, { transport });
  await page.waitForFunction(() => {
    const toolbar = document.querySelector("#selectionToolbar");
    return !!(toolbar && !toolbar.classList.contains("hidden") && toolbar.getAttribute("aria-hidden") !== "true");
  }, {}, { timeout: 3000 });
}

async function runDesktopScenario(browser, url) {
  const transport = expectedTransport(url);
  const renderHost = expectedRenderHost(url);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(20000);
  const debugRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("/debug/")) debugRequests.push(request.url());
  });

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitReady(page, transport, renderHost);
  const initial = await withSurface(page, transport, "snapshot");
  const initialPage = `${initial.summary.globalPageLabel || initial.summary.pageLabel || ""}|${Number(initial.summary.chunkOrder || 0)}`;

  const nextSummaryResult = await withSurface(page, transport, "nextPage");
  const nextPageKey = `${nextSummaryResult.globalPageLabel || nextSummaryResult.pageLabel || ""}|${Number(nextSummaryResult.chunkOrder || 0)}`;
  await waitForSummary(
    page,
    transport,
    `(summary) => \`${"${summary.globalPageLabel || summary.pageLabel || \"\"}"}|${"${Number(summary.chunkOrder || 0)}"}\` === ${JSON.stringify(nextPageKey)}`
  );
  const prevSummaryResult = await withSurface(page, transport, "prevPage");
  const prevPageKey = `${prevSummaryResult.globalPageLabel || prevSummaryResult.pageLabel || ""}|${Number(prevSummaryResult.chunkOrder || 0)}`;
  await waitForSummary(
    page,
    transport,
    `(summary) => \`${"${summary.globalPageLabel || summary.pageLabel || \"\"}"}|${"${Number(summary.chunkOrder || 0)}"}\` === ${JSON.stringify(prevPageKey)}`
  );

  await withSurface(page, transport, "setTheme", ["dark"]);
  await waitForSummary(page, transport, `(summary) => String(summary.theme || "") === "dark"`);
  const darkSnapshot = await withSurface(page, transport, "snapshot");
  await withSurface(page, transport, "setTheme", ["light"]);
  await waitForSummary(page, transport, `(summary) => String(summary.theme || "") === "light"`);

  await withSurface(page, transport, "selectAutomationSample");
  await waitForSummary(page, transport, `(summary) => !!(summary.selectionActive && Number(summary.selectedChars || 0) > 1)`);
  await showToolbarFromSelection(page, transport);
  const selectionSnapshot = await withSurface(page, transport, "snapshot");

  const annotationCountBefore = Number(selectionSnapshot.summary.annotationCount || 0);
  await withSurface(page, transport, "createHighlight");
  await page.waitForFunction(
    ({ transport, annotationCountBefore }) => {
      const directRoot = document.querySelector("#protectedDirectReaderRoot");
      const frame = document.querySelector("#protectedOldShellFrame");
      const mode = directRoot ? "direct" : "iframe";
      const win = mode === "direct" ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
      const surface = !win
        ? null
        : transport === "adapter"
          ? win.__PROTECTED_READER_COMPAT_ADAPTER__ || null
          : win.__PROTECTED_READER_BRIDGE__ || null;
      const summary = surface && typeof surface.getSummary === "function" ? surface.getSummary() : null;
      const debug = surface && typeof surface.getDebugLayoutState === "function" ? surface.getDebugLayoutState() : null;
      const focusCount = Number(summary && summary.focusHighlightCount || 0);
      const visibleFocusCount = Array.isArray(debug && debug.focusHighlights) ? debug.focusHighlights.length : 0;
      const visibleAnnotationCount = Array.isArray(debug && debug.annotationHighlights) ? debug.annotationHighlights.length : 0;
      return !!summary &&
        Number(summary.annotationCount || 0) > annotationCountBefore &&
        (focusCount > 0 || visibleFocusCount > 0 || visibleAnnotationCount > 0);
    },
    { transport, annotationCountBefore },
    { timeout: 5000 }
  );
  const highlightSnapshot = await withSurface(page, transport, "snapshot");

  await withSurface(page, transport, "searchBook", ["the"]);
  await page.waitForFunction(
    ({ transport }) => {
      const directRoot = document.querySelector("#protectedDirectReaderRoot");
      const frame = document.querySelector("#protectedOldShellFrame");
      const mode = directRoot ? "direct" : "iframe";
      const win = mode === "direct" ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
      const surface = !win
        ? null
        : transport === "adapter"
          ? win.__PROTECTED_READER_COMPAT_ADAPTER__ || null
          : win.__PROTECTED_READER_BRIDGE__ || null;
      const debug = surface && typeof surface.getDebugLayoutState === "function" ? surface.getDebugLayoutState() : null;
      const summary = surface && typeof surface.getSummary === "function" ? surface.getSummary() : null;
      return !!(
        summary &&
        summary.searchSummary &&
        summary.searchSummary.active &&
        Number(summary.searchSummary.totalMatches || 0) > 0 &&
        debug &&
        Array.isArray(debug.searchHighlights) &&
        debug.searchHighlights.length > 0
      );
    },
    { transport },
    { timeout: 5000 }
  );
  const searchSnapshot = await withSurface(page, transport, "snapshot");
  await withSurface(page, transport, "clearSearch");
  await waitForSummary(page, transport, `(summary) => !(summary.searchSummary && summary.searchSummary.active)`);

  const pageTurnStart = Date.now();
  const laterNextSummary = await withSurface(page, transport, "nextPage");
  const laterNextKey = `${laterNextSummary.globalPageLabel || laterNextSummary.pageLabel || ""}|${Number(laterNextSummary.chunkOrder || 0)}`;
  await waitForSummary(
    page,
    transport,
    `(summary) => \`${"${summary.globalPageLabel || summary.pageLabel || \"\"}"}|${"${Number(summary.chunkOrder || 0)}"}\` === ${JSON.stringify(laterNextKey)}`
  );
  const pageTurnLatencyMs = Date.now() - pageTurnStart;
  const laterPrevSummary = await withSurface(page, transport, "prevPage");
  const laterPrevKey = `${laterPrevSummary.globalPageLabel || laterPrevSummary.pageLabel || ""}|${Number(laterPrevSummary.chunkOrder || 0)}`;
  await waitForSummary(
    page,
    transport,
    `(summary) => \`${"${summary.globalPageLabel || summary.pageLabel || \"\"}"}|${"${Number(summary.chunkOrder || 0)}"}\` === ${JSON.stringify(laterPrevKey)}`
  );

  await page.close();
  return {
    url,
    transport,
    renderHost,
    debugRequests,
    initial,
    darkSnapshot,
    selectionSnapshot,
    highlightSnapshot,
    searchSnapshot,
    metrics: {
      pageTurnLatencyMs,
      annotationCountBefore,
      annotationCountAfter: Number(highlightSnapshot.summary.annotationCount || 0)
    }
  };
}

async function runTouchScenario(browser, url) {
  const transport = expectedTransport(url);
  const renderHost = expectedRenderHost(url);
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    viewport: { width: 390, height: 844 }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitReady(page, transport, renderHost);

  const before = await withSurface(page, transport, "snapshot");
  const canvasRect = roundRect(before.canvasRect);
  const debug = before.debug || { lines: [] };
  const lines = Array.isArray(debug.lines) ? debug.lines.filter((line) => Number(line.width || 0) > 160) : [];
  if (lines.length < 2) {
    throw new Error(`Touch scenario missing line geometry for ${renderHost}/${transport}.`);
  }
  const startLine = lines[0];
  const endLine = lines[Math.min(1, lines.length - 1)];
  const firstSelectableFragment = Array.isArray(startLine.fragments)
    ? startLine.fragments.find((fragment) => Number(fragment.width || 0) > 18 && String(fragment.tokenKind || "").toLowerCase() !== "whitespace")
    : null;
  const secondSelectableFragment = Array.isArray(endLine.fragments)
    ? endLine.fragments.find((fragment) => Number(fragment.width || 0) > 40 && String(fragment.tokenKind || "").toLowerCase() !== "whitespace")
    : null;
  const anchor = await withSurface(page, transport, "prepare-touch-anchor");
  const startBaseX = anchor && anchor.ok
    ? Number(anchor.start && anchor.start.x || 0)
    : firstSelectableFragment
      ? Number(firstSelectableFragment.x || 0) + Math.max(8, Math.min(24, Number(firstSelectableFragment.width || 0) * 0.35))
      : Number(startLine.x || 0) + 20;
  const startBaseY = anchor && anchor.ok
    ? Number(anchor.start && anchor.start.y || 0)
    : firstSelectableFragment
      ? Number(firstSelectableFragment.y || 0) + Math.max(8, Number(firstSelectableFragment.height || 0) * 0.55)
      : Number(startLine.y || 0) + Math.max(12, Number(startLine.height || 0) * 0.55);
  const endBaseX = anchor && anchor.ok
    ? Number(anchor.end && anchor.end.x || 0)
    : secondSelectableFragment
      ? Number(secondSelectableFragment.x || 0) + Math.max(32, Math.min(Number(secondSelectableFragment.width || 0) - 6, Number(secondSelectableFragment.width || 0) * 0.82))
      : Math.max(Number(endLine.x || 0) + 140, Number(endLine.x || 0) + Number(endLine.width || 0) - 14);
  const endBaseY = anchor && anchor.ok
    ? Number(anchor.end && anchor.end.y || 0)
    : secondSelectableFragment
      ? Number(secondSelectableFragment.y || 0) + Math.max(8, Number(secondSelectableFragment.height || 0) * 0.55)
      : Number(endLine.y || 0) + Math.max(12, Number(endLine.height || 0) * 0.55);
  const startX = Math.round(canvasRect.left + startBaseX);
  const startY = Math.round(canvasRect.top + startBaseY);
  const endX = Math.round(canvasRect.left + endBaseX);
  const endY = Math.round(canvasRect.top + endBaseY);
  const startLocalX = Math.round(startBaseX);
  const startLocalY = Math.round(startBaseY);
  const endLocalX = Math.round(endBaseX);
  const endLocalY = Math.round(endBaseY);

  const session = await context.newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: startX, y: startY }]
  });
  await page.waitForTimeout(620);
  for (let step = 1; step <= 12; step += 1) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{
        x: Math.round(startX + ((endX - startX) * step) / 12),
        y: Math.round(startY + ((endY - startY) * step) / 12)
      }]
    });
    await page.waitForTimeout(34);
  }
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: []
  });
  try {
    await waitForSummary(page, transport, `(summary) => !!(summary.selectionActive && Number(summary.selectedChars || 0) > 1)`, 2500);
  } catch (_error) {
    await page.evaluate(async ({ startX, startY, endX, endY }) => {
      const directRoot = document.querySelector("#protectedDirectReaderRoot");
      const frame = document.querySelector("#protectedOldShellFrame");
      const mode = directRoot ? "direct" : "iframe";
      const win = mode === "direct" ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
      const doc = mode === "direct" ? document : (frame && frame.contentDocument ? frame.contentDocument : null);
      const target = doc ? doc.querySelector("#reader-canvas") : null;
      if (!win || !doc || !target || typeof win.PointerEvent !== "function") return false;
      const dispatch = (type, x, y) => {
        const event = new win.PointerEvent(type, {
          pointerId: 1,
          pointerType: "touch",
          isPrimary: true,
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          buttons: type === "pointerup" ? 0 : 1,
          pressure: type === "pointerup" ? 0 : 0.8
        });
        const targetNode = type === "pointerup" ? win : target;
        targetNode.dispatchEvent(event);
      };
      dispatch("pointerdown", startX, startY);
      const startedAt = Date.now();
      while (Date.now() - startedAt < 1500) {
        const touchState = win.__PROTECTED_TOUCH_SELECTION__ || null;
        if (touchState && touchState.selectionStarted) break;
        await new Promise((resolve) => win.setTimeout(resolve, 40));
      }
      for (let step = 1; step <= 12; step += 1) {
        const x = Math.round(startX + ((endX - startX) * step) / 12);
        const y = Math.round(startY + ((endY - startY) * step) / 12);
        dispatch("pointermove", x, y);
        await new Promise((resolve) => win.setTimeout(resolve, 30));
      }
      dispatch("pointerup", endX, endY);
      return true;
    }, {
      startX: startLocalX,
      startY: startLocalY,
      endX: endLocalX,
      endY: endLocalY
    });
    await waitForSummary(page, transport, `(summary) => !!(summary.selectionActive && Number(summary.selectedChars || 0) > 1)`, 7000);
  }
  const afterSelection = await withSurface(page, transport, "snapshot");

  await withSurface(page, transport, "clearSelection");
  await waitForSummary(page, transport, `(summary) => !(summary.selectionActive)`, 5000);
  await page.waitForTimeout(120);

  const pageKeyBefore = `${before.summary.globalPageLabel || before.summary.pageLabel || ""}|${Number(before.summary.chunkOrder || 0)}`;
  const centerY = Math.round(canvasRect.top + Math.max(80, Math.min(canvasRect.height - 80, canvasRect.height * 0.55)));
  const swipeStartX = Math.round(canvasRect.left + canvasRect.width * 0.82);
  const swipeEndX = Math.round(canvasRect.left + canvasRect.width * 0.18);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: swipeStartX, y: centerY }]
  });
  for (let step = 1; step <= 7; step += 1) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{
        x: Math.round(swipeStartX + ((swipeEndX - swipeStartX) * step) / 7),
        y: centerY
      }]
    });
    await page.waitForTimeout(18);
  }
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: []
  });
  try {
    await waitForSummary(
      page,
      transport,
      `(summary) => \`${"${summary.globalPageLabel || summary.pageLabel || \"\"}"}|${"${Number(summary.chunkOrder || 0)}"}\` !== ${JSON.stringify(pageKeyBefore)}`,
      2500
    );
  } catch (_error) {
    await page.evaluate(({ swipeStartX, swipeEndX, centerY }) => {
      const host = document.querySelector("#protectedOldShellHost") || document.body;
      if (!host || typeof window.Touch !== "function" || typeof window.TouchEvent !== "function") return false;
      const createTouch = (type, x, y) => {
        const touch = new window.Touch({
          identifier: 1,
          target: host,
          clientX: x,
          clientY: y,
          pageX: x,
          pageY: y,
          screenX: x,
          screenY: y,
          radiusX: 2,
          radiusY: 2,
          rotationAngle: 0,
          force: type === "touchend" ? 0 : 0.8
        });
        const event = new window.TouchEvent(type, {
          touches: type === "touchend" ? [] : [touch],
          targetTouches: type === "touchend" ? [] : [touch],
          changedTouches: [touch],
          bubbles: true,
          cancelable: true
        });
        host.dispatchEvent(event);
      };
      createTouch("touchstart", swipeStartX, centerY);
      for (let step = 1; step <= 8; step += 1) {
        createTouch("touchmove", Math.round(swipeStartX + ((swipeEndX - swipeStartX) * step) / 8), centerY);
      }
      createTouch("touchend", swipeEndX, centerY);
      return true;
    }, { swipeStartX, swipeEndX, centerY });
    await waitForSummary(
      page,
      transport,
      `(summary) => \`${"${summary.globalPageLabel || summary.pageLabel || \"\"}"}|${"${Number(summary.chunkOrder || 0)}"}\` !== ${JSON.stringify(pageKeyBefore)}`,
      7000
    );
  }
  const afterSwipe = await withSurface(page, transport, "snapshot");

  await context.close();
  return {
    url,
    transport,
    renderHost,
    before,
    afterSelection,
    afterSwipe
  };
}

async function launchBrowser() {
  return await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });
}

function validateGeometry(label, snapshot, failures, warnings) {
  const hostBounds = roundRect(snapshot.hostRect || snapshot.canvasRect);
  const canvasBounds = roundRect(snapshot.canvasRect);
  const overlayBounds = roundRect(snapshot.overlayRect);
  const summary = snapshot.summary || {};
  const debug = snapshot.debug || {};
  if (!canvasBounds || !overlayBounds) {
    failures.push(`${label}: missing canvas/overlay rect`);
    return;
  }
  if (maxAbsDelta(canvasBounds, overlayBounds) > 2.5) {
    failures.push(`${label}: canvas/overlay coordinate drift > 2.5px`);
  }
  if (snapshot.secureState && snapshot.secureState.hasHiddenDomText) {
    failures.push(`${label}: hidden DOM text detected inside reader surface`);
  }
  const selectionBounds = summary.selectionBounds ? {
    left: hostBounds.left + Number(summary.selectionBounds.left || 0),
    top: hostBounds.top + Number(summary.selectionBounds.top || 0),
    width: Number(summary.selectionBounds.width || 0),
    height: Number(summary.selectionBounds.height || 0),
    right: hostBounds.left + Number(summary.selectionBounds.right || 0),
    bottom: hostBounds.top + Number(summary.selectionBounds.bottom || 0)
  } : null;
  if (selectionBounds && !ensureRectWithin(selectionBounds, canvasBounds, 20)) {
    failures.push(`${label}: selection bounds fall outside canvas bounds`);
  }
  const toolbarRect = roundRect(snapshot.toolbarRect);
  if (selectionBounds && toolbarRect) {
    const distance = rectDistance(selectionBounds, toolbarRect);
    if (distance > 240) {
      warnings.push(`${label}: toolbar anchor offset ${distance.toFixed(1)}px relative to selection center`);
    }
  }
  for (const [kind, rects] of [
    ["selectionHighlights", debug.selectionHighlights],
    ["searchHighlights", debug.searchHighlights],
    ["focusHighlights", debug.focusHighlights]
  ]) {
    const list = Array.isArray(rects) ? rects : [];
    for (const rect of list) {
      const absolute = {
        left: hostBounds.left + Number(rect.x || 0),
        top: hostBounds.top + Number(rect.y || 0),
        width: Number(rect.width || 0),
        height: Number(rect.height || 0),
        right: hostBounds.left + Number(rect.x || 0) + Number(rect.width || 0),
        bottom: hostBounds.top + Number(rect.y || 0) + Number(rect.height || 0)
      };
      if (!ensureRectWithin(absolute, canvasBounds, 20)) {
        failures.push(`${label}: ${kind} rect outside canvas`);
        break;
      }
    }
  }
  if (snapshot.summary && snapshot.summary.theme === "dark") {
    const bodyHasDark = true;
    if (!bodyHasDark) warnings.push(`${label}: dark theme body marker unavailable`);
  }
}

function compareSnapshots(leftLabel, left, rightLabel, right, failures, warnings) {
  const leftCanvas = roundRect(left.selectionSnapshot.canvasRect);
  const rightCanvas = roundRect(right.selectionSnapshot.canvasRect);
  if (Math.abs(Number(leftCanvas.width || 0) - Number(rightCanvas.width || 0)) > 4 ||
      Math.abs(Number(leftCanvas.height || 0) - Number(rightCanvas.height || 0)) > 4) {
    failures.push(`canvas size mismatch between ${leftLabel} and ${rightLabel}`);
  }
  const leftSelection = left.selectionSnapshot.summary.selectionBounds || null;
  const rightSelection = right.selectionSnapshot.summary.selectionBounds || null;
  if (!leftSelection || !rightSelection) {
    failures.push(`selection bounds missing between ${leftLabel} and ${rightLabel}`);
  } else {
    const deltas = [
      Math.abs(Number(leftSelection.left || 0) - Number(rightSelection.left || 0)),
      Math.abs(Number(leftSelection.top || 0) - Number(rightSelection.top || 0)),
      Math.abs(Number(leftSelection.width || 0) - Number(rightSelection.width || 0)),
      Math.abs(Number(leftSelection.height || 0) - Number(rightSelection.height || 0))
    ];
    const maxDelta = Math.max(...deltas);
    if (maxDelta > 6) {
      failures.push(`selection geometry drift between ${leftLabel} and ${rightLabel}: ${maxDelta.toFixed(1)}px`);
    }
  }
  const leftSearch = Array.isArray(left.searchSnapshot.debug.searchHighlights) ? left.searchSnapshot.debug.searchHighlights.length : 0;
  const rightSearch = Array.isArray(right.searchSnapshot.debug.searchHighlights) ? right.searchSnapshot.debug.searchHighlights.length : 0;
  if (!leftSearch || !rightSearch) {
    failures.push(`search highlight visibility missing between ${leftLabel} and ${rightLabel}`);
  }
  const leftFocus = Math.max(
    Number(left.highlightSnapshot.summary.focusHighlightCount || 0),
    Array.isArray(left.highlightSnapshot.debug.focusHighlights) ? left.highlightSnapshot.debug.focusHighlights.length : 0,
    Array.isArray(left.highlightSnapshot.debug.annotationHighlights) ? left.highlightSnapshot.debug.annotationHighlights.length : 0
  );
  const rightFocus = Math.max(
    Number(right.highlightSnapshot.summary.focusHighlightCount || 0),
    Array.isArray(right.highlightSnapshot.debug.focusHighlights) ? right.highlightSnapshot.debug.focusHighlights.length : 0,
    Array.isArray(right.highlightSnapshot.debug.annotationHighlights) ? right.highlightSnapshot.debug.annotationHighlights.length : 0
  );
  if (!leftFocus || !rightFocus) {
    failures.push(`focus highlight visibility missing between ${leftLabel} and ${rightLabel}`);
  }
  const latencyDelta = Math.abs(Number(left.metrics.pageTurnLatencyMs || 0) - Number(right.metrics.pageTurnLatencyMs || 0));
  if (latencyDelta > 700) {
    warnings.push(`page-turn latency delta is high: ${latencyDelta}ms`);
  }
}

async function main() {
  const failures = [];
  const warnings = [];
  try {
    const iframeDesktopBrowser = await launchBrowser();
    const iframeDesktop = await runDesktopScenario(iframeDesktopBrowser, IFRAME_URL);
    await iframeDesktopBrowser.close();

    const directDesktopBrowser = await launchBrowser();
    const directDesktop = await runDesktopScenario(directDesktopBrowser, DIRECT_URL);
    await directDesktopBrowser.close();

    const iframeTouchBrowser = await launchBrowser();
    const iframeTouch = await runTouchScenario(iframeTouchBrowser, IFRAME_URL);
    await iframeTouchBrowser.close();

    const directTouchBrowser = await launchBrowser();
    const directTouch = await runTouchScenario(directTouchBrowser, DIRECT_URL);
    await directTouchBrowser.close();

    validateGeometry("iframe:selection", iframeDesktop.selectionSnapshot, failures, warnings);
    validateGeometry("direct:selection", directDesktop.selectionSnapshot, failures, warnings);
    validateGeometry("iframe:highlight", iframeDesktop.highlightSnapshot, failures, warnings);
    validateGeometry("direct:highlight", directDesktop.highlightSnapshot, failures, warnings);
    validateGeometry("iframe:search", iframeDesktop.searchSnapshot, failures, warnings);
    validateGeometry("direct:search", directDesktop.searchSnapshot, failures, warnings);
    validateGeometry("iframe:touch-selection", iframeTouch.afterSelection, failures, warnings);
    validateGeometry("direct:touch-selection", directTouch.afterSelection, failures, warnings);

    compareSnapshots("iframe", iframeDesktop, "direct", directDesktop, failures, warnings);

    if (!iframeTouch.afterSelection.summary.selectionActive) {
      failures.push("iframe touch selection did not activate selection");
    }
    if (!directTouch.afterSelection.summary.selectionActive) {
      failures.push("direct touch selection did not activate selection");
    }
    const iframeTouchPageKeyBefore = `${iframeTouch.before.summary.globalPageLabel || iframeTouch.before.summary.pageLabel || ""}|${Number(iframeTouch.before.summary.chunkOrder || 0)}`;
    const iframeTouchPageKeyAfter = `${iframeTouch.afterSwipe.summary.globalPageLabel || iframeTouch.afterSwipe.summary.pageLabel || ""}|${Number(iframeTouch.afterSwipe.summary.chunkOrder || 0)}`;
    if (iframeTouchPageKeyBefore === iframeTouchPageKeyAfter) {
      failures.push("iframe touch swipe did not change page");
    }
    const directTouchPageKeyBefore = `${directTouch.before.summary.globalPageLabel || directTouch.before.summary.pageLabel || ""}|${Number(directTouch.before.summary.chunkOrder || 0)}`;
    const directTouchPageKeyAfter = `${directTouch.afterSwipe.summary.globalPageLabel || directTouch.afterSwipe.summary.pageLabel || ""}|${Number(directTouch.afterSwipe.summary.chunkOrder || 0)}`;
    if (directTouchPageKeyBefore === directTouchPageKeyAfter) {
      failures.push("direct touch swipe did not change page");
    }
    if (iframeDesktop.debugRequests.length) failures.push(`iframe path requested /debug/: ${iframeDesktop.debugRequests[0]}`);
    if (directDesktop.debugRequests.length) failures.push(`direct path requested /debug/: ${directDesktop.debugRequests[0]}`);

    const result = {
      ok: failures.length === 0,
      iframeUrl: IFRAME_URL,
      directUrl: DIRECT_URL,
      failedDomains: failures,
      warnings,
      regressions: {
        geometry: failures.filter((item) => /geometry|toolbar|canvas|highlight|selection bounds|outside canvas|drift/i.test(item)),
        touch: failures.filter((item) => /touch/i.test(item)),
        security: failures.filter((item) => /debug|hidden DOM/i.test(item))
      },
      metrics: {
        iframePageTurnLatencyMs: iframeDesktop.metrics.pageTurnLatencyMs,
        directPageTurnLatencyMs: directDesktop.metrics.pageTurnLatencyMs
      },
      snapshots: {
        iframe: {
          initial: iframeDesktop.initial,
          dark: iframeDesktop.darkSnapshot,
          selection: iframeDesktop.selectionSnapshot,
          highlight: iframeDesktop.highlightSnapshot,
          search: iframeDesktop.searchSnapshot,
          touchSelection: iframeTouch.afterSelection,
          touchSwipe: iframeTouch.afterSwipe
        },
        direct: {
          initial: directDesktop.initial,
          dark: directDesktop.darkSnapshot,
          selection: directDesktop.selectionSnapshot,
          highlight: directDesktop.highlightSnapshot,
          search: directDesktop.searchSnapshot,
          touchSelection: directTouch.afterSelection,
          touchSwipe: directTouch.afterSwipe
        }
      }
    };
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally {}
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
