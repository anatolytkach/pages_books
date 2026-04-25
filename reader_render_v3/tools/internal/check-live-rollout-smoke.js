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

async function main() {
  const baseUrl = getArgValue("base-url");
  if (!baseUrl) throw new Error("Missing --base-url=<origin>");
  const readerPath = getArgValue("reader-path", baseUrl.includes(".pages.dev") ? "/reader/" : "/books/reader/");

  const { stdout } = await execFileAsync(
    "node",
    [
      "reader_render_v3/tools/annotation-compat/check-rollout-matrix.js",
      `--base-url=${baseUrl}`,
      `--reader-path=${readerPath}`
    ],
    {
      cwd: REPO_ROOT,
      env: process.env,
      maxBuffer: 10 * 1024 * 1024
    }
  );

  const matrix = parseJson(stdout);
  const ok =
    matrix.oldReaderDefault.protectedCanvas === false &&
    matrix.protectedAllowed.meta["Rollout decision"] === "open-protected-reader" &&
    /protectedFallbackReason=ineligible-rollout-disabled/.test(matrix.protectedRolloutDisabled.url || "") &&
    /protectedFallbackReason=ineligible-book-not-allowed/.test(matrix.protectedDenylisted.url || "") &&
    matrix.protectedWorkerUnavailable.meta["Rollout decision"] === "protected-unavailable-show-message" &&
    /protectedFallbackReason=ineligible-no-protected-artifact/.test(matrix.protectedArtifactMissing.url || "");

  console.log(JSON.stringify({
    ok,
    baseUrl,
    readerPath,
    matrix
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
