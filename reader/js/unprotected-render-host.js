(function (global) {
  "use strict";

  if (!global) return;

  function ensureShellStyle() {
    if (document.getElementById("__readerpub_unprotected_runtime_new_css")) return;
    var style = document.createElement("style");
    style.id = "__readerpub_unprotected_runtime_new_css";
    style.textContent = [
      "body.unprotected-runtime-new #viewerStack{background:#f7f2e8;overflow:hidden;-webkit-tap-highlight-color:transparent!important;}",
      "body.unprotected-runtime-new #viewer-prev, body.unprotected-runtime-new #viewer-next, body.unprotected-runtime-new #swipe-shadow{display:none!important;}",
      "body.unprotected-runtime-unified-shell #viewer, body.unprotected-runtime-unified-shell #viewerStack.swiping #viewer{background:transparent!important;}",
      "body.unprotected-runtime-unified-shell #loader{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;}",
      "body.unprotected-runtime-unified-shell #page-count{visibility:visible;}",
      "body.unprotected-runtime-unified-shell #themeToggle, body.unprotected-runtime-unified-shell #ttsToggleDesktop, body.unprotected-runtime-unified-shell #bookmark{display:inline-flex!important;}",
      "body.unprotected-runtime-unified-shell #mobileMoreToggle, body.unprotected-runtime-unified-shell #mobileMorePanel, body.unprotected-runtime-unified-shell #mobileMoreBackdrop{display:none!important;}",
      "body.unprotected-runtime-unified-shell #title-controls > #ttsToggleDesktop, body.unprotected-runtime-unified-shell #title-controls > #themeToggle{display:inline-flex;align-items:center;justify-content:center;margin:0!important;width:32px;min-width:32px;height:32px;padding:0;border-radius:0;background:transparent;border:0;box-sizing:border-box;}",
      "body.unprotected-runtime-unified-shell #ttsToggleDesktop .tts-icon, body.unprotected-runtime-unified-shell #themeToggle .theme-icon{width:20px;height:20px;object-fit:contain;}",
      "@media (min-width: 820px){body.unprotected-runtime-unified-shell #titlebar{--titlebar-h:43px;min-height:43px!important;height:43px!important;padding-top:3px!important;padding-bottom:3px!important;position:relative;align-items:center;} body.unprotected-runtime-unified-shell #opener, body.unprotected-runtime-unified-shell #slider, body.unprotected-runtime-unified-shell #openNotes, body.unprotected-runtime-unified-shell #openBookmarks, body.unprotected-runtime-unified-shell #overlay-menu{display:none!important;} body.unprotected-runtime-unified-shell #metainfo{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);margin:0;width:min(44vw,620px);max-width:calc(100vw - 420px);justify-content:center;pointer-events:none;text-align:center;} body.unprotected-runtime-unified-shell #metaText{display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;line-height:1.18;} body.unprotected-runtime-unified-shell #book-title, body.unprotected-runtime-unified-shell #chapter-title{width:100%;text-align:center;} body.unprotected-runtime-unified-shell #book-title{font-size:14px;font-weight:600;} body.unprotected-runtime-unified-shell #chapter-title{margin-top:4px;font-size:11px;opacity:.9;} body.unprotected-runtime-unified-shell #title-controls{position:absolute;right:8px;top:50%;transform:translateY(-50%);z-index:2;gap:14px!important;} body.unprotected-runtime-unified-shell #title-controls > #ttsToggleDesktop, body.unprotected-runtime-unified-shell #title-controls > #themeToggle{width:24px;min-width:24px;height:24px;} body.unprotected-runtime-unified-shell #ttsToggleDesktop .tts-icon, body.unprotected-runtime-unified-shell #themeToggle .theme-icon{width:18px;height:18px;} }",
      "@media (orientation: landscape){html.is-phone body.unprotected-runtime-unified-shell #titlebar, html.is-tablet body.unprotected-runtime-unified-shell #titlebar{--titlebar-h:43px;min-height:43px!important;height:43px!important;padding-top:3px!important;padding-bottom:3px!important;position:relative;align-items:center;} html.is-phone body.unprotected-runtime-unified-shell #opener, html.is-tablet body.unprotected-runtime-unified-shell #opener, html.is-phone body.unprotected-runtime-unified-shell #slider, html.is-phone body.unprotected-runtime-unified-shell #openNotes, html.is-phone body.unprotected-runtime-unified-shell #openBookmarks, html.is-phone body.unprotected-runtime-unified-shell #overlay-menu, html.is-tablet body.unprotected-runtime-unified-shell #slider, html.is-tablet body.unprotected-runtime-unified-shell #openNotes, html.is-tablet body.unprotected-runtime-unified-shell #openBookmarks, html.is-tablet body.unprotected-runtime-unified-shell #overlay-menu{display:none!important;} html.is-phone body.unprotected-runtime-unified-shell #metainfo, html.is-tablet body.unprotected-runtime-unified-shell #metainfo{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);margin:0;width:min(44vw,620px);max-width:calc(100vw - 420px);justify-content:center;pointer-events:none;text-align:center;} html.is-phone body.unprotected-runtime-unified-shell #metaText, html.is-tablet body.unprotected-runtime-unified-shell #metaText{display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;line-height:1.18;} html.is-phone body.unprotected-runtime-unified-shell #book-title, html.is-phone body.unprotected-runtime-unified-shell #chapter-title, html.is-tablet body.unprotected-runtime-unified-shell #book-title, html.is-tablet body.unprotected-runtime-unified-shell #chapter-title{width:100%;text-align:center;} html.is-phone body.unprotected-runtime-unified-shell #book-title, html.is-tablet body.unprotected-runtime-unified-shell #book-title{font-size:14px;font-weight:600;} html.is-phone body.unprotected-runtime-unified-shell #chapter-title, html.is-tablet body.unprotected-runtime-unified-shell #chapter-title{margin-top:4px;font-size:11px;opacity:.9;} html.is-phone body.unprotected-runtime-unified-shell #title-controls, html.is-tablet body.unprotected-runtime-unified-shell #title-controls{position:absolute;right:8px;top:50%;transform:translateY(-50%);z-index:2;gap:12px!important;} html.is-phone body.unprotected-runtime-unified-shell #title-controls > #ttsToggleDesktop, html.is-phone body.unprotected-runtime-unified-shell #title-controls > #themeToggle, html.is-tablet body.unprotected-runtime-unified-shell #title-controls > #ttsToggleDesktop, html.is-tablet body.unprotected-runtime-unified-shell #title-controls > #themeToggle{width:28px;min-width:28px;} }",
      "body.unprotected-runtime-unified-shell #prev, body.unprotected-runtime-unified-shell #next{appearance:none;-webkit-appearance:none;width:78px;z-index:9;opacity:0;color:transparent;background:transparent!important;font-size:0!important;line-height:0!important;text-indent:-10000px;overflow:hidden;transition:opacity 160ms ease;outline:none!important;box-shadow:none!important;-webkit-tap-highlight-color:transparent!important;touch-action:manipulation;}",
      "body.unprotected-runtime-unified-shell #prev::before, body.unprotected-runtime-unified-shell #next::before{content:none;pointer-events:none;opacity:0;transition:opacity 160ms ease;}",
      "body.unprotected-runtime-unified-shell #prev::after, body.unprotected-runtime-unified-shell #next::after{content:'';position:absolute;width:16px;height:16px;border-top:3px solid rgba(149,149,149,.96);border-right:3px solid rgba(149,149,149,.96);top:50%;left:50%;margin-top:-8px;pointer-events:none;opacity:0;transition:opacity 160ms ease;}",
      "body.unprotected-runtime-unified-shell #next::after{margin-left:-12px;transform:rotate(45deg);}",
      "body.unprotected-runtime-unified-shell #prev::after{margin-left:-4px;transform:rotate(-135deg);}",
      "html.is-desktop body.unprotected-runtime-unified-shell #prev, html.is-desktop body.unprotected-runtime-unified-shell #next, html.is-desktop body.unprotected-runtime-unified-shell #prev::after, html.is-desktop body.unprotected-runtime-unified-shell #next::after{opacity:1;}",
      "@media (orientation: landscape){html.is-phone body.unprotected-runtime-unified-shell #prev, html.is-phone body.unprotected-runtime-unified-shell #next, html.is-tablet body.unprotected-runtime-unified-shell #prev, html.is-tablet body.unprotected-runtime-unified-shell #next{display:flex!important;opacity:1;} html.is-phone body.unprotected-runtime-unified-shell #prev::after, html.is-phone body.unprotected-runtime-unified-shell #next::after, html.is-tablet body.unprotected-runtime-unified-shell #prev::after, html.is-tablet body.unprotected-runtime-unified-shell #next::after{opacity:1;}}",
      ".readerpub-unprotected-runtime-root{position:relative;width:100%;height:100%;overflow:hidden;padding:0;box-sizing:border-box;background:transparent;color:var(--reader-runtime-fg,#20160f);font-size:calc(18px * var(--reader-runtime-font-scale,1));line-height:1.7;}",
      ".readerpub-unprotected-runtime-root[data-theme='dark']{background:transparent;color:#eef1f6;}",
      ".readerpub-unprotected-runtime-card{max-width:none;height:100%;margin:0 auto;display:flex;align-items:stretch;}",
      ".readerpub-unprotected-runtime-page-shell{position:relative;display:flex;flex-direction:column;justify-content:flex-start;width:min(78vw,920px);max-width:calc(100% - 120px);min-height:100%;margin:0 auto;padding:38px 0 34px;background:transparent;box-shadow:none;border-radius:0;box-sizing:border-box;}",
      ".readerpub-unprotected-runtime-page-shell-shared{width:100%;max-width:none;height:100%;min-height:0;padding:18px 70px 26px;overflow:hidden;}",
      ".readerpub-unprotected-runtime-page-head,.readerpub-unprotected-runtime-kicker,.readerpub-unprotected-runtime-title,.readerpub-unprotected-runtime-meta,.readerpub-unprotected-runtime-page-meta,.readerpub-unprotected-runtime-section-title,.readerpub-unprotected-runtime-divider,.readerpub-unprotected-runtime-page-footer{display:none!important;}",
      ".readerpub-unprotected-runtime-section{flex:1;display:flex;flex-direction:column;justify-content:flex-start;gap:14px;}",
      ".readerpub-unprotected-runtime-paragraph{margin:0;white-space:pre-wrap;}",
      ".readerpub-unprotected-runtime-page-shell-shared .readerpub-unprotected-runtime-shared-heading{display:block;text-align:center;margin:0 0 28px;flex:0 0 auto;}",
      ".readerpub-unprotected-runtime-page-shell-shared .readerpub-unprotected-runtime-shared-title{margin:0;color:inherit;font-size:26px;line-height:1.18;font-weight:500;letter-spacing:.01em;}",
      ".readerpub-unprotected-runtime-page-shell-shared .readerpub-unprotected-runtime-section{display:block;flex:1 1 auto;height:100%;column-count:2;column-gap:92px;column-fill:auto;}",
      ".readerpub-unprotected-runtime-page-shell-shared .readerpub-unprotected-runtime-paragraph{font-size:18px;line-height:1.68;text-align:left;break-inside:avoid;orphans:3;widows:3;margin:0 0 18px;}",
      ".readerpub-unprotected-runtime-page-shell-shared .readerpub-unprotected-runtime-paragraph[data-role='lead']{margin-top:4px;}",
      ".readerpub-unprotected-runtime-page-shell-shared .readerpub-unprotected-runtime-paragraph[data-role='lead']::first-letter{float:left;font-size:96px;line-height:.82;padding:8px 12px 0 0;font-weight:500;}",
      ".readerpub-unprotected-runtime-empty{opacity:.72;font-style:italic;}",
      ".readerpub-unprotected-runtime-nav{display:none!important;}",
      ".readerpub-unprotected-runtime-search-hit{background:rgba(255,214,10,.45);padding:0 .06em;border-radius:.15em;}",
      ".readerpub-unprotected-runtime-note-hit{background:rgba(118,178,255,.28);padding:0 .06em;border-radius:.15em;}",
      ".readerpub-unprotected-runtime-highlight-hit{background:rgba(255,245,157,.75);padding:0 .06em;border-radius:.15em;}",
      ".readerpub-unprotected-runtime-error{color:#a31b1b;font-weight:600;}",
      ".readerpub-unprotected-runtime-measure{position:absolute;left:-99999px;top:-99999px;visibility:hidden;pointer-events:none;overflow:hidden;}",
      "@media (max-width: 1100px){.readerpub-unprotected-runtime-page-shell-shared{padding:18px 44px 22px;}.readerpub-unprotected-runtime-page-shell-shared .readerpub-unprotected-runtime-section{column-gap:56px;}.readerpub-unprotected-runtime-page-shell-shared .readerpub-unprotected-runtime-paragraph{font-size:17px;line-height:1.62;}.readerpub-unprotected-runtime-page-shell-shared .readerpub-unprotected-runtime-shared-title{font-size:24px;}}",
      "@media (max-width: 900px){.readerpub-unprotected-runtime-page-shell{width:min(88vw,720px);max-width:calc(100% - 56px);padding:28px 0 20px;}.readerpub-unprotected-runtime-page-shell-shared{padding:16px 24px 18px;}.readerpub-unprotected-runtime-page-shell-shared .readerpub-unprotected-runtime-section{column-count:1;column-gap:0;}.readerpub-unprotected-runtime-page-shell-shared .readerpub-unprotected-runtime-paragraph[data-role='lead']::first-letter{float:none;font-size:inherit;line-height:inherit;padding:0;font-weight:inherit;}}"
    ].join("");
    document.head.appendChild(style);
  }

  function createRenderHost(config) {
    config = config || {};
    ensureShellStyle();
    var sharedShellMode = String(config.sharedShellMode || "").trim().toLowerCase() === "protected-old-shell";
    var viewer = config.hostRoot || document.getElementById("viewer");
    var viewerStack = document.getElementById("viewerStack");
    if (!viewer || !viewerStack) throw new Error("Missing viewer host");

    document.body.classList.add("unprotected-runtime-new");
    document.body.classList.remove("ui-hidden");
    if (sharedShellMode) {
      document.body.classList.add("unprotected-old-shell");
    }

    viewer.innerHTML = "";
    var root = document.createElement("div");
    root.className = "readerpub-unprotected-runtime-root reader-frame";
    root.setAttribute("data-readerpub-unprotected-runtime-root", "true");
    root.setAttribute("data-readerpub-unified-reader-surface", sharedShellMode ? "old-shell" : "direct");
    root.setAttribute("data-theme", "light");
    root.setAttribute("data-runtime-path", "new");
    viewer.appendChild(root);
    var navPrevButton = null;
    var navNextButton = null;
    if (!sharedShellMode) {
      navPrevButton = document.createElement("button");
      navPrevButton.type = "button";
      navPrevButton.className = "readerpub-unprotected-runtime-nav readerpub-unprotected-runtime-nav-prev";
      navPrevButton.setAttribute("aria-label", "Previous page");
      navPrevButton.innerHTML = "&#8249;";
      viewer.appendChild(navPrevButton);
      navNextButton = document.createElement("button");
      navNextButton.type = "button";
      navNextButton.className = "readerpub-unprotected-runtime-nav readerpub-unprotected-runtime-nav-next";
      navNextButton.setAttribute("aria-label", "Next page");
      navNextButton.innerHTML = "&#8250;";
      viewer.appendChild(navNextButton);
    }
    var measureRoot = document.createElement("div");
    measureRoot.className = "readerpub-unprotected-runtime-root readerpub-unprotected-runtime-measure";
    measureRoot.setAttribute("data-theme", "light");
    viewer.appendChild(measureRoot);

    function setTheme(theme, fontScale) {
      root.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
      root.style.setProperty("--reader-runtime-font-scale", String(fontScale || 1));
      measureRoot.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
      measureRoot.style.setProperty("--reader-runtime-font-scale", String(fontScale || 1));
      if (theme === "dark") document.body.classList.add("dark-ui");
      else document.body.classList.remove("dark-ui");
    }

    function buildPageMarkup(book, location, section, pageModel) {
      var state = pageModel && pageModel.runtimeState ? pageModel.runtimeState : null;
      var sectionTitle = String(section && section.title || location && location.title || "").trim();
      var parts = [
        '<div class="readerpub-unprotected-runtime-card">',
        '<article class="readerpub-unprotected-runtime-page-shell' + (sharedShellMode ? " readerpub-unprotected-runtime-page-shell-shared" : "") + '">',
        sharedShellMode && sectionTitle
          ? '<header class="readerpub-unprotected-runtime-shared-heading"><h2 class="readerpub-unprotected-runtime-shared-title">' + escapeHtml(sectionTitle) + "</h2></header>"
          : "",
        '<section class="readerpub-unprotected-runtime-section">'
      ];
      var paragraphs = pageModel && Array.isArray(pageModel.blocks) ? pageModel.blocks : [];
      if (sharedShellMode && sectionTitle && paragraphs.length) {
        var first = String(paragraphs[0] || "").replace(/\s+/g, " ").trim().toLowerCase();
        var titleProbe = sectionTitle.replace(/\s+/g, " ").trim().toLowerCase();
        if (first === titleProbe || first.indexOf(titleProbe) === 0) {
          paragraphs = paragraphs.slice(1);
        }
      }
      if (!paragraphs.length) {
        parts.push('<p class="readerpub-unprotected-runtime-empty">No meaningful content extracted for this page yet.</p>');
      } else {
        for (var i = 0; i < paragraphs.length; i += 1) {
          parts.push('<p class="readerpub-unprotected-runtime-paragraph"' + (sharedShellMode && i === 0 ? ' data-role="lead"' : "") + '>' + decorateText(String(paragraphs[i] || ""), location, state) + "</p>");
        }
      }
      parts.push("</section>");
      parts.push("</article></div>");
      return parts.join("");
    }

    function getViewport() {
      return {
        width: Math.max(viewer.clientWidth || 0, root.clientWidth || 0, 320),
        height: Math.max(viewer.clientHeight || 0, root.clientHeight || 0, 480)
      };
    }

    function assignMeasureHtml(html, viewport, theme, fontScale) {
      measureRoot.style.width = String(viewport.width) + "px";
      measureRoot.style.height = String(viewport.height) + "px";
      measureRoot.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
      measureRoot.style.setProperty("--reader-runtime-font-scale", String(fontScale || 1));
      measureRoot.innerHTML = html;
    }

    function measureFits() {
      var heightFits = measureRoot.scrollHeight <= measureRoot.clientHeight + 1;
      if (!sharedShellMode) return heightFits;
      var widthFits = measureRoot.scrollWidth <= measureRoot.clientWidth + 1;
      return heightFits && widthFits;
    }

    function textToWords(text) {
      return String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    }

    function escapeRegExp(value) {
      return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function collectDecorations(location, runtimeState) {
      var decorations = [];
      var pageToken = String(location && location.pageToken || "");
      var annotations = runtimeState && runtimeState.annotations && Array.isArray(runtimeState.annotations.items)
        ? runtimeState.annotations.items
        : [];
      for (var i = 0; i < annotations.length; i += 1) {
        var item = annotations[i];
        if (!item || String(item.pageToken || "") !== pageToken || !item.quote) continue;
        decorations.push({
          text: String(item.quote || ""),
          className: item.type === "note" ? "readerpub-unprotected-runtime-note-hit" : "readerpub-unprotected-runtime-highlight-hit"
        });
      }
      var search = runtimeState && runtimeState.search ? runtimeState.search : null;
      if (search && search.active && Array.isArray(search.results) && Number(search.currentMatch || 0) > 0) {
        var result = search.results[Number(search.currentMatch || 1) - 1];
        if (result && String(result.pageToken || "") === pageToken && result.query) {
          decorations.push({
            text: String(result.query || ""),
            className: "readerpub-unprotected-runtime-search-hit"
          });
        }
      }
      return decorations;
    }

    function decorateText(text, location, runtimeState) {
      var safe = escapeHtml(String(text || ""));
      var decorations = collectDecorations(location, runtimeState);
      for (var i = 0; i < decorations.length; i += 1) {
        var item = decorations[i];
        if (!item.text) continue;
        var re = new RegExp("(" + escapeRegExp(escapeHtml(item.text)) + ")", "i");
        safe = safe.replace(re, '<mark class="' + item.className + '">$1</mark>');
      }
      return safe;
    }

    function joinWords(words) {
      return (words || []).join(" ").trim();
    }

    function estimateSharedShellPageCapacity(viewport, fontScale) {
      var width = Math.max(Number(viewport && viewport.width || 0), 320);
      var height = Math.max(Number(viewport && viewport.height || 0), 480);
      var scale = Math.max(Number(fontScale || 1), 0.8);
      return Math.max(1400, Math.floor((width * height) / (420 * scale)));
    }

    function splitTextByCapacity(text, capacity) {
      var words = textToWords(text);
      if (!words.length) return [];
      var chunks = [];
      var current = [];
      var currentLen = 0;
      for (var i = 0; i < words.length; i += 1) {
        var word = String(words[i] || "");
        var nextLen = currentLen ? (currentLen + 1 + word.length) : word.length;
        if (current.length && nextLen > capacity) {
          chunks.push(joinWords(current));
          current = [word];
          currentLen = word.length;
          continue;
        }
        current.push(word);
        currentLen = nextLen;
      }
      if (current.length) chunks.push(joinWords(current));
      return chunks;
    }

    function paginateSharedShellSection(blocks, capacity) {
      var pages = [];
      var currentBlocks = [];
      var currentLen = 0;

      function flushPage() {
        var filtered = currentBlocks.map(function (item) {
          return String(item || "").trim();
        }).filter(Boolean);
        if (!filtered.length) return;
        pages.push({
          blocks: filtered,
          text: filtered.join("\n\n"),
          previewText: filtered.join(" ").slice(0, 160)
        });
        currentBlocks = [];
        currentLen = 0;
      }

      for (var i = 0; i < blocks.length; i += 1) {
        var block = String(blocks[i] || "").replace(/\s+/g, " ").trim();
        if (!block) continue;
        if (block.length > capacity) {
          var pieces = splitTextByCapacity(block, capacity);
          for (var pieceIndex = 0; pieceIndex < pieces.length; pieceIndex += 1) {
            var piece = String(pieces[pieceIndex] || "").trim();
            if (!piece) continue;
            if (currentBlocks.length && currentLen + piece.length > capacity) flushPage();
            currentBlocks.push(piece);
            currentLen += piece.length;
            flushPage();
          }
          continue;
        }
        if (currentBlocks.length && currentLen + block.length > capacity) flushPage();
        currentBlocks.push(block);
        currentLen += block.length;
      }
      flushPage();
      return pages;
    }

    function splitBlockToFit(baseBlocks, blockText, context) {
      var words = textToWords(blockText);
      if (!words.length) return { fitText: "", remainingText: "" };
      var low = 1;
      var high = words.length;
      var best = 0;
      while (low <= high) {
        var mid = Math.floor((low + high) / 2);
        var candidate = joinWords(words.slice(0, mid));
        assignMeasureHtml(buildPageMarkup(context.book, context.location, context.section, {
          blocks: baseBlocks.concat(candidate),
          footerLabel: context.location.label
        }), context.viewport, context.theme, context.fontScale);
        var fits = measureFits();
        if (fits) {
          best = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      if (!best) {
        var text = String(blockText || "");
        var charLow = 1;
        var charHigh = text.length;
        var charBest = 1;
        while (charLow <= charHigh) {
          var charMid = Math.floor((charLow + charHigh) / 2);
          var charCandidate = text.slice(0, charMid).trim();
          assignMeasureHtml(buildPageMarkup(context.book, context.location, context.section, {
            blocks: baseBlocks.concat(charCandidate),
            footerLabel: context.location.label
          }), context.viewport, context.theme, context.fontScale);
          var charFits = measureFits();
          if (charFits) {
            charBest = charMid;
            charLow = charMid + 1;
          } else {
            charHigh = charMid - 1;
          }
        }
        return {
          fitText: text.slice(0, charBest).trim(),
          remainingText: text.slice(charBest).trim()
        };
      }
      return {
        fitText: joinWords(words.slice(0, best)),
        remainingText: joinWords(words.slice(best))
      };
    }

    function paginateSection(sectionModel, options) {
      options = options || {};
      var book = options.book || {};
      var location = options.location || {};
      var theme = options.theme || "light";
      var fontScale = Number(options.fontScale || 1) || 1;
      var viewport = getViewport();
      var blocks = Array.isArray(sectionModel && sectionModel.blocks) ? sectionModel.blocks.slice() : [];
      if (!blocks.length) blocks = ["No meaningful content extracted for this section yet."];
      if (sharedShellMode) {
        var sharedPages = paginateSharedShellSection(blocks, estimateSharedShellPageCapacity(viewport, fontScale));
        if (!sharedPages.length) {
          sharedPages.push({
            blocks: ["No meaningful content extracted for this section yet."],
            text: "No meaningful content extracted for this section yet.",
            previewText: "No meaningful content extracted for this section yet."
          });
        }
        return {
          viewport: viewport,
          pages: sharedPages
        };
      }
      var pages = [];
      var currentBlocks = [];

      function fitsCandidate(candidateBlocks) {
        assignMeasureHtml(buildPageMarkup(book, location, sectionModel, {
          blocks: candidateBlocks,
          footerLabel: location.label
        }), viewport, theme, fontScale);
        return measureFits();
      }

      function pushPage() {
        var filtered = currentBlocks.map(function (item) {
          return String(item || "").trim();
        }).filter(Boolean);
        if (!filtered.length) return;
        pages.push({
          blocks: filtered,
          text: filtered.join("\n\n"),
          previewText: filtered.join(" ").slice(0, 160)
        });
        currentBlocks = [];
      }

      for (var i = 0; i < blocks.length; i += 1) {
        var remaining = String(blocks[i] || "").replace(/\s+/g, " ").trim();
        if (!remaining) continue;
        while (remaining) {
          var candidate = currentBlocks.concat(remaining);
          if (fitsCandidate(candidate)) {
            currentBlocks.push(remaining);
            remaining = "";
            continue;
          }
          if (!currentBlocks.length) {
            var split = splitBlockToFit([], remaining, {
              book: book,
              location: location,
              section: sectionModel,
              viewport: viewport,
              theme: theme,
              fontScale: fontScale
            });
            currentBlocks.push(split.fitText || remaining.slice(0, 320));
            remaining = String(split.remainingText || "").trim();
            pushPage();
            continue;
          }
          pushPage();
        }
      }
      pushPage();
      if (!pages.length) {
        pages.push({
          blocks: ["No meaningful content extracted for this section yet."],
          text: "No meaningful content extracted for this section yet.",
          previewText: "No meaningful content extracted for this section yet."
        });
      }
      return {
        viewport: viewport,
        pages: pages
      };
    }

    function renderLoading(state) {
      if (navPrevButton) navPrevButton.disabled = true;
      if (navNextButton) navNextButton.disabled = true;
      root.innerHTML = [
        '<div class="readerpub-unprotected-runtime-card">',
        '<article class="readerpub-unprotected-runtime-page-shell">',
        '<p class="readerpub-unprotected-runtime-empty">Loading book...</p>',
        "</article>",
        "</div>"
      ].join("");
      setTheme(state && state.appearance ? state.appearance.theme : "light", state && state.appearance ? state.appearance.fontScale : 1);
    }

    function renderError(state) {
      var book = state && state.book ? state.book : {};
      if (navPrevButton) navPrevButton.disabled = true;
      if (navNextButton) navNextButton.disabled = true;
      root.innerHTML = [
        '<div class="readerpub-unprotected-runtime-card">',
        '<article class="readerpub-unprotected-runtime-page-shell">',
        '<p class="readerpub-unprotected-runtime-error">' + escapeHtml(String(state && state.error || "Unknown error")) + "</p>",
        '<p class="readerpub-unprotected-runtime-empty">' + escapeHtml(String(book.title || book.path || "")) + "</p>",
        "</article>",
        "</div>"
      ].join("");
      setTheme(state && state.appearance ? state.appearance.theme : "light", state && state.appearance ? state.appearance.fontScale : 1);
    }

    function renderReady(state, sectionModel, pageModel) {
      var book = state && state.book ? state.book : {};
      var location = state && state.location ? state.location : {};
      var section = sectionModel || {};
      var model = Object.assign({}, pageModel || {}, { runtimeState: state || null });
      root.innerHTML = buildPageMarkup(book, location, section, model);
      setTheme(state && state.appearance ? state.appearance.theme : "light", state && state.appearance ? state.appearance.fontScale : 1);
      if (navPrevButton) navPrevButton.disabled = !(state && state.location && state.location.canGoPrev);
      if (navNextButton) navNextButton.disabled = !(state && state.location && state.location.canGoNext);
    }

    return {
      root: root,
      navPrevButton: navPrevButton,
      navNextButton: navNextButton,
      paginateSection: paginateSection,
      getViewport: getViewport,
      renderLoading: renderLoading,
      renderError: renderError,
      renderReady: renderReady,
      setTheme: setTheme,
      getMetrics: function () {
        return {
          directRootPresent: !!root.parentNode,
          textLength: String(root.textContent || "").trim().length,
          iframeCount: document.querySelectorAll("#viewerStack iframe, #viewer iframe, #viewer-prev iframe, #viewer-next iframe").length,
          viewport: getViewport()
        };
      }
    };
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  global.ReaderPubUnprotectedRuntimeNew = global.ReaderPubUnprotectedRuntimeNew || {};
  global.ReaderPubUnprotectedRuntimeNew.renderHost = {
    createRenderHost: createRenderHost
  };
})(window);
