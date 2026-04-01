
(function(){
  const UA = navigator.userAgent || "";
  const isIOS = /iP(hone|ad|od)/.test(UA);
  const isIOSBrowser = isIOS && /Safari/.test(UA) && !/(CriOS|FxiOS|EdgiOS|OPiOS)/.test(UA);
  if (isIOSBrowser) document.documentElement.classList.add("ios-safari");
})();

// Robust fullscreen toggle for both desktop and mobile browsers.
// Uses the native Fullscreen API (with vendor fallbacks) and keeps the icon state in sync.
(function () {
  "use strict";

  function fsElement() {
    return (
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement ||
      null
    );
  }

  function isFullscreen() {
    return !!fsElement();
  }

  function requestFullscreen(el) {
    const fn =
      el.requestFullscreen ||
      el.webkitRequestFullscreen ||
      el.mozRequestFullScreen ||
      el.msRequestFullscreen;
    if (fn) return fn.call(el);
    return Promise.reject(new Error("Fullscreen API not available"));
  }

  function exitFullscreen() {
    const fn =
      document.exitFullscreen ||
      document.webkitExitFullscreen ||
      document.mozCancelFullScreen ||
      document.msExitFullscreen;
    if (fn) return fn.call(document);
    return Promise.reject(new Error("Exit fullscreen API not available"));
  }

  function updateIcon(btn) {
    if (!btn) return;
    // Fontello: icon-resize-full (enter), icon-resize-small (exit)
    if (isFullscreen()) {
      btn.classList.remove("icon-resize-full");
      btn.classList.add("icon-resize-small");
      btn.setAttribute("aria-label", "Exit fullscreen");
      btn.setAttribute("title", "Exit fullscreen");
    } else {
      btn.classList.add("icon-resize-full");
      btn.classList.remove("icon-resize-small");
      btn.setAttribute("aria-label", "Fullscreen");
      btn.setAttribute("title", "Fullscreen");
    }
  }

  function bind() {
    const btn = document.getElementById("fullscreen");
    if (!btn) return;

    // Ensure the element behaves like an icon-button
    btn.type = "button";

    // Click = toggle fullscreen
    btn.addEventListener(
      "click",
      function (e) {
        e.preventDefault();
        e.stopPropagation();

        // Some browsers require the request to happen synchronously inside the event handler.
        try {
          if (isFullscreen()) {
            exitFullscreen().catch(function () {});
          } else {
            requestFullscreen(document.documentElement).catch(function () {});
          }
        } finally {
          // Icon will be updated by fullscreenchange; keep a fast fallback.
          setTimeout(function () {
            updateIcon(btn);
          }, 50);
        }
      },
      { passive: false }
    );

    // Sync icon state
    [
      "fullscreenchange",
      "webkitfullscreenchange",
      "mozfullscreenchange",
      "MSFullscreenChange",
    ].forEach(function (evt) {
      document.addEventListener(evt, function () {
        updateIcon(btn);
      });
    });

    updateIcon(btn);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
