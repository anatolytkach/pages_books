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

async function collectSnapshot(page, label) {
  return await page.evaluate(async ({ label }) => {
    function history() {
      try {
        const hub = window.__READERPUB_READER_EVENTS__;
        return hub && typeof hub.getHistory === "function" ? hub.getHistory() : [];
      } catch (_error) {
        return [];
      }
    }

    function latest(type) {
      const entries = history();
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        if (entries[index] && entries[index].type === type) return entries[index];
      }
      return null;
    }

    const currentLoc =
      window.reader &&
      window.reader.rendition &&
      typeof window.reader.rendition.currentLocation === "function"
        ? window.reader.rendition.currentLocation()
        : null;

    const beforeCfi = currentLoc && currentLoc.start ? String(currentLoc.start.cfi || "") : "";
    const beforeLabel = currentLoc && currentLoc.start && currentLoc.start.displayed
      ? `${currentLoc.start.displayed.page}/${currentLoc.start.displayed.total}`
      : "";

    let navigationChanged = false;
    try {
      if (window.reader && window.reader.rendition && typeof window.reader.rendition.next === "function") {
        await Promise.resolve(window.reader.rendition.next());
      }
    } catch (_error) {}

    await new Promise((resolve) => setTimeout(resolve, 1200));

    const afterLoc =
      window.reader &&
      window.reader.rendition &&
      typeof window.reader.rendition.currentLocation === "function"
        ? window.reader.rendition.currentLocation()
        : null;

    const afterCfi = afterLoc && afterLoc.start ? String(afterLoc.start.cfi || "") : "";
    const afterLabel = afterLoc && afterLoc.start && afterLoc.start.displayed
      ? `${afterLoc.start.displayed.page}/${afterLoc.start.displayed.total}`
      : "";

    navigationChanged = !!afterCfi && afterCfi !== beforeCfi;

    return {
      label,
      renderHost: window.__readerpubUnprotectedRenderHost || "iframe",
      frameCount: document.querySelectorAll("#viewerStack iframe, #viewer iframe, #viewer-prev iframe, #viewer-next iframe").length,
      directRootCount: document.querySelectorAll(".readerpub-direct-view").length,
      pageCounterText: String(document.querySelector("#page-count")?.textContent || "").trim(),
      chapterTitle: String(document.querySelector("#chapter-title")?.textContent || "").trim(),
      tocCount: document.querySelectorAll("#tocView a, #tocView button").length,
      currentLocation: currentLoc,
      nextLocation: afterLoc,
      navigationChanged,
      beforeLabel,
      afterLabel,
      latestPageChanged: latest("pageChanged") ? latest("pageChanged").payload : null,
      latestThemeChanged: latest("themeChanged") ? latest("themeChanged").payload : null,
      nextCfi: afterCfi,
      afterReloadPageCounterText: "",
      afterReloadLocation: null
    };
  }, { label });
}

async function runScenario(browser, url, label) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(20000);
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(String(error && error.message ? error.message : error));
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  const snapshot = await collectSnapshot(page, label);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  const afterReload = await page.evaluate(() => {
    const loc =
      window.reader &&
      window.reader.rendition &&
      typeof window.reader.rendition.currentLocation === "function"
        ? window.reader.rendition.currentLocation()
        : null;
    return {
      pageCounterText: String(document.querySelector("#page-count")?.textContent || "").trim(),
      currentLocation: loc
    };
  });
  snapshot.afterReloadPageCounterText = afterReload.pageCounterText;
  snapshot.afterReloadLocation = afterReload.currentLocation;
  await page.close();
  return {
    ok: pageErrors.length === 0,
    pageErrors,
    snapshot
  };
}

(async () => {
  const browser = await launchBrowser();
  try {
    const iframe = await runScenario(browser, IFRAME_URL, "iframe");
    const direct = await runScenario(browser, DIRECT_URL, "direct");

    const failedDomains = [];
    const mismatches = [];

    if (iframe.snapshot.frameCount < 1) {
      failedDomains.push("iframe-baseline");
      mismatches.push("iframe route did not expose iframe-backed viewer");
    }

    if (direct.snapshot.frameCount !== 0 || direct.snapshot.directRootCount < 1) {
      failedDomains.push("direct-host");
      mismatches.push("direct route did not become iframe-free");
    }

    if (!iframe.snapshot.navigationChanged) {
      failedDomains.push("iframe-navigation");
      mismatches.push("iframe route did not advance via rendition.next()");
    }

    if (!direct.snapshot.navigationChanged) {
      failedDomains.push("direct-navigation");
      mismatches.push("direct route did not advance via rendition.next()");
    }

    if (!direct.snapshot.pageCounterText) {
      failedDomains.push("direct-page-counter");
      mismatches.push("direct route did not restore visible page counter text");
    }

    if (!iframe.snapshot.afterReloadPageCounterText || iframe.snapshot.afterReloadPageCounterText !== iframe.snapshot.pageCounterText) {
      failedDomains.push("iframe-restore");
      mismatches.push("iframe route did not restore the pre-reload visible page counter");
    }

    if (!direct.snapshot.afterReloadPageCounterText || direct.snapshot.afterReloadPageCounterText !== direct.snapshot.pageCounterText) {
      failedDomains.push("direct-restore");
      mismatches.push("direct route did not restore the pre-reload visible page counter");
    }

    const result = {
      ok: failedDomains.length === 0 && iframe.ok && direct.ok,
      failedDomains,
      mismatches,
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
