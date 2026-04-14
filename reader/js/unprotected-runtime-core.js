(function (global) {
  "use strict";

  if (!global) return;

  function clone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function createRuntimeCore(options) {
    options = options || {};
    var state = options.state;
    var hub = options.events;
    var renderHost = options.renderHost;
    var config = options.config || {};
    var runtimeData = {
      manifest: null,
      sections: [],
      sectionCache: {},
      currentSection: null,
      currentSectionIndex: -1,
      currentPagination: null,
      currentBookPath: "",
      restoreStorageKey: "",
      lastFocusedNoteId: ""
    };

    function emitContractEvents(snapshot, extra) {
      var location = snapshot.location || {};
      var appearance = snapshot.appearance || {};
      var search = snapshot.search || {};
      var annotations = snapshot.annotations || {};
      var selection = snapshot.selection || {};
      var bookmarks = snapshot.bookmarks || {};
      hub.emit("pageChanged", {
        pageLabel: location.label || "",
        globalPageLabel: location.label || "",
        chapterLabel: location.title || "",
        location: clone(location),
        canGoPrev: !!location.canGoPrev,
        canGoNext: !!location.canGoNext,
        source: "unprotected-runtime-new"
      }, extra);
      hub.emit("readingPositionChanged", {
        pageLabel: location.label || "",
        globalPageLabel: location.label || "",
        location: clone(location),
        source: "unprotected-runtime-new"
      }, extra);
      hub.emit("themeChanged", {
        theme: appearance.theme || "light",
        fontScale: Number(appearance.fontScale || 1) || 1,
        source: "unprotected-runtime-new"
      }, extra);
      hub.emit("searchStateChanged", {
        active: !!search.active,
        query: search.query || "",
        totalMatches: Number(search.totalMatches || 0),
        currentMatch: Number(search.currentMatch || 0),
        results: clone(search.results || []),
        status: search.status || "idle",
        implemented: !!search.implemented,
        source: "unprotected-runtime-new"
      }, extra);
      hub.emit("annotationsChanged", {
        annotationCount: Array.isArray(annotations.items) ? annotations.items.length : 0,
        annotations: clone(annotations.items || []),
        implemented: !!annotations.implemented,
        source: "unprotected-runtime-new"
      }, extra);
      hub.emit("selectionChanged", {
        active: !!selection.active,
        selectedChars: Number(String(selection.text || "").length || 0),
        selection: clone(selection),
        source: "unprotected-runtime-new"
      }, extra);
      hub.emit("toolbarStateChanged", {
        visible: !!selection.active,
        source: "unprotected-runtime-new"
      }, extra);
      hub.emit("bookmarkUpdated", {
        bookmarkCount: Array.isArray(bookmarks.items) ? bookmarks.items.length : 0,
        bookmarks: clone(bookmarks.items || []),
        implemented: !!bookmarks.implemented,
        source: "unprotected-runtime-new"
      }, extra);
      if (runtimeData.lastFocusedNoteId) {
        hub.emit("noteFocused", {
          noteId: runtimeData.lastFocusedNoteId,
          source: "unprotected-runtime-new"
        }, extra);
        runtimeData.lastFocusedNoteId = "";
      }
    }

    function setLoading(message) {
      state.setState({
        status: "loading",
        error: ""
      });
      var snapshot = state.getSnapshot();
      renderHost.renderLoading(snapshot);
      emitContractEvents(snapshot, { force: true });
      if (message) {
        var chapterEl = document.getElementById("chapter-title");
        if (chapterEl) chapterEl.textContent = message;
      }
    }

    function setError(message) {
      state.setState({
        status: "error",
        error: String(message || "Unknown error"),
        render: {
          ready: false,
          hostType: "direct",
          iframeCount: renderHost.getMetrics().iframeCount,
          directRootPresent: !!renderHost.root,
          currentSectionTextLength: renderHost.getMetrics().textLength
        }
      });
      var snapshot = state.getSnapshot();
      renderHost.renderError(snapshot);
      emitContractEvents(snapshot, { force: true });
    }

    function parseXml(text) {
      return new DOMParser().parseFromString(String(text || ""), "application/xml");
    }

    function parseHtml(text) {
      return new DOMParser().parseFromString(String(text || ""), "text/html");
    }

    function fetchText(url) {
      return fetch(url, { cache: "no-store" }).then(function (response) {
        if (!response.ok) throw new Error("Fetch failed: " + response.status + " for " + url);
        return response.text();
      });
    }

    function fetchJson(url) {
      return fetch(url, { cache: "no-store" }).then(function (response) {
        if (!response.ok) throw new Error("Fetch failed: " + response.status + " for " + url);
        return response.json();
      });
    }

    function normalizeHref(href, baseUrl) {
      var base = String(baseUrl || "");
      try {
        if (base && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(base)) {
          base = new URL(base, global.location.href).toString();
        }
      } catch (_error) {}
      return new URL(String(href || ""), base || global.location.href).toString();
    }

    function buildRestoreStorageKey(bookPath) {
      return "readerpub:unprotected-runtime-new:location:" + String(bookPath || "");
    }

    function shouldIgnoreRestore(loadOptions) {
      if (!loadOptions) return false;
      if (loadOptions.resetLocation === true) return true;
      var raw = String(loadOptions.resetLocation || "").trim().toLowerCase();
      return raw === "1" || raw === "true" || raw === "yes";
    }

    function parsePageToken(token) {
      var match = /^spine:(\d+)\/page:(\d+)@v1$/.exec(String(token || ""));
      if (!match) return null;
      return {
        sectionIndex: Number(match[1]),
        pageIndex: Number(match[2])
      };
    }

    function readPersistedLocation() {
      if (!runtimeData.restoreStorageKey) return null;
      try {
        var raw = global.localStorage && global.localStorage.getItem(runtimeData.restoreStorageKey);
        if (!raw) return null;
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        if (parsed.pageToken) {
          var tokenTarget = parsePageToken(parsed.pageToken);
          if (tokenTarget) return tokenTarget;
        }
        if (typeof parsed.sectionIndex === "number" && typeof parsed.pageIndex === "number") {
          return {
            sectionIndex: parsed.sectionIndex,
            pageIndex: parsed.pageIndex
          };
        }
      } catch (_error) {}
      return null;
    }

    function persistCurrentLocation(snapshot) {
      var location = snapshot && snapshot.location ? snapshot.location : null;
      if (!location || !runtimeData.restoreStorageKey) return;
      try {
        global.localStorage.setItem(runtimeData.restoreStorageKey, JSON.stringify({
          sectionIndex: Number(location.sectionIndex),
          pageIndex: Number(location.pageIndex),
          pageToken: String(location.pageToken || ""),
          href: String(location.href || ""),
          savedAt: Date.now()
        }));
      } catch (_error) {}
    }

    function extractMetadata(opfDoc) {
      function text(selector) {
        var node = opfDoc.querySelector(selector);
        return node ? String(node.textContent || "").trim() : "";
      }
      return {
        title: text("metadata > title, metadata > dc\\:title, dc\\:title"),
        author: text("metadata > creator, metadata > dc\\:creator, dc\\:creator")
      };
    }

    function buildManifest(opfDoc, opfUrl) {
      var items = {};
      var manifestItems = opfDoc.querySelectorAll("manifest > item");
      for (var i = 0; i < manifestItems.length; i += 1) {
        var node = manifestItems[i];
        var id = String(node.getAttribute("id") || "");
        if (!id) continue;
        items[id] = {
          id: id,
          href: String(node.getAttribute("href") || ""),
          mediaType: String(node.getAttribute("media-type") || ""),
          url: normalizeHref(node.getAttribute("href"), opfUrl)
        };
      }
      var spineNodes = opfDoc.querySelectorAll("spine > itemref");
      var spine = [];
      for (var j = 0; j < spineNodes.length; j += 1) {
        var itemref = spineNodes[j];
        var idref = String(itemref.getAttribute("idref") || "");
        var linear = String(itemref.getAttribute("linear") || "yes").toLowerCase() !== "no";
        if (!items[idref]) continue;
        spine.push({
          idref: idref,
          linear: linear,
          href: items[idref].href,
          url: items[idref].url,
          mediaType: items[idref].mediaType
        });
      }
      return spine.filter(function (item) {
        return item.linear && /html|xhtml/i.test(item.mediaType || "");
      });
    }

    function stripHash(href) {
      return String(href || "").split("#")[0];
    }

    function buildManualTocMap(tocJson) {
      var map = {};
      var items = tocJson && Array.isArray(tocJson.i) ? tocJson.i : [];
      for (var i = 0; i < items.length; i += 1) {
        var entry = items[i];
        var href = stripHash(entry && entry.h);
        if (!href) continue;
        if (!map[href]) map[href] = String(entry.t || "").trim();
      }
      return map;
    }

    function buildTocItemsFromSections(sections) {
      var items = [];
      var source = Array.isArray(sections) ? sections : [];
      for (var i = 0; i < source.length; i += 1) {
        var section = source[i] || {};
        items.push({
          id: "section:" + String(i),
          label: String(section.title || section.href || ("Section " + String(i + 1))).trim() || ("Section " + String(i + 1)),
          href: String(section.href || ""),
          sectionIndex: i
        });
      }
      return items;
    }

    function loadManualReadingOrder(bookPath, entryPath, accumulator, seen) {
      accumulator = accumulator || [];
      seen = seen || {};
      var normalizedEntryPath = String(entryPath || "").trim();
      if (!normalizedEntryPath || seen[normalizedEntryPath]) return Promise.resolve(accumulator);
      seen[normalizedEntryPath] = true;
      var entryUrl = normalizeHref(normalizedEntryPath, bookPath);
      return fetchJson(entryUrl).then(function (payload) {
        var items = payload && Array.isArray(payload.i) ? payload.i : [];
        for (var i = 0; i < items.length; i += 1) {
          var item = items[i];
          if (!item || String(item.l || "yes").toLowerCase() === "no") continue;
          var href = String(item.r || "").trim();
          if (!href) continue;
          accumulator.push({
            idref: String(item.i || href),
            linear: true,
            href: href,
            url: normalizeHref(href, bookPath),
            mediaType: "application/xhtml+xml"
          });
        }
        if (payload && payload.n) {
          return loadManualReadingOrder(bookPath, payload.n, accumulator, seen);
        }
        return accumulator;
      });
    }

    function loadBookFromManualManifest(bookPath, loadOptions) {
      var manifestUrl = normalizeHref("book-manifest.json", bookPath);
      return fetchJson(manifestUrl).then(function (manifestJson) {
        var metadata = manifestJson && manifestJson.metadata ? manifestJson.metadata : {};
        var entryPath = manifestJson && manifestJson.readingOrder ? manifestJson.readingOrder.entry : "";
        if (!entryPath) throw new Error("book-manifest missing readingOrder.entry");
        var tocPath = manifestJson && manifestJson.navigation ? manifestJson.navigation.toc : "";
        var tocPromise = tocPath ? fetchJson(normalizeHref(tocPath, bookPath)).catch(function () { return null; }) : Promise.resolve(null);
        return Promise.all([
          loadManualReadingOrder(bookPath, entryPath, [], {}),
          tocPromise
        ]).then(function (results) {
          var sections = results[0] || [];
          var tocMap = buildManualTocMap(results[1]);
          if (!sections.length) throw new Error("Manual book manifest has no readable sections");
          for (var i = 0; i < sections.length; i += 1) {
            if (tocMap[sections[i].href]) sections[i].title = tocMap[sections[i].href];
          }
          runtimeData.manifest = {
            metadata: {
              title: String(metadata.bookTitle || metadata.title || ""),
              author: String(metadata.creator || (Array.isArray(metadata.creators) ? metadata.creators[0] : "") || "")
            },
            opfUrl: manifestUrl,
            manualManifestUrl: manifestUrl
          };
          runtimeData.sections = sections;
          state.update("book", {
            title: runtimeData.manifest.metadata.title || "",
            author: runtimeData.manifest.metadata.author || "",
            opfUrl: manifestUrl,
            sectionCount: sections.length,
            tocItems: buildTocItemsFromSections(sections)
          });
          return resolveInitialLocationTarget(loadOptions).then(function (initialTarget) {
            if (initialTarget.useRestore && initialTarget.restoreTarget) {
              return loadSectionByIndex(initialTarget.restoreTarget.sectionIndex, {
                pageIndex: initialTarget.restoreTarget.pageIndex
              });
            }
            return loadSectionByIndex(0, { pageIndex: 0, preferReadableStart: true });
          });
        });
      });
    }

    function loadBookFromContainer(bookPath, loadOptions) {
      var containerUrl = String(bookPath || "") + "META-INF/container.xml";
      return fetchText(containerUrl).then(function (containerText) {
        var containerDoc = parseXml(containerText);
        var rootfile = containerDoc.querySelector("rootfile");
        if (!rootfile) throw new Error("container.xml missing rootfile");
        var fullPath = String(rootfile.getAttribute("full-path") || "");
        if (!fullPath) throw new Error("rootfile full-path missing");
        var opfUrl = normalizeHref(fullPath, bookPath);
        return fetchText(opfUrl).then(function (opfText) {
          var opfDoc = parseXml(opfText);
          var metadata = extractMetadata(opfDoc);
          var sections = buildManifest(opfDoc, opfUrl);
          if (!sections.length) throw new Error("No linear HTML spine items found");
          runtimeData.manifest = {
            metadata: metadata,
            opfUrl: opfUrl
          };
          runtimeData.sections = sections;
          state.update("book", {
            title: metadata.title || "",
            author: metadata.author || "",
            opfUrl: opfUrl,
            sectionCount: sections.length,
            tocItems: buildTocItemsFromSections(sections)
          });
          return resolveInitialLocationTarget(loadOptions).then(function (initialTarget) {
            if (initialTarget.useRestore && initialTarget.restoreTarget) {
              return loadSectionByIndex(initialTarget.restoreTarget.sectionIndex, {
                pageIndex: initialTarget.restoreTarget.pageIndex
              });
            }
            return loadSectionByIndex(0, { pageIndex: 0, preferReadableStart: true });
          });
        });
      });
    }

    function extractSectionModel(url, htmlText, index, total, explicitTitle) {
      var normalizedHtml = String(htmlText || "").replace(/<\?xml[^>]*>/gi, "").trim();
      var doc = parseHtml(normalizedHtml);
      var titleNode =
        doc.querySelector("body :not(.pg-boilerplate):not(#pg-header):not(.pgheader) > h1, body :not(.pg-boilerplate):not(#pg-header):not(.pgheader) > h2, body :not(.pg-boilerplate):not(#pg-header):not(.pgheader) > h3") ||
        doc.querySelector("body h1, body h2, body h3, title");
      var title = String(explicitTitle || "").trim() || (titleNode ? String(titleNode.textContent || "").trim() : "");
      var nodes = doc.querySelectorAll("h1, h2, h3, p, li, blockquote");
      var blocks = [];
      var totalChars = 0;
      var strippedText = normalizedHtml
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      for (var i = 0; i < nodes.length; i += 1) {
        var text = String(nodes[i].textContent || "").replace(/\s+/g, " ").trim();
        if (!text) continue;
        if (blocks.indexOf(text) >= 0) continue;
        blocks.push(text);
        totalChars += text.length;
        if (totalChars >= 40000) break;
      }
      if (blocks.length && /<[^>]+>/.test(blocks[0])) {
        blocks = [];
      }
      if (!blocks.length) {
        var bodyText = String(doc.body && doc.body.textContent || "").replace(/\s+/g, " ").trim();
        if (bodyText) {
          for (var cursor = 0; cursor < bodyText.length; cursor += 800) {
            blocks.push(bodyText.slice(cursor, cursor + 800).trim());
          }
        }
      }
      if (blocks.length && /<[^>]+>/.test(blocks[0])) {
        blocks = [];
      }
      if (!blocks.length) {
        if (strippedText) {
          for (var fallbackCursor = 0; fallbackCursor < strippedText.length; fallbackCursor += 800) {
            blocks.push(strippedText.slice(fallbackCursor, fallbackCursor + 800).trim());
          }
        }
      }
      return {
        index: index,
        href: url,
        title: title || "Section " + String(index + 1),
        blocks: blocks,
        label: "Section " + String(index + 1) + "/" + String(total)
      };
    }

    function ensureSectionModel(index) {
      if (runtimeData.sectionCache[index]) return Promise.resolve(runtimeData.sectionCache[index]);
      var section = runtimeData.sections[index];
      if (!section) return Promise.reject(new Error("section_not_found"));
      return fetchText(section.url).then(function (htmlText) {
        var model = extractSectionModel(section.url, htmlText, index, runtimeData.sections.length, section.title);
        runtimeData.sectionCache[index] = model;
        runtimeData.sections[index].title = model.title;
        state.update("book", {
          tocItems: buildTocItemsFromSections(runtimeData.sections)
        });
        return model;
      });
    }

    function sectionLooksSparse(sectionModel) {
      var blocks = Array.isArray(sectionModel && sectionModel.blocks) ? sectionModel.blocks : [];
      if (!blocks.length) return true;
      var joined = blocks.join(" ").replace(/\s+/g, " ").trim();
      if (!joined) return true;
      if (joined.length < 24) return true;
      if (!/[A-Za-zА-Яа-я0-9]/.test(joined)) return true;
      return false;
    }

    function sectionLooksFrontMatter(sectionModel) {
      var title = String(sectionModel && sectionModel.title || "").replace(/\s+/g, " ").trim().toLowerCase();
      var blocks = Array.isArray(sectionModel && sectionModel.blocks) ? sectionModel.blocks : [];
      var joined = blocks.join(" ").replace(/\s+/g, " ").trim().toLowerCase();
      if (!joined) return true;
      var boilerplateSignals = 0;
      if (joined.indexOf("project gutenberg ebook") >= 0) boilerplateSignals += 2;
      if (joined.indexOf("release date:") >= 0) boilerplateSignals += 1;
      if (joined.indexOf("credits:") >= 0) boilerplateSignals += 1;
      if (joined.indexOf("language:") >= 0) boilerplateSignals += 1;
      if (title.indexOf("project gutenberg ebook") >= 0) boilerplateSignals += 2;
      if (/\bcontents\b/.test(joined)) boilerplateSignals += 1;
      var chapterLinkCount = (joined.match(/\bchapter\b/g) || []).length;
      if (chapterLinkCount >= 6) boilerplateSignals += 2;
      return boilerplateSignals >= 3;
    }

    function resolveInitialLocationTarget(loadOptions) {
      if (shouldIgnoreRestore(loadOptions)) {
        return Promise.resolve({ useRestore: false, restoreTarget: null });
      }
      var restoreTarget = readPersistedLocation();
      if (!restoreTarget) {
        return Promise.resolve({ useRestore: false, restoreTarget: null });
      }
      return ensureSectionModel(restoreTarget.sectionIndex).then(function (sectionModel) {
        if ((sectionLooksSparse(sectionModel) || sectionLooksFrontMatter(sectionModel)) && Number(restoreTarget.sectionIndex || 0) <= 6) {
          return { useRestore: false, restoreTarget: null };
        }
        return { useRestore: true, restoreTarget: restoreTarget };
      }).catch(function () {
        return { useRestore: false, restoreTarget: null };
      });
    }

    function paginateSectionModel(sectionIndex, sectionModel, locationSeed) {
      var snapshot = state.getSnapshot();
      return renderHost.paginateSection(sectionModel, {
        book: snapshot.book || {},
        location: locationSeed || snapshot.location || createLocation(sectionIndex, 0, sectionModel, 1),
        theme: snapshot.appearance.theme,
        fontScale: snapshot.appearance.fontScale
      });
    }

    function buildSearchSnippet(text, query) {
      var normalized = String(text || "");
      var needle = String(query || "").toLowerCase();
      var index = normalized.toLowerCase().indexOf(needle);
      if (index < 0) return normalized.slice(0, 180);
      var start = Math.max(0, index - 50);
      var end = Math.min(normalized.length, index + needle.length + 80);
      return normalized.slice(start, end).trim();
    }

    function createPageLabel(sectionIndex, sectionCount, pageIndex, pageCount) {
      return "Page " + String(pageIndex + 1) + "/" + String(pageCount) + " - Section " + String(sectionIndex + 1) + "/" + String(sectionCount);
    }

    function createLocation(sectionIndex, pageIndex, sectionModel, pageCount) {
      var totalSections = runtimeData.sections.length;
      var safePageCount = Math.max(Number(pageCount || 0), 1);
      var safePageIndex = Math.max(0, Math.min(Number(pageIndex || 0), safePageCount - 1));
      return {
        spineIndex: sectionIndex,
        spineCount: totalSections,
        sectionIndex: sectionIndex,
        sectionCount: totalSections,
        href: sectionModel.href,
        title: sectionModel.title,
        label: createPageLabel(sectionIndex, totalSections, safePageIndex, safePageCount),
        pageIndex: safePageIndex,
        pageCount: safePageCount,
        pageToken: "spine:" + String(sectionIndex) + "/page:" + String(safePageIndex) + "@v1",
        canGoPrev: safePageIndex > 0 || sectionIndex > 0,
        canGoNext: safePageIndex < safePageCount - 1 || sectionIndex < totalSections - 1
      };
    }

    function buildPaginationState(sectionIndex, pageIndex, pageCount, viewport, pageModel) {
      var safePageCount = Math.max(Number(pageCount || 0), 1);
      var safePageIndex = Math.max(0, Math.min(Number(pageIndex || 0), safePageCount - 1));
      return {
        ready: true,
        mode: "page-model-v1",
        directRootPresent: true,
        firstRenderableStateReached: true,
        viewportWidth: Number(viewport && viewport.width || 0),
        viewportHeight: Number(viewport && viewport.height || 0),
        currentSectionIndex: sectionIndex,
        currentPageIndex: safePageIndex,
        currentPageCount: safePageCount,
        locationToken: "spine:" + String(sectionIndex) + "/page:" + String(safePageIndex) + "@v1",
        canAdvanceWithinSection: safePageIndex < safePageCount - 1,
        canRetreatWithinSection: safePageIndex > 0,
        boundaryTransitionNeeded: safePageIndex >= safePageCount - 1
          ? (sectionIndex < runtimeData.sections.length - 1 ? "next-section" : "none")
          : (safePageIndex <= 0 ? (sectionIndex > 0 ? "prev-section" : "none") : "none"),
        visibleTextLength: String(pageModel && pageModel.text || "").length
      };
    }

    function findPageIndexForText(paginationModel, queryText) {
      var normalized = String(queryText || "").toLowerCase();
      var pages = paginationModel && Array.isArray(paginationModel.pages) ? paginationModel.pages : [];
      for (var i = 0; i < pages.length; i += 1) {
        if (String(pages[i].text || "").toLowerCase().indexOf(normalized) >= 0) return i;
      }
      return 0;
    }

    function buildResultLocation(sectionIndex, pageIndex, sectionModel, pageCount) {
      return createLocation(sectionIndex, pageIndex, sectionModel, pageCount);
    }

    function updateReadyState(sectionIndex, pageIndex, sectionModel, pageModel, paginationModel) {
      var total = runtimeData.sections.length;
      var snapshot = state.getSnapshot();
      var appearance = snapshot.appearance || { theme: "light", fontScale: 1 };
      var safePageModel = pageModel || { blocks: [], text: "", previewText: "" };
      var pageCount = Math.max(Number(paginationModel && paginationModel.pages && paginationModel.pages.length || 0), 1);
      var location = createLocation(sectionIndex, pageIndex, sectionModel, pageCount);
      var metrics = renderHost.getMetrics();
      state.setState({
        status: "ready",
        error: "",
        book: Object.assign({}, snapshot.book || {}, {
          sectionCount: total
        }),
        location: location,
        pagination: buildPaginationState(sectionIndex, pageIndex, pageCount, paginationModel && paginationModel.viewport, safePageModel),
        render: {
          ready: true,
          hostType: "direct",
          iframeCount: metrics.iframeCount,
          directRootPresent: true,
          currentSectionTextLength: metrics.textLength
        },
        appearance: {
          theme: appearance.theme || "light",
          fontScale: Number(appearance.fontScale || 1) || 1
        },
        selection: {
          implemented: true,
          active: false,
          text: "",
          pageToken: "",
          sectionIndex: -1,
          pageIndex: -1,
          rect: null
        }
      });
      var nextSnapshot = state.getSnapshot();
      renderHost.renderReady(nextSnapshot, sectionModel, safePageModel);
      renderHost.setTheme(nextSnapshot.appearance.theme, nextSnapshot.appearance.fontScale);
      runtimeData.currentSection = sectionModel;
      runtimeData.currentSectionIndex = sectionIndex;
      runtimeData.currentPagination = paginationModel;
      persistCurrentLocation(nextSnapshot);
      emitContractEvents(nextSnapshot, { force: true });
      updateShellLabels(nextSnapshot);
      return nextSnapshot;
    }

    function updateShellLabels(snapshot) {
      var bookTitleEl = document.getElementById("book-title");
      var chapterTitleEl = document.getElementById("chapter-title");
      var pageCountEl = document.getElementById("page-count");
      if (bookTitleEl) bookTitleEl.textContent = snapshot.book.title || "Untitled book";
      if (chapterTitleEl) chapterTitleEl.textContent = snapshot.location.title || "";
      if (pageCountEl) {
        pageCountEl.textContent = snapshot.location.label || "";
        pageCountEl.setAttribute("data-page-counter", snapshot.location.label || "");
      }
      document.title = snapshot.book.title
        ? (snapshot.book.author ? snapshot.book.title + " - " + snapshot.book.author : snapshot.book.title)
        : "ReaderPub";
    }

    function loadSectionByIndex(index, options) {
      var section = runtimeData.sections[index];
      if (!section) return Promise.resolve({ ok: false, code: "section_not_found", index: index });
      setLoading("Loading " + (section.href || ("section-" + String(index + 1))));
      var targetPageIndex = Math.max(0, Number((options && options.pageIndex) || 0) || 0);
      return ensureSectionModel(index).then(function (sectionModel) {
        if (
          options &&
          options.preferReadableStart &&
          runtimeData.sections.length > 1 &&
          (sectionLooksSparse(sectionModel) || sectionLooksFrontMatter(sectionModel))
        ) {
          var nextReadableIndex = index + 1;
          if (nextReadableIndex < runtimeData.sections.length && nextReadableIndex <= 6) {
            return loadSectionByIndex(nextReadableIndex, { pageIndex: 0, preferReadableStart: true });
          }
        }
        var paginationModel = paginateSectionModel(index, sectionModel, createLocation(index, targetPageIndex, sectionModel, 1));
        var safePageIndex = Math.max(0, Math.min(targetPageIndex, paginationModel.pages.length - 1));
        var pageModel = paginationModel.pages[safePageIndex];
        return updateReadyState(index, safePageIndex, sectionModel, pageModel, paginationModel);
      }).then(function (snapshot) {
        return {
          ok: true,
          location: clone(snapshot.location),
          section: clone(runtimeData.currentSection)
        };
      }).catch(function (error) {
        setError(error && error.message ? error.message : String(error));
        return { ok: false, code: "section_load_failed", error: String(error && error.message ? error.message : error) };
      });
    }

    function loadBook(bookPath, loadOptions) {
      loadOptions = loadOptions || {};
      runtimeData.currentBookPath = String(bookPath || "");
      runtimeData.restoreStorageKey = buildRestoreStorageKey(bookPath);
      setLoading("Loading metadata");
      state.update("book", {
        id: loadOptions.bookId ? String(loadOptions.bookId) : "",
        source: loadOptions.source ? String(loadOptions.source) : "",
        path: String(bookPath || "")
      });
      return loadBookFromContainer(bookPath, loadOptions).catch(function (containerError) {
        return loadBookFromManualManifest(bookPath, loadOptions).catch(function (manualError) {
          var chosenError = manualError;
          if (containerError && /book-manifest/i.test(String(manualError && manualError.message || ""))) {
            chosenError = containerError;
          }
          throw chosenError;
        });
      }).catch(function (error) {
        setError(error && error.message ? error.message : String(error));
        return { ok: false, code: "book_load_failed", error: String(error && error.message ? error.message : error) };
      });
    }

    function goToLocation(target) {
      if (typeof target === "number") return loadSectionByIndex(target, { pageIndex: 0 });
      if (typeof target === "string") {
        var tokenTarget = parsePageToken(target);
        if (tokenTarget) {
          return loadSectionByIndex(tokenTarget.sectionIndex, { pageIndex: tokenTarget.pageIndex });
        }
        for (var i = 0; i < runtimeData.sections.length; i += 1) {
          if (runtimeData.sections[i].href === target || runtimeData.sections[i].url === target) {
            return loadSectionByIndex(i);
          }
        }
      }
      if (target && typeof target.spineIndex === "number") {
        return loadSectionByIndex(target.spineIndex, { pageIndex: typeof target.pageIndex === "number" ? target.pageIndex : 0 });
      }
      if (target && typeof target.sectionIndex === "number") {
        return loadSectionByIndex(target.sectionIndex, { pageIndex: typeof target.pageIndex === "number" ? target.pageIndex : 0 });
      }
      if (target && target.pageToken) {
        var parsedTarget = parsePageToken(target.pageToken);
        if (parsedTarget) {
          return loadSectionByIndex(parsedTarget.sectionIndex, { pageIndex: parsedTarget.pageIndex });
        }
      }
      if (target && target.href) return goToLocation(String(target.href));
      return Promise.resolve({ ok: false, code: "invalid_location_target" });
    }

    function goToToc(targetId) {
      var tocItems = Array.isArray(state.getSnapshot().book && state.getSnapshot().book.tocItems)
        ? state.getSnapshot().book.tocItems
        : [];
      for (var i = 0; i < tocItems.length; i += 1) {
        var item = tocItems[i];
        if (String(item.id || "") !== String(targetId || "")) continue;
        return goToLocation({ sectionIndex: Number(item.sectionIndex || 0), pageIndex: 0 });
      }
      return Promise.resolve({ ok: false, code: "toc_item_not_found" });
    }

    function nextPage() {
      var snapshot = state.getSnapshot();
      var location = snapshot.location || {};
      var pagination = runtimeData.currentPagination;
      if (pagination && Array.isArray(pagination.pages) && location.pageIndex < pagination.pages.length - 1) {
        var nextIndex = Number(location.pageIndex || 0) + 1;
        var nextPageModel = pagination.pages[nextIndex];
        updateReadyState(Number(location.sectionIndex), nextIndex, runtimeData.currentSection, nextPageModel, pagination);
        return Promise.resolve({ ok: true, location: clone(state.getSnapshot().location) });
      }
      return goToLocation({ sectionIndex: Number(location.sectionIndex || location.spineIndex || 0) + 1, pageIndex: 0 });
    }

    function prevPage() {
      var snapshot = state.getSnapshot();
      var location = snapshot.location || {};
      var pagination = runtimeData.currentPagination;
      if (pagination && Array.isArray(pagination.pages) && Number(location.pageIndex || 0) > 0) {
        var prevIndex = Number(location.pageIndex || 0) - 1;
        var prevPageModel = pagination.pages[prevIndex];
        updateReadyState(Number(location.sectionIndex), prevIndex, runtimeData.currentSection, prevPageModel, pagination);
        return Promise.resolve({ ok: true, location: clone(state.getSnapshot().location) });
      }
      var previousSectionIndex = Number(location.sectionIndex || location.spineIndex || 0) - 1;
      if (previousSectionIndex < 0) return Promise.resolve({ ok: false, code: "at-start-boundary" });
      return loadSectionByIndex(previousSectionIndex).then(function (result) {
        if (!result || !result.ok) return result;
        var paginationAfterLoad = runtimeData.currentPagination;
        if (!paginationAfterLoad || !paginationAfterLoad.pages.length) return result;
        var lastIndex = paginationAfterLoad.pages.length - 1;
        var pageModel = paginationAfterLoad.pages[lastIndex];
        updateReadyState(previousSectionIndex, lastIndex, runtimeData.currentSection, pageModel, paginationAfterLoad);
        return { ok: true, location: clone(state.getSnapshot().location) };
      });
    }

    function getLocation() {
      return clone(state.getSnapshot().location);
    }

    function clearSearch() {
      state.update("search", {
        implemented: true,
        active: false,
        query: "",
        totalMatches: 0,
        currentMatch: 0,
        results: [],
        status: "idle",
        originLocation: null
      });
      emitContractEvents(state.getSnapshot(), { force: true });
      return Promise.resolve({ ok: true });
    }

    function goToSearchResult(index) {
      var snapshot = state.getSnapshot();
      var searchState = snapshot.search || {};
      var results = Array.isArray(searchState.results) ? searchState.results : [];
      if (!results.length) return Promise.resolve({ ok: false, code: "search_empty" });
      var safeIndex = Math.max(0, Math.min(Number(index || 0), results.length - 1));
      var result = results[safeIndex];
      state.update("search", {
        implemented: true,
        active: true,
        query: searchState.query || "",
        totalMatches: results.length,
        currentMatch: safeIndex + 1,
        results: results,
        status: "ready",
        originLocation: clone(searchState.originLocation || snapshot.location || null)
      });
      emitContractEvents(state.getSnapshot(), { force: true });
      return goToLocation({
        sectionIndex: result.sectionIndex,
        pageIndex: result.pageIndex
      }).then(function (nav) {
        return {
          ok: !!(nav && nav.ok),
          result: clone(result)
        };
      });
    }

    function searchNextResult() {
      var searchState = state.getSnapshot().search || {};
      if (!searchState.results || !searchState.results.length) return Promise.resolve({ ok: false, code: "search_empty" });
      var nextIndex = Number(searchState.currentMatch || 1);
      if (nextIndex >= searchState.results.length) nextIndex = 0;
      return goToSearchResult(nextIndex);
    }

    function searchPrevResult() {
      var searchState = state.getSnapshot().search || {};
      if (!searchState.results || !searchState.results.length) return Promise.resolve({ ok: false, code: "search_empty" });
      var prevIndex = Number(searchState.currentMatch || 1) - 2;
      if (prevIndex < 0) prevIndex = searchState.results.length - 1;
      return goToSearchResult(prevIndex);
    }

    function search(query) {
      query = String(query || "").trim();
      if (!query) return clearSearch();
      var originLocation = clone(state.getSnapshot().location || null);
      var jobs = [];
      for (var i = 0; i < runtimeData.sections.length; i += 1) {
        jobs.push(ensureSectionModel(i).then(function (sectionModel) {
          var paginationModel = paginateSectionModel(sectionModel.index, sectionModel, createLocation(sectionModel.index, 0, sectionModel, 1));
          var results = [];
          for (var blockIndex = 0; blockIndex < sectionModel.blocks.length; blockIndex += 1) {
            var blockText = String(sectionModel.blocks[blockIndex] || "");
            if (blockText.toLowerCase().indexOf(query.toLowerCase()) < 0) continue;
            var pageIndex = findPageIndexForText(paginationModel, blockText);
            results.push({
              sectionIndex: sectionModel.index,
              pageIndex: pageIndex,
              href: sectionModel.href,
              title: sectionModel.title,
              query: query,
              pageToken: buildResultLocation(sectionModel.index, pageIndex, sectionModel, paginationModel.pages.length).pageToken,
              label: createPageLabel(sectionModel.index, runtimeData.sections.length, pageIndex, paginationModel.pages.length),
              snippet: buildSearchSnippet(blockText, query)
            });
          }
          return results;
        }));
      }
      return Promise.all(jobs).then(function (buckets) {
        var results = [];
        for (var bucketIndex = 0; bucketIndex < buckets.length; bucketIndex += 1) {
          results = results.concat(buckets[bucketIndex] || []);
        }
        state.update("search", {
          implemented: true,
          active: true,
          query: query,
          totalMatches: results.length,
          currentMatch: results.length ? 1 : 0,
          results: results,
          status: results.length ? "ready" : "empty",
          originLocation: originLocation
        });
        emitContractEvents(state.getSnapshot(), { force: true });
        if (!results.length) return { ok: true, empty: true, count: 0 };
        return goToSearchResult(0).then(function () {
          return { ok: true, empty: false, count: results.length, firstResult: clone(results[0]) };
        });
      });
    }

    function getSearchState() {
      return clone(state.getSnapshot().search);
    }

    function getSelectionState() {
      return clone(state.getSnapshot().selection);
    }

    function setSelection(selectionPatch) {
      state.update("selection", Object.assign({
        implemented: true
      }, selectionPatch || {}));
      emitContractEvents(state.getSnapshot(), { force: true });
      return clone(state.getSnapshot().selection);
    }

    function clearSelection() {
      return setSelection({
        active: false,
        text: "",
        pageToken: "",
        sectionIndex: -1,
        pageIndex: -1,
        rect: null
      });
    }

    function captureSelectionFromDom() {
      var selection = global.getSelection ? global.getSelection() : null;
      if (!selection || selection.rangeCount < 1 || selection.isCollapsed) return clearSelection();
      var range = selection.getRangeAt(0);
      if (!renderHost.root.contains(range.commonAncestorContainer)) return clearSelection();
      var text = String(selection.toString() || "").replace(/\s+/g, " ").trim();
      if (!text) return clearSelection();
      var rect = range.getBoundingClientRect ? range.getBoundingClientRect() : null;
      var location = state.getSnapshot().location || {};
      return setSelection({
        active: true,
        text: text,
        pageToken: String(location.pageToken || ""),
        sectionIndex: typeof location.sectionIndex === "number" ? location.sectionIndex : -1,
        pageIndex: typeof location.pageIndex === "number" ? location.pageIndex : -1,
        rect: rect ? {
          x: Number(rect.x || 0),
          y: Number(rect.y || 0),
          width: Number(rect.width || 0),
          height: Number(rect.height || 0)
        } : null
      });
    }

    function createAnnotationRecord(type, rangeDescriptor, text) {
      var snapshot = state.getSnapshot();
      var selection = snapshot.selection || {};
      var descriptor = rangeDescriptor || {};
      var location = snapshot.location || {};
      var quote = String(descriptor.quote || descriptor.text || selection.text || "").trim();
      if (!quote) return null;
      return {
        id: "ann-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
        type: type,
        quote: quote,
        noteText: String(text || ""),
        pageToken: String(descriptor.pageToken || selection.pageToken || location.pageToken || ""),
        sectionIndex: typeof descriptor.sectionIndex === "number" ? descriptor.sectionIndex : Number(selection.sectionIndex || location.sectionIndex || -1),
        pageIndex: typeof descriptor.pageIndex === "number" ? descriptor.pageIndex : Number(selection.pageIndex || location.pageIndex || -1),
        href: String(descriptor.href || location.href || ""),
        title: String(location.title || ""),
        createdAt: Date.now()
      };
    }

    function createHighlight(rangeDescriptor) {
      var record = createAnnotationRecord("highlight", rangeDescriptor);
      if (!record) return Promise.resolve({ ok: false, code: "no_selection" });
      var items = clone(state.getSnapshot().annotations.items || []);
      items.push(record);
      state.update("annotations", {
        implemented: true,
        items: items
      });
      emitContractEvents(state.getSnapshot(), { force: true });
      updateReadyState(runtimeData.currentSectionIndex, state.getSnapshot().location.pageIndex, runtimeData.currentSection, runtimeData.currentPagination.pages[state.getSnapshot().location.pageIndex], runtimeData.currentPagination);
      return Promise.resolve({ ok: true, annotation: clone(record) });
    }

    function addNote(rangeDescriptor, text) {
      var record = createAnnotationRecord("note", rangeDescriptor, text);
      if (!record) return Promise.resolve({ ok: false, code: "no_selection" });
      var items = clone(state.getSnapshot().annotations.items || []);
      items.push(record);
      state.update("annotations", {
        implemented: true,
        items: items
      });
      emitContractEvents(state.getSnapshot(), { force: true });
      updateReadyState(runtimeData.currentSectionIndex, state.getSnapshot().location.pageIndex, runtimeData.currentSection, runtimeData.currentPagination.pages[state.getSnapshot().location.pageIndex], runtimeData.currentPagination);
      return Promise.resolve({ ok: true, annotation: clone(record) });
    }

    function getAnnotations() {
      return clone(state.getSnapshot().annotations.items || []);
    }

    function goToAnnotation(annotationId) {
      var items = state.getSnapshot().annotations.items || [];
      for (var i = 0; i < items.length; i += 1) {
        if (String(items[i].id) !== String(annotationId)) continue;
        runtimeData.lastFocusedNoteId = String(annotationId);
        return goToLocation({ sectionIndex: items[i].sectionIndex, pageIndex: items[i].pageIndex }).then(function () {
          emitContractEvents(state.getSnapshot(), { force: true });
          return { ok: true, annotation: clone(items[i]) };
        });
      }
      return Promise.resolve({ ok: false, code: "annotation_not_found" });
    }

    function listBookmarks() {
      return clone(state.getSnapshot().bookmarks.items || []);
    }

    function toggleBookmark() {
      var snapshot = state.getSnapshot();
      var location = snapshot.location || {};
      var items = clone(snapshot.bookmarks.items || []);
      var token = String(location.pageToken || "");
      var existingIndex = -1;
      for (var i = 0; i < items.length; i += 1) {
        if (String(items[i].pageToken || "") === token) {
          existingIndex = i;
          break;
        }
      }
      if (existingIndex >= 0) {
        var removed = items.splice(existingIndex, 1)[0];
        state.update("bookmarks", {
          implemented: true,
          items: items
        });
        emitContractEvents(state.getSnapshot(), { force: true });
        return Promise.resolve({ ok: true, removed: true, bookmark: clone(removed) });
      }
      var bookmark = {
        id: "bm-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
        pageToken: token,
        sectionIndex: typeof location.sectionIndex === "number" ? location.sectionIndex : -1,
        pageIndex: typeof location.pageIndex === "number" ? location.pageIndex : -1,
        label: String(location.label || ""),
        href: String(location.href || ""),
        title: String(location.title || ""),
        createdAt: Date.now()
      };
      items.push(bookmark);
      state.update("bookmarks", {
        implemented: true,
        items: items
      });
      emitContractEvents(state.getSnapshot(), { force: true });
      return Promise.resolve({ ok: true, removed: false, bookmark: clone(bookmark) });
    }

    function goToBookmark(bookmarkId) {
      var items = state.getSnapshot().bookmarks.items || [];
      for (var i = 0; i < items.length; i += 1) {
        if (String(items[i].id) !== String(bookmarkId)) continue;
        return goToLocation({ sectionIndex: items[i].sectionIndex, pageIndex: items[i].pageIndex }).then(function () {
          return { ok: true, bookmark: clone(items[i]) };
        });
      }
      return Promise.resolve({ ok: false, code: "bookmark_not_found" });
    }

    function deleteBookmark(bookmarkId) {
      var items = clone(state.getSnapshot().bookmarks.items || []);
      for (var i = 0; i < items.length; i += 1) {
        if (String(items[i].id) !== String(bookmarkId)) continue;
        var removed = items.splice(i, 1)[0];
        state.update("bookmarks", {
          implemented: true,
          items: items
        });
        emitContractEvents(state.getSnapshot(), { force: true });
        return Promise.resolve({ ok: true, bookmark: clone(removed) });
      }
      return Promise.resolve({ ok: false, code: "bookmark_not_found" });
    }

    function setTheme(theme) {
      var normalized = theme === "dark" ? "dark" : "light";
      state.update("appearance", { theme: normalized });
      var snapshot = state.getSnapshot();
      renderHost.setTheme(snapshot.appearance.theme, snapshot.appearance.fontScale);
      if (runtimeData.currentSection && runtimeData.currentPagination) {
        var repaginated = renderHost.paginateSection(runtimeData.currentSection, {
          book: snapshot.book || {},
          location: snapshot.location || {},
          theme: snapshot.appearance.theme,
          fontScale: snapshot.appearance.fontScale
        });
        var pageIndex = Math.max(0, Math.min(Number(snapshot.location.pageIndex || 0), repaginated.pages.length - 1));
        updateReadyState(runtimeData.currentSectionIndex, pageIndex, runtimeData.currentSection, repaginated.pages[pageIndex], repaginated);
        snapshot = state.getSnapshot();
      }
      emitContractEvents(snapshot, { force: true });
      return Promise.resolve({
        ok: true,
        theme: normalized
      });
    }

    function setFontScale(scale) {
      var numeric = Number(scale || 1);
      if (!numeric || isNaN(numeric) || numeric <= 0) numeric = 1;
      state.update("appearance", { fontScale: numeric });
      var snapshot = state.getSnapshot();
      renderHost.setTheme(snapshot.appearance.theme, snapshot.appearance.fontScale);
      if (runtimeData.currentSection && runtimeData.currentPagination) {
        var repaginated = renderHost.paginateSection(runtimeData.currentSection, {
          book: snapshot.book || {},
          location: snapshot.location || {},
          theme: snapshot.appearance.theme,
          fontScale: snapshot.appearance.fontScale
        });
        var pageIndex = Math.max(0, Math.min(Number(snapshot.location.pageIndex || 0), repaginated.pages.length - 1));
        updateReadyState(runtimeData.currentSectionIndex, pageIndex, runtimeData.currentSection, repaginated.pages[pageIndex], repaginated);
        snapshot = state.getSnapshot();
      }
      emitContractEvents(snapshot, { force: true });
      return Promise.resolve({
        ok: true,
        fontScale: numeric
      });
    }

    return {
      loadBook: loadBook,
      goToLocation: goToLocation,
      goToToc: goToToc,
      nextPage: nextPage,
      prevPage: prevPage,
      getLocation: getLocation,
      search: search,
      searchNextResult: searchNextResult,
      searchPrevResult: searchPrevResult,
      clearSearch: clearSearch,
      goToSearchResult: goToSearchResult,
      getSearchState: getSearchState,
      getSelectionState: getSelectionState,
      captureSelectionFromDom: captureSelectionFromDom,
      clearSelection: clearSelection,
      createHighlight: createHighlight,
      addNote: addNote,
      goToAnnotation: goToAnnotation,
      getAnnotations: getAnnotations,
      listBookmarks: listBookmarks,
      toggleBookmark: toggleBookmark,
      goToBookmark: goToBookmark,
      deleteBookmark: deleteBookmark,
      setTheme: setTheme,
      setFontScale: setFontScale
    };
  }

  global.ReaderPubUnprotectedRuntimeNew = global.ReaderPubUnprotectedRuntimeNew || {};
  global.ReaderPubUnprotectedRuntimeNew.core = {
    createRuntimeCore: createRuntimeCore
  };
})(window);
