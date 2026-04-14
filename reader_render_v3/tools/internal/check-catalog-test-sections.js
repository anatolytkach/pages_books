#!/usr/bin/env node

const { chromium } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

function getArgValue(name, fallback = "") {
  for (const item of process.argv.slice(2)) {
    if (item.startsWith(`--${name}=`)) return item.slice(name.length + 3);
  }
  return fallback;
}

function normalizeIds(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))];
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

async function inspectCatalog(page, catalogUrl) {
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(String(error && error.message ? error.message : error));
  });
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      consoleErrors.push(`${message.type()}:${message.text()}`);
    }
  });
  await page.goto(catalogUrl, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForFunction(() => {
      return !!(
        document.getElementById("readerNewProtectedTestSection") &&
        document.getElementById("readerNewUnprotectedTestSection")
      );
    }, { timeout: 60000 });
  } catch (error) {
    const snapshot = await page.evaluate((pageErrors) => {
      return JSON.parse(JSON.stringify({
        readyState: document.readyState,
        title: document.title,
        statusText: String(document.querySelector("#status")?.textContent || "").trim(),
        contentText: String(document.querySelector("#content")?.textContent || "").trim().slice(0, 500),
        sectionIds: [...document.querySelectorAll("section[id]")].map((node) => node.id),
        pageErrors
      }));
    }, pageErrors.slice());
    return {
      timeout: true,
      snapshot: JSON.parse(JSON.stringify({
        ...snapshot,
        consoleErrors
      })),
      protectedSection: null,
      unprotectedSection: null,
      heroLinks: {}
    };
  }
  await page.waitForTimeout(800);
  return page.evaluate(() => {
    function collectSection(sectionId) {
      const section = document.getElementById(sectionId);
      if (!section) return null;
      const title = String(section.querySelector(".sectionTitle")?.textContent || "").trim();
      const ids = [...section.querySelectorAll("[data-reader-new-test-card]")].map((node) =>
        String(node.getAttribute("data-reader-new-test-card") || "").trim()
      ).filter(Boolean);
      const hrefs = {};
      [...section.querySelectorAll("[data-reader-new-test-card]")].forEach((node) => {
        const id = String(node.getAttribute("data-reader-new-test-card") || "").trim();
        hrefs[id] = String(node.getAttribute("href") || "");
      });
      return { title, ids, hrefs };
    }

    const protectedSection = collectSection("readerNewProtectedTestSection");
    const unprotectedSection = collectSection("readerNewUnprotectedTestSection");
    const heroLinks = {};
    document.querySelectorAll(".heroBookOption[data-book-id]").forEach((node) => {
      const id = String(node.getAttribute("data-book-id") || "").trim();
      heroLinks[id] = String(node.getAttribute("href") || "");
    });
    return JSON.parse(JSON.stringify({
      protectedSection,
      unprotectedSection,
      heroLinks
    }));
  });
}

async function inspectProtected(page, url) {
  const debugRequests = [];
  const pageErrors = [];
  const consoleErrors = [];
  const failedRequests = [];
  page.on("request", (req) => {
    if (req.url().includes("/debug/")) debugRequests.push(req.url());
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(`${request.method()} ${request.url()} :: ${request.failure() && request.failure().errorText ? request.failure().errorText : "failed"}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedRequests.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(String(error && error.message ? error.message : error));
  });
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      consoleErrors.push(`${message.type()}:${message.text()}`);
    }
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  let ready = false;
  try {
    await page.waitForFunction(() => {
      const path = String(window.location.pathname || "");
      const pathMatch =
        /\/reader_render_v3\/integration\/protected-reader(?:\.html)?$/.test(path) ||
        path === "/books/reader_new/" ||
        path === "/reader_new/";
      const hasProtectedUi = !!document.querySelector("#runtime-meta") || !!document.querySelector("#reader-canvas");
      const hasShellUi = !!(
        document.querySelector("#titlebar") &&
        document.querySelector("#prev") &&
        document.querySelector("#next") &&
        document.querySelector("#page-count")
      );
      const statusText = String(document.querySelector("#status")?.textContent || "").trim();
      return pathMatch && ((hasProtectedUi && hasShellUi) || /Opened |Protected mode is unavailable/.test(statusText));
    }, { timeout: 60000 });
    ready = true;
  } catch (_error) {}
  await page.waitForTimeout(1000);
  return page.evaluate(({ debugRequests, pageErrors, consoleErrors, failedRequests, ready }) => {
    const runtimeMeta = {};
    const dl = document.querySelector("#runtime-meta");
    if (dl) {
      const children = [...dl.children];
      for (let index = 0; index < children.length; index += 2) {
        const dt = children[index];
        const dd = children[index + 1];
        if (dt && dd) runtimeMeta[String(dt.textContent || "").trim()] = String(dd.textContent || "").trim();
      }
    }
    return JSON.parse(JSON.stringify({
      ready,
      finalUrl: window.location.href,
      pathname: window.location.pathname,
      hasRuntimeMeta: !!document.querySelector("#runtime-meta"),
      hasProtectedCanvas: !!document.querySelector("#reader-canvas"),
      statusText: String(document.querySelector("#status")?.textContent || "").trim(),
      readerMode: document.documentElement?.dataset?.readerMode || "",
      shellUiPresent: !!(
        document.querySelector("#titlebar") &&
        document.querySelector("#prev") &&
        document.querySelector("#next") &&
        document.querySelector("#page-count")
      ),
      runtimeMeta,
      debugRequests,
      pageErrors,
      consoleErrors,
      failedRequests
    }));
  }, {
    debugRequests: debugRequests.slice(),
    pageErrors: pageErrors.slice(),
    consoleErrors: consoleErrors.slice(),
    failedRequests: failedRequests.slice(),
    ready
  });
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
  const executablePath = getArgValue("executable-path") || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const expectedProtected = normalizeIds(["19686", "45"]);
  const expectedUnprotected = normalizeIds(["11", "84", "1342"]);
  const controlIds = normalizeIds(["1661", "2701"]);
  const blockers = [];
  const warnings = [];

  const browser = await launchBrowser(executablePath);
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
    const catalogState = await inspectCatalog(page, catalogUrl);
    await page.close();

    const protectedIds = normalizeIds(catalogState.protectedSection && catalogState.protectedSection.ids);
    const unprotectedIds = normalizeIds(catalogState.unprotectedSection && catalogState.unprotectedSection.ids);
    const wrongCards = [];
    const wrongDestinations = [];

    if (catalogState.timeout) {
      blockers.push("catalog-test-sections-timeout");
      warnings.push(`catalog-timeout-snapshot:${JSON.stringify(catalogState.snapshot || {})}`);
    }
    if (!catalogState.protectedSection) blockers.push("protected-section-missing");
    if (!catalogState.unprotectedSection) blockers.push("unprotected-section-missing");

    if (JSON.stringify(protectedIds) !== JSON.stringify(expectedProtected)) {
      blockers.push("protected-section-ids-mismatch");
      wrongCards.push(`protected:${protectedIds.join(",")}`);
    }
    if (JSON.stringify(unprotectedIds) !== JSON.stringify(expectedUnprotected)) {
      blockers.push("unprotected-section-ids-mismatch");
      wrongCards.push(`unprotected:${unprotectedIds.join(",")}`);
    }

    expectedProtected.forEach((id) => {
      const href = catalogState.protectedSection && catalogState.protectedSection.hrefs ? catalogState.protectedSection.hrefs[id] : "";
      if (classifyReaderPath(href) !== "new") wrongDestinations.push(`protected:${id}:${href}`);
    });
    expectedUnprotected.forEach((id) => {
      const href = catalogState.unprotectedSection && catalogState.unprotectedSection.hrefs ? catalogState.unprotectedSection.hrefs[id] : "";
      if (classifyReaderPath(href) !== "new") wrongDestinations.push(`unprotected:${id}:${href}`);
    });
    controlIds.forEach((id) => {
      const href = catalogState.heroLinks ? catalogState.heroLinks[id] : "";
      if (classifyReaderPath(href) !== "old") wrongDestinations.push(`control:${id}:${href}`);
    });
    if (wrongDestinations.length) blockers.push("wrong-destinations");

    const protectedResults = [];
    if (catalogState.protectedSection && catalogState.protectedSection.hrefs) {
      for (const id of expectedProtected) {
        const nextPage = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
        const href = new URL(catalogState.protectedSection.hrefs[id], catalogUrl).toString();
        const result = await inspectProtected(nextPage, href);
        protectedResults.push({ id, result });
        await nextPage.close();
      }
    }
    const protectedOpenOk = protectedResults.length === expectedProtected.length && protectedResults.every(({ result }) =>
      result.ready === true &&
      classifyReaderPath(result.finalUrl) === "new" &&
      String(result.readerMode || "") === "protected" &&
      result.shellUiPresent === true &&
      result.hasProtectedCanvas === true &&
      Array.isArray(result.debugRequests) &&
      result.debugRequests.length === 0 &&
      (!Array.isArray(result.pageErrors) || result.pageErrors.length === 0)
    );
    if (!protectedOpenOk) blockers.push("protected-open-failed");

    const unprotectedResults = [];
    if (catalogState.unprotectedSection && catalogState.unprotectedSection.hrefs) {
      for (const id of expectedUnprotected) {
        const nextPage = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
        const href = new URL(catalogState.unprotectedSection.hrefs[id], catalogUrl).toString();
        const result = await inspectProtected(nextPage, href);
        unprotectedResults.push({ id, result });
        await nextPage.close();
      }
    }
    const unprotectedOpenOk = unprotectedResults.length === expectedUnprotected.length && unprotectedResults.every(({ result }) =>
      result.ready === true &&
      classifyReaderPath(result.finalUrl) === "new" &&
      String(result.readerMode || "") === "protected" &&
      result.shellUiPresent === true &&
      result.hasProtectedCanvas === true &&
      Array.isArray(result.debugRequests) &&
      result.debugRequests.length === 0 &&
      (!Array.isArray(result.pageErrors) || result.pageErrors.length === 0)
    );
    if (!unprotectedOpenOk) blockers.push("unprotected-open-failed");

    const isLocalCatalog = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/books\/?/i.test(catalogUrl);
    if (isLocalCatalog) {
      [...protectedResults, ...unprotectedResults].forEach(({ id, result }) => {
        const meta = result && result.runtimeMeta ? result.runtimeMeta : {};
        if ((meta["Artifact source requested"] || "") !== "r2") blockers.push(`artifact-source-requested-mismatch:${id}`);
        if ((meta["Artifact remote mode"] || "") !== "strict") blockers.push(`artifact-remote-mode-mismatch:${id}`);
        if ((meta["Artifact source resolved"] || "") !== "remote") blockers.push(`artifact-source-resolved-mismatch:${id}:${meta["Artifact source resolved"] || "missing"}`);
        if ((meta["Artifact fallback detected"] || "") !== "strict-remote-lock") warnings.push(`artifact-fallback-marker:${id}:${meta["Artifact fallback detected"] || "missing"}`);
      });
    }

    const controlResults = [];
    for (const id of controlIds) {
      const href = catalogState.heroLinks ? catalogState.heroLinks[id] : "";
      if (!href) continue;
      const nextPage = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
      const result = await inspectControl(nextPage, new URL(href, catalogUrl).toString());
      controlResults.push({ id, result });
      await nextPage.close();
    }
    const controlOk = controlResults.every(({ id, result }) => {
      const errors = Array.isArray(result.pageErrors) ? result.pageErrors : [];
      const nonBlockingLegacyNoise = errors.every((item) => /reader\.book\.setStyle is not a function/i.test(String(item || "")));
      if (errors.length && nonBlockingLegacyNoise) warnings.push(`legacy-control-warning:${id}:reader.book.setStyle`);
      return classifyReaderPath(result.finalUrl) === "old" &&
        result.hasViewer === true &&
        (errors.length === 0 || nonBlockingLegacyNoise);
    });
    if (!controlOk) blockers.push("old-catalog-baseline-regressed");

    const result = {
      ok: blockers.length === 0,
      sectionsPresent: !!(catalogState.protectedSection && catalogState.unprotectedSection),
      protectedSectionIds: protectedIds,
      unprotectedSectionIds: unprotectedIds,
      wrongCards,
      wrongDestinations,
      protectedOpenOk,
      unprotectedOpenOk,
      blockers,
      warnings,
      catalogUrl,
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
  console.error(String(error && error.stack ? error.stack : error));
  process.exit(1);
});
