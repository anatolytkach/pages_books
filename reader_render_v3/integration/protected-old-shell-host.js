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
  turnPreviewSyncTimer: null,
  turnPreviewPromise: null,
  lastTurnPreviewKey: "",
  turnInFlight: false
};

const BOOKMARK_STORAGE_PREFIX = "readerpub:protected-old-shell:bookmarks:";
const FONT_SCALE_STORAGE_PREFIX = "readerpub:protected-old-shell:font-scale:";
const FONT_MODE_STORAGE_PREFIX = "readerpub:protected-old-shell:font-mode:";

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

function showShellUi() {
  try {
    if (typeof window.__fbShowUi === "function") {
      window.__fbShowUi();
      return;
    }
  } catch (_error) {}
  document.body.classList.remove("ui-hidden");
}

function hideShellUi() {
  try {
    if (typeof window.__fbHideUi === "function") {
      window.__fbHideUi();
      return;
    }
  } catch (_error) {}
  document.body.classList.add("ui-hidden");
}

function toggleShellUi() {
  if (document.body.classList.contains("ui-hidden")) {
    showShellUi();
    return;
  }
  hideShellUi();
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
    body.protected-old-shell #ttsToggleDesktop,
    body.protected-old-shell #ttsToggleMobile,
    body.protected-old-shell #addressBarToggle {
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
    body.protected-old-shell #searchDesktop {
      display: flex !important;
    }
    body.protected-old-shell #themeToggle,
    body.protected-old-shell #bookmark,
    body.protected-old-shell #fontDec,
    body.protected-old-shell #fontInc {
      display: inline-flex !important;
    }
    #protectedFontModeControl {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-left: 8px;
      padding: 2px;
      border-radius: 999px;
      border: 1px solid rgba(12, 78, 101, 0.14);
      background: rgba(255,255,255,0.84);
      vertical-align: middle;
    }
    #protectedFontModeControl button {
      min-width: 52px;
      padding: 4px 10px;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: #29415e;
      font: 600 12px/1.2 Georgia, "Times New Roman", serif;
      cursor: pointer;
    }
    #protectedFontModeControl button.is-active {
      background: rgba(10, 129, 117, 0.12);
      color: #0a8175;
    }
    #protectedFontModeControl button[aria-disabled="true"] {
      opacity: 0.42;
      cursor: not-allowed;
      pointer-events: none;
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
    body.protected-old-shell.protected-theme-dark #protectedFontModeControl {
      background: rgba(16, 25, 38, 0.84);
      border-color: rgba(255,255,255,0.12);
    }
    body.protected-old-shell.protected-theme-dark #protectedFontModeControl button {
      color: #d7dee8;
    }
    body.protected-old-shell.protected-theme-dark #protectedFontModeControl button.is-active {
      color: #8be0d3;
      background: rgba(95, 210, 194, 0.16);
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
    html.is-desktop body.protected-old-shell #prev:hover,
    html.is-desktop body.protected-old-shell #next:hover,
    html.is-desktop body.protected-old-shell #prev:active,
    html.is-desktop body.protected-old-shell #next:active,
    html.is-desktop body.protected-old-shell #prev.active,
    html.is-desktop body.protected-old-shell #next.active {
      opacity: 1;
    }
    html.is-desktop body.protected-old-shell #prev:hover::before,
    html.is-desktop body.protected-old-shell #next:hover::before,
    html.is-desktop body.protected-old-shell #prev:active::before,
    html.is-desktop body.protected-old-shell #next:active::before,
    html.is-desktop body.protected-old-shell #prev.active::before,
    html.is-desktop body.protected-old-shell #next.active::before,
    html.is-desktop body.protected-old-shell #prev:hover::after,
    html.is-desktop body.protected-old-shell #next:hover::after,
    html.is-desktop body.protected-old-shell #prev:active::after,
    html.is-desktop body.protected-old-shell #next:active::after,
    html.is-desktop body.protected-old-shell #prev.active::after,
    html.is-desktop body.protected-old-shell #next.active::after {
      opacity: 1;
    }
  `;
  document.head.append(style);
}

function openNotesOverlay() {
  const openNotes = document.getElementById("openNotes");
  if (openNotes && typeof openNotes.click === "function") {
    openNotes.click();
    return;
  }
  openOverlayById("overlay-notes");
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

function loadStoredBookmarks(bookId = getCurrentBookId()) {
  try {
    const raw = window.localStorage.getItem(getBookmarkStorageKey(bookId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.restoreToken) : [];
  } catch (error) {
    return [];
  }
}

function saveStoredBookmarks(bookmarks, bookId = getCurrentBookId()) {
  HOST_STATE.bookmarks = Array.isArray(bookmarks) ? bookmarks.slice() : [];
  try {
    window.localStorage.setItem(getBookmarkStorageKey(bookId), JSON.stringify(HOST_STATE.bookmarks));
  } catch (error) {}
}

function getCurrentBookmarks() {
  if (Array.isArray(HOST_STATE.bookmarks) && HOST_STATE.bookmarks.length) return HOST_STATE.bookmarks.slice();
  HOST_STATE.bookmarks = loadStoredBookmarks();
  return HOST_STATE.bookmarks.slice();
}

function syncBookmarksFromStorage() {
  HOST_STATE.bookmarks = loadStoredBookmarks();
  return HOST_STATE.bookmarks.slice();
}

function buildBookmarkEntry(summary) {
  if (!summary || !summary.restoreToken) return null;
  return {
    id: `bm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    restoreToken: summary.restoreToken,
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
  const title = summary && summary.bookTitle ? summary.bookTitle : "Protected Reader";
  const author = summary && summary.bookAuthor ? summary.bookAuthor : "";
  const cover = summary && summary.coverUrl ? summary.coverUrl : "";
  try {
    if (typeof window.__fbUpdateMenuBookMeta === "function") {
      window.__fbUpdateMenuBookMeta({ title, author, cover });
    }
  } catch (error) {}
  const titleNode = document.getElementById("menuBookTitle");
  const authorNode = document.getElementById("menuBookAuthor");
  const coverNode = document.getElementById("menuBookCover");
  const placeholderNode = document.getElementById("menuBookCoverPlaceholder");
  if (titleNode) titleNode.textContent = title;
  if (authorNode) authorNode.textContent = author;
  if (coverNode) {
    if (cover) {
      coverNode.src = cover;
      coverNode.classList.remove("hidden");
      if (placeholderNode) {
        placeholderNode.classList.add("hidden");
        placeholderNode.style.backgroundImage = "";
      }
    } else {
      coverNode.classList.add("hidden");
      if (placeholderNode) {
        placeholderNode.classList.remove("hidden");
        placeholderNode.style.backgroundImage = "";
      }
    }
  } else if (placeholderNode && cover) {
    placeholderNode.style.backgroundImage = `url("${cover}")`;
  }
}

function setTitle(summary) {
  const title = document.getElementById("book-title");
  const chapter = document.getElementById("chapter-title");
  if (title) title.textContent = summary && summary.bookTitle ? summary.bookTitle : "Protected Reader";
  if (chapter) {
    const pieces = [];
    if (summary && summary.bookAuthor) pieces.push(summary.bookAuthor);
    if (summary && summary.chapterLabel) pieces.push(summary.chapterLabel);
    if (summary && (summary.globalPageLabel || summary.pageLabel)) pieces.push(summary.globalPageLabel || summary.pageLabel);
    chapter.textContent = pieces.join(" · ") || "Protected mode";
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
  const progress = String(bookmark && bookmark.globalPageLabel || "").trim();
  const chapter = String(bookmark && bookmark.chapterLabel || "").trim();
  if (progress && chapter) return `${progress} - ${chapter}`;
  if (progress) return progress;
  if (chapter) return chapter;
  return "Bookmark";
}

function renderBookmarks(summary) {
  const bookmarksView = document.getElementById("bookmarks");
  if (!bookmarksView) return;
  const bookmarks = syncBookmarksFromStorage();
  bookmarksView.replaceChildren();
  bookmarks.forEach((bookmark) => {
    const li = document.createElement("li");
    li.className = "list_item";
    li.dataset.restoreToken = bookmark.restoreToken || "";

    const wrap = document.createElement("div");
    wrap.className = "bookmark-text";

    const link = document.createElement("a");
    link.className = "bookmark_link";
    link.href = "#";
    link.textContent = buildBookmarkLabel(bookmark);
    link.addEventListener("click", async (event) => {
      event.preventDefault();
      await invokeBridge("restoreFromToken", bookmark.restoreToken);
      closeAllShellOverlays();
    });
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
    remove.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      saveStoredBookmarks(bookmarks.filter((item) => item.restoreToken !== bookmark.restoreToken));
      renderBookmarks(summary);
      updateBookmarkControl(summary);
    });
    li.append(remove);
    bookmarksView.append(li);
  });
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
  const search = summary && summary.searchSummary ? summary.searchSummary : { active: false, query: "", totalMatches: 0, currentMatch: 0 };
  const desktopInput = document.getElementById("searchInputDesktop");
  const desktopCount = document.getElementById("searchCountDesktop");
  const desktopNav = document.querySelector("#searchDesktop .search-nav.desktop");
  const desktopAction = document.getElementById("searchActionDesktop");
  const mobileBar = document.getElementById("searchbar");
  const mobileInput = document.getElementById("searchInputMobile");
  const mobileCount = document.getElementById("searchCount");
  if (desktopInput && document.activeElement !== desktopInput) desktopInput.value = search.query || "";
  if (mobileInput && document.activeElement !== mobileInput) mobileInput.value = search.query || "";
  if (desktopCount) desktopCount.textContent = search.active && search.totalMatches ? `${search.currentMatch}/${search.totalMatches}` : "0/0";
  if (mobileCount) mobileCount.textContent = search.active && search.totalMatches ? `${search.currentMatch}/${search.totalMatches}` : "0/0";
  if (desktopNav) desktopNav.style.display = search.active && search.totalMatches ? "inline-flex" : "none";
  if (desktopAction) {
    desktopAction.classList.toggle("is-clear", !!search.active);
    desktopAction.classList.toggle("is-mag", !search.active);
    desktopAction.classList.toggle("is-enabled", !!(search.query && search.query.length));
    desktopAction.classList.toggle("is-disabled", !(search.query && search.query.length));
    desktopAction.setAttribute("aria-label", search.active ? "Clear search" : "Search");
  }
  if (mobileBar) mobileBar.classList.toggle("hidden", !search.active && !isAutomationMode());
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

function ensureFontModeControl() {
  let wrap = document.getElementById("protectedFontModeControl");
  if (wrap) return wrap;
  const fontInc = document.getElementById("fontInc");
  const parent = fontInc && fontInc.parentElement ? fontInc.parentElement : null;
  if (!parent) return null;
  wrap = document.createElement("span");
  wrap.id = "protectedFontModeControl";
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", "Reading font style");
  wrap.innerHTML = `
    <button type="button" id="protectedFontModeSans" data-font-mode="sans">Sans</button>
    <button type="button" id="protectedFontModeSerif" data-font-mode="serif">Serif</button>
  `;
  if (fontInc.nextSibling) parent.insertBefore(wrap, fontInc.nextSibling);
  else parent.append(wrap);
  return wrap;
}

function updateFontModeControl(summary = HOST_STATE.lastSummary) {
  const wrap = ensureFontModeControl();
  if (!wrap) return;
  const activeFontMode = resolveSupportedFontMode(
    summary && (summary.runtimeFontMode || summary.fontMode)
      ? (summary.runtimeFontMode || summary.fontMode)
      : HOST_STATE.readerConfig.fontMode,
    summary,
    HOST_STATE.readerConfig.fontMode
  );
  const supportedFontModes = getSupportedFontModes(summary);
  wrap.dataset.fontMode = activeFontMode;
  wrap.dataset.supportedModes = supportedFontModes.join(",");
  ["sans", "serif"].forEach((mode) => {
    const button = document.getElementById(mode === "sans" ? "protectedFontModeSans" : "protectedFontModeSerif");
    if (!button) return;
    const supported = supportedFontModes.includes(mode);
    button.classList.toggle("is-active", activeFontMode === mode);
    button.setAttribute("aria-pressed", activeFontMode === mode ? "true" : "false");
    if (supported) {
      button.removeAttribute("aria-disabled");
      button.setAttribute("title", mode === "sans" ? "Use sans font" : "Use serif font");
    } else {
      button.setAttribute("aria-disabled", "true");
      button.setAttribute("title", "Unavailable for this book");
    }
  });
}

function syncTopControls() {
  setControlEnabled("bookmark", true);
  setControlEnabled("fontDec", true);
  setControlEnabled("fontInc", true);
  setControlEnabled("openBookmarks", true);
  ensureFontModeControl();
  updateFontModeControl();
}

function buildEngineBadge() {
  let badge = document.querySelector("#title-controls .reader-engine-badge");
  if (badge) return badge;
  badge = document.createElement("span");
  badge.className = "reader-engine-badge";
  badge.textContent = "PR";
  const titleControls = document.getElementById("title-controls");
  if (titleControls) titleControls.prepend(badge);
  return badge;
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
      target.closest("#overlay-notes .list_item, #overlay-notes .bookmark-delete, #overlay-notes .bookmark_link, #commentSheet")
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
  updateFontModeControl(summary);
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
  return ["overlay-menu", "overlay-toc", "overlay-notes", "overlay-bookmarks", "commentSheet"]
    .some((id) => {
      const node = document.getElementById(id);
      return !!(node && !node.classList.contains("hidden"));
    });
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
          toggleShellUi();
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
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      await performPageTurn("prev");
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      await performPageTurn("next");
    }
  });

  const theme = document.getElementById("themeToggle");
  const bookmark = document.getElementById("bookmark");
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
  const fontDec = document.getElementById("fontDec");
  const fontInc = document.getElementById("fontInc");
  const fontModeControl = ensureFontModeControl();
  const fontModeSans = document.getElementById("protectedFontModeSans");
  const fontModeSerif = document.getElementById("protectedFontModeSerif");
  fontDec && fontDec.addEventListener("click", async (event) => {
    event.preventDefault();
    const currentScale = HOST_STATE.lastSummary ? Number(HOST_STATE.lastSummary.fontScale || 1) : 1;
    const nextScale = persistShellFontScale(Math.max(0.8, Number((currentScale - 0.1).toFixed(2))));
    HOST_STATE.lastAppliedFontScale = nextScale;
    HOST_STATE.fontScaleSynced = true;
    await invokeBridge("setFontScale", nextScale);
  });
  fontInc && fontInc.addEventListener("click", async (event) => {
    event.preventDefault();
    const currentScale = HOST_STATE.lastSummary ? Number(HOST_STATE.lastSummary.fontScale || 1) : 1;
    const nextScale = persistShellFontScale(Math.min(1.6, Number((currentScale + 0.1).toFixed(2))));
    HOST_STATE.lastAppliedFontScale = nextScale;
    HOST_STATE.fontScaleSynced = true;
    await invokeBridge("setFontScale", nextScale);
  });
  [fontModeSans, fontModeSerif].filter(Boolean).forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const target = event.currentTarget;
      const nextMode = normalizeFontMode(target && target.dataset ? target.dataset.fontMode : "sans");
      const summary = HOST_STATE.lastSummary;
      const supported = summary && Array.isArray(summary.supportedFontModes) && summary.supportedFontModes.length
        ? summary.supportedFontModes.map((item) => normalizeFontMode(item))
        : ["sans"];
      if (!supported.includes(nextMode)) return;
      if (normalizeFontMode(HOST_STATE.readerConfig.fontMode) === nextMode) return;
      closeAllShellOverlays();
      hideSelectionToolbar();
      HOST_STATE.fontModeSynced = true;
      HOST_STATE.lastAppliedFontMode = persistShellFontMode(nextMode);
      HOST_STATE.readerConfig.fontMode = nextMode;
      updateFontModeControl({
        ...(summary || {}),
        fontMode: nextMode,
        supportedFontModes: supported
      });
      await invokeBridge("setFontMode", nextMode);
    });
  });
  if (fontModeControl) updateFontModeControl();

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

  async function submitSearch(query) {
    await invokeBridge("searchBook", query);
  }
  async function clearSearch() {
    await invokeBridge("clearSearch");
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
    await invokeBridge("searchPrevResult");
  });
  searchNext && searchNext.addEventListener("click", async (event) => {
    event.preventDefault();
    await invokeBridge("searchNextResult");
  });
  mobilePrev && mobilePrev.addEventListener("click", async (event) => {
    event.preventDefault();
    await invokeBridge("searchPrevResult");
  });
  mobileNext && mobileNext.addEventListener("click", async (event) => {
    event.preventDefault();
    await invokeBridge("searchNextResult");
  });
  mobileClear && mobileClear.addEventListener("click", async (event) => {
    event.preventDefault();
    if (mobileInput) mobileInput.value = "";
    if (searchInput) searchInput.value = "";
    await clearSearch();
  });
  searchOpen && searchOpen.addEventListener("click", (event) => {
    event.preventDefault();
    if (mobileBar) mobileBar.classList.remove("hidden");
    (mobileInput || searchInput) && (mobileInput || searchInput).focus();
  });
  searchClose && searchClose.addEventListener("click", async (event) => {
    event.preventDefault();
    if (mobileInput) mobileInput.value = "";
    if (searchInput) searchInput.value = "";
    if (mobileBar) mobileBar.classList.add("hidden");
    await clearSearch();
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
  if (isTouchShellMode()) hideShellUi();
  else showShellUi();
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
