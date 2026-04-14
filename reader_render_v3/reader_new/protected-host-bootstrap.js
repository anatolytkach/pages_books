import {
  getProtectedShareMode,
  parseProtectedIntegrationRoute,
} from "./protected-host-routing.js";
import { resolveProtectedReaderRollout } from "./protected-host-rollout.js";
import { assessProtectedReaderEligibility } from "./protected-host-eligibility.js";
import { buildProtectedReaderStatus } from "./protected-host-status.js";
import { resolveProtectedReaderPilot } from "./protected-host-pilot.js";

function normalizeFontMode(value) {
  return String(value || "").trim().toLowerCase() === "serif" ? "serif" : "sans";
}

function getInitialFontModeFromLocation() {
  try {
    const url = new URL(window.location.href);
    return normalizeFontMode(url.searchParams.get("protectedFontMode") || url.searchParams.get("fontMode"));
  } catch (_error) {
    return "sans";
  }
}

function setDlRows(container, rows) {
  if (!container) return;
  container.replaceChildren();
  for (const [label, value] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value == null ? "" : String(value);
    container.append(dt, dd);
  }
}

function renderProtectedUnavailable(status, route) {
  document.documentElement.dataset.readerMode = "protected-unavailable";
  const statusNode = document.querySelector("#status");
  if (statusNode) {
    statusNode.textContent = status.message;
    statusNode.dataset.state = "error";
  }
  const runtimeMeta = document.querySelector("#runtime-meta");
  setDlRows(runtimeMeta, [
    ["Reader mode", "protected"],
    ["Reader host", "reader_new"],
    ["Rollout enabled", status.rolloutEnabled ? "yes" : "no"],
    ["Eligibility status", status.status],
    ["Rollout decision", status.action],
    ["Pilot status", status.pilotStatus || "none"],
    ["Pilot certified", status.pilotCertified ? "yes" : "no"],
    ["Book allowed", status.bookAllowed ? "yes" : "no"],
    ["Protected artifact", status.artifactAvailable ? "yes" : "no"],
    ["Worker available", status.workerAvailable ? "yes" : "no"],
    ["Drive configured", status.driveConfigured ? "yes" : "no"],
    ["Fallback reason", status.fallbackReason || "none"],
    ["Fallback target", route.oldReaderUrl]
  ]);
}

export async function bootstrapProtectedReaderIntegration() {
  const route = parseProtectedIntegrationRoute(window.location.href);
  const rollout = resolveProtectedReaderRollout(route);
  const eligibility = await assessProtectedReaderEligibility(route, rollout);
  const pilot = resolveProtectedReaderPilot(route, rollout, eligibility);
  const rolloutStatus = buildProtectedReaderStatus(route, rollout, eligibility, pilot);

  if (rolloutStatus.action === "redirect-to-old-reader-with-reason") {
    window.location.replace(rolloutStatus.fallbackUrl);
    return { action: rolloutStatus.action, route, rollout, eligibility, rolloutStatus };
  }

  if (rolloutStatus.action === "protected-unavailable-show-message") {
    renderProtectedUnavailable(rolloutStatus, route);
    return { action: rolloutStatus.action, route, rollout, eligibility, rolloutStatus };
  }

  const entryConfig = {
    mode: "reader_new",
    artifactRoot: route.artifactRoot,
    artifactSource: route.artifactSource || "local",
    remoteMode: route.remoteMode || "default",
    bookId: route.bookId,
    source: route.source,
    renderMode: route.renderMode,
    metricsMode: route.metricsMode,
    debugGeometry: route.debugGeometry,
    explicitRestoreToken: route.explicitRestoreToken || "",
    forceWorkerUnavailable: !!route.forceWorkerUnavailable,
    uxShellMode: route.uxShellMode,
    embeddedMode: route.embeddedMode,
    renderHost: route.renderHost,
    driveMode: route.driveMode,
    compatTransport: route.compatTransport,
    automationSafe: !!route.automationSafe,
    fontMode: getInitialFontModeFromLocation(),
    readerNewRoute: route,
    shareState: route.shareState,
    compatImportPayload: null,
    compatShareImportStatus: getProtectedShareMode(route),
    compatShareWarnings: [],
    fallbackCfi: route.lastCfi || "",
    repositoryPersistence: {
      type: "localStorage",
      namespace: "reader_render_v3:reader_new"
    },
    readingStateSource: "protected-local-storage",
    readerNewDiagnostics: {
      readerMode: "protected",
      hostMode: "reader_new",
      rolloutStatus,
      eligibility,
      rollout,
      pilot
    }
  };

  window.__PROTECTED_READER_ENTRY__ = entryConfig;
  document.documentElement.dataset.readerMode = "protected";

  return {
    action: rolloutStatus.action,
    entryConfig,
    route,
    rollout,
    eligibility,
    rolloutStatus,
    pilot
  };
}
