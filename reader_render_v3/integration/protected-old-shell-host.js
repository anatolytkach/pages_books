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
  frame: null,
  pollTimer: null,
  turnCleanupTimer: null,
  loadingCount: 0,
  bookmarks: [],
  lastTocSignature: "",
  lastTocActiveId: "",
  lastTocCount: 0
};

const BOOKMARK_STORAGE_PREFIX = "readerpub:protected-old-shell:bookmarks:";

function installStyles() {
  if (document.getElementById(HOST_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = HOST_STYLE_ID;
  style.textContent = `
    body.protected-old-shell {
      overflow: hidden;
    }
    body.protected-old-shell #ttsToggleDesktop,
    body.protected-old-shell #ttsToggleMobile,
    body.protected-old-shell #addressBarToggle {
      display: none !important;
    }
    body.protected-old-shell #viewerStack {
      overflow: hidden;
    }
    body.protected-old-shell #viewer-prev,
    body.protected-old-shell #viewer-next {
      display: block;
      opacity: 0;
      pointer-events: none;
      transition: opacity 160ms ease, transform 180ms ease;
    }
    body.protected-old-shell.turn-preview-next #viewer-next,
    body.protected-old-shell.turn-preview-prev #viewer-prev {
      opacity: 1;
    }
    body.protected-old-shell.turn-preview-next #viewer-next {
      transform: translateX(18px) scale(0.992);
    }
    body.protected-old-shell.turn-preview-prev #viewer-prev {
      transform: translateX(-18px) scale(0.992);
    }
    body.protected-old-shell #viewer-prev .protected-turn-layer,
    body.protected-old-shell #viewer-next .protected-turn-layer {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: stretch;
      justify-content: stretch;
      background: rgba(12, 21, 33, 0.24);
    }
    body.protected-old-shell #viewer-prev .protected-turn-layer::after,
    body.protected-old-shell #viewer-next .protected-turn-layer::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, rgba(12, 21, 33, 0.16) 0%, rgba(12, 21, 33, 0.34) 100%);
      pointer-events: none;
    }
    body.protected-old-shell #viewer-prev .protected-turn-layer canvas,
    body.protected-old-shell #viewer-next .protected-turn-layer canvas {
      width: 100%;
      height: 100%;
      display: block;
      flex: 1 1 auto;
      filter: saturate(0.94) brightness(0.88);
    }
    body.protected-old-shell #swipe-shadow {
      opacity: 0;
      transition: opacity 160ms ease;
    }
    body.protected-old-shell.turn-preview-next #swipe-shadow,
    body.protected-old-shell.turn-preview-prev #swipe-shadow {
      opacity: 0.94;
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
      background: linear-gradient(180deg, #fffdfa 0%, #fbf7ef 100%);
    }
    #protectedOldShellHost.is-turning-next #protectedOldShellFrame {
      animation: protected-page-turn-next 180ms ease;
    }
    #protectedOldShellHost.is-turning-prev #protectedOldShellFrame {
      animation: protected-page-turn-prev 180ms ease;
    }
    #protectedOldShellFrame {
      width: 100%;
      height: 100%;
      border: 0;
      display: block;
      background: transparent;
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
      width: min(14vw, 110px);
      z-index: 7;
      border: 0;
      background: transparent;
      color: transparent;
      cursor: pointer;
    }
    .protected-nav-edge.prev { left: 0; }
    .protected-nav-edge.next { right: 0; }
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
    body.protected-old-shell.protected-theme-dark #protectedOldShellHost {
      background: linear-gradient(180deg, #0f1825 0%, #142131 100%);
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

function getCurrentBookId() {
  return HOST_STATE.lastSummary && HOST_STATE.lastSummary.bookId
    ? String(HOST_STATE.lastSummary.bookId)
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

  const link = document.createElement("a");
  link.className = "bookmark_link";
  link.href = "#";
  link.textContent = annotation.noteText || `${annotation.type} · ${annotation.globalRange}`;
  link.addEventListener("click", async (event) => {
    event.preventDefault();
    await invokeBridge("goToAnnotation", annotation.annotationId);
    closeAllShellOverlays();
  });
  wrap.append(link);

  const comment = document.createElement("div");
  comment.className = "bookmark-comment";
  comment.textContent = annotation.globalRange;
  wrap.append(comment);
  li.append(wrap);

  const go = document.createElement("button");
  go.type = "button";
  go.className = "bookmark-delete";
  go.setAttribute("aria-label", "Go to note");
  go.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5l8 7-8 7"></path></svg>';
  go.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await invokeBridge("goToAnnotation", annotation.annotationId);
    closeAllShellOverlays();
  });
  li.append(go);
  return li;
}

function renderNotes(summary) {
  const notes = document.getElementById("notes");
  if (!notes) return;
  notes.replaceChildren();
  const annotations = Array.isArray(summary && summary.annotations) ? summary.annotations : [];
  const noteAnnotations = annotations.filter((annotation) => annotation.type === "note");
  noteAnnotations.forEach((annotation) => notes.append(createOldStyleNoteItem(annotation)));
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

function syncTopControls() {
  setControlEnabled("bookmark", true);
  setControlEnabled("fontDec", true);
  setControlEnabled("fontInc", true);
  setControlEnabled("openBookmarks", true);
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

function clearPageTurnPreview() {
  const prevLayer = document.getElementById("viewer-prev");
  const nextLayer = document.getElementById("viewer-next");
  if (prevLayer) prevLayer.replaceChildren();
  if (nextLayer) nextLayer.replaceChildren();
  document.body.classList.remove("turn-preview-next", "turn-preview-prev");
  const shadow = document.getElementById("swipe-shadow");
  if (shadow) shadow.style.opacity = "0";
  if (HOST_STATE.turnCleanupTimer) {
    window.clearTimeout(HOST_STATE.turnCleanupTimer);
    HOST_STATE.turnCleanupTimer = null;
  }
}

function cloneProtectedCanvases() {
  const frame = HOST_STATE.frame;
  if (!frame || !frame.contentDocument) return [];
  const canvases = [...frame.contentDocument.querySelectorAll(".reader-frame canvas")];
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
    return target;
  }).filter(Boolean);
}

function primePageTurnPreview(direction) {
  const layerId = direction === "prev" ? "viewer-prev" : "viewer-next";
  const layer = document.getElementById(layerId);
  if (!layer) return;
  const canvases = cloneProtectedCanvases();
  if (!canvases.length) return;
  const wrap = document.createElement("div");
  wrap.className = "protected-turn-layer";
  canvases.forEach((canvas) => wrap.append(canvas));
  layer.replaceChildren(wrap);
  document.body.classList.remove("turn-preview-next", "turn-preview-prev");
  document.body.classList.add(direction === "prev" ? "turn-preview-prev" : "turn-preview-next");
  const shadow = document.getElementById("swipe-shadow");
  if (shadow) shadow.style.opacity = "0.8";
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
      save.removeEventListener("click", onSave);
      cancel.removeEventListener("click", onCancel);
      backdrop && backdrop.removeEventListener("click", onCancel);
      resolve();
    };
    const onCancel = (event) => {
      event && event.preventDefault();
      close();
    };
    const onSave = async (event) => {
      event && event.preventDefault();
      try {
        await invokeBridge("addNoteToSelection", input.value || "");
      } finally {
        close();
      }
    };
    save.addEventListener("click", onSave);
    cancel.addEventListener("click", onCancel);
    backdrop && backdrop.addEventListener("click", onCancel);
  });
}

function hideSelectionToolbar() {
  const toolbar = document.getElementById("selectionToolbar");
  if (!toolbar) return;
  toolbar.classList.add("hidden");
  toolbar.setAttribute("aria-hidden", "true");
}

function showSelectionToolbar(clientX, clientY) {
  const toolbar = document.getElementById("selectionToolbar");
  if (!toolbar) return;
  toolbar.classList.remove("hidden");
  toolbar.setAttribute("aria-hidden", "false");
  toolbar.style.left = `${Math.max(12, clientX - 70)}px`;
  toolbar.style.top = `${Math.max(12, clientY - 64)}px`;
  toolbar.style.visibility = "visible";
}

function showSelectionToolbarForSummary(summary, fallbackX = 160, fallbackY = 160) {
  const frame = HOST_STATE.frame;
  const bounds = summary && summary.selectionBounds ? summary.selectionBounds : null;
  if (!frame || !bounds) {
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
}

function bindSelectionToolbar() {
  const toolbar = document.getElementById("selectionToolbar");
  if (!toolbar || toolbar.__protectedBound) return;
  toolbar.__protectedBound = true;
  toolbar.addEventListener("click", async (event) => {
    const button = event.target && event.target.closest ? event.target.closest("[data-action]") : null;
    if (!button) return;
    event.preventDefault();
    const action = button.getAttribute("data-action");
    if (action === "note") {
      await openProtectedNoteComposer();
      hideSelectionToolbar();
      return;
    }
    if (action === "copy") {
      await invokeBridge("copySelection");
      hideSelectionToolbar();
      return;
    }
    if (action === "search") {
      const searchOpen = document.getElementById("searchOpen");
      searchOpen && searchOpen.click();
      hideSelectionToolbar();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (toolbar.contains(event.target)) return;
    hideSelectionToolbar();
  }, true);
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
    try {
      doc = frame && frame.contentDocument ? frame.contentDocument : null;
    } catch (error) {
      return;
    }
    if (!doc || doc.__protectedSurfaceInteractionsBound) return;
    doc.__protectedSurfaceInteractionsBound = true;
    doc.addEventListener("contextmenu", (event) => {
      const target = event.target;
      const inProtectedSurface = !!(target && target.closest && target.closest("#reader-canvas, #overlay-canvas, canvas, .reader-frame"));
      const summary = getBridgeSummaryFromFrame(frame);
      if (!inProtectedSurface || !summary || !summary.selectionActive) return;
      event.preventDefault();
      event.stopPropagation();
      showSelectionToolbarForSummary(summary, event.clientX, event.clientY);
    }, true);
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
    installTouchSwipe(doc);
  };
  frame.addEventListener("load", wire);
  wire();
}

function updateFromSummary(summary) {
  if (!summary) return;
  HOST_STATE.lastSummary = summary;
  if (summary.ready) {
    HOST_STATE.loadingCount = 0;
    setShellLoading(false);
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
  updateBookmarkControl(summary);
  buildEngineBadge();
  const actionStatus = document.getElementById("protectedShellActionStatus");
  if (actionStatus) {
    actionStatus.textContent = summary.statusText || `Page ${summary.globalPageLabel || summary.pageLabel || "n/a"}`;
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
  setShellLoading(true);
  try {
    const result = await bridge[method](...args);
    updateFromSummary(result);
    return result;
  } finally {
    HOST_STATE.loadingCount = 0;
    setShellLoading(false);
  }
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

function animatePageTurn(direction) {
  const host = document.getElementById("protectedOldShellHost");
  if (!host) return;
  clearPageTurnPreview();
  primePageTurnPreview(direction);
  host.classList.remove("is-turning-next", "is-turning-prev");
  host.offsetHeight;
  host.classList.add(direction === "prev" ? "is-turning-prev" : "is-turning-next");
  HOST_STATE.turnCleanupTimer = window.setTimeout(() => {
    host.classList.remove("is-turning-next", "is-turning-prev");
    clearPageTurnPreview();
  }, 180);
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

  function onStart(event) {
    const touch = event.touches ? event.touches[0] : null;
    if (!touch || overlaysVisible()) return;
    gesture = {
      x: touch.clientX,
      y: touch.clientY
    };
  }

  function onMove(event) {
    if (!gesture) return;
    const touch = event.touches ? event.touches[0] : null;
    if (!touch) return;
    const dx = touch.clientX - gesture.x;
    const dy = touch.clientY - gesture.y;
    if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy)) {
      event.preventDefault();
    }
  }

  async function onEnd(event) {
    if (!gesture) return;
    const touch = event.changedTouches ? event.changedTouches[0] : null;
    if (!touch) {
      gesture = null;
      return;
    }
    const dx = touch.clientX - gesture.x;
    const dy = touch.clientY - gesture.y;
    gesture = null;
    if (Math.abs(dx) < 58 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
    event.preventDefault();
    if (dx < 0) {
      animatePageTurn("next");
      await invokeBridge("nextPage");
      return;
    }
    animatePageTurn("prev");
    await invokeBridge("prevPage");
  }

  target.addEventListener("touchstart", onStart, { passive: true, capture: true });
  target.addEventListener("touchmove", onMove, { passive: false, capture: true });
  target.addEventListener("touchend", onEnd, { passive: false, capture: true });
  target.addEventListener("touchcancel", () => {
    gesture = null;
  }, { passive: true, capture: true });
}

function bindShellControls() {
  if (document.body.dataset.protectedShellBound === "yes") return;
  document.body.dataset.protectedShellBound = "yes";

  const prev = document.getElementById("prev");
  const next = document.getElementById("next");
  prev && prev.addEventListener("click", async (event) => {
    event.preventDefault();
    animatePageTurn("prev");
    await invokeBridge("prevPage");
  });
  next && next.addEventListener("click", async (event) => {
    event.preventDefault();
    animatePageTurn("next");
    await invokeBridge("nextPage");
  });

  document.addEventListener("keydown", async (event) => {
    if (!HOST_STATE.frame) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      animatePageTurn("prev");
      await invokeBridge("prevPage");
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      animatePageTurn("next");
      await invokeBridge("nextPage");
    }
  });

  const theme = document.getElementById("themeToggle");
  const bookmark = document.getElementById("bookmark");
  theme && theme.addEventListener("click", async (event) => {
    event.preventDefault();
    const currentTheme = HOST_STATE.lastSummary && HOST_STATE.lastSummary.theme === "dark" ? "dark" : "light";
    await invokeBridge("setTheme", currentTheme === "dark" ? "light" : "dark");
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
  fontDec && fontDec.addEventListener("click", async (event) => {
    event.preventDefault();
    const currentScale = HOST_STATE.lastSummary ? Number(HOST_STATE.lastSummary.fontScale || 1) : 1;
    await invokeBridge("setFontScale", Math.max(0.8, Number((currentScale - 0.1).toFixed(2))));
  });
  fontInc && fontInc.addEventListener("click", async (event) => {
    event.preventDefault();
    const currentScale = HOST_STATE.lastSummary ? Number(HOST_STATE.lastSummary.fontScale || 1) : 1;
    await invokeBridge("setFontScale", Math.min(1.6, Number((currentScale + 0.1).toFixed(2))));
  });

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
    animatePageTurn("prev");
    await invokeBridge("prevPage");
  });

  const next = document.createElement("button");
  next.type = "button";
  next.id = "protectedOldShellNextEdge";
  next.className = "protected-nav-edge next";
  next.textContent = "Next";
  next.addEventListener("click", async () => {
    animatePageTurn("next");
    await invokeBridge("nextPage");
  });

  host.append(frame, prev, next);
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
  });
}

function buildEmbeddedProtectedUrl() {
  const url = new URL("/reader_render_v3/integration/protected-reader.html", window.location.origin);
  const params = new URLSearchParams(window.location.search || "");
  params.set("reader", "protected");
  params.set("embedded", "old-shell");
  params.set("protectedDrive", params.get("protectedDrive") || "disabled");
  params.set("automationSafe", params.get("automationSafe") || params.get("protectedAutomation") || "1");
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
  document.body.classList.remove("ui-hidden");
  document.body.classList.add("protected-old-shell");
  document.body.classList.toggle("protected-dev-panel", isDevPanelEnabled());
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
