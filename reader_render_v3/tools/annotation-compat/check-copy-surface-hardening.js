#!/usr/bin/env node

const { chromium } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

function getArgValue(name) {
  for (const item of process.argv.slice(2)) {
    if (item.startsWith(`--${name}=`)) return item.slice(name.length + 3);
  }
  return "";
}

const URL =
  getArgValue("url") ||
  process.env.READER_V3_URL ||
  "http://127.0.0.1:8788/books/reader/?id=19686&reader=protected&renderMode=shape&metricsMode=shape";

async function waitReady(page) {
  await page.waitForFunction(() => {
    const path = window.location.pathname || "";
    const runtimeMeta = document.querySelector("#runtime-meta");
    const metaText = runtimeMeta ? runtimeMeta.textContent || "" : "";
    return (
      (
        path.includes("/reader_new/") ||
        path.includes("/books/reader_new/") ||
        /Reader host\s*reader_new/i.test(metaText)
      ) &&
      !!document.querySelector("#runtime-meta dt") &&
      /Opened /.test(document.querySelector("#status")?.textContent || "")
    );
  });
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const debugRequests = [];
  page.on("request", (req) => {
    if (req.url().includes("/debug/")) debugRequests.push(req.url());
  });

  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await waitReady(page);

  const result = await page.evaluate(() => {
    const forbiddenGlobals = [
      "buildCopyPayload",
      "requestCopyPayload",
      "getPageText",
      "getChunkText",
      "getVisibleText"
    ];
    const globalAvailability = Object.fromEntries(
      forbiddenGlobals.map((name) => [name, typeof globalThis[name]])
    );
    const annotationText = document.querySelector("#annotation-import")?.value || "";
    const handoffText = document.querySelector("#handoff-state")?.value || "";
    return {
      globalAvailability,
      annotationImportContainsBuildCopyPayload: /buildCopyPayload/.test(annotationText),
      handoffContainsBookTextField: /"quote"|contextBefore|contextAfter|fullText|pageText/.test(handoffText),
      frameTags: [...(document.querySelector(".reader-frame")?.children || [])].map((item) => item.tagName),
      frameText: (document.querySelector(".reader-frame")?.textContent || "").trim()
    };
  });

  console.log(JSON.stringify({ ...result, debugRequests }, null, 2));

  await page.close();
  await context.close();
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
