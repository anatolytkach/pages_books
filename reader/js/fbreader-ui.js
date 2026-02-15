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
      var vv = window.visualViewport;
      var h = (vv && vv.height) ? vv.height : (window.innerHeight || 0);
      var w = (vv && vv.width) ? vv.width : (window.innerWidth || 0);
      if (h) document.documentElement.style.setProperty("--app-vh", h + "px");
      if (w) document.documentElement.style.setProperty("--app-vw", w + "px");
    } catch (e) {}
  }

  function forceRenditionResize() {
    try {
      if (window.reader) {
        if (window.reader.rendition && window.reader.rendition.resize) window.reader.rendition.resize();
        if (window.reader.renditionPrev && window.reader.renditionPrev.resize) window.reader.renditionPrev.resize();
        if (window.reader.renditionNext && window.reader.renditionNext.resize) window.reader.renditionNext.resize();
      }
    } catch (e) {}
  }

  function scheduleLayoutSync() {
    try {
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
      var hidden = document.body.classList.contains("ui-hidden");
      if (hidden) {
        vs.style.top = "0px";
        vs.style.bottom = "0px";
      } else {
        vs.style.top = (topH || 0) + "px";
        vs.style.bottom = (bottomH || 0) + "px";
      }
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
    document.body.classList.remove("ui-hidden");
    syncBarHeights(false);
  }
  function hideUi() {
    document.body.classList.add("ui-hidden");
    syncBarHeights(false);
  }
  function toggleUi() {
    if (window.__fbSelectionActive) return;
    document.body.classList.toggle("ui-hidden");
    syncBarHeights(false);
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
      if (isTabletViewport && isTabletViewport()) {
        var existingTablet = document.getElementById("fb-tap-layer");
        if (existingTablet && existingTablet.parentNode) existingTablet.parentNode.removeChild(existingTablet);
        return;
      }
    } catch (eTab) {}
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
        var vw = getVisibleViewportWidth();
        var centerW = Math.max(0, Math.round(vw * 0.30));
        var edgeW = Math.max(0, Math.round(vw * (1/3)));
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
        window.__fbTapCenterBounds = { left: left, right: left + centerW, width: vw };
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
      return !!(tgt.closest("#titlebar") || tgt.closest("#bottombar") || tgt.closest(".overlay") || tgt.closest("#overlay-backdrop"));
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

    function findInteractiveNearPoint(x, y) {
      var offsets = [0, 6, -6, 12, -12];
      for (var i = 0; i < offsets.length; i++) {
        for (var j = 0; j < offsets.length; j++) {
          var el = findUnderlyingElementAtPoint(x + offsets[i], y + offsets[j]);
          var inter = closestInteractive(el);
          if (inter) return inter;
        }
      }
      return null;
    }

    function tryToggle(e) {
      // Debounce to avoid double-fire and randomness.
      var now = Date.now();
      if (now - lastToggleAt < 350) return;

      try {
        if (overlaysOpen()) return;
        if (moved) return;
        if (Date.now() - st > 150) return;

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
            var interactive = findInteractiveNearPoint(pt.clientX, pt.clientY);
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
              // Exact hit on any interactive should also pass through.
              try { if (interactive.focus) interactive.focus(); } catch (e2) {}
              try { if (interactive.click) interactive.click(); } catch (e3) {}
              return;
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
        if (!(isTabletViewport && isTabletViewport())) return;
      } catch (eTv) { return; }
      try {
        if (overlaysOpen()) return;
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
            var interactive = findInteractiveNearPoint(pt.clientX, pt.clientY);
            if (interactive) {
              try { if (interactive.focus) interactive.focus(); } catch (eI0) {}
              try { if (interactive.click) interactive.click(); } catch (eI1) {}
              return;
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
    var overlayMenu = document.getElementById("overlay-menu");
    var menuView = document.getElementById("menuView");
    var btnToc = document.getElementById("slider");
    var btnNotes = document.getElementById("openNotes");
    var btnBookmarks = document.getElementById("openBookmarks");
    var closeBtns = Array.prototype.slice.call(document.querySelectorAll(".overlay-close"));

    function closeAll() {
      if (overlayToc) overlayToc.classList.add("hidden");
      if (overlayBookmarks) overlayBookmarks.classList.add("hidden");
      if (overlayNotes) overlayNotes.classList.add("hidden");
      if (overlayMenu) overlayMenu.classList.add("hidden");
      if (overlayMyBooks) overlayMyBooks.classList.add("hidden");
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
        if (overlayToc) overlayToc.classList.remove("hidden");
      } else if (which === "bookmarks") {
        if (overlayToc) overlayToc.classList.add("hidden");
        if (overlayNotes) overlayNotes.classList.add("hidden");
        if (overlayMenu) overlayMenu.classList.add("hidden");
        if (overlayBookmarks) overlayBookmarks.classList.remove("hidden");
      } else if (which === "notes") {
        if (overlayToc) overlayToc.classList.add("hidden");
        if (overlayBookmarks) overlayBookmarks.classList.add("hidden");
        if (overlayMenu) overlayMenu.classList.add("hidden");
        if (overlayNotes) overlayNotes.classList.remove("hidden");
      } else if (which === "menu") {
        if (overlayToc) overlayToc.classList.add("hidden");
        if (overlayBookmarks) overlayBookmarks.classList.add("hidden");
        if (overlayNotes) overlayNotes.classList.add("hidden");
        if (overlayMyBooks) overlayMyBooks.classList.add("hidden");
        if (overlayMenu) overlayMenu.classList.remove("hidden");
      } else if (which === "mybooks") {
        if (overlayToc) overlayToc.classList.add("hidden");
        if (overlayBookmarks) overlayBookmarks.classList.add("hidden");
        if (overlayNotes) overlayNotes.classList.add("hidden");
        if (overlayMenu) overlayMenu.classList.add("hidden");
        if (overlayMyBooks) overlayMyBooks.classList.remove("hidden");
        try {
          if (window.__fbMyBooks && typeof window.__fbMyBooks.ensureCurrentBook === "function") window.__fbMyBooks.ensureCurrentBook();
          if (window.__fbMyBooks && typeof window.__fbMyBooks.syncFromDom === "function") window.__fbMyBooks.syncFromDom();
          if (window.__fbMyBooks && typeof window.__fbMyBooks.render === "function") window.__fbMyBooks.render();
        } catch (e) {}
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
            var centerW = w * 0.30;
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
      mobileCount: document.getElementById("searchCount")
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
      ensureVisibleTimer: null
    };

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
      // On mobile we show arrows+counter only when query is non-empty (FBReader-like).
      var nav = els.mobileBar && els.mobileBar.querySelector(".search-nav");
      if (nav) nav.style.display = v ? "inline-flex" : "none";
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
      // Make sure bars are visible (especially after returning from fullscreen on mobile)
      // before we swap the titlebar layout into the search bar.
      try { showUi(); } catch (e) {}
      state.open = true;
      state.preCfi = getCurrentCfi();
      state.preHref = getCurrentHref();
      state.legacyTextHlCleared = false;
      if (!isDesktopNow()) {
        document.body.classList.add("search-open");
        if (els.mobileBar) els.mobileBar.classList.remove("hidden");
        try { syncBarHeights(); } catch (e) {}
        syncBookmarkIcon();
        // Mobile: do NOT auto-focus. Keyboard must appear only after user taps the input.
      } else {
        try { if (els.deskInput) els.deskInput.focus(); } catch(e){}
      }
      setCountText("0/0");
      refreshSearchUiVisibility();
    }

    function closeSearch() {
      if (!state.open) return;
      state.open = false;
      document.body.classList.remove("search-open");
      if (els.mobileBar) els.mobileBar.classList.add("hidden");
      try { syncBarHeights(); } catch (e) {}
      setDesktopNavVisible(false);
      setMobileNavVisible(false);
      clearHighlight();
      clearLegacyTextHighlightsEverywhere();
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
      if (state.ensureVisibleTimer) {
        try { clearTimeout(state.ensureVisibleTimer); } catch (e) {}
        state.ensureVisibleTimer = null;
      }
      if (state.highlightRetryTimer) {
        try { clearTimeout(state.highlightRetryTimer); } catch (e) {}
        state.highlightRetryTimer = null;
      }
      state.highlightRetryCount = 0;
      state.index = -1;
      state.query = "";
      showClearButtons();
      setCountText("0/0");
      try { if (els.mobileInput) els.mobileInput.value = ""; } catch(e){}
      try { if (els.deskInput) els.deskInput.value = ""; } catch(e){}
    }

    function clearInput() {
      state.query = "";
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
      if (state.ensureVisibleTimer) {
        try { clearTimeout(state.ensureVisibleTimer); } catch (e) {}
        state.ensureVisibleTimer = null;
      }
      if (state.highlightRetryTimer) {
        try { clearTimeout(state.highlightRetryTimer); } catch (e) {}
        state.highlightRetryTimer = null;
      }
      state.highlightRetryCount = 0;
      try { if (els.mobileInput) els.mobileInput.value = ""; } catch(e){}
      try { if (els.deskInput) els.deskInput.value = ""; } catch(e){}
      showClearButtons();
      clearHighlight();
      clearLegacyTextHighlightsEverywhere();
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
          // iOS: use text spans to guarantee visible highlight under text.
          if (__fb_isIOS) {
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
      state.matchIndex = safeIdx;
      state.index = safeIdx;
      setCountText((state.index + 1) + "/" + state.totalMatches);
      state.currentSectionIndex = item.sectionIndex;
      state.currentLocalIndex = item.localIndex;
      var spine = reader.book && reader.book.spine && reader.book.spine.spineItems ? reader.book.spine.spineItems : [];
      var sectionHref = spine[item.sectionIndex] ? spine[item.sectionIndex].href : null;

      var doDisplay = function (targetCfi) {
        if (!targetCfi) return;
        // Clear previous highlight BEFORE display so CFIs resolve on the original DOM.
        clearHighlight();
        state.pendingHighlightCfi = null;
        try {
          reader.rendition.display(targetCfi).then(function () {
            if (!applyHighlightWithCorrection(targetCfi, item)) {
              scheduleHighlightRetry(targetCfi);
              return;
            }
            scheduleEnsureVisible(item);
          }).catch(function () {
            if (!applyHighlightWithCorrection(targetCfi, item)) {
              scheduleHighlightRetry(targetCfi);
              return;
            }
            scheduleEnsureVisible(item);
          });
        } catch (e) {
          if (!applyHighlightWithCorrection(targetCfi, item)) {
            scheduleHighlightRetry(targetCfi);
            return;
          }
          scheduleEnsureVisible(item);
        }
      };

      var contents = getContentsForSectionIndex(item.sectionIndex);
      if (!contents && sectionHref) {
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
          state.matchIndex = 0;
          showMatchByIndex(0);
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
          goBackToLastSearchStart();
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
          runSearch(q);
          // Hide keyboard after submitting.
          try { els.mobileInput.blur(); } catch (err) {}
          return;
        }
        if (e.key === "Escape") closeSearch();
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

    function isDesktopSelectionMode() {
      try {
        if (!window.__fb_isDesktop) return false;
        if (document.documentElement && document.documentElement.classList.contains("is-tablet")) return false;
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
      if (!window.__fb_isDesktop) return;
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

      // Mobile/tablet: disable native selection and use custom long-press selection
      var isMobile = !window.__fb_isDesktop;
      try {
        if (document.documentElement && document.documentElement.classList.contains("is-tablet")) {
          isMobile = true;
        }
      } catch (e0) {}
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
        var lang = "en";
        try {
          lang = (navigator.language || "en").split("-")[0];
        } catch (e) {}
        var trUrl = "https://translate.google.com/?sl=auto&tl=" + encodeURIComponent(lang) + "&text=" + encodeURIComponent(text) + "&op=translate";
        openUrl(trUrl);
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
      setTimeout(function () { try { input.focus(); } catch (e) {} }, 0);
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

    function openNote(note) {
      if (!note || !note.cfi) return;
      try { if (window.__fbClearSelectionToolbar) window.__fbClearSelectionToolbar(); } catch (e0) {}
      try { if (window.__fbShowNoteHighlight) window.__fbShowNoteHighlight(note.cfi, true); } catch (e1) {}
      try {
        var p = reader.rendition.display(note.cfi);
        if (p && typeof p.then === "function") {
          p.then(function () {
            try { if (window.__fbShowNoteHighlight) window.__fbShowNoteHighlight(note.cfi); } catch (e2) {}
          });
        }
      } catch (e3) {}
      try { if (window.__fbCloseOverlays) window.__fbCloseOverlays(); } catch (e3) {}
    }

    function createItem(note) {
      var li = document.createElement("li");
      li.className = "list_item";
      if (note && note.cfi) li.setAttribute("data-cfi", note.cfi);

      var wrap = document.createElement("div");
      wrap.className = "note-text";

      var link = document.createElement("a");
      link.className = "note_link";
      link.href = note && note.cfi ? note.cfi : "#";
      link.textContent = normalizeQuote(note && note.quote);
      link.addEventListener("click", function (event) {
        event.preventDefault();
        openNote(note);
      }, false);

      wrap.appendChild(link);
      if (note && note.comment) {
        var comment = document.createElement("div");
        comment.className = "note-comment";
        comment.textContent = note.comment;
        wrap.appendChild(comment);
      }
      li.appendChild(wrap);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "note-delete";
      btn.setAttribute("aria-label", "Delete note");
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

    window.__fbAddNote = addNote;
    render();
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
    enableIframeGestures(reader);

    // Mobile: ultra-robust center tap toggle (works even when the page is inside an iframe).
    // This is the same approach that worked earlier (fix5): a dedicated center hit layer.
    try { installCenterTapLayer(); } catch (e) {}

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
