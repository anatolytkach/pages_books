#!/usr/bin/env node

const { chromium } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

const URL =
  process.argv.find((item) => item.startsWith("--url="))?.slice("--url=".length) ||
  "http://127.0.0.1:8790/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape";
const INDEXES = (() => {
  const raw = process.argv.find((item) => item.startsWith("--indexes="))?.slice("--indexes=".length) || "";
  if (!raw) return [1, 2, 3, 4];
  return raw.split(",").map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value >= 0);
})();

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
      const snapshot = frame && frame.contentWindow ? frame.contentWindow.__PROTECTED_READER_STATE__?.currentSnapshot || null : null;
      const renderPacket = snapshot && snapshot.renderPacket ? snapshot.renderPacket : null;
      const pageWindow = renderPacket && renderPacket.pageWindow ? renderPacket.pageWindow : null;
      const layout = renderPacket && renderPacket.layout ? renderPacket.layout : null;
      const layoutLines = layout && Array.isArray(layout.lines) ? layout.lines : [];
      const visibleLines = pageWindow
        ? layoutLines.filter((line) => line && line.lineIndex >= pageWindow.lineStartIndex && line.lineIndex <= pageWindow.lineEndIndex)
        : [];
      const firstMeasuredLines = visibleLines
        .filter((line) => Array.isArray(line.fragments) && line.fragments.length)
        .slice(0, 4)
        .map((line) => {
          const last = line.fragments[line.fragments.length - 1];
          return {
            lineIndex: Number(line.lineIndex || 0),
            left: Math.round(Number(line.x || 0)),
            width: Math.round(Number(line.width || 0)),
            right: Math.round(Number((last && last.x) || 0) + Number((last && last.width) || 0))
          };
        });
      return summary ? {
        page: summary.globalPageLabel,
        chapter: summary.chapterLabel,
        chunk: summary.chunkOrder,
        offset: summary.globalOffsetLabel,
        pageStart: summary.pageGlobalStartOffset,
        pageEnd: summary.pageGlobalEndOffset,
        viewportWidth: summary.viewportWidth,
        columnCount: summary.columnCount,
        lineRange: summary.currentPageLineRange,
        lineCount: summary.currentPageLineCount,
        layoutFingerprint: summary.pageLayoutFingerprint,
        measuredLines: firstMeasuredLines,
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
  for (const index of INDEXES) {
    report.push({ step: `toc-${index + 1}`, ...(await clickToc(index)) });
  }
  for (const index of INDEXES) {
    report.push({ step: `direct-toc-${index + 1}`, summary: await bridgeGoToToc(`toc-${index + 1}`) });
  }

  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
