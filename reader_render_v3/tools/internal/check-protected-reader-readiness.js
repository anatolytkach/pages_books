#!/usr/bin/env node

const path = require("node:path");
const fs = require("node:fs");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const DEFAULT_URL = "http://127.0.0.1:8790/books/reader/?id=19686&reader=protected&renderMode=shape&metricsMode=shape";
const DEFAULT_OLD_URL = "http://127.0.0.1:8790/books/reader/?id=19686";

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const raw = item.slice(2);
    const eqIndex = raw.indexOf("=");
    if (eqIndex !== -1) {
      const rawKey = raw.slice(0, eqIndex);
      const inlineValue = raw.slice(eqIndex + 1);
      out[rawKey] = inlineValue;
      continue;
    }
    const rawKey = raw;
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      out[rawKey] = next;
      index += 1;
    } else {
      out[rawKey] = "true";
    }
  }
  return out;
}

function boolArg(value, fallback) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function normalizeProtectedReaderUrl(rawUrl) {
  const url = new URL(rawUrl || DEFAULT_URL);
  if (!url.searchParams.get("reader")) {
    url.searchParams.set("reader", "protected");
  }
  if (!url.searchParams.get("renderMode")) {
    url.searchParams.set("renderMode", "shape");
  }
  if (!url.searchParams.get("metricsMode")) {
    url.searchParams.set("metricsMode", "shape");
  }
  return url.toString();
}

function deriveReaderBasePath(rawUrl) {
  const url = new URL(rawUrl || DEFAULT_URL);
  if (url.pathname.startsWith("/reader/")) return "/reader/";
  if (url.hostname.endsWith(".pages.dev")) return "/reader/";
  return "/books/reader/";
}

function deriveOldReaderUrl(rawUrl) {
  const protectedUrl = new URL(rawUrl || DEFAULT_URL);
  const oldUrl = new URL(protectedUrl.toString());
  oldUrl.searchParams.delete("reader");
  return oldUrl.toString();
}

function parseJson(stdout) {
  const trimmed = String(stdout || "").trim();
  if (!trimmed) return null;
  const firstBrace = trimmed.indexOf("{");
  if (firstBrace === -1) {
    throw new Error(`Expected JSON output, got: ${trimmed.slice(0, 200)}`);
  }
  return JSON.parse(trimmed.slice(firstBrace));
}

async function runNodeScript(scriptPath, args = [], env = {}) {
  const result = await execFileAsync("node", [scriptPath, ...args], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ...env
    },
    maxBuffer: 10 * 1024 * 1024
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    json: parseJson(result.stdout)
  };
}

async function runNpm(args = []) {
  const result = await execFileAsync("npm", args, {
    cwd: REPO_ROOT,
    env: process.env,
    maxBuffer: 10 * 1024 * 1024
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function collectViolationsFromCopySurface(copySurface) {
  const violations = [];
  for (const [name, type] of Object.entries(copySurface.globalAvailability || {})) {
    if (type !== "undefined") violations.push(`${name}:${type}`);
  }
  if (copySurface.annotationImportContainsBuildCopyPayload) {
    violations.push("annotation-import-leaks-buildCopyPayload");
  }
  if (copySurface.handoffContainsBookTextField) {
    violations.push("handoff-leaks-text-like-fields");
  }
  if ((copySurface.frameText || "").trim()) {
    violations.push("reader-frame-has-text");
  }
  return violations;
}

async function runProtocolGuardCheck() {
  const modulePath = path.join(REPO_ROOT, "reader_render_v3/runtime/protected-worker-protocol.js");
  const protocol = await import(pathToFileURL(modulePath).href);
  const violations = [];
  try {
    protocol.createWorkerRequest("1", "requestCopyPayload", {});
    violations.push("generic-copy-method-allowed");
  } catch (error) {}
  try {
    protocol.sanitizeProtectedWorkerPayload("getRuntimeStatus", {
      renderPacket: { renderMode: "shape", pageText: "leak" }
    });
    violations.push("text-like-renderPacket-allowed");
  } catch (error) {}
  try {
    protocol.sanitizeProtectedWorkerPayload(protocol.PROTECTED_WORKER_METHODS.CREATE_ANNOTATION_FROM_CURRENT_SELECTION, {
      type: "note",
      anchor: { chunkId: "chunk-1", startOffset: 0, endOffset: 1, restoreToken: "rt" },
      metadata: { quote: "leak" }
    });
    violations.push("annotation-quote-leak-allowed");
  } catch (error) {}
  return {
    ok: violations.length === 0,
    violations
  };
}

function pathToFileURL(filePath) {
  const { pathToFileURL: convert } = require("node:url");
  return convert(filePath);
}

async function httpProbe(url) {
  try {
    const response = await fetch(url, { method: "GET", redirect: "follow" });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      containsProtectedRoute:
        /reader_render_v3\/integration\/protected-reader\.html/.test(response.url) ||
        /reader_render_v3\/integration\/protected-reader\.html/.test(text)
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error && error.message ? error.message : String(error)
    };
  }
}

async function runDriveLiveSection(url, requireDrive) {
  const { chromium } = require("/tmp/reader_render_v3_pw/node_modules/playwright-core");
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });
  const context = await browser.newContext({
    acceptDownloads: true
  });
  const page = await context.newPage();
  const debugRequests = [];
  page.on("request", (req) => {
    if (req.url().includes("/debug/")) debugRequests.push(req.url());
  });

  function getMetaMapLocal() {
    return page.evaluate(() => {
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

  async function triggerHarnessControl(selector) {
    await page.evaluate((targetSelector) => {
      const node = document.querySelector(targetSelector);
      if (!node) throw new Error(`Missing control ${targetSelector}`);
      node.click();
    }, selector);
  }

  async function waitReady() {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const path = window.location.pathname || "";
      const host = document.querySelector("#runtime-meta dd")?.textContent || "";
      return (
        (path.includes("/reader_new/") ||
          path.includes("/books/reader_new/") ||
          /reader_new/i.test(host)) &&
        !!document.querySelector("#runtime-meta dt") &&
        /Opened /.test(document.querySelector("#status")?.textContent || "")
      );
    });
  }

  async function ensureRangeSelection() {
    const attempts = [];
    for (const y of [80, 120, 160, 200, 240, 280, 320, 360, 420]) {
      attempts.push({ x1: 120, y, x2: 320 });
      attempts.push({ x1: 160, y, x2: 420 });
    }
    for (const attempt of attempts) {
      const isRange = await page.evaluate(({ x1, y, x2 }) => {
        const canvas = document.querySelector("#reader-canvas");
        if (!canvas) return false;
        const rect = canvas.getBoundingClientRect();
        const make = (type, clientX, clientY) => new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          buttons: type === "mouseup" ? 0 : 1
        });
        const startX = rect.left + x1;
        const startY = rect.top + y;
        const endX = rect.left + x2;
        canvas.dispatchEvent(make("mousedown", startX, startY));
        for (let step = 1; step <= 12; step += 1) {
          const nextX = startX + ((endX - startX) * step) / 12;
          canvas.dispatchEvent(make("mousemove", nextX, startY));
        }
        window.dispatchEvent(make("mouseup", endX, startY));
        return /range/i.test(document.querySelector("#selection-kind")?.textContent || "");
      }, attempt);
      if (isRange) return true;
    }
    return false;
  }

  try {
    await waitReady();
    await triggerHarnessControl("#check-drive-status");
    await page.waitForTimeout(800);
    let meta = await getMetaMapLocal();
    const availability = {
      transport: meta["Drive transport"] || "unknown",
      configured: meta["Drive configured"] || "unknown",
      authorized: meta["Drive authorized"] || "unknown",
      remoteFile: meta["Drive remote file"] || "unknown",
      warning: meta["Drive warning"] || "unknown"
    };

    if (availability.configured !== "yes" || availability.authorized !== "yes") {
      await page.close();
      await context.close();
      await browser.close();
      return {
        ok: requireDrive ? false : "skipped",
        details: {
          ...availability,
          reason: availability.configured !== "yes" ? "drive-unconfigured" : "drive-unauthorized",
          debugRequests
        }
      };
    }

    const selected = await ensureRangeSelection();
    if (!selected) {
      throw new Error("Failed to create selection for Drive upload.");
    }
    await triggerHarnessControl("#create-highlight");
    await page.waitForFunction(() => /Created highlight /.test(document.querySelector("#status")?.textContent || ""));
    await page.fill("#note-input", "drive readiness note");
    await page.click("#add-note-highlight");
    await page.waitForFunction(() => /Added note /.test(document.querySelector("#status")?.textContent || ""));
    await page.click("#next-page");
    await page.waitForFunction(() => {
      const dl = document.querySelector("#runtime-meta");
      return dl && /2 \/ 2/.test(dl.textContent || "");
    });

    const beforeUpload = await getMetaMapLocal();
    await page.click("#upload-drive-file");
    await page.waitForFunction(() => {
      const dl = document.querySelector("#runtime-meta");
      return dl && !/^(none|)$/.test((() => {
        const children = [...dl.children];
        const values = {};
        for (let index = 0; index < children.length; index += 2) {
          const dt = children[index];
          const dd = children[index + 1];
          if (dt && dd) values[dt.textContent.trim()] = dd.textContent.trim();
        }
        return values["Drive upload"] || "";
      })());
    });
    const afterUpload = await getMetaMapLocal();

    await page.click("#clear-local-state");
    await page.waitForFunction(() => /Cleared local protected state/.test(document.querySelector("#status")?.textContent || ""));
    await page.click("#download-drive-file");
    await page.waitForFunction(() => {
      const dl = document.querySelector("#runtime-meta");
      if (!dl) return false;
      const children = [...dl.children];
      const values = {};
      for (let index = 0; index < children.length; index += 2) {
        const dt = children[index];
        const dd = children[index + 1];
        if (dt && dd) values[dt.textContent.trim()] = dd.textContent.trim();
      }
      return !/^(none|)$/.test(values["Drive download"] || "");
    });
    const afterDownload = await getMetaMapLocal();

    await page.click("#apply-drive-file");
    await page.waitForFunction(() => {
      const dl = document.querySelector("#runtime-meta");
      if (!dl) return false;
      const children = [...dl.children];
      const values = {};
      for (let index = 0; index < children.length; index += 2) {
        const dt = children[index];
        const dd = children[index + 1];
        if (dt && dd) values[dt.textContent.trim()] = dd.textContent.trim();
      }
      return values["Drive apply"] === "applied";
    });
    const afterApply = await getMetaMapLocal();

    await page.close();
    await context.close();
    await browser.close();
    return {
      ok: true,
      details: {
        availability,
        beforeUpload: {
          page: beforeUpload["Page"],
          annotations: beforeUpload["Annotations"]
        },
        afterUpload: {
          upload: afterUpload["Drive upload"],
          fileId: afterUpload["Drive file id"],
          modified: afterUpload["Drive modified"]
        },
        afterDownload: {
          compatibility: afterDownload["Drive download"],
          warning: afterDownload["Drive warning"]
        },
        afterApply: {
          apply: afterApply["Drive apply"],
          page: afterApply["Page"],
          annotations: afterApply["Annotations"],
          source: afterApply["Reading state source"]
        },
        debugRequests
      }
    };
  } catch (error) {
    try { await page.close(); } catch (closeError) {}
    try { await context.close(); } catch (closeError) {}
    try { await browser.close(); } catch (closeError) {}
    return {
      ok: false,
      details: {
        error: error && error.message ? error.message : String(error),
        debugRequests
      }
    };
  }
}

function sectionOk(value) {
  return value === true || value === "skipped";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = normalizeProtectedReaderUrl(args.url || DEFAULT_URL);
  const oldUrl = args.oldUrl || deriveOldReaderUrl(url) || DEFAULT_OLD_URL;
  const readerPath = args["reader-path"] || deriveReaderBasePath(url);
  const headless = boolArg(args.headless, true);
  const requireDrive = boolArg(args["require-drive"], false);
  const liveUrl = args["live-url"] || "";
  const cloudflareUrl = args["cloudflare-url"] || liveUrl || "";
  const expectLiveProtected = boolArg(args["expect-live-protected"], false);
  const warnings = [];
  const regressions = [];

  if (!headless) {
    warnings.push("Runner currently uses headless browser tooling only; non-headless is not implemented.");
  }

  const build = await runNpm(["--prefix", "reader_render_v3", "run", "protected:build", "--", "--input", "books/content/19686", "--output", "artifacts/protected-books/19686"]);
  const validate = await runNpm(["--prefix", "reader_render_v3", "run", "protected:validate", "--", "--input", "artifacts/protected-books/19686"]);

  const selection = (await runNodeScript("reader_render_v3/tools/annotation-compat/check-selection-highlight-flow.js", [
    `--url=${url}`
  ])).json;

  const persistence = (await runNodeScript("reader_render_v3/tools/annotation-compat/check-local-persistence-e2e.js", [
    `--url=${url}`
  ])).json;

  const sync = (await runNodeScript("reader_render_v3/tools/annotation-compat/check-transport-roundtrip.js", [
    `--url=${url}`
  ])).json;

  const driveAvailability = (await runNodeScript("reader_render_v3/tools/annotation-compat/check-drive-ui-availability.js", [
    `--url=${url}`
  ])).json;

  const copySurface = (await runNodeScript("reader_render_v3/tools/annotation-compat/check-copy-surface-hardening.js", [
    `--url=${url}`
  ])).json;

  const rolloutMatrix = (await runNodeScript("reader_render_v3/tools/annotation-compat/check-rollout-matrix.js", [
    `--base-url=${new URL(url).origin}`,
    `--reader-path=${readerPath}`
  ])).json;

  const rolloutEligibility = (await runNodeScript("reader_render_v3/tools/annotation-compat/check-rollout-eligibility.js", [
    "--url", url,
    "--worker", "available"
  ])).json;

  const rolloutHardCompat = (await runNodeScript("reader_render_v3/tools/annotation-compat/check-rollout-eligibility.js", [
    "--url", url,
    "--worker", "available",
    "--compat", "hard-fail"
  ])).json;

  const importReadingState = fs.existsSync("/tmp/reader_render_v3_prod_notes.json")
    ? (await runNodeScript("reader_render_v3/tools/annotation-compat/check-import-reading-state.js", [
        `--url=${url}`
      ])).json
    : null;
  if (!importReadingState) {
    warnings.push("Skipped production-payload reading-state import smoke because /tmp/reader_render_v3_prod_notes.json is not present.");
  }

  const protocolHardening = await runProtocolGuardCheck();
  const drive = await runDriveLiveSection(url, requireDrive);
  const cloudflare = cloudflareUrl ? await httpProbe(cloudflareUrl) : null;
  if (cloudflareUrl && cloudflare && !cloudflare.ok) {
    warnings.push(`Cloudflare HTTP probe failed: ${cloudflare.error || cloudflare.status}`);
  }
  const liveRoute = liveUrl
    ? (await runNodeScript("reader_render_v3/tools/internal/check-live-protected-route.js", [
        `--url=${liveUrl}`
      ])).json
    : null;
  const liveRollout = liveUrl
    ? (await runNodeScript("reader_render_v3/tools/internal/check-live-rollout-smoke.js", [
        `--base-url=${new URL(liveUrl).origin}`,
        `--reader-path=${deriveReaderBasePath(liveUrl)}`
      ])).json
    : null;
  if (expectLiveProtected && !liveUrl) {
    regressions.push("live-route-required");
    warnings.push("Expected live protected route check, but --live-url was not provided.");
  }
  if (liveRoute && !liveRoute.ok) regressions.push("live-route");
  if (liveRollout && !liveRollout.ok) regressions.push("live-rollout");

  const securityViolations = [];
  if ((sync.frameInfo?.text || "").trim()) securityViolations.push("sync-frame-has-text");
  if ((driveAvailability.frameInfo?.text || "").trim()) securityViolations.push("drive-frame-has-text");
  if (sync.debugRequests?.length) securityViolations.push("sync-debug-requests");
  if (selection.debugRequests?.length) securityViolations.push("selection-debug-requests");
  if (driveAvailability.debugRequests?.length) securityViolations.push("drive-debug-requests");
  if (sync.syncFileHasTextLikeFields) securityViolations.push("sync-file-has-text-like-fields");

  const hardeningViolations = [
    ...collectViolationsFromCopySurface(copySurface),
    ...protocolHardening.violations
  ];

  const lifecycleOk =
    !!selection.selectionMetaIncludesRange &&
    selection.pageTwoGlobalOffset !== selection.initialGlobalOffset &&
    selection.backGlobalOffset === selection.initialGlobalOffset &&
    persistence.afterReloadSource === "protected-persisted" &&
    persistence.afterReloadGlobalOffset === persistence.afterNextGlobalOffset &&
    persistence.afterReopenGlobalOffset === persistence.afterNextGlobalOffset;
  if (!lifecycleOk) regressions.push("lifecycle");

  const selectionOk =
    selection.selectionMetaIncludesRange === true &&
    /Copied selection/.test(selection.afterCopyStatus || "") &&
    /Created highlight/.test(selection.afterHighlightStatus || "") &&
    /Added note/.test(selection.afterNoteStatus || "") &&
    Number(selection.annotationItems || 0) >= 1;
  if (!selectionOk) regressions.push("selection");

  const persistenceOk =
    persistence.afterReloadGlobalOffset === persistence.afterNextGlobalOffset &&
    persistence.afterReopenGlobalOffset === persistence.afterNextGlobalOffset &&
    persistence.afterImportGlobalOffset === persistence.afterNextGlobalOffset &&
    Number(persistence.afterImportAnnotations || 0) >= 1 &&
    String(persistence.afterReopenAnnotations || "") === String(persistence.afterImportAnnotations || "") &&
    persistence.syncFileHasTextLikeFields === false;
  if (!persistenceOk) regressions.push("persistence");

  const syncOk =
    sync.loadedCompatibility === "exact" &&
    !!String(sync.importedGlobalOffset || "").trim() &&
    sync.importedAnnotations === "2" &&
    sync.syncFileHasTextLikeFields === false;
  if (!syncOk) regressions.push("sync");

  const securityOk = securityViolations.length === 0;
  if (!securityOk) regressions.push("security");

  const hardeningOk = hardeningViolations.length === 0;
  if (!hardeningOk) regressions.push("hardening");

  const rolloutOk =
    rolloutMatrix.oldReaderDefault.protectedCanvas === false &&
    rolloutMatrix.protectedAllowed.meta["Rollout decision"] === "open-protected-reader" &&
    /protectedFallbackReason=ineligible-rollout-disabled/.test(rolloutMatrix.protectedRolloutDisabled.url || "") &&
    /protectedFallbackReason=ineligible-book-not-allowed/.test(rolloutMatrix.protectedDenylisted.url || "") &&
    rolloutMatrix.protectedWorkerUnavailable.meta["Rollout decision"] === "protected-unavailable-show-message" &&
    /protectedFallbackReason=ineligible-no-protected-artifact/.test(rolloutMatrix.protectedArtifactMissing.url || "") &&
    rolloutEligibility.status.action === "open-protected-reader" &&
    rolloutHardCompat.status.action === "redirect-to-old-reader-with-reason";
  if (!rolloutOk) regressions.push("rollout");

  const driveSectionOk = drive.ok === true || drive.ok === "skipped";
  if (!driveSectionOk) regressions.push("drive");
  if (requireDrive && drive.ok !== true) regressions.push("drive-required");
  const liveRouteOk = !expectLiveProtected || (!!liveRoute && liveRoute.ok === true);
  const liveRolloutOk = !expectLiveProtected || (!!liveRollout && liveRollout.ok === true);

  const result = {
    ok:
      lifecycleOk &&
      selectionOk &&
      persistenceOk &&
      syncOk &&
      securityOk &&
      hardeningOk &&
      rolloutOk &&
      (!requireDrive || drive.ok === true) &&
      liveRouteOk &&
      liveRolloutOk,
    sections: {
      lifecycle: {
        ok: lifecycleOk,
        details: {
          buildRan: /\"ok\": true/.test(build.stdout),
          validateRan: /\"ok\": true/.test(validate.stdout),
          initialPage: selection.initialPage,
          afterNextPage: selection.pageTwoPage,
          afterPrevPage: selection.backPage,
          afterReloadPage: persistence.afterReloadPage,
          afterReopenPage: persistence.afterReopenPage,
          afterReloadSource: persistence.afterReloadSource,
          importReadingState
        }
      },
      selection: {
        ok: selectionOk,
        details: selection
      },
      persistence: {
        ok: persistenceOk,
        details: persistence
      },
      sync: {
        ok: syncOk,
        details: sync
      },
      drive: {
        ok: drive.ok,
        details: {
          availability: driveAvailability,
          live: drive.details
        }
      },
      security: {
        ok: securityOk,
        violations: securityViolations,
        details: {
          frameInfo: sync.frameInfo,
          driveFrameInfo: driveAvailability.frameInfo,
          debugRequests: {
            selection: selection.debugRequests,
            sync: sync.debugRequests,
            drive: driveAvailability.debugRequests
          },
          cloudflare
        }
      },
      hardening: {
        ok: hardeningOk,
        violations: hardeningViolations,
        details: {
          copySurface,
          protocolHardening
        }
      },
      rollout: {
        ok: rolloutOk,
        details: {
          matrix: rolloutMatrix,
          eligibility: rolloutEligibility,
          hardCompat: rolloutHardCompat
        }
      },
      liveRoute: {
        ok: liveRouteOk,
        details: liveRoute
      },
      liveRollout: {
        ok: liveRolloutOk,
        details: liveRollout
      }
    },
    regressions,
    warnings
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
