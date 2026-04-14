#!/usr/bin/env node

const { chromium } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

function getArgValue(name, fallback = "") {
  for (const item of process.argv.slice(2)) {
    if (item.startsWith(`--${name}=`)) return item.slice(name.length + 3);
  }
  return fallback;
}

const DEFAULT_URL =
  getArgValue("url") ||
  "http://127.0.0.1:8788/reader/?id=19686";
const ROLLBACK_URL =
  getArgValue("rollback-url") ||
  "http://127.0.0.1:8788/reader/?id=19686&unprotectedRuntime=legacy";
const EXECUTABLE_PATH =
  getArgValue("executable-path") ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function classifyNetworkIssues(items) {
  const blockers = [];
  const warnings = [];
  for (const item of items || []) {
    var text = String(item || "");
    if (/favicon\.ico/i.test(text)) continue;
    if (/\/META-INF\/container\.xml/i.test(text)) {
      warnings.push(`expected-manual-fallback:${text}`);
      continue;
    }
    blockers.push(text);
  }
  return { blockers, warnings };
}

async function launchBrowser() {
  return chromium.launch({
    headless: true,
    executablePath: EXECUTABLE_PATH
  });
}

async function inspectDefault(page, url) {
  const pageErrors = [];
  const networkIssues = [];
  page.on("pageerror", (error) => {
    pageErrors.push(String(error && error.message ? error.message : error));
  });
  page.on("response", (response) => {
    try {
      if (Number(response.status()) >= 400) {
        networkIssues.push(`${response.status()}:${response.url()}`);
      }
    } catch (_error) {}
  });

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    return !!(
      window.__readerpubUnprotectedRuntimePath &&
      (
        window.__readerpubUnprotectedRuntimePath === "new" ||
        window.__readerpubUnprotectedRuntimePath === "legacy"
      )
    );
  }, { timeout: 20000 });
  await page.waitForTimeout(1600);

  const payload = await page.evaluate(() => {
    const state = window.__READERPUB_UNPROTECTED_RUNTIME_STATE__ || null;
    const adapter = window.__READERPUB_UNPROTECTED_RUNTIME_ADAPTER__ || null;
    const directRoot = document.querySelector("[data-readerpub-unprotected-runtime-root='true']");
    const path = String(window.__readerpubUnprotectedRuntimePath || "unknown");
    const iframeCount = document.querySelectorAll("#viewer iframe, #viewer-prev iframe, #viewer-next iframe, #viewerStack iframe").length;
    return JSON.parse(JSON.stringify({
      runtimePath: path,
      iframeCount,
      hiddenIframeUseDetected: iframeCount > 0 || path !== "new",
      newRuntimeActive: !!(path === "new" && adapter && state && state.status === "ready"),
      directRootPresent: !!directRoot,
      pageCount: String(document.querySelector("#page-count")?.textContent || "").trim(),
      stateStatus: state && state.status ? String(state.status) : "",
      rollbackMarkerPresent: String(document.body.getAttribute("data-unprotected-runtime-rollback") || "") === "true",
      legacyPathStillDefault: path === "legacy"
    }));
  });

  payload.pageErrors = pageErrors.slice();
  payload.networkIssues = networkIssues.filter((item) => !/favicon\.ico/i.test(String(item || "")));
  return payload;
}

async function inspectRollback(page, url) {
  const pageErrors = [];
  const networkIssues = [];
  page.on("pageerror", (error) => {
    pageErrors.push(String(error && error.message ? error.message : error));
  });
  page.on("response", (response) => {
    try {
      if (Number(response.status()) >= 400) {
        networkIssues.push(`${response.status()}:${response.url()}`);
      }
    } catch (_error) {}
  });

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    return !!(
      window.__readerpubUnprotectedRuntimePath &&
      (
        window.__readerpubUnprotectedRuntimePath === "new" ||
        window.__readerpubUnprotectedRuntimePath === "legacy"
      )
    );
  }, { timeout: 20000 });
  await page.waitForTimeout(1600);

  const payload = await page.evaluate(() => {
    const path = String(window.__readerpubUnprotectedRuntimePath || "unknown");
    const iframeCount = document.querySelectorAll("#viewer iframe, #viewer-prev iframe, #viewer-next iframe, #viewerStack iframe").length;
    const hasLegacyReader = !!(window.reader && window.reader.rendition);
    return JSON.parse(JSON.stringify({
      runtimePath: path,
      iframeCount,
      hasLegacyReader,
      rollbackMarkerPresent: String(document.body.getAttribute("data-unprotected-runtime-rollback") || "") === "true"
    }));
  });
  payload.pageErrors = pageErrors.slice();
  payload.networkIssues = networkIssues.filter((item) => !/favicon\.ico/i.test(String(item || "")));
  return payload;
}

(async () => {
  const browser = await launchBrowser();
  const defaultPage = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const rollbackPage = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

  try {
    const defaultState = await inspectDefault(defaultPage, DEFAULT_URL);
    const rollbackState = await inspectRollback(rollbackPage, ROLLBACK_URL);
    const defaultNetwork = classifyNetworkIssues(defaultState.networkIssues);
    const rollbackNetwork = classifyNetworkIssues(rollbackState.networkIssues);

    const blockers = [];
    const warnings = defaultNetwork.warnings.concat(rollbackNetwork.warnings);

    if (defaultState.runtimePath !== "new") blockers.push("default-runtime-not-new");
    if (defaultState.iframeCount !== 0) blockers.push("default-iframe-present");
    if (defaultState.hiddenIframeUseDetected) blockers.push("default-hidden-iframe-use");
    if (!defaultState.newRuntimeActive) blockers.push("default-new-runtime-inactive");
    if (!defaultState.directRootPresent) blockers.push("default-direct-root-missing");
    if (defaultState.legacyPathStillDefault) blockers.push("legacy-still-default");
    if (defaultState.rollbackMarkerPresent) blockers.push("default-marked-as-rollback");
    if (Array.isArray(defaultState.pageErrors) && defaultState.pageErrors.length) blockers.push("default-page-errors");
    if (defaultNetwork.blockers.length) blockers.push("default-network-errors");

    if (rollbackState.runtimePath !== "legacy") blockers.push("rollback-runtime-not-legacy");
    if (!rollbackState.rollbackMarkerPresent) blockers.push("rollback-marker-missing");
    if (!rollbackState.hasLegacyReader) blockers.push("rollback-reader-missing");
    if (rollbackState.iframeCount < 1) warnings.push("rollback-has-no-visible-iframe-yet");
    if (Array.isArray(rollbackState.pageErrors) && rollbackState.pageErrors.length) blockers.push("rollback-page-errors");
    if (rollbackNetwork.blockers.length) blockers.push("rollback-network-errors");

    const result = {
      ok: blockers.length === 0,
      defaultRuntimePath: defaultState.runtimePath || "unknown",
      iframeCount: Number(defaultState.iframeCount || 0),
      hiddenIframeUseDetected: !!defaultState.hiddenIframeUseDetected,
      newRuntimeActive: !!defaultState.newRuntimeActive,
      rollbackPathPresent: rollbackState.runtimePath === "legacy" && !!rollbackState.hasLegacyReader,
      rollbackPathExplicit: !!rollbackState.rollbackMarkerPresent,
      legacyPathStillDefault: !!defaultState.legacyPathStillDefault,
      blockers,
      warnings,
      defaultRoute: {
        url: DEFAULT_URL,
        state: defaultState
      },
      rollbackRoute: {
        url: ROLLBACK_URL,
        state: rollbackState
      }
    };

    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
  } finally {
    await defaultPage.close();
    await rollbackPage.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
