#!/usr/bin/env node

const crypto = require("crypto");
const os = require("os");
const path = require("path");
const { chromium } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

function getArgValue(name, fallback = "") {
  for (const item of process.argv.slice(2)) {
    if (item.startsWith(`--${name}=`)) return item.slice(name.length + 3);
  }
  return fallback;
}

const LOCAL_BASE_URL = getArgValue("local-base-url", "http://127.0.0.1:8788");
const PREVIEW_BASE_URL =
  getArgValue("preview-base-url", "https://b9eefded.reader-books.pages.dev");
const CACHE_BUSTER = getArgValue("cb", "20260413_phase134eq");
const BOOK_FILTER = getArgValue("books", "");
const RUNTIME_MODE = getArgValue("runtime-mode", "");
const EXECUTABLE_PATH =
  getArgValue("executable-path") ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const BOOKS = [
  { id: "19686", source: "", category: "simple/single-spine" },
  { id: "45", source: "", category: "multi-spine/toc-heavy" },
  { id: "19", source: "manual", category: "non-standard/manual" },
  { id: "77752", source: "manual", category: "multi-spine/text-heavy" },
  { id: "77753", source: "manual", category: "long/multi-spine" }
];

function buildUrl(baseUrl, book) {
  const params = new URLSearchParams();
  params.set("id", book.id);
  if (book.source) params.set("source", book.source);
  if (RUNTIME_MODE) params.set("unprotectedRuntime", RUNTIME_MODE);
  if (CACHE_BUSTER) params.set("_cb", CACHE_BUSTER);
  return `${String(baseUrl).replace(/\/$/, "")}/reader/?${params.toString()}`;
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function hashObject(value) {
  return crypto.createHash("sha1").update(JSON.stringify(value)).digest("hex");
}

async function launchBrowser() {
  const isolatedHome = path.join(os.tmpdir(), "readerpub-phase13-4-home");
  return chromium.launch({
    headless: true,
    executablePath: EXECUTABLE_PATH,
    env: Object.assign({}, process.env, {
      HOME: isolatedHome,
      XDG_CONFIG_HOME: isolatedHome,
      XDG_CACHE_HOME: isolatedHome
    })
  });
}

async function collectBookSignature(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(String(error && error.message ? error.message : error));
  });
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(`console:${message.text()}`);
  });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      return !!(
        window.__readerpubUnprotectedRuntimePath === "new" &&
        window.__READERPUB_UNPROTECTED_RUNTIME_ADAPTER__ &&
        window.__READERPUB_UNPROTECTED_RUNTIME_STATE__ &&
        window.__READERPUB_UNPROTECTED_RUNTIME_STATE__.status === "ready"
      );
    }, { timeout: 30000 });
    await page.waitForTimeout(1500);

    const payload = await page.evaluate(async () => {
      function clone(value) {
        return value ? JSON.parse(JSON.stringify(value)) : value;
      }
      function basename(href) {
        const raw = String(href || "");
        return raw.split("/").pop() || raw;
      }
      function excerpt() {
        const root = document.querySelector("[data-readerpub-unprotected-runtime-root='true']");
        return String(root && root.textContent || "").replace(/\s+/g, " ").trim().slice(0, 600);
      }

      const adapter = window.__READERPUB_UNPROTECTED_RUNTIME_ADAPTER__;
      const stateBefore = clone(window.__READERPUB_UNPROTECTED_RUNTIME_STATE__);
      const locationBefore = clone(adapter.getLocation ? adapter.getLocation() : null);
      const excerptBefore = excerpt();
      let locationAfterNext = null;
      let excerptAfterNext = excerptBefore;

      if (adapter && typeof adapter.nextPage === "function" && locationBefore && locationBefore.canGoNext) {
        await Promise.resolve(adapter.nextPage());
        await new Promise((resolve) => setTimeout(resolve, 700));
        locationAfterNext = clone(adapter.getLocation ? adapter.getLocation() : null);
        excerptAfterNext = excerpt();
      }

      return {
        runtimePath: String(window.__readerpubUnprotectedRuntimePath || ""),
        state: stateBefore,
        locationBefore,
        locationAfterNext,
        excerptBefore,
        excerptAfterNext,
        pageCounter: String(document.querySelector("#page-count")?.textContent || "").trim(),
        titleNode: String(document.querySelector("#chapter-title")?.textContent || "").trim(),
        hrefBasenameBefore: basename(locationBefore && locationBefore.href),
        hrefBasenameAfterNext: basename(locationAfterNext && locationAfterNext.href)
      };
    });

    const book = payload.state && payload.state.book ? payload.state.book : {};
    const location = payload.locationBefore || {};
    const fingerprintBasis = {
      runtimePath: payload.runtimePath,
      title: normalizeText(book.title),
      author: normalizeText(book.author),
      sectionCount: Number(book.sectionCount || 0),
      spineCount: Number(location.spineCount || book.sectionCount || 0),
      hrefBasenameBefore: normalizeText(payload.hrefBasenameBefore),
      hrefBasenameAfterNext: normalizeText(payload.hrefBasenameAfterNext),
      excerptBefore: normalizeText(payload.excerptBefore),
      excerptAfterNext: normalizeText(payload.excerptAfterNext)
    };

    return {
      ok: true,
      title: normalizeText(book.title),
      author: normalizeText(book.author),
      source: normalizeText(book.source),
      sectionCount: Number(book.sectionCount || 0),
      spineCount: Number(location.spineCount || book.sectionCount || 0),
      pageCounter: normalizeText(payload.pageCounter),
      hrefBasenameBefore: normalizeText(payload.hrefBasenameBefore),
      hrefBasenameAfterNext: normalizeText(payload.hrefBasenameAfterNext),
      textLength: Number((payload.excerptBefore || "").length),
      fingerprintBasis,
      fingerprint: hashObject(fingerprintBasis),
      pageErrors
    };
  } catch (error) {
    return {
      ok: false,
      error: String(error && error.message ? error.message : error),
      pageErrors
    };
  } finally {
    await page.close();
  }
}

function compareBook(book, localResult, previewResult) {
  const mismatch = {
    id: book.id,
    source: book.source || "",
    localOk: !!(localResult && localResult.ok),
    previewOk: !!(previewResult && previewResult.ok),
    issues: []
  };
  if (!localResult || !localResult.ok) mismatch.issues.push("missing-or-failed-local");
  if (!previewResult || !previewResult.ok) mismatch.issues.push("missing-or-failed-preview");
  if (mismatch.issues.length) return mismatch;

  if (localResult.title !== previewResult.title) mismatch.issues.push("title-mismatch");
  if (localResult.author !== previewResult.author) mismatch.issues.push("author-mismatch");
  if (localResult.sectionCount !== previewResult.sectionCount) mismatch.issues.push("section-count-mismatch");
  if (localResult.spineCount !== previewResult.spineCount) mismatch.issues.push("spine-count-mismatch");
  if (localResult.fingerprint !== previewResult.fingerprint) mismatch.issues.push("fingerprint-mismatch");
  return mismatch;
}

(async function main() {
  const selectedIds = BOOK_FILTER
    ? new Set(BOOK_FILTER.split(",").map((value) => String(value).trim()).filter(Boolean))
    : null;
  const books = selectedIds ? BOOKS.filter((book) => selectedIds.has(book.id)) : BOOKS.slice();
  const browser = await launchBrowser();

  try {
    const results = [];
    const mismatches = [];
    const missingLocal = [];
    const missingPreview = [];

    for (const book of books) {
      const localUrl = buildUrl(LOCAL_BASE_URL, book);
      const previewUrl = buildUrl(PREVIEW_BASE_URL, book);
      const local = await collectBookSignature(browser, localUrl);
      const preview = await collectBookSignature(browser, previewUrl);
      const comparison = compareBook(book, local, preview);

      if (!local.ok) missingLocal.push({ id: book.id, source: book.source || "", error: local.error || "", url: localUrl });
      if (!preview.ok) missingPreview.push({ id: book.id, source: book.source || "", error: preview.error || "", url: previewUrl });
      if (comparison.issues.length) mismatches.push(comparison);

      results.push({
        id: book.id,
        source: book.source || "",
        category: book.category,
        localUrl,
        previewUrl,
        local,
        preview,
        equivalent: comparison.issues.length === 0
      });
    }

    const output = {
      ok: mismatches.length === 0 && missingLocal.length === 0 && missingPreview.length === 0,
      runtimeMode: RUNTIME_MODE || "default",
      books: results,
      mismatches,
      missingLocal,
      missingPreview
    };

    console.log(JSON.stringify(output, null, 2));
    if (!output.ok) process.exit(1);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
