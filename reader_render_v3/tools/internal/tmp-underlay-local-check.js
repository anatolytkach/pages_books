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

async function evalHost(page, fn, arg) {
  return page.evaluate(fn, arg);
}

async function prime(page) {
  await page.evaluate(async () => {
    const frame = document.getElementById("protectedOldShellFrame");
    const bridge = frame && frame.contentWindow && frame.contentWindow.__PROTECTED_READER_BRIDGE__;
    await bridge.preparePageTurnPreviews();
  });
}

async function desktop(page) {
  await prime(page);
  const snap = async () => page.evaluate(() => {
    const stack = document.getElementById("viewerStack");
    const current = document.getElementById("protectedOldShellCurrentLayer");
    const next = document.getElementById("viewer-next");
    const prev = document.getElementById("viewer-prev");
    const frame = document.getElementById("protectedOldShellFrame");
    const summary = frame && frame.contentWindow && frame.contentWindow.__PROTECTED_READER_BRIDGE__.getSummary();
    return {
      page: summary ? summary.globalPageLabel : "",
      stack: stack ? [...stack.classList] : [],
      currentCanvasCount: current ? current.querySelectorAll("canvas").length : 0,
      nextCanvasCount: next ? next.querySelectorAll("canvas").length : 0,
      prevCanvasCount: prev ? prev.querySelectorAll("canvas").length : 0,
      currentOpacity: current ? getComputedStyle(current).opacity : "",
      nextOpacity: next ? getComputedStyle(next).opacity : "",
      frameOpacity: frame ? getComputedStyle(frame).opacity : "",
      turnDebug: window.__protectedTurnDebug || null
    };
  });
  const before = await snap();
  await page.click("#next");
  await page.waitForTimeout(120);
  const first = await snap();
  await page.waitForTimeout(650);
  const afterFirst = await snap();
  await page.click("#next");
  await page.waitForTimeout(120);
  const second = await snap();
  await page.waitForTimeout(650);
  const afterSecond = await snap();
  return { before, first, afterFirst, second, afterSecond };
}

async function touch(browser) {
  const iphone = devices["iPhone 13"];
  const context = await browser.newContext({ ...iphone, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await waitForReady(page);
  await prime(page);
  const box = await page.locator("#protectedOldShellHost").boundingBox();
  const startX = box.x + box.width * 0.78;
  const midX = box.x + box.width * 0.55;
  const endX = box.x + box.width * 0.25;
  const y = box.y + box.height * 0.5;
  const mid = await page.evaluate(async ({ startX, midX, endX, y }) => {
    const host = document.getElementById("protectedOldShellHost");
    const dispatch = (type, x, y) => {
      const touch = new Touch({
        identifier: 1, target: host, clientX: x, clientY: y, radiusX: 2, radiusY: 2, force: 0.5
      });
      const touches = type === "touchend" ? [] : [touch];
      host.dispatchEvent(new TouchEvent(type, {
        bubbles: true, cancelable: true, touches, targetTouches: touches, changedTouches: [touch]
      }));
    };
    const sample = () => {
      const stack = document.getElementById("viewerStack");
      const current = document.getElementById("protectedOldShellCurrentLayer");
      const next = document.getElementById("viewer-next");
      const frame = document.getElementById("protectedOldShellFrame");
      const summary = frame && frame.contentWindow && frame.contentWindow.__PROTECTED_READER_BRIDGE__.getSummary();
      return {
        page: summary ? summary.globalPageLabel : "",
        stack: stack ? [...stack.classList] : [],
        currentCanvasCount: current ? current.querySelectorAll("canvas").length : 0,
        nextCanvasCount: next ? next.querySelectorAll("canvas").length : 0,
        currentOpacity: current ? getComputedStyle(current).opacity : "",
        nextOpacity: next ? getComputedStyle(next).opacity : "",
        frameOpacity: frame ? getComputedStyle(frame).opacity : ""
      };
    };
    dispatch("touchstart", startX, y);
    dispatch("touchmove", midX, y);
    await new Promise((r) => setTimeout(r, 90));
    const during = sample();
    dispatch("touchmove", endX, y);
    await new Promise((r) => setTimeout(r, 90));
    const later = sample();
    dispatch("touchend", endX, y);
    await new Promise((r) => setTimeout(r, 450));
    const after = sample();
    await new Promise((r) => setTimeout(r, 500));
    const settled = sample();
    return { during, later, after, settled };
  }, { startX, midX, endX, y });
  await context.close();
  return mid;
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
    const desktopResult = await desktop(page);
    const touchResult = await touch(browser);
    console.log(JSON.stringify({ desktop: desktopResult, touch: touchResult }, null, 2));
    await page.close();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
