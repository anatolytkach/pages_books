#!/usr/bin/env node

const path = require("node:path");
const fs = require("node:fs");
const { launchChromium, resolvePlaywright } = require("./playwright-launch");
const { DEFAULT_PROTECTED_UI_SMOKE_URL } = require("./reader-new-test-fixture");

const { devices } = resolvePlaywright();

const DEFAULT_URL = DEFAULT_PROTECTED_UI_SMOKE_URL;

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const raw = item.slice(2);
    const eqIndex = raw.indexOf("=");
    if (eqIndex !== -1) {
      out[raw.slice(0, eqIndex)] = raw.slice(eqIndex + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      out[raw] = next;
      index += 1;
    } else {
      out[raw] = "true";
    }
  }
  return out;
}

function boolArg(value, fallback = false) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function getScenarioConfig(scenario) {
  switch (String(scenario || "desktop-shell")) {
    case "desktop-shell":
      return {
        scenario: "desktop-shell",
        deviceKind: "desktop",
        viewport: { width: 1440, height: 1100 },
        openControl: "",
        requiredSelectors: ["#viewerStack", "#protectedLibraryTrigger", "#searchOpen", "#protectedTypographyTrigger"]
      };
    case "desktop-settings":
      return {
        scenario: "desktop-settings",
        deviceKind: "desktop",
        viewport: { width: 1440, height: 1100 },
        openControl: "#protectedTypographyTrigger",
        requiredSelectors: ["#overlay-settings", "#protectedTypographyScale", "#protectedSettingsShareButton"]
      };
    case "desktop-library":
      return {
        scenario: "desktop-library",
        deviceKind: "desktop",
        viewport: { width: 1440, height: 1100 },
        openControl: "#protectedLibraryTrigger",
        requiredSelectors: ["#overlay-library", "#protectedLibraryTabs", "#protectedLibraryPane-toc"]
      };
    case "desktop-search":
      return {
        scenario: "desktop-search",
        deviceKind: "desktop",
        viewport: { width: 1440, height: 1100 },
        openControl: "#searchOpen",
        requiredSelectors: ["#searchDesktop", "#searchInputDesktop", "#searchActionDesktop"]
      };
    case "mobile-shell":
      return {
        scenario: "mobile-shell",
        deviceKind: "phone",
        deviceName: "iPhone 13",
        openControl: "",
        requiredSelectors: ["#viewerStack", "#protectedLibraryTrigger", "#searchOpen", "#protectedTypographyTrigger"]
      };
    case "mobile-settings":
      return {
        scenario: "mobile-settings",
        deviceKind: "phone",
        deviceName: "iPhone 13",
        openControl: "#protectedTypographyTrigger",
        requiredSelectors: ["#overlay-settings", "#protectedTypographyScale", "#protectedSettingsShareButton"]
      };
    case "tablet-settings":
      return {
        scenario: "tablet-settings",
        deviceKind: "tablet",
        deviceName: "iPad Pro 11",
        openControl: "#protectedTypographyTrigger",
        requiredSelectors: ["#overlay-settings", "#protectedTypographyScale", "#protectedSettingsShareButton"]
      };
    default:
      throw new Error(`Unsupported --scenario value: ${scenario}`);
  }
}

async function createContext(browser, config) {
  if (config.deviceName) {
    const preset = devices[config.deviceName];
    if (!preset) throw new Error(`Missing Playwright device preset: ${config.deviceName}`);
    return browser.newContext({ ...preset });
  }
  return browser.newContext({ viewport: config.viewport });
}

async function waitForReaderNewReady(page, timeout = 20000) {
  await page.waitForFunction(() => {
    const state = window.__READERPUB_READER_NEW_UI_STATE__;
    if (state && state.ready === true) return true;
    try {
      const directRoot = document.querySelector("#protectedDirectReaderRoot");
      const frame = document.querySelector("#protectedOldShellFrame");
      const win = directRoot ? window : (frame && frame.contentWindow ? frame.contentWindow : null);
      const surface = win ? (win.__PROTECTED_READER_HOST_BRIDGE__ || win.__PROTECTED_READER_BRIDGE__ || null) : null;
      const summary = surface && typeof surface.getSummary === "function" ? surface.getSummary() : null;
      return !!(summary && summary.ready);
    } catch (_error) {
      return false;
    }
  }, undefined, { timeout });
}

async function waitForShellControls(page, selectors, timeout = 15000) {
  for (const selector of selectors) {
    await page.waitForSelector(selector, { state: "attached", timeout });
  }
}

async function openControlIfNeeded(page, selector) {
  if (!selector) return;
  await page.waitForSelector(selector, { state: "attached", timeout: 15000 });
  try {
    await page.click(selector, { timeout: 5000 });
  } catch (_error) {
    await page.evaluate((targetSelector) => {
      const node = document.querySelector(targetSelector);
      if (!node) throw new Error(`Missing control: ${targetSelector}`);
      node.click();
    }, selector);
  }
}

async function collectSnapshot(page, config) {
  return page.evaluate(({ scenario }) => {
    const overlayState = (id) => {
      const node = document.querySelector(id);
      if (!node) return null;
      const style = getComputedStyle(node);
      return {
        hiddenClass: node.classList.contains("hidden"),
        ariaHidden: node.getAttribute("aria-hidden"),
        display: style.display,
        visibility: style.visibility
      };
    };
    const shareButton = document.getElementById("protectedSettingsShareButton");
    const serif = document.getElementById("protectedTypographySerif");
    const sans = document.getElementById("protectedTypographySans");
    const activeTypography = (serif && serif.classList.contains("is-active")) ? serif : sans;
    const activeSample = activeTypography ? activeTypography.querySelector(".sample") : null;
    const activeLabel = activeTypography ? activeTypography.querySelector(".label") : null;
    const slider = document.getElementById("protectedTypographyScale");
    const uiState = window.__READERPUB_READER_NEW_UI_STATE__ || null;
    return {
      scenario,
      href: window.location.href,
      htmlClasses: document.documentElement.className,
      bodyClasses: document.body.className,
      uiState,
      shell: {
        hasViewerStack: !!document.getElementById("viewerStack"),
        hasLibraryTrigger: !!document.getElementById("protectedLibraryTrigger"),
        hasSearchOpen: !!document.getElementById("searchOpen"),
        hasTypographyTrigger: !!document.getElementById("protectedTypographyTrigger")
      },
      overlays: {
        settings: overlayState("#overlay-settings"),
        library: overlayState("#overlay-library"),
        search: overlayState("#overlay-search")
      },
      settings: {
        shareLabel: shareButton ? String(shareButton.textContent || "").trim() : "",
        shareDisabled: shareButton ? !!shareButton.disabled : null,
        sliderAccent: slider ? getComputedStyle(slider).accentColor : "",
        sliderBackgroundImage: slider ? getComputedStyle(slider).backgroundImage : "",
        activeSampleColor: activeSample ? getComputedStyle(activeSample).color : "",
        activeLabelColor: activeLabel ? getComputedStyle(activeLabel).color : "",
        footerVisible: !!(shareButton && shareButton.getBoundingClientRect().height > 0)
      },
      search: {
        searchOpen: document.body.classList.contains("search-open"),
        searchMinimized: document.body.classList.contains("search-minimized"),
        desktopInputVisible: !!(document.getElementById("searchInputDesktop") && getComputedStyle(document.getElementById("searchInputDesktop")).display !== "none"),
        mobileBarVisible: !!(document.getElementById("searchbar") && getComputedStyle(document.getElementById("searchbar")).display !== "none")
      }
    };
  }, config);
}

function evaluateSnapshot(snapshot, config) {
  const blockers = [];
  if (!snapshot || !snapshot.shell || !snapshot.shell.hasViewerStack) blockers.push("viewer-stack-missing");
  if (!snapshot.uiState || snapshot.uiState.ready !== true) blockers.push("reader-new-ui-not-ready");
  for (const selector of config.requiredSelectors) {
    switch (selector) {
      case "#overlay-settings":
        if (!snapshot.overlays.settings || snapshot.overlays.settings.hiddenClass) blockers.push("settings-overlay-hidden");
        break;
      case "#overlay-library":
        if (!snapshot.overlays.library || snapshot.overlays.library.hiddenClass) blockers.push("library-overlay-hidden");
        break;
      case "#overlay-search":
        if (!snapshot.overlays.search || snapshot.overlays.search.hiddenClass) blockers.push("search-overlay-hidden");
        break;
      case "#searchDesktop":
        if (!snapshot.search || !snapshot.search.searchOpen) blockers.push("legacy-search-not-open");
        break;
      case "#protectedSettingsShareButton":
        if (!snapshot.settings.shareLabel) blockers.push("settings-share-button-missing");
        break;
      default:
        break;
    }
  }
  if (config.scenario === "desktop-settings") {
    if (snapshot.settings.shareLabel !== "Copy link to book") blockers.push(`desktop-share-label:${snapshot.settings.shareLabel || "missing"}`);
  }
  if (config.scenario === "mobile-settings" || config.scenario === "tablet-settings") {
    if (snapshot.settings.shareLabel !== "Share book") blockers.push(`mobile-share-label:${snapshot.settings.shareLabel || "missing"}`);
  }
  return blockers;
}

async function maybeSaveScreenshot(page, screenshotPath) {
  const normalized = String(screenshotPath || "").trim();
  if (!normalized) return "";
  const absolute = path.isAbsolute(normalized) ? normalized : path.resolve(process.cwd(), normalized);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  await page.screenshot({ path: absolute, fullPage: true });
  return absolute;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = getScenarioConfig(args.scenario || "desktop-shell");
  const url = String(args.url || DEFAULT_URL).trim() || DEFAULT_URL;
  const screenshotRequested = boolArg(args.screenshot, false);
  const screenshotPath = args["screenshot-path"] || "";

  const browser = await launchChromium({
    headless: boolArg(args.headless, true)
  });
  const context = await createContext(browser, config);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await waitForReaderNewReady(page, 20000);
    await waitForShellControls(page, ["#viewerStack", "#protectedTypographyTrigger"], 15000);
    await openControlIfNeeded(page, config.openControl);
    await waitForShellControls(page, config.requiredSelectors, 15000);
    await page.waitForTimeout(150);
    const snapshot = await collectSnapshot(page, config);
    const blockers = evaluateSnapshot(snapshot, config);
    const finalScreenshotPath = screenshotRequested || screenshotPath
      ? await maybeSaveScreenshot(page, screenshotPath || `reader_render_v3/tmp/${config.scenario}.png`)
      : "";
    const result = {
      ok: blockers.length === 0,
      scenario: config.scenario,
      url,
      blockers,
      screenshotPath: finalScreenshotPath,
      snapshot
    };
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
