#!/usr/bin/env node

const { chromium } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");
const { execFileSync } = require("node:child_process");

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

async function waitForHostReady(page, timeout = 15000) {
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

async function getBridgeSummary(page) {
  return await page.evaluate(() => {
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
    const surface = win ? (win.__PROTECTED_READER_COMPAT_ADAPTER__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
    if (!surface || typeof surface.getSummary !== "function") return null;
    return surface.getSummary();
  });
}

async function frameInfo(page) {
  return await page.evaluate(() => {
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const doc = directRoot ? document : (frame && frame.contentDocument ? frame.contentDocument : null);
    const readerFrame = directRoot
      ? directRoot.querySelector(".reader-frame")
      : (doc ? doc.querySelector(".reader-frame") : null);
    return {
      tags: readerFrame ? [...readerFrame.children].map((node) => node.tagName) : [],
      text: readerFrame ? (readerFrame.textContent || "").trim() : "",
      theme: doc ? (doc.documentElement.dataset.theme || "light") : "unknown"
    };
  });
}

async function openSettingsOverlay(page) {
  await page.evaluate(() => {
    const trigger = document.querySelector("#protectedTypographyTrigger");
    if (!trigger) throw new Error("Missing #protectedTypographyTrigger");
    trigger.click();
  });
  await page.waitForFunction(() => {
    const overlay = document.querySelector("#overlay-settings");
    return !!overlay && !overlay.classList.contains("hidden");
  });
}

async function main() {
  const mark = (step) => console.error(`[parity] ${step}`);
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 }
  });
  page.setDefaultTimeout(15000);
  const debugRequests = [];
  page.on("request", (req) => {
    if (req.url().includes("/debug/")) debugRequests.push(req.url());
  });

  mark("goto-protected");
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  mark("wait-host-ready");
  await waitForHostReady(page);

  mark("shell-parity");
  const shellParity = await page.evaluate(() => ({
    oldShellPresent: !!(
      document.querySelector("#titlebar") &&
      document.querySelector("#viewerStack") &&
      document.querySelector("#overlay-settings") &&
      document.querySelector("#searchDesktop")
    ),
    topControlsPresent: !!(
      document.querySelector("#searchDesktop") &&
      document.querySelector("#themeToggle") &&
      document.querySelector("#bookmark") &&
      document.querySelector("#protectedTypographyTrigger")
    ),
    techPanelVisible: (() => {
      const node = document.querySelector("#protectedShellActionBar");
      if (!node) return false;
      return getComputedStyle(node).display !== "none";
    })()
  }));

  mark("open-menu");
  await openSettingsOverlay(page);
  mark("read-menu-meta");
  const menuMeta = await page.evaluate(() => {
    const cover = document.querySelector("#menuBookCover");
    const placeholder = document.querySelector("#menuBookCoverPlaceholder");
    return {
      title: (document.querySelector("#menuBookTitle")?.textContent || "").trim(),
      author: (document.querySelector("#menuBookAuthor")?.textContent || "").trim(),
      coverVisible: !!(cover && !cover.classList.contains("hidden") && !!cover.getAttribute("src")),
      placeholderCoverVisible: !!(placeholder && !placeholder.classList.contains("hidden"))
    };
  });
  await page.evaluate(() => document.querySelector("#overlay-settings .overlay-close")?.click());
  await page.waitForFunction(() => document.querySelector("#overlay-settings")?.classList.contains("hidden"));

  mark("search-submit");
  await page.fill("#searchInputDesktop", "yellow");
  await page.press("#searchInputDesktop", "Enter");
  mark("wait-search-summary");
  await page.waitForFunction(() => {
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
    const surface = win ? (win.__PROTECTED_READER_COMPAT_ADAPTER__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
    const summary = surface && surface.getSummary ? surface.getSummary() : null;
    return !!(summary && summary.searchSummary && summary.searchSummary.active && summary.searchSummary.totalMatches > 0);
  }, {}, { timeout: 15000 });
  let summary = await getBridgeSummary(page);
  const searchState = summary.searchSummary;
  mark("search-next");
  await page.evaluate(() => document.querySelector("#searchNextDesktop")?.click());
  await page.waitForTimeout(300);
  const afterSearchNext = (await getBridgeSummary(page)).searchSummary;
  await page.evaluate(() => {
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
    const surface = win ? (win.__PROTECTED_READER_COMPAT_ADAPTER__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
    surface?.clearSearch?.();
    document.querySelector("#searchClose")?.click();
  });
  await page.waitForFunction(() => {
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
    const surface = win ? (win.__PROTECTED_READER_COMPAT_ADAPTER__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
    const summary = surface && surface.getSummary ? surface.getSummary() : null;
    return !!(summary && (!summary.searchSummary || !summary.searchSummary.active));
  }, {}, { timeout: 15000 });

  mark("theme-dark");
  await page.click("#themeToggle");
  await page.waitForFunction(() => document.body.classList.contains("protected-theme-dark"));
  const darkFrame = await frameInfo(page);
  mark("theme-light");
  await page.click("#themeToggle");
  await page.waitForFunction(() => !document.body.classList.contains("protected-theme-dark"));

  mark("subcheck-old-shell-integration");
  const integrationCheck = JSON.parse(execFileSync(process.execPath, [
    "reader_render_v3/tools/internal/check-old-shell-protected-ux-integration.js",
    `--url=${URL}`,
    `--old-url=${OLD_URL}`
  ], {
    cwd: process.cwd(),
    encoding: "utf8"
  }));

  mark("security");
  const security = await frameInfo(page);

  mark("goto-old");
  await page.goto(OLD_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!document.querySelector("#viewerStack"));
  mark("read-old-route");
  const oldRouteState = await page.evaluate(() => ({
    hasProtectedHost: !!document.querySelector("#protectedOldShellFrame"),
    hasProtectedDirectRoot: !!document.querySelector("#protectedDirectReaderRoot"),
    hasViewerStack: !!document.querySelector("#viewerStack"),
    oldTextVisible: !!((document.querySelector("#viewer")?.textContent || "").trim().length)
  }));

  const report = {
    route: URL,
    shell: shellParity,
    menuMeta,
    search: {
      active: searchState.active,
      query: searchState.query,
      totalMatches: searchState.totalMatches,
      currentMatch: searchState.currentMatch,
      afterNextCurrentMatch: afterSearchNext.currentMatch
    },
    theme: {
      darkApplied: darkFrame.theme === "dark"
    },
    integrationSmoke: integrationCheck,
    navigation: {
      initialPage: integrationCheck.initialPage,
      afterNextPage: integrationCheck.afterNextPage,
      afterPrevPage: integrationCheck.afterPrevPage,
      footerPageAfterPrev: await page.evaluate(() => (document.querySelector("#page-count")?.textContent || "").trim())
    },
    notes: integrationCheck.notesState,
    annotations: {
      count: integrationCheck.afterNoteAnnotations,
      afterReload: integrationCheck.afterReloadAnnotations,
      afterReopen: integrationCheck.afterReopenAnnotations
    },
    persistence: {
      afterReloadPage: integrationCheck.afterReloadPage,
      afterReopenPage: integrationCheck.afterReopenPage
    },
    security: {
      frameInfo: security,
      debugRequests
    },
    oldRouteState
  };

  const regressions = [];
  if (!shellParity.oldShellPresent) regressions.push("old-shell-missing");
  if (!shellParity.topControlsPresent) regressions.push("top-controls-missing");
  if (shellParity.techPanelVisible) regressions.push("tech-panel-visible");
  if (!menuMeta.title) regressions.push("menu-title-missing");
  if (!menuMeta.author) regressions.push("menu-author-missing");
  if (!searchState.active || !searchState.totalMatches) regressions.push("search-inactive");
  if (!darkFrame || darkFrame.theme !== "dark") regressions.push("theme-toggle-broken");
  if (!integrationCheck.ok) regressions.push("integration-smoke-failed");
  if (
    !integrationCheck.notesState ||
    !integrationCheck.notesState.count ||
    !integrationCheck.notesState.hasBookmarkLink ||
    !integrationCheck.notesState.hasBookmarkComment
  ) regressions.push("notes-panel-not-old-style");
  if (security.text) regressions.push("dom-text-leakage");
  if (!Array.isArray(security.tags) || security.tags.filter((tag) => tag === "CANVAS").length < 2) regressions.push("protected-surface-missing-canvases");
  if (debugRequests.length) regressions.push("debug-requests-present");
  if (oldRouteState.hasProtectedHost || !oldRouteState.hasViewerStack) regressions.push("old-reader-regression");

  report.ok = regressions.length === 0;
  report.regressions = regressions;

  mark("report");
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
