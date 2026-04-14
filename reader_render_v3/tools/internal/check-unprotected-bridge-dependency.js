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
  "http://127.0.0.1:8788/reader/?id=19686";

let CURRENT_STEP = "boot";

async function installAuditHooks(context) {
  await context.addInitScript(() => {
    const existing = window.__UNPROTECTED_BRIDGE_AUDIT__;
    if (existing) return;

    const store = {
      channel: "unprotected-bridge-audit-v1",
      fbUserGestureMessages: [],
      tryFsAssignments: 0,
      tryFsCalls: [],
      warnings: []
    };

    function now() {
      try {
        return Date.now();
      } catch (_error) {
        return 0;
      }
    }

    window.__UNPROTECTED_BRIDGE_AUDIT__ = store;

    try {
      window.addEventListener(
        "message",
        (event) => {
          try {
            const data = event && event.data;
            if (data && typeof data === "object" && data.type === "fb_user_gesture") {
              store.fbUserGestureMessages.push({
                at: now(),
                type: "fb_user_gesture"
              });
            }
          } catch (_error) {}
        },
        true
      );
    } catch (_error) {}

    try {
      let stored = undefined;
      Object.defineProperty(window, "__tryFsFromIframe", {
        configurable: true,
        enumerable: true,
        get() {
          return stored;
        },
        set(value) {
          store.tryFsAssignments += 1;
          if (typeof value === "function") {
            stored = function (...args) {
              store.tryFsCalls.push({ at: now(), argCount: args.length });
              return value.apply(this, args);
            };
          } else {
            stored = value;
          }
        }
      });
    } catch (error) {
      try {
        store.warnings.push(`tryFs-hook-failed:${error && error.message ? error.message : String(error)}`);
      } catch (_error) {}
    }
  });
}

async function waitForHub(page, timeout = 15000) {
  await page.waitForFunction(
    () => {
      return !!(
        window.__READERPUB_READER_EVENTS__ &&
        Array.isArray(window.__READERPUB_READER_EVENTS__.supportedEvents) &&
        window.__READERPUB_READER_EVENTS__.supportedEvents.length
      );
    },
    {},
    { timeout }
  );
  await page.waitForTimeout(900);
}

async function waitForPageLabelChange(page, previousLabel, timeout = 10000) {
  await page.waitForFunction(
    ({ previousLabel }) => {
      try {
        const hub = window.__READERPUB_READER_EVENTS__;
        const history = hub && typeof hub.getHistory === "function" ? hub.getHistory() : [];
        for (let index = history.length - 1; index >= 0; index -= 1) {
          const entry = history[index];
          if (!entry || entry.type !== "pageChanged") continue;
          const payload = entry.payload || {};
          const label = String(payload.globalPageLabel || payload.pageLabel || "").trim();
          return !!label && label !== previousLabel;
        }
      } catch (_error) {}
      try {
        const pageCount = String(document.querySelector("#page-count")?.textContent || "").trim();
        return !!pageCount && pageCount !== previousLabel;
      } catch (_error) {}
      return false;
    },
    { previousLabel },
    { timeout }
  );
}

async function waitForPageLabel(page, expectedLabel, timeout = 10000) {
  await page.waitForFunction(
    ({ expectedLabel }) => {
      try {
        const hub = window.__READERPUB_READER_EVENTS__;
        const history = hub && typeof hub.getHistory === "function" ? hub.getHistory() : [];
        for (let index = history.length - 1; index >= 0; index -= 1) {
          const entry = history[index];
          if (!entry || entry.type !== "pageChanged") continue;
          const payload = entry.payload || {};
          const label = String(payload.globalPageLabel || payload.pageLabel || "").trim();
          return !!label && label === expectedLabel;
        }
      } catch (_error) {}
      try {
        const pageCount = String(document.querySelector("#page-count")?.textContent || "").trim();
        return !!pageCount && pageCount === expectedLabel;
      } catch (_error) {}
      return false;
    },
    { expectedLabel },
    { timeout }
  );
}

async function waitForSearchCount(page, timeout = 7000) {
  await page.waitForFunction(
    () => {
      const desktop = document.querySelector("#searchCountDesktop");
      const mobile = document.querySelector("#searchCount");
      const value = String((desktop && desktop.textContent) || (mobile && mobile.textContent) || "").trim();
      return !!value && value !== "0/0" && value !== "…" && value !== "0 / 0";
    },
    {},
    { timeout }
  );
}

async function waitForSearchQuery(page, expectedQuery, timeout = 5000) {
  await page.waitForFunction(
    ({ expectedQuery }) => {
      try {
        const hub = window.__READERPUB_READER_EVENTS__;
        const history = hub && typeof hub.getHistory === "function" ? hub.getHistory() : [];
        for (let index = history.length - 1; index >= 0; index -= 1) {
          const entry = history[index];
          if (!entry || entry.type !== "searchStateChanged") continue;
          const payload = entry.payload || {};
          return String(payload.query || "") === expectedQuery;
        }
      } catch (_error) {}
      return false;
    },
    { expectedQuery },
    { timeout }
  );
}

async function openToc(page) {
  await page.click("#slider", { force: true });
  await page.waitForTimeout(350);
}

async function closeOverlay(page, selector = "#overlay-toc") {
  await page.evaluate(({ selector }) => {
    const overlay = document.querySelector(selector);
    const close = overlay ? overlay.querySelector(".overlay-close") : null;
    if (close) close.click();
  }, { selector });
  await page.waitForTimeout(350);
}

async function getState(page) {
  return await page.evaluate(() => {
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

    const pageEntry = latest("pageChanged");
    const readingEntry = latest("readingPositionChanged");
    const searchEntry = latest("searchStateChanged");
    const themeEntry = latest("themeChanged");
    const sidebarEntry = latest("sidebarStateChanged");
    const bookmarkEntry = latest("bookmarkUpdated");
    const annotationsEntry = latest("annotationsChanged");

    const desktopSearchCount = String(document.querySelector("#searchCountDesktop")?.textContent || "").trim();
    const mobileSearchCount = String(document.querySelector("#searchCount")?.textContent || "").trim();
    const currentPageText = String(document.querySelector("#cur")?.textContent || "").trim();
    const totalPageText = String(document.querySelector("#pages")?.textContent || "").trim();
    const pageCountText = String(document.querySelector("#page-count")?.textContent || "").trim();
    const chapterTitle = String(document.querySelector("#chapter-title")?.textContent || "").trim();
    const tocVisible = !!(
      (document.querySelector("#overlay-toc") && !document.querySelector("#overlay-toc").classList.contains("hidden")) ||
      (document.body && document.body.classList.contains("overlay-open"))
    );
    const tocItemCount = document.querySelectorAll("#tocView a, #tocView button").length;
    const tocClosePresent = !!document.querySelector("#overlay-toc .overlay-close");
    const bookmarkClass = String(document.querySelector("#bookmark")?.className || "");
    const bookmarkCount = document.querySelectorAll("#bookmarks li").length;
    const protectedHost = !!document.querySelector("#protectedOldShellFrame");

    const audit = window.__UNPROTECTED_BRIDGE_AUDIT__ || {
      fbUserGestureMessages: [],
      tryFsAssignments: 0,
      tryFsCalls: [],
      warnings: []
    };

    return {
      supportedEvents: Array.isArray(window.__READERPUB_READER_EVENTS__?.supportedEvents)
        ? window.__READERPUB_READER_EVENTS__.supportedEvents.slice()
        : [],
      pageChanged: pageEntry ? pageEntry.payload : null,
      readingPositionChanged: readingEntry ? readingEntry.payload : null,
      searchStateChanged: searchEntry ? searchEntry.payload : null,
      themeChanged: themeEntry ? themeEntry.payload : null,
      sidebarStateChanged: sidebarEntry ? sidebarEntry.payload : null,
      bookmarkUpdated: bookmarkEntry ? bookmarkEntry.payload : null,
      annotationsChanged: annotationsEntry ? annotationsEntry.payload : null,
      desktopSearchCount,
      mobileSearchCount,
      currentPageText,
      totalPageText,
      pageCountText,
      chapterTitle,
      tocVisible,
      tocItemCount,
      tocClosePresent,
      bookmarkClass,
      bookmarkCount,
      protectedHost,
      audit,
      frameInfo: {
        tags: [...document.querySelectorAll("#viewerStack iframe, #viewer iframe")].map((frame) => frame.tagName),
        frameCount: document.querySelectorAll("#viewerStack iframe, #viewer iframe").length
      }
    };
  });
}

async function runScenario(browser, url) {
  let step = "init";
  const mark = (value) => {
    step = value;
    CURRENT_STEP = value;
  };
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await installAuditHooks(context);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const debugRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("/debug/")) debugRequests.push(request.url());
  });

  mark("goto");
  await page.goto(url, { waitUntil: "domcontentloaded" });
  mark("wait-hub");
  await waitForHub(page);

  mark("initial-state");
  const initial = await getState(page);
  const initialPageLabel = String(
    (initial.pageChanged && (initial.pageChanged.globalPageLabel || initial.pageChanged.pageLabel)) ||
      initial.currentPageText ||
      initial.pageCountText ||
      ""
  ).trim();

  mark("next");
  await page.click("#next");
  mark("wait-next");
  await waitForPageLabelChange(page, initialPageLabel);
  mark("after-next-state");
  const afterNext = await getState(page);
  const afterNextPageLabel = String(
    (afterNext.pageChanged && (afterNext.pageChanged.globalPageLabel || afterNext.pageChanged.pageLabel)) ||
      afterNext.currentPageText ||
      afterNext.pageCountText ||
      ""
  ).trim();

  mark("prev");
  await page.click("#prev");
  mark("wait-prev");
  await waitForPageLabelChange(page, afterNextPageLabel);
  mark("after-prev-state");
  const afterPrev = await getState(page);

  mark("open-toc");
  await openToc(page);
  mark("toc-before-state");
  const tocBefore = await getState(page);
  mark("toc-click-target");
  await page.evaluate(() => {
    const links = [...document.querySelectorAll("#tocView a, #tocView button")];
    const target = links.find((item) => {
      const text = String(item.textContent || "").trim();
      return text && text !== "Top";
    }) || links[0];
    if (!target) throw new Error("TOC target unavailable.");
    target.click();
  });
  mark("wait-toc-navigation");
  await waitForPageLabelChange(page, initialPageLabel, 10000);
  mark("after-toc-state");
  const afterToc = await getState(page);
  const tocPageLabel = String(
    (afterToc.pageChanged && (afterToc.pageChanged.globalPageLabel || afterToc.pageChanged.pageLabel)) ||
      afterToc.currentPageText ||
      afterToc.pageCountText ||
      ""
  ).trim();

  mark("reload");
  await page.reload({ waitUntil: "domcontentloaded" });
  mark("wait-hub-after-reload");
  await waitForHub(page);
  mark("wait-restore");
  await waitForPageLabel(page, tocPageLabel, 10000);
  mark("after-reload-state");
  const afterReload = await getState(page);

  const desktopInput = page.locator("#searchInputDesktop");
  if (!(await desktopInput.isVisible().catch(() => false))) {
    throw new Error("Desktop search input is not visible in unprotected scenario.");
  }
  mark("search-fill");
  await desktopInput.fill("the");
  mark("search-enter");
  await desktopInput.press("Enter");
  mark("wait-search-query");
  await waitForSearchQuery(page, "the");
  mark("wait-search-count");
  await waitForSearchCount(page);
  mark("search-open-state");
  const searchOpen = await getState(page);
  const searchStartPage = String(
    (searchOpen.pageChanged && (searchOpen.pageChanged.globalPageLabel || searchOpen.pageChanged.pageLabel)) ||
      searchOpen.currentPageText ||
      searchOpen.pageCountText ||
      ""
  ).trim();

  const searchCountBeforeNext = String(searchOpen.desktopSearchCount || searchOpen.mobileSearchCount || "").trim();
  mark("search-next");
  await page.click("#searchNextDesktop");
  await page.waitForTimeout(400);
  mark("search-next-state");
  const searchAfterNext = await getState(page);
  mark("search-prev");
  await page.click("#searchPrevDesktop");
  await page.waitForTimeout(400);
  mark("search-prev-state");
  const searchAfterPrev = await getState(page);

  let returnSupported = false;
  if (await page.locator("#searchFloatReturn").isVisible().catch(() => false)) {
    returnSupported = true;
    mark("search-return");
    await page.click("#searchFloatReturn");
    await page.waitForTimeout(500);
  }
  mark("search-clear");
  await page.click("#searchActionDesktop");
  await page.waitForTimeout(500);
  mark("search-clear-state");
  const searchAfterClear = await getState(page);

  mark("theme-before-state");
  const beforeTheme = await getState(page);
  mark("theme-dark");
  await page.click("#themeToggle");
  await page.waitForTimeout(250);
  mark("theme-dark-state");
  const darkTheme = await getState(page);
  mark("theme-light");
  await page.click("#themeToggle");
  await page.waitForTimeout(250);
  mark("theme-light-state");
  const lightTheme = await getState(page);

  let typographyApplied = false;
  if (await page.locator("#fontInc").isVisible().catch(() => false)) {
    mark("font-inc");
    await page.click("#fontInc");
    await page.waitForTimeout(200);
    mark("font-dec");
    await page.click("#fontDec");
    await page.waitForTimeout(200);
    typographyApplied = true;
  }
  mark("after-typography-state");
  const afterTypography = await getState(page);

  mark("bookmark-before-state");
  const bookmarkBefore = await getState(page);
  mark("bookmark-create");
  await page.click("#bookmark");
  await page.waitForTimeout(350);
  mark("bookmark-created-state");
  const bookmarkCreated = await getState(page);
  mark("bookmark-delete");
  await page.click("#bookmark");
  await page.waitForTimeout(350);
  mark("bookmark-deleted-state");
  const bookmarkDeleted = await getState(page);

  mark("sidebar-open");
  await openToc(page);
  mark("sidebar-close");
  await closeOverlay(page, "#overlay-toc");
  mark("sidebar-closed-state");
  const sidebarClosed = await getState(page);

  mark("final-state");
  const finalState = await getState(page);
  await context.close();

  const exactFlowsChecked = {
    openBook: !!initialPageLabel,
    nextPrev:
      !!afterNextPageLabel &&
      String((afterPrev.pageChanged && (afterPrev.pageChanged.globalPageLabel || afterPrev.pageChanged.pageLabel)) || "").trim() !== "" &&
      String((afterPrev.pageChanged && (afterPrev.pageChanged.globalPageLabel || afterPrev.pageChanged.pageLabel)) || "").trim() !== afterNextPageLabel,
    tocNavigation: !!tocPageLabel && tocPageLabel !== initialPageLabel,
    readingPositionRestore: String((afterReload.pageChanged && (afterReload.pageChanged.globalPageLabel || afterReload.pageChanged.pageLabel)) || afterReload.pageCountText || "").trim() === tocPageLabel,
    searchSubmit: String(searchOpen.desktopSearchCount || searchOpen.mobileSearchCount || "").trim() !== "" && String(searchOpen.desktopSearchCount || searchOpen.mobileSearchCount || "").trim() !== "0/0",
    searchNextPrev: String(searchAfterNext.desktopSearchCount || searchAfterNext.mobileSearchCount || "").trim() !== searchCountBeforeNext,
    searchClear: !String((searchAfterClear.searchStateChanged && searchAfterClear.searchStateChanged.query) || "").trim(),
    searchReturn: returnSupported ? String((searchAfterClear.pageChanged && (searchAfterClear.pageChanged.globalPageLabel || searchAfterClear.pageChanged.pageLabel)) || searchAfterClear.pageCountText || "").trim() === searchStartPage : null,
    themeToggle: String((darkTheme.themeChanged && darkTheme.themeChanged.theme) || "") === "dark" && String((lightTheme.themeChanged && lightTheme.themeChanged.theme) || "") === "light",
    typography: typographyApplied,
    bookmarkCreateDelete: Number(bookmarkCreated.bookmarkCount || 0) >= Number(bookmarkBefore.bookmarkCount || 0) && Number(bookmarkDeleted.bookmarkCount || 0) <= Number(bookmarkCreated.bookmarkCount || 0),
    sidebarOpenClose: Number(tocBefore.tocItemCount || 0) > 0 && !!tocBefore.tocClosePresent && debugRequests.length === 0,
    routeStability: !finalState.protectedHost && debugRequests.length === 0
  };

  const observedBridgeUsages = {
    fbUserGestureMessages: Array.isArray(finalState.audit.fbUserGestureMessages) ? finalState.audit.fbUserGestureMessages.length : 0,
    tryFsAssignments: Number(finalState.audit.tryFsAssignments || 0),
    tryFsCalls: Array.isArray(finalState.audit.tryFsCalls) ? finalState.audit.tryFsCalls.length : 0,
    protectedHostPresent: !!finalState.protectedHost
  };

  const exactBlockers = [];
  if (!exactFlowsChecked.openBook) exactBlockers.push("open-book");
  if (!exactFlowsChecked.nextPrev) exactBlockers.push("navigation-next-prev");
  if (!exactFlowsChecked.tocNavigation) exactBlockers.push("toc-navigation");
  if (!exactFlowsChecked.readingPositionRestore) exactBlockers.push("reading-position-restore");
  if (!exactFlowsChecked.searchSubmit) exactBlockers.push("search-submit");
  if (!exactFlowsChecked.searchNextPrev) exactBlockers.push("search-next-prev");
  if (!exactFlowsChecked.searchClear) exactBlockers.push("search-clear");
  if (exactFlowsChecked.searchReturn === false) exactBlockers.push("search-return");
  if (!exactFlowsChecked.themeToggle) exactBlockers.push("theme-toggle");
  if (!exactFlowsChecked.bookmarkCreateDelete) exactBlockers.push("bookmark-create-delete");
  if (!exactFlowsChecked.sidebarOpenClose) exactBlockers.push("sidebar-open-close");
  if (!exactFlowsChecked.routeStability) exactBlockers.push("route-stability");

  const warnings = [];
  if (exactFlowsChecked.searchReturn == null) warnings.push("Search return control is not exposed in the desktop old-route scenario; submit/next/prev/clear were verified instead.");
  if (!typographyApplied) warnings.push("Typography controls were not visible; theme and shell state were still verified.");
  if (observedBridgeUsages.fbUserGestureMessages > 0) warnings.push("Observed fb_user_gesture postMessage activity; classify against critical flow scope before Phase 9.");
  if (observedBridgeUsages.tryFsCalls > 0) warnings.push("Observed __tryFsFromIframe calls; classify against critical flow scope before Phase 9.");
  if (Array.isArray(finalState.audit.warnings) && finalState.audit.warnings.length) warnings.push(...finalState.audit.warnings);

  const zeroCriticalBridgeDependencies =
    exactBlockers.length === 0 &&
    observedBridgeUsages.fbUserGestureMessages === 0 &&
    observedBridgeUsages.tryFsCalls === 0 &&
    observedBridgeUsages.protectedHostPresent === false;

  return {
    ok: exactBlockers.length === 0,
    zeroCriticalBridgeDependencies,
    exactFlowsChecked,
    bridgeUsagesObserved: observedBridgeUsages,
    exactBlockers,
    warnings,
    snapshots: {
      initial,
      afterNext,
      afterPrev,
      afterToc,
      afterReload,
      searchOpen,
      searchAfterNext,
      searchAfterPrev,
      searchAfterClear,
      darkTheme,
      lightTheme,
      afterTypography,
      bookmarkBefore,
      bookmarkCreated,
      bookmarkDeleted,
      sidebarClosed,
      finalState
    },
    debugRequests
  };
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"]
  });
  try {
    const result = await runScenario(browser, URL_TO_CHECK);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          zeroCriticalBridgeDependencies: false,
          exactBlockers: [`${CURRENT_STEP}: ${error && error.message ? error.message : String(error)}`]
        },
        null,
        2
      )
    );
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
