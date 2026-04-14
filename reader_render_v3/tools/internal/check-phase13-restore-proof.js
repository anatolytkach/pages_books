#!/usr/bin/env node

const { chromium } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

function getArgValue(name, fallback = "") {
  for (const item of process.argv.slice(2)) {
    if (item.startsWith(`--${name}=`)) return item.slice(name.length + 3);
  }
  return fallback;
}

const IFRAME_URL =
  getArgValue("iframe-url") ||
  "http://127.0.0.1:8788/reader/?id=19686";
const DIRECT_URL =
  getArgValue("direct-url") ||
  "http://127.0.0.1:8788/reader/?id=19686&unprotectedRenderHost=direct";
const EXECUTABLE_PATH =
  getArgValue("executable-path") ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function launchBrowser() {
  return chromium.launch({
    headless: true,
    executablePath: EXECUTABLE_PATH
  });
}

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : null;
}

async function installAudit(page) {
  await page.addInitScript(() => {
    window.__DIRECT_RESTORE_AUDIT__ = {
      storageWrites: [],
      displayCalls: [],
      patched: false
    };

    try {
      const originalSetItem = window.localStorage.setItem.bind(window.localStorage);
      window.localStorage.setItem = function (key, value) {
        try {
          window.__DIRECT_RESTORE_AUDIT__.storageWrites.push({
            ts: Date.now(),
            key: String(key || ""),
            value: String(value || "")
          });
        } catch (_error) {}
        return originalSetItem(key, value);
      };
    } catch (_error) {}

    const patchDisplay = () => {
      try {
        const proto =
          window.ePub &&
          window.ePub.Rendition &&
          window.ePub.Rendition.prototype;
        if (!proto || !proto.display || proto.__readerpubRestoreAuditPatched) return;
        proto.__readerpubRestoreAuditPatched = true;
        const originalDisplay = proto.display;
        proto.display = function (target) {
          const entry = {
            ts: Date.now(),
            target: target == null ? "" : String(target),
            status: "started"
          };
          try {
            window.__DIRECT_RESTORE_AUDIT__.displayCalls.push(entry);
          } catch (_error) {}
          let result;
          try {
            result = originalDisplay.apply(this, arguments);
          } catch (error) {
            entry.status = "threw";
            entry.error = String(error && error.message ? error.message : error);
            throw error;
          }
          if (result && typeof result.then === "function") {
            return result.then((value) => {
              entry.status = "resolved";
              return value;
            }).catch((error) => {
              entry.status = "rejected";
              entry.error = String(error && error.message ? error.message : error);
              throw error;
            });
          }
          entry.status = "resolved-sync";
          return result;
        };
      } catch (_error) {}
    };

    patchDisplay();
    const timer = setInterval(() => {
      patchDisplay();
      if (window.__DIRECT_RESTORE_AUDIT__.patched) clearInterval(timer);
    }, 50);
    setTimeout(() => clearInterval(timer), 10000);
  });
}

async function waitForReaderReady(page) {
  await page.waitForFunction(() => {
    try {
      return !!(
        window.reader &&
        window.reader.rendition &&
        typeof window.reader.rendition.currentLocation === "function" &&
        window.reader.settings &&
        window.reader.settings.bookKey
      );
    } catch (_error) {
      return false;
    }
  }, { timeout: 20000 });
  await page.waitForTimeout(4500);
}

async function snapshot(page, phase) {
  return page.evaluate(({ phase }) => {
    function currentLocation() {
      try {
        return clone(window.reader.rendition.currentLocation());
      } catch (_error) {
        return null;
      }
    }

    function clone(value) {
      return value ? JSON.parse(JSON.stringify(value)) : null;
    }

    const bookKey = String(window.reader?.settings?.bookKey || "");
    const storedValue = bookKey ? window.localStorage.getItem(bookKey) : null;
    const current = currentLocation();
    const pageCounter = String(document.querySelector("#page-count")?.textContent || "").trim();
    return {
      phase,
      bookKey,
      storedValue,
      currentLocation: current,
      pageCounter,
      audit: clone(window.__DIRECT_RESTORE_AUDIT__ || null),
      renderHost: window.__readerpubUnprotectedRenderHost || "iframe"
    };
  }, { phase });
}

async function clearStoredState(page) {
  await page.evaluate(() => {
    const bookKey = String(window.reader?.settings?.bookKey || "");
    if (bookKey) window.localStorage.removeItem(bookKey);
    if (window.__DIRECT_RESTORE_AUDIT__) {
      window.__DIRECT_RESTORE_AUDIT__.storageWrites = [];
      window.__DIRECT_RESTORE_AUDIT__.displayCalls = [];
    }
  });
}

async function performNextScenario(page) {
  await page.evaluate(async () => {
    await Promise.resolve(window.reader.rendition.next());
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await Promise.resolve(window.reader.rendition.next());
  });
  await page.waitForTimeout(1400);
}

async function performTocScenario(page) {
  await page.evaluate(async () => {
    function currentCfi() {
      try {
        const loc = window.reader.rendition.currentLocation();
        return loc && loc.start && loc.start.cfi ? String(loc.start.cfi) : "";
      } catch (_error) {
        return "";
      }
    }

    const beforeCfi = currentCfi();
    const links = Array.from(document.querySelectorAll("#tocView a[href]"))
      .filter((item) => {
        const href = String(item.getAttribute("href") || "");
        return href && href !== "#" && href !== window.location.hash;
      });

    for (const link of links) {
      link.click();
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const afterCfi = currentCfi();
      if (afterCfi && afterCfi !== beforeCfi) return;
    }
  });
  await page.waitForTimeout(1800);
}

function extractMeaningfulPosition(snapshotData) {
  const current = snapshotData && snapshotData.currentLocation;
  const start = current && current.start ? current.start : null;
  return {
    href: start && start.href ? String(start.href) : "",
    displayedPage: start && start.displayed ? Number(start.displayed.page || 0) : 0,
    displayedTotal: start && start.displayed ? Number(start.displayed.total || 0) : 0,
    cfi: start && start.cfi ? String(start.cfi) : "",
    pageCounter: snapshotData && snapshotData.pageCounter ? String(snapshotData.pageCounter) : ""
  };
}

function analyzeScenario(label, beforeReload, afterReload) {
  const before = extractMeaningfulPosition(beforeReload);
  const after = extractMeaningfulPosition(afterReload);
  const storageWrites = ((beforeReload.audit && beforeReload.audit.storageWrites) || [])
    .filter((entry) => entry && entry.key === beforeReload.bookKey);
  const displayCalls = (afterReload.audit && afterReload.audit.displayCalls) || [];
  const storedBefore = beforeReload.storedValue ? JSON.parse(beforeReload.storedValue) : null;
  const storedAfter = afterReload.storedValue ? JSON.parse(afterReload.storedValue) : null;
  const replayTarget = storedAfter && storedAfter.previousLocationCfi
    ? String(storedAfter.previousLocationCfi)
    : (storedBefore && storedBefore.previousLocationCfi ? String(storedBefore.previousLocationCfi) : "");
  const restoreParity =
    !!before.displayedPage &&
    before.displayedPage === after.displayedPage &&
    before.displayedTotal === after.displayedTotal &&
    before.pageCounter === after.pageCounter &&
    (!before.href || !after.href || before.href === after.href);

  let exactBlockerStage = "";
  if (!beforeReload.bookKey) exactBlockerStage = "book-key";
  else if (!storageWrites.length) exactBlockerStage = "storage-write";
  else if (!replayTarget) exactBlockerStage = "stored-value";
  else if (!displayCalls.some((entry) => entry && entry.target === replayTarget)) exactBlockerStage = "display-not-called";
  else if (displayCalls.some((entry) => entry && entry.target === replayTarget && (entry.status === "rejected" || entry.status === "threw"))) exactBlockerStage = "display-rejected";
  else if (!restoreParity) exactBlockerStage = "restored-outcome";

  const warnings = [];
  if (before.cfi && after.cfi && before.cfi !== after.cfi) warnings.push("cfi-differs-after-restore");
  if (displayCalls.length > 1) warnings.push("multiple-display-calls-after-reload");

  return {
    label,
    bookKey: beforeReload.bookKey,
    storedValueBeforeReload: storedBefore,
    storedValueAfterReload: storedAfter,
    writtenAt: storageWrites.length ? storageWrites[storageWrites.length - 1].ts : null,
    restoreAttemptStartedAt: displayCalls.length ? displayCalls[0].ts : null,
    replayValue: replayTarget,
    replayPromiseStatus: displayCalls.find((entry) => entry && entry.target === replayTarget)?.status || "",
    displayCalls,
    currentLocationBeforeReload: beforeReload.currentLocation,
    currentLocationAfterReload: afterReload.currentLocation,
    pageCounterBeforeReload: beforeReload.pageCounter,
    pageCounterAfterReload: afterReload.pageCounter,
    restoreNoop: !restoreParity,
    restored: restoreParity,
    delta: {
      beforePage: before.displayedPage,
      afterPage: after.displayedPage,
      beforeCounter: before.pageCounter,
      afterCounter: after.pageCounter
    },
    exactBlockerStage,
    warnings
  };
}

async function runScenario(browser, url, hostLabel, scenarioLabel, performer) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(String(error && error.message ? error.message : error));
  });
  await installAudit(page);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitForReaderReady(page);
  await clearStoredState(page);
  await performer(page);
  const beforeReload = await snapshot(page, "before-reload");
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForReaderReady(page);
  const afterReload = await snapshot(page, "after-reload");
  const result = analyzeScenario(`${hostLabel}-${scenarioLabel}`, beforeReload, afterReload);
  result.pageErrors = pageErrors.slice();
  result.hostType = hostLabel;
  result.ok = pageErrors.length === 0 && result.restored;
  await page.close();
  return result;
}

async function runHost(browser, url, hostLabel) {
  const nextReload = await runScenario(browser, url, hostLabel, "next-reload", performNextScenario);
  const tocReload = await runScenario(browser, url, hostLabel, "toc-reload", performTocScenario);
  const exactBlockerStage = nextReload.exactBlockerStage || tocReload.exactBlockerStage || "";
  const warnings = []
    .concat(nextReload.warnings || [])
    .concat(tocReload.warnings || []);
  return {
    hostType: hostLabel,
    ok: !!(nextReload.ok && tocReload.ok),
    restoreParity: !!(nextReload.restored && tocReload.restored),
    exactBlockerStage,
    warnings: Array.from(new Set(warnings)),
    scenarios: {
      nextReload,
      tocReload
    }
  };
}

(async () => {
  const browser = await launchBrowser();
  try {
    const iframe = await runHost(browser, IFRAME_URL, "iframe");
    const direct = await runHost(browser, DIRECT_URL, "direct");
    const failedDomains = [];
    const warnings = [];
    if (!iframe.restoreParity) failedDomains.push("iframe-restore");
    if (!direct.restoreParity) failedDomains.push("direct-restore");
    if (
      iframe.scenarios.nextReload.pageCounterAfterReload &&
      direct.scenarios.nextReload.pageCounterAfterReload &&
      iframe.scenarios.nextReload.pageCounterAfterReload !== direct.scenarios.nextReload.pageCounterAfterReload
    ) {
      warnings.push("iframe-and-direct-next-reload-page-counter-diverge");
    }

    const result = {
      ok: failedDomains.length === 0,
      restoreParity: direct.restoreParity,
      failedDomains,
      exactBlockerStage: direct.exactBlockerStage || iframe.exactBlockerStage || "",
      warnings,
      iframe,
      direct
    };

    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
