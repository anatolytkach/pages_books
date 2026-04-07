#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

const URL =
  process.argv.find((item) => item.startsWith("--url="))?.slice("--url=".length) ||
  "https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=45&reader=protected&protectedUx=old-shell&protectedArtifactSource=r2&protectedAllowAll=1&renderMode=shape&metricsMode=shape";
const INDEX = Number(process.argv.find((item) => item.startsWith("--index="))?.slice("--index=".length) || 4);
const OUTPUT =
  process.argv.find((item) => item.startsWith("--output="))?.slice("--output=".length) ||
  path.join("/tmp", `toc-${INDEX}.png`);

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  page.setDefaultTimeout(30000);
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const frame = document.querySelector("#protectedOldShellFrame");
    try {
      const bridge = frame && frame.contentWindow ? frame.contentWindow.__PROTECTED_READER_BRIDGE__ : null;
      return !!(bridge && bridge.getSummary && bridge.getSummary().ready);
    } catch (error) {
      return false;
    }
  });

  await page.evaluate(() => {
    const panel = document.getElementById("overlay-toc");
    if (panel) {
      panel.classList.remove("hidden");
      panel.setAttribute("aria-hidden", "false");
    }
  });

  const label = ((await page.locator("#tocView .toc_link").nth(INDEX).textContent()) || "").trim();
  await page.locator("#tocView .toc_link").nth(INDEX).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: OUTPUT, fullPage: true });
  const summary = await page.evaluate(() => {
    const frame = document.querySelector("#protectedOldShellFrame");
    const bridge = frame && frame.contentWindow ? frame.contentWindow.__PROTECTED_READER_BRIDGE__ : null;
    return bridge && bridge.getSummary ? bridge.getSummary() : null;
  });
  console.log(JSON.stringify({ output: OUTPUT, label, summary }, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
