/**
 * Notes Sync Module — syncs reader notes with Supabase for platform books.
 *
 * Integration approach: hooks into the existing fbreader-ui.js notes system
 * without modifying it. Intercepts addNote/deleteNote via window.__fbAddNote
 * and reader.settings.notes mutations.
 *
 * For platform books (content_id >= 200000) with authenticated users:
 *   - On load: fetch notes from Supabase, merge with localStorage
 *   - On add: save to Supabase + localStorage
 *   - On delete: delete from Supabase + localStorage
 *
 * For Gutenberg books or unauthenticated users:
 *   - No change to existing behavior (localStorage only)
 */

(function () {
  "use strict";

  var PLATFORM_ID_START = 200000;
  var API_BASE = "/books/api/v1";
  var SUPABASE_STORAGE_KEY = "sb-kalbegycglkhxulhatpx-auth-token";

  // ── Helpers ────────────────────────────

  function getBookContentId() {
    try {
      var params = new URLSearchParams(window.location.search);
      var id = params.get("id") || params.get("i") || "";
      if (/^\d+$/.test(id)) return id;
      var hash = (window.location.hash || "").replace(/^#/, "");
      if (/^\d+$/.test(hash)) return hash;
    } catch (e) {}
    return "";
  }

  function isPlatformBook(contentId) {
    return contentId && parseInt(contentId, 10) >= PLATFORM_ID_START;
  }

  function getAuthToken() {
    try {
      var stored = localStorage.getItem(SUPABASE_STORAGE_KEY);
      if (stored) return JSON.parse(stored).access_token;
    } catch (e) {}
    return null;
  }

  function apiFetch(method, path, body) {
    var token = getAuthToken();
    if (!token) return Promise.reject(new Error("Not authenticated"));
    var headers = {
      "Authorization": "Bearer " + token,
    };
    var opts = { method: method, headers: headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    return fetch(API_BASE + path, opts).then(function (res) {
      if (!res.ok) return res.json().then(function (d) { throw new Error(d.error || "API error"); });
      return res.json();
    });
  }

  // ── Format conversion ─────────────────

  // localStorage format: { id, cfi, href, quote, comment }
  // Supabase format: { id, anchor_cfi, anchor_href, quote, note_text, author_display_name, ... }

  function supabaseToLocal(note) {
    return {
      id: note.id,
      cfi: note.anchor_cfi,
      href: note.anchor_href || null,
      quote: note.quote || "",
      comment: note.note_text || "",
      _supabaseId: note.id,
      _author: note.author_display_name || "",
    };
  }

  function localToSupabaseBody(note) {
    return {
      cfi: note.cfi,
      href: note.href || null,
      quote: note.quote || "",
      comment: note.comment || "",
    };
  }

  // ── Main sync logic ───────────────────

  var contentId = getBookContentId();
  if (!isPlatformBook(contentId)) return; // Gutenberg — no sync
  var token = getAuthToken();
  if (!token) return; // Not authenticated — no sync

  var syncReady = false;
  var pendingAdds = [];
  var pendingDeletes = [];

  // Wait for the reader to initialize
  function waitForReader(callback) {
    var attempts = 0;
    var check = function () {
      attempts++;
      if (window.reader && window.reader.settings) {
        callback();
      } else if (attempts < 100) {
        setTimeout(check, 100);
      }
    };
    check();
  }

  waitForReader(function () {
    var reader = window.reader;
    if (!reader || !reader.settings) return;
    if (!Array.isArray(reader.settings.notes)) reader.settings.notes = [];

    var migrationKey = "readerpub:notes-synced:" + contentId;

    // Fetch notes from Supabase and merge
    apiFetch("GET", "/books/by-content/" + contentId + "/notes")
      .then(function (supabaseNotes) {
        var localNotes = reader.settings.notes || [];
        var merged = mergeNotes(localNotes, supabaseNotes);

        // Upload any localStorage-only notes to Supabase (one-time migration)
        var migrated = localStorage.getItem(migrationKey);
        if (!migrated) {
          var localOnly = merged.filter(function (n) { return !n._supabaseId; });
          if (localOnly.length > 0) {
            var uploads = localOnly.map(function (n) {
              return apiFetch("POST", "/books/by-content/" + contentId + "/notes", localToSupabaseBody(n))
                .then(function (created) {
                  n._supabaseId = created.id;
                  n.id = created.id;
                })
                .catch(function () {}); // Non-fatal
            });
            Promise.all(uploads).then(function () {
              localStorage.setItem(migrationKey, "1");
            });
          } else {
            localStorage.setItem(migrationKey, "1");
          }
        }

        // Update reader's notes array
        reader.settings.notes = merged;
        try { if (typeof reader.saveSettings === "function") reader.saveSettings(); } catch (e) {}

        // Re-render notes panel if it's open
        try {
          var notesList = document.getElementById("notes");
          if (notesList && notesList.children.length > 0) {
            // Trigger re-render by dispatching a custom event
            window.dispatchEvent(new CustomEvent("readerpub:notes-updated"));
          }
        } catch (e) {}

        syncReady = true;

        // Process any pending operations that happened during loading
        pendingAdds.forEach(function (note) { syncAddNote(note); });
        pendingDeletes.forEach(function (id) { syncDeleteNote(id); });
        pendingAdds = [];
        pendingDeletes = [];
      })
      .catch(function (err) {
        // Supabase unavailable — continue with localStorage only
        syncReady = true;
      });

    // Hook into addNote — intercept window.__fbAddNote
    var originalAddNote = window.__fbAddNote;
    window.__fbAddNote = function (payload) {
      // Call original (adds to localStorage)
      if (typeof originalAddNote === "function") originalAddNote(payload);

      // Sync to Supabase
      if (!payload || !payload.cfi) return;
      var notes = reader.settings.notes || [];
      // Find the note that was just added (last one with this cfi)
      var added = null;
      for (var i = notes.length - 1; i >= 0; i--) {
        if (notes[i] && notes[i].cfi === payload.cfi) {
          added = notes[i];
          break;
        }
      }
      if (added) {
        if (syncReady) {
          syncAddNote(added);
        } else {
          pendingAdds.push(added);
        }
      }
    };

    // Observe deletions by watching array length changes
    var lastKnownLength = reader.settings.notes.length;
    var lastKnownIds = reader.settings.notes.map(function (n) { return n && n.id; }).filter(Boolean);

    setInterval(function () {
      var current = reader.settings.notes || [];
      if (current.length < lastKnownLength) {
        // A note was deleted — find which one
        var currentIds = current.map(function (n) { return n && n.id; }).filter(Boolean);
        var deleted = lastKnownIds.filter(function (id) { return currentIds.indexOf(id) === -1; });
        deleted.forEach(function (id) {
          if (syncReady) {
            syncDeleteNote(id);
          } else {
            pendingDeletes.push(id);
          }
        });
      }
      lastKnownLength = current.length;
      lastKnownIds = current.map(function (n) { return n && n.id; }).filter(Boolean);
    }, 500);
  });

  function mergeNotes(localNotes, supabaseNotes) {
    var merged = [];
    var seenCfi = {};

    // Add all Supabase notes first (source of truth)
    for (var i = 0; i < supabaseNotes.length; i++) {
      var sn = supabaseToLocal(supabaseNotes[i]);
      merged.push(sn);
      seenCfi[sn.cfi] = true;
    }

    // Add local-only notes (not yet in Supabase)
    for (var j = 0; j < localNotes.length; j++) {
      var ln = localNotes[j];
      if (!ln || !ln.cfi) continue;
      if (seenCfi[ln.cfi]) continue; // Already have this note from Supabase
      merged.push(ln);
    }

    return merged;
  }

  function syncAddNote(note) {
    if (!note || !note.cfi) return;
    // Don't re-upload notes that already have a Supabase ID
    if (note._supabaseId) return;

    apiFetch("POST", "/books/by-content/" + contentId + "/notes", localToSupabaseBody(note))
      .then(function (created) {
        // Update the note in the local array with the Supabase ID
        note._supabaseId = created.id;
        note.id = created.id;
        try { if (typeof window.reader.saveSettings === "function") window.reader.saveSettings(); } catch (e) {}
      })
      .catch(function () {}); // Non-fatal
  }

  function syncDeleteNote(noteId) {
    if (!noteId) return;
    // Only delete from Supabase if it looks like a UUID (Supabase IDs are UUIDs)
    if (!/^[0-9a-f]{8}-/.test(noteId)) return;

    apiFetch("DELETE", "/notes/" + noteId)
      .catch(function () {}); // Non-fatal
  }
})();
