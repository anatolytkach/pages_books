#!/usr/bin/env node

const { chromium } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

function getArgValue(name, fallback = "") {
  for (const item of process.argv.slice(2)) {
    if (item.startsWith(`--${name}=`)) return item.slice(name.length + 3);
  }
  return fallback;
}

function parseCsv(input, fallback = []) {
  const raw = String(input || "").trim();
  const source = raw ? raw.split(",") : fallback;
  return [...new Set(source.map((item) => String(item || "").trim()).filter(Boolean))];
}

function classifyReaderPath(urlString) {
  try {
    const url = new URL(String(urlString || ""), "https://reader.pub");
    const path = String(url.pathname || "");
    if (path === "/books/reader_new/" || path === "/reader_new/") return "new";
    if (path === "/books/reader1/" || path === "/reader1/" || path === "/books/reader/" || path === "/reader/") return "old";
  } catch (_error) {}
  return "unknown";
}

async function launchBrowser(executablePath) {
  return chromium.launch({
    headless: true,
    executablePath
  });
}

async function inspectCatalog(page, catalogUrl, protectedIds, unprotectedIds, controlIds) {
  await page.goto(catalogUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    return !!(
      window.ReaderPubCatalogReaderRouting &&
      typeof window.ReaderPubCatalogReaderRouting.resolveReaderUrl === "function"
    );
  }, { timeout: 20000 });
  await page.waitForTimeout(1200);

  return page.evaluate(({ protectedIds, unprotectedIds, controlIds }) => {
    const api = window.ReaderPubCatalogReaderRouting;
    const allIds = [...protectedIds, ...unprotectedIds, ...controlIds];
    const resolved = {};
    allIds.forEach((id) => {
      const source = protectedIds.includes(id) ? "" : "gutenberg";
      resolved[id] = api.resolveReaderUrl(id, source, "", "catalog");
    });
    const heroLinks = {};
    document.querySelectorAll("[data-reader-link='true'][data-book-id]").forEach((link) => {
      const id = String(link.getAttribute("data-book-id") || "").trim();
      if (!id) return;
      heroLinks[id] = String(link.getAttribute("href") || "");
    });
    return JSON.parse(JSON.stringify({
      allowlist: api.getAllowlist(),
      config: api.getConfig(),
      resolved,
      heroLinks
    }));
  }, { protectedIds, unprotectedIds, controlIds });
}

async function inspectUnprotected(page, url) {
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(String(error && error.message ? error.message : error));
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    return String(window.__readerpubUnprotectedRuntimePath || "") === "new";
  }, { timeout: 20000 });
  await page.waitForTimeout(1200);
  return page.evaluate((pageErrors) => {
    const state = window.__READERPUB_UNPROTECTED_RUNTIME_STATE__ || {};
    const iframeCount = document.querySelectorAll("#viewer iframe, #viewer-prev iframe, #viewer-next iframe, #viewerStack iframe").length;
    return JSON.parse(JSON.stringify({
      finalUrl: window.location.href,
      runtimePath: String(window.__readerpubUnprotectedRuntimePath || ""),
      iframeCount,
      ready: String(state.status || "") === "ready",
      pageCount: String(document.querySelector("#page-count")?.textContent || "").trim(),
      pageErrors
    }));
  }, pageErrors.slice());
}

async function inspectProtected(page, url) {
  const debugRequests = [];
  page.on("request", (req) => {
    if (req.url().includes("/debug/")) debugRequests.push(req.url());
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const pathMatch = /\/reader_render_v3\/integration\/protected-reader(?:\.html)?$/.test(window.location.pathname);
    const hasProtectedUi = !!document.querySelector("#runtime-meta") || !!document.querySelector("#reader-canvas");
    const statusText = String(document.querySelector("#status")?.textContent || "").trim();
    return pathMatch && (hasProtectedUi || /Opened |Protected mode is unavailable/.test(statusText));
  }, { timeout: 30000 });
  await page.waitForTimeout(1000);
  return page.evaluate((debugRequests) => {
    return JSON.parse(JSON.stringify({
      finalUrl: window.location.href,
      pathname: window.location.pathname,
      hasRuntimeMeta: !!document.querySelector("#runtime-meta"),
      hasProtectedCanvas: !!document.querySelector("#reader-canvas"),
      readerMode: document.documentElement?.dataset?.readerMode || "",
      debugRequests
    }));
  }, debugRequests.slice());
}

async function inspectControl(page, url) {
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(String(error && error.message ? error.message : error));
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  return page.evaluate((pageErrors) => {
    return JSON.parse(JSON.stringify({
      finalUrl: window.location.href,
      pathname: window.location.pathname,
      hasViewer: !!document.querySelector("#viewer") || !!document.querySelector("#viewerStack") || !!document.querySelector(".viewer"),
      iframeCount: document.querySelectorAll("iframe").length,
      pageErrors
    }));
  }, pageErrors.slice());
}

(async () => {
  const catalogUrl = getArgValue("catalog-url") || "http://127.0.0.1:8788/books/";
  const executablePath =
    getArgValue("executable-path") ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const protectedIds = parseCsv(getArgValue("protected-ids"), ["19686", "45"]);
  const unprotectedIds = parseCsv(getArgValue("unprotected-ids"), ["11", "84", "1342"]);
  const controlIds = parseCsv(getArgValue("control-ids"), ["1661", "2701"]);

  const browser = await launchBrowser(executablePath);
  const blockers = [];
  const warnings = [];

  try {
    const catalogPage = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
    const catalogState = await inspectCatalog(catalogPage, catalogUrl, protectedIds, unprotectedIds, controlIds);
    await catalogPage.close();

    const routedToNew = [];
    const stayedOnOld = [];
    const wrongRoutes = [];

    function recordExpectation(id, url, expectedKind, label) {
      const actualKind = classifyReaderPath(url);
      if (actualKind === "new") routedToNew.push(`${label}:${id}`);
      if (actualKind === "old") stayedOnOld.push(`${label}:${id}`);
      if (actualKind !== expectedKind) wrongRoutes.push(`${label}:${id}:${actualKind}:${url}`);
    }

    protectedIds.forEach((id) => {
      recordExpectation(id, catalogState.resolved[id], "new", "protected");
    });
    unprotectedIds.forEach((id) => {
      recordExpectation(id, catalogState.resolved[id], "new", "unprotected");
    });
    controlIds.forEach((id) => {
      recordExpectation(id, catalogState.resolved[id], "old", "control");
    });

    ["11", "84", "1342", "1661", "2701"].forEach((id) => {
      if (!catalogState.heroLinks[id]) return;
      const expectedKind = unprotectedIds.includes(id) ? "new" : "old";
      recordExpectation(id, catalogState.heroLinks[id], expectedKind, "hero");
    });

    const protectedResults = [];
    for (const id of protectedIds) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
      const result = await inspectProtected(page, new URL(catalogState.resolved[id], catalogUrl).toString());
      protectedResults.push({ id, result });
      await page.close();
    }

    const unprotectedResults = [];
    for (const id of unprotectedIds) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
      const result = await inspectUnprotected(page, new URL(catalogState.resolved[id], catalogUrl).toString());
      unprotectedResults.push({ id, result });
      await page.close();
    }

    const controlResults = [];
    for (const id of controlIds) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
      const result = await inspectControl(page, new URL(catalogState.resolved[id], catalogUrl).toString());
      controlResults.push({ id, result });
      await page.close();
    }

    if (wrongRoutes.length) blockers.push("wrong-routes-detected");

    const protectedOpenOk = protectedResults.every(({ result }) => {
      return /\/reader_render_v3\/integration\/protected-reader(?:\.html)?$/.test(String(result.pathname || "")) &&
        result.hasProtectedCanvas === true &&
        Array.isArray(result.debugRequests) &&
        result.debugRequests.length === 0;
    });
    if (!protectedOpenOk) blockers.push("protected-open-failed");

    const unprotectedOpenOk = unprotectedResults.every(({ result }) => {
      return result.runtimePath === "new" &&
        Number(result.iframeCount || 0) === 0 &&
        result.ready === true &&
        (!Array.isArray(result.pageErrors) || result.pageErrors.length === 0);
    });
    if (!unprotectedOpenOk) blockers.push("unprotected-open-failed");

    if (controlIds.some((id) => classifyReaderPath(catalogState.resolved[id]) === "new")) {
      blockers.push("accidental-mass-reroute");
    }
    const controlResultsOk = controlResults.every(({ id, result }) => {
      const errors = Array.isArray(result.pageErrors) ? result.pageErrors : [];
      const nonBlockingLegacyNoise = errors.every((item) => /reader\.book\.setStyle is not a function/i.test(String(item || "")));
      if (errors.length && nonBlockingLegacyNoise) {
        warnings.push(`legacy-control-warning:${id}:reader.book.setStyle`);
      }
      return classifyReaderPath(result.finalUrl) === "old" &&
        result.hasViewer === true &&
        (errors.length === 0 || nonBlockingLegacyNoise);
    });
    if (!controlResultsOk) {
      blockers.push("old-reader-control-open-failed");
    }

    const result = {
      ok: blockers.length === 0,
      routedToNew,
      stayedOnOld,
      wrongRoutes,
      protectedOpenOk,
      unprotectedOpenOk,
      blockers,
      warnings,
      catalogUrl,
      allowlist: catalogState.allowlist,
      heroLinks: catalogState.heroLinks,
      resolved: catalogState.resolved,
      protectedResults,
      unprotectedResults,
      controlResults
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
