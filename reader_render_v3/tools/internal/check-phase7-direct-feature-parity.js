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
      if (expression === "debug") {
        return typeof surface.getDebugLayoutState === "function" ? surface.getDebugLayoutState() : null;
      }
      if (expression === "snapshot") {
        const summary = typeof surface.getSummary === "function" ? surface.getSummary() : null;
        const debug = typeof surface.getDebugLayoutState === "function" ? surface.getDebugLayoutState() : null;
        return {
          summary,
          debug,
          mode,
          supportedEvents: typeof surface.getSupportedEvents === "function" ? surface.getSupportedEvents() : [],
          compatInfo: typeof surface.getCompatInfo === "function" ? surface.getCompatInfo() : null
        };
      }
      if (expression === "show-toolbar") {
        const summary = typeof surface.getSummary === "function" ? surface.getSummary() : null;
        const bounds = summary && summary.selectionBounds ? summary.selectionBounds : null;
        if (!summary || !bounds || typeof window.__PROTECTED_OLD_SHELL_SHOW_SELECTION_TOOLBAR__ !== "function") {
          return false;
        }
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
      return !!(
        surface &&
        summary &&
        summary.ready &&
        mode === renderHost &&
        String(summary.compatTransport || "") === transport
      );
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
  const typographyOpen = await page.evaluate(() => !!document.querySelector("#protectedTypographyControl.is-open"));
  if (typographyOpen) {
    await page.evaluate(() => document.querySelector("#protectedTypographyTrigger")?.click());
    await page.waitForFunction(() => !document.querySelector("#protectedTypographyControl")?.classList.contains("is-open"), {}, { timeout: 5000 });
  }
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

async function openTypography(page) {
  await page.evaluate(() => document.querySelector("#protectedTypographyTrigger")?.click());
  await page.waitForFunction(() => {
    const wrap = document.querySelector("#protectedTypographyControl");
    return !!(wrap && wrap.classList.contains("is-open"));
  }, {}, { timeout: 3000 });
}

async function submitDesktopSearch(page, query) {
  const input = page.locator("#searchInputDesktop");
  if (!(await input.isVisible().catch(() => false))) throw new Error("Desktop search input is not visible.");
  await input.fill(query);
  await input.press("Enter");
}

async function normalizeBookmarkState(page) {
  await page.waitForFunction(() => !!document.querySelector("#bookmark"), {}, { timeout: 3000 });
  const isActive = await page.evaluate(() => String(document.querySelector("#bookmark")?.getAttribute("aria-pressed") || "false") === "true");
  if (!isActive) return;
  await page.evaluate(() => document.querySelector("#bookmark")?.click());
  await page.waitForFunction(() => String(document.querySelector("#bookmark")?.getAttribute("aria-pressed") || "false") === "false", {}, { timeout: 5000 });
}

async function runProtectedScenario(browser, url) {
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
  const afterHighlight = await withSurface(page, transport, "summary");

  await withSurface(page, transport, "selectAutomationSample");
  await waitForSummary(page, transport, "(summary) => !!(summary.selectionActive && Number(summary.selectedChars || 0) > 1)");
  const beforeNote = Number((await withSurface(page, transport, "summary")).annotationCount || 0);
  const noteText = `phase7-${transport}-note`;
  await withSurface(page, transport, "addNoteToSelection", [noteText]);
  await waitForSummary(page, transport, `(summary) => Number(summary.annotationCount || 0) > ${beforeNote}`);

  await openLibraryTab(page, "notes");
  const notesList = await page.evaluate(() => {
    const items = [...document.querySelectorAll("#notes li.list_item")];
    return {
      count: items.length,
      texts: items.map((item) => ({
        annotationId: item.dataset.annotationId || "",
        quote: String(item.querySelector(".bookmark_link")?.textContent || "").trim(),
        noteText: String(item.querySelector(".bookmark-comment")?.textContent || "").trim()
      }))
    };
  });
  const createdNote = notesList.texts.find((item) => item.noteText === noteText) || null;
  if (!createdNote) throw new Error(`Created note not visible in notes list (${transport}).`);

  await page.evaluate(() => document.querySelector("#notes .bookmark_link")?.click());
  await waitForSummary(page, transport, "(summary) => !!summary.focusedAnnotationId");
  const focusState = await withSurface(page, transport, "snapshot");
  await closeLibrary(page);

  await normalizeBookmarkState(page);
  const bookmarkBefore = await page.evaluate(() => document.querySelectorAll("#protectedLibraryBookmarksList li.list_item").length);
  await page.evaluate(() => document.querySelector("#bookmark")?.click());
  await page.waitForFunction(() => String(document.querySelector("#bookmark")?.getAttribute("aria-pressed") || "false") === "true", {}, { timeout: 5000 });
  await openLibraryTab(page, "bookmarks");
  await page.waitForFunction(({ minCount }) => document.querySelectorAll("#protectedLibraryBookmarksList li.list_item").length >= minCount, { minCount: Math.max(1, bookmarkBefore + 1) }, { timeout: 3000 });
  const bookmarkState = await page.evaluate(() => {
    const items = [...document.querySelectorAll("#protectedLibraryBookmarksList li.list_item")];
    return {
      count: items.length,
      labels: items.map((item) => String(item.querySelector(".bookmark_link")?.textContent || "").trim())
    };
  });
  await page.evaluate(() => document.querySelector("#protectedLibraryBookmarksList .bookmark_link")?.click());
  await page.waitForFunction(() => {
    const overlay = document.querySelector("#overlay-library");
    const trigger = document.querySelector("#protectedLibraryTrigger");
    return !!(
      overlay &&
      overlay.classList.contains("hidden") &&
      trigger &&
      trigger.getAttribute("aria-expanded") === "false"
    );
  }, {}, { timeout: 5000 });
  await openLibraryTab(page, "bookmarks");
  await page.waitForFunction(() => document.querySelectorAll("#protectedLibraryBookmarksList li.list_item").length >= 1, {}, { timeout: 5000 });
  await closeLibrary(page);
  await page.evaluate(() => document.querySelector("#bookmark")?.click());
  await page.waitForFunction(() => String(document.querySelector("#bookmark")?.getAttribute("aria-pressed") || "false") === "false", {}, { timeout: 5000 });
  await openLibraryTab(page, "bookmarks");
  await page.waitForFunction(({ expectedMax }) => document.querySelectorAll("#protectedLibraryBookmarksList li.list_item").length <= expectedMax, { expectedMax: Math.max(0, bookmarkState.count - 1) }, { timeout: 5000 });
  const bookmarkAfterDelete = await page.evaluate(() => document.querySelectorAll("#protectedLibraryBookmarksList li.list_item").length);
  await closeLibrary(page);

  const originBeforeSearch = await withSurface(page, transport, "summary");
  await submitDesktopSearch(page, "the");
  await waitForSummary(page, transport, "(summary) => !!(summary.searchSummary && summary.searchSummary.active && Number(summary.searchSummary.totalMatches || summary.searchSummary.matchCount || 0) > 0)");
  const afterSearch = await withSurface(page, transport, "summary");
  const currentMatch = Number(afterSearch.searchSummary && (afterSearch.searchSummary.currentMatch || 0) || 0);
  await page.evaluate(() => document.querySelector("#searchNextDesktop")?.click());
  await waitForSummary(page, transport, `(summary) => Number(summary.searchSummary && (summary.searchSummary.currentMatch || 0) || 0) >= ${Math.max(1, currentMatch)}`);
  const afterSearchNext = await withSurface(page, transport, "summary");
  await page.evaluate(() => document.querySelector("#searchPrevDesktop")?.click());
  await page.waitForTimeout(250);
  await page.evaluate(() => document.querySelector("#searchReturnDesktop")?.click());
  await waitForSummary(
    page,
    transport,
    `(summary) => !summary.searchSummary?.active && String(summary.globalPageLabel || summary.pageLabel || "") === ${JSON.stringify(String(originBeforeSearch.globalPageLabel || originBeforeSearch.pageLabel || ""))}`
  );
  const afterSearchReturn = await withSurface(page, transport, "summary");

  const themeBefore = String((await withSurface(page, transport, "summary")).theme || "light");
  await page.evaluate(() => document.querySelector("#themeToggle")?.click());
  await waitForSummary(page, transport, `(summary) => String(summary.theme || "light") !== ${JSON.stringify(themeBefore)}`);
  const darkSummary = await withSurface(page, transport, "summary");
  await page.evaluate(() => document.querySelector("#themeToggle")?.click());
  await waitForSummary(page, transport, `(summary) => String(summary.theme || "light") === ${JSON.stringify(themeBefore)}`);

  await openTypography(page);
  await page.evaluate(() => document.querySelector("#protectedTypographySerif")?.click()).catch(() => {});
  await page.waitForFunction(() => {
    const wrap = document.querySelector("#protectedTypographyControl");
    return !!(wrap && wrap.dataset.fontMode === "serif");
  }, {}, { timeout: 3000 }).catch(() => {});
  await page.evaluate(() => {
    const input = document.querySelector("#protectedTypographyScale");
    if (!input) return;
    input.value = "1.2";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await waitForSummary(page, transport, "(summary) => Number(summary.fontScale || 0) >= 1.19");
  const typographySummary = await withSurface(page, transport, "summary");

  await withSurface(page, transport, "selectAutomationSample");
  await waitForSummary(page, transport, "(summary) => !!(summary.selectionActive && Number(summary.selectedChars || 0) > 1)");
  await withSurface(page, transport, "createHighlight");
  await page.waitForTimeout(250);

  await openLibraryTab(page, "notes");
  const shareButtonState = await page.evaluate(() => {
    const button = document.querySelector("#protectedNotesShareBtn");
    return {
      present: !!button,
      disabled: !!(button && button.disabled),
      label: String(button?.textContent || "").trim()
    };
  });
  const sharePayload = await withSurface(page, transport, "exportNotesSharePayload");
  await closeLibrary(page);

  const finalSnapshot = await withSurface(page, transport, "snapshot");
  await page.close();

  return {
    transport,
    renderHost,
    initialPageLabel,
    toolbarState,
    afterHighlightAnnotationCount: Number(afterHighlight.annotationCount || 0),
    notesList,
    focusedAnnotationId: String(focusState.summary && focusState.summary.focusedAnnotationId || ""),
    focusHighlightCount: Number((focusState.summary && focusState.summary.focusHighlightCount) || (focusState.debug && focusState.debug.focusHighlights && focusState.debug.focusHighlights.length) || 0),
    bookmarkState,
    bookmarkAfterDelete,
    search: {
      totalMatches: Number(afterSearch.searchSummary && (afterSearch.searchSummary.totalMatches || afterSearch.searchSummary.matchCount || 0) || 0),
      currentMatchAfterNext: Number(afterSearchNext.searchSummary && (afterSearchNext.searchSummary.currentMatch || 0) || 0),
      returnedPageLabel: String(afterSearchReturn.globalPageLabel || afterSearchReturn.pageLabel || ""),
      originPageLabel: String(originBeforeSearch.globalPageLabel || originBeforeSearch.pageLabel || "")
    },
    theme: {
      darkApplied: String(darkSummary.theme || "") === "dark",
      restoredTheme: themeBefore
    },
    typography: {
      fontMode: String(typographySummary.runtimeFontMode || typographySummary.fontMode || ""),
      fontScale: Number(typographySummary.fontScale || 0)
    },
    share: {
      button: shareButtonState,
      payloadShape: sharePayload
        ? {
            bookId: sharePayload.bookId || "",
            sharePayloadVersion: Number(
              sharePayload.sharePayload && (
                sharePayload.sharePayload.v ||
                sharePayload.sharePayload.version ||
                0
              )
            ) || 0,
            noteCount: Array.isArray(sharePayload.sharePayload && sharePayload.sharePayload.notes)
              ? sharePayload.sharePayload.notes.length
              : Array.isArray(sharePayload.productionNotes)
                ? sharePayload.productionNotes.length
                : 0,
            unresolved: Number(sharePayload.report && sharePayload.report.unresolved || 0) || 0
          }
        : null
    },
    security: {
      debugRequests,
      hiddenDomText: !!(finalSnapshot.debug && Number(finalSnapshot.debug.surfaceTextLength || 0) > 0)
    },
    summary: finalSnapshot.summary || null,
    compatInfo: finalSnapshot.compatInfo || null,
    supportedEvents: finalSnapshot.supportedEvents || []
  };
}

function assertProtectedScenario(result, failures, warnings) {
  if (!result || !result.summary || !result.summary.ready) failures.push(`${result && result.transport ? result.transport : "protected"}:not-ready`);
  if (!result.toolbarState || !result.toolbarState.visible || Number(result.toolbarState.actionCount || 0) < 2) {
    failures.push(`${result.transport}:selection-toolbar`);
  }
  if (!result.notesList || Number(result.notesList.count || 0) < 1) failures.push(`${result.transport}:notes-list-empty`);
  if (!result.focusedAnnotationId && Number(result.focusHighlightCount || 0) < 1) failures.push(`${result.transport}:note-focus`);
  if (!result.bookmarkState || Number(result.bookmarkState.count || 0) < 1) failures.push(`${result.transport}:bookmark-create`);
  if (Number(result.bookmarkAfterDelete || 0) >= Number(result.bookmarkState.count || 0)) failures.push(`${result.transport}:bookmark-delete`);
  if (!result.search || Number(result.search.totalMatches || 0) < 1) failures.push(`${result.transport}:search-submit`);
  if (!result.search || String(result.search.returnedPageLabel || "") !== String(result.search.originPageLabel || "")) {
    failures.push(`${result.transport}:search-return-origin`);
  }
  if (!result.theme || !result.theme.darkApplied) failures.push(`${result.transport}:theme-toggle`);
  if (!result.typography || Number(result.typography.fontScale || 0) < 1.19) failures.push(`${result.transport}:font-scale`);
  if (
    !result.share ||
    !result.share.button ||
    !result.share.button.present ||
    result.share.button.disabled ||
    !result.share.payloadShape ||
    !String(result.share.payloadShape.bookId || "").trim() ||
    Number(result.share.payloadShape.sharePayloadVersion || 0) <= 0
  ) {
    failures.push(`${result.transport}:share-payload`);
  }
  if (Array.isArray(result.security && result.security.debugRequests) && result.security.debugRequests.length) failures.push(`${result.transport}:debug-surface`);
  if (result.security && result.security.hiddenDomText) failures.push(`${result.transport}:hidden-dom-text`);
  if (result.typography && String(result.typography.fontMode || "") !== "serif") {
    warnings.push(`${result.transport}:font-mode-did-not-switch-to-serif`);
  }
}

function compareProtectedParity(bridgeResult, directResult, failures) {
  if ((bridgeResult.share && bridgeResult.share.payloadShape && bridgeResult.share.payloadShape.sharePayloadVersion) !== (directResult.share && directResult.share.payloadShape && directResult.share.payloadShape.sharePayloadVersion)) {
    failures.push("protected:share-payload-version-mismatch");
  }
  if ((bridgeResult.share && bridgeResult.share.payloadShape && bridgeResult.share.payloadShape.bookId) !== (directResult.share && directResult.share.payloadShape && directResult.share.payloadShape.bookId)) {
    failures.push("protected:share-bookId-mismatch");
  }
  if ((bridgeResult.share && bridgeResult.share.payloadShape && bridgeResult.share.payloadShape.noteCount) !== (directResult.share && directResult.share.payloadShape && directResult.share.payloadShape.noteCount)) {
    failures.push("protected:share-note-count-mismatch");
  }
  if ((bridgeResult.share && bridgeResult.share.payloadShape && bridgeResult.share.payloadShape.unresolved) !== (directResult.share && directResult.share.payloadShape && directResult.share.payloadShape.unresolved)) {
    failures.push("protected:share-unresolved-mismatch");
  }
  if (!(Array.isArray(directResult.supportedEvents) && directResult.supportedEvents.includes("selectionChanged") && directResult.supportedEvents.includes("searchStateChanged"))) {
    failures.push("direct:supported-events-missing");
  }
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
  const initialCounter = await page.locator("#page-count").textContent().catch(() => "");
  await page.evaluate(() => document.querySelector("#themeToggle")?.click());
  const desktopInput = page.locator("#searchInputDesktop");
  if (await desktopInput.isVisible().catch(() => false)) {
    await desktopInput.fill("the");
    await desktopInput.press("Enter");
  } else {
    await page.evaluate(() => document.querySelector("#searchOpen")?.click());
    await page.fill("#searchInputMobile", "the");
    await page.press("#searchInputMobile", "Enter");
  }
  await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelector("#slider")?.click());
  await page.waitForTimeout(300);
  const result = await page.evaluate(() => {
    const hub = window.__READERPUB_READER_EVENTS__;
    return {
      supportedEvents: hub && typeof hub.getSupportedEvents === "function" ? hub.getSupportedEvents() : (hub && hub.supportedEvents ? hub.supportedEvents : []),
      history: hub && typeof hub.getHistory === "function" ? hub.getHistory() : [],
      hasProtectedHost: !!document.querySelector("#protectedOldShellHost"),
      hasViewerStack: !!document.querySelector("#viewerStack"),
      darkUi: document.body.classList.contains("dark-ui"),
      searchValue: String(document.querySelector("#searchInputDesktop")?.value || document.querySelector("#searchInputMobile")?.value || "").trim(),
      sidebarVisible: !document.querySelector("#overlay-menu")?.classList.contains("hidden")
    };
  });
  await page.close();
  return { ...result, initialCounter, debugRequests };
}

function assertUnprotectedScenario(result, failures) {
  const supported = Array.isArray(result.supportedEvents) ? result.supportedEvents : [];
  for (const eventName of ["pageChanged", "themeChanged", "searchStateChanged", "sidebarStateChanged"]) {
    if (!supported.includes(eventName)) failures.push(`unprotected:missing-${eventName}`);
  }
  const historyTypes = new Set((Array.isArray(result.history) ? result.history : []).map((entry) => entry.type));
  for (const eventName of ["pageChanged", "themeChanged", "searchStateChanged", "sidebarStateChanged"]) {
    if (!historyTypes.has(eventName)) failures.push(`unprotected:no-${eventName}`);
  }
  if (result.hasProtectedHost) failures.push("unprotected:protected-host-visible");
  if (!result.hasViewerStack) failures.push("unprotected:viewer-stack-missing");
  if (!result.darkUi) failures.push("unprotected:theme-toggle");
  if (!String(result.searchValue || "").trim()) failures.push("unprotected:search-input");
  if (!result.sidebarVisible) failures.push("unprotected:sidebar-open");
  if (Array.isArray(result.debugRequests) && result.debugRequests.length) failures.push("unprotected:debug-surface");
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });
  const failures = [];
  const warnings = [];
  try {
    const bridgeResult = await runProtectedScenario(browser, BRIDGE_URL);
    assertProtectedScenario(bridgeResult, failures, warnings);
    const directResult = await runProtectedScenario(browser, DIRECT_URL);
    assertProtectedScenario(directResult, failures, warnings);
    compareProtectedParity(bridgeResult, directResult, failures);
    const unprotectedResult = await runUnprotectedScenario(browser, OLD_URL);
    assertUnprotectedScenario(unprotectedResult, failures);
    console.log(JSON.stringify({
      ok: failures.length === 0,
      failures,
      warnings,
      bridgeResult,
      directResult,
      unprotectedResult
    }, null, 2));
  } finally {
    await browser.close();
  }
  if (failures.length) process.exit(1);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
