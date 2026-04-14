#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function getArgValue(name, fallback = "") {
  for (const item of process.argv.slice(2)) {
    if (item.startsWith(`--${name}=`)) return item.slice(name.length + 3);
  }
  return fallback;
}

const ROOT = process.cwd();
const NODE_BIN = process.execPath;
const LOCAL_BASE_URL = getArgValue("local-base-url", "http://127.0.0.1:8788");
const PREVIEW_BASE_URL =
  getArgValue("preview-base-url", "https://c7ec2145.reader-books.pages.dev");
const CACHE_BUSTER = getArgValue("cb", "20260413_phase135");
const CANONICAL_CORPUS = [
  { id: "19686", source: "" },
  { id: "45", source: "" },
  { id: "19", source: "manual" }
];

function buildUrl(baseUrl, book) {
  const params = new URLSearchParams();
  params.set("id", book.id);
  if (book.source) params.set("source", book.source);
  params.set("_cb", CACHE_BUSTER);
  return `${String(baseUrl).replace(/\/$/, "")}/reader/?${params.toString()}`;
}

function runJson(script, args) {
  const output = execFileSync(NODE_BIN, [`reader_render_v3/tools/internal/${script}`, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  });
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
      payload: { ok: false, blockers: [String(error.message || error)], warnings: [] },
      error: String(error.message || error)
    };
  }
}

function checkStaticArchitectureRisks() {
  const findings = [];
  const runtimeFiles = [
    path.join(ROOT, "reader/js/unprotected-runtime-core.js"),
    path.join(ROOT, "reader/js/unprotected-runtime-adapter.js"),
    path.join(ROOT, "reader/js/unprotected-runtime-shell.js"),
    path.join(ROOT, "reader/js/unprotected-render-host.js"),
    path.join(ROOT, "reader/js/unprotected-runtime-events.js"),
    path.join(ROOT, "reader/js/unprotected-runtime-state.js")
  ];
  const forbiddenPatterns = [
    { pattern: /contentDocument/g, label: "contentDocument" },
    { pattern: /ePubReader\s*\(/g, label: "ePubReader" },
    { pattern: /renderTo\s*\(/g, label: "renderTo" },
    { pattern: /scanIframes\s*\(/g, label: "scanIframes" }
  ];

  for (const file of runtimeFiles) {
    const text = fs.readFileSync(file, "utf8");
    for (const rule of forbiddenPatterns) {
      if (rule.pattern.test(text)) findings.push(`${path.relative(ROOT, file)}:${rule.label}`);
    }
  }

  const shellText = fs.readFileSync(path.join(ROOT, "reader/js/fbreader-ui.js"), "utf8");
  const legacyBypassPresent = /ReaderPubUnprotectedRuntimeNew[\s\S]{0,120}isEnabled[\s\S]{0,120}return;/.test(shellText);
  const indexText = fs.readFileSync(path.join(ROOT, "reader/index.html"), "utf8");
  const newRouteBootstrapPresent =
    /ReaderPubUnprotectedRuntimeNew[\s\S]{0,200}adapter\.bootstrap/.test(indexText) &&
    /window\.__readerpubUnprotectedRuntimePath = "new"/.test(indexText);

  return {
    ok: findings.length === 0 && legacyBypassPresent && newRouteBootstrapPresent,
    blockers: findings.slice(),
    warnings: [],
    details: {
      runtimeFilesChecked: runtimeFiles.map((file) => path.relative(ROOT, file)),
      forbiddenFindings: findings,
      legacyBypassPresent,
      newRouteBootstrapPresent
    }
  };
}

function checkNewRouteNoIframe(baseUrl, book) {
  return runJsonAllowFailure("check-phase13-runtime-skeleton.js", [`--url=${buildUrl(baseUrl, book)}`]);
}

function summarizeEnvironment(baseUrl) {
  const books = [];
  const blockers = [];
  const warnings = [];

  for (const book of CANONICAL_CORPUS) {
    const skeleton = checkNewRouteNoIframe(baseUrl, book);
    if (!skeleton.payload.ok) blockers.push(`${book.id}:skeleton:${(skeleton.payload.missingPieces || skeleton.payload.blockers || []).join(",")}`);
    books.push({
      id: book.id,
      source: book.source || "",
      url: buildUrl(baseUrl, book),
      skeleton: skeleton.payload
    });
  }

  const corpus = runJsonAllowFailure("check-phase13-3-corpus.js", [
    `--base-url=${baseUrl}`,
    `--books=${CANONICAL_CORPUS.map((book) => book.id).join(",")}`,
    `--cb=${CACHE_BUSTER}`
  ]);
  if (!corpus.payload.ok) blockers.push(`corpus:${(corpus.payload.blockers || []).join("|")}`);

  const protectedRoute = runJsonAllowFailure("check-live-protected-route.js", [
    `--url=${String(baseUrl).replace(/\/$/, "")}/reader/?id=19686&reader=protected&renderMode=shape&metricsMode=shape&_cb=${CACHE_BUSTER}`
  ]);
  if (!protectedRoute.payload.ok) blockers.push("protected-route");

  const rollout = runJsonAllowFailure("check-live-rollout-smoke.js", [
    `--base-url=${baseUrl}`,
    "--reader-path=/reader/"
  ]);
  if (!rollout.payload.ok) blockers.push("rollout-smoke");

  return {
    ok: blockers.length === 0,
    baseUrl,
    books,
    corpus: corpus.payload,
    protectedRoute: protectedRoute.payload,
    rollout: rollout.payload,
    blockers,
    warnings
  };
}

(function main() {
  const equivalence = runJsonAllowFailure("check-phase13-4-corpus-equivalence.js", [
    `--local-base-url=${LOCAL_BASE_URL}`,
    `--preview-base-url=${PREVIEW_BASE_URL}`,
    `--books=${CANONICAL_CORPUS.map((book) => book.id).join(",")}`,
    `--cb=${CACHE_BUSTER}`
  ]);

  const localEnv = summarizeEnvironment(LOCAL_BASE_URL);
  const previewEnv = summarizeEnvironment(PREVIEW_BASE_URL);
  const bridgeLocal = runJsonAllowFailure("check-unprotected-bridge-dependency.js", [
    `--url=${LOCAL_BASE_URL}/reader/?id=19686&unprotectedRuntime=legacy&_cb=${CACHE_BUSTER}`
  ]);
  const bridgePreview = runJsonAllowFailure("check-unprotected-bridge-dependency.js", [
    `--url=${PREVIEW_BASE_URL}/reader/?id=19686&unprotectedRuntime=legacy&_cb=${CACHE_BUSTER}`
  ]);
  const phase9 = runJsonAllowFailure("check-phase9-post-removal-proof.js", []);
  const staticArchitecture = checkStaticArchitectureRisks();

  const criteria = {
    runtimeCapability: localEnv.corpus.ok && previewEnv.corpus.ok,
    shellUxIntegration:
      localEnv.corpus.ok &&
      previewEnv.corpus.ok &&
      localEnv.books.every((book) => book.skeleton.ok && book.skeleton.initialLabel !== "") &&
      previewEnv.books.every((book) => book.skeleton.ok && book.skeleton.initialLabel !== ""),
    corpusCertification: !!equivalence.payload.ok && !!localEnv.corpus.ok && !!previewEnv.corpus.ok,
    architectureReadiness:
      staticArchitecture.ok &&
      localEnv.books.every((book) => book.skeleton.runtimePath === "new" && book.skeleton.iframeCount === 0) &&
      previewEnv.books.every((book) => book.skeleton.runtimePath === "new" && book.skeleton.iframeCount === 0),
    regressionControl:
      !!localEnv.protectedRoute.ok &&
      !!previewEnv.protectedRoute.ok &&
      !!localEnv.rollout.ok &&
      !!previewEnv.rollout.ok &&
      !!bridgeLocal.payload.ok &&
      !!bridgePreview.payload.ok &&
      !!phase9.payload.ok
  };

  const blockers = [];
  const warnings = [];

  if (!criteria.runtimeCapability) blockers.push("runtime-capability");
  if (!criteria.shellUxIntegration) blockers.push("shell-ux-integration");
  if (!criteria.corpusCertification) blockers.push("corpus-certification");
  if (!criteria.architectureReadiness) blockers.push("architecture-readiness");
  if (!criteria.regressionControl) blockers.push("regression-control");

  blockers.push(...localEnv.blockers.map((item) => `localhost:${item}`));
  blockers.push(...previewEnv.blockers.map((item) => `preview:${item}`));
  blockers.push(...(staticArchitecture.blockers || []).map((item) => `static:${item}`));

  if (!equivalence.payload.ok) {
    blockers.push(...(equivalence.payload.mismatches || []).map((item) => `equivalence:${item.id}:${(item.issues || []).join(",")}`));
  }

  warnings.push("Decision is based on the canonical certified corpus only: 19686, 45, 19&source=manual.");
  warnings.push("Legacy iframe path remains the rollback baseline and is intentionally still present before removal implementation.");

  const decision =
    blockers.length > 0
      ? "NO_GO"
      : warnings.length > 0
        ? "GO_WITH_WARNINGS"
        : "GO";

  const result = {
    ok: blockers.length === 0,
    decision,
    canonicalCorpus: CANONICAL_CORPUS,
    criteria,
    blockers,
    warnings,
    evidence: {
      equivalence: equivalence.payload,
      localhost: localEnv,
      preview: previewEnv,
      bridgeLocal: bridgeLocal.payload,
      bridgePreview: bridgePreview.payload,
      phase9: phase9.payload,
      staticArchitecture
    }
  };

  console.log(JSON.stringify(result, null, 2));
  if (decision === "NO_GO") process.exit(1);
})();
