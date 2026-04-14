#!/usr/bin/env node

const { chromium } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

function getArgValue(name) {
  for (const item of process.argv.slice(2)) {
    if (item.startsWith(`--${name}=`)) return item.slice(name.length + 3);
  }
  return "";
}

const BRIDGE_URL =
  getArgValue("bridge-url") ||
  "http://127.0.0.1:8788/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape";
const ADAPTER_URL =
  getArgValue("adapter-url") ||
  "http://127.0.0.1:8788/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&protectedCompatTransport=adapter&renderMode=shape&metricsMode=shape";

function expectedTransport(url) {
  try {
    const parsed = new URL(url);
    return String(parsed.searchParams.get("protectedCompatTransport") || "").trim().toLowerCase() === "adapter"
      ? "adapter"
      : "bridge";
  } catch (_error) {
    return "bridge";
  }
}

async function waitHostReady(page, transport, timeout = 20000) {
  await page.waitForFunction(
    ({ transport }) => {
      const frame = document.querySelector("#protectedOldShellFrame");
      try {
        const win = frame && frame.contentWindow ? frame.contentWindow : null;
        const surface = !win
          ? null
          : transport === "adapter"
            ? win.__PROTECTED_READER_COMPAT_ADAPTER__ || null
            : win.__PROTECTED_READER_BRIDGE__ || null;
        const summary = surface && typeof surface.getSummary === "function" ? surface.getSummary() : null;
        return !!(summary && summary.ready && summary.compatTransport === transport);
      } catch (_error) {
        return false;
      }
    },
    { transport },
    { timeout }
  );
}

async function evaluateSurface(page, transport, expression, args = []) {
  return await page.evaluate(
    async ({ transport, expression, args }) => {
      const frame = document.querySelector("#protectedOldShellFrame");
      const win = frame && frame.contentWindow ? frame.contentWindow : null;
      const surface = !win
        ? null
        : transport === "adapter"
          ? win.__PROTECTED_READER_COMPAT_ADAPTER__ || null
          : win.__PROTECTED_READER_BRIDGE__ || null;
      if (!surface) {
        throw new Error(`Compat surface unavailable: ${transport}`);
      }
      if (expression === "snapshot") {
        const summary = typeof surface.getSummary === "function" ? surface.getSummary() : null;
        const compatInfo = typeof surface.getCompatInfo === "function" ? surface.getCompatInfo() : null;
        const readerFrame = frame && frame.contentDocument ? frame.contentDocument.querySelector(".reader-frame") : null;
        return {
          summary,
          compatInfo,
          surfaceKeys: Object.keys(surface),
          frameInfo: {
            tags: readerFrame ? [...readerFrame.children].map((node) => node.tagName) : [],
            textLength: readerFrame ? String(readerFrame.textContent || "").trim().length : 0
          }
        };
      }
      if (typeof surface[expression] !== "function") {
        throw new Error(`Compat method unavailable: ${expression}`);
      }
      return await surface[expression](...args);
    },
    { transport, expression, args }
  );
}

function getPageKey(summary = null) {
  if (!summary) return "";
  return `${summary.globalPageLabel || summary.pageLabel || ""}|${Number(summary.chunkOrder || 0)}`;
}

async function runScenario(browser, url) {
  const transport = expectedTransport(url);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(20000);
  const debugRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("/debug/")) debugRequests.push(request.url());
  });

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitHostReady(page, transport);

  const initial = await evaluateSurface(page, transport, "snapshot");
  const initialSummary = initial.summary || null;
  const initialPageKey = getPageKey(initialSummary);

  await evaluateSurface(page, transport, "nextPage");
  await page.waitForFunction(
    ({ transport, initialPageKey }) => {
      const frame = document.querySelector("#protectedOldShellFrame");
      const win = frame && frame.contentWindow ? frame.contentWindow : null;
      const surface = !win
        ? null
        : transport === "adapter"
          ? win.__PROTECTED_READER_COMPAT_ADAPTER__ || null
          : win.__PROTECTED_READER_BRIDGE__ || null;
      const summary = surface && typeof surface.getSummary === "function" ? surface.getSummary() : null;
      const currentKey = summary ? `${summary.globalPageLabel || summary.pageLabel || ""}|${Number(summary.chunkOrder || 0)}` : "";
      return !!summary && currentKey !== initialPageKey;
    },
    { transport, initialPageKey },
    { timeout: 5000 }
  );
  const afterNext = await evaluateSurface(page, transport, "snapshot");

  await evaluateSurface(page, transport, "prevPage");
  await page.waitForFunction(
    ({ transport, initialPageKey }) => {
      const frame = document.querySelector("#protectedOldShellFrame");
      const win = frame && frame.contentWindow ? frame.contentWindow : null;
      const surface = !win
        ? null
        : transport === "adapter"
          ? win.__PROTECTED_READER_COMPAT_ADAPTER__ || null
          : win.__PROTECTED_READER_BRIDGE__ || null;
      const summary = surface && typeof surface.getSummary === "function" ? surface.getSummary() : null;
      const currentKey = summary ? `${summary.globalPageLabel || summary.pageLabel || ""}|${Number(summary.chunkOrder || 0)}` : "";
      return !!summary && currentKey === initialPageKey;
    },
    { transport, initialPageKey },
    { timeout: 5000 }
  );
  const afterPrev = await evaluateSurface(page, transport, "snapshot");

  await evaluateSurface(page, transport, "setTheme", ["dark"]);
  await page.waitForFunction(
    ({ transport }) => {
      const frame = document.querySelector("#protectedOldShellFrame");
      const win = frame && frame.contentWindow ? frame.contentWindow : null;
      const surface = !win
        ? null
        : transport === "adapter"
          ? win.__PROTECTED_READER_COMPAT_ADAPTER__ || null
          : win.__PROTECTED_READER_BRIDGE__ || null;
      const summary = surface && typeof surface.getSummary === "function" ? surface.getSummary() : null;
      return !!summary && summary.theme === "dark";
    },
    { transport },
    { timeout: 5000 }
  );
  const darkSummary = await evaluateSurface(page, transport, "snapshot");

  await evaluateSurface(page, transport, "setTheme", ["light"]);
  await page.waitForFunction(
    ({ transport }) => {
      const frame = document.querySelector("#protectedOldShellFrame");
      const win = frame && frame.contentWindow ? frame.contentWindow : null;
      const surface = !win
        ? null
        : transport === "adapter"
          ? win.__PROTECTED_READER_COMPAT_ADAPTER__ || null
          : win.__PROTECTED_READER_BRIDGE__ || null;
      const summary = surface && typeof surface.getSummary === "function" ? surface.getSummary() : null;
      return !!summary && summary.theme === "light";
    },
    { transport },
    { timeout: 5000 }
  );

  await evaluateSurface(page, transport, "selectAutomationSample");
  await page.waitForFunction(
    ({ transport }) => {
      const frame = document.querySelector("#protectedOldShellFrame");
      const win = frame && frame.contentWindow ? frame.contentWindow : null;
      const surface = !win
        ? null
        : transport === "adapter"
          ? win.__PROTECTED_READER_COMPAT_ADAPTER__ || null
          : win.__PROTECTED_READER_BRIDGE__ || null;
      const summary = surface && typeof surface.getSummary === "function" ? surface.getSummary() : null;
      return !!(summary && summary.selectionActive && Number(summary.selectedChars || 0) > 1);
    },
    { transport },
    { timeout: 5000 }
  );
  const capture = await evaluateSurface(page, transport, "captureSelectionForNote");
  const annotationCountBefore = Number((await evaluateSurface(page, transport, "snapshot")).summary.annotationCount || 0);
  await evaluateSurface(page, transport, "addNoteToSelection", [`phase4-${transport}-note`]);
  await page.waitForFunction(
    ({ transport, annotationCountBefore }) => {
      const frame = document.querySelector("#protectedOldShellFrame");
      const win = frame && frame.contentWindow ? frame.contentWindow : null;
      const surface = !win
        ? null
        : transport === "adapter"
          ? win.__PROTECTED_READER_COMPAT_ADAPTER__ || null
          : win.__PROTECTED_READER_BRIDGE__ || null;
      const summary = surface && typeof surface.getSummary === "function" ? surface.getSummary() : null;
      return !!summary && Number(summary.annotationCount || 0) > annotationCountBefore;
    },
    { transport, annotationCountBefore },
    { timeout: 5000 }
  );
  const annotationCountAfter = Number((await evaluateSurface(page, transport, "snapshot")).summary.annotationCount || 0);

  await evaluateSurface(page, transport, "searchBook", ["the"]);
  await page.waitForFunction(
    ({ transport }) => {
      const frame = document.querySelector("#protectedOldShellFrame");
      const win = frame && frame.contentWindow ? frame.contentWindow : null;
      const surface = !win
        ? null
        : transport === "adapter"
          ? win.__PROTECTED_READER_COMPAT_ADAPTER__ || null
          : win.__PROTECTED_READER_BRIDGE__ || null;
      const results = surface && typeof surface.getSearchResults === "function"
        ? surface.getSearchResults()
        : null;
      const list = results && Array.isArray(results.results) ? results.results : [];
      const summary = surface && typeof surface.getSummary === "function" ? surface.getSummary() : null;
      const search = summary && summary.searchSummary ? summary.searchSummary : null;
      return !!(
        (list.length > 0) ||
        (search && (Number(search.matchCount || 0) > 0 || Number(search.totalMatches || 0) > 0))
      );
    },
    { transport },
    { timeout: 5000 }
  );
  const searchResults = await evaluateSurface(page, transport, "getSearchResults");
  await evaluateSurface(page, transport, "searchNextResult");
  const afterSearchNext = await evaluateSurface(page, transport, "snapshot");
  await evaluateSurface(page, transport, "clearSearch");
  await page.waitForFunction(
    ({ transport }) => {
      const frame = document.querySelector("#protectedOldShellFrame");
      const win = frame && frame.contentWindow ? frame.contentWindow : null;
      const surface = !win
        ? null
        : transport === "adapter"
          ? win.__PROTECTED_READER_COMPAT_ADAPTER__ || null
          : win.__PROTECTED_READER_BRIDGE__ || null;
      const summary = surface && typeof surface.getSummary === "function" ? surface.getSummary() : null;
      const search = summary && summary.searchSummary ? summary.searchSummary : null;
      return !!summary && !(search && search.active);
    },
    { transport },
    { timeout: 5000 }
  );

  const sharePayload = await evaluateSurface(page, transport, "exportNotesSharePayload");
  const readAloud = await evaluateSurface(page, transport, "getReadAloudPayload");

  const result = {
    transport,
    summary: initialSummary,
    compatInfo: initial.compatInfo || null,
    surfaceKeys: initial.surfaceKeys || [],
    frameInfo: initial.frameInfo || null,
    nextChanged: getPageKey(afterNext.summary || null) !== initialPageKey,
    prevRestored: getPageKey(afterPrev.summary || null) === initialPageKey,
    darkThemeApplied: !!(darkSummary.summary && darkSummary.summary.theme === "dark"),
    selectionCaptured: !!(capture && capture.hasSelection),
    annotationCountBefore,
    annotationCountAfter,
    searchMatchCount: Array.isArray(searchResults && searchResults.results)
      ? searchResults.results.length
      : Number(
          searchResults && searchResults.matchCount
            ? searchResults.matchCount
            : afterSearchNext.summary &&
                afterSearchNext.summary.searchSummary &&
                Number.isFinite(Number(afterSearchNext.summary.searchSummary.totalMatches))
              ? afterSearchNext.summary.searchSummary.totalMatches
              : 0
        ),
    searchActiveAfterNext: !!(
      afterSearchNext.summary &&
      afterSearchNext.summary.searchSummary &&
      afterSearchNext.summary.searchSummary.active
    ),
    sharePayloadShape: {
      bookId: sharePayload && sharePayload.bookId ? String(sharePayload.bookId) : "",
      productionNotes: Array.isArray(sharePayload && sharePayload.productionNotes)
        ? sharePayload.productionNotes.length
        : -1,
      sharePayloadVersion:
        sharePayload && sharePayload.sharePayload ? Number(sharePayload.sharePayload.v || 0) : 0
    },
    readAloudTextLength: readAloud && readAloud.text ? String(readAloud.text).length : 0,
    debugRequests
  };

  await page.close();
  return result;
}

function assertScenario(result) {
  if (!result || !result.summary || !result.summary.ready) {
    throw new Error(`Scenario did not reach ready state for transport ${result && result.transport ? result.transport : "unknown"}.`);
  }
  if (result.summary.compatTransport !== result.transport) {
    throw new Error(`Compat transport mismatch: expected ${result.transport}, got ${result.summary.compatTransport || "unknown"}.`);
  }
  if (!result.nextChanged || !result.prevRestored) {
    throw new Error(`Navigation parity failed for transport ${result.transport}.`);
  }
  if (!result.darkThemeApplied) {
    throw new Error(`Theme parity failed for transport ${result.transport}.`);
  }
  if (!result.selectionCaptured || !(result.annotationCountAfter > result.annotationCountBefore)) {
    throw new Error(`Selection/note parity failed for transport ${result.transport}.`);
  }
  if (!(result.searchMatchCount > 0) || !result.searchActiveAfterNext) {
    throw new Error(`Search parity failed for transport ${result.transport}.`);
  }
  if (!result.sharePayloadShape.bookId || result.sharePayloadShape.sharePayloadVersion <= 0) {
    throw new Error(`Share/export parity failed for transport ${result.transport}.`);
  }
  if (!(result.readAloudTextLength > 0)) {
    throw new Error(`Read-aloud payload missing for transport ${result.transport}.`);
  }
  if (result.frameInfo && result.frameInfo.textLength > 0) {
    throw new Error(`Hidden DOM text regression detected for transport ${result.transport}.`);
  }
  if (Array.isArray(result.debugRequests) && result.debugRequests.length) {
    throw new Error(`Unexpected /debug/ request detected for transport ${result.transport}.`);
  }
}

function compareParity(bridgeResult, adapterResult) {
  const invariants = [
    ["bookId", bridgeResult.summary.bookId, adapterResult.summary.bookId],
    ["globalPageCount", Number(bridgeResult.summary.globalPageCount || 0), Number(adapterResult.summary.globalPageCount || 0)],
    ["supportedFontModes", JSON.stringify(bridgeResult.summary.supportedFontModes || []), JSON.stringify(adapterResult.summary.supportedFontModes || [])],
    ["searchMatchCount>0", bridgeResult.searchMatchCount > 0, adapterResult.searchMatchCount > 0],
    ["sharePayloadBookId", bridgeResult.sharePayloadShape.bookId, adapterResult.sharePayloadShape.bookId],
    ["sharePayloadVersion", bridgeResult.sharePayloadShape.sharePayloadVersion, adapterResult.sharePayloadShape.sharePayloadVersion]
  ];
  for (const [label, left, right] of invariants) {
    if (left !== right) {
      throw new Error(`Adapter parity mismatch for ${label}: ${left} vs ${right}`);
    }
  }
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });
  try {
    const bridgeResult = await runScenario(browser, BRIDGE_URL);
    assertScenario(bridgeResult);
    const adapterResult = await runScenario(browser, ADAPTER_URL);
    assertScenario(adapterResult);
    compareParity(bridgeResult, adapterResult);
    console.log(JSON.stringify({ ok: true, bridgeResult, adapterResult }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
