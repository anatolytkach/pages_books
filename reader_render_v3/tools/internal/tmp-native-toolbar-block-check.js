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

async function checkDesktop(page) {
  return page.evaluate(() => {
    const frame = document.getElementById("protectedOldShellFrame");
    const doc = frame && frame.contentDocument;
    const canvas = doc && doc.getElementById("reader-canvas");
    if (!doc || !canvas) return { ok: false, reason: "missing-surface" };
    let prevented = false;
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 100,
      button: 2
    });
    const result = canvas.dispatchEvent(event);
    prevented = event.defaultPrevented || result === false;
    return { ok: prevented, prevented };
  });
}

async function checkTouch(browser) {
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    viewport: { width: 390, height: 844 }
  });
  const page = await context.newPage();
  await waitForReady(page);
  const result = await page.evaluate(() => {
    const frame = document.getElementById("protectedOldShellFrame");
    const doc = frame && frame.contentDocument;
    const canvas = doc && doc.getElementById("reader-canvas");
    if (!doc || !canvas) return { ok: false, reason: "missing-surface" };
    const event = new Event("longpress", { bubbles: true, cancelable: true });
    const result = canvas.dispatchEvent(event);
    return {
      ok: event.defaultPrevented || result === false,
      prevented: event.defaultPrevented || result === false
    };
  });
  await context.close();
  return result;
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  try {
    const page = await browser.newPage();
    await waitForReady(page);
    const desktop = await checkDesktop(page);
    const touch = await checkTouch(browser);
    console.log(JSON.stringify({ desktop, touch }, null, 2));
    await page.close();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
