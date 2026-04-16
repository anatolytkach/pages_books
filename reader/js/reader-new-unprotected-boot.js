(function () {
  "use strict";

  function isReaderNewRoute() {
    var pathname = String((window.location && window.location.pathname) || "").trim();
    return (
      pathname === "/books/reader_new/" ||
      pathname === "/reader_new/" ||
      pathname === "/reader/reader_new" ||
      pathname === "/reader/reader_new/" ||
      pathname === "/books/reader_new/index.html" ||
      pathname === "/reader_new/index.html" ||
      pathname === "/reader/reader_new.html"
    );
  }

  if (!isReaderNewRoute()) return;

  var params = new URLSearchParams(window.location.search || "");
  var readerMode = String(params.get("reader") || "").trim().toLowerCase();
  if (readerMode === "protected") return;
  var shellUiHidden = true;
  var lastKnownPageCount = "";
  var lastKnownChapterTitle = "";
  var outerTapLayerInstalled = false;
  var outerTapCaptureInstalled = false;
  var lastOuterUserGestureTs = 0;
  var initialUiLockUntil = Date.now() + 8000;

  function markOuterUserGesture() {
    lastOuterUserGestureTs = Date.now();
    initialUiLockUntil = 0;
  }

  function bookLocationShard(id) {
    var raw = String(id || "").trim();
    if (/^\d+$/.test(raw)) return String(Number(raw) % 100).padStart(2, "0");
    var total = 0;
    for (var i = 0; i < raw.length; i += 1) total = (total + raw.charCodeAt(i)) % 100;
    return String(total).padStart(2, "0");
  }

  function isLocalPreviewHost() {
    var host = String((window.location && window.location.hostname) || "").trim().toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  }

  function fetchBookLocation(source, id) {
    var shard = bookLocationShard(id);
    var path = source
      ? "/books/api/book-locations/" + encodeURIComponent(source) + "/" + shard + ".json?v=" + Date.now()
      : "/books/api/book-locations/" + shard + ".json?v=" + Date.now();
    return fetch(path, { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("book-locations fetch failed (" + response.status + ")");
        return response.json();
      })
      .then(function (payload) {
        var items = payload && payload.items ? payload.items : {};
        return items && items[id] ? items[id] : null;
      });
  }

  function renderMessage(title, body) {
    var viewer = document.getElementById("viewer");
    if (!viewer) return;
    viewer.innerHTML =
      '<div style="padding:18px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif">' +
      '<h2 style="margin:0 0 10px 0;font-size:18px">' + String(title || "") + "</h2>" +
      '<div style="color:#666;font-size:14px;line-height:1.4">' + String(body || "") + "</div>" +
      "</div>";
  }

  function resolveLegacyReaderBasePath() {
    var pathname = String((window.location && window.location.pathname) || "").trim();
    if (pathname.indexOf("/reader1/") === 0) return "/reader1/";
    return "/books/reader1/";
  }

  function resolveLegacyReaderId(id, locationInfo) {
    if (locationInfo) {
      var readerId = String(locationInfo.readerId || locationInfo.legacyId || "").trim();
      if (/^\d+$/.test(readerId)) return readerId;
    }
    return String(id || "").trim();
  }

  function buildLegacyReaderUrl(id, source, requestedContentSource, requestedRemoteMode, locationInfo) {
    var url = new URL(resolveLegacyReaderBasePath(), window.location.origin);
    url.searchParams.set("id", resolveLegacyReaderId(id, locationInfo));
    if (source) url.searchParams.set("source", String(source));
    if (requestedContentSource) url.searchParams.set("readerContentSource", requestedContentSource);
    if (requestedRemoteMode) url.searchParams.set("readerRemoteMode", requestedRemoteMode);
    url.searchParams.set("readerNewCompatGap", "1");
    url.searchParams.set("readerNewCompatRev", "20260416-1");
    return url.toString();
  }

  function openExternalTranslate(selectionText) {
    var text = String(selectionText || "").trim();
    if (!text) return;
    var url =
      "https://translate.google.com/?sl=auto&tl=en&text=" +
      encodeURIComponent(text) +
      "&op=translate";
    try {
      window.open(url, "_blank", "noopener");
    } catch (_error) {
      try {
        window.location.href = url;
      } catch (_error2) {}
    }
  }

  function setShellText(id, value) {
    var node = document.getElementById(id);
    if (!node) return;
    node.textContent = value || "";
  }

  function hideOuterLoader() {
    try {
      var loader = document.getElementById("loader");
      if (!loader) return;
      loader.style.display = "none";
      loader.style.visibility = "hidden";
      loader.style.opacity = "0";
      loader.style.pointerEvents = "none";
      loader.setAttribute("aria-hidden", "true");
      loader.hidden = true;
    } catch (_error) {}
  }

  function tuneUnifiedShellForUnprotected() {
    try {
      var bookmark = document.getElementById("bookmark");
      if (bookmark) {
        bookmark.style.display = "none";
        bookmark.hidden = true;
      }
      var pageCount = document.getElementById("page-count");
      if (pageCount && String(pageCount.textContent || "").trim() === "…/…") {
        pageCount.textContent = "";
      }
    } catch (_error) {}
  }

  function showOuterUi() {
    try {
      shellUiHidden = false;
      document.body.classList.remove("ui-hidden");
      syncOuterTapLayerState();
    } catch (_error) {}
  }

  function hideOuterUi() {
    try {
      shellUiHidden = true;
      document.body.classList.add("ui-hidden");
      syncOuterTapLayerState();
    } catch (_error) {}
  }

  function toggleOuterUi() {
    try {
      if (document.body.classList.contains("ui-hidden")) showOuterUi();
      else hideOuterUi();
    } catch (_error) {}
  }

  function ensureUnifiedShellOverlays() {
    try {
      if (typeof window.__readerpubEnsureUnifiedShellOverlays === "function") {
        window.__readerpubEnsureUnifiedShellOverlays();
      }
    } catch (_error) {}
  }

  function syncOuterTapLayerState() {
    try {
      var layer = document.getElementById("readerNewOuterTapLayer");
      if (!layer) return;
      var left = layer.querySelector(".reader-new-tap-left");
      var center = layer.querySelector(".reader-new-tap-center");
      var right = layer.querySelector(".reader-new-tap-right");
      var overlayOpen = !!(document.body && document.body.classList && document.body.classList.contains("overlay-open"));
      var searchOpen = !!(document.body && document.body.classList && document.body.classList.contains("search-open"));
      var toolbar = document.getElementById("selectionToolbar");
      var selectionVisible = !!(toolbar && !toolbar.classList.contains("hidden"));
      var canHandleTap = !overlayOpen && !selectionVisible && !searchOpen;
      layer.style.pointerEvents = "none";
      layer.style.opacity = canHandleTap ? "0.001" : "0";
      if (left) left.style.pointerEvents = canHandleTap && shellUiHidden ? "auto" : "none";
      if (right) right.style.pointerEvents = canHandleTap && shellUiHidden ? "auto" : "none";
      if (center) center.style.pointerEvents = "none";
    } catch (_error) {}
  }

  function isChromeInteractionTarget(target) {
    try {
      if (!target || !target.closest) return false;
      return !!target.closest(
        "#titlebar, #bottombar, #searchbar, #selectionToolbar, #overlay-backdrop, " +
        "#overlay-library, #overlay-settings, button, input, textarea, select, label, a"
      );
    } catch (_error) {}
    return false;
  }

  function installOuterTapLayer() {
    if (outerTapLayerInstalled) {
      syncOuterTapLayerState();
      return;
    }
    var viewerStack = document.getElementById("viewerStack");
    if (!viewerStack) return;
    outerTapLayerInstalled = true;

    var style = document.createElement("style");
    style.id = "readerNewOuterTapLayerStyle";
    style.textContent =
      "body.reader-new-shell-booting #titlebar,body.reader-new-shell-booting #bottombar,body.reader-new-shell-booting #searchbar{visibility:hidden!important;opacity:0!important;transition:none!important;}" +
      "body[data-reader-new-content-mode='unprotected-iframe'] #viewerStack,body[data-reader-new-content-mode='unprotected-iframe'] #viewer,body[data-reader-new-content-mode='unprotected-iframe'] #viewer-prev,body[data-reader-new-content-mode='unprotected-iframe'] #viewer-next{top:0!important;bottom:0!important;left:0!important;right:0!important;}" +
      "body[data-reader-new-content-mode='unprotected-iframe'] #titlebar,body[data-reader-new-content-mode='unprotected-iframe'] #bottombar,body[data-reader-new-content-mode='unprotected-iframe'] #searchbar{position:fixed!important;left:0!important;right:0!important;z-index:10020!important;}" +
      "#readerNewOuterTapLayer{position:absolute;inset:0;z-index:25;display:block;pointer-events:none;opacity:0.001;}" +
      "#readerNewOuterTapLayer .reader-new-tap-zone{position:absolute;top:0;bottom:0;background:rgba(0,0,0,0.001);}" +
      "#readerNewOuterTapLayer .reader-new-tap-left{left:0;width:20%;}" +
      "#readerNewOuterTapLayer .reader-new-tap-center{left:20%;width:60%;}" +
      "#readerNewOuterTapLayer .reader-new-tap-right{right:0;width:20%;}";
    if (!document.getElementById(style.id)) document.head.appendChild(style);

    var layer = document.createElement("div");
    layer.id = "readerNewOuterTapLayer";

    function makeZone(className, handler) {
      var zone = document.createElement("div");
      zone.className = "reader-new-tap-zone " + className;
      var trigger = function (event) {
        if (event) {
          event.preventDefault && event.preventDefault();
          event.stopPropagation && event.stopPropagation();
          event.stopImmediatePropagation && event.stopImmediatePropagation();
        }
        markOuterUserGesture();
        handler();
      };
      zone.addEventListener("pointerdown", function (event) {
        if (event.pointerType && event.pointerType !== "touch" && event.pointerType !== "mouse") return;
        trigger(event);
      }, true);
      zone.addEventListener("touchstart", trigger, { capture: true, passive: false });
      zone.addEventListener("click", trigger, true);
      return zone;
    }

    layer.appendChild(makeZone("reader-new-tap-left", function () {
      var prev = document.getElementById("prev");
      if (prev && typeof prev.click === "function") prev.click();
    }));
    layer.appendChild(makeZone("reader-new-tap-center", function () {
      if (shellUiHidden) showOuterUi();
      else hideOuterUi();
    }));
    layer.appendChild(makeZone("reader-new-tap-right", function () {
      var next = document.getElementById("next");
      if (next && typeof next.click === "function") next.click();
    }));

    viewerStack.appendChild(layer);
    syncOuterTapLayerState();

    if (!outerTapCaptureInstalled) {
      outerTapCaptureInstalled = true;
      var lastTapTs = 0;
      var captureTrigger = function (event) {
        try {
          var now = Date.now();
          if (now - lastTapTs < 250) return;
          var eventTarget = event && event.target && event.target.nodeType === 1
            ? event.target
            : event && event.target && event.target.parentElement
              ? event.target.parentElement
              : null;
          if (isChromeInteractionTarget(eventTarget)) return;
          var overlayOpen = !!(document.body && document.body.classList && document.body.classList.contains("overlay-open"));
          var toolbar = document.getElementById("selectionToolbar");
          var selectionVisible = !!(toolbar && !toolbar.classList.contains("hidden"));
          if (overlayOpen || selectionVisible) return;
          var pt =
            (event && event.changedTouches && event.changedTouches[0]) ||
            (event && event.touches && event.touches[0]) ||
            event;
          if (!pt || typeof pt.clientX !== "number" || typeof pt.clientY !== "number") return;
          var viewerStack = document.getElementById("viewerStack");
          if (!viewerStack) return;
          var rect = viewerStack.getBoundingClientRect();
          if (!rect || pt.clientX < rect.left || pt.clientX > rect.right || pt.clientY < rect.top || pt.clientY > rect.bottom) return;
          var relX = (pt.clientX - rect.left) / Math.max(1, rect.width);
          var zoneName = relX < 0.2 ? "left" : (relX > 0.8 ? "right" : "center");
          lastTapTs = now;
          markOuterUserGesture();
          if (event.preventDefault) event.preventDefault();
          if (event.stopPropagation) event.stopPropagation();
          if (event.stopImmediatePropagation) event.stopImmediatePropagation();
          if (zoneName === "left") {
            var prev = document.getElementById("prev");
            if (prev && typeof prev.click === "function") prev.click();
            return;
          }
          if (zoneName === "right") {
            var next = document.getElementById("next");
            if (next && typeof next.click === "function") next.click();
            return;
          }
          if (shellUiHidden) showOuterUi();
          else hideOuterUi();
        } catch (_error) {}
      };
      document.addEventListener("pointerdown", captureTrigger, true);
      document.addEventListener("touchstart", captureTrigger, { capture: true, passive: false });
      document.addEventListener("click", captureTrigger, true);
    }
  }

  function applyUnifiedShellChromeWhenReady() {
    var attempts = 0;
    function restoreDesiredUiVisibility() {
      if (shellUiHidden) hideOuterUi();
      else showOuterUi();
    }
    function applyOnce() {
      attempts += 1;
      try {
        document.body.classList.add("protected-old-shell");
        document.body.classList.add("reader-new-shell-booting");
      } catch (_error) {}
      hideOuterLoader();
      tuneUnifiedShellForUnprotected();
      ensureUnifiedShellOverlays();
      try {
        if (typeof window.__readerpubApplyUnifiedShellChrome === "function") {
          window.__readerpubApplyUnifiedShellChrome();
          tuneUnifiedShellForUnprotected();
          ensureUnifiedShellOverlays();
          restoreDesiredUiVisibility();
          try { document.body.classList.remove("reader-new-shell-booting"); } catch (_error2) {}
          return true;
        }
      } catch (_error) {}
      restoreDesiredUiVisibility();
      try { document.body.classList.remove("reader-new-shell-booting"); } catch (_error3) {}
      return false;
    }
    if (applyOnce()) return;
    var timer = window.setInterval(function () {
      if (applyOnce() || attempts >= 80) {
        window.clearInterval(timer);
      }
    }, 50);
  }

  function installIframeChrome(frame) {
    try {
      var doc = frame.contentDocument;
      if (!doc || doc.getElementById("readerNewIframeCompatStyle")) return;
      var style = doc.createElement("style");
      style.id = "readerNewIframeCompatStyle";
      style.textContent =
        "#titlebar,#bottombar,#prev,#next,#divider,#loader,#overlay-backdrop," +
        "#overlay-toc,#overlay-bookmarks,#overlay-notes,#overlay-mybooks,#overlay-voice,#overlay-menu{display:none!important;}" +
        "html,body{height:100%!important;overflow:hidden!important;}" +
        "#container,#main{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;}" +
        "#viewer{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;}" +
        "#viewer-prev,#viewer-next,#swipe-shadow{display:none!important;}";
      doc.head.appendChild(style);
    } catch (_error) {}
  }

  function attachCompatRelocatedBridge(frame) {
    try {
      if (!frame || !frame.contentWindow) return;
      var win = frame.contentWindow;
      if (win.__readerpubCompatRelocatedBridgeAttached) return;
      var reader = win.reader;
      var rendition = reader && reader.rendition;
      if (!rendition || typeof rendition.on !== "function") return;
      win.__readerpubCompatRelocatedBridgeAttached = true;
      rendition.on("relocated", function () {
        try {
          var searchOpen = !!document.body.classList.contains("search-open");
          var overlayOpen = !!document.body.classList.contains("overlay-open");
          if (!searchOpen && !overlayOpen && !shellUiHidden) {
            hideOuterUi();
          }
          syncShellFromIframe(frame);
        } catch (_error) {}
      });
    } catch (_error) {}
  }

  function syncShellFromIframe(frame) {
      try {
        var doc = frame.contentDocument;
        if (!doc) return;
      var innerTitle = doc.getElementById("book-title");
      var innerChapter = doc.getElementById("chapter-title");
      var innerPageCount = doc.getElementById("page-count");
      var bookTitle = innerTitle ? String(innerTitle.textContent || "").trim() : "";
      var chapterTitle = innerChapter ? String(innerChapter.textContent || "").trim() : "";
      var pageCount = innerPageCount ? String(innerPageCount.textContent || "").trim() : "";
      var pageChanged = !!(pageCount && lastKnownPageCount && pageCount !== lastKnownPageCount);
      var chapterChanged = !!(chapterTitle && lastKnownChapterTitle && chapterTitle !== lastKnownChapterTitle);
      setShellText("book-title", bookTitle);
      setShellText("chapter-title", chapterTitle);
      setShellText("page-count", pageCount);
      if (pageCount) lastKnownPageCount = pageCount;
      if (chapterTitle) lastKnownChapterTitle = chapterTitle;
      var innerSearchCountDesktop = doc.getElementById("searchCountDesktop");
      var innerSearchCountMobile = doc.getElementById("searchCount");
      var outerSearchCountDesktop = document.getElementById("searchCountDesktop");
      var outerSearchCountMobile = document.getElementById("searchCount");
      if (outerSearchCountDesktop && innerSearchCountDesktop) {
        outerSearchCountDesktop.textContent = String(innerSearchCountDesktop.textContent || "").trim() || "0/0";
      }
      if (outerSearchCountMobile && innerSearchCountMobile) {
        outerSearchCountMobile.textContent = String(innerSearchCountMobile.textContent || "").trim() || "0/0";
      }
      var innerSearchInputDesktop = doc.getElementById("searchInputDesktop");
      var innerSearchInputMobile = doc.getElementById("searchInputMobile");
      var outerSearchInputDesktop = document.getElementById("searchInputDesktop");
      var outerSearchInputMobile = document.getElementById("searchInputMobile");
      var activeQuery =
        (innerSearchInputDesktop && String(innerSearchInputDesktop.value || "").trim()) ||
        (innerSearchInputMobile && String(innerSearchInputMobile.value || "").trim()) ||
        "";
      if (outerSearchInputDesktop && document.activeElement !== outerSearchInputDesktop) {
        outerSearchInputDesktop.value = activeQuery;
      }
      if (outerSearchInputMobile && document.activeElement !== outerSearchInputMobile) {
        outerSearchInputMobile.value = activeQuery;
      }
      var innerBookmark = doc.getElementById("bookmark");
      var outerBookmark = document.getElementById("bookmark");
      if (innerBookmark && outerBookmark) {
        outerBookmark.className = innerBookmark.className;
      }
      var innerBody = doc.body;
      if (innerBody) {
        document.body.classList.toggle("dark-ui", innerBody.classList.contains("dark-ui"));
        document.body.classList.toggle("protected-theme-dark", innerBody.classList.contains("dark-ui"));
        var searchOpen = innerBody.classList.contains("search-open");
        var searchMinimized = innerBody.classList.contains("search-minimized");
        var overlayOpen = !!document.body.classList.contains("overlay-open");
        var initialUiLockActive = !lastOuterUserGestureTs && Date.now() < initialUiLockUntil;
        document.body.classList.toggle("search-open", searchOpen);
        document.body.classList.toggle("search-minimized", searchMinimized);
        var titlebar = document.getElementById("titlebar");
        var searchbar = document.getElementById("searchbar");
        var hideAllChrome = !!(searchOpen && searchMinimized);
        if (titlebar) titlebar.classList.toggle("hidden", !!searchOpen || hideAllChrome);
        if (searchbar) searchbar.classList.toggle("hidden", !searchOpen || hideAllChrome);
        if (hideAllChrome) {
          shellUiHidden = true;
          document.body.classList.add("ui-hidden");
        } else if (initialUiLockActive && !searchOpen && !overlayOpen) {
          shellUiHidden = true;
          document.body.classList.add("ui-hidden");
        } else if ((pageChanged || chapterChanged) && !shellUiHidden) {
          if (!overlayOpen) hideOuterUi();
        }
      }
      var innerNotesShareBtn = doc.getElementById("copyNotesLinkBtn");
      var outerNotesShareBtn = document.getElementById("protectedNotesShareBtn");
      if (innerNotesShareBtn && outerNotesShareBtn) {
        outerNotesShareBtn.disabled = !!innerNotesShareBtn.disabled;
        outerNotesShareBtn.setAttribute("aria-disabled", innerNotesShareBtn.disabled ? "true" : "false");
        outerNotesShareBtn.classList.toggle("is-disabled", !!innerNotesShareBtn.disabled);
        outerNotesShareBtn.classList.toggle("is-copied", innerNotesShareBtn.classList.contains("is-copied"));
        outerNotesShareBtn.classList.toggle("is-failed", innerNotesShareBtn.classList.contains("is-failed"));
        outerNotesShareBtn.textContent = String(innerNotesShareBtn.textContent || "").trim() || "Copy book link with Notes";
      }
      if (bookTitle) {
        document.title = chapterTitle ? bookTitle + " — " + chapterTitle : bookTitle;
      }
      syncOuterTapLayerState();
    } catch (_error) {}
  }

  function bindShellControls(frame) {
    function getFrameDocument() {
      try {
        return frame.contentDocument || null;
      } catch (_error) {
        return null;
      }
    }

    function getFrameNode(id) {
      var doc = getFrameDocument();
      return doc ? doc.getElementById(id) : null;
    }

    function openOuterOverlay(id) {
      closeOuterOverlay("overlay-library");
      closeOuterOverlay("overlay-settings");
      var overlay = document.getElementById(id);
      var backdrop = document.getElementById("overlay-backdrop");
      if (!overlay) return;
      overlay.classList.remove("hidden");
      overlay.setAttribute("aria-hidden", "false");
      if (backdrop) {
        backdrop.classList.remove("hidden");
        backdrop.setAttribute("aria-hidden", "false");
      }
      document.body.classList.add("overlay-open");
    }

    function closeOuterOverlay(id) {
      var overlay = document.getElementById(id);
      var backdrop = document.getElementById("overlay-backdrop");
      if (!overlay) return;
      overlay.classList.add("hidden");
      overlay.setAttribute("aria-hidden", "true");
      if (backdrop) {
        backdrop.classList.add("hidden");
        backdrop.setAttribute("aria-hidden", "true");
      }
      document.body.classList.remove("overlay-open");
    }

    function cloneInto(mountId, frameSelector) {
      var mount = document.getElementById(mountId);
      var source = getFrameDocument() && getFrameDocument().querySelector(frameSelector);
      if (!mount || !source) return;
      mount.innerHTML = source.innerHTML;
      var anchors = mount.querySelectorAll("a[href]");
      Array.prototype.forEach.call(anchors, function (anchor) {
        anchor.setAttribute("href", "#");
      });
    }

    function estimateBookmarkPageLabel(cfi) {
      try {
        var win = frame.contentWindow;
        if (win && typeof win.__fbGetGlobalPageLabelForCfi === "function") {
          var directLabel = String(win.__fbGetGlobalPageLabelForCfi(cfi) || "").trim();
          if (directLabel) return directLabel;
        }
        var reader = win && win.reader;
        var locations = reader && reader.book && reader.book.locations;
        var map = reader && reader._globalPageMap;
        var totalPages = map && Number(map.totalPages || 0) || 0;
        if (!locations || !totalPages || typeof locations.percentageFromCfi !== "function") return "";
        var pct = Number(locations.percentageFromCfi(cfi));
        if (!isFinite(pct)) return "";
        var page = Math.round(Math.max(0, Math.min(1, pct)) * totalPages);
        if (page < 1) page = 1;
        if (page > totalPages) page = totalPages;
        return String(page);
      } catch (_error) {
        return "";
      }
    }

    function normalizeBookmarkLabel(rawLabel, rawComment, cfi) {
      var label = String(rawLabel || "").trim();
      var comment = String(rawComment || "").trim();
      var pageLabel = label;
      if (!comment && label.indexOf(" - ") >= 0) {
        var parts = label.split(/\s+-\s+/);
        pageLabel = String(parts.shift() || "").trim();
        comment = String(parts.join(" - ") || "").trim();
      }
      var pageMatch = pageLabel.match(/^(\d+)\s*\/\s*\d+$/);
      if (pageMatch) {
        pageLabel = String(pageMatch[1] || "").trim();
      } else if (/^\d+%$/.test(pageLabel)) {
        var exactPage = estimateBookmarkPageLabel(cfi);
        if (exactPage) pageLabel = exactPage;
      }
      if (!pageLabel) pageLabel = estimateBookmarkPageLabel(cfi) || "Bookmark";
      return {
        pageLabel: pageLabel,
        comment: comment
      };
    }

    function renderOuterBookmarkList() {
      var bookmarkList = document.getElementById("protectedLibraryBookmarksList");
      var frameBookmarkList = getFrameNode("bookmarks");
      if (!bookmarkList || !frameBookmarkList) return;
      bookmarkList.innerHTML = "";
      var innerItems = frameBookmarkList.querySelectorAll("li.list_item");
      Array.prototype.forEach.call(innerItems, function (innerItem, index) {
        var innerLink = innerItem.querySelector(".bookmark_link");
        var innerComment = innerItem.querySelector(".bookmark-comment");
        var cfi = String(innerItem.getAttribute("data-cfi") || "").trim();
        var normalized = normalizeBookmarkLabel(
          innerLink ? innerLink.textContent : "",
          innerComment ? innerComment.textContent : "",
          cfi
        );

        var li = document.createElement("li");
        li.className = "list_item";
        li.setAttribute("data-readerpub-legacy-index", String(index));

        var wrap = document.createElement("div");
        wrap.className = "bookmark-text";

        var link = document.createElement("button");
        link.className = "bookmark_link";
        link.type = "button";
        link.textContent = normalized.pageLabel;
        wrap.appendChild(link);

        if (normalized.comment) {
          var comment = document.createElement("div");
          comment.className = "bookmark-comment";
          comment.textContent = normalized.comment;
          wrap.appendChild(comment);
        }

        li.appendChild(wrap);

        var innerDelete = innerItem.querySelector(".bookmark-delete");
        if (innerDelete) {
          var remove = document.createElement("button");
          remove.type = "button";
          remove.className = "bookmark-delete";
          remove.setAttribute("aria-label", "Delete bookmark");
          remove.innerHTML = innerDelete.innerHTML;
          li.appendChild(remove);
        }

        bookmarkList.appendChild(li);
      });
    }

    function bindClonedInteractions(mountId, frameSelector, itemSelector, options) {
      var mount = document.getElementById(mountId);
      var source = getFrameDocument() && getFrameDocument().querySelector(frameSelector);
      if (!mount || !source) return;
      if (mount.__readerpubIframeCompatBound) return;
      mount.__readerpubIframeCompatBound = true;
      mount.addEventListener("click", function (event) {
        var target = event.target && event.target.nodeType === 1 ? event.target : event.target && event.target.parentElement;
        if (!target || !mount.contains(target)) return;
        var actionable = target.closest(options && options.closestSelector ? options.closestSelector : itemSelector);
        if (!actionable || !mount.contains(actionable)) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation && event.stopImmediatePropagation();

        var outerItems = mount.querySelectorAll(itemSelector);
        var index = Array.prototype.indexOf.call(outerItems, actionable.closest("li.list_item") || actionable);
        if (index < 0) index = Array.prototype.indexOf.call(outerItems, actionable);
        if (index < 0) return;

        var innerItems = source.querySelectorAll(itemSelector);
        var innerNode = innerItems[index];
        if (options && typeof options.resolveInnerNode === "function") {
          innerNode = options.resolveInnerNode(source, index, actionable) || innerNode;
        }
        if (innerNode && typeof innerNode.click === "function") {
          innerNode.click();
        }
        window.setTimeout(function () {
          syncShellFromIframe(frame);
          closeOuterOverlay("overlay-library");
        }, 50);
      }, true);
    }

    function syncOuterLibraryOverlay() {
      cloneInto("protectedLibraryTocMount", "#tocView");
      cloneInto("protectedLibraryNotesMount", "#notesView");
      cloneInto("protectedLibraryMyBooksMount", "#mybooksView");
      renderOuterBookmarkList();
      bindClonedInteractions("protectedLibraryTocMount", "#tocView", "li.list_item, li", {
        closestSelector: "a, .toc_link, li",
        resolveInnerNode: function (sourceList, index) {
          var innerItems = sourceList.querySelectorAll("li.list_item, li");
          var innerItem = innerItems[index];
          if (!innerItem) return null;
          return innerItem.querySelector(".toc_link, a, button") || innerItem;
        }
      });
      bindClonedInteractions("protectedLibraryNotesMount", "#notesView", "li.list_item", {
        closestSelector: ".bookmark_link, .bookmark-delete, li.list_item",
        resolveInnerNode: function (sourceList, index, actionable) {
          var innerItems = sourceList.querySelectorAll("li.list_item");
          var innerItem = innerItems[index];
          if (!innerItem) return null;
          if (actionable && actionable.closest && actionable.closest(".bookmark-delete")) {
            return innerItem.querySelector(".bookmark-delete") || innerItem;
          }
          return innerItem.querySelector(".bookmark_link, a, button") || innerItem;
        }
      });
      bindClonedInteractions("protectedLibraryMyBooksMount", "#mybooksView", "li.list_item", {
        closestSelector: ".bookmark_link, .bookmark-delete, li.list_item",
        resolveInnerNode: function (sourceList, index, actionable) {
          var innerItems = sourceList.querySelectorAll("li.list_item");
          var innerItem = innerItems[index];
          if (!innerItem) return null;
          if (actionable && actionable.closest && actionable.closest(".bookmark-delete")) {
            return innerItem.querySelector(".bookmark-delete") || innerItem;
          }
          return innerItem.querySelector(".bookmark_link, a, button") || innerItem;
        }
      });
      bindClonedInteractions("protectedLibraryBookmarksList", "#bookmarks", "li.list_item", {
        closestSelector: ".bookmark_link, .bookmark-delete, li.list_item",
        resolveInnerNode: function (sourceList, index, actionable) {
          var innerItems = sourceList.querySelectorAll("li.list_item");
          var innerItem = innerItems[index];
          if (!innerItem) return null;
          if (actionable && actionable.closest && actionable.closest(".bookmark-delete")) {
            return innerItem.querySelector(".bookmark-delete") || innerItem;
          }
          return innerItem.querySelector(".bookmark_link") || innerItem;
        }
      });
    }

    function bindOuterOverlayClose() {
      var backdrop = document.getElementById("overlay-backdrop");
      if (backdrop && !backdrop.__readerpubIframeCompatBound) {
        backdrop.__readerpubIframeCompatBound = true;
        backdrop.addEventListener("click", function () {
          closeOuterOverlay("overlay-library");
          closeOuterOverlay("overlay-settings");
        }, true);
      }
      var settings = document.getElementById("overlay-settings");
      if (settings && !settings.__readerpubIframeCompatBound) {
        settings.__readerpubIframeCompatBound = true;
        var close = settings.querySelector(".overlay-close");
        close && close.addEventListener("click", function (event) {
          event.preventDefault();
          closeOuterOverlay("overlay-settings");
        }, true);
      }
      var library = document.getElementById("overlay-library");
      if (library && !library.__readerpubIframeCompatBound) {
        library.__readerpubIframeCompatBound = true;
        var close = library.querySelector(".overlay-close");
        close && close.addEventListener("click", function (event) {
          event.preventDefault();
          closeOuterOverlay("overlay-library");
        }, true);
      }
    }

    function bindSettingsOverlayControls() {
      var scale = document.getElementById("protectedTypographyScale");
      if (scale && !scale.__readerpubIframeCompatBound) {
        scale.__readerpubIframeCompatBound = true;
        scale.addEventListener("input", function () {
          var next = Number(scale.value || 1);
          var current = Number(scale.dataset.readerpubCurrent || 1);
          var delta = next - current;
          var clicks = Math.round(Math.abs(delta) / 0.1);
          var action = delta >= 0 ? "fontInc" : "fontDec";
          for (var i = 0; i < clicks; i += 1) {
            var node = getFrameNode(action);
            if (node && typeof node.click === "function") node.click();
          }
          scale.dataset.readerpubCurrent = String(next);
          window.setTimeout(function () {
            syncShellFromIframe(frame);
          }, 50);
        }, true);
      }
      ["protectedTypographySans", "protectedTypographySerif"].forEach(function (id) {
        var button = document.getElementById(id);
        if (!button || button.__readerpubIframeCompatBound) return;
        button.__readerpubIframeCompatBound = true;
        button.addEventListener("click", function (event) {
          event.preventDefault();
        }, true);
      });
    }

    function bindSelectionToolbarBridge() {
      var toolbar = document.getElementById("selectionToolbar");
      if (!toolbar || toolbar.__readerpubIframeCompatToolbarBound) return;
      toolbar.__readerpubIframeCompatToolbarBound = true;

      function getFrameSelectionText() {
        try {
          var win = frame.contentWindow;
          if (!win || typeof win.getSelection !== "function") return "";
          var selection = win.getSelection();
          return selection ? String(selection.toString() || "").trim() : "";
        } catch (_error) {
          return "";
        }
      }

      toolbar.addEventListener("click", function (event) {
        var actionNode = event.target && event.target.closest ? event.target.closest("[data-action]") : null;
        if (!actionNode || !toolbar.contains(actionNode)) return;
        var action = String(actionNode.getAttribute("data-action") || "").trim().toLowerCase();
        if (!action) return;

        if (action === "translate") {
          var selectionText = getFrameSelectionText();
          if (!selectionText) return;
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation && event.stopImmediatePropagation();
          openExternalTranslate(selectionText);
          return;
        }

        var doc = getFrameDocument();
        if (!doc) return;
        var innerToolbar = doc.getElementById("selectionToolbar");
        var innerAction = innerToolbar && innerToolbar.querySelector('[data-action="' + action + '"]');
        if (!innerAction || typeof innerAction.click !== "function") return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation && event.stopImmediatePropagation();
        innerAction.click();

        window.setTimeout(function () {
          syncShellFromIframe(frame);
        }, 80);
      }, true);
    }

    function bindNotesShareBridge() {
      var outerButton = document.getElementById("protectedNotesShareBtn");
      if (!outerButton || outerButton.__readerpubIframeCompatBound) return;
      outerButton.__readerpubIframeCompatBound = true;
      outerButton.addEventListener("click", function (event) {
        var innerButton = getFrameNode("copyNotesLinkBtn");
        if (!innerButton || innerButton.disabled || typeof innerButton.click !== "function") return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation && event.stopImmediatePropagation();
        innerButton.click();
        window.setTimeout(function () {
          syncShellFromIframe(frame);
        }, 80);
        window.setTimeout(function () {
          syncShellFromIframe(frame);
        }, 1400);
      }, true);
    }

    function dispatchFrameInput(node, value) {
      if (!node) return;
      try {
        node.value = value;
        node.dispatchEvent(new Event("input", { bubbles: true }));
        node.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (_error) {}
    }

    function forwardInput(outerId, innerIds) {
      var outer = document.getElementById(outerId);
      if (!outer || outer.__readerpubIframeCompatInputBound) return;
      outer.__readerpubIframeCompatInputBound = true;
      outer.addEventListener("input", function () {
        var value = String(outer.value || "");
        innerIds.forEach(function (id) {
          dispatchFrameInput(getFrameNode(id), value);
        });
        window.setTimeout(function () {
          syncShellFromIframe(frame);
        }, 50);
      }, true);
      outer.addEventListener("keydown", function (event) {
        if (event.key !== "Enter") return;
        innerIds.forEach(function (id) {
          var node = getFrameNode(id);
          if (!node) return;
          try {
            node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
            node.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
          } catch (_error) {}
        });
        window.setTimeout(function () {
          syncShellFromIframe(frame);
        }, 50);
      }, true);
    }

    function invokeFrameAction(childId, options) {
      try {
        if (options && options.frameAction && frame && frame.contentWindow) {
          var fn = frame.contentWindow[options.frameAction];
          if (typeof fn === "function") {
            fn();
            return true;
          }
        }
      } catch (_error) {}
      var target = getFrameNode(childId);
      if (target && typeof target.click === "function") {
        target.click();
        return true;
      }
      return false;
    }

    function forwardClick(parentId, childId, options) {
      var parent = document.getElementById(parentId);
      if (!parent || parent.__readerpubIframeCompatBound) return;
      parent.__readerpubIframeCompatBound = true;
      parent.addEventListener("click", function (event) {
        if (invokeFrameAction(childId, options)) {
          markOuterUserGesture();
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation && event.stopImmediatePropagation();
          if (options && options.hideUiAfter) {
            window.setTimeout(function () {
              hideOuterUi();
            }, 0);
          }
          window.setTimeout(function () {
            syncShellFromIframe(frame);
          }, 50);
        }
      }, true);
    }

    forwardClick("prev", "prev", { hideUiAfter: true, frameAction: "__fbGoPrevPage" });
    forwardClick("next", "next", { hideUiAfter: true, frameAction: "__fbGoNextPage" });
    forwardClick("slider", "slider");
    forwardClick("openBookmarks", "openBookmarks");
    forwardClick("openNotes", "openNotes");
    forwardClick("searchOpen", "searchOpen");
    forwardClick("searchActionDesktop", "searchActionDesktop");
    forwardClick("searchPrevDesktop", "searchPrevDesktop");
    forwardClick("searchNextDesktop", "searchNextDesktop");
    forwardClick("searchPrev", "searchPrev");
    forwardClick("searchNext", "searchNext");
    forwardClick("searchClose", "searchClose");
    forwardClick("searchFloatPrev", "searchFloatPrev");
    forwardClick("searchFloatNext", "searchFloatNext");
    forwardClick("searchFloatClose", "searchFloatClose");
    forwardClick("searchFloatReturn", "searchFloatReturn");
    forwardClick("bookmark", "bookmark");
    forwardClick("themeToggle", "themeToggle");
    forwardClick("fontDec", "fontDec");
    forwardClick("fontInc", "fontInc");
    forwardClick("ttsToggleDesktop", "ttsToggleDesktop");
    forwardClick("ttsToggleMobile", "ttsToggleMobile");
    var libraryTrigger = document.getElementById("protectedLibraryTrigger");
    if (libraryTrigger && !libraryTrigger.__readerpubIframeCompatBound) {
      libraryTrigger.__readerpubIframeCompatBound = true;
      libraryTrigger.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation && event.stopImmediatePropagation();
        ensureUnifiedShellOverlays();
        syncOuterLibraryOverlay();
        openOuterOverlay("overlay-library");
      }, true);
    }
    var typographyTrigger = document.getElementById("protectedTypographyTrigger");
    if (typographyTrigger && !typographyTrigger.__readerpubIframeCompatBound) {
      typographyTrigger.__readerpubIframeCompatBound = true;
      typographyTrigger.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation && event.stopImmediatePropagation();
        ensureUnifiedShellOverlays();
        bindSettingsOverlayControls();
        openOuterOverlay("overlay-settings");
      }, true);
    }
    forwardInput("searchInputDesktop", ["searchInputDesktop", "searchInputMobile"]);
    forwardInput("searchInputMobile", ["searchInputDesktop", "searchInputMobile"]);
    bindOuterOverlayClose();
    bindSelectionToolbarBridge();
    bindNotesShareBridge();
  }

  function bootReader(bookPath, id, source, requestedContentSource, requestedRemoteMode, locationInfo) {
    window.__readerpubUnprotectedRuntimePath = "legacy";
    window.__readerpubUnprotectedRenderHost = "iframe";
    window.__readerpubReaderNewUnprotectedRichMode = "iframe";

    try {
      document.body.classList.remove("unprotected-runtime-new", "unprotected-runtime-shell");
      shellUiHidden = true;
      document.body.classList.add("ui-hidden");
      document.body.classList.add("unprotected-runtime-legacy");
      document.body.setAttribute("data-unprotected-runtime", "legacy");
      document.body.setAttribute("data-reader-new-content-mode", "unprotected-iframe");
      document.body.removeAttribute("data-unprotected-runtime-rollback");
      applyUnifiedShellChromeWhenReady();
    } catch (_error) {}

    try {
      if (window.localStorage) {
        window.localStorage.setItem("readerpub:lastid", String(id || ""));
        if (source) window.localStorage.setItem("readerpub:lastsource", String(source));
      }
    } catch (_error) {}

    try {
      window.__readerpubLegacyBookPath = String(bookPath || "");
      window.__readerpubLegacyReaderUrl = buildLegacyReaderUrl(
        id,
        source,
        requestedContentSource,
        requestedRemoteMode,
        locationInfo
      );
    } catch (_error) {}

    var viewer = document.getElementById("viewer");
    var viewerPrev = document.getElementById("viewer-prev");
    var viewerNext = document.getElementById("viewer-next");
    if (!viewer) {
      renderMessage("Reader bootstrap failed", "reader_new viewer is missing.");
      return;
    }
    hideOuterLoader();
    if (viewerPrev) viewerPrev.innerHTML = "";
    if (viewerNext) viewerNext.innerHTML = "";
    viewer.innerHTML = "";
    installOuterTapLayer();

    var frame = document.createElement("iframe");
    frame.id = "reader-new-unprotected-iframe";
    frame.setAttribute("title", "Legacy Reader Content");
    frame.setAttribute("loading", "eager");
    frame.setAttribute("referrerpolicy", "same-origin");
    frame.style.width = "100%";
    frame.style.height = "100%";
    frame.style.border = "0";
    frame.style.display = "block";
    frame.style.background = "#fff";
    frame.src = window.__readerpubLegacyReaderUrl;
    frame.addEventListener("load", function () {
      try {
        if (frame.contentWindow) {
          frame.contentWindow.__readerpubReaderNewCompat = true;
          frame.contentWindow.__readerpubCompatIsUiHidden = function () {
            return !!shellUiHidden;
          };
          frame.contentWindow.__readerpubCompatShowUi = function () {
            var recentUserGesture = (Date.now() - lastOuterUserGestureTs) < 1500;
            var overlayOpen = !!document.body.classList.contains("overlay-open");
            var searchOpen = !!document.body.classList.contains("search-open");
            if (recentUserGesture || overlayOpen || searchOpen) {
              showOuterUi();
            }
          };
          frame.contentWindow.__readerpubCompatHideUi = hideOuterUi;
          frame.contentWindow.__readerpubCompatToggleUi = function () {
            markOuterUserGesture();
            toggleOuterUi();
          };
          frame.contentWindow.__readerpubOpenExternalTranslate = openExternalTranslate;
        }
      } catch (_error) {}
      installIframeChrome(frame);
      syncShellFromIframe(frame);
      bindShellControls(frame);
      tuneUnifiedShellForUnprotected();
      try {
        if (window.__readerpubUnprotectedCompatSyncTimer) {
          window.clearInterval(window.__readerpubUnprotectedCompatSyncTimer);
        }
        var compatSyncAttempts = 0;
        window.__readerpubUnprotectedCompatSyncTimer = window.setInterval(function () {
          attachCompatRelocatedBridge(frame);
          syncShellFromIframe(frame);
          compatSyncAttempts += 1;
          if (compatSyncAttempts >= 16) {
            window.clearInterval(window.__readerpubUnprotectedCompatSyncTimer);
            window.__readerpubUnprotectedCompatSyncTimer = null;
          }
        }, 500);
      } catch (_error) {}
    });
    viewer.appendChild(frame);
  }

  function start() {
    var rawHash = String(window.location.hash || "").replace(/^#/, "");
    var hashIsId = /^\d+$/.test(rawHash);
    var id =
      String(params.get("id") || "").trim() ||
      String(params.get("i") || "").trim() ||
      (hashIsId ? rawHash : "");
    var source = String(params.get("source") || "").trim();
    if (source === "gutenberg") source = "";
    var requestedContentSource = String(params.get("readerContentSource") || params.get("bookContentSource") || "")
      .trim()
      .toLowerCase();
    var requestedRemoteMode = String(params.get("readerRemoteMode") || params.get("protectedRemoteMode") || "")
      .trim()
      .toLowerCase();

    try {
      window.__readerpubContentSourceRequested = requestedContentSource || "local";
      window.__readerpubRemoteMode = requestedRemoteMode || "default";
    } catch (_error) {}

    if (!/^\d+$/.test(id)) {
      renderMessage(
        "No book selected",
        'Open a book from the catalog, or pass an id like <code style="background:#f3f3f3;padding:2px 6px;border-radius:6px">?id=1</code>.'
      );
      return;
    }

    fetchBookLocation(source, id)
      .then(function (locationInfo) {
        if (!source) {
          if (!locationInfo || String(locationInfo.source || "gutenberg") !== "gutenberg") {
            locationInfo = null;
          }
        } else if (!locationInfo || String(locationInfo.source || "") !== source) {
          locationInfo = null;
        }

        if (locationInfo && locationInfo.source && !source && locationInfo.source !== "gutenberg") {
          source = String(locationInfo.source || "");
        }

        var bookPath = "";
        if (locationInfo) {
          if (
            isLocalPreviewHost() &&
            requestedRemoteMode === "strict" &&
            requestedContentSource === "r2" &&
            locationInfo.contentPath
          ) {
            bookPath = String(locationInfo.contentPath);
            try {
              window.__readerpubContentSourceResolved = "remote-requested";
              window.__readerpubContentFallbackDetected = "strict-remote-lock";
            } catch (_error) {}
          } else if (isLocalPreviewHost() && locationInfo.localContentPath) {
            bookPath = String(locationInfo.localContentPath);
            try {
              window.__readerpubContentSourceResolved = "local";
              window.__readerpubContentFallbackDetected = "none";
            } catch (_error) {}
          } else if (locationInfo.contentPath) {
            bookPath = String(locationInfo.contentPath);
            try {
              window.__readerpubContentSourceResolved = "remote-path";
              window.__readerpubContentFallbackDetected = "none";
            } catch (_error) {}
          }
        }

        if (!bookPath) {
          renderMessage(
            "Book not found",
            'No catalog mapping was found for <code style="background:#f3f3f3;padding:2px 6px;border-radius:6px">' +
              String(id) +
              "</code>."
          );
          return;
        }

        if (!/\/$/.test(bookPath)) bookPath += "/";
        bootReader(bookPath, id, source, requestedContentSource, requestedRemoteMode, locationInfo);
      })
      .catch(function () {
        renderMessage(
          "Book not found",
          'Failed to resolve catalog mapping for <code style="background:#f3f3f3;padding:2px 6px;border-radius:6px">' +
            String(id) +
            "</code>."
        );
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
    return;
  }
  start();
})();
