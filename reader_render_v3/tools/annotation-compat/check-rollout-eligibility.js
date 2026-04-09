#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      index += 1;
    } else {
      out[key] = "1";
    }
  }
  return out;
}

function toArtifactManifestPath(artifactRoot) {
  const normalized = String(artifactRoot || "").replace(/^\/+/, "");
  return path.join(REPO_ROOT, normalized, "manifest.json");
}

function makeDocumentStub(driveConfigured) {
  return {
    querySelector(selector) {
      if (selector !== 'meta[name="google-drive-client-id"]') return null;
      return { content: driveConfigured ? "configured-client-id" : "" };
    }
  };
}

async function loadModules() {
  const routingModule = await import(pathToFileURL(path.join(REPO_ROOT, "reader_render_v3/integration/protected-reader-routing.js")).href);
  const rolloutModule = await import(pathToFileURL(path.join(REPO_ROOT, "reader_render_v3/integration/protected-reader-rollout.js")).href);
  const configModule = await import(pathToFileURL(path.join(REPO_ROOT, "reader_render_v3/integration/protected-reader-rollout-config.js")).href);
  const eligibilityModule = await import(pathToFileURL(path.join(REPO_ROOT, "reader_render_v3/integration/protected-reader-eligibility.js")).href);
  const statusModule = await import(pathToFileURL(path.join(REPO_ROOT, "reader_render_v3/integration/protected-reader-status.js")).href);
  return {
    parseProtectedIntegrationRoute: routingModule.parseProtectedIntegrationRoute,
    resolveProtectedReaderRollout: rolloutModule.resolveProtectedReaderRollout,
    normalizeRolloutConfig: configModule.normalizeRolloutConfig,
    assessProtectedReaderEligibility: eligibilityModule.assessProtectedReaderEligibility,
    buildProtectedReaderStatus: statusModule.buildProtectedReaderStatus
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url =
    args.url ||
    "http://127.0.0.1:8790/books/reader/?id=19686&reader=protected&renderMode=shape&metricsMode=shape";
  const driveConfigured = String(args.drive || "configured").trim().toLowerCase() !== "unconfigured";
  const workerArg = Object.prototype.hasOwnProperty.call(args, "worker")
    ? String(args.worker || "").trim().toLowerCase()
    : null;
  const workerAvailable = workerArg == null ? null : workerArg !== "unavailable";
  const hardCompatFailure = String(args.compat || "").trim().toLowerCase() === "hard-fail";

  const {
    parseProtectedIntegrationRoute,
    resolveProtectedReaderRollout,
    normalizeRolloutConfig,
    assessProtectedReaderEligibility,
    buildProtectedReaderStatus
  } = await loadModules();

  const route = parseProtectedIntegrationRoute(url);
  const rollout = resolveProtectedReaderRollout(
    route,
    normalizeRolloutConfig({
      globalEnabled: args.global ? args.global !== "off" : true,
      requireExplicitOptIn: args.optIn ? args.optIn !== "off" : true,
      internalOnly: true,
      allowAllBooks: args.allowAll === "1",
      allowBookIds: args.allowBooks ? String(args.allowBooks).split(",") : ["19686"],
      denyBookIds: args.denyBooks ? String(args.denyBooks).split(",") : []
    })
  );

  const eligibilityOptions = {
    hardCompatFailure,
    document: makeDocumentStub(driveConfigured),
    fetchImpl: async (artifactUrl) => {
      const manifestPath = toArtifactManifestPath(route.artifactRoot);
      return {
        ok: fs.existsSync(manifestPath),
        status: fs.existsSync(manifestPath) ? 200 : 404,
        url: artifactUrl
      };
    }
  };
  if (typeof workerAvailable === "boolean") {
    eligibilityOptions.workerAvailable = workerAvailable;
  }

  const eligibility = await assessProtectedReaderEligibility(route, rollout, eligibilityOptions);
  const status = buildProtectedReaderStatus(route, rollout, eligibility);

  console.log(
    JSON.stringify(
      {
        url,
        route: {
          bookId: route.bookId,
          oldReaderUrl: route.oldReaderUrl,
          protectedReaderUrl: route.protectedReaderUrl,
          explicitProtectedRequest: route.explicitProtectedRequest
        },
        rollout,
        eligibility,
        status
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
