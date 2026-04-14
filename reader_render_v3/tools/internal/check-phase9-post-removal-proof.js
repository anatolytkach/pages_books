#!/usr/bin/env node

const { chromium } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

function getArgValue(name, fallback = "") {
  for (const item of process.argv.slice(2)) {
    if (item.startsWith(`--${name}=`)) return item.slice(name.length + 3);
  }
  return fallback;
}

const PROTECTED_URL =
  getArgValue("protected-url") ||
  "http://127.0.0.1:8788/reader/?id=19686&reader=protected&renderMode=shape&metricsMode=shape";
const OLD_SHELL_URL =
  getArgValue("old-shell-url") ||
  "http://127.0.0.1:8788/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape";
const OLD_URL =
  getArgValue("old-url") ||
  "http://127.0.0.1:8788/reader/?id=19686";

async function waitReady(page, timeout = 20000) {
  await page.waitForFunction(() => {
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
    const surface = win ? win.__PROTECTED_READER_COMPAT_ADAPTER__ || null : null;
    const summary = surface && typeof surface.getSummary === "function" ? surface.getSummary() : null;
    return !!(surface && summary && summary.ready);
  }, {}, { timeout });
}

async function getSnapshot(page) {
  return await page.evaluate(() => {
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const mode = directRoot ? "direct" : (frame ? "iframe" : "standalone");
    const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : window);
    const adapter = win ? win.__PROTECTED_READER_COMPAT_ADAPTER__ || null : null;
    const bridge = win ? win.__PROTECTED_READER_BRIDGE__ || null : null;
    const summary = adapter && typeof adapter.getSummary === "function" ? adapter.getSummary() : null;
    const compatInfo = adapter && typeof adapter.getCompatInfo === "function" ? adapter.getCompatInfo() : null;
    return {
      mode,
      hasFrame: !!frame,
      hasDirectRoot: !!directRoot,
      hasAdapter: !!adapter,
      hasBridge: !!bridge,
      summary,
      compatInfo,
      loaderVisible: (() => {
        const node = document.querySelector("#loader");
        if (!node) return false;
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return !node.hidden && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
      })()
    };
  });
}

async function withAdapter(page, method, args = []) {
  return await page.evaluate(
    async ({ method, args }) => {
      const directRoot = document.querySelector("#protectedDirectReaderRoot");
      const frame = document.querySelector("#protectedOldShellFrame");
      const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : window);
      const adapter = win ? win.__PROTECTED_READER_COMPAT_ADAPTER__ || null : null;
      if (!adapter || typeof adapter[method] !== "function") throw new Error(`Missing adapter method ${method}`);
      return await adapter[method](...args);
    },
    { method, args }
  );
}

async function waitForSummary(page, predicateSource, timeout = 7000) {
  await page.waitForFunction(
    ({ predicateSource }) => {
      const directRoot = document.querySelector("#protectedDirectReaderRoot");
      const frame = document.querySelector("#protectedOldShellFrame");
      const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : window);
      const adapter = win ? win.__PROTECTED_READER_COMPAT_ADAPTER__ || null : null;
      const summary = adapter && typeof adapter.getSummary === "function" ? adapter.getSummary() : null;
      if (!summary) return false;
      return Function("summary", `return (${predicateSource})(summary);`)(summary);
    },
    { predicateSource },
    { timeout }
  );
}

async function openLibraryTab(page, tab) {
  await page.waitForFunction(() => !!document.querySelector("#protectedLibraryTrigger"), {}, { timeout: 5000 });
  const visible = await page.evaluate(() => {
    const overlay = document.querySelector("#overlay-library");
    return !!(overlay && !overlay.classList.contains("hidden"));
  });
  if (!visible) {
    await page.evaluate(() => document.querySelector("#protectedLibraryTrigger")?.click());
    await page.waitForFunction(() => !document.querySelector("#overlay-library")?.classList.contains("hidden"), {}, { timeout: 5000 });
  }
  await page.evaluate(({ tab }) => document.querySelector(`#protectedLibraryTab-${tab}`)?.click(), { tab });
  await page.waitForFunction(
    ({ tab }) => !document.querySelector(`#protectedLibraryPane-${tab}`)?.classList.contains("hidden"),
    { tab },
    { timeout: 5000 }
  );
}

async function closeLibrary(page) {
  await page.evaluate(() => document.querySelector("#overlay-library .overlay-close")?.click());
  await page.waitForFunction(() => document.querySelector("#overlay-library")?.classList.contains("hidden"), {}, { timeout: 3000 });
}

async function runProtectedScenario(browser, url, label) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(20000);
  const debugRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("/debug/")) debugRequests.push(request.url());
  });

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitReady(page);
  const initial = await getSnapshot(page);
  const initialSummary = initial.summary || {};
  const initialLabel = String(initialSummary.globalPageLabel || initialSummary.pageLabel || "");

  await page.click("#next");
  await waitForSummary(page, `(summary) => String(summary.globalPageLabel || summary.pageLabel || '') !== ${JSON.stringify(initialLabel)}`);
  const afterNext = (await getSnapshot(page)).summary || {};
  const afterNextLabel = String(afterNext.globalPageLabel || afterNext.pageLabel || "");

  await page.click("#prev");
  await waitForSummary(page, `(summary) => String(summary.globalPageLabel || summary.pageLabel || '') !== ${JSON.stringify(afterNextLabel)}`);

  await page.fill("#searchInputDesktop", "yellow");
  await page.press("#searchInputDesktop", "Enter");
  await waitForSummary(page, "(summary) => !!(summary.searchSummary && summary.searchSummary.active && summary.searchSummary.totalMatches > 0)", 15000);
  await withAdapter(page, "searchNextResult");
  await withAdapter(page, "searchPrevResult");
  await withAdapter(page, "clearSearch");
  await waitForSummary(page, "(summary) => !summary.searchSummary || !summary.searchSummary.active");

  await page.click("#themeToggle");
  await waitForSummary(page, "(summary) => String(summary.theme || '') === 'dark'");
  await page.evaluate(() => {
    document.querySelector("#fontScaleIncrease")?.click();
    document.querySelector("#fontModeToggle")?.click();
  });
  const sharePayload = await withAdapter(page, "exportNotesSharePayload");

  const finalSnapshot = await getSnapshot(page);
  const finalSummary = finalSnapshot.summary || {};
  const regressions = [];
  if (initial.hasBridge || finalSnapshot.hasBridge) regressions.push("bridge-surface-present");
  if (!initial.hasAdapter || !finalSnapshot.hasAdapter) regressions.push("adapter-surface-missing");
  if (finalSnapshot.loaderVisible) regressions.push("loader-visible-after-ready");
  if (!afterNext || String(afterNext.globalPageLabel || afterNext.pageLabel || "") === initialLabel) regressions.push("next-navigation-broken");
  if (!sharePayload || Number(sharePayload.bookId || 0) !== 19686) regressions.push("share-payload-invalid");
  if (debugRequests.length) regressions.push("debug-requests-present");
  if (String(finalSummary.theme || "") !== "dark") regressions.push("theme-toggle-broken");
  if (String(finalSummary.compatTransport || "") !== "adapter") regressions.push("compat-transport-not-adapter");

  await page.close();
  return {
    ok: regressions.length === 0,
    label,
    mode: finalSnapshot.mode,
    hasFrame: finalSnapshot.hasFrame,
    hasDirectRoot: finalSnapshot.hasDirectRoot,
    hasAdapter: finalSnapshot.hasAdapter,
    hasBridge: finalSnapshot.hasBridge,
    compatInfo: finalSnapshot.compatInfo,
    regressions,
    debugRequests,
    sharePayload: sharePayload
      ? {
          v: Number(sharePayload.v || 0),
          bookId: Number(sharePayload.bookId || 0),
          noteCount: Number(sharePayload.noteCount || 0),
          unresolved: Number(sharePayload.unresolved || 0)
        }
      : null,
    finalSummary: {
      compatTransport: String(finalSummary.compatTransport || ""),
      pageLabel: String(finalSummary.globalPageLabel || finalSummary.pageLabel || ""),
      annotationCount: Number(finalSummary.annotationCount || 0),
      theme: String(finalSummary.theme || "")
    }
  };
}

async function runStandardProtectedSmoke(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(15000);
  const debugRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("/debug/")) debugRequests.push(request.url());
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const status = (document.querySelector("#status")?.textContent || "").trim();
    const hasMeta = !!document.querySelector("#runtime-meta dt");
    return hasMeta || /Opened |Protected mode is unavailable/.test(status);
  }, {}, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
  const state = await page.evaluate(() => ({
    hasCanvas: !!document.querySelector("#reader-canvas"),
    statusText: (document.querySelector("#status")?.textContent || "").trim(),
    frameText: (document.querySelector(".reader-frame")?.textContent || "").trim(),
    hasAdapter: !!window.__PROTECTED_READER_COMPAT_ADAPTER__,
    hasBridge: !!window.__PROTECTED_READER_BRIDGE__,
    compatInfo:
      window.__PROTECTED_READER_COMPAT_ADAPTER__ &&
      typeof window.__PROTECTED_READER_COMPAT_ADAPTER__.getCompatInfo === "function"
        ? window.__PROTECTED_READER_COMPAT_ADAPTER__.getCompatInfo()
        : null,
    summary:
      window.__PROTECTED_READER_COMPAT_ADAPTER__ &&
      typeof window.__PROTECTED_READER_COMPAT_ADAPTER__.getSummary === "function"
        ? window.__PROTECTED_READER_COMPAT_ADAPTER__.getSummary()
        : null
  }));
  await page.close();
  const regressions = [];
  if (!state.hasCanvas) regressions.push("protected-canvas-missing");
  if (!/Opened /.test(state.statusText || "")) regressions.push("protected-status-not-ready");
  if (state.frameText) regressions.push("protected-dom-text-leakage");
  if (!state.hasAdapter) regressions.push("protected-adapter-missing");
  if (state.hasBridge) regressions.push("protected-bridge-surface-present");
  if (!state.summary || !state.summary.ready) regressions.push("protected-summary-not-ready");
  if (String((state.summary && state.summary.compatTransport) || "") !== "adapter") regressions.push("protected-transport-not-adapter");
  if (debugRequests.length) regressions.push("debug-requests-present");
  return {
    ok: regressions.length === 0,
    regressions,
    debugRequests,
    state: {
      hasCanvas: state.hasCanvas,
      statusText: state.statusText,
      hasAdapter: state.hasAdapter,
      hasBridge: state.hasBridge,
      compatInfo: state.compatInfo,
      summary: state.summary
        ? {
            ready: !!state.summary.ready,
            compatTransport: String(state.summary.compatTransport || ""),
            pageLabel: String(state.summary.globalPageLabel || state.summary.pageLabel || "")
          }
        : null
    }
  };
}

async function runUnprotectedSmoke(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(15000);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!document.querySelector("#viewerStack"), {}, { timeout: 15000 });
  await page.click("#next");
  await page.waitForTimeout(300);
  await page.click("#prev");
  await page.fill("#searchInputDesktop", "yellow");
  await page.press("#searchInputDesktop", "Enter");
  await page.waitForTimeout(500);
  await page.click("#themeToggle");
  await page.waitForTimeout(300);
  const state = await page.evaluate(() => ({
    hasProtectedHost: !!document.querySelector("#protectedOldShellFrame"),
    hasProtectedDirectRoot: !!document.querySelector("#protectedDirectReaderRoot"),
    hasViewerStack: !!document.querySelector("#viewerStack"),
    bodyTheme: document.body?.className || "",
    searchValue: document.querySelector("#searchInputDesktop")?.value || "",
    debugPresent: !!document.querySelector("[data-debug], #debug, .debug"),
    currentUrl: window.location.href
  }));
  await page.close();
  const regressions = [];
  if (state.hasProtectedHost || state.hasProtectedDirectRoot) regressions.push("protected-host-leaked-into-old-route");
  if (!state.hasViewerStack) regressions.push("old-route-viewer-stack-missing");
  return { ok: regressions.length === 0, state, regressions };
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });
  try {
    const standardProtected = await runStandardProtectedSmoke(browser, PROTECTED_URL);
    const oldShellProtected = await runProtectedScenario(browser, OLD_SHELL_URL, "old-shell");
    const unprotected = await runUnprotectedSmoke(browser, OLD_URL);

    const result = {
      ok: standardProtected.ok && oldShellProtected.ok && unprotected.ok,
      protectedBridgeRemoved: !standardProtected.hasBridge && !oldShellProtected.hasBridge,
      hiddenBridgeUseDetected: !!(
        standardProtected.hasBridge ||
        oldShellProtected.hasBridge ||
        standardProtected.regressions.includes("bridge-surface-present") ||
        oldShellProtected.regressions.includes("bridge-surface-present")
      ),
      exactBlockers: [
        ...standardProtected.regressions.map((item) => `protected:${item}`),
        ...oldShellProtected.regressions.map((item) => `old-shell:${item}`),
        ...unprotected.regressions.map((item) => `unprotected:${item}`)
      ],
      warnings: [],
      routes: {
        protected: PROTECTED_URL,
        oldShell: OLD_SHELL_URL,
        old: OLD_URL
      },
      protected: standardProtected,
      oldShell: oldShellProtected,
      unprotected
    };

    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
