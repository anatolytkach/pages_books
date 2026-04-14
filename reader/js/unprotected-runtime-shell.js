(function (global) {
  "use strict";

  if (!global) return;

  function getParam(name) {
    try {
      return new URLSearchParams(global.location.search || "").get(name) || "";
    } catch (_error) {
      return "";
    }
  }

  function getMode() {
    var readerMode = String(getParam("reader") || "").trim().toLowerCase();
    if (readerMode === "protected" || readerMode === "old_shell") return "disabled";
    var requested = String(getParam("unprotectedRuntime") || "").trim().toLowerCase();
    if (requested === "legacy" || requested === "old" || requested === "iframe") return "legacy";
    if (requested === "new") return "new";
    return "new";
  }

  function isEnabled() {
    return getMode() === "new";
  }

  function isLegacyRollback() {
    return getMode() === "legacy";
  }

  function bootstrap(context) {
    if (!context || !context.adapter || !context.stateStore) return;
    var adapter = context.adapter;
    var stateStore = context.stateStore;
    var renderHost = context.renderHost || global.__READERPUB_UNPROTECTED_RUNTIME_HOST__ || null;
    var prev = document.getElementById("prev");
    var next = document.getElementById("next");
    var pageCount = document.getElementById("page-count");
    var loader = document.getElementById("loader");
    var themeToggle = document.getElementById("themeToggle");
    var searchOpen = document.getElementById("searchOpen");
    var searchActionDesktop = document.getElementById("searchActionDesktop");
    var searchPrevDesktop = document.getElementById("searchPrevDesktop");
    var searchNextDesktop = document.getElementById("searchNextDesktop");
    var searchCountDesktop = document.getElementById("searchCountDesktop");
    var searchPrevMobile = document.getElementById("searchPrev");
    var searchNextMobile = document.getElementById("searchNext");
    var searchCountMobile = document.getElementById("searchCount");
    var searchFloatPrev = document.getElementById("searchFloatPrev");
    var searchFloatNext = document.getElementById("searchFloatNext");
    var searchFloatClose = document.getElementById("searchFloatClose");
    var searchFloatReturn = document.getElementById("searchFloatReturn");
    var searchInputDesktop = document.getElementById("searchInputDesktop");
    var searchInputMobile = document.getElementById("searchInputMobile");
    var searchClearMobile = document.getElementById("searchClearMobile");
    var searchbar = document.getElementById("searchbar");
    var searchDesktop = document.getElementById("searchDesktop");
    var searchFloatControls = document.getElementById("searchFloatControls");
    var searchClose = document.getElementById("searchClose");
    var slider = document.getElementById("slider");
    var openNotes = document.getElementById("openNotes");
    var openBookmarks = document.getElementById("openBookmarks");
    var bookmarkButton = document.getElementById("bookmark");
    var mobileMoreBookmark = document.getElementById("mobileMoreBookmark");
    var fontDec = document.getElementById("fontDec");
    var fontInc = document.getElementById("fontInc");
    var mobileMoreFontDec = document.getElementById("mobileMoreFontDec");
    var mobileMoreFontInc = document.getElementById("mobileMoreFontInc");
    var overlayToc = document.getElementById("overlay-toc");
    var overlayNotes = document.getElementById("overlay-notes");
    var overlayBookmarks = document.getElementById("overlay-bookmarks");
    var overlayBackdrop = document.getElementById("overlay-backdrop");
    var tocView = document.getElementById("tocView");
    var bookmarksView = document.getElementById("bookmarks");
    var notesView = document.getElementById("notes");
    var commentBackdrop = document.getElementById("commentBackdrop");
    var commentSheet = document.getElementById("commentSheet");
    var commentInput = document.getElementById("commentInput");
    var commentCancel = document.getElementById("commentCancel");
    var commentSave = document.getElementById("commentSave");
    var selectionToolbar = document.getElementById("selectionToolbar");
    var closeButtons = document.querySelectorAll(".overlay-close");
    var directNavPrev = renderHost && renderHost.navPrevButton ? renderHost.navPrevButton : null;
    var directNavNext = renderHost && renderHost.navNextButton ? renderHost.navNextButton : null;

    document.body.classList.remove("ui-hidden");
    document.body.setAttribute("data-unprotected-runtime", "new");
    document.body.removeAttribute("data-unprotected-runtime-rollback");
    document.body.classList.remove("unprotected-runtime-legacy");
    document.body.classList.add("unprotected-runtime-shell");
    document.body.classList.add("unprotected-runtime-unified-shell");

    function openOverlay(panel) {
      if (!panel || !overlayBackdrop) return;
      panel.classList.remove("hidden");
      overlayBackdrop.classList.remove("hidden");
      document.body.classList.add("overlay-open");
    }

    function closeOverlays() {
      if (overlayToc) overlayToc.classList.add("hidden");
      if (overlayNotes) overlayNotes.classList.add("hidden");
      if (overlayBookmarks) overlayBookmarks.classList.add("hidden");
      if (!overlayBackdrop) return;
      overlayBackdrop.classList.add("hidden");
      document.body.classList.remove("overlay-open");
    }

    function openToc() { openOverlay(overlayToc); }
    function openNotesOverlay() { openOverlay(overlayNotes); }
    function openBookmarksOverlay() { openOverlay(overlayBookmarks); }

    function openCommentSheet() {
      if (!commentBackdrop || !commentSheet) return;
      commentBackdrop.classList.remove("hidden");
      commentSheet.classList.remove("hidden");
      if (commentInput) {
        commentInput.value = "";
        try { commentInput.focus(); } catch (_error) {}
      }
    }

    function closeCommentSheet() {
      if (commentBackdrop) commentBackdrop.classList.add("hidden");
      if (commentSheet) commentSheet.classList.add("hidden");
    }

    function setSearchUi(open) {
      if (searchbar) searchbar.classList.toggle("hidden", !open);
      if (searchFloatControls) searchFloatControls.classList.toggle("hidden", !open);
      if (searchDesktop) searchDesktop.classList.toggle("search-open", !!open);
    }

    function renderToc(snapshot) {
      if (!tocView) return;
      var count = snapshot && snapshot.book ? Number(snapshot.book.sectionCount || 0) : 0;
      var current = snapshot && snapshot.location ? Number(snapshot.location.sectionIndex || snapshot.location.spineIndex || 0) : 0;
      var html = [];
      for (var i = 0; i < count; i += 1) {
        var active = i === current ? ' aria-current="page"' : "";
        html.push(
          '<a href="#" data-spine-index="' + String(i) + '"' + active + ">" +
          "Section " + String(i + 1) +
          "</a>"
        );
      }
      tocView.innerHTML = html.join("");
    }

    function renderBookmarks(snapshot) {
      if (!bookmarksView) return;
      var items = snapshot && snapshot.bookmarks && Array.isArray(snapshot.bookmarks.items)
        ? snapshot.bookmarks.items
        : [];
      if (!items.length) {
        bookmarksView.innerHTML = '<li class="readerpub-unprotected-runtime-empty">No bookmarks yet.</li>';
        return;
      }
      var html = [];
      for (var i = 0; i < items.length; i += 1) {
        var item = items[i];
        html.push(
          '<li data-bookmark-id="' + String(item.id) + '">' +
            '<a href="#" data-bookmark-jump="' + String(item.id) + '">' + String(item.label || "Bookmark") + '</a>' +
            '<button type="button" data-bookmark-delete="' + String(item.id) + '">Delete</button>' +
          '</li>'
        );
      }
      bookmarksView.innerHTML = html.join("");
    }

    function renderNotes(snapshot) {
      if (!notesView) return;
      var items = snapshot && snapshot.annotations && Array.isArray(snapshot.annotations.items)
        ? snapshot.annotations.items.filter(function (item) { return item.type === "note"; })
        : [];
      if (!items.length) {
        notesView.innerHTML = '<li class="readerpub-unprotected-runtime-empty">No notes yet.</li>';
        return;
      }
      var html = [];
      for (var i = 0; i < items.length; i += 1) {
        var item = items[i];
        html.push(
          '<li data-note-id="' + String(item.id) + '">' +
            '<a href="#" data-note-jump="' + String(item.id) + '">' + String(item.quote || item.title || "Note") + '</a>' +
            '<div>' + String(item.noteText || "") + '</div>' +
          '</li>'
        );
      }
      notesView.innerHTML = html.join("");
    }

    function updateSearchUi(snapshot) {
      var searchState = snapshot && snapshot.search ? snapshot.search : {};
      var countText = Number(searchState.currentMatch || 0) + "/" + Number(searchState.totalMatches || 0);
      if (searchCountDesktop) searchCountDesktop.textContent = countText;
      if (searchCountMobile) searchCountMobile.textContent = countText;
      if (searchInputDesktop && searchInputDesktop.value !== String(searchState.query || "")) searchInputDesktop.value = String(searchState.query || "");
      if (searchInputMobile && searchInputMobile.value !== String(searchState.query || "")) searchInputMobile.value = String(searchState.query || "");
      if (searchClearMobile) searchClearMobile.classList.toggle("hidden", !searchState.query);
      setSearchUi(!!searchState.active);
    }

    function updateBookmarkButtons(snapshot) {
      var items = snapshot && snapshot.bookmarks && Array.isArray(snapshot.bookmarks.items)
        ? snapshot.bookmarks.items
        : [];
      var token = String(snapshot && snapshot.location ? snapshot.location.pageToken || "" : "");
      var active = items.some(function (item) {
        return String(item.pageToken || "") === token;
      });
      [bookmarkButton, mobileMoreBookmark, openBookmarks].forEach(function (el) {
        if (!el || !el.classList) return;
        el.classList.toggle("icon-bookmark-empty", !active);
        el.classList.toggle("icon-bookmark", active);
      });
    }

    function updateSelectionToolbar(snapshot) {
      var selection = snapshot && snapshot.selection ? snapshot.selection : {};
      if (!selectionToolbar) return;
      selectionToolbar.classList.toggle("hidden", !selection.active);
    }

    function refresh(snapshot) {
      snapshot = snapshot || stateStore.getSnapshot();
      if (loader) loader.style.display = snapshot.status === "loading" ? "block" : "none";
      if (pageCount) {
        pageCount.textContent = snapshot.location.label || "";
        pageCount.setAttribute("data-page-counter", snapshot.location.label || "");
      }
      if (prev) prev.style.opacity = snapshot.location.canGoPrev ? "1" : "0.35";
      if (next) next.style.opacity = snapshot.location.canGoNext ? "1" : "0.35";
      renderToc(snapshot);
      renderBookmarks(snapshot);
      renderNotes(snapshot);
      updateSearchUi(snapshot);
      updateBookmarkButtons(snapshot);
      updateSelectionToolbar(snapshot);
    }

    if (prev) {
      prev.addEventListener("click", function (event) {
        event.preventDefault();
        adapter.prevPage();
      });
    }
    if (next) {
      next.addEventListener("click", function (event) {
        event.preventDefault();
        adapter.nextPage();
      });
    }
    if (directNavPrev) {
      directNavPrev.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        adapter.prevPage();
      });
    }
    if (directNavNext) {
      directNavNext.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        adapter.nextPage();
      });
    }
    if (themeToggle) {
      themeToggle.addEventListener("click", function (event) {
        event.preventDefault();
        var current = stateStore.getSnapshot().appearance.theme || "light";
        adapter.setTheme(current === "dark" ? "light" : "dark");
      });
    }
    if (searchOpen) {
      searchOpen.addEventListener("click", function (event) {
        event.preventDefault();
        setSearchUi(true);
        if (searchInputDesktop) try { searchInputDesktop.focus(); } catch (_error) {}
      });
    }
    if (searchActionDesktop) {
      searchActionDesktop.addEventListener("click", function (event) {
        event.preventDefault();
        adapter.search(searchInputDesktop ? searchInputDesktop.value : "");
      });
    }
    if (searchPrevDesktop) {
      searchPrevDesktop.addEventListener("click", function (event) {
        event.preventDefault();
        adapter.searchPrevResult();
      });
    }
    if (searchNextDesktop) {
      searchNextDesktop.addEventListener("click", function (event) {
        event.preventDefault();
        adapter.searchNextResult();
      });
    }
    if (searchPrevMobile) {
      searchPrevMobile.addEventListener("click", function (event) {
        event.preventDefault();
        adapter.searchPrevResult();
      });
    }
    if (searchNextMobile) {
      searchNextMobile.addEventListener("click", function (event) {
        event.preventDefault();
        adapter.searchNextResult();
      });
    }
    if (searchFloatPrev) searchFloatPrev.addEventListener("click", function () { adapter.searchPrevResult(); });
    if (searchFloatNext) searchFloatNext.addEventListener("click", function () { adapter.searchNextResult(); });
    if (searchFloatClose) searchFloatClose.addEventListener("click", function () { adapter.clearSearch(); });
    if (searchFloatReturn) {
      searchFloatReturn.addEventListener("click", function () {
        var searchState = stateStore.getSnapshot().search || {};
        if (searchState.originLocation) adapter.goToLocation(searchState.originLocation);
      });
    }
    if (searchClose) {
      searchClose.addEventListener("click", function (event) {
        event.preventDefault();
        adapter.clearSearch();
      });
    }
    if (searchInputDesktop) {
      searchInputDesktop.addEventListener("keydown", function (event) {
        if (event.key === "Enter") adapter.search(searchInputDesktop.value || "");
      });
    }
    if (searchInputMobile) {
      searchInputMobile.addEventListener("keydown", function (event) {
        if (event.key === "Enter") adapter.search(searchInputMobile.value || "");
      });
    }
    if (searchClearMobile) {
      searchClearMobile.addEventListener("click", function () {
        adapter.clearSearch();
      });
    }
    if (slider) {
      slider.addEventListener("click", function (event) {
        event.preventDefault();
        openToc();
      });
    }
    if (openNotes) {
      openNotes.addEventListener("click", function (event) {
        event.preventDefault();
        openNotesOverlay();
      });
    }
    if (openBookmarks) {
      openBookmarks.addEventListener("click", function (event) {
        event.preventDefault();
        openBookmarksOverlay();
      });
    }
    if (bookmarkButton) {
      bookmarkButton.addEventListener("click", function (event) {
        event.preventDefault();
        adapter.toggleBookmark();
      });
    }
    if (mobileMoreBookmark) {
      mobileMoreBookmark.addEventListener("click", function (event) {
        event.preventDefault();
        adapter.toggleBookmark();
      });
    }
    if (fontDec) fontDec.addEventListener("click", function (event) {
      event.preventDefault();
      var current = Number(stateStore.getSnapshot().appearance.fontScale || 1);
      adapter.setFontScale(Math.max(0.8, current - 0.1));
    });
    if (fontInc) fontInc.addEventListener("click", function (event) {
      event.preventDefault();
      var current = Number(stateStore.getSnapshot().appearance.fontScale || 1);
      adapter.setFontScale(Math.min(1.8, current + 0.1));
    });
    if (mobileMoreFontDec) mobileMoreFontDec.addEventListener("click", function () {
      var current = Number(stateStore.getSnapshot().appearance.fontScale || 1);
      adapter.setFontScale(Math.max(0.8, current - 0.1));
    });
    if (mobileMoreFontInc) mobileMoreFontInc.addEventListener("click", function () {
      var current = Number(stateStore.getSnapshot().appearance.fontScale || 1);
      adapter.setFontScale(Math.min(1.8, current + 0.1));
    });
    if (overlayBackdrop) {
      overlayBackdrop.addEventListener("click", function () { closeOverlays(); });
    }
    for (var i = 0; i < closeButtons.length; i += 1) {
      closeButtons[i].addEventListener("click", function () { closeOverlays(); });
    }
    if (tocView) {
      tocView.addEventListener("click", function (event) {
        var link = event.target && event.target.closest ? event.target.closest("[data-spine-index]") : null;
        if (!link) return;
        event.preventDefault();
        var index = Number(link.getAttribute("data-spine-index"));
        adapter.goToLocation({ spineIndex: index }).then(function () {
          closeOverlays();
        });
      });
    }
    if (bookmarksView) {
      bookmarksView.addEventListener("click", function (event) {
        var jump = event.target && event.target.closest ? event.target.closest("[data-bookmark-jump]") : null;
        var del = event.target && event.target.closest ? event.target.closest("[data-bookmark-delete]") : null;
        if (jump) {
          event.preventDefault();
          adapter.goToBookmark(jump.getAttribute("data-bookmark-jump")).then(function () { closeOverlays(); });
        } else if (del) {
          event.preventDefault();
          adapter.deleteBookmark(del.getAttribute("data-bookmark-delete"));
        }
      });
    }
    if (notesView) {
      notesView.addEventListener("click", function (event) {
        var jump = event.target && event.target.closest ? event.target.closest("[data-note-jump]") : null;
        if (!jump) return;
        event.preventDefault();
        adapter.goToAnnotation(jump.getAttribute("data-note-jump")).then(function () { closeOverlays(); });
      });
    }
    if (commentBackdrop) commentBackdrop.addEventListener("click", closeCommentSheet);
    if (commentCancel) commentCancel.addEventListener("click", function () {
      closeCommentSheet();
    });
    if (commentSave) {
      commentSave.addEventListener("click", function () {
        adapter.addNote(null, commentInput ? commentInput.value : "").then(function (result) {
          if (result && result.ok) closeCommentSheet();
        });
      });
    }
    if (selectionToolbar) {
      selectionToolbar.addEventListener("click", function (event) {
        var button = event.target && event.target.closest ? event.target.closest("[data-action]") : null;
        if (!button) return;
        var action = String(button.getAttribute("data-action") || "");
        if (action === "note") {
          openCommentSheet();
        } else if (action === "copy") {
          var selectionState = adapter.getSelectionState ? adapter.getSelectionState() : null;
          if (selectionState && selectionState.text && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(selectionState.text).catch(function () {});
          }
          if (adapter.clearSelection) adapter.clearSelection();
        } else if (action === "search") {
          var selectionStateSearch = adapter.getSelectionState ? adapter.getSelectionState() : null;
          if (selectionStateSearch && selectionStateSearch.text) {
            adapter.search(selectionStateSearch.text);
          }
        } else if (action === "share") {
          var selectionStateShare = adapter.getSelectionState ? adapter.getSelectionState() : null;
          if (selectionStateShare && selectionStateShare.text && navigator.share) {
            navigator.share({ text: selectionStateShare.text }).catch(function () {});
          }
        }
      });
    }

    document.addEventListener("selectionchange", function () {
      adapter.captureSelectionFromDom();
    });
    document.addEventListener("keydown", function (event) {
      if (!event) return;
      if (event.defaultPrevented) return;
      var target = event.target;
      var tagName = target && target.tagName ? String(target.tagName).toLowerCase() : "";
      if (tagName === "input" || tagName === "textarea" || tagName === "select") return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        adapter.prevPage();
      } else if (event.key === "ArrowRight" || event.key === " " || event.key === "PageDown") {
        event.preventDefault();
        adapter.nextPage();
      } else if (event.key === "PageUp") {
        event.preventDefault();
        adapter.prevPage();
      }
    });

    stateStore.subscribe(refresh);
    refresh(stateStore.getSnapshot());
  }

  global.ReaderPubUnprotectedRuntimeNew = global.ReaderPubUnprotectedRuntimeNew || {};
  global.ReaderPubUnprotectedRuntimeNew.shell = {
    getMode: getMode,
    isEnabled: isEnabled,
    isLegacyRollback: isLegacyRollback,
    bootstrap: bootstrap
  };
})(window);
