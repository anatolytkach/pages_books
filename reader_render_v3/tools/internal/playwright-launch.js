#!/usr/bin/env node

const path = require("node:path");
const fs = require("node:fs");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const LOCAL_PLAYWRIGHT_CORE = path.join(REPO_ROOT, "reader_render_v3", "node_modules", "playwright-core");
const SYSTEM_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function resolvePlaywright() {
  try {
    return require(LOCAL_PLAYWRIGHT_CORE);
  } catch (error) {
    throw new Error(`Unable to load playwright-core from ${LOCAL_PLAYWRIGHT_CORE}: ${error && error.message ? error.message : String(error)}`);
  }
}

function resolveExecutablePath(explicitPath = "") {
  const normalizedExplicit = String(explicitPath || "").trim();
  if (normalizedExplicit) return normalizedExplicit;
  if (fs.existsSync(SYSTEM_CHROME)) return SYSTEM_CHROME;
  return "";
}

async function launchChromium({ headless = true, executablePath = "", ...rest } = {}) {
  const { chromium } = resolvePlaywright();
  const finalExecutablePath = resolveExecutablePath(executablePath);
  if (finalExecutablePath) {
    return chromium.launch({
      headless,
      executablePath: finalExecutablePath,
      ...rest
    });
  }
  return chromium.launch({
    headless,
    ...rest
  });
}

module.exports = {
  REPO_ROOT,
  LOCAL_PLAYWRIGHT_CORE,
  SYSTEM_CHROME,
  resolvePlaywright,
  resolveExecutablePath,
  launchChromium
};
