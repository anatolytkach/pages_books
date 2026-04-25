const { chromium, devices } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

const URL = process.argv[2];
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function waitForReady(page) {
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => {
    const frame = document.getElementById("protectedOldShellFrame");
    const bridge = frame && frame.contentWindow && frame.contentWindow.__PROTECTED_READER_BRIDGE__;
    const summary = bridge && bridge.getSummary ? bridge.getSummary() : null;
    return !!(summary && summary.ready);
  }, undefined, { timeout: 60000 });
}

async function sample(page) {
  return page.evaluate(() => {
    const body = document.body;
    const titlebar = document.getElementById("titlebar");
    const bottombar = document.getElementById("bottombar");
    return {
      uiHidden: body.classList.contains("ui-hidden"),
      titleOpacity: titlebar ? getComputedStyle(titlebar).opacity : "",
      bottomOpacity: bottombar ? getComputedStyle(bottombar).opacity : "",
      titlePointer: titlebar ? getComputedStyle(titlebar).pointerEvents : "",
      bottomPointer: bottombar ? getComputedStyle(bottombar).pointerEvents : "",
      touchDebug: window.__protectedTouchDebug || null
    };
  });
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  try {
    const context = await browser.newContext({
      ...devices["iPhone 13"],
      viewport: { width: 390, height: 844 }
    });
    const page = await context.newPage();
    await waitForReady(page);
    const initial = await sample(page);
    const host = page.locator("#protectedOldShellHost");
    const box = await host.boundingBox();
    const cx = box.x + box.width * 0.5;
    const cy = box.y + box.height * 0.5;
    await page.touchscreen.tap(cx, cy);
    await page.waitForTimeout(120);
    const afterFirstTap = await sample(page);
    await page.touchscreen.tap(cx, cy);
    await page.waitForTimeout(120);
    const afterSecondTap = await sample(page);
    const rx = box.x + box.width * 0.9;
    await page.touchscreen.tap(rx, cy);
    await page.waitForTimeout(1600);
    const afterRightTap = await page.evaluate(() => {
      const frame = document.getElementById("protectedOldShellFrame");
      const bridge = frame && frame.contentWindow && frame.contentWindow.__PROTECTED_READER_BRIDGE__;
      const summary = bridge && bridge.getSummary ? bridge.getSummary() : null;
      return {
        pageLabel: summary ? summary.globalPageLabel : "",
        touchDebug: window.__protectedTouchDebug || null,
        turnDebug: window.__protectedTurnDebug || null
      };
    });
    console.log(JSON.stringify({ initial, afterFirstTap, afterSecondTap, afterRightTap }, null, 2));
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
