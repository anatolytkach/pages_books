import { parseProtectedIntegrationRoute } from "./protected-host-routing.js?v=20260422-v5-fast-start-1";
import { resolveProtectedReaderRollout } from "./protected-host-rollout.js?v=20260416-protected-padding-2";
import { assessProtectedReaderEligibility } from "./protected-host-eligibility.js?v=20260416-protected-padding-2";
import { resolveProtectedReaderPilot } from "./protected-host-pilot.js?v=20260416-protected-padding-2";
import { buildProtectedReaderStatus } from "./protected-host-status.js?v=20260416-protected-padding-2";

const HOST_STYLE_ID = "protected-shell-host-css";
window.__PROTECTED_HOST_LOADED = true;
window.__PROTECTED_SHELL_HOST_LOADED = true;
window.__READERPUB_READER_NEW_UI_STATE__ = window.__READERPUB_READER_NEW_UI_STATE__ || {
  status: "boot-pending",
  ready: false,
  overlay: "",
  lastSummary: null,
  lastStatusText: "",
  routeHref: "",
  updatedAt: 0
};
const HOST_STATE = {
  route: null,
  rolloutStatus: null,
  lastSummary: null,
  lastContractEventAt: 0,
  hostEventUnsubscribe: [],
  activeConfigGeneration: 0,
  activeLayoutGeneration: 0,
  frame: null,
  turnCleanupTimer: null,
  loadingCount: 0,
  bookmarks: [],
  lastTocSignature: "",
  lastTocActiveId: "",
  lastTocCount: 0,
  lastNotesSignature: "",
  lastNotesCount: 0,
  fontScaleSynced: false,
  lastAppliedFontScale: 0,
  viewportFontScaleSyncTimer: null,
  fontModeSynced: false,
  lastAppliedFontMode: "sans",
  readerConfig: {
    fontMode: "sans",
    configGeneration: 0,
    layoutGeneration: 0
  },
  selectionToolbarTimer: null,
  selectionToolbarRevision: 0,
  selectionToolbarDismissSuppressUntil: 0,
  lastSelectionSignature: "",
  selectionStableCount: 0,
  pendingSelectionToolbar: null,
  releaseSelectionToolbarAnchor: null,
  lastSelectionReleaseAt: 0,
  suppressShellToggleUntil: 0,
  touchSelectionInProgress: false,
  suppressSelectionDismissUntil: 0,
  cachedSelectionActionState: null,
  suppressSelectionToolbarUntil: 0,
  selectionShare: {
    key: "",
    shareUrl: "",
    promise: null,
    pending: false,
    lastEndpoint: "",
    lastStatus: "",
    lastError: "",
    lastPayload: null,
    lastCopyValue: "",
    lastToolbarAction: ""
  },
  bookmarkRestoreInFlight: "",
  searchSidebarState: null,
  searchSidebarSubmitted: false,
  searchSidebarPendingQuery: "",
  searchSidebarForceEmpty: false,
  searchClearSuppressUntil: 0,
  searchReturnOriginToken: "",
  searchReturnOriginOffset: 0,
  bookMetadataLanguages: null,
  bookMetadataLanguagesPromise: null,
  bookMetadataLanguagesBookId: "",
  bookmarkPageLookupToken: 0,
  bookmarkPageLookupSignature: "",
  turnPreviewSyncTimer: null,
  turnPreviewPromise: null,
  lastTurnPreviewKey: "",
  turnInFlight: false,
  suppressSyntheticClickUntil: 0,
  suppressFootnoteSurfaceTapUntil: 0,
  footnotePreviewRequestToken: 0,
  footnotePopupKey: "",
  pendingShellToggleTimer: null,
  pendingShellToggleSource: "",
  lastShellToggleSource: "",
  lastShellToggleAt: 0,
  lastShellTogglePreHidden: false,
  imageViewerKey: "",
  imageViewerTransform: {
    scale: 1,
    x: 0,
    y: 0
  },
  imageViewerPointers: new Map(),
  imageViewerGesture: null,
  touchUiGuardInstalled: false,
  viewportEnvironmentInstalled: false,
  addressBarToggleInstalled: false,
  addressBarHidden: false,
  addressBarBaseline: 0,
  addressBarBaselineWidth: 0,
  tts: {
    active: false,
    token: 0
  },
  directSurfaceRoot: null,
  directRuntimeBootPromise: null
};

const BOOKMARK_STORAGE_PREFIX = "readerpub:protected-shell:bookmarks:";
const FONT_SCALE_STORAGE_PREFIX = "readerpub:protected-shell:font-scale:";
const FONT_MODE_STORAGE_PREFIX = "readerpub:protected-shell:font-mode:";
const HOST_TTS_VOICE_URI_STORAGE_KEY = "readerpub:protected-shell:tts:voice-uri";
const HOST_TTS_VOICE_LANG_STORAGE_KEY = "readerpub:protected-shell:tts:voice-lang";
const HOST_TTS_LANG_USER_SELECTED_STORAGE_KEY = "readerpub:protected-shell:tts:lang-user-selected";
const HOST_TTS_VOICE_USER_SELECTED_STORAGE_KEY = "readerpub:protected-shell:tts:voice-user-selected";
const PROTECTED_SEARCH_ICON_SRC = "icons/search.svg?v=20260303-icons-tight-x-3";
const PROTECTED_TOC_ICON_SRC = "/reader_render_v5/assets/toc.svg";
const PROTECTED_SETTINGS_ICON_SRC = "/reader_render_v5/assets/settings.svg";
const PROTECTED_THEME_ICON_SRC = "/reader_render_v5/assets/theme.svg";
const PROTECTED_SEARCH_BACK_ICON_SRC = "/reader_render_v5/assets/back.svg";
const PROTECTED_SEARCH_FIELD_ICON_SRC = PROTECTED_SEARCH_ICON_SRC;
const SEARCH_CHEVRON_LEFT_SVG = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M14.5 5.5L8 12l6.5 6.5"></path>
  </svg>
`;
const SEARCH_CHEVRON_RIGHT_SVG = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M9.5 5.5L16 12l-6.5 6.5"></path>
  </svg>
`;
const PROTECTED_MY_LIBRARY_ICON_SVG = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="12" cy="8" r="3.5"></circle>
    <path d="M4.5 19.5c1.9-3.7 5-5.5 7.5-5.5s5.6 1.8 7.5 5.5"></path>
  </svg>
`;
const PROTECTED_CATALOG_ICON_SVG = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M1.5 1.35c-.37.06-.7-.1-1.12.2C.09 1.76 0 2.03 0 2.49v13.25c0 .42-.02.9 0 1.32.02.39.25.66.52.8.3.15.83.1 1.22.1h5.3c.78 0 1.08-.08 1.51.48.1.12.22.24.33.33.7.53 1.38.41 2.23.41.39 0 .93.03 1.28-.05.29-.07.85-.23.57-.6-.2-.25-.37-.5-.55-.77-.32-.48-.7-1.13-.84-1.81-.13-.61-.09-1.89-.09-2.58V2.78c0-.64-.13-1.32.38-1.6.19-.1.33-.1.58-.1 1.77 0 3.53 0 5.3 0 .28 0 1.09-.04 1.3.02.32.07.59.34.6.72.02.88 0 1.78 0 2.66v5.96c0 .3.07.27.3.36.37.16.51.3.76.56.18.19.46-.06 1.12.16.28.1.22-.19.22-.4V2.49c0-.25 0-.37-.08-.57-.34-.75-1.15-.52-1.43-.57-.09-.17-.04-.19-.22-.47-.28-.43-.78-.73-1.35-.75-.45-.03-.95 0-1.4 0h-4.23c-.4 0-1-.03-1.37.03-.58.1-.8.42-.93.49-.06-.05-.11-.1-.18-.16-.07-.06-.13-.1-.22-.14C10.06.04 9.48.14 8.75.14H4.54c-.46 0-.96-.02-1.42 0-.66.03-1.23.42-1.49.98-.03.07-.06.18-.1.25Zm9.03 14.53c.02-.94 0-1.91 0-2.86V2.98c0-.31.04-1.15-.04-1.39-.06-.18-.18-.31-.31-.4-.19-.12-.34-.11-.6-.11H3.83c-.49 0-.93-.08-1.22.22-.3.3-.22.72-.22 1.2v11.48c0 .45-.07.97.18 1.25.3.33.63.26 1.16.26h4.31c.85 0 1.48-.08 2.24.26.04.02.2.1.25.11Zm11.64-1.97c-.01-.35.05-.7-.1-.98-.35-.72-1.3-.74-1.72-.14-.04.06-.07.1-.1.18-.02.06-.04.15-.07.2-.03-.34.05-.7-.1-1-.34-.7-1.28-.78-1.74-.11-.05.08-.15.32-.15.39-.02-.29 0-1.94 0-2.37 0-.23.02-.58-.01-.79-.14-.92-1.42-1.13-1.85-.3-.12.23-.12.38-.12.67v5.6c0 .24.03 1.45 0 1.58-.02.1-.15.13-.23.06l-.6-.61c-.39-.38-1.19-1.11-1.86-1.34-.47-.16-.96-.08-1.06.38-.18.86 1.21 2.58 1.65 3.13.5.63 1.33 1.52 1.9 2.08.17.15.27.25.42.39.46.46 1.39.92 2.09 1.11.47.12.95.13 1.47.12 1.71-.04 3.16-1.03 3.83-2.56.4-.93.34-1.75.34-2.87v-2.38c0-.3.01-.46-.11-.7-.3-.6-1.11-.72-1.57-.26-.23.23-.21.37-.3.51Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"></path>
  </svg>
`;
const PROTECTED_BOTTOM_CATALOG_ICON_SVG = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M6 5.5h9.5a2 2 0 0 1 2 2V18H8a2 2 0 0 0-2 2z"></path>
    <path d="M8 19.5H18a1.5 1.5 0 0 0 1.5-1.5V7.5"></path>
    <path d="M9 9h6"></path>
    <path d="M9 12h6"></path>
  </svg>
`;

function detectIosDevice() {
  try {
    const ua = navigator.userAgent || "";
    const iOS = /iP(ad|hone|od)/i.test(ua);
    const iPadOS = /Macintosh/i.test(ua) && navigator.maxTouchPoints && navigator.maxTouchPoints > 1;
    return !!(iOS || iPadOS);
  } catch (_error) {
    return false;
  }
}

function detectAndroidDevice() {
  try {
    return /Android/i.test(String((navigator && navigator.userAgent) || ""));
  } catch (_error) {
    return false;
  }
}

function getScreenMinDimension() {
  try {
    const sw = (screen && screen.width) ? screen.width : 0;
    const sh = (screen && screen.height) ? screen.height : 0;
    const minS = Math.min(sw || 0, sh || 0);
    if (minS) return minS;
  } catch (_error) {}
  try {
    return Math.min(window.innerWidth || 0, window.innerHeight || 0);
  } catch (_error) {
    return 0;
  }
}

function hasTouchLikeViewportHost() {
  try {
    if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
  } catch (_error) {}
  try {
    const ua = String((navigator && navigator.userAgent) || "");
    if (/Mobi|Android|iPhone|iPad|iPod|Tablet|Silk|Kindle|PlayBook/i.test(ua)) return true;
  } catch (_error) {}
  try {
    const maxTouchPoints = Number((navigator && navigator.maxTouchPoints) || 0);
    const fineHover = !!(window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches);
    if (maxTouchPoints > 0 && !fineHover) return true;
  } catch (_error) {}
  return false;
}

function isTabletViewportHost() {
  try {
    const ua = navigator.userAgent || "";
    const minS = getScreenMinDimension();
    if (/SM-T/i.test(ua)) return true;
    if (/iPad/i.test(ua)) return true;
    if (/Macintosh/i.test(ua) && navigator.maxTouchPoints && navigator.maxTouchPoints > 1) return minS >= 700;
    if (/Android/i.test(ua) && /Mobile/i.test(ua) && minS >= 600) return true;
    if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return minS >= 600;
    if (/Tablet|PlayBook|Silk|Kindle|Nexus 7|Nexus 9/i.test(ua)) return minS >= 600;
  } catch (_error) {}
  try {
    const coarse = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
    return !!(coarse && Math.min(window.innerWidth || 0, window.innerHeight || 0) >= 600);
  } catch (_error) {
    return false;
  }
}

function syncProtectedViewportEnvironment() {
  const root = document.documentElement;
  if (!root) return;
  let changed = false;
  try {
    const vv = window.visualViewport;
    const h = (vv && vv.height) ? vv.height : (window.innerHeight || 0);
    const w = (vv && vv.width) ? vv.width : (window.innerWidth || 0);
    if (h) {
      const next = `${h}px`;
      changed = changed || root.style.getPropertyValue("--app-vh") !== next;
      root.style.setProperty("--app-vh", next);
    }
    if (w) {
      const next = `${w}px`;
      changed = changed || root.style.getPropertyValue("--app-vw") !== next;
      root.style.setProperty("--app-vw", next);
    }
  } catch (_error) {}
  try {
    const touchLike = hasTouchLikeViewportHost();
    const isTablet = !!(touchLike && isTabletViewportHost());
    const isPhone = !!(touchLike && !isTablet);
    const isDesktop = !isPhone && !isTablet;
    root.classList.toggle("is-ios", detectIosDevice());
    root.classList.toggle("is-android", detectAndroidDevice());
    root.classList.toggle("is-tablet", !!isTablet);
    root.classList.toggle("is-phone", !!isPhone);
    root.classList.toggle("is-desktop", !!isDesktop);
    root.classList.toggle("tablet-portrait", !!(isTablet && (window.innerHeight || 0) > (window.innerWidth || 0)));
    root.classList.toggle("tablet-landscape", !!(isTablet && !((window.innerHeight || 0) > (window.innerWidth || 0))));
  } catch (_error) {}
  if (changed) {
    try {
      window.dispatchEvent(new CustomEvent("readerpub:protected-viewport-sync"));
    } catch (_error) {}
    scheduleViewportFontScaleResync("viewport");
  }
}

function installProtectedViewportEnvironmentSync() {
  if (HOST_STATE.viewportEnvironmentInstalled) return;
  HOST_STATE.viewportEnvironmentInstalled = true;
  syncProtectedViewportEnvironment();
  window.addEventListener("resize", syncProtectedViewportEnvironment, { passive: true });
  window.addEventListener("orientationchange", () => {
    syncProtectedViewportEnvironment();
    scheduleViewportFontScaleResync("orientationchange");
  }, { passive: true });
  try {
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", syncProtectedViewportEnvironment, { passive: true });
    }
  } catch (_error) {}
}

function normalizeGeneration(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? Math.floor(next) : fallback;
}

function ensureHostGenerations() {
  if (HOST_STATE.activeConfigGeneration <= 0) HOST_STATE.activeConfigGeneration = 1;
  if (HOST_STATE.activeLayoutGeneration <= 0) HOST_STATE.activeLayoutGeneration = 1;
  HOST_STATE.readerConfig.configGeneration = HOST_STATE.activeConfigGeneration;
  HOST_STATE.readerConfig.layoutGeneration = HOST_STATE.activeLayoutGeneration;
}

function setReaderNewUiSmokeState(patch = {}) {
  const current = window.__READERPUB_READER_NEW_UI_STATE__ || {};
  const next = {
    ...current,
    ...patch,
    updatedAt: Date.now()
  };
  if (!("routeHref" in patch)) {
    try {
      next.routeHref = window.location.href;
    } catch (_error) {}
  }
  window.__READERPUB_READER_NEW_UI_STATE__ = next;
  return next;
}

function classifyBridgeUpdate(method) {
  if (method === "setFontScale" || method === "setFontMode") return "layout-affecting";
  if (
    method === "searchBook" ||
    method === "goToSearchResult" ||
    method === "searchNextResult" ||
    method === "searchPrevResult" ||
    method === "clearSearch"
  ) {
    return "redraw-only";
  }
  return "state-only";
}

function allocateBridgeGeneration(method) {
  ensureHostGenerations();
  const updateClass = classifyBridgeUpdate(method);
  if (updateClass === "layout-affecting") {
    HOST_STATE.activeConfigGeneration += 1;
    HOST_STATE.activeLayoutGeneration += 1;
  } else if (updateClass === "redraw-only") {
    HOST_STATE.activeConfigGeneration += 1;
  }
  HOST_STATE.readerConfig.configGeneration = HOST_STATE.activeConfigGeneration;
  HOST_STATE.readerConfig.layoutGeneration = HOST_STATE.activeLayoutGeneration;
  return {
    configGeneration: HOST_STATE.activeConfigGeneration,
    layoutGeneration: HOST_STATE.activeLayoutGeneration,
    updateClass
  };
}

function summaryGenerationInfo(summary) {
  return {
    configGeneration: normalizeGeneration(summary && summary.configGeneration, 0),
    layoutGeneration: normalizeGeneration(summary && summary.layoutGeneration, 0)
  };
}

function isStaleSummary(summary) {
  const info = summaryGenerationInfo(summary);
  if (!info.configGeneration || !info.layoutGeneration) return false;
  if (info.configGeneration < HOST_STATE.activeConfigGeneration) return true;
  if (info.layoutGeneration < HOST_STATE.activeLayoutGeneration) return true;
  if (info.configGeneration !== HOST_STATE.activeConfigGeneration) return true;
  if (info.layoutGeneration !== HOST_STATE.activeLayoutGeneration) return true;
  return false;
}

function normalizeFontMode(value) {
  return String(value || "").trim().toLowerCase() === "serif" ? "serif" : "sans";
}

function getSupportedFontModes(summary = HOST_STATE.lastSummary) {
  const supported = summary && Array.isArray(summary.supportedFontModes) && summary.supportedFontModes.length
    ? summary.supportedFontModes.map((item) => normalizeFontMode(item))
    : ["sans"];
  return supported.includes("sans") || supported.includes("serif") ? supported : ["sans"];
}

function resolveSupportedFontMode(value, summary = HOST_STATE.lastSummary, fallback = "sans") {
  const supported = getSupportedFontModes(summary);
  const normalized = normalizeFontMode(value || fallback);
  if (supported.includes(normalized)) return normalized;
  return supported[0] || "sans";
}

function isTouchShellMode() {
  try {
    const root = document.documentElement;
    if (root && root.classList) {
      if (root.classList.contains("is-phone") || root.classList.contains("is-tablet")) return true;
      if (root.classList.contains("is-desktop")) return false;
    }
  } catch (_error) {}
  try {
    if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
  } catch (_error) {}
  try {
    if (navigator && Number(navigator.maxTouchPoints || 0) > 0) return true;
  } catch (_error) {}
  try {
    const ua = String((navigator && navigator.userAgent) || "");
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return true;
  } catch (_error) {}
  return false;
}

function showShellUi(source = "programmatic") {
  try {
    document.body.classList.remove("ui-hidden");
  } catch (_error) {}
  try {
    if (source === "touch-center") window.__readerpubProtectedUserShowUiAt = Date.now();
  } catch (_error) {}
}

function desktopSearchLocksShellUi() {
  if (isTouchShellMode()) return false;
  try {
    const wrap = document.getElementById("protectedSearchControl");
    if (wrap && wrap.classList.contains("is-open")) return true;
  } catch (_error) {}
  try {
    const active = document.activeElement;
    if (active && active.id === "searchInputDesktop") return true;
  } catch (_error) {}
  return false;
}

function touchSearchNavigationLocksCenterTap() {
  if (!isTouchShellMode()) return false;
  try {
    if (!document.body || !document.body.classList.contains("search-open")) return false;
  } catch (_error) {
    return false;
  }
  try {
    const floatControls = document.getElementById("searchFloatControls");
    if (floatControls && !floatControls.classList.contains("hidden")) return true;
  } catch (_error) {}
  try {
    const search = HOST_STATE.lastSummary && HOST_STATE.lastSummary.searchSummary
      ? HOST_STATE.lastSummary.searchSummary
      : null;
    return !!(
      search &&
      search.active &&
      Number(search.totalMatches || 0) > 0 &&
      document.body.classList.contains("search-minimized")
    );
  } catch (_error) {}
  return false;
}

function hideShellUi(source = "programmatic") {
  if (desktopSearchLocksShellUi()) {
    return;
  }
  try {
    document.body.classList.add("ui-hidden");
  } catch (_error) {}
}

function toggleShellUi(source = "programmatic") {
  cancelPendingShellToggle();
  const wasHidden = !!(document.body && document.body.classList && document.body.classList.contains("ui-hidden"));
  if (Date.now() < Number(HOST_STATE.suppressShellToggleUntil || 0)) {
    return;
  }
  HOST_STATE.lastShellToggleSource = String(source || "programmatic");
  HOST_STATE.lastShellToggleAt = Date.now();
  HOST_STATE.lastShellTogglePreHidden = wasHidden;
  if (wasHidden) {
    showShellUi(source);
    if (source === "touch-center" && isTouchShellMode()) {
      HOST_STATE.suppressSyntheticClickUntil = Date.now() + 900;
    }
    return;
  }
  hideShellUi(source);
}

function suppressShellToggle(durationMs = 550) {
  cancelPendingShellToggle();
  HOST_STATE.suppressShellToggleUntil = Math.max(
    Number(HOST_STATE.suppressShellToggleUntil || 0),
    Date.now() + Math.max(0, Number(durationMs || 0))
  );
}

function cancelPendingShellToggle() {
  if (HOST_STATE.pendingShellToggleTimer) {
    window.clearTimeout(HOST_STATE.pendingShellToggleTimer);
    HOST_STATE.pendingShellToggleTimer = null;
  }
  HOST_STATE.pendingShellToggleSource = "";
}

function scheduleShellToggle(source = "programmatic", delayMs = 0) {
  cancelPendingShellToggle();
  const delay = Math.max(0, Number(delayMs || 0));
  if (!delay) {
    toggleShellUi(source);
    return;
  }
  HOST_STATE.pendingShellToggleSource = String(source || "programmatic");
  HOST_STATE.pendingShellToggleTimer = window.setTimeout(() => {
    HOST_STATE.pendingShellToggleTimer = null;
    const pendingSource = HOST_STATE.pendingShellToggleSource || source;
    HOST_STATE.pendingShellToggleSource = "";
    toggleShellUi(pendingSource);
  }, delay);
}

function bindPrimaryAction(target, handler, options = {}) {
  if (!target || target.__protectedPrimaryActionBound) return;
  target.__protectedPrimaryActionBound = true;
  const touchOnly = options.touchOnly !== false;
  const clickOnly = options.clickOnly === true;
  const releaseOnly = options.releaseOnly === true;
  const suppressWindowMs = Number(options.suppressWindowMs || 700);
  let suppressClickUntil = 0;
  let suppressNextClick = false;
  let lastInvocationAt = 0;
  const invoke = (event, source = "") => {
    const now = Date.now();
    if (
      source === "release" &&
      target.closest &&
      target.closest("#overlay-settings, #overlay-library, #overlay-search") &&
      typeof shouldSuppressProtectedOverlayRelease === "function" &&
      shouldSuppressProtectedOverlayRelease()
    ) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation && event.stopImmediatePropagation();
      }
      return;
    }
    if (now - lastInvocationAt < 300) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation && event.stopImmediatePropagation();
      }
      return;
    }
    lastInvocationAt = now;
    suppressClickUntil = now + suppressWindowMs;
    if (source === "release") suppressNextClick = true;
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation && event.stopImmediatePropagation();
    }
    void handler(event);
  };
  if (releaseOnly) {
    target.addEventListener("pointerup", (event) => {
      if (touchOnly && String(event.pointerType || "").toLowerCase() !== "touch") return;
      invoke(event, "release");
    }, true);
    target.addEventListener("touchend", (event) => {
      invoke(event, "release");
    }, { capture: true, passive: false });
  } else if (!clickOnly) {
    target.addEventListener("pointerdown", (event) => {
      if (touchOnly && String(event.pointerType || "").toLowerCase() !== "touch") return;
      invoke(event);
    }, true);
    target.addEventListener("touchstart", (event) => {
      invoke(event);
    }, { capture: true, passive: false });
  }
  target.addEventListener("click", (event) => {
    if (suppressNextClick || Date.now() < suppressClickUntil) {
      suppressNextClick = false;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation && event.stopImmediatePropagation();
      return;
    }
    invoke(event);
  }, true);
}

function installTouchUiVisibilityGuard() {
  if (HOST_STATE.touchUiGuardInstalled) return;
  HOST_STATE.touchUiGuardInstalled = true;
  if (!window.MutationObserver || !document.body) return;
  const observer = new MutationObserver(() => {
    if (desktopSearchLocksShellUi()) {
      if (document.body.classList.contains("ui-hidden")) {
        document.body.classList.remove("ui-hidden");
      }
      return;
    }
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
}

function installStyles() {
  if (document.getElementById(HOST_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = HOST_STYLE_ID;
  style.textContent = `
    body.protected-shell {
      overflow: hidden;
      -webkit-tap-highlight-color: transparent !important;
    }
    body.protected-shell #ttsToggleMobile,
    body.protected-shell #addressBarToggle,
    body.protected-shell #fullscreen {
      display: none !important;
    }
    body.protected-shell #viewerStack {
      overflow: hidden;
      -webkit-tap-highlight-color: transparent !important;
    }
    html.is-phone body.protected-shell,
    html.is-tablet body.protected-shell {
      width: var(--app-vw, 100vw);
      max-width: var(--app-vw, 100vw);
      overflow-x: hidden;
    }
    html.is-phone body.protected-shell #container,
    html.is-phone body.protected-shell #main,
    html.is-phone body.protected-shell #viewerStack,
    html.is-tablet body.protected-shell #container,
    html.is-tablet body.protected-shell #main,
    html.is-tablet body.protected-shell #viewerStack {
      width: var(--app-vw, 100vw) !important;
      max-width: var(--app-vw, 100vw) !important;
      left: 0 !important;
      right: auto !important;
      overflow-x: hidden;
    }
    html.is-phone body.protected-shell #titlebar,
    html.is-phone body.protected-shell #bottombar,
    html.is-tablet body.protected-shell #titlebar,
    html.is-tablet body.protected-shell #bottombar {
      width: auto !important;
      max-width: none !important;
      left: 0 !important;
      right: 0 !important;
      box-sizing: border-box;
    }
    html.is-phone body.protected-shell #titlebar,
    html.is-tablet body.protected-shell #titlebar {
      padding-right: calc(10px + env(safe-area-inset-right, 0px)) !important;
    }
    html.is-phone body.protected-shell #overlay-backdrop,
    html.is-tablet body.protected-shell #overlay-backdrop {
      z-index: 29990 !important;
    }
    html.is-phone body.protected-shell #overlay-settings,
    html.is-phone body.protected-shell #overlay-library,
    html.is-phone body.protected-shell #overlay-search,
    html.is-tablet body.protected-shell #overlay-settings,
    html.is-tablet body.protected-shell #overlay-library,
    html.is-tablet body.protected-shell #overlay-search {
      z-index: 30010 !important;
    }
    body.protected-shell #fb-tap-layer {
      display: none !important;
    }
    body.protected-shell #loader {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
    body.protected-shell #viewer,
    body.protected-shell #viewerStack.swiping #viewer {
      background: transparent !important;
    }
    body.protected-shell #viewer-prev,
    body.protected-shell #viewer-next {
      display: block;
      pointer-events: none;
      -webkit-tap-highlight-color: transparent !important;
    }
    body.protected-shell #viewer-prev .protected-turn-layer,
    body.protected-shell #viewer-next .protected-turn-layer {
      position: absolute;
      inset: 0;
      display: block;
      overflow: hidden;
      background: transparent;
    }
    body.protected-shell #viewer-prev .protected-turn-layer canvas,
    body.protected-shell #viewer-next .protected-turn-layer canvas {
      position: absolute;
      display: block;
    }
    body.protected-shell #swipe-shadow {
    }
    body.protected-shell #viewerStack.swiping #swipe-shadow {
      opacity: 0 !important;
    }
    #protectedOldShellStatus {
      display: none;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
      padding: 8px 14px;
      margin: 8px 10px 0;
      border-radius: 14px;
      background: rgba(255,255,255,0.92);
      border: 1px solid rgba(12, 78, 101, 0.14);
      color: #29415e;
      font: 600 13px/1.3 Georgia, "Times New Roman", serif;
    }
    #protectedOldShellStatus .pill {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 4px 10px;
      background: rgba(10, 129, 117, 0.10);
      color: #0a8175;
    }
    #protectedOldShellStatus .muted {
      color: #607189;
      font-weight: 500;
    }
    #protectedOldShellHost {
      position: absolute;
      inset: 0;
      z-index: 5;
      overflow: hidden;
      background: transparent;
      -webkit-tap-highlight-color: transparent !important;
    }
    #protectedOldShellFrame {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: 0;
      display: block;
      background: transparent;
    }
    #protectedDirectReaderRoot {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: 0;
      display: block;
      overflow: hidden;
      background: transparent;
      pointer-events: auto;
      opacity: 1;
      visibility: visible;
    }
    #protectedDirectReaderRoot .direct-reader-hidden {
      display: none !important;
    }
    #protectedDirectReaderRoot .reader-frame {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: transparent;
      touch-action: none;
    }
    @media (orientation: portrait) {
      html.is-phone body.protected-shell #protectedDirectReaderRoot .reader-frame,
      html.is-tablet body.protected-shell #protectedDirectReaderRoot .reader-frame {
        inset: 0;
        width: 100%;
        height: 100%;
      }
    }
    @media (orientation: landscape) {
      html.is-phone body.protected-shell #protectedDirectReaderRoot .reader-frame,
      html.is-tablet body.protected-shell #protectedDirectReaderRoot .reader-frame {
        inset: 0;
        width: 100%;
        height: 100%;
      }
    }
    #protectedDirectReaderRoot #reader-canvas,
    #protectedDirectReaderRoot #overlay-canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
    }
    #protectedDirectReaderRoot #reader-canvas {
      pointer-events: auto;
    }
    #protectedDirectReaderRoot #overlay-canvas {
      pointer-events: none;
    }
    #protectedOldShellCurrentLayer {
      position: absolute;
      inset: 0;
      z-index: 2;
      pointer-events: none;
      opacity: 0;
      visibility: hidden;
    }
    #protectedOldShellCurrentLayer .protected-turn-layer {
      position: absolute;
      inset: 0;
      display: block;
      background: transparent;
    }
    #protectedOldShellCurrentLayer .protected-turn-layer canvas {
      position: absolute;
      display: block;
    }
    body.protected-shell #viewerStack.swiping #protectedOldShellCurrentLayer {
      box-shadow: none;
    }
    body.protected-shell #viewerStack.swiping.shadow-right #protectedOldShellCurrentLayer {
      box-shadow: 6px 0 10px rgba(0,0,0,0.28);
    }
    body.protected-shell #viewerStack.swiping.shadow-left #protectedOldShellCurrentLayer {
      box-shadow: -6px 0 10px rgba(0,0,0,0.28);
    }
    @keyframes protected-page-turn-next {
      0% { opacity: 1; filter: none; }
      45% { opacity: 0.985; filter: saturate(0.99) brightness(0.99); }
      100% { opacity: 1; filter: none; }
    }
    @keyframes protected-page-turn-prev {
      0% { opacity: 1; filter: none; }
      45% { opacity: 0.985; filter: saturate(0.99) brightness(0.99); }
      100% { opacity: 1; filter: none; }
    }
    .protected-nav-edge {
      position: absolute;
      top: 0;
      bottom: 0;
      width: var(--viewer-side, 28px);
      z-index: 7;
      border: 0;
      background: transparent;
      color: transparent;
      cursor: default;
      pointer-events: none;
      display: none;
    }
    .protected-nav-edge.prev { left: 0; }
    .protected-nav-edge.next { right: 0; }
    @media (hover: none) and (pointer: coarse) {
      .protected-nav-edge {
        display: block;
        width: max(var(--viewer-side, 12px), var(--arrow-hit, 24px));
        pointer-events: auto;
        cursor: pointer;
      }
    }
    #protectedShellActionBar {
      position: fixed;
      left: 50%;
      bottom: calc(var(--bottombar-h, 32px) + env(safe-area-inset-bottom, 0px) + 12px);
      transform: translateX(-50%);
      z-index: 2600;
      display: none;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
      max-width: min(94vw, 760px);
      padding: 12px 16px;
      border-radius: 18px;
      border: 1px solid rgba(12, 78, 101, 0.14);
      background: rgba(255,255,255,0.94);
      box-shadow: 0 14px 32px rgba(23, 33, 50, 0.12);
      backdrop-filter: blur(12px);
    }
    body.protected-shell.protected-dev-panel #protectedShellActionBar {
      display: flex;
    }
    #protectedFootnotePopup.popup {
      z-index: 2650;
      display: none;
      background: #eee;
      border: 1px solid #ccc;
      padding: 10px;
      border-radius: 8px;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
      position: fixed;
      max-width: 300px;
      font-size: 12px;
      font-family: var(--protected-footnote-font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif);
      margin-left: 2px;
      margin-top: 30px;
      color: #000;
    }
    #protectedFootnotePopup.show,
    #protectedFootnotePopup.on {
      display: block;
    }
    #protectedFootnotePopup.above {
      margin-top: -10px;
    }
    #protectedFootnotePopup.left {
      margin-left: -20px;
    }
    #protectedFootnotePopup.right {
      margin-left: 40px;
    }
    #protectedFootnotePopup::before {
      position: absolute;
      display: inline-block;
      border-bottom: 10px solid #eee;
      border-right: 10px solid transparent;
      border-left: 10px solid transparent;
      border-bottom-color: rgba(0, 0, 0, 0.2);
      left: 50%;
      top: -10px;
      margin-left: -6px;
      content: "";
    }
    #protectedFootnotePopup::after {
      position: absolute;
      display: inline-block;
      border-bottom: 9px solid #eee;
      border-right: 9px solid transparent;
      border-left: 9px solid transparent;
      left: 50%;
      top: -9px;
      margin-left: -5px;
      content: "";
    }
    #protectedFootnotePopup.above::before {
      border-bottom: none;
      border-top: 10px solid #eee;
      border-top-color: rgba(0, 0, 0, 0.2);
      top: 100%;
    }
    #protectedFootnotePopup.above::after {
      border-bottom: none;
      border-top: 9px solid #eee;
      top: 100%;
    }
    #protectedFootnotePopup.left::before,
    #protectedFootnotePopup.left::after {
      left: 20px;
    }
    #protectedFootnotePopup.right::before,
    #protectedFootnotePopup.right::after {
      left: auto;
      right: 20px;
    }
    #protectedFootnotePopup .popup-close {
      position: absolute;
      top: 4px;
      right: 6px;
      padding: 0;
      margin: 0;
      border: 0;
      background: none;
      font-size: 16px;
      line-height: 16px;
      cursor: pointer;
      color: inherit;
    }
    #protectedFootnotePopup .popup-close:hover,
    #protectedFootnotePopup .popup-close:focus-visible {
      outline: none;
    }
    #protectedFootnotePopup .protected-footnote-body {
      max-height: 225px;
      overflow-y: auto;
      color: inherit;
      font: inherit;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }
    #protectedFootnotePopup .protected-footnote-paragraph {
      margin: 0;
    }
    #protectedFootnotePopup .protected-footnote-paragraph + .protected-footnote-paragraph {
      margin-top: 0.72em;
    }
    #protectedFootnotePopup .protected-footnote-empty {
      margin: 0;
      color: inherit;
      font-size: 14px;
    }
    body.protected-shell.protected-theme-dark #protectedFootnotePopup.popup,
    body.protected-shell.protected-theme-dark #protectedFootnotePopup.popup.modal {
      background: #000 !important;
      color: #fff !important;
      border: 1px solid #fff !important;
    }
    body.protected-shell.protected-theme-dark #protectedFootnotePopup::after {
      border-bottom-color: #000;
    }
    body.protected-shell.protected-theme-dark #protectedFootnotePopup.above::after {
      border-top-color: #000;
    }
    #protectedFootnoteModal.selection-translate.fn-main-modal {
      z-index: 2147483647;
    }
    #protectedFootnoteModal.selection-translate.fn-main-modal .selection-translate-panel.fn-main-panel {
      width: min(820px, 100%);
      border: 0 !important;
      box-shadow: none !important;
      background: var(--fbbar-bg) !important;
      color: var(--fbbar-fg) !important;
      padding: 0 !important;
      border-radius: 10px;
    }
    #protectedFootnoteModal.selection-translate.fn-main-modal .selection-translate-result.fn-main-body {
      position: relative;
      margin-top: 0;
      min-height: 0;
      max-height: none;
      border-radius: 10px;
      background: var(--fbbar-bg) !important;
      border-color: var(--fbbar-border) !important;
      color: var(--fbbar-fg) !important;
      white-space: normal;
      line-height: 1.45;
      font-size: 1.25em;
      overflow-wrap: anywhere;
      padding: 54px 20px 18px 20px;
      font-family: var(--protected-footnote-font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif);
    }
    #protectedFootnoteModal.selection-translate.fn-main-modal .selection-translate-close.fn-main-close {
      position: absolute;
      top: 14px;
      right: 16px;
      width: auto;
      height: auto;
      padding: 0;
      border: 0 !important;
      outline: 0;
      border-radius: 0;
      background: transparent !important;
      line-height: 1;
      font-size: 18px;
      font-weight: 200;
      color: inherit;
      cursor: pointer;
    }
    #protectedFootnoteModal.selection-translate.fn-main-modal .selection-translate-close.fn-main-close:hover,
    #protectedFootnoteModal.selection-translate.fn-main-modal .selection-translate-close.fn-main-close:focus {
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }
    #protectedFootnoteModal.selection-translate.fn-main-modal .fn-main-content {
      white-space: normal;
      overflow-wrap: anywhere;
    }
    #protectedImageViewer {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: none;
      align-items: center;
      justify-content: center;
      background: rgba(10, 12, 18, 0.82);
      backdrop-filter: blur(4px);
    }
    #protectedImageViewer.show {
      display: flex;
    }
    #protectedImageViewer .protected-image-viewer-backdrop {
      position: absolute;
      inset: 0;
    }
    #protectedImageViewer .protected-image-viewer-panel {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      width: auto;
      max-width: 100vw;
      height: 100vh;
      max-height: 100vh;
      padding: 0;
      box-sizing: border-box;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
    }
    #protectedImageViewer .protected-image-viewer-stage {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      touch-action: none;
    }
    #protectedImageViewer .protected-image-viewer-frame {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      max-width: 100vw;
      max-height: 100vh;
    }
    #protectedImageViewer .protected-image-viewer-close {
      position: absolute;
      top: 14px;
      right: 14px;
      z-index: 3;
      width: 32px;
      height: 32px;
      border: 0;
      border-radius: 999px;
      background: rgba(8, 10, 16, 0.72);
      color: #fff;
      font-size: 24px;
      line-height: 1;
      cursor: pointer;
    }
    #protectedImageViewer .protected-image-viewer-close:hover,
    #protectedImageViewer .protected-image-viewer-close:focus-visible {
      outline: none;
      background: rgba(8, 10, 16, 0.84);
    }
    #protectedImageViewer .protected-image-viewer-image {
      display: block;
      max-width: 100%;
      max-height: 100vh;
      width: auto;
      height: auto;
      object-fit: contain;
      transform-origin: center center;
      will-change: transform;
      user-select: none;
      -webkit-user-drag: none;
    }
    html.is-desktop body.protected-shell #protectedImageViewer .protected-image-viewer-image.fit-height {
      width: auto;
      height: 100vh;
      max-width: 100vw;
      max-height: none;
    }
    html.is-desktop body.protected-shell #protectedImageViewer .protected-image-viewer-image.fit-width {
      width: 100vw;
      height: auto;
      max-width: none;
      max-height: 100vh;
    }
    html.is-phone body.protected-shell #protectedImageViewer,
    html.is-tablet body.protected-shell #protectedImageViewer {
      background: rgba(0, 0, 0, 0.98);
      backdrop-filter: none;
    }
    html.is-phone body.protected-shell #protectedImageViewer .protected-image-viewer-panel,
    html.is-tablet body.protected-shell #protectedImageViewer .protected-image-viewer-panel {
      width: var(--app-vw, 100vw);
      max-width: var(--app-vw, 100vw);
      height: var(--app-vh, 100vh);
      max-height: var(--app-vh, 100vh);
      padding: 0;
      border-radius: 0;
      background: #000;
      box-shadow: none;
    }
    html.is-phone body.protected-shell #protectedImageViewer .protected-image-viewer-close,
    html.is-tablet body.protected-shell #protectedImageViewer .protected-image-viewer-close {
      top: calc(env(safe-area-inset-top, 0px) + 14px);
      right: calc(env(safe-area-inset-right, 0px) + 14px);
      width: 40px;
      height: 40px;
      background: rgba(255, 255, 255, 0.18);
    }
    html.is-phone body.protected-shell #protectedImageViewer .protected-image-viewer-frame,
    html.is-tablet body.protected-shell #protectedImageViewer .protected-image-viewer-frame {
      width: var(--app-vw, 100vw);
      height: var(--app-vh, 100vh);
      max-width: var(--app-vw, 100vw);
      max-height: var(--app-vh, 100vh);
    }
    html.is-phone body.protected-shell #protectedImageViewer .protected-image-viewer-stage,
    html.is-tablet body.protected-shell #protectedImageViewer .protected-image-viewer-stage {
      width: var(--app-vw, 100vw);
      height: var(--app-vh, 100vh);
    }
    html.is-phone body.protected-shell #protectedImageViewer .protected-image-viewer-image,
    html.is-tablet body.protected-shell #protectedImageViewer .protected-image-viewer-image {
      max-width: var(--app-vw, 100vw);
      max-height: var(--app-vh, 100vh);
    }
    html.is-phone body.protected-shell #protectedFootnotePopup.popup,
    html.is-tablet body.protected-shell #protectedFootnotePopup.popup {
      display: none !important;
    }
    body.protected-shell #title-controls {
      display: inline-flex;
      align-items: center;
      gap: 14px;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-shell #titlebar {
      --titlebar-h: 43px;
      min-height: 43px !important;
      height: 43px !important;
      padding-top: 3px !important;
      padding-bottom: 3px !important;
      position: relative;
      align-items: center;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-shell #title-controls {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      z-index: 2;
      gap: 14px;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-shell #metainfo {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      margin: 0;
      width: min(44vw, 620px);
      max-width: calc(100vw - 420px);
      justify-content: center;
      pointer-events: none;
      text-align: center;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-shell #metaText {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
      line-height: 1.18;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-shell #book-title,
    html:not(.is-phone):not(.is-tablet) body.protected-shell #chapter-title {
      width: 100%;
      text-align: center;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-shell #book-title {
      font-size: 14px;
      font-weight: 600;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-shell #chapter-title {
      margin-top: 4px;
      font-size: 11px;
      opacity: 0.9;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-shell .protected-top-left-links {
      position: absolute;
      left: 16px;
      top: 50%;
      transform: translateY(-50%);
      z-index: 2;
      display: inline-flex;
      align-items: center;
      gap: 0;
      min-width: 0;
      max-width: min(24vw, 320px);
    }
    html:not(.is-phone):not(.is-tablet) body.protected-shell .protected-top-link {
      display: inline-flex !important;
      align-items: center;
      gap: 10px;
      width: auto !important;
      min-width: 0 !important;
      max-width: none !important;
      height: auto !important;
      min-height: 24px;
      padding: 0 !important;
      border: 0;
      border-radius: 0;
      background: transparent;
      color: #eef4fb;
      text-decoration: none;
      white-space: nowrap;
      cursor: pointer;
      font: 500 15px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      box-sizing: border-box;
      overflow: visible !important;
      line-height: 1 !important;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-shell .protected-top-link-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-shell .protected-top-link-label {
      display: block;
      min-width: 0;
      overflow: visible;
      text-overflow: clip;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-shell .protected-top-link:hover,
    html:not(.is-phone):not(.is-tablet) body.protected-shell .protected-top-link:focus-visible {
      opacity: 0.92;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-shell .protected-top-link svg {
      width: 20px;
      height: 20px;
      display: block;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-shell .protected-top-link-catalog svg,
    html.is-phone body.protected-shell #protectedBottomCatalogLink svg,
    html.is-tablet body.protected-shell #protectedBottomCatalogLink svg {
      fill: currentColor !important;
      stroke: none !important;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-shell #title-controls > #ttsToggleDesktop,
    html:not(.is-phone):not(.is-tablet) body.protected-shell #title-controls > #themeToggle,
    html:not(.is-phone):not(.is-tablet) body.protected-shell #protectedLibraryControl,
    html:not(.is-phone):not(.is-tablet) body.protected-shell #protectedTypographyControl {
      width: 24px;
      min-width: 24px;
      height: 24px;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-shell #ttsToggleDesktop .tts-icon,
    html:not(.is-phone):not(.is-tablet) body.protected-shell #themeToggle .theme-icon,
    html:not(.is-phone):not(.is-tablet) body.protected-shell #protectedLibraryTrigger img,
    html:not(.is-phone):not(.is-tablet) body.protected-shell #protectedTypographyTrigger img {
      width: 18px;
      height: 18px;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-shell #protectedSearchControl {
      display: none !important;
    }
    body.protected-shell #themeToggle,
    body.protected-shell #ttsToggleDesktop,
    body.protected-shell #bookmark {
      display: inline-flex !important;
    }
    body.protected-shell #mobileMoreToggle,
    body.protected-shell #mobileMorePanel,
    body.protected-shell #mobileMoreBackdrop {
      display: none !important;
    }
    html.is-phone body.protected-shell .protected-top-left-links,
    html.is-tablet body.protected-shell .protected-top-left-links {
      display: none !important;
    }
    html.is-phone body.protected-shell #title-controls,
    html.is-tablet body.protected-shell #title-controls {
      gap: 12px !important;
      transform: none;
    }
    html.is-phone body.protected-shell #title-controls > #ttsToggleDesktop,
    html.is-phone body.protected-shell #title-controls > #themeToggle,
    html.is-phone body.protected-shell #protectedLibraryControl,
    html.is-phone body.protected-shell #protectedSearchControl,
    html.is-phone body.protected-shell #protectedTypographyControl,
    html.is-tablet body.protected-shell #title-controls > #ttsToggleDesktop,
    html.is-tablet body.protected-shell #title-controls > #themeToggle,
    html.is-tablet body.protected-shell #protectedLibraryControl,
    html.is-tablet body.protected-shell #protectedSearchControl,
    html.is-tablet body.protected-shell #protectedTypographyControl {
      width: 28px;
      min-width: 28px;
    }
    body.protected-shell #title-controls > #ttsToggleDesktop,
    body.protected-shell #title-controls > #themeToggle,
    #protectedLibraryTrigger,
    #protectedSearchTrigger,
    #protectedTypographyTrigger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin: 0 !important;
      width: 32px;
      min-width: 32px;
      height: 32px;
      padding: 0;
      border-radius: 0;
      background: transparent;
      border: 0;
      box-sizing: border-box;
    }
    body.protected-shell #ttsToggleDesktop {
      order: 59;
      display: inline-flex !important;
    }
    body.protected-shell #ttsToggleDesktop .tts-icon {
      width: 20px;
      height: 20px;
      object-fit: contain;
    }
    html.is-phone body.protected-shell #ttsToggleDesktop,
    html.is-tablet body.protected-shell #ttsToggleDesktop {
      display: inline-flex !important;
    }
    html.is-phone body.protected-shell #ttsToggleMobile,
    html.is-tablet body.protected-shell #ttsToggleMobile {
      display: none !important;
    }
    html.is-phone body.protected-shell #searchbar,
    html.is-tablet body.protected-shell #searchbar {
      --titlebar-h: 48px;
      min-height: 48px !important;
      height: 48px !important;
      padding-top: 8px !important;
      padding-bottom: 8px !important;
      align-items: center;
      box-sizing: content-box;
    }
    html.is-phone body.protected-shell #searchFloatControls:not(.hidden),
    html.is-tablet body.protected-shell #searchFloatControls:not(.hidden) {
      display: inline-flex !important;
    }
    @media (min-width: 820px) {
      body.protected-shell #titlebar {
        --titlebar-h: 43px;
        min-height: 43px !important;
        height: 43px !important;
        padding-top: 3px !important;
        padding-bottom: 3px !important;
        position: relative;
        align-items: center;
      }
      body.protected-shell #metainfo {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        margin: 0;
        width: min(44vw, 620px);
        max-width: calc(100vw - 420px);
        justify-content: center;
        pointer-events: none;
        text-align: center;
      }
      body.protected-shell #metaText {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        line-height: 1.18;
      }
      body.protected-shell #book-title,
      body.protected-shell #chapter-title {
        width: 100%;
        text-align: center;
      }
      body.protected-shell #book-title {
        font-size: 14px;
        font-weight: 600;
      }
      body.protected-shell #chapter-title {
        margin-top: 4px;
        font-size: 11px;
        opacity: 0.9;
      }
      body.protected-shell .protected-top-left-links {
        position: absolute;
        left: 16px;
        top: 50%;
        transform: translateY(-50%);
        z-index: 2;
        display: inline-flex !important;
        align-items: center;
        gap: 0;
        min-width: 0;
        max-width: min(24vw, 320px);
      }
      body.protected-shell #title-controls {
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        z-index: 2;
        gap: 14px !important;
      }
      body.protected-shell #title-controls > #ttsToggleDesktop,
      body.protected-shell #title-controls > #themeToggle,
      body.protected-shell #protectedLibraryControl,
      body.protected-shell #protectedTypographyControl {
        width: 24px;
        min-width: 24px;
        height: 24px;
      }
      body.protected-shell #ttsToggleDesktop .tts-icon,
      body.protected-shell #themeToggle .theme-icon,
      body.protected-shell #protectedLibraryTrigger img,
      body.protected-shell #protectedTypographyTrigger img {
        width: 18px;
        height: 18px;
      }
      html:not(.is-phone):not(.is-tablet) body.protected-shell #protectedSearchControl {
        display: none !important;
      }
      body.protected-shell #protectedBottomCatalogLink {
        display: none !important;
      }
      html.is-phone body.protected-shell #searchbar,
      html.is-tablet body.protected-shell #searchbar {
        --titlebar-h: 43px;
        min-height: 43px !important;
        height: 43px !important;
        padding-top: 3px !important;
        padding-bottom: 3px !important;
      }
      html.is-phone body.protected-shell.search-open:not(.search-minimized) #searchbar,
      html.is-tablet body.protected-shell.search-open:not(.search-minimized) #searchbar {
        display: flex !important;
      }
      html.is-phone body.protected-shell #searchFloatControls:not(.hidden),
      html.is-tablet body.protected-shell #searchFloatControls:not(.hidden) {
        display: inline-flex !important;
      }
    }
    @media (orientation: landscape) {
      html.is-phone body.protected-shell #titlebar,
      html.is-tablet body.protected-shell #titlebar {
        --titlebar-h: 43px;
        min-height: 43px !important;
        height: 43px !important;
        padding-top: 3px !important;
        padding-bottom: 3px !important;
        position: relative;
        align-items: center;
      }
      html.is-phone body.protected-shell #searchbar,
      html.is-tablet body.protected-shell #searchbar {
        --titlebar-h: 43px;
        min-height: 43px !important;
        height: 43px !important;
        padding-top: 3px !important;
        padding-bottom: 3px !important;
      }
      html.is-phone body.protected-shell #metainfo,
      html.is-tablet body.protected-shell #metainfo {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        margin: 0;
        width: auto;
        max-width: calc(100vw - 240px);
        justify-content: center;
        pointer-events: none;
        text-align: center;
      }
      html.is-phone body.protected-shell #metainfo {
        max-width: calc(100vw - 124px);
      }
      html.is-tablet body.protected-shell #metainfo {
        max-width: calc(100vw - 260px);
      }
      html.is-phone body.protected-shell #metaText,
      html.is-tablet body.protected-shell #metaText {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        line-height: 1.18;
      }
      html.is-phone body.protected-shell #book-title,
      html.is-phone body.protected-shell #chapter-title,
      html.is-tablet body.protected-shell #book-title,
      html.is-tablet body.protected-shell #chapter-title {
        width: 100%;
        text-align: center;
      }
      html.is-phone body.protected-shell #book-title,
      html.is-tablet body.protected-shell #book-title {
        font-size: 14px;
        font-weight: 600;
      }
      html.is-phone body.protected-shell #chapter-title,
      html.is-tablet body.protected-shell #chapter-title {
        margin-top: 4px;
        font-size: 11px;
        opacity: 0.9;
      }
      html.is-phone body.protected-shell .protected-top-left-links,
      html.is-tablet body.protected-shell .protected-top-left-links {
        position: absolute;
        left: 16px;
        top: 50%;
        transform: translateY(-50%);
        z-index: 2;
        display: inline-flex !important;
        align-items: center;
        gap: 0;
        min-width: 0;
        max-width: min(24vw, 320px);
      }
      html.is-phone body.protected-shell .protected-top-link,
      html.is-tablet body.protected-shell .protected-top-link {
        display: inline-flex !important;
        align-items: center;
        gap: 10px;
        width: auto !important;
        min-width: 0 !important;
        max-width: none !important;
        height: auto !important;
        min-height: 24px;
        padding: 0 !important;
        border: 0;
        border-radius: 0;
        background: transparent;
        color: #eef4fb;
        text-decoration: none;
        white-space: nowrap;
        cursor: pointer;
        font: 500 15px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        box-sizing: border-box;
        overflow: visible !important;
        line-height: 1 !important;
      }
      html.is-phone body.protected-shell .protected-top-link-icon,
      html.is-tablet body.protected-shell .protected-top-link-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
      }
      html.is-phone body.protected-shell .protected-top-link-label,
      html.is-tablet body.protected-shell .protected-top-link-label {
        display: block;
        min-width: 0;
        overflow: visible;
        text-overflow: clip;
      }
      html.is-phone body.protected-shell .protected-top-link svg,
      html.is-tablet body.protected-shell .protected-top-link svg {
        width: 20px;
        height: 20px;
        display: block;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      html.is-phone body.protected-shell .protected-top-link-catalog svg,
      html.is-tablet body.protected-shell .protected-top-link-catalog svg {
        fill: currentColor !important;
        stroke: none !important;
      }
      html.is-phone body.protected-shell #title-controls,
      html.is-tablet body.protected-shell #title-controls {
        position: absolute;
        right: calc(8px + env(safe-area-inset-right, 0px));
        top: 50%;
        transform: translateY(-50%);
        z-index: 2;
        gap: 14px !important;
      }
      html.is-phone body.protected-shell #title-controls > #ttsToggleDesktop,
      html.is-phone body.protected-shell #title-controls > #themeToggle,
      html.is-phone body.protected-shell #protectedLibraryControl,
      html.is-phone body.protected-shell #protectedSearchControl,
      html.is-phone body.protected-shell #protectedTypographyControl,
      html.is-tablet body.protected-shell #title-controls > #ttsToggleDesktop,
      html.is-tablet body.protected-shell #title-controls > #themeToggle,
      html.is-tablet body.protected-shell #protectedLibraryControl,
      html.is-tablet body.protected-shell #protectedSearchControl,
      html.is-tablet body.protected-shell #protectedTypographyControl {
        width: 24px;
        min-width: 24px;
        height: 24px;
      }
      html.is-phone body.protected-shell #ttsToggleDesktop .tts-icon,
      html.is-phone body.protected-shell #themeToggle .theme-icon,
      html.is-phone body.protected-shell #protectedLibraryTrigger img,
      html.is-phone body.protected-shell #protectedSearchTrigger img,
      html.is-phone body.protected-shell #protectedTypographyTrigger img,
      html.is-tablet body.protected-shell #ttsToggleDesktop .tts-icon,
      html.is-tablet body.protected-shell #themeToggle .theme-icon,
      html.is-tablet body.protected-shell #protectedLibraryTrigger img,
      html.is-tablet body.protected-shell #protectedSearchTrigger img,
      html.is-tablet body.protected-shell #protectedTypographyTrigger img {
        width: 18px;
        height: 18px;
      }
      html.is-phone body.protected-shell #protectedBottomCatalogLink,
      html.is-tablet body.protected-shell #protectedBottomCatalogLink {
        position: absolute;
        left: calc(12px + env(safe-area-inset-left, 0px));
        top: 50%;
        transform: translateY(-50%);
        display: inline-flex !important;
        align-items: center;
        gap: 6px;
        color: #eef4fb;
        text-decoration: none;
        font: 600 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        white-space: nowrap;
      }
      html.is-phone body.protected-shell #protectedBottomCatalogLink svg,
      html.is-tablet body.protected-shell #protectedBottomCatalogLink svg {
        width: 18px;
        height: 18px;
        display: block;
        fill: currentColor !important;
        stroke: none !important;
      }
    }
    body.protected-shell #bottombar #bookmark {
      display: inline-flex !important;
      position: absolute;
      right: calc(12px + env(safe-area-inset-right, 0px));
      top: 50%;
      transform: translateY(-50%);
      margin: 0;
      z-index: 1;
      align-items: center;
      justify-content: center;
    }
    html.is-phone body.protected-shell #bottombar #bookmark,
    html.is-tablet body.protected-shell #bottombar #bookmark {
      display: inline-flex !important;
      right: calc(14px + env(safe-area-inset-right, 0px));
    }
    @media (orientation: portrait) {
      html.is-phone body.protected-shell #bottombar #page-count,
      html.is-tablet body.protected-shell #bottombar #page-count {
        position: absolute;
        right: calc(52px + env(safe-area-inset-right, 0px));
        left: auto;
        transform: translateY(-50%);
        top: 50%;
        width: auto;
        text-align: right;
        white-space: nowrap;
      }
      html.is-phone body.protected-shell #metaText,
      html.is-tablet body.protected-shell #metaText {
        line-height: 1.18;
      }
      html.is-phone body.protected-shell #chapter-title,
      html.is-tablet body.protected-shell #chapter-title {
        margin-top: 4px;
      }
      html.is-phone body.protected-shell #overlay-settings,
      html.is-phone body.protected-shell #overlay-library,
      html.is-phone body.protected-shell #overlay-search {
        left: 0;
        right: 0;
        width: 100vw;
        max-width: 100vw;
      }
    }
    body.protected-shell #protectedBottomCatalogLink {
      display: none;
    }
    html.is-phone body.protected-shell #protectedBottomCatalogLink,
    html.is-tablet body.protected-shell #protectedBottomCatalogLink {
      position: absolute;
      left: calc(12px + env(safe-area-inset-left, 0px));
      top: 50%;
      transform: translateY(-50%);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: #eef4fb;
      text-decoration: none;
      font: 600 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      white-space: nowrap;
    }
    html.is-phone body.protected-shell #protectedBottomCatalogLink svg,
    html.is-tablet body.protected-shell #protectedBottomCatalogLink svg {
      width: 18px;
      height: 18px;
      display: block;
      fill: currentColor;
      stroke: none;
    }
    html.is-phone body.protected-shell.addressbar-toggle-enabled #addressBarToggle,
    html.is-tablet body.protected-shell.addressbar-toggle-enabled #addressBarToggle {
      display: inline-flex !important;
      position: absolute;
      right: calc(14px + env(safe-area-inset-right, 0px));
      top: 50%;
      transform: translateY(-50%);
      z-index: 1;
      width: 28px;
      min-width: 28px;
      height: 28px;
      min-height: 28px;
      padding: 0;
      margin: 0;
      border: 0;
      border-radius: 0;
      background: transparent !important;
      box-shadow: none !important;
      appearance: none;
      -webkit-appearance: none;
      align-items: center;
      justify-content: center;
      overflow: visible;
    }
    html.is-phone body.protected-shell.addressbar-toggle-enabled #addressBarToggle .ab-icon,
    html.is-tablet body.protected-shell.addressbar-toggle-enabled #addressBarToggle .ab-icon {
      width: 18px !important;
      height: 18px !important;
      min-width: 18px !important;
      min-height: 18px !important;
      display: none !important;
      object-fit: contain !important;
      margin: 0 !important;
      padding: 0 !important;
      transform: none !important;
    }
    html.is-phone body.protected-shell.addressbar-toggle-enabled #addressBarToggle.ab-state-full .ab-icon-full,
    html.is-tablet body.protected-shell.addressbar-toggle-enabled #addressBarToggle.ab-state-full .ab-icon-full {
      display: block !important;
    }
    html.is-phone body.protected-shell.addressbar-toggle-enabled #addressBarToggle.ab-state-small .ab-icon-small,
    html.is-tablet body.protected-shell.addressbar-toggle-enabled #addressBarToggle.ab-state-small .ab-icon-small {
      display: block !important;
    }
    html.is-phone body.protected-shell.addressbar-toggle-enabled #bottombar #bookmark,
    html.is-tablet body.protected-shell.addressbar-toggle-enabled #bottombar #bookmark {
      right: calc(52px + env(safe-area-inset-right, 0px));
    }
    @media (orientation: portrait) {
      html.is-phone body.protected-shell.addressbar-toggle-enabled #bottombar #page-count,
      html.is-tablet body.protected-shell.addressbar-toggle-enabled #bottombar #page-count {
        right: calc(92px + env(safe-area-inset-right, 0px));
      }
    }
    @media (orientation: landscape) {
      html.is-phone body.protected-shell #bottombar #page-count,
      html.is-tablet body.protected-shell #bottombar #page-count,
      html.is-phone body.protected-shell.addressbar-toggle-enabled #bottombar #page-count,
      html.is-tablet body.protected-shell.addressbar-toggle-enabled #bottombar #page-count {
        position: absolute;
        left: 50%;
        right: auto;
        top: 50%;
        transform: translate(-50%, -50%);
        width: auto;
        text-align: center;
        white-space: nowrap;
      }
      html.is-phone body.protected-shell #overlay-backdrop:not(.hidden),
      html.is-tablet body.protected-shell #overlay-backdrop:not(.hidden) {
        display: block !important;
      }
    }
    body.protected-shell #fontDec,
    body.protected-shell #fontInc {
      display: none !important;
    }
    #protectedLibraryControl {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      min-width: 32px;
      margin: 0;
      vertical-align: middle;
      order: 62;
    }
    #protectedSearchControl {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      min-width: 32px;
      margin: 0;
      vertical-align: middle;
      order: 61;
    }
    #protectedLibraryTrigger {
      appearance: none;
      -webkit-appearance: none;
      background: transparent;
      color: #eef4fb;
      cursor: pointer;
      transition: color 140ms ease, opacity 140ms ease;
    }
    #protectedLibraryTrigger:hover,
    #protectedLibraryTrigger:focus-visible {
      opacity: 0.92;
    }
    #protectedLibraryTrigger img {
      width: 20px;
      height: 20px;
      display: block;
      object-fit: contain;
    }
    #protectedSearchTrigger {
      appearance: none;
      -webkit-appearance: none;
      background: transparent;
      color: #eef4fb;
      cursor: pointer;
      transition: color 140ms ease, opacity 140ms ease;
    }
    #protectedSearchTrigger:hover,
    #protectedSearchTrigger:focus-visible {
      opacity: 0.92;
    }
    #protectedSearchTrigger img {
      width: 20px;
      height: 20px;
      display: block;
      object-fit: contain;
      filter: brightness(0) invert(1);
      opacity: 0.92;
    }
    #protectedTypographyControl {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      min-width: 32px;
      margin: 0;
      vertical-align: middle;
      order: 64;
    }
    body.protected-shell #themeToggle {
      order: 60;
    }
    #protectedTypographyTrigger {
      appearance: none;
      -webkit-appearance: none;
      background: transparent;
      color: #eef4fb;
      cursor: pointer;
      transition: color 140ms ease, opacity 140ms ease;
    }
    #protectedTypographyTrigger:hover,
    #protectedTypographyTrigger:focus-visible {
      opacity: 0.92;
    }
    #protectedTypographyTrigger svg {
      width: 22px;
      height: 22px;
      display: block;
      stroke: currentColor;
      fill: none;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    #protectedTypographyTrigger img {
      width: 20px;
      height: 20px;
      display: block;
      object-fit: contain;
    }
    body.protected-shell #themeToggle .theme-icon {
      width: 20px;
      height: 20px;
      display: block;
      object-fit: contain;
    }
    body.protected-shell #themeToggle,
    body.protected-shell #ttsToggleDesktop,
    #protectedLibraryTrigger,
    #protectedSearchTrigger,
    #protectedTypographyTrigger {
      opacity: 0.96;
    }
    #protectedLibraryControl > #protectedLibraryTrigger,
    #protectedSearchControl > #protectedSearchTrigger,
    #protectedTypographyControl > #protectedTypographyTrigger {
      flex: 0 0 32px;
      width: 32px !important;
      min-width: 32px !important;
    }
    body.protected-shell #themeToggle:hover,
    body.protected-shell #themeToggle:focus-visible,
    body.protected-shell #ttsToggleDesktop:hover,
    body.protected-shell #ttsToggleDesktop:focus-visible,
    #protectedLibraryTrigger:hover,
    #protectedLibraryTrigger:focus-visible,
    #protectedSearchTrigger:hover,
    #protectedSearchTrigger:focus-visible,
    #protectedTypographyTrigger:hover,
    #protectedTypographyTrigger:focus-visible {
      opacity: 1;
    }
    #protectedTypographyTrigger[aria-expanded="true"] {
      color: #ffffff;
    }
    #overlay-library {
      left: auto;
      right: 0;
      width: 360px;
      max-width: min(100vw, 360px);
      z-index: 9999;
      display: flex;
      flex-direction: column;
    }
    #overlay-library .overlay-scroll {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
      padding-top: 10px;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      overscroll-behavior: contain;
      overscroll-behavior-y: contain;
      -webkit-overflow-scrolling: touch;
      touch-action: pan-y !important;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    #overlay-library .overlay-scroll::-webkit-scrollbar {
      width: 0;
      height: 0;
      display: none;
    }
    #overlay-search .overlay-scroll {
      flex: 1 1 auto;
      min-height: 0;
      padding-top: 10px;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      overscroll-behavior: contain;
      overscroll-behavior-y: contain;
      -webkit-overflow-scrolling: touch;
      touch-action: pan-y !important;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    #overlay-search .overlay-scroll::-webkit-scrollbar {
      width: 0;
      height: 0;
      display: none;
    }
    #protectedSearchInputWrap {
      position: relative;
      display: flex;
      align-items: center;
      width: 100%;
    }
    #protectedSearchInput {
      width: 100%;
      min-height: 44px;
      padding: 10px 44px 10px 14px;
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 12px;
      background: rgba(255,255,255,0.06);
      color: #ffffff;
      font: 500 16px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      outline: none;
      box-sizing: border-box;
      appearance: none;
      -webkit-appearance: none;
    }
    #protectedSearchInput::placeholder {
      color: rgba(255,255,255,0.42);
    }
    #protectedSearchInput::-webkit-search-decoration,
    #protectedSearchInput::-webkit-search-cancel-button,
    #protectedSearchInput::-webkit-search-results-button,
    #protectedSearchInput::-webkit-search-results-decoration {
      display: none;
      -webkit-appearance: none;
    }
    #protectedSearchAction {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      width: 30px;
      height: 30px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 0;
      background: transparent;
      color: rgba(255,255,255,0.9);
      cursor: pointer;
      padding: 0;
    }
    #protectedSearchAction svg {
      width: 18px;
      height: 18px;
      display: block;
    }
    #protectedSearchAction .search-clear-x {
      display: none;
      font-size: 20px;
      line-height: 1;
    }
    #protectedSearchAction.is-clear .search-clear-x {
      display: block;
    }
    #protectedSearchAction.is-clear .search-mag-svg {
      display: none;
    }
    #protectedSearchMeta {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
    }
    #protectedSearchCount {
      display: none;
    }
    #protectedSearchNav {
      display: none !important;
      align-items: center;
      gap: 8px;
    }
    #protectedSearchPrev,
    #protectedSearchNext {
      width: 28px;
      height: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 999px;
      background: transparent;
      color: rgba(255,255,255,0.9);
      cursor: pointer;
      padding: 0;
    }
    #protectedSearchResults {
      display: none !important;
    }
    #protectedSearchResults li {
      margin: 0;
      padding: 0;
      border-bottom: 1px solid rgba(255,255,255,0.14);
    }
    #protectedSearchResults li:last-child {
      border-bottom: 0;
    }
    .protected-search-result {
      width: 100%;
      display: block;
      padding: 12px 0;
      border: 0;
      background: transparent;
      color: rgba(255,255,255,0.92);
      text-align: left;
      cursor: pointer;
    }
    .protected-search-result.is-active {
      color: #ffffff;
    }
    .protected-search-result-index {
      display: block;
      margin-bottom: 6px;
      color: rgba(255,255,255,0.52);
      font: 600 11px/1.1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .protected-search-result-excerpt {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
      overflow: hidden;
      text-overflow: ellipsis;
      font: 400 15px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .protected-search-result-context {
      color: rgba(255,255,255,0.58);
      font-weight: 400;
    }
    .protected-search-result-match {
      color: #ffffff;
      font-weight: 700;
    }
    #protectedSearchEmpty {
      display: none !important;
    }
    body.protected-shell #searchReturnDesktop {
      display: none;
    }
    body.protected-shell.search-active #searchReturnDesktop {
      display: inline-flex;
    }
    body.protected-shell #searchDesktop .search-nav.desktop {
      gap: 2px;
      flex: 0 0 auto;
      min-width: 0;
    }
    body.protected-shell #searchDesktop .search-nav.desktop .search-arrow,
    body.protected-shell #searchbar .search-nav .search-arrow {
      width: 28px;
      height: 28px;
      min-width: 28px;
      min-height: 28px;
      padding: 0;
      color: #ffffff;
      opacity: 0.92;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    body.protected-shell #searchDesktop .search-nav.desktop .search-arrow svg,
    body.protected-shell #searchbar .search-nav .search-arrow svg {
      width: 20px;
      height: 20px;
      display: block;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    body.protected-shell #searchReturnDesktop.search-return {
      width: 22px;
      height: 22px;
      min-width: 22px;
      min-height: 22px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    body.protected-shell #searchReturnDesktop.search-return img {
      width: 14px;
      height: 14px;
      display: block;
    }
    body.protected-shell #searchActionDesktop.search-action {
      width: 20px;
      height: 20px;
      color: rgba(255,255,255,0.54);
    }
    body.protected-shell #searchDesktop .search-input-wrap {
      flex: 0 0 auto;
      width: 150px;
      min-width: 150px;
      max-width: 150px;
      box-sizing: border-box;
      overflow: visible;
    }
    body.protected-shell #searchInputDesktop.search-input {
      width: 150px;
      min-width: 150px;
      max-width: 150px;
      box-sizing: border-box;
    }
    body.protected-shell #searchActionDesktop.search-action img.search-field-mag-icon,
    body.protected-shell #searchbar .search-input-wrap.mobile .search-infield-icon img.search-field-mag-icon {
      width: 18px;
      height: 18px;
      display: block;
      object-fit: contain;
      filter: brightness(0) saturate(100%) invert(77%) sepia(0%) saturate(0%) hue-rotate(158deg) brightness(92%) contrast(91%);
    }
    body.protected-shell #searchActionDesktop.search-action .search-mag-svg,
    body.protected-shell #searchbar .search-input-wrap.mobile .search-infield-icon .search-mag-svg {
      display: none !important;
    }
    body.protected-shell #searchActionDesktop.search-action.is-clear img.search-field-mag-icon {
      display: none !important;
    }
    body.protected-shell #searchActionDesktop.search-action.is-mag .search-clear-x {
      display: none !important;
    }
    body.protected-shell #searchbar .search-input-wrap.mobile {
      position: relative;
    }
    body.protected-shell #searchbar .search-input-wrap.mobile .search-infield-icon {
      left: auto;
      right: 8px;
      width: 18px;
      height: 18px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: rgba(255,255,255,0.54);
      pointer-events: none;
    }
    body.protected-shell #searchbar .search-input-wrap.mobile.has-clear .search-infield-icon {
      display: none;
    }
    body.protected-shell #searchInputMobile {
      padding-left: 10px;
      padding-right: 38px;
    }
    body.protected-shell #searchClearMobile {
      right: 8px;
      width: 18px;
      height: 18px;
      min-width: 18px;
      min-height: 18px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      line-height: 1;
      color: rgba(255,255,255,0.78);
    }
    body.protected-shell #searchClearMobile.hidden {
      display: none !important;
    }
    body.protected-shell #searchFloatControls {
      display: none !important;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 10px;
    }
    body.protected-shell #searchFloatControls .search-float-btn {
      width: 39px;
      height: 39px;
      min-width: 39px;
      min-height: 39px;
    }
    body.protected-shell #searchFloatControls .search-float-btn svg {
      width: 36px;
      height: 36px;
      display: block;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    body.protected-shell #searchFloatReturn.search-float-btn {
      width: 39px;
      height: 39px;
      min-width: 39px;
      min-height: 39px;
    }
    body.protected-shell #searchFloatReturn.search-float-btn img {
      width: 28px;
      height: 28px;
      display: block;
      object-fit: contain;
      filter: brightness(0) saturate(100%) invert(100%);
      transform: rotate(-90deg);
    }
    #protectedLibraryTabs {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: nowrap;
      gap: 10px;
      margin: 0 0 14px;
      width: 100%;
      min-width: 0;
    }
    .protected-library-tab {
      appearance: none;
      -webkit-appearance: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 1 auto;
      min-height: 34px;
      min-width: 0;
      padding: 8px 14px;
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 999px;
      background: transparent;
      color: rgba(255,255,255,0.82);
      font: 600 12px/1.1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0.01em;
      white-space: nowrap;
      cursor: pointer;
      transition: color 140ms ease, border-color 140ms ease, background 140ms ease;
    }
    .protected-library-tab.is-active {
      color: #ffffff;
      border-color: rgba(255,255,255,0.22);
      background: rgba(255,255,255,0.08);
    }
    .protected-library-pane.hidden {
      display: none !important;
    }
    .protected-library-pane {
      min-height: 0;
    }
    #protectedLibraryPane-notes {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
    }
    #protectedLibraryPane-notes.hidden {
      display: none !important;
    }
    #protectedLibraryNotesMount {
      flex: 1 1 auto;
      min-height: 0;
    }
    #protectedLibraryTocMount .view,
    #protectedLibraryNotesMount .view,
    #protectedLibraryBookmarksMount .view,
    #protectedLibraryMyBooksMount .view {
      display: block !important;
      width: 100%;
      min-width: 0;
      visibility: visible !important;
      overflow: visible;
    }
    #protectedLibraryTocMount #tocView,
    #protectedLibraryNotesMount #notesView,
    #protectedLibraryBookmarksMount #bookmarksView,
    #protectedLibraryMyBooksMount #mybooksView {
      width: 100%;
      min-width: 0;
      height: auto;
      min-height: 0;
      padding: 0;
      box-sizing: border-box;
      visibility: visible !important;
      overflow: visible;
    }
    #protectedLibraryNotesMount #notesView,
    #protectedLibraryBookmarksMount #bookmarksView,
    #protectedLibraryTocMount #tocView,
    #protectedLibraryMyBooksMount #mybooksView {
      overflow: visible !important;
    }
    #protectedLibraryNotesFooter {
      flex: 0 0 auto;
      margin-top: auto;
      margin-left: -16px;
      margin-right: -16px;
      padding: 8px 16px calc(8px + env(safe-area-inset-bottom));
      border-top: 1px solid rgba(255,255,255,0.14);
      background: rgba(72,72,72,0.96);
    }
    #protectedNotesShareBtn {
      width: 100%;
      height: auto;
      border: 0;
      border-radius: 0;
      background: transparent;
      color: #00d1bb;
      font: inherit;
      padding: 0;
      text-align: center;
      cursor: pointer;
      transition: color 120ms ease, opacity 120ms ease;
    }
    #protectedNotesShareBtn:disabled,
    #protectedNotesShareBtn.is-disabled {
      color: rgba(0,209,187,0.42);
      cursor: default;
      opacity: 0.55;
      pointer-events: none;
    }
    #protectedNotesShareBtn.is-copied {
      color: #00d1bb;
    }
    #protectedNotesShareBtn.is-failed {
      color: #ffb1b1;
    }
    body.protected-shell #overlay-library #tocView ul,
    body.protected-shell #overlay-library #protectedLibraryBookmarksList,
    body.protected-shell #overlay-library #bookmarksView ul,
    body.protected-shell #overlay-library #notes,
    body.protected-shell #overlay-library #mybooks {
      padding-left: 20px;
      margin-top: 0;
      margin-bottom: 24px;
    }
    body.protected-shell #overlay-library #tocView li,
    body.protected-shell #overlay-library #protectedLibraryBookmarksList li,
    body.protected-shell #overlay-library #bookmarksView li,
    body.protected-shell #overlay-library #notes > li.list_item,
    body.protected-shell #overlay-library #mybooks > li.list_item {
      width: auto;
      background: transparent;
      border: 0;
      box-shadow: none;
    }
    body.protected-shell #overlay-library #tocView a,
    body.protected-shell #overlay-library #tocView .toc_link,
    body.protected-shell #overlay-library #protectedLibraryBookmarksList a,
    body.protected-shell #overlay-library #protectedLibraryBookmarksList button.bookmark_link,
    body.protected-shell #overlay-library #notesView a,
    body.protected-shell #overlay-library #notesView button.bookmark_link,
    body.protected-shell #overlay-library #bookmarksView a,
    body.protected-shell #overlay-library #bookmarksView button.bookmark_link,
    body.protected-shell #overlay-library #notes .bookmark_link,
    body.protected-shell #overlay-library #notes .bookmark-comment,
    body.protected-shell #overlay-library #mybooks a,
    body.protected-shell #overlay-library #mybooks .book-title,
    body.protected-shell #overlay-library #mybooks .book-meta {
      color: inherit;
      background: transparent !important;
    }
    body.protected-shell #overlay-library #protectedLibraryBookmarksList {
      list-style: none;
    }
    body.protected-shell #overlay-library #protectedLibraryBookmarksList > li.list_item,
    body.protected-shell #overlay-library #notesView > li.list_item,
    body.protected-shell #overlay-library #notes > li.list_item,
    body.protected-shell #overlay-library #bookmarksView > li.list_item,
    body.protected-shell #overlay-library #bookmarks > li.list_item,
    body.protected-shell #overlay-library #mybooks > li.list_item {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 0 0 14px;
      margin: 0 0 14px;
      border-bottom: 1px solid rgba(255,255,255,0.14);
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
      touch-action: manipulation;
    }
    body.protected-shell #overlay-library #protectedLibraryBookmarksList > li.list_item:last-child,
    body.protected-shell #overlay-library #notesView > li.list_item:last-child,
    body.protected-shell #overlay-library #notes > li.list_item:last-child,
    body.protected-shell #overlay-library #bookmarksView > li.list_item:last-child,
    body.protected-shell #overlay-library #bookmarks > li.list_item:last-child,
    body.protected-shell #overlay-library #mybooks > li.list_item:last-child {
      margin-bottom: 0;
      border-bottom: 0;
    }
    body.protected-shell #overlay-library #protectedLibraryBookmarksList .bookmark-text,
    body.protected-shell #overlay-library #notesView .bookmark-text,
    body.protected-shell #overlay-library #notes .bookmark-text,
    body.protected-shell #overlay-library #bookmarksView .bookmark-text,
    body.protected-shell #overlay-library #bookmarks .bookmark-text,
    body.protected-shell #overlay-library #mybooks .bookmark-text {
      flex: 1 1 auto;
      min-width: 0;
      margin: 0;
      padding: 0;
    }
    body.protected-shell #overlay-library #notesView .bookmark-page-label,
    body.protected-shell #overlay-library #notes .bookmark-page-label {
      display: block;
      margin: 0 0 6px;
      padding: 0;
      font-size: 1em;
      line-height: 1.1;
      color: rgba(255,255,255,0.95);
    }
    body.protected-shell #overlay-library #protectedLibraryBookmarksList .bookmark_link,
    body.protected-shell #overlay-library #notesView .bookmark_link,
    body.protected-shell #overlay-library #notes .bookmark_link,
    body.protected-shell #overlay-library #bookmarksView .bookmark_link,
    body.protected-shell #overlay-library #bookmarks .bookmark_link,
    body.protected-shell #overlay-library #mybooks .bookmark_link {
      margin: 0;
      padding: 0;
      display: block;
      width: 100%;
      appearance: none;
      -webkit-appearance: none;
      border: 0;
      background: transparent;
      box-shadow: none;
      text-align: left;
      color: inherit;
      font: inherit;
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
      touch-action: manipulation;
    }
    body.protected-shell #overlay-library #mybooks .bookmark_link {
      color: rgba(255,255,255,0.96);
      font-size: 0.96em;
      font-weight: 600;
      line-height: 1.24;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      text-overflow: ellipsis;
      max-height: calc(1.24em * 2);
    }
    body.protected-shell #overlay-library #notesView .bookmark_link,
    body.protected-shell #overlay-library #notes .bookmark_link {
      font-size: 0.84em;
      line-height: 1.32;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      text-overflow: ellipsis;
      color: rgba(255,255,255,0.92);
    }
    body.protected-shell #overlay-library #protectedLibraryBookmarksList .bookmark-comment,
    body.protected-shell #overlay-library #notesView .bookmark-comment,
    body.protected-shell #overlay-library #notes .bookmark-comment,
    body.protected-shell #overlay-library #bookmarksView .bookmark-comment,
    body.protected-shell #overlay-library #bookmarks .bookmark-comment,
    body.protected-shell #overlay-library #mybooks .bookmark-comment {
      margin: 6px 0 0;
      padding: 0;
      font-size: 0.84em;
      line-height: 1.28;
      user-select: none;
      -webkit-user-select: none;
    }
    body.protected-shell #overlay-library #mybooks .bookmark-comment {
      color: rgba(255,255,255,0.56);
      font-size: 0.78em;
      line-height: 1.24;
    }
    body.protected-shell #protectedSettingsBookCardMount {
      margin: 0 0 18px;
      padding: 0 0 18px;
      border-bottom: 1px solid rgba(255,255,255,0.14);
    }
    body.protected-shell #protectedSettingsBookCardMount #protectedSettingsBookCard {
      display: flex;
      gap: 14px;
      align-items: center;
      width: 100%;
      min-width: 0;
      padding: 6px 0 18px;
      border: 0;
      background: transparent;
      box-shadow: none;
      overflow: hidden;
    }
    body.protected-shell #protectedSettingsBookCardMount #protectedSettingsBookCard > * {
      min-width: 0;
    }
    body.protected-shell #protectedSettingsBookCardMount .protected-book-cover-wrap {
      width: 104px;
      height: 148px;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      flex: 0 0 104px;
      min-width: 104px;
      max-width: 104px;
      overflow: hidden;
    }
    body.protected-shell #protectedSettingsBookCardMount #protectedSettingsBookCover,
    body.protected-shell #protectedSettingsBookCardMount .protected-book-cover,
    body.protected-shell #protectedSettingsBookCardMount .protected-book-cover-placeholder {
      width: 100%;
      height: 100%;
    }
    body.protected-shell #protectedSettingsBookCardMount #protectedSettingsBookCover,
    body.protected-shell #protectedSettingsBookCardMount .protected-book-cover {
      display: block;
      object-fit: contain;
      object-position: left center;
    }
    body.protected-shell #protectedSettingsBookCardMount .protected-book-cover-placeholder {
      background: transparent;
      border: 0;
    }
    body.protected-shell #protectedSettingsBookCardMount .protected-book-meta {
      min-width: 0;
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    body.protected-shell #protectedSettingsBookCardMount #protectedSettingsBookTitle,
    body.protected-shell #protectedSettingsBookCardMount #protectedSettingsBookAuthor {
      width: auto;
      text-align: left;
      line-height: 1.35;
    }
    body.protected-shell #protectedSettingsBookCardMount #protectedSettingsBookTitle {
      font-size: 18px;
      font-weight: 600;
      margin: 0;
    }
    body.protected-shell #protectedSettingsBookCardMount #protectedSettingsBookAuthor {
      font-size: 14px;
      opacity: 0.9;
      margin: 8px 0 0;
    }
    body.protected-shell #overlay-library #notesView .bookmark-comment,
    body.protected-shell #overlay-library #notes .bookmark-comment {
      margin-top: 10px;
      font-size: 1em;
      line-height: 1.34;
      color: rgba(255,255,255,0.96);
    }
    body.protected-shell #overlay-library #protectedLibraryBookmarksList .bookmark-delete,
    body.protected-shell #overlay-library #notesView .bookmark-delete,
    body.protected-shell #overlay-library #notes .bookmark-delete,
    body.protected-shell #overlay-library #bookmarksView .bookmark-delete,
    body.protected-shell #overlay-library #bookmarks .bookmark-delete,
    body.protected-shell #overlay-library #mybooks .bookmark-delete {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      width: 22px;
      height: 22px;
      margin: 0;
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      opacity: 0.82;
      box-shadow: none;
      appearance: none;
      -webkit-appearance: none;
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
      touch-action: manipulation;
    }
    body.protected-shell #overlay-library #protectedLibraryBookmarksList .bookmark-delete:hover,
    body.protected-shell #overlay-library #notesView .bookmark-delete:hover,
    body.protected-shell #overlay-library #notes .bookmark-delete:hover,
    body.protected-shell #overlay-library #bookmarksView .bookmark-delete:hover,
    body.protected-shell #overlay-library #bookmarks .bookmark-delete:hover,
    body.protected-shell #overlay-library #mybooks .bookmark-delete:hover {
      opacity: 1;
    }
    body.protected-shell #overlay-library #protectedLibraryBookmarksList .bookmark-delete svg,
    body.protected-shell #overlay-library #notesView .bookmark-delete svg,
    body.protected-shell #overlay-library #notes .bookmark-delete svg,
    body.protected-shell #overlay-library #bookmarksView .bookmark-delete svg,
    body.protected-shell #overlay-library #bookmarks .bookmark-delete svg,
    body.protected-shell #overlay-library #mybooks .bookmark-delete svg {
      width: 18px;
      height: 18px;
      stroke: currentColor;
      stroke-width: 1.8;
      fill: none;
    }
    body.protected-shell #overlay-library #tocView button {
      appearance: none;
      -webkit-appearance: none;
      background: transparent;
      border: 0;
      padding: 0;
      margin: 0;
      color: inherit;
      font: inherit;
      text-align: left;
      box-shadow: none;
    }
    body.protected-shell #overlay-library #tocView li.currentChapter > a.toc_link,
    body.protected-shell #overlay-library #tocView li.currentChapter > .toc_link {
      background: transparent !important;
      text-decoration: underline;
    }
    body.protected-shell #overlay-library .notes-copy-link-wrap {
      display: none !important;
    }
    #overlay-settings {
      left: auto;
      right: 0;
      width: 360px;
      max-width: min(100vw, 360px);
      z-index: 9999;
      display: flex;
      flex-direction: column;
    }
    #overlay-settings .overlay-scroll {
      flex: 1 1 auto;
      min-height: 0;
      padding-top: 16px;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      overscroll-behavior: contain;
      overscroll-behavior-y: contain;
      -webkit-overflow-scrolling: touch;
      touch-action: pan-y !important;
    }
    #overlay-settings .overlay-footer {
      flex: 0 0 auto;
      margin-top: auto;
      padding: 8px 16px calc(8px + env(safe-area-inset-bottom, 0px));
      border-top: 1px solid rgba(255,255,255,0.14);
      background: rgba(72,72,72,0.96);
    }
    #overlay-settings .overlay-footer .protected-settings-footer-button {
      appearance: none;
      -webkit-appearance: none;
      display: block;
      width: 100%;
      padding: 0;
      border: 0;
      background: transparent;
      color: #00d1bb;
      font: 600 13px/1.3 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0.01em;
      text-align: center;
      cursor: pointer;
    }
    #overlay-settings .overlay-footer .protected-settings-footer-button:disabled {
      color: rgba(255,255,255,0.42);
      cursor: not-allowed;
    }
    #protectedSettingsTextSection,
    #protectedSettingsVoiceSection {
      color: #ffffff;
    }
    #protectedSettingsTextSectionTitle,
    #protectedSettingsVoiceSectionTitle {
      font: 600 14px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0.01em;
      color: #ffffff;
      margin: 0 0 14px;
    }
    #protectedSettingsVoiceSection {
      margin-top: 18px;
      padding-top: 16px;
      border-top: 1px solid rgba(255,255,255,0.18);
    }
    #protectedTypographyPanel {
      position: static;
      display: block;
      width: 100%;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
      backdrop-filter: none;
    }
    #protectedTypographyPanel .grabber {
      display: none !important;
    }
    #protectedTypographyModes {
      display: grid;
      grid-template-columns: repeat(2, auto);
      justify-content: center;
      gap: 32px;
      margin: 0 0 20px;
    }
    .protected-typography-mode {
      appearance: none;
      -webkit-appearance: none;
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-items: center;
      justify-content: center;
      min-height: 56px;
      padding: 0;
      border-radius: 0;
      border: 0;
      background: transparent;
      color: #ffffff;
      cursor: pointer;
      text-align: center;
      transition: color 140ms ease, opacity 140ms ease;
    }
    .protected-typography-mode .sample {
      font-size: 19px;
      line-height: 0.82;
      letter-spacing: -0.025em;
      opacity: 0.96;
      color: #ffffff;
    }
    .protected-typography-mode[data-font-mode="sans"] .sample {
      font-family: Arial, Helvetica, sans-serif;
      font-weight: 400;
    }
    .protected-typography-mode[data-font-mode="serif"] .sample {
      font-family: Georgia, "Times New Roman", serif;
      font-weight: 400;
    }
    .protected-typography-mode .label {
      font: 700 13px/1.1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0.01em;
      text-align: center;
      color: #ffffff;
    }
    .protected-typography-mode.is-active {
      color: #00d1bb;
    }
    .protected-typography-mode.is-active .sample {
      color: #00d1bb;
      text-decoration: underline;
      text-underline-offset: 5px;
      text-decoration-thickness: 1.5px;
    }
    .protected-typography-mode.is-active .label {
      color: #00d1bb;
    }
    .protected-typography-mode[aria-disabled="true"] {
      opacity: 0.42;
      cursor: not-allowed;
      pointer-events: none;
    }
    .protected-typography-size {
      padding: 2px 0 4px;
    }
    .protected-typography-size-row {
      display: grid;
      grid-template-columns: 16px minmax(0, 1fr) 18px;
      align-items: center;
      gap: 10px;
    }
    .protected-typography-size-row .small {
      font: 500 14px/1 Arial, Helvetica, sans-serif;
      color: #ffffff;
      text-align: center;
    }
    .protected-typography-size-row .large {
      font: 600 17px/1 Arial, Helvetica, sans-serif;
      color: #ffffff;
      text-align: center;
    }
    #protectedTypographyScale {
      --protected-typography-scale-pct: 37.5%;
      appearance: none;
      -webkit-appearance: none;
      width: 100%;
      margin: 0;
      height: 6px;
      border-radius: 999px;
      outline: none;
      background: linear-gradient(
        to right,
        #00d1bb 0%,
        #00d1bb var(--protected-typography-scale-pct),
        rgba(255,255,255,0.28) var(--protected-typography-scale-pct),
        rgba(255,255,255,0.28) 100%
      );
      accent-color: #00d1bb;
    }
    #protectedTypographyScale::-webkit-slider-runnable-track {
      height: 6px;
      border-radius: 999px;
      background: transparent;
    }
    #protectedTypographyScale::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 18px;
      height: 18px;
      margin-top: -6px;
      border: 0;
      border-radius: 50%;
      background: #00d1bb;
      box-shadow: 0 0 0 2px rgba(0,0,0,0.1);
    }
    #protectedTypographyScale::-moz-range-track {
      height: 6px;
      border: 0;
      border-radius: 999px;
      background: rgba(255,255,255,0.28);
    }
    #protectedTypographyScale::-moz-range-progress {
      height: 6px;
      border-radius: 999px;
      background: #00d1bb;
    }
    #protectedTypographyScale::-moz-range-thumb {
      width: 18px;
      height: 18px;
      border: 0;
      border-radius: 50%;
      background: #00d1bb;
      box-shadow: 0 0 0 2px rgba(0,0,0,0.1);
    }
    #protectedSettingsVoiceMount .voice-picker-status,
    #protectedSettingsVoiceMount .voice-picker-label,
    #protectedSettingsVoiceMount .voice-picker-dropdown-toggle,
    #protectedSettingsVoiceMount .voice-picker-dropdown-list,
    #protectedSettingsVoiceMount .voice-picker-dropdown-option,
    #protectedSettingsVoiceMount .voice-picker-select {
      color: #ffffff !important;
    }
    #overlay-settings #voiceView,
    #protectedSettingsVoiceMount #voiceView {
      font-family: var(--ui-font-family);
      font-size: calc(var(--bottom-font-size, 14px) * 1.2);
      visibility: visible !important;
      display: block !important;
      width: 100%;
      height: auto;
      min-width: 0;
      overflow: visible;
      padding: 4px 0 0;
      box-sizing: border-box;
    }
    #overlay-settings #voiceView ul,
    #protectedSettingsVoiceMount #voiceView ul,
    #overlay-settings #voiceView li,
    #protectedSettingsVoiceMount #voiceView li,
    #overlay-settings .voice-picker-wrap,
    #protectedSettingsVoiceMount .voice-picker-wrap {
      display: block;
      visibility: visible;
      opacity: 1;
    }
    #protectedSettingsVoiceMount .voice-picker-dropdown-toggle,
    #protectedSettingsVoiceMount .voice-picker-dropdown-list {
      border-color: rgba(255,255,255,0.18) !important;
      background: rgba(255,255,255,0.05) !important;
    }
    #overlay-settings .voice-picker-wrap,
    #protectedSettingsVoiceMount .voice-picker-wrap {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    #overlay-settings .voice-picker-label,
    #protectedSettingsVoiceMount .voice-picker-label {
      font-size: 14px;
      color: #ffffff;
    }
    #overlay-settings .voice-picker-dropdown,
    #protectedSettingsVoiceMount .voice-picker-dropdown {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
      width: 100%;
    }
    #overlay-settings .voice-picker-dropdown-toggle,
    #protectedSettingsVoiceMount .voice-picker-dropdown-toggle {
      width: 100%;
      min-height: 44px;
      padding: 8px 40px 8px 12px;
      font-size: 14px;
      text-align: left;
      position: relative;
      box-sizing: border-box;
    }
    #overlay-settings .voice-picker-dropdown-list,
    #protectedSettingsVoiceMount .voice-picker-dropdown-list {
      display: none;
      position: static;
      left: auto;
      top: auto;
      width: 100%;
      max-height: min(220px, 38vh);
      overflow-y: auto;
      border-radius: 6px;
      z-index: auto;
      margin: 0;
      box-sizing: border-box;
    }
    #overlay-settings .voice-picker-dropdown.is-open .voice-picker-dropdown-list,
    #protectedSettingsVoiceMount .voice-picker-dropdown.is-open .voice-picker-dropdown-list {
      display: block;
    }
    #overlay-settings .voice-picker-option,
    #protectedSettingsVoiceMount .voice-picker-option {
      width: 100%;
      border: 0;
      border-bottom: 1px solid rgba(255,255,255,0.18);
      background: transparent;
      color: var(--fbbar-fg);
      padding: 8px 10px;
      text-align: left;
      font-size: 14px;
      cursor: pointer;
      box-sizing: border-box;
    }
    #overlay-settings .voice-picker-option:last-child,
    #protectedSettingsVoiceMount .voice-picker-option:last-child {
      border-bottom: 0;
    }
    #overlay-settings .voice-picker-option.is-selected,
    #protectedSettingsVoiceMount .voice-picker-option.is-selected {
      background: rgba(255, 255, 255, 0.08);
    }
    #overlay-settings .voice-picker-status,
    #protectedSettingsVoiceMount .voice-picker-status {
      display: none !important;
    }
    body.protected-shell .protected-control-disabled,
    body.protected-shell .protected-control-disabled:hover {
      opacity: 0.42;
      cursor: not-allowed;
      pointer-events: none;
      background: transparent;
    }
    body.protected-shell #page-count {
      display: inline-block !important;
      visibility: visible !important;
      opacity: 1 !important;
    }
    body.protected-shell.protected-theme-dark {
      background: #101926;
    }
    body.protected-shell.protected-theme-dark #main,
    body.protected-shell.protected-theme-dark #viewerStack,
    body.protected-shell.protected-theme-dark #viewer,
    body.protected-shell.protected-theme-dark #viewer-prev,
    body.protected-shell.protected-theme-dark #viewer-next {
      background: #101926 !important;
    }
    body.protected-shell.protected-theme-dark #protectedOldShellHost {
      background: transparent;
    }
    body.protected-shell.protected-theme-dark #book-title,
    body.protected-shell.protected-theme-dark #chapter-title,
    body.protected-shell.protected-theme-dark #page-count {
      color: #eef4fb;
    }
    body.protected-shell.protected-theme-dark #searchDesktop,
    body.protected-shell.protected-theme-dark #searchbar {
      color: #eef4fb;
    }
    body.protected-shell.protected-theme-dark #protectedTypographyTrigger[aria-expanded="true"] {
      color: #ffffff;
    }
    body.protected-shell #protectedSettingsBookCoverPlaceholder {
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    }
    #protectedShellActionBar input {
      min-width: 180px;
      flex: 1 1 220px;
      border-radius: 999px;
      border: 1px solid rgba(12, 78, 101, 0.18);
      padding: 10px 14px;
      font: inherit;
    }
    #protectedShellActionBar button {
      border-radius: 999px;
      border: 1px solid rgba(10, 129, 117, 0.24);
      background: white;
      color: #0a8175;
      font: inherit;
      font-weight: 700;
      padding: 10px 14px;
      cursor: pointer;
    }
    #protectedShellActionBar .status {
      color: #607189;
      font-weight: 600;
      white-space: nowrap;
    }
    body.protected-shell .reader-engine-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 30px;
      height: 30px;
      border-radius: 999px;
      border: 1px solid rgba(10, 129, 117, 0.18);
      background: rgba(10, 129, 117, 0.08);
      color: #0a8175;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    body.protected-shell .reader-engine-badge {
      display: none !important;
    }
    body.protected-shell #prev,
    body.protected-shell #next {
      appearance: none;
      -webkit-appearance: none;
      width: 78px;
      z-index: 9;
      opacity: 0;
      color: transparent;
      background: transparent !important;
      font-size: 0 !important;
      line-height: 0 !important;
      text-indent: -10000px;
      overflow: hidden;
      transition: opacity 160ms ease;
      outline: none !important;
      box-shadow: none !important;
      -webkit-tap-highlight-color: transparent !important;
      tap-highlight-color: transparent !important;
      touch-action: manipulation;
    }
    .protected-nav-edge {
      appearance: none;
      -webkit-appearance: none;
      -webkit-tap-highlight-color: transparent !important;
      user-select: none;
      -webkit-user-select: none;
      outline: none !important;
      box-shadow: none !important;
    }
    body.protected-shell #prev:focus,
    body.protected-shell #next:focus,
    body.protected-shell #prev:focus-visible,
    body.protected-shell #next:focus-visible,
    .protected-nav-edge:focus,
    .protected-nav-edge:focus-visible,
    .protected-nav-edge:active {
      outline: none !important;
      box-shadow: none !important;
      -webkit-tap-highlight-color: transparent !important;
    }
    body.protected-shell #prev::before,
    body.protected-shell #next::before {
      content: none;
      pointer-events: none;
      opacity: 1;
      transition: opacity 160ms ease;
    }
    body.protected-shell #prev::after,
    body.protected-shell #next::after {
      content: "";
      position: absolute;
      width: 16px;
      height: 16px;
      border-top: 3px solid rgba(149, 149, 149, 0.96);
      border-right: 3px solid rgba(149, 149, 149, 0.96);
      top: 50%;
      left: 50%;
      margin-top: -8px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 160ms ease;
    }
    body.protected-shell #next::after {
      margin-left: -12px;
      transform: rotate(45deg);
    }
    body.protected-shell #prev::after {
      margin-left: -4px;
      transform: rotate(-135deg);
    }
    body.protected-shell.protected-theme-dark #prev::after,
    body.protected-shell.protected-theme-dark #next::after {
      border-top-color: rgba(214, 222, 232, 0.96);
      border-right-color: rgba(214, 222, 232, 0.96);
    }
    html.is-desktop body.protected-shell #prev,
    html.is-desktop body.protected-shell #next,
    html.is-desktop body.protected-shell #prev::after,
    html.is-desktop body.protected-shell #next::after {
      opacity: 1;
    }
    body.protected-shell #prev[data-nav-hidden="true"],
    body.protected-shell #next[data-nav-hidden="true"],
    body.protected-shell #prev[data-nav-hidden="true"]::after,
    body.protected-shell #next[data-nav-hidden="true"]::after,
    .protected-nav-edge[data-nav-hidden="true"] {
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
    @media (orientation: landscape) {
      html.is-phone body.protected-shell #prev,
      html.is-phone body.protected-shell #next,
      html.is-tablet body.protected-shell #prev,
      html.is-tablet body.protected-shell #next {
        display: none !important;
        opacity: 0 !important;
      }
      html.is-phone body.protected-shell #prev::after,
      html.is-phone body.protected-shell #next::after,
      html.is-tablet body.protected-shell #prev::after,
      html.is-tablet body.protected-shell #next::after {
        opacity: 0 !important;
      }
    }
    @media (max-width: 820px) {
      #overlay-settings {
        left: auto;
        right: 0;
        width: min(100vw, 360px);
      }
      #overlay-library {
        left: auto;
        right: 0;
        width: min(100vw, 360px);
      }
    }
    @media (orientation: portrait) {
      html.is-phone body.protected-shell #overlay-settings,
      html.is-tablet body.protected-shell #overlay-settings {
        top: 0 !important;
        bottom: auto !important;
        height: 67svh !important;
        max-height: 67svh !important;
      }
      html.is-phone body.protected-shell #overlay-settings .overlay-scroll,
      html.is-phone body.protected-shell #overlay-library .overlay-scroll,
      html.is-phone body.protected-shell #overlay-search .overlay-scroll,
      html.is-tablet body.protected-shell #overlay-settings .overlay-scroll,
      html.is-tablet body.protected-shell #overlay-library .overlay-scroll,
      html.is-tablet body.protected-shell #overlay-search .overlay-scroll {
        overflow-y: auto !important;
        overflow-x: hidden !important;
        touch-action: pan-y !important;
        overscroll-behavior: contain;
        overscroll-behavior-y: contain;
        -webkit-overflow-scrolling: touch;
      }
    }
    body.protected-shell #metainfo,
    body.protected-shell #metaText,
    body.protected-shell #book-title,
    body.protected-shell #chapter-title {
      min-width: 0 !important;
      overflow: hidden !important;
    }
    body.protected-shell #metaText,
    body.protected-shell #book-title,
    body.protected-shell #chapter-title {
      max-width: 100% !important;
    }
    body.protected-shell #book-title,
    body.protected-shell #chapter-title {
      display: block !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-shell #metainfo {
      left: 50% !important;
      right: auto !important;
      width: min(44vw, 620px) !important;
      max-width: calc(100vw - 420px) !important;
      transform: translate(-50%, -50%) !important;
      justify-content: center !important;
      text-align: center !important;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-shell #metaText {
      align-items: center !important;
      text-align: center !important;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-shell #book-title,
    html:not(.is-phone):not(.is-tablet) body.protected-shell #chapter-title {
      text-align: center !important;
    }
    html.is-phone body.protected-shell #metainfo,
    html.is-tablet body.protected-shell #metainfo {
      position: absolute !important;
      top: 50% !important;
      left: calc(14px + env(safe-area-inset-left, 0px)) !important;
      right: calc(238px + env(safe-area-inset-right, 0px)) !important;
      width: auto !important;
      max-width: none !important;
      max-height: calc(var(--titlebar-h, 43px) - 8px) !important;
      transform: translateY(-50%) !important;
      justify-content: flex-start !important;
      text-align: left !important;
    }
    html.is-phone body.protected-shell #metaText,
    html.is-tablet body.protected-shell #metaText {
      align-items: flex-start !important;
      justify-content: center !important;
      text-align: left !important;
      line-height: 1.08 !important;
      max-height: calc(var(--titlebar-h, 43px) - 8px) !important;
    }
    html.is-phone body.protected-shell #book-title,
    html.is-phone body.protected-shell #chapter-title,
    html.is-tablet body.protected-shell #book-title,
    html.is-tablet body.protected-shell #chapter-title {
      text-align: left !important;
    }
    @media (orientation: landscape) {
      html.is-phone body.protected-shell #metainfo,
      html.is-tablet body.protected-shell #metainfo {
        left: 50% !important;
        right: auto !important;
        width: min(40vw, 420px) !important;
        max-width: calc(100vw - 440px) !important;
        transform: translate(-50%, -50%) !important;
        justify-content: center !important;
        text-align: center !important;
      }
      html.is-phone body.protected-shell #metaText,
      html.is-tablet body.protected-shell #metaText {
        align-items: center !important;
        text-align: center !important;
      }
      html.is-phone body.protected-shell #book-title,
      html.is-phone body.protected-shell #chapter-title,
      html.is-tablet body.protected-shell #book-title,
      html.is-tablet body.protected-shell #chapter-title {
        text-align: center !important;
      }
      html.is-phone body.protected-shell #protectedBottomCatalogLink,
      html.is-tablet body.protected-shell #protectedBottomCatalogLink {
        display: none !important;
      }
    }
    @media (orientation: portrait) {
      html.is-phone body.protected-shell #metainfo,
      html.is-tablet body.protected-shell #metainfo {
        left: calc(2px + env(safe-area-inset-left, 0px)) !important;
        right: calc(222px + env(safe-area-inset-right, 0px)) !important;
      }
      html.is-phone body.protected-shell #title-controls,
      html.is-tablet body.protected-shell #title-controls {
        right: calc(0px + env(safe-area-inset-right, 0px)) !important;
      }
    }
  `;
  document.head.append(style);
}

function openProtectedNotesPanel() {
  openLibraryOverlay("notes");
}

function setShellLoading(active) {
  const loader = document.getElementById("loader");
  if (!loader) return;
  if (active) HOST_STATE.loadingCount += 1;
  else HOST_STATE.loadingCount = Math.max(0, HOST_STATE.loadingCount - 1);
  const shouldShow = HOST_STATE.loadingCount > 0;
  loader.hidden = !shouldShow;
  loader.setAttribute("aria-hidden", shouldShow ? "false" : "true");
  loader.style.display = shouldShow ? "block" : "none";
  loader.style.visibility = shouldShow ? "visible" : "hidden";
  loader.style.opacity = shouldShow ? "1" : "0";
}

function setHostActionStatus(message) {
  const actionStatus = document.getElementById("protectedShellActionStatus");
  if (actionStatus && message) actionStatus.textContent = String(message);
}

function showProtectedSelectionToast(message) {
  if (!isReader1DesktopShareMode()) return;
  try {
    let toast = document.getElementById("selectionCopyToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "selectionCopyToast";
      toast.className = "selection-copy-toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }
    toast.textContent = String(message || "");
    if (toast.__protectedHideTimer) {
      window.clearTimeout(toast.__protectedHideTimer);
      toast.__protectedHideTimer = null;
    }
    toast.classList.remove("is-hiding");
    toast.classList.add("is-visible");
    toast.__protectedHideTimer = window.setTimeout(() => {
      toast.classList.add("is-hiding");
      toast.classList.remove("is-visible");
      toast.__protectedHideTimer = null;
    }, 900);
  } catch (_error) {}
}

function isPhoneOrTabletShell() {
  const root = document.documentElement;
  return !!(root && (root.classList.contains("is-phone") || root.classList.contains("is-tablet")));
}

function isReader1DesktopShareMode() {
  try {
    let desktopRaw = false;
    if (window.matchMedia && window.matchMedia("(min-width: 769px)").matches) desktopRaw = true;
    if (window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches) desktopRaw = true;
    return !!(desktopRaw && !isTabletViewportHost());
  } catch (_error) {}
  const root = document.documentElement;
  return !!(root && root.classList.contains("is-desktop") && !isPhoneOrTabletShell());
}

function shouldUseNativeSelectionShare() {
  if (!navigator.share) return false;
  if (isPhoneOrTabletShell()) return true;
  try {
    if (hasTouchLikeViewportHost()) return true;
  } catch (_error) {}
  return false;
}

async function copyTextToClipboard(text) {
  const normalized = String(text || "");
  if (!normalized) throw new Error("Create a non-empty selection first.");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(normalized);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = normalized;
  textarea.setAttribute("readonly", "readonly");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  textarea.style.top = "-1000px";
  textarea.style.left = "-1000px";
  document.body.append(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const ok = document.execCommand("copy");
  textarea.remove();
  if (!ok) throw new Error("Unable to copy selection.");
}

function getFontScaleStorageKey() {
  return `${FONT_SCALE_STORAGE_PREFIX}${getCurrentBookId()}`;
}

function getFontModeStorageKey() {
  return `${FONT_MODE_STORAGE_PREFIX}${getCurrentBookId()}`;
}

function migratePriorProtectedShellStorageValue({ currentKey = "", valueSuffix = "", normalize }) {
  try {
    if (!currentKey || !valueSuffix || typeof normalize !== "function") return "";
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
  } catch (_error) {}
  return "";
}

function getProtectedNotesShareButton() {
  return document.getElementById("protectedNotesShareBtn");
}

function getProtectedNotesShareLabel() {
  return isPhoneOrTabletShell() ? "Share book with Notes" : "Copy book link with Notes";
}

function getProtectedBookShareButton() {
  return document.getElementById("protectedSettingsShareButton");
}

function getProtectedBookShareLabel() {
  return isPhoneOrTabletShell() ? "Share book" : "Copy link to book";
}

function clearProtectedBookShareButtonState(button = getProtectedBookShareButton()) {
  if (!button) return;
  button.classList.remove("is-copied");
  button.classList.remove("is-failed");
}

function buildProtectedBookShareUrl() {
  const url = new URL(window.location.href || "", window.location.origin);
  ["n", "notesShare", "notes", "notesz"].forEach((key) => url.searchParams.delete(key));
  url.hash = "";
  return url.toString();
}

function updateProtectedBookShareButtonState() {
  const button = getProtectedBookShareButton();
  if (!button) return;
  const label = getProtectedBookShareLabel();
  let shareUrl = "";
  try {
    shareUrl = buildProtectedBookShareUrl();
  } catch (_error) {
    shareUrl = "";
  }
  clearProtectedBookShareButtonState(button);
  button.textContent = label;
  button.disabled = !shareUrl;
  button.setAttribute("aria-disabled", shareUrl ? "false" : "true");
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
}

function clearProtectedNotesShareButtonState(button = getProtectedNotesShareButton()) {
  if (!button) return;
  button.classList.remove("is-pressed");
  button.classList.remove("is-copied");
  button.classList.remove("is-failed");
}

function isNativeShareCancelError(error) {
  const name = String(error && error.name || "");
  const message = String(error && error.message || "");
  return (
    name === "AbortError" ||
    /abort|cancel|cancell?ed|dismiss/i.test(message)
  );
}

function getShareableProtectedNoteCount(summary = HOST_STATE.lastSummary) {
  const annotations = Array.isArray(summary && summary.annotations) ? summary.annotations : [];
  return annotations.filter((annotation) => annotation && annotation.type === "note").length;
}

function updateProtectedNotesShareButtonState(summary = HOST_STATE.lastSummary) {
  const button = getProtectedNotesShareButton();
  if (!button) return;
  const enabled = getShareableProtectedNoteCount(summary) > 0;
  clearProtectedNotesShareButtonState(button);
  button.textContent = getProtectedNotesShareLabel();
  button.disabled = !enabled;
  button.setAttribute("aria-disabled", enabled ? "false" : "true");
  button.classList.toggle("is-disabled", !enabled);
}

function getNotesShareCreateEndpoints() {
  let endpoints = ["/books/api/ns", "/api/ns", "/books/api/notes-share", "/api/notes-share"];
  try {
    const host = String(window.location.hostname || "").toLowerCase();
    if (host === "reader.pub" || host === "www.reader.pub") {
      endpoints = [
        "/books/reader/api/ns",
        "/books/api/ns",
        "/api/ns",
        "/books/reader/api/notes-share",
        "/books/api/notes-share",
        "/api/notes-share"
      ];
    }
  } catch (_error) {}
  return endpoints;
}

function getSelectionShareCreateEndpoints() {
  let endpoints = ["/books/api/ss", "/api/ss", "/books/api/selection-share", "/api/selection-share"];
  try {
    const host = String(window.location.hostname || "").toLowerCase();
    if (host === "reader.pub" || host === "www.reader.pub") {
      endpoints = [
        "/books/reader/api/ss",
        "/books/api/ss",
        "/api/ss",
        "/books/reader/api/selection-share",
        "/books/api/selection-share",
        "/api/selection-share"
      ];
    }
  } catch (_error) {}
  return endpoints;
}

function getProtectedSelectionShareButton() {
  return document.querySelector("#selectionToolbar [data-action='share']");
}

function normalizeProtectedSelectionText(text) {
  return String(text || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function getProtectedSelectionShareKey(capture) {
  const anchor = capture && capture.selectionAnchor ? capture.selectionAnchor : capture && capture.rangeDescriptor ? capture.rangeDescriptor : null;
  if (!anchor) return "";
  return JSON.stringify({
    bookId: String((HOST_STATE.route && HOST_STATE.route.bookId) || getCurrentBookId() || ""),
    artifactBookId: String((HOST_STATE.route && HOST_STATE.route.artifactBookId) || ""),
    anchor,
    text: normalizeProtectedSelectionText(capture && capture.clipboardText ? capture.clipboardText : "").slice(0, 500)
  });
}

function buildProtectedSelectionSharePayload(capture) {
  const route = HOST_STATE.route || {};
  const anchor = capture && capture.selectionAnchor ? capture.selectionAnchor : capture && capture.rangeDescriptor ? capture.rangeDescriptor : null;
  if (!anchor) throw new Error("Selection anchor is unavailable.");
  const bookId = String(route.bookId || getCurrentBookId() || "").trim();
  if (!bookId) throw new Error("Book id is unavailable.");
  return {
    readerType: "protected",
    bookId,
    artifactBookId: String(route.artifactBookId || bookId).trim(),
    source: String(route.source || "").trim(),
    protectedArtifactSource: String(route.artifactSource || "").trim(),
    protectedAllowAll: String(route.query && route.query.protectedAllowAll || "").trim(),
    protectedUx: "protected-shell",
    renderMode: String(route.renderMode || "shape").trim() || "shape",
    metricsMode: String(route.metricsMode || "shape").trim() || "shape",
    protectedAnchor: anchor,
    selectionText: normalizeProtectedSelectionText(capture && capture.clipboardText ? capture.clipboardText : "").slice(0, 500)
  };
}

function resetProtectedSelectionShareState() {
  const state = HOST_STATE.selectionShare;
  if (!state) return;
  state.key = "";
  state.shareUrl = "";
  state.promise = null;
  state.pending = false;
  state.lastEndpoint = "";
  state.lastStatus = "";
  state.lastError = "";
  state.lastPayload = null;
  state.lastCopyValue = "";
}

function updateProtectedSelectionShareButtonState() {
  const button = getProtectedSelectionShareButton();
  if (!button) return;
  const share = HOST_STATE.selectionShare || {};
  const gateMobile = shouldUseNativeSelectionShare();
  const enabled = !gateMobile || !!share.shareUrl;
  button.disabled = !enabled;
  button.classList.toggle("is-disabled", !enabled);
  button.setAttribute("aria-disabled", enabled ? "false" : "true");
  button.setAttribute("title", gateMobile && !share.shareUrl ? "Preparing link" : "Share");
}

async function createShortProtectedSelectionShare(payload) {
  const share = HOST_STATE.selectionShare;
  share.lastPayload = payload;
  share.lastError = "";
  for (const endpoint of getSelectionShareCreateEndpoints()) {
    share.lastEndpoint = endpoint;
    share.lastStatus = "pending";
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        credentials: "same-origin",
        body: JSON.stringify(payload)
      });
      share.lastStatus = response ? String(response.status || "") : "no-response";
      if (!response || !response.ok) throw new Error(`selection share create failed: ${share.lastStatus}`);
      const data = await response.json();
      const shareId = data && data.shareId ? String(data.shareId) : "";
      if (!shareId) throw new Error("missing share id");
      return new URL(`/s/${encodeURIComponent(shareId)}`, window.location.origin).toString();
    } catch (error) {
      share.lastError = error && error.message ? error.message : String(error || "");
    }
  }
  throw new Error(share.lastError || "selection share create failed");
}

function prewarmProtectedSelectionShare(capture) {
  const share = HOST_STATE.selectionShare;
  if (!share || !capture || !capture.hasSelection) return null;
  const key = getProtectedSelectionShareKey(capture);
  if (!key) return null;
  if (share.key === key && (share.shareUrl || share.promise)) return share.promise;
  share.key = key;
  share.shareUrl = "";
  share.pending = true;
  share.lastError = "";
  updateProtectedSelectionShareButtonState();
  const payload = buildProtectedSelectionSharePayload(capture);
  share.promise = createShortProtectedSelectionShare(payload)
    .then((url) => {
      if (share.key === key) {
        share.shareUrl = url || "";
        share.pending = false;
      }
      return url;
    })
    .catch((error) => {
      if (share.key === key) {
        share.shareUrl = "";
        share.pending = false;
        share.lastError = error && error.message ? error.message : String(error || "");
      }
      throw error;
    })
    .finally(() => {
      if (share.key === key) share.promise = null;
      updateProtectedSelectionShareButtonState();
    });
  return share.promise;
}

async function getProtectedSelectionShareUrl(capture) {
  const share = HOST_STATE.selectionShare;
  const key = getProtectedSelectionShareKey(capture);
  if (key && share.key === key && share.shareUrl) return share.shareUrl;
  const promise = prewarmProtectedSelectionShare(capture);
  return promise ? promise : "";
}

function installProtectedSelectionShareDebug() {
  window.__readerpubSelectionShareDebug = {
    status() {
      const share = HOST_STATE.selectionShare || {};
      return {
        shareUrl: share.shareUrl || "",
        pending: !!share.pending,
        lastEndpoint: share.lastEndpoint || "",
        lastStatus: share.lastStatus || "",
        lastError: share.lastError || "",
        lastPayload: share.lastPayload || null,
        lastCopyValue: share.lastCopyValue || "",
        lastToolbarAction: share.lastToolbarAction || ""
      };
    }
  };
}

function getIncomingProtectedSelectionShare() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const rawAnchor =
      String(params.get("protectedSelectionAnchor") || "").trim() ||
      String(params.get("selectionAnchor") || "").trim() ||
      String(params.get("protectedAnchor") || "").trim();
    if (!rawAnchor) return null;
    return {
      anchor: JSON.parse(rawAnchor),
      selectionText: normalizeProtectedSelectionText(params.get("selectionText") || "")
    };
  } catch (_error) {
    return null;
  }
}

async function restoreIncomingProtectedSelectionShare() {
  if (HOST_STATE.incomingSelectionShareApplied) return;
  const incoming = getIncomingProtectedSelectionShare();
  if (!incoming) return;
  const bridge = getBridge();
  if (!bridge || typeof bridge.restoreSharedSelection !== "function") return;
  HOST_STATE.incomingSelectionShareApplied = true;
  const summary = await bridge.restoreSharedSelection(incoming.anchor, incoming.selectionText || "");
  if (summary) updateFromSummary(summary);
}

function buildNotesShareUrl(shareId) {
  const url = new URL(window.location.href || "", window.location.origin);
  ["n", "notesShare", "notes", "notesz"].forEach((key) => url.searchParams.delete(key));
  url.searchParams.set("n", String(shareId || "").trim());
  url.hash = "";
  return url.toString();
}

async function createShortProtectedNotesShare(notesPayload, bookId = getCurrentBookId()) {
  const body = {
    bookId: String(bookId || ""),
    notes: Array.isArray(notesPayload) ? notesPayload : []
  };
  const endpoints = getNotesShareCreateEndpoints();
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        credentials: "same-origin",
        body: JSON.stringify(body)
      });
      if (!response || !response.ok) throw new Error("share create failed");
      const data = await response.json();
      const shareId = data && data.shareId ? String(data.shareId) : "";
      if (!shareId) throw new Error("missing share id");
      return buildNotesShareUrl(shareId);
    } catch (_error) {}
  }
  throw new Error("share create failed");
}

async function handleProtectedNotesShare(event) {
  event && event.preventDefault && event.preventDefault();
  const button = getProtectedNotesShareButton();
  if (!button || button.disabled) return;
  if (button.dataset.shareBusy === "yes") return;
  button.dataset.shareBusy = "yes";
  const idleLabel = getProtectedNotesShareLabel();
  clearProtectedNotesShareButtonState(button);
  updateProtectedNotesShareButtonState(HOST_STATE.lastSummary);
  let cancelled = false;
  try {
    const exported = await invokeBridge("exportNotesSharePayload");
    const notesPayload = exported && exported.sharePayload && Array.isArray(exported.sharePayload.notes)
      ? exported.sharePayload.notes
      : [];
    if (!notesPayload.length) throw new Error("No shareable notes.");
    const generatedUrl = await createShortProtectedNotesShare(
      notesPayload,
      exported && exported.bookId ? String(exported.bookId) : getCurrentBookId()
    );
    if (isPhoneOrTabletShell()) {
      if (!navigator.share) throw new Error("Share unavailable");
      await navigator.share({ url: generatedUrl }).catch((error) => {
        if (isNativeShareCancelError(error)) {
          cancelled = true;
          return;
        }
        throw error;
      });
    } else {
      await copyTextToClipboard(generatedUrl);
      button.classList.add("is-copied");
      button.textContent = "Copied";
    }
  } catch (_error) {
    button.classList.add("is-failed");
    button.textContent = isPhoneOrTabletShell() ? "Share unavailable" : "Copy failed";
  } finally {
    delete button.dataset.shareBusy;
    window.setTimeout(() => {
      updateProtectedNotesShareButtonState(HOST_STATE.lastSummary);
      if (!button.disabled) button.textContent = idleLabel;
      clearProtectedNotesShareButtonState(button);
    }, isPhoneOrTabletShell() ? 1500 : 1200);
  }
}

function updateTypographyScaleVisual(input) {
  if (!input) return;
  const min = Number(input.min || 0.8);
  const max = Number(input.max || 1.6);
  const value = Number(input.value || min);
  const range = max - min;
  const pct = range > 0 ? ((value - min) / range) * 100 : 0;
  input.style.setProperty("--protected-typography-scale-pct", `${Math.max(0, Math.min(100, pct)).toFixed(2)}%`);
}

async function handleProtectedBookShare(event) {
  event && event.preventDefault && event.preventDefault();
  const button = getProtectedBookShareButton();
  if (!button || button.disabled) return;
  if (button.dataset.shareBusy === "yes") return;
  button.dataset.shareBusy = "yes";
  const idleLabel = getProtectedBookShareLabel();
  clearProtectedBookShareButtonState(button);
  let cancelled = false;
  try {
    const shareUrl = buildProtectedBookShareUrl();
    const summary = HOST_STATE.lastSummary || {};
    const shareTitle = String(summary.bookTitle || document.title || "Book").trim();
    if (isPhoneOrTabletShell()) {
      if (!navigator.share) throw new Error("Share unavailable");
      await navigator.share({ title: shareTitle, url: shareUrl }).catch((error) => {
        if (isNativeShareCancelError(error)) {
          cancelled = true;
          return;
        }
        throw error;
      });
      if (!cancelled) setHostActionStatus("Book link shared.");
    } else {
      await copyTextToClipboard(shareUrl);
      button.classList.add("is-copied");
      button.textContent = "Copied";
      setHostActionStatus("Book link copied.");
    }
  } catch (_error) {
    button.classList.add("is-failed");
    button.textContent = isPhoneOrTabletShell() ? "Share unavailable" : "Copy failed";
    setHostActionStatus(isPhoneOrTabletShell() ? "Book sharing is unavailable." : "Book link copy failed.");
  } finally {
    delete button.dataset.shareBusy;
    window.setTimeout(() => {
      updateProtectedBookShareButtonState();
      if (!button.disabled) button.textContent = idleLabel;
      clearProtectedBookShareButtonState(button);
    }, isPhoneOrTabletShell() ? 1500 : 1200);
  }
}

function getShellPreferredFontMode() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const explicit = params.get("protectedFontMode") || params.get("fontMode");
    if (explicit != null && String(explicit).trim()) {
      return normalizeFontMode(explicit);
    }
  } catch (_error) {}
  try {
    const currentValue = migratePriorProtectedShellStorageValue({
      currentKey: getFontModeStorageKey(),
      valueSuffix: `:font-mode:${getCurrentBookId()}`,
      normalize: normalizeFontMode
    });
    if (currentValue) return currentValue;
  } catch (_error) {}
  return "sans";
}

function persistShellFontMode(fontMode) {
  const normalizedMode = normalizeFontMode(fontMode);
  try {
    window.localStorage.setItem(getFontModeStorageKey(), normalizedMode);
  } catch (_error) {}
  return normalizedMode;
}

function getShellPreferredFontScale() {
  try {
    const raw = migratePriorProtectedShellStorageValue({
      currentKey: getFontScaleStorageKey(),
      valueSuffix: `:font-scale:${getCurrentBookId()}`,
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
  } catch (_error) {}
  try {
    const ua = (navigator && navigator.userAgent) ? navigator.userAgent : "";
    const isMobileUA = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
    const vw = (window.visualViewport && window.visualViewport.width) ? window.visualViewport.width : window.innerWidth;
    const isMobileViewport = !!vw && vw <= 1024;
    return (isMobileUA || isMobileViewport) ? 1.24 : 1.1;
  } catch (error) {}
  return 1.1;
}

function persistShellFontScale(fontScale) {
  const normalizedScale = Math.max(0.8, Math.min(1.6, Number(fontScale || 1)));
  try {
    window.localStorage.setItem(getFontScaleStorageKey(), String(normalizedScale));
  } catch (_error) {}
  return normalizedScale;
}

function scheduleViewportFontScaleResync(reason = "viewport") {
  HOST_STATE.fontScaleSynced = false;
  HOST_STATE.lastAppliedFontScale = 0;
  if (HOST_STATE.viewportFontScaleSyncTimer) {
    window.clearTimeout(HOST_STATE.viewportFontScaleSyncTimer);
    HOST_STATE.viewportFontScaleSyncTimer = null;
  }
  HOST_STATE.viewportFontScaleSyncTimer = window.setTimeout(() => {
    HOST_STATE.viewportFontScaleSyncTimer = null;
    const summary = HOST_STATE.lastSummary;
    if (!summary || !summary.ready) return;
    const preferredFontScale = getShellPreferredFontScale();
    const currentFontScale = Number(summary.fontScale || 1) || 1;
    if (Math.abs(preferredFontScale - currentFontScale) < 0.01) {
      HOST_STATE.fontScaleSynced = true;
      HOST_STATE.lastAppliedFontScale = preferredFontScale;
      return;
    }
    HOST_STATE.fontScaleSynced = true;
    HOST_STATE.lastAppliedFontScale = preferredFontScale;
    invokeBridge("setFontScale", preferredFontScale).catch(() => {
      HOST_STATE.fontScaleSynced = false;
      HOST_STATE.lastAppliedFontScale = 0;
    });
  }, reason === "orientationchange" ? 420 : 320);
}

function closeOverlayById(id) {
  const panel = document.getElementById(id);
  if (!panel) return;
  panel.classList.add("hidden");
  panel.setAttribute("aria-hidden", "true");
  const current = window.__READERPUB_READER_NEW_UI_STATE__ || {};
  if (current.overlay === String(id || "")) {
    setReaderNewUiSmokeState({ overlay: "" });
  }
}

function bindProtectedOverlayTouchScroll(overlay) {
  if (!overlay || overlay.dataset.protectedTouchScrollBound === "yes") return;
  overlay.dataset.protectedTouchScrollBound = "yes";
  let scrollState = null;
  const suppressOverlaySelection = (durationMs = 650) => {
    const until = String(Date.now() + Math.max(0, Number(durationMs || 0)));
    overlay.dataset.protectedTouchScrolledUntil = until;
    document.documentElement.dataset.protectedOverlayTouchScrolledUntil = until;
  };
  const shouldSuppressOverlaySelection = () => (
    Date.now() < Number(overlay.dataset.protectedTouchScrolledUntil || 0)
  );
  const findScrollNode = (target) => {
    if (!target || !target.closest) return null;
    return target.closest(".voice-picker-dropdown-list, .overlay-scroll");
  };
  overlay.addEventListener("touchstart", (event) => {
    const touch = event.touches && event.touches[0] ? event.touches[0] : null;
    const scrollNode = findScrollNode(event.target);
    if (!touch || !scrollNode) {
      scrollState = null;
      return;
    }
    scrollState = {
      node: scrollNode,
      startY: Number(touch.clientY || 0),
      lastY: Number(touch.clientY || 0),
      moved: false
    };
  }, { capture: true, passive: true });
  overlay.addEventListener("touchmove", (event) => {
    if (!scrollState || !scrollState.node) return;
    const touch = event.touches && event.touches[0] ? event.touches[0] : null;
    if (!touch) return;
    const y = Number(touch.clientY || 0);
    const dy = scrollState.lastY - y;
    const total = scrollState.startY - y;
    scrollState.lastY = y;
    if (!scrollState.moved && Math.abs(total) < 6) return;
    scrollState.moved = true;
    const node = scrollState.node;
    const maxScroll = Math.max(0, Number(node.scrollHeight || 0) - Number(node.clientHeight || 0));
    if (maxScroll > 0) {
      node.scrollTop = Math.max(0, Math.min(maxScroll, Number(node.scrollTop || 0) + dy));
    }
    suppressOverlaySelection();
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation && event.stopImmediatePropagation();
  }, { capture: true, passive: false });
  overlay.addEventListener("touchend", (event) => {
    if (scrollState && scrollState.moved) {
      suppressOverlaySelection();
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation && event.stopImmediatePropagation();
    }
    scrollState = null;
  }, { capture: true, passive: false });
  overlay.addEventListener("touchcancel", () => {
    if (scrollState && scrollState.moved) suppressOverlaySelection();
    scrollState = null;
  }, { capture: true, passive: true });
  overlay.addEventListener("click", (event) => {
    if (!shouldSuppressOverlaySelection()) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation && event.stopImmediatePropagation();
  }, true);
}

function shouldSuppressProtectedOverlayRelease() {
  const now = Date.now();
  const rootUntil = Number(document.documentElement.dataset.protectedOverlayTouchScrolledUntil || 0);
  if (now < rootUntil) return true;
  return ["overlay-settings", "overlay-library", "overlay-search"].some((id) => {
    const overlay = document.getElementById(id);
    return !!(overlay && now < Number(overlay.dataset.protectedTouchScrolledUntil || 0));
  });
}

function closeAllShellOverlays() {
  closeSearchOverlay();
  closeLibraryOverlay();
  closeTypographyPanel();
  [
    "overlay-search",
    "overlay-settings",
    "overlay-library",
    "commentSheet"
  ].forEach((id) => closeOverlayById(id));
  const backdrop = document.getElementById("overlay-backdrop");
  if (backdrop) {
    backdrop.classList.add("hidden");
    backdrop.setAttribute("aria-hidden", "true");
  }
  try {
    document.body.classList.remove("overlay-open");
  } catch (error) {}
}

function getProtectedFullscreenElement() {
  return document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.webkitCurrentFullScreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement ||
    null;
}

function getProtectedFullscreenTarget() {
  return document.getElementById("container") || document.body || document.documentElement || null;
}

async function requestProtectedFullscreen(element) {
  const target = element || getProtectedFullscreenTarget();
  if (!target) return { ok: false, error: "Fullscreen target is unavailable." };
  try {
    if (
      document.fullscreenEnabled === false &&
      document.webkitFullscreenEnabled === false &&
      document.mozFullScreenEnabled === false &&
      document.msFullscreenEnabled === false
    ) {
      return { ok: false, error: "Fullscreen is disabled by the browser." };
    }
  } catch (_error) {}
  const request = target.requestFullscreen ||
    target.webkitRequestFullscreen ||
    target.webkitRequestFullScreen ||
    target.mozRequestFullScreen ||
    target.msRequestFullscreen;
  if (!request) return { ok: false, error: "Fullscreen API is unavailable." };
  try {
    const result = request.call(target);
    if (result && typeof result.then === "function") {
      await result;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    const fullscreenElement = getProtectedFullscreenElement();
    return fullscreenElement
      ? { ok: true, element: fullscreenElement, target }
      : { ok: false, error: "Fullscreen request completed but browser did not enter fullscreen." };
  } catch (error) {
    return {
      ok: false,
      error: error && error.message ? error.message : String(error || "Fullscreen request failed.")
    };
  }
}

async function exitProtectedFullscreen() {
  const exit = document.exitFullscreen ||
    document.webkitExitFullscreen ||
    document.webkitCancelFullScreen ||
    document.mozCancelFullScreen ||
    document.msExitFullscreen;
  if (!exit) return { ok: false, error: "Fullscreen exit API is unavailable." };
  try {
    const result = exit.call(document);
    if (result && typeof result.then === "function") {
      await result;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    return getProtectedFullscreenElement()
      ? { ok: false, error: "Browser did not exit fullscreen." }
      : { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error && error.message ? error.message : String(error || "Fullscreen exit failed.")
    };
  }
}

function getProtectedViewportHeight() {
  try {
    return (window.visualViewport && window.visualViewport.height) ||
      window.innerHeight ||
      (document.documentElement && document.documentElement.clientHeight) ||
      0;
  } catch (_error) {
    return 0;
  }
}

function resetProtectedAddressBarBaselineIfNeeded() {
  const width = Math.round(
    (window.visualViewport && window.visualViewport.width) ||
    window.innerWidth ||
    (document.documentElement && document.documentElement.clientWidth) ||
    0
  );
  if (
    !HOST_STATE.addressBarBaseline ||
    !HOST_STATE.addressBarBaselineWidth ||
    Math.abs(width - HOST_STATE.addressBarBaselineWidth) > 50
  ) {
    HOST_STATE.addressBarBaseline = getProtectedViewportHeight();
    HOST_STATE.addressBarBaselineWidth = width;
  }
}

function updateProtectedAddressBarIcon(hidden) {
  const toggle = document.getElementById("addressBarToggle");
  if (!toggle) return;
  toggle.classList.remove("icon-resize-full", "icon-resize-small", "icon-resize-full-1", "hidden");
  toggle.classList.toggle("ab-state-small", !!hidden);
  toggle.classList.toggle("ab-state-full", !hidden);
  toggle.setAttribute("aria-label", hidden ? "Exit fullscreen" : "Enter fullscreen");
  toggle.setAttribute("title", hidden ? "Exit fullscreen" : "Enter fullscreen");
  toggle.setAttribute("aria-pressed", hidden ? "true" : "false");
}

function syncProtectedAddressBarIconState() {
  resetProtectedAddressBarBaselineIfNeeded();
  const hidden = !!getProtectedFullscreenElement();
  HOST_STATE.addressBarHidden = hidden;
  updateProtectedAddressBarIcon(hidden);
}

function nudgeProtectedAddressBar() {
  try {
    if (window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  } catch (_error) {}
  try {
    const docEl = document.documentElement;
    const body = document.body;
    const height = getProtectedViewportHeight();
    const previous = {
      docOverflow: docEl && docEl.style ? docEl.style.overflow : "",
      bodyOverflow: body && body.style ? body.style.overflow : "",
      docHeight: docEl && docEl.style ? docEl.style.height : "",
      bodyMinHeight: body && body.style ? body.style.minHeight : ""
    };
    const spacer = document.createElement("div");
    spacer.setAttribute("aria-hidden", "true");
    spacer.style.cssText = "position:absolute;left:0;top:0;width:1px;height:2px;opacity:0;pointer-events:none;";
    if (body) body.appendChild(spacer);
    if (docEl && docEl.style) {
      docEl.style.overflow = "auto";
      if (height) docEl.style.height = `${height + 2}px`;
    }
    if (body && body.style) {
      body.style.overflow = "auto";
      if (height) body.style.minHeight = `${height + 2}px`;
    }
    const doScroll = () => {
      try { window.scrollTo(0, 1); } catch (_error) {}
      try { if (docEl) docEl.scrollTop = 1; } catch (_error) {}
      try { if (body) body.scrollTop = 1; } catch (_error) {}
    };
    doScroll();
    window.setTimeout(doScroll, 50);
    window.setTimeout(() => {
      try { if (spacer && spacer.parentNode) spacer.parentNode.removeChild(spacer); } catch (_error) {}
      try {
        if (docEl && docEl.style) {
          docEl.style.overflow = previous.docOverflow;
          docEl.style.height = previous.docHeight;
        }
      } catch (_error) {}
      try {
        if (body && body.style) {
          body.style.overflow = previous.bodyOverflow;
          body.style.minHeight = previous.bodyMinHeight;
        }
      } catch (_error) {}
    }, 250);
  } catch (_error) {}
}

function shouldEnableProtectedAddressBarToggle() {
  if (detectIosDevice()) return false;
  try {
    const root = document.documentElement;
    if (root && (root.classList.contains("is-phone") || root.classList.contains("is-tablet"))) return true;
  } catch (_error) {}
  return detectAndroidDevice();
}

function installProtectedAddressBarToggle() {
  const toggle = document.getElementById("addressBarToggle");
  if (!toggle) return;
  const enabled = shouldEnableProtectedAddressBarToggle();
  document.body.classList.toggle("android", detectAndroidDevice());
  document.body.classList.toggle("addressbar-toggle-enabled", enabled);
  if (!enabled) {
    toggle.classList.add("hidden");
    return;
  }
  updateProtectedAddressBarIcon(!!getProtectedFullscreenElement());
  if (HOST_STATE.addressBarToggleInstalled) return;
  HOST_STATE.addressBarToggleInstalled = true;
  let lastFullscreenActivationAt = 0;
  const handleFullscreenActivation = async (event, source = "click") => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation && event.stopImmediatePropagation();
    const now = Date.now();
    if (source === "click" && now - lastFullscreenActivationAt < 700) return;
    lastFullscreenActivationAt = now;
    if (toggle.dataset.fullscreenBusy === "1") return;
    toggle.dataset.fullscreenBusy = "1";
    toggle.setAttribute("aria-busy", "true");
    const finish = (result, action) => {
      toggle.dataset.fullscreenBusy = "0";
      toggle.removeAttribute("aria-busy");
      syncProtectedAddressBarIconState();
      window.__readerpubProtectedFullscreenDebug = {
        action,
        at: Date.now(),
        ok: !!(result && result.ok),
        error: result && result.error ? String(result.error) : "",
        fullscreen: !!getProtectedFullscreenElement(),
        source,
        target: result && result.target
          ? (result.target.id || result.target.tagName || "")
          : ""
      };
      if (result && !result.ok) {
        setHostActionStatus(result.error || "Fullscreen is unavailable.");
      }
    };
    if (getProtectedFullscreenElement()) {
      const result = await exitProtectedFullscreen();
      finish(result, "exit");
      return;
    }
    const result = await requestProtectedFullscreen(getProtectedFullscreenTarget());
    finish(result, "request");
  };
  toggle.addEventListener("pointerup", (event) => {
    const pointerType = String(event.pointerType || "").toLowerCase();
    if (pointerType && pointerType !== "touch" && pointerType !== "pen") return;
    void handleFullscreenActivation(event, "pointerup");
  }, true);
  toggle.addEventListener("touchend", (event) => {
    void handleFullscreenActivation(event, "touchend");
  }, { capture: true, passive: false });
  toggle.addEventListener("click", (event) => {
    void handleFullscreenActivation(event, "click");
  }, true);
  ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange"].forEach((type) => {
    document.addEventListener(type, syncProtectedAddressBarIconState);
  });
  window.addEventListener("scroll", syncProtectedAddressBarIconState, { passive: true });
  window.addEventListener("resize", () => {
    installProtectedAddressBarToggle();
    syncProtectedAddressBarIconState();
  }, { passive: true });
  window.addEventListener("readerpub:protected-viewport-sync", installProtectedAddressBarToggle, { passive: true });
  try {
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", syncProtectedAddressBarIconState, { passive: true });
      window.visualViewport.addEventListener("scroll", syncProtectedAddressBarIconState, { passive: true });
    }
  } catch (_error) {}
  syncProtectedAddressBarIconState();
}

function isAutomationMode() {
  return !!(HOST_STATE.route && HOST_STATE.route.automationSafe);
}

function getCanonicalRouteBookId() {
  const query = HOST_STATE.route && HOST_STATE.route.query ? HOST_STATE.route.query : null;
  if (!query) return "";
  const explicit =
    String(query.protectedCanonicalBookId || "").trim() ||
    String(query.canonicalBookId || "").trim() ||
    String(query.storageBookId || "").trim();
  return explicit || "";
}

function getCurrentBookId() {
  return HOST_STATE.lastSummary && HOST_STATE.lastSummary.bookId
    ? String(HOST_STATE.lastSummary.bookId)
    : getCanonicalRouteBookId()
      ? getCanonicalRouteBookId()
    : HOST_STATE.route && HOST_STATE.route.bookId
      ? String(HOST_STATE.route.bookId)
      : "";
}

function getBookmarkStorageKey(bookId = getCurrentBookId()) {
  return `${BOOKMARK_STORAGE_PREFIX}${bookId || "unknown"}`;
}

function getBookmarkStorageKeys(bookId = getCurrentBookId()) {
  const aliases = getRestoreTokenBookIdAliases();
  const normalizedPrimary = String(bookId || "").trim();
  if (normalizedPrimary) aliases.add(normalizedPrimary);
  if (!aliases.size) aliases.add("unknown");
  return [...aliases].map((id) => getBookmarkStorageKey(id));
}

function migrateLegacyStoredBookmarks(bookId = getCurrentBookId()) {
  try {
    const aliases = getRestoreTokenBookIdAliases();
    const normalizedPrimary = String(bookId || "").trim();
    if (normalizedPrimary) aliases.add(normalizedPrimary);
    if (!aliases.size) aliases.add("unknown");
    let didMigrate = false;
    for (const id of aliases) {
      const currentKey = getBookmarkStorageKey(id);
      const currentRaw = window.localStorage.getItem(currentKey);
      if (currentRaw != null && String(currentRaw).trim()) continue;
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const candidateKey = String(window.localStorage.key(index) || "");
        if (!candidateKey || candidateKey === currentKey) continue;
        if (!candidateKey.startsWith("readerpub:protected-")) continue;
        if (!candidateKey.endsWith(`:bookmarks:${id}`)) continue;
        const legacyRaw = window.localStorage.getItem(candidateKey);
        if (legacyRaw == null || !String(legacyRaw).trim()) continue;
        const parsed = JSON.parse(legacyRaw);
        const normalized = normalizeStoredBookmarks(parsed, id);
        window.localStorage.setItem(currentKey, JSON.stringify(normalized));
        didMigrate = true;
        break;
      }
    }
    return didMigrate;
  } catch (_error) {
    return false;
  }
}

function parseHostRestoreToken(token) {
  const normalized = String(token || "").trim().replace(/-/g, "+").replace(/_/g, "/");
  if (!normalized) throw new Error("Restore token is empty.");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return JSON.parse(decodeURIComponent(escape(atob(padded))));
}

function serializeHostRestoreToken(descriptor) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(descriptor))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function getRestoreTokenBookIdAliases() {
  const query = HOST_STATE.route && HOST_STATE.route.query ? HOST_STATE.route.query : null;
  const aliases = new Set();
  [
    HOST_STATE.lastSummary && HOST_STATE.lastSummary.bookId,
    getCanonicalRouteBookId(),
    HOST_STATE.route && HOST_STATE.route.bookId,
    query && query.protectedArtifactBookId,
    query && query.protectedCanonicalBookId,
    query && query.canonicalBookId,
    query && query.storageBookId
  ].forEach((value) => {
    const normalized = String(value || "").trim();
    if (normalized) aliases.add(normalized);
  });
  return aliases;
}

function normalizeBookmarkRestoreToken(token, targetBookId = getCurrentBookId()) {
  const raw = String(token || "").trim();
  if (!raw) return "";
  try {
    const descriptor = parseHostRestoreToken(raw);
    const descriptorBookId = String(descriptor && descriptor.bookId || "").trim();
    const normalizedTarget = String(targetBookId || "").trim();
    if (!normalizedTarget || !descriptor || !descriptor.position || typeof descriptor.position.globalOffset !== "number") {
      return raw;
    }
    if (!descriptorBookId || descriptorBookId === normalizedTarget) {
      if (descriptorBookId === normalizedTarget) return raw;
      descriptor.bookId = normalizedTarget;
      return serializeHostRestoreToken(descriptor);
    }
    const aliases = getRestoreTokenBookIdAliases();
    if (aliases.has(descriptorBookId) && aliases.has(normalizedTarget)) {
      descriptor.bookId = normalizedTarget;
      return serializeHostRestoreToken(descriptor);
    }
    return raw;
  } catch (_error) {
    return raw;
  }
}

function normalizeStoredBookmarks(bookmarks, bookId = getCurrentBookId()) {
  const next = [];
  const seen = new Set();
  for (const item of Array.isArray(bookmarks) ? bookmarks : []) {
    if (!item || !item.restoreToken) continue;
    const normalizedToken = normalizeBookmarkRestoreToken(item.restoreToken, bookId);
    let globalOffset = Number(item.globalOffset || 0);
    if (!Number.isFinite(globalOffset) || globalOffset < 0) globalOffset = 0;
    if (!globalOffset) {
      try {
        const descriptor = parseHostRestoreToken(normalizedToken);
        globalOffset = Number(descriptor && descriptor.position && descriptor.position.globalOffset || 0);
      } catch (_error) {
        globalOffset = 0;
      }
    }
    const dedupeKey = String(normalizedToken || "").trim();
    if (!dedupeKey || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    next.push({
      ...item,
      restoreToken: dedupeKey,
      globalOffset
    });
  }
  return next;
}

function loadStoredBookmarks(bookId = getCurrentBookId()) {
  try {
    migrateLegacyStoredBookmarks(bookId);
    const merged = [];
    for (const storageKey of getBookmarkStorageKeys(bookId)) {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) merged.push(...parsed);
    }
    return normalizeStoredBookmarks(merged, bookId);
  } catch (error) {
    return [];
  }
}

function saveStoredBookmarks(bookmarks, bookId = getCurrentBookId()) {
  HOST_STATE.bookmarks = normalizeStoredBookmarks(bookmarks, bookId);
  try {
    const payload = JSON.stringify(HOST_STATE.bookmarks);
    for (const storageKey of getBookmarkStorageKeys(bookId)) {
      window.localStorage.setItem(storageKey, payload);
    }
  } catch (error) {}
}

function getCurrentBookmarks() {
  if (Array.isArray(HOST_STATE.bookmarks) && HOST_STATE.bookmarks.length) return HOST_STATE.bookmarks.slice();
  HOST_STATE.bookmarks = loadStoredBookmarks();
  return HOST_STATE.bookmarks.slice();
}

function syncBookmarksFromStorage() {
  HOST_STATE.bookmarks = loadStoredBookmarks();
  try {
    const payload = JSON.stringify(HOST_STATE.bookmarks);
    for (const storageKey of getBookmarkStorageKeys()) {
      window.localStorage.setItem(storageKey, payload);
    }
  } catch (error) {}
  return HOST_STATE.bookmarks.slice();
}

function buildBookmarkEntry(summary) {
  if (!summary || !summary.restoreToken) return null;
  return {
    id: `bm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    restoreToken: summary.restoreToken,
    globalOffset: Number(summary.pageGlobalStartOffset || 0),
    globalPageLabel: summary.globalPageLabel || summary.pageLabel || "",
    chapterLabel: summary.chapterLabel || "",
    title: summary.bookTitle || "",
    author: summary.bookAuthor || "",
    createdAt: new Date().toISOString()
  };
}

function isSummaryBookmarked(summary) {
  const token = summary && summary.restoreToken ? String(summary.restoreToken) : "";
  if (!token) return false;
  return getCurrentBookmarks().some((bookmark) => String(bookmark.restoreToken) === token);
}

function isDevPanelEnabled() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    return String(params.get("protectedDevPanel") || "").trim() === "1";
  } catch (error) {
    return false;
  }
}

function isInternalStatusVisible() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    return String(params.get("protectedInternalStatus") || "").trim() === "1";
  } catch (error) {
    return false;
  }
}

function setMenuBookMeta(summary) {
  const title = summary && summary.bookTitle ? summary.bookTitle : "";
  const author = summary && summary.bookAuthor ? summary.bookAuthor : "";
  const rawCover = summary && summary.coverUrl ? String(summary.coverUrl).trim() : "";
  const cover = normalizeMyBooksCoverUrl(rawCover);
  const titleNode = document.getElementById("protectedSettingsBookTitle");
  const authorNode = document.getElementById("protectedSettingsBookAuthor");
  const coverNode = document.getElementById("protectedSettingsBookCover");
  const placeholderNode = document.getElementById("protectedSettingsBookCoverPlaceholder");
  const coverWrapNode = coverNode && coverNode.parentElement ? coverNode.parentElement : null;
  if (titleNode) titleNode.textContent = title;
  if (authorNode) authorNode.textContent = author;
  if (placeholderNode) {
    placeholderNode.classList.add("hidden");
    placeholderNode.style.backgroundImage = "";
  }
  if (coverNode) {
    coverNode.onerror = () => {
      coverNode.removeAttribute("src");
      coverNode.classList.add("hidden");
      if (coverWrapNode) coverWrapNode.classList.add("hidden");
    };
    if (cover) {
      coverNode.src = cover;
      coverNode.classList.remove("hidden");
      if (coverWrapNode) coverWrapNode.classList.remove("hidden");
    } else {
      coverNode.removeAttribute("src");
      coverNode.classList.add("hidden");
      if (coverWrapNode) coverWrapNode.classList.add("hidden");
    }
  }
}

function setTitle(summary) {
  const title = document.getElementById("book-title");
  const chapter = document.getElementById("chapter-title");
  if (title) title.textContent = summary && summary.bookTitle ? summary.bookTitle : "";
  if (chapter) {
    chapter.textContent = summary && summary.bookAuthor ? summary.bookAuthor : "";
  }
  try {
    document.title = summary && summary.bookTitle
      ? `${summary.bookTitle}${summary.bookAuthor ? ` — ${summary.bookAuthor}` : ""}`
      : "ReaderPub";
  } catch (error) {}
}

function renderStatus(summary) {
  if (!isInternalStatusVisible()) return;
  let node = document.getElementById("protectedOldShellStatus");
  if (!node) {
    node = document.createElement("div");
    node.id = "protectedOldShellStatus";
    const titlebar = document.getElementById("titlebar");
    const main = document.getElementById("main");
    if (titlebar && main) main.insertBefore(node, titlebar.nextSibling);
  }
  node.innerHTML = "";
  const pill = document.createElement("span");
  pill.className = "pill";
  pill.textContent = "Protected engine";
  const summaryNode = document.createElement("span");
  summaryNode.className = "muted";
  summaryNode.textContent = `Page ${summary.globalPageLabel || summary.pageLabel || "n/a"} · Annotations ${summary.annotationCount ?? 0}`;
  const rolloutNode = document.createElement("span");
  rolloutNode.className = "muted";
  rolloutNode.textContent = `Pilot ${summary.runtimeMeta && summary.runtimeMeta.pilotStatus ? summary.runtimeMeta.pilotStatus : "n/a"}`;
  const driveNode = document.createElement("span");
  driveNode.className = "muted";
  const drive = summary.driveStatus || {};
  driveNode.textContent = `Drive ${drive.transport || "n/a"}`;
  node.append(pill, summaryNode, rolloutNode, driveNode);
  node.style.display = "flex";
}

function renderToc(summary) {
  const tocView = document.getElementById("tocView");
  if (!tocView) return;
  const items = Array.isArray(summary && summary.tocItems) ? summary.tocItems : [];
  const activeItem = items.find((item) => item && item.active);
  const activeId = activeItem && activeItem.id ? String(activeItem.id) : "";
  const signature = items.map((item) => {
    const id = item && item.id ? String(item.id) : "";
    const label = item && item.label ? String(item.label) : "";
    const href = item && item.href ? String(item.href) : "";
    return `${id}|${label}|${href}`;
  }).join("||");
  const existingLinks = tocView.querySelectorAll("a.toc_link[data-toc-id]");
  if (
    signature &&
    HOST_STATE.lastTocSignature === signature &&
    HOST_STATE.lastTocCount === items.length &&
    existingLinks.length === items.length
  ) {
    const previousActiveId = HOST_STATE.lastTocActiveId || "";
    if (previousActiveId !== activeId) {
      if (previousActiveId) {
        const previousLink = tocView.querySelector(`a.toc_link[data-toc-id="${CSS.escape(previousActiveId)}"]`);
        const previousItemNode = previousLink && previousLink.closest("li");
        if (previousItemNode) previousItemNode.classList.remove("currentChapter");
      }
      if (activeId) {
        const nextLink = tocView.querySelector(`a.toc_link[data-toc-id="${CSS.escape(activeId)}"]`);
        const nextItemNode = nextLink && nextLink.closest("li");
        if (nextItemNode) nextItemNode.classList.add("currentChapter");
      }
    }
    HOST_STATE.lastTocActiveId = activeId;
    return;
  }
  tocView.replaceChildren();
  const list = document.createElement("ul");
  for (const item of items) {
    const li = document.createElement("li");
    li.className = "list_item";
    if (item.active) li.classList.add("currentChapter");
    const link = document.createElement("a");
    link.href = item.href || "#";
    link.className = "toc_link";
    link.dataset.tocId = item.id || "";
    link.textContent = item.label;
    bindPrimaryAction(link, async () => {
      await invokeBridge("goToToc", item.id);
      closeAllShellOverlays();
    }, { touchOnly: false, releaseOnly: true });
    li.append(link);
    list.append(li);
  }
  tocView.append(list);
  HOST_STATE.lastTocSignature = signature;
  HOST_STATE.lastTocActiveId = activeId;
  HOST_STATE.lastTocCount = items.length;
}

function buildBookmarkLabel(bookmark) {
  const currentPageNumber = String(bookmark && bookmark.currentPageNumber || "").trim();
  if (currentPageNumber) return currentPageNumber;
  const progress = String(bookmark && bookmark.globalPageLabel || "").trim();
  if (progress) return progress.split("/")[0].trim();
  const chapter = String(bookmark && bookmark.chapterLabel || "").trim();
  if (chapter) return chapter;
  return "Bookmark";
}

async function refreshBookmarkPageNumbers(bookmarks = []) {
  const entries = Array.isArray(bookmarks)
    ? bookmarks
        .map((bookmark, index) => ({
          bookmark,
          index,
          globalOffset: Number(bookmark && bookmark.globalOffset || 0) || 0
        }))
        .filter((item) => item.globalOffset > 0)
    : [];
  if (!entries.length) return;
  const layoutSignature = [
    HOST_STATE.lastSummary && HOST_STATE.lastSummary.bookId ? String(HOST_STATE.lastSummary.bookId) : "",
    HOST_STATE.lastSummary && HOST_STATE.lastSummary.configGeneration ? String(HOST_STATE.lastSummary.configGeneration) : "",
    HOST_STATE.lastSummary && HOST_STATE.lastSummary.layoutGeneration ? String(HOST_STATE.lastSummary.layoutGeneration) : "",
    HOST_STATE.lastSummary && HOST_STATE.lastSummary.fontMode ? String(HOST_STATE.lastSummary.fontMode) : "",
    HOST_STATE.lastSummary && Number.isFinite(Number(HOST_STATE.lastSummary.fontScale)) ? String(HOST_STATE.lastSummary.fontScale) : ""
  ].join(":");
  const signature = `${layoutSignature}|${entries.map((item) => `${item.index}:${item.globalOffset}`).join("|")}`;
  if (HOST_STATE.bookmarkPageLookupSignature === signature) return;
  HOST_STATE.bookmarkPageLookupSignature = signature;
  const requestToken = (HOST_STATE.bookmarkPageLookupToken || 0) + 1;
  HOST_STATE.bookmarkPageLookupToken = requestToken;
  let payload = null;
  try {
    payload = await invokeBridgeRaw(
      "getPageNumbersForGlobalOffsets",
      entries.map((item) => item.globalOffset)
    );
  } catch (_error) {
    if (HOST_STATE.bookmarkPageLookupToken === requestToken) {
      HOST_STATE.bookmarkPageLookupSignature = "";
    }
    return;
  }
  if (HOST_STATE.bookmarkPageLookupToken !== requestToken) return;
  const labels = payload && payload.labels && typeof payload.labels === "object" ? payload.labels : {};
  const currentBookmarks = getCurrentBookmarks();
  let changed = false;
  for (const item of entries) {
    const label = String(labels[String(item.globalOffset)] || "").trim();
    if (!label) continue;
    const current = currentBookmarks[item.index];
    if (!current) continue;
    if (String(current.currentPageNumber || "") === label) continue;
    current.currentPageNumber = label;
    changed = true;
  }
  if (!changed) return;
  saveStoredBookmarks(currentBookmarks);
  const targets = [document.getElementById("bookmarks"), document.getElementById("protectedLibraryBookmarksList")];
  for (const target of targets) {
    if (!target) continue;
    const links = target.querySelectorAll(".bookmark_link");
    links.forEach((link, index) => {
      const bookmark = HOST_STATE.bookmarks[index];
      if (!bookmark) return;
      link.textContent = buildBookmarkLabel(bookmark);
    });
  }
}

function renderBookmarkList(target, bookmarks, summary) {
  if (!target) return;
  target.replaceChildren();
  bookmarks.forEach((bookmark) => {
    const li = document.createElement("li");
    li.className = "list_item";
    li.dataset.restoreToken = bookmark.restoreToken || "";
    li.dataset.globalOffset = String(Number(bookmark.globalOffset || 0) || 0);

    const wrap = document.createElement("div");
    wrap.className = "bookmark-text";

    const link = document.createElement("button");
    link.className = "bookmark_link";
    link.type = "button";
    link.textContent = buildBookmarkLabel(bookmark);
    wrap.append(link);

    if (bookmark.chapterLabel) {
      const comment = document.createElement("div");
      comment.className = "bookmark-comment";
      comment.textContent = bookmark.chapterLabel;
      wrap.append(comment);
    }

    li.append(wrap);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "bookmark-delete";
    remove.setAttribute("aria-label", "Delete bookmark");
    remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16"></path><path d="M9 7V5h6v2"></path><rect x="6" y="7" width="12" height="13" rx="2"></rect><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>';
    li.append(remove);
    target.append(li);
  });
}

function bindBookmarkListInteractions(target) {
  if (!target || target.__protectedBookmarkInteractionsBound) return;
  target.__protectedBookmarkInteractionsBound = true;
  let suppressClickUntil = 0;

  const resolveEventElement = (event) => {
    const rawTarget = event ? event.target : null;
    if (!rawTarget) return null;
    if (rawTarget.nodeType === 1) return rawTarget;
    return rawTarget.parentElement || null;
  };

  const getActionTarget = (event) => {
    const elementTarget = resolveEventElement(event);
    return elementTarget && elementTarget.closest
      ? elementTarget.closest(".bookmark-delete, .bookmark_link, li.list_item")
      : null;
  };

  const handlePrimaryInteraction = async (event) => {
    if (shouldSuppressProtectedOverlayRelease()) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation && event.stopImmediatePropagation();
      return;
    }
    const actionTarget = getActionTarget(event);
    if (!actionTarget || !target.contains(actionTarget)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation && event.stopImmediatePropagation();
    const resolved = resolveBookmarkEntryFromNode(actionTarget);
    if (!resolved) return;
    suppressClickUntil = Date.now() + 600;
    const summary = HOST_STATE.lastSummary || null;
    if (actionTarget.classList.contains("bookmark-delete")) {
      deleteBookmarkEntry(resolved.bookmark, summary);
      return;
    }
    await openBookmarkEntry(resolved.bookmark, summary, resolved.item);
  };

  const handleInteraction = async (event) => {
    if (Date.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation && event.stopImmediatePropagation();
      return;
    }
    await handlePrimaryInteraction(event);
  };

  target.addEventListener("pointerup", (event) => { void handlePrimaryInteraction(event); }, true);
  target.addEventListener("mouseup", (event) => { void handlePrimaryInteraction(event); }, true);
  target.addEventListener("touchend", (event) => { void handlePrimaryInteraction(event); }, { capture: true, passive: false });
  target.addEventListener("click", handleInteraction, true);
}

async function openBookmarkEntry(bookmark, summary, li = null) {
  const targetBookId = summary && summary.bookId ? summary.bookId : getCurrentBookId();
  const restoreToken = normalizeBookmarkRestoreToken(
    bookmark && bookmark.restoreToken ? bookmark.restoreToken : "",
    targetBookId
  );
  let globalOffset = Number(bookmark && bookmark.globalOffset || 0);
  let chunkOrder = null;
  if (!globalOffset && restoreToken) {
    try {
      const descriptor = parseHostRestoreToken(restoreToken);
      globalOffset = Number(descriptor && descriptor.position && descriptor.position.globalOffset || 0);
      chunkOrder = descriptor && descriptor.position && Number.isFinite(Number(descriptor.position.chunkOrder))
        ? Number(descriptor.position.chunkOrder)
        : null;
    } catch (_error) {
      globalOffset = 0;
      chunkOrder = null;
    }
  } else if (restoreToken) {
    try {
      const descriptor = parseHostRestoreToken(restoreToken);
      chunkOrder = descriptor && descriptor.position && Number.isFinite(Number(descriptor.position.chunkOrder))
        ? Number(descriptor.position.chunkOrder)
        : null;
    } catch (_error) {
      chunkOrder = null;
    }
  }
  if (!globalOffset && !restoreToken) return;
  const openKey = globalOffset ? `offset:${globalOffset}` : restoreToken;
  if (HOST_STATE.bookmarkRestoreInFlight) return;
  HOST_STATE.bookmarkRestoreInFlight = openKey;
  li && li.classList.add("bookmark-open-pending");
  try {
    const nextSummary = globalOffset
      ? await invokeBridgeRaw("goToGlobalOffset", globalOffset, chunkOrder)
      : await invokeBridgeRaw("restoreFromToken", restoreToken);
    if (nextSummary) updateFromSummary(nextSummary);
    closeAllShellOverlays();
  } catch (error) {
    setHostActionStatus(error && error.message ? error.message : "Unable to open bookmark.");
  } finally {
    HOST_STATE.bookmarkRestoreInFlight = "";
    li && li.classList.remove("bookmark-open-pending");
  }
}

function deleteBookmarkEntry(bookmark, summary) {
  const targetBookId = summary && summary.bookId ? summary.bookId : getCurrentBookId();
  const targetToken = normalizeBookmarkRestoreToken(
    bookmark && bookmark.restoreToken ? bookmark.restoreToken : "",
    targetBookId
  );
  const nextBookmarks = syncBookmarksFromStorage().filter((item) => {
    const itemToken = normalizeBookmarkRestoreToken(
      item && item.restoreToken ? item.restoreToken : "",
      targetBookId
    );
    return itemToken !== targetToken;
  });
  saveStoredBookmarks(nextBookmarks);
  renderBookmarks(summary);
  updateBookmarkControl(summary);
}

function resolveBookmarkEntryFromNode(node) {
  const item = node && node.closest ? node.closest("li.list_item") : null;
  if (!item) return null;
  const withinBookmarkList = !!(
    item.closest("#protectedLibraryBookmarksList") ||
    item.closest("#overlay-library #bookmarksView")
  );
  if (!withinBookmarkList) return null;
  let restoreToken = String(item.dataset.restoreToken || "").trim();
  let globalOffset = Number(item.dataset.globalOffset || 0) || 0;
  const globalPageLabel = item.querySelector(".bookmark_link")?.textContent?.trim() || "";
  const chapterLabel = item.querySelector(".bookmark-comment")?.textContent?.trim() || "";
  if (!restoreToken && !globalOffset) {
    const matched = syncBookmarksFromStorage().find((bookmark) => {
      const label = String(bookmark && bookmark.globalPageLabel || "").trim();
      const chapter = String(bookmark && bookmark.chapterLabel || "").trim();
      return label === globalPageLabel && chapter === chapterLabel;
    }) || null;
    if (matched) {
      restoreToken = String(matched.restoreToken || "").trim();
      globalOffset = Number(matched.globalOffset || 0) || 0;
    }
  }
  if (!restoreToken && !globalOffset) return null;
  return {
    item,
    bookmark: {
      restoreToken,
      globalOffset,
      globalPageLabel,
      chapterLabel
    }
  };
}

function renderBookmarks(summary) {
  const bookmarksView = document.getElementById("bookmarks");
  const bookmarks = syncBookmarksFromStorage();
  if (bookmarksView) {
    renderBookmarkList(bookmarksView, bookmarks, summary);
    bindBookmarkListInteractions(bookmarksView);
  }
  const libraryBookmarksView = document.getElementById("protectedLibraryBookmarksList");
  if (libraryBookmarksView) {
    renderBookmarkList(libraryBookmarksView, bookmarks, summary);
    bindBookmarkListInteractions(libraryBookmarksView);
  }
  void refreshBookmarkPageNumbers(bookmarks);
}

function createOldStyleNoteItem(annotation) {
  const li = document.createElement("li");
  li.className = "list_item";
  li.dataset.annotationId = annotation.annotationId || "";
  li.style.display = "flex";
  li.style.alignItems = "flex-start";
  li.style.gap = "10px";
  li.style.width = "100%";
  li.style.boxSizing = "border-box";

  const wrap = document.createElement("div");
  wrap.className = "bookmark-text";
  wrap.style.flex = "1 1 auto";
  wrap.style.minWidth = "0";
  wrap.style.width = "100%";

  async function openNote(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    HOST_STATE.suppressSelectionToolbarUntil = Date.now() + 1200;
    try {
      await invokeBridge("goToAnnotation", annotation.annotationId);
    } finally {
      closeAllShellOverlays();
      hideSelectionToolbar();
    }
  }

  const link = document.createElement("a");
  link.className = "bookmark_link";
  link.href = "#";
  link.textContent = annotation.quote || "…";
  bindPrimaryAction(link, openNote, { touchOnly: false, releaseOnly: true });
  wrap.append(link);

  const comment = document.createElement("div");
  comment.className = "bookmark-comment";
  comment.textContent = annotation.noteText || "";
  wrap.append(comment);
  li.append(wrap);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "bookmark-delete";
  remove.setAttribute("aria-label", "Delete note");
  remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16"></path><path d="M9 7V5h6v2"></path><rect x="6" y="7" width="12" height="13" rx="2"></rect><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>';
  remove.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation && event.stopImmediatePropagation();
    await invokeBridge("deleteAnnotation", annotation.annotationId);
  });
  li.append(remove);
  li.addEventListener("click", openNote);
  return li;
}

function renderNotes(summary) {
  const notes = document.getElementById("notes");
  if (!notes) return;
  const annotations = Array.isArray(summary && summary.annotations) ? summary.annotations : [];
  const noteAnnotations = annotations
    .filter((annotation) => annotation.type === "note")
    .slice()
    .sort((left, right) => {
      const leftOffset = left && left.globalRange
        ? Number(String(left.globalRange).split("..")[0] || 0)
        : 0;
      const rightOffset = right && right.globalRange
        ? Number(String(right.globalRange).split("..")[0] || 0)
        : 0;
      return rightOffset - leftOffset;
    });
  const signature = noteAnnotations.map((annotation) => {
    const id = annotation && annotation.annotationId ? String(annotation.annotationId) : "";
    const quote = annotation && annotation.quote ? String(annotation.quote) : "";
    const noteText = annotation && annotation.noteText ? String(annotation.noteText) : "";
    return `${id}|${quote}|${noteText}`;
  }).join("||");
  const existingItems = notes.querySelectorAll(".list_item[data-annotation-id]");
  if (
    signature &&
    HOST_STATE.lastNotesSignature === signature &&
    HOST_STATE.lastNotesCount === noteAnnotations.length &&
    existingItems.length === noteAnnotations.length
  ) {
    return;
  }
  notes.replaceChildren();
  noteAnnotations.forEach((annotation) => notes.append(createOldStyleNoteItem(annotation)));
  HOST_STATE.lastNotesSignature = signature;
  HOST_STATE.lastNotesCount = noteAnnotations.length;
  updateProtectedNotesShareButtonState(summary);
}

function updatePageCounter(summary) {
  const pageCount = document.getElementById("page-count");
  if (!pageCount) return;
  pageCount.textContent = summary && (summary.globalPageLabel || summary.pageLabel) ? (summary.globalPageLabel || summary.pageLabel) : "";
}

function canNavigateDirection(direction, summary = HOST_STATE.lastSummary) {
  const normalizedDirection = direction === "prev" ? "prev" : "next";
  if (!summary || typeof summary !== "object") return false;
  return normalizedDirection === "prev" ? !!summary.canGoPrev : !!summary.canGoNext;
}

function updateNavButtons(summary) {
  const prev = document.getElementById("prev");
  const next = document.getElementById("next");
  const prevEdge = document.getElementById("protectedOldShellPrevEdge");
  const nextEdge = document.getElementById("protectedOldShellNextEdge");
  const canGoPrev = canNavigateDirection("prev", summary);
  const canGoNext = canNavigateDirection("next", summary);
  [
    { node: prev, allowed: canGoPrev, hidden: !canGoPrev },
    { node: next, allowed: canGoNext, hidden: !canGoNext },
    { node: prevEdge, allowed: canGoPrev, hidden: !canGoPrev },
    { node: nextEdge, allowed: canGoNext, hidden: !canGoNext }
  ].forEach(({ node, allowed, hidden }) => {
    if (!node) return;
    node.classList.toggle("disabled", !allowed);
    node.disabled = !allowed;
    node.dataset.navHidden = hidden ? "true" : "false";
    node.setAttribute("aria-hidden", hidden ? "true" : "false");
    node.tabIndex = allowed ? 0 : -1;
  });
}

function updateSearchControls(summary) {
  const rawSearch = summary && summary.searchSummary ? summary.searchSummary : { active: false, query: "", totalMatches: 0, currentMatch: 0, matches: [] };
  const search = HOST_STATE.searchSidebarForceEmpty
    ? { active: false, query: "", totalMatches: 0, currentMatch: 0, matches: [] }
    : rawSearch;
  const effectiveQuery = String(
    search.active
      ? (search.query || HOST_STATE.searchSidebarPendingQuery || "")
      : (HOST_STATE.searchSidebarPendingQuery || "")
  );
  const desktopInput = document.getElementById("searchInputDesktop");
  const desktopCount = document.getElementById("searchCountDesktop");
  const desktopNav = document.querySelector("#searchDesktop .search-nav.desktop");
  const desktopAction = document.getElementById("searchActionDesktop");
  const mobileInput = document.getElementById("searchInputMobile");
  const mobileClear = document.getElementById("searchClearMobile");
  const mobileCount = document.getElementById("searchCount");
  const mobileFloat = document.getElementById("searchFloatControls");
  const desktopReturn = document.getElementById("searchReturnDesktop");
  const suppressSearchRestore = Date.now() < Number(HOST_STATE.searchClearSuppressUntil || 0);
  if (desktopInput && document.activeElement !== desktopInput) desktopInput.value = effectiveQuery;
  if (mobileInput && document.activeElement !== mobileInput) mobileInput.value = effectiveQuery;
  if (suppressSearchRestore) {
    if (desktopInput) desktopInput.value = "";
    if (mobileInput) mobileInput.value = "";
  }
  if (desktopCount) desktopCount.textContent = search.active && search.totalMatches ? `${search.currentMatch}/${search.totalMatches}` : "0/0";
  if (mobileCount) mobileCount.textContent = search.active && search.totalMatches ? `${search.currentMatch}/${search.totalMatches}` : "0/0";
  if (desktopNav) desktopNav.style.display = search.active && search.totalMatches ? "inline-flex" : "none";
  if (mobileFloat) mobileFloat.classList.add("hidden");
  if (mobileFloat && isTouchShellMode() && document.body.classList.contains("search-open") && search.active && search.totalMatches) {
    mobileFloat.classList.remove("hidden");
  }
  if (desktopAction) {
    desktopAction.classList.toggle("is-clear", !!search.active);
    desktopAction.classList.toggle("is-mag", !search.active);
    const hasDraftQuery = !!String((desktopInput && desktopInput.value) || (mobileInput && mobileInput.value) || search.query || "").trim();
    desktopAction.classList.toggle("is-enabled", !!(search.active || hasDraftQuery));
    desktopAction.classList.toggle("is-disabled", !(search.active || hasDraftQuery));
    desktopAction.setAttribute("aria-label", search.active ? "Clear search" : "Search");
  }
  if (mobileClear) {
    const hasMobileDraft = !!String((mobileInput && mobileInput.value) || search.query || "").trim();
    mobileClear.classList.toggle("hidden", !hasMobileDraft);
    const mobileWrap = mobileInput && mobileInput.closest ? mobileInput.closest(".search-input-wrap.mobile") : null;
    mobileWrap && mobileWrap.classList.toggle("has-clear", hasMobileDraft);
  }
  if (desktopReturn) {
    desktopReturn.style.display = search.active ? "inline-flex" : "none";
  }
  if (search.query && !suppressSearchRestore) {
    HOST_STATE.searchSidebarPendingQuery = String(search.query || "");
  }
  if (HOST_STATE.searchSidebarForceEmpty && !rawSearch.active && !String(rawSearch.query || "").trim()) {
    HOST_STATE.searchSidebarForceEmpty = false;
  }
}

function normalizeSearchSidebarState(payload, fallbackQuery = "") {
  const source = payload && typeof payload === "object" ? payload : {};
  const matches = Array.isArray(source.matches)
    ? source.matches.map((match) => ({
        chunkIndex: Number(match && match.chunkIndex || 0) || 0,
        chunkId: match && match.chunkId ? String(match.chunkId) : "",
        globalStartOffset: Number(match && match.globalStartOffset || 0) || 0,
        globalEndOffset: Number(match && match.globalEndOffset || 0) || 0,
        excerpt: match && match.excerpt ? String(match.excerpt) : "",
        globalPageLabel: match && match.globalPageLabel ? String(match.globalPageLabel) : "",
        current: !!(match && match.current)
      }))
    : [];
  const query = String(source.query || fallbackQuery || "");
  const totalMatches = Number(source.totalMatches || matches.length || 0) || 0;
  const currentMatch = Number(source.currentMatch || 0) || 0;
  return {
    active: !!(source.active || query),
    query,
    totalMatches,
    currentMatch,
    matches
  };
}

function escapeSearchHtml(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildSearchExcerptMarkup(excerpt = "", query = "") {
  const rawExcerpt = String(excerpt || "").trim();
  const rawQuery = String(query || "").trim();
  if (!rawExcerpt) return "";
  if (!rawQuery) return `<span class="protected-search-result-context">${escapeSearchHtml(rawExcerpt)}</span>`;
  const lowerExcerpt = rawExcerpt.toLowerCase();
  const lowerQuery = rawQuery.toLowerCase();
  const matchAt = lowerExcerpt.indexOf(lowerQuery);
  if (matchAt < 0) {
    return `<span class="protected-search-result-context">${escapeSearchHtml(rawExcerpt)}</span>`;
  }
  const before = rawExcerpt.slice(0, matchAt);
  const match = rawExcerpt.slice(matchAt, matchAt + rawQuery.length);
  const after = rawExcerpt.slice(matchAt + rawQuery.length);
  return [
    `<span class="protected-search-result-context">${escapeSearchHtml(before)}</span>`,
    `<span class="protected-search-result-match">${escapeSearchHtml(match)}</span>`,
    `<span class="protected-search-result-context">${escapeSearchHtml(after)}</span>`
  ].join("");
}

function createEmptySearchSidebarState() {
  return {
    active: false,
    query: "",
    totalMatches: 0,
    currentMatch: 0,
    matches: []
  };
}

async function invokeSearchBridge(method, ...args) {
  const result = await invokeBridge(method, ...args);
  if (result && typeof result === "object") {
    HOST_STATE.searchSidebarState = normalizeSearchSidebarState(
      result.searchSummary,
      HOST_STATE.searchSidebarPendingQuery
    );
    updateFromSummary(result);
  }
  return result;
}

async function refreshSearchSidebarState() {
  try {
    const payload = await invokeBridgeRaw("getSearchResults");
    HOST_STATE.searchSidebarState = normalizeSearchSidebarState(
      payload,
      HOST_STATE.searchSidebarPendingQuery
    );
  } catch (_error) {
    // Preserve the last known good search state if the bridge is transiently
    // unavailable during page movement or overlay refresh.
  }
}

function setControlEnabled(id, enabled, disabledLabel = "Unavailable in protected mode") {
  const node = document.getElementById(id);
  if (!node) return;
  node.classList.toggle("protected-control-disabled", !enabled);
  if (!enabled) {
    node.setAttribute("aria-disabled", "true");
    node.setAttribute("title", disabledLabel);
  } else {
    node.removeAttribute("aria-disabled");
  }
}

function applyTheme(summary) {
  const theme = summary && summary.theme === "dark" ? "dark" : "light";
  document.body.classList.toggle("protected-theme-dark", theme === "dark");
  document.body.classList.toggle("dark-ui", theme === "dark");
}

function updateBookmarkControl(summary) {
  const bookmark = document.getElementById("bookmark");
  if (!bookmark) return;
  const active = isSummaryBookmarked(summary);
  bookmark.classList.toggle("icon-bookmark", active);
  bookmark.classList.toggle("icon-bookmark-empty", !active);
  bookmark.setAttribute("aria-pressed", active ? "true" : "false");
  bookmark.setAttribute("title", active ? "Remove bookmark" : "Add bookmark");
}

function normalizeMyBooksCoverUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const rewritten = raw.replace(
    /^(?:https?:\/\/[^/]+)?\/reader_render_v5\/artifacts\/protected-books\/(\d+)\//i,
    `${window.location.origin}/books/protected-content/$1/`
  );
  try {
    return new URL(rewritten, window.location.origin).href;
  } catch (_error) {
    return rewritten;
  }
}

function isProtectedMyBooksPlaceholderItem(item) {
  const title = String(item && item.title || "").trim();
  const author = String(item && item.author || "").trim();
  if (!title && !author) return true;
  if (title === "Protected Reader") return true;
  return !title && author === "Protected mode";
}

function getProtectedReaderOpenUrlForMyBooks(summary) {
  const route = HOST_STATE.route && typeof HOST_STATE.route === "object" ? HOST_STATE.route : {};
  const query = route.query && typeof route.query === "object" ? route.query : {};
  const bookId = String(
    summary && summary.bookId ||
    route.bookId ||
    query.id ||
    query.protectedArtifactBookId ||
    ""
  ).trim();
  if (!bookId) return "";
  const source = String(route.source || query.source || "").trim();
  const params = new URLSearchParams();
  params.set("id", bookId);
  if (source && source !== "gutenberg") params.set("source", source);
  params.set("entry", "mybooks");
  params.set("reader", "protected");
  params.set("protectedArtifactBookId", String(route.artifactBookId || query.protectedArtifactBookId || bookId));
  params.set("protectedArtifactSource", String(route.artifactSource || query.protectedArtifactSource || "r2") || "r2");
  params.set("readerRemoteMode", String(route.remoteMode || query.readerRemoteMode || "strict") || "strict");
  params.set("protectedUx", String(query.protectedUx || "protected-shell") || "protected-shell");
  params.set("renderMode", String(route.renderMode || query.renderMode || "shape") || "shape");
  params.set("metricsMode", String(route.metricsMode || query.metricsMode || "shape") || "shape");
  return `/books/protected/?${params.toString()}`;
}

function getMyBooksDriveSync() {
  try {
    return window.ReaderPubDriveSync || null;
  } catch (_error) {
    return null;
  }
}

function getMyBooksDriveSyncSignature(item) {
  return [
    String(item && item.id || ""),
    String(item && item.source || ""),
    String(item && item.title || ""),
    String(item && item.author || ""),
    String(item && item.cover || ""),
    String(item && item.openUrl || ""),
    String(item && item.protectedArtifactBookId || ""),
    String(item && item.protectedArtifactSource || ""),
    String(item && item.readerRemoteMode || ""),
    String(item && item.protectedUx || ""),
    String(item && item.renderMode || ""),
    String(item && item.metricsMode || "")
  ].join("\u001f");
}

function scheduleProtectedMyBooksDriveSync(item) {
  const sync = getMyBooksDriveSync();
  if (!sync || typeof sync.scheduleCurrentReaderStateSync !== "function") return;
  const signature = getMyBooksDriveSyncSignature(item);
  if (signature && HOST_STATE.lastMyBooksDriveSyncSignature === signature) return;
  HOST_STATE.lastMyBooksDriveSyncSignature = signature;
  try {
    sync.scheduleCurrentReaderStateSync(null, item || null, 300);
  } catch (_error) {}
}

function deleteProtectedMyBooksDriveEntry(item) {
  const sync = getMyBooksDriveSync();
  if (!sync || !item || !item.id) return;
  try {
    if (typeof sync.deleteBookEntry === "function") {
      sync.deleteBookEntry(item, { interactive: false }).then((snapshot) => {
        try {
          if (typeof sync.applySnapshotToLocalReader === "function") sync.applySnapshotToLocalReader(snapshot);
          renderProtectedMyBooksForCurrentMount();
        } catch (_error) {}
      }).catch(() => {});
      return;
    }
    if (!item.protected && typeof sync.deleteBooksCascade === "function") {
      sync.deleteBooksCascade([String(item.id)], { interactive: false }).then((snapshot) => {
        try {
          if (typeof sync.applySnapshotToLocalReader === "function") sync.applySnapshotToLocalReader(snapshot);
          renderProtectedMyBooksForCurrentMount();
        } catch (_error) {}
      }).catch(() => {});
    }
  } catch (_error) {}
}

function registerProtectedOpenInLocalMyBooks(summary) {
  if (!summary || !summary.ready) return;
  const route = HOST_STATE.route && typeof HOST_STATE.route === "object" ? HOST_STATE.route : {};
  const query = route.query && typeof route.query === "object" ? route.query : {};
  const bookId = String(
    summary.bookId ||
    route.bookId ||
    query.id ||
    route.artifactBookId ||
    query.protectedArtifactBookId ||
    ""
  ).trim();
  if (!/^\d+$/.test(bookId)) return;
  if (isProtectedMyBooksPlaceholderItem({
    title: summary.bookTitle,
    author: summary.bookAuthor
  })) return;
  try {
    const storage = window.localStorage || null;
    if (!storage) return;
    const key = `readerpub:mybooks:${window.location.host}`;
    const raw = storage.getItem(key) || "[]";
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : [];
    const source = String(route.source || query.source || "").trim();
    const nextItem = {
      id: bookId,
      source,
      title: String(summary.bookTitle || "").trim() || bookId,
      author: String(summary.bookAuthor || "").trim(),
      cover: normalizeMyBooksCoverUrl(summary.coverUrl),
      openUrl: getProtectedReaderOpenUrlForMyBooks(summary),
      protected: true,
      reader: "protected",
      protectedArtifactBookId: String(route.artifactBookId || query.protectedArtifactBookId || bookId),
      openedAt: Date.now()
    };
    const filtered = items.filter((item) => {
      if (!item || typeof item !== "object") return false;
      const itemId = String(item.id || "").trim();
      const itemSource = String(item.source || "").trim();
      return !(itemId === nextItem.id && itemSource === nextItem.source);
    });
    filtered.unshift(nextItem);
    storage.setItem(key, JSON.stringify(filtered.slice(0, 200)));
    renderProtectedMyBooksForCurrentMount();
    scheduleProtectedMyBooksDriveSync(nextItem);
  } catch (_error) {}
}

function mountProtectedMyBooksView(target = "library") {
  const myBooksView = document.getElementById("mybooksView");
  if (!myBooksView) return;
  const libraryMount = document.getElementById("protectedLibraryMyBooksMount");
  if (libraryMount && myBooksView.parentElement !== libraryMount) {
    libraryMount.appendChild(myBooksView);
  }
}

function renderProtectedMyBooksForCurrentMount() {
  mountProtectedMyBooksView("library");
  renderProtectedMyBooks();
}

function loadProtectedMyBooksLocalItems() {
  try {
    const storage = window.localStorage || null;
    if (!storage) return [];
    const key = `readerpub:mybooks:${window.location.host}`;
    const raw = storage.getItem(key) || "[]";
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const items = parsed.filter((item) => item && item.id && !isProtectedMyBooksPlaceholderItem(item));
    if (items.length !== parsed.length) storage.setItem(key, JSON.stringify(items));
    return items;
  } catch (_error) {
    return [];
  }
}

function getMyBooksItemHref(item) {
  const id = String(item && item.id || "").trim();
  if (!id) return "#";
  const openUrl = String(item && item.openUrl || "").trim();
  if (openUrl) return openUrl;
  if (item && (item.protected || String(item.reader || "").toLowerCase() === "protected")) {
    const params = new URLSearchParams();
    params.set("id", id);
    const source = String(item.source || "").trim();
    if (source && source !== "gutenberg") params.set("source", source);
    params.set("entry", "mybooks");
    params.set("reader", "protected");
    params.set("protectedArtifactBookId", String(item.protectedArtifactBookId || id));
    params.set("protectedArtifactSource", "r2");
    params.set("readerRemoteMode", "strict");
    params.set("protectedUx", "protected-shell");
    params.set("renderMode", "shape");
    params.set("metricsMode", "shape");
    return `/books/protected/?${params.toString()}`;
  }
  const params = new URLSearchParams();
  params.set("id", id);
  const source = String(item && item.source || "").trim();
  if (source && source !== "gutenberg") params.set("source", source);
  params.set("entry", "mybooks");
  return `/books/reader/?${params.toString()}`;
}

function removeProtectedMyBooksItem(id, source) {
  const targetId = String(id || "").trim();
  const targetSource = String(source || "").trim();
  if (!targetId) return;
  try {
    const storage = window.localStorage || null;
    if (!storage) return;
    const key = `readerpub:mybooks:${window.location.host}`;
    const items = loadProtectedMyBooksLocalItems();
    let removedItem = null;
    const next = items.filter((item) => {
      const itemId = String(item && item.id || "").trim();
      const itemSource = String(item && item.source || "").trim();
      const shouldRemove = itemId === targetId && itemSource === targetSource;
      if (shouldRemove && !removedItem) removedItem = item;
      return !shouldRemove;
    });
    storage.setItem(key, JSON.stringify(next));
    renderProtectedMyBooksForCurrentMount();
    if (removedItem) deleteProtectedMyBooksDriveEntry(removedItem);
  } catch (_error) {}
}

function renderProtectedMyBooks() {
  const ul = document.getElementById("mybooks");
  if (!ul) return;
  const items = loadProtectedMyBooksLocalItems();
  ul.replaceChildren();
  if (!items.length) {
    const li = document.createElement("li");
    li.className = "list_item";
    const body = document.createElement("div");
    body.className = "bookmark-text";
    const empty = document.createElement("div");
    empty.className = "bookmark-comment";
    empty.textContent = "My Library is empty.";
    body.appendChild(empty);
    li.appendChild(body);
    ul.appendChild(li);
    return;
  }
  items.forEach((item) => {
    const id = String(item.id || "").trim();
    if (!id) return;
    const source = String(item.source || "").trim();
    const li = document.createElement("li");
    li.className = "list_item";
    li.setAttribute("data-book-id", id);
    const wrap = document.createElement("div");
    wrap.className = "bookmark-text";
    const link = document.createElement("a");
    link.className = "bookmark_link";
    link.href = getMyBooksItemHref(item);
    link.textContent = String(item.title || "").trim() || `Book ${id}`;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      window.location.href = link.href;
    });
    wrap.appendChild(link);
    const author = String(item.author || "").trim();
    if (author) {
      const meta = document.createElement("div");
      meta.className = "bookmark-comment";
      meta.textContent = author;
      wrap.appendChild(meta);
    }
    li.appendChild(wrap);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "bookmark-delete";
    button.setAttribute("aria-label", "Delete book");
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16" /><path d="M9 7V5h6v2" /><rect x="6" y="7" width="12" height="13" rx="2" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>';
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeProtectedMyBooksItem(id, source);
    });
    li.appendChild(button);
    ul.appendChild(li);
  });
}

window.__fbMyBooks = {
  render: renderProtectedMyBooksForCurrentMount,
  ensureCurrentBook: function () {
    registerProtectedOpenInLocalMyBooks(HOST_STATE.lastSummary);
  },
  syncFromDom: function () {
    registerProtectedOpenInLocalMyBooks(HOST_STATE.lastSummary);
  },
  addFromMeta: function () {
    registerProtectedOpenInLocalMyBooks(HOST_STATE.lastSummary);
  },
  remove: removeProtectedMyBooksItem
};

function readCurrentFontScale(summary = HOST_STATE.lastSummary) {
  const raw = summary ? Number(summary.fontScale || 1) : Number(HOST_STATE.readerConfig.fontScale || 1);
  const normalized = Number.isFinite(raw) ? raw : 1;
  return Math.max(0.8, Math.min(1.6, Number(normalized.toFixed(2))));
}

function closeTypographyPanel(options = {}) {
  if (!(options && options.force) && shouldSuppressProtectedOverlayRelease()) return;
  const wrap = document.getElementById("protectedTypographyControl");
  const trigger = document.getElementById("protectedTypographyTrigger");
  const overlay = document.getElementById("overlay-settings");
  const backdrop = document.getElementById("overlay-backdrop");
  const hideShellAfterClose = !!(options && options.hideShellAfterClose);
  if (wrap) wrap.classList.remove("is-open");
  if (overlay) {
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
  }
  if (backdrop) {
    backdrop.classList.add("hidden");
    backdrop.setAttribute("aria-hidden", "true");
  }
  try {
    document.body.classList.remove("overlay-open");
  } catch (_error) {}
  if (trigger) trigger.setAttribute("aria-expanded", "false");
  setReaderNewUiSmokeState({ overlay: "" });
  if (hideShellAfterClose) hideShellUi("overlay-close");
}

function toggleTypographyPanel(forceOpen) {
  const wrap = ensureTypographyControl();
  ensureSettingsOverlay();
  const trigger = document.getElementById("protectedTypographyTrigger");
  const overlay = document.getElementById("overlay-settings");
  const backdrop = document.getElementById("overlay-backdrop");
  if (!wrap || !trigger) return;
  const nextOpen = typeof forceOpen === "boolean" ? forceOpen : !wrap.classList.contains("is-open");
  if (!nextOpen) {
    closeTypographyPanel();
    return;
  }
  closeAllShellOverlays();
  wrap.classList.toggle("is-open", nextOpen);
  trigger.setAttribute("aria-expanded", nextOpen ? "true" : "false");
  if (overlay) {
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
  }
  document.querySelectorAll("#protectedSettingsVoiceMount .voice-picker-dropdown.is-open").forEach((node) => {
    node.classList.remove("is-open");
    const toggle = node.querySelector(".voice-picker-dropdown-toggle");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  });
  if (backdrop) {
    backdrop.classList.remove("hidden");
    backdrop.setAttribute("aria-hidden", "false");
  }
  try {
    document.body.classList.add("overlay-open");
  } catch (_error) {}
  setReaderNewUiSmokeState({ overlay: "overlay-settings" });
}

function ensureTypographyControl() {
  let wrap = document.getElementById("protectedTypographyControl");
  if (wrap) return wrap;
  const fontInc = document.getElementById("fontInc");
  const parent = fontInc && fontInc.parentElement ? fontInc.parentElement : null;
  if (!parent) return null;
  wrap = document.createElement("span");
  wrap.id = "protectedTypographyControl";
  wrap.innerHTML = `
    <button type="button" id="protectedTypographyTrigger" aria-label="Settings" aria-controls="overlay-settings" aria-expanded="false">
      <img src="${PROTECTED_SETTINGS_ICON_SRC}" alt="" aria-hidden="true" />
    </button>
  `;
  if (fontInc.nextSibling) parent.insertBefore(wrap, fontInc.nextSibling);
  else parent.append(wrap);
  ensureSettingsOverlay();
  return wrap;
}

function ensureLibraryControl() {
  let wrap = document.getElementById("protectedLibraryControl");
  if (wrap) return wrap;
  const titleControls = document.getElementById("title-controls");
  const themeToggle = document.getElementById("themeToggle");
  if (!titleControls || !themeToggle) return null;
  wrap = document.createElement("span");
  wrap.id = "protectedLibraryControl";
  wrap.innerHTML = `
    <button type="button" id="protectedLibraryTrigger" aria-label="Book navigation" aria-controls="overlay-library" aria-expanded="false">
      <img src="${PROTECTED_TOC_ICON_SRC}" alt="" aria-hidden="true" />
    </button>
  `;
  titleControls.insertBefore(wrap, themeToggle);
  ensureLibraryOverlay();
  return wrap;
}

function ensureDesktopTopLinks() {
  const titlebar = document.getElementById("titlebar");
  if (!titlebar) return null;
  let wrap = document.getElementById("protectedTopLeftLinks");
  if (wrap) return wrap;
  const catalogHref = new URL("/books/", window.location.origin).toString();
  wrap = document.createElement("span");
  wrap.id = "protectedTopLeftLinks";
  wrap.className = "protected-top-left-links";
  wrap.innerHTML = `
    <a id="protectedCatalogLink" class="protected-top-link protected-top-link-catalog" href="${catalogHref}" aria-label="Catalog">
      <span class="protected-top-link-icon">${PROTECTED_CATALOG_ICON_SVG}</span>
      <span class="protected-top-link-label">ReaderPub Books</span>
    </a>
  `;
  titlebar.appendChild(wrap);
  return wrap;
}

function ensureBottomCatalogLink() {
  const bottomBar = document.getElementById("bottombar");
  if (!bottomBar) return null;
  let link = document.getElementById("protectedBottomCatalogLink");
  if (link) return link;
  const catalogHref = new URL("/books/", window.location.origin).toString();
  link = document.createElement("a");
  link.id = "protectedBottomCatalogLink";
  link.href = catalogHref;
  link.setAttribute("aria-label", "ReaderPub Books");
  link.innerHTML = `
    <span class="protected-top-link-icon">${PROTECTED_CATALOG_ICON_SVG}</span>
    <span class="protected-top-link-label">ReaderPub Books</span>
  `;
  let suppressClickUntil = 0;
  const navigateToCatalog = (event = null) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation && event.stopImmediatePropagation();
    }
    const href = String(link.getAttribute("href") || link.href || "").trim();
    if (!href) return;
    suppressClickUntil = Date.now() + 700;
    window.location.href = href;
  };
  link.addEventListener("pointerup", (event) => {
    if (String(event.pointerType || "").toLowerCase() !== "touch") return;
    navigateToCatalog(event);
  }, true);
  link.addEventListener("touchend", (event) => {
    navigateToCatalog(event);
  }, { capture: true, passive: false });
  link.addEventListener("click", (event) => {
    if (Date.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation && event.stopImmediatePropagation();
      return;
    }
    navigateToCatalog(event);
  }, true);
  bottomBar.appendChild(link);
  return link;
}

function applyUnifiedShellChrome() {
  installStyles();
  document.body.classList.toggle("protected-dev-panel", isDevPanelEnabled());
  ensureDesktopTopLinks();
  ensureBottomCatalogLink();
  ensureLibraryControl();
  ensureSearchControl();
  ensureTypographyControl();
  ensureLibraryOverlay();
  ensureSettingsOverlay();
  syncProtectedShellIcons();
  const loader = document.getElementById("loader");
  if (loader) {
    loader.style.display = "none";
    loader.style.visibility = "hidden";
    loader.style.opacity = "0";
    loader.style.pointerEvents = "none";
  }
}

function ensureSearchControl() {
  let wrap = document.getElementById("protectedSearchControl");
  if (wrap) return wrap;
  const titleControls = document.getElementById("title-controls");
  const themeToggle = document.getElementById("themeToggle");
  if (!titleControls || !themeToggle) return null;
  wrap = document.createElement("span");
  wrap.id = "protectedSearchControl";
  wrap.innerHTML = `
    <button type="button" id="protectedSearchTrigger" aria-label="Search" aria-controls="overlay-search" aria-expanded="false">
      <img src="${PROTECTED_SEARCH_ICON_SRC}" alt="" aria-hidden="true" />
    </button>
  `;
  titleControls.insertBefore(wrap, themeToggle);
  ensureSearchOverlay();
  return wrap;
}

function ensureDesktopSearchReturnButton() {
  const nav = document.querySelector("#searchDesktop .search-nav.desktop");
  if (!nav) return null;
  let button = document.getElementById("searchReturnDesktop");
  const prevButton = document.getElementById("searchPrevDesktop");
  const placeButton = (node) => {
    if (!node) return node;
    if (prevButton && prevButton.parentNode === nav && prevButton.nextSibling !== node) {
      nav.insertBefore(node, prevButton.nextSibling);
    } else if (!prevButton && node.parentNode !== nav) {
      nav.prepend(node);
    }
    return node;
  };
  if (button) return placeButton(button);
  button = document.createElement("button");
  button.id = "searchReturnDesktop";
  button.className = "search-btn search-return";
  button.type = "button";
  button.setAttribute("aria-label", "Return to page where search started");
  const img = document.createElement("img");
  img.src = PROTECTED_SEARCH_BACK_ICON_SRC;
  img.alt = "";
  img.setAttribute("aria-hidden", "true");
  button.replaceChildren(img);
  return placeButton(button);
}

function syncLegacySearchFieldIcons() {
  const syncDesktopAction = () => {
    const button = document.getElementById("searchActionDesktop");
    if (!button) return;
    let img = button.querySelector("img.search-field-mag-icon");
    if (!img) {
      img = document.createElement("img");
      img.className = "search-field-mag-icon";
      img.alt = "";
      img.setAttribute("aria-hidden", "true");
      button.insertBefore(img, button.firstChild);
    }
    img.src = PROTECTED_SEARCH_FIELD_ICON_SRC;
  };
  const syncMobileInfield = () => {
    const wrap = document.querySelector("#searchbar .search-input-wrap.mobile .search-infield-icon");
    if (!wrap) return;
    let img = wrap.querySelector("img.search-field-mag-icon");
    if (!img) {
      img = document.createElement("img");
      img.className = "search-field-mag-icon";
      img.alt = "";
      img.setAttribute("aria-hidden", "true");
      wrap.appendChild(img);
    }
    img.src = PROTECTED_SEARCH_FIELD_ICON_SRC;
  };
  syncDesktopAction();
  syncMobileInfield();
}

function syncLegacySearchButtonIcons() {
  const setChevron = (id, svg) => {
    const button = document.getElementById(id);
    if (!button) return;
    if (button.dataset.iconSynced === svg) return;
    button.innerHTML = svg;
    button.dataset.iconSynced = svg;
  };
  const setReturn = (id) => {
    const button = document.getElementById(id);
    if (!button) return;
    if (button.dataset.iconSynced === "back") return;
    const img = document.createElement("img");
    img.src = PROTECTED_SEARCH_BACK_ICON_SRC;
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    button.replaceChildren(img);
    button.dataset.iconSynced = "back";
  };
  setChevron("searchPrevDesktop", SEARCH_CHEVRON_LEFT_SVG);
  setChevron("searchNextDesktop", SEARCH_CHEVRON_RIGHT_SVG);
  setChevron("searchPrev", SEARCH_CHEVRON_LEFT_SVG);
  setChevron("searchNext", SEARCH_CHEVRON_RIGHT_SVG);
  setChevron("searchFloatPrev", SEARCH_CHEVRON_LEFT_SVG);
  setChevron("searchFloatNext", SEARCH_CHEVRON_RIGHT_SVG);
  setReturn("searchFloatReturn");
}

function syncProtectedShellIcons() {
  ensureDesktopTopLinks();
  ensureBottomCatalogLink();
  const libraryControl = ensureLibraryControl();
  ensureSearchControl();
  ensureDesktopSearchReturnButton();
  syncLegacySearchFieldIcons();
  syncLegacySearchButtonIcons();
  const libraryTrigger = document.getElementById("protectedLibraryTrigger");
  if (libraryTrigger) {
    let tocImg = libraryTrigger.querySelector("img");
    if (!tocImg) {
      tocImg = document.createElement("img");
      tocImg.alt = "";
      tocImg.setAttribute("aria-hidden", "true");
      libraryTrigger.replaceChildren(tocImg);
    }
    if (tocImg.getAttribute("src") !== PROTECTED_TOC_ICON_SRC) {
      tocImg.setAttribute("src", PROTECTED_TOC_ICON_SRC);
    }
  }
  const typographyControl = document.getElementById("protectedTypographyControl");
  const themeToggle = document.getElementById("themeToggle");
  if (
    typographyControl &&
    themeToggle &&
    themeToggle.parentElement &&
    typographyControl.parentElement === themeToggle.parentElement &&
    themeToggle.nextElementSibling !== typographyControl
  ) {
    typographyControl.parentElement.insertBefore(themeToggle, typographyControl);
  }
  const trigger = document.getElementById("protectedTypographyTrigger");
  if (trigger) {
    let img = trigger.querySelector("img");
    if (!img) {
      img = document.createElement("img");
      img.alt = "";
      img.setAttribute("aria-hidden", "true");
      trigger.replaceChildren(img);
    }
    if (img.getAttribute("src") !== PROTECTED_SETTINGS_ICON_SRC) {
      img.setAttribute("src", PROTECTED_SETTINGS_ICON_SRC);
    }
  }
  const bookmark = document.getElementById("bookmark");
  const bottomBar = document.getElementById("bottombar");
  const pageCount = document.getElementById("page-count");
  if (bookmark && bottomBar && bookmark.parentElement !== bottomBar) {
    bottomBar.appendChild(bookmark);
  }
  if ((document.documentElement.classList.contains("is-phone") || document.documentElement.classList.contains("is-tablet")) && pageCount && bottomBar && pageCount.parentElement !== bottomBar) {
    bottomBar.appendChild(pageCount);
  }
  const addressBarToggle = document.getElementById("addressBarToggle");
  const isAndroid = detectAndroidDevice();
  const addressBarEnabled = shouldEnableProtectedAddressBarToggle();
  if (addressBarToggle) {
    document.body.classList.toggle("android", isAndroid);
    document.body.classList.toggle("addressbar-toggle-enabled", addressBarEnabled);
    addressBarToggle.classList.toggle("hidden", !addressBarEnabled);
    if (addressBarEnabled && bottomBar && addressBarToggle.parentElement !== bottomBar) {
      bottomBar.appendChild(addressBarToggle);
    }
  }
  if (themeToggle) {
    let themeImg = themeToggle.querySelector("img.theme-icon");
    if (!themeImg) {
      themeImg = document.createElement("img");
      themeImg.className = "theme-icon";
      themeImg.alt = "";
      themeImg.setAttribute("aria-hidden", "true");
      themeToggle.replaceChildren(themeImg);
    }
    if (themeImg.getAttribute("src") !== PROTECTED_THEME_ICON_SRC) {
      themeImg.setAttribute("src", PROTECTED_THEME_ICON_SRC);
    }
  }
  if (libraryControl && themeToggle && libraryControl.parentElement !== themeToggle.parentElement) {
    themeToggle.parentElement && themeToggle.parentElement.insertBefore(libraryControl, themeToggle);
  }
}

function switchLibraryTab(nextTab = "toc") {
  const activeTab = String(nextTab || "toc").trim().toLowerCase();
  if (activeTab === "mybooks") {
    mountProtectedMyBooksView("library");
    renderProtectedMyBooks();
  }
  const tabs = ["toc", "notes", "bookmarks", "mybooks"];
  tabs.forEach((tab) => {
    const button = document.getElementById(`protectedLibraryTab-${tab}`);
    const pane = document.getElementById(`protectedLibraryPane-${tab}`);
    const isActive = tab === activeTab;
    if (button) {
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
      button.tabIndex = isActive ? 0 : -1;
    }
    if (pane) pane.classList.toggle("hidden", !isActive);
  });
  HOST_STATE.libraryActiveTab = activeTab;
}

function closeLibraryOverlay(options = {}) {
  if (!(options && options.force) && shouldSuppressProtectedOverlayRelease()) return;
  const wrap = document.getElementById("protectedLibraryControl");
  const trigger = document.getElementById("protectedLibraryTrigger");
  const overlay = document.getElementById("overlay-library");
  const backdrop = document.getElementById("overlay-backdrop");
  const hideShellAfterClose = !!(options && options.hideShellAfterClose);
  if (wrap) wrap.classList.remove("is-open");
  if (overlay) {
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
  }
  if (backdrop) {
    backdrop.classList.add("hidden");
    backdrop.setAttribute("aria-hidden", "true");
  }
  try {
    document.body.classList.remove("overlay-open");
  } catch (_error) {}
  if (trigger) trigger.setAttribute("aria-expanded", "false");
  setReaderNewUiSmokeState({ overlay: "" });
  if (hideShellAfterClose) hideShellUi("overlay-close");
}

function openLibraryOverlay(tab = "toc") {
  const wrap = ensureLibraryControl();
  ensureLibraryOverlay();
  const trigger = document.getElementById("protectedLibraryTrigger");
  const overlay = document.getElementById("overlay-library");
  const backdrop = document.getElementById("overlay-backdrop");
  closeAllShellOverlays();
  if (HOST_STATE.lastSummary) renderBookmarks(HOST_STATE.lastSummary);
  if (wrap) wrap.classList.add("is-open");
  if (trigger) trigger.setAttribute("aria-expanded", "true");
  if (overlay) {
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
  }
  if (backdrop) {
    backdrop.classList.remove("hidden");
    backdrop.setAttribute("aria-hidden", "false");
  }
  try {
    document.body.classList.add("overlay-open");
  } catch (_error) {}
  switchLibraryTab(tab);
  setReaderNewUiSmokeState({ overlay: "overlay-library" });
}

function closeSearchOverlay(options = {}) {
  if (!(options && options.force) && shouldSuppressProtectedOverlayRelease()) return;
  const wrap = document.getElementById("protectedSearchControl");
  const trigger = document.getElementById("protectedSearchTrigger");
  const overlay = document.getElementById("overlay-search");
  const backdrop = document.getElementById("overlay-backdrop");
  const hideShellAfterClose = !!(options && options.hideShellAfterClose);
  if (wrap) wrap.classList.remove("is-open");
  if (overlay) {
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
  }
  if (backdrop) {
    backdrop.classList.add("hidden");
    backdrop.setAttribute("aria-hidden", "true");
  }
  try {
    document.body.classList.remove("overlay-open");
  } catch (_error) {}
  if (trigger) trigger.setAttribute("aria-expanded", "false");
  setReaderNewUiSmokeState({ overlay: "" });
  if (hideShellAfterClose) hideShellUi("overlay-close");
}

function openSearchOverlay() {
  const wrap = ensureSearchControl();
  ensureSearchOverlay();
  const trigger = document.getElementById("protectedSearchTrigger");
  const overlay = document.getElementById("overlay-search");
  const backdrop = document.getElementById("overlay-backdrop");
  closeAllShellOverlays();
  if (wrap) wrap.classList.add("is-open");
  if (trigger) trigger.setAttribute("aria-expanded", "true");
  if (overlay) {
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
  }
  if (backdrop) {
    backdrop.classList.remove("hidden");
    backdrop.setAttribute("aria-hidden", "false");
  }
  try {
    document.body.classList.add("overlay-open");
  } catch (_error) {}
  HOST_STATE.searchSidebarSubmitted = false;
  HOST_STATE.searchSidebarPendingQuery = String((HOST_STATE.lastSummary && HOST_STATE.lastSummary.searchSummary && HOST_STATE.lastSummary.searchSummary.query) || "");
  setReaderNewUiSmokeState({ overlay: "overlay-search" });
  updateSearchControls(HOST_STATE.lastSummary);
  void refreshSearchSidebarState();
  const input = document.getElementById("protectedSearchInput");
  input && window.setTimeout(() => {
    try { input.focus(); } catch (_error) {}
  }, 0);
}

function renderSearchResults(summary) {
  const list = document.getElementById("protectedSearchResults");
  const empty = document.getElementById("protectedSearchEmpty");
  if (!list || !empty) return;
  const search = HOST_STATE.searchSidebarState && typeof HOST_STATE.searchSidebarState === "object"
    ? HOST_STATE.searchSidebarState
    : summary && summary.searchSummary
    ? summary.searchSummary
    : { active: false, query: "", totalMatches: 0, currentMatch: 0, matches: [] };
  const matches = Array.isArray(search.matches) ? search.matches : [];
  list.replaceChildren();
  if (!search.query) {
    empty.classList.remove("hidden");
    return;
  }
  if (!matches.length) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  matches.forEach((match, index) => {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "protected-search-result";
    if (match.current) button.classList.add("is-active");
    button.dataset.resultIndex = String(index);
    button.innerHTML = `
      ${match.globalPageLabel ? `<span class="protected-search-result-index">${escapeSearchHtml(match.globalPageLabel)}</span>` : ""}
      <span class="protected-search-result-excerpt">${buildSearchExcerptMarkup(String(match.excerpt || "").trim() || search.query, search.query)}</span>
    `;
    let opening = false;
    const openResult = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation && event.stopImmediatePropagation();
      if (opening) return;
      opening = true;
      const resultIndex = Number(button.dataset.resultIndex || 0) || 0;
      try {
        const nextSummary = await invokeBridgeRaw("goToSearchResult", resultIndex);
        if (nextSummary) updateFromSummary(nextSummary);
        closeSearchOverlay();
      } finally {
        window.setTimeout(() => {
          opening = false;
        }, 0);
      }
    };
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation && event.stopImmediatePropagation();
      void openResult(event);
    });
    button.addEventListener("click", openResult);
    li.append(button);
    list.append(li);
  });
}

function ensureSearchOverlay() {
  let overlay = document.getElementById("overlay-search");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "overlay-search";
    overlay.className = "overlay-panel hidden";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Search");
    overlay.innerHTML = `
      <div class="overlay-head">
        <div class="overlay-title">Search</div>
        <button class="overlay-close" type="button" aria-label="Close">✕</button>
      </div>
      <div class="overlay-sep" aria-hidden="true"></div>
      <div class="overlay-scroll">
        <section id="protectedSearchPanel" aria-label="Search">
          <div id="protectedSearchInputWrap">
            <input id="protectedSearchInput" type="text" placeholder="Search in book" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" />
            <button id="protectedSearchAction" class="is-mag" type="button" aria-label="Search">
              <svg class="search-mag-svg" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <circle cx="10.5" cy="10.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"></circle>
                <line x1="15" y1="15" x2="21" y2="21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></line>
              </svg>
              <span class="search-clear-x" aria-hidden="true">✕</span>
            </button>
          </div>
          <div id="protectedSearchMeta">
            <span id="protectedSearchCount">0/0</span>
            <div id="protectedSearchNav">
              <button id="protectedSearchPrev" type="button" aria-label="Previous result">‹</button>
              <button id="protectedSearchNext" type="button" aria-label="Next result">›</button>
            </div>
          </div>
          <div id="protectedSearchEmpty">Enter a search query.</div>
          <ul id="protectedSearchResults"></ul>
        </section>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = overlay.querySelector(".overlay-close");
    close && bindPrimaryAction(close, () => {
      closeSearchOverlay({ hideShellAfterClose: true });
    });
  }
  bindProtectedOverlayTouchScroll(overlay);
  return overlay;
}

function ensureLibraryOverlay() {
  let overlay = document.getElementById("overlay-library");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "overlay-library";
    overlay.className = "overlay-panel hidden";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Library");
    overlay.innerHTML = `
      <div class="overlay-head">
        <div class="overlay-title">Book Navigation</div>
        <button class="overlay-close" type="button" aria-label="Close">✕</button>
      </div>
      <div class="overlay-sep" aria-hidden="true"></div>
      <div class="overlay-scroll">
        <div id="protectedLibraryTabs" role="tablist" aria-label="Library sections">
          <button type="button" class="protected-library-tab is-active" id="protectedLibraryTab-toc" role="tab" aria-selected="true">TOC</button>
          <button type="button" class="protected-library-tab" id="protectedLibraryTab-notes" role="tab" aria-selected="false" tabindex="-1">Notes</button>
          <button type="button" class="protected-library-tab" id="protectedLibraryTab-bookmarks" role="tab" aria-selected="false" tabindex="-1">Bookmarks</button>
          <button type="button" class="protected-library-tab" id="protectedLibraryTab-mybooks" role="tab" aria-selected="false" tabindex="-1">My Library</button>
        </div>
        <section id="protectedLibraryPane-toc" class="protected-library-pane" role="tabpanel">
          <div id="protectedLibraryTocMount"></div>
        </section>
        <section id="protectedLibraryPane-notes" class="protected-library-pane hidden" role="tabpanel">
          <div id="protectedLibraryNotesMount"></div>
          <div id="protectedLibraryNotesFooter">
            <button type="button" id="protectedNotesShareBtn" class="notes-copy-link-btn">Copy book link with Notes</button>
          </div>
        </section>
        <section id="protectedLibraryPane-bookmarks" class="protected-library-pane hidden" role="tabpanel">
          <ul id="protectedLibraryBookmarksList"></ul>
        </section>
        <section id="protectedLibraryPane-mybooks" class="protected-library-pane hidden" role="tabpanel">
          <div id="protectedLibraryMyBooksMount"></div>
        </section>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = overlay.querySelector(".overlay-close");
    close && bindPrimaryAction(close, () => {
      closeLibraryOverlay({ hideShellAfterClose: true });
    });
    overlay.querySelectorAll(".protected-library-tab").forEach((button) => {
      bindPrimaryAction(button, () => {
        const id = String(button.id || "");
        if (id.endsWith("-toc")) switchLibraryTab("toc");
        else if (id.endsWith("-notes")) switchLibraryTab("notes");
        else if (id.endsWith("-bookmarks")) switchLibraryTab("bookmarks");
        else if (id.endsWith("-mybooks")) switchLibraryTab("mybooks");
      }, { releaseOnly: true });
    });
    const notesShareButton = overlay.querySelector("#protectedNotesShareBtn");
    if (notesShareButton) {
      notesShareButton.addEventListener("mousedown", () => notesShareButton.classList.add("is-pressed"));
      notesShareButton.addEventListener("mouseup", () => notesShareButton.classList.remove("is-pressed"));
      notesShareButton.addEventListener("mouseleave", () => notesShareButton.classList.remove("is-pressed"));
      bindPrimaryAction(notesShareButton, handleProtectedNotesShare, { releaseOnly: true, suppressWindowMs: 2500 });
    }
    const maybeCloseLibraryAfterNavigationTap = (event) => {
      if (shouldSuppressProtectedOverlayRelease()) {
        try {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation && event.stopImmediatePropagation();
        } catch (_error) {}
        return;
      }
      const target = event.target && event.target.closest
        ? event.target.closest(
            "#tocView a.toc_link, " +
            "#protectedLibraryBookmarksList .bookmark_link, " +
            "#bookmarksView .bookmark_link, " +
            "#notesView .bookmark_link, " +
            "#notes .bookmark_link, " +
            "#mybooks a.bookmark_link, " +
            "#mybooks a"
          )
        : null;
      if (!target) return;
      window.setTimeout(() => {
        closeLibraryOverlay();
      }, 0);
    };
    overlay.addEventListener("pointerup", maybeCloseLibraryAfterNavigationTap, true);
    overlay.addEventListener("touchend", maybeCloseLibraryAfterNavigationTap, { capture: true, passive: true });
    overlay.addEventListener("click", maybeCloseLibraryAfterNavigationTap, true);
  }
  const tocMount = document.getElementById("protectedLibraryTocMount");
  const notesMount = document.getElementById("protectedLibraryNotesMount");
  const myBooksMount = document.getElementById("protectedLibraryMyBooksMount");
  const tocView = document.getElementById("tocView");
  const notesView = document.getElementById("notesView");
  const myBooksView = document.getElementById("mybooksView");
  if (tocMount && tocView && tocView.parentElement !== tocMount) tocMount.appendChild(tocView);
  if (notesMount && notesView && notesView.parentElement !== notesMount) notesMount.appendChild(notesView);
  if (myBooksMount && myBooksView && HOST_STATE.libraryActiveTab === "mybooks" && myBooksView.parentElement !== myBooksMount) {
    myBooksMount.appendChild(myBooksView);
  }
  bindProtectedOverlayTouchScroll(overlay);
  updateProtectedNotesShareButtonState(HOST_STATE.lastSummary);
  return overlay;
}

function ensureSettingsOverlay() {
  let panel = document.getElementById("protectedTypographyPanel");
  if (!panel) {
    let overlay = document.getElementById("overlay-settings");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "overlay-settings";
      overlay.className = "overlay-panel hidden";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", "Settings");
      overlay.innerHTML = `
        <div class="overlay-head">
          <div class="overlay-title">Settings</div>
          <button class="overlay-close" type="button" aria-label="Close">✕</button>
        </div>
        <div class="overlay-sep" aria-hidden="true"></div>
        <div class="overlay-scroll">
          <section id="protectedSettingsBookSection">
            <div id="protectedSettingsBookCardMount"></div>
          </section>
          <section id="protectedSettingsTextSection">
            <h3 id="protectedSettingsTextSectionTitle">Text:</h3>
            <section id="protectedTypographyPanel" aria-label="Text settings">
              <div id="protectedTypographyModes" role="group" aria-label="Reading font">
                <button type="button" class="protected-typography-mode" id="protectedTypographySans" data-font-mode="sans">
                  <span class="sample" aria-hidden="true">Aa</span>
                  <span class="label">Sans</span>
                </button>
                <button type="button" class="protected-typography-mode" id="protectedTypographySerif" data-font-mode="serif">
                  <span class="sample" aria-hidden="true">Aa</span>
                  <span class="label">Serif</span>
                </button>
              </div>
              <div class="protected-typography-size">
                <div class="protected-typography-size-row">
                  <span class="small" aria-hidden="true">A</span>
                  <input type="range" id="protectedTypographyScale" min="0.8" max="1.6" step="0.1" value="1" aria-label="Text size" />
                  <span class="large" aria-hidden="true">A</span>
                </div>
              </div>
            </section>
          </section>
          <section id="protectedSettingsVoiceSection">
            <h3 id="protectedSettingsVoiceSectionTitle">Voice:</h3>
            <div id="protectedSettingsVoiceMount"></div>
          </section>
        </div>
        <div class="overlay-footer">
          <button type="button" id="protectedSettingsShareButton" class="protected-settings-footer-button"></button>
        </div>
      `;
      document.body.appendChild(overlay);
    }
    panel = overlay.querySelector("#protectedTypographyPanel");
    const close = overlay.querySelector(".overlay-close");
    close && bindPrimaryAction(close, () => {
      closeTypographyPanel({ hideShellAfterClose: true });
    });
    const backdrop = document.getElementById("overlay-backdrop");
    backdrop && bindPrimaryAction(backdrop, () => {
      if (!overlay.classList.contains("hidden")) closeTypographyPanel({ hideShellAfterClose: true });
    });
  }
  bindProtectedOverlayTouchScroll(document.getElementById("overlay-settings"));
  const bookCardMount = document.getElementById("protectedSettingsBookCardMount");
  const protectedSettingsBookCard = document.getElementById("protectedSettingsBookCard");
  if (bookCardMount && protectedSettingsBookCard && protectedSettingsBookCard.parentElement !== bookCardMount) {
    bookCardMount.appendChild(protectedSettingsBookCard);
  }
  const voiceMount = document.getElementById("protectedSettingsVoiceMount");
  const voiceView = document.getElementById("voiceView");
  if (voiceMount && voiceView && voiceView.parentElement !== voiceMount) {
    voiceMount.appendChild(voiceView);
  }
  if (voiceMount) {
    voiceMount.querySelectorAll("*").forEach((node) => {
      const text = String(node.textContent || "").trim();
      if (/^Select a voice for reading aloud\.?$/i.test(text)) {
        node.style.display = "none";
      }
    });
  }
  void refreshHostTtsVoicePicker();
  updateProtectedBookShareButtonState();
  return panel;
}

function updateTypographyControl(summary = HOST_STATE.lastSummary) {
  const wrap = ensureTypographyControl();
  if (!wrap) return;
  const activeFontMode = resolveSupportedFontMode(
    summary && (summary.runtimeFontMode || summary.fontMode)
      ? (summary.runtimeFontMode || summary.fontMode)
      : HOST_STATE.readerConfig.fontMode,
    summary,
    HOST_STATE.readerConfig.fontMode
  );
  const supportedFontModes = getSupportedFontModes(summary);
  const currentScale = readCurrentFontScale(summary);
  wrap.dataset.fontMode = activeFontMode;
  wrap.dataset.supportedModes = supportedFontModes.join(",");
  wrap.dataset.fontScale = String(currentScale);
  const scaleInput = document.getElementById("protectedTypographyScale");
  if (scaleInput && document.activeElement !== scaleInput) {
    scaleInput.value = currentScale.toFixed(1);
  }
  updateTypographyScaleVisual(scaleInput);
  ["sans", "serif"].forEach((mode) => {
    const button = document.getElementById(mode === "sans" ? "protectedTypographySans" : "protectedTypographySerif");
    if (!button) return;
    const supported = supportedFontModes.includes(mode);
    button.classList.toggle("is-active", activeFontMode === mode);
    button.setAttribute("aria-pressed", activeFontMode === mode ? "true" : "false");
    if (supported) {
      button.removeAttribute("aria-disabled");
      button.setAttribute("title", mode === "sans" ? "Use Sans font" : "Use Serif font");
    } else {
      button.setAttribute("aria-disabled", "true");
      button.setAttribute("title", "Unavailable for this book");
    }
  });
}

function syncTopControls() {
  setControlEnabled("bookmark", true);
  ensureLibraryControl();
  ensureSearchControl();
  ensureLibraryOverlay();
  ensureSearchOverlay();
  ensureTypographyControl();
  ensureBottomCatalogLink();
  updateTypographyControl();
}

function buildEngineBadge() {
  const badge = document.querySelector("#title-controls .reader-engine-badge");
  if (badge && badge.parentElement) badge.parentElement.removeChild(badge);
  return null;
}

function getCurrentTurnLayer() {
  return document.getElementById("protectedOldShellCurrentLayer");
}

function getCurrentTurnSurface() {
  return document.getElementById("viewer");
}

function getProtectedReaderFrameInsets() {
  try {
    const viewer = getCurrentTurnSurface();
    const frame = document.querySelector("#protectedDirectReaderRoot .reader-frame");
    if (!viewer || !frame) return null;
    const viewerRect = viewer.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    return {
      left: Math.max(0, Math.round(frameRect.left - viewerRect.left)),
      right: Math.max(0, Math.round(viewerRect.right - frameRect.right)),
      top: Math.max(0, Math.round(frameRect.top - viewerRect.top)),
      bottom: Math.max(0, Math.round(viewerRect.bottom - frameRect.bottom))
    };
  } catch (_error) {
    return null;
  }
}

function syncPageTurnLayerGeometry() {
  const insets = getProtectedReaderFrameInsets();
  [
    document.getElementById("protectedOldShellCurrentLayer"),
    document.getElementById("viewer-prev"),
    document.getElementById("viewer-next")
  ].filter(Boolean).forEach((layer) => {
    if (!insets) {
      layer.style.left = "0px";
      layer.style.right = "0px";
      layer.style.top = "0px";
      layer.style.bottom = "0px";
      return;
    }
    layer.style.left = `${insets.left}px`;
    layer.style.right = `${insets.right}px`;
    layer.style.top = `${insets.top}px`;
    layer.style.bottom = `${insets.bottom}px`;
  });
}

function flushPageTurnLayout() {
  try {
    syncPageTurnLayerGeometry();
    const currentSurface = getCurrentTurnSurface();
    const currentLayer = getCurrentTurnLayer();
    currentSurface && currentSurface.getBoundingClientRect();
    currentLayer && currentLayer.getBoundingClientRect();
  } catch (_error) {}
}

function clearPageTurnPreview({ clearNeighbors = false } = {}) {
  const stack = document.getElementById("viewerStack");
  const prevLayer = document.getElementById("viewer-prev");
  const nextLayer = document.getElementById("viewer-next");
  const shadow = document.getElementById("swipe-shadow");
  const currentLayer = getCurrentTurnLayer();
  const currentSurface = getCurrentTurnSurface();
  const frame = HOST_STATE.frame;
  if (clearNeighbors) {
    if (prevLayer) {
      prevLayer.replaceChildren();
      prevLayer.dataset.previewKey = "";
    }
    if (nextLayer) {
      nextLayer.replaceChildren();
      nextLayer.dataset.previewKey = "";
    }
  }
  if (prevLayer) prevLayer.style.opacity = "0";
  if (nextLayer) nextLayer.style.opacity = "0";
  if (prevLayer) {
    prevLayer.style.transform = "";
    prevLayer.style.transition = "";
  }
  if (nextLayer) {
    nextLayer.style.transform = "";
    nextLayer.style.transition = "";
  }
  if (currentLayer) {
    currentLayer.replaceChildren();
    currentLayer.style.opacity = "0";
    currentLayer.style.visibility = "hidden";
    currentLayer.style.transform = "";
    currentLayer.style.transition = "";
  }
  if (currentSurface) {
    currentSurface.style.transform = "";
    currentSurface.style.transition = "";
  }
  flushPageTurnLayout();
  if (frame) {
    frame.style.pointerEvents = "auto";
    frame.style.opacity = "1";
    frame.style.visibility = "visible";
  }
  if (shadow) {
    shadow.style.opacity = "0";
    shadow.style.left = "";
    shadow.style.transition = "";
  }
  if (stack) stack.classList.remove("swiping", "swipe-reveal-prev", "swipe-reveal-next", "shadow-left", "shadow-right", "swipe-undim");
  document.documentElement.style.setProperty("--swipe-overlay-alpha", "0.000");
  document.documentElement.classList.remove("fb-swipe-margins", "fb-swipe-underlay-left", "fb-swipe-underlay-right");
  if (HOST_STATE.turnCleanupTimer) {
    window.clearTimeout(HOST_STATE.turnCleanupTimer);
    HOST_STATE.turnCleanupTimer = null;
  }
  if (!HOST_STATE.turnInFlight) {
    scheduleNeighborPreviewSync();
    ensureNeighborLayersMounted();
  }
}

function updateCurrentTurnLayerTransform(dx) {
  const currentLayer = getCurrentTurnLayer();
  if (!currentLayer) return;
  currentLayer.style.transform = `translate3d(${Math.round(dx)}px, 0, 0)`;
}

function cloneCanvasesFromNodes(canvases) {
  return canvases.map((source) => {
    const target = document.createElement("canvas");
    const width = source.width || Math.round(source.getBoundingClientRect().width || 0);
    const height = source.height || Math.round(source.getBoundingClientRect().height || 0);
    if (!width || !height) return null;
    target.width = width;
    target.height = height;
    target.style.width = "100%";
    target.style.height = "100%";
    const ctx = target.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, width, height);
    const computed = window.getComputedStyle(source);
    const rect = source.getBoundingClientRect();
    const computedWidth = Number.parseFloat(computed.width || "");
    const computedHeight = Number.parseFloat(computed.height || "");
    const resolvedWidth = computedWidth > 0
      ? computed.width
      : `${Math.max(1, Math.round(rect.width || 0) || width)}px`;
    const resolvedHeight = computedHeight > 0
      ? computed.height
      : `${Math.max(1, Math.round(rect.height || 0) || height)}px`;
    target.style.position = computed.position || "absolute";
    target.style.left = computed.left || "0px";
    target.style.top = computed.top || "0px";
    target.style.width = resolvedWidth;
    target.style.height = resolvedHeight;
    target.style.transform = computed.transform && computed.transform !== "none" ? computed.transform : "";
    target.style.transformOrigin = computed.transformOrigin || "";
    return target;
  }).filter(Boolean);
}

function cloneProtectedCanvases() {
  const frame = HOST_STATE.frame;
  const doc = getProtectedSurfaceDocument(frame);
  if (!frame || !doc) return [];
  const primaryCanvases = [
    doc.getElementById("reader-canvas"),
    doc.getElementById("overlay-canvas")
  ].filter(Boolean);
  return cloneCanvasesFromNodes(primaryCanvases);
}

function cloneEmbeddedPreviewCanvases(direction) {
  const frame = HOST_STATE.frame;
  const doc = getProtectedSurfaceDocument(frame);
  if (!frame || !doc) return [];
  const root = doc.getElementById(`protected-turn-preview-${direction}`);
  if (!root) return [];
  const canvases = [...root.querySelectorAll("canvas")];
  if (!canvases.length) return [];
  return cloneCanvasesFromNodes(canvases);
}

function getExpectedTurnPreviewKey(summary = HOST_STATE.lastSummary) {
  if (!summary) return "";
  return [
    Number(summary.pageGlobalStartOffset || 0),
    Number(summary.chunkOrder || 0),
    normalizeFontMode(summary.runtimeFontMode || summary.fontMode || HOST_STATE.readerConfig.fontMode),
    summary.theme || "light",
    Number(summary.viewportWidth || 0),
    Number(summary.viewportHeight || 0),
    normalizeGeneration(summary.configGeneration, HOST_STATE.activeConfigGeneration),
    normalizeGeneration(summary.layoutGeneration, HOST_STATE.activeLayoutGeneration)
  ].join("|");
}

function buildTurnLayer(canvases) {
  const wrap = document.createElement("div");
  wrap.className = "protected-turn-layer";
  canvases.forEach((canvas) => wrap.append(canvas));
  return wrap;
}

function getNeighborLayerCanvasCount(direction) {
  const layer = document.getElementById(direction === "prev" ? "viewer-prev" : "viewer-next");
  return layer ? layer.querySelectorAll("canvas").length : 0;
}

function hasFreshNeighborLayer(direction, expectedKey = getExpectedTurnPreviewKey()) {
  const layer = document.getElementById(direction === "prev" ? "viewer-prev" : "viewer-next");
  if (!layer) return false;
  const canvasCount = layer.querySelectorAll("canvas").length;
  if (!canvasCount) return false;
  if (!expectedKey) return true;
  return String(layer.dataset.previewKey || "") === String(expectedKey);
}

function invalidateNeighborLayers() {
  const prevLayer = document.getElementById("viewer-prev");
  const nextLayer = document.getElementById("viewer-next");
  if (prevLayer) {
    prevLayer.replaceChildren();
    prevLayer.dataset.previewKey = "";
    prevLayer.style.opacity = "0";
  }
  if (nextLayer) {
    nextLayer.replaceChildren();
    nextLayer.dataset.previewKey = "";
    nextLayer.style.opacity = "0";
  }
}

function syncNeighborPreviewLayers({ requireFresh = false, direction = null } = {}) {
  const prevLayer = document.getElementById("viewer-prev");
  const nextLayer = document.getElementById("viewer-next");
  if (!prevLayer || !nextLayer) return false;
  const frame = HOST_STATE.frame;
  const doc = getProtectedSurfaceDocument(frame);
  const expectedKey = getExpectedTurnPreviewKey();
  const prevRoot = doc ? doc.getElementById("protected-turn-preview-prev") : null;
  const nextRoot = doc ? doc.getElementById("protected-turn-preview-next") : null;
  const prevReady = !!(prevRoot && prevRoot.dataset.ready === "1" && (!requireFresh || !expectedKey || prevRoot.dataset.previewKey === expectedKey));
  const nextReady = !!(nextRoot && nextRoot.dataset.ready === "1" && (!requireFresh || !expectedKey || nextRoot.dataset.previewKey === expectedKey));
  const prevCanvases = prevReady ? cloneEmbeddedPreviewCanvases("prev") : [];
  const nextCanvases = nextReady ? cloneEmbeddedPreviewCanvases("next") : [];
  let updated = false;
  if (prevCanvases.length) {
    prevLayer.replaceChildren(buildTurnLayer(prevCanvases));
    prevLayer.dataset.previewKey = prevRoot && prevRoot.dataset.previewKey ? prevRoot.dataset.previewKey : "";
    updated = true;
  }
  if (nextCanvases.length) {
    nextLayer.replaceChildren(buildTurnLayer(nextCanvases));
    nextLayer.dataset.previewKey = nextRoot && nextRoot.dataset.previewKey ? nextRoot.dataset.previewKey : "";
    updated = true;
  }
  const existingPrev = prevLayer.querySelectorAll("canvas").length;
  const existingNext = nextLayer.querySelectorAll("canvas").length;
  if (requireFresh && expectedKey) {
    const prevFresh = prevLayer.dataset.previewKey === expectedKey && existingPrev > 0;
    const nextFresh = nextLayer.dataset.previewKey === expectedKey && existingNext > 0;
    if (direction === "prev") return prevFresh;
    if (direction === "next") return nextFresh;
    return prevFresh && nextFresh;
  }
  return updated || existingPrev > 0 || existingNext > 0;
}

function invalidateEmbeddedNeighborPreviewRoots() {
  const frame = HOST_STATE.frame;
  const doc = getProtectedSurfaceDocument(frame);
  if (!doc) return;
  ["prev", "next"].forEach((direction) => {
    const root = doc.getElementById(`protected-turn-preview-${direction}`);
    if (!root) return;
    root.dataset.ready = "0";
    root.dataset.previewKey = "";
    root.dataset.pageLabel = "";
    root.dataset.fontMode = "";
    root.dataset.runtimeFontMode = "";
    root.dataset.configGeneration = "";
    root.dataset.layoutGeneration = "";
  });
}

function scheduleNeighborPreviewSync() {
  if (HOST_STATE.turnPreviewSyncTimer) {
    window.clearTimeout(HOST_STATE.turnPreviewSyncTimer);
    HOST_STATE.turnPreviewSyncTimer = null;
  }
  HOST_STATE.turnPreviewSyncTimer = window.setTimeout(() => {
    HOST_STATE.turnPreviewSyncTimer = null;
    void prepareAndSyncNeighborPreviews();
  }, 40);
}

function ensureNeighborLayersMounted(remainingAttempts = 6) {
  if (getNeighborLayerCanvasCount("prev") > 0 || getNeighborLayerCanvasCount("next") > 0) return;
  if (HOST_STATE.turnNeighborMountTimer) {
    window.clearTimeout(HOST_STATE.turnNeighborMountTimer);
    HOST_STATE.turnNeighborMountTimer = null;
  }
  const run = async () => {
    let ready = syncNeighborPreviewLayers({ requireFresh: true });
    if (!ready) {
      ready = await prepareAndSyncNeighborPreviews();
    }
    if (!ready) {
      syncNeighborPreviewLayers({ requireFresh: false });
    }
    if (
      remainingAttempts > 1 &&
      getNeighborLayerCanvasCount("prev") === 0 &&
      getNeighborLayerCanvasCount("next") === 0
    ) {
      HOST_STATE.turnNeighborMountTimer = window.setTimeout(() => {
        HOST_STATE.turnNeighborMountTimer = null;
        ensureNeighborLayersMounted(remainingAttempts - 1);
      }, 120);
    }
  };
  void run();
}

async function prepareAndSyncNeighborPreviews(direction = null) {
  if (HOST_STATE.turnPreviewPromise) {
    return HOST_STATE.turnPreviewPromise;
  }
  HOST_STATE.turnPreviewPromise = (async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await invokeBridgeRaw("preparePageTurnPreviews");
      } catch (_error) {}
      const startedAt = Date.now();
      while (Date.now() - startedAt < 180) {
        if (syncNeighborPreviewLayers({ requireFresh: true, direction })) return true;
        await new Promise((resolve) => window.setTimeout(resolve, 16));
      }
    }
    return syncNeighborPreviewLayers({ requireFresh: true, direction });
  })();
  try {
    return await HOST_STATE.turnPreviewPromise;
  } finally {
    HOST_STATE.turnPreviewPromise = null;
  }
}

async function waitForLivePageToSettle(expectedSummary, timeoutMs = 700) {
  const expectedStartOffset = Number(expectedSummary && expectedSummary.pageGlobalStartOffset || 0);
  const expectedChunkOrder = Number(expectedSummary && expectedSummary.chunkOrder || 0);
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const frameSummary = getBridgeSummaryFromFrame(HOST_STATE.frame);
    const liveCanvases = cloneProtectedCanvases();
    const ready =
      !!frameSummary &&
      liveCanvases.length > 0 &&
      Number(frameSummary.pageGlobalStartOffset || 0) === expectedStartOffset &&
      Number(frameSummary.chunkOrder || 0) === expectedChunkOrder;
    if (ready) return true;
    await new Promise((resolve) => window.setTimeout(resolve, 16));
  }
  return false;
}

function updatePageTurnPresentation(dx) {
  const stack = document.getElementById("viewerStack");
  const shadow = document.getElementById("swipe-shadow");
  const currentLayer = getCurrentTurnLayer();
  const prevLayer = document.getElementById("viewer-prev");
  const nextLayer = document.getElementById("viewer-next");
  if (!stack || !currentLayer || !dx) return;
  const width = Math.max(1, stack.getBoundingClientRect().width || window.innerWidth || 1);
  const shadowWidth = Math.max(6, shadow ? shadow.getBoundingClientRect().width || 6 : 6);
  const direction = dx > 0 ? "prev" : "next";
  if (!hasFreshNeighborLayer(direction)) {
    syncNeighborPreviewLayers({ requireFresh: false, direction });
  }
  stack.classList.add("swiping");
  stack.classList.toggle("swipe-reveal-prev", direction === "prev");
  stack.classList.toggle("swipe-reveal-next", direction === "next");
  stack.classList.toggle("shadow-left", direction === "prev");
  stack.classList.toggle("shadow-right", direction === "next");
  stack.classList.remove("swipe-undim");
  stack.classList.add("swiping");
  updateSwipeOverlayAlpha(dx, width);
  document.documentElement.classList.add("fb-swipe-margins");
  document.documentElement.classList.remove("fb-swipe-underlay-left", "fb-swipe-underlay-right");
  document.documentElement.classList.add(direction === "prev" ? "fb-swipe-underlay-left" : "fb-swipe-underlay-right");
  if (prevLayer) prevLayer.style.opacity = direction === "prev" ? "1" : "0";
  if (nextLayer) nextLayer.style.opacity = direction === "next" ? "1" : "0";
  updateCurrentTurnLayerTransform(dx);
  if (shadow) {
    shadow.style.opacity = "1";
    shadow.style.left = direction === "prev"
      ? `${Math.max(0, Math.round(dx) - shadowWidth)}px`
      : `${Math.min(width - shadowWidth, width + Math.round(dx))}px`;
  }
}

function updateCurrentTurnAnimationOnly(dx) {
  const currentSurface = getCurrentTurnSurface();
  if (!currentSurface || !dx) return;
  updateCurrentTurnLayerTransform(dx);
}

function settleTurnPreview(direction) {
  const stack = document.getElementById("viewerStack");
  const shadow = document.getElementById("swipe-shadow");
  const currentLayer = getCurrentTurnLayer();
  const currentSurface = getCurrentTurnSurface();
  const prevLayer = document.getElementById("viewer-prev");
  const nextLayer = document.getElementById("viewer-next");
  if (currentLayer) {
    currentLayer.style.opacity = "0";
    currentLayer.style.visibility = "hidden";
    currentLayer.style.transform = "";
    currentLayer.style.transition = "";
  }
  if (currentSurface) {
    currentSurface.style.transform = "";
    currentSurface.style.transition = "";
  }
  flushPageTurnLayout();
  if (prevLayer) {
    prevLayer.style.opacity = direction === "prev" ? "1" : "0";
    prevLayer.style.transform = "";
  }
  if (nextLayer) {
    nextLayer.style.opacity = direction === "next" ? "1" : "0";
    nextLayer.style.transform = "";
  }
  if (shadow) {
    shadow.style.opacity = "0";
    shadow.style.left = "";
    shadow.style.transition = "";
  }
  if (stack) {
    stack.classList.remove("swiping", "shadow-left", "shadow-right", "swipe-undim");
    stack.classList.remove("swipe-reveal-prev", "swipe-reveal-next");
  }
  document.documentElement.style.setProperty("--swipe-overlay-alpha", "0.000");
  document.documentElement.classList.remove("fb-swipe-margins", "fb-swipe-underlay-left", "fb-swipe-underlay-right");
}

function getSwipeOverlayMax() {
  try {
    const css = window.getComputedStyle(document.body || document.documentElement);
    const raw = parseFloat(css.getPropertyValue("--swipe-overlay-max"));
    if (Number.isFinite(raw) && raw >= 0) return raw;
  } catch (_error) {}
  return 0.10;
}

function setSwipeOverlayAlpha(alpha) {
  try {
    let value = Number(alpha);
    if (!Number.isFinite(value) || value < 0) value = 0;
    document.documentElement.style.setProperty("--swipe-overlay-alpha", value.toFixed(3));
  } catch (_error) {}
}

function updateSwipeOverlayAlpha(dx, width) {
  try {
    const w = Math.max(1, Number(width) || 0);
    if (!w) {
      setSwipeOverlayAlpha(0);
      return;
    }
    const half = w * 0.5;
    const traveled = Math.abs(Number(dx) || 0);
    let fadeProgress = 0;
    if (traveled > half) {
      fadeProgress = Math.min(1, Math.max(0, (traveled - half) / half));
    }
    const alpha = getSwipeOverlayMax() * (1 - fadeProgress);
    setSwipeOverlayAlpha(alpha);
  } catch (_error) {
    setSwipeOverlayAlpha(0);
  }
}

async function openProtectedNoteComposer(debugCaptureOverride = null) {
  const backdrop = document.getElementById("commentBackdrop");
  const sheet = document.getElementById("commentSheet");
  const input = document.getElementById("commentInput");
  const save = document.getElementById("commentSave");
  const cancel = document.getElementById("commentCancel");
  const quote = document.getElementById("commentSelectionQuote");
  if (!sheet || !input || !save || !cancel) {
    await invokeBridge("addNoteToSelection", "");
    return;
  }
  hideSelectionToolbar();
  let capture = debugCaptureOverride && debugCaptureOverride.hasSelection
    ? JSON.parse(JSON.stringify(debugCaptureOverride))
    : HOST_STATE.cachedSelectionActionState;
  if (!capture || !capture.hasSelection || !capture.rangeDescriptor) {
    capture = await invokeBridgeRaw("captureSelectionForUserAction");
  }
  if (!capture || !capture.hasSelection) {
    throw new Error("Create a non-empty selection before adding a note.");
  }
  const rangeDescriptor = capture.rangeDescriptor ? JSON.parse(JSON.stringify(capture.rangeDescriptor)) : null;
  if (!rangeDescriptor) {
    throw new Error("Selection anchor is unavailable for note creation.");
  }
  const normalizedQuote = String(capture && capture.clipboardText ? capture.clipboardText : "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  try {
    HOST_STATE.suppressSelectionToolbarUntil = Date.now() + 1200;
    const nextSummary = await invokeBridgeRaw("clearSelection");
    if (nextSummary) updateFromSummary(nextSummary);
  } catch (_error) {}
  backdrop && backdrop.classList.remove("hidden");
  sheet.classList.remove("hidden");
  if (quote) {
    if (normalizedQuote) {
      quote.textContent = normalizedQuote;
      quote.classList.remove("hidden");
    } else {
      quote.textContent = "";
      quote.classList.add("hidden");
    }
  }
  input.value = "";
  window.setTimeout(() => {
    try {
      input.focus();
    } catch (error) {}
  }, 0);
  return new Promise((resolve) => {
    let actionLockUntil = 0;
    const backdropCancelSuppressedUntil = Date.now() + 500;
    const shouldSkipSheetAction = () => Date.now() < actionLockUntil;
    const markSheetActionHandled = () => {
      actionLockUntil = Date.now() + 500;
    };
    const close = () => {
      backdrop && backdrop.classList.add("hidden");
      sheet.classList.add("hidden");
      if (quote) {
        quote.textContent = "";
        quote.classList.add("hidden");
      }
      save.removeEventListener("click", onSave, true);
      save.removeEventListener("pointerup", onSave, true);
      save.removeEventListener("touchend", onSave, true);
      cancel.removeEventListener("click", onCancel, true);
      cancel.removeEventListener("pointerup", onCancel, true);
      cancel.removeEventListener("touchend", onCancel, true);
      backdrop && backdrop.removeEventListener("click", onCancel, true);
      backdrop && backdrop.removeEventListener("pointerup", onCancel, true);
      backdrop && backdrop.removeEventListener("touchend", onCancel, true);
      resolve();
    };
    const onCancel = async (event) => {
      if (
        event &&
        backdrop &&
        event.currentTarget === backdrop &&
        Date.now() < backdropCancelSuppressedUntil
      ) {
        event.preventDefault();
        event.stopPropagation && event.stopPropagation();
        event.stopImmediatePropagation && event.stopImmediatePropagation();
        return;
      }
      if (shouldSkipSheetAction()) return;
      markSheetActionHandled();
      event && event.preventDefault();
      event && event.stopPropagation && event.stopPropagation();
      event && event.stopImmediatePropagation && event.stopImmediatePropagation();
      try {
        const nextSummary = await invokeBridgeRaw("clearSelection");
        if (nextSummary) updateFromSummary(nextSummary);
      } catch (error) {}
      HOST_STATE.cachedSelectionActionState = null;
      HOST_STATE.suppressSelectionToolbarUntil = Date.now() + 1200;
      close();
    };
    const onSave = async (event) => {
      if (shouldSkipSheetAction()) return;
      markSheetActionHandled();
      event && event.preventDefault();
      event && event.stopPropagation && event.stopPropagation();
      event && event.stopImmediatePropagation && event.stopImmediatePropagation();
      try {
        await invokeBridge(
          "addNoteFromRangeDescriptor",
          rangeDescriptor,
          input.value || "",
          normalizedQuote
        );
        HOST_STATE.cachedSelectionActionState = null;
        HOST_STATE.suppressSelectionToolbarUntil = Date.now() + 1200;
        close();
      } catch (error) {
        setHostActionStatus(error && error.message ? error.message : "Unable to add note.");
        try {
          input.focus();
        } catch (focusError) {}
        return;
      }
    };
    save.addEventListener("click", onSave, true);
    save.addEventListener("pointerup", onSave, true);
    save.addEventListener("touchend", onSave, { capture: true, passive: false });
    cancel.addEventListener("click", onCancel, true);
    cancel.addEventListener("pointerup", onCancel, true);
    cancel.addEventListener("touchend", onCancel, { capture: true, passive: false });
    backdrop && backdrop.addEventListener("click", onCancel, true);
    backdrop && backdrop.addEventListener("pointerup", onCancel, true);
    backdrop && backdrop.addEventListener("touchend", onCancel, { capture: true, passive: false });
  });
}

function hideSelectionToolbar() {
  const toolbar = document.getElementById("selectionToolbar");
  if (!toolbar) return;
  HOST_STATE.selectionToolbarRevision += 1;
  if (HOST_STATE.selectionToolbarTimer) {
    window.clearTimeout(HOST_STATE.selectionToolbarTimer);
    HOST_STATE.selectionToolbarTimer = null;
  }
  toolbar.classList.add("hidden");
  toolbar.setAttribute("aria-hidden", "true");
  HOST_STATE.pendingSelectionToolbar = null;
  HOST_STATE.releaseSelectionToolbarAnchor = null;
  HOST_STATE.lastSelectionReleaseAt = 0;
  HOST_STATE.cachedSelectionActionState = null;
  HOST_STATE.lastSelectionSignature = "";
  HOST_STATE.selectionStableCount = 0;
  resetProtectedSelectionShareState();
  updateProtectedSelectionShareButtonState();
}

function suppressSelectionToolbarReopen(durationMs = 900) {
  const until = Date.now() + Math.max(0, Number(durationMs || 0));
  HOST_STATE.selectionToolbarDismissSuppressUntil = Math.max(
    Number(HOST_STATE.selectionToolbarDismissSuppressUntil || 0),
    until
  );
}

function isSelectionToolbarReopenSuppressed() {
  return Date.now() < Number(HOST_STATE.selectionToolbarDismissSuppressUntil || 0);
}

function rememberSelectionToolbarReleaseAnchor(x = 160, y = 160, source = "pointer") {
  HOST_STATE.pendingSelectionToolbar = {
    x: Number(x || 160),
    y: Number(y || 160),
    source
  };
  HOST_STATE.releaseSelectionToolbarAnchor = {
    x: Number(x || 160),
    y: Number(y || 160),
    source
  };
  HOST_STATE.lastSelectionReleaseAt = Date.now();
}

function scheduleSelectionToolbarFromSummary(frame, fallbackX = 160, fallbackY = 160, attemptsLeft = 8, revision = HOST_STATE.selectionToolbarRevision) {
  if (HOST_STATE.selectionToolbarTimer) {
    window.clearTimeout(HOST_STATE.selectionToolbarTimer);
    HOST_STATE.selectionToolbarTimer = null;
  }
  HOST_STATE.selectionToolbarTimer = window.setTimeout(() => {
    HOST_STATE.selectionToolbarTimer = null;
    if (revision !== HOST_STATE.selectionToolbarRevision) return;
    if (isSelectionToolbarReopenSuppressed()) return;
    const summary = getBridgeSummaryFromFrame(frame);
    if (summary && summary.selectionActive && Number(summary.selectedChars || 0) > 0) {
      showSelectionToolbarForSummary(summary, fallbackX, fallbackY);
      HOST_STATE.pendingSelectionToolbar = null;
      HOST_STATE.releaseSelectionToolbarAnchor = null;
      return;
    }
    const touchSelection = getTouchSelectionState();
    if (HOST_STATE.touchSelectionInProgress || touchSelection.active || touchSelection.claimed || touchSelection.pending) {
      if (attemptsLeft > 0) scheduleSelectionToolbarFromSummary(frame, fallbackX, fallbackY, attemptsLeft - 1, revision);
      return;
    }
    if (!summary || !summary.selectionActive || Number(summary.selectedChars || 0) <= 0) {
      if (attemptsLeft > 0 && HOST_STATE.pendingSelectionToolbar) {
        scheduleSelectionToolbarFromSummary(frame, fallbackX, fallbackY, attemptsLeft - 1, revision);
      }
      return;
    }
    showSelectionToolbarForSummary(summary, fallbackX, fallbackY);
  }, 60);
}

function showSelectionToolbarAfterRelease(frame, fallbackX = 160, fallbackY = 160, attemptsLeft = 10, revision = HOST_STATE.selectionToolbarRevision) {
  window.setTimeout(() => {
    if (revision !== HOST_STATE.selectionToolbarRevision) return;
    if (isSelectionToolbarReopenSuppressed()) return;
    const summary = getBridgeSummaryFromFrame(frame);
    if (summary && summary.selectionActive && Number(summary.selectedChars || 0) > 0) {
      showSelectionToolbarForSummary(summary, fallbackX, fallbackY);
      HOST_STATE.pendingSelectionToolbar = null;
      HOST_STATE.releaseSelectionToolbarAnchor = null;
      return;
    }
    const touchSelection = getTouchSelectionState();
    if (HOST_STATE.touchSelectionInProgress || touchSelection.active || touchSelection.claimed || touchSelection.pending) {
      if (attemptsLeft > 0) showSelectionToolbarAfterRelease(frame, fallbackX, fallbackY, attemptsLeft - 1, revision);
      return;
    }
    if (!summary || !summary.selectionActive || Number(summary.selectedChars || 0) <= 0) {
      if (attemptsLeft > 0) showSelectionToolbarAfterRelease(frame, fallbackX, fallbackY, attemptsLeft - 1, revision);
      return;
    }
    showSelectionToolbarForSummary(summary, fallbackX, fallbackY);
  }, 80);
}

function showSelectionToolbar(clientX, clientY) {
  const touchSelection = (() => {
    try {
      const win = getProtectedSurfaceWindow(HOST_STATE.frame);
      const next = win && win.__PROTECTED_TOUCH_SELECTION__ ? win.__PROTECTED_TOUCH_SELECTION__ : null;
      return next || { pending: false, active: false, claimed: false, selectionStarted: false };
    } catch (_error) {
      return { pending: false, active: false, claimed: false, selectionStarted: false };
    }
  })();
  if (HOST_STATE.touchSelectionInProgress || touchSelection.pending || touchSelection.active || touchSelection.claimed || touchSelection.selectionStarted) {
    rememberSelectionToolbarReleaseAnchor(clientX, clientY, "touch");
    return;
  }
  const toolbar = document.getElementById("selectionToolbar");
  if (!toolbar) return;
  window.__protectedToolbarDebug = {
    ...(window.__protectedToolbarDebug || {}),
    shownAt: Date.now(),
    mode: "fallback",
    clientX,
    clientY
  };
  HOST_STATE.suppressSelectionDismissUntil = Date.now() + 450;
  toolbar.classList.remove("hidden");
  toolbar.setAttribute("aria-hidden", "false");
  toolbar.style.left = `${Math.max(12, clientX - 70)}px`;
  toolbar.style.top = `${Math.max(12, clientY - 64)}px`;
  toolbar.style.visibility = "visible";
}

async function primeSelectionActionState() {
  try {
    const bridgeState = await invokeBridgeRaw("captureSelectionForUserAction");
    HOST_STATE.cachedSelectionActionState = bridgeState || null;
    return HOST_STATE.cachedSelectionActionState;
  } catch (error) {
    HOST_STATE.cachedSelectionActionState = null;
    return null;
  }
}

function showSelectionToolbarForSummary(summary, fallbackX = 160, fallbackY = 160) {
  const touchSelection = (() => {
    try {
      const win = getProtectedSurfaceWindow(HOST_STATE.frame);
      const next = win && win.__PROTECTED_TOUCH_SELECTION__ ? win.__PROTECTED_TOUCH_SELECTION__ : null;
      return next || { pending: false, active: false, claimed: false, selectionStarted: false };
    } catch (_error) {
      return { pending: false, active: false, claimed: false, selectionStarted: false };
    }
  })();
  if (HOST_STATE.touchSelectionInProgress || touchSelection.pending || touchSelection.active || touchSelection.claimed || touchSelection.selectionStarted) {
    rememberSelectionToolbarReleaseAnchor(fallbackX, fallbackY, "touch");
    return;
  }
  const frame = HOST_STATE.frame;
  const bounds = summary && summary.selectionBounds ? summary.selectionBounds : null;
  if (!frame || !bounds) {
    window.__protectedToolbarDebug = {
      ...(window.__protectedToolbarDebug || {}),
      invokedAt: Date.now(),
      mode: "summary-fallback",
      hasFrame: !!frame,
      hasBounds: !!bounds,
      fallbackX,
      fallbackY
    };
    showSelectionToolbar(fallbackX, fallbackY);
    return;
  }
  const toolbar = document.getElementById("selectionToolbar");
  if (!toolbar) return;
  const frameRect = frame.getBoundingClientRect();
  const selLeft = frameRect.left + bounds.left;
  const selRight = frameRect.left + bounds.right;
  const selTop = frameRect.top + bounds.top;
  const selBottom = frameRect.top + bounds.bottom;
  const selCenterX = (selLeft + selRight) / 2;
  const selCenterY = (selTop + selBottom) / 2;
  toolbar.classList.remove("hidden");
  toolbar.setAttribute("aria-hidden", "false");
  toolbar.style.visibility = "hidden";
  toolbar.style.left = "0px";
  toolbar.style.top = "0px";
  const tbW = toolbar.offsetWidth || 0;
  const tbH = toolbar.offsetHeight || 0;
  const margin = 8;
  const gap = 8;
  const topBar = (document.getElementById("titlebar") || document.getElementById("searchbar") || {}).offsetHeight || 0;
  const bottomBar = (document.getElementById("bottombar") || {}).offsetHeight || 0;
  const minX = margin;
  const maxX = Math.max(margin, window.innerWidth - margin - tbW);
  const minY = Math.max(margin, topBar + margin);
  const maxY = Math.max(minY, window.innerHeight - bottomBar - margin - tbH);
  const candidates = [
    { x: selRight + gap, y: selCenterY - tbH / 2 },
    { x: selLeft - tbW - gap, y: selCenterY - tbH / 2 },
    { x: selCenterX - tbW / 2, y: selTop - tbH - gap },
    { x: selCenterX - tbW / 2, y: selBottom + gap }
  ];
  let chosen = null;
  for (const candidate of candidates) {
    const x = Math.max(minX, Math.min(maxX, Math.round(candidate.x)));
    const y = Math.max(minY, Math.min(maxY, Math.round(candidate.y)));
    const overlaps = !(x + tbW <= selLeft || x >= selRight || y + tbH <= selTop || y >= selBottom);
    if (!overlaps) {
      chosen = { x, y };
      break;
    }
  }
  if (!chosen) {
    chosen = {
      x: Math.max(minX, Math.min(maxX, Math.round(selCenterX - tbW / 2))),
      y: Math.max(minY, Math.min(maxY, Math.round(selBottom + gap)))
    };
  }
  toolbar.style.left = `${chosen.x}px`;
  toolbar.style.top = `${chosen.y}px`;
  toolbar.style.visibility = "visible";
  window.__protectedToolbarDebug = {
    ...(window.__protectedToolbarDebug || {}),
    shownAt: Date.now(),
    mode: "summary-bounds",
    x: chosen.x,
    y: chosen.y
  };
  void primeSelectionActionState().then((capture) => {
    if (capture && capture.hasSelection) {
      prewarmProtectedSelectionShare(capture);
    } else {
      updateProtectedSelectionShareButtonState();
    }
  }).catch(() => {
    updateProtectedSelectionShareButtonState();
  });
}

function openExternalUrl(url) {
  try {
    window.open(url, "_blank", "noopener");
  } catch (error) {
    window.location.href = url;
  }
}

function ensureFootnotePopup() {
  let popup = document.getElementById("protectedFootnotePopup");
  if (popup) return popup;
  popup = document.createElement("aside");
  popup.id = "protectedFootnotePopup";
  popup.className = "popup";
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-modal", "false");
  popup.setAttribute("aria-hidden", "true");
  popup.innerHTML = `
    <button type="button" class="popup-close" aria-label="Close footnote preview">×</button>
    <div class="protected-footnote-body">
      <p class="protected-footnote-empty">Footnote preview is unavailable.</p>
    </div>
  `;
  document.body.appendChild(popup);
  const closeButton = popup.querySelector(".popup-close");
  closeButton && closeButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    hideFootnotePopup("close-button");
  }, true);
  return popup;
}

function ensureFootnoteModal() {
  let modal = document.getElementById("protectedFootnoteModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "protectedFootnoteModal";
  modal.className = "selection-translate fn-main-modal hidden";
  modal.innerHTML = `
    <div class="selection-translate-panel fn-main-panel" role="dialog" aria-modal="true" aria-hidden="true">
      <div class="selection-translate-result fn-main-body">
        <button type="button" class="selection-translate-close fn-main-close" aria-label="Close footnote preview">×</button>
        <div class="fn-main-content">
          <p class="protected-footnote-empty">Footnote preview is unavailable.</p>
        </div>
      </div>
    </div>
  `;
  const maybeCloseFromBackdrop = (event) => {
    const target = event && event.target ? event.target : null;
    if (target === modal || !(target && target.closest && target.closest(".fn-main-panel"))) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation && event.stopImmediatePropagation();
      hideFootnotePopup("modal-overlay");
    }
  };
  modal.addEventListener("pointerdown", maybeCloseFromBackdrop, true);
  modal.addEventListener("touchstart", maybeCloseFromBackdrop, { capture: true, passive: false });
  modal.addEventListener("click", maybeCloseFromBackdrop, true);
  const closeButton = modal.querySelector(".fn-main-close");
  const closeFromButton = (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation && event.stopImmediatePropagation();
    hideFootnotePopup("modal-close");
  };
  closeButton && closeButton.addEventListener("pointerdown", closeFromButton, true);
  closeButton && closeButton.addEventListener("touchstart", closeFromButton, { capture: true, passive: false });
  closeButton && closeButton.addEventListener("click", closeFromButton, true);
  document.body.appendChild(modal);
  return modal;
}

function clampImageViewerTransform() {
  const viewer = document.getElementById("protectedImageViewer");
  const stage = viewer ? viewer.querySelector(".protected-image-viewer-stage") : null;
  const image = viewer ? viewer.querySelector(".protected-image-viewer-image") : null;
  if (!stage || !image) return;
  const naturalWidth = Number(image.naturalWidth || image.width || 0);
  const naturalHeight = Number(image.naturalHeight || image.height || 0);
  const stageWidth = Math.max(1, Number(stage.clientWidth || 0));
  const stageHeight = Math.max(1, Number(stage.clientHeight || 0));
  if (!naturalWidth || !naturalHeight || !stageWidth || !stageHeight) {
    HOST_STATE.imageViewerTransform.x = 0;
    HOST_STATE.imageViewerTransform.y = 0;
    return;
  }
  const fitScale = Math.min(stageWidth / naturalWidth, stageHeight / naturalHeight, 1);
  const renderedWidth = naturalWidth * fitScale * Number(HOST_STATE.imageViewerTransform.scale || 1);
  const renderedHeight = naturalHeight * fitScale * Number(HOST_STATE.imageViewerTransform.scale || 1);
  const maxX = Math.max(0, (renderedWidth - stageWidth) / 2);
  const maxY = Math.max(0, (renderedHeight - stageHeight) / 2);
  HOST_STATE.imageViewerTransform.x = Math.max(-maxX, Math.min(maxX, Number(HOST_STATE.imageViewerTransform.x || 0)));
  HOST_STATE.imageViewerTransform.y = Math.max(-maxY, Math.min(maxY, Number(HOST_STATE.imageViewerTransform.y || 0)));
}

function applyImageViewerTransform() {
  const viewer = document.getElementById("protectedImageViewer");
  const image = viewer ? viewer.querySelector(".protected-image-viewer-image") : null;
  if (!image) return;
  clampImageViewerTransform();
  image.style.transform = `translate(${Number(HOST_STATE.imageViewerTransform.x || 0)}px, ${Number(HOST_STATE.imageViewerTransform.y || 0)}px) scale(${Number(HOST_STATE.imageViewerTransform.scale || 1)})`;
}

function applyDesktopImageViewerFit() {
  const viewer = document.getElementById("protectedImageViewer");
  const image = viewer ? viewer.querySelector(".protected-image-viewer-image") : null;
  if (!viewer || !image) return;
  image.classList.remove("fit-height", "fit-width");
  if (viewer.classList.contains("touch")) return;
  const naturalWidth = Number(image.naturalWidth || image.width || 0);
  const naturalHeight = Number(image.naturalHeight || image.height || 0);
  if (!(naturalWidth > 0 && naturalHeight > 0)) return;
  const viewportWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || naturalWidth);
  const viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || naturalHeight);
  const imageAspect = naturalWidth / naturalHeight;
  const viewportAspect = viewportWidth / viewportHeight;
  image.classList.add(imageAspect <= viewportAspect ? "fit-height" : "fit-width");
}

function closeProtectedImageViewer(reason = "dismiss") {
  const viewer = document.getElementById("protectedImageViewer");
  if (!viewer) return;
  viewer.classList.remove("show", "touch");
  viewer.setAttribute("aria-hidden", "true");
  const image = viewer.querySelector(".protected-image-viewer-image");
  if (image) {
    image.removeAttribute("src");
    image.style.transform = "";
  }
  HOST_STATE.imageViewerKey = "";
  HOST_STATE.imageViewerTransform = { scale: 1, x: 0, y: 0 };
  HOST_STATE.imageViewerPointers = new Map();
  HOST_STATE.imageViewerGesture = null;
  suppressShellToggle(reason === "open" ? 500 : 240);
}

function ensureProtectedImageViewer() {
  let viewer = document.getElementById("protectedImageViewer");
  if (viewer) return viewer;
  viewer = document.createElement("div");
  viewer.id = "protectedImageViewer";
  viewer.setAttribute("aria-hidden", "true");
  viewer.innerHTML = `
    <div class="protected-image-viewer-backdrop"></div>
    <div class="protected-image-viewer-panel" role="dialog" aria-modal="true" aria-label="Image viewer">
      <div class="protected-image-viewer-stage">
        <div class="protected-image-viewer-frame">
          <button type="button" class="protected-image-viewer-close" aria-label="Close image viewer">×</button>
          <img class="protected-image-viewer-image" alt="" draggable="false" />
        </div>
      </div>
    </div>
  `;
  const closeButton = viewer.querySelector(".protected-image-viewer-close");
  const backdrop = viewer.querySelector(".protected-image-viewer-backdrop");
  const stage = viewer.querySelector(".protected-image-viewer-stage");
  const frame = viewer.querySelector(".protected-image-viewer-frame");
  const image = viewer.querySelector(".protected-image-viewer-image");
  const close = (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation && event.stopImmediatePropagation();
    }
    closeProtectedImageViewer("dismiss");
  };
  closeButton && closeButton.addEventListener("pointerdown", close, true);
  closeButton && closeButton.addEventListener("touchstart", close, { capture: true, passive: false });
  closeButton && closeButton.addEventListener("click", close, true);
  backdrop && backdrop.addEventListener("pointerdown", close, true);
  backdrop && backdrop.addEventListener("touchstart", close, { capture: true, passive: false });
  const onPointerDown = (event) => {
    if (!viewer.classList.contains("touch")) {
      if (!frame || !frame.contains(event.target)) {
        close(event);
      }
      return;
    }
    if (event.pointerType === "mouse" && event.button !== 0) return;
    stage.setPointerCapture && event.pointerId != null && stage.setPointerCapture(event.pointerId);
    HOST_STATE.imageViewerPointers.set(event.pointerId, {
      x: Number(event.clientX || 0),
      y: Number(event.clientY || 0)
    });
    const pointers = Array.from(HOST_STATE.imageViewerPointers.values());
    if (pointers.length >= 2) {
      const [a, b] = pointers;
      HOST_STATE.imageViewerGesture = {
        mode: "pinch",
        startScale: Number(HOST_STATE.imageViewerTransform.scale || 1),
        startX: Number(HOST_STATE.imageViewerTransform.x || 0),
        startY: Number(HOST_STATE.imageViewerTransform.y || 0),
        startDistance: Math.hypot(b.x - a.x, b.y - a.y) || 1,
        startMidX: (a.x + b.x) / 2,
        startMidY: (a.y + b.y) / 2
      };
    } else if (pointers.length === 1) {
      HOST_STATE.imageViewerGesture = {
        mode: "pan",
        pointerId: event.pointerId,
        startClientX: Number(event.clientX || 0),
        startClientY: Number(event.clientY || 0),
        startX: Number(HOST_STATE.imageViewerTransform.x || 0),
        startY: Number(HOST_STATE.imageViewerTransform.y || 0)
      };
    }
    event.preventDefault();
  };
  const onPointerMove = (event) => {
    if (!viewer.classList.contains("touch")) return;
    if (!HOST_STATE.imageViewerPointers.has(event.pointerId)) return;
    HOST_STATE.imageViewerPointers.set(event.pointerId, {
      x: Number(event.clientX || 0),
      y: Number(event.clientY || 0)
    });
    const pointers = Array.from(HOST_STATE.imageViewerPointers.values());
    if (pointers.length >= 2) {
      const [a, b] = pointers;
      const gesture = HOST_STATE.imageViewerGesture || {
        mode: "pinch",
        startScale: Number(HOST_STATE.imageViewerTransform.scale || 1),
        startX: Number(HOST_STATE.imageViewerTransform.x || 0),
        startY: Number(HOST_STATE.imageViewerTransform.y || 0),
        startDistance: Math.hypot(b.x - a.x, b.y - a.y) || 1,
        startMidX: (a.x + b.x) / 2,
        startMidY: (a.y + b.y) / 2
      };
      const nextDistance = Math.hypot(b.x - a.x, b.y - a.y) || gesture.startDistance || 1;
      const nextMidX = (a.x + b.x) / 2;
      const nextMidY = (a.y + b.y) / 2;
      HOST_STATE.imageViewerTransform.scale = Math.max(1, Math.min(4, gesture.startScale * (nextDistance / Math.max(1, gesture.startDistance))));
      HOST_STATE.imageViewerTransform.x = Number(gesture.startX || 0) + (nextMidX - Number(gesture.startMidX || 0));
      HOST_STATE.imageViewerTransform.y = Number(gesture.startY || 0) + (nextMidY - Number(gesture.startMidY || 0));
      HOST_STATE.imageViewerGesture = gesture;
      applyImageViewerTransform();
      event.preventDefault();
      return;
    }
    const gesture = HOST_STATE.imageViewerGesture;
    if (!gesture || gesture.mode !== "pan" || Number(HOST_STATE.imageViewerTransform.scale || 1) <= 1) return;
    HOST_STATE.imageViewerTransform.x = Number(gesture.startX || 0) + (Number(event.clientX || 0) - Number(gesture.startClientX || 0));
    HOST_STATE.imageViewerTransform.y = Number(gesture.startY || 0) + (Number(event.clientY || 0) - Number(gesture.startClientY || 0));
    applyImageViewerTransform();
    event.preventDefault();
  };
  const onPointerUp = (event) => {
    if (!viewer.classList.contains("touch")) return;
    HOST_STATE.imageViewerPointers.delete(event.pointerId);
    stage.releasePointerCapture && event.pointerId != null && stage.releasePointerCapture(event.pointerId);
    const pointers = Array.from(HOST_STATE.imageViewerPointers.values());
    if (pointers.length >= 2) {
      const [a, b] = pointers;
      HOST_STATE.imageViewerGesture = {
        mode: "pinch",
        startScale: Number(HOST_STATE.imageViewerTransform.scale || 1),
        startX: Number(HOST_STATE.imageViewerTransform.x || 0),
        startY: Number(HOST_STATE.imageViewerTransform.y || 0),
        startDistance: Math.hypot(b.x - a.x, b.y - a.y) || 1,
        startMidX: (a.x + b.x) / 2,
        startMidY: (a.y + b.y) / 2
      };
    } else if (pointers.length === 1) {
      const [a] = pointers;
      HOST_STATE.imageViewerGesture = {
        mode: "pan",
        startClientX: a.x,
        startClientY: a.y,
        startX: Number(HOST_STATE.imageViewerTransform.x || 0),
        startY: Number(HOST_STATE.imageViewerTransform.y || 0)
      };
    } else {
      HOST_STATE.imageViewerGesture = null;
    }
  };
  const onWheel = (event) => {
    if (viewer.classList.contains("touch")) return;
    const nextScale = Math.max(1, Math.min(4, Number(HOST_STATE.imageViewerTransform.scale || 1) + (event.deltaY < 0 ? 0.12 : -0.12)));
    if (nextScale === Number(HOST_STATE.imageViewerTransform.scale || 1)) return;
    HOST_STATE.imageViewerTransform.scale = nextScale;
    applyImageViewerTransform();
    event.preventDefault();
  };
  image && image.addEventListener("load", () => {
    applyDesktopImageViewerFit();
    HOST_STATE.imageViewerTransform = { scale: 1, x: 0, y: 0 };
    applyImageViewerTransform();
  });
  stage && stage.addEventListener("pointerdown", onPointerDown, { capture: true });
  stage && stage.addEventListener("pointermove", onPointerMove, { capture: true });
  stage && stage.addEventListener("pointerup", onPointerUp, { capture: true });
  stage && stage.addEventListener("pointercancel", onPointerUp, { capture: true });
  stage && stage.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("resize", () => {
    if (!viewer.classList.contains("show")) return;
    applyDesktopImageViewerFit();
    applyImageViewerTransform();
  }, { passive: true });
  document.body.appendChild(viewer);
  return viewer;
}

function showProtectedImageViewer(media, pointerType = "mouse") {
  if (!media || !media.assetUrl) return;
  const viewer = ensureProtectedImageViewer();
  const image = viewer.querySelector(".protected-image-viewer-image");
  if (!image) return;
  const touchMode = isTouchShellMode() || String(pointerType || "").toLowerCase() === "touch";
  HOST_STATE.imageViewerKey = [String(media.mediaId || ""), String(media.assetUrl || ""), touchMode ? "touch" : "desktop"].join("|");
  HOST_STATE.imageViewerTransform = { scale: 1, x: 0, y: 0 };
  HOST_STATE.imageViewerPointers = new Map();
  HOST_STATE.imageViewerGesture = null;
  viewer.classList.add("show");
  viewer.classList.toggle("touch", !!touchMode);
  viewer.setAttribute("aria-hidden", "false");
  image.classList.remove("fit-height", "fit-width");
  image.src = String(media.assetUrl || "");
  image.alt = "";
  image.style.transform = "";
  suppressShellToggle("image-open");
}

function getProtectedFootnoteFontFamily(fontMode = HOST_STATE.readerConfig.fontMode) {
  return normalizeFontMode(fontMode) === "serif"
    ? 'Georgia, "Iowan Old Style", "Times New Roman", serif'
    : 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
}

function syncFootnoteFontFamily(fontMode = HOST_STATE.readerConfig.fontMode) {
  const family = getProtectedFootnoteFontFamily(fontMode);
  try {
    document.documentElement.style.setProperty("--protected-footnote-font-family", family);
  } catch (_error) {}
}

function hideFootnotePopup(reason = "dismiss") {
  const popup = document.getElementById("protectedFootnotePopup");
  if (popup) {
    popup.classList.remove("show", "on", "above", "left", "right", "modal");
    popup.setAttribute("aria-hidden", "true");
    popup.style.left = "";
    popup.style.top = "";
    popup.style.visibility = "";
  }
  const modal = document.getElementById("protectedFootnoteModal");
  if (modal) {
    modal.classList.add("hidden");
    const panel = modal.querySelector(".fn-main-panel");
    panel && panel.setAttribute("aria-hidden", "true");
  }
  HOST_STATE.footnotePopupKey = "";
  suppressShellToggle(reason === "open" ? 500 : 220);
  HOST_STATE.suppressFootnoteSurfaceTapUntil = Math.max(
    Number(HOST_STATE.suppressFootnoteSurfaceTapUntil || 0),
    Date.now() + (reason === "open" ? 500 : 180)
  );
}

function probeFootnoteAtClientPoint(clientX = 0, clientY = 0, pointerType = "mouse") {
  return invokeBridgeRaw(
    "getFootnoteAtClientPoint",
    Number(clientX || 0),
    Number(clientY || 0),
    String(pointerType || "mouse")
  ).catch(() => null);
}

function probeLinkAtClientPoint(clientX = 0, clientY = 0, pointerType = "mouse") {
  return invokeBridgeRaw(
    "getLinkAtClientPoint",
    Number(clientX || 0),
    Number(clientY || 0),
    String(pointerType || "mouse")
  ).catch(() => null);
}

function probeMediaAtClientPoint(clientX = 0, clientY = 0, pointerType = "mouse") {
  return invokeBridgeRaw(
    "getMediaAtClientPoint",
    Number(clientX || 0),
    Number(clientY || 0),
    String(pointerType || "mouse")
  ).catch(() => null);
}

async function handleProtectedLinkActivation(anchor, pointerType = "mouse") {
  if (!anchor) return false;
  hideFootnotePopup("link-activate");
  hideSelectionToolbar();
  suppressShellToggle(pointerType === "touch" ? 900 : 650);
  if (pointerType === "touch") {
    HOST_STATE.suppressSyntheticClickUntil = Date.now() + 900;
  }
  if (anchor.kind === "external") {
    return true;
  }
  if (anchor.kind === "internal" && Number.isFinite(Number(anchor.globalOffset))) {
    const chunkOrder = Number.isFinite(Number(anchor.chunkOrder)) ? Number(anchor.chunkOrder) : null;
    const summary = await invokeBridgeRaw("goToGlobalOffset", Number(anchor.globalOffset), chunkOrder);
    if (summary) updateFromSummary(summary);
    return true;
  }
  return false;
}

function renderFootnoteParagraphRuns(runs = []) {
  return runs.map((run) => {
    const marks = Array.isArray(run && run.marks) ? run.marks : [];
    let html = escapeSearchHtml(String(run && run.content || ""));
    for (const mark of marks) {
      if (mark === "em") html = `<em>${html}</em>`;
      else if (mark === "strong") html = `<strong>${html}</strong>`;
      else if (mark === "sup") html = `<sup>${html}</sup>`;
    }
    return html;
  }).join("");
}

function renderFootnotePreviewBody(preview) {
  const paragraphs = Array.isArray(preview && preview.paragraphs) ? preview.paragraphs : [];
  if (!paragraphs.length) {
    return `<p class="protected-footnote-empty">Footnote preview is unavailable.</p>`;
  }
  return paragraphs
    .map((paragraph) => `<p class="protected-footnote-paragraph">${renderFootnoteParagraphRuns(paragraph && paragraph.runs)}</p>`)
    .join("");
}

function positionFootnotePopup(popup, clientX, clientY, bounds = null) {
  const useModal = isTouchShellMode();
  popup.classList.remove("above", "left", "right", "modal");
  popup.classList.add("show");
  if (useModal) {
    popup.classList.add("modal");
    popup.style.left = "50%";
    popup.style.top = "50%";
    return;
  }
  popup.style.visibility = "hidden";
  popup.style.left = "0px";
  popup.style.top = "0px";
  const width = popup.offsetWidth || 320;
  const height = popup.offsetHeight || 160;
  const margin = 12;
  const anchorLeft = bounds ? Number(bounds.left || clientX) : Number(clientX || 0);
  const anchorRight = bounds ? Number(bounds.right || clientX) : Number(clientX || 0);
  const anchorTop = bounds ? Number(bounds.top || clientY) : Number(clientY || 0);
  const anchorBottom = bounds ? Number(bounds.bottom || clientY) : Number(clientY || 0);
  const centerX = bounds ? (anchorLeft + anchorRight) / 2 : Number(clientX || 0);
  let left = Math.round(centerX - width / 2);
  let top = Math.round(anchorBottom + 14);
  if (top + height > window.innerHeight - margin) {
    top = Math.round(anchorTop - height - 14);
    popup.classList.add("above");
  }
  if (left < margin) {
    left = margin;
    popup.classList.add("left");
  } else if (left + width > window.innerWidth - margin) {
    left = Math.max(margin, window.innerWidth - width - margin);
    popup.classList.add("right");
  }
  top = Math.max(margin, Math.min(Math.max(margin, window.innerHeight - height - margin), top));
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
  popup.style.visibility = "visible";
}

async function showFootnotePopupForAnchor(anchor, clientX, clientY) {
  if (!anchor || !anchor.targetSourceHref || !anchor.targetAnchorId || !anchor.sourcePublicRootPath) return false;
  const requestToken = ++HOST_STATE.footnotePreviewRequestToken;
  const popupKey = `${anchor.targetSourceHref}#${anchor.targetAnchorId}`;
  syncFootnoteFontFamily(HOST_STATE.readerConfig.fontMode);
  const useModal = true;
  const popup = ensureFootnotePopup();
  const body = popup.querySelector(".protected-footnote-body");
  const modal = ensureFootnoteModal();
  const modalPanel = modal.querySelector(".fn-main-panel");
  const modalContent = modal.querySelector(".fn-main-content");
  popup.classList.remove("show", "on", "above", "left", "right", "modal");
  popup.setAttribute("aria-hidden", useModal ? "true" : "false");
  body.innerHTML = `<p class="protected-footnote-empty">Loading footnote…</p>`;
  modalContent.innerHTML = `<p class="protected-footnote-empty">Loading footnote…</p>`;
  modal.classList.add("hidden");
  modalPanel && modalPanel.setAttribute("aria-hidden", "true");
  popup.classList.remove("show", "on", "above", "left", "right", "modal");
  modal.classList.remove("hidden");
  modalPanel && modalPanel.setAttribute("aria-hidden", "false");
  try {
    const { loadProtectedFootnotePreview } = await import("./protected-footnote-preview.js?v=20260422-v5-footnotes-2");
    const preview = await loadProtectedFootnotePreview(anchor);
    if (requestToken !== HOST_STATE.footnotePreviewRequestToken) return true;
    const nextHtml = renderFootnotePreviewBody(preview);
    body.innerHTML = nextHtml;
    modalContent.innerHTML = nextHtml;
    modal.classList.remove("hidden");
    modalPanel && modalPanel.setAttribute("aria-hidden", "false");
    HOST_STATE.footnotePopupKey = popupKey;
    HOST_STATE.suppressFootnoteSurfaceTapUntil = Date.now() + 500;
    return true;
  } catch (error) {
    if (requestToken !== HOST_STATE.footnotePreviewRequestToken) return true;
    const fallbackHtml = `<p class="protected-footnote-empty">${escapeSearchHtml(error && error.message ? error.message : "Footnote preview is unavailable.")}</p>`;
    body.innerHTML = fallbackHtml;
    modalContent.innerHTML = fallbackHtml;
    modal.classList.remove("hidden");
    modalPanel && modalPanel.setAttribute("aria-hidden", "false");
    HOST_STATE.footnotePopupKey = popupKey;
    HOST_STATE.suppressFootnoteSurfaceTapUntil = Date.now() + 500;
    return true;
  }
}

function handleProtectedFootnoteActivation(anchor, clientX = 0, clientY = 0, pointerType = "mouse") {
  if (!anchor) return;
  cancelPendingShellToggle();
  if (
    !document.body.classList.contains("ui-hidden") &&
    HOST_STATE.lastShellTogglePreHidden &&
    ["desktop-click", "touch-center"].includes(String(HOST_STATE.lastShellToggleSource || "")) &&
    Date.now() - Number(HOST_STATE.lastShellToggleAt || 0) <= 800
  ) {
    hideShellUi("footnote-activate");
  }
  suppressShellToggle(pointerType === "touch" ? 900 : 650);
  if (pointerType === "touch") {
    HOST_STATE.suppressSyntheticClickUntil = Date.now() + 900;
  }
  hideSelectionToolbar();
  void showFootnotePopupForAnchor(anchor, clientX, clientY);
}

async function maybeActivateFootnoteFromEvent(frame, event, pointerKind = "mouse") {
  if (!frame || !event) return false;
  if (Date.now() < Number(HOST_STATE.suppressFootnoteSurfaceTapUntil || 0)) return false;
  const summary = getBridgeSummaryFromFrame(frame);
  if (summary && (summary.selectionActive || summary.focusedAnnotationId)) return false;
  const primaryButton = event.button == null || event.button === 0;
  if (!primaryButton) return false;
  const bridgeResult = await invokeBridgeRaw(
    "getFootnoteAtClientPoint",
    Number(event.clientX || 0),
    Number(event.clientY || 0),
    String(pointerKind || "mouse")
  ).catch(() => null);
  if (!bridgeResult || !bridgeResult.active || !bridgeResult.anchor) {
    hideFootnotePopup("no-hit");
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation && event.stopImmediatePropagation();
  suppressShellToggle(pointerKind === "touch" ? 800 : 550);
  if (pointerKind === "touch") {
    HOST_STATE.suppressSyntheticClickUntil = Date.now() + 900;
  }
  await showFootnotePopupForAnchor(bridgeResult.anchor, Number(event.clientX || 0), Number(event.clientY || 0));
  return true;
}

function bindSelectionToolbar() {
  const toolbar = document.getElementById("selectionToolbar");
  if (!toolbar || toolbar.__protectedBound) return;
  toolbar.__protectedBound = true;
async function handleAction(action) {
    if (!action) return;
    if (HOST_STATE.selectionShare) HOST_STATE.selectionShare.lastToolbarAction = action;
    if (action === "note") {
      await openProtectedNoteComposer();
      hideSelectionToolbar();
      return;
    }
    if (action === "copy") {
      const cached = HOST_STATE.cachedSelectionActionState || await primeSelectionActionState();
      const selectionText = cached && cached.clipboardText ? String(cached.clipboardText) : "";
      await copyTextToClipboard(selectionText);
      if (HOST_STATE.selectionShare) HOST_STATE.selectionShare.lastCopyValue = selectionText;
      await invokeBridge("clearSelection");
      HOST_STATE.cachedSelectionActionState = null;
      HOST_STATE.suppressSelectionToolbarUntil = Date.now() + 1200;
      setHostActionStatus("Text copied.");
      showProtectedSelectionToast("Text copied");
      suppressSelectionToolbarReopen(1200);
      hideSelectionToolbar();
      return;
    }
    if (action === "search" || action === "translate" || action === "share") {
      if (action === "share" && shouldUseNativeSelectionShare()) {
        const shareUrl = HOST_STATE.selectionShare && HOST_STATE.selectionShare.shareUrl
          ? HOST_STATE.selectionShare.shareUrl
          : "";
        if (!shareUrl) {
          const cachedCapture = HOST_STATE.cachedSelectionActionState;
          if (cachedCapture && cachedCapture.hasSelection) prewarmProtectedSelectionShare(cachedCapture);
          setHostActionStatus("Preparing link.");
          updateProtectedSelectionShareButtonState();
          return;
        }
        try {
          navigator.share({ url: shareUrl }).then(() => {
            setHostActionStatus("Link shared.");
          }).catch((error) => {
            if (!isNativeShareCancelError(error)) {
              setHostActionStatus(error && error.message ? error.message : "Unable to share selection.");
            }
          });
        } catch (error) {
          if (!isNativeShareCancelError(error)) {
            setHostActionStatus(error && error.message ? error.message : "Unable to share selection.");
          }
        }
        await invokeBridge("clearSelection");
        HOST_STATE.cachedSelectionActionState = null;
        suppressSelectionToolbarReopen(1200);
        hideSelectionToolbar();
        return;
      }
      const exported = HOST_STATE.cachedSelectionActionState || await primeSelectionActionState();
      const selectionText = exported && exported.clipboardText ? String(exported.clipboardText) : "";
      if (!selectionText) {
        setHostActionStatus("Create a non-empty selection first.");
        hideSelectionToolbar();
        return;
      }
      if (action === "search") {
        openExternalUrl(`https://www.google.com/search?q=${encodeURIComponent(selectionText)}`);
      } else if (action === "translate") {
        openExternalUrl(`https://translate.google.com/?sl=auto&tl=en&text=${encodeURIComponent(selectionText)}&op=translate`);
      } else if (action === "share") {
        const shareUrl = await getProtectedSelectionShareUrl(exported);
        if (!shareUrl) {
          prewarmProtectedSelectionShare(exported);
          setHostActionStatus("Preparing link.");
          updateProtectedSelectionShareButtonState();
          return;
        }
        try {
          await copyTextToClipboard(shareUrl);
          if (HOST_STATE.selectionShare) HOST_STATE.selectionShare.lastCopyValue = shareUrl;
          setHostActionStatus("Link copied.");
          showProtectedSelectionToast("Link copied");
          suppressSelectionToolbarReopen(1200);
        } catch (error) {
          setHostActionStatus(error && error.message ? error.message : "Unable to share selection.");
        }
        await invokeBridge("clearSelection");
        HOST_STATE.cachedSelectionActionState = null;
        suppressSelectionToolbarReopen(1200);
      }
      hideSelectionToolbar();
      return;
    }
    hideSelectionToolbar();
  }

  function toolbarActionFromEvent(event) {
    const direct = event && event.target && event.target.closest ? event.target.closest("[data-action]") : null;
    if (direct) {
      if (direct.disabled || direct.getAttribute("aria-disabled") === "true") return "";
      return direct.getAttribute("data-action");
    }
    return "";
  }

  async function maybeHandleToolbarAction(event, viaClick = false) {
    const action = toolbarActionFromEvent(event);
    if (!action) return;
    try {
      if (toolbar.__protectedActionLock && Date.now() - toolbar.__protectedActionLock < 500) return;
      toolbar.__protectedActionLock = Date.now();
    } catch (error) {}
    try {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation && event.stopImmediatePropagation();
    } catch (error) {}
    try {
      await handleAction(action);
    } catch (error) {
      setHostActionStatus(error && error.message ? error.message : "Selection action failed.");
      hideSelectionToolbar();
    }
    if (viaClick) {
      try { toolbar.__protectedActionLock = Date.now(); } catch (error) {}
    }
  }

  toolbar.addEventListener("pointerdown", (event) => { maybeHandleToolbarAction(event, false); }, { capture: true });
  toolbar.addEventListener("touchstart", (event) => { maybeHandleToolbarAction(event, false); }, { capture: true, passive: false });
  toolbar.addEventListener("pointerup", (event) => { maybeHandleToolbarAction(event, false); }, { capture: true });
  toolbar.addEventListener("touchend", (event) => { maybeHandleToolbarAction(event, false); }, { capture: true, passive: false });
  toolbar.addEventListener("click", (event) => { maybeHandleToolbarAction(event, true); });
  const dismissSelectionUi = (event) => {
    if (Date.now() < Number(HOST_STATE.suppressSelectionDismissUntil || 0)) return;
    if (toolbar.contains(event.target)) return;
    const target = event.target;
    const withinProtectedOverlay = !!(
      target &&
      target.closest &&
      target.closest("#overlay-library, #overlay-settings, #commentSheet")
    );
    const summary = HOST_STATE.lastSummary;
    const primaryButton = event.button == null || event.button === 0;
    const shouldClear = !!(
      !toolbar.classList.contains("hidden") ||
      (summary && (summary.focusedAnnotationId || summary.selectionActive))
    );
    if (withinProtectedOverlay || !shouldClear || !primaryButton) return;
    suppressShellToggle();
    suppressSelectionToolbarReopen(1000);
    hideSelectionToolbar();
    void invokeBridgeRaw("clearSelection")
      .then((nextSummary) => {
        if (nextSummary) updateFromSummary(nextSummary);
      })
      .catch(() => {});
  };
  document.addEventListener("pointerdown", dismissSelectionUi, true);
  document.addEventListener("touchstart", dismissSelectionUi, { capture: true, passive: true });
  const dismissFootnoteUi = (event) => {
    const popup = document.getElementById("protectedFootnotePopup");
    const modal = document.getElementById("protectedFootnoteModal");
    const popupVisible = !!(popup && popup.getAttribute("aria-hidden") !== "true");
    const modalVisible = !!(modal && !modal.classList.contains("hidden"));
    if (!popupVisible && !modalVisible) return;
    const target = event && event.target ? event.target : null;
    if (target && target.closest && target.closest("#protectedFootnotePopup, #protectedFootnoteModal .fn-main-panel")) return;
    hideFootnotePopup("outside-click");
  };
  document.addEventListener("pointerdown", dismissFootnoteUi, true);
  document.addEventListener("touchstart", dismissFootnoteUi, { capture: true, passive: true });
  window.__PROTECTED_SHELL_SHOW_SELECTION_TOOLBAR__ = (summary, clientX = 160, clientY = 160, pointerType = "") => {
    window.__protectedToolbarDebug = {
      ...(window.__protectedToolbarDebug || {}),
      hostInvokeAt: Date.now(),
      source: "direct-call",
      pointerType,
      summaryActive: !!(summary && summary.selectionActive),
      selectedChars: Number(summary && summary.selectedChars || 0)
    };
    if (isSelectionToolbarReopenSuppressed()) return;
    const source = pointerType === "touch" ? "touch" : "pointer";
    rememberSelectionToolbarReleaseAnchor(clientX, clientY, source);
    if (pointerType === "touch") {
      HOST_STATE.touchSelectionInProgress = false;
      return;
    }
    if (summary && summary.selectionActive && Number(summary.selectedChars || 0) > 0) {
      showSelectionToolbarForSummary(summary, Number(clientX || 160), Number(clientY || 160));
      HOST_STATE.pendingSelectionToolbar = null;
      HOST_STATE.releaseSelectionToolbarAnchor = null;
      return;
    }
    showSelectionToolbarAfterRelease(HOST_STATE.frame, Number(clientX || 160), Number(clientY || 160));
  };
  if (!window.__protectedSelectionReleaseBound) {
    window.__protectedSelectionReleaseBound = true;
    window.addEventListener("message", (event) => {
      const data = event && event.data ? event.data : null;
      if (!data || data.channel !== "protected-selection-release") return;
      window.__protectedToolbarDebug = {
        ...(window.__protectedToolbarDebug || {}),
        hostInvokeAt: Date.now(),
        source: "postMessage",
        pointerType: data.pointerType || "",
        summaryActive: !!(data.summary && data.summary.selectionActive),
        selectedChars: Number(data.summary && data.summary.selectedChars || 0)
      };
      const x = Number(data.clientX || 160);
      const y = Number(data.clientY || 160);
      const summary = data.summary || null;
      const source = data.pointerType === "touch" ? "touch" : "pointer";
      rememberSelectionToolbarReleaseAnchor(x, y, source);
      if (data.pointerType === "touch") {
        HOST_STATE.touchSelectionInProgress = false;
        return;
      }
      if (summary && summary.selectionActive && Number(summary.selectedChars || 0) > 0) {
        showSelectionToolbarForSummary(summary, x, y);
        HOST_STATE.pendingSelectionToolbar = null;
        HOST_STATE.releaseSelectionToolbarAnchor = null;
        return;
      }
      showSelectionToolbarAfterRelease(HOST_STATE.frame, x, y);
    });
  }
  window.__PROTECTED_SHELL_SHOW_FOOTNOTE__ = (anchor, clientX = 160, clientY = 160, pointerType = "") => {
    handleProtectedFootnoteActivation(anchor, Number(clientX || 160), Number(clientY || 160), String(pointerType || ""));
  };
  if (!window.__protectedFootnoteActivationBound) {
    window.__protectedFootnoteActivationBound = true;
    window.addEventListener("message", (event) => {
      const data = event && event.data ? event.data : null;
      if (!data || data.channel !== "protected-footnote-activate" || !data.anchor) return;
      handleProtectedFootnoteActivation(
        data.anchor,
        Number(data.clientX || 160),
        Number(data.clientY || 160),
        String(data.pointerType || "")
      );
    });
  }
}

function getBridgeSummaryFromFrame(frame) {
  if (HOST_STATE.lastSummary && typeof HOST_STATE.lastSummary === "object") {
    return HOST_STATE.lastSummary;
  }
  try {
    const bridge = getHostBridgeSurface(frame);
    return bridge && typeof bridge.getSummary === "function" ? bridge.getSummary() : null;
  } catch (error) {
    return null;
  }
}

function attachProtectedSurfaceInteractions(frame) {
  const wire = () => {
    let doc = null;
    let win = null;
    try {
      doc = getProtectedSurfaceDocument(frame);
      win = getProtectedSurfaceWindow(frame);
    } catch (error) {
      return;
    }
    if (!doc || doc.__protectedSurfaceInteractionsBound) return;
    doc.__protectedSurfaceInteractionsBound = true;
    const desktopSurfaceClickState = {
      armed: false,
      startX: 0,
      startY: 0,
      selectionDismissed: false,
      mediaProbe: null,
      mediaItem: null,
      footnoteProbe: null,
      footnoteAnchor: null,
      linkProbe: null,
      linkAnchor: null
    };
    const blockContextMenu = (event) => {
      const target = event.target;
      const inProtectedSurface = !!(target && target.closest && target.closest("#reader-canvas, #overlay-canvas, canvas, .reader-frame"));
      if (!inProtectedSurface) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation && event.stopImmediatePropagation();
      if (event.type === "longpress") return;
      const summary = getBridgeSummaryFromFrame(frame);
      if (summary && summary.selectionActive) {
        showSelectionToolbarForSummary(summary, event.clientX, event.clientY);
      }
    };
    doc.addEventListener("contextmenu", blockContextMenu, true);
    try { doc.addEventListener("longpress", blockContextMenu, true); } catch (_error) {}
    try { if (win) win.addEventListener("contextmenu", blockContextMenu, true); } catch (_error) {}
    doc.addEventListener("mousedown", (event) => {
      const target = event.target;
      const inProtectedSurface = !!(target && target.closest && target.closest("#reader-canvas, #overlay-canvas, canvas, .reader-frame"));
      const summary = getBridgeSummaryFromFrame(frame);
      if (!inProtectedSurface || !summary || !summary.selectionActive || event.button !== 2) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);
    doc.addEventListener("pointerdown", (event) => {
      const target = event.target;
      const inProtectedSurface = !!(target && target.closest && target.closest("#reader-canvas, #overlay-canvas, canvas, .reader-frame"));
      const summary = getBridgeSummaryFromFrame(frame);
      if (!inProtectedSurface || !summary || !summary.selectionActive || event.button !== 2) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);
    doc.addEventListener("pointerdown", () => hideSelectionToolbar(), true);
    doc.addEventListener("pointerdown", () => {
      if (Date.now() < Number(HOST_STATE.suppressSelectionDismissUntil || 0)) return;
      HOST_STATE.pendingSelectionToolbar = null;
      HOST_STATE.releaseSelectionToolbarAnchor = null;
      HOST_STATE.cachedSelectionActionState = null;
    }, true);
    doc.addEventListener("pointerdown", (event) => {
      if (isTouchShellMode()) return;
      const target = event.target;
      const inProtectedSurface = !!(target && target.closest && target.closest("#reader-canvas, #overlay-canvas, canvas, .reader-frame"));
      const primaryButton = event.button == null || event.button === 0;
      desktopSurfaceClickState.armed = !!(inProtectedSurface && primaryButton);
      desktopSurfaceClickState.startX = Number(event.clientX || 0);
      desktopSurfaceClickState.startY = Number(event.clientY || 0);
      desktopSurfaceClickState.selectionDismissed = false;
      desktopSurfaceClickState.mediaItem = null;
      desktopSurfaceClickState.mediaProbe = inProtectedSurface && primaryButton
        ? probeMediaAtClientPoint(event.clientX, event.clientY, "mouse").then((result) => {
            desktopSurfaceClickState.mediaItem = result && result.active && result.media ? result.media : null;
            if (desktopSurfaceClickState.mediaItem) desktopSurfaceClickState.armed = false;
            return desktopSurfaceClickState.mediaItem;
          })
        : null;
      desktopSurfaceClickState.footnoteAnchor = null;
      desktopSurfaceClickState.footnoteProbe = inProtectedSurface && primaryButton
        ? probeFootnoteAtClientPoint(event.clientX, event.clientY, "mouse").then((result) => {
            desktopSurfaceClickState.footnoteAnchor = result && result.active && result.anchor ? result.anchor : null;
            if (desktopSurfaceClickState.footnoteAnchor && !desktopSurfaceClickState.mediaItem) desktopSurfaceClickState.armed = false;
            return desktopSurfaceClickState.footnoteAnchor;
          })
        : null;
      desktopSurfaceClickState.linkAnchor = null;
      desktopSurfaceClickState.linkProbe = inProtectedSurface && primaryButton
        ? probeLinkAtClientPoint(event.clientX, event.clientY, "mouse").then((result) => {
            desktopSurfaceClickState.linkAnchor = result && result.active && result.anchor ? result.anchor : null;
            if (desktopSurfaceClickState.linkAnchor && !desktopSurfaceClickState.mediaItem && !desktopSurfaceClickState.footnoteAnchor) {
              desktopSurfaceClickState.armed = false;
            }
            return desktopSurfaceClickState.linkAnchor;
          })
        : null;
    }, true);
    doc.addEventListener("pointermove", (event) => {
      if (!desktopSurfaceClickState.armed) return;
      const dx = Math.abs(Number(event.clientX || 0) - desktopSurfaceClickState.startX);
      const dy = Math.abs(Number(event.clientY || 0) - desktopSurfaceClickState.startY);
      if (dx > 8 || dy > 8) desktopSurfaceClickState.armed = false;
    }, true);
    doc.addEventListener("pointerdown", (event) => {
      const target = event.target;
      const inProtectedSurface = !!(target && target.closest && target.closest("#reader-canvas, #overlay-canvas, canvas, .reader-frame"));
      const summary = getBridgeSummaryFromFrame(frame);
      const primaryButton = event.button == null || event.button === 0;
      const isTouchPointer = String(event.pointerType || "").toLowerCase() === "touch";
      const toolbar = document.getElementById("selectionToolbar");
      const shouldClear = !!(
        (toolbar && !toolbar.classList.contains("hidden")) ||
        (summary && (summary.focusedAnnotationId || summary.selectionActive))
      );
      if (!inProtectedSurface || !shouldClear || !primaryButton) return;
      if (isTouchPointer) {
        suppressShellToggle();
        hideSelectionToolbar();
        return;
      }
      desktopSurfaceClickState.selectionDismissed = true;
      suppressShellToggle();
      suppressSelectionToolbarReopen(1000);
      hideSelectionToolbar();
      void invokeBridgeRaw("clearSelection")
        .then((nextSummary) => {
          if (nextSummary) updateFromSummary(nextSummary);
        })
        .catch(() => {});
    }, true);
    doc.addEventListener("touchstart", () => {
      const summary = getBridgeSummaryFromFrame(frame);
      const toolbar = document.getElementById("selectionToolbar");
      const shouldClear = !!(
        (toolbar && !toolbar.classList.contains("hidden")) ||
        (summary && (summary.focusedAnnotationId || summary.selectionActive))
      );
      if (!shouldClear) return;
      suppressShellToggle();
      hideSelectionToolbar();
    }, { capture: true, passive: true });
    doc.addEventListener("click", (event) => {
      const target = event.target;
      const inProtectedSurface = !!(target && target.closest && target.closest("#reader-canvas, #overlay-canvas, canvas, .reader-frame"));
      const summary = getBridgeSummaryFromFrame(frame);
      if (!inProtectedSurface || !summary || !summary.focusedAnnotationId) return;
      void invokeBridgeRaw("clearSelection")
        .then((nextSummary) => {
          if (nextSummary) updateFromSummary(nextSummary);
        })
        .catch(() => {});
    }, true);
    doc.addEventListener("click", async (event) => {
      if (isTouchShellMode()) return;
      const target = event.target;
      const inProtectedSurface = !!(target && target.closest && target.closest("#reader-canvas, #overlay-canvas, canvas, .reader-frame"));
      const primaryButton = event.button == null || event.button === 0;
      const summary = getBridgeSummaryFromFrame(frame);
      const hasSelection = !!(summary && (summary.selectionActive || summary.focusedAnnotationId));
      if (inProtectedSurface && primaryButton && !hasSelection) {
        const mediaItem = desktopSurfaceClickState.mediaProbe
          ? await desktopSurfaceClickState.mediaProbe
          : await probeMediaAtClientPoint(event.clientX, event.clientY, "mouse").then((result) => result && result.active && result.media ? result.media : null);
        if (mediaItem) {
          desktopSurfaceClickState.armed = false;
          desktopSurfaceClickState.selectionDismissed = false;
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation && event.stopImmediatePropagation();
          showProtectedImageViewer(mediaItem, "mouse");
          return;
        }
        const anchor = desktopSurfaceClickState.footnoteProbe
          ? await desktopSurfaceClickState.footnoteProbe
          : await probeFootnoteAtClientPoint(event.clientX, event.clientY).then((result) => result && result.active && result.anchor ? result.anchor : null);
        if (anchor) {
          desktopSurfaceClickState.armed = false;
          desktopSurfaceClickState.selectionDismissed = false;
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation && event.stopImmediatePropagation();
          handleProtectedFootnoteActivation(anchor, Number(event.clientX || 0), Number(event.clientY || 0), "mouse");
          return;
        }
        const linkAnchor = desktopSurfaceClickState.linkProbe
          ? await desktopSurfaceClickState.linkProbe
          : await probeLinkAtClientPoint(event.clientX, event.clientY, "mouse").then((result) => result && result.active && result.anchor ? result.anchor : null);
        if (linkAnchor) {
          desktopSurfaceClickState.armed = false;
          desktopSurfaceClickState.selectionDismissed = false;
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation && event.stopImmediatePropagation();
          await handleProtectedLinkActivation(linkAnchor, "mouse");
          return;
        }
      }
      if (!desktopSurfaceClickState.armed || !inProtectedSurface || !primaryButton || hasSelection || desktopSurfaceClickState.selectionDismissed || Date.now() < Number(HOST_STATE.suppressShellToggleUntil || 0)) {
        desktopSurfaceClickState.armed = false;
        desktopSurfaceClickState.selectionDismissed = false;
        desktopSurfaceClickState.mediaProbe = null;
        desktopSurfaceClickState.mediaItem = null;
        desktopSurfaceClickState.footnoteProbe = null;
        desktopSurfaceClickState.footnoteAnchor = null;
        desktopSurfaceClickState.linkProbe = null;
        desktopSurfaceClickState.linkAnchor = null;
        return;
      }
      desktopSurfaceClickState.armed = false;
      desktopSurfaceClickState.selectionDismissed = false;
      desktopSurfaceClickState.mediaProbe = null;
      desktopSurfaceClickState.mediaItem = null;
      desktopSurfaceClickState.footnoteProbe = null;
      desktopSurfaceClickState.footnoteAnchor = null;
      scheduleShellToggle("desktop-click", 140);
    }, true);
    doc.addEventListener("mouseup", (event) => {
      if (event.button !== 0) return;
      const target = event.target;
      const inProtectedSurface = !!(target && target.closest && target.closest("#reader-canvas, #overlay-canvas, canvas, .reader-frame"));
      if (!inProtectedSurface) return;
      rememberSelectionToolbarReleaseAnchor(event.clientX, event.clientY, "mouse");
      HOST_STATE.suppressSelectionDismissUntil = Date.now() + 700;
      showSelectionToolbarAfterRelease(HOST_STATE.frame, event.clientX, event.clientY);
    }, true);
    doc.addEventListener("pointerup", (event) => {
      if (event.button != null && event.button !== 0) return;
      const target = event.target;
      const inProtectedSurface = !!(target && target.closest && target.closest("#reader-canvas, #overlay-canvas, canvas, .reader-frame"));
      if (!inProtectedSurface) return;
      rememberSelectionToolbarReleaseAnchor(
        event.clientX,
        event.clientY,
        event.pointerType === "touch" ? "touch" : "pointer"
      );
      HOST_STATE.suppressSelectionDismissUntil = Date.now() + 700;
      if (event.pointerType !== "touch") {
        showSelectionToolbarAfterRelease(HOST_STATE.frame, event.clientX, event.clientY);
      }
    }, true);
    doc.addEventListener("touchend", (event) => {
      const target = event.target;
      const inProtectedSurface = !!(target && target.closest && target.closest("#reader-canvas, #overlay-canvas, canvas, .reader-frame"));
      if (!inProtectedSurface) return;
      const touch = event.changedTouches && event.changedTouches[0] ? event.changedTouches[0] : null;
      rememberSelectionToolbarReleaseAnchor(touch ? touch.clientX : 160, touch ? touch.clientY : 160, "touch");
      HOST_STATE.touchSelectionInProgress = false;
      HOST_STATE.suppressSelectionDismissUntil = Date.now() + 700;
      showSelectionToolbarAfterRelease(HOST_STATE.frame, touch ? touch.clientX : 160, touch ? touch.clientY : 160);
    }, true);
    doc.addEventListener("pointercancel", () => {
      desktopSurfaceClickState.armed = false;
      desktopSurfaceClickState.mediaProbe = null;
      desktopSurfaceClickState.mediaItem = null;
      desktopSurfaceClickState.footnoteProbe = null;
      desktopSurfaceClickState.footnoteAnchor = null;
    }, true);
  };
  if (!isDirectRenderHostMode() && frame && typeof frame.addEventListener === "function") {
    frame.addEventListener("load", wire);
  }
  wire();
}

function updateFromSummary(summary) {
  if (!summary) return;
  const previousPageLabel = HOST_STATE.lastSummary ? String(HOST_STATE.lastSummary.pageLabel || HOST_STATE.lastSummary.globalPageLabel || "") : "";
  const nextPageLabel = String(summary.pageLabel || summary.globalPageLabel || "");
  if (previousPageLabel && nextPageLabel && previousPageLabel !== nextPageLabel) {
    hideFootnotePopup("page-change");
    closeProtectedImageViewer("page-change");
  }
  syncPageTurnLayerGeometry();
  ensureHostGenerations();
  if (isStaleSummary(summary)) return;
  HOST_STATE.lastSummary = summary;
  setReaderNewUiSmokeState({
    status: summary.ready ? "ready" : "loading",
    ready: !!summary.ready,
    lastSummary: {
      ready: !!summary.ready,
      pageLabel: String(summary.pageLabel || summary.globalPageLabel || ""),
      chapterLabel: String(summary.chapterLabel || ""),
      bookId: String(summary.bookId || ""),
      bookTitle: String(summary.bookTitle || ""),
      statusText: String(summary.statusText || "")
    },
    lastStatusText: String(summary.statusText || "")
  });
  const supportedFontModes = getSupportedFontModes(summary);
  const effectiveSummaryFontMode = resolveSupportedFontMode(
    summary.runtimeFontMode || summary.fontMode || HOST_STATE.readerConfig.fontMode,
    summary,
    HOST_STATE.readerConfig.fontMode
  );
  HOST_STATE.readerConfig.configGeneration = normalizeGeneration(summary.configGeneration, HOST_STATE.activeConfigGeneration);
  HOST_STATE.readerConfig.layoutGeneration = normalizeGeneration(summary.layoutGeneration, HOST_STATE.activeLayoutGeneration);
  HOST_STATE.readerConfig.fontMode = effectiveSummaryFontMode;
  persistShellFontMode(HOST_STATE.readerConfig.fontMode);
  syncFootnoteFontFamily(HOST_STATE.readerConfig.fontMode);
  if (summary.ready) {
    registerProtectedOpenInLocalMyBooks(summary);
    HOST_STATE.loadingCount = 0;
    setShellLoading(false);
    const preferredFontScale = getShellPreferredFontScale();
    const currentFontScale = Number(summary.fontScale || 1) || 1;
    const preferredFontMode = resolveSupportedFontMode(getShellPreferredFontMode(), summary, effectiveSummaryFontMode);
    const currentFontMode = effectiveSummaryFontMode;
    const shouldResync =
      Math.abs(preferredFontScale - currentFontScale) >= 0.01 &&
      Math.abs(preferredFontScale - Number(HOST_STATE.lastAppliedFontScale || 0)) >= 0.01;
    const shouldResyncFontMode =
      preferredFontMode !== currentFontMode &&
      preferredFontMode !== normalizeFontMode(HOST_STATE.lastAppliedFontMode);
    if (shouldResync) {
      HOST_STATE.fontScaleSynced = true;
      HOST_STATE.lastAppliedFontScale = preferredFontScale;
      window.setTimeout(() => {
        invokeBridge("setFontScale", preferredFontScale).catch(() => {
          HOST_STATE.fontScaleSynced = false;
          HOST_STATE.lastAppliedFontScale = 0;
        });
      }, 0);
    } else if (!HOST_STATE.fontScaleSynced) {
      HOST_STATE.fontScaleSynced = true;
    }
    if (shouldResyncFontMode) {
      HOST_STATE.fontModeSynced = true;
      HOST_STATE.lastAppliedFontMode = preferredFontMode;
      window.setTimeout(() => {
        invokeBridge("setFontMode", preferredFontMode).catch(() => {
          HOST_STATE.fontModeSynced = false;
          HOST_STATE.lastAppliedFontMode = "sans";
        });
      }, 0);
    } else if (!HOST_STATE.fontModeSynced) {
      HOST_STATE.fontModeSynced = true;
      HOST_STATE.lastAppliedFontMode = currentFontMode;
    }
  }
  setTitle(summary);
  renderStatus(summary);
  setMenuBookMeta(summary);
  renderToc(summary);
  renderNotes(summary);
  renderBookmarks(summary);
  updatePageCounter(summary);
  updateNavButtons(summary);
  updateSearchControls(summary);
  applyTheme(summary);
  syncTopControls();
  updateTypographyControl(summary);
  updateBookmarkControl(summary);
  buildEngineBadge();
  const selectionSignature =
    summary.selectionActive && Number(summary.selectedChars || 0) > 0
      ? summary.selectionBounds
        ? [
            Number(summary.selectionBounds.left || 0).toFixed(1),
            Number(summary.selectionBounds.top || 0).toFixed(1),
            Number(summary.selectionBounds.right || 0).toFixed(1),
            Number(summary.selectionBounds.bottom || 0).toFixed(1),
            Number(summary.selectedChars || 0)
          ].join(":")
        : `active:${Number(summary.selectedChars || 0)}:${String(summary.globalPageLabel || summary.pageLabel || "")}`
      : "";
  if (!selectionSignature) {
    HOST_STATE.lastSelectionSignature = "";
    HOST_STATE.selectionStableCount = 0;
  } else if (selectionSignature === HOST_STATE.lastSelectionSignature) {
    HOST_STATE.selectionStableCount += 1;
  } else {
    HOST_STATE.lastSelectionSignature = selectionSignature;
    HOST_STATE.selectionStableCount = 1;
  }
  const actionStatus = document.getElementById("protectedShellActionStatus");
  if (actionStatus) {
    actionStatus.textContent = summary.statusText || `Page ${summary.globalPageLabel || summary.pageLabel || "n/a"}`;
  }
  const toolbar = document.getElementById("selectionToolbar");
  const toolbarHidden = !toolbar || toolbar.classList.contains("hidden") || toolbar.getAttribute("aria-hidden") === "true";
  const pendingToolbar = HOST_STATE.pendingSelectionToolbar;
  const releaseAnchor = HOST_STATE.releaseSelectionToolbarAnchor;
  const stableEnough = HOST_STATE.selectionStableCount >= 1;
  const touchSelection = (() => {
    try {
      const win = getProtectedSurfaceWindow(HOST_STATE.frame);
      const next = win && win.__PROTECTED_TOUCH_SELECTION__ ? win.__PROTECTED_TOUCH_SELECTION__ : null;
      return next || { pending: false, active: false, claimed: false, selectionStarted: false };
    } catch (_error) {
      return { pending: false, active: false, claimed: false, selectionStarted: false };
    }
  })();
  if (
    toolbarHidden &&
    Date.now() >= Number(HOST_STATE.suppressSelectionToolbarUntil || 0) &&
    stableEnough &&
    selectionSignature &&
    (releaseAnchor || (Date.now() - Number(HOST_STATE.lastSelectionReleaseAt || 0) <= 2000)) &&
    !HOST_STATE.touchSelectionInProgress &&
    !touchSelection.pending &&
    !touchSelection.active &&
    !touchSelection.claimed
  ) {
    const pending = releaseAnchor || { x: 160, y: 160, source: "fallback" };
    HOST_STATE.pendingSelectionToolbar = null;
    HOST_STATE.releaseSelectionToolbarAnchor = null;
    HOST_STATE.lastSelectionReleaseAt = 0;
    scheduleSelectionToolbarFromSummary(HOST_STATE.frame, pending.x, pending.y);
  }
  const previewKey = getExpectedTurnPreviewKey(summary);
  if (previewKey !== HOST_STATE.lastTurnPreviewKey) {
    HOST_STATE.lastTurnPreviewKey = previewKey;
    if (!HOST_STATE.turnInFlight) {
      invalidateEmbeddedNeighborPreviewRoots();
      invalidateNeighborLayers();
      void prepareAndSyncNeighborPreviews().then(() => {
        ensureNeighborLayersMounted();
      });
    }
  } else {
    const stack = document.getElementById("viewerStack");
    const swiping = !!(stack && stack.classList.contains("swiping"));
    const hostHasNeighbors = getNeighborLayerCanvasCount("prev") > 0 || getNeighborLayerCanvasCount("next") > 0;
    if (!swiping) {
      if (!syncNeighborPreviewLayers({ requireFresh: true })) {
        syncNeighborPreviewLayers({ requireFresh: false });
        scheduleNeighborPreviewSync();
      }
      if (!hostHasNeighbors) {
        ensureNeighborLayersMounted();
      }
    }
  }
}

function emitShellReaderEvent(eventName, payload) {
  const hub = window.__READERPUB_READER_EVENTS__;
  if (!hub || typeof hub.emit !== "function") return;
  try {
    hub.emit(eventName, payload);
  } catch (_error) {}
}

function buildSummaryPatchFromCanonicalEvent(eventName, payload = {}) {
  switch (String(eventName || "")) {
    case "pageChanged":
      return {
        pageLabel: payload.pageLabel || "",
        globalPageLabel: payload.globalPageLabel || "",
        chapterLabel: payload.chapterLabel || "",
        canGoPrev: !!payload.canGoPrev,
        canGoNext: !!payload.canGoNext,
        statusText: payload.statusText || ""
      };
    case "selectionChanged":
      return {
        selectionActive: !!payload.active,
        selectedChars: Number(payload.selectedChars || 0),
        selectionBounds: payload.selectionBounds || null,
        focusedAnnotationId: payload.focusedAnnotationId || ""
      };
    case "searchStateChanged":
      return {
        searchSummary: {
          active: !!payload.active,
          query: payload.query || "",
          totalMatches: Number(payload.totalMatches || 0),
          currentMatch: Number(payload.currentMatch || 0),
          matchCount: Number(payload.matchCount || 0),
          matches: Array.isArray(payload.results) ? payload.results : []
        }
      };
    case "annotationsChanged":
      return {
        annotationCount: Number(payload.annotationCount || 0),
        focusedAnnotationId: payload.focusedAnnotationId || "",
        annotations: Array.isArray(payload.annotations) ? payload.annotations : []
      };
    case "themeChanged":
      return {
        theme: payload.theme === "dark" ? "dark" : "light",
        fontScale: Number(payload.fontScale || 1) || 1,
        fontMode: payload.fontMode || "sans",
        runtimeFontMode: payload.fontMode || "sans",
        supportedFontModes: Array.isArray(payload.supportedFontModes) ? payload.supportedFontModes : []
      };
    case "readingPositionChanged":
      return {
        restoreToken: payload.restoreToken || "",
        globalStartOffset: Number(payload.globalStartOffset || 0),
        pageGlobalStartOffset: Number(payload.pageGlobalStartOffset || 0),
        pageLabel: payload.pageLabel || "",
        globalPageLabel: payload.globalPageLabel || ""
      };
    case "toolbarStateChanged":
      return {
        selectionActive: !!payload.visible && !!(HOST_STATE.lastSummary && Number(HOST_STATE.lastSummary.selectedChars || 0) > 0)
      };
    default:
      return {};
  }
}

function applyCanonicalReaderEvent(eventName, payload = {}) {
  HOST_STATE.lastContractEventAt = Date.now();
  emitShellReaderEvent(eventName, payload);
  const current = HOST_STATE.lastSummary && typeof HOST_STATE.lastSummary === "object"
    ? HOST_STATE.lastSummary
    : { ready: true, hostBridgeMode: getHostBridgeMode() };
  const nextSummary = {
    ...current,
    ...buildSummaryPatchFromCanonicalEvent(eventName, payload)
  };
  updateFromSummary(nextSummary);
}

function getHostBridgeMode() {
  return "direct";
}

function getHostBridgeSurface(frame = HOST_STATE.frame) {
  try {
    const win = getProtectedSurfaceWindow(frame);
    if (!win) return null;
    return win.__PROTECTED_READER_HOST_BRIDGE__ || null;
  } catch (error) {
    return null;
  }
}

function getBridge() {
  return getHostBridgeSurface(HOST_STATE.frame);
}

function getProtectedRuntimeDebugSurface() {
  try {
    return window.__PROTECTED_READER_DEBUG__ || null;
  } catch (_error) {
    return null;
  }
}

function getProtectedRuntimeReadySummary(frame = HOST_STATE.frame) {
  const bridge = getHostBridgeSurface(frame);
  try {
    if (bridge && typeof bridge.getSummary === "function") {
      const summary = bridge.getSummary();
      if (summary) return summary;
    }
  } catch (_error) {}
  const debugSurface = getProtectedRuntimeDebugSurface();
  try {
    if (debugSurface && typeof debugSurface.getSummary === "function") {
      const summary = debugSurface.getSummary();
      if (summary) return summary;
    }
  } catch (_error) {}
  return null;
}

function getProtectedRuntimeStatusNode(frame = HOST_STATE.frame) {
  const root = frame && typeof frame.querySelector === "function" ? frame : document;
  if (!root || typeof root.querySelector !== "function") return null;
  return root.querySelector("#status");
}

function getDirectRuntimeBootState(frame = HOST_STATE.frame) {
  const statusNode = getProtectedRuntimeStatusNode(frame);
  const statusText = statusNode ? String(statusNode.textContent || "").trim() : "";
  const statusState = statusNode && statusNode.dataset ? String(statusNode.dataset.state || "").trim().toLowerCase() : "";
  const canvasCount = frame && typeof frame.querySelectorAll === "function"
    ? frame.querySelectorAll("canvas").length
    : 0;
  const summary = getProtectedRuntimeReadySummary(frame);
  return {
    summary,
    statusText,
    statusState,
    canvasCount,
    ready: !!(summary && summary.ready),
    progressKey: [
      statusState,
      statusText,
      canvasCount,
      summary && summary.pageLabel ? summary.pageLabel : "",
      summary && summary.globalPageLabel ? summary.globalPageLabel : "",
      summary && summary.chunkLabel ? summary.chunkLabel : "",
      summary && summary.bookId ? summary.bookId : ""
    ].join("|")
  };
}

function describeDirectRuntimeBootState(state) {
  if (!state || typeof state !== "object") return "";
  if (state.statusText) return state.statusText;
  if (state.summary && state.summary.pageLabel) return String(state.summary.pageLabel);
  if (state.summary && state.summary.chunkLabel) return String(state.summary.chunkLabel);
  if (state.canvasCount > 0) return `Canvas ready count: ${state.canvasCount}`;
  return "";
}

function clearHostEventSubscriptions() {
  const unsubscribers = Array.isArray(HOST_STATE.hostEventUnsubscribe) ? HOST_STATE.hostEventUnsubscribe : [];
  while (unsubscribers.length) {
    const unsubscribe = unsubscribers.pop();
    try {
      if (typeof unsubscribe === "function") unsubscribe();
    } catch (_error) {}
  }
  HOST_STATE.hostEventUnsubscribe = [];
}

function installCompatEventSubscriptions(frame = HOST_STATE.frame) {
  clearHostEventSubscriptions();
  const surface = getHostBridgeSurface(frame);
  if (!surface || typeof surface.subscribe !== "function") return false;
  const eventNames = [
    "pageChanged",
    "selectionChanged",
    "searchStateChanged",
    "annotationsChanged",
    "themeChanged",
    "readingPositionChanged",
    "toolbarStateChanged"
  ];
  for (const eventName of eventNames) {
    try {
      const unsubscribe = surface.subscribe(eventName, (payload) => {
        applyCanonicalReaderEvent(eventName, payload || {});
      });
      if (typeof unsubscribe === "function") HOST_STATE.hostEventUnsubscribe.push(unsubscribe);
    } catch (_error) {}
  }
  return true;
}

async function invokeBridge(method, ...args) {
  const bridge = getBridge();
  if (!bridge || typeof bridge[method] !== "function") {
    throw new Error(`Protected host bridge method unavailable: ${method}`);
  }
  const fastUiMethod = method === "setTheme";
  const generationMeta = allocateBridgeGeneration(method);
  const finalArgs = generationMeta.updateClass === "state-only"
    ? args
    : [...args, generationMeta];
  if (!fastUiMethod) setShellLoading(true);
  try {
    const result = await bridge[method](...finalArgs);
    updateFromSummary(result);
    return result;
  } finally {
    if (!fastUiMethod) {
      HOST_STATE.loadingCount = 0;
      setShellLoading(false);
    }
  }
}

async function invokeBridgeRaw(method, ...args) {
  const bridge = getBridge();
  if (!bridge || typeof bridge[method] !== "function") {
    throw new Error(`Protected host bridge method unavailable: ${method}`);
  }
  return bridge[method](...args);
}

function setHostTtsButtonState(active) {
  const button = document.getElementById("ttsToggleDesktop");
  if (!button) return;
  button.classList.toggle("is-speaking", !!active);
  button.setAttribute("aria-label", active ? "Stop reading aloud" : "Start reading aloud");
  button.setAttribute("title", active ? "Stop reading aloud" : "Read aloud");
}

function normalizeTtsLang(value) {
  const normalized = String(value || "").trim().replace(/_/g, "-").toLowerCase();
  if (!normalized) return "";
  const parts = normalized.split("-").filter(Boolean);
  if (!parts.length || !/^[a-z]{2,3}$/.test(parts[0])) return "";
  return parts
    .map((part, index) => {
      if (index === 0) return part;
      return /^[a-z0-9]{2,8}$/.test(part) ? part : "";
    })
    .filter(Boolean)
    .join("-");
}

function loadStoredHostTtsVoiceUri() {
  try {
    return String(localStorage.getItem(HOST_TTS_VOICE_URI_STORAGE_KEY) || "").trim();
  } catch (_error) {
    return "";
  }
}

function saveStoredHostTtsVoiceUri(value) {
  try {
    const next = String(value || "").trim();
    if (next) localStorage.setItem(HOST_TTS_VOICE_URI_STORAGE_KEY, next);
    else localStorage.removeItem(HOST_TTS_VOICE_URI_STORAGE_KEY);
  } catch (_error) {}
}

function loadStoredHostTtsVoiceUserSelected() {
  try {
    return localStorage.getItem(HOST_TTS_VOICE_USER_SELECTED_STORAGE_KEY) === "yes";
  } catch (_error) {
    return false;
  }
}

function saveStoredHostTtsVoiceUserSelected(value) {
  try {
    if (value) localStorage.setItem(HOST_TTS_VOICE_USER_SELECTED_STORAGE_KEY, "yes");
    else localStorage.removeItem(HOST_TTS_VOICE_USER_SELECTED_STORAGE_KEY);
  } catch (_error) {}
}

function loadStoredHostTtsLangUserSelected() {
  try {
    return localStorage.getItem(HOST_TTS_LANG_USER_SELECTED_STORAGE_KEY) === "yes";
  } catch (_error) {
    return false;
  }
}

function saveStoredHostTtsLangUserSelected(value) {
  try {
    if (value) localStorage.setItem(HOST_TTS_LANG_USER_SELECTED_STORAGE_KEY, "yes");
    else localStorage.removeItem(HOST_TTS_LANG_USER_SELECTED_STORAGE_KEY);
  } catch (_error) {}
}

function loadStoredHostTtsVoiceLang() {
  try {
    return normalizeTtsLang(localStorage.getItem(HOST_TTS_VOICE_LANG_STORAGE_KEY) || "");
  } catch (_error) {
    return "";
  }
}

function saveStoredHostTtsVoiceLang(value) {
  try {
    const next = normalizeTtsLang(value);
    if (next) localStorage.setItem(HOST_TTS_VOICE_LANG_STORAGE_KEY, next);
    else localStorage.removeItem(HOST_TTS_VOICE_LANG_STORAGE_KEY);
  } catch (_error) {}
}

async function getProtectedBookMetadataLanguages() {
  const summaryMetadataLanguages =
    HOST_STATE.lastSummary &&
    HOST_STATE.lastSummary.metadata &&
    Array.isArray(HOST_STATE.lastSummary.metadata.languages)
      ? HOST_STATE.lastSummary.metadata.languages.map((lang) => normalizeTtsLang(lang)).filter(Boolean)
      : [];
  if (summaryMetadataLanguages.length) {
    HOST_STATE.bookMetadataLanguages = Array.from(new Set(summaryMetadataLanguages));
    HOST_STATE.bookMetadataLanguagesBookId = String(getCurrentBookId() || "").trim();
    return HOST_STATE.bookMetadataLanguages;
  }
  const bookId = String(getCurrentBookId() || "").trim();
  if (
    bookId &&
    HOST_STATE.bookMetadataLanguagesBookId === bookId &&
    Array.isArray(HOST_STATE.bookMetadataLanguages)
  ) {
    return HOST_STATE.bookMetadataLanguages;
  }
  if (
    bookId &&
    HOST_STATE.bookMetadataLanguagesBookId === bookId &&
    HOST_STATE.bookMetadataLanguagesPromise
  ) {
    return HOST_STATE.bookMetadataLanguagesPromise;
  }
  if (!bookId) {
    return [];
  }
  const manifestUrl = new URL(`/reader_render_v5/artifacts/protected-bootstrap-books/${encodeURIComponent(bookId)}/manifest.json`, window.location.origin);
  HOST_STATE.bookMetadataLanguagesBookId = bookId;
  HOST_STATE.bookMetadataLanguagesPromise = fetch(manifestUrl.toString(), { credentials: "same-origin" })
    .then((response) => {
      if (!response.ok) return [];
      return response.json();
    })
    .then((payload) => {
      const langs = payload && payload.metadata && Array.isArray(payload.metadata.languages)
        ? payload.metadata.languages.map((lang) => normalizeTtsLang(lang)).filter(Boolean)
        : [];
      HOST_STATE.bookMetadataLanguages = Array.from(new Set(langs));
      return HOST_STATE.bookMetadataLanguages;
    })
    .catch(() => {
      HOST_STATE.bookMetadataLanguages = [];
      return HOST_STATE.bookMetadataLanguages;
    })
    .finally(() => {
      HOST_STATE.bookMetadataLanguagesPromise = null;
    });
  return HOST_STATE.bookMetadataLanguagesPromise;
}

function buildHostTtsLangLabel(tag) {
  const raw = String(tag || "").trim();
  if (!raw) return "";
  const normalized = normalizeTtsLang(raw);
  const [langCode = "", regionCodeRaw = ""] = normalized.split("-");
  const regionCode = regionCodeRaw.toUpperCase();
  try {
    if (typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function") {
      const langNames = new Intl.DisplayNames(["en"], { type: "language" });
      const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
      const langName = langCode ? langNames.of(langCode) : "";
      const regionName = regionCode ? regionNames.of(regionCode) : "";
      if (langName && regionName) return `${langName} (${regionName})`;
      if (langName) return langName;
    }
  } catch (_error) {}
  if (langCode && regionCode) return `${langCode} (${regionCode})`;
  return normalized;
}

function resolveHostTtsMetadataLang(metadataLanguages, availableLanguages) {
  const candidates = Array.isArray(metadataLanguages) ? metadataLanguages.map((lang) => normalizeTtsLang(lang)).filter(Boolean) : [];
  const available = Array.isArray(availableLanguages)
    ? availableLanguages.map((lang) => normalizeTtsLang(lang)).filter(Boolean)
    : [];
  for (const candidate of candidates) {
    if (available.includes(candidate)) return candidate;
    if (!candidate.includes("-")) {
      const prefixed = available.find((lang) => lang.startsWith(`${candidate}-`));
      if (prefixed) return candidate;
      continue;
    }
    const base = candidate.split("-")[0];
    const baseMatch = available.find((lang) => lang === base);
    if (baseMatch) return baseMatch;
    const sibling = available.find((lang) => lang.startsWith(`${base}-`));
    if (sibling) return sibling;
  }
  return "";
}

function scoreHostTtsVoice(voice, wantedLang = "") {
  if (!voice) return -1000;
  const voiceLang = normalizeTtsLang(voice.lang);
  const desiredLang = normalizeTtsLang(wantedLang);
  const desiredBase = desiredLang ? desiredLang.split("-")[0] : "";
  const voiceBase = voiceLang ? voiceLang.split("-")[0] : "";
  let score = 0;
  if (desiredLang && voiceLang === desiredLang) score += 200;
  else if (desiredBase && voiceBase === desiredBase) score += 130;
  else if (desiredLang) score -= 120;
  if (voice.default) score += 35;
  if (voice.localService) score += 25;
  const label = `${String(voice.name || "")} ${String(voice.voiceURI || "")}`.toLowerCase();
  if (/\bgoogle\b/.test(label)) score += 8;
  if (/\bnetwork\b|online|remote/.test(label)) score -= 35;
  return score;
}

function pickBestHostTtsVoiceForLang(voices, wantedLang = "") {
  const candidates = Array.isArray(voices) ? voices.filter(Boolean) : [];
  if (!candidates.length) return null;
  return candidates
    .slice()
    .sort((left, right) => {
      const scoreDiff = scoreHostTtsVoice(right, wantedLang) - scoreHostTtsVoice(left, wantedLang);
      if (scoreDiff !== 0) return scoreDiff;
      return String(left.name || "").localeCompare(String(right.name || ""), "en", { sensitivity: "base" });
    })[0] || null;
}

function resolveHostTtsFallbackLang(availableLanguages, voices) {
  const available = Array.isArray(availableLanguages)
    ? availableLanguages.map((lang) => normalizeTtsLang(lang)).filter(Boolean)
    : [];
  if (!available.length) return "";
  const browserLanguages = [];
  try {
    if (Array.isArray(navigator.languages)) browserLanguages.push(...navigator.languages);
    if (navigator.language) browserLanguages.push(navigator.language);
  } catch (_error) {}
  for (const rawLang of browserLanguages) {
    const lang = normalizeTtsLang(rawLang);
    if (!lang) continue;
    if (available.includes(lang)) return lang;
    const base = lang.split("-")[0];
    if (available.includes(base)) return base;
    const sibling = available.find((item) => item.startsWith(`${base}-`));
    if (sibling) return sibling;
  }
  const defaultVoice = Array.isArray(voices) ? voices.find((voice) => voice && voice.default && normalizeTtsLang(voice.lang)) : null;
  const defaultLang = normalizeTtsLang(defaultVoice && defaultVoice.lang);
  if (defaultLang) {
    if (available.includes(defaultLang)) return defaultLang;
    const base = defaultLang.split("-")[0];
    if (available.includes(base)) return base;
    const sibling = available.find((item) => item.startsWith(`${base}-`));
    if (sibling) return sibling;
  }
  if (available.includes("en")) return "en";
  const english = available.find((item) => item.startsWith("en-"));
  if (english) return english;
  return available[0] || "";
}

function closeHostTtsDropdowns() {
  document.querySelectorAll("#voiceLangDropdown, #voiceDropdown").forEach((root) => {
    root.classList.remove("is-open");
    const toggle = root.querySelector(".voice-picker-dropdown-toggle");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  });
}

function scrollHostTtsDropdownIntoView(dropdownEl) {
  const listEl = dropdownEl && dropdownEl.querySelector ? dropdownEl.querySelector(".voice-picker-dropdown-list") : null;
  const toggleEl = dropdownEl && dropdownEl.querySelector ? dropdownEl.querySelector(".voice-picker-dropdown-toggle") : null;
  const scrollEl = dropdownEl && dropdownEl.closest ? dropdownEl.closest(".overlay-scroll") : null;
  if (!listEl || !toggleEl || !scrollEl) return;
  try {
    listEl.style.maxHeight = "";
    const listRect = listEl.getBoundingClientRect();
    const scrollRect = scrollEl.getBoundingClientRect();
    const bottomOverflow = listRect.bottom - scrollRect.bottom;
    if (bottomOverflow > 0) {
      scrollEl.scrollTop = Number(scrollEl.scrollTop || 0) + bottomOverflow + 8;
    }
    const topOverflow = scrollRect.top - listRect.top;
    if (topOverflow > 0) {
      scrollEl.scrollTop = Math.max(0, Number(scrollEl.scrollTop || 0) - topOverflow - 8);
    }
    requestAnimationFrame(() => {
      try {
        const nextListRect = listEl.getBoundingClientRect();
        const nextScrollRect = scrollEl.getBoundingClientRect();
        const availableHeight = Math.floor(nextScrollRect.bottom - nextListRect.top - 8);
        const maxHeight = Math.max(72, Math.min(220, availableHeight));
        listEl.style.maxHeight = `${maxHeight}px`;
      } catch (_error) {}
    });
  } catch (_error) {}
}

function syncHostTtsDropdown(selectEl, dropdownEl, toggleEl, listEl) {
  if (!selectEl || !dropdownEl || !toggleEl || !listEl) return;
  listEl.replaceChildren();
  const options = Array.from(selectEl.options || []);
  const shouldSuppressDropdownSelection = (button) => {
    const now = Date.now();
    const overlay = button && button.closest
      ? button.closest("#overlay-settings, #overlay-library, #overlay-search")
      : null;
    const overlayScrolledUntil = Number(overlay && overlay.dataset ? overlay.dataset.protectedTouchScrolledUntil || 0 : 0);
    const dropdownSuppressUntil = Number(dropdownEl && dropdownEl.dataset ? dropdownEl.dataset.suppressSelectionUntil || 0 : 0);
    return now < overlayScrolledUntil || now < dropdownSuppressUntil;
  };
  const suppressDropdownSelection = () => {
    if (dropdownEl && dropdownEl.dataset) {
      dropdownEl.dataset.suppressSelectionUntil = String(Date.now() + 650);
    }
  };
  const selectOptionValue = (nextValue) => {
    if (selectEl.value !== nextValue) {
      selectEl.value = nextValue;
      selectEl.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      syncHostTtsDropdown(selectEl, dropdownEl, toggleEl, listEl);
    }
    closeHostTtsDropdowns();
  };
  options.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `voice-picker-option${option.selected ? " is-selected" : ""}`;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", option.selected ? "true" : "false");
    button.dataset.value = String(option.value || "");
    button.textContent = String(option.textContent || "").trim();
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartScrollTop = 0;
    let touchMoved = false;
    button.addEventListener("touchstart", (event) => {
      const touch = event.touches && event.touches[0] ? event.touches[0] : null;
      touchStartX = touch ? Number(touch.clientX || 0) : 0;
      touchStartY = touch ? Number(touch.clientY || 0) : 0;
      touchStartScrollTop = Number(listEl.scrollTop || 0);
      touchMoved = false;
    }, { capture: true, passive: true });
    button.addEventListener("touchmove", (event) => {
      const touch = event.touches && event.touches[0] ? event.touches[0] : null;
      if (touch && (
        Math.abs(Number(touch.clientY || 0) - touchStartY) > 6 ||
        Math.abs(Number(touch.clientX || 0) - touchStartX) > 6
      )) {
        touchMoved = true;
        suppressDropdownSelection();
      }
    }, { capture: true, passive: true });
    button.addEventListener("touchend", (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation && event.stopImmediatePropagation();
      const listScrolled = Math.abs(Number(listEl.scrollTop || 0) - touchStartScrollTop) > 1;
      if (touchMoved || listScrolled || shouldSuppressDropdownSelection(button)) {
        suppressDropdownSelection();
        return;
      }
      selectOptionValue(String(button.dataset.value || ""));
    }, { capture: true, passive: false });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation && event.stopImmediatePropagation();
      if (shouldSuppressDropdownSelection(button)) return;
      selectOptionValue(String(button.dataset.value || ""));
    }, true);
    listEl.append(button);
  });
  const selectedOption = selectEl.options && selectEl.selectedIndex >= 0 ? selectEl.options[selectEl.selectedIndex] : null;
  toggleEl.textContent = selectedOption ? String(selectedOption.textContent || "").trim() : "";
}

function bindHostTtsDropdown(dropdownEl, toggleEl) {
  if (!dropdownEl || !toggleEl || dropdownEl.dataset.hostBound === "yes") return;
  dropdownEl.dataset.hostBound = "yes";
  bindPrimaryAction(toggleEl, () => {
    const open = dropdownEl.classList.contains("is-open");
    closeHostTtsDropdowns();
    if (!open) {
      dropdownEl.classList.add("is-open");
      toggleEl.setAttribute("aria-expanded", "true");
      requestAnimationFrame(() => scrollHostTtsDropdownIntoView(dropdownEl));
    }
  }, { touchOnly: false });
}

async function refreshHostTtsVoicePicker({ preserveVoice = true } = {}) {
  const synth = window.speechSynthesis || null;
  const voiceLangSelect = document.getElementById("voiceLangSelect");
  const voiceLangDropdown = document.getElementById("voiceLangDropdown");
  const voiceLangToggle = document.getElementById("voiceLangToggle");
  const voiceLangList = document.getElementById("voiceLangList");
  const voiceSelect = document.getElementById("voiceSelect");
  const voiceDropdown = document.getElementById("voiceDropdown");
  const voiceToggle = document.getElementById("voiceToggle");
  const voiceList = document.getElementById("voiceList");
  const voiceStatus = document.getElementById("voiceStatus");
  if (!voiceLangSelect || !voiceSelect || !voiceLangDropdown || !voiceDropdown || !voiceLangToggle || !voiceToggle || !voiceLangList || !voiceList) return;

  bindHostTtsDropdown(voiceLangDropdown, voiceLangToggle);
  bindHostTtsDropdown(voiceDropdown, voiceToggle);
  if (!document.body.dataset.hostTtsDismissBound) {
    document.body.dataset.hostTtsDismissBound = "yes";
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (target && target.closest && target.closest("#voiceLangDropdown, #voiceDropdown")) return;
      closeHostTtsDropdowns();
    }, true);
  }
  if (!voiceLangSelect.dataset.hostBound) {
    voiceLangSelect.dataset.hostBound = "yes";
    voiceLangSelect.addEventListener("change", () => {
      voiceLangSelect.dataset.userSelected = "yes";
      voiceLangSelect.dataset.userSelectedBookId = String(getCurrentBookId() || "");
      saveStoredHostTtsVoiceLang(voiceLangSelect.value || "");
      saveStoredHostTtsLangUserSelected(true);
      saveStoredHostTtsVoiceUri("");
      saveStoredHostTtsVoiceUserSelected(false);
      void refreshHostTtsVoicePicker({ preserveVoice: false });
    });
  }
  if (!voiceSelect.dataset.hostBound) {
    voiceSelect.dataset.hostBound = "yes";
    voiceSelect.addEventListener("change", () => {
      voiceSelect.dataset.userSelected = "yes";
      saveStoredHostTtsVoiceUri(voiceSelect.value || "");
      saveStoredHostTtsVoiceUserSelected(true);
      syncHostTtsDropdown(voiceSelect, voiceDropdown, voiceToggle, voiceList);
    });
  }
  if (synth && !document.body.dataset.hostTtsVoicesChangedBound) {
    document.body.dataset.hostTtsVoicesChangedBound = "yes";
    try {
      synth.addEventListener("voiceschanged", () => {
        void refreshHostTtsVoicePicker();
      });
    } catch (_error) {
      try {
        synth.onvoiceschanged = () => {
          void refreshHostTtsVoicePicker();
        };
      } catch (_error2) {}
    }
  }

  const voices = await getHostTtsVoices(synth);
  const metadataLanguages = await getProtectedBookMetadataLanguages();
  const normalizedVoices = Array.isArray(voices) ? voices.filter(Boolean) : [];
  const currentLang = normalizeTtsLang(voiceLangSelect.value || loadStoredHostTtsVoiceLang());
  const currentVoiceUri = String(voiceSelect.value || loadStoredHostTtsVoiceUri()).trim();
  const userSelectedVoice = voiceSelect.dataset.userSelected === "yes" || loadStoredHostTtsVoiceUserSelected();
  const userSelectedStoredLang = loadStoredHostTtsLangUserSelected();

  if (!normalizedVoices.length) {
    voiceLangSelect.innerHTML = "";
    voiceSelect.innerHTML = "";
    syncHostTtsDropdown(voiceLangSelect, voiceLangDropdown, voiceLangToggle, voiceLangList);
    syncHostTtsDropdown(voiceSelect, voiceDropdown, voiceToggle, voiceList);
    if (voiceStatus) voiceStatus.textContent = "No system voices found. Install a voice in your device settings.";
    return;
  }

  const langs = Array.from(new Map(
    normalizedVoices
      .map((voice) => normalizeTtsLang(voice.lang))
      .filter(Boolean)
      .map((lang) => [lang, lang])
  ).values()).sort((a, b) => buildHostTtsLangLabel(a).localeCompare(buildHostTtsLangLabel(b), "en", { sensitivity: "base" }));
  const metadataLang = resolveHostTtsMetadataLang(metadataLanguages, langs);
  const orderedLangs = metadataLang
    ? [metadataLang, ...langs.filter((lang) => lang !== metadataLang)]
    : langs;
  const currentBookId = String(getCurrentBookId() || "");
  const userSelectedBookId = String(voiceLangSelect.dataset.userSelectedBookId || "");
  const userSelectedLang =
    (voiceLangSelect.dataset.userSelected === "yes" && (!currentBookId || currentBookId === userSelectedBookId)) ||
    userSelectedStoredLang;
  const fallbackLang = resolveHostTtsFallbackLang(orderedLangs, normalizedVoices);
  const selectedLang = userSelectedLang && orderedLangs.includes(currentLang)
    ? currentLang
    : (metadataLang || fallbackLang || "");
  voiceLangSelect.innerHTML = "";
  orderedLangs.forEach((lang) => {
    const option = document.createElement("option");
    option.value = lang;
    option.textContent = buildHostTtsLangLabel(lang);
    option.selected = lang === selectedLang;
    voiceLangSelect.append(option);
  });
  if (selectedLang) saveStoredHostTtsVoiceLang(selectedLang);

  const filteredVoices = normalizedVoices
    .filter((voice) => {
      if (!selectedLang) return true;
      const voiceLang = normalizeTtsLang(voice.lang);
      if (voiceLang === selectedLang) return true;
      if (!selectedLang.includes("-")) {
        return voiceLang.startsWith(`${selectedLang}-`);
      }
      return false;
    })
    .sort((left, right) => {
      const byName = String(left.name || "").localeCompare(String(right.name || ""), "en", { sensitivity: "base" });
      if (byName !== 0) return byName;
      return String(left.voiceURI || "").localeCompare(String(right.voiceURI || ""), "en", { sensitivity: "base" });
    });
  const bestVoice = pickBestHostTtsVoiceForLang(filteredVoices, selectedLang);
  const selectedVoiceUri = preserveVoice && userSelectedVoice && filteredVoices.some((voice) => String(voice.voiceURI || "") === currentVoiceUri)
    ? currentVoiceUri
    : String((bestVoice && bestVoice.voiceURI) || (filteredVoices[0] && filteredVoices[0].voiceURI) || "");
  voiceSelect.innerHTML = "";
  filteredVoices.forEach((voice) => {
    const option = document.createElement("option");
    option.value = String(voice.voiceURI || "");
    option.textContent = `${String(voice.name || "Voice")}${voice.lang ? ` (${voice.lang})` : ""}`;
    option.selected = option.value === selectedVoiceUri;
    voiceSelect.append(option);
  });
  if (userSelectedVoice) saveStoredHostTtsVoiceUri(selectedVoiceUri);
  syncHostTtsDropdown(voiceLangSelect, voiceLangDropdown, voiceLangToggle, voiceLangList);
  syncHostTtsDropdown(voiceSelect, voiceDropdown, voiceToggle, voiceList);
  if (voiceStatus) voiceStatus.textContent = "Select a voice for reading aloud.";
}

function pickHostTtsVoice(voices, payload = null) {
  if (!Array.isArray(voices) || !voices.length) return null;
  const voiceSelect = document.getElementById("voiceSelect");
  const selectedVoiceUri = voiceSelect ? String(voiceSelect.value || "").trim() : "";
  const userSelectedVoice = voiceSelect && (voiceSelect.dataset.userSelected === "yes" || loadStoredHostTtsVoiceUserSelected());
  if (selectedVoiceUri && userSelectedVoice) {
    const exact = voices.find((voice) => voice && String(voice.voiceURI || "") === selectedVoiceUri) || null;
    if (exact) return exact;
  }
  const voiceLangSelect = document.getElementById("voiceLangSelect");
  const selectedLang = normalizeTtsLang(voiceLangSelect ? voiceLangSelect.value : "");
  const payloadLang = normalizeTtsLang(payload && payload.lang ? payload.lang : "");
  const wantedLang = selectedLang || payloadLang;
  if (wantedLang) {
    const best = pickBestHostTtsVoiceForLang(voices, wantedLang);
    if (best) return best;
  }
  return pickBestHostTtsVoiceForLang(voices, "") || voices[0] || null;
}

async function getHostTtsVoices(synth) {
  if (!synth || typeof synth.getVoices !== "function") return [];
  let voices = synth.getVoices() || [];
  if (voices.length) return voices;
  voices = await new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        synth.removeEventListener && synth.removeEventListener("voiceschanged", handleVoicesChanged);
      } catch (_error) {}
      window.clearTimeout(timeoutId);
      resolve((synth.getVoices && synth.getVoices()) || []);
    };
    const handleVoicesChanged = () => finish();
    try {
      synth.addEventListener && synth.addEventListener("voiceschanged", handleVoicesChanged, { once: true });
    } catch (_error) {}
    const timeoutId = window.setTimeout(finish, 800);
  });
  return Array.isArray(voices) ? voices : [];
}

function buildHostTtsSegments(text) {
  const source = String(text || "").trim();
  if (!source) return [];
  const segments = [];
  let cursor = 0;
  const maxLength = 220;
  while (cursor < source.length) {
    let end = Math.min(source.length, cursor + maxLength);
    if (end < source.length) {
      const slice = source.slice(cursor, end);
      const punctuation = slice.match(/[\.\!\?;:]\s+[^\.\!\?;:]*$/);
      if (punctuation && punctuation.index > 24) end = cursor + punctuation.index + 1;
    }
    if (end <= cursor) end = Math.min(source.length, cursor + maxLength);
    const segmentText = source.slice(cursor, end).trim();
    if (segmentText) segments.push(segmentText);
    cursor = end;
  }
  return segments.length ? segments : [source];
}

function stopHostTts() {
  HOST_STATE.tts.token += 1;
  HOST_STATE.tts.active = false;
  setHostTtsButtonState(false);
  try {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  } catch (_error) {}
}

async function speakProtectedReadAloudPage({ continueFromNextPage = false } = {}) {
  if (!HOST_STATE.tts.active) return;
  const token = HOST_STATE.tts.token;
  const synth = window.speechSynthesis || null;
  const Utterance = window.SpeechSynthesisUtterance || null;
  if (!synth || !Utterance) {
    stopHostTts();
    setHostActionStatus("Read aloud is unavailable in this browser.");
    return;
  }
  let payload = null;
  try {
    payload = await invokeBridgeRaw("getReadAloudPayload");
  } catch (_error) {
    payload = null;
  }
  if (!HOST_STATE.tts.active || token !== HOST_STATE.tts.token) return;
  const text = String(payload && payload.text ? payload.text : "").trim();
  if (!text) {
    stopHostTts();
    setHostActionStatus("Nothing to read on this page.");
    return;
  }
  const segments = buildHostTtsSegments(text);
  const voices = await getHostTtsVoices(synth);
  if (!HOST_STATE.tts.active || token !== HOST_STATE.tts.token) return;
  const selectedVoice = pickHostTtsVoice(voices, payload);
  let index = 0;
  setHostTtsButtonState(true);

  const speakNextSegment = (retryWithoutVoice = false) => {
    if (!HOST_STATE.tts.active || token !== HOST_STATE.tts.token) return;
    if (index >= segments.length) {
      const summary = HOST_STATE.lastSummary;
      if (continueFromNextPage && summary && summary.canGoNext) {
        Promise.resolve(invokeBridgeRaw("nextPage"))
          .then((nextSummary) => {
            if (nextSummary) updateFromSummary(nextSummary);
            if (!HOST_STATE.tts.active || token !== HOST_STATE.tts.token) return;
            window.setTimeout(() => {
              void speakProtectedReadAloudPage({ continueFromNextPage: true });
            }, 120);
          })
          .catch(() => {
            stopHostTts();
          });
        return;
      }
      stopHostTts();
      return;
    }
    const utterance = new Utterance(segments[index]);
    utterance.volume = 1;
    utterance.rate = 1;
    utterance.pitch = 1;
    if (selectedVoice && !retryWithoutVoice) {
      utterance.voice = selectedVoice;
      if (selectedVoice.lang) utterance.lang = selectedVoice.lang;
    } else if (payload && payload.lang) {
      utterance.lang = payload.lang;
    }
    utterance.onend = () => {
      if (!HOST_STATE.tts.active || token !== HOST_STATE.tts.token) return;
      index += 1;
      speakNextSegment();
    };
    utterance.onerror = () => {
      if (selectedVoice && !retryWithoutVoice) {
        try {
          synth.cancel();
        } catch (_error) {}
        window.setTimeout(() => {
          if (!HOST_STATE.tts.active || token !== HOST_STATE.tts.token) return;
          speakNextSegment(true);
        }, 80);
        return;
      }
      stopHostTts();
    };
    try {
      synth.speak(utterance);
    } catch (_error) {
      stopHostTts();
    }
  };

  try {
    synth.cancel();
  } catch (_error) {}
  speakNextSegment();
}

async function toggleHostTts() {
  if (HOST_STATE.tts.active) {
    stopHostTts();
    return;
  }
  HOST_STATE.tts.token += 1;
  HOST_STATE.tts.active = true;
  setHostTtsButtonState(true);
  await speakProtectedReadAloudPage({ continueFromNextPage: true });
}

function ensureActionBar() {
  if (!isDevPanelEnabled()) return null;
  let bar = document.getElementById("protectedShellActionBar");
  if (bar) return bar;
  bar = document.createElement("div");
  bar.id = "protectedShellActionBar";
  bar.innerHTML = `
    <button type="button" id="protectedShellPrevPage">Prev</button>
    <button type="button" id="protectedShellNextPage">Next</button>
    <button type="button" id="protectedShellCopySelection">Copy</button>
    <button type="button" id="protectedShellCreateHighlight">Highlight</button>
    <input id="protectedShellNoteInput" type="text" placeholder="Note text" />
    <button type="button" id="protectedShellAddNote">Add note</button>
    <button type="button" id="protectedShellOpenNotes">Notes</button>
    <span id="protectedShellActionStatus" class="status">Protected engine booting…</span>
  `;
  document.body.append(bar);
  document.getElementById("protectedShellPrevPage").addEventListener("click", () => invokeBridge("prevPage"));
  document.getElementById("protectedShellNextPage").addEventListener("click", () => invokeBridge("nextPage"));
  document.getElementById("protectedShellCopySelection").addEventListener("click", () => invokeBridge("copySelection"));
  document.getElementById("protectedShellCreateHighlight").addEventListener("click", () => invokeBridge("createHighlight"));
  document.getElementById("protectedShellAddNote").addEventListener("click", () => {
    const input = document.getElementById("protectedShellNoteInput");
    return invokeBridge("addNoteToSelection", input ? input.value : "");
  });
  document.getElementById("protectedShellOpenNotes").addEventListener("click", openProtectedNotesPanel);
  return bar;
}

async function ensurePageTurnPreviewsReady() {
  if (syncNeighborPreviewLayers({ requireFresh: true })) return true;
  return prepareAndSyncNeighborPreviews();
}

function beginPageTurnPreview() {
  return beginPageTurnPreviewFromCanvases(cloneProtectedCanvases());
}

function beginPageTurnPreviewFromCanvases(liveCanvases) {
  const currentLayer = getCurrentTurnLayer();
  const currentSurface = getCurrentTurnSurface();
  const frame = HOST_STATE.frame;
  if (!currentLayer || !currentSurface || !frame || !liveCanvases.length) return false;
  currentLayer.replaceChildren(buildTurnLayer(liveCanvases));
  currentLayer.style.visibility = "visible";
  currentLayer.style.opacity = "1";
  currentLayer.style.transition = "none";
  currentLayer.style.transform = "translate3d(0px, 0, 0)";
  currentSurface.style.transition = "none";
  currentSurface.style.transform = "translate3d(0px, 0, 0)";
  frame.style.pointerEvents = "none";
  frame.style.opacity = "0";
  frame.style.visibility = "hidden";
  return true;
}

function clearTurnOverlayOnly() {
  const stack = document.getElementById("viewerStack");
  const shadow = document.getElementById("swipe-shadow");
  if (stack) {
    stack.classList.remove("shadow-left", "shadow-right");
    stack.classList.add("swipe-undim");
  }
  if (shadow) {
    shadow.style.left = "";
    shadow.style.transition = "";
  }
  document.documentElement.classList.remove("fb-swipe-margins", "fb-swipe-underlay-left", "fb-swipe-underlay-right");
  setSwipeOverlayAlpha(0);
}

function animatePageTurnTo(fromDx, toDx, durationMs = 280) {
  const currentLayer = getCurrentTurnLayer();
  const currentSurface = getCurrentTurnSurface();
  const stack = document.getElementById("viewerStack");
  const shadow = document.getElementById("swipe-shadow");
  if (!currentLayer || !currentSurface || !stack) return;
  const width = Math.max(1, stack.getBoundingClientRect().width || window.innerWidth || 1);
  const startDx = Number(fromDx) || 0;
  const targetDx = Number(toDx) || 0;
  let overlayRaf = 0;
  const stopOverlayAnim = () => {
    try {
      if (!overlayRaf) return;
      (window.cancelAnimationFrame || window.clearTimeout)(overlayRaf);
      overlayRaf = 0;
    } catch (_error) {}
  };
  const animateOverlay = (from, to) => {
    stopOverlayAnim();
    let startedAt = null;
    const rafFn = window.requestAnimationFrame
      ? window.requestAnimationFrame.bind(window)
      : (cb) => window.setTimeout(() => cb(Date.now()), 16);
    const step = (ts) => {
      if (startedAt === null) startedAt = ts;
      const progress = durationMs <= 0 ? 1 : Math.min(1, Math.max(0, (ts - startedAt) / durationMs));
      const currentDx = from + ((to - from) * progress);
      updateSwipeOverlayAlpha(currentDx, width);
      if (progress < 1 && HOST_STATE.turnInFlight) {
        overlayRaf = rafFn(step);
        return;
      }
      overlayRaf = 0;
      setSwipeOverlayAlpha(0);
    };
    overlayRaf = rafFn(step);
  };
  currentSurface.style.transition = `transform ${durationMs}ms ease-out`;
  currentSurface.style.transform = `translate3d(${Math.round(startDx)}px, 0, 0)`;
  if (shadow) {
    try {
      const shadowWidth = Math.max(6, shadow.getBoundingClientRect().width || 6);
      shadow.style.transition = `left ${durationMs}ms ease-out`;
      shadow.style.left = targetDx > 0
        ? "0px"
        : `${Math.max(0, width - shadowWidth)}px`;
    } catch (_error) {}
  }
  window.requestAnimationFrame(() => {
    currentSurface.style.transform = `translate3d(${Math.round(targetDx)}px, 0, 0)`;
    animateOverlay(startDx, targetDx);
  });
}

async function performPageTurn(direction, options = {}) {
  if (!canNavigateDirection(direction)) {
    window.__protectedTurnDebug = {
      ...(window.__protectedTurnDebug || {}),
      blockedAt: Date.now(),
      blockedDirection: direction,
      stage: "blocked-boundary"
    };
    return;
  }
  const reuseExistingPreview = !!options.reuseExistingPreview;
  const startingDx = Number(options.startDx || 0);
  if (HOST_STATE.turnInFlight) {
    window.__protectedTurnDebug = {
      ...(window.__protectedTurnDebug || {}),
      blockedAt: Date.now(),
      blockedDirection: direction,
      stage: "blocked-turn-in-flight"
    };
    return;
  }
  HOST_STATE.turnInFlight = true;
  window.__protectedTurnDebug = {
    count: Number((window.__protectedTurnDebug && window.__protectedTurnDebug.count) || 0) + 1,
    direction,
    startedAt: Date.now(),
    stage: "prepare-start"
  };
  let neighborsReady = syncNeighborPreviewLayers({ requireFresh: true, direction });
  if (!neighborsReady) {
    neighborsReady = await prepareAndSyncNeighborPreviews(direction);
  }
  window.__protectedTurnDebug.stage = neighborsReady ? "prepare-done" : "prepare-background";
  let prepared = false;
  if (reuseExistingPreview) {
    const currentLayer = getCurrentTurnLayer();
    prepared = !!(
      currentLayer &&
      currentLayer.style.visibility !== "hidden" &&
      currentLayer.querySelector("canvas")
    );
    if (!prepared) {
      prepared = beginPageTurnPreview();
    }
  } else {
    prepared = beginPageTurnPreview();
  }
  window.__protectedTurnDebug.prepared = prepared;
  window.__protectedTurnDebug.currentCanvasCount = document.getElementById("protectedOldShellCurrentLayer")
    ? document.getElementById("protectedOldShellCurrentLayer").querySelectorAll("canvas").length
    : 0;
  const stack = document.getElementById("viewerStack");
  const width = Math.max(1, stack ? stack.getBoundingClientRect().width || window.innerWidth || 1 : (window.innerWidth || 1));
  const targetDx = direction === "prev" ? width : -width;
  const turnDurationMs = 280;
  let nextSummary = null;
  const animationPromise = new Promise((resolve) => {
    if (!prepared) {
      window.__protectedTurnDebug.stage = "prepare-failed";
      Promise.resolve(invokeBridgeRaw(direction === "prev" ? "prevPage" : "nextPage"))
        .then((result) => {
          nextSummary = result || null;
          if (nextSummary) updateFromSummary(nextSummary);
        })
        .catch(() => {})
        .finally(resolve);
      return;
    }
    window.__protectedTurnDebug.stage = "animating";
    updatePageTurnPresentation(startingDx || (direction === "prev" ? 1 : -1));
    animatePageTurnTo(startingDx, targetDx, turnDurationMs);
    HOST_STATE.turnCleanupTimer = window.setTimeout(async () => {
      clearTurnOverlayOnly();
      try {
        const result = await invokeBridgeRaw(direction === "prev" ? "prevPage" : "nextPage");
        nextSummary = result || null;
        if (nextSummary) updateFromSummary(nextSummary);
      } catch (_error) {}
      resolve();
    }, turnDurationMs);
  });
  try {
    await animationPromise;
    settleTurnPreview(direction);
    if (nextSummary) {
      await waitForLivePageToSettle(nextSummary);
    }
    clearPageTurnPreview({ clearNeighbors: false });
  } finally {
    window.__protectedTurnDebug.stage = "cleanup";
    HOST_STATE.turnInFlight = false;
    window.__protectedTurnDebug.finishedAt = Date.now();
    window.__protectedTurnDebug.turnInFlight = false;
    if (nextSummary) {
      HOST_STATE.lastTurnPreviewKey = getExpectedTurnPreviewKey(nextSummary);
      invalidateNeighborLayers();
      void prepareAndSyncNeighborPreviews()
        .then((refreshed) => {
          if (refreshed) {
            syncNeighborPreviewLayers({ requireFresh: true });
            ensureNeighborLayersMounted();
          } else {
            scheduleNeighborPreviewSync();
          }
        })
        .catch(() => {
          scheduleNeighborPreviewSync();
        });
    }
  }
}

function overlaysVisible() {
  const typography = document.getElementById("protectedTypographyControl");
  if (typography && typography.classList.contains("is-open")) return true;
  const library = document.getElementById("protectedLibraryControl");
  if (library && library.classList.contains("is-open")) return true;
  const search = document.getElementById("protectedSearchControl");
  if (search && search.classList.contains("is-open")) return true;
  return ["overlay-search", "overlay-settings", "overlay-library", "commentSheet"]
    .some((id) => {
      const node = document.getElementById(id);
      return !!(node && !node.classList.contains("hidden"));
    });
}

function isProtectedOverlayEventTarget(target) {
  return !!(
    target &&
    target.closest &&
    target.closest(
      "#overlay-settings, #overlay-library, #overlay-search, #commentSheet, #protectedImageViewer, #protectedFootnoteModal, #selectionToolbar"
    )
  );
}

function isTouchPortraitShellMode() {
  try {
    const root = document.documentElement;
    const touchClass = !!(root && (root.classList.contains("is-phone") || root.classList.contains("is-tablet")));
    if (!touchClass) return false;
    if (window.matchMedia) {
      return window.matchMedia("(orientation: portrait)").matches;
    }
  } catch (_error) {}
  return window.innerHeight >= window.innerWidth;
}

function enforcePortraitLegacySidebarDisabled() {
  if (!isTouchPortraitShellMode()) return;
  const backdrop = document.getElementById("overlay-backdrop");
  if (backdrop && !overlaysVisible()) {
    backdrop.classList.add("hidden");
    backdrop.setAttribute("aria-hidden", "true");
  }
}

function installTouchSwipe(target) {
  if (!target || target.__protectedSwipeBound) return;
  target.__protectedSwipeBound = true;
  let gesture = null;
  window.__protectedTouchDebug = window.__protectedTouchDebug || {};

  function getTouchSelectionState() {
    try {
      const win = target.defaultView || getProtectedSurfaceWindow(HOST_STATE.frame) || null;
      const state = win && win.__PROTECTED_TOUCH_SELECTION__ ? win.__PROTECTED_TOUCH_SELECTION__ : null;
      return state || { pending: false, active: false, claimed: false, selectionStarted: false };
    } catch (_error) {
      return { pending: false, active: false, claimed: false, selectionStarted: false };
    }
  }

  function setFramePointerEventsDisabled(disabled) {
    if (!HOST_STATE.frame) return;
    HOST_STATE.frame.style.pointerEvents = disabled ? "none" : "auto";
  }

  function getTouchZoneBounds() {
    const fallback = {
      left: 0,
      width: Math.max(
        Number(window.innerWidth || 0),
        Number((document.documentElement && document.documentElement.clientWidth) || 0),
        Number((window.visualViewport && window.visualViewport.width) || 0),
        0
      )
    };
    const host = document.getElementById("protectedOldShellHost");
    const frame = HOST_STATE.frame;
    const candidate =
      (frame && typeof frame.getBoundingClientRect === "function" && frame.getBoundingClientRect()) ||
      (host && typeof host.getBoundingClientRect === "function" && host.getBoundingClientRect()) ||
      null;
    const left = candidate && Number.isFinite(candidate.left) ? Number(candidate.left) : fallback.left;
    const width = candidate && Number.isFinite(candidate.width) && candidate.width > 0
      ? Number(candidate.width)
      : fallback.width;
    return { left, width };
  }

  function scheduleTouchRevealActivation(direction) {
    if (!canNavigateDirection(direction)) return;
    if (!gesture || Math.abs(gesture.dx || 0) <= 24) return;
    if (gesture.activationTimer) return;
    gesture.activationTimer = window.setTimeout(() => {
      if (!gesture) return;
      gesture.activationTimer = null;
      syncNeighborPreviewLayers({ requireFresh: !!gesture.prepared, direction });
      const hasNeighborLayer = hasFreshNeighborLayer(direction);
      if (!gesture.previewVisible && hasNeighborLayer) {
        gesture.previewVisible = beginPageTurnPreviewFromCanvases(
          gesture.frozenCanvases && gesture.frozenCanvases.length
            ? gesture.frozenCanvases
            : cloneProtectedCanvases()
        );
      }
      if (gesture.previewVisible && hasNeighborLayer) {
        updatePageTurnPresentation(gesture.dx || 0);
        return;
      }
      scheduleTouchRevealActivation(direction);
    }, 32);
  }

  function onStart(event) {
    if (isProtectedOverlayEventTarget(event && event.target)) return;
    const touch = event.touches ? event.touches[0] : null;
    if (!touch || overlaysVisible()) return;
    const zoneBounds = getTouchZoneBounds();
    const width = Number(zoneBounds.width || 0);
    const relX = Number(touch.clientX || 0) - Number(zoneBounds.left || 0);
    let tapZone = "center";
    if (width > 0) {
      const edgeZoneWidth = Math.max(48, width * 0.22);
      const leftCut = edgeZoneWidth;
      const rightCut = Math.max(leftCut, width - edgeZoneWidth);
      if (relX < leftCut) tapZone = "left";
      else if (relX > rightCut) tapZone = "right";
    }
    const edgeBlocked =
      (tapZone === "left" && !canNavigateDirection("prev")) ||
      (tapZone === "right" && !canNavigateDirection("next"));
    const prepared = syncNeighborPreviewLayers({ requireFresh: true });
    if (!prepared) syncNeighborPreviewLayers({ requireFresh: false });
    gesture = {
      x: touch.clientX,
      y: touch.clientY,
      startX: touch.clientX,
      startY: touch.clientY,
      startAt: Date.now(),
      dx: 0,
      prepared,
      tapZone,
      direction: null,
      previewVisible: false,
      frozenCanvases: cloneProtectedCanvases(),
      activationTimer: null,
      imageLongPressTimer: null,
      preparingDirection: null,
      preparing: null,
      swipeCaptured: false,
      selectionClaimed: false,
      selectionLocked: false,
      edgeBlocked,
      mediaProbe: null,
      mediaItem: null,
      mediaResolved: false,
      imageActivated: false,
      footnoteAnchor: null,
      footnoteResolved: false
    };
    const activeGesture = gesture;
    gesture.mediaProbe = probeMediaAtClientPoint(touch.clientX, touch.clientY, "touch").then((result) => {
      if (!activeGesture || activeGesture !== gesture) return null;
      const mediaItem = result && result.active && result.media ? result.media : null;
      activeGesture.mediaResolved = true;
      activeGesture.mediaItem = mediaItem;
      return mediaItem;
    }).catch(() => {
      if (activeGesture && activeGesture === gesture) activeGesture.mediaResolved = true;
      return null;
    });
    gesture.imageLongPressTimer = window.setTimeout(async () => {
      if (!activeGesture || activeGesture !== gesture) return;
      if (activeGesture.selectionClaimed || activeGesture.selectionLocked) return;
      if (activeGesture.previewVisible || activeGesture.swipeCaptured) return;
      const mediaItem = activeGesture.mediaProbe
        ? await activeGesture.mediaProbe
        : null;
      if (!activeGesture || activeGesture !== gesture || !mediaItem) return;
      activeGesture.imageActivated = true;
      suppressShellToggle("image-longpress");
      showProtectedImageViewer(mediaItem, "touch");
    }, 420);
    if (!prepared) {
      gesture.preparingDirection = "both";
      gesture.preparing = prepareAndSyncNeighborPreviews().then((ready) => {
        if (!gesture) return;
        if (ready) gesture.prepared = true;
        syncNeighborPreviewLayers({ requireFresh: !!ready });
      }).catch(() => {}).finally(() => {
        if (gesture && gesture.preparingDirection === "both") gesture.preparingDirection = null;
      });
    }
    window.__protectedTouchDebug.start = {
      x: gesture.x,
      y: gesture.y,
      zoneLeft: Number(zoneBounds.left || 0),
      zoneWidth: Number(zoneBounds.width || 0),
      relX,
      tapZone,
      edgeBlocked,
      prepared,
      nextNeighborCount: getNeighborLayerCanvasCount("next"),
      prevNeighborCount: getNeighborLayerCanvasCount("prev")
    };
  }

  function onMove(event) {
    if (isProtectedOverlayEventTarget(event && event.target)) return;
    if (!gesture) return;
    const touch = event.touches ? event.touches[0] : null;
    if (!touch) return;
    if (gesture.edgeBlocked) return;
    const dx = touch.clientX - gesture.x;
    const dy = touch.clientY - gesture.y;
    const totalDx = touch.clientX - gesture.startX;
    const totalDy = touch.clientY - gesture.startY;
    window.__protectedTouchDebug.move = {
      dx,
      dy,
      touchSelection: getTouchSelectionState(),
      nextNeighborCount: getNeighborLayerCanvasCount("next"),
      prevNeighborCount: getNeighborLayerCanvasCount("prev"),
      previewVisible: !!gesture.previewVisible,
      prepared: !!gesture.prepared
    };
    if (Math.abs(totalDx) > 14 || Math.abs(totalDy) > 14) {
      if (gesture.imageLongPressTimer) {
        window.clearTimeout(gesture.imageLongPressTimer);
        gesture.imageLongPressTimer = null;
      }
    }
    const touchSelection = getTouchSelectionState();
    const summary = getBridgeSummaryFromFrame(HOST_STATE.frame);
    if (gesture.imageActivated) {
      event.preventDefault();
      return;
    }
    if (gesture.footnoteAnchor) {
      if (gesture.activationTimer) {
        window.clearTimeout(gesture.activationTimer);
        gesture.activationTimer = null;
      }
      if (gesture.previewVisible) {
        clearPageTurnPreview({ clearNeighbors: false });
        gesture.previewVisible = false;
      }
      if (gesture.swipeCaptured) {
        setFramePointerEventsDisabled(false);
        gesture.swipeCaptured = false;
      }
      event.preventDefault();
      return;
    }
    if (gesture.selectionClaimed) {
      gesture.selectionLocked = true;
      HOST_STATE.touchSelectionInProgress = true;
      event.preventDefault();
      if (gesture.activationTimer) {
        window.clearTimeout(gesture.activationTimer);
        gesture.activationTimer = null;
      }
      if (gesture.previewVisible) {
        clearPageTurnPreview({ clearNeighbors: false });
        gesture.previewVisible = false;
      }
      if (gesture.swipeCaptured) setFramePointerEventsDisabled(false);
      gesture.swipeCaptured = false;
      return;
    }
    if ((summary && summary.selectionActive) || touchSelection.claimed || touchSelection.active || touchSelection.selectionStarted) {
      gesture.selectionClaimed = true;
      gesture.selectionLocked = true;
      HOST_STATE.touchSelectionInProgress = true;
      event.preventDefault();
      if (gesture.activationTimer) {
        window.clearTimeout(gesture.activationTimer);
        gesture.activationTimer = null;
      }
      if (gesture.previewVisible) {
        clearPageTurnPreview({ clearNeighbors: false });
        gesture.previewVisible = false;
      }
      if (gesture.swipeCaptured) setFramePointerEventsDisabled(false);
      gesture.swipeCaptured = false;
      return;
    }
    if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy)) {
      if (touchSelection.pending || touchSelection.claimed || touchSelection.selectionStarted) return;
      const direction = dx < 0 ? "next" : "prev";
      if (!canNavigateDirection(direction)) {
        if (gesture.activationTimer) {
          window.clearTimeout(gesture.activationTimer);
          gesture.activationTimer = null;
        }
        if (gesture.previewVisible) {
          clearPageTurnPreview({ clearNeighbors: false });
          gesture.previewVisible = false;
        }
        if (gesture.swipeCaptured) {
          setFramePointerEventsDisabled(false);
          gesture.swipeCaptured = false;
        }
        gesture.direction = null;
        gesture.dx = 0;
        return;
      }
      event.preventDefault();
      if (!gesture.swipeCaptured) {
        setFramePointerEventsDisabled(true);
        gesture.swipeCaptured = true;
      }
      gesture.dx = dx;
      gesture.direction = direction;
      if (!gesture.prepared) {
        syncNeighborPreviewLayers({ requireFresh: false, direction });
      }
      if (!gesture.prepared && syncNeighborPreviewLayers({ requireFresh: true, direction })) {
        gesture.prepared = true;
      }
      if (!gesture.prepared && gesture.preparingDirection !== direction) {
        gesture.preparingDirection = direction;
        gesture.preparing = prepareAndSyncNeighborPreviews(direction).then((ready) => {
          if (gesture && gesture.direction === direction) {
            if (ready) {
              gesture.prepared = true;
            }
            if (!(ready && syncNeighborPreviewLayers({ requireFresh: true, direction }))) {
              syncNeighborPreviewLayers({ requireFresh: false, direction });
            }
            if (
              !gesture.previewVisible &&
              Math.abs(gesture.dx || 0) > 24 &&
              hasFreshNeighborLayer(direction)
            ) {
              gesture.previewVisible = beginPageTurnPreviewFromCanvases(
                gesture.frozenCanvases && gesture.frozenCanvases.length
                  ? gesture.frozenCanvases
                  : cloneProtectedCanvases()
              );
            }
            if (gesture.previewVisible) updatePageTurnPresentation(gesture.dx || 0);
            else scheduleTouchRevealActivation(direction);
          }
        }).catch(() => {}).finally(() => {
          if (gesture && gesture.preparingDirection === direction) gesture.preparingDirection = null;
        });
      }
      const hasNeighborLayer = hasFreshNeighborLayer(direction);
      if (!gesture.previewVisible && (hasNeighborLayer || gesture.prepared)) {
        gesture.previewVisible = beginPageTurnPreviewFromCanvases(
          gesture.frozenCanvases && gesture.frozenCanvases.length
            ? gesture.frozenCanvases
            : cloneProtectedCanvases()
        );
      }
      if (!gesture.previewVisible) {
        scheduleTouchRevealActivation(direction);
      }
      window.__protectedTouchDebug.moveQualified = {
        dx,
        dy,
        direction,
        hasNeighborLayer,
        previewVisible: !!gesture.previewVisible,
        prepared: !!gesture.prepared,
        frozenCanvasCount: gesture.frozenCanvases ? gesture.frozenCanvases.length : 0
      };
      if (gesture.previewVisible) {
        if (hasNeighborLayer || gesture.prepared) {
          if (!syncNeighborPreviewLayers({
            requireFresh: !!gesture.prepared,
            direction
          }) && !getNeighborLayerCanvasCount(direction)) {
            syncNeighborPreviewLayers({ requireFresh: false, direction });
          }
          updatePageTurnPresentation(dx);
        } else {
          scheduleTouchRevealActivation(direction);
        }
      }
    }
  }

  async function onEnd(event) {
    if (isProtectedOverlayEventTarget(event && event.target)) {
      if (gesture && gesture.swipeCaptured) setFramePointerEventsDisabled(false);
      gesture = null;
      return;
    }
    if (!gesture) return;
    const completedGesture = gesture;
    const touchSelection = getTouchSelectionState();
    const summary = getBridgeSummaryFromFrame(HOST_STATE.frame);
    const touch = event.changedTouches ? event.changedTouches[0] : null;
    if (!touch) {
      if (completedGesture && completedGesture.swipeCaptured) setFramePointerEventsDisabled(false);
      gesture = null;
      return;
    }
    if (completedGesture.edgeBlocked) {
      if (completedGesture.activationTimer) {
        window.clearTimeout(completedGesture.activationTimer);
        completedGesture.activationTimer = null;
      }
      if (completedGesture.previewVisible) {
        clearPageTurnPreview({ clearNeighbors: false });
      }
      if (completedGesture.swipeCaptured) setFramePointerEventsDisabled(false);
      gesture = null;
      return;
    }
    const dx = touch.clientX - completedGesture.x;
    const dy = touch.clientY - completedGesture.y;
    const totalDx = touch.clientX - completedGesture.startX;
    const totalDy = touch.clientY - completedGesture.startY;
    const durationMs = Date.now() - Number(completedGesture.startAt || 0);
    const previewVisible = completedGesture.previewVisible;
    const tapZone = completedGesture.tapZone || "center";
    const selectionClaimed =
      !!completedGesture.selectionClaimed ||
      !!completedGesture.selectionLocked ||
      !!touchSelection.selectionStarted ||
      !!touchSelection.claimed ||
      !!touchSelection.active ||
      !!touchSelection.pending;
    if (completedGesture.activationTimer) {
      window.clearTimeout(completedGesture.activationTimer);
      completedGesture.activationTimer = null;
    }
    if (completedGesture.imageLongPressTimer) {
      window.clearTimeout(completedGesture.imageLongPressTimer);
      completedGesture.imageLongPressTimer = null;
    }
    if (completedGesture.swipeCaptured) setFramePointerEventsDisabled(false);
    HOST_STATE.touchSelectionInProgress = false;
    gesture = null;
    window.__protectedTouchDebug.end = {
      dx,
      dy,
      totalDx,
      totalDy,
      durationMs,
      previewVisible,
      tapZone,
      overlaysVisible: overlaysVisible(),
      selectionClaimed,
      footnote: false,
      image: !!completedGesture.imageActivated
    };
    if (completedGesture.imageActivated) {
      event.preventDefault();
      return;
    }
    if (Math.abs(dx) < 58 || Math.abs(dx) < Math.abs(dy) * 1.35) {
      if (previewVisible) {
        animatePageTurnTo(0, 150);
        window.setTimeout(() => {
          clearPageTurnPreview({ clearNeighbors: false });
        }, 170);
      }
      if (completedGesture.selectionLocked || selectionClaimed || (summary && summary.selectionActive) || touchSelection.claimed || touchSelection.active || touchSelection.pending || touchSelection.selectionStarted) {
        const anchorX = touch ? touch.clientX : 160;
        const anchorY = touch ? touch.clientY : 160;
        rememberSelectionToolbarReleaseAnchor(anchorX, anchorY, "touch");
        showSelectionToolbarAfterRelease(HOST_STATE.frame, anchorX, anchorY);
        return;
      }
      const isTap =
        Math.abs(totalDx) <= 22 &&
        Math.abs(totalDy) <= 22 &&
        durationMs <= 900 &&
        !previewVisible &&
        !overlaysVisible();
      const isStationaryLongPress =
        Math.abs(totalDx) <= 22 &&
        Math.abs(totalDy) <= 22 &&
        durationMs >= 390 &&
        !previewVisible &&
        !overlaysVisible();
      if (isStationaryLongPress) {
        const mediaItem = completedGesture.mediaProbe
          ? await completedGesture.mediaProbe
          : await probeMediaAtClientPoint(
              touch ? touch.clientX : completedGesture.startX,
              touch ? touch.clientY : completedGesture.startY,
              "touch"
            ).then((result) => (result && result.active && result.media ? result.media : null)).catch(() => null);
        window.__protectedTouchDebug.end.image = !!mediaItem;
        if (mediaItem) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation && event.stopImmediatePropagation();
          suppressShellToggle("image-longpress-release");
          showProtectedImageViewer(mediaItem, "touch");
          return;
        }
      }
      if (isTap) {
        const footnoteAnchor = await probeFootnoteAtClientPoint(
          touch ? touch.clientX : completedGesture.startX,
          touch ? touch.clientY : completedGesture.startY,
          "touch"
        ).then((result) => (result && result.active && result.anchor ? result.anchor : null)).catch(() => null);
        window.__protectedTouchDebug.end.footnote = !!footnoteAnchor;
        if (footnoteAnchor) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation && event.stopImmediatePropagation();
          handleProtectedFootnoteActivation(
            footnoteAnchor,
            touch ? touch.clientX : completedGesture.startX,
            touch ? touch.clientY : completedGesture.startY,
            "touch"
          );
          return;
        }
        const linkAnchor = await probeLinkAtClientPoint(
          touch ? touch.clientX : completedGesture.startX,
          touch ? touch.clientY : completedGesture.startY,
          "touch"
        ).then((result) => (result && result.active && result.anchor ? result.anchor : null)).catch(() => null);
        if (linkAnchor) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation && event.stopImmediatePropagation();
          await handleProtectedLinkActivation(linkAnchor, "touch");
          return;
        }
        window.__protectedTouchDebug.tap = {
          tapZone,
          bodyHiddenBefore: !!(document.body && document.body.classList && document.body.classList.contains("ui-hidden"))
        };
        if (tapZone === "center") {
          event.preventDefault();
          if (touchSearchNavigationLocksCenterTap()) {
            window.__protectedTouchDebug.tap.shellToggleSuppressed = "search-navigation";
            return;
          }
          scheduleShellToggle("touch-center", 180);
          window.__protectedTouchDebug.tap.bodyHiddenAfter = !!(document.body && document.body.classList && document.body.classList.contains("ui-hidden"));
          return;
        }
        if (tapZone === "left") {
          if (!canNavigateDirection("prev")) return;
          event.preventDefault();
          await performPageTurn("prev");
          window.__protectedTouchDebug.tap.turn = "prev";
          return;
        }
        if (tapZone === "right") {
          if (!canNavigateDirection("next")) return;
          event.preventDefault();
          await performPageTurn("next");
          window.__protectedTouchDebug.tap.turn = "next";
          return;
        }
      }
      return;
    }
    if (completedGesture.selectionLocked || selectionClaimed || (summary && summary.selectionActive) || touchSelection.claimed || touchSelection.active || touchSelection.pending || touchSelection.selectionStarted) {
      const anchorX = touch ? touch.clientX : 160;
      const anchorY = touch ? touch.clientY : 160;
      rememberSelectionToolbarReleaseAnchor(anchorX, anchorY, "touch");
      showSelectionToolbarAfterRelease(HOST_STATE.frame, anchorX, anchorY);
      return;
    }
    event.preventDefault();
    if (dx < 0) {
      if (!canNavigateDirection("next")) return;
      await performPageTurn("next", { reuseExistingPreview: previewVisible, startDx: dx });
      return;
    }
    if (!canNavigateDirection("prev")) return;
    await performPageTurn("prev", { reuseExistingPreview: previewVisible, startDx: dx });
  }

  target.addEventListener("touchstart", onStart, { passive: true, capture: true });
  target.addEventListener("touchmove", onMove, { passive: false, capture: true });
  target.addEventListener("touchend", onEnd, { passive: false, capture: true });
  target.addEventListener("touchcancel", () => {
    clearPageTurnPreview({ clearNeighbors: false });
    if (gesture && gesture.imageLongPressTimer) {
      window.clearTimeout(gesture.imageLongPressTimer);
      gesture.imageLongPressTimer = null;
    }
    if (gesture && gesture.swipeCaptured) setFramePointerEventsDisabled(false);
    gesture = null;
  }, { passive: true, capture: true });
}

function bindShellControls() {
  if (document.body.dataset.protectedShellBound === "yes") return;
  document.body.dataset.protectedShellBound = "yes";

  const replaceControlNode = (id) => {
    const node = document.getElementById(id);
    if (!node || !node.parentNode) return node;
    const clone = node.cloneNode(true);
    node.parentNode.replaceChild(clone, node);
    return clone;
  };

  const prev = replaceControlNode("prev");
  const next = replaceControlNode("next");
  [prev, next].forEach((node) => {
    if (!node) return;
    node.tabIndex = -1;
    node.style.outline = "none";
    node.style.boxShadow = "none";
    node.style.userSelect = "none";
    node.style.webkitUserSelect = "none";
    node.style.webkitTapHighlightColor = "transparent";
    node.addEventListener("mouseup", () => {
      try { node.blur(); } catch (error) {}
    }, true);
    node.addEventListener("touchend", () => {
      try { node.blur(); } catch (error) {}
    }, true);
  });
  prev && prev.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation && event.stopImmediatePropagation();
    await performPageTurn("prev");
  }, true);
  next && next.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation && event.stopImmediatePropagation();
    await performPageTurn("next");
  }, true);

  document.addEventListener("keydown", async (event) => {
    if (!HOST_STATE.frame) return;
    if (event.key === "Escape") {
      closeSearchOverlay();
      closeLibraryOverlay();
      closeTypographyPanel();
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      await performPageTurn("prev");
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      await performPageTurn("next");
    }
  });

  const theme = document.getElementById("themeToggle");
  const tts = document.getElementById("ttsToggleDesktop");
  const bookmark = document.getElementById("bookmark");
  const legacySearchOpen = document.getElementById("searchOpen");
  const mobileMoreToggle = document.getElementById("mobileMoreToggle");
  const mobileMorePanel = document.getElementById("mobileMorePanel");
  syncProtectedShellIcons();
  const catalogLink = document.getElementById("protectedCatalogLink");
  const bottomCatalogLink = document.getElementById("protectedBottomCatalogLink");
  const libraryTrigger = document.getElementById("protectedLibraryTrigger");
  const searchTrigger = document.getElementById("protectedSearchTrigger");
  ensureSearchOverlay();
  enforcePortraitLegacySidebarDisabled();
  window.addEventListener("resize", enforcePortraitLegacySidebarDisabled, { passive: true });
  window.addEventListener("orientationchange", enforcePortraitLegacySidebarDisabled, { passive: true });
  if (mobileMoreToggle) {
    try { mobileMoreToggle.remove(); } catch (_error) {}
  }
  if (mobileMorePanel) {
    try { mobileMorePanel.remove(); } catch (_error) {}
  }
  if (isTouchShellMode() && legacySearchOpen) {
    try { legacySearchOpen.remove(); } catch (_error) {}
  }
  tts && bindPrimaryAction(tts, async () => {
    await toggleHostTts();
  });
  theme && bindPrimaryAction(theme, async () => {
    const currentTheme = HOST_STATE.lastSummary && HOST_STATE.lastSummary.theme === "dark" ? "dark" : "light";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    document.body.classList.toggle("protected-theme-dark", nextTheme === "dark");
    document.body.classList.toggle("dark-ui", nextTheme === "dark");
    await invokeBridge("setTheme", nextTheme);
  });
  bookmark && bindPrimaryAction(bookmark, async () => {
    const summary = HOST_STATE.lastSummary;
    if (!summary || !summary.restoreToken) return;
    const bookmarks = getCurrentBookmarks();
    const token = String(summary.restoreToken);
    const existing = bookmarks.find((item) => String(item.restoreToken) === token) || null;
    if (existing) {
      saveStoredBookmarks(bookmarks.filter((item) => String(item.restoreToken) !== token));
    } else {
      const entry = buildBookmarkEntry(summary);
      if (entry) saveStoredBookmarks([...bookmarks, entry]);
    }
    renderBookmarks(summary);
    updateBookmarkControl(summary);
  });
  libraryTrigger && bindPrimaryAction(libraryTrigger, async () => {
    const wrap = document.getElementById("protectedLibraryControl");
    if (wrap && wrap.classList.contains("is-open")) {
      closeLibraryOverlay();
      return;
    }
    openLibraryOverlay("toc");
  });
  searchTrigger && bindPrimaryAction(searchTrigger, async () => {
    if (isTouchShellMode()) {
      closeSearchOverlay();
      openLegacySearchUi();
      showShellUi("touch-search-open");
      return;
    }
    const wrap = document.getElementById("protectedSearchControl");
    if (wrap && wrap.classList.contains("is-open")) {
      closeSearchOverlay();
      return;
    }
    openSearchOverlay();
  });
  const typographyControl = ensureTypographyControl();
  ensureSettingsOverlay();
  const typographyTrigger = document.getElementById("protectedTypographyTrigger");
  const typographyPanel = document.getElementById("protectedTypographyPanel");
  const typographyScale = document.getElementById("protectedTypographyScale");
  const settingsShareButton = document.getElementById("protectedSettingsShareButton");
  const fontModeButtons = [
    document.getElementById("protectedTypographySans"),
    document.getElementById("protectedTypographySerif")
  ].filter(Boolean);
  typographyTrigger && bindPrimaryAction(typographyTrigger, async () => {
    toggleTypographyPanel();
  });
  const dismissTypographyPanel = (event) => {
    if (shouldSuppressProtectedOverlayRelease()) {
      try {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation && event.stopImmediatePropagation();
      } catch (_error) {}
      return;
    }
    const libraryWrap = document.getElementById("protectedLibraryControl");
    const searchWrap = document.getElementById("protectedSearchControl");
    const libraryOverlay = document.getElementById("overlay-library");
    const searchOverlay = document.getElementById("overlay-search");
    const wrap = document.getElementById("protectedTypographyControl");
    const overlay = document.getElementById("overlay-settings");
    const backdrop = document.getElementById("overlay-backdrop");
    const panel = document.getElementById("protectedTypographyPanel");
    if (
      (libraryWrap && libraryWrap.classList.contains("is-open")) ||
      (searchWrap && searchWrap.classList.contains("is-open"))
    ) {
      if (backdrop && event.target === backdrop) {
        try {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation && event.stopImmediatePropagation();
        } catch (_error) {}
        closeSearchOverlay({ hideShellAfterClose: true });
        closeLibraryOverlay({ hideShellAfterClose: true });
        return;
      }
      if (
        (libraryWrap && libraryWrap.contains(event.target)) ||
        (searchWrap && searchWrap.contains(event.target)) ||
        (searchOverlay && searchOverlay.contains(event.target)) ||
        (libraryOverlay && libraryOverlay.contains(event.target))
      ) {
        return;
      }
      try {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation && event.stopImmediatePropagation();
      } catch (_error) {}
      closeLibraryOverlay({ hideShellAfterClose: true });
      closeSearchOverlay({ hideShellAfterClose: true });
      return;
    }
    if (!wrap || !wrap.classList.contains("is-open")) return;
    if (backdrop && event.target === backdrop) {
      try {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation && event.stopImmediatePropagation();
      } catch (_error) {}
      closeTypographyPanel({ hideShellAfterClose: true });
      return;
    }
    if (
      wrap.contains(event.target) ||
      (overlay && overlay.contains(event.target)) ||
      (panel && panel.contains(event.target))
    ) return;
    try {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation && event.stopImmediatePropagation();
    } catch (_error) {}
    closeTypographyPanel({ hideShellAfterClose: true });
  };
  document.addEventListener("mousedown", dismissTypographyPanel, true);
  document.addEventListener("click", dismissTypographyPanel, true);
  document.addEventListener("pointerdown", dismissTypographyPanel, true);
  document.addEventListener("touchstart", dismissTypographyPanel, { capture: true, passive: false });
  const handleTypographyModeSelection = async (nextMode, event = null) => {
    event && event.preventDefault && event.preventDefault();
    event && event.stopPropagation && event.stopPropagation();
    event && event.stopImmediatePropagation && event.stopImmediatePropagation();
    const summary = HOST_STATE.lastSummary;
    const supported = summary && Array.isArray(summary.supportedFontModes) && summary.supportedFontModes.length
      ? summary.supportedFontModes.map((item) => normalizeFontMode(item))
      : ["sans"];
    const currentAppliedMode = resolveSupportedFontMode(
      summary && (summary.runtimeFontMode || summary.fontMode)
        ? (summary.runtimeFontMode || summary.fontMode)
        : HOST_STATE.readerConfig.fontMode,
      summary,
      HOST_STATE.readerConfig.fontMode
    );
    if (!supported.includes(nextMode)) return;
    if (currentAppliedMode === nextMode) return;
    hideSelectionToolbar();
    HOST_STATE.fontModeSynced = true;
    HOST_STATE.lastAppliedFontMode = persistShellFontMode(nextMode);
    HOST_STATE.readerConfig.fontMode = nextMode;
    updateTypographyControl({
      ...(summary || {}),
      fontMode: nextMode,
      supportedFontModes: supported
    });
    await invokeBridge("setFontMode", nextMode);
  };
  const maybeHandleTypographyModeEvent = async (event) => {
    const target = event.target && event.target.closest
      ? event.target.closest(".protected-typography-mode")
      : null;
    if (!target) return;
    const nextMode = normalizeFontMode(target.dataset ? target.dataset.fontMode : "sans");
    await handleTypographyModeSelection(nextMode, event);
  };
  typographyPanel && typographyPanel.addEventListener("pointerdown", maybeHandleTypographyModeEvent, true);
  typographyPanel && typographyPanel.addEventListener("touchstart", maybeHandleTypographyModeEvent, { capture: true, passive: false });
  typographyPanel && typographyPanel.addEventListener("click", maybeHandleTypographyModeEvent);
  document.addEventListener("click", (event) => {
    if (!isTouchShellMode()) return;
    if (Date.now() >= Number(HOST_STATE.suppressSyntheticClickUntil || 0)) return;
    const target = event.target;
    if (
      target &&
      target.closest &&
      target.closest(
        "#titlebar, #bottombar, .overlay, #overlay-backdrop, #mobileMorePanel, #mobileMoreToggle, #selectionToolbar"
      )
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation && event.stopImmediatePropagation();
  }, true);
  let typographyScaleCommitTimer = null;
  let typographyScaleCommitToken = 0;
  const invokeTypographyScaleCommit = async (nextScale) => {
    const token = ++typographyScaleCommitToken;
    try {
      await invokeBridge("setFontScale", nextScale);
    } catch (_error) {
      if (token === typographyScaleCommitToken) {
        HOST_STATE.fontScaleSynced = false;
      }
    }
  };
  const scheduleTypographyScaleCommit = (nextScale, delay = 180) => {
    if (typographyScaleCommitTimer) {
      window.clearTimeout(typographyScaleCommitTimer);
      typographyScaleCommitTimer = null;
    }
    typographyScaleCommitTimer = window.setTimeout(() => {
      typographyScaleCommitTimer = null;
      void invokeTypographyScaleCommit(nextScale);
    }, delay);
  };
  const commitTypographyScale = async (input) => {
    if (!input) return;
    const nextScale = persistShellFontScale(
      Math.max(0.8, Math.min(1.6, Number(input.value || 1)))
    );
    updateTypographyScaleVisual(input);
    HOST_STATE.lastAppliedFontScale = nextScale;
    HOST_STATE.fontScaleSynced = true;
    if (typographyScaleCommitTimer) {
      window.clearTimeout(typographyScaleCommitTimer);
      typographyScaleCommitTimer = null;
    }
    await invokeTypographyScaleCommit(nextScale);
  };
  let activeTypographyScaleDrag = null;
  const previewTypographyScale = (input) => {
    if (!input) return;
    const nextScale = persistShellFontScale(
      Math.max(0.8, Math.min(1.6, Number(input.value || 1)))
    );
    updateTypographyScaleVisual(input);
    HOST_STATE.lastAppliedFontScale = nextScale;
    HOST_STATE.fontScaleSynced = true;
    scheduleTypographyScaleCommit(nextScale);
  };
  const updateTypographyScaleFromClientX = (input, clientX) => {
    if (!input || !Number.isFinite(clientX)) return false;
    const rect = input.getBoundingClientRect();
    if (!rect || rect.width <= 0) return false;
    const min = Number(input.min || 0.8);
    const max = Number(input.max || 1.6);
    const step = Number(input.step || 0.1) || 0.1;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const rawValue = min + ((max - min) * ratio);
    const snapped = Math.round(rawValue / step) * step;
    input.value = String(Math.max(min, Math.min(max, Number(snapped.toFixed(2)))));
    updateTypographyScaleVisual(input);
    return true;
  };
  typographyScale && typographyScale.addEventListener("input", (event) => {
    updateTypographyScaleVisual(event.currentTarget);
    previewTypographyScale(event.currentTarget);
  });
  typographyScale && typographyScale.addEventListener("change", async (event) => {
    await commitTypographyScale(event.currentTarget);
  });
  const releaseTypographyScaleDrag = async () => {
    if (!activeTypographyScaleDrag) return;
    const input = activeTypographyScaleDrag;
    activeTypographyScaleDrag = null;
    await commitTypographyScale(input);
  };
  const handleTypographyScaleDragMove = (clientX) => {
    if (!activeTypographyScaleDrag) return false;
    if (!updateTypographyScaleFromClientX(activeTypographyScaleDrag, clientX)) return false;
    previewTypographyScale(activeTypographyScaleDrag);
    return true;
  };
  typographyScale && typographyScale.addEventListener("pointerdown", async (event) => {
    if (String(event.pointerType || "").toLowerCase() !== "touch") return;
    if (!updateTypographyScaleFromClientX(event.currentTarget, Number(event.clientX || 0))) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation && event.stopImmediatePropagation();
    activeTypographyScaleDrag = event.currentTarget;
    previewTypographyScale(event.currentTarget);
  }, true);
  typographyScale && typographyScale.addEventListener("touchstart", async (event) => {
    const touch = event.touches && event.touches[0] ? event.touches[0] : null;
    if (!touch || !updateTypographyScaleFromClientX(event.currentTarget, Number(touch.clientX || 0))) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation && event.stopImmediatePropagation();
    activeTypographyScaleDrag = event.currentTarget;
    previewTypographyScale(event.currentTarget);
  }, { capture: true, passive: false });
  window.addEventListener("pointermove", (event) => {
    if (String(event.pointerType || "").toLowerCase() !== "touch") return;
    if (!handleTypographyScaleDragMove(Number(event.clientX || 0))) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation && event.stopImmediatePropagation();
  }, true);
  window.addEventListener("touchmove", (event) => {
    const touch = event.touches && event.touches[0] ? event.touches[0] : null;
    if (!touch || !handleTypographyScaleDragMove(Number(touch.clientX || 0))) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation && event.stopImmediatePropagation();
  }, { capture: true, passive: false });
  window.addEventListener("pointerup", () => { void releaseTypographyScaleDrag(); }, true);
  window.addEventListener("touchend", () => { void releaseTypographyScaleDrag(); }, true);
  window.addEventListener("touchcancel", () => { activeTypographyScaleDrag = null; }, true);
  settingsShareButton && bindPrimaryAction(settingsShareButton, handleProtectedBookShare, { releaseOnly: true, suppressWindowMs: 2500 });
  fontModeButtons.forEach((button) => {
    button.addEventListener("click", async (event) => {
      const target = event.currentTarget;
      const nextMode = normalizeFontMode(target && target.dataset ? target.dataset.fontMode : "sans");
      await handleTypographyModeSelection(nextMode, event);
    });
  });
  if (typographyControl) updateTypographyControl();

  const searchAction = document.getElementById("searchActionDesktop");
  const searchInput = document.getElementById("searchInputDesktop");
  const searchPrev = document.getElementById("searchPrevDesktop");
  const searchNext = document.getElementById("searchNextDesktop");
  const searchReturn = ensureDesktopSearchReturnButton();
  const searchOpen = document.getElementById("searchOpen");
  const searchClose = document.getElementById("searchClose");
  const mobileBar = document.getElementById("searchbar");
  const mobileInput = document.getElementById("searchInputMobile");
  const mobilePrev = document.getElementById("searchPrev");
  const mobileNext = document.getElementById("searchNext");
  const mobileClear = document.getElementById("searchClearMobile");
  const floatPrev = document.getElementById("searchFloatPrev");
  const floatNext = document.getElementById("searchFloatNext");
  const floatClose = document.getElementById("searchFloatClose");
  const floatReturn = document.getElementById("searchFloatReturn");

  if (searchInput) {
    searchInput.type = "text";
    searchInput.setAttribute("inputmode", "search");
    searchInput.setAttribute("enterkeyhint", "search");
  }
  if (mobileInput) {
    mobileInput.type = "text";
    mobileInput.setAttribute("inputmode", "search");
    mobileInput.setAttribute("enterkeyhint", "search");
  }

  function openLegacySearchUi() {
    if (!mobileBar) return;
    const titleBar = document.getElementById("titlebar");
    if (titleBar) {
      const rect = titleBar.getBoundingClientRect();
      if (rect && rect.height > 0) {
        const exactHeight = `${Math.round(rect.height)}px`;
        mobileBar.style.height = exactHeight;
        mobileBar.style.minHeight = exactHeight;
      }
    }
    document.body.classList.add("search-open");
    document.body.classList.remove("search-minimized");
    mobileBar.classList.remove("hidden");
    const query = String((HOST_STATE.lastSummary && HOST_STATE.lastSummary.searchSummary && HOST_STATE.lastSummary.searchSummary.query) || HOST_STATE.searchSidebarPendingQuery || "");
    if (mobileInput) mobileInput.value = query;
    updateSearchControls(HOST_STATE.lastSummary);
    window.setTimeout(() => {
      try { mobileInput && mobileInput.focus(); } catch (_error) {}
    }, 0);
  }

  function closeLegacySearchUi() {
    document.body.classList.remove("search-open");
    document.body.classList.remove("search-minimized");
    if (mobileBar) mobileBar.classList.add("hidden");
    if (mobileBar) {
      mobileBar.style.removeProperty("height");
      mobileBar.style.removeProperty("min-height");
    }
  }

  function rememberSearchOrigin(summary = HOST_STATE.lastSummary) {
    if (HOST_STATE.searchReturnOriginToken) return;
    if (!summary) return;
    HOST_STATE.searchReturnOriginToken = String(summary.restoreToken || "");
    HOST_STATE.searchReturnOriginOffset = Number(summary.globalStartOffset || 0) || 0;
  }

  function forgetSearchOrigin() {
    HOST_STATE.searchReturnOriginToken = "";
    HOST_STATE.searchReturnOriginOffset = 0;
  }

  async function restoreSearchOrigin({ closeMobileUi = false } = {}) {
    const token = String(HOST_STATE.searchReturnOriginToken || "");
    const offset = Number(HOST_STATE.searchReturnOriginOffset || 0) || 0;
    forgetSearchOrigin();
    HOST_STATE.searchSidebarPendingQuery = "";
    if (closeMobileUi) closeLegacySearchUi();
    if (token) {
      const summary = await invokeBridgeRaw("restoreFromToken", token);
      if (summary) updateFromSummary(summary);
      return;
    }
    if (offset > 0) {
      const summary = await invokeBridgeRaw("goToGlobalOffset", offset);
      if (summary) updateFromSummary(summary);
    }
  }

  async function submitSearch(query, { fromTouch = false } = {}) {
    const normalizedQuery = String(query || "").trim();
    if (!normalizedQuery) {
      await clearSearch();
      return;
    }
    HOST_STATE.searchSidebarForceEmpty = false;
    const current = HOST_STATE.lastSummary && HOST_STATE.lastSummary.searchSummary ? HOST_STATE.lastSummary.searchSummary : null;
    if (!(current && current.active)) rememberSearchOrigin(HOST_STATE.lastSummary);
    HOST_STATE.searchSidebarPendingQuery = normalizedQuery;
    if (searchInput) searchInput.value = normalizedQuery;
    if (mobileInput) mobileInput.value = normalizedQuery;
    updateSearchControls(HOST_STATE.lastSummary);
    await invokeSearchBridge("searchBook", normalizedQuery);
    if (fromTouch) {
      document.body.classList.add("search-open");
      document.body.classList.add("search-minimized");
      hideShellUi("search-submit-touch");
    } else {
      document.body.classList.remove("search-minimized");
      showShellUi("search-submit-desktop");
    }
  }
  async function clearSearch({ preserveOrigin = false } = {}) {
    HOST_STATE.searchSidebarPendingQuery = "";
    HOST_STATE.searchSidebarForceEmpty = true;
    HOST_STATE.searchClearSuppressUntil = Date.now() + 2000;
    HOST_STATE.searchSidebarState = createEmptySearchSidebarState();
    if (HOST_STATE.lastSummary && typeof HOST_STATE.lastSummary === "object") {
      HOST_STATE.lastSummary = {
        ...HOST_STATE.lastSummary,
        searchSummary: {
          active: false,
          query: "",
          totalMatches: 0,
          currentMatch: 0,
          matches: []
        }
      };
    }
    if (mobileInput) mobileInput.value = "";
    if (searchInput) searchInput.value = "";
    updateSearchControls(HOST_STATE.lastSummary);
    await invokeSearchBridge("clearSearch");
    if (mobileInput) mobileInput.value = "";
    if (searchInput) searchInput.value = "";
    [0, 80, 180, 350, 700, 1200, 1800].forEach((delay) => {
      window.setTimeout(() => {
        if (Date.now() > Number(HOST_STATE.searchClearSuppressUntil || 0)) return;
        if (mobileInput) mobileInput.value = "";
        if (searchInput) searchInput.value = "";
        updateSearchControls(HOST_STATE.lastSummary);
      }, delay);
    });
    document.body.classList.remove("search-minimized");
    if (!preserveOrigin) forgetSearchOrigin();
    updateSearchControls(HOST_STATE.lastSummary);
  }

  const handleDesktopSearchActionClick = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation && event.stopImmediatePropagation();
    const summary = HOST_STATE.lastSummary;
    const inputQuery = String(searchInput && searchInput.value || "").trim();
    const isClearAction = !!(
      (summary && summary.searchSummary && summary.searchSummary.active) ||
      (searchAction && searchAction.classList.contains("is-clear")) ||
      (!searchAction.classList.contains("is-mag") && !searchAction.classList.contains("is-disabled") && !!inputQuery)
    );
    if (isClearAction) {
      if (searchInput) searchInput.value = "";
      await clearSearch();
      return;
    }
    await submitSearch(inputQuery, { fromTouch: false });
  };
  searchAction && searchAction.addEventListener("click", handleDesktopSearchActionClick, true);
  searchInput && searchInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await submitSearch(searchInput.value.trim(), { fromTouch: false });
  });
  searchInput && searchInput.addEventListener("input", () => {
    HOST_STATE.searchClearSuppressUntil = 0;
    HOST_STATE.searchSidebarPendingQuery = String(searchInput.value || "").trim();
    updateSearchControls(HOST_STATE.lastSummary);
  });
  mobileInput && mobileInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await submitSearch(mobileInput.value.trim(), { fromTouch: true });
  });
  mobileInput && mobileInput.addEventListener("input", () => {
    HOST_STATE.searchClearSuppressUntil = 0;
    HOST_STATE.searchSidebarPendingQuery = String(mobileInput.value || "").trim();
    updateSearchControls(HOST_STATE.lastSummary);
  });
  searchPrev && searchPrev.addEventListener("click", async (event) => {
    event.preventDefault();
    await invokeSearchBridge("searchPrevResult");
  });
  searchNext && searchNext.addEventListener("click", async (event) => {
    event.preventDefault();
    await invokeSearchBridge("searchNextResult");
  });
  mobilePrev && bindPrimaryAction(mobilePrev, async () => {
    await invokeSearchBridge("searchPrevResult");
  }, { touchOnly: false });
  mobileNext && bindPrimaryAction(mobileNext, async () => {
    await invokeSearchBridge("searchNextResult");
  }, { touchOnly: false });
  floatPrev && bindPrimaryAction(floatPrev, async () => {
    await invokeSearchBridge("searchPrevResult");
  }, { touchOnly: false });
  floatNext && bindPrimaryAction(floatNext, async () => {
    await invokeSearchBridge("searchNextResult");
  }, { touchOnly: false });
  mobileClear && bindPrimaryAction(mobileClear, async () => {
    if (mobileInput) mobileInput.value = "";
    if (searchInput) searchInput.value = "";
    await clearSearch();
  }, { touchOnly: false });
  searchOpen && searchOpen.addEventListener("click", (event) => {
    event.preventDefault();
    openLegacySearchUi();
  });
  searchClose && bindPrimaryAction(searchClose, async () => {
    await clearSearch({ preserveOrigin: true });
    await restoreSearchOrigin({ closeMobileUi: true });
    hideShellUi("search-close");
  }, { touchOnly: false });
  floatClose && bindPrimaryAction(floatClose, async () => {
    await clearSearch({ preserveOrigin: false });
    closeLegacySearchUi();
  }, { touchOnly: false });
  floatReturn && bindPrimaryAction(floatReturn, async () => {
    await clearSearch({ preserveOrigin: true });
    await restoreSearchOrigin({ closeMobileUi: true });
  }, { touchOnly: false });
  searchReturn && searchReturn.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation && event.stopImmediatePropagation();
    await clearSearch({ preserveOrigin: true });
    await restoreSearchOrigin({ closeMobileUi: false });
  }, true);

  bindSelectionToolbar();

  const host = document.getElementById("protectedOldShellHost");
  if (host) installTouchSwipe(host);
}

function ensureProtectedHost() {
  HOST_STATE.directSurfaceRoot = null;
  HOST_STATE.directRuntimeBootPromise = null;
  return ensureDirectProtectedHost();
}

function isDirectRenderHostMode() {
  return !!(HOST_STATE.route && HOST_STATE.route.renderHost === "direct");
}

function getProtectedSurfaceDocument(frame = HOST_STATE.frame) {
  try {
    if (isDirectRenderHostMode()) return document;
    return frame && frame.contentDocument ? frame.contentDocument : null;
  } catch (_error) {
    return null;
  }
}

function getProtectedSurfaceWindow(frame = HOST_STATE.frame) {
  try {
    if (isDirectRenderHostMode()) return window;
    return frame && frame.contentWindow ? frame.contentWindow : null;
  } catch (_error) {
    return null;
  }
}

function buildDirectProtectedRenderMarkup() {
  return `
    <div class="app direct-reader-app">
      <main class="main">
        <section class="card controls-card direct-reader-hidden">
          <div class="controls-sticky-shell">
            <div class="toolbar">
              <div class="toolbar-group">
                <button type="button" id="prev-page">Prev page</button>
                <button type="button" id="next-page">Next page</button>
                <button type="button" id="prev-chunk">Prev chunk</button>
                <button type="button" id="next-chunk">Next chunk</button>
                <label class="mode-picker" for="render-mode">
                  <span>Render mode</span>
                  <select id="render-mode" name="render-mode">
                    <option value="text">Text mode</option>
                    <option value="shape">Shape mode</option>
                  </select>
                </label>
                <label class="mode-picker" for="metrics-mode">
                  <span>Metrics</span>
                  <select id="metrics-mode" name="metrics-mode">
                    <option value="text">Text metrics</option>
                    <option value="shape">Shape metrics</option>
                  </select>
                </label>
                <label class="mode-picker" for="debug-geometry">
                  <span>Geometry</span>
                  <input id="debug-geometry" name="debug-geometry" type="checkbox" />
                </label>
              </div>
              <div class="toolbar-group">
                <button type="button" id="copy-restore-token">Copy restore token</button>
                <button type="button" id="copy-selection-range">Copy selection range</button>
                <button type="button" id="create-highlight">Create highlight</button>
                <button type="button" id="add-note-selection">Add note</button>
                <button type="button" id="delete-annotation">Delete annotation</button>
                <button type="button" id="clear-selection">Clear selection</button>
                <button type="button" id="copy-selection">Copy selected text</button>
              </div>
            </div>
            <div class="toolbar restore-toolbar">
              <div class="toolbar-group token-group">
                <label for="restore-token-input">Restore token</label>
                <input id="restore-token-input" name="restore-token" type="text" />
                <button type="button" id="restore-token">Restore</button>
              </div>
            </div>
            <div class="toolbar note-toolbar">
              <div class="toolbar-group note-group">
                <label for="note-input">Note text</label>
                <textarea id="note-input" name="note-input" rows="2"></textarea>
              </div>
            </div>
          </div>
          <dl id="runtime-meta" class="meta-grid"></dl>
          <p id="status" class="status" aria-live="polite">Awaiting protected artifact.</p>
        </section>
        <section class="card reader-card" aria-hidden="false">
          <div class="reader-frame">
            <canvas id="reader-canvas"></canvas>
            <canvas id="overlay-canvas"></canvas>
          </div>
        </section>
        <section class="card direct-reader-hidden">
          <div class="section-head">
            <h2>Selection</h2>
            <span id="selection-kind" class="muted">none</span>
          </div>
          <dl id="selection-meta" class="meta-grid"></dl>
        </section>
        <section class="card annotations-card direct-reader-hidden">
          <div class="section-head">
            <h2>Annotations</h2>
            <span id="annotation-count" class="muted">0 items</span>
          </div>
          <div class="annotation-toolbar">
            <button type="button" id="add-note-highlight">Add note to highlight</button>
            <button type="button" id="export-annotations">Export protected sync file</button>
            <button type="button" id="download-sync-file">Download sync file</button>
            <button type="button" id="import-annotations">Import protected sync file</button>
            <button type="button" id="load-sync-file">Load sync file from file</button>
            <button type="button" id="copy-handoff-state">Copy handoff state</button>
            <button type="button" id="check-drive-status">Check Drive</button>
            <button type="button" id="upload-drive-file">Upload to Drive</button>
            <button type="button" id="download-drive-file">Download from Drive</button>
            <button type="button" id="apply-drive-file">Apply downloaded Drive state</button>
            <button type="button" id="clear-local-state">Clear local protected state</button>
            <button type="button" id="import-production-payload">Import production snapshot fragment</button>
            <button type="button" id="export-production-notes">Export production notes</button>
            <button type="button" id="export-share-payload">Export share payload</button>
            <button type="button" id="export-snapshot-patch">Export snapshot patch</button>
          </div>
          <input id="sync-file-input" type="file" accept="application/json,.json" hidden />
          <label class="annotation-field" for="annotation-import">
            <span>Protected sync file JSON</span>
            <textarea id="annotation-import" name="annotation-import" rows="6"></textarea>
          </label>
          <label class="annotation-field" for="handoff-state">
            <span>Protected handoff metadata</span>
            <textarea id="handoff-state" name="handoff-state" rows="6"></textarea>
          </label>
          <label class="annotation-field" for="import-report-json">
            <span>Share/import JSON / report</span>
            <textarea id="import-report-json" name="import-report-json" rows="8"></textarea>
          </label>
          <div id="annotation-list" class="annotation-list"></div>
        </section>
      </main>
    </div>
  `;
}

async function ensureDirectProtectedRuntimeMounted(root) {
  if (!root) throw new Error("Direct protected render root is missing.");
  if (!HOST_STATE.directRuntimeBootPromise) {
    HOST_STATE.directRuntimeBootPromise = (async () => {
      root.innerHTML = buildDirectProtectedRenderMarkup();
      const { bootstrapProtectedReaderIntegration } = await import("./protected-host-bootstrap.js");
      const bootstrap = await bootstrapProtectedReaderIntegration();
      if (!bootstrap || bootstrap.action !== "open-protected-reader") {
        throw new Error(`Direct protected bootstrap did not open protected reader (action: ${bootstrap && bootstrap.action ? bootstrap.action : "none"}).`);
      }
      await import("../dev/protected-reader.js?v=20260427-protected-selection-share-1");
      const startedAt = Date.now();
      const softTimeoutMs = 45000;
      const hardTimeoutMs = 180000;
      const idleProgressTimeoutMs = 15000;
      let lastProgressAt = startedAt;
      let lastProgressKey = "";
      while (Date.now() - startedAt < hardTimeoutMs) {
        const bootState = getDirectRuntimeBootState(root);
        if (bootState.ready) return;
        if (bootState.statusState === "error") {
          throw new Error(bootState.statusText || "Direct protected runtime reported an error during startup.");
        }
        if (bootState.progressKey && bootState.progressKey !== lastProgressKey) {
          lastProgressKey = bootState.progressKey;
          lastProgressAt = Date.now();
        }
        const elapsedMs = Date.now() - startedAt;
        const idleMs = Date.now() - lastProgressAt;
        if (elapsedMs >= softTimeoutMs && idleMs >= idleProgressTimeoutMs) {
          const details = describeDirectRuntimeBootState(bootState);
          throw new Error(
            `Direct protected runtime did not become ready in time.${details ? ` Last status: ${details}` : ""}`
          );
        }
        await new Promise((resolve) => window.setTimeout(resolve, 40));
      }
      const bootState = getDirectRuntimeBootState(root);
      const statusText = describeDirectRuntimeBootState(bootState);
      throw new Error(
        `Direct protected runtime did not become ready in time.${statusText ? ` Last status: ${statusText}` : ""}`
      );
    })();
  }
  await HOST_STATE.directRuntimeBootPromise;
}

async function ensureDirectProtectedHost() {
  const viewer = document.getElementById("viewer");
  if (!viewer) throw new Error("Old-shell viewer is missing.");
  viewer.replaceChildren();
  const host = document.createElement("div");
  host.id = "protectedOldShellHost";
  host.dataset.renderHost = "direct";
  const currentLayer = document.createElement("div");
  currentLayer.id = "protectedOldShellCurrentLayer";
  const root = document.createElement("div");
  root.id = "protectedDirectReaderRoot";

  const prev = document.createElement("button");
  prev.type = "button";
  prev.id = "protectedOldShellPrevEdge";
  prev.className = "protected-nav-edge prev";
  prev.textContent = "Prev";
  prev.addEventListener("click", async () => {
    await performPageTurn("prev");
  });

  const next = document.createElement("button");
  next.type = "button";
  next.id = "protectedOldShellNextEdge";
  next.className = "protected-nav-edge next";
  next.textContent = "Next";
  next.addEventListener("click", async () => {
    await performPageTurn("next");
  });

  host.append(root, currentLayer, prev, next);
  viewer.append(host);
  HOST_STATE.frame = root;
  HOST_STATE.directSurfaceRoot = root;
  syncPageTurnLayerGeometry();
  window.addEventListener("resize", syncPageTurnLayerGeometry, { passive: true });
  window.addEventListener("orientationchange", syncPageTurnLayerGeometry, { passive: true });
  setShellLoading(true);
  installTouchSwipe(host);

  await ensureDirectProtectedRuntimeMounted(root);
  syncPageTurnLayerGeometry();
  attachProtectedSurfaceInteractions(root);
  clearHostEventSubscriptions();
  installCompatEventSubscriptions(root);
  const bridge = getHostBridgeSurface(root);
  if (bridge && typeof bridge.getSummary === "function") {
    try {
      updateFromSummary(bridge.getSummary());
    } catch (_error) {}
  }
  try {
    await restoreIncomingProtectedSelectionShare();
  } catch (error) {
    setHostActionStatus(error && error.message ? error.message : "Unable to restore shared selection.");
  }
  void prepareAndSyncNeighborPreviews();
  ensureNeighborLayersMounted();
  HOST_STATE.loadingCount = 0;
  setShellLoading(false);
}

function setUnavailableMessage(message) {
  HOST_STATE.loadingCount = 0;
  setShellLoading(false);
  setReaderNewUiSmokeState({
    status: "unavailable",
    ready: false,
    lastStatusText: String(message || "")
  });
  const viewer = document.getElementById("viewer");
  if (viewer) {
    viewer.innerHTML = `<div style="padding:18px;font-family:Georgia,'Times New Roman',serif;color:#29415e">${message}</div>`;
  }
  renderStatus({
    pageLabel: "n/a",
    annotationCount: 0,
    runtimeMeta: { pilotStatus: "blocked" },
    driveStatus: { transport: "disabled" },
    statusText: message
  });
}

async function bootProtectedShellHost() {
  window.__PROTECTED_SHELL_HOST_BOOT_STARTED = true;
  if (!window.__readerpubProtectedShellMode) return;
  setReaderNewUiSmokeState({ status: "booting", ready: false });
  installProtectedViewportEnvironmentSync();
  installStyles();
  document.body.classList.add("protected-shell");
  document.body.classList.toggle("protected-dev-panel", isDevPanelEnabled());
  installProtectedAddressBarToggle();
  installTouchUiVisibilityGuard();
  hideShellUi();
  setShellLoading(true);

  ensureActionBar();
  bindShellControls();
  const route = parseProtectedIntegrationRoute(window.location.href);
  const rollout = resolveProtectedReaderRollout(route);
  const eligibility = await assessProtectedReaderEligibility(route, rollout);
  const pilot = resolveProtectedReaderPilot(route, rollout, eligibility);
  const rolloutStatus = buildProtectedReaderStatus(route, rollout, eligibility, pilot);
  HOST_STATE.route = route;
  HOST_STATE.rolloutStatus = rolloutStatus;

  if (rolloutStatus.action === "protected-unavailable-show-message") {
    setUnavailableMessage(rolloutStatus.message);
    return;
  }

  await ensureProtectedHost();
  HOST_STATE.loadingCount = 0;
  setShellLoading(false);
  setReaderNewUiSmokeState({ status: "host-mounted", ready: !!(HOST_STATE.lastSummary && HOST_STATE.lastSummary.ready) });
}

function scheduleHostBoot() {
  window.__PROTECTED_SHELL_HOST_BOOT_SCHEDULED = true;
  setReaderNewUiSmokeState({ status: "boot-scheduled", ready: false });
  const run = () => {
    bootProtectedShellHost().catch((error) => {
      console.error(error);
      window.__PROTECTED_SHELL_HOST_ERROR = error && error.message ? error.message : String(error);
      setReaderNewUiSmokeState({
        status: "boot-failed",
        ready: false,
        lastStatusText: error && error.message ? error.message : String(error)
      });
      setUnavailableMessage(error && error.message ? error.message : "Protected shell host failed to boot.");
    });
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
    return;
  }
  run();
}

function waitForConfigAndBoot() {
  const hasProtectedConfig = !!window.__READERPUB_PROTECTED_HOST_CONFIG__;
  if (hasProtectedConfig) {
    scheduleHostBoot();
    return;
  }
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    const nextProtectedConfig = !!window.__READERPUB_PROTECTED_HOST_CONFIG__;
    if (nextProtectedConfig) {
      window.clearInterval(timer);
      scheduleHostBoot();
      return;
    }
    if (attempts >= 100) {
      window.clearInterval(timer);
    }
  }, 50);
}

waitForConfigAndBoot();
installProtectedSelectionShareDebug();
window.__readerpubApplyUnifiedShellChrome = applyUnifiedShellChrome;
window.__readerpubEnsureUnifiedShellOverlays = function () {
  ensureLibraryOverlay();
  ensureSettingsOverlay();
  syncProtectedShellIcons();
  installProtectedAddressBarToggle();
};
try {
  const host = String((window.location && window.location.hostname) || "").trim().toLowerCase();
  if (host === "127.0.0.1" || host === "localhost" || host === "::1") {
    window.__readerpubDebugOpenProtectedNoteComposer = openProtectedNoteComposer;
    window.__readerpubDebugOpenProtectedNoteComposerWithCapture = function (capture) {
      return openProtectedNoteComposer(capture || null);
    };
  }
} catch (_error) {}
window.addEventListener(
  "readerpub:protected-shell-config",
  () => {
    waitForConfigAndBoot();
  },
  { once: true }
);
window.addEventListener(
  "readerpub:protected-host-config",
  () => {
    waitForConfigAndBoot();
  },
  { once: true }
);
