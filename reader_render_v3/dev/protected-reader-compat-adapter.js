const COMPAT_METHOD_NAMES = [
  "getSummary",
  "getDebugLayoutState",
  "nextPage",
  "prevPage",
  "preparePageTurnPreviews",
  "goToToc",
  "goToAnnotation",
  "restoreFromToken",
  "goToGlobalOffset",
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

const COMPAT_EVENT_METHOD_NAMES = [
  "subscribe",
  "unsubscribe",
  "getSupportedEvents",
  "getEventHistory",
  "getLastEventPayload"
];

function wrapCompatMethods(handlers = {}) {
  const wrapped = {};
  for (const methodName of [...COMPAT_METHOD_NAMES, ...COMPAT_EVENT_METHOD_NAMES]) {
    const handler = handlers[methodName];
    if (typeof handler !== "function") continue;
    wrapped[methodName] = (...args) => handler(...args);
  }
  return wrapped;
}

export function createProtectedReaderCompatAdapter(handlers = {}, options = {}) {
  const methods = wrapCompatMethods(handlers);
  return Object.freeze({
    channel: "protected-reader-compat-adapter-v1",
    transport: "in-process",
    bridgeShape: "protected-old-shell-v1",
    compatTransport: "adapter",
    implementedMethods: Object.keys(methods),
    eventApi: "reader-contract-events-v1",
    getCompatInfo:
      typeof options.getCompatInfo === "function"
        ? options.getCompatInfo
        : () => ({
            transport: "adapter",
            implementedMethods: Object.keys(methods)
          }),
    ...methods
  });
}

export function listProtectedReaderCompatMethods() {
  return COMPAT_METHOD_NAMES.slice();
}
