#!/usr/bin/env node

const { chromium } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

function getArgValue(name, fallback = "") {
  for (const item of process.argv.slice(2)) {
    if (item.startsWith(`--${name}=`)) return item.slice(name.length + 3);
  }
  return fallback;
}

const IFRAME_URL =
  getArgValue("iframe-url") ||
  "http://127.0.0.1:8788/reader/?id=19686";
const DIRECT_URL =
  getArgValue("direct-url") ||
  "http://127.0.0.1:8788/reader/?id=19686&unprotectedRenderHost=direct";
const EXECUTABLE_PATH =
  getArgValue("executable-path") ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function launchBrowser() {
  return chromium.launch({
    headless: true,
    executablePath: EXECUTABLE_PATH
  });
}

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : null;
}

async function evaluateScenario(page, label) {
  return page.evaluate(async ({ label }) => {
    function getView() {
      try {
        const rendition = window.reader && window.reader.rendition;
        const views = rendition && rendition.manager && rendition.manager.views
          ? rendition.manager.views._views || rendition.manager.views.views || []
          : [];
        return views && views[0] ? views[0] : null;
      } catch (_error) {
        return null;
      }
    }

    function currentLocation() {
      try {
        const rendition = window.reader && window.reader.rendition;
        return rendition && typeof rendition.currentLocation === "function"
          ? clone(rendition.currentLocation())
          : null;
      } catch (_error) {
        return null;
      }
    }

    function clone(value) {
      return value ? JSON.parse(JSON.stringify(value)) : null;
    }

    function labelFor(location) {
      if (!location || !location.start || !location.start.displayed) return "";
      return `${location.start.displayed.page}/${location.start.displayed.total}`;
    }

    function pageCounterText() {
      return String(document.querySelector("#page-count")?.textContent || "").trim();
    }

    const rendition = window.reader && window.reader.rendition;
    const manager = rendition && rendition.manager;
    const layout = manager && manager.layout;
    const view = getView();
    const contents = view && view.contents;

    const before = currentLocation();
    const beforeCounter = pageCounterText();
    try {
      await Promise.resolve(rendition.next());
    } catch (_error) {}
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const afterNext = currentLocation();
    const afterNextCounter = pageCounterText();

    try {
      await Promise.resolve(rendition.prev());
    } catch (_error) {}
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const afterPrev = currentLocation();
    const afterPrevCounter = pageCounterText();

    const stage = {
      viewportWidth: manager && manager.container ? manager.container.clientWidth : null,
      viewportHeight: manager && manager.container ? manager.container.clientHeight : null,
      containerScrollWidth: manager && manager.container ? manager.container.scrollWidth : null,
      pageWidth: layout ? layout.pageWidth : null,
      spreadWidth: layout ? layout.spreadWidth : null,
      flow: rendition && rendition.settings ? rendition.settings.flow : null,
      spread: rendition && rendition.settings ? rendition.settings.spread : null,
      axis: manager && manager.settings ? manager.settings.axis : null,
      viewWidth: view && typeof view.width === "function" ? view.width() : null,
      viewHeight: view && typeof view.height === "function" ? view.height() : null,
      contentScrollWidth: contents && typeof contents.scrollWidth === "function" ? contents.scrollWidth() : null,
      contentTextWidth: contents && typeof contents.textWidth === "function" ? contents.textWidth() : null,
      documentElementScrollWidth: contents && contents.documentElement ? contents.documentElement.scrollWidth : null,
      paginatedColumnsFormed: !!(
        layout &&
        layout.pageWidth &&
        view &&
        typeof view.width === "function" &&
        view.width() > layout.pageWidth
      )
    };

    const beforeCfi = before && before.start ? String(before.start.cfi || "") : "";
    const afterNextCfi = afterNext && afterNext.start ? String(afterNext.start.cfi || "") : "";
    const afterPrevCfi = afterPrev && afterPrev.start ? String(afterPrev.start.cfi || "") : "";

    const nextNoop = !afterNextCfi || afterNextCfi === beforeCfi;
    const prevNoop = !afterPrevCfi || afterPrevCfi !== beforeCfi;

    let blockerStage = "";
    if (!stage.paginatedColumnsFormed) blockerStage = "layout";
    else if (nextNoop) blockerStage = "next";
    else if (prevNoop) blockerStage = "prev";
    else if (!beforeCounter || !afterNextCounter || !afterPrevCounter) blockerStage = "counter";

    return {
      label,
      hostType: window.__readerpubUnprotectedRenderHost || "iframe",
      frameCount: document.querySelectorAll("#viewerStack iframe, #viewer iframe, #viewer-prev iframe, #viewer-next iframe").length,
      directRootCount: document.querySelectorAll(".readerpub-direct-view").length,
      stage,
      currentLocationBefore: before,
      currentLocationAfterNext: afterNext,
      currentLocationAfterPrev: afterPrev,
      displayedLabelBefore: labelFor(before),
      displayedLabelAfterNext: labelFor(afterNext),
      displayedLabelAfterPrev: labelFor(afterPrev),
      pageCounterBefore: beforeCounter,
      pageCounterAfterNext: afterNextCounter,
      pageCounterAfterPrev: afterPrevCounter,
      nextNoop,
      prevNoop,
      paginationActive: stage.paginatedColumnsFormed && !nextNoop && !prevNoop,
      noOpDetected: nextNoop || prevNoop,
      blockerStage,
      warnings: []
    };
  }, { label });
}

async function runScenario(browser, url, label) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(String(error && error.message ? error.message : error));
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  const result = await evaluateScenario(page, label);
  await page.close();
  return {
    ok: pageErrors.length === 0 && result.paginationActive,
    pageErrors,
    ...result
  };
}

(async () => {
  const browser = await launchBrowser();
  try {
    const iframe = await runScenario(browser, IFRAME_URL, "iframe");
    const direct = await runScenario(browser, DIRECT_URL, "direct");
    const warnings = [];
    const failedDomains = [];

    if (iframe.hostType !== "iframe") failedDomains.push("iframe-host");
    if (!iframe.paginationActive) failedDomains.push("iframe-pagination");
    if (direct.hostType !== "direct") failedDomains.push("direct-host");
    if (!direct.paginationActive) failedDomains.push("direct-pagination");
    if (direct.frameCount !== 0) failedDomains.push("direct-iframe-leak");

    if (
      iframe.pageCounterAfterNext &&
      direct.pageCounterAfterNext &&
      iframe.pageCounterAfterNext !== direct.pageCounterAfterNext
    ) {
      warnings.push("page-counter-labels-diverge-between-iframe-and-direct");
    }

    if (
      direct.currentLocationAfterNext &&
      direct.currentLocationAfterNext.start &&
      direct.currentLocationAfterNext.start.displayed &&
      direct.pageCounterAfterNext &&
      !direct.pageCounterAfterNext.startsWith(
        `${direct.currentLocationAfterNext.start.displayed.page}/`
      )
    ) {
      warnings.push("direct-currentLocation-displayed-total-differs-from-shell-page-counter");
    }

    const result = {
      ok: failedDomains.length === 0,
      paginationActive: direct.paginationActive,
      noOpDetected: direct.noOpDetected,
      failedDomains,
      exactBlockerStage: direct.blockerStage || "",
      warnings,
      iframe,
      direct
    };

    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
