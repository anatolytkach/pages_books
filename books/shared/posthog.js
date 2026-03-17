"use strict";

(function initReaderPubAnalytics(global) {
  var analytics = {};
  var posthog = global.posthog || null;
  var sdkRequested = false;
  var pageviewSent = false;
  var bookOpenSent = false;

  function getMetaContent(name) {
    try {
      var element = document.querySelector('meta[name="' + name + '"]');
      return element ? String(element.getAttribute("content") || "").trim() : "";
    } catch (error) {
      return "";
    }
  }

  function normalizeHost(host) {
    var value = String(host || "").trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value.replace(/\/$/, "");
    return "https://" + value.replace(/\/$/, "");
  }

  function isEnabled() {
    var raw = getMetaContent("posthog-enabled");
    if (!raw) return false;
    return /^(1|true|yes|on)$/i.test(raw);
  }

  function getConfig() {
    return {
      key: getMetaContent("posthog-key"),
      host: normalizeHost(getMetaContent("posthog-host")),
      enabled: isEnabled(),
    };
  }

  function installSnippet() {
    if (global.posthog && typeof global.posthog.init === "function" && global.posthog.__SV) return global.posthog;
    if (global.posthog && typeof global.posthog.capture === "function" && !Array.isArray(global.posthog)) return global.posthog;

    (function (t, e) {
      var o, n, p, r;
      if (e.__SV) return;
      global.posthog = e;
      e._i = [];
      e.init = function (i, s, a) {
        function g(target, name) {
          var parts = name.split(".");
          if (parts.length === 2) {
            target = target[parts[0]];
            name = parts[1];
          }
          target[name] = function () {
            target.push([name].concat(Array.prototype.slice.call(arguments, 0)));
          };
        }

        var scriptHost = String((s && s.api_host) || "").replace(/\/$/, "");
        var scriptSrc = /(^https?:\/\/)([a-z0-9-]+)\.i\.posthog\.com$/i.test(scriptHost)
          ? scriptHost.replace(/\.i\.posthog\.com$/i, "-assets.i.posthog.com") + "/static/array.js"
          : scriptHost + "/static/array.js";

        p = t.createElement("script");
        p.type = "text/javascript";
        p.async = true;
        p.crossOrigin = "anonymous";
        p.src = scriptSrc;
        r = t.getElementsByTagName("script")[0];
        r.parentNode.insertBefore(p, r);

        var instance = e;
        if (a !== undefined) {
          instance = e[a] = [];
        } else {
          a = "posthog";
        }

        instance.people = instance.people || [];
        instance.toString = function (stub) {
          var label = "posthog";
          if (a !== "posthog") label += "." + a;
          if (!stub) label += " (stub)";
          return label;
        };
        instance.people.toString = function () {
          return instance.toString(1) + ".people (stub)";
        };

        o = "init capture register register_once unregister unregister_once alias identify set_config reset opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing capture_pageview capture_pageleave debug".split(" ");
        for (n = 0; n < o.length; n += 1) {
          g(instance, o[n]);
        }
        e._i.push([i, s, a]);
      };
      e.__SV = 1;
    })(document, global.posthog || []);

    return global.posthog || null;
  }

  function ensureInit(options) {
    var config = getConfig();
    if (!config.enabled || !config.key || !config.host) return null;

    posthog = installSnippet();
    if (!posthog || typeof posthog.init !== "function") return null;
    if (sdkRequested) return posthog;

    sdkRequested = true;
    posthog.init(config.key, Object.assign({
      api_host: config.host,
      autocapture: true,
      capture_pageview: false,
      capture_pageleave: false,
      persistence: "localStorage+cookie",
      loaded: function (client) {
        try {
          client.register({
            app_name: "reader.pub",
          });
        } catch (error) {}
      },
    }, options || {}));
    return posthog;
  }

  function toSlug(input) {
    var value = String(input || "").trim().toLowerCase();
    if (!value) return "";
    value = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    value = value.replace(/[^a-z0-9\u0400-\u04ff]+/g, "-");
    value = value.replace(/^-+|-+$/g, "");
    value = value.replace(/-+/g, "-");
    return value;
  }

  analytics.boot = function boot(options) {
    return ensureInit(options || {});
  };

  analytics.captureCatalogPageview = function captureCatalogPageview(properties) {
    var client = ensureInit();
    if (!client || pageviewSent) return false;
    pageviewSent = true;
    client.capture("$pageview", Object.assign({
      page_type: "catalog",
    }, properties || {}));
    return true;
  };

  analytics.captureReaderPageview = function captureReaderPageview(properties) {
    var client = ensureInit();
    if (!client || pageviewSent) return false;
    pageviewSent = true;
    client.capture("$pageview", Object.assign({
      page_type: "reader",
    }, properties || {}));
    return true;
  };

  analytics.captureBookOpen = function captureBookOpen(properties) {
    var client = ensureInit();
    if (!client || bookOpenSent) return false;
    var payload = properties && typeof properties === "object" ? properties : {};
    bookOpenSent = true;
    client.capture("book_open", {
      page_type: "reader",
      book_id: payload.book_id || "",
      slug: payload.slug || toSlug(payload.title || ""),
      title: payload.title || "",
      url: payload.url || global.location.href,
      referrer: payload.referrer || document.referrer || "",
    });
    return true;
  };

  analytics.isEnabled = function analyticsEnabled() {
    var config = getConfig();
    return !!(config.enabled && config.key && config.host);
  };

  analytics.slugify = toSlug;

  global.ReaderPubAnalytics = analytics;
})(window);
