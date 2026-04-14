(function (global) {
  "use strict";

  if (!global) return;

  function buildCompatSummary(state) {
    state = state || {};
    var location = state.location || {};
    var appearance = state.appearance || {};
    var search = state.search || {};
    var annotations = state.annotations || {};
    var bookmarks = state.bookmarks || {};
    var selection = state.selection || {};
    var tocItems = Array.isArray(state.book && state.book.tocItems) ? state.book.tocItems : [];
    var pageIndex = Math.max(0, Number(location.pageIndex || 0));
    var sectionIndex = Math.max(0, Number(location.sectionIndex || location.spineIndex || 0));
    var pageGlobalOffset = (sectionIndex * 100000) + pageIndex;
    return {
      ready: state.status === "ready",
      status: state.status || "idle",
      runtimePath: state.runtimePath || "new",
      bookId: state.book && state.book.id ? String(state.book.id) : "",
      bookTitle: state.book && state.book.title ? String(state.book.title) : "",
      bookAuthor: state.book && state.book.author ? String(state.book.author) : "",
      chapterLabel: location.title || "",
      pageLabel: location.label || "",
      globalPageLabel: location.label || "",
      canGoPrev: !!location.canGoPrev,
      canGoNext: !!location.canGoNext,
      restoreToken: String(location.pageToken || ""),
      globalStartOffset: pageGlobalOffset,
      pageGlobalStartOffset: pageGlobalOffset,
      chunkOrder: pageIndex,
      theme: appearance.theme === "dark" ? "dark" : "light",
      fontScale: Number(appearance.fontScale || 1) || 1,
      fontMode: "sans",
      runtimeFontMode: "sans",
      supportedFontModes: ["sans"],
      viewportWidth: Number(state.pagination && state.pagination.viewportWidth || 0),
      viewportHeight: Number(state.pagination && state.pagination.viewportHeight || 0),
      configGeneration: 1,
      layoutGeneration: 1,
      annotationCount: Array.isArray(annotations.items) ? annotations.items.length : 0,
      annotations: Array.isArray(annotations.items) ? annotations.items.slice() : [],
      searchSummary: {
        active: !!search.active,
        query: search.query || "",
        totalMatches: Number(search.totalMatches || 0),
        currentMatch: Number(search.currentMatch || 0),
        matchCount: Number(search.totalMatches || 0),
        matches: Array.isArray(search.results) ? search.results.slice() : []
      },
      selectionActive: !!selection.active,
      selectedChars: String(selection.text || "").length,
      selectionBounds: selection.rect || null,
      focusedAnnotationId: "",
      bookmarkCount: Array.isArray(bookmarks.items) ? bookmarks.items.length : 0,
      tocItems: tocItems.map(function (item) {
        return {
          id: String(item.id || ""),
          label: String(item.label || ""),
          href: String(item.href || ""),
          active: Number(item.sectionIndex || -1) === sectionIndex
        };
      }),
      statusText: state.status === "ready" ? (location.label || "") : (state.error ? String(state.error) : "Loading"),
      driveStatus: { transport: "adapter" },
      runtimeMeta: { pilotStatus: "active" }
    };
  }

  function createRuntimeAdapter(core, stateStore, eventHub) {
    function snapshot() {
      return stateStore.getSnapshot();
    }

    return {
      channel: "readerpub-unprotected-runtime-adapter-v1",
      supportedEvents: eventHub.supportedEvents.slice(),
      subscribe: eventHub.subscribe,
      unsubscribe: eventHub.unsubscribe,
      on: eventHub.on,
      off: eventHub.off,
      loadBook: core.loadBook,
      goToLocation: core.goToLocation,
      nextPage: function () {
        return core.nextPage().then(function () { return buildCompatSummary(snapshot()); });
      },
      prevPage: function () {
        return core.prevPage().then(function () { return buildCompatSummary(snapshot()); });
      },
      getLocation: core.getLocation,
      search: function (query) {
        return core.search(query).then(function () { return buildCompatSummary(snapshot()); });
      },
      searchBook: function (query) {
        return core.search(query).then(function () { return buildCompatSummary(snapshot()); });
      },
      searchNextResult: function () {
        return core.searchNextResult().then(function () { return buildCompatSummary(snapshot()); });
      },
      searchPrevResult: function () {
        return core.searchPrevResult().then(function () { return buildCompatSummary(snapshot()); });
      },
      clearSearch: function () {
        return core.clearSearch().then(function () { return buildCompatSummary(snapshot()); });
      },
      goToSearchResult: function (index) {
        return core.goToSearchResult(index).then(function () { return buildCompatSummary(snapshot()); });
      },
      getSearchState: core.getSearchState,
      getSelectionState: core.getSelectionState,
      captureSelectionFromDom: core.captureSelectionFromDom,
      clearSelection: function () {
        return core.clearSelection().then(function () { return buildCompatSummary(snapshot()); });
      },
      createHighlight: function (rangeDescriptor) {
        return core.createHighlight(rangeDescriptor).then(function () { return buildCompatSummary(snapshot()); });
      },
      addNote: core.addNote,
      goToAnnotation: function (id) {
        return core.goToAnnotation(id).then(function () { return buildCompatSummary(snapshot()); });
      },
      getAnnotations: core.getAnnotations,
      listBookmarks: core.listBookmarks,
      toggleBookmark: core.toggleBookmark,
      goToBookmark: core.goToBookmark,
      deleteBookmark: core.deleteBookmark,
      setTheme: function (theme) {
        return core.setTheme(theme).then(function () { return buildCompatSummary(snapshot()); });
      },
      setFontScale: function (scale) {
        return core.setFontScale(scale).then(function () { return buildCompatSummary(snapshot()); });
      },
      setFontMode: function () {
        return Promise.resolve(buildCompatSummary(snapshot()));
      },
      getSearchResults: function () {
        var state = snapshot();
        return Promise.resolve((state.search && state.search.results) ? state.search.results.slice() : []);
      },
      goToToc: function (id) {
        return core.goToToc(id).then(function () { return buildCompatSummary(snapshot()); });
      },
      addNoteToSelection: function (text) {
        return core.addNote(null, text).then(function () {
          return buildCompatSummary(snapshot());
        });
      },
      deleteAnnotation: function (id) {
        var state = snapshot();
        var items = Array.isArray(state.annotations && state.annotations.items) ? state.annotations.items.slice() : [];
        stateStore.update("annotations", {
          implemented: true,
          items: items.filter(function (item) { return String(item.id) !== String(id); })
        });
        return Promise.resolve(buildCompatSummary(snapshot()));
      },
      exportNotesSharePayload: function () {
        var notes = Array.isArray(snapshot().annotations && snapshot().annotations.items)
          ? snapshot().annotations.items.filter(function (item) { return item.type === "note"; })
          : [];
        return Promise.resolve({ ok: true, notes: notes });
      },
      captureSelectionForUserAction: function () {
        return Promise.resolve(snapshot().selection || {});
      },
      copySelection: function () {
        return Promise.resolve(buildCompatSummary(snapshot()));
      },
      preparePageTurnPreviews: function () {
        return Promise.resolve({ ok: true, previewMode: "direct-no-preview" });
      },
      restoreFromToken: function (token) {
        var target = typeof token === "string" ? { pageToken: token } : token;
        return core.goToLocation(target).then(function () {
          return buildCompatSummary(snapshot());
        });
      },
      goToGlobalOffset: function (offset) {
        var state = snapshot();
        var currentPageCount = Math.max(1, Number(state.location && state.location.pageCount || 1));
        var safeOffset = Math.max(0, Number(offset || 0) || 0);
        var sectionIndex = Math.max(0, Math.floor(safeOffset / 100000));
        var pageIndex = Math.max(0, safeOffset % 100000);
        if (pageIndex >= currentPageCount) pageIndex = currentPageCount - 1;
        return core.goToLocation({ sectionIndex: sectionIndex, pageIndex: pageIndex }).then(function () {
          return buildCompatSummary(snapshot());
        });
      },
      getReadAloudPayload: function () {
        var state = snapshot();
        var host = global.__READERPUB_UNPROTECTED_RUNTIME_HOST__;
        return Promise.resolve({
          text: String((host && host.root && host.root.textContent) || "").trim(),
          lang: String(state.book && state.book.source || "").toLowerCase() === "manual" ? "ru" : "en"
        });
      },
      getRuntimeState: snapshot,
      getSummary: function () {
        return buildCompatSummary(snapshot());
      }
    };
  }

  function bootstrap(config) {
    config = config || {};
    var namespace = global.ReaderPubUnprotectedRuntimeNew || {};
    if (!namespace.state || !namespace.events || !namespace.renderHost || !namespace.core) {
      throw new Error("New unprotected runtime modules are incomplete");
    }
    var stateStore = namespace.state.createStateStore(config);
    var eventHub = namespace.events.ensureGlobalHub();
    var renderHost = namespace.renderHost.createRenderHost(config);
    var runtimeCore = namespace.core.createRuntimeCore({
      state: stateStore,
      events: eventHub,
      renderHost: renderHost,
      config: config
    });
    var adapter = createRuntimeAdapter(runtimeCore, stateStore, eventHub);

    global.__readerpubUnprotectedRuntimePath = "new";
    global.__readerpubUnprotectedRenderHost = "direct";
    global.__READERPUB_UNPROTECTED_RUNTIME__ = runtimeCore;
    global.__READERPUB_UNPROTECTED_RUNTIME_ADAPTER__ = adapter;
    global.__READERPUB_UNPROTECTED_RUNTIME_HOST__ = renderHost;
    global.__READERPUB_UNPROTECTED_RUNTIME_STATE__ = stateStore.getSnapshot();
    if (config.compatAdapterKey) {
      global[config.compatAdapterKey] = adapter;
    }

    if (!config.skipShellBootstrap && namespace.shell && typeof namespace.shell.bootstrap === "function") {
      namespace.shell.bootstrap({
        adapter: adapter,
        stateStore: stateStore,
        eventHub: eventHub,
        config: config,
        renderHost: renderHost
      });
    }

    return adapter.loadBook(config.bookPath, config).then(function () {
      return adapter;
    });
  }

  global.ReaderPubUnprotectedRuntimeNew = global.ReaderPubUnprotectedRuntimeNew || {};
  global.ReaderPubUnprotectedRuntimeNew.adapter = {
    createRuntimeAdapter: createRuntimeAdapter,
    bootstrap: bootstrap
  };
})(window);
