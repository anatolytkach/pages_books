#!/usr/bin/env node

const { chromium } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

function getArgValue(name, fallback = "") {
  for (const item of process.argv.slice(2)) {
    if (item.startsWith(`--${name}=`)) return item.slice(name.length + 3);
  }
  return fallback;
}

const URL_TO_CHECK =
  getArgValue("url") ||
  "http://127.0.0.1:8788/reader/?id=19686&unprotectedRuntime=new";
const EXECUTABLE_PATH =
  getArgValue("executable-path") ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function launchBrowser() {
  return chromium.launch({ headless: true, executablePath: EXECUTABLE_PATH });
}

async function waitReady(page) {
  await page.waitForFunction(() => {
    return !!(
      window.__readerpubUnprotectedRuntimePath === "new" &&
      window.__READERPUB_UNPROTECTED_RUNTIME_STATE__ &&
      window.__READERPUB_UNPROTECTED_RUNTIME_STATE__.status === "ready"
    );
  }, { timeout: 20000 });
  await page.waitForTimeout(1200);
}

async function getState(page) {
  return page.evaluate(() => {
    const state = window.__READERPUB_UNPROTECTED_RUNTIME_STATE__ || null;
    return JSON.parse(JSON.stringify({
      location: state && state.location,
      pageCountText: String(document.querySelector("#page-count")?.textContent || "").trim(),
      storageKeys: Object.keys(window.localStorage || {}).filter((key) => key.indexOf("readerpub:unprotected-runtime-new:location:") === 0),
      storageValue: (() => {
        const key = Object.keys(window.localStorage || {}).find((item) => item.indexOf("readerpub:unprotected-runtime-new:location:") === 0);
        return key ? String(window.localStorage.getItem(key) || "") : "";
      })()
    }));
  });
}

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  try {
    await page.goto(URL_TO_CHECK, { waitUntil: "domcontentloaded" });
    await waitReady(page);

    const initial = await getState(page);
    await page.click("#next");
    await waitReady(page);
    const afterNext = await getState(page);

    const nextChanged = !!(
      initial.location &&
      afterNext.location &&
      (
        String(initial.location.pageToken) !== String(afterNext.location.pageToken) ||
        Number(initial.location.sectionIndex) !== Number(afterNext.location.sectionIndex)
      )
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitReady(page);
    const afterReload = await getState(page);

    let tocBeforeReload = null;
    let tocAfterReload = null;
    if (afterReload.location && Number(afterReload.location.sectionCount || 0) > 1) {
      await page.evaluate(() => window.__READERPUB_UNPROTECTED_RUNTIME_ADAPTER__.goToLocation({ sectionIndex: 1, pageIndex: 0 }));
      await waitReady(page);
      tocBeforeReload = await getState(page);
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitReady(page);
      tocAfterReload = await getState(page);
    }

    const exactBlockers = [];
    if (!nextChanged) exactBlockers.push("navigation-before-restore");
    if (!afterReload.location || String(afterReload.location.pageToken || "") !== String(afterNext.location && afterNext.location.pageToken || "")) {
      exactBlockers.push("reload-restore-mismatch");
    }
    if (
      tocBeforeReload &&
      tocAfterReload &&
      String(tocBeforeReload.location && tocBeforeReload.location.pageToken || "") !==
        String(tocAfterReload.location && tocAfterReload.location.pageToken || "")
    ) {
      exactBlockers.push("toc-reload-restore-mismatch");
    }
    if (!afterReload.storageValue) exactBlockers.push("missing-persisted-location");

    const result = {
      ok: exactBlockers.length === 0,
      domainStatus: exactBlockers.length === 0 ? "complete" : "blocked",
      blockers: exactBlockers,
      warnings: [],
      initial,
      afterNext,
      afterReload,
      tocBeforeReload,
      tocAfterReload
    };
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
  } finally {
    await page.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
