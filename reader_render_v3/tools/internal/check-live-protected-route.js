#!/usr/bin/env node

const { chromium } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

function getArgValue(name, fallback = "") {
  for (const item of process.argv.slice(2)) {
    if (item.startsWith(`--${name}=`)) return item.slice(name.length + 3);
  }
  return fallback;
}

async function getMetaMap(page) {
  return await page.evaluate(() => {
    const dl = document.querySelector("#runtime-meta");
    if (!dl) return {};
    const out = {};
    const children = [...dl.children];
    for (let index = 0; index < children.length; index += 2) {
      const dt = children[index];
      const dd = children[index + 1];
      if (dt && dd) out[dt.textContent.trim()] = dd.textContent.trim();
    }
    return out;
  });
}

async function main() {
  const inputUrl = getArgValue("url");
  if (!inputUrl) {
    throw new Error("Missing --url=<live_protected_url>");
  }

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

  const response = await page.goto(inputUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const snapshot = await page.evaluate(() => {
    const root = document.querySelector(".reader-frame");
    return {
      href: window.location.href,
      pathname: window.location.pathname,
      title: document.title,
      bodyText: (document.body?.textContent || "").trim().slice(0, 400),
      hasRuntimeMeta: !!document.querySelector("#runtime-meta"),
      hasProtectedCanvas: !!document.querySelector("#reader-canvas"),
      hasViewer: !!document.querySelector("#viewer") || !!document.querySelector(".viewer") || !!document.querySelector("#viewerStack"),
      hasIntegrationSummary: !!document.querySelector("#integration-summary"),
      statusText: (document.querySelector("#status")?.textContent || "").trim(),
      frameTags: root ? [...root.children].map((item) => item.tagName) : [],
      frameText: root ? (root.textContent || "").trim() : "",
      readerMode: document.documentElement?.dataset?.readerMode || ""
    };
  });
  const meta = await getMetaMap(page);

  let routeKind = "unknown";
  if ((response && response.status() >= 400) || /not found/i.test(snapshot.bodyText)) {
    routeKind = "not-found";
  } else if (
    /\/reader_render_v3\/integration\/protected-reader(?:\.html)?$/.test(snapshot.pathname) &&
    (snapshot.hasRuntimeMeta || snapshot.hasProtectedCanvas || snapshot.readerMode.startsWith("protected"))
  ) {
    routeKind = "integrated-protected";
  } else if (snapshot.hasViewer && !snapshot.hasRuntimeMeta && !snapshot.hasProtectedCanvas) {
    routeKind = "old-reader";
  }

  const result = {
    ok:
      routeKind === "integrated-protected" &&
      snapshot.hasProtectedCanvas === true &&
      String(snapshot.frameText || "").trim() === "" &&
      debugRequests.length === 0,
    routeKind,
    responseStatus: response ? response.status() : 0,
    finalUrl: snapshot.href,
    statusText: snapshot.statusText,
    readerMode: snapshot.readerMode || "unknown",
    meta,
    frameInfo: {
      tags: snapshot.frameTags,
      text: snapshot.frameText
    },
    debugRequests
  };

  console.log(JSON.stringify(result, null, 2));

  await page.close();
  await context.close();
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
