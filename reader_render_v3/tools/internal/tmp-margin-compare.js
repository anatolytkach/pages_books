const { chromium, devices } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

const OLD_URL = process.argv[2];
const NEW_URL = process.argv[3];
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function waitOld(page) {
  await page.goto(OLD_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => {
    const ifr = document.querySelector("#viewer iframe");
    return !!(ifr && ifr.contentDocument && ifr.contentDocument.body);
  }, undefined, { timeout: 60000 });
  await page.waitForTimeout(3000);
}

async function waitNew(page) {
  await page.goto(NEW_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => {
    const frame = document.getElementById("protectedOldShellFrame");
    const bridge = frame && frame.contentWindow && frame.contentWindow.__PROTECTED_READER_BRIDGE__;
    const summary = bridge && bridge.getSummary ? bridge.getSummary() : null;
    return !!(summary && summary.ready);
  }, undefined, { timeout: 60000 });
}

async function sampleOld(page) {
  return page.evaluate(() => {
    const viewerStack = document.getElementById("viewerStack");
    const ifr = document.querySelector("#viewer iframe");
    const doc = ifr && ifr.contentDocument;
    const body = doc && doc.body;
    const walker = doc ? doc.createTreeWalker(body, NodeFilter.SHOW_TEXT) : null;
    let node = null;
    let rangeRect = null;
    while (walker && (node = walker.nextNode())) {
      const text = String(node.nodeValue || "").trim();
      if (!text) continue;
      const range = doc.createRange();
      range.setStart(node, 0);
      range.setEnd(node, Math.min(node.nodeValue.length, Math.max(1, text.length)));
      const rects = range.getClientRects();
      if (rects && rects.length) {
        const r = rects[0];
        rangeRect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
        break;
      }
    }
    const vr = viewerStack ? viewerStack.getBoundingClientRect() : null;
    const ir = ifr ? ifr.getBoundingClientRect() : null;
    return {
      viewerStack: vr ? { left: vr.left, top: vr.top, right: vr.right, bottom: vr.bottom, width: vr.width, height: vr.height } : null,
      iframe: ir ? { left: ir.left, top: ir.top, right: ir.right, bottom: ir.bottom, width: ir.width, height: ir.height } : null,
      firstTextRect: rangeRect,
      bodyStyles: body ? {
        marginLeft: getComputedStyle(body).marginLeft,
        marginRight: getComputedStyle(body).marginRight,
        paddingTop: getComputedStyle(body).paddingTop,
        paddingBottom: getComputedStyle(body).paddingBottom,
        paddingLeft: getComputedStyle(body).paddingLeft,
        paddingRight: getComputedStyle(body).paddingRight,
        columnGap: getComputedStyle(body).columnGap,
        columnWidth: getComputedStyle(body).columnWidth
      } : null
    };
  });
}

async function sampleNew(page) {
  return page.evaluate(() => {
    const viewerStack = document.getElementById("viewerStack");
    const frame = document.getElementById("protectedOldShellFrame");
    const bridge = frame && frame.contentWindow && frame.contentWindow.__PROTECTED_READER_BRIDGE__;
    const summary = bridge && bridge.getSummary ? bridge.getSummary() : null;
    const current = frame && frame.contentWindow && frame.contentWindow.document;
    const canv = current && current.querySelector("#reader-canvas");
    return {
      viewerStack: viewerStack ? (() => {
        const r = viewerStack.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
      })() : null,
      canvas: canv ? (() => {
        const r = canv.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
      })() : null,
      summary: summary ? {
        pageLabel: summary.globalPageLabel || summary.pageLabel || "",
        columnCount: summary.typographySummary && summary.typographySummary.columnCount || 1,
        viewportWidth: summary.viewportWidth || 0,
        viewportHeight: summary.viewportHeight || 0,
        padding: summary.typographySummary && summary.typographySummary.padding || 0,
        columnGap: summary.typographySummary && summary.typographySummary.columnGap || 0
      } : null,
      layout: bridge && bridge.getLayoutMeta ? bridge.getLayoutMeta() : null
    };
  });
}

async function runDesktop(browser) {
  const oldPage = await browser.newPage();
  const newPage = await browser.newPage();
  await waitOld(oldPage);
  await waitNew(newPage);
  const oldData = await sampleOld(oldPage);
  const newData = await sampleNew(newPage);
  await oldPage.close();
  await newPage.close();
  return { old: oldData, new: newData };
}

async function runTouch(browser) {
  const contextOld = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 } });
  const oldPage = await contextOld.newPage();
  const contextNew = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 } });
  const newPage = await contextNew.newPage();
  await waitOld(oldPage);
  await waitNew(newPage);
  const oldData = await sampleOld(oldPage);
  const newData = await sampleNew(newPage);
  await contextOld.close();
  await contextNew.close();
  return { old: oldData, new: newData };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  try {
    const desktop = await runDesktop(browser);
    const touch = await runTouch(browser);
    console.log(JSON.stringify({ desktop, touch }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
