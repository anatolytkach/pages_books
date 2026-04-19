import { createProtectedAnnotationRepository } from "../runtime/protected-annotation-repository.js";
import { serializeRangeDescriptor } from "../runtime/protected-range-serialization.js";
import { renderChunkToCanvas } from "../runtime/protected-canvas-renderer.js?v=20260416-protected-render-padding-1";
import { createProtectedWorkerClient } from "../runtime/protected-worker-client.js";
import { loadProtectedBook, loadProtectedChunkModel } from "../runtime/protected-book-model.js";
import { parseRestoreToken } from "../runtime/protected-global-location.js";
import { reconstructCrossChunkRangeText } from "../runtime/protected-cross-chunk-model.js";
import { reconstructVisibleWindow } from "../runtime/protected-text-reconstruction.js";
import { resolveProductionPayloadFromRoute } from "../reader_new/protected-host-routing.js";
import {
  buildProtectedSyncTransport,
  normalizeProtectedSyncTransportHandoff
} from "../runtime/protected-sync-transport.js";
import { downloadJsonFile, readTextFile } from "../runtime/protected-file-transfer.js";
import { createProtectedDriveTransport } from "../runtime/protected-drive-transport.js";
import { createInitialProtectedDriveState } from "../runtime/protected-drive-state.js";

export const protectedReaderEntryConfig = window.__PROTECTED_READER_ENTRY__ || null;

export const DEFAULT_PROTECTED_READER_ARTIFACT =
  (protectedReaderEntryConfig && protectedReaderEntryConfig.artifactRoot) ||
  "../artifacts/protected-books/19686";

export function normalizeProtectedReaderFontMode(value) {
  return String(value || "").trim().toLowerCase() === "serif" ? "serif" : "sans";
}

export function normalizeProtectedReaderGeneration(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? Math.floor(next) : fallback;
}

function getInitialFontScale() {
  try {
    if (protectedReaderEntryConfig && Number.isFinite(Number(protectedReaderEntryConfig.fontScale))) {
      const configured = Number(protectedReaderEntryConfig.fontScale);
      if (configured > 0) {
        return Math.max(0.8, Math.min(1.6, Number(configured.toFixed(2))));
      }
    }
  } catch (_error) {}
  try {
    const params = new URLSearchParams(window.location.search || "");
    const raw = Number(params.get("protectedFontScale") || "");
    if (Number.isFinite(raw) && raw > 0) {
      return Math.max(0.8, Math.min(1.6, Number(raw.toFixed(2))));
    }
  } catch (_error) {}
  return 1;
}

function getInitialGenerationParam(paramName) {
  try {
    if (protectedReaderEntryConfig && Number.isFinite(Number(protectedReaderEntryConfig[paramName]))) {
      return normalizeProtectedReaderGeneration(protectedReaderEntryConfig[paramName], 1);
    }
  } catch (_error) {}
  try {
    const params = new URLSearchParams(window.location.search || "");
    return normalizeProtectedReaderGeneration(params.get(paramName), 1);
  } catch (_error) {}
  return 1;
}

function getInitialFontMode() {
  try {
    if (protectedReaderEntryConfig && protectedReaderEntryConfig.fontMode) {
      return normalizeProtectedReaderFontMode(protectedReaderEntryConfig.fontMode);
    }
  } catch (_error) {}
  try {
    const params = new URLSearchParams(window.location.search || "");
    return normalizeProtectedReaderFontMode(params.get("protectedFontMode") || params.get("fontMode"));
  } catch (_error) {}
  return "sans";
}

function shouldForceWorkerUnavailable() {
  if (protectedReaderEntryConfig && protectedReaderEntryConfig.forceWorkerUnavailable) return true;
  const params = new URLSearchParams(window.location.search);
  const value = String(params.get("worker") || params.get("protectedWorker") || "")
    .trim()
    .toLowerCase();
  return ["disabled", "fail", "broken"].includes(value);
}

export function createProtectedReaderRuntimeState() {
  const entryMode =
    protectedReaderEntryConfig && protectedReaderEntryConfig.mode
      ? String(protectedReaderEntryConfig.mode).trim().toLowerCase()
      : "";
  const isHostedProtectedMode = entryMode === "reader_new";
  const hostDiagnostics =
    protectedReaderEntryConfig && protectedReaderEntryConfig.readerNewDiagnostics
      ? protectedReaderEntryConfig.readerNewDiagnostics
      : null;
  return {
    artifactRoot: DEFAULT_PROTECTED_READER_ARTIFACT,
    bookSummary: null,
    tocItems: [],
    currentSnapshot: null,
    currentRenderDiagnostics: null,
    workerClient: createProtectedWorkerClient({
      forceUnavailable: shouldForceWorkerUnavailable()
    }),
    protectedBook: null,
    annotationRepository: null,
    annotationStore: null,
    selectedAnnotationId: null,
    importReport: null,
    pendingSelectionRangeDescriptor: null,
    entryConfig: protectedReaderEntryConfig,
    hostedMode: isHostedProtectedMode,
    readingStateSource:
      protectedReaderEntryConfig && protectedReaderEntryConfig.readingStateSource
        ? protectedReaderEntryConfig.readingStateSource
        : "protected-session",
    readingStateRestoreApplied: false,
    persistedReadingState: null,
    lastReadingStateSaveAt: null,
    shareImportStatus:
      protectedReaderEntryConfig && protectedReaderEntryConfig.shareImportStatus
        ? protectedReaderEntryConfig.shareImportStatus
        : "none",
    shareImportWarnings:
      protectedReaderEntryConfig && Array.isArray(protectedReaderEntryConfig.shareImportWarnings)
        ? protectedReaderEntryConfig.shareImportWarnings
        : [],
    sharePayloadParseStatus:
      protectedReaderEntryConfig && protectedReaderEntryConfig.shareImportStatus
        ? protectedReaderEntryConfig.shareImportStatus
        : "none",
    artifactLoadStatus: "idle",
    artifactSourceRequested:
      protectedReaderEntryConfig && protectedReaderEntryConfig.artifactSource
        ? String(protectedReaderEntryConfig.artifactSource)
        : "local",
    artifactRemoteMode:
      protectedReaderEntryConfig && protectedReaderEntryConfig.remoteMode
        ? String(protectedReaderEntryConfig.remoteMode)
        : "default",
    artifactSourceResolved: "unknown",
    artifactOriginResolved: "unknown",
    artifactFallbackDetected: "unknown",
    persistenceDiagnostics: null,
    syncAssessmentStatus: "none",
    lastFileTransferResult: null,
    currentSyncTransport: null,
    currentHandoffState: null,
    driveTransport: null,
    driveState: createInitialProtectedDriveState(),
    rolloutStatus: hostDiagnostics ? hostDiagnostics.rolloutStatus || null : null,
    rolloutEligibility: hostDiagnostics ? hostDiagnostics.eligibility || null : null,
    rolloutPolicy: hostDiagnostics ? hostDiagnostics.rollout || null : null,
    pilotStatus: hostDiagnostics ? hostDiagnostics.pilot || null : null,
    theme: "light",
    fontScale: getInitialFontScale(),
    fontMode: getInitialFontMode(),
    configGeneration: getInitialGenerationParam("protectedConfigGeneration"),
    layoutGeneration: getInitialGenerationParam("protectedLayoutGeneration"),
    renderMode: "shape",
    metricsMode: "shape",
    debugGeometry: false,
    pointerGesture: {
      active: false,
      selectionStarted: false,
      pointerId: null,
      pointerType: "",
      shiftKey: false,
      startClientX: 0,
      startClientY: 0,
      startCanvasPoint: null,
      moved: false,
      moveScheduled: false,
      pendingMovePoint: null,
      longPressTimer: null,
      touchSelectionPending: false,
      touchSelectionActive: false,
      touchSelectionClaimed: false
    },
    pointerRequestChain: Promise.resolve(),
    turnPreviewRefreshToken: 0,
    turnPreviewRefreshPromise: Promise.resolve(),
    resolvedCoverUrl: "",
    resolvedCoverLookupKey: "",
    resolvedCoverLookupPromise: Promise.resolve()
  };
}

export function isProtectedReaderEmbeddedShellMode(state) {
  return !!(
    state &&
    state.entryConfig &&
    (
      state.entryConfig.embeddedShellMode === "protected-shell" ||
      state.entryConfig.embeddedMode === "protected-shell"
    )
  );
}

export const isProtectedReaderEmbeddedOldShellMode = isProtectedReaderEmbeddedShellMode;

export function isProtectedReaderDriveUiDisabled(state) {
  return !!(state && state.entryConfig && state.entryConfig.driveMode === "disabled");
}

export function isProtectedReaderAutomationSafeMode(state) {
  return !!(state && state.entryConfig && state.entryConfig.automationSafe);
}

export function escapeProtectedReaderHtml(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export {
  buildProtectedSyncTransport,
  createProtectedAnnotationRepository,
  createProtectedDriveTransport,
  downloadJsonFile,
  loadProtectedBook,
  loadProtectedChunkModel,
  normalizeProtectedSyncTransportHandoff,
  parseRestoreToken,
  readTextFile,
  reconstructCrossChunkRangeText,
  reconstructVisibleWindow,
  renderChunkToCanvas,
  resolveProductionPayloadFromRoute,
  serializeRangeDescriptor
};
