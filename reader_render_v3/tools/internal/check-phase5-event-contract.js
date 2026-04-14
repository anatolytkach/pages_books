#!/usr/bin/env node

const { chromium } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

function getArgValue(name) {
  for (const item of process.argv.slice(2)) {
    if (item.startsWith(`--${name}=`)) return item.slice(name.length + 3);
  }
  return "";
}

const BRIDGE_URL =
  getArgValue("bridge-url") ||
  "http://127.0.0.1:8788/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape";
const ADAPTER_URL =
  getArgValue("adapter-url") ||
  "http://127.0.0.1:8788/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&protectedCompatTransport=adapter&renderMode=shape&metricsMode=shape";
const OLD_URL =
  getArgValue("old-url") ||
  "http://127.0.0.1:8788/reader/?id=19686";

const CANONICAL_EVENTS = [
  "pageChanged",
  "selectionChanged",
  "searchStateChanged",
  "annotationsChanged",
  "themeChanged",
  "readingPositionChanged",
  "toolbarStateChanged"
];

const FORBIDDEN_EVENTS = [
  "glyphLayoutUpdated",
  "chunkReflow",
  "protectedSelectionResolved",
  "internalRenderStateChanged",
  "workerStateChanged",
  "layoutInternalChanged"
];

function expectedTransport(url) {
  try {
    const parsed = new URL(url);
    const explicit = String(parsed.searchParams.get("protectedCompatTransport") || "").trim().toLowerCase();
    if (explicit === "adapter") return "adapter";
    if (
      String(parsed.searchParams.get("reader") || "").trim().toLowerCase() === "protected" &&
      String(parsed.searchParams.get("protectedUx") || "").trim().toLowerCase() === "old-shell"
    ) {
      return "adapter";
    }
    return "adapter";
  } catch (_error) {
    return "adapter";
  }
}

async function waitProtectedReady(page, transport, timeout = 20000) {
  await page.waitForFunction(
    ({ transport }) => {
      const directRoot = document.querySelector("#protectedDirectReaderRoot");
      const frame = document.querySelector("#protectedOldShellFrame");
      try {
        const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
        const surface = !win
          ? null
          : transport === "adapter"
            ? win.__PROTECTED_READER_COMPAT_ADAPTER__ || null
            : win.__PROTECTED_READER_BRIDGE__ || null;
        const summary = surface && typeof surface.getSummary === "function" ? surface.getSummary() : null;
        return !!(summary && summary.ready);
      } catch (_error) {
        return false;
      }
    },
    { transport },
    { timeout }
  );
}

async function evaluateProtected(page, transport, expression, args = []) {
  return await page.evaluate(
    async ({ transport, expression, args }) => {
      const directRoot = document.querySelector("#protectedDirectReaderRoot");
      const frame = document.querySelector("#protectedOldShellFrame");
      const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
      const surface = !win
        ? null
        : transport === "adapter"
          ? win.__PROTECTED_READER_COMPAT_ADAPTER__ || null
          : win.__PROTECTED_READER_BRIDGE__ || null;
      if (!surface) throw new Error(`Missing compat surface for ${transport}`);
      if (expression === "subscribe-capture") {
        if (typeof surface.subscribe !== "function") throw new Error("Compat surface does not expose subscribe()");
        if (Array.isArray(win.__PHASE5_EVENT_UNSUBSCRIBERS__)) {
          while (win.__PHASE5_EVENT_UNSUBSCRIBERS__.length) {
            const unsubscribe = win.__PHASE5_EVENT_UNSUBSCRIBERS__.pop();
            if (typeof unsubscribe === "function") unsubscribe();
          }
        }
        win.__PHASE5_EVENT_LOG__ = [];
        win.__PHASE5_EVENT_UNSUBSCRIBERS__ = [];
        const unsubscribe = surface.subscribe("*", (entry) => {
          try {
            win.__PHASE5_EVENT_LOG__.push({
              type: entry && entry.type ? String(entry.type) : "",
              payload: entry && entry.payload ? JSON.parse(JSON.stringify(entry.payload)) : null
            });
          } catch (_error) {}
        });
        if (typeof unsubscribe === "function") win.__PHASE5_EVENT_UNSUBSCRIBERS__.push(unsubscribe);
        return {
          supportedEvents: typeof surface.getSupportedEvents === "function" ? surface.getSupportedEvents() : [],
          eventHistory: typeof surface.getEventHistory === "function" ? surface.getEventHistory() : []
        };
      }
      if (expression === "event-log") {
        return Array.isArray(win.__PHASE5_EVENT_LOG__) ? win.__PHASE5_EVENT_LOG__ : [];
      }
      if (expression === "summary") {
        return typeof surface.getSummary === "function" ? surface.getSummary() : null;
      }
      if (typeof surface[expression] !== "function") throw new Error(`Missing compat method: ${expression}`);
      return await surface[expression](...args);
    },
    { transport, expression, args }
  );
}

async function runProtectedScenario(browser, url) {
  const transport = expectedTransport(url);
  console.log(`[phase5] protected:${transport}:open`);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(20000);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  console.log(`[phase5] protected:${transport}:wait-ready`);
  await waitProtectedReady(page, transport);
  console.log(`[phase5] protected:${transport}:subscribe`);
  const captureInfo = await evaluateProtected(page, transport, "subscribe-capture");

  console.log(`[phase5] protected:${transport}:nextPage`);
  await evaluateProtected(page, transport, "nextPage");
  console.log(`[phase5] protected:${transport}:dark`);
  await evaluateProtected(page, transport, "setTheme", ["dark"]);
  console.log(`[phase5] protected:${transport}:light`);
  await evaluateProtected(page, transport, "setTheme", ["light"]);
  console.log(`[phase5] protected:${transport}:select`);
  await evaluateProtected(page, transport, "selectAutomationSample");
  console.log(`[phase5] protected:${transport}:note`);
  await evaluateProtected(page, transport, "addNoteToSelection", [`phase5-${transport}`]);
  console.log(`[phase5] protected:${transport}:search`);
  await evaluateProtected(page, transport, "searchBook", ["the"]);
  console.log(`[phase5] protected:${transport}:clearSearch`);
  await evaluateProtected(page, transport, "clearSearch");

  console.log(`[phase5] protected:${transport}:wait-events`);
  await page.waitForFunction(() => {
    const directRoot = document.querySelector("#protectedDirectReaderRoot");
    const frame = document.querySelector("#protectedOldShellFrame");
    const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
    const log = win && Array.isArray(win.__PHASE5_EVENT_LOG__) ? win.__PHASE5_EVENT_LOG__ : [];
    const types = log.map((item) => item.type);
    return (
      types.includes("pageChanged") &&
      types.includes("readingPositionChanged") &&
      types.includes("themeChanged") &&
      types.includes("selectionChanged") &&
      types.includes("annotationsChanged") &&
      types.includes("searchStateChanged")
    );
  }, {}, { timeout: 5000 });

  const eventLog = await evaluateProtected(page, transport, "event-log");
  const summary = await evaluateProtected(page, transport, "summary");
  await page.close();
  return {
    transport,
    supportedEvents: captureInfo.supportedEvents || [],
    initialEventHistory: captureInfo.eventHistory || [],
    eventLog,
    summary
  };
}

function assertProtectedScenario(result) {
  if (!result || !result.summary || !result.summary.ready) {
    throw new Error(`Protected scenario did not reach ready state for ${result && result.transport ? result.transport : "unknown"}.`);
  }
  const supported = Array.isArray(result.supportedEvents) ? result.supportedEvents : [];
  for (const eventName of CANONICAL_EVENTS) {
    if (!supported.includes(eventName)) {
      throw new Error(`Missing canonical event ${eventName} on ${result.transport} surface.`);
    }
  }
  for (const eventName of FORBIDDEN_EVENTS) {
    if (supported.includes(eventName)) {
      throw new Error(`Forbidden internal event leaked on ${result.transport} surface: ${eventName}.`);
    }
  }
  const types = Array.isArray(result.eventLog) ? result.eventLog.map((item) => item.type) : [];
  for (const eventName of ["pageChanged", "readingPositionChanged", "themeChanged", "selectionChanged", "annotationsChanged", "searchStateChanged"]) {
    if (!types.includes(eventName)) {
      throw new Error(`Protected event ${eventName} was not observed on ${result.transport} path.`);
    }
  }
}

async function runUnprotectedScenario(browser, url) {
  console.log("[phase5] unprotected:open");
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(20000);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  console.log("[phase5] unprotected:wait-hub");
  await page.waitForFunction(() => !!(window.__READERPUB_READER_EVENTS__ && window.__READERPUB_READER_EVENTS__.supportedEvents), {}, { timeout: 15000 });
  await page.waitForTimeout(700);

  console.log("[phase5] unprotected:theme");
  await page.click("#themeToggle");
  console.log("[phase5] unprotected:search-input");
  const desktopInput = page.locator("#searchInputDesktop");
  const mobileInput = page.locator("#searchInputMobile");
  if (await desktopInput.isVisible().catch(() => false)) {
    await desktopInput.fill("the");
    await desktopInput.press("Enter");
  } else {
    await page.click("#searchOpen", { force: true });
    await mobileInput.fill("the");
    await mobileInput.press("Enter");
  }
  await page.waitForTimeout(600);
  console.log("[phase5] unprotected:sidebar");
  await page.click("#slider");
  await page.waitForTimeout(250);

  const result = await page.evaluate(() => {
    const hub = window.__READERPUB_READER_EVENTS__;
    return {
      supportedEvents: hub && Array.isArray(hub.supportedEvents) ? hub.supportedEvents.slice() : [],
      history: hub && typeof hub.getHistory === "function" ? hub.getHistory() : []
    };
  });
  await page.close();
  return result;
}

function assertUnprotectedScenario(result) {
  const supported = Array.isArray(result && result.supportedEvents) ? result.supportedEvents : [];
  for (const eventName of ["pageChanged", "themeChanged", "searchStateChanged", "sidebarStateChanged", "selectionChanged", "toolbarStateChanged", "annotationsChanged"]) {
    if (!supported.includes(eventName)) {
      throw new Error(`Unprotected shell does not advertise ${eventName}.`);
    }
  }
  const history = Array.isArray(result && result.history) ? result.history : [];
  const types = history.map((item) => item.type);
  for (const eventName of ["pageChanged", "themeChanged", "searchStateChanged", "sidebarStateChanged"]) {
    if (!types.includes(eventName)) {
      throw new Error(`Unprotected shell did not emit ${eventName}.`);
    }
  }
}

function compareProtectedParity(left, right) {
  const required = ["pageChanged", "readingPositionChanged", "themeChanged", "selectionChanged", "annotationsChanged", "searchStateChanged"];
  const leftTypes = new Set(left.eventLog.map((item) => item.type));
  const rightTypes = new Set(right.eventLog.map((item) => item.type));
  for (const eventName of required) {
    if (!leftTypes.has(eventName) || !rightTypes.has(eventName)) {
      throw new Error(`Bridge/adapter parity missing canonical event ${eventName}.`);
    }
  }
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });
  try {
    const bridgeResult = await runProtectedScenario(browser, BRIDGE_URL);
    assertProtectedScenario(bridgeResult);
    const adapterResult = await runProtectedScenario(browser, ADAPTER_URL);
    assertProtectedScenario(adapterResult);
    compareProtectedParity(bridgeResult, adapterResult);
    const unprotectedResult = await runUnprotectedScenario(browser, OLD_URL);
    assertUnprotectedScenario(unprotectedResult);
    console.log(JSON.stringify({ ok: true, bridgeResult, adapterResult, unprotectedResult }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
