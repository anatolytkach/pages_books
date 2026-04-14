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

function isVisibleInPage(selector) {
  return ({ selector }) => {
    const node = document.querySelector(selector);
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return (
      !node.hidden &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity || 1) > 0 &&
      rect.width > 0 &&
      rect.height > 0
    );
  };
}

async function collectProtectedState(page) {
  return await page.evaluate(() => {
    const adapter = window.__PROTECTED_READER_COMPAT_ADAPTER__ || null;
    const summary = adapter && typeof adapter.getSummary === "function" ? adapter.getSummary() : null;
    const compatInfo = adapter && typeof adapter.getCompatInfo === "function" ? adapter.getCompatInfo() : null;
    const supportedEvents = adapter && typeof adapter.getSupportedEvents === "function"
      ? adapter.getSupportedEvents()
      : [];
    const visible = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return (
        !node.hidden &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity || 1) > 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    return {
      hasAdapter: !!adapter,
      hasBridge: !!window.__PROTECTED_READER_BRIDGE__,
      summary,
      compatInfo,
      supportedEvents,
      diagnosticsPresent: {
        runtimeMeta: !!document.querySelector("#runtime-meta"),
        selectionMeta: !!document.querySelector("#selection-meta"),
        status: !!document.querySelector("#status")
      },
      visibleHarness: {
        sidebar: visible(".sidebar"),
        controls: visible(".controls-card"),
        annotations: visible(".annotations-card"),
        debugGeometry: visible("#debug-geometry"),
        artifactForm: visible("#artifact-form")
      },
      readerFrameText: (document.querySelector(".reader-frame")?.textContent || "").trim(),
      readerCardVisible: visible(".reader-card"),
      runtimeMetaRows: document.querySelectorAll("#runtime-meta dt").length
    };
  });
}

async function collectOldShellState(page) {
  return await page.evaluate(() => {
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
    const adapter = win ? win.__PROTECTED_READER_COMPAT_ADAPTER__ || null : null;
    const summary = adapter && typeof adapter.getSummary === "function" ? adapter.getSummary() : null;
    return {
      hasDirectRoot: !!directRoot,
      hasFrame: !!frame,
      hasAdapter: !!adapter,
      hasBridge: !!(win && win.__PROTECTED_READER_BRIDGE__),
      summary
    };
  });
}

async function collectUnprotectedState(page) {
  return await page.evaluate(() => ({
    hasViewerStack: !!document.querySelector("#viewerStack"),
    hasProtectedHost: !!document.querySelector("#protectedOldShellFrame"),
    hasProtectedDirectRoot: !!document.querySelector("#protectedDirectReaderRoot"),
    debugVisible: !!document.querySelector("[href*='/debug/'], [src*='/debug/']"),
    bodyTheme: document.body ? document.body.className : ""
  }));
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });

  const protectedPage = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const protectedDebugRequests = [];
  protectedPage.on("request", (request) => {
    if (request.url().includes("/debug/")) protectedDebugRequests.push(request.url());
  });
  await protectedPage.goto(PROTECTED_URL, { waitUntil: "domcontentloaded" });
  await protectedPage.waitForFunction(() => !!window.__PROTECTED_READER_COMPAT_ADAPTER__ && !!document.querySelector("#reader-canvas"), {}, { timeout: 15000 });
  await protectedPage.waitForTimeout(500);
  const protectedState = await collectProtectedState(protectedPage);
  await protectedPage.close();

  const oldShellPage = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const oldShellDebugRequests = [];
  oldShellPage.on("request", (request) => {
    if (request.url().includes("/debug/")) oldShellDebugRequests.push(request.url());
  });
  await oldShellPage.goto(OLD_SHELL_URL, { waitUntil: "domcontentloaded" });
  await oldShellPage.waitForFunction(() => {
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
    const adapter = win ? win.__PROTECTED_READER_COMPAT_ADAPTER__ || null : null;
    const summary = adapter && typeof adapter.getSummary === "function" ? adapter.getSummary() : null;
    return !!(adapter && summary && summary.ready);
  }, {}, { timeout: 20000 });
  const oldShellState = await collectOldShellState(oldShellPage);
  await oldShellPage.close();

  const oldPage = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await oldPage.goto(OLD_URL, { waitUntil: "domcontentloaded" });
  await oldPage.waitForFunction(() => !!document.querySelector("#viewerStack"), {}, { timeout: 15000 });
  await oldPage.waitForTimeout(300);
  const oldState = await collectUnprotectedState(oldPage);
  await oldPage.close();

  await browser.close();

  const exactBlockers = [];
  if (!protectedState.hasAdapter) exactBlockers.push("protected-adapter-missing");
  if (protectedState.hasBridge) exactBlockers.push("protected-bridge-surface-present");
  if (!protectedState.summary || !protectedState.summary.ready) exactBlockers.push("protected-summary-not-ready");
  if (String((protectedState.summary && protectedState.summary.compatTransport) || "") !== "adapter") {
    exactBlockers.push("protected-transport-not-adapter");
  }
  if (!protectedState.readerCardVisible) exactBlockers.push("protected-reader-card-hidden");
  if (protectedState.readerFrameText) exactBlockers.push("protected-dom-text-leakage");
  if (protectedState.visibleHarness.sidebar) exactBlockers.push("visible-sidebar-harness");
  if (protectedState.visibleHarness.controls) exactBlockers.push("visible-controls-harness");
  if (protectedState.visibleHarness.annotations) exactBlockers.push("visible-annotations-harness");
  if (protectedState.visibleHarness.debugGeometry) exactBlockers.push("visible-debug-geometry-control");
  if (protectedState.visibleHarness.artifactForm) exactBlockers.push("visible-artifact-form");
  if (!protectedState.diagnosticsPresent.runtimeMeta) exactBlockers.push("runtime-meta-missing");
  if (!protectedState.diagnosticsPresent.selectionMeta) exactBlockers.push("selection-meta-missing");
  if (!protectedState.diagnosticsPresent.status) exactBlockers.push("status-node-missing");
  if (!Array.isArray(protectedState.supportedEvents) || !protectedState.supportedEvents.includes("pageChanged")) {
    exactBlockers.push("canonical-events-missing");
  }
  if (
    !protectedState.compatInfo ||
    typeof protectedState.compatInfo !== "object" ||
    !Array.isArray(protectedState.compatInfo.implementedMethods) ||
    !protectedState.compatInfo.implementedMethods.includes("getDebugLayoutState")
  ) {
    exactBlockers.push("debug-layout-diagnostic-missing");
  }
  if (protectedDebugRequests.length) exactBlockers.push("protected-debug-requests-present");

  if (!oldShellState.hasDirectRoot) exactBlockers.push("old-shell-direct-root-missing");
  if (oldShellState.hasFrame) exactBlockers.push("old-shell-frame-still-present");
  if (!oldShellState.hasAdapter) exactBlockers.push("old-shell-adapter-missing");
  if (oldShellState.hasBridge) exactBlockers.push("old-shell-bridge-present");
  if (!oldShellState.summary || !oldShellState.summary.ready) exactBlockers.push("old-shell-summary-not-ready");
  if (oldShellDebugRequests.length) exactBlockers.push("old-shell-debug-requests-present");

  if (!oldState.hasViewerStack) exactBlockers.push("unprotected-viewer-stack-missing");
  if (oldState.hasProtectedHost) exactBlockers.push("unprotected-protected-host-leak");
  if (oldState.hasProtectedDirectRoot) exactBlockers.push("unprotected-direct-root-leak");
  if (oldState.debugVisible) exactBlockers.push("unprotected-debug-link-visible");

  const result = {
    ok: exactBlockers.length === 0,
    diagnosticsMinimumPreserved: exactBlockers.every((item) => ![
      "runtime-meta-missing",
      "selection-meta-missing",
      "status-node-missing",
      "canonical-events-missing",
      "debug-layout-diagnostic-missing"
    ].includes(item)),
    hiddenHarnessLeakDetected: exactBlockers.some((item) => item.startsWith("visible-")),
    exactBlockers,
    warnings: [],
    protected: protectedState,
    oldShell: oldShellState,
    unprotected: oldState,
    debugRequests: {
      protected: protectedDebugRequests,
      oldShell: oldShellDebugRequests
    }
  };

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
