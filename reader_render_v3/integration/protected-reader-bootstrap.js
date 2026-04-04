import {
  getProtectedShareMode,
  parseProtectedIntegrationRoute,
} from "./protected-reader-routing.js";

export async function bootstrapProtectedReaderIntegration() {
  const route = parseProtectedIntegrationRoute(window.location.href);

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
      integrationMode: "active"
    }
  };

  window.__PROTECTED_READER_ENTRY__ = entryConfig;
  document.documentElement.dataset.readerMode = "protected";

  const oldReaderLink = document.querySelector("#open-old-reader");
  if (oldReaderLink) oldReaderLink.setAttribute("href", entryConfig.oldReaderUrl);

  const summary = document.querySelector("#integration-summary");
  if (summary) {
    summary.textContent = route.bookId
      ? `Integrated protected mode for book ${route.bookId}.`
      : "Integrated protected mode.";
  }

  return entryConfig;
}
