const { chromium } = require('/tmp/reader_render_v3_pw/node_modules/playwright-core');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage({ viewport: { width: 1512, height: 1117 } });
  const url = process.argv[2];
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => {
    const frame = document.getElementById('protectedOldShellFrame');
    const bridge = frame && frame.contentWindow && frame.contentWindow.__PROTECTED_READER_BRIDGE__;
    return !!(bridge && bridge.getSummary && bridge.getSummary().ready);
  }, undefined, { timeout: 60000 });

  const snap = async () => page.evaluate(() => ({
    stackClasses: document.getElementById('viewerStack') ? [...document.getElementById('viewerStack').classList] : [],
    currentOpacity: document.getElementById('protectedOldShellCurrentLayer') ? getComputedStyle(document.getElementById('protectedOldShellCurrentLayer')).opacity : '',
    nextOpacity: document.getElementById('viewer-next') ? getComputedStyle(document.getElementById('viewer-next')).opacity : '',
    nextCanvasCount: document.getElementById('viewer-next') ? document.getElementById('viewer-next').querySelectorAll('canvas').length : 0,
    prevCanvasCount: document.getElementById('viewer-prev') ? document.getElementById('viewer-prev').querySelectorAll('canvas').length : 0,
    pageLabel: (() => {
      const frame = document.getElementById('protectedOldShellFrame');
      const bridge = frame && frame.contentWindow && frame.contentWindow.__PROTECTED_READER_BRIDGE__;
      return bridge.getSummary().globalPageLabel;
    })()
  }));

  await page.waitForTimeout(300);
  const before = await snap();
  await page.click('#next');
  await page.waitForTimeout(140);
  const firstMid = await snap();
  await page.waitForTimeout(1400);
  const firstSettled = await snap();
  await page.click('#next');
  await page.waitForTimeout(140);
  const secondMid = await snap();
  await page.waitForTimeout(1400);
  const secondSettled = await snap();
  console.log(JSON.stringify({ before, firstMid, firstSettled, secondMid, secondSettled }, null, 2));
  await page.close();
  await browser.close();
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
