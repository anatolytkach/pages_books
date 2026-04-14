#!/usr/bin/env node

const { chromium, devices } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

function getArgValue(name, fallback = "") {
  for (const item of process.argv.slice(2)) {
    if (item.startsWith(`--${name}=`)) return item.slice(name.length + 3);
  }
  return fallback;
}

const URL_TO_CHECK =
  getArgValue("url") ||
  "http://127.0.0.1:8788/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape";
const PATH_KIND = String(getArgValue("path", "")).trim().toLowerCase() || inferPathKind(URL_TO_CHECK);

function inferPathKind(url) {
  try {
    const parsed = new URL(url);
    return String(parsed.searchParams.get("protectedRenderHost") || "").trim().toLowerCase() === "direct"
      ? "direct"
      : "iframe";
  } catch (_error) {
    return "iframe";
  }
}

async function withSurface(page, expression, args = []) {
  return await page.evaluate(
    async ({ expression, args }) => {
      const directRoot = document.querySelector("#protectedDirectReaderRoot");
      const frame = document.querySelector("#protectedOldShellFrame");
      const mode = directRoot ? "direct" : "iframe";
      const win = mode === "direct" ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
      const doc = mode === "direct" ? document : (frame && frame.contentDocument ? frame.contentDocument : null);
      const surface = win
        ? (win.__PROTECTED_READER_BRIDGE__ || win.__PROTECTED_READER_COMPAT_ADAPTER__ || null)
        : null;
      if (!win || !doc || !surface) {
        throw new Error(`Compat surface unavailable for ${mode}`);
      }
      if (expression === "mode") {
        return { mode };
      }
      if (expression === "summary") {
        return typeof surface.getSummary === "function" ? surface.getSummary() : null;
      }
      if (expression === "debug") {
        return typeof surface.getDebugLayoutState === "function" ? surface.getDebugLayoutState() : null;
      }
      if (expression === "touch-state") {
        return win.__PROTECTED_TOUCH_SELECTION__ || null;
      }
      if (expression === "install-probe") {
        const target = doc.querySelector("#reader-canvas");
        const overlay = doc.querySelector("#overlay-canvas");
        const host = mode === "direct" ? document.querySelector("#protectedOldShellHost") : frame;
        if (!target) {
          return { ok: false, reason: "missing-canvas" };
        }
        const trace = [];
        const push = (channel, event) => {
          const touch = event && event.touches && event.touches.length ? event.touches[0] : null;
          const changed = event && event.changedTouches && event.changedTouches.length ? event.changedTouches[0] : null;
          const point = touch || changed || null;
          trace.push({
            at: Date.now(),
            channel,
            type: String(event && event.type || ""),
            pointerType: event && event.pointerType != null ? String(event.pointerType) : "",
            targetId: event && event.target && event.target.id ? String(event.target.id) : "",
            targetClass: event && event.target && event.target.className ? String(event.target.className) : "",
            cancelable: !!(event && event.cancelable),
            defaultPrevented: !!(event && event.defaultPrevented),
            clientX: Number(point ? point.clientX : event && event.clientX || 0),
            clientY: Number(point ? point.clientY : event && event.clientY || 0)
          });
          if (trace.length > 200) trace.shift();
        };
        const bind = (node, label) => {
          if (!node || node.__phase6TouchProbeBound) return;
          node.__phase6TouchProbeBound = true;
          ["pointerdown", "pointermove", "pointerup", "pointercancel", "touchstart", "touchmove", "touchend", "touchcancel"].forEach((type) => {
            node.addEventListener(type, (event) => push(label, event), { capture: true, passive: false });
          });
        };
        bind(doc, "doc");
        bind(target, "canvas");
        bind(overlay, "overlay");
        bind(host, "host");
        win.__PHASE6_TOUCH_TRACE__ = trace;
        return { ok: true, mode };
      }
      if (expression === "probe-state") {
        const summary = typeof surface.getSummary === "function" ? surface.getSummary() : null;
        return {
          mode,
          summary,
          touchState: win.__PROTECTED_TOUCH_SELECTION__ || null,
          trace: Array.isArray(win.__PHASE6_TOUCH_TRACE__) ? win.__PHASE6_TOUCH_TRACE__.slice() : [],
          pointerDebug: Array.isArray(win.__PROTECTED_POINTER_DEBUG__) ? win.__PROTECTED_POINTER_DEBUG__.slice() : []
        };
      }
      if (expression === "touch-points") {
        const debug = typeof surface.getDebugLayoutState === "function" ? surface.getDebugLayoutState() : null;
        const canvas = doc.querySelector("#reader-canvas");
        const canvasRect = canvas ? canvas.getBoundingClientRect().toJSON() : null;
        const lines = debug && Array.isArray(debug.lines)
          ? debug.lines.filter((line) => Number(line.width || 0) > 140)
          : [];
        return {
          mode,
          canvasRect,
          lines: lines.slice(0, 3)
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
        const bounds = sampleSummary && sampleSummary.selectionBounds ? sampleSummary.selectionBounds : null;
        await surface.clearSelection();
        if (!first || !last) {
          return {
            ok: false,
            reason: "automation-anchor-missing-highlights",
            sampleSummary,
            bounds
          };
        }
        return {
          ok: true,
          source: "automation-sample",
          sampleSummary,
          bounds,
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
      if (expression === "dispatch-touch-fallback") {
        const target = doc.querySelector("#reader-canvas");
        if (!target || typeof win.Touch !== "function" || typeof win.TouchEvent !== "function") {
          return { ok: false, reason: "touch-event-constructor-unavailable" };
        }
        const [startX, startY, endX, endY] = args;
        const dispatchTouch = (type, x, y) => {
          const touch = new win.Touch({
            identifier: 1,
            target,
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
          const event = new win.TouchEvent(type, {
            touches: type === "touchend" ? [] : [touch],
            targetTouches: type === "touchend" ? [] : [touch],
            changedTouches: [touch],
            bubbles: true,
            cancelable: true
          });
          return target.dispatchEvent(event);
        };
        dispatchTouch("touchstart", startX, startY);
        return { ok: true };
      }
      throw new Error(`Unknown expression: ${expression}`);
    },
    { expression, args }
  );
}

async function waitReady(page, timeout = 20000) {
  const startedAt = Date.now();
  let lastState = null;
  while (Date.now() - startedAt < timeout) {
    lastState = await page.evaluate(() => {
      const directRoot = document.querySelector("#protectedDirectReaderRoot");
      const frame = document.querySelector("#protectedOldShellFrame");
      const mode = directRoot ? "direct" : "iframe";
      const win = mode === "direct" ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
      const doc = mode === "direct" ? document : (frame && frame.contentDocument ? frame.contentDocument : null);
      const surface = win
        ? (win.__PROTECTED_READER_BRIDGE__ || win.__PROTECTED_READER_COMPAT_ADAPTER__ || null)
        : null;
      const summary = surface && typeof surface.getSummary === "function" ? surface.getSummary() : null;
      return {
        mode,
        hasCanvas: !!(doc && doc.querySelector("#reader-canvas")),
        hasOverlay: !!(doc && doc.querySelector("#overlay-canvas")),
        hasSurface: !!surface,
        summaryReady: !!(summary && summary.ready)
      };
    });
    if (lastState && lastState.hasCanvas && lastState.hasOverlay && lastState.hasSurface && lastState.summaryReady) {
      return lastState.mode;
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`waitReady timeout: ${JSON.stringify(lastState)}`);
}

async function launchBrowser() {
  return await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });
}

async function dispatchCdpTouch(session, page, points) {
  for (const item of points) {
    await session.send("Input.dispatchTouchEvent", item);
    await page.waitForTimeout(item.waitMs || 0);
  }
}

function buildResult(path, rootCauseStage, before, afterCdp, afterFallback, extra = {}) {
  const cdpTrace = Array.isArray(afterCdp.trace) ? afterCdp.trace : [];
  const fallbackTrace = Array.isArray(afterFallback.trace) ? afterFallback.trace : [];
  const sawTouchEvent = cdpTrace.some((entry) => entry.type.startsWith("touch"));
  const sawPointerEvent = cdpTrace.some((entry) => entry.type.startsWith("pointer"));
  const sawCanvasTouch = cdpTrace.some((entry) => entry.channel === "canvas" && entry.type.startsWith("touch"));
  const sawCanvasPointer = cdpTrace.some((entry) => entry.channel === "canvas" && entry.type.startsWith("pointer"));
  const sawFallbackTouch = fallbackTrace.some((entry) => entry.type.startsWith("touch"));
  return {
    ok: !!(afterFallback.summary && afterFallback.summary.selectionActive && Number(afterFallback.summary.selectedChars || 0) > 1),
    path,
    rootCauseStage,
    eventPipelineReached: {
      cdpTouch: sawTouchEvent,
      cdpPointer: sawPointerEvent,
      canvasTouch: sawCanvasTouch,
      canvasPointer: sawCanvasPointer,
      fallbackTouch: sawFallbackTouch
    },
    runtimeStateReached: {
      before: before.touchState || null,
      afterCdpHold: extra.afterCdpHold && extra.afterCdpHold.touchState ? extra.afterCdpHold.touchState : null,
      afterCdp: afterCdp.touchState || null,
      afterFallbackHold: extra.afterFallbackHold && extra.afterFallbackHold.touchState ? extra.afterFallbackHold.touchState : null,
      afterFallback: afterFallback.touchState || null,
      selectionStartedAfterCdpHold: !!(extra.afterCdpHold && extra.afterCdpHold.touchState && extra.afterCdpHold.touchState.selectionStarted),
      selectionActiveAfterCdpHold: !!(extra.afterCdpHold && extra.afterCdpHold.summary && extra.afterCdpHold.summary.selectionActive),
      selectionStartedAfterCdp: !!(afterCdp.touchState && afterCdp.touchState.selectionStarted),
      selectionActiveAfterCdp: !!(afterCdp.summary && afterCdp.summary.selectionActive),
      selectionStartedAfterFallbackHold: !!(extra.afterFallbackHold && extra.afterFallbackHold.touchState && extra.afterFallbackHold.touchState.selectionStarted),
      selectionActiveAfterFallbackHold: !!(extra.afterFallbackHold && extra.afterFallbackHold.summary && extra.afterFallbackHold.summary.selectionActive),
      selectionStartedAfterFallback: !!(afterFallback.touchState && afterFallback.touchState.selectionStarted),
      selectionActiveAfterFallback: !!(afterFallback.summary && afterFallback.summary.selectionActive)
    },
    traces: {
      cdp: cdpTrace,
      fallback: fallbackTrace
    },
    pointerDebug: {
      before: Array.isArray(before.pointerDebug) ? before.pointerDebug : [],
      afterCdp: Array.isArray(afterCdp.pointerDebug) ? afterCdp.pointerDebug : [],
      afterFallback: Array.isArray(afterFallback.pointerDebug) ? afterFallback.pointerDebug : []
    },
    summary: {
      before: before.summary || null,
      afterCdp: afterCdp.summary || null,
      afterFallback: afterFallback.summary || null
    },
    ...extra
  };
}

async function main() {
  const browser = await launchBrowser();
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    viewport: { width: 390, height: 844 }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  try {
    await page.goto(URL_TO_CHECK, { waitUntil: "domcontentloaded" });
    const mode = await waitReady(page);
    const session = await context.newCDPSession(page);
    await withSurface(page, "install-probe");
    const points = await withSurface(page, "touch-points");
    if (!points.canvasRect || !Array.isArray(points.lines) || points.lines.length < 2) {
      throw new Error(`Touch proof missing canvas/line geometry for ${PATH_KIND}/${mode}`);
    }
    const anchor = await withSurface(page, "prepare-touch-anchor");
    const lineA = points.lines[0];
    const lineB = points.lines[1];
    const firstSelectableFragment = Array.isArray(lineA.fragments)
      ? lineA.fragments.find((fragment) => Number(fragment.width || 0) > 18 && String(fragment.tokenKind || "").toLowerCase() !== "whitespace")
      : null;
    const secondSelectableFragment = Array.isArray(lineB.fragments)
      ? lineB.fragments.find((fragment) => Number(fragment.width || 0) > 40 && String(fragment.tokenKind || "").toLowerCase() !== "whitespace")
      : null;
    const startBaseX = anchor && anchor.ok
      ? Number(anchor.start && anchor.start.x || 0)
      : firstSelectableFragment
        ? Number(firstSelectableFragment.x || 0) + Math.max(8, Math.min(24, Number(firstSelectableFragment.width || 0) * 0.35))
        : Number(lineA.x || 0) + 20;
    const startBaseY = anchor && anchor.ok
      ? Number(anchor.start && anchor.start.y || 0)
      : firstSelectableFragment
        ? Number(firstSelectableFragment.y || 0) + Math.max(8, Number(firstSelectableFragment.height || 0) * 0.55)
        : Number(lineA.y || 0) + Math.max(12, Number(lineA.height || 0) * 0.55);
    const endBaseX = anchor && anchor.ok
      ? Number(anchor.end && anchor.end.x || 0)
      : secondSelectableFragment
        ? Number(secondSelectableFragment.x || 0) + Math.max(32, Math.min(Number(secondSelectableFragment.width || 0) - 6, Number(secondSelectableFragment.width || 0) * 0.82))
        : Math.max(Number(lineB.x || 0) + 160, Number(lineB.x || 0) + Number(lineB.width || 0) - 18);
    const endBaseY = anchor && anchor.ok
      ? Number(anchor.end && anchor.end.y || 0)
      : secondSelectableFragment
        ? Number(secondSelectableFragment.y || 0) + Math.max(8, Number(secondSelectableFragment.height || 0) * 0.55)
        : Number(lineB.y || 0) + Math.max(12, Number(lineB.height || 0) * 0.55);
    const startAbsX = Math.round(Number(points.canvasRect.left || 0) + startBaseX);
    const startAbsY = Math.round(Number(points.canvasRect.top || 0) + startBaseY);
    const endAbsX = Math.round(Number(points.canvasRect.left || 0) + endBaseX);
    const endAbsY = Math.round(Number(points.canvasRect.top || 0) + endBaseY);
    const startLocalX = Math.round(startBaseX);
    const startLocalY = Math.round(startBaseY);
    const endLocalX = Math.round(endBaseX);
    const endLocalY = Math.round(endBaseY);

    const before = await withSurface(page, "probe-state");

    await dispatchCdpTouch(session, page, [
      { type: "touchStart", touchPoints: [{ x: startAbsX, y: startAbsY }], waitMs: 0 }
    ]);
    await page.waitForTimeout(620);
    const afterCdpHold = await withSurface(page, "probe-state");
    await dispatchCdpTouch(session, page, [
      ...Array.from({ length: 10 }, (_, index) => ({
        type: "touchMove",
        touchPoints: [{
          x: Math.round(startAbsX + ((endAbsX - startAbsX) * (index + 1)) / 10),
          y: Math.round(startAbsY + ((endAbsY - startAbsY) * (index + 1)) / 10)
        }],
        waitMs: 28
      })),
      { type: "touchEnd", touchPoints: [], waitMs: 300 }
    ]);
    const afterCdp = await withSurface(page, "probe-state");

    await withSurface(page, "dispatch-touch-fallback", [startLocalX, startLocalY, endLocalX, endLocalY]);
    await page.waitForTimeout(620);
    const afterFallbackHold = await withSurface(page, "probe-state");
    await page.evaluate(async ({ startX, startY, endX, endY }) => {
      const directRoot = document.querySelector("#protectedDirectReaderRoot");
      const frame = document.querySelector("#protectedOldShellFrame");
      const mode = directRoot ? "direct" : "iframe";
      const win = mode === "direct" ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
      const doc = mode === "direct" ? document : (frame && frame.contentDocument ? frame.contentDocument : null);
      const target = doc ? doc.querySelector("#reader-canvas") : null;
      if (!win || !target || typeof win.Touch !== "function" || typeof win.TouchEvent !== "function") return false;
      const createTouchEvent = (type, x, y) => {
        const touch = new win.Touch({
          identifier: 1,
          target,
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
        return new win.TouchEvent(type, {
          touches: type === "touchend" ? [] : [touch],
          targetTouches: type === "touchend" ? [] : [touch],
          changedTouches: [touch],
          bubbles: true,
          cancelable: true
        });
      };
      for (let step = 1; step <= 10; step += 1) {
        const x = Math.round(startX + ((endX - startX) * step) / 10);
        const y = Math.round(startY + ((endY - startY) * step) / 10);
        target.dispatchEvent(createTouchEvent("touchmove", x, y));
        await new Promise((resolve) => win.setTimeout(resolve, 28));
      }
      target.dispatchEvent(createTouchEvent("touchend", endX, endY));
      return true;
    }, {
      startX: startLocalX,
      startY: startLocalY,
      endX: endLocalX,
      endY: endLocalY
    });
    await page.waitForTimeout(500);
    const afterFallback = await withSurface(page, "probe-state");

    let rootCauseStage = "runtime-selection-not-entered";
    if (!Array.isArray(afterCdp.trace) || afterCdp.trace.length === 0) {
      rootCauseStage = "no-touch-events-observed";
    } else if (!afterCdp.trace.some((entry) => entry.type.startsWith("touch"))) {
      rootCauseStage = "touch-events-not-delivered";
    } else if (!afterCdp.trace.some((entry) => entry.channel === "canvas" && entry.type.startsWith("touch"))) {
      rootCauseStage = "wrong-touch-target";
    } else if (!afterCdp.trace.some((entry) => entry.type.startsWith("pointer"))) {
      rootCauseStage = "touch-not-converted-to-pointer";
    } else if (!(afterCdpHold.touchState && afterCdpHold.touchState.selectionStarted) && !(afterCdpHold.touchState && afterCdpHold.touchState.pending)) {
      rootCauseStage = "touch-pointerdown-did-not-enter-pending-state";
    } else if (!(afterCdpHold.touchState && afterCdpHold.touchState.selectionStarted)) {
      rootCauseStage = "long-press-did-not-promote-to-selection";
    } else if (!(afterCdpHold.summary && afterCdpHold.summary.selectionActive)) {
      rootCauseStage = "long-press-word-hit-test-missed";
    } else if (!(afterCdp.touchState && afterCdp.touchState.selectionStarted)) {
      rootCauseStage = "pointer-sequence-did-not-start-selection";
    }

    if (afterFallback.summary && afterFallback.summary.selectionActive && Number(afterFallback.summary.selectedChars || 0) > 1) {
      rootCauseStage = "selection-proof-succeeded";
    }

    const result = buildResult(PATH_KIND, rootCauseStage, before, afterCdp, afterFallback, {
      url: URL_TO_CHECK,
      mode,
      anchor,
      touchPoints: {
        startBaseX,
        startBaseY,
        endBaseX,
        endBaseY,
        startAbsX,
        startAbsY,
        endAbsX,
        endAbsY
      },
      afterCdpHold,
      afterFallbackHold
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
