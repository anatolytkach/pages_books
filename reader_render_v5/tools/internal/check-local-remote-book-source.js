#!/usr/bin/env node

const { chromium } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

function getArgValue(name, fallback = "") {
  for (const item of process.argv.slice(2)) {
    if (item.startsWith(`--${name}=`)) return item.slice(name.length + 3);
  }
  return fallback;
}

async function main() {
  const inputUrl = getArgValue("url");
  const executablePath =
    getArgValue("executable-path") || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (!inputUrl) throw new Error("Missing --url=<reader_url>");

  const bookResponses = [];
  const consoleErrors = [];
  const pageErrors = [];

  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        consoleErrors.push(`${message.type()}:${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      pageErrors.push(String(error && error.message ? error.message : error));
    });
    page.on("response", async (response) => {
      const url = response.url();
      if (!/\/books\/content\/45\//.test(url)) return;
      const headers = response.headers();
      bookResponses.push({
        url,
        status: response.status(),
        route: headers["x-reader-route"] || "",
        source: headers["x-reader-book-source"] || "",
        origin: headers["x-reader-book-origin"] || "",
        fallback: headers["x-reader-book-fallback"] || ""
      });
    });

    await page.goto(inputUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(3500);

    const snapshot = await page.evaluate(() => ({
      finalUrl: window.location.href,
      pathname: window.location.pathname,
      runtimePath: window.__readerpubUnprotectedRuntimePath || "",
      requestedContentSource: window.__readerpubContentSourceRequested || "",
      requestedRemoteMode: window.__readerpubRemoteMode || "",
      resolvedContentSource: window.__readerpubContentSourceResolved || "",
      resolvedFallback: window.__readerpubContentFallbackDetected || "",
      iframeCount: document.querySelectorAll("iframe").length,
      hasViewer: !!document.querySelector("#viewer") || !!document.querySelector("#viewerStack") || !!document.querySelector(".viewer"),
      bodyText: String(document.body?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 400)
    }));

    const result = {
      ok: bookResponses.some((item) => item.source === "remote" && item.fallback === "strict-remote-lock"),
      finalUrl: snapshot.finalUrl,
      pathname: snapshot.pathname,
      runtimePath: snapshot.runtimePath,
      requestedContentSource: snapshot.requestedContentSource,
      requestedRemoteMode: snapshot.requestedRemoteMode,
      resolvedContentSource: snapshot.resolvedContentSource,
      resolvedFallback: snapshot.resolvedFallback,
      iframeCount: snapshot.iframeCount,
      hasViewer: snapshot.hasViewer,
      bodyText: snapshot.bodyText,
      bookResponses,
      pageErrors,
      consoleErrors
    };

    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(String(error && error.stack ? error.stack : error));
  process.exit(1);
});
