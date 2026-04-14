(function (global) {
  "use strict";

  if (!global || !global.ePub || global.ReaderPubUnprotectedDirect) {
    return;
  }

  var DOM_EVENTS = ["keydown", "keyup", "keypressed", "mouseup", "mousedown", "click", "touchend", "touchstart"];
  var COLUMN_AXIS = "column-axis";
  var COLUMN_GAP = "column-gap";
  var COLUMN_WIDTH = "column-width";
  var COLUMN_FILL = "column-fill";

  function now() {
    try { return Date.now(); } catch (_error) { return 0; }
  }

  function createEmitter(target) {
    var listeners = Object.create(null);
    target.on = function (name, handler) {
      if (!name || typeof handler !== "function") return;
      (listeners[name] = listeners[name] || []).push(handler);
    };
    target.off = function (name, handler) {
      if (!listeners[name]) return;
      if (!handler) {
        listeners[name] = [];
        return;
      }
      listeners[name] = listeners[name].filter(function (item) { return item !== handler; });
    };
    target.emit = function (name) {
      var args = Array.prototype.slice.call(arguments, 1);
      var queue = listeners[name] ? listeners[name].slice() : [];
      for (var index = 0; index < queue.length; index += 1) {
        try { queue[index].apply(target, args); } catch (_error) {}
      }
    };
  }

  function getQueryParam(name) {
    try {
      var params = new URLSearchParams(global.location.search || "");
      return params.get(name) || "";
    } catch (_error) {
      return "";
    }
  }

  function isDirectMode() {
    return String(getQueryParam("unprotectedRenderHost") || "").trim().toLowerCase() === "direct";
  }

  function clampOffset(node, offset) {
    if (!node) return 0;
    if (node.nodeType === Node.TEXT_NODE) {
      var length = node.nodeValue ? node.nodeValue.length : 0;
      return Math.max(0, Math.min(length, Number(offset) || 0));
    }
    var count = node.childNodes ? node.childNodes.length : 0;
    return Math.max(0, Math.min(count, Number(offset) || 0));
  }

  function absoluteUrl(value, base) {
    if (!value) return value;
    try {
      return new URL(value, base).toString();
    } catch (_error) {
      return value;
    }
  }

  function rewriteElementAttributes(el, base) {
    if (!el || !el.getAttributeNames) return;
    var attrs = el.getAttributeNames();
    for (var index = 0; index < attrs.length; index += 1) {
      var name = attrs[index];
      var value = el.getAttribute(name);
      if (!value) continue;
      if (name === "src" || name === "href" || name === "poster") {
        el.setAttribute(name, absoluteUrl(value, base));
      } else if (name === "srcset") {
        var rewritten = value.split(",").map(function (entry) {
          var trimmed = String(entry || "").trim();
          if (!trimmed) return trimmed;
          var parts = trimmed.split(/\s+/);
          parts[0] = absoluteUrl(parts[0], base);
          return parts.join(" ");
        }).join(", ");
        el.setAttribute(name, rewritten);
      } else if (name === "xlink:href") {
        el.setAttribute(name, absoluteUrl(value, base));
      }
    }
  }

  function cloneHeadAssets(sourceDoc, styleHost, base) {
    if (!sourceDoc || !styleHost) return;
    var head = sourceDoc.head || sourceDoc.querySelector("head");
    if (!head) return;
    var nodes = head.childNodes ? Array.prototype.slice.call(head.childNodes) : [];
    nodes.forEach(function (node) {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
      var tag = (node.tagName || "").toLowerCase();
      if (tag === "style") {
        var style = styleHost.ownerDocument.createElement("style");
        style.textContent = String(node.textContent || "");
        styleHost.appendChild(style);
        return;
      }
      if (tag === "link" && String(node.getAttribute("rel") || "").toLowerCase() === "stylesheet") {
        var link = styleHost.ownerDocument.createElement("link");
        link.setAttribute("rel", "stylesheet");
        link.setAttribute("href", absoluteUrl(node.getAttribute("href"), base));
        styleHost.appendChild(link);
        return;
      }
      if (tag === "meta" && String(node.getAttribute("name") || "").toLowerCase() === "viewport") {
        var meta = styleHost.ownerDocument.createElement("meta");
        meta.setAttribute("name", "viewport");
        meta.setAttribute("content", String(node.getAttribute("content") || ""));
        styleHost.appendChild(meta);
      }
    });
  }

  function buildParallelClone(sourceNode, ownerDocument, base, originalToLive, liveToOriginal, keyPrefix) {
    var liveNode;
    var key = keyPrefix || "0";
    if (sourceNode.nodeType === Node.TEXT_NODE) {
      liveNode = ownerDocument.createTextNode(sourceNode.nodeValue || "");
      originalToLive.set(sourceNode, liveNode);
      liveToOriginal.set(liveNode, sourceNode);
      liveNode.__readerpubDirectKey = key;
      return liveNode;
    }

    if (sourceNode.nodeType !== Node.ELEMENT_NODE) {
      return ownerDocument.createTextNode("");
    }

    if (!sourceNode.namespaceURI || sourceNode.namespaceURI === "http://www.w3.org/1999/xhtml") {
      liveNode = ownerDocument.createElement(sourceNode.localName || String(sourceNode.nodeName || "").toLowerCase());
    } else {
      liveNode = ownerDocument.createElementNS(sourceNode.namespaceURI, sourceNode.nodeName);
    }
    originalToLive.set(sourceNode, liveNode);
    liveToOriginal.set(liveNode, sourceNode);
    liveNode.__readerpubDirectKey = key;

    var attrs = sourceNode.attributes ? Array.prototype.slice.call(sourceNode.attributes) : [];
    attrs.forEach(function (attr) {
      try { liveNode.setAttribute(attr.name, attr.value); } catch (_error) {}
    });
    rewriteElementAttributes(liveNode, base);

    var children = sourceNode.childNodes ? Array.prototype.slice.call(sourceNode.childNodes) : [];
    for (var index = 0; index < children.length; index += 1) {
      var child = children[index];
      var childKey = key + "." + index;
      liveNode.appendChild(buildParallelClone(child, ownerDocument, base, originalToLive, liveToOriginal, childKey));
    }

    return liveNode;
  }

  function createScopedDocument(ownerDocument, shadowRoot, styleHost, documentElementRoot, bodyRoot) {
    var listeners = [];
    var scoped = {
      __readerpubScoped: true,
      ownerDocument: ownerDocument,
      defaultView: global,
      documentElement: documentElementRoot,
      body: bodyRoot,
      head: styleHost,
      fonts: ownerDocument.fonts,
      styleSheets: ownerDocument.styleSheets,
      createElement: ownerDocument.createElement.bind(ownerDocument),
      createElementNS: ownerDocument.createElementNS.bind(ownerDocument),
      createTextNode: ownerDocument.createTextNode.bind(ownerDocument),
      createRange: ownerDocument.createRange.bind(ownerDocument),
      createTreeWalker: ownerDocument.createTreeWalker.bind(ownerDocument),
      getSelection: function () { return global.getSelection ? global.getSelection() : ownerDocument.getSelection(); },
      elementFromPoint: ownerDocument.elementFromPoint.bind(ownerDocument),
      querySelector: function (selector) {
        if (selector === "head") return styleHost;
        if (selector === "body") return bodyRoot;
        return shadowRoot.querySelector(selector);
      },
      querySelectorAll: function (selector) {
        if (selector === "head") return [styleHost];
        if (selector === "body") return [bodyRoot];
        return shadowRoot.querySelectorAll(selector);
      },
      getElementById: function (id) {
        return shadowRoot.getElementById ? shadowRoot.getElementById(id) : shadowRoot.querySelector("#" + id);
      },
      addEventListener: function (type, handler, options) {
        var target = type === "selectionchange" ? ownerDocument : bodyRoot;
        target.addEventListener(type, handler, options);
        listeners.push({ target: target, type: type, handler: handler, options: options });
      },
      removeEventListener: function (type, handler, options) {
        var target = type === "selectionchange" ? ownerDocument : bodyRoot;
        target.removeEventListener(type, handler, options);
      },
      cleanup: function () {
        while (listeners.length) {
          var item = listeners.pop();
          try { item.target.removeEventListener(item.type, item.handler, item.options); } catch (_error) {}
        }
      }
    };
    return scoped;
  }

  function DirectContents(options) {
    options = options || {};
    this.section = options.section || null;
    this.cfiBase = options.cfiBase || "";
    this.sectionIndex = options.sectionIndex || 0;
    this.shadowRoot = options.shadowRoot;
    this.document = options.document;
    this.document.__readerpubDirectContents = this;
    this.documentElement = options.documentElement || options.body;
    this.content = options.body;
    this.window = global;
    this.head = options.head;
    this.originalDocument = options.originalDocument;
    this.originalToLive = options.originalToLive;
    this.liveToOriginal = options.liveToOriginal;
    this._size = { width: 0, height: 0 };
    this._layoutStyle = "paginated";
    createEmitter(this);
    this.listeners();
  }

  DirectContents.listenedEvents = (global.ePub && global.ePub.Contents && global.ePub.Contents.listenedEvents) || DOM_EVENTS.slice();

  DirectContents.prototype.viewport = function (options) {
    var existing = this.head.querySelector('meta[name="viewport"]');
    var meta = existing || this.document.createElement("meta");
    if (!existing) {
      meta.setAttribute("name", "viewport");
      this.head.appendChild(meta);
    }
    if (!options) {
      return {
        width: meta.getAttribute("data-width") || undefined,
        height: meta.getAttribute("data-height") || undefined,
        scale: meta.getAttribute("data-scale") || undefined,
        scalable: meta.getAttribute("data-scalable") || undefined
      };
    }
    if (options.width != null) meta.setAttribute("data-width", options.width);
    if (options.height != null) meta.setAttribute("data-height", options.height);
    if (options.scale != null) meta.setAttribute("data-scale", options.scale);
    if (options.scalable != null) meta.setAttribute("data-scalable", options.scalable);
    meta.setAttribute("content", [
      options.width != null ? "width=" + options.width : "",
      options.height != null ? "height=" + options.height : "",
      options.scale != null ? "initial-scale=" + options.scale : "",
      options.scalable != null ? "user-scalable=" + options.scalable : ""
    ].filter(Boolean).join(", "));
    return options;
  };

  DirectContents.prototype.width = function (value) {
    if (value != null) this.content.style.width = typeof value === "number" ? value + "px" : value;
    return global.getComputedStyle(this.content).width;
  };

  DirectContents.prototype.height = function (value) {
    if (value != null) this.content.style.height = typeof value === "number" ? value + "px" : value;
    return global.getComputedStyle(this.content).height;
  };

  DirectContents.prototype.contentWidth = function (value) {
    return this.width(value);
  };

  DirectContents.prototype.contentHeight = function (value) {
    return this.height(value);
  };

  DirectContents.prototype.textWidth = function () {
    var range = this.document.createRange();
    range.selectNodeContents(this.content);
    return Math.round(Math.max(
      range.getBoundingClientRect().width || 0,
      this.content.scrollWidth || 0,
      this.documentElement.scrollWidth || 0
    ));
  };

  DirectContents.prototype.textHeight = function () {
    var range = this.document.createRange();
    range.selectNodeContents(this.content);
    return Math.round(Math.max(
      range.getBoundingClientRect().height || 0,
      this.content.scrollHeight || 0,
      this.documentElement.scrollHeight || 0
    ));
  };

  DirectContents.prototype.scrollWidth = function () {
    return Math.max(this.documentElement.scrollWidth || 0, this.content.scrollWidth || 0);
  };

  DirectContents.prototype.scrollHeight = function () {
    return Math.max(this.documentElement.scrollHeight || 0, this.content.scrollHeight || 0);
  };

  DirectContents.prototype.overflow = function (value) {
    if (value != null) this.documentElement.style.overflow = value;
    return global.getComputedStyle(this.documentElement).overflow;
  };

  DirectContents.prototype.overflowX = function (value) {
    if (value != null) this.documentElement.style.overflowX = value;
    return global.getComputedStyle(this.documentElement).overflowX;
  };

  DirectContents.prototype.overflowY = function (value) {
    if (value != null) this.documentElement.style.overflowY = value;
    return global.getComputedStyle(this.documentElement).overflowY;
  };

  DirectContents.prototype.css = function (property, value, priority) {
    if (value != null) {
      this.content.style.setProperty(property, value, priority ? "important" : "");
    }
    return global.getComputedStyle(this.content)[property];
  };

  DirectContents.prototype.addStylesheet = function (src) {
    return new Promise(function (resolve) {
      var selector = 'link[rel="stylesheet"][href="' + src + '"]';
      if (this.head.querySelector(selector)) {
        resolve(true);
        return;
      }
      var link = this.document.createElement("link");
      link.setAttribute("rel", "stylesheet");
      link.setAttribute("href", src);
      link.onload = function () { resolve(true); };
      link.onerror = function () { resolve(false); };
      this.head.appendChild(link);
    }.bind(this));
  };

  DirectContents.prototype.addStylesheetRules = function (rules) {
    if (!rules) return;
    var key = "epubjs-inserted-css";
    var styleEl = this.head.querySelector("#" + key);
    if (!styleEl) {
      styleEl = this.document.createElement("style");
      styleEl.id = key;
      this.head.appendChild(styleEl);
    }
    var styleSheet = styleEl.sheet;
    if (!styleSheet) return;
    if (Object.prototype.toString.call(rules) === "[object Array]") {
      for (var i = 0; i < rules.length; i += 1) {
        var j = 1;
        var rule = rules[i];
        var selector = rule[0];
        var propStr = "";
        if (Object.prototype.toString.call(rule[1][0]) === "[object Array]") {
          rule = rule[1];
          j = 0;
        }
        for (var p = j; p < rule.length; p += 1) {
          propStr += rule[p][0] + ":" + rule[p][1] + (rule[p][2] ? " !important" : "") + ";\n";
        }
        try { styleSheet.insertRule(selector + "{" + propStr + "}", styleSheet.cssRules.length); } catch (_error) {}
      }
      return;
    }
    var selectors = Object.keys(rules);
    selectors.forEach(function (selector) {
      var definition = rules[selector];
      if (Array.isArray(definition)) {
        definition.forEach(function (item) {
          var ruleNames = Object.keys(item);
          var result = ruleNames.map(function (rule) { return rule + ":" + item[rule]; }).join(";");
          try { styleSheet.insertRule(selector + "{" + result + "}", styleSheet.cssRules.length); } catch (_error) {}
        });
      } else {
        var names = Object.keys(definition);
        var value = names.map(function (rule) { return rule + ":" + definition[rule]; }).join(";");
        try { styleSheet.insertRule(selector + "{" + value + "}", styleSheet.cssRules.length); } catch (_error) {}
      }
    });
  };

  DirectContents.prototype.addScript = function () {
    return Promise.resolve(false);
  };

  DirectContents.prototype.addClass = function (className) {
    this.content.classList.add(className);
  };

  DirectContents.prototype.removeClass = function (className) {
    this.content.classList.remove(className);
  };

  DirectContents.prototype.triggerEvent = function (event) {
    this.emit(event.type, event);
  };

  DirectContents.prototype.addEventListeners = function () {
    var self = this;
    this._boundEventHandlers = this._boundEventHandlers || {};
    DirectContents.listenedEvents.forEach(function (name) {
      var handler = self._boundEventHandlers[name];
      if (!handler) {
        handler = self.triggerEvent.bind(self);
        self._boundEventHandlers[name] = handler;
      }
      self.document.addEventListener(name, handler, false);
    });
  };

  DirectContents.prototype.removeEventListeners = function () {
    var self = this;
    if (!this._boundEventHandlers) return;
    DirectContents.listenedEvents.forEach(function (name) {
      var handler = self._boundEventHandlers[name];
      if (handler) self.document.removeEventListener(name, handler, false);
    });
  };

  DirectContents.prototype.selectionInsideRoot = function (selection) {
    try {
      if (!selection || selection.rangeCount < 1) return false;
      var range = selection.getRangeAt(0);
      return this.content.contains(range.startContainer) && this.content.contains(range.endContainer);
    } catch (_error) {
      return false;
    }
  };

  DirectContents.prototype.addSelectionListeners = function () {
    this._selectionHandler = this._selectionHandler || this.onSelectionChange.bind(this);
    this.document.addEventListener("selectionchange", this._selectionHandler, false);
  };

  DirectContents.prototype.removeSelectionListeners = function () {
    if (this._selectionHandler) this.document.removeEventListener("selectionchange", this._selectionHandler, false);
  };

  DirectContents.prototype.onSelectionChange = function () {
    if (this.selectionEndTimeout) clearTimeout(this.selectionEndTimeout);
    this.selectionEndTimeout = setTimeout(function () {
      var selection = this.window.getSelection ? this.window.getSelection() : null;
      if (!this.selectionInsideRoot(selection)) return;
      this.triggerSelectedEvent(selection);
    }.bind(this), 250);
  };

  DirectContents.prototype.originalRangeToLiveRange = function (originalRange) {
    if (!originalRange) return null;
    var liveStart = this.originalToLive.get(originalRange.startContainer);
    var liveEnd = this.originalToLive.get(originalRange.endContainer);
    if (!liveStart || !liveEnd) return null;
    var range = this.document.createRange();
    range.setStart(liveStart, clampOffset(liveStart, originalRange.startOffset));
    range.setEnd(liveEnd, clampOffset(liveEnd, originalRange.endOffset));
    return range;
  };

  DirectContents.prototype.liveRangeToOriginalRange = function (liveRange) {
    if (!liveRange) return null;
    var originalStart = this.liveToOriginal.get(liveRange.startContainer);
    var originalEnd = this.liveToOriginal.get(liveRange.endContainer);
    if (!originalStart || !originalEnd) return null;
    var range = this.originalDocument.createRange();
    range.setStart(originalStart, clampOffset(originalStart, liveRange.startOffset));
    range.setEnd(originalEnd, clampOffset(originalEnd, liveRange.endOffset));
    return range;
  };

  DirectContents.prototype.triggerSelectedEvent = function (selection) {
    if (!selection || selection.rangeCount < 1) return;
    var liveRange = selection.getRangeAt(0);
    if (!liveRange || liveRange.collapsed) return;
    var originalRange = this.liveRangeToOriginalRange(liveRange);
    if (!originalRange) return;
    var cfiRange = new global.ePub.CFI(originalRange, this.cfiBase).toString();
    this.emit("selected", cfiRange);
    this.emit("selectedRange", liveRange);
  };

  DirectContents.prototype.range = function (cfi, ignoreClass) {
    var originalRange = new global.ePub.CFI(cfi).toRange(this.originalDocument, ignoreClass);
    return this.originalRangeToLiveRange(originalRange);
  };

  DirectContents.prototype.locationOf = function (target, ignoreClass) {
    var liveRange = null;
    var rect = null;
    if (!target) return { left: 0, top: 0 };
    if (typeof target === "string" && /^epubcfi\(/i.test(target)) {
      liveRange = this.range(target, ignoreClass);
      if (liveRange) rect = liveRange.getBoundingClientRect();
    } else if (typeof target === "string" && target.indexOf("#") > -1) {
      var id = target.substring(target.indexOf("#") + 1);
      var el = this.document.getElementById(id);
      if (el && el.getBoundingClientRect) rect = el.getBoundingClientRect();
    }
    if (!rect) return { left: 0, top: 0 };
    return { left: rect.left, top: rect.top };
  };

  DirectContents.prototype.cfiFromRange = function (range, ignoreClass) {
    var originalRange = this.liveRangeToOriginalRange(range);
    if (!originalRange) return "";
    return new global.ePub.CFI(originalRange, this.cfiBase, ignoreClass).toString();
  };

  DirectContents.prototype.cfiFromNode = function (node, ignoreClass) {
    var originalNode = this.liveToOriginal.get(node);
    if (!originalNode) return "";
    return new global.ePub.CFI(originalNode, this.cfiBase, ignoreClass).toString();
  };

  DirectContents.prototype.size = function (width, height) {
    this.layoutStyle("scrolling");
    if (width >= 0) {
      this.width(width);
      this.viewport({ width: width, height: height, scale: 1.0, scalable: "no" });
      this.css("padding", "0 " + width / 12 + "px", true);
    }
    if (height >= 0) this.height(height);
    this.css("margin", "0");
    this.css("box-sizing", "border-box");
  };

  DirectContents.prototype.columns = function (width, height, columnWidth, gap) {
    var axis = this.writingMode().indexOf("vertical") === 0 ? "vertical" : "horizontal";
    this.layoutStyle("paginated");
    if (this.content.dir === "rtl") this.direction("rtl");
    this.width(width);
    this.height(height);
    this.viewport({ width: width, height: height, scale: 1.0, scalable: "no" });
    this.css("overflow-y", "hidden");
    this.css("margin", "0", true);
    this.css("padding", axis === "vertical" ? gap / 2 + "px 20px" : "20px " + gap / 2 + "px", true);
    this.css("box-sizing", "border-box");
    this.css("max-width", "inherit");
    this.css(COLUMN_AXIS, "horizontal");
    this.css(COLUMN_FILL, "auto");
    this.css(COLUMN_GAP, gap + "px");
    this.css(COLUMN_WIDTH, columnWidth + "px");
  };

  DirectContents.prototype.scaler = function (scale, offsetX, offsetY) {
    var translate = "";
    this.css("transform-origin", "top left");
    if (offsetX >= 0 || offsetY >= 0) translate = " translate(" + (offsetX || 0) + "px, " + (offsetY || 0) + "px)";
    this.css("transform", "scale(" + scale + ")" + translate);
  };

  DirectContents.prototype.fit = function (width, height) {
    var viewport = this.viewport();
    var widthScale = width / parseInt(viewport.width || width, 10);
    var heightScale = height / parseInt(viewport.height || height, 10);
    var scale = widthScale < heightScale ? widthScale : heightScale;
    var offsetY = (height - (parseInt(viewport.height || height, 10) * scale)) / 2;
    this.layoutStyle("paginated");
    this.width(width);
    this.height(height);
    this.overflow("hidden");
    this.scaler(scale, 0, offsetY);
    this.css("background-color", "transparent");
  };

  DirectContents.prototype.direction = function (dir) {
    this.documentElement.style.direction = dir;
  };

  DirectContents.prototype.writingMode = function (mode) {
    var prop = "writing-mode";
    if (mode) this.documentElement.style.setProperty(prop, mode);
    return global.getComputedStyle(this.documentElement).getPropertyValue(prop) || "";
  };

  DirectContents.prototype.layoutStyle = function (style) {
    if (style) this._layoutStyle = style;
    return this._layoutStyle || "paginated";
  };

  DirectContents.prototype.expand = function () {
    this.emit("expand");
  };

  DirectContents.prototype.linksHandler = function () {
    var self = this;
    this._linkHandler = this._linkHandler || function (event) {
      var node = event && event.target && event.target.closest ? event.target.closest("a[href]") : null;
      if (!node) return;
      var href = node.getAttribute("href");
      if (!href) return;
      event.preventDefault();
      self.emit("linkClicked", absoluteUrl(href, self.section ? self.section.url : global.location.href));
    };
    this.content.addEventListener("click", this._linkHandler, true);
  };

  DirectContents.prototype.listeners = function () {
    this.addEventListeners();
    this.addSelectionListeners();
    this.linksHandler();
    this.resizeListeners();
  };

  DirectContents.prototype.resizeCheck = function () {
    var width = this.textWidth();
    var height = this.textHeight();
    if (width !== this._size.width || height !== this._size.height) {
      this._size = { width: width, height: height };
      this.onResize && this.onResize(this._size);
      this.emit("resize", this._size);
    }
  };

  DirectContents.prototype.resizeListeners = function () {
    clearTimeout(this.expanding);
    global.requestAnimationFrame(this.resizeCheck.bind(this));
    this.expanding = setTimeout(this.resizeListeners.bind(this), 350);
  };

  DirectContents.prototype.removeListeners = function () {
    this.removeEventListeners();
    this.removeSelectionListeners();
    if (this._linkHandler) {
      try { this.content.removeEventListener("click", this._linkHandler, true); } catch (_error) {}
    }
    clearTimeout(this.expanding);
    clearTimeout(this.selectionEndTimeout);
    try { this.document.cleanup && this.document.cleanup(); } catch (_error) {}
  };

  function DirectView(section, options) {
    this.section = section;
    this.settings = Object.assign({
      ignoreClass: "",
      axis: options && options.layout && options.layout.props.flow === "scrolled" ? "vertical" : "horizontal",
      direction: undefined,
      width: 0,
      height: 0,
      layout: undefined,
      globalLayoutProperties: {}
    }, options || {});
    this.layout = this.settings.layout;
    this.id = "readerpub-direct-view-" + section.index + "-" + now();
    this.index = section.index;
    this.added = false;
    this.displayed = false;
    this.element = this.createContainer();
    this.shadowRoot = null;
    this.styleHost = null;
    this.viewportRoot = null;
    this.contentRoot = null;
    this.headRoot = null;
    this.document = null;
    this.contents = null;
    this.originalDocument = null;
    this.originalToLive = new WeakMap();
    this.liveToOriginal = new WeakMap();
    this.highlights = {};
    this.underlines = {};
    this.marks = {};
    this._width = 0;
    this._height = 0;
    this._needsReframe = true;
    createEmitter(this);
  }

  DirectView.prototype.createContainer = function () {
    var element = document.createElement("div");
    element.className = "epub-view readerpub-direct-view";
    element.setAttribute("data-readerpub-direct-view", String(this.index));
    element.style.height = "0px";
    element.style.width = "0px";
    element.style.overflow = "hidden";
    element.style.position = "relative";
    element.style.display = "block";
    element.style.flex = this.settings.axis === "horizontal" ? "none" : "initial";
    return element;
  };

  DirectView.prototype.create = function () {
    if (!this.element) {
      this.element = this.createContainer();
    }
    if (!this.shadowRoot) {
      this.shadowRoot = this.element.attachShadow({ mode: "open" });
      this.viewportRoot = document.createElement("html");
      this.viewportRoot.className = "readerpub-direct-document";
      this.viewportRoot.setAttribute("data-readerpub-direct-document", "true");
      this.headRoot = document.createElement("head");
      this.headRoot.setAttribute("data-readerpub-direct-head", "true");
      this.styleHost = this.headRoot;
      this.contentRoot = document.createElement("body");
      this.contentRoot.className = "readerpub-direct-content";
      this.contentRoot.setAttribute("data-readerpub-direct-root", "true");
      var baseStyle = document.createElement("style");
      baseStyle.textContent = [
        ":host{display:block;}",
        "html.readerpub-direct-document{position:relative;width:100%;height:100%;background:transparent;overflow:hidden;display:block;}",
        "body.readerpub-direct-content{position:relative;min-height:100%;background:transparent;display:block;}",
        "body.readerpub-direct-content img,body.readerpub-direct-content svg{max-width:100%;}"
      ].join("");
      this.shadowRoot.appendChild(baseStyle);
      this.viewportRoot.appendChild(this.headRoot);
      this.viewportRoot.appendChild(this.contentRoot);
      this.shadowRoot.appendChild(this.viewportRoot);
    }
    this.added = true;
    return this.contentRoot;
  };

  DirectView.prototype.resetContent = function () {
    if (this.contentRoot) this.contentRoot.innerHTML = "";
    if (this.viewportRoot) {
      this.viewportRoot.removeAttribute("dir");
      this.viewportRoot.className = "readerpub-direct-document";
      this.viewportRoot.removeAttribute("style");
    }
    if (this.contentRoot) {
      this.contentRoot.className = "readerpub-direct-content";
      this.contentRoot.removeAttribute("dir");
      this.contentRoot.removeAttribute("style");
    }
    if (this.styleHost) {
      var children = Array.prototype.slice.call(this.styleHost.childNodes);
      children.forEach(function (node) {
        if (node.tagName && node.tagName.toLowerCase() === "style" && String(node.textContent || "").indexOf("readerpub-direct-content") !== -1) {
          return;
        }
        node.parentNode && node.parentNode.removeChild(node);
      });
    }
    this.originalToLive = new WeakMap();
    this.liveToOriginal = new WeakMap();
  };

  DirectView.prototype.render = function (request) {
    this.create();
    this.size();
    return this.section.load(request).then(function () {
      var originalDoc = this.section.document;
      var originalBody = originalDoc && (originalDoc.body || originalDoc.querySelector("body"));
      if (!originalDoc || !originalBody) throw new Error("Direct view missing section body");
      this.resetContent();
      cloneHeadAssets(originalDoc, this.styleHost, this.section.url);
      var bodyClass = String(originalBody.getAttribute("class") || "").trim();
      if (bodyClass) this.contentRoot.className += " " + bodyClass;
      var bodyDir = String(originalBody.getAttribute("dir") || "").trim();
      if (bodyDir) {
        this.contentRoot.setAttribute("dir", bodyDir);
        this.viewportRoot.setAttribute("dir", bodyDir);
      }
      var children = originalBody.childNodes ? Array.prototype.slice.call(originalBody.childNodes) : [];
      for (var index = 0; index < children.length; index += 1) {
        this.contentRoot.appendChild(
          buildParallelClone(children[index], document, this.section.url, this.originalToLive, this.liveToOriginal, "b." + index)
        );
      }
      this.originalDocument = originalDoc;
      this.document = createScopedDocument(document, this.shadowRoot, this.styleHost, this.viewportRoot, this.contentRoot);
      this.contents = new DirectContents({
        section: this.section,
        sectionIndex: this.section.index,
        cfiBase: this.section.cfiBase,
        shadowRoot: this.shadowRoot,
        document: this.document,
        documentElement: this.viewportRoot,
        head: this.styleHost,
        body: this.contentRoot,
        originalDocument: this.originalDocument,
        originalToLive: this.originalToLive,
        liveToOriginal: this.liveToOriginal
      });
      this.contents.on("expand", function () {
        if (!this.displayed || !this.contents) return;
        this.expand();
        this.layout.format(this.contents);
      }.bind(this));
      this.contents.on("resize", function () {
        if (!this.displayed || !this.contents) return;
        this.expand();
        this.layout.format(this.contents);
      }.bind(this));
      this.layout.format(this.contents);
      var writingMode = this.contents.writingMode();
      var axis = writingMode.indexOf("vertical") === 0 ? "vertical" : "horizontal";
      this.setAxis(axis);
      this.emit("axis", axis);
      this.expand();
      this.emit("rendered", this.section);
      return this;
    }.bind(this));
  };

  DirectView.prototype.reset = function () {
    this._width = 0;
    this._height = 0;
    this._needsReframe = true;
  };

  DirectView.prototype.size = function (width, height) {
    width = width || this.settings.width;
    height = height || this.settings.height;
    if (this.layout.name === "pre-paginated") {
      this.lock("both", width, height);
    } else if (this.settings.axis === "horizontal") {
      this.lock("height", width, height);
    } else {
      this.lock("width", width, height);
    }
    this.settings.width = width;
    this.settings.height = height;
  };

  DirectView.prototype.lock = function (what, width, height) {
    if (what === "width" && width != null) this.lockedWidth = width;
    if (what === "height" && height != null) this.lockedHeight = height;
    if (what === "both") {
      this.lockedWidth = width;
      this.lockedHeight = height;
    }
    if (this.displayed) this.expand();
  };

  DirectView.prototype.expand = function () {
    if (!this.contents) return;
    var width = this.lockedWidth;
    var height = this.lockedHeight;
    if (this.layout.name === "pre-paginated") {
      width = this.layout.columnWidth;
      height = this.layout.height;
    } else if (this.settings.axis === "horizontal") {
      width = Math.max(this.contents.textWidth(), this.contents.scrollWidth());
      if (width % this.layout.pageWidth > 0) {
        width = Math.ceil(width / this.layout.pageWidth) * this.layout.pageWidth;
      }
    } else if (this.settings.axis === "vertical") {
      height = this.contents.textHeight();
    }
    if (this._needsReframe || width !== this._width || height !== this._height) {
      this.reframe(width, height);
    }
  };

  DirectView.prototype.reframe = function (width, height) {
    if (width != null) {
      this.element.style.width = width + "px";
      if (this.viewportRoot) this.viewportRoot.style.width = width + "px";
      this._width = width;
    }
    if (height != null) {
      this.element.style.height = height + "px";
      if (this.viewportRoot) this.viewportRoot.style.height = height + "px";
      this._height = height;
    }
    this._needsReframe = false;
    this.onResize && this.onResize(this, { width: width, height: height, widthDelta: width, heightDelta: height });
    this.emit("resized", { width: width, height: height, widthDelta: width, heightDelta: height });
  };

  DirectView.prototype.setLayout = function (layout) {
    this.layout = layout;
    if (this.contents) {
      this.layout.format(this.contents);
      this.expand();
    }
  };

  DirectView.prototype.setAxis = function (axis) {
    if (this.layout.props.flow === "scrolled") axis = "vertical";
    this.settings.axis = axis;
    this.element.style.flex = axis === "horizontal" ? "none" : "initial";
    this.size();
  };

  DirectView.prototype.display = function (request) {
    if (this.displayed) return Promise.resolve(this);
    return this.render(request).then(function () {
      this.emit("displayed", this);
      this.onDisplayed(this);
      this.displayed = true;
      return this;
    }.bind(this));
  };

  DirectView.prototype.show = function () {
    this.element.style.visibility = "visible";
    this.emit("shown", this);
  };

  DirectView.prototype.hide = function () {
    this.element.style.visibility = "hidden";
    this.emit("hidden", this);
  };

  DirectView.prototype.offset = function () {
    return { top: this.element.offsetTop, left: this.element.offsetLeft };
  };

  DirectView.prototype.width = function () { return this._width; };
  DirectView.prototype.height = function () { return this._height; };
  DirectView.prototype.position = function () { return this.element.getBoundingClientRect(); };
  DirectView.prototype.locationOf = function (target) { return this.contents ? this.contents.locationOf(target, this.settings.ignoreClass) : { top: 0, left: 0 }; };
  DirectView.prototype.onDisplayed = function () {};
  DirectView.prototype.onResize = function () {};
  DirectView.prototype.bounds = function () { return this.element.getBoundingClientRect(); };

  DirectView.prototype._createOverlay = function (className, range, data, cb, kind) {
    if (!range) return null;
    var rects = Array.prototype.slice.call(range.getClientRects ? range.getClientRects() : []);
    if (!rects.length) {
      var single = range.getBoundingClientRect ? range.getBoundingClientRect() : null;
      if (single && single.width && single.height) rects = [single];
    }
    if (!rects.length) return null;
    var overlay = document.createElement("div");
    overlay.className = className;
    overlay.setAttribute("ref", className.indexOf("ul") !== -1 ? "epubjs-ul" : "epubjs-hl");
    overlay.style.position = "absolute";
    overlay.style.inset = "0";
    overlay.style.pointerEvents = "none";
    var hostRect = this.element.getBoundingClientRect();
    rects.forEach(function (rect) {
      var part = document.createElement("div");
      part.style.position = "absolute";
      part.style.left = rect.left - hostRect.left + "px";
      part.style.top = rect.top - hostRect.top + "px";
      part.style.width = rect.width + "px";
      part.style.height = rect.height + "px";
      part.style.pointerEvents = "auto";
      if (kind === "underline") {
        part.style.borderBottom = "2px solid rgba(0,0,0,0.35)";
        part.style.background = "transparent";
      } else {
        part.style.background = "rgba(255,255,0,0.3)";
        part.style.mixBlendMode = "multiply";
      }
      overlay.appendChild(part);
    });
    var emitter = function () { this.emit("markClicked", cfiRange, data || {}); }.bind(this);
    overlay.addEventListener("click", emitter);
    overlay.addEventListener("touchstart", emitter);
    if (cb) {
      overlay.addEventListener("click", cb);
      overlay.addEventListener("touchstart", cb);
    }
    overlay.__readerpubListeners = [emitter, cb];
    this.element.appendChild(overlay);
    return { element: overlay };
  };

  DirectView.prototype.highlight = function (cfiRange, data, cb) {
    if (!this.contents) return null;
    var range = this.contents.range(cfiRange);
    if (!range) return null;
    data = data || {};
    data.epubcfi = cfiRange;
    var added = this._createOverlay("epubjs-hl", range, data, cb, "highlight");
    this.highlights[cfiRange] = added;
    return added;
  };

  DirectView.prototype.underline = function (cfiRange, data, cb) {
    if (!this.contents) return null;
    var range = this.contents.range(cfiRange);
    if (!range) return null;
    data = data || {};
    data.epubcfi = cfiRange;
    var added = this._createOverlay("epubjs-ul", range, data, cb, "underline");
    this.underlines[cfiRange] = added;
    return added;
  };

  DirectView.prototype.mark = function (cfiRange, data, cb) {
    if (!this.contents || this.marks[cfiRange]) return this.marks[cfiRange];
    var range = this.contents.range(cfiRange);
    if (!range) return null;
    var container = range.commonAncestorContainer;
    var parent = container.nodeType === 1 ? container : container.parentNode;
    var rect = range.getBoundingClientRect();
    var mark = document.createElement("a");
    mark.setAttribute("ref", "epubjs-mk");
    mark.style.position = "absolute";
    mark.style.top = rect.top + "px";
    mark.style.left = rect.right + "px";
    mark.dataset.epubcfi = cfiRange;
    if (data) {
      Object.keys(data).forEach(function (key) { mark.dataset[key] = data[key]; });
    }
    var emitter = function () { this.emit("markClicked", cfiRange, data || {}); }.bind(this);
    if (cb) {
      mark.addEventListener("click", cb);
      mark.addEventListener("touchstart", cb);
    }
    mark.addEventListener("click", emitter);
    mark.addEventListener("touchstart", emitter);
    this.element.appendChild(mark);
    this.marks[cfiRange] = { element: mark, listeners: [emitter, cb] };
    return parent;
  };

  DirectView.prototype.unhighlight = function (cfiRange) {
    var item = this.highlights[cfiRange];
    if (!item) return;
    if (item.element && item.element.parentNode) item.element.parentNode.removeChild(item.element);
    delete this.highlights[cfiRange];
  };

  DirectView.prototype.ununderline = function (cfiRange) {
    var item = this.underlines[cfiRange];
    if (!item) return;
    if (item.element && item.element.parentNode) item.element.parentNode.removeChild(item.element);
    delete this.underlines[cfiRange];
  };

  DirectView.prototype.unmark = function (cfiRange) {
    var item = this.marks[cfiRange];
    if (!item) return;
    if (item.element && item.element.parentNode) item.element.parentNode.removeChild(item.element);
    delete this.marks[cfiRange];
  };

  DirectView.prototype.destroy = function () {
    var key;
    for (key in this.highlights) this.unhighlight(key);
    for (key in this.underlines) this.ununderline(key);
    for (key in this.marks) this.unmark(key);
    if (this.contents) this.contents.removeListeners();
    if (this.shadowRoot) this.shadowRoot.innerHTML = "";
    this.contents = null;
    this.document = null;
    this.shadowRoot = null;
    this.styleHost = null;
    this.contentRoot = null;
    this.displayed = false;
  };

  function patchRangeToCfi() {
    if (global.__readerpubDirectMappingPatched) return;
    global.__readerpubDirectMappingPatched = true;
    var originalGetRange = global.ePub.Rendition && global.ePub.Rendition.prototype ? global.ePub.Rendition.prototype.getRange : null;
    if (originalGetRange && !global.__readerpubDirectRenditionRangePatched) {
      global.__readerpubDirectRenditionRangePatched = true;
      global.ePub.Rendition.prototype.getRange = function (cfi, ignoreClass) {
        var found = this.manager && this.manager.visible ? this.manager.visible().filter(function (view) {
          return new global.ePub.CFI(cfi).spinePos === view.index;
        }) : [];
        if (found.length && found[0].contents && typeof found[0].contents.range === "function") {
          return found[0].contents.range(cfi, ignoreClass);
        }
        return originalGetRange.call(this, cfi, ignoreClass);
      };
    }
  }

  function patchRenditionInstance(rendition) {
    try {
      if (!rendition || !rendition.manager || !rendition.manager.mapping) return;
      var mapping = rendition.manager.mapping;
      if (mapping.__readerpubDirectPatched) return;
      mapping.__readerpubDirectPatched = true;
      var original = mapping.rangePairToCfiPair;
      mapping.rangePairToCfiPair = function (cfiBase, rangePair) {
        var startRange = rangePair && rangePair.start;
        var endRange = rangePair && rangePair.end;
        var directContents = null;
        try {
          var doc = startRange && startRange.startContainer && startRange.startContainer.ownerDocument;
          directContents = doc && doc.__readerpubDirectContents ? doc.__readerpubDirectContents : null;
        } catch (_error) {}
        if (!directContents) return original.call(this, cfiBase, rangePair);
        var startCfi = directContents.cfiFromRange(startRange);
        var endCfi = directContents.cfiFromRange(endRange);
        return { start: startCfi, end: endCfi };
      };
    } catch (_error) {}
  }

  patchRangeToCfi();

  global.ReaderPubUnprotectedDirect = {
    isDirectMode: isDirectMode,
    DirectView: DirectView,
    patchRenditionInstance: patchRenditionInstance
  };
})(window);
