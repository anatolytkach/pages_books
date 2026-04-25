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

async function getSummary(page) {
  return page.evaluate(() => {
    const frame = document.getElementById("protectedOldShellFrame");
    const bridge = frame && frame.contentWindow && frame.contentWindow.__PROTECTED_READER_BRIDGE__;
    const summary = bridge && bridge.getSummary ? bridge.getSummary() : null;
    const touchState = frame && frame.contentWindow ? frame.contentWindow.__PROTECTED_TOUCH_SELECTION__ || null : null;
    const toolbar = document.getElementById("selectionToolbar");
    const toolbarHidden = !toolbar || toolbar.classList.contains("hidden") || toolbar.getAttribute("aria-hidden") === "true";
    return {
      pageLabel: summary ? summary.globalPageLabel : "",
      selectionActive: !!(summary && summary.selectionActive),
      selectedChars: summary ? Number(summary.selectedChars || 0) : 0,
      focusedAnnotationId: summary && summary.focusedAnnotationId ? String(summary.focusedAnnotationId) : "",
      toolbarHidden,
      toolbarDebug: window.__protectedToolbarDebug || null,
      pendingToolbar: window.HOST_STATE ? window.HOST_STATE.pendingSelectionToolbar || null : null,
      touchState,
      touchDebug: window.__protectedTouchDebug || null
    };
  });
}

async function dispatchTouch(client, type, points) {
  await client.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: points,
    modifiers: 0
  });
}

async function runLongPressSelection(page) {
  const client = await page.context().newCDPSession(page);
  const box = await page.locator("#protectedOldShellHost").boundingBox();
  const startX = Math.round(box.x + box.width * 0.42);
  const startY = Math.round(box.y + box.height * 0.42);
  const moveX = startX + 28;
  const moveY = startY + 10;
  const before = await getSummary(page);
  await dispatchTouch(client, "touchStart", [{ x: startX, y: startY, radiusX: 2, radiusY: 2, force: 0.5, id: 1 }]);
  await page.waitForTimeout(620);
  const held = await getSummary(page);
  await dispatchTouch(client, "touchMove", [{ x: moveX, y: moveY, radiusX: 2, radiusY: 2, force: 0.5, id: 1 }]);
  await page.waitForTimeout(180);
  const during = await getSummary(page);
  await dispatchTouch(client, "touchEnd", []);
  await page.waitForFunction(() => {
    const frame = document.getElementById("protectedOldShellFrame");
    const bridge = frame && frame.contentWindow && frame.contentWindow.__PROTECTED_READER_BRIDGE__;
    const summary = bridge && bridge.getSummary ? bridge.getSummary() : null;
    return !!(summary && summary.selectionActive && Number(summary.selectedChars || 0) > 0);
  }, undefined, { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(180);
  const afterRelease = await getSummary(page);
  await page.waitForTimeout(900);
  const afterToolbarSettle = await getSummary(page);
  const tapPoint = await page.evaluate(() => {
    const host = document.getElementById("protectedOldShellHost");
    const toolbar = document.getElementById("selectionToolbar");
    const hostRect = host ? host.getBoundingClientRect() : { left: 0, top: 0, width: 300, height: 500 };
    const toolbarRect = toolbar && !toolbar.classList.contains("hidden")
      ? toolbar.getBoundingClientRect()
      : null;
    return {
      x: Math.round(toolbarRect ? Math.max(hostRect.left + 40, toolbarRect.left - 30) : hostRect.left + hostRect.width * 0.35),
      y: Math.round(toolbarRect ? Math.min(hostRect.top + hostRect.height - 40, toolbarRect.bottom + 26) : hostRect.top + hostRect.height * 0.42)
    };
  });
  await page.tap("body", { position: tapPoint });
  await page.waitForTimeout(220);
  const afterDismiss = await getSummary(page);
  await client.detach();
  return { before, held, during, afterRelease, afterToolbarSettle, afterDismiss };
}

async function runDesktopSelection(page) {
  const before = await getSummary(page);
  await page.evaluate(async () => {
    const frame = document.getElementById("protectedOldShellFrame");
    const doc = frame && frame.contentDocument;
    const win = frame && frame.contentWindow;
    const canvas = doc && doc.getElementById("reader-canvas");
    if (!doc || !win || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const startX = Math.round(rect.left + rect.width * 0.18);
    const startY = Math.round(rect.top + rect.height * 0.58);
    const endX = startX + 180;
    const endY = startY + 8;
    const down = new win.PointerEvent("pointerdown", {
      bubbles: true,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: 1,
      clientX: startX,
      clientY: startY
    });
    canvas.dispatchEvent(down);
    for (let i = 1; i <= 6; i += 1) {
      const move = new win.PointerEvent("pointermove", {
        bubbles: true,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX: Math.round(startX + ((endX - startX) * i) / 6),
        clientY: Math.round(startY + ((endY - startY) * i) / 6)
      });
      canvas.dispatchEvent(move);
      await new Promise((resolve) => win.setTimeout(resolve, 16));
    }
    const up = new win.PointerEvent("pointerup", {
      bubbles: true,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: 0,
      clientX: endX,
      clientY: endY
    });
    win.dispatchEvent(up);
  });
  await page.waitForTimeout(120);
  const during = await getSummary(page);
  await page.waitForTimeout(180);
  const afterRelease = await getSummary(page);
  await page.waitForTimeout(900);
  const afterToolbarSettle = await getSummary(page);
  return { before, during, afterRelease, afterToolbarSettle };
}

async function runShortSwipe(page) {
  const client = await page.context().newCDPSession(page);
  const box = await page.locator("#protectedOldShellHost").boundingBox();
  const startX = Math.round(box.x + box.width * 0.78);
  const startY = Math.round(box.y + box.height * 0.5);
  const midX = Math.round(box.x + box.width * 0.52);
  const endX = Math.round(box.x + box.width * 0.24);
  const before = await getSummary(page);
  await dispatchTouch(client, "touchStart", [{ x: startX, y: startY, radiusX: 2, radiusY: 2, force: 0.5, id: 1 }]);
  await page.waitForTimeout(30);
  await dispatchTouch(client, "touchMove", [{ x: midX, y: startY, radiusX: 2, radiusY: 2, force: 0.5, id: 1 }]);
  await page.waitForTimeout(30);
  await dispatchTouch(client, "touchMove", [{ x: endX, y: startY, radiusX: 2, radiusY: 2, force: 0.5, id: 1 }]);
  await page.waitForTimeout(30);
  await dispatchTouch(client, "touchEnd", []);
  await page.waitForTimeout(900);
  const after = await getSummary(page);
  await client.detach();
  return { before, after };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  try {
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });
    const desktopPage = await desktopContext.newPage();
    await waitForReady(desktopPage);
    const desktop = await runDesktopSelection(desktopPage);
    await desktopContext.close();

    const context = await browser.newContext({
      ...devices["iPhone 13"],
      viewport: { width: 390, height: 844 }
    });
    const page = await context.newPage();
    await waitForReady(page);
    const longPress = await runLongPressSelection(page);
    const swipe = await runShortSwipe(page);
    console.log(JSON.stringify({ desktop, longPress, swipe }, null, 2));
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
