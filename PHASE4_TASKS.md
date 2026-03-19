# Phase 4 — WeNote: Task Breakdown

## Overview

Migrate the notes system from localStorage-only to Supabase-backed storage with sharing capabilities. Notes become first-class platform entities with author attribution and shareable packages.

**Current state of notes:**
- Stored in `reader.settings.notes` array in localStorage per book (key: `epubjsreader:<version>:<host>:<bookId>`)
- Each note: `{ id, cfi, href, quote, comment }`
- Sharing via R2-backed `/api/notes-share` endpoint (creates share links with JSON payload)
- Google Drive sync for reading state (positions, bookmarks) — does NOT sync notes to Drive
- No user attribution, no multi-user collaboration

**Target state:**
- Notes stored in Supabase `notes` table with user attribution
- Personal notes synced between devices via Supabase (replaces localStorage as primary store)
- localStorage kept as offline cache / fallback
- Shareable note packages via link tokens
- Recipient sees shared notes overlaid on book text with author attribution
- Backward compatible with existing notes format

---

## Task 4.1 — Database Migration: Notes & Packages
**Time: 1–2 hours**

- [ ] Create `supabase/migrations/005_notes_wenote.sql`
  - `notes` table (book_id, author_user_id, author_display_name, anchor_cfi, anchor_href, quote, note_text, visibility)
  - `note_packages` table (created_by, title, package_type, share_token, audience_scope)
  - `note_package_items` table (package_id, note_id, display_order)
  - `note_package_recipients` table (package_id, recipient_user_id)
  - RLS policies: users see own notes + notes shared with them, package creators manage packages
  - Indexes on user_id, book_id, share_token
- [ ] Apply migration to hosted Supabase

**Deliverable:** Database tables ready for notes storage.

---

## Task 4.2 — Notes CRUD API
**Time: 2–3 hours**

- [ ] Add Worker API routes:
  - `GET /v1/books/:bookId/notes` — get user's notes for a book (auth required)
  - `POST /v1/books/:bookId/notes` — create a note
    - Input: `{ cfi, href, quote, comment }`
    - Auto-fills: author_user_id, author_display_name from session
  - `PATCH /v1/notes/:id` — update note text
  - `DELETE /v1/notes/:id` — delete a note
  - `GET /v1/me/notes` — all notes by current user (across all books)
- [ ] Notes are scoped to the book's Supabase UUID (not content_id)
  - Need content_id → book UUID lookup for platform books
  - Gutenberg books (no Supabase record): notes stay in localStorage only (no sync)

**Deliverable:** API for managing personal notes.

---

## Task 4.3 — Reader Integration: Save/Load from Supabase
**Time: 4–6 hours (most complex task — modifies reader JS)**

- [ ] Modify `reader/js/fbreader-ui.js` NotesController:
  - On book load (for platform books, ID >= 200000):
    - Fetch notes from Supabase via `GET /v1/books/:bookId/notes`
    - Merge with any existing localStorage notes (Supabase is source of truth)
    - Upload localStorage-only notes to Supabase (one-time migration per book)
  - On note add:
    - Save to Supabase via `POST /v1/books/:bookId/notes`
    - Also save to localStorage as cache
  - On note edit/delete:
    - Update/delete in Supabase
    - Update localStorage cache
  - For Gutenberg books (ID < 200000):
    - Keep current localStorage-only behavior (no Supabase)
  - For unauthenticated users:
    - Keep current localStorage-only behavior
- [ ] Handle offline gracefully:
  - If Supabase API fails, fall back to localStorage
  - Queue failed operations and retry on next load

**Key technical challenge:** The current `fbreader-ui.js` notes code (around line 5540) stores notes in `reader.settings.notes` and saves via `reader.saveSettings()` to localStorage. We need to intercept this flow and add Supabase sync without breaking the existing localStorage path.

**Approach:**
1. Add a `NotesSync` module that wraps the existing note operations
2. Detect if user is authenticated and book is a platform book
3. If yes: sync notes to/from Supabase, use localStorage as cache
4. If no: use localStorage only (current behavior)

**Deliverable:** Authenticated users' notes sync to Supabase for platform books.

---

## Task 4.4 — Note Packages API
**Time: 2–3 hours**

- [ ] Add Worker API routes:
  - `POST /v1/note-packages` — create a note package
    - Input: `{ title, note_ids: [...], audience_scope }`
    - Generates unique share_token
    - Returns `{ packageId, shareToken, shareUrl }`
  - `GET /v1/note-packages/:token` — get package by share token (public)
    - Returns: package info + notes with author attribution
    - Does NOT require auth (link sharing)
  - `GET /v1/me/note-packages` — list packages created by user
  - `DELETE /v1/note-packages/:id` — delete a package (creator only)
- [ ] Share URL format: `/books/reader/?id=<contentId>&n=<shareToken>`
  - Reuses existing notes-share URL parameter `n`
  - Existing R2-based shares continue to work as fallback

**Deliverable:** API for creating and accessing note packages.

---

## Task 4.5 — Reader Integration: Shared Notes Display
**Time: 3–4 hours**

- [ ] When reader opens with `?n=<shareToken>`:
  - Fetch package from `GET /v1/note-packages/:token`
  - If Supabase package found: use it
  - If not found: fall back to existing R2 notes-share lookup (backward compat)
- [ ] Display shared notes in the reader:
  - Overlay shared notes alongside personal notes
  - Visual distinction: different highlight color or badge for shared notes
  - Show author name on each shared note (e.g., "Note by Jane Doe")
  - Show package info banner: "Shared notes from [Author Name]"
- [ ] Shared notes are read-only (recipient cannot edit them)
- [ ] "Import to my notes" button: copies shared notes to user's personal collection

**Deliverable:** Recipients can view shared notes overlaid on book text.

---

## Task 4.6 — Share UI in Reader
**Time: 2–3 hours**

- [ ] Update the notes panel in WeRead:
  - "Share Notes" button (visible when user has notes and is authenticated)
  - Opens dialog: select which notes to share, set title
  - Creates package via API
  - Shows share link with copy button
  - Social share buttons: Twitter/X, Facebook, LinkedIn, WhatsApp, Telegram
  - Native Web Share API on mobile (single share button → OS share sheet)
- [ ] Update existing "Copy book link with Notes" button:
  - For authenticated users with platform books: create Supabase package instead of R2 share
  - For Gutenberg books or unauthenticated: keep current R2 share behavior
- [ ] Share link format: `https://reader.pub/notes/<shareToken>`
  - Clean, memorable URL (not embedded in reader query params)
  - Reader link with notes still works: `?id=<contentId>&n=<shareToken>`

**Deliverable:** Users can create and share note packages from the reader.

---

## Task 4.7 — Social Share Landing Page
**Time: 3–4 hours**

- [ ] Create `/notes/<shareToken>` route (served by Worker)
  - Server-rendered HTML page (not SPA) for proper social media previews
  - Open Graph meta tags for rich social cards:
    - `og:title` — "Notes on [Book Title] by [Sharer Name]"
    - `og:description` — first quote/comment from the package
    - `og:image` — book cover URL
    - `og:url` — canonical URL
    - `twitter:card` — summary card
  - Page content:
    - Book cover, title, author
    - Sharer's name and note count
    - List of notes: quote excerpts + comments with attribution
    - "Open in Reader" button → links to reader with `?n=<token>`
    - "Get this book" button (if book has offers and user not entitled)
    - "Sign in" prompt for unauthenticated users
  - Social re-share buttons on the page itself
- [ ] Add route to `reader-books-router` proxy allowlist
- [ ] Cache rendered pages for performance (Worker Cache API)

**Deliverable:** Share links show rich previews on social media and a readable notes page for anyone.

---

## Task 4.8 — Notes Migration from localStorage
**Time: 2–3 hours**

- [ ] On first authenticated load of a platform book:
  - Check if user has localStorage notes for this book
  - Check if those notes already exist in Supabase (by cfi match)
  - Upload any localStorage-only notes to Supabase
  - Mark migration as done (localStorage flag: `readerpub:notes-migrated:<bookId>`)
- [ ] Bulk migration option in My Account page:
  - "Migrate my notes" button
  - Scans all localStorage keys for `epubjsreader:` entries
  - For each book with notes, checks if it's a platform book
  - Uploads notes to Supabase
  - Shows migration report (X notes migrated, Y books)
- [ ] Keep localStorage notes intact (don't delete — they serve as offline cache)

**Deliverable:** Existing notes seamlessly migrate to Supabase.

---

## Task Summary

| # | Task | Estimated Time | Dependencies |
|---|------|---------------|-------------|
| 4.1 | Database migration | 1–2h | None |
| 4.2 | Notes CRUD API | 2–3h | 4.1 |
| 4.3 | Reader Supabase sync | 4–6h | 4.2 |
| 4.4 | Note packages API | 2–3h | 4.1, 4.2 |
| 4.5 | Shared notes display | 3–4h | 4.4 |
| 4.6 | Share UI in reader | 2–3h | 4.4, 4.5 |
| 4.7 | Social share landing page | 3–4h | 4.4 |
| 4.8 | Notes migration | 2–3h | 4.3 |
| | **Total** | **~20–28h** | |

---

## Architecture Notes

### Note Storage Model

```
Authenticated user + Platform book (ID >= 200000):
  Primary: Supabase `notes` table
  Cache: localStorage (for offline/performance)
  Sync: on load, merge Supabase → localStorage; on save, write both

Authenticated user + Gutenberg book (ID < 200000):
  Primary: localStorage only (no Supabase record for book)
  No sync (same as current behavior)

Unauthenticated user + Any book:
  Primary: localStorage only
  No sync (same as current behavior)
```

### Note Format Mapping

Current localStorage format:
```json
{ "id": "1710000000-123456", "cfi": "epubcfi(/6/4!/4/2/1:0)", "href": "chapter1.xhtml", "quote": "selected text", "comment": "my note" }
```

Supabase format:
```json
{ "id": "uuid", "book_id": "uuid", "author_user_id": "uuid", "author_display_name": "Jane Doe", "anchor_cfi": "epubcfi(/6/4!/4/2/1:0)", "anchor_href": "chapter1.xhtml", "quote": "selected text", "note_text": "my note", "visibility": "private" }
```

### Share Link Compatibility

- New format: `?id=200005&n=<supabase-share-token>` → checks Supabase first, falls back to R2
- Old format: `?id=200005&n=<r2-share-id>` → Supabase returns 404, falls back to R2 → works
- Legacy URL params: `?notes=<base64>` and `?notesz=<compressed>` → continue to work (no change)

### What NOT to Change

- Google Drive sync for reading positions and bookmarks (separate from notes)
- Gutenberg book notes behavior (localStorage only)
- Existing R2 notes-share endpoint (backward compat)
- Reader theme, font size, and other settings storage (stays in localStorage)
