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
  return chromium.launch({
    headless: true,
    executablePath: EXECUTABLE_PATH
  });
}

async function evaluateState(page) {
  return page.evaluate(async () => {
    function clone(value) {
      return value ? JSON.parse(JSON.stringify(value)) : value;
    }

    function apiPresent(api) {
      if (!api) return false;
      const methods = [
        "loadBook",
        "goToLocation",
        "nextPage",
        "prevPage",
        "getLocation",
        "search",
        "getSearchState",
        "createHighlight",
        "addNote",
        "getAnnotations",
        "setTheme",
        "setFontScale"
      ];
      return methods.every((method) => typeof api[method] === "function");
    }

    const adapter = window.__READERPUB_UNPROTECTED_RUNTIME_ADAPTER__ || null;
    const runtime = window.__READERPUB_UNPROTECTED_RUNTIME__ || null;
    const hub = window.__READERPUB_READER_EVENTS__ || null;
    const state = clone(window.__READERPUB_UNPROTECTED_RUNTIME_STATE__ || null);
    const directRoot = document.querySelector("[data-readerpub-unprotected-runtime-root='true']");
    const initialLocation = adapter && typeof adapter.getLocation === "function" ? clone(adapter.getLocation()) : null;
    const initialLabel = String(document.querySelector("#page-count")?.textContent || "").trim();
    let afterNextLocation = null;
    let afterPrevLocation = null;
    let afterNextLabel = initialLabel;
    let afterPrevLabel = initialLabel;

    if (adapter && typeof adapter.nextPage === "function" && state && state.location && state.location.canGoNext) {
      try { await Promise.resolve(adapter.nextPage()); } catch (_error) {}
      await new Promise((resolve) => setTimeout(resolve, 800));
      afterNextLocation = clone(adapter.getLocation ? adapter.getLocation() : null);
      afterNextLabel = String(document.querySelector("#page-count")?.textContent || "").trim();
      try { await Promise.resolve(adapter.prevPage()); } catch (_error2) {}
      await new Promise((resolve) => setTimeout(resolve, 800));
      afterPrevLocation = clone(adapter.getLocation ? adapter.getLocation() : null);
      afterPrevLabel = String(document.querySelector("#page-count")?.textContent || "").trim();
    }

    const missingPieces = [];
    if (!apiPresent(adapter)) missingPieces.push("runtime-api");
    if (!state) missingPieces.push("runtime-state");
    if (!hub || !Array.isArray(hub.supportedEvents) || !hub.supportedEvents.length) missingPieces.push("event-surface");
    if (!directRoot) missingPieces.push("direct-root");
    if (!state || state.status !== "ready") missingPieces.push("ready-state");
    if (!state || !state.render || !state.render.ready) missingPieces.push("render-ready");
    if (!state || !state.pagination || !state.pagination.firstRenderableStateReached) missingPieces.push("first-renderable");

    const result = {
      runtimePath: String(window.__readerpubUnprotectedRuntimePath || "legacy"),
      iframeCount: document.querySelectorAll("#viewerStack iframe, #viewer iframe, #viewer-prev iframe, #viewer-next iframe").length,
      directRootPresent: !!directRoot,
      runtimeApiPresent: apiPresent(adapter),
      runtimeStatePresent: !!state,
      eventSurfacePresent: !!(hub && Array.isArray(hub.supportedEvents) && hub.supportedEvents.length),
      loadSucceeded: !!(state && state.status === "ready"),
      firstRenderableStateReached: !!(state && state.pagination && state.pagination.firstRenderableStateReached),
      initialLocation,
      afterNextLocation,
      afterPrevLocation,
      initialLabel,
      afterNextLabel,
      afterPrevLabel,
      renderTextLength: String(directRoot && directRoot.textContent || "").trim().length,
      state,
      missingPieces,
      warnings: []
    };

    if (result.runtimePath !== "new") result.missingPieces.push("runtime-path");
    if (result.iframeCount !== 0) result.missingPieces.push("iframe-leak");
    if (result.renderTextLength < 80) result.missingPieces.push("meaningful-render");
    const nextChangedSection =
      initialLocation &&
      afterNextLocation &&
      typeof initialLocation.spineIndex === "number" &&
      typeof afterNextLocation.spineIndex === "number" &&
      initialLocation.spineIndex !== afterNextLocation.spineIndex;
    const nextChangedPage =
      initialLocation &&
      afterNextLocation &&
      typeof initialLocation.pageIndex === "number" &&
      typeof afterNextLocation.pageIndex === "number" &&
      initialLocation.pageIndex !== afterNextLocation.pageIndex;
    if (
      !(nextChangedSection || nextChangedPage) &&
      state &&
      state.location &&
      state.location.canGoNext
    ) {
      result.missingPieces.push("next-navigation");
    }
    if (
      initialLocation &&
      afterPrevLocation &&
      typeof initialLocation.spineIndex === "number" &&
      typeof afterPrevLocation.spineIndex === "number" &&
      initialLocation.spineIndex !== afterPrevLocation.spineIndex &&
      state &&
      state.location &&
      state.location.canGoNext
    ) {
      result.warnings.push("prev-did-not-return-to-initial-location");
    }

    result.ok = result.missingPieces.length === 0;
    return result;
  });
}

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(String(error && error.message ? error.message : error));
  });

  try {
    await page.goto(URL_TO_CHECK, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      return !!(
        window.__readerpubUnprotectedRuntimePath === "new" &&
        window.__READERPUB_UNPROTECTED_RUNTIME_ADAPTER__ &&
        window.__READERPUB_UNPROTECTED_RUNTIME_STATE__
      );
    }, { timeout: 20000 });
    await page.waitForTimeout(2500);
    const result = await evaluateState(page);
    result.pageErrors = pageErrors.slice();
    if (result.pageErrors.length) {
      result.ok = false;
      result.missingPieces.push("page-errors");
    }
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
