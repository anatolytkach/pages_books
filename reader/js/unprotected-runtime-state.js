(function (global) {
  "use strict";

  if (!global) return;

  function clone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function createInitialState(config) {
    config = config || {};
    return {
      runtimePath: "new",
      status: "idle",
      error: "",
      capabilities: {
        pagination: "page-model-v1",
        restore: "page-token-restore-v1",
        search: "runtime-search-v1",
        annotations: "runtime-annotations-v1",
        selection: "dom-selection-v1",
        notes: "runtime-notes-v1",
        bookmarks: "runtime-bookmarks-v1"
      },
      book: {
        id: config.bookId ? String(config.bookId) : "",
        source: config.source ? String(config.source) : "",
        path: config.bookPath ? String(config.bookPath) : "",
        title: "",
        author: "",
        opfUrl: "",
        sectionCount: 0,
        tocItems: []
      },
      location: {
        spineIndex: -1,
        spineCount: 0,
        sectionIndex: -1,
        sectionCount: 0,
        href: "",
        title: "",
        label: "",
        pageIndex: -1,
        pageCount: 0,
        pageToken: "",
        canGoPrev: false,
        canGoNext: false
      },
      pagination: {
        ready: false,
        mode: "page-model-v1",
        directRootPresent: false,
        firstRenderableStateReached: false,
        viewportWidth: 0,
        viewportHeight: 0,
        currentSectionIndex: -1,
        currentPageIndex: -1,
        currentPageCount: 0,
        locationToken: "",
        canAdvanceWithinSection: false,
        canRetreatWithinSection: false,
        boundaryTransitionNeeded: "none",
        visibleTextLength: 0
      },
      appearance: {
        theme: "light",
        fontScale: 1
      },
      search: {
        implemented: true,
        active: false,
        query: "",
        totalMatches: 0,
        currentMatch: 0,
        results: [],
        status: "idle",
        originLocation: null
      },
      selection: {
        implemented: true,
        active: false,
        text: "",
        pageToken: "",
        sectionIndex: -1,
        pageIndex: -1,
        rect: null
      },
      annotations: {
        implemented: true,
        items: []
      },
      bookmarks: {
        implemented: true,
        items: []
      },
      render: {
        ready: false,
        hostType: "direct",
        iframeCount: 0,
        directRootPresent: false,
        currentSectionTextLength: 0
      }
    };
  }

  function createStateStore(config) {
    var state = createInitialState(config);
    var listeners = [];

    function notify() {
      var snapshot = clone(state);
      for (var i = 0; i < listeners.length; i += 1) {
        try { listeners[i](snapshot); } catch (_error) {}
      }
      global.__READERPUB_UNPROTECTED_RUNTIME_STATE__ = snapshot;
    }

    function setState(patch) {
      state = Object.assign({}, state, patch || {});
      notify();
      return clone(state);
    }

    function update(path, value) {
      var next = clone(state);
      next[path] = Object.assign({}, next[path] || {}, value || {});
      state = next;
      notify();
      return clone(state);
    }

    function replace(nextState) {
      state = clone(nextState);
      notify();
      return clone(state);
    }

    function subscribe(listener) {
      if (typeof listener !== "function") return function () {};
      if (listeners.indexOf(listener) === -1) listeners.push(listener);
      return function () {
        var index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    }

    notify();

    return {
      getSnapshot: function () { return clone(state); },
      setState: setState,
      update: update,
      replace: replace,
      subscribe: subscribe
    };
  }

  global.ReaderPubUnprotectedRuntimeNew = global.ReaderPubUnprotectedRuntimeNew || {};
  global.ReaderPubUnprotectedRuntimeNew.state = {
    createInitialState: createInitialState,
    createStateStore: createStateStore
  };
})(window);
