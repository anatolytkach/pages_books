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

function getLegacyFontModeStorageKey() {
  return "reader_new:protected-font-mode";
}

function getLegacyFontScaleStorageKey() {
  return "reader_new:protected-font-scale";
}

function getBookScopedFontModeStorageKey(bookId = "") {
  return `readerpub:protected-shell:font-mode:${String(bookId || "").trim()}`;
}

function getBookScopedFontScaleStorageKey(bookId = "") {
  return `readerpub:protected-shell:font-scale:${String(bookId || "").trim()}`;
}

function getProtectedFontBookIdCandidates(...values) {
  const candidates = [];
  const add = (value) => {
    const normalized = String(value || "").trim();
    if (!normalized || candidates.includes(normalized)) return;
    candidates.push(normalized);
    const numeric = Number(normalized);
    if (Number.isFinite(numeric) && numeric >= 90000000) {
      const publicId = String(Math.floor(numeric - 90000000));
      if (publicId && !candidates.includes(publicId)) candidates.push(publicId);
    }
  };
  values.forEach(add);
  return candidates;
}

function migratePriorProtectedScopedStorageValue({ bookId = "", currentKey = "", valueSuffix = "", normalize }) {
  try {
    const scopedBookId = String(bookId || "").trim();
    if (!scopedBookId || !currentKey || !valueSuffix || typeof normalize !== "function") return "";
    const currentValue = window.localStorage.getItem(currentKey);
    if (currentValue != null && String(currentValue).trim()) {
      return normalize(currentValue);
    }
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const candidateKey = String(window.localStorage.key(index) || "");
      if (!candidateKey || candidateKey === currentKey) continue;
      if (!candidateKey.startsWith("readerpub:protected-")) continue;
      if (!candidateKey.endsWith(valueSuffix)) continue;
      const legacyValue = window.localStorage.getItem(candidateKey);
      if (legacyValue == null || !String(legacyValue).trim()) continue;
      const normalizedValue = normalize(legacyValue);
      if (String(normalizedValue || "").trim()) {
        window.localStorage.setItem(currentKey, String(normalizedValue));
        return normalizedValue;
      }
    }
  } catch (_error) {
  }
  return "";
}

function getInitialFontModeFromEnvironment(...bookIdValues) {
  try {
    const url = new URL(window.location.href);
    const explicit = url.searchParams.get("protectedFontMode") || url.searchParams.get("fontMode");
    if (explicit != null && String(explicit).trim()) {
      return normalizeFontMode(explicit);
    }
  } catch (_error) {
  }
  const candidates = getProtectedFontBookIdCandidates(...bookIdValues);
  for (const scopedBookId of candidates) {
    try {
      const scoped = migratePriorProtectedScopedStorageValue({
        bookId: scopedBookId,
        currentKey: getBookScopedFontModeStorageKey(scopedBookId),
        valueSuffix: `:font-mode:${scopedBookId}`,
        normalize: normalizeFontMode
      });
      if (scoped) {
        return scoped;
      }
    } catch (_error) {
    }
  }
  try {
    return normalizeFontMode(window.localStorage.getItem(getLegacyFontModeStorageKey()));
  } catch (_error) {
  }
  return "sans";
}

function getDefaultFontScaleFromEnvironment() {
  try {
    const ua = (navigator && navigator.userAgent) ? navigator.userAgent : "";
    const isMobileUA = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
    const vw = (window.visualViewport && window.visualViewport.width) ? window.visualViewport.width : window.innerWidth;
    const isMobileViewport = !!vw && vw <= 1024;
    return (isMobileUA || isMobileViewport) ? 1.24 : 1.1;
  } catch (_error) {
  }
  return 1.1;
}

function getInitialFontScaleFromEnvironment(...bookIdValues) {
  try {
    const url = new URL(window.location.href);
    const explicit = Number(url.searchParams.get("protectedFontScale") || "");
    if (Number.isFinite(explicit) && explicit > 0) {
      return Math.max(0.8, Math.min(1.6, Number(explicit.toFixed(2))));
    }
  } catch (_error) {
  }
  const candidates = getProtectedFontBookIdCandidates(...bookIdValues);
  for (const scopedBookId of candidates) {
    try {
      const raw = migratePriorProtectedScopedStorageValue({
        bookId: scopedBookId,
        currentKey: getBookScopedFontScaleStorageKey(scopedBookId),
        valueSuffix: `:font-scale:${scopedBookId}`,
        normalize: (value) => {
          const stored = Number(value || "");
          if (!Number.isFinite(stored) || stored <= 0) return "";
          return String(Math.max(0.8, Math.min(1.6, Number(stored.toFixed(2)))));
        }
      });
      const stored = Number(raw || "");
      if (Number.isFinite(stored) && stored > 0) {
        return Math.max(0.8, Math.min(1.6, Number(stored.toFixed(2))));
      }
    } catch (_error) {
    }
  }
  try {
    const stored = Number(window.localStorage.getItem(getLegacyFontScaleStorageKey()) || "");
    if (Number.isFinite(stored) && stored > 0) {
      return Math.max(0.8, Math.min(1.6, Number(stored.toFixed(2))));
    }
  } catch (_error) {
  }
  return getDefaultFontScaleFromEnvironment();
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
    ["Unavailable reason", status.unavailableReason || "none"]
  ]);
}

export async function bootstrapProtectedReaderIntegration() {
  const route = parseProtectedIntegrationRoute(window.location.href);
  const rollout = resolveProtectedReaderRollout(route);
  const eligibility = await assessProtectedReaderEligibility(route, rollout);
  const pilot = resolveProtectedReaderPilot(route, rollout, eligibility);
  const rolloutStatus = buildProtectedReaderStatus(route, rollout, eligibility, pilot);

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
    shellMode: route.shellMode,
    embeddedShellMode: route.embeddedShellMode,
    renderHost: route.renderHost,
    driveMode: route.driveMode,
    automationSafe: !!route.automationSafe,
    fontMode: getInitialFontModeFromEnvironment(route.bookId, route.artifactBookId),
    fontScale: getInitialFontScaleFromEnvironment(route.bookId, route.artifactBookId),
    readerNewRoute: route,
    shareState: route.shareState,
    importPayload: null,
    shareImportStatus: getProtectedShareMode(route),
    shareImportWarnings: [],
    importReport: null,
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
