#!/usr/bin/env node

const path = require("node:path");
const { chromium } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");

function getArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const item = process.argv.find((value) => value.startsWith(prefix));
  return item ? item.slice(prefix.length) : fallback;
}

async function main() {
  const url = getArg("url", "https://reader.pub/books/reader/?id=45");
  const tocIndex = Number(getArg("index", "10"));
  const output = getArg("output", path.join("/tmp", `old-reader-style-${tocIndex}.png`));

  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });
  const page = await browser.newPage({ viewport: { width: 1660, height: 1280 } });
  page.setDefaultTimeout(30000);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!document.querySelector("#viewerStack iframe, #viewer iframe"));

  const menuButton = page.locator("#slider");
  if (await menuButton.count()) {
    await menuButton.click();
    await page.waitForTimeout(250);
  }
  await page.evaluate(() => {
    const panel = document.getElementById("overlay-toc");
    if (panel) {
      panel.classList.remove("hidden");
      panel.setAttribute("aria-hidden", "false");
    }
  });

  await page.evaluate((index) => {
    const menu = document.getElementById("overlay-menu");
    if (menu) {
      menu.classList.add("hidden");
      menu.setAttribute("aria-hidden", "true");
    }
    const links = [...document.querySelectorAll("#tocView .toc_link")];
    const link = links[index];
    if (!link) throw new Error(`TOC item ${index} not found`);
    link.click();
  }, tocIndex);
  await page.waitForTimeout(1800);

  const iframeHandle = await page.evaluateHandle(() => {
    const candidates = [...document.querySelectorAll("#viewerStack iframe, #viewer iframe")];
    return candidates.find((node) => {
      const parent = node.parentElement;
      if (!parent) return false;
      return parent.id !== "viewer-prev" && parent.id !== "viewer-next";
    }) || null;
  });
  const frame = await iframeHandle.contentFrame();
  if (!frame) throw new Error("Failed to resolve old-reader iframe.");

  const styleSnapshot = await frame.evaluate(() => {
    const chapterHeading = document.querySelector("h2, h1, h3");
    const firstParagraph = document.querySelector("p.pfirst, p.noindent, p");
    const dropcap = firstParagraph ? firstParagraph.querySelector(".dropcap") : null;
    const bodyStyle = getComputedStyle(document.body);
    function pick(node) {
      if (!node) return null;
      const style = getComputedStyle(node);
      return {
        text: (node.textContent || "").trim().slice(0, 160),
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        fontWeight: style.fontWeight,
        fontStyle: style.fontStyle,
        color: style.color,
        textAlign: style.textAlign,
        letterSpacing: style.letterSpacing,
        marginTop: style.marginTop,
        marginBottom: style.marginBottom,
        textIndent: style.textIndent
      };
    }
    return {
      body: {
        fontFamily: bodyStyle.fontFamily,
        fontSize: bodyStyle.fontSize,
        lineHeight: bodyStyle.lineHeight,
        color: bodyStyle.color,
        textAlign: bodyStyle.textAlign,
        backgroundColor: bodyStyle.backgroundColor
      },
      heading: pick(chapterHeading),
      firstParagraph: pick(firstParagraph),
      dropcap: pick(dropcap)
    };
  });

  await page.screenshot({ path: output, fullPage: true });
  console.log(JSON.stringify({ url, tocIndex, output, styleSnapshot }, null, 2));

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
