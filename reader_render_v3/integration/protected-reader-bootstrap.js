import {
  getProtectedShareMode,
  parseProtectedIntegrationRoute,
} from "./protected-reader-routing.js";
import { resolveProtectedReaderRollout } from "./protected-reader-rollout.js";
import { assessProtectedReaderEligibility } from "./protected-reader-eligibility.js";
import { buildProtectedReaderStatus } from "./protected-reader-status.js";
import { resolveProtectedReaderPilot } from "./protected-reader-pilot.js";

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
  const summary = document.querySelector("#integration-summary");
  if (summary) summary.textContent = status.message;
  const statusNode = document.querySelector("#status");
  if (statusNode) {
    statusNode.textContent = status.message;
    statusNode.dataset.state = "error";
  }
  const runtimeMeta = document.querySelector("#runtime-meta");
  setDlRows(runtimeMeta, [
    ["Reader mode", "protected"],
    ["Integration mode", "active"],
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

  const oldReaderLink = document.querySelector("#open-old-reader");
  if (oldReaderLink) oldReaderLink.setAttribute("href", route.oldReaderUrl);

  if (rolloutStatus.action === "redirect-to-old-reader-with-reason") {
    window.location.replace(rolloutStatus.fallbackUrl);
    return { action: rolloutStatus.action, route, rollout, eligibility, rolloutStatus };
  }

  if (rolloutStatus.action === "protected-unavailable-show-message") {
    renderProtectedUnavailable(rolloutStatus, route);
    return { action: rolloutStatus.action, route, rollout, eligibility, rolloutStatus };
  }

  const entryConfig = {
    mode: "integration",
    artifactRoot: route.artifactRoot,
    bookId: route.bookId,
    source: route.source,
    renderMode: route.renderMode,
    metricsMode: route.metricsMode,
    debugGeometry: route.debugGeometry,
    oldReaderUrl: route.oldReaderUrl,
    protectedReaderUrl: route.protectedReaderUrl,
    explicitRestoreToken: route.explicitRestoreToken || "",
    forceWorkerUnavailable: !!route.forceWorkerUnavailable,
    uxShellMode: route.uxShellMode,
    embeddedMode: route.embeddedMode,
    driveMode: route.driveMode,
    automationSafe: !!route.automationSafe,
    fontMode: getInitialFontModeFromLocation(),
    integrationRoute: route,
    shareState: route.shareState,
    compatImportPayload: null,
    compatShareImportStatus: getProtectedShareMode(route),
    compatShareWarnings: [],
    fallbackCfi: route.lastCfi || "",
    repositoryPersistence: {
      type: "localStorage",
      namespace: "reader_render_v3:integration"
    },
    readingStateSource: "protected-local-storage",
    integrationDiagnostics: {
      readerMode: "protected",
      integrationMode: "active",
      rolloutStatus,
      eligibility,
      rollout,
      pilot
    }
  };

  window.__PROTECTED_READER_ENTRY__ = entryConfig;
  document.documentElement.dataset.readerMode = "protected";

  const summary = document.querySelector("#integration-summary");
  if (summary) {
    summary.textContent = route.bookId
      ? `Integrated protected mode for book ${route.bookId}. ${rolloutStatus.message}`
      : rolloutStatus.message;
  }

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
