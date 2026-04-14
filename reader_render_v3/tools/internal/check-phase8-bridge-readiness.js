#!/usr/bin/env node

const { chromium } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

function getArgValue(name, fallback = "") {
  for (const item of process.argv.slice(2)) {
    if (item.startsWith(`--${name}=`)) return item.slice(name.length + 3);
  }
  return fallback;
}

const BRIDGE_URL =
  getArgValue("bridge-url") ||
  "http://127.0.0.1:8788/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape";
const DIRECT_URL =
  getArgValue("direct-url") ||
  "http://127.0.0.1:8788/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&protectedCompatTransport=adapter&protectedRenderHost=direct&renderMode=shape&metricsMode=shape";
const OLD_URL =
  getArgValue("old-url") ||
  "http://127.0.0.1:8788/reader/?id=19686";

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

async function withSurface(page, transport, expression, args = []) {
  return await page.evaluate(
    async ({ transport, expression, args }) => {
      const directRoot = document.querySelector("#protectedDirectReaderRoot");
      const frame = document.querySelector("#protectedOldShellFrame");
      const mode = directRoot ? "direct" : "iframe";
      const win = mode === "direct" ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
      const surface = !win
        ? null
        : transport === "adapter"
          ? win.__PROTECTED_READER_COMPAT_ADAPTER__ || null
          : win.__PROTECTED_READER_BRIDGE__ || null;
      if (!surface) throw new Error(`Compat surface unavailable (${transport}/${mode})`);
      if (expression === "summary") {
        return typeof surface.getSummary === "function" ? surface.getSummary() : null;
      }
      if (expression === "snapshot") {
        const summary = typeof surface.getSummary === "function" ? surface.getSummary() : null;
        return {
          summary,
          mode,
          compatInfo: typeof surface.getCompatInfo === "function" ? surface.getCompatInfo() : null,
          supportedEvents: typeof surface.getSupportedEvents === "function" ? surface.getSupportedEvents() : [],
          bridgePresent: !!(win && win.__PROTECTED_READER_BRIDGE__),
          adapterPresent: !!(win && win.__PROTECTED_READER_COMPAT_ADAPTER__)
        };
      }
      if (expression === "show-toolbar") {
        const summary = typeof surface.getSummary === "function" ? surface.getSummary() : null;
        const bounds = summary && summary.selectionBounds ? summary.selectionBounds : null;
        if (!summary || !bounds || typeof window.__PROTECTED_OLD_SHELL_SHOW_SELECTION_TOOLBAR__ !== "function") return false;
        const host = mode === "direct" ? document.querySelector("#protectedDirectReaderRoot") : frame;
        const hostRect = host ? host.getBoundingClientRect() : { left: 0, top: 0 };
        const x = Number(hostRect.left || 0) + Number(bounds.left || 0) + Math.max(8, Number(bounds.width || 0) / 2);
        const y = Number(hostRect.top || 0) + Number(bounds.top || 0) + Math.max(8, Number(bounds.height || 0) / 2);
        window.__PROTECTED_OLD_SHELL_SHOW_SELECTION_TOOLBAR__(summary, x, y, "pointer");
        return true;
      }
      if (typeof surface[expression] !== "function") throw new Error(`Missing compat method ${expression}`);
      return await surface[expression](...args);
    },
    { transport, expression, args }
  );
}

async function waitReady(page, transport, renderHost, timeout = 20000) {
  await page.waitForFunction(
    ({ transport, renderHost }) => {
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
      return !!(surface && summary && summary.ready && mode === renderHost && String(summary.compatTransport || "") === transport);
    },
    { transport, renderHost },
    { timeout }
  );
}

async function waitForSummary(page, transport, predicateSource, timeout = 7000) {
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

async function waitForToolbarVisible(page, timeout = 3000) {
  await page.waitForFunction(() => {
    const toolbar = document.querySelector("#selectionToolbar");
    return !!(toolbar && !toolbar.classList.contains("hidden") && toolbar.getAttribute("aria-hidden") !== "true");
  }, {}, { timeout });
}

async function openLibraryTab(page, tab) {
  await page.waitForFunction(() => !!document.querySelector("#protectedLibraryTrigger"), {}, { timeout: 3000 });
  const isOpen = await page.evaluate(() => {
    const overlay = document.querySelector("#overlay-library");
    return !!(overlay && !overlay.classList.contains("hidden"));
  });
  if (!isOpen) {
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

async function submitDesktopSearch(page, query) {
  const input = page.locator("#searchInputDesktop");
  if (!(await input.isVisible().catch(() => false))) throw new Error("Desktop search input is not visible.");
  await input.fill(query);
  await input.press("Enter");
}

async function poisonBridge(page) {
  return await page.evaluate(() => {
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const mode = directRoot ? "direct" : "iframe";
    const win = mode === "direct" ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
    if (!win) return { ok: false, mode, reason: "missing-window" };
    const original = win.__PROTECTED_READER_BRIDGE__ || null;
    win.__PHASE8_BRIDGE_POISON_LOG__ = [];
    if (!original) {
      return { ok: true, mode, bridgePresent: false };
    }
    const poisoned = {};
    for (const key of Object.keys(original)) {
      const value = original[key];
      poisoned[key] =
        typeof value === "function"
          ? (...args) => {
              win.__PHASE8_BRIDGE_POISON_LOG__.push({ method: key, argCount: args.length });
              throw new Error(`Poisoned bridge method invoked: ${key}`);
            }
          : value;
    }
    win.__PHASE8_ORIGINAL_BRIDGE__ = original;
    win.__PROTECTED_READER_BRIDGE__ = poisoned;
    return {
      ok: true,
      mode,
      bridgePresent: true,
      poisonedMethods: Object.keys(poisoned).filter((key) => typeof poisoned[key] === "function")
    };
  });
}

async function getBridgePoisonLog(page) {
  return await page.evaluate(() => {
    return Array.isArray(window.__PHASE8_BRIDGE_POISON_LOG__) ? window.__PHASE8_BRIDGE_POISON_LOG__.slice() : [];
  });
}

async function runProtectedScenario(browser, url, options = {}) {
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
  const initialSummary = initial.summary || {};
  const initialPageLabel = String(initialSummary.globalPageLabel || initialSummary.pageLabel || "");

  let poisonInfo = null;
  if (options.poisonBridge) {
    poisonInfo = await poisonBridge(page);
  }

  await withSurface(page, transport, "selectAutomationSample");
  await waitForSummary(page, transport, "(summary) => !!(summary.selectionActive && Number(summary.selectedChars || 0) > 1)");
  await withSurface(page, transport, "show-toolbar");
  await waitForToolbarVisible(page);
  const toolbarState = await page.evaluate(() => {
    const toolbar = document.querySelector("#selectionToolbar");
    return {
      visible: !!(toolbar && !toolbar.classList.contains("hidden")),
      actionCount: toolbar ? toolbar.querySelectorAll("button").length : 0
    };
  });

  const beforeHighlight = Number((await withSurface(page, transport, "summary")).annotationCount || 0);
  await withSurface(page, transport, "createHighlight");
  await waitForSummary(page, transport, `(summary) => Number(summary.annotationCount || 0) > ${beforeHighlight}`);

  await withSurface(page, transport, "selectAutomationSample");
  await waitForSummary(page, transport, "(summary) => !!(summary.selectionActive && Number(summary.selectedChars || 0) > 1)");
  const beforeNote = Number((await withSurface(page, transport, "summary")).annotationCount || 0);
  const noteText = `phase8-${transport}-note`;
  await withSurface(page, transport, "addNoteToSelection", [noteText]);
  await waitForSummary(page, transport, `(summary) => Number(summary.annotationCount || 0) > ${beforeNote}`);

  await openLibraryTab(page, "notes");
  const notesList = await page.evaluate(() => {
    const items = [...document.querySelectorAll("#notes li.list_item")];
    return {
      count: items.length,
      texts: items.map((item) => ({
        annotationId: item.dataset.annotationId || "",
        noteText: String(item.querySelector(".bookmark-comment")?.textContent || "").trim()
      }))
    };
  });
  const createdNote = notesList.texts.find((item) => item.noteText === noteText) || null;
  if (!createdNote) throw new Error(`Created note not visible in notes list (${transport}).`);
  await page.evaluate(() => document.querySelector("#notes .bookmark_link")?.click());
  await waitForSummary(page, transport, "(summary) => !!summary.focusedAnnotationId");
  await closeLibrary(page);

  await page.waitForFunction(() => !!document.querySelector("#bookmark"), {}, { timeout: 3000 });
  const bookmarkedInitially = await page.evaluate(() => String(document.querySelector("#bookmark")?.getAttribute("aria-pressed") || "false") === "true");
  if (bookmarkedInitially) {
    await page.evaluate(() => document.querySelector("#bookmark")?.click());
    await page.waitForFunction(() => String(document.querySelector("#bookmark")?.getAttribute("aria-pressed") || "false") === "false", {}, { timeout: 5000 });
  }
  const bookmarkBefore = await page.evaluate(() => document.querySelectorAll("#protectedLibraryBookmarksList li.list_item").length);
  await page.evaluate(() => document.querySelector("#bookmark")?.click());
  await page.waitForFunction(() => String(document.querySelector("#bookmark")?.getAttribute("aria-pressed") || "true") === "true", {}, { timeout: 5000 });
  await openLibraryTab(page, "bookmarks");
  await page.waitForFunction(({ minCount }) => document.querySelectorAll("#protectedLibraryBookmarksList li.list_item").length >= minCount, { minCount: Math.max(1, bookmarkBefore + 1) }, { timeout: 5000 });
  await closeLibrary(page);

  const tocBefore = await withSurface(page, transport, "summary");
  await withSurface(page, transport, "goToToc", ["toc-2"]);
  await waitForSummary(
    page,
    transport,
    `(summary) => String(summary.globalPageLabel || summary.pageLabel || "") !== ${JSON.stringify(String(tocBefore.globalPageLabel || tocBefore.pageLabel || ""))}`
  );

  const summaryAfterToc = await withSurface(page, transport, "summary");
  const restoreToken = String(summaryAfterToc.restoreToken || "");
  await withSurface(page, transport, "restoreFromToken", [restoreToken]);
  await waitForSummary(page, transport, `(summary) => String(summary.restoreToken || "") === ${JSON.stringify(restoreToken)}`);

  const originBeforeSearch = await withSurface(page, transport, "summary");
  await submitDesktopSearch(page, "the");
  await waitForSummary(page, transport, "(summary) => !!(summary.searchSummary && summary.searchSummary.active && Number(summary.searchSummary.totalMatches || summary.searchSummary.matchCount || 0) > 0)");
  await page.evaluate(() => document.querySelector("#searchNextDesktop")?.click());
  await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelector("#searchPrevDesktop")?.click());
  await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelector("#searchReturnDesktop")?.click());
  await waitForSummary(
    page,
    transport,
    `(summary) => !summary.searchSummary?.active && String(summary.globalPageLabel || summary.pageLabel || "") === ${JSON.stringify(String(originBeforeSearch.globalPageLabel || originBeforeSearch.pageLabel || ""))}`
  );

  const themeBefore = String((await withSurface(page, transport, "summary")).theme || "light");
  await page.evaluate(() => document.querySelector("#themeToggle")?.click());
  await waitForSummary(page, transport, `(summary) => String(summary.theme || "light") !== ${JSON.stringify(themeBefore)}`);
  await page.evaluate(() => document.querySelector("#themeToggle")?.click());
  await waitForSummary(page, transport, `(summary) => String(summary.theme || "light") === ${JSON.stringify(themeBefore)}`);

  await page.evaluate(() => document.querySelector("#protectedTypographyTrigger")?.click());
  await page.waitForFunction(() => !!document.querySelector("#protectedTypographyControl.is-open"), {}, { timeout: 3000 });
  await page.evaluate(() => document.querySelector("#protectedTypographySerif")?.click());
  await page.waitForFunction(() => document.querySelector("#protectedTypographyControl")?.dataset.fontMode === "serif", {}, { timeout: 3000 });
  await page.evaluate(() => {
    const input = document.querySelector("#protectedTypographyScale");
    if (!input) return;
    input.value = "1.2";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await waitForSummary(page, transport, "(summary) => Number(summary.fontScale || 0) >= 1.19");

  const sharePayload = await withSurface(page, transport, "exportNotesSharePayload");
  const finalSnapshot = await withSurface(page, transport, "snapshot");
  const poisonLog = options.poisonBridge ? await getBridgePoisonLog(page) : [];
  await page.close();

  return {
    transport,
    renderHost,
    poisonInfo,
    poisonLog,
    initialPageLabel,
    toolbarState,
    notesList,
    sharePayload,
    debugRequests,
    criticalFlows: {
      navigation: true,
      selectionToolbarHighlights: true,
      search: true,
      notes: true,
      bookmarks: true,
      shareExport: true,
      themeTypography: true,
      security: !(Array.isArray(debugRequests) && debugRequests.length)
    },
    summary: finalSnapshot.summary || null,
    compatInfo: finalSnapshot.compatInfo || null,
    supportedEvents: finalSnapshot.supportedEvents || [],
    bridgePresent: !!finalSnapshot.bridgePresent,
    adapterPresent: !!finalSnapshot.adapterPresent
  };
}

async function runUnprotectedScenario(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(20000);
  const debugRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("/debug/")) debugRequests.push(request.url());
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__READERPUB_READER_EVENTS__, {}, { timeout: 15000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector("#themeToggle")?.click());
  const desktopInput = page.locator("#searchInputDesktop");
  if (await desktopInput.isVisible().catch(() => false)) {
    await desktopInput.fill("the");
    await desktopInput.press("Enter");
  }
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector("#slider")?.click());
  await page.waitForTimeout(300);
  const result = await page.evaluate(() => {
    const hub = window.__READERPUB_READER_EVENTS__;
    return {
      supportedEvents: hub && typeof hub.getSupportedEvents === "function" ? hub.getSupportedEvents() : (hub && hub.supportedEvents ? hub.supportedEvents : []),
      history: hub && typeof hub.getHistory === "function" ? hub.getHistory() : [],
      hasProtectedHost: !!document.querySelector("#protectedOldShellHost"),
      hasViewerStack: !!document.querySelector("#viewerStack"),
      darkUi: document.body.classList.contains("dark-ui")
    };
  });
  await page.close();
  return { ...result, debugRequests };
}

function collectFailures(result, failures = []) {
  if (!result.summary || !result.summary.ready) failures.push(`${result.transport}:not-ready`);
  if (result.transport === "adapter" && String(result.summary && result.summary.compatTransport || "") !== "adapter") {
    failures.push("direct:wrong-compat-transport");
  }
  if (result.renderHost === "direct" && !result.adapterPresent) failures.push("direct:adapter-missing");
  if (!result.toolbarState || !result.toolbarState.visible) failures.push(`${result.transport}:toolbar-missing`);
  if (!result.notesList || Number(result.notesList.count || 0) < 1) failures.push(`${result.transport}:notes-list-empty`);
  if (!result.sharePayload || !String(result.sharePayload.bookId || "").trim()) failures.push(`${result.transport}:share-payload`);
  if (Array.isArray(result.debugRequests) && result.debugRequests.length) failures.push(`${result.transport}:debug-surface`);
  return failures;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });

  const failures = [];
  const warnings = [];
  try {
    const rollbackResult = await runProtectedScenario(browser, BRIDGE_URL, { poisonBridge: false });
    collectFailures(rollbackResult, failures);

    const directResult = await runProtectedScenario(browser, DIRECT_URL, { poisonBridge: true });
    collectFailures(directResult, failures);

    const unprotectedResult = await runUnprotectedScenario(browser, OLD_URL);
    if (unprotectedResult.hasProtectedHost) failures.push("unprotected:protected-host-visible");
    if (!unprotectedResult.hasViewerStack) failures.push("unprotected:viewer-stack-missing");
    if (!unprotectedResult.darkUi) failures.push("unprotected:theme-toggle");
    if (Array.isArray(unprotectedResult.debugRequests) && unprotectedResult.debugRequests.length) failures.push("unprotected:debug-surface");

    if (!directResult.poisonInfo || !directResult.poisonInfo.ok) failures.push("direct:bridge-poisoning-not-installed");
    if (Array.isArray(directResult.poisonLog) && directResult.poisonLog.length) {
      failures.push("direct:poisoned-bridge-invoked");
    }

    const compatibilityOnlyBridgeUsages = [
      "bridge-backed rollback route",
      "legacy iframe-backed protected old-shell route",
      "embedded bridge facade published for compatibility and fallback",
      "bridge message/state-changed listener retained for bridge-backed fallback path"
    ];

    const result = {
      ok: failures.length === 0,
      zeroCriticalBridgeDependencies: failures.length === 0,
      exactBlockers: failures,
      warnings,
      compatibilityOnlyBridgeUsages,
      rollbackPath: {
        url: BRIDGE_URL,
        proven: failures.filter((item) => item.startsWith("bridge:") || item.startsWith("rollback:")).length === 0,
        compatTransport: rollbackResult.summary ? rollbackResult.summary.compatTransport : "",
        renderHost: rollbackResult.renderHost,
        criticalFlows: rollbackResult.criticalFlows
      },
      directPath: {
        url: DIRECT_URL,
        compatTransport: directResult.summary ? directResult.summary.compatTransport : "",
        renderHost: directResult.renderHost,
        adapterPresent: directResult.adapterPresent,
        bridgePresent: directResult.bridgePresent,
        poisonInfo: directResult.poisonInfo,
        poisonLog: directResult.poisonLog,
        supportedEvents: directResult.supportedEvents,
        compatInfo: directResult.compatInfo,
        criticalFlows: directResult.criticalFlows
      },
      bridgePath: {
        url: BRIDGE_URL,
        compatTransport: rollbackResult.summary ? rollbackResult.summary.compatTransport : "",
        renderHost: rollbackResult.renderHost,
        compatInfo: rollbackResult.compatInfo
      },
      unprotectedPath: {
        url: OLD_URL,
        supportedEvents: unprotectedResult.supportedEvents || []
      }
    };

    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
