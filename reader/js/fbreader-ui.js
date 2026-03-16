/* FBReader-like UI glue for this EPUB.js reader
   - Desktop: bars always visible, NO fullscreen
   - Mobile: bars toggle by center tap; fullscreen can be re-entered after returning to browser
   - TOC / Bookmarks are overlays (desktop: panel+backdrop; mobile: fullscreen with X)
*/
(function () {
  "use strict";

  // -------- device detection --------
  var __fb_desktopRaw = (function () {
    try {
      // "desktop" here means: wide viewport OR real mouse/trackpad (hover)
      if (window.matchMedia && window.matchMedia("(min-width: 769px)").matches) return true;
      if (window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches) return true;
    } catch (e) {}
    return false;
  })();
  var __fb_isDesktop = __fb_desktopRaw;

  window.__fb_isDesktop = __fb_isDesktop;
  window.__fb_no_fullscreen__ = __fb_isDesktop;
  window.__fbSelectionActive = false;
  try { document.documentElement.classList.toggle("is-desktop", !!__fb_isDesktop); } catch (e) {}

  var __fb_isIOS = (function () {
    try {
      var ua = navigator.userAgent || "";
      var iOS = /iP(ad|hone|od)/i.test(ua);
      var iPadOS = /Macintosh/i.test(ua) && navigator.maxTouchPoints && navigator.maxTouchPoints > 1;
      return !!(iOS || iPadOS);
    } catch (e) {}
    return false;
  })();
  try { document.documentElement.classList.toggle("is-ios", !!__fb_isIOS); } catch (e) {}
  var __fb_isIPhone = (function () {
    try {
      var ua = navigator.userAgent || "";
      return /iPhone/i.test(ua);
    } catch (e) {}
    return false;
  })();
  try {
    if (window.__fbSuppressIosViewportReflow == null) window.__fbSuppressIosViewportReflow = false;
  } catch (e) {}

  function _screenMin() {
    try {
      var sw = (screen && screen.width) ? screen.width : 0;
      var sh = (screen && screen.height) ? screen.height : 0;
      var minS = Math.min(sw || 0, sh || 0);
      if (minS) return minS;
    } catch (e) {}
    try {
      var w = window.innerWidth || 0;
      var h = window.innerHeight || 0;
      return Math.min(w, h);
    } catch (e2) {}
    return 0;
  }

  var __fb_isTabletUA = (function () {
    try {
      var ua = navigator.userAgent || "";
      var minS = _screenMin();
      if (/SM-T/i.test(ua)) return true; // Samsung tablets
      if (/iPad/i.test(ua)) return true;
      if (/Macintosh/i.test(ua) && navigator.maxTouchPoints && navigator.maxTouchPoints > 1) {
        // Desktop-mode iPhone can look like Macintosh; require tablet-sized screen.
        return minS >= 700;
      }
      if (/Android/i.test(ua) && /Mobile/i.test(ua) && minS >= 600) return true;
      if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return minS >= 600;
      if (/Tablet|PlayBook|Silk|Kindle|Nexus 7|Nexus 9/i.test(ua)) return minS >= 600;
    } catch (e) {}
    return false;
  })();
  function isTabletViewport() {
    try {
      if (__fb_isTabletUA) return true;
      var w = window.innerWidth || 0;
      var h = window.innerHeight || 0;
      var minDim = Math.min(w, h);
      var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
      return !!(coarse && minDim >= 600);
    } catch (e) {}
    return false;
  }

  function syncDesktopFlag() {
    try {
      var isTablet = isTabletViewport();
      var effectiveDesktop = __fb_desktopRaw && !isTablet;
      __fb_isDesktop = effectiveDesktop;
      window.__fb_isDesktop = effectiveDesktop;
      window.__fb_no_fullscreen__ = effectiveDesktop;
      document.documentElement.classList.toggle("is-desktop", !!effectiveDesktop);
    } catch (e) {}
  }

  function isTabletPortrait() {
    try {
      if (!isTabletViewport()) return false;
      var w = window.innerWidth || 0;
      var h = window.innerHeight || 0;
      return h > w;
    } catch (e) {}
    return false;
  }

  function syncTabletClass() {
    try {
      var root = document.documentElement;
      var isTablet = isTabletViewport();
      var isPhone = (!isTablet && _screenMin() > 0 && _screenMin() < 700);
      root.classList.toggle("is-tablet", !!isTablet);
      root.classList.toggle("is-phone", !!isPhone);
      root.classList.toggle("tablet-portrait", !!(isTablet && isTabletPortrait()));
      root.classList.toggle("tablet-landscape", !!(isTablet && !isTabletPortrait()));
      syncDesktopFlag();
    } catch (e) {}
  }
  syncTabletClass();
  function syncViewportVars() {
    try {
      if (__fb_isIPhone && window.__fbSuppressIosViewportReflow) return;
      var vv = window.visualViewport;
      var h = (vv && vv.height) ? vv.height : (window.innerHeight || 0);
      var w = (vv && vv.width) ? vv.width : (window.innerWidth || 0);
      if (h) document.documentElement.style.setProperty("--app-vh", h + "px");
      if (w) document.documentElement.style.setProperty("--app-vw", w + "px");
    } catch (e) {}
  }

  function forceRenditionResize() {
    try {
      if (__fb_isIPhone && window.__fbSuppressIosViewportReflow) return;
      if (window.reader) {
        if (window.reader.rendition && window.reader.rendition.resize) window.reader.rendition.resize();
        if (window.reader.renditionPrev && window.reader.renditionPrev.resize) window.reader.renditionPrev.resize();
        if (window.reader.renditionNext && window.reader.renditionNext.resize) window.reader.renditionNext.resize();
      }
    } catch (e) {}
  }

  function scheduleLayoutSync() {
    try {
      if (__fb_isIPhone && window.__fbSuppressIosViewportReflow) {
        syncBarHeights(false);
        return;
      }
      syncViewportVars();
      syncBarHeights();
      forceRenditionResize();
      requestAnimationFrame(function(){
        syncViewportVars();
        syncBarHeights();
        forceRenditionResize();
      });
      setTimeout(function(){
        syncViewportVars();
        syncBarHeights();
        forceRenditionResize();
      }, 60);
    } catch (e) {}
  }

  function scheduleLayoutSyncBurst() {
    try {
      scheduleLayoutSync();
      setTimeout(scheduleLayoutSync, 120);
      setTimeout(scheduleLayoutSync, 360);
      setTimeout(scheduleLayoutSync, 900);
    } catch (e) {}
  }

  try {
    window.__fbScheduleLayoutSync = scheduleLayoutSyncBurst;
    window.__fbSyncBarHeights = syncBarHeights;
  } catch (e) {}

  try {
    window.addEventListener("resize", function(){
      syncTabletClass();
      scheduleLayoutSync();
    }, { passive: true });
    window.addEventListener("orientationchange", function(){
      syncTabletClass();
      scheduleLayoutSync();
    }, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", function(){
        syncTabletClass();
        scheduleLayoutSync();
      });
      window.visualViewport.addEventListener("scroll", function(){
        syncTabletClass();
        scheduleLayoutSync();
      });
    }
  } catch (e) {}

  try {
    document.addEventListener("visibilitychange", function () {
      try {
        if (!document.hidden) {
          syncTabletClass();
          scheduleLayoutSyncBurst();
        }
      } catch (e1) {}
    });
    window.addEventListener("pageshow", function (evt) {
      try {
        syncTabletClass();
        scheduleLayoutSyncBurst();
        if (evt && evt.persisted) {
          setTimeout(function(){ scheduleLayoutSyncBurst(); }, 120);
        }
      } catch (e2) {}
    });
    window.addEventListener("focus", function () {
      try {
        syncTabletClass();
        scheduleLayoutSyncBurst();
      } catch (e3) {}
    });
  } catch (e) {}

  function isMobileViewport() {
    try {
      if (isTabletViewport()) return false;
      return window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
    } catch (e) {
      return !__fb_isDesktop;
    }
  }

  // -------- UI bars --------
  function applyViewerInsets(topH, bottomH, withResize) {
    try {
      var vs = document.getElementById("viewerStack") || document.getElementById("viewer");
      if (!vs) return;
      var overlayBars = false;
      try {
        // Mobile + tablet: bars must overlay content and never change reading viewport.
        overlayBars = isTabletViewport() || isMobileViewport();
      } catch (eOverlay) {}
      var hidden = document.body.classList.contains("ui-hidden");
      if (overlayBars) {
        vs.style.top = "0px";
        vs.style.bottom = "0px";
      } else if (hidden) {
        vs.style.top = "0px";
        vs.style.bottom = "0px";
      } else {
        vs.style.top = (topH || 0) + "px";
        vs.style.bottom = (bottomH || 0) + "px";
      }
      if (__fb_isIPhone && window.__fbSuppressIosViewportReflow) withResize = false;
      if (withResize !== false) {
        try {
          if (window.reader) {
            if (window.reader.rendition && window.reader.rendition.resize) window.reader.rendition.resize();
            if (window.reader.renditionPrev && window.reader.renditionPrev.resize) window.reader.renditionPrev.resize();
            if (window.reader.renditionNext && window.reader.renditionNext.resize) window.reader.renditionNext.resize();
          }
        } catch (e2) {}
      }
    } catch (e) {}
  }

  function syncBarHeights(withResize) {
    try {
      var root = document.documentElement;
      var top = document.getElementById("titlebar");
      var search = document.getElementById("searchbar");
      var bottom = document.getElementById("bottombar");
      var topH = (top && top.offsetHeight) || 0;
      if (!topH && search) topH = search.offsetHeight || 0;
      var bottomH = (bottom && bottom.offsetHeight) || 0;
      root.style.setProperty("--titlebar-h", (topH || 0) + "px");
      root.style.setProperty("--bottombar-h", (bottomH || 0) + "px");
      applyViewerInsets(topH, bottomH, withResize);
    } catch (e) {}
  }

  function installBarResizeObserver() {
    try {
      if (window.__fbBarResizeObserverInstalled) return;
      window.__fbBarResizeObserverInstalled = true;
      if (!window.ResizeObserver) return;
      var top = document.getElementById("titlebar");
      var bottom = document.getElementById("bottombar");
      var search = document.getElementById("searchbar");
      var ro = new ResizeObserver(function () {
        try { syncBarHeights(); } catch (e) {}
      });
      try { if (top) ro.observe(top); } catch (e1) {}
      try { if (bottom) ro.observe(bottom); } catch (e2) {}
      try { if (search) ro.observe(search); } catch (e3) {}
      window.__fbBarResizeObserver = ro;
    } catch (e) {}
  }

  function installUiHiddenObserver() {
    try {
      if (window.__fbUiHiddenObserverInstalled) return;
      window.__fbUiHiddenObserverInstalled = true;
      if (!window.MutationObserver) return;
      var mo = new MutationObserver(function (muts) {
        try {
          for (var i = 0; i < muts.length; i++) {
            if (muts[i].attributeName === "class") {
              var now = Date.now();
              var lastUiToggle = window.__fbUiLastToggleTs || 0;
              if ((now - lastUiToggle) < 800) {
                syncBarHeights(false);
                break;
              }
              scheduleLayoutSyncBurst();
              break;
            }
          }
        } catch (e) {}
      });
      mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
      window.__fbUiHiddenObserver = mo;
    } catch (e) {}
  }
  function showUi() {
    try { window.__fbUiLastToggleTs = Date.now(); } catch (eTs0) {}
    document.body.classList.remove("ui-hidden");
    syncBarHeights(false);
  }
  function hideUi() {
    try { window.__fbUiLastToggleTs = Date.now(); } catch (eTs1) {}
    document.body.classList.add("ui-hidden");
    syncBarHeights(false);
  }
  try {
    window.__fbShowUi = showUi;
    window.__fbHideUi = hideUi;
  } catch (eExposeUi) {}
  function toggleUi() {
    if (window.__fbSelectionActive) return;
    try {
      if ((window.__fbSuppressUiTapUntil || 0) > Date.now()) return;
    } catch (eSup) {}
    try {
      if (document.body && document.body.classList && document.body.classList.contains("search-open")) return;
    } catch (eSearchOpen) {}
    try {
      if (document.body && document.body.classList && document.body.classList.contains("mobile-more-open")) {
        if (typeof window.__fb_closeMobileMore === "function") window.__fb_closeMobileMore();
        return;
      }
    } catch (eMoreOpen) {}
    try { window.__fbUiLastToggleTs = Date.now(); } catch (eTs2) {}
    document.body.classList.toggle("ui-hidden");
    syncBarHeights(false);
  }

  function setupMobileMoreMenu() {
    var toggle = document.getElementById("mobileMoreToggle");
    var panel = document.getElementById("mobileMorePanel");
    var bookmarkBtn = document.getElementById("mobileMoreBookmark");
    var fontDecBtn = document.getElementById("mobileMoreFontDec");
    var fontIncBtn = document.getElementById("mobileMoreFontInc");
    var bookmark = document.getElementById("bookmark");
    var fontDec = document.getElementById("fontDec");
    var fontInc = document.getElementById("fontInc");
    if (!toggle || !panel) return;
    // Keep the panel inside the fullscreen root. Android fullscreen will not
    // paint or hit-test fixed elements that live outside the fullscreen element.
    try {
      var panelHost = document.getElementById("container") || document.body;
      if (panel.parentNode !== panelHost) panelHost.appendChild(panel);
    } catch (ePanelMove) {}
    var backdrop = document.getElementById("mobileMoreBackdrop");
    if (!backdrop) {
      try {
        backdrop = document.createElement("div");
        backdrop.id = "mobileMoreBackdrop";
        backdrop.className = "mobile-more-backdrop hidden";
        (document.getElementById("container") || document.body).appendChild(backdrop);
      } catch (eCreateBackdrop) {}
    } else {
      try {
        var backdropHost = document.getElementById("container") || document.body;
        if (backdrop.parentNode !== backdropHost) backdropHost.appendChild(backdrop);
      } catch (eBackdropMove) {}
    }

    function nodeInside(target, root) {
      try {
        if (!target || !root) return false;
        if (root.contains && root.contains(target)) return true;
        var n = target;
        while (n) {
          if (n === root) return true;
          n = n.parentNode;
        }
      } catch (e) {}
      return false;
    }

    function isTouchUi() {
      try { return isTabletViewport() || isMobileViewport(); } catch (e) { return false; }
    }

    function isOpen() {
      try { return document.body.classList.contains("mobile-more-open"); } catch (e) {}
      return false;
    }

    function syncBookmarkState() {
      try {
        if (!bookmarkBtn || !bookmark) return;
        bookmarkBtn.classList.remove("icon-bookmark", "icon-bookmark-empty");
        if (bookmark.classList.contains("icon-bookmark-empty")) bookmarkBtn.classList.add("icon-bookmark-empty");
        else bookmarkBtn.classList.add("icon-bookmark");
      } catch (e) {}
    }

    function closePanel() {
      try { panel.classList.add("hidden"); } catch (e0) {}
      try { if (backdrop) backdrop.classList.add("hidden"); } catch (e0b) {}
      try { document.body.classList.remove("mobile-more-open"); } catch (e1) {}
      try { toggle.setAttribute("aria-expanded", "false"); } catch (e2) {}
    }

    function openPanel() {
      if (!isTouchUi()) return;
      syncBookmarkState();
      try { if (backdrop) backdrop.classList.remove("hidden"); } catch (e0b) {}
      try { panel.classList.remove("hidden"); } catch (e0) {}
      try { document.body.classList.add("mobile-more-open"); } catch (e1) {}
      try { toggle.setAttribute("aria-expanded", "true"); } catch (e2) {}
    }

    function togglePanel() {
      if (isOpen()) closePanel();
      else openPanel();
    }

    window.__fb_isMobileMoreOpen = function () {
      return isOpen();
    };
    window.__fb_closeMobileMore = function () {
      closePanel();
    };

    if (!toggle.__fbMobileMoreBound) {
      toggle.__fbMobileMoreBound = true;
      toggle.addEventListener("click", function (e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        togglePanel();
      });
    }

    if (bookmarkBtn && !bookmarkBtn.__fbMobileMoreBound) {
      bookmarkBtn.__fbMobileMoreBound = true;
      bookmarkBtn.addEventListener("click", function (e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        try { if (bookmark && typeof bookmark.click === "function") bookmark.click(); } catch (e0) {}
      });
    }

    if (fontDecBtn && !fontDecBtn.__fbMobileMoreBound) {
      fontDecBtn.__fbMobileMoreBound = true;
      fontDecBtn.addEventListener("click", function (e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        try { if (fontDec && typeof fontDec.click === "function") fontDec.click(); } catch (e0) {}
      });
    }

    if (fontIncBtn && !fontIncBtn.__fbMobileMoreBound) {
      fontIncBtn.__fbMobileMoreBound = true;
      fontIncBtn.addEventListener("click", function (e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        try { if (fontInc && typeof fontInc.click === "function") fontInc.click(); } catch (e0) {}
      });
    }

    if (bookmark && window.MutationObserver && !bookmark.__fbMobileMoreObserver) {
      try {
        var mo = new MutationObserver(function () { syncBookmarkState(); });
        mo.observe(bookmark, { attributes: true, attributeFilter: ["class"] });
        bookmark.__fbMobileMoreObserver = mo;
      } catch (eMo) {}
    }

    if (!panel.__fbMobileMorePanelBound) {
      panel.__fbMobileMorePanelBound = true;
      var swallowInside = function (ev) {
        try {
          if (ev && ev.stopPropagation) ev.stopPropagation();
        } catch (e) {}
      };
      panel.addEventListener("touchstart", swallowInside, { passive: true });
      panel.addEventListener("pointerdown", swallowInside);
      panel.addEventListener("click", swallowInside);
    }

    if (backdrop && !backdrop.__fbMobileMoreBackdropBound) {
      backdrop.__fbMobileMoreBackdropBound = true;
      var onBackdropTap = function (ev) {
        try {
          if (!isOpen()) return;
          try { window.__fbSuppressUiTapUntil = Date.now() + 1200; } catch (eSup0) {}
          closePanel();
          if (ev && ev.preventDefault) ev.preventDefault();
          if (ev && ev.stopPropagation) ev.stopPropagation();
          if (ev && ev.stopImmediatePropagation) ev.stopImmediatePropagation();
        } catch (eTap) {}
      };
      backdrop.addEventListener("click", onBackdropTap);
      backdrop.addEventListener("touchstart", onBackdropTap, { passive: false });
      backdrop.addEventListener("pointerdown", onBackdropTap);
    }

    syncBookmarkState();
    closePanel();
  }

  // -------- ultra-robust center-tap capture (ported from old fix5) --------
  // Why this exists:
  // 1) Events inside an iframe do NOT bubble to the parent document.
  // 2) On many EPUB.js builds, after the first render the active page can live in a
  //    different iframe/document/overlay, so per-document listeners miss.
  // A dedicated transparent layer ABOVE the book is the only 100% reliable way to
  // detect a center tap on EVERY page.
  function installCenterTapLayer() {
    try {
      var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
      var touch = (navigator && navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
      if (__fb_isDesktop && !coarse && !touch) return;
    } catch (e0) {
      if (__fb_isDesktop) return;
    }
    var existing = document.getElementById("fb-tap-layer");
    var host = document.getElementById("container") || null;
    if (existing) {
      try {
        if (host && existing.parentNode !== host) host.appendChild(existing);
      } catch (eMove) {}
      return;
    }

    var viewer = document.getElementById("viewerStack") || document.getElementById("viewer") || document.body;
    if (!viewer) return;

    var layer = document.createElement("div");
    layer.id = "fb-tap-layer";
    var left = document.createElement("div");
    left.id = "fb-tap-left";
    var center = document.createElement("div");
    center.id = "fb-tap-center";
    var right = document.createElement("div");
    right.id = "fb-tap-right";
    layer.appendChild(left);
    layer.appendChild(center);
    layer.appendChild(right);
    if (!host) host = viewer.parentNode || document.body || viewer;
    host.appendChild(layer);

    var moved = false;
    var sx = 0,
      sy = 0,
      st = 0;
    var activePointerId = null;
    var lastToggleAt = 0;

    function getVisibleViewportWidth() {
      try {
        if (window.visualViewport && window.visualViewport.width) return window.visualViewport.width;
      } catch (e) {}
      try {
        return document.documentElement && document.documentElement.clientWidth ? document.documentElement.clientWidth : window.innerWidth;
      } catch (e2) {}
      return window.innerWidth;
    }

    function updateCenterTapBounds() {
      try {
        var layerRect = null;
        try { layerRect = layer && layer.getBoundingClientRect ? layer.getBoundingClientRect() : null; } catch (eL) { layerRect = null; }
        var vw = (layerRect && layerRect.width) ? layerRect.width : getVisibleViewportWidth();
        var vLeft = (layerRect && typeof layerRect.left === "number") ? layerRect.left : 0;
        var centerW = Math.max(0, Math.round(vw * 0.60));
        var edgeW = Math.max(0, Math.round(vw * 0.20));
        var left = Math.max(0, Math.round((vw - centerW) / 2));
        center.style.left = left + "px";
        center.style.width = centerW + "px";
        center.style.right = "auto";
        try {
          var leftZone = document.getElementById("fb-tap-left");
          var rightZone = document.getElementById("fb-tap-right");
          if (leftZone) leftZone.style.width = edgeW + "px";
          if (rightZone) rightZone.style.width = edgeW + "px";
        } catch (e4) {}
        // Expose bounds for iframe-level handlers to use the exact same zone.
        window.__fbTapCenterBounds = { left: vLeft + left, right: vLeft + left + centerW, width: vw };
      } catch (e3) {}
    }

    function overlaysOpen() {
      try {
        var ot = document.getElementById("overlay-toc");
        var ob = document.getElementById("overlay-bookmarks");
        return (ot && !ot.classList.contains("hidden")) || (ob && !ob.classList.contains("hidden"));
      } catch (e) {
        return false;
      }
    }

    function isUiChromeTarget(tgt) {
      if (!tgt || !tgt.closest) return false;
      return !!(
        tgt.closest("#titlebar") ||
        tgt.closest("#bottombar") ||
        tgt.closest(".overlay") ||
        tgt.closest("#overlay-backdrop") ||
        tgt.closest("#mobileMorePanel") ||
        tgt.closest("#mobileMoreToggle")
      );
    }

    function closestInteractive(el) {
      try {
        if (!el || !el.closest) return null;
        return el.closest("a,button,input,textarea,select,label");
      } catch (e) {
        return null;
      }
    }

    function isFootnoteAnchor(a) {
      try {
        if (!a || !a.getAttribute) return false;
        var href = a.getAttribute("href") || "";
        if (!href || href.indexOf("#") === -1) return false;
        return /#(fn|ftn|_ftn|_fn|fnref|ftnref|_ftnref|_fnref|noteref|note|footnote|endnote)/i.test(href);
      } catch (e) {
        return false;
      }
    }

    var FOOTNOTE_SEL =
      "a[role~='doc-noteref'], a[epub\\:type~='noteref'], a[epub\\|type~='noteref'], " +
      "a.noteref, a.footnote-ref, a.fn, a[href*='#fn'], a[href*='footnote']";

    function findIframeAtPoint(x, y) {
      try {
        var iframes = document.querySelectorAll("#viewerStack iframe, #viewer iframe, #viewer-prev iframe, #viewer-next iframe");
        for (var i = 0; i < iframes.length; i++) {
          var f = iframes[i];
          if (!f || !f.getBoundingClientRect) continue;
          var r = f.getBoundingClientRect();
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return f;
        }
      } catch (e) {}
      return null;
    }

    function findUnderlyingElementAtPoint(x, y) {
      try {
        var prevLayerPE = layer.style.pointerEvents;
        var prevCenterPE = center.style.pointerEvents;
        var prevLeftPE = left.style.pointerEvents;
        var prevRightPE = right.style.pointerEvents;
        layer.style.pointerEvents = "none";
        center.style.pointerEvents = "none";
        left.style.pointerEvents = "none";
        right.style.pointerEvents = "none";
        var el = document.elementFromPoint(x, y);
        layer.style.pointerEvents = prevLayerPE;
        center.style.pointerEvents = prevCenterPE;
        left.style.pointerEvents = prevLeftPE;
        right.style.pointerEvents = prevRightPE;
        if (!el) return null;
        var ifr = (el.tagName === "IFRAME") ? el : (el.closest ? el.closest("iframe") : null);
        if (!ifr) ifr = findIframeAtPoint(x, y);
        if (ifr && ifr.contentDocument && ifr.getBoundingClientRect) {
          var r = ifr.getBoundingClientRect();
          var ix = x - r.left;
          var iy = y - r.top;
          var inner = ifr.contentDocument.elementFromPoint(ix, iy);
          if (inner && inner.nodeType === 3) inner = inner.parentElement;
          return inner || el;
        }
        return el;
      } catch (e) {
        return null;
      }
    }

    function findFootnoteAnchorNearPoint(x, y) {
      try {
        var ifr = findIframeAtPoint(x, y);
        if (!ifr || !ifr.contentDocument || !ifr.getBoundingClientRect) return null;
        var r = ifr.getBoundingClientRect();
        var ix = x - r.left;
        var iy = y - r.top;
        var doc = ifr.contentDocument;
        var el = null;
        try { el = doc.elementFromPoint(ix, iy); } catch (e0) { el = null; }
        if (el && el.nodeType === 3) el = el.parentElement;
        if (el && el.closest) {
          var a0 = el.closest("a");
          if (a0 && isFootnoteAnchor(a0)) return a0;
        }
        // Fallback: search nearby footnote anchors by rect distance
        if (!doc.querySelectorAll) return null;
        var list = doc.querySelectorAll(FOOTNOTE_SEL);
        var best = null;
        var bestDist = 1e9;
        var pad = 10;
        for (var i = 0; i < list.length; i++) {
          var a = list[i];
          if (!a || !a.getBoundingClientRect) continue;
          var rect = a.getBoundingClientRect();
          var left = rect.left - pad, right = rect.right + pad;
          var top = rect.top - pad, bottom = rect.bottom + pad;
          if (ix >= left && ix <= right && iy >= top && iy <= bottom) return a;
          var dx = (ix < rect.left) ? (rect.left - ix) : (ix > rect.right ? (ix - rect.right) : 0);
          var dy = (iy < rect.top) ? (rect.top - iy) : (iy > rect.bottom ? (iy - rect.bottom) : 0);
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < bestDist && d <= (pad * 2)) { best = a; bestDist = d; }
        }
        return best;
      } catch (e) {
        return null;
      }
    }

    function findInteractiveAtPoint(x, y) {
      try {
        var el = findUnderlyingElementAtPoint(x, y);
        var inter = closestInteractive(el);
        if (!inter) return null;
        // Strict hit only: do not "snap" to nearby links (can trigger wrong chapter jumps).
        if (inter.getBoundingClientRect) {
          var rect = inter.getBoundingClientRect();
          if (!(x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)) return null;
        }
        return inter;
      } catch (e) {
        return null;
      }
    }

    function tryToggle(e) {
      // Debounce to avoid double-fire and randomness.
      var now = Date.now();
      if (now - lastToggleAt < 350) return;

      try {
        if (overlaysOpen()) return;
        try {
          if (document.body && document.body.classList && document.body.classList.contains("mobile-more-open")) {
            if (typeof window.__fb_closeMobileMore === "function") window.__fb_closeMobileMore();
            if (e && e.stopPropagation) e.stopPropagation();
            if (e && e.preventDefault) e.preventDefault();
            return;
          }
        } catch (eMore) {}
        if (moved) return;
        // Real-world taps on mobile are often longer than 150ms.
        // Too low threshold lets synthetic click leak to underlying epub view (can trigger prev page).
        if (Date.now() - st > 900) return;

        var tgt = e && e.target;
        if (isUiChromeTarget(tgt)) return;

        // If user tapped a footnote/link/control inside the book, let it handle the tap.
        try {
          var pt = (e && (e.changedTouches && e.changedTouches[0])) || (e && (e.touches && e.touches[0])) || e;
          if (pt && typeof pt.clientX === "number" && typeof pt.clientY === "number") {
            var ifr = findIframeAtPoint(pt.clientX, pt.clientY);
            if (ifr && ifr.getBoundingClientRect && ifr.contentDocument && ifr.contentDocument.__fb_tryFootnoteAtPoint) {
              var r = ifr.getBoundingClientRect();
              var ix = pt.clientX - r.left;
              var iy = pt.clientY - r.top;
              try {
                if (ifr.contentDocument.__fb_tryFootnoteAtPoint(ix, iy)) return;
              } catch (eT) {}
            }
            var foot = findFootnoteAnchorNearPoint(pt.clientX, pt.clientY);
            if (foot) {
              try { if (foot.focus) foot.focus(); } catch (eF0) {}
              try { if (foot.click) foot.click(); } catch (eF1) {}
              return;
            }
            var interactive = findInteractiveAtPoint(pt.clientX, pt.clientY);
            if (interactive) {
              // Prefer footnote anchors when near the tap (larger hit area).
              if (interactive.tagName === "A" || (interactive.closest && interactive.closest("a"))) {
                var a = (interactive.tagName === "A") ? interactive : (interactive.closest ? interactive.closest("a") : null);
                if (a && isFootnoteAnchor(a)) {
                  try { if (a.focus) a.focus(); } catch (e0) {}
                  try { if (a.click) a.click(); } catch (e1) {}
                  return;
                }
              }
              // Keep native controls clickable, but allow non-footnote links/text to toggle bars.
              try {
                var tag = ((interactive.tagName || "") + "").toLowerCase();
                if (tag === "button" || tag === "input" || tag === "textarea" || tag === "select" || tag === "label") {
                  try { if (interactive.focus) interactive.focus(); } catch (e2) {}
                  try { if (interactive.click) interactive.click(); } catch (e3) {}
                  return;
                }
              } catch (eTag) {}
            }
          }
        } catch (e2) {}

        // If we do toggle, stop the event so we don't accidentally trigger
        // other handlers that may toggle back.
        try {
          if (e && e.stopPropagation) e.stopPropagation();
          if (e && e.preventDefault) e.preventDefault();
        } catch (e0) {}

        lastToggleAt = Date.now();
        toggleUi();
      } catch (e3) {}
    }

    function tryEdgeTurn(e, isNext) {
      var now = Date.now();
      if (now - lastToggleAt < 350) return;
      try {
        if (overlaysOpen()) return;
        try {
          if (document.body && document.body.classList && document.body.classList.contains("mobile-more-open")) {
            if (typeof window.__fb_closeMobileMore === "function") window.__fb_closeMobileMore();
            if (e && e.stopPropagation) e.stopPropagation();
            if (e && e.preventDefault) e.preventDefault();
            return;
          }
        } catch (eMore) {}
        if (moved) return;
        if (Date.now() - st > 220) return;
        var tgt = e && e.target;
        if (isUiChromeTarget(tgt)) return;
        try {
          var pt = (e && (e.changedTouches && e.changedTouches[0])) || (e && (e.touches && e.touches[0])) || e;
          if (pt && typeof pt.clientX === "number" && typeof pt.clientY === "number") {
            var ifr = findIframeAtPoint(pt.clientX, pt.clientY);
            if (ifr && ifr.getBoundingClientRect && ifr.contentDocument && ifr.contentDocument.__fb_tryFootnoteAtPoint) {
              var r = ifr.getBoundingClientRect();
              var ix = pt.clientX - r.left;
              var iy = pt.clientY - r.top;
              try { if (ifr.contentDocument.__fb_tryFootnoteAtPoint(ix, iy)) return; } catch (eT0) {}
            }
            var foot = findFootnoteAnchorNearPoint(pt.clientX, pt.clientY);
            if (foot) {
              try { if (foot.focus) foot.focus(); } catch (eF0) {}
              try { if (foot.click) foot.click(); } catch (eF1) {}
              return;
            }
            var interactive = findInteractiveAtPoint(pt.clientX, pt.clientY);
            if (interactive) {
              if (interactive.tagName === "A" || (interactive.closest && interactive.closest("a"))) {
                var a2 = (interactive.tagName === "A") ? interactive : (interactive.closest ? interactive.closest("a") : null);
                if (a2 && isFootnoteAnchor(a2)) {
                  try { if (a2.focus) a2.focus(); } catch (eI0) {}
                  try { if (a2.click) a2.click(); } catch (eI1) {}
                  return;
                }
              }
              try {
                var tag2 = ((interactive.tagName || "") + "").toLowerCase();
                if (tag2 === "button" || tag2 === "input" || tag2 === "textarea" || tag2 === "select" || tag2 === "label") {
                  try { if (interactive.focus) interactive.focus(); } catch (eI2) {}
                  try { if (interactive.click) interactive.click(); } catch (eI3) {}
                  return;
                }
              } catch (eITag) {}
            }
          }
        } catch (eHit) {}
        try {
          if (e && e.stopPropagation) e.stopPropagation();
          if (e && e.preventDefault) e.preventDefault();
        } catch (eStop) {}
        lastToggleAt = Date.now();
        var targetId = isNext ? "next" : "prev";
        var btn = document.getElementById(targetId);
        if (btn && typeof btn.click === "function") {
          btn.click();
          return;
        }
      } catch (e3) {}
    }

    function onStart(e) {
      moved = false;
      st = Date.now();
      var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
      if (t) {
        sx = t.clientX;
        sy = t.clientY;
      }
      // Try fullscreen on any gesture (mobile only). Must be in the same gesture stack.
      try {
        if (!window.__fb_no_fullscreen__ && !window.__fb_disable_auto_fullscreen && window.__tryFsFromIframe) {
          window.__tryFsFromIframe();
        }
      } catch (e2) {}
    }

    function onMove(e) {
      var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
      if (!t) return;
      // Keep this threshold modest: we ONLY want to treat real drags as "not a tap".
      // (We don't want to regress back to "works only on first page".)
      if (Math.abs(t.clientX - sx) > 22 || Math.abs(t.clientY - sy) > 22) moved = true;
    }

    // Use POINTER events only to avoid double-firing (touchend + pointerup).
    // Fallback to touch events only if PointerEvent is unavailable.
    if (window.PointerEvent) {
      center.addEventListener("pointerdown", function (e) {
        if (e.pointerType !== "touch") return;
        activePointerId = e.pointerId;
        try { center.setPointerCapture(activePointerId); } catch (e0) {}
        onStart(e);
      });
      center.addEventListener("pointermove", function (e) {
        if (e.pointerType !== "touch") return;
        if (activePointerId == null || e.pointerId !== activePointerId) return;
        onMove(e);
      });
      center.addEventListener("pointerup", function (e) {
        if (e.pointerType !== "touch") return;
        if (activePointerId == null || e.pointerId !== activePointerId) return;
        activePointerId = null;
        tryToggle(e);
      });
      center.addEventListener("pointercancel", function (e) {
        if (e.pointerType !== "touch") return;
        activePointerId = null;
      });
      left.addEventListener("pointerdown", function (e) {
        if (e.pointerType !== "touch") return;
        activePointerId = e.pointerId;
        try { left.setPointerCapture(activePointerId); } catch (e0) {}
        onStart(e);
      });
      left.addEventListener("pointermove", function (e) {
        if (e.pointerType !== "touch") return;
        if (activePointerId == null || e.pointerId !== activePointerId) return;
        onMove(e);
      });
      left.addEventListener("pointerup", function (e) {
        if (e.pointerType !== "touch") return;
        if (activePointerId == null || e.pointerId !== activePointerId) return;
        activePointerId = null;
        tryEdgeTurn(e, false);
      });
      left.addEventListener("pointercancel", function (e) {
        if (e.pointerType !== "touch") return;
        activePointerId = null;
      });
      right.addEventListener("pointerdown", function (e) {
        if (e.pointerType !== "touch") return;
        activePointerId = e.pointerId;
        try { right.setPointerCapture(activePointerId); } catch (e0) {}
        onStart(e);
      });
      right.addEventListener("pointermove", function (e) {
        if (e.pointerType !== "touch") return;
        if (activePointerId == null || e.pointerId !== activePointerId) return;
        onMove(e);
      });
      right.addEventListener("pointerup", function (e) {
        if (e.pointerType !== "touch") return;
        if (activePointerId == null || e.pointerId !== activePointerId) return;
        activePointerId = null;
        tryEdgeTurn(e, true);
      });
      right.addEventListener("pointercancel", function (e) {
        if (e.pointerType !== "touch") return;
        activePointerId = null;
      });
    } else {
      center.addEventListener("touchstart", onStart, { passive: true });
      center.addEventListener("touchmove", onMove, { passive: true });
      center.addEventListener("touchend", tryToggle, { passive: false });
      left.addEventListener("touchstart", onStart, { passive: true });
      left.addEventListener("touchmove", onMove, { passive: true });
      left.addEventListener("touchend", function (e) { tryEdgeTurn(e, false); }, { passive: false });
      right.addEventListener("touchstart", onStart, { passive: true });
      right.addEventListener("touchmove", onMove, { passive: true });
      right.addEventListener("touchend", function (e) { tryEdgeTurn(e, true); }, { passive: false });
    }

    updateCenterTapBounds();
    try {
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", updateCenterTapBounds);
        window.visualViewport.addEventListener("scroll", updateCenterTapBounds);
      }
    } catch (e4) {}
    window.addEventListener("resize", updateCenterTapBounds);
    window.addEventListener("orientationchange", updateCenterTapBounds);
  }

  // Expose a simple toggle for in-iframe handlers (reader.js swipe handler).
  // We intentionally keep the name stable across iterations.
  window.__fb_toggleUi = function () {
    try { toggleUi(); } catch (e) {}
  };

  // -------- overlays --------
  function setupOverlays() {
    var isMobile = isMobileViewport();
    function syncMobileClass() {
      try { document.body.classList.toggle('is-mobile', !!isMobileViewport()); } catch (e) {}
    }
    syncMobileClass();
    window.addEventListener('resize', syncMobileClass, { passive: true });
    window.addEventListener('orientationchange', syncMobileClass, { passive: true });
    var backdrop = document.getElementById("overlay-backdrop");
    var overlayToc = document.getElementById("overlay-toc");
    var overlayBookmarks = document.getElementById("overlay-bookmarks");
    var overlayNotes = document.getElementById("overlay-notes");
    var overlayMyBooks = document.getElementById("overlay-mybooks");
    var overlayVoice = document.getElementById("overlay-voice");
    var overlayMenu = document.getElementById("overlay-menu");
    var menuView = document.getElementById("menuView");
    var copyBookLinkBtn = document.getElementById("copyBookLinkBtn");
    var btnToc = document.getElementById("slider");
    var btnNotes = document.getElementById("openNotes");
    var btnBookmarks = document.getElementById("openBookmarks");
    var closeBtns = Array.prototype.slice.call(document.querySelectorAll(".overlay-close"));

    function isTouchShareDevice() {
      try {
        var coarse = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
        var touchPoints = !!(navigator && navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
        if (coarse) return true;
        if (touchPoints && !window.__fb_isDesktop) return true;
      } catch (e) {}
      return false;
    }

    function getCurrentBookId() {
      try {
        var u = new URL(window.location.href || "", window.location.origin);
        var id = u.searchParams.get("id") || u.searchParams.get("i");
        if (id) return String(id);
      } catch (e) {}
      return "";
    }

    function getCleanBookUrl() {
      var id = getCurrentBookId();
      var u = new URL(window.location.href || "", window.location.origin);
      u.hash = "";
      u.search = "";
      if (id) u.searchParams.set("id", id);
      return u.toString();
    }

    function copyText(value) {
      var txt = String(value || "");
      if (!txt) return Promise.reject(new Error("No text to copy"));
      var fallbackCopy = function () {
        return new Promise(function (resolve, reject) {
          try {
            var ta = document.createElement("textarea");
            ta.value = txt;
            ta.setAttribute("readonly", "readonly");
            ta.style.position = "fixed";
            ta.style.top = "-9999px";
            ta.style.left = "-9999px";
            document.body.appendChild(ta);
            ta.select();
            var ok = false;
            try { ok = document.execCommand("copy"); } catch (e1) { ok = false; }
            document.body.removeChild(ta);
            if (ok) resolve();
            else reject(new Error("Copy command failed"));
          } catch (e2) {
            reject(e2);
          }
        });
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          return navigator.clipboard.writeText(txt).catch(function () {
            return fallbackCopy();
          });
        }
      } catch (e0) {}
      return fallbackCopy();
    }

    if (copyBookLinkBtn && !copyBookLinkBtn.__fbBound) {
      copyBookLinkBtn.__fbBound = true;

      var clearCopyState = function (btn) {
        btn.classList.remove("is-pressed");
        btn.classList.remove("is-copied");
        btn.classList.remove("is-failed");
      };

      var updateBookShareLabel = function () {
        try {
          copyBookLinkBtn.textContent = isTouchShareDevice() ? "Share book" : "Copy book link";
        } catch (e) {}
      };

      copyBookLinkBtn.addEventListener("mousedown", function () { copyBookLinkBtn.classList.add("is-pressed"); });
      copyBookLinkBtn.addEventListener("mouseup", function () { copyBookLinkBtn.classList.remove("is-pressed"); });
      copyBookLinkBtn.addEventListener("mouseleave", function () { copyBookLinkBtn.classList.remove("is-pressed"); });

      copyBookLinkBtn.addEventListener("click", function (event) {
        if (event) event.preventDefault();
        var btn = copyBookLinkBtn;
        clearCopyState(btn);
        updateBookShareLabel();
        var oldText = btn.textContent || "Copy book link";
        var cleanUrl = getCleanBookUrl();
        if (!cleanUrl) {
          btn.classList.add("is-failed");
          btn.textContent = "Action failed";
          setTimeout(function () {
            updateBookShareLabel();
            clearCopyState(btn);
          }, 1200);
          return;
        }
        if (isTouchShareDevice()) {
          try {
            if (navigator.share) {
              navigator.share({ url: cleanUrl }).catch(function () {});
              return;
            }
          } catch (e0) {}
          btn.classList.add("is-failed");
          btn.textContent = "Share unavailable";
          setTimeout(function () {
            updateBookShareLabel();
            clearCopyState(btn);
          }, 1200);
          return;
        }
        copyText(cleanUrl).then(function () {
          btn.classList.add("is-copied");
          btn.textContent = "Copied";
          setTimeout(function () {
            btn.textContent = oldText;
            clearCopyState(btn);
          }, 1200);
        }).catch(function () {
          btn.classList.add("is-failed");
          btn.textContent = "Copy failed";
          setTimeout(function () {
            btn.textContent = oldText;
            clearCopyState(btn);
          }, 1200);
        });
      });

      updateBookShareLabel();
      window.addEventListener("resize", updateBookShareLabel, { passive: true });
      window.addEventListener("orientationchange", updateBookShareLabel, { passive: true });
    }

    function closeAll() {
      if (overlayToc) overlayToc.classList.add("hidden");
      if (overlayBookmarks) overlayBookmarks.classList.add("hidden");
      if (overlayNotes) overlayNotes.classList.add("hidden");
      if (overlayMenu) overlayMenu.classList.add("hidden");
      if (overlayMyBooks) overlayMyBooks.classList.add("hidden");
      if (overlayVoice) overlayVoice.classList.add("hidden");
      if (backdrop) backdrop.classList.add("hidden");
      try { document.body.classList.remove("overlay-open"); } catch (e) {}
    }

    function bumpOverlayZ() {
      var z = 30000;
      if (overlayToc) overlayToc.style.zIndex = z;
      if (overlayBookmarks) overlayBookmarks.style.zIndex = z;
      if (overlayNotes) overlayNotes.style.zIndex = z;
      if (overlayMenu) overlayMenu.style.zIndex = z;
      if (overlayMyBooks) overlayMyBooks.style.zIndex = z;
      if (overlayVoice) overlayVoice.style.zIndex = z;
      if (backdrop) backdrop.style.zIndex = (z - 1);
    }

    function open(which) {
      isMobile = isMobileViewport(); // recalc on rotate
      bumpOverlayZ();
      var isMobileLike = isMobile || isTabletPortrait();
      if (!isMobileLike && backdrop) backdrop.classList.remove("hidden");
      if (isMobileLike && backdrop) backdrop.classList.add("hidden");

      try { document.body.classList.add("overlay-open"); } catch (e) {}

      if (which === "toc") {
        if (overlayBookmarks) overlayBookmarks.classList.add("hidden");
        if (overlayNotes) overlayNotes.classList.add("hidden");
        if (overlayMenu) overlayMenu.classList.add("hidden");
        if (overlayVoice) overlayVoice.classList.add("hidden");
        if (overlayToc) overlayToc.classList.remove("hidden");
      } else if (which === "bookmarks") {
        if (overlayToc) overlayToc.classList.add("hidden");
        if (overlayNotes) overlayNotes.classList.add("hidden");
        if (overlayMenu) overlayMenu.classList.add("hidden");
        if (overlayVoice) overlayVoice.classList.add("hidden");
        if (overlayBookmarks) overlayBookmarks.classList.remove("hidden");
      } else if (which === "notes") {
        if (overlayToc) overlayToc.classList.add("hidden");
        if (overlayBookmarks) overlayBookmarks.classList.add("hidden");
        if (overlayMenu) overlayMenu.classList.add("hidden");
        if (overlayVoice) overlayVoice.classList.add("hidden");
        if (overlayNotes) overlayNotes.classList.remove("hidden");
      } else if (which === "menu") {
        if (overlayToc) overlayToc.classList.add("hidden");
        if (overlayBookmarks) overlayBookmarks.classList.add("hidden");
        if (overlayNotes) overlayNotes.classList.add("hidden");
        if (overlayMyBooks) overlayMyBooks.classList.add("hidden");
        if (overlayVoice) overlayVoice.classList.add("hidden");
        if (overlayMenu) overlayMenu.classList.remove("hidden");
      } else if (which === "mybooks") {
        if (overlayToc) overlayToc.classList.add("hidden");
        if (overlayBookmarks) overlayBookmarks.classList.add("hidden");
        if (overlayNotes) overlayNotes.classList.add("hidden");
        if (overlayMenu) overlayMenu.classList.add("hidden");
        if (overlayVoice) overlayVoice.classList.add("hidden");
        if (overlayMyBooks) overlayMyBooks.classList.remove("hidden");
        try {
          if (window.__fbMyBooks && typeof window.__fbMyBooks.ensureCurrentBook === "function") window.__fbMyBooks.ensureCurrentBook();
          if (window.__fbMyBooks && typeof window.__fbMyBooks.syncFromDom === "function") window.__fbMyBooks.syncFromDom();
          if (window.__fbMyBooks && typeof window.__fbMyBooks.render === "function") window.__fbMyBooks.render();
        } catch (e) {}
      } else if (which === "voice") {
        if (overlayToc) overlayToc.classList.add("hidden");
        if (overlayBookmarks) overlayBookmarks.classList.add("hidden");
        if (overlayNotes) overlayNotes.classList.add("hidden");
        if (overlayMyBooks) overlayMyBooks.classList.add("hidden");
        if (overlayMenu) overlayMenu.classList.add("hidden");
        if (overlayVoice) overlayVoice.classList.remove("hidden");
        try { document.dispatchEvent(new CustomEvent("fb:voice-opened")); } catch (eVoiceEv) {}
      }
    }

    // Expose for deep-linking (e.g., ?mybooks=1)
    window.__fbOpenOverlay = open;
    try {
      var p = new URLSearchParams(window.location.search || "");
      var wantMyBooks = (p.get("mybooks") === "1" || p.get("mybooks") === "true");
      var h = (window.location.hash || "").replace(/^#/, "").toLowerCase();
      if (!wantMyBooks && h === "mybooks") wantMyBooks = true;
      if (wantMyBooks) {
        setTimeout(function(){ try { open("mybooks"); } catch(e) {} }, 0);
      }
    } catch (e) {}

    if (btnToc) {
      btnToc.addEventListener("click", function (e) {
        e.preventDefault();
        open("menu");
      });
    }
    if (btnNotes) {
      btnNotes.addEventListener("click", function (e) {
        e.preventDefault();
        open("notes");
      });
    }
    if (btnBookmarks) {
      btnBookmarks.addEventListener("click", function (e) {
        e.preventDefault();
        open("bookmarks");
      });
    }

    if (menuView && !menuView.__fbMenuBound) {
      menuView.__fbMenuBound = true;
      menuView.addEventListener("click", function (ev) {
        try {
          var t = ev && ev.target;
          if (!t) return;
          var btn = t.closest ? t.closest("[data-menu]") : null;
          if (!btn) return;
          var which = btn.getAttribute("data-menu");
          if (!which) return;
          ev.preventDefault();
          open(which);
        } catch (e) {}
      });
    }

    // Desktop: close only by backdrop click (as requested earlier)
    if (backdrop) {
      backdrop.addEventListener("click", function () {
        if (!isMobileViewport() && !isTabletPortrait()) closeAll();
      });
    }

    // Mobile: close by X only
    closeBtns.forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.preventDefault();
        var panelId = "";
        try {
          var panel = b.closest ? b.closest(".overlay-panel") : null;
          panelId = panel && panel.id ? String(panel.id) : "";
        } catch (e0) {}

        // For list overlays, return to sidebar menu instead of closing everything.
        if (
          panelId === "overlay-toc" ||
          panelId === "overlay-bookmarks" ||
          panelId === "overlay-notes" ||
          panelId === "overlay-mybooks" ||
          panelId === "overlay-voice"
        ) {
          open("menu");
          return;
        }

        closeAll();
      });
    });

    // Close when user selects a link (both overlays)
    ["tocView", "bookmarksView", "notesView", "mybooksView"].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el.__fbCloseOnClick) return;
      el.__fbCloseOnClick = true;
      el.addEventListener("click", function (ev) {
        try {
          var t = ev && ev.target;
          if (!t) return;
          if (t.tagName === "A" || (t.closest && t.closest("a"))) closeAll();
        } catch (e) {}
      });
    });

    // ESC closes on desktop
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !isMobileViewport()) closeAll();
    });

    window.__fbCloseOverlays = closeAll;
  }

  // -------- fullscreen (mobile only) --------
  function canFullscreen() {
    if (__fb_isDesktop) return false;
    var el = document.documentElement;
    return !!(el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen);
  }

  function requestFs() {
    if (!canFullscreen()) return false;
    if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement) return true;
    var el = document.documentElement;
    try {
      var p = (el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen).call(el);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Called from iframe via postMessage (must be synchronous to user gesture).
  window.__tryFsFromIframe = function () {
    if (window.__fb_no_fullscreen__ || window.__fb_disable_auto_fullscreen) return;
    // IMPORTANT: Do NOT permanently block retries until fullscreen is *actually entered*.
    // Some Android browsers ignore the first request; if we set a one-shot flag too early,
    // fullscreen will only succeed after multiple swipes.
    var inFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
    if (inFs) return;

    // Throttle repeated requests inside the same gesture burst.
    var now = Date.now();
    if (window.__fb_fsPending && window.__fb_fsLastReqTs && (now - window.__fb_fsLastReqTs) < 350) return;
    window.__fb_fsPending = true;
    window.__fb_fsLastReqTs = now;

    // Save current reading position for safe restore after fullscreen transition.
    try {
      var r = window.reader;
      var cfi = null;
      if (r && r.rendition && typeof r.rendition.currentLocation === "function") {
        var loc = r.rendition.currentLocation();
        cfi = loc && loc.start && loc.start.cfi;
      }
      if (!cfi) cfi = window.__fb_last_cfi;
      if (cfi) window.__fb_restore_cfi = cfi;
    } catch (e) {}

    requestFs();
  };

  // After returning to the browser, allow fullscreen again on the very next gesture.
  document.addEventListener("visibilitychange", function () {
    try {
      if (document.visibilityState === "visible") {
        window.__fb_fsRequestedOnce = false;
        window.__fb_fsPending = false;
        window.__fb_fsLastReqTs = 0;
      }
    } catch (e) {}
  });

  window.addEventListener("message", function (ev) {
    try {
      if (!ev || !ev.data) return;
      if (window.__fb_disable_auto_fullscreen) return;
      if (ev.data && ev.data.type === "fb_user_gesture") {
        window.__tryFsFromIframe();
      }
    } catch (e) {}
  });

  // When we regain focus, allow next gesture to re-enter fullscreen.
  window.addEventListener("focus", function () {
    if (__fb_isDesktop) return;
    // no-op: next gesture will call __tryFsFromIframe.
  });

  // -------- per-iframe gesture bridge + center tap toggle --------
  function enableIframeGestures(reader) {
    if (!reader || !reader.rendition) return;

    // epub.js can replace iframe documents as you paginate/relocate.
    // DOM scanning alone can miss the *current* contents document, which makes
    // center-tap appear to work only on the first page. We therefore also
    // attach directly to rendition.getContents() on every relocation.
    function attachAllRenditionContents() {
      try {
        if (!reader || !reader.rendition || typeof reader.rendition.getContents !== "function") return;
        var cs = reader.rendition.getContents();
        if (!cs || !cs.length) return;
        for (var i = 0; i < cs.length; i++) {
          try { attachToDoc(cs[i] && cs[i].document); } catch (e) {}
        }
      } catch (e0) {}
    }

    function attachToDoc(doc) {
      if (!doc || doc.__fbGesturesAttached) return;
      doc.__fbGesturesAttached = true;

      var startX = 0, startY = 0, moved = false;
      var startTime = 0;
      // Android often reports micro-movements during a "tap" (especially on text pages
      // where the WebView tries to scroll / selection kicks in). If the threshold is
      // too low, tapping works on the title page but fails on later pages.
      // Use a higher threshold and rely on duration + central-zone checks.
      var TH = 40;
      try {
        var allowSelect = __fb_isDesktop;
        if (doc.documentElement && doc.documentElement.style) {
          doc.documentElement.style.webkitUserSelect = allowSelect ? "text" : "none";
          doc.documentElement.style.userSelect = allowSelect ? "text" : "none";
          doc.documentElement.style.webkitTouchCallout = "none";
        }
        if (doc.body && doc.body.style) {
          doc.body.style.webkitUserSelect = allowSelect ? "text" : "none";
          doc.body.style.userSelect = allowSelect ? "text" : "none";
          doc.body.style.webkitTouchCallout = "none";
          doc.body.style.webkitTapHighlightColor = "rgba(0,0,0,0)";
        }
      } catch (eStyle) {}

      function onStart(e) {
        try {
          var t = e.touches ? e.touches[0] : e;
          startX = t.clientX; startY = t.clientY; moved = false;
          startTime = Date.now();
          // Fullscreen MUST be requested synchronously in the same user-gesture stack.
          // postMessage is async and will often only succeed after several swipes.
          try {
            if (!window.__fb_no_fullscreen__ && !window.__fb_disable_auto_fullscreen) {
              // Same-origin fast path: call parent handler directly
              try {
                if (window.parent && typeof window.parent.__tryFsFromIframe === "function") {
                  window.parent.__tryFsFromIframe();
                }
              } catch (eFs1) {}
              // Fallback: async message (may fail on some browsers but harmless)
              try {
                window.parent && window.parent.postMessage({ type: "fb_user_gesture" }, "*");
              } catch (eFs2) {}
            }
          } catch (e2) {}
        } catch (e3) {}
      }

      function onMove(e) {
        try {
          var t = e.touches ? e.touches[0] : e;
          if (Math.abs(t.clientX - startX) > TH || Math.abs(t.clientY - startY) > TH) moved = true;
        } catch (e2) {}
      }

      function onEnd(e) {
        // Center tap toggles bars on mobile only, and only if it was a real tap (no swipe).
        if (__fb_isDesktop) return;
        try {
          if (document.body && document.body.classList && document.body.classList.contains("search-open")) return;
        } catch (eSearch) {}
        if (moved) return;
        try {
          if (Date.now() - startTime > 150) return;
          if (window.__fbSelectionActive && typeof window.__fbClearSelectionToolbar === "function") {
            window.__fbClearSelectionToolbar();
          } else {
            try {
              var sel = null;
              if (doc.getSelection) sel = doc.getSelection();
              else if (doc.defaultView && doc.defaultView.getSelection) sel = doc.defaultView.getSelection();
              if (sel && !sel.isCollapsed) {
                if (typeof window.__fbClearSelectionToolbar === "function") window.__fbClearSelectionToolbar();
                else if (sel.removeAllRanges) sel.removeAllRanges();
              }
            } catch (eSel) {}
          }
          // Support both TouchEvent and PointerEvent
          var pt = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : e;
          if (!pt) return;
          var x = pt.clientX, y = pt.clientY;
          var inCenter = false;
          var inCenterY = false;
          var isTablet = false;
          try {
            if (window.parent && window.parent.document && window.parent.document.documentElement) {
              isTablet = window.parent.document.documentElement.classList.contains("is-tablet");
            } else if (document.documentElement) {
              isTablet = document.documentElement.classList.contains("is-tablet");
            }
          } catch (eTb) {}
          // Prefer the parent-calculated bounds (actual visible viewport).
          try {
            if (window.parent && window.parent.__fbTapCenterBounds && doc.defaultView && doc.defaultView.frameElement) {
              var fr = doc.defaultView.frameElement;
              if (fr && fr.getBoundingClientRect) {
                var r = fr.getBoundingClientRect();
                var px = x + r.left;
                var py = y + r.top;
                var bounds = window.parent.__fbTapCenterBounds;
                inCenter = (px >= bounds.left && px <= bounds.right);
                if (isTablet) {
                  var vhParent = (window.parent.visualViewport && window.parent.visualViewport.height)
                    ? window.parent.visualViewport.height
                    : (window.parent.innerHeight || 0);
                  inCenterY = (py >= vhParent * (1/3) && py <= vhParent * (2/3));
                }
              }
            }
          } catch (e0) {}
          if (!inCenter) {
            var w = doc.defaultView.innerWidth || doc.documentElement.clientWidth;
            var h = doc.defaultView.innerHeight || doc.documentElement.clientHeight;
            var centerW = w * 0.60;
            var mx1 = (w - centerW) / 2;
            var mx2 = mx1 + centerW;
            inCenter = (x >= mx1 && x <= mx2);
            if (isTablet) inCenterY = (y >= h * (1/3) && y <= h * (2/3));
          }
          if (inCenter && (!isTablet || inCenterY)) toggleUi();
        } catch (e2) {}
      }

      function blockContextMenu(e) {
        try {
          if (e && e.preventDefault) e.preventDefault();
          if (e && e.stopPropagation) e.stopPropagation();
          return false;
        } catch (e0) {}
      }

      // Pointer events if available, otherwise touch.
      // Attach both to the document and to the iframe window to maximize coverage.
      var win = null;
      try { win = doc.defaultView; } catch (e) {}
      try {
        doc.addEventListener("pointerdown", onStart, { passive: true, capture: true });
        doc.addEventListener("pointermove", onMove, { passive: true, capture: true });
        doc.addEventListener("pointerup", onEnd, { passive: true, capture: true });
        doc.addEventListener("contextmenu", blockContextMenu, true);
        doc.addEventListener("longpress", blockContextMenu, true);
        if (win) {
          win.addEventListener("pointerdown", onStart, { passive: true, capture: true });
          win.addEventListener("pointermove", onMove, { passive: true, capture: true });
          win.addEventListener("pointerup", onEnd, { passive: true, capture: true });
          win.addEventListener("contextmenu", blockContextMenu, true);
        }
      } catch (e) {
        doc.addEventListener("touchstart", onStart, { passive: true, capture: true });
        doc.addEventListener("touchmove", onMove, { passive: true, capture: true });
        doc.addEventListener("touchend", onEnd, { passive: true, capture: true });
        doc.addEventListener("contextmenu", blockContextMenu, true);
        doc.addEventListener("longpress", blockContextMenu, true);
        if (win) {
          win.addEventListener("touchstart", onStart, { passive: true, capture: true });
          win.addEventListener("touchmove", onMove, { passive: true, capture: true });
          win.addEventListener("touchend", onEnd, { passive: true, capture: true });
          win.addEventListener("contextmenu", blockContextMenu, true);
        }
      }
    }

    // ---- Search highlight color fix (guarantee #61c2fa) ----
    // epub.js can render highlights either:
    //   A) inside the iframe document (some builds)
    //   B) as an SVG overlay in the *parent* document (most builds)
    // We inject CSS into BOTH documents.
    function ensureSearchHlCss(doc) {
      try {
        if (!doc || !doc.head) return;
        if (doc.getElementById("__fb_search_hl_css")) return;
        var style = doc.createElement("style");
        style.id = "__fb_search_hl_css";
        // Force the requested highlight style (#61c2fa background, text color unchanged).
        // Notes:
        // - epub.js uses SVG <rect> elements for highlights; many versions set `opacity` or `style` inline.
        // - CSS with !important overrides presentation attributes and non-!important inline styles.
        style.textContent = ""
          + "::highlight(fb-search){background:#61c2fa!important;color:inherit!important;}"
          + ".epubjs-hl, .epubjs-hl *, [class*='epubjs-hl'], [class*='epubjs-hl'] *{mix-blend-mode:multiply!important;}"
          + ".search-match{background:#61c2fa!important;color:inherit!important;}"
          + ".search-match-text{background:#61c2fa!important;color:inherit!important;}"
          + ".epubjs-hl rect, rect.epubjs-hl, [class*='epubjs-hl'] rect, rect[class*='epubjs-hl'],"
          + "svg .epubjs-hl rect, svg rect.epubjs-hl{fill:#61c2fa!important;fill-opacity:1!important;opacity:1!important;}"
          + ".search-match rect, rect.search-match{fill:#61c2fa!important;fill-opacity:1!important;opacity:1!important;}"
          + "@media (hover:none) and (pointer:coarse){"
          + "html,body,body *{-webkit-touch-callout:none!important;-webkit-tap-highlight-color:rgba(0,0,0,0)!important;}"
          + "}";
        doc.head.appendChild(style);
      } catch (e) {}
    }

    // Inject into the parent document immediately (covers SVG overlay outside the iframe).
    try { ensureSearchHlCss(document); } catch (e) {}

    // Hook each content document (covers highlights rendered inside the iframe document).
    try {
      reader.rendition.hooks.content.register(function (contents) {
        try { attachToDoc(contents.document); } catch (e) {}
        try { ensureSearchHlCss(contents.document); } catch (e) {}
      });
      reader.rendition.on("rendered", function (section, view) {
        try {
          // Ensure CSS in the parent doc that owns the view element (overlay lives here).
          if (view && view.element && view.element.ownerDocument) ensureSearchHlCss(view.element.ownerDocument);
        } catch (e) {}
        // epub.js versions differ: sometimes `view.element` is the iframe itself.
        try {
          var iframe = null;
          if (view && view.element) {
            if (view.element.tagName === "IFRAME") iframe = view.element;
            else if (view.element.querySelector) iframe = view.element.querySelector("iframe");
          }
          if (iframe && iframe.contentDocument) {
            attachToDoc(iframe.contentDocument);
            ensureSearchHlCss(iframe.contentDocument);
          }
        } catch (e) {}
      });
    } catch (e) {}


    // Extra safety: epub.js can swap/recreate iframes in ways that don't always trigger hooks
    // (esp. across sections / fullscreen / WebView quirks). Keep attaching to any iframe we see.
      function scanIframes() {
      try {
        var list = document.querySelectorAll("#viewerStack iframe, #viewer iframe, #viewer-prev iframe, #viewer-next iframe");
        for (var i = 0; i < list.length; i++) {
          var ifr = list[i];
          if (ifr && ifr.contentDocument) attachToDoc(ifr.contentDocument);
        }
      } catch (e) {}
    }

    // Scan now + after each relocation
    scanIframes();
    // Also attach via epub.js Contents API (more reliable than DOM scanning).
    attachAllRenditionContents();
    try {
      reader.rendition.on("relocated", function () {
        // Relocation can swap/replace the iframe document asynchronously.
        // Do an immediate attach and then retry shortly after.
        scanIframes();
        attachAllRenditionContents();
        setTimeout(function(){ try { scanIframes(); attachAllRenditionContents(); } catch(e){} }, 60);
        setTimeout(function(){ try { scanIframes(); attachAllRenditionContents(); } catch(e){} }, 180);
      });
    } catch (e) {}

      // MutationObserver to catch new iframes
    try {
      var vs = document.getElementById("viewerStack");
      if (vs && window.MutationObserver) {
        var mo = new MutationObserver(function () {
          scanIframes();
          attachAllRenditionContents();
        });
        mo.observe(vs, { childList: true, subtree: true });
      }
    } catch (e) {}

      // Final safety net: for the first few seconds, keep scanning.
      // Some WebViews create iframes late and don't trigger hooks reliably.
      try {
        var cnt = 0;
        var iv = setInterval(function(){
          cnt++;
          scanIframes();
          attachAllRenditionContents();
          if (cnt > 24) clearInterval(iv); // ~12s
        }, 500);
      } catch (e) {}
  }

  // -------- Fulltext search (FBReader-like) --------
  function setupSearch(reader) {
    if (!reader || !reader.book || !reader.rendition) return;

    var isDesktopNow = function () {
      if (document.documentElement && document.documentElement.classList.contains("is-tablet")) return true;
      return window.__fb_isDesktop || (window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches);
    };

    var els = {
      open: document.getElementById("searchOpen"),
      deskWrap: document.getElementById("searchDesktop"),
      deskInput: document.getElementById("searchInputDesktop"),
      deskAction: document.getElementById("searchActionDesktop"),
      deskNav: document.querySelector("#searchDesktop .search-nav.desktop"),
      deskPrev: document.getElementById("searchPrevDesktop"),
      deskNext: document.getElementById("searchNextDesktop"),
      deskCount: document.getElementById("searchCountDesktop"),

      mobileBar: document.getElementById("searchbar"),
      mobileInput: document.getElementById("searchInputMobile"),
      mobileClear: document.getElementById("searchClearMobile"),
      mobileClose: document.getElementById("searchClose"),
      mobileBookmark: document.getElementById("searchBookmark"),
      mobilePrev: document.getElementById("searchPrev"),
      mobileNext: document.getElementById("searchNext"),
      mobileCount: document.getElementById("searchCount"),
      floatPanel: document.getElementById("searchFloatControls"),
      floatPrev: document.getElementById("searchFloatPrev"),
      floatNext: document.getElementById("searchFloatNext"),
      floatClose: document.getElementById("searchFloatClose"),
      floatReturn: document.getElementById("searchFloatReturn")
    };

    var state = {
      open: false,
      searchActive: false,
      query: "",
      index: -1,
      searching: false,
      searchId: 0,
      preCfi: null,
      preHref: null,
      lastSearchQuery: "",
      searchStartCfi: null,
      searchStartHref: null,
      excludeFootnotes: false,
      lastHighlight: null,
      debounceTimer: null,
      sectionCounts: [],
      totalMatches: 0,
      queryLower: "",
      queryLen: 0,
      sectionMatches: {},
      currentSectionIndex: null,
      currentLocalIndex: null,
      pendingHighlightCfi: null,
      highlightRetryTimer: null,
      highlightRetryCount: 0,
      matchList: [],
      matchIndex: -1,
      legacyTextHlCleared: false,
      ensureVisibleToken: 0,
      ensureVisibleTimer: null,
      firstMatchConfirmToken: 0,
      firstMatchConfirmTimer: null,
      safariSearchRepaintTimer: null,
      iosSearchSubmitTimer: null,
      iosKeyboardUnlockTimer: null,
      preUiHidden: true
    };

    function isTouchSearchUi() {
      try {
        return isTabletViewport() || isMobileViewport();
      } catch (e) {}
      return false;
    }

    function lockIphoneViewportReflow() {
      try {
        if (__fb_isIPhone) window.__fbSuppressIosViewportReflow = true;
      } catch (e) {}
    }

    function unlockIphoneViewportReflow(delayMs) {
      try {
        if (!__fb_isIPhone) return;
        if (state.iosKeyboardUnlockTimer) {
          try { clearTimeout(state.iosKeyboardUnlockTimer); } catch (e0) {}
          state.iosKeyboardUnlockTimer = null;
        }
        state.iosKeyboardUnlockTimer = setTimeout(function () {
          window.__fbSuppressIosViewportReflow = false;
          try {
            if (typeof window.__fbScheduleLayoutSync === "function") window.__fbScheduleLayoutSync();
          } catch (e1) {}
        }, (delayMs == null) ? 260 : delayMs);
      } catch (e) {}
    }

    function setCountText(txt) {
      if (els.mobileCount) els.mobileCount.textContent = txt;
      if (els.deskCount) els.deskCount.textContent = txt;
    }

    function setDesktopNavVisible(v) {
      if (!els.deskNav) return;
      els.deskNav.style.display = v ? "inline-flex" : "none";
      els.deskNav.setAttribute("aria-hidden", v ? "false" : "true");
    }

    function setMobileNavVisible(v) {
      // On touch devices navigation lives in a floating panel (FBReader-like).
      if (els.floatPanel) els.floatPanel.classList.toggle("hidden", !v);
    }

    function refreshSearchUiVisibility() {
      var has = !!(state.query && state.query.length);
      var ready = (state.totalMatches > 0) && !state.searching;
      // Desktop: arrows only after an explicit search action.
      setDesktopNavVisible(!!(state.searchActive && has && ready));
      // Mobile: same rule.
      setMobileNavVisible(!!(has && ready));
    }

    function showClearButtons() {
      var has = !!(state.query && state.query.length);
      if (els.mobileClear) els.mobileClear.classList.toggle("hidden", !has);
    }

    function setDesktopActionState(mode, enabled) {
      if (!els.deskAction) return;
      els.deskAction.classList.toggle("is-mag", mode === "mag");
      els.deskAction.classList.toggle("is-clear", mode === "clear");
      els.deskAction.classList.toggle("is-enabled", !!enabled);
      els.deskAction.classList.toggle("is-disabled", !enabled);
      els.deskAction.setAttribute("aria-label", mode === "mag" ? "Search" : "Return");
    }

    function syncDesktopAction() {
      var has = !!(state.query && state.query.length);
      if (state.searchActive) {
        setDesktopActionState("clear", true);
      } else {
        setDesktopActionState("mag", has);
      }
    }

    function getCurrentCfi() {
      try {
        var loc = reader.rendition.currentLocation && reader.rendition.currentLocation();
        return loc && loc.start && loc.start.cfi;
      } catch (e) {}
      return window.__fb_last_cfi || null;
    }

    function getCurrentHref() {
      try {
        var loc = reader.rendition.currentLocation && reader.rendition.currentLocation();
        return loc && loc.start && loc.start.href;
      } catch (e) {}
      return null;
    }

    function syncBookmarkIcon() {
      if (!els.mobileBookmark) return;
      var bm = document.getElementById("bookmark");
      if (!bm) return;
      els.mobileBookmark.classList.remove("icon-bookmark", "icon-bookmark-empty");
      if (bm.classList.contains("icon-bookmark-empty")) {
        els.mobileBookmark.classList.add("icon-bookmark-empty");
      } else {
        els.mobileBookmark.classList.add("icon-bookmark");
      }
    }

    function observeBookmarkIcon() {
      var bm = document.getElementById("bookmark");
      if (!bm || !window.MutationObserver) return;
      try {
        var mo = new MutationObserver(function(){ syncBookmarkIcon(); });
        mo.observe(bm, { attributes: true, attributeFilter: ["class"] });
      } catch (e) {}
    }

    function openSearch() {
      if (state.open) return;
      state.open = true;
      state.preUiHidden = !!document.body.classList.contains("ui-hidden");
      document.body.classList.remove("search-minimized");
      state.preCfi = getCurrentCfi();
      state.preHref = getCurrentHref();
      state.legacyTextHlCleared = false;
      if (isTouchSearchUi()) {
        // Mobile/tablet: hide bars; keep only search UI and floating search controls.
        try { hideUi(); } catch (eHide) {}
        document.body.classList.add("search-open");
        if (els.mobileBar) els.mobileBar.classList.remove("hidden");
        try { syncBarHeights(); } catch (e) {}
        syncBookmarkIcon();
        // Mobile: do NOT auto-focus. Keyboard must appear only after user taps the input.
      } else {
        try { showUi(); } catch (eShow) {}
        try { if (els.deskInput) els.deskInput.focus(); } catch(e){}
      }
      setCountText("0/0");
      refreshSearchUiVisibility();
    }

    function closeSearch() {
      if (!state.open) return;
      state.open = false;
      document.body.classList.remove("search-open");
      document.body.classList.remove("search-minimized");
      if (els.mobileBar) els.mobileBar.classList.add("hidden");
      if (els.floatPanel) els.floatPanel.classList.add("hidden");
      try { syncBarHeights(); } catch (e) {}
      setDesktopNavVisible(false);
      setMobileNavVisible(false);
      forceClearSearchHighlightArtifacts();
      state.searchActive = false;
      state.searching = false;
      state.queryLower = "";
      state.queryLen = 0;
      state.searchId++;
      state.sectionCounts = [];
      state.totalMatches = 0;
      state.sectionMatches = {};
      state.currentSectionIndex = null;
      state.currentLocalIndex = null;
      state.pendingHighlightCfi = null;
      state.matchList = [];
      state.matchIndex = -1;
      state.legacyTextHlCleared = false;
      state.ensureVisibleToken++;
      cancelFirstMatchConfirm();
      if (state.ensureVisibleTimer) {
        try { clearTimeout(state.ensureVisibleTimer); } catch (e) {}
        state.ensureVisibleTimer = null;
      }
      if (state.highlightRetryTimer) {
        try { clearTimeout(state.highlightRetryTimer); } catch (e) {}
        state.highlightRetryTimer = null;
      }
      if (state.iosSearchSubmitTimer) {
        try { clearTimeout(state.iosSearchSubmitTimer); } catch (e0) {}
        state.iosSearchSubmitTimer = null;
      }
      state.highlightRetryCount = 0;
      state.index = -1;
      state.query = "";
      showClearButtons();
      setCountText("0/0");
      try { if (els.mobileInput) els.mobileInput.value = ""; } catch(e){}
      try { if (els.deskInput) els.deskInput.value = ""; } catch(e){}
      unlockIphoneViewportReflow(0);
      forceSafariSearchVisualReset();
      if (isTouchSearchUi()) {
        try {
          // Closing floating search on touch must keep bars hidden.
          hideUi();
        } catch (eUiRestore) {}
      }
    }

    function clearInput() {
      state.query = "";
      document.body.classList.remove("search-minimized");
      state.searchActive = false;
      state.lastSearchQuery = "";
      state.excludeFootnotes = false;
      state.searchId++;
      state.queryLower = "";
      state.queryLen = 0;
      state.sectionCounts = [];
      state.totalMatches = 0;
      state.sectionMatches = {};
      state.currentSectionIndex = null;
      state.currentLocalIndex = null;
      state.pendingHighlightCfi = null;
      state.matchList = [];
      state.matchIndex = -1;
      state.legacyTextHlCleared = false;
      state.ensureVisibleToken++;
      cancelFirstMatchConfirm();
      if (state.ensureVisibleTimer) {
        try { clearTimeout(state.ensureVisibleTimer); } catch (e) {}
        state.ensureVisibleTimer = null;
      }
      if (state.highlightRetryTimer) {
        try { clearTimeout(state.highlightRetryTimer); } catch (e) {}
        state.highlightRetryTimer = null;
      }
      if (state.iosSearchSubmitTimer) {
        try { clearTimeout(state.iosSearchSubmitTimer); } catch (e0) {}
        state.iosSearchSubmitTimer = null;
      }
      state.highlightRetryCount = 0;
      try { if (els.mobileInput) els.mobileInput.value = ""; } catch(e){}
      try { if (els.deskInput) els.deskInput.value = ""; } catch(e){}
      showClearButtons();
      forceClearSearchHighlightArtifacts();
      forceSafariSearchVisualReset();
      state.index = -1;
      state.searching = false;
      setCountText("0/0");
      refreshSearchUiVisibility();
      syncDesktopAction();
    }

    function clearLegacyTextHighlightsInDoc(doc) {
      try {
        if (!doc || !doc.querySelectorAll) return;
        var list = doc.querySelectorAll("span.search-match-text");
        for (var i = 0; i < list.length; i++) {
          var node = list[i];
          var parent = node && node.parentNode;
          if (!parent) continue;
          while (node.firstChild) parent.insertBefore(node.firstChild, node);
          parent.removeChild(node);
        }
      } catch (e) {}
    }

    function clearLegacyTextHighlightsEverywhere() {
      try { clearLegacyTextHighlightsInDoc(document); } catch (e) {}
      try {
        var contents = reader.rendition.getContents ? reader.rendition.getContents() : [];
        for (var i = 0; i < contents.length; i++) {
          if (contents[i] && contents[i].document) {
            clearLegacyTextHighlightsInDoc(contents[i].document);
          }
        }
      } catch (e) {}
    }

    function clearCssSearchHighlightInDoc(doc) {
      try {
        if (!doc) return;
        var win = doc.defaultView || null;
        var hs = win && win.CSS && win.CSS.highlights;
        if (!hs) return;
        try { hs.delete("fb-search"); } catch (e0) {}
        // Safari can keep paint artifacts after delete(); clear map as fallback.
        try { if (hs.has && hs.has("fb-search") && hs.clear) hs.clear(); } catch (e1) {}
      } catch (e) {}
    }

    function clearCssSearchHighlightsEverywhere() {
      try { clearCssSearchHighlightInDoc(document); } catch (e0) {}
      try {
        var contents = reader.rendition.getContents ? reader.rendition.getContents() : [];
        for (var i = 0; i < contents.length; i++) {
          if (contents[i] && contents[i].document) {
            clearCssSearchHighlightInDoc(contents[i].document);
          }
        }
      } catch (e1) {}
    }

    function clearSearchAnnotationsEverywhere() {
      try {
        var seen = Object.create(null);
        var removeOne = function (cfi) {
          if (!cfi || seen[cfi]) return;
          seen[cfi] = true;
          try { reader.rendition.annotations.remove(cfi, "highlight"); } catch (e0) {}
        };
        try { removeOne(state.pendingHighlightCfi); } catch (e1) {}
        try {
          if (state.lastHighlight) {
            removeOne(state.lastHighlight.cfi || state.lastHighlight);
          }
        } catch (e2) {}
        try {
          var list = state.matchList || [];
          for (var i = 0; i < list.length; i++) {
            if (list[i] && list[i].cfi) removeOne(list[i].cfi);
          }
        } catch (e3) {}
      } catch (e) {}
    }

    function clearPaneHighlightsEverywhere() {
      try {
        var views = reader.rendition && reader.rendition.views ? reader.rendition.views() : [];
        if (!views || !views.length) return;
        for (var i = 0; i < views.length; i++) {
          var v = views[i];
          if (!v) continue;
          try {
            if (v.highlights) {
              var keys = Object.keys(v.highlights);
              for (var k = 0; k < keys.length; k++) {
                try { v.unhighlight(keys[k]); } catch (e0) {}
              }
            }
          } catch (e1) {}
          try {
            if (v.pane && v.pane.marks && v.pane.removeMark) {
              var marks = v.pane.marks.slice();
              for (var m = 0; m < marks.length; m++) {
                try { v.pane.removeMark(marks[m]); } catch (e2) {}
              }
            }
          } catch (e3) {}
        }
      } catch (e) {}
      // Fallback: remove any remaining highlight marks from DOM.
      try {
        var leftovers = document.querySelectorAll('[ref="epubjs-hl"]');
        for (var j = 0; j < leftovers.length; j++) {
          var el = leftovers[j];
          if (el && el.parentNode) el.parentNode.removeChild(el);
        }
      } catch (e4) {}
    }

    function forceSearchHighlightRepaint() {
      try {
        // Main document repaint
        document.body && document.body.offsetHeight;
      } catch (e0) {}
      try {
        var views = reader.rendition && reader.rendition.views ? reader.rendition.views() : [];
        for (var i = 0; i < views.length; i++) {
          var v = views[i];
          if (!v) continue;
          try {
            if (v.element && v.element.style) {
              var prev = v.element.style.webkitTransform;
              v.element.style.webkitTransform = "translateZ(0)";
              v.element.offsetHeight;
              v.element.style.webkitTransform = prev;
            }
          } catch (e1) {}
          try {
            var doc = v.document || (v.contents && v.contents.document) || null;
            var root = doc && doc.documentElement;
            if (root && root.style) {
              var prevRoot = root.style.webkitTransform;
              root.style.webkitTransform = "translateZ(0)";
              root.offsetHeight;
              root.style.webkitTransform = prevRoot;
            }
          } catch (e2) {}
        }
      } catch (e3) {}
    }

    function forceClearSearchHighlightArtifacts() {
      clearHighlight();
      clearSearchAnnotationsEverywhere();
      clearPaneHighlightsEverywhere();
      clearLegacyTextHighlightsEverywhere();
      clearCssSearchHighlightsEverywhere();
      forceSearchHighlightRepaint();
      if (isSafariFirefoxDesktop()) {
        // One more pass after a short delay to handle delayed WebKit repaint/composition.
        setTimeout(function () {
          clearSearchAnnotationsEverywhere();
          clearPaneHighlightsEverywhere();
          clearLegacyTextHighlightsEverywhere();
          clearCssSearchHighlightsEverywhere();
          forceSearchHighlightRepaint();
        }, 60);
      }
    }

    function cancelFirstMatchConfirm() {
      state.firstMatchConfirmToken++;
      if (state.firstMatchConfirmTimer) {
        try { clearTimeout(state.firstMatchConfirmTimer); } catch (e) {}
        state.firstMatchConfirmTimer = null;
      }
    }

    function clearHighlight() {
      try {
        if (state.lastHighlight) {
          if (state.lastHighlight.type === "css") {
            try {
              var d = state.lastHighlight.doc;
              var win = d && d.defaultView;
              if (win && win.CSS && win.CSS.highlights) win.CSS.highlights.delete("fb-search");
            } catch (eC) {}
          } else if (state.lastHighlight.type === "text") {
            try {
              if (state.lastHighlight.doc) clearLegacyTextHighlightsInDoc(state.lastHighlight.doc);
              else clearLegacyTextHighlightsEverywhere();
            } catch (eT) {}
          } else if (state.lastHighlight.overlay) {
            try {
              var ov = state.lastHighlight.overlay;
              while (ov.firstChild) ov.removeChild(ov.firstChild);
            } catch (eO) {}
          } else {
            var cfi = state.lastHighlight.cfi || state.lastHighlight;
            var typ = state.lastHighlight.type || "highlight";
            reader.rendition.annotations.remove(cfi, typ);
          }
        }
      } catch (e) {}
      state.lastHighlight = null;
    }

    function isSafariFirefoxDesktop() {
      try {
        var ua = navigator.userAgent || "";
        var isFirefox = /Firefox/i.test(ua);
        var isSafari = /Safari/i.test(ua) && !/(Chrome|CriOS|Edg|OPR|FxiOS)/i.test(ua);
        if (!isFirefox && !isSafari) return false;
        if (window.matchMedia && window.matchMedia("(pointer: fine)").matches) return true;
      } catch (e) {}
      return false;
    }

    function isSafariDesktopOnly() {
      try {
        var ua = navigator.userAgent || "";
        var isSafari = /Safari/i.test(ua) && !/(Chrome|CriOS|Edg|OPR|FxiOS|Firefox)/i.test(ua);
        if (!isSafari) return false;
        if (window.matchMedia && window.matchMedia("(pointer: fine)").matches) return true;
      } catch (e) {}
      return false;
    }

    function forceSafariSearchVisualReset() {
      if (!isSafariDesktopOnly()) return;
      if (isTouchSearchUi()) return;
      if (state.safariSearchRepaintTimer) {
        try { clearTimeout(state.safariSearchRepaintTimer); } catch (e0) {}
        state.safariSearchRepaintTimer = null;
      }
      state.safariSearchRepaintTimer = setTimeout(function () {
        var targetCfi = null;
        var targetHref = null;
        try {
          var loc = reader.rendition.currentLocation && reader.rendition.currentLocation();
          targetCfi = loc && loc.start && loc.start.cfi;
          targetHref = loc && loc.start && loc.start.href;
        } catch (e1) {}
        if (!targetCfi && !targetHref) return;
        try {
          var p = reader.rendition.display(targetCfi || targetHref);
          if (p && p.catch) p.catch(function () {});
        } catch (e2) {}
      }, 0);
    }

    function getTextNodesInRange(range) {
      var nodes = [];
      try {
        var root = range.commonAncestorContainer;
        if (root && root.nodeType === 3) {
          return [root];
        }
        var doc = root && (root.nodeType === 9 ? root : root.ownerDocument);
        var nf = (doc.defaultView && doc.defaultView.NodeFilter) || NodeFilter;
        var walker = doc.createTreeWalker(root || doc, nf.SHOW_TEXT, null, false);
        var node;
        while ((node = walker.nextNode())) {
          if (!node.nodeValue) continue;
          try {
            if (range.intersectsNode ? range.intersectsNode(node) : true) nodes.push(node);
          } catch (e0) {}
        }
      } catch (e) {}
      return nodes;
    }

    function wrapTextNodeSegment(node, startOffset, endOffset) {
      try {
        var doc = node.ownerDocument;
        var text = node.nodeValue || "";
        var before = text.slice(0, startOffset);
        var middle = text.slice(startOffset, endOffset);
        var after = text.slice(endOffset);
        var frag = doc.createDocumentFragment();
        if (before) frag.appendChild(doc.createTextNode(before));
        var span = doc.createElement("span");
        span.className = "search-match-text";
        span.style.setProperty("background", "#61c2fa", "important");
        span.style.setProperty("color", "inherit", "important");
        span.textContent = middle;
        frag.appendChild(span);
        if (after) frag.appendChild(doc.createTextNode(after));
        node.parentNode.replaceChild(frag, node);
        return span;
      } catch (e) {}
      return null;
    }

    function highlightTextRange(range) {
      var spans = [];
      try {
        var nodes = getTextNodesInRange(range);
        if (!nodes.length) return spans;
        var startNode = range.startContainer;
        var endNode = range.endContainer;
        for (var i = 0; i < nodes.length; i++) {
          var n = nodes[i];
          var start = 0;
          var end = n.nodeValue.length;
          if (n === startNode) start = range.startOffset;
          if (n === endNode) end = range.endOffset;
          if (start === end) continue;
          var span = wrapTextNodeSegment(n, start, end);
          if (span) spans.push(span);
        }
      } catch (e) {}
      return spans;
    }

    function countMatchesInDocument(doc, queryLower, queryLen) {
      var count = 0;
      try {
        if (!doc || !doc.body) return 0;
        var walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null, false);
        var node;
        while ((node = walker.nextNode())) {
          var txt = node.nodeValue || "";
          if (!txt || !txt.trim()) continue;
          if (state.excludeFootnotes && isInFootnote(node)) continue;
          var norm = normalizeForSearch(txt);
          var lower = (norm.norm || "").toLowerCase();
          var pos = 0;
          while (true) {
            var idx = lower.indexOf(queryLower, pos);
            if (idx === -1) break;
            count++;
            pos = idx + queryLen;
          }
        }
      } catch (e) {}
      return count;
    }

    function hrefMatch(a, b) {
      if (!a || !b) return false;
      try {
        var a0 = (a || "").split("#")[0];
        var b0 = (b || "").split("#")[0];
        if (a0 === b0) return true;
        if (a0 && b0 && (a0.endsWith(b0) || b0.endsWith(a0))) return true;
      } catch (e) {}
      return false;
    }

    function getContentsForSectionIndex(sectionIndex) {
      var contents = reader.rendition.getContents ? reader.rendition.getContents() : [];
      if (!contents || !contents.length) return null;
      var spine = reader.book && reader.book.spine && reader.book.spine.spineItems ? reader.book.spine.spineItems : [];
      var targetHref = spine[sectionIndex] ? spine[sectionIndex].href : null;
      var targetIdref = spine[sectionIndex] ? spine[sectionIndex].idref : null;
      for (var i = 0; i < contents.length; i++) {
        var c = contents[i];
        if (!c || !c.section) continue;
        if (c.section.index != null && c.section.index === sectionIndex) return c;
        if (targetIdref && c.section.idref && c.section.idref === targetIdref) return c;
        if (targetHref && c.section.href && hrefMatch(c.section.href, targetHref)) return c;
      }
      return null;
    }

    function rangeMatchesQuery(range) {
      try {
        if (!state.queryLower || !state.queryLen) return true;
        var txt = range && range.toString ? (range.toString() || "") : "";
        if (!txt) return false;
        var nq = normalizeQuery(txt);
        if (!nq || !nq.normLower) return false;
        return nq.normLower.indexOf(state.queryLower) !== -1;
      } catch (e) {}
      return false;
    }

    function highlightCfi(cfi) {
      clearHighlight();
      if (!cfi) return false;
      try {
        var contents = reader.rendition.getContents ? reader.rendition.getContents() : [];
        if (!contents || !contents.length) return false;
        for (var i = 0; i < contents.length; i++) {
          var c = contents[i];
          if (!c || !c.document || !c.range) continue;
          var r = null;
          try { r = c.range(cfi); } catch (e0) { r = null; }
          if (!r || r.collapsed) continue;
          if (!rangeMatchesQuery(r)) continue;
          // Touch devices: use text spans to guarantee visible highlight under text.
          // SVG/CSS overlays can end up under iframe composition on mobile/tablet browsers.
          if (__fb_isIOS || isTouchDeviceForSearchHighlight()) {
            try {
              var spans = highlightTextRange(r);
              if (spans && spans.length) {
                state.lastHighlight = { type: "text", doc: c.document };
                state.pendingHighlightCfi = null;
                state.highlightRetryCount = 0;
                return true;
              }
            } catch (eTxt) {}
          }
          try {
            var win = c.document.defaultView;
            var canCss = win && win.CSS && win.CSS.highlights && win.Highlight;
            if (canCss) {
              var hl = new win.Highlight(r);
              win.CSS.highlights.set("fb-search", hl);
              state.lastHighlight = { type: "css", doc: c.document };
              state.pendingHighlightCfi = null;
              state.highlightRetryCount = 0;
              return true;
            }
          } catch (eCss) {}
          try {
            reader.rendition.annotations.highlight(cfi, {}, null);
            state.lastHighlight = { cfi: cfi, type: "highlight" };
            state.pendingHighlightCfi = null;
            state.highlightRetryCount = 0;
            return true;
          } catch (eAnn) {}
        }
      } catch (e) {}
      return false;
    }

    function ensureMatchVisible(item) {
      try {
        if (!item || item.sectionIndex == null) return;
        var cfi = item.cfi;
        if (!cfi) return;
        var contents = getContentsForSectionIndex(item.sectionIndex);
        if (!contents || !contents.document) return;
        var range = null;
        try { range = contents.range(cfi); } catch (e0) { range = null; }
        if (!range) return;
        var rect = range.getBoundingClientRect();
        var doc = contents.document;
        var win = doc.defaultView || null;
        var vw = (doc.documentElement && doc.documentElement.clientWidth) || (win && win.innerWidth) || 0;
        var vh = (doc.documentElement && doc.documentElement.clientHeight) || (win && win.innerHeight) || 0;
        if (!vw || !vh) return;
        var outX = (rect.right <= 0) || (rect.left >= vw);
        var outY = (rect.bottom <= 0) || (rect.top >= vh);
        if (!(outX || outY)) return;
        var offset = null;
        try { offset = contents.locationOf ? contents.locationOf(cfi) : null; } catch (e1) { offset = null; }
        if (offset && reader.rendition && reader.rendition.manager && reader.rendition.manager.moveTo) {
          reader.rendition.manager.moveTo(offset);
        } else {
          reader.rendition.display(cfi);
        }
      } catch (e) {}
    }

    function scheduleEnsureVisible(item) {
      if (!item) return;
      state.ensureVisibleToken++;
      var token = state.ensureVisibleToken;
      var tries = 0;
      var maxTries = 4;
      if (state.ensureVisibleTimer) {
        try { clearTimeout(state.ensureVisibleTimer); } catch (e) {}
      }
      var step = function () {
        if (!state.searchActive) return;
        if (token !== state.ensureVisibleToken) return;
        tries++;
        ensureMatchVisible(item);
        if (tries >= maxTries) return;
        state.ensureVisibleTimer = setTimeout(step, 80);
      };
      state.ensureVisibleTimer = setTimeout(step, 40);
    }

    function getCorrectedCfiForItem(item) {
      try {
        if (!item || item.sectionIndex == null) return null;
        if (!state.queryLower || !state.queryLen) return null;
        var contents = getContentsForSectionIndex(item.sectionIndex);
        if (!contents) return null;
        var list = buildMatchesForContents(contents, state.queryLower, state.queryLen);
        if (!list || !list.length) return null;
        // Update cached matches for this section using the LIVE DOM (authoritative).
        state.sectionMatches[item.sectionIndex] = list;
        state.sectionCounts[item.sectionIndex] = list.length;

        // Rebuild matchList in spine order so global indices stay consistent.
        var spine = reader.book && reader.book.spine && reader.book.spine.spineItems ? reader.book.spine.spineItems : [];
        state.matchList = [];
        state.totalMatches = 0;
        for (var si = 0; si < spine.length; si++) {
          var arr = state.sectionMatches[si] || [];
          state.sectionCounts[si] = arr.length;
          state.totalMatches += arr.length;
          for (var k = 0; k < arr.length; k++) {
            state.matchList.push({ cfi: arr[k], sectionIndex: si, localIndex: k });
          }
        }

        var idx = item.localIndex;
        if (idx == null || idx < 0 || idx >= list.length) idx = 0;
        var globalIndex = 0;
        for (var sj = 0; sj < item.sectionIndex; sj++) {
          var cnt = state.sectionMatches[sj] ? state.sectionMatches[sj].length : 0;
          globalIndex += cnt;
        }
        globalIndex += idx;
        state.matchIndex = globalIndex;
        state.index = globalIndex;
        state.currentSectionIndex = item.sectionIndex;
        state.currentLocalIndex = idx;
        setCountText((state.index + 1) + "/" + state.totalMatches);

        return list[idx] || null;
      } catch (e) {}
      return null;
    }

    function applyHighlightWithCorrection(cfi, item) {
      if (highlightCfi(cfi)) return true;
      var fixed = getCorrectedCfiForItem(item);
      if (fixed && fixed !== cfi) {
        try { item.cfi = fixed; } catch (e0) {}
        try {
          if (state.matchList && state.matchIndex != null && state.matchIndex >= 0 && state.matchList[state.matchIndex]) {
            state.matchList[state.matchIndex].cfi = fixed;
          }
        } catch (e1) {}
        if (!shouldUseTouchSearchFlow()) {
          if (highlightCfi(fixed)) return true;
          try {
            var p = reader.rendition.display(fixed);
            if (p && p.then) {
              p.then(function () {
                if (!highlightCfi(fixed)) scheduleHighlightRetry(fixed);
              }).catch(function () {
                if (!highlightCfi(fixed)) scheduleHighlightRetry(fixed);
              });
            } else {
              if (!highlightCfi(fixed)) scheduleHighlightRetry(fixed);
            }
          } catch (eDesk) {
            if (!highlightCfi(fixed)) scheduleHighlightRetry(fixed);
          }
          return true;
        }
        try {
          var p = reader.rendition.display(fixed);
          if (p && p.then) {
            p.then(function () {
              if (!highlightCfi(fixed)) scheduleHighlightRetry(fixed);
            }).catch(function () {
              if (!highlightCfi(fixed)) scheduleHighlightRetry(fixed);
            });
          } else {
            if (!highlightCfi(fixed)) scheduleHighlightRetry(fixed);
          }
        } catch (e2) {
          if (!highlightCfi(fixed)) scheduleHighlightRetry(fixed);
        }
        return true;
      }
      return false;
    }

    function isTouchDeviceForSearchHighlight() {
      try {
        if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
      } catch (e0) {}
      try {
        if (navigator && navigator.maxTouchPoints && navigator.maxTouchPoints > 0) return true;
      } catch (e1) {}
      return false;
    }

    function shouldUseTouchSearchFlow() {
      return !!(__fb_isIOS || isTouchDeviceForSearchHighlight());
    }

    function scheduleHighlightRetry(cfi) {
      if (!cfi) return;
      state.pendingHighlightCfi = cfi;
      state.highlightRetryCount = 0;
      if (state.highlightRetryTimer) {
        try { clearTimeout(state.highlightRetryTimer); } catch (e) {}
      }
      state.highlightRetryTimer = setTimeout(function retry() {
        if (!state.searchActive) return;
        if (state.pendingHighlightCfi !== cfi) return;
        var item = null;
        try {
          if (state.matchList && state.matchIndex != null && state.matchIndex >= 0) {
            item = state.matchList[state.matchIndex] || null;
          }
        } catch (e0) {}
        var ok = applyHighlightWithCorrection(cfi, item);
        if (ok) return;
        state.highlightRetryCount++;
        if (state.highlightRetryCount > 6) return;
        state.highlightRetryTimer = setTimeout(retry, 120);
      }, 60);
    }

    function waitForTouchLayoutStable(done) {
      if (!isTouchDeviceForSearchHighlight()) {
        done();
        return;
      }
      var raf = window.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); };
      var called = false;
      var safeDone = function () {
        if (called) return;
        called = true;
        done();
      };
      try {
        raf(function () {
          raf(function () {
            state.firstMatchConfirmTimer = setTimeout(safeDone, 20);
          });
        });
      } catch (e) {
        state.firstMatchConfirmTimer = setTimeout(safeDone, 40);
      }
      state.firstMatchConfirmTimer = setTimeout(safeDone, 260);
    }

    function confirmFirstMatchHighlight(cfi, item, onDone) {
      if (!cfi) {
        onDone(false);
        return;
      }
      cancelFirstMatchConfirm();
      var token = state.firstMatchConfirmToken;
      var started = Date.now();
      var maxWaitMs = 1800;
      var maxAttempts = 16;
      var tries = 0;
      var finished = false;
      var done = function (ok) {
        if (finished) return;
        finished = true;
        if (token !== state.firstMatchConfirmToken) return;
        cancelFirstMatchConfirm();
        onDone(!!ok);
      };
      var step = function () {
        if (token !== state.firstMatchConfirmToken) return;
        if (!state.searchActive) return;
        tries++;
        if (applyHighlightWithCorrection(cfi, item)) {
          done(true);
          return;
        }
        if (tries >= maxAttempts || (Date.now() - started) >= maxWaitMs) {
          done(false);
          return;
        }
        state.firstMatchConfirmTimer = setTimeout(step, 110);
      };
      waitForTouchLayoutStable(step);
    }

    function buildMatchesForContents(contents, queryLower, queryLen) {
      try {
        if (!contents || !contents.document || !contents.document.body) return [];
        var doc = contents.document;
        return buildMatchesAcrossNodes(doc, queryLower, queryLen, function (range) {
          var cfi = null;
          try { cfi = contents.cfiFromRange ? contents.cfiFromRange(range) : null; } catch (e0) { cfi = null; }
          if (!cfi && contents.section && contents.section.cfiFromRange) {
            try { cfi = contents.section.cfiFromRange(range); } catch (e1) { cfi = null; }
          }
          return cfi;
        });
      } catch (e) {}
      return [];
    }

    function getSectionMatches(sectionIndex, done) {
      var cfis = state.sectionMatches[sectionIndex];
      if (!cfis) cfis = [];
      return done(cfis);
    }

    function showMatchByIndex(idx) {
      if (!state.matchList || !state.matchList.length) return;
      var total = state.matchList.length;
      var safeIdx = ((idx % total) + total) % total;
      var item = state.matchList[safeIdx];
      if (!item) return;
      cancelFirstMatchConfirm();
      state.matchIndex = safeIdx;
      state.index = safeIdx;
      setCountText((state.index + 1) + "/" + state.totalMatches);
      state.currentSectionIndex = item.sectionIndex;
      state.currentLocalIndex = item.localIndex;
      var spine = reader.book && reader.book.spine && reader.book.spine.spineItems ? reader.book.spine.spineItems : [];
      var sectionHref = spine[item.sectionIndex] ? spine[item.sectionIndex].href : null;

      var doDisplay = function (targetCfi) {
        if (!targetCfi) return;
        var touchFlow = shouldUseTouchSearchFlow();
        // Clear previous highlight BEFORE display so CFIs resolve on the original DOM.
        clearHighlight();
        state.pendingHighlightCfi = null;
        try {
          reader.rendition.display(targetCfi).then(function () {
            var firstTouchMatch = touchFlow && (safeIdx === 0);
            if (firstTouchMatch) {
              confirmFirstMatchHighlight(targetCfi, item, function (ok) {
                if (!ok) scheduleHighlightRetry(targetCfi);
                scheduleEnsureVisible(item);
              });
              return;
            }
            if (!applyHighlightWithCorrection(targetCfi, item)) {
              scheduleHighlightRetry(targetCfi);
              return;
            }
            if (touchFlow) scheduleEnsureVisible(item);
          }).catch(function () {
            var firstTouchMatch = touchFlow && (safeIdx === 0);
            if (firstTouchMatch) {
              confirmFirstMatchHighlight(targetCfi, item, function (ok) {
                if (!ok) scheduleHighlightRetry(targetCfi);
                scheduleEnsureVisible(item);
              });
              return;
            }
            if (!applyHighlightWithCorrection(targetCfi, item)) {
              scheduleHighlightRetry(targetCfi);
              return;
            }
            if (touchFlow) scheduleEnsureVisible(item);
          });
        } catch (e) {
          var firstTouchMatch = touchFlow && (safeIdx === 0);
          if (firstTouchMatch) {
            confirmFirstMatchHighlight(targetCfi, item, function (ok) {
              if (!ok) scheduleHighlightRetry(targetCfi);
              scheduleEnsureVisible(item);
            });
            return;
          }
          if (!applyHighlightWithCorrection(targetCfi, item)) {
            scheduleHighlightRetry(targetCfi);
            return;
          }
          if (touchFlow) scheduleEnsureVisible(item);
        }
      };

      var contents = getContentsForSectionIndex(item.sectionIndex);
      if (shouldUseTouchSearchFlow() && !contents && sectionHref) {
        try {
          reader.rendition.display(sectionHref).then(function () {
            var fixed = getCorrectedCfiForItem(item) || item.cfi;
            if (fixed) item.cfi = fixed;
            doDisplay(fixed || item.cfi);
          }).catch(function () {
            var fixed = getCorrectedCfiForItem(item) || item.cfi;
            if (fixed) item.cfi = fixed;
            doDisplay(fixed || item.cfi);
          });
          return;
        } catch (e0) {}
      }

      var corrected = getCorrectedCfiForItem(item) || item.cfi;
      if (corrected) item.cfi = corrected;
      doDisplay(corrected || item.cfi);
    }

    function navigate(dir, fromStart) {
      if (state.searching) return;
      if (!state.searchActive) return;
      if (!state.matchList || !state.matchList.length) return;
      var startIdx;
      if (fromStart || state.matchIndex == null || state.matchIndex < 0) {
        startIdx = (dir > 0) ? 0 : (state.matchList.length - 1);
      } else {
        startIdx = state.matchIndex + dir;
      }
      showMatchByIndex(startIdx);
    }

    function goPrev() { navigate(-1, false); }
    function goNext() { navigate(1, false); }
    function goFirstMatch() {
      if (state.searching) return;
      if (!state.searchActive) return;
      if (!state.matchList || !state.matchList.length) return;
      showMatchByIndex(0);
    }

    function goBackToPre() {
      // Clear the current query and return to the location where search was opened.
      clearInput();

      var targetCfi = state.preCfi;
      var targetHref = state.preHref;

      // Fallback: if for some reason we lost the pre-search location (mobile edge cases),
      // go back to the last known reading location.
      if (!targetCfi && !targetHref) {
        targetCfi = window.__fb_last_cfi || null;
        targetHref = window.__fb_last_href || null;
      }

      if (!targetCfi && !targetHref) return;

      // Clear saved location after we attempt to return.
      state.preCfi = null;
      state.preHref = null;

      try {
        var p = reader.rendition.display(targetCfi || targetHref);
        if (p && p.catch) {
          p.catch(function () {
            try {
              if (targetHref) return reader.rendition.display(targetHref);
            } catch (e) {}
          });
        }
      } catch (e) {
        try {
          if (targetHref) reader.rendition.display(targetHref);
        } catch (e2) {}
      }
    }

    function goBackToLastSearchStart() {
      var targetCfi = state.searchStartCfi;
      var targetHref = state.searchStartHref;

      clearInput();
      state.searchActive = false;
      state.lastSearchQuery = "";
      state.searchStartCfi = null;
      state.searchStartHref = null;
      setDesktopNavVisible(false);
      syncDesktopAction();

      if (!targetCfi && !targetHref) return;
      try {
        var p = reader.rendition.display(targetCfi || targetHref);
        if (p && p.catch) {
          p.catch(function () {
            try {
              if (targetHref) return reader.rendition.display(targetHref);
            } catch (e) {}
          });
        }
      } catch (e) {
        try {
          if (targetHref) reader.rendition.display(targetHref);
        } catch (e2) {}
      }
    }

    function normalize(s) { return (s || "").replace(/\s+/g, " "); }

    function buildExcerpt(text, start, len) {
      try {
        var a = Math.max(0, start - 32);
        var b = Math.min(text.length, start + len + 48);
        return normalize(text.slice(a, b));
      } catch (e) { return ""; }
    }

    var FOOTNOTE_SELECTOR = [
      "aside",
      "[epub\\\\:type~=\"note\"]",
      "[epub\\\\:type~=\"footnote\"]",
      "[epub\\\\:type~=\"endnote\"]",
      "[epub\\\\:type~=\"rearnote\"]",
      "[role=\"doc-note\"]",
      "[role=\"doc-footnote\"]",
      "[role=\"doc-endnote\"]",
      ".note",
      ".notes",
      ".footnote",
      ".footnotes",
      ".endnote",
      ".endnotes",
      ".rearnote",
      ".rearnotes",
      ".popup",
      ".pop_content",
      "[id*=\"footnote\"]",
      "[id*=\"endnote\"]",
      "[id*=\"rearnote\"]"
    ].join(",");

    function isFootnoteSection(section) {
      try {
        var href = (section && section.href) || "";
        var idref = (section && section.idref) || "";
        var props = "";
        try { props = (section && section.properties) ? section.properties.join(" ") : ""; } catch (e1) { props = ""; }
        var hay = (href + " " + idref + " " + props).toLowerCase();
        return /(notes?|footnotes?|endnotes?|rearnotes?|fn)/i.test(hay);
      } catch (e) {}
      return false;
    }

    function isInFootnote(node) {
      try {
        var el = node && (node.nodeType === 1 ? node : node.parentElement);
        if (!el) return false;
        if (el.closest && el.closest(FOOTNOTE_SELECTOR)) return true;
        var re = /(footnote|endnote|rearnote|note|notes|fn)/i;
        for (var cur = el; cur && cur.nodeType === 1; cur = cur.parentElement) {
          var et = "";
          try { et = cur.getAttribute && cur.getAttribute("epub:type"); } catch (e0) { et = ""; }
          if (et && /note/i.test(et)) return true;
          var role = "";
          try { role = cur.getAttribute && cur.getAttribute("role"); } catch (e1) { role = ""; }
          if (role && /doc-(footnote|endnote|note)/i.test(role)) return true;
          if (cur.tagName && cur.tagName.toLowerCase() === "aside") return true;
          var id = cur.id || "";
          var cls = cur.className || "";
          if (re.test(id) || re.test(cls)) return true;
        }
      } catch (e) {}
      return false;
    }

    function normalizeForSearch(text) {
      var norm = "";
      var map = [];
      try {
        for (var i = 0; i < text.length; i++) {
          var ch = text[i];
          var code = ch.charCodeAt(0);
          // Skip soft hyphen / zero-width separators that break matches visually.
          if (code === 0x00AD || code === 0x200B || code === 0x2060 || code === 0xFEFF) {
            continue;
          }
          // Treat NBSP as a normal space for searching.
          if (code === 0x00A0) ch = " ";
          norm += ch;
          map.push(i);
        }
      } catch (e) {}
      return { norm: norm, map: map };
    }

    function normalizeQuery(text) {
      var obj = normalizeForSearch(text || "");
      var norm = (obj && obj.norm) ? obj.norm : "";
      return { normLower: norm.toLowerCase(), len: norm.length };
    }

    function getBlockAncestor(el, doc) {
      try {
        var blockTags = {
          "P": true, "DIV": true, "LI": true, "H1": true, "H2": true, "H3": true, "H4": true, "H5": true, "H6": true,
          "BLOCKQUOTE": true, "TD": true, "TH": true, "SECTION": true, "ARTICLE": true, "HEADER": true, "FOOTER": true
        };
        var cur = el && el.nodeType === 1 ? el : (el && el.parentElement) || null;
        while (cur) {
          if (blockTags[cur.tagName]) return cur;
          if (doc && cur === doc.body) return cur;
          cur = cur.parentElement;
        }
      } catch (e) {}
      return doc && doc.body ? doc.body : (el && el.parentElement) || null;
    }

    function buildMatchesAcrossNodes(doc, queryLower, queryLen, cfiFromRangeFn) {
      var cfis = [];
      try {
        if (!doc || !doc.body || !queryLower || !queryLen) return cfis;
        var nf = (doc.defaultView && doc.defaultView.NodeFilter) || NodeFilter;
        var walker = doc.createTreeWalker(doc.body, nf.SHOW_TEXT, null, false);
        var node;
        while ((node = walker.nextNode())) {
          var txt = node.nodeValue || "";
          if (!txt || !txt.trim()) continue;
          if (state.excludeFootnotes && isInFootnote(node)) continue;
          var norm = normalizeForSearch(txt);
          var normStr = norm.norm || "";
          var map = norm.map || [];
          if (!normStr) continue;
          var lower = normStr.toLowerCase();
          var pos = 0;
          while (true) {
            var idx = lower.indexOf(queryLower, pos);
            if (idx === -1) break;
            var startOffset = map[idx];
            var endOffset = map[idx + queryLen - 1];
            if (startOffset != null && endOffset != null) {
              try {
                var range = doc.createRange();
                range.setStart(node, startOffset);
                range.setEnd(node, endOffset + 1);
                var cfi = null;
                try { cfi = cfiFromRangeFn(range); } catch (e0) { cfi = null; }
                if (cfi) cfis.push(cfi);
              } catch (e1) {}
            }
            pos = idx + queryLen;
          }
        }
      } catch (e) {}
      return cfis;
    }

    function buildMatchesInSection(section, queryLower, queryLen) {
      if (state.excludeFootnotes && isFootnoteSection(section)) {
        return Promise.resolve([]);
      }
      return section.load(reader.book.load.bind(reader.book)).then(function (contents) {
        try {
          var doc = contents && (contents.ownerDocument || contents);
          if (!doc || !doc.body) return [];
          return buildMatchesAcrossNodes(doc, queryLower, queryLen, function (range) {
            return section.cfiFromRange(range);
          });
        } catch (e) {}
        return [];
      }).catch(function(){ return []; });
    }

    function runSearch(query) {
      var q = (query || "").trim();
      state.query = q;
      if (isTouchSearchUi()) {
        document.body.classList.toggle("search-minimized", !!q);
      }
      showClearButtons();
      refreshSearchUiVisibility();

      if (!q) {
        clearInput();
        return;
      }

      state.searchActive = true;
      var myId = ++state.searchId;
      state.searching = true;
      state.sectionCounts = [];
      state.totalMatches = 0;
      state.index = -1;
      var nq = normalizeQuery(q);
      state.queryLower = nq.normLower;
      state.queryLen = nq.len;
      if (!state.queryLen) {
        clearInput();
        return;
      }
      if (!state.legacyTextHlCleared) {
        clearLegacyTextHighlightsEverywhere();
        state.legacyTextHlCleared = true;
      }
      state.sectionMatches = {};
      state.currentSectionIndex = null;
      state.currentLocalIndex = null;
      state.pendingHighlightCfi = null;
      state.matchList = [];
      state.matchIndex = -1;
      state.ensureVisibleToken++;
      cancelFirstMatchConfirm();
      if (state.ensureVisibleTimer) {
        try { clearTimeout(state.ensureVisibleTimer); } catch (e) {}
        state.ensureVisibleTimer = null;
      }
      if (state.highlightRetryTimer) {
        try { clearTimeout(state.highlightRetryTimer); } catch (e) {}
        state.highlightRetryTimer = null;
      }
      state.highlightRetryCount = 0;
      clearHighlight();
      setCountText("…");

      var ql = state.queryLower;
      var qlen = state.queryLen;
      var spine = reader.book && reader.book.spine && reader.book.spine.spineItems ? reader.book.spine.spineItems : [];
      state.sectionCounts = new Array(spine.length);
      for (var si = 0; si < state.sectionCounts.length; si++) {
        state.sectionCounts[si] = 0;
      }

      // Sequential scan to keep memory stable on mobile.
      (function loop(i) {
        if (myId !== state.searchId) return; // canceled
        if (i >= spine.length) {
          state.searching = false;
          if (!state.totalMatches) {
            setCountText("0/0");
            refreshSearchUiVisibility();
            return;
          }
          refreshSearchUiVisibility();
          // Start at the first match.
          // Keep counter stable even if first-match render/highlight is delayed in some browsers.
          setCountText("1/" + state.totalMatches);
          state.matchIndex = 0;
          try {
            showMatchByIndex(0);
          } catch (eShow) {
            // Never leave the counter stuck on the initial "…".
            setCountText("1/" + state.totalMatches);
          }
          return;
        }
        var section = spine[i];
        buildMatchesInSection(section, ql, qlen).then(function (cfis) {
          if (myId !== state.searchId) return;
          var arr = cfis || [];
          state.sectionMatches[i] = arr;
          state.sectionCounts[i] = arr.length;
          state.totalMatches += arr.length;
          if (arr.length) {
            for (var k = 0; k < arr.length; k++) {
              state.matchList.push({ cfi: arr[k], sectionIndex: i, localIndex: k });
            }
          }
          setTimeout(function(){ loop(i + 1); }, 0);
        });
      })(0);
    }

    function debouncedSearch(fromEl) {
      var val = "";
      try { val = fromEl && fromEl.value || ""; } catch (e) {}
      // Keep helper for mobile fallback if needed, but do not auto-run on desktop typing.
      state.query = (val || "").trim();
      showClearButtons();
      refreshSearchUiVisibility();
      if (state.debounceTimer) clearTimeout(state.debounceTimer);
      state.debounceTimer = setTimeout(function(){ runSearch(val); }, 250);
    }

    // Wire UI
    if (els.open) {
      els.open.addEventListener("click", function (e) {
        e.preventDefault();
        openSearch();
      });
    }

    if (els.deskAction) {
      els.deskAction.addEventListener("click", function(e){
        if (e) e.preventDefault();
        if (state.searchActive) {
          // Desktop clear ("x"): close/clear search but keep current reading position.
          clearInput();
          state.searchStartCfi = null;
          state.searchStartHref = null;
          forceSafariSearchVisualReset();
          syncDesktopAction();
          refreshSearchUiVisibility();
          return;
        }
        var q = "";
        try { q = (els.deskInput && els.deskInput.value || "").trim(); } catch (e2) { q = ""; }
        if (!q) return;
        state.searchActive = true;
        state.lastSearchQuery = q;
        state.searchStartCfi = getCurrentCfi();
        state.searchStartHref = getCurrentHref();
        state.excludeFootnotes = true;
        state.query = q;
        syncDesktopAction();
        refreshSearchUiVisibility();
        runSearch(q);
      });
    }
    if (els.mobileClear) els.mobileClear.addEventListener("click", clearInput);
    if (els.mobilePrev) els.mobilePrev.addEventListener("click", goPrev);
    if (els.mobileNext) els.mobileNext.addEventListener("click", goNext);
    if (els.floatPrev) els.floatPrev.addEventListener("click", goPrev);
    if (els.floatNext) els.floatNext.addEventListener("click", goNext);
    if (els.floatReturn) els.floatReturn.addEventListener("click", function (e) {
      if (e) e.preventDefault();
      goFirstMatch();
    });
    if (els.floatClose) els.floatClose.addEventListener("click", function (e) {
      if (e) e.preventDefault();
      closeSearch();
    });
    if (els.deskPrev) els.deskPrev.addEventListener("click", goPrev);
    if (els.deskNext) els.deskNext.addEventListener("click", goNext);
    const onReturn = (e) => {
      if (e) e.preventDefault();
      clearInput();
      goBackToPre();
    };
    const closeAndReturn = (e) => {
      if (e) e.preventDefault();
      onReturn();
      closeSearch();
    };
    if (els.mobileClose) els.mobileClose.addEventListener("click", closeAndReturn);
    if (els.mobileBookmark) els.mobileBookmark.addEventListener("click", function(e){
      if (e) e.preventDefault();
      var bm = document.getElementById("bookmark");
      if (bm && bm.click) bm.click();
      setTimeout(syncBookmarkIcon, 0);
    });

    if (els.mobileInput) {
      // Mobile behavior requested by user:
      // - Opening the search bar must NOT pop the keyboard (we do not auto-focus).
      // - While typing: NO search.
      // - Search runs only when user presses Enter/Return on the keyboard.
      els.mobileInput.addEventListener("input", function(){
        var q = (els.mobileInput.value || "");
        state.query = q;
        showClearButtons();
        refreshSearchUiVisibility();
        if (!q.trim()) {
          clearHighlight();
          state.sectionCounts = [];
          state.totalMatches = 0;
          state.index = -1;
          state.searchActive = false;
          state.searching = false;
          state.searchId++;
          state.sectionMatches = {};
          state.currentSectionIndex = null;
          state.currentLocalIndex = null;
          state.pendingHighlightCfi = null;
          state.matchList = [];
          state.matchIndex = -1;
          setCountText("0/0");
        }
      });
      els.mobileInput.addEventListener("keydown", function(e){
        // Android IME often sends Enter with keyCode=13 and key="Enter".
        if (e.key === "Enter" || e.keyCode === 13) {
          e.preventDefault();
          e.stopPropagation();
          // Run search ONLY on Enter (no search while typing).
          var q = (els.mobileInput.value || "").trim();
          state.excludeFootnotes = true;
          // Hide keyboard first; on iPhone wait for keyboard-close relayout to settle.
          try { els.mobileInput.blur(); } catch (err) {}
          if (!q) {
            clearInput();
            unlockIphoneViewportReflow(0);
            return;
          }
          if (__fb_isIPhone) {
            lockIphoneViewportReflow();
            if (state.iosSearchSubmitTimer) {
              try { clearTimeout(state.iosSearchSubmitTimer); } catch (e0) {}
            }
            state.iosSearchSubmitTimer = setTimeout(function () {
              state.iosSearchSubmitTimer = null;
              try {
                if (typeof window.__fbScheduleLayoutSync === "function") window.__fbScheduleLayoutSync();
              } catch (e1) {}
              runSearch(q);
              unlockIphoneViewportReflow(420);
            }, 280);
          } else {
            runSearch(q);
          }
          return;
        }
        if (e.key === "Escape") closeSearch();
      });
      els.mobileInput.addEventListener("focus", function () {
        lockIphoneViewportReflow();
      });
      els.mobileInput.addEventListener("blur", function () {
        unlockIphoneViewportReflow(320);
      });
    }
    if (els.deskInput) {
      els.deskInput.addEventListener("input", function(){
        var raw = "";
        try { raw = (els.deskInput.value || ""); } catch (e) {}
        state.query = raw.trim();
        if (state.searchActive) {
          state.searchActive = false;
          state.lastSearchQuery = "";
          state.searchId++;
          clearHighlight();
          state.sectionCounts = [];
          state.totalMatches = 0;
          state.sectionMatches = {};
          state.currentSectionIndex = null;
          state.currentLocalIndex = null;
          state.pendingHighlightCfi = null;
          state.matchList = [];
          state.matchIndex = -1;
          state.index = -1;
          state.searching = false;
          setCountText("0/0");
        }
        syncDesktopAction();
        refreshSearchUiVisibility();
      });
      els.deskInput.addEventListener("focus", function(){ refreshSearchUiVisibility(); });
      els.deskInput.addEventListener("keydown", function(e){
        if (e.key === "Escape") { clearInput(); return; }
        if (e.key === "Enter" || e.keyCode === 13) {
          e.preventDefault();
          var q = "";
          try { q = (els.deskInput && els.deskInput.value || "").trim(); } catch (e2) { q = ""; }
          if (!q) return;
          if (state.searchActive) return;
          state.searchActive = true;
          state.lastSearchQuery = q;
          state.searchStartCfi = getCurrentCfi();
          state.searchStartHref = getCurrentHref();
          state.excludeFootnotes = true;
          state.query = q;
          syncDesktopAction();
          refreshSearchUiVisibility();
          runSearch(q);
        }
      });
    }

    try {
      reader.rendition.on("rendered", function () {
        if (!state.searchActive || !state.pendingHighlightCfi) return;
        var item = null;
        try {
          if (state.matchList && state.matchIndex != null && state.matchIndex >= 0) {
            item = state.matchList[state.matchIndex] || null;
          }
        } catch (e0) {}
        if (!applyHighlightWithCorrection(state.pendingHighlightCfi, item)) {
          scheduleHighlightRetry(state.pendingHighlightCfi);
          return;
        }
      });
    } catch (e) {}

    // Initial state: hide nav until there is a query.
    refreshSearchUiVisibility();
    syncBookmarkIcon();
    observeBookmarkIcon();
    syncDesktopAction();
  }

  // -------- Selection toolbar (FBReader-like) --------
  function setupSelectionToolbar(reader) {
    if (!reader || !reader.rendition) return;
    var toolbar = document.getElementById("selectionToolbar");
    if (!toolbar) return;
    var dismiss = document.getElementById("selectionDismiss");
    if (!dismiss) {
      dismiss = document.createElement("div");
      dismiss.id = "selectionDismiss";
      document.body.appendChild(dismiss);
    }
    // Allow native long-press selection: disable the center tap capture layer.
    try {
      var tapCenter = document.getElementById("fb-tap-center");
      if (tapCenter) tapCenter.style.pointerEvents = "none";
    } catch (e) {}

    var state = {
      doc: null,
      range: null,
      text: "",
      cfi: null,
      href: null,
      ignoreSelectionChange: false,
      markNodes: [],
      locked: false,
      noteHighlightActive: false,
      dragSelecting: false
    };
    var notePendingCfi = null;

    function isTouchSelectionMode() {
      try {
        if (document.documentElement && document.documentElement.classList.contains("is-tablet")) return true;
      } catch (e0) {}
      try {
        var ua = (navigator && navigator.userAgent) ? navigator.userAgent : "";
        if (/Android/i.test(ua)) return true;
      } catch (e0a) {}
      try {
        if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
      } catch (e1) {}
      try {
        if (navigator && navigator.maxTouchPoints && navigator.maxTouchPoints > 0) return true;
      } catch (e2) {}
      try {
        if ("ontouchstart" in window) return true;
      } catch (e3) {}
      return !window.__fb_isDesktop;
    }

    function isDesktopSelectionMode() {
      try {
        if (!window.__fb_isDesktop) return false;
        if (isTouchSelectionMode()) return false;
        return true;
      } catch (e) {}
      return false;
    }

    function getCurrentCfi() {
      try {
        var loc = reader.rendition.currentLocation && reader.rendition.currentLocation();
        return loc && loc.start && loc.start.cfi;
      } catch (e) {}
      return window.__fb_last_cfi || null;
    }

    function getCurrentHref() {
      try {
        var loc = reader.rendition.currentLocation && reader.rendition.currentLocation();
        return loc && loc.start && loc.start.href;
      } catch (e) {}
      return null;
    }

    function getSelection(doc) {
      try {
        if (!doc) return null;
        if (doc.getSelection) return doc.getSelection();
        if (doc.defaultView && doc.defaultView.getSelection) return doc.defaultView.getSelection();
      } catch (e) {}
      return null;
    }

    function getContentsForDoc(doc) {
      try {
        if (!reader.rendition || typeof reader.rendition.getContents !== "function") return null;
        var list = reader.rendition.getContents();
        for (var i = 0; i < list.length; i++) {
          if (list[i] && list[i].document === doc) return list[i];
        }
      } catch (e) {}
      return null;
    }

    function clearSelection(doc) {
      try {
        var sel = getSelection(doc);
        if (sel && sel.removeAllRanges) sel.removeAllRanges();
      } catch (e) {}
    }

    function clearMarks() {
      if (!state.markNodes || !state.markNodes.length) return;
      for (var i = 0; i < state.markNodes.length; i++) {
        var span = state.markNodes[i];
        try {
          if (!span || !span.parentNode) continue;
          var txt = span.textContent || "";
          var tn = state.doc.createTextNode(txt);
          span.parentNode.replaceChild(tn, span);
          if (span.parentNode && span.parentNode.normalize) span.parentNode.normalize();
        } catch (e) {}
      }
      state.markNodes = [];
    }

    function applyMark(doc, range) {
      clearMarks();
      if (!doc || !range) return;
      var root = range.commonAncestorContainer;
      if (!root) return;
      var walker = null;
      var nodes = [];
      if (root.nodeType === 3) {
        nodes = [root];
      } else {
      try {
        var NF = doc.defaultView ? doc.defaultView.NodeFilter : NodeFilter;
        walker = doc.createTreeWalker(root, NF.SHOW_TEXT, {
          acceptNode: function (node) {
            if (!node || !node.nodeValue) return NF.FILTER_REJECT;
            try {
              if (range.intersectsNode) {
                if (!range.intersectsNode(node)) return NF.FILTER_REJECT;
              } else {
                var nr = doc.createRange();
                nr.selectNodeContents(node);
                if (range.compareBoundaryPoints(Range.END_TO_START, nr) <= 0) return NF.FILTER_REJECT;
                if (range.compareBoundaryPoints(Range.START_TO_END, nr) >= 0) return NF.FILTER_REJECT;
              }
            } catch (e) {}
            return NF.FILTER_ACCEPT;
          }
        });
      } catch (e) {}
      if (!walker) return;
      try {
        var n = walker.nextNode();
        while (n) { nodes.push(n); n = walker.nextNode(); }
      } catch (e2) {}
      }

      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        var text = node.nodeValue || "";
        var start = (node === range.startContainer) ? range.startOffset : 0;
        var end = (node === range.endContainer) ? range.endOffset : text.length;
        if (start < 0) start = 0;
        if (end > text.length) end = text.length;
        if (start >= end) continue;

        var before = text.slice(0, start);
        var middle = text.slice(start, end);
        var after = text.slice(end);

        var parent = node.parentNode;
        if (!parent) continue;
        var frag = doc.createDocumentFragment();
        if (before) frag.appendChild(doc.createTextNode(before));
        var mark = doc.createElement("span");
        mark.className = "fb-selection-mark";
        mark.textContent = middle;
        frag.appendChild(mark);
        if (after) frag.appendChild(doc.createTextNode(after));
        parent.replaceChild(frag, node);
        state.markNodes.push(mark);
      }
    }

    function setDismissActive(on) {
      if (!dismiss) return;
      dismiss.classList.toggle("active", !!on);
    }

    function hideToolbar() {
      toolbar.classList.add("hidden");
      toolbar.setAttribute("aria-hidden", "true");
      toolbar.style.visibility = "";
      setDismissActive(false);
    }

    function showToolbarAt(doc, range) {
      if (!doc || !range) return;
      var rect = null;
      try {
        var rects = range.getClientRects();
        for (var i = 0; i < rects.length; i++) {
          if (rects[i] && rects[i].width && rects[i].height) { rect = rects[i]; break; }
        }
        if (!rect) rect = range.getBoundingClientRect();
      } catch (e) {}
      if (!rect) return;
      showToolbarAtRect(doc, rect);
    }

    function showToolbarAtRect(doc, rect) {
      if (!doc || !rect) return;
      var frame = null;
      try { frame = doc.defaultView && doc.defaultView.frameElement; } catch (e) {}
      if (!frame || !frame.getBoundingClientRect) return;

      var frameRect = frame.getBoundingClientRect();
      var selLeft = frameRect.left + rect.left;
      var selRight = frameRect.left + rect.right;
      var selTop = frameRect.top + rect.top;
      var selBottom = frameRect.top + rect.bottom;
      var selCenterX = (selLeft + selRight) / 2;
      var selCenterY = (selTop + selBottom) / 2;

      toolbar.classList.remove("hidden");
      toolbar.setAttribute("aria-hidden", "false");
      toolbar.style.visibility = "hidden";
      toolbar.style.left = "0px";
      toolbar.style.top = "0px";

      var tbW = toolbar.offsetWidth || 0;
      var tbH = toolbar.offsetHeight || 0;
      var margin = 8;
      var gap = 8;
      var topBar = 0;
      var bottomBar = 0;
      try {
        topBar = (document.getElementById("titlebar") || document.getElementById("searchbar") || {}).offsetHeight || 0;
        bottomBar = (document.getElementById("bottombar") || {}).offsetHeight || 0;
      } catch (e0) {}
      var boundsPrimary = {
        left: margin,
        right: Math.max(margin, window.innerWidth - margin),
        top: Math.max(margin, topBar + margin),
        bottom: Math.max(margin, window.innerHeight - bottomBar - margin)
      };
      var boundsFallback = {
        left: margin,
        right: Math.max(margin, window.innerWidth - margin),
        top: margin,
        bottom: Math.max(margin, window.innerHeight - margin)
      };

      function pickPosition(bounds) {
        var candidates = [];
        function clamp(val, min, max) {
          if (val < min) return min;
          if (val > max) return max;
          return val;
        }
        function addCandidate(x, y) {
          if (!tbW || !tbH) return;
          var maxX = bounds.right - tbW;
          var maxY = bounds.bottom - tbH;
          var minX = bounds.left;
          var minY = bounds.top;
          if (maxX < minX) maxX = minX;
          if (maxY < minY) maxY = minY;
          x = clamp(Math.round(x), minX, maxX);
          y = clamp(Math.round(y), minY, maxY);
          var overlaps = !(x + tbW <= selLeft || x >= selRight || y + tbH <= selTop || y >= selBottom);
          if (overlaps) return;
          var dx = Math.max(0, selLeft - (x + tbW), x - selRight);
          var dy = Math.max(0, selTop - (y + tbH), y - selBottom);
          candidates.push({ x: x, y: y, d: dx + dy });
        }

        addCandidate(selRight + gap, selCenterY - tbH / 2);
        addCandidate(selLeft - tbW - gap, selCenterY - tbH / 2);
        addCandidate(selCenterX - tbW / 2, selTop - tbH - gap);
        addCandidate(selCenterX - tbW / 2, selBottom + gap);

        if (!candidates.length) return null;
        candidates.sort(function (a, b) { return a.d - b.d; });
        return candidates[0];
      }

      var pos = pickPosition(boundsPrimary) || pickPosition(boundsFallback);
      if (!pos) {
        var yTop = Math.round(selTop - tbH - gap);
        var yBottom = Math.round(selBottom + gap);
        var finalY = yTop;
        if (yTop < boundsFallback.top) finalY = yBottom;
        if (finalY + tbH > boundsFallback.bottom) finalY = boundsFallback.top;
        var finalX = Math.round(selCenterX - tbW / 2);
        var minX = boundsFallback.left;
        var maxX = boundsFallback.right - tbW;
        if (maxX < minX) maxX = minX;
        if (finalX < minX) finalX = minX;
        if (finalX > maxX) finalX = maxX;
        pos = { x: finalX, y: finalY };
      }

      toolbar.style.left = pos.x + "px";
      toolbar.style.top = pos.y + "px";
      toolbar.style.visibility = "visible";
      setDismissActive(!state.dragSelecting);
    }

    function getMarkRect(doc) {
      if (!state.markNodes || !state.markNodes.length) return null;
      var rect = null;
      for (var i = 0; i < state.markNodes.length; i++) {
        var node = state.markNodes[i];
        if (!node || !node.getClientRects) continue;
        var rects = node.getClientRects();
        for (var j = 0; j < rects.length; j++) {
          var r = rects[j];
          if (!r || !r.width || !r.height) continue;
          if (!rect) {
            rect = { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
          } else {
            rect.left = Math.min(rect.left, r.left);
            rect.right = Math.max(rect.right, r.right);
            rect.top = Math.min(rect.top, r.top);
            rect.bottom = Math.max(rect.bottom, r.bottom);
          }
        }
      }
      if (rect) {
        rect.width = rect.right - rect.left;
        rect.height = rect.bottom - rect.top;
      }
      return rect;
    }

    function updateFromSelection(doc) {
      if (!isDesktopSelectionMode()) return;
      var sel = getSelection(doc);
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        if (state.ignoreSelectionChange || state.locked) return;
        clearMarks();
        state.doc = null;
        state.range = null;
        state.text = "";
        state.cfi = null;
        state.href = null;
        hideToolbar();
        return;
      }

      var text = "";
      try {
        text = sel.toString();
        text = text.replace(/^\\s+/, "").replace(/\\s+$/, "");
      } catch (e) {}
      if (!text) {
        hideToolbar();
        return;
      }

      var range = null;
      try { range = sel.getRangeAt(0).cloneRange(); } catch (e) {}
      if (!range) {
        hideToolbar();
        return;
      }

      var cfi = null;
      var href = null;
      try {
        var contents = getContentsForDoc(doc);
        if (contents && contents.cfiFromRange) cfi = contents.cfiFromRange(range);
        if (contents && contents.section && contents.section.href) href = contents.section.href;
      } catch (e) {}

      state.doc = doc;
      state.range = range;
      state.text = text;
      state.cfi = cfi;
      state.href = href;

      // Desktop: use native selection highlight.
      showToolbarAt(doc, range);
    }

    function commitSelection(doc) {
      if (!isDesktopSelectionMode()) return;
      try {
        var sel = getSelection(doc);
        if (!sel || sel.isCollapsed || !sel.rangeCount) return;
        var range = sel.getRangeAt(0).cloneRange();
        var text = "";
        try {
          text = sel.toString();
          text = text.replace(/^\s+/, "").replace(/\s+$/, "");
        } catch (e) {}
        if (!text) return;

        var cfi = null;
        var href = null;
        try {
          var contents = getContentsForDoc(doc);
          if (contents && contents.cfiFromRange) cfi = contents.cfiFromRange(range);
          if (contents && contents.section && contents.section.href) href = contents.section.href;
        } catch (e2) {}

        state.doc = doc;
        state.range = range;
        state.text = text;
        state.cfi = cfi;
        state.href = href;

        showToolbarAt(doc, range);
        state.locked = true;
        window.__fbSelectionActive = true;
      } catch (e0) {}
    }

    function scheduleUpdate(doc) {
      if (!doc) return;
      if (doc.__fbSelToolbarTimer) {
        try { clearTimeout(doc.__fbSelToolbarTimer); } catch (e) {}
      }
      doc.__fbSelToolbarTimer = setTimeout(function () {
        doc.__fbSelToolbarTimer = null;
        updateFromSelection(doc);
      }, 20);
    }

    function attachToDoc(doc) {
      if (!doc || doc.__fbSelToolbarAttached) return;
      doc.__fbSelToolbarAttached = true;

      // Touch input must use custom long-press selection even if viewport was classified as desktop.
      var isMobile = isTouchSelectionMode();
      if (isMobile) {
        try {
          if (doc.documentElement && doc.documentElement.style) {
            doc.documentElement.style.webkitUserSelect = "none";
            doc.documentElement.style.userSelect = "none";
            doc.documentElement.style.webkitTouchCallout = "none";
          }
          if (doc.body && doc.body.style) {
            doc.body.style.webkitUserSelect = "none";
            doc.body.style.userSelect = "none";
            doc.body.style.webkitTouchCallout = "none";
          }
        } catch (e) {}
      }

      try {
        if (!doc.getElementById("__fb_selection_css")) {
          var st = doc.createElement("style");
          st.id = "__fb_selection_css";
          st.textContent = ".fb-selection-mark{background:#61c2fa;color:inherit;-webkit-box-decoration-break:clone;box-decoration-break:clone;}";
          doc.head && doc.head.appendChild(st);
        }
      } catch (e) {}
      if (isMobile) {
        try {
          if (!doc.getElementById("__fb_disable_native_select")) {
            var st2 = doc.createElement("style");
            st2.id = "__fb_disable_native_select";
            st2.textContent = "html,body,*{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;}";
            doc.head && doc.head.appendChild(st2);
          }
        } catch (e2) {}
      }

      try { doc.addEventListener("selectionchange", function () {
        if (isDesktopSelectionMode()) return;
        if (!state.ignoreSelectionChange && !state.locked) scheduleUpdate(doc);
      }, true); } catch (e) {}
      try { doc.addEventListener("pointerup", function () { commitSelection(doc); }, true); } catch (e) {}
      try { doc.addEventListener("mouseup", function () { commitSelection(doc); }, true); } catch (e) {}
      try { doc.addEventListener("keyup", function () { scheduleUpdate(doc); }, true); } catch (e) {}
      try { doc.addEventListener("pointerdown", function () { if (state.locked) hideAndClear(); state.locked = false; }, true); } catch (e) {}
      try { doc.addEventListener("touchstart", function () { if (state.locked) hideAndClear(); state.locked = false; }, true); } catch (e) {}
      try { doc.addEventListener("mousedown", function () { if (state.locked) hideAndClear(); state.locked = false; }, true); } catch (e) {}

      if (isMobile) {
        var preventNative = function (e) {
          try { if (e && e.preventDefault) e.preventDefault(); } catch (e2) {}
          try { if (e && e.stopPropagation) e.stopPropagation(); } catch (e3) {}
        };
        try { doc.addEventListener("selectstart", preventNative, true); } catch (e) {}
        try { doc.addEventListener("selectionstart", preventNative, true); } catch (e) {}
      }

      if (!isMobile) return;

      bindGlobalSelectionBlockers(doc, true);

      var lpTimer = null;
      var lpActive = false;
      var lpStartX = 0;
      var lpStartY = 0;
      var lpLastX = 0;
      var lpLastY = 0;
      var lpAnchorRange = null;
      var lpAnchorRect = null;
      var lpDir = 0;

      function getTextNodeAt(node, offset) {
        try {
          if (!node) return null;
          if (node.nodeType === 3) return node;
          var child = node.childNodes && node.childNodes[offset] ? node.childNodes[offset] : null;
          if (!child) child = node;
          var NF = doc.defaultView ? doc.defaultView.NodeFilter : NodeFilter;
          var walker = doc.createTreeWalker(child, NF.SHOW_TEXT, null);
          return walker.nextNode();
        } catch (e) {}
        return null;
      }

      function rangeFromPoint(x, y) {
        var r = null;
        try {
          if (doc.caretPositionFromPoint) {
            var pos = doc.caretPositionFromPoint(x, y);
            if (pos && pos.offsetNode) {
              r = doc.createRange();
              r.setStart(pos.offsetNode, pos.offset);
              r.setEnd(pos.offsetNode, pos.offset);
            }
          } else if (doc.caretRangeFromPoint) {
            r = doc.caretRangeFromPoint(x, y);
          }
        } catch (e) {}

        var el = null;
        try { el = doc.elementFromPoint ? doc.elementFromPoint(x, y) : null; } catch (e2) {}

        function findTextNodeAtPoint(root) {
          if (!root) return null;
          var NF = doc.defaultView ? doc.defaultView.NodeFilter : NodeFilter;
          var walker = doc.createTreeWalker(root, NF.SHOW_TEXT, null);
          var tn = null;
          while (walker && (tn = walker.nextNode())) {
            var tr = doc.createRange();
            tr.selectNodeContents(tn);
            var rects = tr.getClientRects();
            for (var i = 0; i < rects.length; i++) {
              var rr = rects[i];
              if (rr && y >= rr.top && y <= rr.bottom && x >= rr.left && x <= rr.right) {
                return tn;
              }
            }
          }
          return null;
        }

        function offsetInTextNode(tn) {
          try {
            var text = tn.nodeValue || "";
            var lo = 0, hi = text.length;
            while (lo < hi) {
              var mid = Math.floor((lo + hi) / 2);
              var rrng = doc.createRange();
              rrng.setStart(tn, 0);
              rrng.setEnd(tn, mid);
              var rs = rrng.getClientRects();
              var rPick = null;
              for (var j = 0; j < rs.length; j++) {
                var rj = rs[j];
                if (rj && y >= rj.top && y <= rj.bottom) { rPick = rj; break; }
              }
              if (!rPick) {
                lo = mid + 1;
              } else if (x > rPick.right) {
                lo = mid + 1;
              } else {
                hi = mid;
              }
            }
            return lo;
          } catch (e3) {}
          return 0;
        }

        if (!r || (r.startContainer && r.startContainer.nodeType !== 3)) {
          var root = el || (doc.body || doc.documentElement);
          var tn = findTextNodeAtPoint(root);
          if (tn) {
            var off = offsetInTextNode(tn);
            r = doc.createRange();
            r.setStart(tn, Math.min(off, tn.nodeValue ? tn.nodeValue.length : 0));
            r.setEnd(tn, Math.min(off, tn.nodeValue ? tn.nodeValue.length : 0));
          }
        }

        if (!r) return null;
        try {
          var pad = 0;
          var hit = false;
          var rects = null;
          try { rects = r.getClientRects(); } catch (e0) { rects = null; }
          if (rects && rects.length) {
            for (var k = 0; k < rects.length; k++) {
              var rr0 = rects[k];
              if (!rr0) continue;
              if (x >= rr0.left - pad && x <= rr0.right + pad && y >= rr0.top - pad && y <= rr0.bottom + pad) { hit = true; break; }
            }
          }
          if (!hit && r.startContainer && r.startContainer.nodeType === 3) {
            var tn0 = r.startContainer;
            var off0 = r.startOffset;
            var tr0 = doc.createRange();
            if (off0 < (tn0.nodeValue ? tn0.nodeValue.length : 0)) {
              tr0.setStart(tn0, off0);
              tr0.setEnd(tn0, off0 + 1);
              var rects0 = tr0.getClientRects();
              for (var m = 0; m < rects0.length; m++) {
                var rr1 = rects0[m];
                if (rr1 && x >= rr1.left - pad && x <= rr1.right + pad && y >= rr1.top - pad && y <= rr1.bottom + pad) { hit = true; break; }
              }
            }
            if (!hit && off0 > 0) {
              tr0.setStart(tn0, off0 - 1);
              tr0.setEnd(tn0, off0);
              var rects1 = tr0.getClientRects();
              for (var n = 0; n < rects1.length; n++) {
                var rr2 = rects1[n];
                if (rr2 && x >= rr2.left - pad && x <= rr2.right + pad && y >= rr2.top - pad && y <= rr2.bottom + pad) { hit = true; break; }
              }
            }
          }
          if (!hit) return null;
        } catch (e3) {}
        return r;
      }

      function expandToWord(r, x, y) {
        if (!r) return null;
        var node = r.startContainer;
        if (!node || node.nodeType !== 3) return r;
        var text = node.nodeValue || "";
        var idx = r.startOffset;
        if (idx >= text.length && idx > 0) idx = text.length - 1;
        var start = idx;
        var end = idx;
        var isSpace = function (ch) { return /\s/.test(ch); };
        if (isSpace(text.charAt(start))) return null;
        while (start > 0 && !isSpace(text.charAt(start - 1))) start--;
        while (end < text.length && !isSpace(text.charAt(end))) end++;
        var rr = doc.createRange();
        rr.setStart(node, start);
        rr.setEnd(node, end);
        if (typeof x === "number" && typeof y === "number") {
          try {
            var rects = rr.getClientRects();
            var hit = false;
            var pad = 0;
            for (var i = 0; i < rects.length; i++) {
              var rc = rects[i];
              if (!rc) continue;
              if (x >= rc.left - pad && x <= rc.right + pad && y >= rc.top - pad && y <= rc.bottom + pad) {
                hit = true;
                break;
              }
            }
            if (!hit) return null;
          } catch (e0) { return null; }
        }
        return rr;
      }

      function rectFromRange(rng) {
        if (!rng) return null;
        var rect = null;
        try {
          var rects = rng.getClientRects();
          for (var i = 0; i < rects.length; i++) {
            var r = rects[i];
            if (!r || !r.width || !r.height) continue;
            if (!rect) {
              rect = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
            } else {
              rect.left = Math.min(rect.left, r.left);
              rect.right = Math.max(rect.right, r.right);
              rect.top = Math.min(rect.top, r.top);
              rect.bottom = Math.max(rect.bottom, r.bottom);
            }
          }
        } catch (e0) {}
        return rect;
      }

      function makeRangeBetween(a, b) {
        if (!a || !b) return null;
        var rr = doc.createRange();
        try {
          if (a.compareBoundaryPoints(Range.START_TO_START, b) <= 0) {
            rr.setStart(a.startContainer, a.startOffset);
            rr.setEnd(b.endContainer, b.endOffset);
          } else {
            rr.setStart(b.startContainer, b.startOffset);
            rr.setEnd(a.endContainer, a.endOffset);
          }
        } catch (e) {
          return null;
        }
        return rr;
      }

    function applyCustomSelection(range, showToolbar) {
      if (!range) return;
      state.doc = doc;
      state.range = range;
      state.text = (range.toString() || "").replace(/^\s+/, "").replace(/\s+$/, "");
      if (!state.text) return;
      try {
        var contents = getContentsForDoc(doc);
        if (contents && contents.cfiFromRange) state.cfi = contents.cfiFromRange(range);
        if (contents && contents.section && contents.section.href) state.href = contents.section.href;
      } catch (e) {}
      applyMark(doc, range);
      if (showToolbar) {
        var mrect = getMarkRect(doc);
        if (mrect) {
          showToolbarAtRect(doc, mrect);
        } else {
          showToolbarAt(doc, range);
          setTimeout(function () {
            var m2 = getMarkRect(doc);
            if (m2) showToolbarAtRect(doc, m2);
          }, 0);
        }
      }
      state.locked = true;
      window.__fbSelectionActive = true;
    }

    function showToolbarForCurrentSelection() {
      if (!state.doc || !state.range || !state.text) return;
      var mrect = getMarkRect(state.doc);
      if (mrect) {
        showToolbarAtRect(state.doc, mrect);
      } else {
        showToolbarAt(state.doc, state.range);
      }
    }

      function clearLongPress() {
        if (lpTimer) {
          try { clearTimeout(lpTimer); } catch (e) {}
          lpTimer = null;
        }
        lpActive = false;
        lpAnchorRange = null;
        lpAnchorRect = null;
        lpDir = 0;
      }

      function onTouchStart(e) {
        if (!e || !e.touches || !e.touches[0]) return;
        try { if (e.cancelable && e.preventDefault) e.preventDefault(); } catch (e0) {}
        try { if (e.stopImmediatePropagation) e.stopImmediatePropagation(); } catch (e1) {}
        try { if (e.stopPropagation) e.stopPropagation(); } catch (e2) {}
        lpStartX = e.touches[0].clientX;
        lpStartY = e.touches[0].clientY;
        lpLastX = lpStartX;
        lpLastY = lpStartY;
        clearLongPress();
        lpTimer = setTimeout(function () {
          lpTimer = null;
          lpActive = true;
          state.dragSelecting = true;
          try {
            window.__fbSelDragActive = true;
            doc.__fbSelDragActive = true;
          } catch (e1) {}
          setDismissActive(false);
          var base = rangeFromPoint(lpStartX, lpStartY);
          var word = expandToWord(base, lpStartX, lpStartY);
          lpAnchorRange = word;
          lpAnchorRect = rectFromRange(word);
          lpDir = 0;
          if (word) applyCustomSelection(word, false);
        }, 500);
      }

      function onTouchMove(e) {
        if (!e || !e.touches || !e.touches[0]) return;
        var x = e.touches[0].clientX;
        var y = e.touches[0].clientY;
        if (!lpActive) {
          if (Math.abs(x - lpStartX) > 16 || Math.abs(y - lpStartY) > 16) clearLongPress();
          return;
        }
        try { e.preventDefault(); } catch (e0) {}
        try { if (e.stopImmediatePropagation) e.stopImmediatePropagation(); } catch (e1) {}
        try { if (e.stopPropagation) e.stopPropagation(); } catch (e2) {}
        var curr = expandToWord(rangeFromPoint(x, y), x, y);
        if (!curr || !lpAnchorRange) return;
        try {
          var cmp = curr.compareBoundaryPoints(Range.START_TO_START, lpAnchorRange);
          if (lpAnchorRect) {
            var pad = 6;
            if (lpDir === 0) {
              if (y > lpAnchorRect.bottom + pad || x > lpAnchorRect.right + pad) lpDir = 1;
              else if (y < lpAnchorRect.top - pad || x < lpAnchorRect.left - pad) lpDir = -1;
            }
          }
          if (lpDir === 1 && cmp < 0) return;
          if (lpDir === -1 && cmp > 0) return;
          if (lpDir === 0 && cmp !== 0) return;
        } catch (eCmp) {}
        var combined = makeRangeBetween(lpAnchorRange, curr);
        if (combined) {
          applyCustomSelection(combined, false);
          lpLastX = x;
          lpLastY = y;
        }
      }

      function onTouchEnd(e) {
        if (lpTimer) clearLongPress();
        if (lpActive) {
          try { e.preventDefault(); } catch (e0) {}
          lpActive = false;
          state.dragSelecting = false;
          try {
            window.__fbSelDragActive = false;
            doc.__fbSelDragActive = false;
          } catch (e1) {}
          if (state.locked) {
            showToolbarForCurrentSelection();
            setDismissActive(true);
          }
        }
      }

      try { doc.addEventListener("touchstart", onTouchStart, { passive: false, capture: true }); } catch (e) {}
      try { doc.addEventListener("touchmove", onTouchMove, { passive: false, capture: true }); } catch (e) {}
      try { doc.addEventListener("touchend", onTouchEnd, { passive: false, capture: true }); } catch (e) {}
      try { doc.addEventListener("pointermove", function(e){
        if (!lpActive) return;
        try { e.preventDefault(); } catch (e0) {}
        try { if (e.stopImmediatePropagation) e.stopImmediatePropagation(); } catch (e1) {}
        try { if (e.stopPropagation) e.stopPropagation(); } catch (e2) {}
      }, { passive: false, capture: true }); } catch (e) {}
    }

    function hideAndClear() {
      hideToolbar();
      clearMarks();
      if (state.doc) clearSelection(state.doc);
      state.doc = null;
      state.range = null;
      state.text = "";
      state.cfi = null;
      state.href = null;
      state.locked = false;
      state.noteHighlightActive = false;
      state.dragSelecting = false;
      try {
        window.__fbSelDragActive = false;
        if (state.doc) state.doc.__fbSelDragActive = false;
      } catch (e) {}
      window.__fbSelectionActive = false;
    }

    window.__fbClearSelectionToolbar = function () {
      try { hideAndClear(); } catch (e) {}
    };

    if (dismiss && !dismiss.__fbBound) {
      dismiss.__fbBound = true;
      var cancelOnly = function (e) {
        try {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
        } catch (e0) {}
        return false;
      };
      var isToolbarEvent = function (e) {
        try {
          if (!toolbar || toolbar.classList.contains("hidden")) return false;
          if (e && e.target && toolbar.contains(e.target)) return true;
          var pt = null;
          try {
            if (e && e.touches && e.touches[0]) pt = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            else if (e && e.changedTouches && e.changedTouches[0]) pt = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
            else if (e && typeof e.clientX === "number" && typeof e.clientY === "number") pt = { x: e.clientX, y: e.clientY };
          } catch (e1) {}
          if (!pt) return false;
          var r = toolbar.getBoundingClientRect();
          return pt.x >= r.left && pt.x <= r.right && pt.y >= r.top && pt.y <= r.bottom;
        } catch (e0) {}
        return false;
      };
      var cancelAndClear = function (e) {
        if (isToolbarEvent(e)) return false;
        cancelOnly(e);
        hideAndClear();
        return false;
      };
      dismiss.addEventListener("pointerdown", cancelAndClear, { capture: true });
      dismiss.addEventListener("touchstart", cancelAndClear, { capture: true });
      dismiss.addEventListener("click", cancelAndClear, { capture: true });
      dismiss.addEventListener("pointermove", cancelOnly, { capture: true });
      dismiss.addEventListener("touchmove", cancelOnly, { capture: true });
    }

    function bindGlobalSelectionBlockers(doc, isIframe) {
      if (!doc || doc.__fbSelBlockers) return;
      doc.__fbSelBlockers = true;
      var activePointerId = null;
      var activeTouchId = null;
      function isActive() {
        try {
          if (isIframe && doc.defaultView && doc.defaultView.parent) {
            return !!doc.defaultView.parent.__fbSelectionActive;
          }
        } catch (e) {}
        return !!window.__fbSelectionActive;
      }
      function isToolbarTarget(t) {
        if (isIframe) return false;
        try {
          var el = t && (t.nodeType === 1 ? t : t.parentNode);
          while (el) {
            if (el.id === "selectionToolbar") return true;
            try {
              if (el.classList && el.classList.contains("selection-toolbar")) return true;
            } catch (e0) {}
            el = el.parentNode;
          }
        } catch (e) {}
        return false;
      }
      function eventPoint(e) {
        try {
          if (!e) return null;
          if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
          if (e.changedTouches && e.changedTouches[0]) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
          if (typeof e.clientX === "number" && typeof e.clientY === "number") return { x: e.clientX, y: e.clientY };
        } catch (e0) {}
        return null;
      }
      function isToolbarHit(e) {
        if (isIframe) return false;
        try {
          if (!toolbar || toolbar.classList.contains("hidden")) return false;
          if (isToolbarTarget(e && e.target)) return true;
          var pt = eventPoint(e);
          if (!pt) return false;
          var r = toolbar.getBoundingClientRect();
          return pt.x >= r.left && pt.x <= r.right && pt.y >= r.top && pt.y <= r.bottom;
        } catch (e1) {}
        return false;
      }
      function isDragSelecting() {
        try { if (doc.__fbSelDragActive) return true; } catch (e0) {}
        try {
          var topWin = (doc.defaultView && doc.defaultView.parent) ? doc.defaultView.parent : window;
          return !!(topWin && topWin.__fbSelDragActive);
        } catch (e1) {}
        return false;
      }
      function stopAll(e) {
        try { if (e && e.preventDefault) e.preventDefault(); } catch (e1) {}
        try { if (e && e.stopImmediatePropagation) e.stopImmediatePropagation(); } catch (e2) {}
        try { if (e && e.stopPropagation) e.stopPropagation(); } catch (e2) {}
        return false;
      }
      function toolbarActionAtPoint(e) {
        if (isIframe) return null;
        try {
          if (!toolbar || toolbar.classList.contains("hidden")) return null;
          var pt = eventPoint(e);
          if (!pt) return null;
          var prevDismiss = null;
          if (dismiss) {
            prevDismiss = dismiss.style.pointerEvents;
            dismiss.style.pointerEvents = "none";
          }
          var el = document.elementFromPoint(pt.x, pt.y);
          if (dismiss) dismiss.style.pointerEvents = prevDismiss;
          if (!el || !toolbar.contains(el)) return null;
          return toolbarActionFromEvent({ target: el });
        } catch (e0) {}
        return null;
      }
      function onPointerDown(e) {
        if (!isActive()) return;
        var act = toolbarActionAtPoint(e);
        if (act) {
          handleAction(act);
          return stopAll(e);
        }
        if (isToolbarHit(e)) return;
        activePointerId = e && typeof e.pointerId !== "undefined" ? e.pointerId : "p";
        hideAndClear();
        return stopAll(e);
      }
      function onPointerMove(e) {
        if (isToolbarHit(e)) return;
        if (isDragSelecting()) return;
        if (!activePointerId) {
          if (!isActive()) return;
          activePointerId = e && typeof e.pointerId !== "undefined" ? e.pointerId : "p";
        } else if (e && typeof e.pointerId !== "undefined" && activePointerId !== e.pointerId) {
          return;
        }
        return stopAll(e);
      }
      function onPointerUp(e) {
        if (!activePointerId) return;
        if (e && typeof e.pointerId !== "undefined" && activePointerId !== e.pointerId) return;
        activePointerId = null;
        return stopAll(e);
      }
      function onTouchStart(e) {
        if (!isActive()) return;
        var act = toolbarActionAtPoint(e);
        if (act) {
          handleAction(act);
          return stopAll(e);
        }
        if (isToolbarHit(e)) return;
        try {
          var t = e.touches && e.touches[0];
          activeTouchId = t ? t.identifier : "t";
        } catch (e0) { activeTouchId = "t"; }
        hideAndClear();
        return stopAll(e);
      }
      function onTouchMove(e) {
        if (isToolbarHit(e)) return;
        if (isDragSelecting()) return;
        if (activeTouchId == null) {
          if (!isActive()) return;
          try {
            var t = e.touches && e.touches[0];
            activeTouchId = t ? t.identifier : "t";
          } catch (e0) { activeTouchId = "t"; }
        }
        return stopAll(e);
      }
      function onTouchEnd(e) {
        if (activeTouchId == null) return;
        activeTouchId = null;
        return stopAll(e);
      }
      try {
        doc.addEventListener("pointerdown", onPointerDown, { capture: true });
        doc.addEventListener("pointermove", onPointerMove, { capture: true });
        doc.addEventListener("pointerup", onPointerUp, { capture: true });
      } catch (e) {}
      try {
        doc.addEventListener("touchstart", onTouchStart, { capture: true, passive: false });
        doc.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
        doc.addEventListener("touchend", onTouchEnd, { capture: true, passive: false });
        doc.addEventListener("touchcancel", onTouchEnd, { capture: true, passive: false });
      } catch (e2) {}
    }

    bindGlobalSelectionBlockers(document, false);

    function highlightNoteCfi(cfi) {
      if (!cfi || !reader || !reader.rendition || typeof reader.rendition.getContents !== "function") return false;
      var list = reader.rendition.getContents();
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (!c || !c.document || typeof c.range !== "function") continue;
        var r = null;
        try { r = c.range(cfi); } catch (e0) { r = null; }
        if (!r) continue;
        state.doc = c.document;
        state.range = r;
        state.text = "";
        state.cfi = cfi;
        applyMark(state.doc, r);
        var mrect = getMarkRect(state.doc);
        if (mrect) {
          try { showToolbarAtRect(state.doc, mrect); } catch (e2) {}
          hideToolbar();
        }
        hideToolbar();
        try { clearSelection(state.doc); } catch (e1) {}
        state.locked = true;
        state.noteHighlightActive = true;
        window.__fbSelectionActive = false;
        return true;
      }
      return false;
    }

    window.__fbShowNoteHighlight = function (cfi, deferOnly) {
      notePendingCfi = cfi || null;
      if (!notePendingCfi) return;
      if (deferOnly) return;
      var tryCount = 0;
      var tryOnce = function () {
        if (!notePendingCfi) return;
        if (highlightNoteCfi(notePendingCfi)) {
          notePendingCfi = null;
          return;
        }
        tryCount++;
        if (tryCount < 6) setTimeout(tryOnce, 80);
      };
      tryOnce();
    };

    var TRANSLATE_LANG_KEY = "readerpub:translate:targetLang";
    var TRANSLATE_LANGS = [
      ["en", "English"],
      ["es", "Spanish"],
      ["fr", "French"],
      ["de", "German"],
      ["it", "Italian"],
      ["pt", "Portuguese"],
      ["uk", "Ukrainian"],
      ["ru", "Russian"],
      ["pl", "Polish"],
      ["nl", "Dutch"],
      ["tr", "Turkish"],
      ["ar", "Arabic"],
      ["hi", "Hindi"],
      ["zh", "Chinese"],
      ["ja", "Japanese"],
      ["ko", "Korean"]
    ];
    var translateUi = {
      root: null,
      source: null,
      result: null,
      status: null,
      langSelect: null,
      copyBtn: null,
      text: "",
      requestId: 0,
      abortController: null,
      escBound: false
    };

    function normalizeTranslateLang(lang) {
      var val = (lang || "").toLowerCase().trim();
      if (!val) return "en";
      for (var i = 0; i < TRANSLATE_LANGS.length; i++) {
        if (TRANSLATE_LANGS[i][0] === val) return val;
      }
      return "en";
    }

    function detectTranslateLang() {
      var candidate = "en";
      try {
        candidate = (navigator.language || "en").split("-")[0].toLowerCase();
      } catch (e) {}
      return normalizeTranslateLang(candidate);
    }

    function getTranslateTargetLang() {
      try {
        var saved = localStorage.getItem(TRANSLATE_LANG_KEY);
        if (saved) return normalizeTranslateLang(saved);
      } catch (e) {}
      return detectTranslateLang();
    }

    function setTranslateTargetLang(lang) {
      var normalized = normalizeTranslateLang(lang);
      try { localStorage.setItem(TRANSLATE_LANG_KEY, normalized); } catch (e) {}
      return normalized;
    }

    function copyTextFallback(value) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(value);
          return;
        }
      } catch (e0) {}
      try {
        var ta = document.createElement("textarea");
        ta.value = value || "";
        ta.setAttribute("readonly", "true");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } catch (e1) {}
        document.body.removeChild(ta);
      } catch (e2) {}
    }

    function normalizeTranslateInput(text) {
      var s = String(text || "");
      if (!s) return "";
      s = s.replace(/\u00ad/g, "");
      s = s.replace(/\r\n?/g, "\n");
      s = s.replace(/[ \t\u00a0]+\n/g, "\n");
      s = s.replace(/\n[ \t\u00a0]+/g, "\n");
      s = s.replace(/\n{3,}/g, "\n\n");
      s = s.replace(/([^\n])\n([^\n])/g, "$1 $2");
      s = s.replace(/[ \t]{2,}/g, " ");
      return s.trim();
    }

    function setTranslateStatus(message, isError) {
      if (!translateUi.status) return;
      translateUi.status.textContent = message || "";
      translateUi.status.classList.toggle("is-error", !!isError);
    }

    function closeTranslateDialog() {
      try {
        if (translateUi.abortController) {
          try { translateUi.abortController.abort(); } catch (e0) {}
          translateUi.abortController = null;
        }
      } catch (e1) {}
      translateUi.requestId++;
      if (translateUi.root) translateUi.root.classList.add("hidden");
    }

    function ensureTranslateDialog() {
      if (translateUi.root) return;

      var root = document.createElement("div");
      root.id = "selectionTranslate";
      root.className = "selection-translate hidden";
      root.setAttribute("role", "dialog");
      root.setAttribute("aria-modal", "true");
      root.setAttribute("aria-label", "Translate");

      var panel = document.createElement("div");
      panel.className = "selection-translate-panel";
      root.appendChild(panel);

      var head = document.createElement("div");
      head.className = "selection-translate-head";
      panel.appendChild(head);

      var title = document.createElement("div");
      title.className = "selection-translate-title";
      title.textContent = "Translate";
      head.appendChild(title);

      var closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "selection-translate-close";
      closeBtn.setAttribute("aria-label", "Close");
      closeBtn.textContent = "✕";
      head.appendChild(closeBtn);

      var targetRow = document.createElement("div");
      targetRow.className = "selection-translate-target";
      panel.appendChild(targetRow);

      var targetLabel = document.createElement("label");
      targetLabel.className = "selection-translate-target-label";
      targetLabel.textContent = "Translate to";
      targetRow.appendChild(targetLabel);

      var langSelect = document.createElement("select");
      langSelect.className = "selection-translate-select";
      for (var i = 0; i < TRANSLATE_LANGS.length; i++) {
        var pair = TRANSLATE_LANGS[i];
        var opt = document.createElement("option");
        opt.value = pair[0];
        opt.textContent = pair[1];
        langSelect.appendChild(opt);
      }
      targetRow.appendChild(langSelect);

      var sourceLabel = document.createElement("div");
      sourceLabel.className = "selection-translate-label";
      sourceLabel.textContent = "Selected text";
      panel.appendChild(sourceLabel);

      var sourceBox = document.createElement("div");
      sourceBox.className = "selection-translate-source";
      panel.appendChild(sourceBox);

      var resultLabel = document.createElement("div");
      resultLabel.className = "selection-translate-label";
      resultLabel.textContent = "Translation";
      panel.appendChild(resultLabel);

      var resultBox = document.createElement("div");
      resultBox.className = "selection-translate-result";
      panel.appendChild(resultBox);

      var status = document.createElement("div");
      status.className = "selection-translate-status";
      panel.appendChild(status);

      var actions = document.createElement("div");
      actions.className = "selection-translate-actions";
      panel.appendChild(actions);

      var copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "selection-translate-btn";
      copyBtn.textContent = "Copy";
      copyBtn.disabled = true;
      actions.appendChild(copyBtn);

      var doneBtn = document.createElement("button");
      doneBtn.type = "button";
      doneBtn.className = "selection-translate-btn primary";
      doneBtn.textContent = "Done";
      actions.appendChild(doneBtn);

      document.body.appendChild(root);

      translateUi.root = root;
      translateUi.source = sourceBox;
      translateUi.result = resultBox;
      translateUi.status = status;
      translateUi.langSelect = langSelect;
      translateUi.copyBtn = copyBtn;

      langSelect.value = getTranslateTargetLang();

      root.addEventListener("click", function (e) {
        if (e && e.target === root) closeTranslateDialog();
      });
      panel.addEventListener("click", function (e) {
        try { e.stopPropagation(); } catch (e0) {}
      });
      closeBtn.addEventListener("click", closeTranslateDialog);
      doneBtn.addEventListener("click", closeTranslateDialog);
      copyBtn.addEventListener("click", function () {
        var out = "";
        try { out = (translateUi.result && translateUi.result.textContent) || ""; } catch (e0) {}
        if (!out) return;
        copyTextFallback(out);
      });
      langSelect.addEventListener("change", function () {
        if (!translateUi.text) return;
        requestTranslation();
      });

      if (!translateUi.escBound) {
        translateUi.escBound = true;
        document.addEventListener("keydown", function (e) {
          try {
            if (!e || e.key !== "Escape") return;
            if (!translateUi.root || translateUi.root.classList.contains("hidden")) return;
            e.preventDefault();
            closeTranslateDialog();
          } catch (e0) {}
        });
      }
    }

    function requestTranslation() {
      if (!translateUi.root || translateUi.root.classList.contains("hidden")) return;
      var sourceText = String(translateUi.text || "").trim();
      if (!sourceText) return;

      var lang = "en";
      try { lang = translateUi.langSelect ? translateUi.langSelect.value : "en"; } catch (e0) {}
      lang = setTranslateTargetLang(lang);
      if (translateUi.langSelect) translateUi.langSelect.value = lang;

      var requestId = ++translateUi.requestId;
      if (translateUi.abortController) {
        try { translateUi.abortController.abort(); } catch (e1) {}
      }
      translateUi.abortController = (typeof AbortController !== "undefined")
        ? new AbortController()
        : null;

      if (translateUi.copyBtn) translateUi.copyBtn.disabled = true;
      if (translateUi.result) translateUi.result.textContent = "";
      setTranslateStatus("Translating...", false);

      var timeoutId = null;
      if (translateUi.abortController) {
        timeoutId = setTimeout(function () {
          try { translateUi.abortController.abort(); } catch (e2) {}
        }, 14000);
      }

      var payload = JSON.stringify({
        text: sourceText,
        source: "auto",
        target: lang
      });
      var candidates = [];
      function pushCandidate(url) {
        if (!url) return;
        for (var i = 0; i < candidates.length; i++) {
          if (candidates[i] === url) return;
        }
        candidates.push(url);
      }
      try {
        var p = String((window.location && window.location.pathname) || "");
        if (p.indexOf("/books/") === 0) {
          pushCandidate("/books/api/translate");
          pushCandidate("/api/translate");
        } else {
          pushCandidate("/api/translate");
          pushCandidate("/books/api/translate");
        }
      } catch (ePath) {
        pushCandidate("/books/api/translate");
        pushCandidate("/api/translate");
      }

      function parseTranslateResponse(res) {
        return res.text().then(function (raw) {
          var data = null;
          try { data = raw ? JSON.parse(raw) : null; } catch (e3) { data = null; }
          return { res: res, data: data };
        });
      }

      function fetchTranslateAt(index) {
        if (index >= candidates.length) {
          return Promise.reject(new Error("Translate endpoint not found (404)."));
        }
        return fetch(candidates[index], {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: payload,
          signal: translateUi.abortController ? translateUi.abortController.signal : undefined
        }).then(parseTranslateResponse).then(function (pack) {
          var res = pack.res;
          var data = pack.data;
          if (res.status === 404) return fetchTranslateAt(index + 1);
          if (!res.ok) {
            var err = (data && data.error) ? data.error : ("Translate failed (" + res.status + ")");
            throw new Error(err);
          }
          return data || {};
        });
      }

      fetchTranslateAt(0).then(function (data) {
        if (requestId !== translateUi.requestId) return;
        var translated = "";
        try { translated = String(data.translatedText || "").trim(); } catch (e4) {}
        if (!translated) throw new Error("Empty translation result.");
        if (translateUi.result) translateUi.result.textContent = translated;
        if (translateUi.copyBtn) translateUi.copyBtn.disabled = false;
        var detected = "";
        try { detected = String(data.detectedSource || "").trim(); } catch (e5) {}
        if (detected && detected !== "auto") {
          setTranslateStatus("Detected: " + detected.toUpperCase() + " -> " + lang.toUpperCase(), false);
        } else {
          setTranslateStatus("", false);
        }
      }).catch(function (err) {
        if (requestId !== translateUi.requestId) return;
        if (err && err.name === "AbortError") {
          setTranslateStatus("Translation timed out. Try again.", true);
          return;
        }
        var message = "Unable to translate.";
        try {
          if (err && err.message) message = err.message;
        } catch (e6) {}
        setTranslateStatus(message, true);
      }).finally(function () {
        if (timeoutId) clearTimeout(timeoutId);
        if (requestId === translateUi.requestId) {
          translateUi.abortController = null;
        }
      });
    }

    function openTranslateDialog(text) {
      ensureTranslateDialog();
      translateUi.text = normalizeTranslateInput(text);
      if (!translateUi.text) return;
      if (translateUi.source) translateUi.source.textContent = translateUi.text;
      if (translateUi.result) translateUi.result.textContent = "";
      if (translateUi.copyBtn) translateUi.copyBtn.disabled = true;
      if (translateUi.langSelect) translateUi.langSelect.value = getTranslateTargetLang();
      setTranslateStatus("", false);
      translateUi.root.classList.remove("hidden");
      requestTranslation();
    }

    function openUrl(url) {
      try { window.open(url, "_blank", "noopener"); } catch (e) { window.location.href = url; }
    }

    function handleAction(action) {
      var text = state.text || "";
      if (!text) { hideAndClear(); return; }

      if (action === "note") {
        var cfi = state.cfi || getCurrentCfi();
        var payload = {
          cfi: cfi,
          quote: text,
          href: state.href || getCurrentHref()
        };
        hideAndClear();
        if (window.__fbOpenNoteComment) {
          window.__fbOpenNoteComment(payload);
          return;
        }
      } else if (action === "translate") {
        openTranslateDialog(text);
      } else if (action === "search") {
        var qUrl = "https://www.google.com/search?q=" + encodeURIComponent(text);
        openUrl(qUrl);
      } else if (action === "share") {
        try {
          if (navigator.share) {
            navigator.share({ text: text });
          } else if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text);
          } else {
            var ta = document.createElement("textarea");
            ta.value = text;
            ta.setAttribute("readonly", "true");
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand("copy"); } catch (e2) {}
            document.body.removeChild(ta);
          }
        } catch (e) {}
      } else if (action === "copy") {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text);
          } else {
            var ta2 = document.createElement("textarea");
            ta2.value = text;
            ta2.setAttribute("readonly", "true");
            ta2.style.position = "fixed";
            ta2.style.opacity = "0";
            document.body.appendChild(ta2);
            ta2.select();
            try { document.execCommand("copy"); } catch (e3) {}
            document.body.removeChild(ta2);
          }
        } catch (e) {}
      }

      hideAndClear();
    }

    function toolbarActionFromEvent(e) {
      var node = null;
      try { node = e && e.target ? e.target : null; } catch (e0) {}
      var depth = 0;
      while (node && depth < 6) {
        try {
          if (node.getAttribute && node.getAttribute("data-action")) {
            return node.getAttribute("data-action");
          }
        } catch (e1) {}
        try { node = node.parentNode; } catch (e2) { node = null; }
        depth++;
      }
      try {
        if (e && e.composedPath) {
          var path = e.composedPath();
          for (var i = 0; i < path.length && i < 6; i++) {
            var el = path[i];
            try {
              if (el && el.getAttribute && el.getAttribute("data-action")) {
                return el.getAttribute("data-action");
              }
            } catch (e3) {}
          }
        }
      } catch (e4) {}
      return null;
    }
    function maybeHandleToolbarAction(e, viaClick) {
      var action = toolbarActionFromEvent(e);
      if (!action) return;
      try {
        if (toolbar.__fbActionLock && Date.now() - toolbar.__fbActionLock < 500) return;
      } catch (e0) {}
      try { toolbar.__fbActionLock = Date.now(); } catch (e1) {}
      try {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
      } catch (e2) {}
      try {
        if (e && e.stopImmediatePropagation) e.stopImmediatePropagation();
      } catch (e2b) {}
      handleAction(action);
      if (viaClick) {
        try { toolbar.__fbActionLock = Date.now(); } catch (e3) {}
      }
    }
    toolbar.addEventListener("pointerdown", function (e) { maybeHandleToolbarAction(e, false); }, { capture: true });
    toolbar.addEventListener("touchstart", function (e) { maybeHandleToolbarAction(e, false); }, { capture: true, passive: false });
    toolbar.addEventListener("pointerup", function (e) { maybeHandleToolbarAction(e, false); }, { capture: true });
    toolbar.addEventListener("touchend", function (e) { maybeHandleToolbarAction(e, false); }, { capture: true, passive: false });
    toolbar.addEventListener("click", function (e) { maybeHandleToolbarAction(e, true); });

    // Attach to each iframe doc rendered by epub.js
    try {
      reader.rendition.hooks.content.register(function (contents) {
        try { attachToDoc(contents.document); } catch (e) {}
      });
      reader.rendition.on("rendered", function (section, view) {
        try {
          var iframe = null;
          if (view && view.element) {
            if (view.element.tagName === "IFRAME") iframe = view.element;
            else if (view.element.querySelector) iframe = view.element.querySelector("iframe");
          }
          if (iframe && iframe.contentDocument) attachToDoc(iframe.contentDocument);
        } catch (e) {}
      });
    } catch (e) {}

    function scanIframes() {
      try {
        var list = document.querySelectorAll("#viewerStack iframe, #viewer iframe, #viewer-prev iframe, #viewer-next iframe");
        for (var i = 0; i < list.length; i++) {
          var ifr = list[i];
          if (ifr && ifr.contentDocument) attachToDoc(ifr.contentDocument);
        }
      } catch (e) {}
    }
    scanIframes();

    try {
      reader.rendition.on("relocated", function () {
        if (notePendingCfi) {
          hideAndClear();
          var cfi = notePendingCfi;
          setTimeout(function () {
            if (cfi && highlightNoteCfi(cfi)) notePendingCfi = null;
          }, 0);
          return;
        }
        if (state.noteHighlightActive) return;
        hideAndClear();
      });
    } catch (e) {}

    hideToolbar();
  }

  // -------- Add Comment modal for notes --------
  function setupNoteComment(reader) {
    var sheet = document.getElementById("commentSheet");
    var backdrop = document.getElementById("commentBackdrop");
    var input = document.getElementById("commentInput");
    var saveBtn = document.getElementById("commentSave");
    var cancelBtn = document.getElementById("commentCancel");
    if (!sheet || !backdrop || !input || !saveBtn || !cancelBtn) return;

    var pending = null;

    function sanitize(val) {
      var s = String(val || "").replace(/\n/g, " ");
      s = s.replace(/\s+/g, " ").trim();
      if (!s) return "";
      var words = s.split(" ").filter(Boolean);
      if (words.length > 100) words = words.slice(0, 100);
      return words.join(" ");
    }

    function close() {
      sheet.classList.add("hidden");
      backdrop.classList.add("hidden");
      input.value = "";
      pending = null;
    }

    function open(payload) {
      pending = payload || null;
      input.value = "";
      sheet.classList.remove("hidden");
      backdrop.classList.remove("hidden");
      var isCoarsePointer = false;
      var isAndroid = false;
      try {
        isCoarsePointer = !!(window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches);
      } catch (e0) {}
      try {
        isAndroid = /Android/i.test((navigator && navigator.userAgent) ? navigator.userAgent : "");
      } catch (e1) {}
      if (!isCoarsePointer && !isAndroid) {
        setTimeout(function () { try { input.focus(); } catch (e2) {} }, 0);
      }
    }

    function save() {
      if (!pending) {
        close();
        return;
      }
      var comment = sanitize(input.value);
      var data = {
        cfi: pending.cfi || null,
        quote: pending.quote || "",
        href: pending.href || null,
        comment: comment
      };
      if (data.cfi && window.__fbAddNote) window.__fbAddNote(data);
      close();
    }

    input.addEventListener("input", function () {
      var v = input.value || "";
      if (v.indexOf("\n") !== -1 || v.indexOf("\r") !== -1) {
        input.value = v.replace(/[\r\n]+/g, " ");
      }
    });
    saveBtn.addEventListener("click", function (e) { if (e) e.preventDefault(); save(); });
    cancelBtn.addEventListener("click", function (e) { if (e) e.preventDefault(); close(); });
    backdrop.addEventListener("click", function () { close(); });

    window.__fbOpenNoteComment = function (payload) {
      open(payload || {});
    };
  }

  // -------- Notes (selection-based) --------
  function setupNotes(reader) {
    if (!reader || !reader.rendition) return;
    var list = document.getElementById("notes");
    var copyBtn = document.getElementById("copyNotesLinkBtn");
    if (!list) return;
    if (!reader.settings) reader.settings = {};
    if (!Array.isArray(reader.settings.notes)) reader.settings.notes = [];

    function normalizeQuote(val) {
      var s = String(val || "").replace(/\s+/g, " ").trim();
      return s || "…";
    }

    function save() {
      try { if (typeof reader.saveSettings === "function") reader.saveSettings(); } catch (e) {}
    }

    function encodeNotesForUrl(notes) {
      try {
        var payload = JSON.stringify(Array.isArray(notes) ? notes : []);
        return btoa(unescape(encodeURIComponent(payload)));
      } catch (e) {}
      return "";
    }

    function toBase64Url(uint8) {
      try {
        var CHUNK = 0x8000;
        var parts = [];
        for (var i = 0; i < uint8.length; i += CHUNK) {
          parts.push(String.fromCharCode.apply(null, uint8.subarray(i, i + CHUNK)));
        }
        return btoa(parts.join("")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
      } catch (e) {}
      return "";
    }

    function fromBase64Url(token) {
      try {
        var b64 = String(token || "").replace(/-/g, "+").replace(/_/g, "/");
        while (b64.length % 4) b64 += "=";
        var bin = atob(b64);
        var out = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
      } catch (e) {}
      return new Uint8Array(0);
    }

    function encodeNotesCompressed(notes) {
      try {
        if (!window.CompressionStream || !window.TextEncoder) return Promise.resolve("");
        var payload = JSON.stringify(Array.isArray(notes) ? notes : []);
        var enc = new TextEncoder();
        var input = enc.encode(payload);
        var cs = new CompressionStream("gzip");
        var writer = cs.writable.getWriter();
        writer.write(input);
        writer.close();
        return new Response(cs.readable).arrayBuffer().then(function (ab) {
          return toBase64Url(new Uint8Array(ab));
        }).catch(function () { return ""; });
      } catch (e) {}
      return Promise.resolve("");
    }

    function decodeNotesCompressed(token) {
      try {
        if (!window.DecompressionStream || !window.TextDecoder) return Promise.resolve([]);
        var bytes = fromBase64Url(token);
        if (!bytes || !bytes.length) return Promise.resolve([]);
        var ds = new DecompressionStream("gzip");
        var writer = ds.writable.getWriter();
        writer.write(bytes);
        writer.close();
        return new Response(ds.readable).arrayBuffer().then(function (ab) {
          var text = new TextDecoder().decode(new Uint8Array(ab));
          var arr = JSON.parse(text);
          return Array.isArray(arr) ? arr : [];
        }).catch(function () { return []; });
      } catch (e) {}
      return Promise.resolve([]);
    }

    function decodeNotesFromUrl(token) {
      try {
        if (!token) return [];
        var json = decodeURIComponent(escape(atob(String(token))));
        var arr = JSON.parse(json);
        if (!Array.isArray(arr)) return [];
        var out = [];
        for (var i = 0; i < arr.length; i++) {
          var n = arr[i] || {};
          if (!n.cfi) continue;
          out.push({
            id: n.id || ("shared-" + i + "-" + Date.now()),
            cfi: String(n.cfi),
            href: n.href || null,
            quote: normalizeQuote(n.quote || ""),
            comment: String(n.comment || "")
          });
        }
        return out;
      } catch (e) {}
      return [];
    }

    function normalizeImportedNotes(raw) {
      var arr = Array.isArray(raw) ? raw : [];
      var out = [];
      for (var i = 0; i < arr.length; i++) {
        var n = arr[i] || {};
        if (!n.cfi) continue;
        out.push({
          id: n.id || ("shared-" + i + "-" + Date.now()),
          cfi: String(n.cfi),
          href: n.href || null,
          quote: normalizeQuote(n.quote || ""),
          comment: String(n.comment || "")
        });
      }
      return out;
    }

    function extractShareableNotes() {
      var notes = reader.settings && Array.isArray(reader.settings.notes) ? reader.settings.notes : [];
      var out = [];
      for (var i = 0; i < notes.length; i++) {
        var n = notes[i] || {};
        if (!n.cfi) continue;
        out.push({
          id: n.id || ("n-" + i),
          cfi: String(n.cfi),
          href: n.href || null,
          quote: normalizeQuote(n.quote || ""),
          comment: String(n.comment || "")
        });
      }
      return out;
    }

    function getCurrentBookId() {
      try {
        var u = new URL(window.location.href || "", window.location.origin);
        var id = u.searchParams.get("id") || u.searchParams.get("i");
        if (id) return String(id);
      } catch (e0) {}
      return "";
    }

    function buildUrlWithParams(params, clearHash) {
      var u = new URL(window.location.href || "", window.location.origin);
      if (params && typeof params === "object") {
        Object.keys(params).forEach(function (k) {
          var v = params[k];
          if (v == null || v === "") u.searchParams.delete(k);
          else u.searchParams.set(k, String(v));
        });
      }
      if (clearHash) u.hash = "";
      return u.toString();
    }

    function getNotesShareCreateEndpoints() {
      var endpoints = ["/books/api/ns", "/api/ns", "/books/api/notes-share", "/api/notes-share"];
      try {
        var host = String(window.location.hostname || "").toLowerCase();
        if (host === "reader.pub" || host === "www.reader.pub") {
          // reader.pub /books/api/* may be handled outside the reader worker.
          // Use the reader-worker path first, then keep local fallbacks.
          endpoints = [
            "/books/reader/api/ns",
            "/books/api/ns",
            "/api/ns",
            "/books/reader/api/notes-share",
            "/books/api/notes-share",
            "/api/notes-share"
          ];
        }
      } catch (e0) {}
      return endpoints;
    }

    function getNotesShareReadEndpoints(shareId) {
      var id = encodeURIComponent(String(shareId || ""));
      var endpoints = [
        "/books/api/ns/" + id,
        "/api/ns/" + id,
        "/books/api/notes-share/" + id,
        "/api/notes-share/" + id
      ];
      try {
        var host = String(window.location.hostname || "").toLowerCase();
        if (host === "reader.pub" || host === "www.reader.pub") {
          // reader.pub /books/api/* may be handled outside the reader worker.
          // Use the reader-worker path first, then keep local fallbacks.
          endpoints = [
            "/books/reader/api/ns/" + id,
            "/books/api/ns/" + id,
            "/api/ns/" + id,
            "/books/reader/api/notes-share/" + id,
            "/books/api/notes-share/" + id,
            "/api/notes-share/" + id
          ];
        }
      } catch (e0) {}
      return endpoints;
    }

    function createShortNotesShare(notesPayload) {
      var body = {
        bookId: getCurrentBookId(),
        notes: notesPayload
      };
      var endpoints = getNotesShareCreateEndpoints();
      var idx = 0;
      var tryNext = function () {
        if (idx >= endpoints.length) return Promise.reject(new Error("share create failed"));
        var endpoint = endpoints[idx++];
        return fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json; charset=utf-8" },
          credentials: "same-origin",
          body: JSON.stringify(body)
        }).then(function (resp) {
          if (!resp || !resp.ok) throw new Error("share create failed");
          return resp.json();
        }).then(function (data) {
          var shareId = data && data.shareId ? String(data.shareId) : "";
          if (!shareId) throw new Error("missing share id");
          return buildUrlWithParams({
            i: getCurrentBookId(),
            id: null,
            n: shareId,
            notesShare: null,
            notes: null,
            notesz: null
          }, true);
        }).catch(function () {
          return tryNext();
        });
      };
      return tryNext();
    }

    function getCopyNotesUrl() {
      try {
        var notesPayload = extractShareableNotes();
        if (notesPayload.length) {
          return createShortNotesShare(notesPayload).catch(function () {
            return encodeNotesCompressed(notesPayload).then(function (token) {
              if (!token) {
                var legacy = encodeNotesForUrl(notesPayload);
                return buildUrlWithParams({
                  i: getCurrentBookId(),
                  id: null,
                  notes: legacy,
                  n: null,
                  notesShare: null,
                  notesz: null
                }, true);
              }
              return buildUrlWithParams({
                i: getCurrentBookId(),
                id: null,
                notesz: token,
                n: null,
                notesShare: null,
                notes: null
              }, true);
            });
          });
        }
        return Promise.resolve(buildUrlWithParams({
          i: getCurrentBookId(),
          id: null,
          n: null,
          notesShare: null,
          notes: null,
          notesz: null
        }, true));
      } catch (e1) {}
      return Promise.resolve(window.location.href || "");
    }

    function copyText(value) {
      var txt = String(value || "");
      if (!txt) return Promise.reject(new Error("No text to copy"));
      var fallbackCopy = function () {
        return new Promise(function (resolve, reject) {
          try {
            var ta = document.createElement("textarea");
            ta.value = txt;
            ta.setAttribute("readonly", "readonly");
            ta.style.position = "fixed";
            ta.style.top = "-9999px";
            ta.style.left = "-9999px";
            document.body.appendChild(ta);
            ta.select();
            var ok = false;
            try { ok = document.execCommand("copy"); } catch (e1) { ok = false; }
            document.body.removeChild(ta);
            if (ok) resolve();
            else reject(new Error("Copy command failed"));
          } catch (e2) {
            reject(e2);
          }
        });
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          return navigator.clipboard.writeText(txt).catch(function () {
            return fallbackCopy();
          });
        }
      } catch (e0) {}
      return fallbackCopy();
    }

    function openNoteCfi(cfi) {
      if (!cfi) return;
      try { if (window.__fbClearSelectionToolbar) window.__fbClearSelectionToolbar(); } catch (e0) {}
      try { if (window.__fbShowNoteHighlight) window.__fbShowNoteHighlight(cfi, true); } catch (e1) {}
      try {
        var p = reader.rendition.display(cfi);
        if (p && typeof p.then === "function") {
          p.then(function () {
            try { if (window.__fbShowNoteHighlight) window.__fbShowNoteHighlight(cfi); } catch (e2) {}
          });
        } else {
          setTimeout(function () {
            try { if (window.__fbShowNoteHighlight) window.__fbShowNoteHighlight(cfi); } catch (e2b) {}
          }, 0);
        }
      } catch (e3) {}
      try { if (window.__fbCloseOverlays) window.__fbCloseOverlays(); } catch (e3) {}
    }

    window.__fbOpenNoteAtCfi = openNoteCfi;

    function openNote(note) {
      if (!note || !note.cfi) return;
      openNoteCfi(note.cfi);
    }

    function createItem(note) {
      var li = document.createElement("li");
      li.className = "list_item";
      if (note && note.cfi) li.setAttribute("data-cfi", note.cfi);
      li.style.display = "flex";
      li.style.alignItems = "flex-start";
      li.style.gap = "10px";
      li.style.width = "100%";
      li.style.boxSizing = "border-box";

      var wrap = document.createElement("div");
      wrap.className = "bookmark-text";
      wrap.style.flex = "1 1 auto";
      wrap.style.minWidth = "0";
      wrap.style.width = "100%";

      var link = document.createElement("a");
      link.className = "bookmark_link";
      link.href = note && note.cfi ? note.cfi : "#";
      link.textContent = normalizeQuote(note && note.quote);
      link.addEventListener("click", function (event) {
        event.preventDefault();
        openNote(note);
      }, false);

      wrap.appendChild(link);
      if (note && note.comment) {
        var comment = document.createElement("div");
        comment.className = "bookmark-comment";
        comment.textContent = note.comment;
        wrap.appendChild(comment);
      }
      li.appendChild(wrap);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bookmark-delete";
      btn.setAttribute("aria-label", "Delete note");
      btn.style.position = "static";
      btn.style.left = "auto";
      btn.style.right = "auto";
      btn.style.top = "auto";
      btn.style.flex = "0 0 32px";
      btn.style.width = "32px";
      btn.style.minWidth = "32px";
      btn.style.maxWidth = "32px";
      btn.style.height = "32px";
      btn.style.margin = "0";
      btn.style.padding = "0";
      btn.style.display = "inline-flex";
      btn.style.alignItems = "center";
      btn.style.justifyContent = "center";
      if (note && note.id) btn.setAttribute("data-id", note.id);
      btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
        + '<path d="M4 7h16" />'
        + '<path d="M9 7V5h6v2" />'
        + '<rect x="6" y="7" width="12" height="13" rx="2" />'
        + '<path d="M10 11v6" />'
        + '<path d="M14 11v6" />'
        + '</svg>';
      btn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        var id = this.getAttribute("data-id");
        var notes = reader.settings.notes || [];
        var idx = -1;
        if (id) {
          for (var i = 0; i < notes.length; i++) {
            if (notes[i] && notes[i].id === id) { idx = i; break; }
          }
        }
        if (idx === -1 && note && note.cfi) {
          for (var j = 0; j < notes.length; j++) {
            if (notes[j] && notes[j].cfi === note.cfi && notes[j].quote === note.quote) { idx = j; break; }
          }
        }
        if (idx >= 0) {
          notes.splice(idx, 1);
          save();
          render();
        }
      }, false);
      li.appendChild(btn);
      return li;
    }

    function render() {
      while (list.firstChild) list.removeChild(list.firstChild);
      var notes = reader.settings.notes || [];
      for (var i = 0; i < notes.length; i++) {
        list.appendChild(createItem(notes[i]));
      }
    }

    function addNote(payload) {
      if (!payload || !payload.cfi) return;
      var note = {
        id: String(Date.now()) + "-" + Math.floor(Math.random() * 1000000),
        cfi: payload.cfi,
        href: payload.href || null,
        quote: normalizeQuote(payload.quote || ""),
        comment: payload.comment || ""
      };
      reader.settings.notes.push(note);
      save();
      render();
    }

    function importSharedNotesFromUrl() {
      try {
        var u = new URL(window.location.href || "", window.location.origin);
        var applyImportedNotes = function (imported) {
          if (!imported || !imported.length) return false;
          reader.settings.notes = imported;
          render();
          return true;
        };
        var tryLegacyToken = function () {
          var token = u.searchParams.get("notes");
          if (!token) return;
          var imported = decodeNotesFromUrl(token);
          applyImportedNotes(imported);
        };
        var tryUrlPayloadFallback = function () {
          var compressed = String(u.searchParams.get("notesz") || "").trim();
          if (compressed) {
            decodeNotesCompressed(compressed).then(function (raw) {
              var importedZ = normalizeImportedNotes(raw);
              if (applyImportedNotes(importedZ)) return;
              tryLegacyToken();
            }).catch(function () {
              tryLegacyToken();
            });
            return;
          }
          tryLegacyToken();
        };
        var shareId = String(u.searchParams.get("n") || u.searchParams.get("notesShare") || "").trim();
        if (shareId) {
          var endpoints = getNotesShareReadEndpoints(shareId);
          var i = 0;
          var tryLoad = function () {
            if (i >= endpoints.length) {
              tryUrlPayloadFallback();
              return;
            }
            fetch(endpoints[i++], { method: "GET", credentials: "same-origin" })
              .then(function (resp) {
                if (!resp || !resp.ok) throw new Error("share load failed");
                return resp.json();
              })
              .then(function (data) {
                var imported = normalizeImportedNotes(data && data.notes);
                if (!applyImportedNotes(imported)) throw new Error("share empty");
              })
              .catch(function () {
                tryLoad();
              });
          };
          tryLoad();
          return;
        }
        tryUrlPayloadFallback();
      } catch (e) {}
    }

    window.__fbAddNote = addNote;
    importSharedNotesFromUrl();
    if (copyBtn && !copyBtn.__fbBound) {
      copyBtn.__fbBound = true;
      var clearCopyState = function (btn) {
        btn.classList.remove("is-pressed");
        btn.classList.remove("is-copied");
        btn.classList.remove("is-failed");
      };
      copyBtn.addEventListener("mousedown", function () { copyBtn.classList.add("is-pressed"); });
      copyBtn.addEventListener("mouseup", function () { copyBtn.classList.remove("is-pressed"); });
      copyBtn.addEventListener("mouseleave", function () { copyBtn.classList.remove("is-pressed"); });
      copyBtn.addEventListener("click", function (event) {
        if (event) event.preventDefault();
        var btn = copyBtn;
        clearCopyState(btn);
        var oldText = btn.textContent || "Copy book link with Notes";
        var generatedUrl = "";
        getCopyNotesUrl()
          .then(function (url) {
            generatedUrl = String(url || "");
            return copyText(generatedUrl);
          })
          .then(function () {
            try {
              if (generatedUrl) {
                var next = new URL(generatedUrl, window.location.origin);
                history.replaceState(null, "", next.pathname + next.search + (next.hash || ""));
              }
            } catch (e0) {}
            btn.classList.add("is-copied");
            btn.textContent = "Copied";
            setTimeout(function () {
              btn.textContent = oldText;
              clearCopyState(btn);
            }, 1200);
          })
          .catch(function () {
            btn.classList.add("is-failed");
            btn.textContent = "Copy failed";
            setTimeout(function () {
              btn.textContent = oldText;
              clearCopyState(btn);
            }, 1500);
          });
      });
    }
    render();
  }

  // -------- text-to-speech (Web Speech API) --------
  function setupSpeech(reader) {
    if (window.__fbSpeechSetupDone) return;
    window.__fbSpeechSetupDone = true;

    var synth = window.speechSynthesis || null;
    var SpeechUtterance = window.SpeechSynthesisUtterance || null;
    var btnDesktop = document.getElementById("ttsToggleDesktop");
    var btnMobile = document.getElementById("ttsToggleMobile");
    var voiceLangSelect = document.getElementById("voiceLangSelect");
    var voiceLangDropdown = document.getElementById("voiceLangDropdown");
    var voiceLangToggle = document.getElementById("voiceLangToggle");
    var voiceLangList = document.getElementById("voiceLangList");
    var voiceSelect = document.getElementById("voiceSelect");
    var voiceDropdown = document.getElementById("voiceDropdown");
    var voiceToggle = document.getElementById("voiceToggle");
    var voiceList = document.getElementById("voiceList");
    var voiceStatus = document.getElementById("voiceStatus");
    var VOICE_KEY = "fbreader:tts:voiceURI";
    var VOICE_LANG_KEY = "fbreader:tts:voiceLang";
    var HIGHLIGHT_NAME = "fb-tts";
    var state = {
      enabled: false,
      token: 0,
      map: [],
      doc: null,
      content: null,
      fallbackNode: null,
      fallbackOverlay: null,
      selectedVoiceURI: null,
      restartTimer: null,
      speakPending: false,
      lastSpokenText: "",
      fallbackMsPerWord: 240,
      pageStartCfi: "",
      lastSpokenSeg: null,
      lastWordCfi: "",
      resumeFromStopCfi: "",
      resumeLocKey: "",
      selectedVoiceLang: "en-US"
    };
    var driveLangSyncTimer = null;

    function isMobileLikeDevice() {
      try {
        if (window.matchMedia && window.matchMedia("(max-width: 1024px), (pointer: coarse)").matches) return true;
      } catch (e) {}
      var ua = "";
      try { ua = String((navigator && navigator.userAgent) || ""); } catch (e2) {}
      return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    }

    function setButtonState(on) {
      [btnDesktop, btnMobile].forEach(function (btn) {
        if (!btn) return;
        btn.classList.toggle("is-speaking", !!on);
        btn.setAttribute("aria-label", on ? "Stop reading aloud" : "Start reading aloud");
        btn.setAttribute("title", on ? "Stop reading aloud" : "Read aloud");
      });
    }

    function clearFallbackHighlight() {
      try {
        if (state.fallbackNode) state.fallbackNode.classList.remove("fb-tts-node-highlight");
      } catch (e) {}
      try {
        if (state.fallbackOverlay && state.fallbackOverlay.parentNode) {
          state.fallbackOverlay.parentNode.removeChild(state.fallbackOverlay);
        }
      } catch (e2) {}
      state.fallbackNode = null;
      state.fallbackOverlay = null;
    }

    function clearHighlight() {
      clearFallbackHighlight();
      try {
        if (state.doc && state.doc.defaultView && state.doc.defaultView.CSS && state.doc.defaultView.CSS.highlights) {
          state.doc.defaultView.CSS.highlights.delete(HIGHLIGHT_NAME);
        }
      } catch (e) {}
    }

    function ensureDocHighlightStyle(doc) {
      if (!doc || !doc.head || doc.getElementById("__fb_tts_hl_css")) return;
      var style = doc.createElement("style");
      style.id = "__fb_tts_hl_css";
      style.textContent = ""
        + "::highlight(" + HIGHLIGHT_NAME + "){"
        + "background:rgba(97,194,250,0.42)!important;"
        + "color:inherit!important;"
        + "}"
        + ".fb-tts-node-highlight{"
        + "background:rgba(97,194,250,0.30)!important;"
        + "border-radius:2px;"
        + "}";
      try { doc.head.appendChild(style); } catch (e) {}
    }

    function isVisibleNode(node, doc) {
      if (!node || !node.parentElement) return false;
      var el = node.parentElement;
      if (el.closest && el.closest("script,style,noscript,svg,math")) return false;
      var txt = String(node.nodeValue || "");
      if (!txt || !txt.replace(/\s+/g, "").length) return false;
      try {
        var cs = doc.defaultView && doc.defaultView.getComputedStyle ? doc.defaultView.getComputedStyle(el) : null;
        if (cs && (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0)) return false;
      } catch (e) {}
      return true;
    }

    function getVisibleIframeDoc() {
      function validFrameDoc(frame) {
        try {
          if (!frame || !frame.contentDocument) return null;
          var doc = frame.contentDocument;
          if (!doc || !doc.body) return null;
          return doc;
        } catch (e) {
          return null;
        }
      }

      var host = document.getElementById("viewer");
      if (host) {
        var direct = host.querySelector("iframe");
        var directDoc = validFrameDoc(direct);
        if (directDoc) return directDoc;
      }

      var list = [];
      try { list = Array.prototype.slice.call(document.querySelectorAll("#viewerStack iframe, #viewer iframe, #viewer-prev iframe, #viewer-next iframe")); } catch (e0) {}
      if (!list.length) return null;

      var cx = Math.round(window.innerWidth / 2);
      var cy = Math.round(window.innerHeight / 2);
      var best = null;
      var bestScore = -1;
      for (var i = 0; i < list.length; i++) {
        var frame = list[i];
        var doc = validFrameDoc(frame);
        if (!doc) continue;
        try {
          var rect = frame.getBoundingClientRect ? frame.getBoundingClientRect() : null;
          if (!rect || rect.width < 8 || rect.height < 8) continue;
          var containsCenter = (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) ? 1 : 0;
          var score = containsCenter * 1000000 + Math.max(0, rect.width * rect.height);
          if (score > bestScore) {
            bestScore = score;
            best = doc;
          }
        } catch (e1) {}
      }
      return best;
    }

    function normHref(h) {
      var s = String(h || "");
      s = s.split("#")[0];
      s = s.replace(/^https?:\/\/[^/]+/i, "");
      s = s.replace(/^\/+/, "");
      s = s.replace(/^\.\//, "");
      return s;
    }

    function getLocationKey() {
      try {
        var loc = null;
        try {
          loc = (reader && reader._lastRelocated) ? reader._lastRelocated : null;
        } catch (e0) { loc = null; }
        if (!loc) {
          loc = reader && reader.rendition && reader.rendition.currentLocation ? reader.rendition.currentLocation() : null;
        }
        var start = (loc && loc.start) ? loc.start : null;
        var end = (loc && loc.end) ? loc.end : null;
        var href = normHref(start && start.href ? start.href : "");
        var scfi = start && start.cfi ? String(start.cfi) : "";
        var ecfi = end && end.cfi ? String(end.cfi) : "";
        var p = (start && start.displayed && start.displayed.page) ? String(start.displayed.page) : "";
        var t = (start && start.displayed && start.displayed.total) ? String(start.displayed.total) : "";
        var key = [];
        if (href) key.push("h=" + href);
        if (scfi) key.push("s=" + scfi);
        if (ecfi) key.push("e=" + ecfi);
        if (p || t) key.push("p=" + (p || "") + "/" + (t || ""));
        return key.join("|");
      } catch (e) {
        return "";
      }
    }

    function activeContent() {
      var list = [];
      try {
        if (reader && reader.rendition && typeof reader.rendition.getContents === "function") {
          list = reader.rendition.getContents() || [];
        }
      } catch (e0) {}

      var targetHref = "";
      try {
        var loc = reader && reader.rendition && reader.rendition.currentLocation ? reader.rendition.currentLocation() : null;
        targetHref = normHref(loc && loc.start && loc.start.href ? loc.start.href : "");
      } catch (e1) {}

      if (targetHref && list.length) {
        for (var i = 0; i < list.length; i++) {
          var c = list[i];
          if (!c || !c.document) continue;
          var hrefA = normHref(c.section && c.section.href ? c.section.href : "");
          var hrefB = normHref(c.document.__epubjsSpineHref || "");
          if (hrefA === targetHref || hrefB === targetHref) return c;
        }
      }

      var visibleDoc = getVisibleIframeDoc();
      if (visibleDoc && list.length) {
        for (var j = 0; j < list.length; j++) {
          if (list[j] && list[j].document === visibleDoc) return list[j];
        }
      }

      if (visibleDoc) return { document: visibleDoc };
      for (var k = 0; k < list.length; k++) {
        if (list[k] && list[k].document) return list[k];
      }
      return null;
    }

    function pagePayload(preferredStartCfi) {
      var content = activeContent();
      if (!content || !content.document) return null;
      var doc = content.document;
      ensureDocHighlightStyle(doc);
      var w = doc.defaultView || window;
      var vw = Math.max(1, Number(w.innerWidth || 0));
      var vh = Math.max(1, Number(w.innerHeight || 0));

      function normText(s) {
        return String(s || "").replace(/\s+/g, " ").trim();
      }

      function payloadFromCurrentCfi(startFromCfi) {
        var loc = null;
        var cfi = "";
        try {
          cfi = String(startFromCfi || "");
          if (!cfi) {
            loc = reader && reader.rendition && reader.rendition.currentLocation ? reader.rendition.currentLocation() : null;
            cfi = String(loc && loc.start && loc.start.cfi ? loc.start.cfi : "");
          }
        } catch (e0) { cfi = ""; }
        if (!cfi) return null;

        var contents = [];
        try { contents = reader && reader.rendition && reader.rendition.getContents ? (reader.rendition.getContents() || []) : []; } catch (e1) {}
        if (!contents.length) return null;

        function collectFromDoc(startDoc, startNode, startOffset, sourceContent) {
          if (!startDoc || !startNode) return null;
          var nf = (startDoc.defaultView && startDoc.defaultView.NodeFilter) ? startDoc.defaultView.NodeFilter : NodeFilter;
          var tw = null;
          try { tw = startDoc.createTreeWalker(startDoc.body || startDoc.documentElement, nf.SHOW_TEXT, null); } catch (e2) {}
          if (!tw) return null;

          var text = "";
          var idx = 0;
          var map = [];
          var foundStart = false;
          var startedVisible = false;
          var invisibleTail = 0;
          var n = tw.nextNode();
          while (n) {
            if (!foundStart) {
              if (n === startNode) foundStart = true;
              else { n = tw.nextNode(); continue; }
            }

            if (isVisibleNode(n, startDoc)) {
              var raw = String(n.nodeValue || "");
              if (n === startNode && startOffset > 0 && startOffset < raw.length) raw = raw.slice(startOffset);
              var rawSrc = raw;
              var baseOffset = (n === startNode && startOffset > 0 && startOffset < String(n.nodeValue || "").length) ? startOffset : 0;
              var re0 = /\S+\s*/g;
              var mm0;
              var foundAny = false;
              var localInvisible = 0;
              var lastTop = null;
              var reachedLowerHalf = false;
              while ((mm0 = re0.exec(rawSrc))) {
                var t0 = normText(mm0[0] || "");
                if (!t0) continue;
                var visWord = false;
                var visTop = null;
                try {
                  var rr0 = startDoc.createRange();
                  rr0.setStart(n, baseOffset + mm0.index);
                  rr0.setEnd(n, baseOffset + mm0.index + mm0[0].length);
                  var rects0 = rr0.getClientRects ? rr0.getClientRects() : [];
                  for (var ri0 = 0; ri0 < rects0.length; ri0++) {
                    var r0 = rects0[ri0];
                    if (r0 && r0.width > 0 && r0.height > 0 && r0.right > 0 && r0.left < vw && r0.bottom > 0 && r0.top < vh) {
                      visWord = true;
                      visTop = Number(r0.top || 0);
                      break;
                    }
                  }
                } catch (e3) {}
                if (!visWord) {
                  if (startedVisible) localInvisible++;
                  if (startedVisible && localInvisible > 32) break;
                  continue;
                }
                if (typeof visTop === "number") {
                  if (visTop > (vh * 0.58)) reachedLowerHalf = true;
                  if (lastTop !== null && reachedLowerHalf && (lastTop > (vh * 0.58)) && (visTop < (vh * 0.24))) {
                    break;
                  }
                  lastTop = visTop;
                }
                localInvisible = 0;
                if (text) { text += " "; idx += 1; }
                var s0 = idx;
                text += t0;
                idx += t0.length;
                map.push({
                  start: s0,
                  end: idx,
                  node: n,
                  startOffset: baseOffset + mm0.index,
                  endOffset: baseOffset + mm0.index + mm0[0].length
                });
                startedVisible = true;
                invisibleTail = 0;
                foundAny = true;
              }
              if (!foundAny && startedVisible) invisibleTail++;
            } else if (startedVisible) {
              invisibleTail++;
            }
            if (idx > 3500) break;
            if (startedVisible && invisibleTail > 25) break;
            n = tw.nextNode();
          }
          if (!text) return null;
          return { doc: startDoc, content: sourceContent || null, text: text, map: map, locKey: getLocationKey() };
        }

        for (var i = 0; i < contents.length; i++) {
          var c = contents[i];
          if (!c || !c.document || typeof c.range !== "function") continue;
          var range = null;
          try { range = c.range(cfi); } catch (e4) { range = null; }
          if (!range) continue;
          var sn = range.startContainer || null;
          var so = Number(range.startOffset || 0);
          if (!sn) continue;
          if (sn.nodeType !== 3) {
            try {
              var tw0 = c.document.createTreeWalker(sn, ((c.document.defaultView && c.document.defaultView.NodeFilter) ? c.document.defaultView.NodeFilter : NodeFilter).SHOW_TEXT, null);
              var firstText = tw0.nextNode();
              if (firstText) { sn = firstText; so = 0; }
            } catch (e5) {}
          }
          var p = collectFromDoc(c.document, sn, so, c);
          if (p && p.text) return p;
        }
        return null;
      }

      var fromCfi = payloadFromCurrentCfi(preferredStartCfi);
      if (fromCfi && fromCfi.text) return fromCfi;

      // Primary strategy: sample visible blocks directly from the current viewport.
      // This ties TTS to what user actually sees on screen.
      function collectVisibleTextByViewport() {
        if (!doc.elementFromPoint) return null;
        var tags = "p,li,div,blockquote,h1,h2,h3,h4,h5,h6,pre,td";
        var blocks = [];
        var seen = [];
        var x = Math.max(8, Math.min(vw - 8, Math.round(vw * 0.5)));
        var step = Math.max(18, Math.round(vh / 22));
        for (var y = 8; y < (vh - 8); y += step) {
          var el = null;
          try { el = doc.elementFromPoint(x, y); } catch (e0) { el = null; }
          if (!el) continue;
          var b = null;
          try { b = (el.closest && el.closest(tags)) || el; } catch (e1) { b = el; }
          if (!b) continue;
          if (b.closest && b.closest("script,style,noscript,svg,math")) continue;
          if (seen.indexOf(b) >= 0) continue;
          seen.push(b);
          blocks.push(b);
          if (blocks.length > 120) break;
        }
        if (!blocks.length) return null;

        var text = "";
        var idx = 0;
        var map = [];
        for (var bi = 0; bi < blocks.length; bi++) {
          var block = blocks[bi];
          var tw = null;
          try {
            var nf0 = (doc.defaultView && doc.defaultView.NodeFilter) ? doc.defaultView.NodeFilter : NodeFilter;
            tw = doc.createTreeWalker(block, nf0.SHOW_TEXT, null);
          } catch (e2) { tw = null; }
          if (!tw) continue;
          var n = tw.nextNode();
          while (n) {
            var rawText = String(n.nodeValue || "");
            if (rawText && isVisibleNode(n, doc)) {
              var re1 = /\S+\s*/g;
              var mm1;
              while ((mm1 = re1.exec(rawText))) {
                var token = normText(mm1[0] || "");
                if (!token) continue;
                if (text) { text += " "; idx += 1; }
                var s0 = idx;
                text += token;
                idx += token.length;
                map.push({
                  start: s0,
                  end: idx,
                  node: n,
                  startOffset: mm1.index,
                  endOffset: mm1.index + mm1[0].length
                });
                if (idx > 7000) break;
              }
              if (idx > 7000) break;
            }
            n = tw.nextNode();
          }
          if (idx > 7000) break;
        }
        if (!text) return null;
        return { text: text, map: map };
      }

      var viewportPayload = collectVisibleTextByViewport();
      if (viewportPayload && viewportPayload.text) {
        return {
          doc: doc,
          content: content,
          text: viewportPayload.text,
          map: viewportPayload.map,
          locKey: getLocationKey()
        };
      }

      var walker = null;
      try {
        var nf = (doc.defaultView && doc.defaultView.NodeFilter) ? doc.defaultView.NodeFilter : NodeFilter;
        walker = doc.createTreeWalker(doc.body || doc.documentElement, nf.SHOW_TEXT, null);
      } catch (e0) {
        return null;
      }

      function rectVisible(r) {
        if (!r) return false;
        if ((r.width || 0) <= 0 || (r.height || 0) <= 0) return false;
        return (r.right > 0 && r.left < vw && r.bottom > 0 && r.top < vh);
      }

      var text = "";
      var idx = 0;
      var map = [];
      var node = walker.nextNode();
      while (node) {
        if (isVisibleNode(node, doc)) {
          var raw = String(node.nodeValue || "");
          if (raw) {
            // Collect only words that are actually visible in the current page viewport.
            // This prevents reading from the beginning of the chapter when the section is paginated.
            var foundVisible = false;
            var re = /\S+\s*/g;
            var m;
            while ((m = re.exec(raw))) {
              var startOff = m.index;
              var endOff = startOff + m[0].length;
              var vis = false;
              try {
                var rr = doc.createRange();
                rr.setStart(node, startOff);
                rr.setEnd(node, endOff);
                var rects = rr.getClientRects ? rr.getClientRects() : [];
                for (var ri = 0; ri < rects.length; ri++) {
                  if (rectVisible(rects[ri])) { vis = true; break; }
                }
              } catch (e1) {}
              if (!vis) continue;
              var token = normText(m[0] || "");
              if (!token) continue;
              if (text) { text += " "; idx += 1; }
              var s = idx;
              text += token;
              idx += token.length;
              map.push({
                start: s,
                end: idx,
                node: node,
                startOffset: startOff,
                endOffset: endOff
              });
              foundVisible = true;
              if (idx > 7000) break;
            }

            // Fallback if per-word rect sampling produced nothing (some engines return no rects for tiny ranges).
            if (!foundVisible) {
              var norm = normText(raw);
              if (norm) {
                var wholeVisible = false;
                try {
                  var rAll = doc.createRange();
                  rAll.selectNodeContents(node);
                  var allRects = rAll.getClientRects ? rAll.getClientRects() : [];
                  for (var ai = 0; ai < allRects.length; ai++) {
                    if (rectVisible(allRects[ai])) { wholeVisible = true; break; }
                  }
                } catch (e2) {}
                if (wholeVisible) {
                  if (text) { text += " "; idx += 1; }
                  var ws = idx;
                  text += norm;
                  idx += norm.length;
                  map.push({
                    start: ws,
                    end: idx,
                    node: node,
                    startOffset: 0,
                    endOffset: node.nodeValue ? node.nodeValue.length : 0
                  });
                }
              }
            }
          }
        }
        if (idx > 7000) break;
        node = walker.nextNode();
      }
      if (!text) return null;
      return { doc: doc, content: content, text: text, map: map, locKey: getLocationKey() };
    }

    function getMapSegAt(charIndex) {
      if (!state.map || !state.map.length) return null;
      var seg = null;
      var i = 0;
      for (i = 0; i < state.map.length; i++) {
        var m = state.map[i];
        if (charIndex >= m.start && charIndex < m.end) { seg = m; break; }
      }
      if (!seg) {
        for (i = 0; i < state.map.length; i++) {
          if (charIndex <= state.map[i].start) { seg = state.map[i]; break; }
        }
      }
      if (!seg) seg = state.map[state.map.length - 1] || null;
      return seg;
    }

    function segToRange(seg, doc) {
      var d = doc || state.doc;
      if (!d || !seg || !seg.node) return null;
      try {
        var r = d.createRange();
        var nlen = seg.node.nodeValue ? seg.node.nodeValue.length : 0;
        var so = (typeof seg.startOffset === "number") ? Math.max(0, Math.min(nlen, seg.startOffset)) : 0;
        var eo = (typeof seg.endOffset === "number") ? Math.max(so, Math.min(nlen, seg.endOffset)) : nlen;
        if (eo <= so) eo = Math.min(nlen, so + 1);
        r.setStart(seg.node, so);
        r.setEnd(seg.node, eo);
        return r;
      } catch (e) {
        return null;
      }
    }

    function segToCfi(seg) {
      try {
        if (!seg || !seg.node || !state.doc || !state.content || typeof state.content.cfiFromRange !== "function") return "";
        var r = segToRange(seg, state.doc);
        if (!r) return "";
        var cfi = state.content.cfiFromRange(r);
        return String(cfi || "");
      } catch (e) {
        return "";
      }
    }

    function resolveRangeFromCfi(cfi) {
      if (!cfi) return null;
      try {
        var contents = reader && reader.rendition && reader.rendition.getContents ? (reader.rendition.getContents() || []) : [];
        for (var i = 0; i < contents.length; i++) {
          var c = contents[i];
          if (!c || !c.document || typeof c.range !== "function") continue;
          var r = null;
          try { r = c.range(cfi); } catch (e0) { r = null; }
          if (r) return { doc: c.document, range: r };
        }
      } catch (e) {}
      return null;
    }

    function applyStopHighlightRange(doc, range) {
      if (!doc || !range) return;
      clearFallbackHighlight();
      state.doc = doc;

      try {
        var w = doc && doc.defaultView;
        if (w && w.CSS && w.CSS.highlights && w.Highlight) {
          w.CSS.highlights.set(HIGHLIGHT_NAME, new w.Highlight(range));
          return;
        }
      } catch (e) {}

      try {
        var rect = null;
        var rects = range.getClientRects ? range.getClientRects() : [];
        if (rects && rects.length) rect = rects[0];
        if (!rect && range.getBoundingClientRect) rect = range.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) {
          var ov = doc.createElement("div");
          ov.className = "fb-tts-word-overlay";
          ov.style.position = "fixed";
          ov.style.left = rect.left + "px";
          ov.style.top = rect.top + "px";
          ov.style.width = rect.width + "px";
          ov.style.height = rect.height + "px";
          ov.style.background = "rgba(97,194,250,0.38)";
          ov.style.borderRadius = "2px";
          ov.style.pointerEvents = "none";
          ov.style.zIndex = "2147483647";
          (doc.body || doc.documentElement).appendChild(ov);
          state.fallbackOverlay = ov;
        }
      } catch (e2) {}
    }

    function showStoppedWordHighlight() {
      var cfi = String(state.lastWordCfi || "");
      var rangeInfo = cfi ? resolveRangeFromCfi(cfi) : null;
      if (rangeInfo && rangeInfo.doc && rangeInfo.range) {
        applyStopHighlightRange(rangeInfo.doc, rangeInfo.range);
        return;
      }
      var seg = state.lastSpokenSeg || null;
      var r = segToRange(seg, state.doc);
      if (r) applyStopHighlightRange(state.doc, r);
    }

    function pickVoice(voices, payload) {
      if (!voices || !voices.length) return null;
      var wantedLang = normalizeLangTag(state.selectedVoiceLang || "");
      if (wantedLang) {
        var byLang = [];
        for (var li = 0; li < voices.length; li++) {
          var lang = normalizeLangTag(voices[li] && voices[li].lang ? voices[li].lang : "");
          if (lang === wantedLang) byLang.push(voices[li]);
        }
        if (byLang.length) voices = byLang;
      }
      if (state.selectedVoiceURI) {
        for (var i = 0; i < voices.length; i++) {
          if (voices[i] && voices[i].voiceURI === state.selectedVoiceURI) return voices[i];
        }
      }
      var lang = "";
      try {
        lang = (payload && payload.doc && payload.doc.documentElement && payload.doc.documentElement.lang) || "";
      } catch (e) {}
      lang = String(lang || "").toLowerCase();
      if (lang) {
        for (var j = 0; j < voices.length; j++) {
          var vlang = String((voices[j] && voices[j].lang) || "").toLowerCase();
          if (vlang && (vlang === lang || vlang.indexOf(lang.split("-")[0]) === 0)) return voices[j];
        }
      }
      return voices[0] || null;
    }

    function normalizeLangTag(lang) {
      var s = String(lang || "").trim();
      if (!s) return "";
      return s.replace(/_/g, "-").toLowerCase();
    }

    function getCurrentBookLang() {
      try {
        var md = reader && reader.book && reader.book.package && reader.book.package.metadata ? reader.book.package.metadata : null;
        if (!md) return "";
        var raw = String(md.language || md.lang || "").trim();
        return normalizeLangTag(raw);
      } catch (e) {}
      return "";
    }

    function matchLangKey(preferredKey, langs) {
      var key = normalizeLangTag(preferredKey || "");
      if (!key || !langs || !langs.length) return "";
      var i;
      for (i = 0; i < langs.length; i++) {
        if (langs[i] && langs[i].key === key) return langs[i].key;
      }
      var base = key.split("-")[0];
      if (!base) return "";
      for (i = 0; i < langs.length; i++) {
        var lk = langs[i] && langs[i].key ? String(langs[i].key) : "";
        if (lk === base || lk.indexOf(base + "-") === 0) return lk;
      }
      return "";
    }

    function closeVoiceDropdowns() {
      var all = [voiceLangDropdown, voiceDropdown];
      for (var i = 0; i < all.length; i++) {
        var root = all[i];
        if (!root) continue;
        root.classList.remove("is-open");
        var t = root.querySelector(".voice-picker-dropdown-toggle");
        if (t) t.setAttribute("aria-expanded", "false");
      }
    }

    function selectedOption(selectEl) {
      if (!selectEl || !selectEl.options || !selectEl.options.length) return null;
      var idx = selectEl.selectedIndex;
      if (idx < 0) idx = 0;
      return selectEl.options[idx] || null;
    }

    function syncCustomToggleText(selectEl, toggleEl) {
      if (!toggleEl) return;
      var opt = selectedOption(selectEl);
      toggleEl.textContent = opt ? String(opt.textContent || "").trim() : "";
    }

    function syncCustomDropdown(selectEl, dropdownEl, toggleEl, listEl) {
      if (!selectEl || !dropdownEl || !toggleEl || !listEl) return;
      listEl.innerHTML = "";
      var opts = selectEl.options ? Array.prototype.slice.call(selectEl.options) : [];
      for (var i = 0; i < opts.length; i++) {
        var opt = opts[i];
        if (!opt) continue;
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "voice-picker-option" + (opt.selected ? " is-selected" : "");
        btn.setAttribute("role", "option");
        btn.setAttribute("aria-selected", opt.selected ? "true" : "false");
        btn.dataset.value = String(opt.value || "");
        btn.textContent = String(opt.textContent || "");
        btn.addEventListener("click", function (ev) {
          ev.preventDefault();
          var v = this && this.dataset ? this.dataset.value : "";
          if (selectEl.value !== v) {
            selectEl.value = v;
            try { selectEl.dispatchEvent(new Event("change", { bubbles: true })); } catch (e0) {}
          } else {
            syncCustomDropdown(selectEl, dropdownEl, toggleEl, listEl);
          }
          closeVoiceDropdowns();
        });
        listEl.appendChild(btn);
      }
      syncCustomToggleText(selectEl, toggleEl);
    }

    function bindCustomDropdown(dropdownEl, toggleEl, listEl) {
      if (!dropdownEl || !toggleEl || !listEl) return;
      if (dropdownEl.__fbBound) return;
      dropdownEl.__fbBound = true;
      toggleEl.addEventListener("click", function (ev) {
        ev.preventDefault();
        var open = dropdownEl.classList.contains("is-open");
        closeVoiceDropdowns();
        if (!open) {
          dropdownEl.classList.add("is-open");
          toggleEl.setAttribute("aria-expanded", "true");
        }
      });
    }

    function titleCasePart(part) {
      var p = String(part || "").toLowerCase();
      if (!p) return "";
      return p.charAt(0).toUpperCase() + p.slice(1);
    }

    function buildLangLabel(tag) {
      var raw = String(tag || "").trim();
      if (!raw) return "";
      var norm = normalizeLangTag(raw);
      var parts = norm.split("-");
      var langCode = parts[0] || "";
      var regionCode = parts[1] ? parts[1].toUpperCase() : "";
      if (norm === "en-us") return "English (United States)";
      try {
        if (typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function") {
          var langNames = new Intl.DisplayNames(["en"], { type: "language" });
          var regionNames = new Intl.DisplayNames(["en"], { type: "region" });
          var langName = langCode ? langNames.of(langCode) : "";
          var regionName = regionCode ? regionNames.of(regionCode) : "";
          if (langName && regionName) return langName + " (" + regionName + ")";
          if (langName) return langName + " (" + raw + ")";
        }
      } catch (e) {}
      if (langCode && regionCode) return titleCasePart(langCode) + " (" + regionCode + ")";
      return raw;
    }

    function uniqueLangsFromVoices(voices) {
      var seen = Object.create(null);
      var out = [];
      for (var i = 0; i < voices.length; i++) {
        var v = voices[i];
        var raw = String((v && v.lang) || "").trim();
        if (!raw) continue;
        var key = normalizeLangTag(raw);
        if (!key || seen[key]) continue;
        seen[key] = true;
        out.push({ key: key, raw: raw });
      }
      out.sort(function (a, b) {
        return buildLangLabel(a.raw).localeCompare(buildLangLabel(b.raw), "en", { sensitivity: "base" });
      });
      return out;
    }

    function stopSpeaking(keepEnabled) {
      clearTimeout(state.restartTimer);
      state.restartTimer = null;
      state.speakPending = false;
      state.token++;
      clearHighlight();
      try { if (synth) synth.cancel(); } catch (e) {}
      setButtonState(false);
      if (!keepEnabled) state.enabled = false;
    }

    function stopAndRevealLastWord() {
      var targetCfi = String(state.lastWordCfi || segToCfi(state.lastSpokenSeg) || "");
      var fallbackPageCfi = String(state.pageStartCfi || "");
      state.resumeFromStopCfi = targetCfi || "";
      state.resumeLocKey = "";
      stopSpeaking(false);
      if (!reader || !reader.rendition || typeof reader.rendition.display !== "function") {
        state.resumeLocKey = String(getLocationKey() || "");
        showStoppedWordHighlight();
        return;
      }
      function afterDisplay() {
        state.resumeLocKey = String(getLocationKey() || "");
        setTimeout(function () { showStoppedWordHighlight(); }, 90);
      }
      if (targetCfi) {
        Promise.resolve(reader.rendition.display(targetCfi)).then(afterDisplay).catch(function () {
          if (fallbackPageCfi) {
            Promise.resolve(reader.rendition.display(fallbackPageCfi)).then(afterDisplay).catch(function () {
              showStoppedWordHighlight();
            });
          } else {
            showStoppedWordHighlight();
          }
        });
        return;
      }
      if (fallbackPageCfi) {
        Promise.resolve(reader.rendition.display(fallbackPageCfi)).then(afterDisplay).catch(function () {
          showStoppedWordHighlight();
        });
        return;
      }
      showStoppedWordHighlight();
    }

    function waitForLocationAdvance(prevLocKey, timeoutMs) {
      return new Promise(function (resolve) {
        var baseline = String(prevLocKey || "");
        if (!baseline) baseline = String(getLocationKey() || "");
        var t0 = Date.now();
        (function poll() {
          var cur = getLocationKey();
          if (cur && baseline && cur !== baseline) return resolve(true);
          if (cur && !baseline) return resolve(true);
          if (Date.now() - t0 > (timeoutMs || 1400)) return resolve(false);
          setTimeout(poll, 60);
        })();
      });
    }

    function waitForRelocated(timeoutMs) {
      return new Promise(function (resolve) {
        var r = null;
        try { r = reader && reader.rendition ? reader.rendition : null; } catch (e0) { r = null; }
        if (!r || typeof r.on !== "function") return resolve(false);
        var done = false;
        var timer = null;
        var handler = function () {
          if (done) return;
          done = true;
          try { if (timer) clearTimeout(timer); } catch (e1) {}
          try { if (typeof r.off === "function") r.off("relocated", handler); } catch (e2) {}
          resolve(true);
        };
        try { r.on("relocated", handler); } catch (e3) { return resolve(false); }
        timer = setTimeout(function () {
          if (done) return;
          done = true;
          try { if (typeof r.off === "function") r.off("relocated", handler); } catch (e4) {}
          resolve(false);
        }, timeoutMs || 1400);
      });
    }

    function runNavAndWait(navFn, prevLocKey, timeoutMs) {
      var tmo = timeoutMs || 1400;
      var relocatedPromise = waitForRelocated(tmo);
      try { navFn(); } catch (e0) {}
      return Promise.all([
        waitForLocationAdvance(prevLocKey, tmo),
        relocatedPromise
      ]).then(function (res) {
        return !!(res && (res[0] || res[1]));
      });
    }

    function requestAutoNextPage() {
      var prevLocKey = getLocationKey();
      var loc = null;
      try {
        loc = reader && reader.rendition && reader.rendition.currentLocation ? reader.rendition.currentLocation() : null;
      } catch (eLoc) { loc = null; }
      var endCfi = String(loc && loc.end && loc.end.cfi ? loc.end.cfi : "");

      try {
        if (typeof window !== "undefined" && typeof window.__fbGoNextPage === "function") {
          return runNavAndWait(function () { window.__fbGoNextPage(); }, prevLocKey, 1400).then(function (ok) {
            if (ok) return true;
            if (reader && reader.rendition && typeof reader.rendition.next === "function") {
              return runNavAndWait(function () { reader.rendition.next(); }, prevLocKey, 1400).then(function (ok2) {
                if (ok2) return true;
                if (endCfi && reader && reader.rendition && typeof reader.rendition.display === "function") {
                  return runNavAndWait(function () { reader.rendition.display(endCfi); }, prevLocKey, 1400);
                }
                return false;
              });
            }
            return false;
          });
        }
      } catch (e0) {}
      try {
        if (reader && reader.rendition && typeof reader.rendition.next === "function") {
          return runNavAndWait(function () { reader.rendition.next(); }, prevLocKey, 1400).then(function (ok3) {
            if (ok3) return true;
            if (endCfi && reader && reader.rendition && typeof reader.rendition.display === "function") {
              return runNavAndWait(function () { reader.rendition.display(endCfi); }, prevLocKey, 1400);
            }
            return false;
          });
        }
      } catch (e1) {}
      return Promise.resolve(false);
    }

    function buildSegments(text) {
      var out = [];
      var i = 0;
      var len = text.length;
      var maxLen = 220;
      while (i < len) {
        var end = Math.min(len, i + maxLen);
        if (end < len) {
          var slice = text.slice(i, end);
          var m = slice.match(/[\.\!\?;:]\s+[^\.\!\?;:]*$/);
          if (m && m.index > 24) end = i + m.index + 1;
        }
        if (end <= i) end = Math.min(len, i + maxLen);
        var segText = text.slice(i, end).trim();
        if (segText) out.push({ start: i, end: end, text: segText });
        i = end;
      }
      if (!out.length && text) out.push({ start: 0, end: text.length, text: text });
      return out;
    }

    function startCurrentPage(expectedLocKey, retriesLeft) {
      if (!state.enabled) return;
      if (!synth || !SpeechUtterance) return;
      var retries = (typeof retriesLeft === "number") ? retriesLeft : 0;
      var resumeCfi = arguments.length > 2 ? String(arguments[2] || "") : "";
      var payload = pagePayload(resumeCfi);
      if (!payload) {
        if (retries > 0) {
          state.restartTimer = setTimeout(function () { startCurrentPage(expectedLocKey, retries - 1); }, 120);
          return;
        }
        stopSpeaking(true);
        return;
      }
      if (expectedLocKey && payload.locKey && payload.locKey !== expectedLocKey && retries > 0) {
        state.restartTimer = setTimeout(function () { startCurrentPage(expectedLocKey, retries - 1); }, 100);
        return;
      }
      state.lastSpokenText = payload.text;
      state.map = payload.map;
      state.doc = payload.doc;
      state.content = payload.content || null;
      state.lastSpokenSeg = null;
      state.lastWordCfi = resumeCfi || "";
      try {
        var loc = reader && reader.rendition && reader.rendition.currentLocation ? reader.rendition.currentLocation() : null;
        state.pageStartCfi = String(loc && loc.start && loc.start.cfi ? loc.start.cfi : "");
      } catch (ePageCfi) {
        state.pageStartCfi = "";
      }
      clearHighlight();

      var myToken = ++state.token;
      var segments = buildSegments(payload.text);
      var voices = synth.getVoices ? (synth.getVoices() || []) : [];
      var voice = pickVoice(voices, payload);
      var segmentSweepTimer = null;
      var segmentSweepStartTimer = null;

      function stopSegmentSweep() {
        try { if (segmentSweepTimer) clearInterval(segmentSweepTimer); } catch (e0) {}
        try { if (segmentSweepStartTimer) clearTimeout(segmentSweepStartTimer); } catch (e1) {}
        segmentSweepTimer = null;
        segmentSweepStartTimer = null;
      }

      function speakSegment(idx) {
        if (!state.enabled || myToken !== state.token) return;
        if (idx >= segments.length) {
          stopSegmentSweep();
          clearHighlight();
          state.speakPending = false;
          state.enabled = false;
          state.resumeFromStopCfi = "";
          state.resumeLocKey = "";
          setButtonState(false);
          return;
        }
        var seg = segments[idx];
        var u = new SpeechUtterance(seg.text);
        var boundarySeen = false;
        var useMobileFallback = isMobileLikeDevice();
        var fallbackWordMs = Math.max(120, Math.min(700, Number(state.fallbackMsPerWord || 240)));
        var fallbackStartDelayMs = Math.max(80, Math.min(320, Math.round(fallbackWordMs * 0.5)));
        var segmentStartedAt = 0;

        function startFallbackSweepIfNeeded() {
          if (!useMobileFallback || boundarySeen || !state.enabled || myToken !== state.token) return;
          var words = [];
          var i = 0;
          for (i = 0; i < state.map.length; i++) {
            var m = state.map[i];
            if (!m) continue;
            if (m.start >= seg.start && m.start < seg.end) words.push(m);
          }
          if (!words.length) return;
          var wi = 0;
          state.lastSpokenSeg = words[wi];
          state.lastWordCfi = segToCfi(words[wi]);
          segmentSweepTimer = setInterval(function () {
            if (boundarySeen || !state.enabled || myToken !== state.token) {
              stopSegmentSweep();
              return;
            }
            var elapsed = Math.max(0, Date.now() - segmentStartedAt);
            var target = Math.min(words.length - 1, Math.floor(elapsed / fallbackWordMs));
            if (target > wi) wi = target;
            if (words[wi]) {
              state.lastSpokenSeg = words[wi];
              state.lastWordCfi = segToCfi(words[wi]);
            }
            if (wi >= words.length - 1) {
              stopSegmentSweep();
              return;
            }
          }, 60);
        }

        if (voice) {
          u.voice = voice;
          if (voice.lang) u.lang = voice.lang;
        }
        u.onstart = function () {
          if (!state.enabled || myToken !== state.token) return;
          state.speakPending = false;
          setButtonState(true);
          segmentStartedAt = Date.now();
          stopSegmentSweep();
          segmentSweepStartTimer = setTimeout(startFallbackSweepIfNeeded, fallbackStartDelayMs);
        };
        u.onboundary = function (ev) {
          if (!state.enabled || myToken !== state.token) return;
          if (!ev || typeof ev.charIndex !== "number") return;
          boundarySeen = true;
          stopSegmentSweep();
          var segRef = getMapSegAt(seg.start + Math.max(0, ev.charIndex));
          if (segRef) {
            state.lastSpokenSeg = segRef;
            state.lastWordCfi = segToCfi(segRef);
          }
        };
        u.onend = function () {
          if (!state.enabled || myToken !== state.token) return;
          if (useMobileFallback && !boundarySeen && segmentStartedAt > 0) {
            var wordsCount = 0;
            for (var wi0 = 0; wi0 < state.map.length; wi0++) {
              var wm = state.map[wi0];
              if (wm && wm.start >= seg.start && wm.start < seg.end) wordsCount++;
            }
            if (wordsCount > 0) {
              var measured = Math.round((Date.now() - segmentStartedAt) / wordsCount);
              measured = Math.max(120, Math.min(700, measured));
              state.fallbackMsPerWord = Math.round((state.fallbackMsPerWord * 0.75) + (measured * 0.25));
            }
          }
          stopSegmentSweep();
          var tailSeg = getMapSegAt(seg.end - 1);
          if (tailSeg) {
            state.lastSpokenSeg = tailSeg;
            state.lastWordCfi = segToCfi(tailSeg);
          }
          speakSegment(idx + 1);
        };
        u.onerror = function () {
          if (!state.enabled || myToken !== state.token) return;
          stopSegmentSweep();
          state.speakPending = false;
          clearHighlight();
          state.enabled = false;
          setButtonState(false);
        };
        try {
          synth.speak(u);
        } catch (e2) {
          stopSegmentSweep();
          state.speakPending = false;
          clearHighlight();
          state.enabled = false;
          setButtonState(false);
        }
      }

      try {
        synth.cancel();
        state.speakPending = true;
        setButtonState(true);
        speakSegment(0);
      } catch (e) {
        state.speakPending = false;
        state.enabled = false;
        setButtonState(false);
      }
    }

    function restartCurrentPage() {
      if (!state.enabled) return;
      var expectedLocKey = getLocationKey();
      stopSpeaking(true);
      state.restartTimer = setTimeout(function () {
        if (!state.enabled) return;
        startCurrentPage(expectedLocKey, 8);
      }, 160);
    }

    function toggleSpeech() {
      if (!synth || !SpeechUtterance) return;
      if (state.enabled) {
        stopAndRevealLastWord();
        return;
      }
      state.enabled = true;
      // iOS Safari may block delayed speak() calls that are no longer in the
      // original click gesture chain. Reset this guard so the first call
      // starts immediately from the user tap.
      state.lastSpokenText = "";
      setButtonState(true);
      var currentLocKey = String(getLocationKey() || "");
      var resumeCfi = state.resumeFromStopCfi ? String(state.resumeFromStopCfi || "") : "";
      state.resumeFromStopCfi = "";
      state.resumeLocKey = "";
      startCurrentPage(currentLocKey, 20, resumeCfi);
    }

    function setVoiceMessage(txt) {
      if (!voiceStatus) return;
      voiceStatus.textContent = txt || "";
    }

    function loadSavedVoice() {
      try { state.selectedVoiceURI = localStorage.getItem(VOICE_KEY) || null; } catch (e) { state.selectedVoiceURI = null; }
      try {
        var savedLang = localStorage.getItem(VOICE_LANG_KEY) || "";
        if (savedLang) state.selectedVoiceLang = savedLang;
      } catch (e2) {}
    }

    function saveVoice(uri) {
      state.selectedVoiceURI = uri || null;
      try {
        if (uri) localStorage.setItem(VOICE_KEY, uri);
        else localStorage.removeItem(VOICE_KEY);
      } catch (e) {}
    }

    function saveVoiceLang(lang) {
      state.selectedVoiceLang = lang || "";
      try {
        if (state.selectedVoiceLang) localStorage.setItem(VOICE_LANG_KEY, state.selectedVoiceLang);
        else localStorage.removeItem(VOICE_LANG_KEY);
      } catch (e) {}
    }

    function getCurrentBookId() {
      try {
        var params = new URLSearchParams(window.location.search || "");
        var id = String(params.get("id") || params.get("i") || "").trim();
        if (/^\d+$/.test(id)) return id;
      } catch (e0) {}
      return "";
    }

    function queueDriveDetectedLangSync(lang) {
      var normalized = normalizeLangTag(lang || "");
      if (!normalized) return;
      try {
        if (driveLangSyncTimer) {
          clearTimeout(driveLangSyncTimer);
          driveLangSyncTimer = null;
        }
      } catch (e0) {}
      driveLangSyncTimer = setTimeout(function () {
        driveLangSyncTimer = null;
        try {
          var sync = window.ReaderPubDriveSync || null;
          if (!sync || typeof sync.setLastDetectedTtsLanguage !== "function") return;
          sync.setLastDetectedTtsLanguage(normalized, { bookId: getCurrentBookId() }, { interactive: false }).catch(function () {});
        } catch (e1) {}
      }, 220);
    }

    function hydrateVoiceLangFromDrive() {
      try {
        var sync = window.ReaderPubDriveSync || null;
        if (!sync || typeof sync.pullSnapshot !== "function" || typeof sync.getLastDetectedTtsLanguage !== "function") return;
        sync.pullSnapshot({ interactive: false }).then(function (snapshot) {
          var fromDrive = normalizeLangTag(sync.getLastDetectedTtsLanguage(snapshot) || "");
          if (!fromDrive) return;
          saveVoiceLang(fromDrive);
          refreshVoiceList();
        }).catch(function () {});
      } catch (e0) {}
    }

    function refreshVoiceList(opts) {
      if (!voiceSelect) return;
      var options = opts || {};
      var voices = synth && synth.getVoices ? (synth.getVoices() || []) : [];
      var langs = uniqueLangsFromVoices(voices);
      var savedLang = normalizeLangTag(state.selectedVoiceLang || "");
      var bookLang = getCurrentBookLang();
      var defaultUs = "en-us";
      var fallbackUs = matchLangKey(defaultUs, langs);
      var matchedBookLang = matchLangKey(bookLang, langs);
      var matchedSavedLang = matchLangKey(savedLang, langs);
      var keepSelection = !!options.keepSelection;
      var wantLang = "";

      if (keepSelection && matchedSavedLang) {
        wantLang = matchedSavedLang;
      } else if (matchedBookLang) {
        wantLang = matchedBookLang;
      } else if (matchedSavedLang) {
        wantLang = matchedSavedLang;
      } else if (fallbackUs) {
        wantLang = fallbackUs;
      } else {
        wantLang = langs[0] ? langs[0].key : "";
      }

      var topKey = "";
      if (matchedBookLang) {
        topKey = matchedBookLang;
      } else if (matchedSavedLang) {
        topKey = matchedSavedLang;
      } else if (fallbackUs) {
        topKey = fallbackUs;
      } else {
        topKey = langs[0] ? langs[0].key : "";
      }
      if (topKey && langs.length > 1) {
        var topIdx = -1;
        for (var ti = 0; ti < langs.length; ti++) {
          if (langs[ti] && langs[ti].key === topKey) { topIdx = ti; break; }
        }
        if (topIdx > 0) {
          var topItem = langs.splice(topIdx, 1)[0];
          langs.unshift(topItem);
        }
      }

      if (voiceLangSelect) {
        voiceLangSelect.innerHTML = "";
        for (var li = 0; li < langs.length; li++) {
          var lo = document.createElement("option");
          lo.value = langs[li].key;
          lo.textContent = buildLangLabel(langs[li].raw);
          if (langs[li].key === wantLang) lo.selected = true;
          voiceLangSelect.appendChild(lo);
        }
        if (voiceLangSelect.value) wantLang = normalizeLangTag(voiceLangSelect.value);
      }
      saveVoiceLang(wantLang);
      queueDriveDetectedLangSync(wantLang);

      voiceSelect.innerHTML = "";
      if (!voices.length) {
        setVoiceMessage("No system voices found. Install a voice in your device settings.");
        return;
      }
      var filtered = [];
      for (var vi = 0; vi < voices.length; vi++) {
        var vv = voices[vi];
        if (!vv) continue;
        if (!wantLang || normalizeLangTag(vv.lang || "") === wantLang) filtered.push(vv);
      }
      filtered.sort(function (a, b) {
        var an = String((a && a.name) || "");
        var bn = String((b && b.name) || "");
        var byName = an.localeCompare(bn, "en", { sensitivity: "base" });
        if (byName !== 0) return byName;
        var al = String((a && a.lang) || "");
        var bl = String((b && b.lang) || "");
        return al.localeCompare(bl, "en", { sensitivity: "base" });
      });
      if (!filtered.length) {
        setVoiceMessage("No voices found for the selected language.");
        syncCustomDropdown(voiceLangSelect, voiceLangDropdown, voiceLangToggle, voiceLangList);
        syncCustomDropdown(voiceSelect, voiceDropdown, voiceToggle, voiceList);
        return;
      }
      setVoiceMessage("Select a voice for reading aloud.");
      filtered.forEach(function (v) {
        if (!v) return;
        var opt = document.createElement("option");
        opt.value = v.voiceURI || "";
        opt.textContent = (v.name || "Voice") + (v.lang ? (" (" + v.lang + ")") : "");
        if (state.selectedVoiceURI && opt.value === state.selectedVoiceURI) opt.selected = true;
        voiceSelect.appendChild(opt);
      });
      if (!voiceSelect.value && filtered[0] && filtered[0].voiceURI) {
        voiceSelect.value = filtered[0].voiceURI;
        saveVoice(voiceSelect.value);
      }
      syncCustomDropdown(voiceLangSelect, voiceLangDropdown, voiceLangToggle, voiceLangList);
      syncCustomDropdown(voiceSelect, voiceDropdown, voiceToggle, voiceList);
    }

    if (btnDesktop && !btnDesktop.__fbSpeechBound) {
      btnDesktop.__fbSpeechBound = true;
      btnDesktop.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleSpeech();
      });
    }
    if (btnMobile && !btnMobile.__fbSpeechBound) {
      btnMobile.__fbSpeechBound = true;
      btnMobile.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleSpeech();
      });
    }
    if (voiceLangSelect) voiceLangSelect.addEventListener("change", function () {
      saveVoiceLang(normalizeLangTag(voiceLangSelect.value || ""));
      state.selectedVoiceURI = null;
      refreshVoiceList({ keepSelection: true });
    });
    if (voiceSelect) voiceSelect.addEventListener("change", function () {
      saveVoice(voiceSelect.value || "");
      syncCustomDropdown(voiceSelect, voiceDropdown, voiceToggle, voiceList);
    });
    if (synth && "onvoiceschanged" in synth) synth.onvoiceschanged = refreshVoiceList;
    document.addEventListener("fb:voice-opened", function () {
      refreshVoiceList();
    });
    try {
      if (reader && reader.book && reader.book.ready && typeof reader.book.ready.then === "function") {
        reader.book.ready.then(function () {
          refreshVoiceList();
        }).catch(function () {});
      }
    } catch (eReady) {}

    bindCustomDropdown(voiceLangDropdown, voiceLangToggle, voiceLangList);
    bindCustomDropdown(voiceDropdown, voiceToggle, voiceList);
    document.addEventListener("click", function (ev) {
      var t = ev && ev.target ? ev.target : null;
      if (t && t.closest && (t.closest("#voiceLangDropdown") || t.closest("#voiceDropdown"))) return;
      closeVoiceDropdowns();
    }, true);

    loadSavedVoice();
    refreshVoiceList();
    hydrateVoiceLangFromDrive();
    setButtonState(false);
  }

  // -------- init --------
  function waitForReader() {
    return new Promise(function (resolve) {
      var t0 = Date.now();
      (function tick() {
        if (window.reader && window.reader.rendition) return resolve(window.reader);
        if (Date.now() - t0 > 8000) return resolve(null);
        setTimeout(tick, 50);
      })();
    });
  }

  waitForReader().then(function (reader) {
    // Desktop: bars must always be visible. Mobile: start hidden (FBReader-like).
    if (window.__fb_isDesktop) {
      showUi();
    } else {
      hideUi();
    }
    try { scheduleLayoutSync(); } catch (e) {}
    try { installBarResizeObserver(); } catch (e) {}
    try { installUiHiddenObserver(); } catch (e) {}
    try {
      window.addEventListener("resize", scheduleLayoutSync);
      if (window.visualViewport && window.visualViewport.addEventListener) {
        window.visualViewport.addEventListener("resize", scheduleLayoutSync);
        window.visualViewport.addEventListener("scroll", scheduleLayoutSync);
      }
    } catch (e) {}
	    setupOverlays();
      try { setupMobileMoreMenu(); } catch (eMoreMenu) {}
	    // Mobile tap/swipe is handled by reader.js attachSwipeToDoc().
	    // Keep this legacy bridge desktop-only to avoid competing mobile gesture handlers.
	    if (window.__fb_isDesktop) enableIframeGestures(reader);

    // Mobile: ultra-robust center tap toggle (works even when the page is inside an iframe).
    // This is the same approach that worked earlier (fix5): a dedicated center hit layer.
    try { installCenterTapLayer(); } catch (e) {}

    try { setupSpeech(reader); } catch (e) {}

    // Fulltext search UI + engine
    try { setupSearch(reader); } catch (e) {}
    try { setupSelectionToolbar(reader); } catch (e) {}
    try { setupNoteComment(reader); } catch (e) {}
    try { setupNotes(reader); } catch (e) {}

    // Mobile: capture the very first gesture even if it lands on an EPUB.js
    // overlay layer (events may not reach the iframe on the first page).
    // This makes fullscreen enter on the FIRST swipe, not the second.
    try {
      if (!window.__fb_no_fullscreen__ && !window.__fb_disable_auto_fullscreen) {
        var vs = document.getElementById("viewerStack") || document.getElementById("viewer");
        if (vs && !vs.__fbFsCaptureAttached) {
          vs.__fbFsCaptureAttached = true;
          var cap = function () { try { window.__tryFsFromIframe(); } catch(e){} };
          vs.addEventListener("pointerdown", cap, { passive: true, capture: true });
          vs.addEventListener("touchstart", cap, { passive: true, capture: true });
        }
      }
    } catch (e) {}

    // Track current CFI so fullscreen/resizes can restore position.
    try {
      reader.rendition.on("relocated", function (loc) {
        try { window.__fb_last_cfi = loc && loc.start && loc.start.cfi; } catch (e) {}
      });
    } catch (e) {}

    // Keep swipe smooth (GPU hint); also reduces “double” jitter on slow drags in Chrome/Android.

    // Fullscreen transitions can trigger a resize that makes some Android browsers
    // briefly relocate to the start of the spine. We fix this by:
    //  - resizing
    //  - then restoring the last known CFI once (if we detect a jump)
    if (!window.__fb_no_fullscreen__) {
      document.addEventListener("fullscreenchange", function () {
        try {
          if (!reader || !reader.rendition) return;

          var entered = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
          // Mark success only once we have *actually entered* fullscreen.
          if (entered) {
            window.__fb_fsRequestedOnce = true;
            window.__fb_fsPending = false;
          } else {
            // leaving fullscreen: allow re-entry later
            window.__fb_fsRequestedOnce = false;
            window.__fb_fsPending = false;
          }

          var restoreCfi = window.__fb_restore_cfi || window.__fb_last_cfi;

          setTimeout(function () {
            try { reader.rendition.resize(); } catch (e2) {}
            // Only attempt restore if we are in fullscreen (the bug happens on enter)
            if (!entered) return;
            if (!restoreCfi) return;
            // Detect "jump to beginning": section index 0 or missing currentLocation.
            setTimeout(function () {
              try {
                if (reader.__fbRestoring) return;
                var loc = null;
                try { loc = reader.rendition.currentLocation && reader.rendition.currentLocation(); } catch(e3) {}
                var curCfi = loc && loc.start && loc.start.cfi;
                var jumped = !curCfi;
                // If we have a current CFI but it differs, we still may have jumped.
                if (curCfi && restoreCfi && curCfi !== restoreCfi) {
                  // Heuristic: many WebViews jump to the very start CFI.
                  if (curCfi.indexOf("epubcfi(/6/") === 0) jumped = true;
                }
                if (jumped) {
                  reader.__fbRestoring = true;
                  reader.rendition.display(restoreCfi).finally(function(){ reader.__fbRestoring = false; });
                }
              } catch (e4) { try { reader.__fbRestoring = false; } catch(e5){} }
            }, 80);
          }, 60);
        } catch (e) {}
      });
    }

    try {
      var vs = document.getElementById("viewerStack");
      if (vs) vs.style.willChange = "transform";
      var vcur = document.getElementById("viewer-current");
      if (vcur) vcur.style.willChange = "transform";
    } catch (e) {}
  });
})();
