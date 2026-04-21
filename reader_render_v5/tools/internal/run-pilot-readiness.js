#!/usr/bin/env node

const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

function getArgValue(name, fallback = "") {
  for (const item of process.argv.slice(2)) {
    if (item.startsWith(`--${name}=`)) return item.slice(name.length + 3);
  }
  return fallback;
}

function parseJson(stdout) {
  const trimmed = String(stdout || "").trim();
  const firstBrace = trimmed.indexOf("{");
  if (firstBrace === -1) {
    throw new Error(`Expected JSON output, got: ${trimmed.slice(0, 200)}`);
  }
  return JSON.parse(trimmed.slice(firstBrace));
}

async function loadPilotConfig() {
  const modulePath = path.join(REPO_ROOT, "reader_render_v3/reader_new/protected-host-pilot-config.js");
  const imported = await import(require("node:url").pathToFileURL(modulePath).href);
  return imported.PROTECTED_READER_PILOT_CONFIG;
}

async function runReadiness(url, liveUrl, requireDrive) {
  const args = [
    "reader_render_v3/tools/internal/check-protected-reader-readiness.js",
    `--url=${url}`,
    "--headless=true",
    `--require-drive=${requireDrive ? "true" : "false"}`
  ];
  if (liveUrl) {
    args.push(`--live-url=${liveUrl}`, "--expect-live-protected=true");
  }
  const { stdout } = await execFileAsync("node", args, {
    cwd: REPO_ROOT,
    env: process.env,
    maxBuffer: 20 * 1024 * 1024
  });
  return parseJson(stdout);
}

async function main() {
  const localhostBase = getArgValue("localhost-base", "http://127.0.0.1:8790");
  const liveBase = getArgValue("live-base", "https://codex-reader-render-v3.reader-books.pages.dev");
  const requireDrive = String(getArgValue("require-drive", "false")).trim().toLowerCase() === "true";
  const config = await loadPilotConfig();

  const books = [...(config.pilotBookIds || [])];
  const results = [];
  for (const bookId of books) {
    const localUrl = `${localhostBase}/reader/?id=${bookId}&reader=protected&renderMode=shape&metricsMode=shape`;
    const liveUrl = `${liveBase}/reader/?id=${bookId}&reader=protected&renderMode=shape&metricsMode=shape`;
    const readiness = await runReadiness(localUrl, liveUrl, requireDrive);
    results.push({
      bookId,
      localUrl,
      liveUrl,
      ok: readiness.ok,
      warnings: readiness.warnings || [],
      regressions: readiness.regressions || [],
      readiness
    });
  }

  const blocked = [];
  for (const bookId of config.candidateBookIds || []) {
    if ((config.pilotBookIds || []).includes(bookId)) continue;
    blocked.push({
      bookId,
      status: "candidate-not-certified",
      reason: "Candidate book is not in the certified pilot set."
    });
  }

  const ok = results.every((entry) => entry.ok);
  const warningCount = results.reduce((sum, entry) => sum + (entry.warnings || []).length, 0);
  const summary = ok ? (warningCount ? "READY WITH WARNINGS" : "READY") : "NOT READY";

  console.log(JSON.stringify({
    ok,
    summary,
    pilotConfigVersion: config.version,
    pilotBooks: config.pilotBookIds || [],
    blocked,
    results
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
