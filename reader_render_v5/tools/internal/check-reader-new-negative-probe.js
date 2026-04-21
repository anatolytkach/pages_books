#!/usr/bin/env node

const { chromium } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

async function main() {
  const targetUrl = process.argv[2];
  if (!targetUrl) {
    throw new Error("Usage: check-reader-new-negative-probe.js <url>");
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(1500);

  const result = await page.evaluate(() => ({
    finalUrl: location.href,
    pathname: location.pathname,
    runtimePath: window.__readerpubUnprotectedRuntimePath || null,
    viewerText: (document.querySelector("#viewer")?.innerText || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 260),
    hasProtectedCanvas: !!document.querySelector("canvas"),
    hasIframe: !!document.querySelector("iframe"),
  }));

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
