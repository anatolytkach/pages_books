/* ReaderPub Google Drive sync (cloud-first, appDataFolder) */
(function () {
  "use strict";

  var SNAPSHOT_FILE_NAME = "readerpub-sync-v1.json";
  var DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
  var API_FILES = "https://www.googleapis.com/drive/v3/files";
  var API_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
  var TOKEN_KEY = "readerpub:drive:access_token";
  var TOKEN_EXP_KEY = "readerpub:drive:access_token_exp";
  var FILE_ID_KEY = "readerpub:drive:file_id";
  var MYBOOKS_LOCAL_KEY = "readerpub:mybooks:" + window.location.host;
  var PENDING_READER_SYNC_KEY = "readerpub:drive:pending_reader_sync:" + window.location.host;
  var TTS_LANG_LOCAL_KEY = "fbreader:tts:voiceLang";

  function nowTs() {
    return Date.now();
  }

  function safeParseJson(raw, fallback) {
    try { return JSON.parse(raw); } catch (e) {}
    return fallback;
  }

  function getClientId() {
    try {
      if (window.READERPUB_GOOGLE_CLIENT_ID) return String(window.READERPUB_GOOGLE_CLIENT_ID);
    } catch (e0) {}
    try {
      var meta = document.querySelector('meta[name="google-drive-client-id"]');
      if (meta && meta.content) return String(meta.content);
    } catch (e1) {}
    return "";
  }

  function normalizeSnapshot(input) {
    var s = (input && typeof input === "object") ? input : {};
    if (!s.version) s.version = 1;
    if (!s.updatedAt) s.updatedAt = nowTs();
    if (!s.books || typeof s.books !== "object") s.books = {};
    if (!s.positions || typeof s.positions !== "object") s.positions = {};
    if (!s.bookmarks || typeof s.bookmarks !== "object") s.bookmarks = {};
    if (!s.notes || typeof s.notes !== "object") s.notes = {};
    if (!s.preferences || typeof s.preferences !== "object") s.preferences = {};
    if (!s.preferences.tts || typeof s.preferences.tts !== "object") s.preferences.tts = {};
    if (s.preferences.tts.lastDetectedLanguage != null) {
      s.preferences.tts.lastDetectedLanguage = String(s.preferences.tts.lastDetectedLanguage || "").trim();
    }
    if (!s.preferences.tts.updatedAt) s.preferences.tts.updatedAt = 0;
    if (s.preferences.tts.lastBookId != null) {
      s.preferences.tts.lastBookId = String(s.preferences.tts.lastBookId || "").trim();
    }
    return s;
  }

  function getStorage() {
    try { return window.localStorage || null; } catch (e) {}
    return null;
  }

  function getSessionStorage() {
    try { return window.sessionStorage || null; } catch (e) {}
    return null;
  }

  function isDemoEntry() {
    try {
      var ctx = window.__readerpubEntryContext || null;
      return !!(ctx && ctx.isDemoEntry);
    } catch (e) {}
    return false;
  }

  function currentDemoBookId() {
    if (!isDemoEntry()) return "";
    return currentBookId();
  }

  function loadPendingReaderSync() {
    var storage = getStorage();
    if (!storage) return null;
    try {
      var raw = storage.getItem(PENDING_READER_SYNC_KEY);
      if (!raw) return null;
      var parsed = safeParseJson(raw, null);
      if (!parsed || typeof parsed !== "object") return null;
      if (!parsed.id) return null;
      parsed.id = String(parsed.id);
      return parsed;
    } catch (e0) {}
    return null;
  }

  function savePendingReaderSync(payload) {
    var storage = getStorage();
    if (!storage || !payload || !payload.id) return false;
    try {
      storage.setItem(PENDING_READER_SYNC_KEY, JSON.stringify({
        id: String(payload.id),
        title: String(payload.title || ""),
        author: String(payload.author || ""),
        cover: String(payload.cover || payload.coverUrl || payload.cover_url || ""),
        source: String(payload.source || ""),
        openUrl: String(payload.openUrl || ""),
        protected: !!payload.protected,
        reader: String(payload.reader || ""),
        protectedArtifactBookId: String(payload.protectedArtifactBookId || ""),
        protectedArtifactSource: String(payload.protectedArtifactSource || ""),
        readerRemoteMode: String(payload.readerRemoteMode || ""),
        protectedUx: String(payload.protectedUx || ""),
        renderMode: String(payload.renderMode || ""),
        metricsMode: String(payload.metricsMode || ""),
        cfi: String(payload.cfi || ""),
        bookmarks: Array.isArray(payload.bookmarks) ? payload.bookmarks : [],
        notes: Array.isArray(payload.notes) ? payload.notes : [],
        queuedAt: nowTs()
      }));
      return true;
    } catch (e0) {}
    return false;
  }

  function clearPendingReaderSync() {
    var storage = getStorage();
    if (!storage) return;
    try { storage.removeItem(PENDING_READER_SYNC_KEY); } catch (e0) {}
  }

  var state = {
    clientId: getClientId(),
    token: "",
    tokenExp: 0,
    fileId: "",
    tokenClient: null,
    gisLoading: null
  };

  (function loadCachedAuth() {
    var session = getSessionStorage();
    var storage = getStorage();
    try {
      var cachedToken = (session && session.getItem(TOKEN_KEY)) || (storage && storage.getItem(TOKEN_KEY)) || "";
      var cachedExp = parseInt((session && session.getItem(TOKEN_EXP_KEY)) || (storage && storage.getItem(TOKEN_EXP_KEY)) || "0", 10);
      var cachedFileId = (storage && storage.getItem(FILE_ID_KEY)) || "";
      if (cachedToken) state.token = cachedToken;
      if (cachedExp && isFinite(cachedExp)) state.tokenExp = cachedExp;
      if (cachedFileId) state.fileId = cachedFileId;
    } catch (e) {}
  })();

  function persistAuth() {
    var session = getSessionStorage();
    var storage = getStorage();
    try {
      if (session) {
        if (state.token) session.setItem(TOKEN_KEY, state.token); else session.removeItem(TOKEN_KEY);
        if (state.tokenExp) session.setItem(TOKEN_EXP_KEY, String(state.tokenExp)); else session.removeItem(TOKEN_EXP_KEY);
      }
    } catch (e0) {}
    try {
      if (storage) {
        if (state.token) storage.setItem(TOKEN_KEY, state.token); else storage.removeItem(TOKEN_KEY);
        if (state.tokenExp) storage.setItem(TOKEN_EXP_KEY, String(state.tokenExp)); else storage.removeItem(TOKEN_EXP_KEY);
        if (state.fileId) storage.setItem(FILE_ID_KEY, state.fileId); else storage.removeItem(FILE_ID_KEY);
      }
    } catch (e1) {}
  }

  function clearToken() {
    state.token = "";
    state.tokenExp = 0;
    var session = getSessionStorage();
    var storage = getStorage();
    try {
      if (session) {
        session.removeItem(TOKEN_KEY);
        session.removeItem(TOKEN_EXP_KEY);
      }
    } catch (e0) {}
    try {
      if (storage) {
        storage.removeItem(TOKEN_KEY);
        storage.removeItem(TOKEN_EXP_KEY);
      }
    } catch (e1) {}
  }

  function isTokenValid() {
    if (!state.token) return false;
    if (!state.tokenExp) return true;
    return nowTs() + 15000 < state.tokenExp;
  }

  function isConfigured() {
    return !!state.clientId;
  }

  function getAuthState() {
    return {
      configured: isConfigured(),
      authorized: isTokenValid()
    };
  }

  function loadGis() {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
      return Promise.resolve();
    }
    if (state.gisLoading) return state.gisLoading;
    state.gisLoading = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.defer = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("Failed to load Google Identity Services")); };
      document.head.appendChild(s);
    });
    return state.gisLoading;
  }

  function ensureTokenClient() {
    if (state.tokenClient) return Promise.resolve(state.tokenClient);
    if (!isConfigured()) return Promise.reject(new Error("Google Drive client id is not configured"));
    return loadGis().then(function () {
      if (!(window.google && window.google.accounts && window.google.accounts.oauth2)) {
        throw new Error("Google Identity Services is unavailable");
      }
      state.tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: state.clientId,
        scope: DRIVE_SCOPE,
        callback: function () {}
      });
      return state.tokenClient;
    });
  }

  function requestAccessToken(interactive) {
    return ensureTokenClient().then(function (client) {
      return new Promise(function (resolve, reject) {
        var settled = false;
        var timeoutMs = interactive ? 180000 : 15000;
        var timeoutId = setTimeout(function () {
          if (settled) return;
          settled = true;
          reject(new Error("Google authorization timed out. Allow pop-ups for this site and try again."));
        }, timeoutMs);
        client.error_callback = function (err) {
          if (settled) return;
          settled = true;
          try { clearTimeout(timeoutId); } catch (eErr0) {}
          var t = (err && err.type) ? String(err.type) : "";
          if (t === "popup_closed") {
            reject(new Error("Google authorization window was closed."));
            return;
          }
          if (t === "popup_failed_to_open") {
            reject(new Error("Google authorization popup was blocked. Allow pop-ups for this site and try again."));
            return;
          }
          reject(new Error("Google authorization failed."));
        };
        client.callback = function (resp) {
          if (settled) return;
          settled = true;
          try { clearTimeout(timeoutId); } catch (e0) {}
          if (resp && resp.access_token) {
            state.token = resp.access_token;
            if (resp.expires_in) state.tokenExp = nowTs() + (parseInt(resp.expires_in, 10) * 1000);
            persistAuth();
            resolve(true);
            return;
          }
          var errMsg = (resp && (resp.error_description || resp.error)) ? String(resp.error_description || resp.error) : "";
          if (errMsg) {
            reject(new Error("Google authorization failed: " + errMsg));
            return;
          }
          reject(new Error("Google authorization was canceled"));
        };
        try {
          client.requestAccessToken({ prompt: interactive ? "select_account" : "" });
        } catch (e) {
          if (settled) return;
          settled = true;
          try { clearTimeout(timeoutId); } catch (e1) {}
          reject(e);
        }
      });
    });
  }

  function ensureAuthorized(interactive) {
    if (isTokenValid()) return Promise.resolve(true);
    if (!interactive) return Promise.resolve(false);
    return requestAccessToken(true);
  }

  function authHeaders(extra) {
    var h = extra || {};
    h.Authorization = "Bearer " + state.token;
    return h;
  }

  function driveFetch(url, opts) {
    var options = opts || {};
    options.headers = authHeaders(options.headers || {});
    return fetch(url, options).then(function (res) {
      if (res.status === 401) {
        clearToken();
        throw new Error("Drive authorization expired");
      }
      if (res.status === 403) {
        var wwwAuth = String(res.headers.get("www-authenticate") || "");
        if (/invalid_token|insufficient_scope/i.test(wwwAuth)) {
          clearToken();
          throw new Error("Drive authorization expired");
        }
      }
      if (!res.ok) {
        return res.text().then(function (txt) {
          throw new Error("Drive request failed (" + res.status + "): " + (txt || res.statusText));
        });
      }
      return res;
    });
  }

  function findSnapshotFileId() {
    var q = encodeURIComponent("name = '" + SNAPSHOT_FILE_NAME + "' and trashed = false");
    var fields = encodeURIComponent("files(id,name,modifiedTime)");
    var url = API_FILES + "?spaces=appDataFolder&q=" + q + "&pageSize=1&fields=" + fields;
    return driveFetch(url).then(function (res) { return res.json(); }).then(function (json) {
      var files = (json && json.files) || [];
      if (files.length && files[0].id) {
        state.fileId = files[0].id;
        persistAuth();
        return state.fileId;
      }
      return "";
    });
  }

  function createSnapshotFile(snapshot) {
    var boundary = "-------readerpub-sync-" + nowTs();
    var metadata = {
      name: SNAPSHOT_FILE_NAME,
      parents: ["appDataFolder"],
      mimeType: "application/json"
    };
    var body =
      "--" + boundary + "\r\n" +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) + "\r\n" +
      "--" + boundary + "\r\n" +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(normalizeSnapshot(snapshot)) + "\r\n" +
      "--" + boundary + "--";
    var url = API_UPLOAD + "?uploadType=multipart&fields=id,modifiedTime";
    return driveFetch(url, {
      method: "POST",
      headers: { "Content-Type": "multipart/related; boundary=" + boundary },
      body: body
    }).then(function (res) { return res.json(); }).then(function (json) {
      if (!json || !json.id) throw new Error("Unable to create Drive snapshot file");
      state.fileId = json.id;
      persistAuth();
      return state.fileId;
    });
  }

  function updateSnapshotFile(snapshot) {
    if (!state.fileId) return createSnapshotFile(snapshot);
    var boundary = "-------readerpub-sync-" + nowTs();
    var metadata = { mimeType: "application/json" };
    var body =
      "--" + boundary + "\r\n" +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) + "\r\n" +
      "--" + boundary + "\r\n" +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(normalizeSnapshot(snapshot)) + "\r\n" +
      "--" + boundary + "--";
    var url = API_UPLOAD + "/" + encodeURIComponent(state.fileId) + "?uploadType=multipart&fields=id,modifiedTime";
    return driveFetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "multipart/related; boundary=" + boundary },
      body: body
    }).then(function (res) { return res.json(); }).then(function (json) {
      if (!json || !json.id) throw new Error("Unable to update Drive snapshot file");
      state.fileId = json.id;
      persistAuth();
      return normalizeSnapshot(snapshot);
    });
  }

  function pullSnapshot(options) {
    var opts = options || {};
    return ensureAuthorized(!!opts.interactive).then(function (ok) {
      if (!ok) throw new Error("Google Drive is not authorized");
      return findSnapshotFileId();
    }).then(function (id) {
      if (!id) {
        var seeded = buildSnapshotFromLocalReader();
        if (opts.createIfMissing === false) return seeded;
        return createSnapshotFile(seeded).then(function () { return seeded; });
      }
      var url = API_FILES + "/" + encodeURIComponent(id) + "?alt=media";
      return driveFetch(url).then(function (res) { return res.text(); }).then(function (raw) {
        return normalizeSnapshot(safeParseJson(raw, {}));
      });
    });
  }

  function saveSnapshot(snapshot, options) {
    var opts = options || {};
    return ensureAuthorized(!!opts.interactive).then(function (ok) {
      if (!ok) throw new Error("Google Drive is not authorized");
      var normalized = normalizeSnapshot(snapshot);
      normalized.updatedAt = nowTs();
      return updateSnapshotFile(normalized).then(function () {
        return normalized;
      });
    });
  }

  function listMyBooks(snapshot) {
    var s = normalizeSnapshot(snapshot || {});
    var out = [];
    var books = s.books || {};
    var demoBookId = currentDemoBookId();
    Object.keys(books).forEach(function (id) {
      var item = books[id];
      if (!item || !item.id) return;
      if (demoBookId && String(item.id) === demoBookId) return;
      out.push({
        id: String(item.id),
        source: String(item.source || ""),
        title: String(item.title || ("Book " + item.id)),
        author: String(item.author || ""),
        cover: String(item.cover || item.coverUrl || item.cover_url || ""),
        openUrl: String(item.openUrl || ""),
        protected: !!item.protected,
        reader: String(item.reader || ""),
        protectedArtifactBookId: String(item.protectedArtifactBookId || ""),
        protectedArtifactSource: String(item.protectedArtifactSource || ""),
        readerRemoteMode: String(item.readerRemoteMode || ""),
        protectedUx: String(item.protectedUx || ""),
        renderMode: String(item.renderMode || ""),
        metricsMode: String(item.metricsMode || ""),
        openedAt: item.openedAt || 0
      });
    });
    out.sort(function (a, b) { return (b.openedAt || 0) - (a.openedAt || 0); });
    return out;
  }

  function deleteBooksCascade(bookIds, options) {
    var ids = (bookIds || []).map(function (x) { return String(x || ""); }).filter(Boolean);
    if (!ids.length) return Promise.resolve(normalizeSnapshot({}));
    return pullSnapshot({ interactive: !!(options && options.interactive) }).then(function (snapshot) {
      ids.forEach(function (id) {
        try { delete snapshot.books[id]; } catch (e1) {}
        try { delete snapshot.positions[id]; } catch (e2) {}
        try { delete snapshot.bookmarks[id]; } catch (e3) {}
        try { delete snapshot.notes[id]; } catch (e4) {}
      });
      return saveSnapshot(snapshot, { interactive: !!(options && options.interactive) });
    });
  }

  function currentBookId() {
    try {
      var params = new URLSearchParams(window.location.search || "");
      var id = params.get("id");
      if (id && /^\d+$/.test(String(id))) return String(id);
    } catch (e0) {}
    return "";
  }

  function currentBookStorageKey(id) {
    var version = "0";
    try { if (window.EPUBJS && window.EPUBJS.VERSION) version = String(window.EPUBJS.VERSION); } catch (e0) {}
    return "epubjsreader:" + version + ":" + window.location.host + ":" + "/books/content/" + id + "/";
  }

  function buildSnapshotFromLocalReader() {
    var storage = getStorage();
    var snapshot = normalizeSnapshot({});
    var ts = nowTs();
    var demoBookId = currentDemoBookId();
    if (!storage) return snapshot;

    function coerceArray(value) {
      return Array.isArray(value) ? value.slice() : null;
    }

    function ensureBook(id, meta) {
      var bid = String(id || "");
      if (!bid) return "";
      var m = (meta && typeof meta === "object") ? meta : {};
      var openedAt = parseInt(m.openedAt || m.updatedAt || m.ts || "0", 10);
      if (!isFinite(openedAt) || openedAt <= 0) openedAt = ts;
      var title = m.title ? String(m.title) : ("Book " + bid);
      var author = m.author ? String(m.author) : "";
      var cover = m.cover ? String(m.cover) : "";
      var key = buildBookSnapshotKey({
        id: bid,
        source: m.source || "",
        protected: !!m.protected,
        reader: m.reader || "",
        protectedArtifactBookId: m.protectedArtifactBookId || ""
      });
      if (!snapshot.books[key]) {
        snapshot.books[key] = {
          id: bid,
          source: String(m.source || ""),
          title: title,
          author: author,
          cover: cover,
          openUrl: String(m.openUrl || ""),
          protected: !!m.protected,
          reader: String(m.reader || ""),
          protectedArtifactBookId: String(m.protectedArtifactBookId || ""),
          protectedArtifactSource: String(m.protectedArtifactSource || ""),
          readerRemoteMode: String(m.readerRemoteMode || ""),
          protectedUx: String(m.protectedUx || ""),
          renderMode: String(m.renderMode || ""),
          metricsMode: String(m.metricsMode || ""),
          openedAt: openedAt,
          updatedAt: ts
        };
      } else {
        if ((!snapshot.books[key].title || snapshot.books[key].title === ("Book " + bid)) && title) {
          snapshot.books[key].title = title;
        }
        if (!snapshot.books[key].author && author) {
          snapshot.books[key].author = author;
        }
        if (!snapshot.books[key].cover && cover) {
          snapshot.books[key].cover = cover;
        }
        if (openedAt > (parseInt(snapshot.books[key].openedAt || "0", 10) || 0)) {
          snapshot.books[key].openedAt = openedAt;
        }
      }
      return bid;
    }

    try {
      var myBooksRaw = storage.getItem(MYBOOKS_LOCAL_KEY) || "[]";
      var myBooks = safeParseJson(myBooksRaw, []);
      if (Array.isArray(myBooks)) {
        myBooks.forEach(function (item) {
          if (!item || !item.id) return;
          ensureBook(item.id, item);
        });
      }
    } catch (e0) {}

    try {
      for (var i = 0; i < storage.length; i++) {
        var key = storage.key(i);
        if (!key || key.indexOf("epubjsreader:") !== 0) continue;
        var m = key.match(/:\/books\/content\/([^/]+)\//);
        if (!m || !m[1]) continue;
        if (demoBookId && String(m[1]) === demoBookId) continue;
        var bid = ensureBook(m[1], null);
        if (!bid) continue;

        var saved = safeParseJson(storage.getItem(key) || "null", null);
        if (!saved || typeof saved !== "object") continue;

        if (saved.previousLocationCfi) {
          snapshot.positions[bid] = {
            cfi: String(saved.previousLocationCfi),
            updatedAt: ts
          };
        }

        var bm = coerceArray(saved.bookmarks);
        if (bm) snapshot.bookmarks[bid] = bm;

        var notes = coerceArray(saved.annotations) || coerceArray(saved.notes);
        if (notes) snapshot.notes[bid] = notes;

        ensureBook(bid, {
          openedAt: saved.openedAt || saved.updatedAt || saved.lastAccess || 0
        });
      }
    } catch (e1) {}

    try {
      var lastId = storage.getItem("readerpub:lastid");
      if (lastId && (!demoBookId || String(lastId) !== demoBookId)) ensureBook(lastId, { openedAt: ts });
    } catch (e2) {}
    try {
      var lang = String(storage.getItem(TTS_LANG_LOCAL_KEY) || "").trim();
      if (lang) {
        snapshot.preferences.tts.lastDetectedLanguage = lang;
        snapshot.preferences.tts.updatedAt = ts;
      }
    } catch (eLang) {}

    snapshot.updatedAt = ts;
    return normalizeSnapshot(snapshot);
  }

  function applySnapshotToLocalReader(snapshot) {
    var storage = getStorage();
    if (!storage) return;
    var s = normalizeSnapshot(snapshot || {});
    var books = listMyBooks(s);
    try { storage.setItem(MYBOOKS_LOCAL_KEY, JSON.stringify(books)); } catch (e1) {}

    var present = {};
    var presentKeys = {};
    books.forEach(function (b) { present[String(b.id)] = true; });
    Object.keys(s.books).forEach(function (key) {
      if (s.books[key] && s.books[key].id) presentKeys[String(key)] = true;
    });

    try {
      for (var i = 0; i < storage.length; i++) {
        var key = storage.key(i);
        if (!key) continue;
        if (key.indexOf("epubjsreader:") !== 0) continue;
        var m = key.match(/:\/books\/content\/([^/]+)\//);
        if (!m || !m[1]) continue;
        var bid = String(m[1]);
        if (!present[bid]) {
          try { storage.removeItem(key); } catch (eRm) {}
        }
      }
    } catch (e2) {}

    Object.keys(s.books).forEach(function (snapshotKey) {
      var item = s.books[snapshotKey] || {};
      var id = String(item.id || snapshotKey);
      if (!present[id] && !presentKeys[snapshotKey]) return;
      if (snapshotKey !== id) return;
      var key = currentBookStorageKey(id);
      var saved = safeParseJson((storage && storage.getItem(key)) || "null", null);
      if (!saved || typeof saved !== "object") saved = {};
      var pos = s.positions[id];
      saved.previousLocationCfi = (pos && pos.cfi) ? pos.cfi : (saved.previousLocationCfi || "");
      saved.bookmarks = Array.isArray(s.bookmarks[id]) ? s.bookmarks[id] : [];
      saved.notes = Array.isArray(s.notes[id]) ? s.notes[id] : [];
      saved.annotations = Array.isArray(s.notes[id]) ? s.notes[id] : [];
      try { storage.setItem(key, JSON.stringify(saved)); } catch (eSet) {}
    });

    try {
      var lastId = storage.getItem("readerpub:lastid");
      if (lastId && !present[String(lastId)]) storage.removeItem("readerpub:lastid");
    } catch (e3) {}
    try {
      var lang = String(s.preferences && s.preferences.tts && s.preferences.tts.lastDetectedLanguage || "").trim();
      if (lang) storage.setItem(TTS_LANG_LOCAL_KEY, lang);
    } catch (e4) {}
  }

  function getLastDetectedTtsLanguage(snapshot) {
    var s = normalizeSnapshot(snapshot || {});
    return String(s.preferences && s.preferences.tts && s.preferences.tts.lastDetectedLanguage || "").trim();
  }

  function setLastDetectedTtsLanguage(language, meta, options) {
    var lang = String(language || "").trim();
    if (!lang) return Promise.resolve(false);
    var m = (meta && typeof meta === "object") ? meta : {};
    var opts = options || {};
    var bookId = String(m.bookId || currentBookId() || "").trim();
    return pullSnapshot({ interactive: !!opts.interactive }).then(function (snapshot) {
      var prevLang = getLastDetectedTtsLanguage(snapshot);
      var prevBookId = String(snapshot.preferences && snapshot.preferences.tts && snapshot.preferences.tts.lastBookId || "").trim();
      if (prevLang === lang && prevBookId === bookId) {
        applySnapshotToLocalReader(snapshot);
        return false;
      }
      snapshot.preferences.tts.lastDetectedLanguage = lang;
      snapshot.preferences.tts.updatedAt = nowTs();
      snapshot.preferences.tts.lastBookId = bookId || "";
      return saveSnapshot(snapshot, { interactive: !!opts.interactive }).then(function (saved) {
        applySnapshotToLocalReader(saved);
        return true;
      });
    }).catch(function () {
      return false;
    });
  }

  function buildReaderPayload(reader, meta) {
    if (isDemoEntry()) return null;
    var id = (meta && meta.id) ? String(meta.id) : currentBookId();
    if (!id) return null;
    var title = (meta && meta.title) ? String(meta.title) : "";
    var author = (meta && meta.author) ? String(meta.author) : "";
    var cover = (meta && meta.cover) ? String(meta.cover) : "";
    if (!title) {
      try {
        var tEl = document.getElementById("book-title");
        title = tEl ? String(tEl.textContent || "").trim() : "";
      } catch (e0) {}
    }
    if (!author) {
      try {
        var aEl = document.getElementById("chapter-title");
        author = aEl ? String(aEl.textContent || "").trim() : "";
      } catch (e1) {}
    }
    var cfi = "";
    try {
      if (reader && reader.rendition && reader.rendition.currentLocation) {
        var loc = reader.rendition.currentLocation();
        cfi = (loc && loc.start && loc.start.cfi) ? String(loc.start.cfi) : "";
      }
    } catch (e2) {}
    if (!cfi) {
      try { cfi = String(reader && reader.settings && reader.settings.previousLocationCfi || ""); } catch (e3) {}
    }
    var bookmarks = [];
    var notes = [];
    try { bookmarks = Array.isArray(reader && reader.settings && reader.settings.bookmarks) ? reader.settings.bookmarks.slice() : []; } catch (e4) {}
    try {
      if (Array.isArray(reader && reader.settings && reader.settings.annotations)) {
        notes = reader.settings.annotations.slice();
      } else if (Array.isArray(reader && reader.settings && reader.settings.notes)) {
        notes = reader.settings.notes.slice();
      } else {
        notes = [];
      }
    } catch (e5) {}
    return {
      id: id,
      source: meta && meta.source ? String(meta.source) : "",
      title: title || ("Book " + id),
      author: author || "",
      cover: cover || "",
      openUrl: meta && meta.openUrl ? String(meta.openUrl) : "",
      protected: !!(meta && meta.protected),
      reader: meta && meta.reader ? String(meta.reader) : "",
      protectedArtifactBookId: meta && meta.protectedArtifactBookId ? String(meta.protectedArtifactBookId) : "",
      protectedArtifactSource: meta && meta.protectedArtifactSource ? String(meta.protectedArtifactSource) : "",
      readerRemoteMode: meta && meta.readerRemoteMode ? String(meta.readerRemoteMode) : "",
      protectedUx: meta && meta.protectedUx ? String(meta.protectedUx) : "",
      renderMode: meta && meta.renderMode ? String(meta.renderMode) : "",
      metricsMode: meta && meta.metricsMode ? String(meta.metricsMode) : "",
      cfi: cfi || "",
      bookmarks: bookmarks,
      notes: notes
    };
  }

  function buildBookSnapshotKey(entry) {
    var id = String(entry && entry.id || "").trim();
    if (!id) return "";
    var source = String(entry && entry.source || "").trim();
    var reader = String(entry && entry.reader || "").trim().toLowerCase();
    var artifactId = String(entry && entry.protectedArtifactBookId || "").trim();
    if (entry && (entry.protected || reader === "protected")) {
      return ["protected", source || "default", artifactId || id].join(":");
    }
    if (source && source !== "gutenberg") return [source, id].join(":");
    return id;
  }

  function writeBookPayloadToSnapshot(snapshot, payload, ts) {
    var key = buildBookSnapshotKey(payload);
    if (!key) return "";
    var existing = (snapshot.books && snapshot.books[key] && typeof snapshot.books[key] === "object") ? snapshot.books[key] : {};
    snapshot.books[key] = {
      id: String(payload.id),
      source: String(payload.source || existing.source || ""),
      title: payload.title || existing.title || ("Book " + payload.id),
      author: payload.author || existing.author || "",
      cover: payload.cover || existing.cover || "",
      openUrl: payload.openUrl || existing.openUrl || "",
      protected: !!(payload.protected || existing.protected),
      reader: payload.reader || existing.reader || "",
      protectedArtifactBookId: payload.protectedArtifactBookId || existing.protectedArtifactBookId || "",
      protectedArtifactSource: payload.protectedArtifactSource || existing.protectedArtifactSource || "",
      readerRemoteMode: payload.readerRemoteMode || existing.readerRemoteMode || "",
      protectedUx: payload.protectedUx || existing.protectedUx || "",
      renderMode: payload.renderMode || existing.renderMode || "",
      metricsMode: payload.metricsMode || existing.metricsMode || "",
      openedAt: ts,
      updatedAt: ts
    };
    return key;
  }

  function syncCurrentReaderState(reader, meta, options) {
    if (isDemoEntry()) return Promise.resolve(false);
    var payload = buildReaderPayload(reader, meta);
    if (!payload || !payload.id) return Promise.resolve(false);
    var opts = options || {};
    return pullSnapshot({ interactive: !!opts.interactive }).then(function (snapshot) {
      var ts = nowTs();
      var id = payload.id;
      var snapshotKey = writeBookPayloadToSnapshot(snapshot, payload, ts);
      if (!snapshotKey || snapshotKey === id) {
        if (payload.cfi) snapshot.positions[id] = { cfi: payload.cfi, updatedAt: ts };
        snapshot.bookmarks[id] = Array.isArray(payload.bookmarks) ? payload.bookmarks : [];
        snapshot.notes[id] = Array.isArray(payload.notes) ? payload.notes : [];
      }
      return saveSnapshot(snapshot, { interactive: !!opts.interactive }).then(function (saved) {
        applySnapshotToLocalReader(saved);
        clearPendingReaderSync();
        return true;
      });
    }).catch(function () {
      savePendingReaderSync(payload);
      return false;
    });
  }

  function deleteBookEntry(meta, options) {
    var m = (meta && typeof meta === "object") ? meta : {};
    var id = String(m.id || "").trim();
    if (!id) return Promise.resolve(normalizeSnapshot({}));
    var key = buildBookSnapshotKey(m) || id;
    var opts = options || {};
    return pullSnapshot({ interactive: !!opts.interactive }).then(function (snapshot) {
      try { delete snapshot.books[key]; } catch (e1) {}
      if (key === id) {
        try { delete snapshot.positions[id]; } catch (e2) {}
        try { delete snapshot.bookmarks[id]; } catch (e3) {}
        try { delete snapshot.notes[id]; } catch (e4) {}
      }
      return saveSnapshot(snapshot, { interactive: !!opts.interactive }).then(function (saved) {
        applySnapshotToLocalReader(saved);
        return saved;
      });
    });
  }

  function flushPendingReaderStateSync(options) {
    var pending = loadPendingReaderSync();
    if (!pending || !pending.id) return Promise.resolve(false);
    return syncCurrentReaderState(null, pending, options || {}).then(function (ok) {
      if (ok) clearPendingReaderSync();
      return !!ok;
    }).catch(function () {
      return false;
    });
  }

  var _syncTimer = null;
  function scheduleCurrentReaderStateSync(reader, meta, delayMs) {
    if (isDemoEntry()) return;
    var delay = (typeof delayMs === "number" && delayMs >= 0) ? delayMs : 900;
    if (_syncTimer) {
      try { clearTimeout(_syncTimer); } catch (e0) {}
      _syncTimer = null;
    }
    _syncTimer = setTimeout(function () {
      _syncTimer = null;
      try { syncCurrentReaderState(reader, meta, { interactive: false }); } catch (e1) {}
    }, delay);
  }

  window.ReaderPubDriveSync = {
    isConfigured: isConfigured,
    getAuthState: getAuthState,
    ensureAuthorized: ensureAuthorized,
    signIn: function () { return ensureAuthorized(true); },
    signOut: function () { clearToken(); },
    pullSnapshot: pullSnapshot,
    saveSnapshot: saveSnapshot,
    listMyBooks: listMyBooks,
    deleteBooksCascade: deleteBooksCascade,
    deleteBookEntry: deleteBookEntry,
    applySnapshotToLocalReader: applySnapshotToLocalReader,
    getLastDetectedTtsLanguage: getLastDetectedTtsLanguage,
    setLastDetectedTtsLanguage: setLastDetectedTtsLanguage,
    syncCurrentReaderState: syncCurrentReaderState,
    scheduleCurrentReaderStateSync: scheduleCurrentReaderStateSync,
    flushPendingReaderStateSync: flushPendingReaderStateSync
  };

})();
