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

async function getMetaMap(page) {
  return await page.evaluate(() => {
    const dl = document.querySelector("#runtime-meta");
    const out = {};
    if (!dl) return out;
    const children = [...dl.children];
    for (let index = 0; index < children.length; index += 2) {
      const dt = children[index];
      const dd = children[index + 1];
      if (dt && dd) out[dt.textContent.trim()] = dd.textContent.trim();
    }
    return out;
  });
}

async function waitReady(page) {
  await page.waitForFunction(() => {
    return (
      window.location.pathname.includes("/reader_render_v3/integration/protected-reader.html") &&
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
  await page.click("#check-drive-status");
  await page.waitForTimeout(600);

  const meta = await getMetaMap(page);
  const frameInfo = await page.evaluate(() => {
    const root = document.querySelector(".reader-frame");
    return {
      tags: root ? [...root.children].map((item) => item.tagName) : [],
      text: root ? (root.textContent || "").trim() : ""
    };
  });

  console.log(JSON.stringify({
    driveTransport: meta["Drive transport"],
    driveConfigured: meta["Drive configured"],
    driveAuthorized: meta["Drive authorized"],
    driveRemoteFile: meta["Drive remote file"],
    driveWarning: meta["Drive warning"],
    status: (await page.locator("#status").textContent() || "").trim(),
    frameInfo,
    debugRequests
  }, null, 2));

  await page.close();
  await context.close();
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
