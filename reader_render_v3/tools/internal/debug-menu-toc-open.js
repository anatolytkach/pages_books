#!/usr/bin/env node

const { chromium } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

const URL =
  process.argv.find((item) => item.startsWith("--url="))?.slice("--url=".length) ||
  "https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=45&reader=protected&protectedUx=old-shell&protectedArtifactSource=r2&protectedAllowAll=1&renderMode=shape&metricsMode=shape";
const CYCLES = Number(process.argv.find((item) => item.startsWith("--cycles="))?.slice("--cycles=".length) || 5);

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });
  const results = [];
  for (let index = 0; index < CYCLES; index += 1) {
    const page = await browser.newPage({ viewport: { width: 1536, height: 960 } });
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
    await page.click("#slider");
    await page.waitForTimeout(150);
    const menuVisible = await page.$eval("#overlay-menu", (el) => !el.classList.contains("hidden"));
    await page.click("#menuList [data-menu=\"toc\"]");
    await page.waitForTimeout(200);
    const tocVisible = await page.$eval("#overlay-toc", (el) => !el.classList.contains("hidden"));
    const menuVisibleAfter = await page.$eval("#overlay-menu", (el) => !el.classList.contains("hidden"));
    const activeTitle = await page.$eval("#chapter-title", (el) => (el.textContent || "").trim());
    results.push({
      cycle: index + 1,
      menuVisible,
      tocVisible,
      menuVisibleAfter,
      activeTitle
    });
    await page.close();
  }

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
