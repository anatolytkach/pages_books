const HOST_BRIDGE_METHOD_NAMES = [
  "getSummary",
  "getDebugLayoutState",
  "nextPage",
  "prevPage",
  "preparePageTurnPreviews",
  "goToToc",
  "goToAnnotation",
  "restoreFromToken",
  "goToGlobalOffset",
  "getFootnoteAtClientPoint",
  "getLinkAtClientPoint",
  "getMediaAtClientPoint",
  "copySelection",
  "exportSelectionForUserAction",
  "captureSelectionForUserAction",
  "captureSelectionForNote",
  "selectAutomationSample",
  "createHighlight",
  "addNoteToSelection",
  "addNoteFromCapturedSelection",
  "addNoteFromRangeDescriptor",
  "deleteAnnotation",
  "clearSelection",
  "exportNotesSharePayload",
  "searchBook",
  "goToSearchResult",
  "searchNextResult",
  "searchPrevResult",
  "clearSearch",
  "getSearchResults",
  "getPageNumbersForGlobalOffsets",
  "getReadAloudPayload",
  "setTheme",
  "setFontScale",
  "setFontMode"
];

const HOST_BRIDGE_EVENT_METHOD_NAMES = [
  "subscribe",
  "unsubscribe",
  "getSupportedEvents",
  "getEventHistory",
  "getLastEventPayload"
];

function wrapHostBridgeMethods(handlers = {}) {
  const wrapped = {};
  for (const methodName of [...HOST_BRIDGE_METHOD_NAMES, ...HOST_BRIDGE_EVENT_METHOD_NAMES]) {
    const handler = handlers[methodName];
    if (typeof handler !== "function") continue;
    wrapped[methodName] = (...args) => handler(...args);
  }
  return wrapped;
}

export function createProtectedReaderHostBridge(handlers = {}, options = {}) {
  const methods = wrapHostBridgeMethods(handlers);
  return Object.freeze({
    channel: "protected-reader-host-bridge-v1",
    transport: "in-process",
    bridgeShape: "protected-host-bridge-v1",
    hostBridgeMode: "direct",
    implementedMethods: Object.keys(methods),
    eventApi: "reader-contract-events-v1",
    getHostBridgeInfo:
      typeof options.getHostBridgeInfo === "function"
        ? options.getHostBridgeInfo
        : () => ({
            hostBridgeMode: "direct",
            implementedMethods: Object.keys(methods)
          }),
    ...methods
  });
}

export function listProtectedReaderHostBridgeMethods() {
  return HOST_BRIDGE_METHOD_NAMES.slice();
}
