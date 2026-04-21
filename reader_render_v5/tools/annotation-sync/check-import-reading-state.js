#!/usr/bin/env node

const fs = require("fs");
const { chromium } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

function getArgValue(name) {
  for (const item of process.argv.slice(2)) {
    if (item.startsWith(`--${name}=`)) return item.slice(name.length + 3);
  }
  return "";
}

async function getMetaMap(page) {
  return await page.evaluate(() => {
    const dl = document.querySelector("#runtime-meta");
    if (!dl) return {};
    const out = {};
    const children = [...dl.children];
    for (let i = 0; i < children.length; i += 2) {
      const dt = children[i];
      const dd = children[i + 1];
      if (dt && dd) out[dt.textContent.trim()] = dd.textContent.trim();
    }
    return out;
  });
}

async function waitReady(page) {
  await page.waitForFunction(() => {
    const path = window.location.pathname || "";
    const runtimeMeta = document.querySelector("#runtime-meta");
    const metaText = runtimeMeta ? runtimeMeta.textContent || "" : "";
    return (
      (path.includes("/reader_new/") ||
        path.includes("/books/reader_new/") ||
        /Reader host\s*reader_new/i.test(metaText)) &&
      !!document.querySelector("#runtime-meta dt") &&
      /Opened /.test(document.querySelector("#status")?.textContent || "")
    );
  });
}

async function main() {
  const payload = fs.readFileSync("/tmp/reader_render_v3_prod_notes.json", "utf8");
  const url =
    getArgValue("url") ||
    process.env.READER_V3_URL ||
    "http://127.0.0.1:8788/books/reader/?id=19686&reader=protected&renderMode=shape&metricsMode=shape";

  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });

  const page = await browser.newPage();
  const debugRequests = [];
  page.on("request", (req) => {
    if (req.url().includes("/debug/")) debugRequests.push(req.url());
  });

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitReady(page);

  await page.click("#next-page");
  await page.waitForFunction(() => {
    const dl = document.querySelector("#runtime-meta");
    return dl && (dl.textContent || "").includes("2 / 2");
  });
  const afterNext = await getMetaMap(page);

  await page.fill("#compat-json", payload);
  await page.click("#import-production-payload");
  await page.waitForFunction(() => {
    const status = document.querySelector("#status");
    return status && /Imported production payload/.test(status.textContent || "");
  });
  const afterImport = await getMetaMap(page);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitReady(page);
  const afterReload = await getMetaMap(page);

  console.log(JSON.stringify({
    afterNextPage: afterNext["Page"],
    afterImportPage: afterImport["Page"],
    afterImportAnnotations: afterImport["Annotations"],
    afterImportSaveTs: afterImport["Last save timestamp"],
    afterReloadPage: afterReload["Page"],
    afterReloadSource: afterReload["Reading state source"],
    afterReloadPersistedPageIndex: afterReload["Persisted page index"],
    afterReloadPersistedChunkId: afterReload["Persisted chunk id"],
    afterReloadPersistedGlobalOffset: afterReload["Persisted global offset"],
    afterReloadAnnotations: afterReload["Annotations"],
    debugRequests
  }, null, 2));

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
