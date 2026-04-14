#!/usr/bin/env node

const { chromium } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

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
      text: readerFrame ? (readerFrame.textContent || "").trim() : ""
    };
  });
}

async function selectRangeInEmbeddedFrame(page) {
  const automationSelected = await page.evaluate(async () => {
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
    const surface = win ? (win.__PROTECTED_READER_COMPAT_ADAPTER__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
    if (!surface || typeof surface.selectAutomationSample !== "function") return false;
    try {
      await surface.selectAutomationSample();
      const summary = surface.getSummary ? surface.getSummary() : null;
      return !!(summary && summary.selectionActive && Number(summary.selectedChars || 0) > 1);
    } catch (_error) {
      return false;
    }
  });
  if (automationSelected) return;
  await page.waitForFunction(() => {
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
    const surface = win ? (win.__PROTECTED_READER_COMPAT_ADAPTER__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
    const debug = surface && typeof surface.getDebugLayoutState === "function"
      ? surface.getDebugLayoutState()
      : null;
    return !!(debug && debug.ready && Array.isArray(debug.lines) && debug.lines.length);
  }, {}, { timeout: 10000 });
  const attempts = await page.evaluate(() => {
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
    const surface = win ? (win.__PROTECTED_READER_COMPAT_ADAPTER__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
    const debug = surface && typeof surface.getDebugLayoutState === "function"
      ? surface.getDebugLayoutState()
      : null;
    const host = directRoot || frame;
    const rect = host ? host.getBoundingClientRect() : null;
    const lines = debug && Array.isArray(debug.lines) ? debug.lines : [];
    const candidates = lines.filter((line) => {
      const y = Number(line.y || 0);
      const width = Number(line.width || 0);
      return width > 220 && y > 80;
    });
    if (!rect || candidates.length < 2) return [];
    return candidates.slice(0, 6).map((start, index) => {
      const end = candidates[Math.min(index + 1, candidates.length - 1)];
      return {
        startX: Math.round(rect.left + Number(start.x || 0) + 16),
        startY: Math.round(rect.top + Number(start.y || 0) + Math.max(8, Math.min(18, Number(start.height || 18) / 2))),
        endX: Math.round(rect.left + Math.max(Number(end.x || 0) + 140, Number(end.x || 0) + Number(end.width || 0) - 16)),
        endY: Math.round(rect.top + Number(end.y || 0) + Math.max(8, Math.min(18, Number(end.height || 18) / 2)))
      };
    });
  });
  if (!attempts.length) {
    throw new Error("selection geometry unavailable");
  }
  for (const geometry of attempts) {
    await page.mouse.move(geometry.startX, geometry.startY);
    await page.mouse.down();
    await page.mouse.move(geometry.endX, geometry.endY, { steps: 20 });
    await page.mouse.up();
    const selected = await page.evaluate(() => {
      const directRoot = document.querySelector("#protectedDirectReaderRoot");
      const frame = document.querySelector("#protectedOldShellFrame");
      const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
      const surface = win ? (win.__PROTECTED_READER_COMPAT_ADAPTER__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
      const summary = surface && surface.getSummary ? surface.getSummary() : null;
      return !!(summary && summary.selectionActive && Number(summary.selectedChars || 0) > 1);
    });
    if (selected) return;
  }
  throw new Error("selection drag did not activate selection");
}

async function main() {
  const mark = (step) => console.error(`[old-shell] ${step}`);
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

  const oldShellPresent = await page.evaluate(() => {
    return !!(
      document.querySelector("#titlebar") &&
      document.querySelector("#overlay-menu") &&
      document.querySelector("#openNotes") &&
      document.querySelector("#viewerStack")
    );
  });

  let summary = await getBridgeSummary(page);
  const initialPage = summary ? summary.pageLabel : "n/a";
  const initialAnnotations = summary ? summary.annotationCount : -1;

  mark("frame-select");
  await selectRangeInEmbeddedFrame(page);
  await page.waitForFunction(() => {
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
    const surface = win ? (win.__PROTECTED_READER_COMPAT_ADAPTER__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
    const summary = surface && surface.getSummary ? surface.getSummary() : null;
    return !!(summary && summary.selectionActive);
  }, {}, { timeout: 5000 });

  mark("copy");
  await page.evaluate(async () => {
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
    const surface = win ? (win.__PROTECTED_READER_COMPAT_ADAPTER__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
    if (!surface || typeof surface.copySelection !== "function") throw new Error("copySelection surface missing");
    await surface.copySelection();
  });
  await page.waitForFunction(() => {
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
    const surface = win ? (win.__PROTECTED_READER_COMPAT_ADAPTER__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
    const summary = surface && surface.getSummary ? surface.getSummary() : null;
    return !!(summary && /Copied selection/.test(summary.statusText || ""));
  }, {}, { timeout: 5000 });

  mark("highlight");
  await page.evaluate(async () => {
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
    const surface = win ? (win.__PROTECTED_READER_COMPAT_ADAPTER__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
    if (!surface || typeof surface.createHighlight !== "function") throw new Error("createHighlight surface missing");
    await surface.createHighlight();
  });
  await page.waitForFunction(() => {
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
    const surface = win ? (win.__PROTECTED_READER_COMPAT_ADAPTER__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
    const summary = surface && surface.getSummary ? surface.getSummary() : null;
    return !!(summary && /Created highlight/.test(summary.statusText || ""));
  }, {}, { timeout: 5000 });

  mark("note");
  await page.evaluate(async () => {
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
    const surface = win ? (win.__PROTECTED_READER_COMPAT_ADAPTER__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
    if (!surface || typeof surface.addNoteToSelection !== "function") throw new Error("addNoteToSelection surface missing");
    await surface.addNoteToSelection("old shell host note");
  });
  await page.waitForFunction(() => {
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
    const surface = win ? (win.__PROTECTED_READER_COMPAT_ADAPTER__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
    const summary = surface && surface.getSummary ? surface.getSummary() : null;
    return !!(summary && /Added note/.test(summary.statusText || ""));
  }, {}, { timeout: 5000 });

  summary = await getBridgeSummary(page);
  const afterNoteAnnotations = summary.annotationCount;

  mark("open-notes");
  await page.evaluate(() => document.querySelector("#protectedLibraryTrigger")?.click());
  await page.waitForFunction(() => !document.querySelector("#overlay-library")?.classList.contains("hidden"));
  await page.evaluate(() => document.querySelector("#protectedLibraryTab-notes")?.click());
  await page.waitForFunction(() => !document.querySelector("#protectedLibraryPane-notes")?.classList.contains("hidden"));
  mark("read-notes");
  const notesState = await page.evaluate(() => ({
    count: document.querySelectorAll("#notes li").length,
    hasBookmarkLink: !!document.querySelector("#notes .bookmark_link"),
    hasBookmarkComment: !!document.querySelector("#notes .bookmark-comment")
  }));
  await page.evaluate(() => document.querySelector("#overlay-library .overlay-close")?.click());
  await page.waitForFunction(() => document.querySelector("#overlay-library")?.classList.contains("hidden"));

  mark("next");
  const previousPageLabel = summary ? summary.globalPageLabel || summary.pageLabel : "";
  const previousChunkOrder = summary ? Number(summary.chunkOrder || 0) : 0;
  await page.click("#next");
  await page.waitForFunction(({ expectedLabel, expectedChunkOrder }) => {
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
    const surface = win ? (win.__PROTECTED_READER_COMPAT_ADAPTER__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
    const summary = surface && surface.getSummary ? surface.getSummary() : null;
    return !!(
      summary &&
      (
        (summary.globalPageLabel || summary.pageLabel || "") !== expectedLabel ||
        Number(summary.chunkOrder || 0) !== expectedChunkOrder
      )
    );
  }, { expectedLabel: previousPageLabel, expectedChunkOrder: previousChunkOrder }, { timeout: 5000 });
  const afterNext = await getBridgeSummary(page);
  if (
    !afterNext ||
    (
      (afterNext.globalPageLabel || afterNext.pageLabel || "") === previousPageLabel &&
      Number(afterNext.chunkOrder || 0) === previousChunkOrder
    )
  ) {
    throw new Error("Next-page transition did not change global page label or chunk order.");
  }

  mark("prev");
  await page.click("#prev");
  await page.waitForFunction(({ expectedLabel, expectedChunkOrder }) => {
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
    const surface = win ? (win.__PROTECTED_READER_COMPAT_ADAPTER__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
    const summary = surface && surface.getSummary ? surface.getSummary() : null;
    return !!(
      summary &&
      (summary.globalPageLabel || summary.pageLabel || "") === expectedLabel &&
      Number(summary.chunkOrder || 0) === expectedChunkOrder
    );
  }, { expectedLabel: previousPageLabel, expectedChunkOrder: previousChunkOrder }, { timeout: 5000 });
  const afterPrev = await getBridgeSummary(page);

  mark("reload");
  await page.reload({ waitUntil: "domcontentloaded" });
  mark("wait-host-ready-reload");
  await waitForHostReady(page);
  const afterReload = await getBridgeSummary(page);

  mark("reopen");
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  mark("wait-host-ready-reopen");
  await waitForHostReady(page);
  const afterReopen = await getBridgeSummary(page);

  mark("security");
  const security = await frameInfo(page);

  mark("goto-old");
  await page.goto(OLD_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!document.querySelector("#viewerStack"));
  const oldRouteState = await page.evaluate(() => ({
    hasProtectedHost: !!document.querySelector("#protectedOldShellFrame"),
    hasViewerStack: !!document.querySelector("#viewerStack"),
    oldTextVisible: !!((document.querySelector("#viewer")?.textContent || "").trim().length)
  }));

  console.log(JSON.stringify({
    ok: true,
    route: URL,
    oldShellPresent,
    protectedEngineActive: !!(summary && summary.readerMode === "protected"),
    embeddedMode: !!(summary && summary.embeddedMode),
    driveBlocking: false,
    driveStatus: summary ? summary.driveStatus : null,
    initialPage,
    afterNoteAnnotations,
    afterNextPage: afterNext ? afterNext.pageLabel : "n/a",
    afterPrevPage: afterPrev ? afterPrev.pageLabel : "n/a",
    afterReloadPage: afterReload ? afterReload.pageLabel : "n/a",
    afterReopenPage: afterReopen ? afterReopen.pageLabel : "n/a",
    initialAnnotations,
    notesState,
    afterPrevAnnotations: afterPrev ? afterPrev.annotationCount : -1,
    afterReloadAnnotations: afterReload ? afterReload.annotationCount : -1,
    afterReopenAnnotations: afterReopen ? afterReopen.annotationCount : -1,
    frameInfo: security,
    debugRequests,
    oldRouteState
  }, null, 2));

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
