#!/usr/bin/env node

const { chromium } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

function parseArgs(argv) {
  const args = { url: "" };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--url") args.url = argv[++i] || "";
  }
  return args;
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

async function main() {
  const args = parseArgs(process.argv);
  if (!args.url) throw new Error("Usage: debug-share-route-load.js --url <integrated-protected-reader-url>");

  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });
  const page = await browser.newPage();
  const consoleMessages = [];
  const responses = [];
  const debugRequests = [];
  page.on("console", (msg) => consoleMessages.push(`${msg.type()}: ${msg.text()}`));
  page.on("request", (req) => {
    if (req.url().includes("/debug/")) debugRequests.push(req.url());
  });
  page.on("response", (res) => {
    if (res.status() >= 400 || res.url().includes("/api/ns/") || res.url().includes("/notes-share/")) {
      responses.push({ url: res.url(), status: res.status() });
    }
  });

  await page.goto(args.url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);

  const meta = await getMetaMap(page);
  const snapshot = await page.evaluate(() => ({
    href: location.href,
    title: document.title,
    status: document.querySelector("#status")?.textContent.trim() || "",
    annotationCount: document.querySelector("#annotation-count")?.textContent.trim() || "",
    compatJson: document.querySelector("#compat-json")?.value || "",
    frameTags: [...(document.querySelector(".reader-frame")?.children || [])].map((node) => node.tagName),
    frameText: document.querySelector(".reader-frame")?.textContent.trim() || ""
  }));

  console.log(JSON.stringify({ url: args.url, snapshot, meta, responses, consoleMessages, debugRequests }, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
