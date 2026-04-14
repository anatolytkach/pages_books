#!/usr/bin/env node

const { execFileSync } = require("child_process");
const os = require("os");
const path = require("path");

function getArgValue(name, fallback = "") {
  for (const item of process.argv.slice(2)) {
    if (item.startsWith(`--${name}=`)) return item.slice(name.length + 3);
  }
  return fallback;
}

const BASE_URL = getArgValue("base-url", "http://127.0.0.1:8788");
const CACHE_BUSTER = getArgValue("cb", "");
const BOOK_FILTER = getArgValue("books", "");
const RUNTIME_MODE = getArgValue("runtime-mode", "");
const NODE_BIN = process.execPath;
const ROOT = process.cwd();

const BOOKS = [
  {
    id: "19686",
    source: "",
    title: "Crome Yellow",
    categories: ["A. Simple single spine", "C. Long book", "G. Text-heavy pages"],
    searchQuery: "yellow",
    expectedLocal: true
  },
  {
    id: "45",
    source: "",
    title: "Anne of Green Gables",
    categories: ["B. Multi-spine", "C. Long book", "E. TOC-heavy"],
    searchQuery: "Anne",
    expectedLocal: true
  },
  {
    id: "19",
    source: "manual",
    title: "Судьба цивилизатора",
    categories: ["D. Non-standard package", "F. Non-standard CSS", "E. TOC-heavy"],
    searchQuery: "рим",
    expectedLocal: true
  },
  {
    id: "77752",
    source: "manual",
    title: "Bibliography of the Bacon-Shakespeare controversy",
    categories: ["B. Multi-spine", "E. TOC-heavy", "G. Text-heavy pages"],
    searchQuery: "Shakespeare",
    expectedLocal: true
  },
  {
    id: "77753",
    source: "manual",
    title: "The Population Problem",
    categories: ["B. Multi-spine", "C. Long book", "E. TOC-heavy"],
    searchQuery: "population",
    expectedLocal: true
  }
];

const DOMAIN_RUNNERS = [
  { key: "skeleton", script: "check-phase13-runtime-skeleton.js" },
  { key: "pagination", script: "check-phase13-1-pagination-model.js" },
  { key: "restore", script: "check-phase13-2-restore.js" },
  { key: "search", script: "check-phase13-2-search.js", argForBook: (book) => [`--query=${book.searchQuery}`] },
  { key: "selection", script: "check-phase13-2-selection.js" },
  { key: "annotations", script: "check-phase13-2-annotations.js" },
  { key: "bookmarks", script: "check-phase13-2-bookmarks.js" },
  { key: "capabilitySummary", script: "check-phase13-2-capability-summary.js" }
];

function summarizeSearchResults(results) {
  if (!Array.isArray(results)) return results;
  return {
    total: results.length,
    sample: results.slice(0, 3).map((item) => ({
      sectionIndex: item.sectionIndex,
      pageIndex: item.pageIndex,
      href: item.href,
      title: item.title,
      query: item.query,
      pageToken: item.pageToken,
      label: item.label,
      snippet: item.snippet
    }))
  };
}

function summarizePayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const clone = JSON.parse(JSON.stringify(payload));
  if (clone.initial && clone.initial.search && Array.isArray(clone.initial.search.results)) {
    clone.initial.search.results = summarizeSearchResults(clone.initial.search.results);
  }
  if (clone.afterSubmit && clone.afterSubmit.search && Array.isArray(clone.afterSubmit.search.results)) {
    clone.afterSubmit.search.results = summarizeSearchResults(clone.afterSubmit.search.results);
  }
  if (clone.afterNext && clone.afterNext.search && Array.isArray(clone.afterNext.search.results)) {
    clone.afterNext.search.results = summarizeSearchResults(clone.afterNext.search.results);
  }
  if (clone.afterPrev && clone.afterPrev.search && Array.isArray(clone.afterPrev.search.results)) {
    clone.afterPrev.search.results = summarizeSearchResults(clone.afterPrev.search.results);
  }
  if (clone.afterClear && clone.afterClear.search && Array.isArray(clone.afterClear.search.results)) {
    clone.afterClear.search.results = summarizeSearchResults(clone.afterClear.search.results);
  }
  return clone;
}

function isLocalBaseUrl(url) {
  return /^https?:\/\/(127\.0\.0\.1|localhost|::1)(:\d+)?/i.test(url);
}

function buildReaderUrl(book) {
  const params = new URLSearchParams();
  params.set("id", book.id);
  if (book.source) params.set("source", book.source);
  if (RUNTIME_MODE) params.set("unprotectedRuntime", RUNTIME_MODE);
  if (CACHE_BUSTER) params.set("_cb", CACHE_BUSTER);
  return `${BASE_URL}/reader/?${params.toString()}`;
}

function runJson(script, args) {
  const isolatedHome = path.join(os.tmpdir(), "readerpub-phase13-3-home");
  const output = execFileSync(
    NODE_BIN,
    [`reader_render_v3/tools/internal/${script}`, ...args],
    {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
      env: Object.assign({}, process.env, {
        HOME: isolatedHome,
        XDG_CONFIG_HOME: isolatedHome,
        XDG_CACHE_HOME: isolatedHome
      })
    }
  );
  return JSON.parse(output);
}

function runJsonAllowFailure(script, args) {
  try {
    return { ok: true, payload: runJson(script, args) };
  } catch (error) {
    const stdout = String(error.stdout || "").trim();
    if (stdout) {
      try {
        return { ok: false, payload: JSON.parse(stdout), error: String(error.message || error) };
      } catch (_parseError) {}
    }
    return {
      ok: false,
      payload: {
        ok: false,
        domainStatus: "blocked",
        blockers: [String(error.message || error)],
        warnings: []
      },
      error: String(error.message || error)
    };
  }
}

function summarizeBook(book, url) {
  const result = {
    id: book.id,
    title: book.title,
    url,
    categories: book.categories,
    expectedLocal: book.expectedLocal,
    domains: {},
    blockers: [],
    warnings: [],
    ok: true
  };
  for (const domain of DOMAIN_RUNNERS) {
    const args = [`--url=${url}`].concat(domain.argForBook ? domain.argForBook(book) : []);
    const domainRun = runJsonAllowFailure(domain.script, args);
    result.domains[domain.key] = summarizePayload(domainRun.payload);
    if (!domainRun.payload.ok) {
      result.ok = false;
      result.blockers.push(`${domain.key}:${(domainRun.payload.blockers || []).join(",") || domainRun.error || "failed"}`);
      if (domain.key === "skeleton") break;
    }
    if (Array.isArray(domainRun.payload.warnings) && domainRun.payload.warnings.length) {
      result.warnings = result.warnings.concat(domainRun.payload.warnings.map((warning) => `${domain.key}:${warning}`));
    }
  }
  return result;
}

(function main() {
  const selectedIds = BOOK_FILTER ? new Set(BOOK_FILTER.split(",").map((value) => String(value).trim()).filter(Boolean)) : null;
  const books = selectedIds ? BOOKS.filter((book) => selectedIds.has(book.id)) : BOOKS.slice();
  const local = isLocalBaseUrl(BASE_URL);
  const perBook = [];
  const blockers = [];
  const warnings = [];

  for (const book of books) {
    const url = buildReaderUrl(book);
    const summary = summarizeBook(book, url);
    perBook.push(summary);
    if (!summary.ok) blockers.push(`${book.id}:${summary.blockers.join("|")}`);
    warnings.push.apply(warnings, summary.warnings.map((warning) => `${book.id}:${warning}`));
  }

  const perDomainStatus = {};
  for (const domain of DOMAIN_RUNNERS) {
    const statuses = perBook.map((book) => {
      const payload = book.domains[domain.key];
      return payload ? (payload.ok ? "green" : "red") : "skipped";
    });
    perDomainStatus[domain.key] = statuses;
  }

  const result = {
    ok: blockers.length === 0,
    env: local ? "localhost" : "preview",
    baseUrl: BASE_URL,
    runtimeMode: RUNTIME_MODE || "default",
    books: perBook,
    perDomainStatus,
    blockers,
    warnings
  };

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
})();
