(function (global) {
  "use strict";

  if (!global) return;

  var EVENT_NAMES = [
    "pageChanged",
    "selectionChanged",
    "searchStateChanged",
    "annotationsChanged",
    "themeChanged",
    "readingPositionChanged",
    "toolbarStateChanged",
    "sidebarStateChanged",
    "bookmarkUpdated",
    "noteFocused"
  ];

  function clone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function createEventChannel() {
    var listeners = {};
    var history = [];
    var lastSerialized = {};

    function subscribe(eventName, listener) {
      if (typeof listener !== "function") return function () {};
      listeners[eventName] = listeners[eventName] || [];
      if (listeners[eventName].indexOf(listener) === -1) listeners[eventName].push(listener);
      return function () { unsubscribe(eventName, listener); };
    }

    function unsubscribe(eventName, listener) {
      var bucket = listeners[eventName] || [];
      var index = bucket.indexOf(listener);
      if (index >= 0) bucket.splice(index, 1);
    }

    function emit(eventName, payload, options) {
      if (EVENT_NAMES.indexOf(eventName) === -1) return false;
      var serialized = JSON.stringify(payload == null ? null : payload);
      if (!(options && options.force) && lastSerialized[eventName] === serialized) return false;
      lastSerialized[eventName] = serialized;
      var cloned = clone(payload);
      history.push({ type: eventName, payload: cloned, at: Date.now() });
      while (history.length > 160) history.shift();
      var bucket = (listeners[eventName] || []).slice();
      for (var i = 0; i < bucket.length; i += 1) {
        try { bucket[i](cloned, eventName); } catch (_error) {}
      }
      var anyBucket = (listeners["*"] || []).slice();
      for (var j = 0; j < anyBucket.length; j += 1) {
        try { anyBucket[j]({ type: eventName, payload: cloned }, eventName); } catch (_error2) {}
      }
      try { document.dispatchEvent(new CustomEvent("readerpub:" + eventName, { detail: cloned })); } catch (_error3) {}
      return true;
    }

    return {
      channel: "readerpub-unprotected-runtime-events-v1",
      supportedEvents: EVENT_NAMES.slice(),
      subscribe: subscribe,
      unsubscribe: unsubscribe,
      on: subscribe,
      off: unsubscribe,
      emit: emit,
      getHistory: function () { return clone(history); }
    };
  }

  function ensureGlobalHub() {
    if (!global.__READERPUB_READER_EVENTS__) {
      global.__READERPUB_READER_EVENTS__ = createEventChannel();
    }
    return global.__READERPUB_READER_EVENTS__;
  }

  global.ReaderPubUnprotectedRuntimeNew = global.ReaderPubUnprotectedRuntimeNew || {};
  global.ReaderPubUnprotectedRuntimeNew.events = {
    EVENT_NAMES: EVENT_NAMES.slice(),
    createEventChannel: createEventChannel,
    ensureGlobalHub: ensureGlobalHub
  };
})(window);
