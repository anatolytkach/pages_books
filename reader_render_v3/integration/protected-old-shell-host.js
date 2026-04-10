import { parseProtectedIntegrationRoute } from "./protected-reader-routing.js";
import { resolveProtectedReaderRollout } from "./protected-reader-rollout.js";
import { assessProtectedReaderEligibility } from "./protected-reader-eligibility.js";
import { resolveProtectedReaderPilot } from "./protected-reader-pilot.js";
import { buildProtectedReaderStatus } from "./protected-reader-status.js";

const HOST_STYLE_ID = "protected-old-shell-host-css";
window.__PROTECTED_OLD_SHELL_HOST_LOADED = true;
const HOST_STATE = {
  route: null,
  rolloutStatus: null,
  lastSummary: null,
  activeConfigGeneration: 0,
  activeLayoutGeneration: 0,
  frame: null,
  pollTimer: null,
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
  touchSelectionInProgress: false,
  suppressSelectionDismissUntil: 0,
  cachedSelectionActionState: null,
  suppressSelectionToolbarUntil: 0,
  bookmarkRestoreInFlight: "",
  searchSidebarState: null,
  searchSidebarSubmitted: false,
  searchSidebarPendingQuery: "",
  searchSidebarForceEmpty: false,
  bookmarkPageLookupToken: 0,
  bookmarkPageLookupSignature: "",
  turnPreviewSyncTimer: null,
  turnPreviewPromise: null,
  lastTurnPreviewKey: "",
  turnInFlight: false,
  suppressTouchAutoHideUntil: 0,
  suppressSyntheticClickUntil: 0,
  touchUiGuardInstalled: false,
  tts: {
    active: false,
    token: 0
  }
};

const BOOKMARK_STORAGE_PREFIX = "readerpub:protected-old-shell:bookmarks:";
const FONT_SCALE_STORAGE_PREFIX = "readerpub:protected-old-shell:font-scale:";
const FONT_MODE_STORAGE_PREFIX = "readerpub:protected-old-shell:font-mode:";
const PROTECTED_SEARCH_ICON_SRC = "icons/search.svg?v=20260303-icons-tight-x-3";
const PROTECTED_TOC_ICON_SRC = "/reader_render_v3/assets/toc.svg";
const PROTECTED_SETTINGS_ICON_SRC = "/reader_render_v3/assets/settings.svg";
const PROTECTED_THEME_ICON_SRC = "/reader_render_v3/assets/theme.svg";
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

function classifyBridgeUpdate(method) {
  if (method === "setFontScale" || method === "setFontMode") return "layout-affecting";
  if (method === "setTheme") return "redraw-only";
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
    if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
  } catch (_error) {}
  try {
    if (navigator && Number(navigator.maxTouchPoints || 0) > 0) return true;
  } catch (_error) {}
  try {
    const ua = String((navigator && navigator.userAgent) || "");
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return true;
  } catch (_error) {}
  try {
    const vw = Math.max(
      Number(window.innerWidth || 0),
      Number((document.documentElement && document.documentElement.clientWidth) || 0)
    );
    if (vw && vw <= 1024) return true;
  } catch (_error) {}
  return false;
}

function showShellUi(source = "programmatic") {
  try {
    if (typeof window.__fbShowUi === "function") {
      window.__fbShowUi();
    } else {
      document.body.classList.remove("ui-hidden");
    }
  } catch (_error) {}
  try {
    if (source === "touch-center") window.__readerpubProtectedUserShowUiAt = Date.now();
  } catch (_error) {}
  if (source === "touch-center" && isTouchShellMode()) {
    HOST_STATE.suppressTouchAutoHideUntil = Date.now() + 900;
  }
}

function hideShellUi(source = "programmatic") {
  if (
    source !== "touch-center" &&
    isTouchShellMode() &&
    Date.now() < Number(HOST_STATE.suppressTouchAutoHideUntil || 0)
  ) {
    return;
  }
  try {
    if (typeof window.__fbHideUi === "function") {
      window.__fbHideUi();
    } else {
      document.body.classList.add("ui-hidden");
    }
  } catch (_error) {}
}

function toggleShellUi(source = "programmatic") {
  if (document.body.classList.contains("ui-hidden")) {
    showShellUi(source);
    if (source === "touch-center" && isTouchShellMode()) {
      HOST_STATE.suppressSyntheticClickUntil = Date.now() + 900;
    }
    return;
  }
  hideShellUi(source);
}

function installTouchUiVisibilityGuard() {
  if (HOST_STATE.touchUiGuardInstalled) return;
  HOST_STATE.touchUiGuardInstalled = true;
  if (!window.MutationObserver || !document.body) return;
  const observer = new MutationObserver(() => {
    if (!isTouchShellMode()) return;
    if (Date.now() >= Number(HOST_STATE.suppressTouchAutoHideUntil || 0)) return;
    if (!document.body.classList.contains("ui-hidden")) return;
    document.body.classList.remove("ui-hidden");
    try {
      if (typeof window.__fbShowUi === "function") window.__fbShowUi();
    } catch (_error) {}
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
}

function installStyles() {
  if (document.getElementById(HOST_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = HOST_STYLE_ID;
  style.textContent = `
    body.protected-old-shell {
      overflow: hidden;
      -webkit-tap-highlight-color: transparent !important;
    }
    body.protected-old-shell #ttsToggleMobile,
    body.protected-old-shell #addressBarToggle,
    body.protected-old-shell #fullscreen {
      display: none !important;
    }
    body.protected-old-shell #viewerStack {
      overflow: hidden;
      -webkit-tap-highlight-color: transparent !important;
    }
    body.protected-old-shell #fb-tap-layer {
      display: none !important;
    }
    body.protected-old-shell #viewer,
    body.protected-old-shell #viewerStack.swiping #viewer {
      background: transparent !important;
    }
    body.protected-old-shell #viewer-prev,
    body.protected-old-shell #viewer-next {
      display: block;
      pointer-events: none;
      -webkit-tap-highlight-color: transparent !important;
    }
    body.protected-old-shell #viewer-prev .protected-turn-layer,
    body.protected-old-shell #viewer-next .protected-turn-layer {
      position: absolute;
      inset: 0;
      display: block;
      overflow: hidden;
      background: transparent;
    }
    body.protected-old-shell #viewer-prev .protected-turn-layer canvas,
    body.protected-old-shell #viewer-next .protected-turn-layer canvas {
      position: absolute;
      display: block;
    }
    body.protected-old-shell #swipe-shadow {
    }
    body.protected-old-shell #viewerStack.swiping #swipe-shadow {
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
    body.protected-old-shell #viewerStack.swiping #protectedOldShellCurrentLayer {
      box-shadow: none;
    }
    body.protected-old-shell #viewerStack.swiping.shadow-right #protectedOldShellCurrentLayer {
      box-shadow: 6px 0 10px rgba(0,0,0,0.28);
    }
    body.protected-old-shell #viewerStack.swiping.shadow-left #protectedOldShellCurrentLayer {
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
    body.protected-old-shell.protected-dev-panel #protectedShellActionBar {
      display: flex;
    }
    body.protected-old-shell #searchDesktop,
    body.protected-old-shell #searchbar {
      display: none !important;
    }
    body.protected-old-shell #title-controls {
      display: inline-flex;
      align-items: center;
      gap: 14px;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-old-shell #titlebar {
      --titlebar-h: 43px;
      min-height: 43px !important;
      height: 43px !important;
      padding-top: 3px !important;
      padding-bottom: 3px !important;
      position: relative;
      align-items: center;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-old-shell #title-controls {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      z-index: 2;
      gap: 14px;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-old-shell #opener {
      display: none !important;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-old-shell #slider,
    html:not(.is-phone):not(.is-tablet) body.protected-old-shell #openNotes,
    html:not(.is-phone):not(.is-tablet) body.protected-old-shell #openBookmarks,
    html:not(.is-phone):not(.is-tablet) body.protected-old-shell #overlay-menu {
      display: none !important;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-old-shell #metainfo {
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
    html:not(.is-phone):not(.is-tablet) body.protected-old-shell #metaText {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
      line-height: 1.18;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-old-shell #book-title,
    html:not(.is-phone):not(.is-tablet) body.protected-old-shell #chapter-title {
      width: 100%;
      text-align: center;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-old-shell #book-title {
      font-size: 14px;
      font-weight: 600;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-old-shell #chapter-title {
      margin-top: 4px;
      font-size: 11px;
      opacity: 0.9;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-old-shell .protected-top-left-links {
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
    html:not(.is-phone):not(.is-tablet) body.protected-old-shell .protected-top-link {
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
    html:not(.is-phone):not(.is-tablet) body.protected-old-shell .protected-top-link-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-old-shell .protected-top-link-label {
      display: block;
      min-width: 0;
      overflow: visible;
      text-overflow: clip;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-old-shell .protected-top-link:hover,
    html:not(.is-phone):not(.is-tablet) body.protected-old-shell .protected-top-link:focus-visible {
      opacity: 0.92;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-old-shell .protected-top-link svg {
      width: 20px;
      height: 20px;
      display: block;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-old-shell .protected-top-link-catalog svg,
    html.is-phone body.protected-old-shell #protectedBottomCatalogLink svg,
    html.is-tablet body.protected-old-shell #protectedBottomCatalogLink svg {
      fill: currentColor !important;
      stroke: none !important;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-old-shell #title-controls > #ttsToggleDesktop,
    html:not(.is-phone):not(.is-tablet) body.protected-old-shell #title-controls > #themeToggle,
    html:not(.is-phone):not(.is-tablet) body.protected-old-shell #protectedLibraryControl,
    html:not(.is-phone):not(.is-tablet) body.protected-old-shell #protectedSearchControl,
    html:not(.is-phone):not(.is-tablet) body.protected-old-shell #protectedTypographyControl {
      width: 24px;
      min-width: 24px;
      height: 24px;
    }
    html:not(.is-phone):not(.is-tablet) body.protected-old-shell #ttsToggleDesktop .tts-icon,
    html:not(.is-phone):not(.is-tablet) body.protected-old-shell #themeToggle .theme-icon,
    html:not(.is-phone):not(.is-tablet) body.protected-old-shell #protectedLibraryTrigger img,
    html:not(.is-phone):not(.is-tablet) body.protected-old-shell #protectedSearchTrigger img,
    html:not(.is-phone):not(.is-tablet) body.protected-old-shell #protectedTypographyTrigger img {
      width: 18px;
      height: 18px;
    }
    body.protected-old-shell #themeToggle,
    body.protected-old-shell #ttsToggleDesktop,
    body.protected-old-shell #bookmark {
      display: inline-flex !important;
    }
    body.protected-old-shell #mobileMoreToggle,
    body.protected-old-shell #mobileMorePanel,
    body.protected-old-shell #mobileMoreBackdrop {
      display: none !important;
    }
    html.is-phone body.protected-old-shell #opener,
    html.is-tablet body.protected-old-shell #opener {
      min-width: 24px;
      margin-right: 4px;
    }
    html.is-phone body.protected-old-shell #opener #openNotes,
    html.is-phone body.protected-old-shell #opener #openBookmarks,
    html.is-tablet body.protected-old-shell #opener #openNotes,
    html.is-tablet body.protected-old-shell #opener #openBookmarks {
      display: none !important;
    }
    html.is-phone body.protected-old-shell .protected-top-left-links,
    html.is-tablet body.protected-old-shell .protected-top-left-links {
      display: none !important;
    }
    html.is-phone body.protected-old-shell #title-controls,
    html.is-tablet body.protected-old-shell #title-controls {
      gap: 12px !important;
      transform: translateX(6px);
    }
    html.is-phone body.protected-old-shell #title-controls > #ttsToggleDesktop,
    html.is-phone body.protected-old-shell #title-controls > #themeToggle,
    html.is-phone body.protected-old-shell #protectedLibraryControl,
    html.is-phone body.protected-old-shell #protectedSearchControl,
    html.is-phone body.protected-old-shell #protectedTypographyControl,
    html.is-tablet body.protected-old-shell #title-controls > #ttsToggleDesktop,
    html.is-tablet body.protected-old-shell #title-controls > #themeToggle,
    html.is-tablet body.protected-old-shell #protectedLibraryControl,
    html.is-tablet body.protected-old-shell #protectedSearchControl,
    html.is-tablet body.protected-old-shell #protectedTypographyControl {
      width: 28px;
      min-width: 28px;
    }
    body.protected-old-shell #title-controls > #ttsToggleDesktop,
    body.protected-old-shell #title-controls > #themeToggle,
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
    body.protected-old-shell #ttsToggleDesktop {
      order: 59;
      display: inline-flex !important;
    }
    body.protected-old-shell #ttsToggleDesktop .tts-icon {
      width: 20px;
      height: 20px;
      object-fit: contain;
    }
    html.is-phone body.protected-old-shell #ttsToggleDesktop,
    html.is-tablet body.protected-old-shell #ttsToggleDesktop {
      display: inline-flex !important;
    }
    html.is-phone body.protected-old-shell #ttsToggleMobile,
    html.is-tablet body.protected-old-shell #ttsToggleMobile {
      display: none !important;
    }
    @media (min-width: 820px) {
      body.protected-old-shell #titlebar {
        --titlebar-h: 43px;
        min-height: 43px !important;
        height: 43px !important;
        padding-top: 3px !important;
        padding-bottom: 3px !important;
        position: relative;
        align-items: center;
      }
      body.protected-old-shell #opener {
        display: none !important;
      }
      body.protected-old-shell #slider,
      body.protected-old-shell #openNotes,
      body.protected-old-shell #openBookmarks,
      body.protected-old-shell #overlay-menu {
        display: none !important;
      }
      body.protected-old-shell #metainfo {
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
      body.protected-old-shell #metaText {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        line-height: 1.18;
      }
      body.protected-old-shell #book-title,
      body.protected-old-shell #chapter-title {
        width: 100%;
        text-align: center;
      }
      body.protected-old-shell #book-title {
        font-size: 14px;
        font-weight: 600;
      }
      body.protected-old-shell #chapter-title {
        margin-top: 4px;
        font-size: 11px;
        opacity: 0.9;
      }
      body.protected-old-shell .protected-top-left-links {
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
      body.protected-old-shell #title-controls {
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        z-index: 2;
        gap: 14px !important;
      }
      body.protected-old-shell #title-controls > #ttsToggleDesktop,
      body.protected-old-shell #title-controls > #themeToggle,
      body.protected-old-shell #protectedLibraryControl,
      body.protected-old-shell #protectedSearchControl,
      body.protected-old-shell #protectedTypographyControl {
        width: 24px;
        min-width: 24px;
        height: 24px;
      }
      body.protected-old-shell #ttsToggleDesktop .tts-icon,
      body.protected-old-shell #themeToggle .theme-icon,
      body.protected-old-shell #protectedLibraryTrigger img,
      body.protected-old-shell #protectedSearchTrigger img,
      body.protected-old-shell #protectedTypographyTrigger img {
        width: 18px;
        height: 18px;
      }
      body.protected-old-shell #protectedBottomCatalogLink {
        display: none !important;
      }
    }
    @media (orientation: landscape) {
      html.is-phone body.protected-old-shell #titlebar,
      html.is-tablet body.protected-old-shell #titlebar {
        --titlebar-h: 43px;
        min-height: 43px !important;
        height: 43px !important;
        padding-top: 3px !important;
        padding-bottom: 3px !important;
        position: relative;
        align-items: center;
      }
      html.is-phone body.protected-old-shell #opener,
      html.is-tablet body.protected-old-shell #opener {
        display: none !important;
      }
      html.is-phone body.protected-old-shell #slider,
      html.is-phone body.protected-old-shell #openNotes,
      html.is-phone body.protected-old-shell #openBookmarks,
      html.is-phone body.protected-old-shell #overlay-menu,
      html.is-tablet body.protected-old-shell #slider,
      html.is-tablet body.protected-old-shell #openNotes,
      html.is-tablet body.protected-old-shell #openBookmarks,
      html.is-tablet body.protected-old-shell #overlay-menu {
        display: none !important;
      }
      html.is-phone body.protected-old-shell #metainfo,
      html.is-tablet body.protected-old-shell #metainfo {
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
      html.is-phone body.protected-old-shell #metaText,
      html.is-tablet body.protected-old-shell #metaText {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        line-height: 1.18;
      }
      html.is-phone body.protected-old-shell #book-title,
      html.is-phone body.protected-old-shell #chapter-title,
      html.is-tablet body.protected-old-shell #book-title,
      html.is-tablet body.protected-old-shell #chapter-title {
        width: 100%;
        text-align: center;
      }
      html.is-phone body.protected-old-shell #book-title,
      html.is-tablet body.protected-old-shell #book-title {
        font-size: 14px;
        font-weight: 600;
      }
      html.is-phone body.protected-old-shell #chapter-title,
      html.is-tablet body.protected-old-shell #chapter-title {
        margin-top: 4px;
        font-size: 11px;
        opacity: 0.9;
      }
      html.is-phone body.protected-old-shell .protected-top-left-links,
      html.is-tablet body.protected-old-shell .protected-top-left-links {
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
      html.is-phone body.protected-old-shell .protected-top-link,
      html.is-tablet body.protected-old-shell .protected-top-link {
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
      html.is-phone body.protected-old-shell .protected-top-link-icon,
      html.is-tablet body.protected-old-shell .protected-top-link-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
      }
      html.is-phone body.protected-old-shell .protected-top-link-label,
      html.is-tablet body.protected-old-shell .protected-top-link-label {
        display: block;
        min-width: 0;
        overflow: visible;
        text-overflow: clip;
      }
      html.is-phone body.protected-old-shell .protected-top-link svg,
      html.is-tablet body.protected-old-shell .protected-top-link svg {
        width: 20px;
        height: 20px;
        display: block;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      html.is-phone body.protected-old-shell .protected-top-link-catalog svg,
      html.is-tablet body.protected-old-shell .protected-top-link-catalog svg {
        fill: currentColor !important;
        stroke: none !important;
      }
      html.is-phone body.protected-old-shell #title-controls,
      html.is-tablet body.protected-old-shell #title-controls {
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        z-index: 2;
        gap: 14px !important;
      }
      html.is-phone body.protected-old-shell #title-controls > #ttsToggleDesktop,
      html.is-phone body.protected-old-shell #title-controls > #themeToggle,
      html.is-phone body.protected-old-shell #protectedLibraryControl,
      html.is-phone body.protected-old-shell #protectedSearchControl,
      html.is-phone body.protected-old-shell #protectedTypographyControl,
      html.is-tablet body.protected-old-shell #title-controls > #ttsToggleDesktop,
      html.is-tablet body.protected-old-shell #title-controls > #themeToggle,
      html.is-tablet body.protected-old-shell #protectedLibraryControl,
      html.is-tablet body.protected-old-shell #protectedSearchControl,
      html.is-tablet body.protected-old-shell #protectedTypographyControl {
        width: 24px;
        min-width: 24px;
        height: 24px;
      }
      html.is-phone body.protected-old-shell #ttsToggleDesktop .tts-icon,
      html.is-phone body.protected-old-shell #themeToggle .theme-icon,
      html.is-phone body.protected-old-shell #protectedLibraryTrigger img,
      html.is-phone body.protected-old-shell #protectedSearchTrigger img,
      html.is-phone body.protected-old-shell #protectedTypographyTrigger img,
      html.is-tablet body.protected-old-shell #ttsToggleDesktop .tts-icon,
      html.is-tablet body.protected-old-shell #themeToggle .theme-icon,
      html.is-tablet body.protected-old-shell #protectedLibraryTrigger img,
      html.is-tablet body.protected-old-shell #protectedSearchTrigger img,
      html.is-tablet body.protected-old-shell #protectedTypographyTrigger img {
        width: 18px;
        height: 18px;
      }
      html.is-phone body.protected-old-shell #protectedBottomCatalogLink,
      html.is-tablet body.protected-old-shell #protectedBottomCatalogLink {
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
      html.is-phone body.protected-old-shell #protectedBottomCatalogLink svg,
      html.is-tablet body.protected-old-shell #protectedBottomCatalogLink svg {
        width: 18px;
        height: 18px;
        display: block;
        fill: currentColor !important;
        stroke: none !important;
      }
      html.is-phone body.protected-old-shell #protectedBottomCatalogLink,
      html.is-tablet body.protected-old-shell #protectedBottomCatalogLink {
        display: none !important;
      }
    }
    body.protected-old-shell #bottombar #bookmark {
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
    html.is-phone body.protected-old-shell #bottombar #bookmark,
    html.is-tablet body.protected-old-shell #bottombar #bookmark {
      display: inline-flex !important;
      right: calc(14px + env(safe-area-inset-right, 0px));
    }
    @media (orientation: portrait) {
      html.is-phone body.protected-old-shell #opener,
      html.is-tablet body.protected-old-shell #opener,
      html.is-phone body.protected-old-shell #slider,
      html.is-phone body.protected-old-shell #openNotes,
      html.is-phone body.protected-old-shell #openBookmarks,
      html.is-phone body.protected-old-shell #overlay-menu,
      html.is-tablet body.protected-old-shell #slider,
      html.is-tablet body.protected-old-shell #openNotes,
      html.is-tablet body.protected-old-shell #openBookmarks,
      html.is-tablet body.protected-old-shell #overlay-menu {
        display: none !important;
      }
      html.is-phone body.protected-old-shell #bottombar #page-count,
      html.is-tablet body.protected-old-shell #bottombar #page-count {
        position: absolute;
        right: calc(52px + env(safe-area-inset-right, 0px));
        left: auto;
        transform: translateY(-50%);
        top: 50%;
        width: auto;
        text-align: right;
        white-space: nowrap;
      }
      html.is-phone body.protected-old-shell #metaText,
      html.is-tablet body.protected-old-shell #metaText {
        line-height: 1.18;
      }
      html.is-phone body.protected-old-shell #chapter-title,
      html.is-tablet body.protected-old-shell #chapter-title {
        margin-top: 4px;
      }
      html.is-phone body.protected-old-shell #overlay-settings,
      html.is-phone body.protected-old-shell #overlay-library,
      html.is-phone body.protected-old-shell #overlay-search {
        left: 0;
        right: 0;
        width: 100vw;
        max-width: 100vw;
      }
    }
    body.protected-old-shell #protectedBottomCatalogLink {
      display: none;
    }
    html.is-phone body.protected-old-shell #protectedBottomCatalogLink,
    html.is-tablet body.protected-old-shell #protectedBottomCatalogLink {
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
    html.is-phone body.protected-old-shell #protectedBottomCatalogLink svg,
    html.is-tablet body.protected-old-shell #protectedBottomCatalogLink svg {
      width: 18px;
      height: 18px;
      display: block;
      fill: currentColor;
      stroke: none;
    }
    html.is-phone body.protected-old-shell.android #addressBarToggle,
    html.is-tablet body.protected-old-shell.android #addressBarToggle {
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
    html.is-phone body.protected-old-shell.android #addressBarToggle .ab-icon,
    html.is-tablet body.protected-old-shell.android #addressBarToggle .ab-icon {
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
    html.is-phone body.protected-old-shell.android #addressBarToggle.ab-state-full .ab-icon-full,
    html.is-tablet body.protected-old-shell.android #addressBarToggle.ab-state-full .ab-icon-full {
      display: block !important;
    }
    html.is-phone body.protected-old-shell.android #addressBarToggle.ab-state-small .ab-icon-small,
    html.is-tablet body.protected-old-shell.android #addressBarToggle.ab-state-small .ab-icon-small {
      display: block !important;
    }
    html.is-phone body.protected-old-shell.android #bottombar #bookmark,
    html.is-tablet body.protected-old-shell.android #bottombar #bookmark {
      right: calc(52px + env(safe-area-inset-right, 0px));
    }
    @media (orientation: portrait) {
      html.is-phone body.protected-old-shell.android #bottombar #page-count,
      html.is-tablet body.protected-old-shell.android #bottombar #page-count {
        right: calc(92px + env(safe-area-inset-right, 0px));
      }
    }
    @media (orientation: landscape) {
      html.is-phone body.protected-old-shell #bottombar #page-count,
      html.is-tablet body.protected-old-shell #bottombar #page-count,
      html.is-phone body.protected-old-shell.android #bottombar #page-count,
      html.is-tablet body.protected-old-shell.android #bottombar #page-count {
        position: absolute;
        left: 50%;
        right: auto;
        top: 50%;
        transform: translate(-50%, -50%);
        width: auto;
        text-align: center;
        white-space: nowrap;
      }
      html.is-phone body.protected-old-shell #overlay-backdrop:not(.hidden),
      html.is-tablet body.protected-old-shell #overlay-backdrop:not(.hidden) {
        display: block !important;
      }
    }
    body.protected-old-shell #fontDec,
    body.protected-old-shell #fontInc {
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
    body.protected-old-shell #themeToggle {
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
    body.protected-old-shell #themeToggle .theme-icon {
      width: 20px;
      height: 20px;
      display: block;
      object-fit: contain;
    }
    body.protected-old-shell #themeToggle,
    body.protected-old-shell #ttsToggleDesktop,
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
    body.protected-old-shell #themeToggle:hover,
    body.protected-old-shell #themeToggle:focus-visible,
    body.protected-old-shell #ttsToggleDesktop:hover,
    body.protected-old-shell #ttsToggleDesktop:focus-visible,
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
    }
    #overlay-search {
      left: auto;
      right: 0;
      width: 360px;
      max-width: min(100vw, 360px);
      z-index: 9999;
    }
    #overlay-library .overlay-scroll {
      padding-top: 10px;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    #overlay-library .overlay-scroll::-webkit-scrollbar {
      width: 0;
      height: 0;
      display: none;
    }
    #overlay-search .overlay-scroll {
      padding-top: 10px;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    #overlay-search .overlay-scroll::-webkit-scrollbar {
      width: 0;
      height: 0;
      display: none;
    }
    #protectedSearchPanel {
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-height: 0;
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
      list-style: none;
      margin: 0;
      padding: 0;
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
    body.protected-old-shell #overlay-library #tocView ul,
    body.protected-old-shell #overlay-library #protectedLibraryBookmarksList,
    body.protected-old-shell #overlay-library #bookmarksView ul,
    body.protected-old-shell #overlay-library #notes,
    body.protected-old-shell #overlay-library #mybooks {
      padding-left: 20px;
      margin-top: 0;
      margin-bottom: 24px;
    }
    body.protected-old-shell #overlay-library #tocView li,
    body.protected-old-shell #overlay-library #protectedLibraryBookmarksList li,
    body.protected-old-shell #overlay-library #bookmarksView li,
    body.protected-old-shell #overlay-library #notes > li.list_item,
    body.protected-old-shell #overlay-library #mybooks > li.list_item {
      width: auto;
      background: transparent;
      border: 0;
      box-shadow: none;
    }
    body.protected-old-shell #overlay-library #tocView a,
    body.protected-old-shell #overlay-library #tocView .toc_link,
    body.protected-old-shell #overlay-library #protectedLibraryBookmarksList a,
    body.protected-old-shell #overlay-library #protectedLibraryBookmarksList button.bookmark_link,
    body.protected-old-shell #overlay-library #notesView a,
    body.protected-old-shell #overlay-library #notesView button.bookmark_link,
    body.protected-old-shell #overlay-library #bookmarksView a,
    body.protected-old-shell #overlay-library #bookmarksView button.bookmark_link,
    body.protected-old-shell #overlay-library #notes .bookmark_link,
    body.protected-old-shell #overlay-library #notes .bookmark-comment,
    body.protected-old-shell #overlay-library #mybooks a,
    body.protected-old-shell #overlay-library #mybooks .book-title,
    body.protected-old-shell #overlay-library #mybooks .book-meta {
      color: inherit;
      background: transparent !important;
    }
    body.protected-old-shell #overlay-library #protectedLibraryBookmarksList {
      list-style: none;
    }
    body.protected-old-shell #overlay-library #protectedLibraryBookmarksList > li.list_item,
    body.protected-old-shell #overlay-library #notesView > li.list_item,
    body.protected-old-shell #overlay-library #notes > li.list_item,
    body.protected-old-shell #overlay-library #bookmarksView > li.list_item,
    body.protected-old-shell #overlay-library #bookmarks > li.list_item,
    body.protected-old-shell #overlay-library #mybooks > li.list_item {
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
    body.protected-old-shell #overlay-library #protectedLibraryBookmarksList > li.list_item:last-child,
    body.protected-old-shell #overlay-library #notesView > li.list_item:last-child,
    body.protected-old-shell #overlay-library #notes > li.list_item:last-child,
    body.protected-old-shell #overlay-library #bookmarksView > li.list_item:last-child,
    body.protected-old-shell #overlay-library #bookmarks > li.list_item:last-child,
    body.protected-old-shell #overlay-library #mybooks > li.list_item:last-child {
      margin-bottom: 0;
      border-bottom: 0;
    }
    body.protected-old-shell #overlay-library #protectedLibraryBookmarksList .bookmark-text,
    body.protected-old-shell #overlay-library #notesView .bookmark-text,
    body.protected-old-shell #overlay-library #notes .bookmark-text,
    body.protected-old-shell #overlay-library #bookmarksView .bookmark-text,
    body.protected-old-shell #overlay-library #bookmarks .bookmark-text,
    body.protected-old-shell #overlay-library #mybooks .bookmark-text {
      flex: 1 1 auto;
      min-width: 0;
      margin: 0;
      padding: 0;
    }
    body.protected-old-shell #overlay-library #notesView .bookmark-page-label,
    body.protected-old-shell #overlay-library #notes .bookmark-page-label {
      display: block;
      margin: 0 0 6px;
      padding: 0;
      font-size: 1em;
      line-height: 1.1;
      color: rgba(255,255,255,0.95);
    }
    body.protected-old-shell #overlay-library #protectedLibraryBookmarksList .bookmark_link,
    body.protected-old-shell #overlay-library #notesView .bookmark_link,
    body.protected-old-shell #overlay-library #notes .bookmark_link,
    body.protected-old-shell #overlay-library #bookmarksView .bookmark_link,
    body.protected-old-shell #overlay-library #bookmarks .bookmark_link,
    body.protected-old-shell #overlay-library #mybooks .bookmark_link {
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
    body.protected-old-shell #overlay-library #mybooks .bookmark_link {
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
    body.protected-old-shell #overlay-library #notesView .bookmark_link,
    body.protected-old-shell #overlay-library #notes .bookmark_link {
      font-size: 0.84em;
      line-height: 1.32;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      text-overflow: ellipsis;
      color: rgba(255,255,255,0.92);
    }
    body.protected-old-shell #overlay-library #protectedLibraryBookmarksList .bookmark-comment,
    body.protected-old-shell #overlay-library #notesView .bookmark-comment,
    body.protected-old-shell #overlay-library #notes .bookmark-comment,
    body.protected-old-shell #overlay-library #bookmarksView .bookmark-comment,
    body.protected-old-shell #overlay-library #bookmarks .bookmark-comment,
    body.protected-old-shell #overlay-library #mybooks .bookmark-comment {
      margin: 6px 0 0;
      padding: 0;
      font-size: 0.84em;
      line-height: 1.28;
      user-select: none;
      -webkit-user-select: none;
    }
    body.protected-old-shell #overlay-library #mybooks .bookmark-comment {
      color: rgba(255,255,255,0.56);
      font-size: 0.78em;
      line-height: 1.24;
    }
    body.protected-old-shell #protectedSettingsBookCardMount {
      margin: 0 0 18px;
      padding: 0 0 18px;
      border-bottom: 1px solid rgba(255,255,255,0.14);
    }
    body.protected-old-shell #protectedSettingsBookCardMount #menuBookCard {
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
    body.protected-old-shell #protectedSettingsBookCardMount #menuBookCard > * {
      min-width: 0;
    }
    body.protected-old-shell #protectedSettingsBookCardMount .menu-book-cover-wrap {
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
    body.protected-old-shell #protectedSettingsBookCardMount #menuBookCover,
    body.protected-old-shell #protectedSettingsBookCardMount .menu-book-cover,
    body.protected-old-shell #protectedSettingsBookCardMount .menu-book-cover-placeholder {
      width: 100%;
      height: 100%;
    }
    body.protected-old-shell #protectedSettingsBookCardMount #menuBookCover,
    body.protected-old-shell #protectedSettingsBookCardMount .menu-book-cover {
      display: block;
      object-fit: contain;
      object-position: left center;
    }
    body.protected-old-shell #protectedSettingsBookCardMount .menu-book-cover-placeholder {
      background: transparent;
      border: 0;
    }
    body.protected-old-shell #protectedSettingsBookCardMount .menu-book-meta {
      min-width: 0;
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    body.protected-old-shell #protectedSettingsBookCardMount #menuBookTitle,
    body.protected-old-shell #protectedSettingsBookCardMount #menuBookAuthor {
      width: auto;
      text-align: left;
      line-height: 1.35;
    }
    body.protected-old-shell #protectedSettingsBookCardMount #menuBookTitle {
      font-size: 18px;
      font-weight: 600;
      margin: 0;
    }
    body.protected-old-shell #protectedSettingsBookCardMount #menuBookAuthor {
      font-size: 14px;
      opacity: 0.9;
      margin: 8px 0 0;
    }
    body.protected-old-shell #overlay-library #notesView .bookmark-comment,
    body.protected-old-shell #overlay-library #notes .bookmark-comment {
      margin-top: 10px;
      font-size: 1em;
      line-height: 1.34;
      color: rgba(255,255,255,0.96);
    }
    body.protected-old-shell #overlay-library #protectedLibraryBookmarksList .bookmark-delete,
    body.protected-old-shell #overlay-library #notesView .bookmark-delete,
    body.protected-old-shell #overlay-library #notes .bookmark-delete,
    body.protected-old-shell #overlay-library #bookmarksView .bookmark-delete,
    body.protected-old-shell #overlay-library #bookmarks .bookmark-delete,
    body.protected-old-shell #overlay-library #mybooks .bookmark-delete {
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
    body.protected-old-shell #overlay-library #protectedLibraryBookmarksList .bookmark-delete:hover,
    body.protected-old-shell #overlay-library #notesView .bookmark-delete:hover,
    body.protected-old-shell #overlay-library #notes .bookmark-delete:hover,
    body.protected-old-shell #overlay-library #bookmarksView .bookmark-delete:hover,
    body.protected-old-shell #overlay-library #bookmarks .bookmark-delete:hover,
    body.protected-old-shell #overlay-library #mybooks .bookmark-delete:hover {
      opacity: 1;
    }
    body.protected-old-shell #overlay-library #protectedLibraryBookmarksList .bookmark-delete svg,
    body.protected-old-shell #overlay-library #notesView .bookmark-delete svg,
    body.protected-old-shell #overlay-library #notes .bookmark-delete svg,
    body.protected-old-shell #overlay-library #bookmarksView .bookmark-delete svg,
    body.protected-old-shell #overlay-library #bookmarks .bookmark-delete svg,
    body.protected-old-shell #overlay-library #mybooks .bookmark-delete svg {
      width: 18px;
      height: 18px;
      stroke: currentColor;
      stroke-width: 1.8;
      fill: none;
    }
    body.protected-old-shell #overlay-library #tocView button {
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
    body.protected-old-shell #overlay-library #tocView li.currentChapter > a.toc_link,
    body.protected-old-shell #overlay-library #tocView li.currentChapter > .toc_link {
      background: transparent !important;
      text-decoration: underline;
    }
    body.protected-old-shell #overlay-library .notes-copy-link-wrap {
      display: none !important;
    }
    #overlay-settings {
      left: auto;
      right: 0;
      width: 360px;
      max-width: min(100vw, 360px);
      z-index: 9999;
    }
    #overlay-settings .overlay-scroll {
      padding-top: 16px;
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
      color: #ffffff;
    }
    .protected-typography-mode.is-active .sample {
      color: #ffffff;
      text-decoration: underline;
      text-underline-offset: 5px;
      text-decoration-thickness: 1.5px;
    }
    .protected-typography-mode.is-active .label {
      color: #ffffff;
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
      width: 100%;
      margin: 0;
      accent-color: #d3d3d3;
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
    #overlay-menu [data-menu="voice"] {
      display: none !important;
    }
    body.protected-old-shell .protected-control-disabled,
    body.protected-old-shell .protected-control-disabled:hover {
      opacity: 0.42;
      cursor: not-allowed;
      pointer-events: none;
      background: transparent;
    }
    body.protected-old-shell #page-count {
      visibility: visible;
    }
    body.protected-old-shell.protected-theme-dark {
      background: #101926;
    }
    body.protected-old-shell.protected-theme-dark #main,
    body.protected-old-shell.protected-theme-dark #viewerStack,
    body.protected-old-shell.protected-theme-dark #viewer,
    body.protected-old-shell.protected-theme-dark #viewer-prev,
    body.protected-old-shell.protected-theme-dark #viewer-next {
      background: #101926 !important;
    }
    body.protected-old-shell.protected-theme-dark #protectedOldShellHost {
      background: transparent;
    }
    body.protected-old-shell.protected-theme-dark #book-title,
    body.protected-old-shell.protected-theme-dark #chapter-title,
    body.protected-old-shell.protected-theme-dark #page-count {
      color: #eef4fb;
    }
    body.protected-old-shell.protected-theme-dark #searchDesktop,
    body.protected-old-shell.protected-theme-dark #searchbar {
      color: #eef4fb;
    }
    body.protected-old-shell.protected-theme-dark #protectedTypographyTrigger[aria-expanded="true"] {
      color: #ffffff;
    }
    body.protected-old-shell #menuBookCoverPlaceholder {
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    }
    body.protected-old-shell #overlay-toc #tocView ul,
    body.protected-old-shell #overlay-bookmarks #bookmarksView ul {
      padding-left: 20px;
    }
    body.protected-old-shell #overlay-toc #tocView li,
    body.protected-old-shell #overlay-bookmarks #bookmarksView li {
      width: auto;
      background: transparent;
      border: 0;
      box-shadow: none;
    }
    body.protected-old-shell #overlay-toc #tocView a,
    body.protected-old-shell #overlay-toc #tocView .toc_link,
    body.protected-old-shell #overlay-bookmarks #bookmarksView a {
      display: inline;
      background: transparent;
      border: 0;
      box-shadow: none;
      color: inherit;
    }
    body.protected-old-shell #overlay-toc #tocView button {
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
    body.protected-old-shell #overlay-toc #tocView .toc_toggle:before {
      color: currentColor;
      opacity: 0.7;
    }
    body.protected-old-shell #overlay-toc #tocView li.currentChapter > a.toc_link,
    body.protected-old-shell #overlay-toc #tocView li.currentChapter > .toc_link {
      background: transparent !important;
      text-decoration: underline;
    }
    body.protected-old-shell.protected-theme-dark #overlay-toc #tocView a,
    body.protected-old-shell.protected-theme-dark #overlay-toc #tocView .toc_link,
    body.protected-old-shell.protected-theme-dark #overlay-bookmarks #bookmarksView a,
    body.protected-old-shell.protected-theme-dark #overlay-bookmarks #bookmarksView .bookmark-comment {
      color: #d7dee8;
      background: transparent !important;
    }
    body.protected-old-shell.protected-theme-dark #overlay-toc #tocView li.currentChapter > a.toc_link,
    body.protected-old-shell.protected-theme-dark #overlay-toc #tocView li.currentChapter > .toc_link {
      color: #eef4fb;
      background: transparent !important;
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
    body.protected-old-shell .reader-engine-badge {
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
    body.protected-old-shell .reader-engine-badge {
      display: none !important;
    }
    body.protected-old-shell #prev,
    body.protected-old-shell #next {
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
    body.protected-old-shell #prev:focus,
    body.protected-old-shell #next:focus,
    body.protected-old-shell #prev:focus-visible,
    body.protected-old-shell #next:focus-visible,
    .protected-nav-edge:focus,
    .protected-nav-edge:focus-visible,
    .protected-nav-edge:active {
      outline: none !important;
      box-shadow: none !important;
      -webkit-tap-highlight-color: transparent !important;
    }
    body.protected-old-shell #prev::before,
    body.protected-old-shell #next::before {
      content: none;
      pointer-events: none;
      opacity: 0;
      transition: opacity 160ms ease;
    }
    body.protected-old-shell #prev::after,
    body.protected-old-shell #next::after {
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
    body.protected-old-shell #next::after {
      margin-left: -12px;
      transform: rotate(45deg);
    }
    body.protected-old-shell #prev::after {
      margin-left: -4px;
      transform: rotate(-135deg);
    }
    body.protected-old-shell.protected-theme-dark #prev::after,
    body.protected-old-shell.protected-theme-dark #next::after {
      border-top-color: rgba(214, 222, 232, 0.96);
      border-right-color: rgba(214, 222, 232, 0.96);
    }
    html.is-desktop body.protected-old-shell #prev,
    html.is-desktop body.protected-old-shell #next,
    html.is-desktop body.protected-old-shell #prev::after,
    html.is-desktop body.protected-old-shell #next::after {
      opacity: 1;
    }
    @media (orientation: landscape) {
      html.is-phone body.protected-old-shell #prev,
      html.is-phone body.protected-old-shell #next,
      html.is-tablet body.protected-old-shell #prev,
      html.is-tablet body.protected-old-shell #next {
        display: flex !important;
        opacity: 1;
      }
      html.is-phone body.protected-old-shell #prev::after,
      html.is-phone body.protected-old-shell #next::after,
      html.is-tablet body.protected-old-shell #prev::after,
      html.is-tablet body.protected-old-shell #next::after {
        opacity: 1;
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
  `;
  document.head.append(style);
}

function openNotesOverlay() {
  openLibraryOverlay("notes");
}

function setShellLoading(active) {
  const loader = document.getElementById("loader");
  if (!loader) return;
  if (active) HOST_STATE.loadingCount += 1;
  else HOST_STATE.loadingCount = Math.max(0, HOST_STATE.loadingCount - 1);
  loader.style.display = HOST_STATE.loadingCount > 0 ? "block" : "none";
}

function setHostActionStatus(message) {
  const actionStatus = document.getElementById("protectedShellActionStatus");
  if (actionStatus && message) actionStatus.textContent = String(message);
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

function getShellPreferredFontMode() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const explicit = params.get("protectedFontMode") || params.get("fontMode");
    if (explicit != null && String(explicit).trim()) {
      return normalizeFontMode(explicit);
    }
  } catch (_error) {}
  try {
    return normalizeFontMode(window.localStorage.getItem(getFontModeStorageKey()));
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
    const raw = window.localStorage.getItem(getFontScaleStorageKey());
    const stored = Number(raw || "");
    if (Number.isFinite(stored) && stored > 0) {
      return Math.max(0.8, Math.min(1.6, Number(stored.toFixed(2))));
    }
  } catch (_error) {}
  try {
    const settings = window.reader && window.reader.settings ? window.reader.settings : null;
    const pct = settings &&
      settings.styles &&
      settings.styles.fontSize
        ? parseInt(String(settings.styles.fontSize).replace(/[^0-9]/g, ""), 10)
        : settings && settings.fontSizePct
          ? parseInt(String(settings.fontSizePct).replace(/[^0-9]/g, ""), 10)
          : 0;
    if (Number.isFinite(pct) && pct > 0) return Math.max(0.8, Math.min(1.6, Number((pct / 100).toFixed(2))));
  } catch (error) {}
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
  const pct = Math.max(80, Math.min(160, Math.round(normalizedScale * 100)));
  const value = `${pct}%`;
  try {
    window.localStorage.setItem(getFontScaleStorageKey(), String(normalizedScale));
  } catch (_error) {}
  try {
    if (!window.reader) return normalizedScale;
    window.reader.settings = window.reader.settings || {};
    window.reader.settings.styles = window.reader.settings.styles || {};
    window.reader.settings.styles.fontSize = value;
    window.reader.settings.fontSizePct = pct;
    if (typeof window.reader.saveSettings === "function") {
      window.reader.saveSettings();
    }
  } catch (_error) {}
  return normalizedScale;
}

function openOverlayById(id) {
  if (id === "overlay-toc") {
    openLibraryOverlay("toc");
    return;
  }
  if (id === "overlay-notes") {
    openLibraryOverlay("notes");
    return;
  }
  if (id === "overlay-bookmarks") {
    openLibraryOverlay("bookmarks");
    return;
  }
  const panel = document.getElementById(id);
  if (!panel) return;
  panel.classList.remove("hidden");
  panel.setAttribute("aria-hidden", "false");
}

function closeOverlayById(id) {
  const panel = document.getElementById(id);
  if (!panel) return;
  panel.classList.add("hidden");
  panel.setAttribute("aria-hidden", "true");
}

function closeAllShellOverlays() {
  closeSearchOverlay();
  closeLibraryOverlay();
  closeTypographyPanel();
  try {
    if (typeof window.__fbCloseOverlays === "function") {
      window.__fbCloseOverlays();
      return;
    }
  } catch (error) {}
  [
    "overlay-toc",
    "overlay-bookmarks",
    "overlay-notes",
    "overlay-menu",
    "overlay-search",
    "overlay-settings",
    "overlay-library",
    "overlay-mybooks",
    "overlay-voice"
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
  let cover = "";
  if (rawCover) {
    try {
      cover = new URL(rawCover, window.location.origin).href;
    } catch (_error) {
      cover = rawCover;
    }
  }
  try {
    if (typeof window.__fbUpdateMenuBookMeta === "function") {
      window.__fbUpdateMenuBookMeta({ title, author, cover });
    }
  } catch (error) {}
  const titleNode = document.getElementById("menuBookTitle");
  const authorNode = document.getElementById("menuBookAuthor");
  const coverNode = document.getElementById("menuBookCover");
  const placeholderNode = document.getElementById("menuBookCoverPlaceholder");
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
    link.addEventListener("click", async (event) => {
      event.preventDefault();
      await invokeBridge("goToToc", item.id);
      closeAllShellOverlays();
    });
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

  target.addEventListener("pointerdown", (event) => { void handlePrimaryInteraction(event); }, true);
  target.addEventListener("mousedown", (event) => { void handlePrimaryInteraction(event); }, true);
  target.addEventListener("touchstart", (event) => { void handlePrimaryInteraction(event); }, { capture: true, passive: false });
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
    item.closest("#overlay-library #bookmarksView") ||
    item.closest("#overlay-bookmarks #bookmarksView")
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
  link.addEventListener("click", openNote);
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
  const copyNotes = document.getElementById("copyNotesLinkBtn");
  if (copyNotes) copyNotes.style.display = "none";
}

function updatePageCounter(summary) {
  const pageCount = document.getElementById("page-count");
  if (!pageCount) return;
  pageCount.textContent = summary && (summary.globalPageLabel || summary.pageLabel) ? (summary.globalPageLabel || summary.pageLabel) : "";
}

function updateNavButtons(summary) {
  const prev = document.getElementById("prev");
  const next = document.getElementById("next");
  if (prev) prev.classList.toggle("disabled", !(summary && summary.canGoPrev));
  if (next) next.classList.toggle("disabled", !(summary && summary.canGoNext));
}

function updateSearchControls(summary) {
  const search = summary && summary.searchSummary ? summary.searchSummary : { active: false, query: "", totalMatches: 0, currentMatch: 0, matches: [] };
  const effectiveQuery = String(search.query || HOST_STATE.searchSidebarPendingQuery || "");
  const desktopInput = document.getElementById("searchInputDesktop");
  const desktopCount = document.getElementById("searchCountDesktop");
  const desktopNav = document.querySelector("#searchDesktop .search-nav.desktop");
  const desktopAction = document.getElementById("searchActionDesktop");
  const mobileBar = document.getElementById("searchbar");
  const mobileInput = document.getElementById("searchInputMobile");
  const mobileCount = document.getElementById("searchCount");
  const overlayInput = document.getElementById("protectedSearchInput");
  const overlayCount = document.getElementById("protectedSearchCount");
  const overlayAction = document.getElementById("protectedSearchAction");
  const overlayNav = document.getElementById("protectedSearchNav");
  const searchOverlayOpen = !!document.querySelector("#overlay-search:not(.hidden)");
  if (desktopInput && document.activeElement !== desktopInput) desktopInput.value = effectiveQuery;
  if (mobileInput && document.activeElement !== mobileInput) mobileInput.value = effectiveQuery;
  if (overlayInput && document.activeElement !== overlayInput) {
    const keepTypedOverlayQuery =
      searchOverlayOpen &&
      !HOST_STATE.searchSidebarForceEmpty &&
      !effectiveQuery &&
      String(overlayInput.value || "").trim().length > 0;
    if (!keepTypedOverlayQuery) overlayInput.value = effectiveQuery;
  }
  if (desktopCount) desktopCount.textContent = search.active && search.totalMatches ? `${search.currentMatch}/${search.totalMatches}` : "0/0";
  if (mobileCount) mobileCount.textContent = search.active && search.totalMatches ? `${search.currentMatch}/${search.totalMatches}` : "0/0";
  if (overlayCount) overlayCount.textContent = search.active && search.totalMatches ? `${search.currentMatch}/${search.totalMatches}` : "0/0";
  if (desktopNav) desktopNav.style.display = search.active && search.totalMatches ? "inline-flex" : "none";
  if (overlayNav) overlayNav.style.display = search.active && search.totalMatches ? "inline-flex" : "none";
  if (desktopAction) {
    desktopAction.classList.toggle("is-clear", !!search.active);
    desktopAction.classList.toggle("is-mag", !search.active);
    desktopAction.classList.toggle("is-enabled", !!(search.query && search.query.length));
    desktopAction.classList.toggle("is-disabled", !(search.query && search.query.length));
    desktopAction.setAttribute("aria-label", search.active ? "Clear search" : "Search");
  }
  if (overlayAction) {
    const showClear = !!search.active;
    overlayAction.classList.toggle("is-clear", showClear);
    overlayAction.classList.toggle("is-mag", !showClear);
    overlayAction.setAttribute("aria-label", showClear ? "Clear search" : "Search");
  }
  if (mobileBar) mobileBar.classList.toggle("hidden", !search.active && !isAutomationMode());
  if (search.query) {
    HOST_STATE.searchSidebarPendingQuery = String(search.query || "");
  }
  renderSearchResults(summary);
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
  const result = await invokeBridgeRaw(method, ...args);
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
  renderSearchResults(HOST_STATE.lastSummary);
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

function readCurrentFontScale(summary = HOST_STATE.lastSummary) {
  const raw = summary ? Number(summary.fontScale || 1) : Number(HOST_STATE.readerConfig.fontScale || 1);
  const normalized = Number.isFinite(raw) ? raw : 1;
  return Math.max(0.8, Math.min(1.6, Number(normalized.toFixed(2))));
}

function closeTypographyPanel() {
  const wrap = document.getElementById("protectedTypographyControl");
  const trigger = document.getElementById("protectedTypographyTrigger");
  const overlay = document.getElementById("overlay-settings");
  const backdrop = document.getElementById("overlay-backdrop");
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
  wrap = document.createElement("span");
  wrap.id = "protectedTopLeftLinks";
  wrap.className = "protected-top-left-links";
  wrap.innerHTML = `
    <a id="protectedCatalogLink" class="protected-top-link protected-top-link-catalog" href="https://reader.pub/books/" aria-label="Catalog">
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
  link = document.createElement("a");
  link.id = "protectedBottomCatalogLink";
  link.href = "https://reader.pub/books/";
  link.setAttribute("aria-label", "ReaderPub Books");
  link.innerHTML = `
    <span class="protected-top-link-icon">${PROTECTED_CATALOG_ICON_SVG}</span>
    <span class="protected-top-link-label">ReaderPub Books</span>
  `;
  bottomBar.appendChild(link);
  return link;
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

function syncProtectedShellIcons() {
  ensureDesktopTopLinks();
  ensureBottomCatalogLink();
  const libraryControl = ensureLibraryControl();
  const searchControl = ensureSearchControl();
  const libraryTrigger = document.getElementById("protectedLibraryTrigger");
  const searchTrigger = document.getElementById("protectedSearchTrigger");
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
  if (searchTrigger) {
    let searchImg = searchTrigger.querySelector("img");
    if (!searchImg) {
      searchImg = document.createElement("img");
      searchImg.alt = "";
      searchImg.setAttribute("aria-hidden", "true");
      searchTrigger.replaceChildren(searchImg);
    }
    if (searchImg.getAttribute("src") !== PROTECTED_SEARCH_ICON_SRC) {
      searchImg.setAttribute("src", PROTECTED_SEARCH_ICON_SRC);
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
  const isAndroid = /Android/i.test(String(navigator.userAgent || ""));
  if (addressBarToggle) {
    document.body.classList.toggle("android", isAndroid);
    if (isAndroid && bottomBar && addressBarToggle.parentElement !== bottomBar) {
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
  if (searchControl && themeToggle && searchControl.parentElement !== themeToggle.parentElement) {
    themeToggle.parentElement && themeToggle.parentElement.insertBefore(searchControl, themeToggle);
  }
}

function switchLibraryTab(nextTab = "toc") {
  const activeTab = String(nextTab || "toc").trim().toLowerCase();
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

function closeLibraryOverlay() {
  const wrap = document.getElementById("protectedLibraryControl");
  const trigger = document.getElementById("protectedLibraryTrigger");
  const overlay = document.getElementById("overlay-library");
  const backdrop = document.getElementById("overlay-backdrop");
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
}

function closeSearchOverlay() {
  const wrap = document.getElementById("protectedSearchControl");
  const trigger = document.getElementById("protectedSearchTrigger");
  const overlay = document.getElementById("overlay-search");
  const backdrop = document.getElementById("overlay-backdrop");
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
    close && close.addEventListener("click", (event) => {
      event.preventDefault();
      closeSearchOverlay();
    });
  }
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
          <button type="button" class="protected-library-tab" id="protectedLibraryTab-mybooks" role="tab" aria-selected="false" tabindex="-1">My Books</button>
        </div>
        <section id="protectedLibraryPane-toc" class="protected-library-pane" role="tabpanel">
          <div id="protectedLibraryTocMount"></div>
        </section>
        <section id="protectedLibraryPane-notes" class="protected-library-pane hidden" role="tabpanel">
          <div id="protectedLibraryNotesMount"></div>
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
    close && close.addEventListener("click", (event) => {
      event.preventDefault();
      closeLibraryOverlay();
    });
    overlay.querySelectorAll(".protected-library-tab").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        const id = String(button.id || "");
        if (id.endsWith("-toc")) switchLibraryTab("toc");
        else if (id.endsWith("-notes")) switchLibraryTab("notes");
        else if (id.endsWith("-bookmarks")) switchLibraryTab("bookmarks");
        else if (id.endsWith("-mybooks")) switchLibraryTab("mybooks");
      });
    });
    const maybeCloseLibraryAfterNavigationTap = (event) => {
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
  if (myBooksMount && myBooksView && myBooksView.parentElement !== myBooksMount) myBooksMount.appendChild(myBooksView);
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
      `;
      document.body.appendChild(overlay);
    }
    panel = overlay.querySelector("#protectedTypographyPanel");
    const close = overlay.querySelector(".overlay-close");
    close && close.addEventListener("click", (event) => {
      event.preventDefault();
      closeTypographyPanel();
    });
    const backdrop = document.getElementById("overlay-backdrop");
    backdrop && backdrop.addEventListener("click", () => {
      if (!overlay.classList.contains("hidden")) closeTypographyPanel();
    });
  }
  const bookCardMount = document.getElementById("protectedSettingsBookCardMount");
  const menuBookCard = document.getElementById("menuBookCard");
  if (bookCardMount && menuBookCard && menuBookCard.parentElement !== bookCardMount) {
    bookCardMount.appendChild(menuBookCard);
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
  setControlEnabled("openBookmarks", true);
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

function clearPageTurnPreview({ clearNeighbors = false } = {}) {
  const stack = document.getElementById("viewerStack");
  const prevLayer = document.getElementById("viewer-prev");
  const nextLayer = document.getElementById("viewer-next");
  const shadow = document.getElementById("swipe-shadow");
  const currentLayer = getCurrentTurnLayer();
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
  if (currentLayer) {
    currentLayer.replaceChildren();
    currentLayer.style.opacity = "0";
    currentLayer.style.visibility = "hidden";
    currentLayer.style.transform = "";
    currentLayer.style.transition = "";
  }
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
    target.style.position = computed.position || "absolute";
    target.style.left = computed.left || "0px";
    target.style.top = computed.top || "0px";
    target.style.width = computed.width || `${Math.round(source.getBoundingClientRect().width || 0)}px`;
    target.style.height = computed.height || `${Math.round(source.getBoundingClientRect().height || 0)}px`;
    target.style.transform = computed.transform && computed.transform !== "none" ? computed.transform : "";
    target.style.transformOrigin = computed.transformOrigin || "";
    return target;
  }).filter(Boolean);
}

function cloneProtectedCanvases() {
  const frame = HOST_STATE.frame;
  if (!frame || !frame.contentDocument) return [];
  const doc = frame.contentDocument;
  const primaryCanvases = [
    doc.getElementById("reader-canvas"),
    doc.getElementById("overlay-canvas")
  ].filter(Boolean);
  return cloneCanvasesFromNodes(primaryCanvases);
}

function cloneEmbeddedPreviewCanvases(direction) {
  const frame = HOST_STATE.frame;
  if (!frame || !frame.contentDocument) return [];
  const root = frame.contentDocument.getElementById(`protected-turn-preview-${direction}`);
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
  const doc = frame && frame.contentDocument ? frame.contentDocument : null;
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
  const doc = frame && frame.contentDocument ? frame.contentDocument : null;
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
  const currentLayer = getCurrentTurnLayer();
  if (!currentLayer || !dx) return;
  updateCurrentTurnLayerTransform(dx);
}

function settleTurnPreview(direction) {
  const stack = document.getElementById("viewerStack");
  const shadow = document.getElementById("swipe-shadow");
  const currentLayer = getCurrentTurnLayer();
  const prevLayer = document.getElementById("viewer-prev");
  const nextLayer = document.getElementById("viewer-next");
  if (currentLayer) {
    currentLayer.style.opacity = "0";
    currentLayer.style.visibility = "hidden";
    currentLayer.style.transform = "";
    currentLayer.style.transition = "";
  }
  if (prevLayer) prevLayer.style.opacity = direction === "prev" ? "1" : "0";
  if (nextLayer) nextLayer.style.opacity = direction === "next" ? "1" : "0";
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

async function openProtectedNoteComposer() {
  const backdrop = document.getElementById("commentBackdrop");
  const sheet = document.getElementById("commentSheet");
  const input = document.getElementById("commentInput");
  const save = document.getElementById("commentSave");
  const cancel = document.getElementById("commentCancel");
  if (!sheet || !input || !save || !cancel) {
    await invokeBridge("addNoteToSelection", "");
    return;
  }
  hideSelectionToolbar();
  let capture = HOST_STATE.cachedSelectionActionState;
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
  backdrop && backdrop.classList.remove("hidden");
  sheet.classList.remove("hidden");
  input.value = "";
  window.setTimeout(() => {
    try {
      input.focus();
    } catch (error) {}
  }, 0);
  return new Promise((resolve) => {
    const close = () => {
      backdrop && backdrop.classList.add("hidden");
      sheet.classList.add("hidden");
      save.removeEventListener("click", onSave, true);
      cancel.removeEventListener("click", onCancel, true);
      backdrop && backdrop.removeEventListener("click", onCancel, true);
      resolve();
    };
    const onCancel = async (event) => {
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
      event && event.preventDefault();
      event && event.stopPropagation && event.stopPropagation();
      event && event.stopImmediatePropagation && event.stopImmediatePropagation();
      try {
        await invokeBridge(
          "addNoteFromRangeDescriptor",
          rangeDescriptor,
          input.value || "",
          capture && capture.clipboardText ? capture.clipboardText : ""
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
    cancel.addEventListener("click", onCancel, true);
    backdrop && backdrop.addEventListener("click", onCancel, true);
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
      const win = HOST_STATE.frame && HOST_STATE.frame.contentWindow ? HOST_STATE.frame.contentWindow : null;
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
      const win = HOST_STATE.frame && HOST_STATE.frame.contentWindow ? HOST_STATE.frame.contentWindow : null;
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
  void primeSelectionActionState();
}

function openExternalUrl(url) {
  try {
    window.open(url, "_blank", "noopener");
  } catch (error) {
    window.location.href = url;
  }
}

function bindSelectionToolbar() {
  const toolbar = document.getElementById("selectionToolbar");
  if (!toolbar || toolbar.__protectedBound) return;
  toolbar.__protectedBound = true;
async function handleAction(action) {
    if (!action) return;
    if (action === "note") {
      await openProtectedNoteComposer();
      hideSelectionToolbar();
      return;
    }
    if (action === "copy") {
      const cached = HOST_STATE.cachedSelectionActionState || await primeSelectionActionState();
      const selectionText = cached && cached.clipboardText ? String(cached.clipboardText) : "";
      await copyTextToClipboard(selectionText);
      await invokeBridge("clearSelection");
      HOST_STATE.cachedSelectionActionState = null;
      HOST_STATE.suppressSelectionToolbarUntil = Date.now() + 1200;
      setHostActionStatus("Copied selection.");
      hideSelectionToolbar();
      return;
    }
    if (action === "search" || action === "translate" || action === "share") {
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
        try {
          if (navigator.share) {
            await navigator.share({ text: selectionText });
          } else if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(selectionText);
            setHostActionStatus("Copied selection for sharing.");
          }
        } catch (error) {
          setHostActionStatus(error && error.message ? error.message : "Unable to share selection.");
        }
      }
      hideSelectionToolbar();
      return;
    }
    hideSelectionToolbar();
  }

  function toolbarActionFromEvent(event) {
    const direct = event && event.target && event.target.closest ? event.target.closest("[data-action]") : null;
    if (direct) return direct.getAttribute("data-action");
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
    suppressSelectionToolbarReopen(1000);
    hideSelectionToolbar();
    const target = event.target;
    const withinProtectedOverlay = !!(
      target &&
      target.closest &&
      target.closest("#overlay-library, #overlay-settings, #overlay-menu, #overlay-toc, #overlay-bookmarks, #overlay-notes .list_item, #overlay-notes .bookmark-delete, #overlay-notes .bookmark_link, #commentSheet")
    );
    const summary = HOST_STATE.lastSummary;
    const primaryButton = event.button == null || event.button === 0;
    const shouldClear = !!(
      !toolbar.classList.contains("hidden") ||
      (summary && (summary.focusedAnnotationId || summary.selectionActive))
    );
    if (withinProtectedOverlay || !shouldClear || !primaryButton) return;
    void invokeBridgeRaw("clearSelection")
      .then((nextSummary) => {
        if (nextSummary) updateFromSummary(nextSummary);
      })
      .catch(() => {});
  };
  document.addEventListener("pointerdown", dismissSelectionUi, true);
  document.addEventListener("touchstart", dismissSelectionUi, { capture: true, passive: true });
  window.__PROTECTED_OLD_SHELL_SHOW_SELECTION_TOOLBAR__ = (summary, clientX = 160, clientY = 160, pointerType = "") => {
    window.__protectedToolbarDebug = {
      ...(window.__protectedToolbarDebug || {}),
      hostInvokeAt: Date.now(),
      source: "direct-call",
      pointerType,
      summaryActive: !!(summary && summary.selectionActive),
      selectedChars: Number(summary && summary.selectedChars || 0)
    };
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
}

function getBridgeSummaryFromFrame(frame) {
  try {
    const bridge = frame && frame.contentWindow ? frame.contentWindow.__PROTECTED_READER_BRIDGE__ : null;
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
      doc = frame && frame.contentDocument ? frame.contentDocument : null;
      win = frame && frame.contentWindow ? frame.contentWindow : null;
    } catch (error) {
      return;
    }
    if (!doc || doc.__protectedSurfaceInteractionsBound) return;
    doc.__protectedSurfaceInteractionsBound = true;
    const desktopSurfaceClickState = {
      armed: false,
      startX: 0,
      startY: 0
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
      const toolbar = document.getElementById("selectionToolbar");
      const shouldClear = !!(
        (toolbar && !toolbar.classList.contains("hidden")) ||
        (summary && (summary.focusedAnnotationId || summary.selectionActive))
      );
      if (!inProtectedSurface || !shouldClear || !primaryButton) return;
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
      suppressSelectionToolbarReopen(1000);
      hideSelectionToolbar();
      void invokeBridgeRaw("clearSelection")
        .then((nextSummary) => {
          if (nextSummary) updateFromSummary(nextSummary);
        })
        .catch(() => {});
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
    doc.addEventListener("click", (event) => {
      if (isTouchShellMode()) return;
      const target = event.target;
      const inProtectedSurface = !!(target && target.closest && target.closest("#reader-canvas, #overlay-canvas, canvas, .reader-frame"));
      const primaryButton = event.button == null || event.button === 0;
      const summary = getBridgeSummaryFromFrame(frame);
      const hasSelection = !!(summary && (summary.selectionActive || summary.focusedAnnotationId));
      if (!desktopSurfaceClickState.armed || !inProtectedSurface || !primaryButton || hasSelection) {
        desktopSurfaceClickState.armed = false;
        return;
      }
      desktopSurfaceClickState.armed = false;
      toggleShellUi("desktop-click");
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
    }, true);
    installTouchSwipe(doc);
  };
  frame.addEventListener("load", wire);
  wire();
}

function updateFromSummary(summary) {
  if (!summary) return;
  ensureHostGenerations();
  if (isStaleSummary(summary)) return;
  HOST_STATE.lastSummary = summary;
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
  if (summary.ready) {
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
      const win = HOST_STATE.frame && HOST_STATE.frame.contentWindow ? HOST_STATE.frame.contentWindow : null;
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

function getBridge() {
  try {
    return HOST_STATE.frame && HOST_STATE.frame.contentWindow
      ? HOST_STATE.frame.contentWindow.__PROTECTED_READER_BRIDGE__ || null
      : null;
  } catch (error) {
    return null;
  }
}

async function invokeBridge(method, ...args) {
  const bridge = getBridge();
  if (!bridge || typeof bridge[method] !== "function") {
    throw new Error(`Protected bridge method unavailable: ${method}`);
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
    throw new Error(`Protected bridge method unavailable: ${method}`);
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
  return String(value || "").trim().toLowerCase();
}

function pickHostTtsVoice(voices, payload = null) {
  if (!Array.isArray(voices) || !voices.length) return null;
  const voiceSelect = document.getElementById("voiceSelect");
  const selectedVoiceUri = voiceSelect ? String(voiceSelect.value || "").trim() : "";
  if (selectedVoiceUri) {
    const exact = voices.find((voice) => voice && String(voice.voiceURI || "") === selectedVoiceUri) || null;
    if (exact) return exact;
  }
  const voiceLangSelect = document.getElementById("voiceLangSelect");
  const selectedLang = normalizeTtsLang(voiceLangSelect ? voiceLangSelect.value : "");
  const payloadLang = normalizeTtsLang(payload && payload.lang ? payload.lang : "");
  const wantedLang = selectedLang || payloadLang;
  if (wantedLang) {
    const exactLang = voices.find((voice) => normalizeTtsLang(voice && voice.lang) === wantedLang) || null;
    if (exactLang) return exactLang;
    const prefix = wantedLang.split("-")[0];
    const prefixMatch = voices.find((voice) => normalizeTtsLang(voice && voice.lang).startsWith(prefix)) || null;
    if (prefixMatch) return prefixMatch;
  }
  return voices[0] || null;
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

  const speakNextSegment = () => {
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
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      if (selectedVoice.lang) utterance.lang = selectedVoice.lang;
    }
    utterance.onend = () => {
      if (!HOST_STATE.tts.active || token !== HOST_STATE.tts.token) return;
      index += 1;
      speakNextSegment();
    };
    utterance.onerror = () => {
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
  document.getElementById("protectedShellOpenNotes").addEventListener("click", openNotesOverlay);
  return bar;
}

function installNoteComposerCloseHook() {
  window.__fbOnNoteCommentClosed = async ({ reason } = {}) => {
    const normalizedReason = String(reason || "close");
    if (normalizedReason === "save") return;
    hideSelectionToolbar();
    HOST_STATE.cachedSelectionActionState = null;
    HOST_STATE.suppressSelectionToolbarUntil = Date.now() + 1200;
    try {
      const nextSummary = await invokeBridgeRaw("clearSelection");
      if (nextSummary) updateFromSummary(nextSummary);
    } catch (error) {}
  };
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
  const frame = HOST_STATE.frame;
  if (!currentLayer || !frame || !liveCanvases.length) return false;
  currentLayer.replaceChildren(buildTurnLayer(liveCanvases));
  currentLayer.style.visibility = "visible";
  currentLayer.style.opacity = "1";
  currentLayer.style.transition = "none";
  currentLayer.style.transform = "translate3d(0px, 0, 0)";
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
  const stack = document.getElementById("viewerStack");
  const shadow = document.getElementById("swipe-shadow");
  if (!currentLayer || !stack) return;
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
  currentLayer.style.transition = `transform ${durationMs}ms ease-out`;
  currentLayer.style.transform = `translate3d(${Math.round(startDx)}px, 0, 0)`;
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
    currentLayer.style.transform = `translate3d(${Math.round(targetDx)}px, 0, 0)`;
    animateOverlay(startDx, targetDx);
  });
}

async function performPageTurn(direction, options = {}) {
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
      resolve();
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
  return ["overlay-menu", "overlay-search", "overlay-settings", "overlay-library", "overlay-toc", "overlay-notes", "overlay-bookmarks", "commentSheet"]
    .some((id) => {
      const node = document.getElementById(id);
      return !!(node && !node.classList.contains("hidden"));
    });
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
  closeOverlayById("overlay-menu");
  const opener = document.getElementById("opener");
  if (opener) opener.setAttribute("aria-hidden", "true");
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
      const win = target.defaultView || (HOST_STATE.frame && HOST_STATE.frame.contentWindow) || null;
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
      preparingDirection: null,
      preparing: null,
      swipeCaptured: false,
      selectionClaimed: false,
      selectionLocked: false
    };
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
      prepared,
      nextNeighborCount: getNeighborLayerCanvasCount("next"),
      prevNeighborCount: getNeighborLayerCanvasCount("prev")
    };
  }

  function onMove(event) {
    if (!gesture) return;
    const touch = event.touches ? event.touches[0] : null;
    if (!touch) return;
    const dx = touch.clientX - gesture.x;
    const dy = touch.clientY - gesture.y;
    window.__protectedTouchDebug.move = {
      dx,
      dy,
      touchSelection: getTouchSelectionState(),
      nextNeighborCount: getNeighborLayerCanvasCount("next"),
      prevNeighborCount: getNeighborLayerCanvasCount("prev"),
      previewVisible: !!gesture.previewVisible,
      prepared: !!gesture.prepared
    };
    const touchSelection = getTouchSelectionState();
    const summary = getBridgeSummaryFromFrame(HOST_STATE.frame);
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
      event.preventDefault();
      if (!gesture.swipeCaptured) {
        setFramePointerEventsDisabled(true);
        gesture.swipeCaptured = true;
      }
      gesture.dx = dx;
      const direction = dx < 0 ? "next" : "prev";
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
      if (!gesture.previewVisible) {
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
          updateCurrentTurnLayerTransform(dx);
          scheduleTouchRevealActivation(direction);
        }
      }
    }
  }

  async function onEnd(event) {
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
      selectionClaimed
    };
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
      if (isTap) {
        window.__protectedTouchDebug.tap = {
          tapZone,
          bodyHiddenBefore: !!(document.body && document.body.classList && document.body.classList.contains("ui-hidden"))
        };
        if (tapZone === "center") {
          event.preventDefault();
          toggleShellUi("touch-center");
          window.__protectedTouchDebug.tap.bodyHiddenAfter = !!(document.body && document.body.classList && document.body.classList.contains("ui-hidden"));
          return;
        }
        if (tapZone === "left") {
          event.preventDefault();
          await performPageTurn("prev");
          window.__protectedTouchDebug.tap.turn = "prev";
          return;
        }
        if (tapZone === "right") {
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
      await performPageTurn("next", { reuseExistingPreview: previewVisible, startDx: dx });
      return;
    }
    await performPageTurn("prev", { reuseExistingPreview: previewVisible, startDx: dx });
  }

  target.addEventListener("touchstart", onStart, { passive: true, capture: true });
  target.addEventListener("touchmove", onMove, { passive: false, capture: true });
  target.addEventListener("touchend", onEnd, { passive: false, capture: true });
  target.addEventListener("touchcancel", () => {
    clearPageTurnPreview({ clearNeighbors: false });
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
  if (catalogLink || bottomCatalogLink) {
    const legacyCatalogLink = document.querySelector('#menuView a.menu-item[aria-label="Catalog"]');
    if (legacyCatalogLink && legacyCatalogLink.getAttribute("href")) {
      if (catalogLink) catalogLink.setAttribute("href", legacyCatalogLink.getAttribute("href"));
      if (bottomCatalogLink) bottomCatalogLink.setAttribute("href", legacyCatalogLink.getAttribute("href"));
    }
  }
  tts && tts.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation && event.stopImmediatePropagation();
    await toggleHostTts();
  }, true);
  theme && theme.addEventListener("click", async (event) => {
    event.preventDefault();
    const currentTheme = HOST_STATE.lastSummary && HOST_STATE.lastSummary.theme === "dark" ? "dark" : "light";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    document.body.classList.toggle("protected-theme-dark", nextTheme === "dark");
    document.body.classList.toggle("dark-ui", nextTheme === "dark");
    await invokeBridge("setTheme", nextTheme);
  });
  bookmark && bookmark.addEventListener("click", (event) => {
    event.preventDefault();
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
  libraryTrigger && libraryTrigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const wrap = document.getElementById("protectedLibraryControl");
    if (wrap && wrap.classList.contains("is-open")) {
      closeLibraryOverlay();
      return;
    }
    openLibraryOverlay("toc");
  });
  searchTrigger && searchTrigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const wrap = document.getElementById("protectedSearchControl");
    if (wrap && wrap.classList.contains("is-open")) {
      closeSearchOverlay();
      return;
    }
    openSearchOverlay();
  });
  const typographyControl = ensureTypographyControl();
  const typographyTrigger = document.getElementById("protectedTypographyTrigger");
  const typographyPanel = document.getElementById("protectedTypographyPanel");
  const typographyScale = document.getElementById("protectedTypographyScale");
  const fontModeButtons = [
    document.getElementById("protectedTypographySans"),
    document.getElementById("protectedTypographySerif")
  ].filter(Boolean);
  typographyTrigger && typographyTrigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleTypographyPanel();
  });
  const dismissTypographyPanel = (event) => {
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
        closeSearchOverlay();
        closeLibraryOverlay();
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
      closeLibraryOverlay();
      closeSearchOverlay();
      return;
    }
    if (!wrap || !wrap.classList.contains("is-open")) return;
    if (backdrop && event.target === backdrop) {
      try {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation && event.stopImmediatePropagation();
      } catch (_error) {}
      closeTypographyPanel();
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
    closeTypographyPanel();
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
  typographyScale && typographyScale.addEventListener("change", async (event) => {
    const nextScale = persistShellFontScale(
      Math.max(0.8, Math.min(1.6, Number(event.currentTarget && event.currentTarget.value || 1)))
    );
    HOST_STATE.lastAppliedFontScale = nextScale;
    HOST_STATE.fontScaleSynced = true;
    await invokeBridge("setFontScale", nextScale);
  });
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
  const searchOpen = document.getElementById("searchOpen");
  const searchClose = document.getElementById("searchClose");
  const mobileBar = document.getElementById("searchbar");
  const mobileInput = document.getElementById("searchInputMobile");
  const mobilePrev = document.getElementById("searchPrev");
  const mobileNext = document.getElementById("searchNext");
  const mobileClear = document.getElementById("searchClearMobile");
  const overlaySearchInput = document.getElementById("protectedSearchInput");
  const overlaySearchAction = document.getElementById("protectedSearchAction");
  const overlaySearchPrev = document.getElementById("protectedSearchPrev");
  const overlaySearchNext = document.getElementById("protectedSearchNext");

  async function submitSearch(query) {
    HOST_STATE.searchSidebarPendingQuery = String(query || "").trim();
    updateSearchControls(HOST_STATE.lastSummary);
    await invokeSearchBridge("searchBook", query);
    await refreshSearchSidebarState();
  }
  async function clearSearch() {
    HOST_STATE.searchSidebarPendingQuery = "";
    HOST_STATE.searchSidebarForceEmpty = true;
    HOST_STATE.searchSidebarState = createEmptySearchSidebarState();
    if (overlaySearchInput) overlaySearchInput.value = "";
    if (HOST_STATE.lastSummary && HOST_STATE.lastSummary.searchSummary) {
      HOST_STATE.lastSummary = {
        ...HOST_STATE.lastSummary,
        searchSummary: createEmptySearchSidebarState()
      };
    }
    updateSearchControls(HOST_STATE.lastSummary);
    renderSearchResults(HOST_STATE.lastSummary);
    await invokeSearchBridge("clearSearch");
    await refreshSearchSidebarState();
    if (HOST_STATE.searchSidebarState && !HOST_STATE.searchSidebarState.query) {
      HOST_STATE.searchSidebarState = createEmptySearchSidebarState();
      renderSearchResults(HOST_STATE.lastSummary);
      updateSearchControls(HOST_STATE.lastSummary);
    }
    HOST_STATE.searchSidebarPendingQuery = "";
    if (overlaySearchInput) overlaySearchInput.value = "";
    if (mobileInput) mobileInput.value = "";
    if (searchInput) searchInput.value = "";
    HOST_STATE.searchSidebarForceEmpty = false;
  }
  function currentSearchValue() {
    const desktop = searchInput ? searchInput.value.trim() : "";
    const mobile = mobileInput ? mobileInput.value.trim() : "";
    return desktop || mobile;
  }

  searchAction && searchAction.addEventListener("click", async (event) => {
    event.preventDefault();
    const summary = HOST_STATE.lastSummary;
    if (summary && summary.searchSummary && summary.searchSummary.active) {
      if (searchInput) searchInput.value = "";
      if (mobileInput) mobileInput.value = "";
      await clearSearch();
      return;
    }
    await submitSearch(currentSearchValue());
  });
  searchInput && searchInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await submitSearch(searchInput.value.trim());
  });
  mobileInput && mobileInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await submitSearch(mobileInput.value.trim());
  });
  searchPrev && searchPrev.addEventListener("click", async (event) => {
    event.preventDefault();
    await invokeSearchBridge("searchPrevResult");
    await refreshSearchSidebarState();
  });
  searchNext && searchNext.addEventListener("click", async (event) => {
    event.preventDefault();
    await invokeSearchBridge("searchNextResult");
    await refreshSearchSidebarState();
  });
  mobilePrev && mobilePrev.addEventListener("click", async (event) => {
    event.preventDefault();
    await invokeSearchBridge("searchPrevResult");
    await refreshSearchSidebarState();
  });
  mobileNext && mobileNext.addEventListener("click", async (event) => {
    event.preventDefault();
    await invokeSearchBridge("searchNextResult");
    await refreshSearchSidebarState();
  });
  mobileClear && mobileClear.addEventListener("click", async (event) => {
    event.preventDefault();
    if (mobileInput) mobileInput.value = "";
    if (searchInput) searchInput.value = "";
    await clearSearch();
  });
  searchOpen && searchOpen.addEventListener("click", (event) => {
    event.preventDefault();
    openSearchOverlay();
  });
  searchClose && searchClose.addEventListener("click", async (event) => {
    event.preventDefault();
    if (mobileInput) mobileInput.value = "";
    if (searchInput) searchInput.value = "";
    if (mobileBar) mobileBar.classList.add("hidden");
    await clearSearch();
  });
  overlaySearchAction && overlaySearchAction.addEventListener("click", async (event) => {
    event.preventDefault();
    const summary = HOST_STATE.lastSummary;
    const submittedQuery = overlaySearchInput ? overlaySearchInput.value.trim() : "";
    const shouldClear = !!(
      (summary && summary.searchSummary && summary.searchSummary.active) ||
      (overlaySearchAction && overlaySearchAction.classList.contains("is-clear"))
    );
    if (shouldClear) {
      if (overlaySearchInput) overlaySearchInput.value = "";
      if (mobileInput) mobileInput.value = "";
      if (searchInput) searchInput.value = "";
      await clearSearch();
      return;
    }
    await submitSearch(submittedQuery);
    if (overlaySearchInput && submittedQuery) {
      HOST_STATE.searchSidebarPendingQuery = submittedQuery;
      overlaySearchInput.value = submittedQuery;
    }
  });
  overlaySearchInput && overlaySearchInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const submittedQuery = overlaySearchInput.value.trim();
    await submitSearch(submittedQuery);
    if (overlaySearchInput && submittedQuery) {
      HOST_STATE.searchSidebarPendingQuery = submittedQuery;
      overlaySearchInput.value = submittedQuery;
    }
  });
  overlaySearchPrev && overlaySearchPrev.addEventListener("click", async (event) => {
    event.preventDefault();
    await invokeSearchBridge("searchPrevResult");
    await refreshSearchSidebarState();
  });
  overlaySearchNext && overlaySearchNext.addEventListener("click", async (event) => {
    event.preventDefault();
    await invokeSearchBridge("searchNextResult");
    await refreshSearchSidebarState();
  });

  bindSelectionToolbar();

  const host = document.getElementById("protectedOldShellHost");
  if (host) installTouchSwipe(host);
}

function ensureProtectedHost() {
  const viewer = document.getElementById("viewer");
  if (!viewer) throw new Error("Old-shell viewer is missing.");
  viewer.replaceChildren();
  const host = document.createElement("div");
  host.id = "protectedOldShellHost";

  const frame = document.createElement("iframe");
  frame.id = "protectedOldShellFrame";
  frame.setAttribute("title", "Protected reader engine");
  frame.setAttribute("sandbox", "allow-same-origin allow-scripts allow-downloads allow-forms");
  frame.src = buildEmbeddedProtectedUrl();

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

  host.append(frame, currentLayer, prev, next);
  viewer.append(host);
  HOST_STATE.frame = frame;
  setShellLoading(true);
  installTouchSwipe(host);

  frame.addEventListener("load", () => {
    attachProtectedSurfaceInteractions(frame);
    if (HOST_STATE.pollTimer) window.clearInterval(HOST_STATE.pollTimer);
    HOST_STATE.pollTimer = window.setInterval(() => {
      const bridge = getBridge();
      if (!bridge || typeof bridge.getSummary !== "function") return;
      updateFromSummary(bridge.getSummary());
    }, 180);
    void prepareAndSyncNeighborPreviews();
    ensureNeighborLayersMounted();
  });
}

function buildEmbeddedProtectedUrl() {
  const url = new URL("/reader_render_v3/integration/protected-reader.html", window.location.origin);
  const params = new URLSearchParams(window.location.search || "");
  const preferredFontMode = persistShellFontMode(getShellPreferredFontMode());
  ensureHostGenerations();
  HOST_STATE.readerConfig.fontMode = preferredFontMode;
  HOST_STATE.lastAppliedFontMode = preferredFontMode;
  params.set("reader", "protected");
  params.set("embedded", "old-shell");
  params.set("protectedDrive", params.get("protectedDrive") || "disabled");
  params.set("automationSafe", params.get("automationSafe") || params.get("protectedAutomation") || "1");
  params.set("protectedFontScale", String(getShellPreferredFontScale()));
  params.set("protectedFontMode", preferredFontMode);
  params.set("protectedConfigGeneration", String(HOST_STATE.activeConfigGeneration));
  params.set("protectedLayoutGeneration", String(HOST_STATE.activeLayoutGeneration));
  url.search = params.toString();
  url.hash = window.location.hash || "";
  return url.toString();
}

function setUnavailableMessage(message) {
  HOST_STATE.loadingCount = 0;
  setShellLoading(false);
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

function handleBridgeMessage(event) {
  if (event.origin !== window.location.origin) return;
  const data = event.data || {};
  if (data.channel !== "protected-old-shell-v1" || data.type !== "state-changed") return;
  updateFromSummary(data.summary);
}

async function bootOldShellProtectedHost() {
  window.__PROTECTED_OLD_SHELL_HOST_BOOT_STARTED = true;
  if (!window.__readerpubProtectedOldShellMode) return;
  installStyles();
  installNoteComposerCloseHook();
  document.body.classList.add("protected-old-shell");
  document.body.classList.toggle("protected-dev-panel", isDevPanelEnabled());
  installTouchUiVisibilityGuard();
  hideShellUi();
  setShellLoading(true);

  const route = parseProtectedIntegrationRoute(window.location.href);
  const rollout = resolveProtectedReaderRollout(route);
  const eligibility = await assessProtectedReaderEligibility(route, rollout);
  const pilot = resolveProtectedReaderPilot(route, rollout, eligibility);
  const rolloutStatus = buildProtectedReaderStatus(route, rollout, eligibility, pilot);
  HOST_STATE.route = route;
  HOST_STATE.rolloutStatus = rolloutStatus;

  if (rolloutStatus.action === "redirect-to-old-reader-with-reason") {
    window.location.replace(rolloutStatus.fallbackUrl);
    return;
  }

  ensureActionBar();
  bindShellControls();

  if (rolloutStatus.action === "protected-unavailable-show-message") {
    setUnavailableMessage(rolloutStatus.message);
    return;
  }

  window.addEventListener("message", handleBridgeMessage);
  ensureProtectedHost();
}

function scheduleHostBoot() {
  window.__PROTECTED_OLD_SHELL_HOST_BOOT_SCHEDULED = true;
  const run = () => {
    bootOldShellProtectedHost().catch((error) => {
      console.error(error);
      window.__PROTECTED_OLD_SHELL_HOST_ERROR = error && error.message ? error.message : String(error);
      setUnavailableMessage(error && error.message ? error.message : "Protected old-shell host failed to boot.");
    });
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
    return;
  }
  run();
}

function waitForConfigAndBoot() {
  if (window.__READERPUB_PROTECTED_OLD_SHELL_CONFIG__) {
    scheduleHostBoot();
    return;
  }
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (window.__READERPUB_PROTECTED_OLD_SHELL_CONFIG__) {
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
window.addEventListener(
  "readerpub:protected-old-shell-config",
  () => {
    waitForConfigAndBoot();
  },
  { once: true }
);
  const currentLayer = document.createElement("div");
  currentLayer.id = "protectedOldShellCurrentLayer";
