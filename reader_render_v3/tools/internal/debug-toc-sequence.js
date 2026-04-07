#!/usr/bin/env node

const { chromium } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

const URL =
  process.argv.find((item) => item.startsWith("--url="))?.slice("--url=".length) ||
  "http://127.0.0.1:8790/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape";

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(20000);
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

  async function getSummary() {
    return page.evaluate(() => {
      const frame = document.querySelector("#protectedOldShellFrame");
      const bridge = frame && frame.contentWindow ? frame.contentWindow.__PROTECTED_READER_BRIDGE__ : null;
      const summary = bridge && bridge.getSummary ? bridge.getSummary() : null;
      return summary ? {
        page: summary.globalPageLabel,
        chapter: summary.chapterLabel,
        chunk: summary.chunkOrder,
        offset: summary.globalOffsetLabel,
        pageStart: summary.pageGlobalStartOffset,
        pageEnd: summary.pageGlobalEndOffset,
        focusCount: summary.focusHighlightCount,
        activeToc: (summary.tocItems || []).filter((item) => item.active).map((item) => item.label)
      } : null;
    });
  }

  async function openToc() {
    await page.evaluate(() => {
      const panel = document.getElementById("overlay-toc");
      panel.classList.remove("hidden");
      panel.setAttribute("aria-hidden", "false");
    });
  }

  async function clickToc(index) {
    await openToc();
    const label = await page.locator("#tocView .toc_link").nth(index).textContent();
    await page.locator("#tocView .toc_link").nth(index).click();
    await page.waitForTimeout(500);
    return {
      clicked: (label || "").trim(),
      summary: await getSummary()
    };
  }

  async function bridgeGoToToc(tocId) {
    await page.evaluate(async (targetId) => {
      const frame = document.querySelector("#protectedOldShellFrame");
      const bridge = frame && frame.contentWindow ? frame.contentWindow.__PROTECTED_READER_BRIDGE__ : null;
      if (!bridge || !bridge.goToToc) throw new Error("Protected bridge is unavailable.");
      await bridge.goToToc(targetId);
    }, tocId);
    await page.waitForTimeout(500);
    return await getSummary();
  }

  const report = [];
  report.push({ step: "start", summary: await getSummary() });
  report.push({ step: "toc-2", ...(await clickToc(1)) });
  report.push({ step: "toc-3", ...(await clickToc(2)) });
  report.push({ step: "toc-4", ...(await clickToc(3)) });
  report.push({ step: "toc-5", ...(await clickToc(4)) });
  report.push({ step: "direct-toc-3", summary: await bridgeGoToToc("toc-3") });
  report.push({ step: "direct-toc-4", summary: await bridgeGoToToc("toc-4") });
  report.push({ step: "direct-toc-5", summary: await bridgeGoToToc("toc-5") });

  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
