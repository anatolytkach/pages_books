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

async function evaluateProof(page) {
  return page.evaluate(async () => {
    function clone(value) {
      return value ? JSON.parse(JSON.stringify(value)) : value;
    }

    function pageExcerpt(root) {
      return String(root && root.textContent || "").replace(/\s+/g, " ").trim().slice(0, 240);
    }

    async function waitTick() {
      await new Promise((resolve) => setTimeout(resolve, 700));
    }

    const adapter = window.__READERPUB_UNPROTECTED_RUNTIME_ADAPTER__ || null;
    const root = document.querySelector("[data-readerpub-unprotected-runtime-root='true']");
    const initialState = clone(window.__READERPUB_UNPROTECTED_RUNTIME_STATE__ || null);
    const initialLocation = adapter && typeof adapter.getLocation === "function" ? clone(adapter.getLocation()) : null;
    const initialCounter = String(document.querySelector("#page-count")?.textContent || "").trim();
    const initialExcerpt = pageExcerpt(root);

    let afterNextLocation = null;
    let afterNextCounter = initialCounter;
    let afterNextExcerpt = initialExcerpt;
    let afterPrevLocation = null;
    let afterPrevCounter = initialCounter;
    let afterPrevExcerpt = initialExcerpt;

    if (adapter && typeof adapter.nextPage === "function") {
      try { await Promise.resolve(adapter.nextPage()); } catch (_error) {}
      await waitTick();
      afterNextLocation = adapter && typeof adapter.getLocation === "function" ? clone(adapter.getLocation()) : null;
      afterNextCounter = String(document.querySelector("#page-count")?.textContent || "").trim();
      afterNextExcerpt = pageExcerpt(root);
    }

    if (adapter && typeof adapter.prevPage === "function") {
      try { await Promise.resolve(adapter.prevPage()); } catch (_error2) {}
      await waitTick();
      afterPrevLocation = adapter && typeof adapter.getLocation === "function" ? clone(adapter.getLocation()) : null;
      afterPrevCounter = String(document.querySelector("#page-count")?.textContent || "").trim();
      afterPrevExcerpt = pageExcerpt(root);
    }

    const finalState = clone(window.__READERPUB_UNPROTECTED_RUNTIME_STATE__ || null);
    const pagination = finalState && finalState.pagination ? finalState.pagination : null;
    const currentLocation = finalState && finalState.location ? finalState.location : null;

    const nextPageChangesState = !!(
      initialLocation &&
      afterNextLocation &&
      (
        Number(initialLocation.pageIndex) !== Number(afterNextLocation.pageIndex) ||
        Number(initialLocation.sectionIndex) !== Number(afterNextLocation.sectionIndex)
      )
    );
    const prevPageChangesState = !!(
      afterNextLocation &&
      afterPrevLocation &&
      (
        Number(afterNextLocation.pageIndex) !== Number(afterPrevLocation.pageIndex) ||
        Number(afterNextLocation.sectionIndex) !== Number(afterPrevLocation.sectionIndex)
      )
    );
    const visibleCounterChanges = initialCounter !== afterNextCounter;
    const visibleExcerptChanges = initialExcerpt !== afterNextExcerpt;
    const noOpDetected = !nextPageChangesState || !visibleCounterChanges || !visibleExcerptChanges;

    const exactBlockers = [];
    if (String(window.__readerpubUnprotectedRuntimePath || "") !== "new") exactBlockers.push("runtime-path-not-new");
    if (document.querySelectorAll("#viewerStack iframe, #viewer iframe, #viewer-prev iframe, #viewer-next iframe").length !== 0) exactBlockers.push("iframe-leak");
    if (!root) exactBlockers.push("missing-direct-root");
    if (!pagination || !pagination.ready) exactBlockers.push("pagination-not-ready");
    if (!pagination || pagination.mode !== "page-model-v1") exactBlockers.push("pagination-mode");
    if (!currentLocation || typeof currentLocation.pageIndex !== "number" || typeof currentLocation.pageCount !== "number") exactBlockers.push("location-model");
    if (!(currentLocation && Number(currentLocation.pageCount) > 0)) exactBlockers.push("page-count-missing");
    if (!nextPageChangesState) exactBlockers.push("next-did-not-change-location");
    if (!prevPageChangesState) exactBlockers.push("prev-did-not-change-location");
    if (!visibleCounterChanges) exactBlockers.push("counter-did-not-change");
    if (!visibleExcerptChanges) exactBlockers.push("render-did-not-change");

    return {
      ok: exactBlockers.length === 0,
      runtimePath: String(window.__readerpubUnprotectedRuntimePath || "legacy"),
      iframeCount: document.querySelectorAll("#viewerStack iframe, #viewer iframe, #viewer-prev iframe, #viewer-next iframe").length,
      directRootPresent: !!root,
      paginationStatePresent: !!pagination,
      locationModelPresent: !!(currentLocation && typeof currentLocation.pageIndex === "number" && typeof currentLocation.pageCount === "number"),
      currentPageIndex: currentLocation ? Number(currentLocation.pageIndex) : null,
      currentPageCount: currentLocation ? Number(currentLocation.pageCount) : null,
      nextPageChangesState,
      prevPageChangesState,
      visibleCounterChanges,
      visibleExcerptChanges,
      noOpDetected,
      exactBlockers,
      warnings: [],
      snapshots: {
        initialLocation,
        afterNextLocation,
        afterPrevLocation,
        initialCounter,
        afterNextCounter,
        afterPrevCounter,
        initialExcerpt,
        afterNextExcerpt,
        afterPrevExcerpt,
        finalState
      }
    };
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
        window.__READERPUB_UNPROTECTED_RUNTIME_STATE__ &&
        window.__READERPUB_UNPROTECTED_RUNTIME_STATE__.status === "ready"
      );
    }, { timeout: 20000 });
    await page.waitForTimeout(2000);
    const result = await evaluateProof(page);
    result.pageErrors = pageErrors.slice();
    if (result.pageErrors.length) {
      result.ok = false;
      result.exactBlockers.push("page-errors");
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
