# Current State

## Current Reader Roles

- `reader1/` is the current reader for unprotected books.
- `reader1/` now uses the unified top/bottom shell overlays for Book Navigation and Settings; the old left sidebar/hamburger overlay menu nodes are no longer part of the live reader1 HTML/JS/CSS surface.
- `reader/reader_new.html` plus `reader_render_v3/` is the current reader stack for protected books only.
- The protected reader is fail-closed: invalid protected opens do not fall back into another reader path.

## Current Protected Reader Reality

- Active protected reader route and host vocabulary use `protected-shell`.
- Active protected-reader smoke tooling uses the protected host bridge surface and the canonical protected-shell route.
- The protected host owns its own shell visibility, overlay behavior, search UI, settings UI, menu metadata, and typography persistence.
- Protected reading-state restore starts from the saved protected reading position and saved typography state instead of first painting a default page/layout.

## Current Catalog / Routing Reality

- Catalog routing distinguishes the two readers:
  - unprotected books keep the public URL shape `/books/reader/?id=<bookId>` but are served by the `reader1/` code path;
  - protected books open the short `/books/protected/?id=<bookId>` route backed by the v5 protected reader.
- Local protected sample work now has a short v5 entry route:
  - `/books/protected/?id=<protectedId>` rewrites to `reader/reader_new_v5.html`;
  - local v5 artifacts are read from `reader_render_v5/artifacts/protected-books/<protectedId>/` unless a remote artifact source is explicitly selected;
  - on non-local public protected routes, v5 defaults to R2 artifacts under `/books/protected-content/<protectedId>/`.
- Production `reader.pub` now routes `/books/protected/?id=<protectedId>` through `reader-books-router` to the v5 reader while preserving the short browser URL.
- Production `reader.pub/reader_render_v5*` is routed through `reader-books-router` so the v5 protected reader module/runtime files load from the Pages deployment.
- The Pages deploy tree includes `reader_render_v5/` for v5 runtime assets, but explicitly excludes protected EPUB sources, generated protected-book artifacts, bootstrap artifacts, and `reader_render_v5/node_modules`; protected book content belongs in R2 and should be uploaded with `rclone`.
- The v5 protected reader records opened protected books in the same local My Books store namespace as `reader1` (`readerpub:mybooks:<host>`), renders that store under the v5 `My Library` label, and schedules Google Drive `appDataFolder` sync through the shared `ReaderPubDriveSync` module.
- V5 protected My Library entries are source/protected-qualified in the shared Google Drive snapshot, so protected/manual IDs do not collide with unprotected Gutenberg entries that use the same numeric ID.
- The v5 protected reader no longer exposes the copied legacy hamburger/sidebar menu overlays; TOC, Notes, Bookmarks, My Library, voice controls, and the book card are mounted through the v5 `Book Navigation` and Settings surfaces.
- Production has a compatibility alias for stale v5 artifact URLs:
  - `/reader_render_v5/artifacts/protected-books/<protectedId>/...` is served from R2 `protected-content/<protectedId>/...`;
  - this keeps old cover references from producing 404s without putting protected artifacts into the Pages bundle.
- The sample protected Gutenberg set is uploaded to R2 under `reader-books/protected-content/<protectedId>/` for:
  - `90000074`, `90000120`, `90008800`, `90014838`, `90055040`, `90016865`, `90078504`, `90025433`, `90035997`, `90052521`, `90071879`, `90025344`.
- Local `wrangler pages dev` fallback proxies `/books/api/*`, `/books/content/*`, and `/books/protected-content/*` to `https://reader.pub` when local R2 bindings are absent, so local catalog and protected-reader checks can use Cloudflare-backed data.

## Current Protected Tooling Reality

- `reader_render_v3/package.json` provides the main protected smoke commands:
  - `ui:smoke:desktop`
  - `ui:smoke:settings`
  - `ui:smoke:library`
  - `ui:smoke:search`
  - `ui:smoke:mobile`
  - `ui:smoke:mobile-settings`
  - `ui:smoke:canonical-url`
- Protected artifact build and validation entrypoints are:
  - `protected:build`
  - `protected:build:debug`
  - `protected:validate`
- Protected font/corpus support entrypoints are:
  - `protected:audit`
  - `protected:fonts:scan`
  - `protected:fonts:plan`
- The kept protected internal verification surface is now centered on:
  - `reader-new-ui-smoke.js`
  - `check-protected-reader-readiness.js`
  - `check-live-rollout-smoke.js`
  - `check-live-protected-route.js`
  - `check-catalog-reader-routing.js`
  - `check-catalog-test-sections.js`

## Current Local V4 Audit Reality

- `reader_render_v4/` is the local-only v4 fidelity work area; it is not the current production protected-reader stack.
- Local v4 parity checks for protected artifact book `1` currently use:
  - `http://127.0.0.1:8792/reader/reader_new_v4.html?artifactBookId=1`
- Current v4 pagination is expected to consume `semanticReadingFlow` rather than raw `structuredFlow` entries before pagination.
- Current local v4 UX uses a v3-derived shell around the v4 paginated reading surface rather than the earlier standalone prototype card shell.
- Parity comparisons for v4 use the clean local `reader1` baseline, not the production catalog reader.

## Current Local V5 Target-Line Reality

- `reader_render_v5/` plus `reader/reader_new_v5.html` is the new local protected-reader target line for future work.
- `reader_render_v5/` starts from a full copy of the `reader_render_v3/` reader line; the original `reader_render_v3/` codebase remains the untouched baseline in place.
- Current local v5 manual verification for protected artifact book `1` uses:
  - `http://127.0.0.1:8793/reader/reader_new_v5.html?artifactBookId=1`
- Current local v5 now owns its bootstrap artifact route inside `reader_render_v5/`:
  - `/reader_render_v5/artifacts/protected-bootstrap-books/<bookId>/`
- Current local v5 bootstrap artifact build/validate entrypoints now live inside `reader_render_v5/`:
  - `npm --prefix reader_render_v5 run protected:bootstrap:build`
  - `npm --prefix reader_render_v5 run protected:bootstrap:validate`
- Current local v5 bootstrap artifact build now also carries source-derived typography overrides from the book EPUB stylesheet for body text and headings, and the v5 compatibility runtime overlays those source-derived heading/paragraph metrics onto the copied runtime-safe style tokens instead of keeping the old generic heading/body defaults.
- Current local v5 runtime-safe protected build for local artifact book `1` now also derives heading and body typography from the book EPUB stylesheet in `reader_render_v5/tools/protected-ingestion/*` instead of the earlier hard-coded heading/body heuristics, so the rendered `styles.json` and shape-layout typography for protected v5 follow the same source-text heading/paragraph metrics as the unprotected baseline.
- Current local v5 runtime-safe protected build now writes an expanded heading-style payload into `styles.json` and `blockPresentation`, including exact px/em box spacing and font metrics that the v5 runtime can actually apply: `fontSizePx`, `lineHeightPx`, `letterSpacingPx`, `wordSpacingPx`, `textIndentPx`, all four `margin*`, all four `padding*`, `textAlign`, `whiteSpace`, `fontFamilyCandidate`, `fontStyle`, `fontWeight`, `textColor`, plus the older scale/em fallbacks.
- Current local v5 protected build now also carries source hyphenation controls from book CSS into `styles.json` and `blockPresentation`: `hyphens`, `wordBreak`, and `overflowWrap`.
- Current local v5 protected ingestion now preserves block-level children inside multi-paragraph source `blockquote` nodes as separate protected `blockquote` blocks instead of flattening the entire quote into one whitespace-collapsed block, so quote sections like the end of the epilogue in manual book `1` now keep the same paragraph boundaries as `reader1`.
- Current local v5 protected ingestion now excludes `notes-*.xhtml` spine items from the main reading-flow extraction while still leaving those source note documents reachable through the existing footnote-preview loader, so the book ends on the real final text instead of paginating note bodies as extra pages and popup footnotes still resolve from the original note files.
- Current local v5 selection-layer and shape-layout handling now keep Unicode combining marks attached to the surrounding word and render them as zero-advance combining glyphs in shape mode, so accented words like `выреза́ла` no longer split with a synthetic visible gap after the accented letter.
- Current local v5 protected ingestion now marks chapter-opening blocks with `pageBreakBefore` directly in the runtime-safe artifact by matching TOC/sourceRef chapter starts, so each chapter begins on a new rendered page instead of continuing the previous flow.
- Current local v5 host bootstrap in `reader_render_v5/reader_new/protected-host-ui.js` now treats slow but progressing direct-runtime startup as in-flight instead of an immediate host-level failure, and only surfaces the timeout screen when startup stalls without progress or reports an explicit runtime error.
- Current local v5 direct protected route now resolves local `artifactBookId` entries straight to `/reader_render_v5/artifacts/protected-books/<bookId>/` instead of bouncing through the large bootstrap manifest path on first paint.
- Current local v5 product-facing shell now derives from `reader_render_v5/reader_new/*`, which is the copied `reader_render_v3/reader_new/*` line.
- `reader/reader_new_v5.html` now carries the full host document and shared CSS contract needed by that copied `reader_render_v3/reader_new` shell line; it is not itself the source of product UX logic.
- Current local v5 viewport environment classes are now mutually exclusive across touch `phone` / `tablet` / `desktop`, so mobile landscape emulation no longer ends up with conflicting `is-phone` + `is-desktop` host CSS, and the touch landscape shell no longer uses the old overly narrow centered `#metainfo` width constraints that produced pathological first-screen layouts on small landscape devices.
- Current local v5 is now back on the copied `reader_render_v3/` runtime contract rather than the earlier hybrid HTML-paginated prototype path.
- Current local v5 opens its own `/reader_render_v5/artifacts/protected-bootstrap-books/<bookId>/` route through a compatibility adapter at `reader_render_v5/runtime/protected-book-model.js`.
- That adapter currently keeps the copied `v3` runtime alive by feeding it the existing runtime-safe substrate while merging selected metadata and chunk-level presentation/media semantics from the new bootstrap manifest.
- Current local v5 now preloads persisted protected reading state from the same local persistence bundle the repository later hydrates, and passes that restore target into worker `initBook()` so a browser refresh first-paints the saved reading page instead of briefly showing page one before restore.
- Current local v5 typography/layout changes such as font-scale updates now preserve the current visible text range across repagination by restoring from the page's global visible-range midpoint and range hints instead of reusing the old page index after layout changes.
- Current local v5 worker startup now defers `locations.json` hydration until after the first snapshot, and the host also defers its secondary repository-side `loadProtectedBook(...)` until the first page is already visible.
- Current local v5 runtime layout now uses block-font-size-based `em` spacing and CSS-like vertical margin collapsing between adjacent blocks instead of earlier fixed pixel multipliers and fallback gaps, so heading/date/inline-handle spacing can match `reader1` more closely.
- Current local v5 runtime layout now applies language-aware intra-word soft breaking for protected books when the artifact style contract allows it (`hyphens: auto`, plus `wordBreak` / `overflowWrap` fallbacks), using the book metadata language as the language for all blocks and fragments.
- Current local v5 paragraph justification now treats lines terminated by source `<br>` hard breaks as non-justifiable, so intra-paragraph forced line breaks no longer stretch across the full column width like ordinary middle paragraph lines.
- Current local v5 word tokenization and runtime word-boundary reconstruction now keep Unicode combining marks (including stress/acute marks in Russian text) inside the surrounding word token instead of splitting the word and inserting a synthetic space after the stressed letter.
- Current local v5 pagination now anchors page windows to laid-out block flow rather than only to text lines, so media-only leading blocks such as the cover can own the first page and chapter-opening `pageBreakBefore` now takes effect immediately after a preceding laid-out block, including a cover image.
- Current local v5 media sizing for standalone/block images now uses column-aspect-aware contain sizing: portrait images fill the available column height, landscape images fill the available column width, and page-level media filtering now follows the same page-slot pagination model as text instead of a separate top/bottom intersection pass.
- Current local v5 canvas media layer now reuses keyed DOM `<img>` nodes for content images and inline avatars across snapshot refreshes instead of calling `replaceChildren()` on every overlay/state update, so showing or hiding bars, changing selection, and clearing selection no longer blink visible media.
- Current local v5 selection normalization now clamps the focus edge to the block where the selection started, so drag selection, copy, highlights, and notes cannot span more than one paragraph/block at a time.
- Current local v5 host TTS voice-language picker now defaults from the protected book metadata languages carried by the live reader summary, falls back to manifest metadata only when needed, maps that metadata language to the nearest available system voice language, and keeps all remaining languages alphabetized in the settings sidebar.
- Current local v5 protected reader now resolves EPUB footnote refs from runtime-safe `selectionLayer.noteAnchors`, renders note refs as reader-level superscripts with dedicated footnote ink, and opens a host-side preview popup/sheet with parsed `notes-*.xhtml` content on desktop and touch devices.
- Current local v5 footnote refs now use `reader1` magenta marker ink (`rgb(255,2,255)`), with separate pointer-aware hit zones: desktop hover/click uses a square superscript target centered on the note marker horizontally and biased upward to favor the top half of the digit, while touch uses a much larger finger-sized target at least about three times the rendered marker size so footnote taps win against shell toggles and page turns more reliably on phones and tablets. The `reader1`-style centered modal on desktop/touch follows the user-selected protected font mode and can be dismissed by the close button or by tapping/clicking the backdrop outside the panel.
- Current local v5 shell navigation now respects book boundaries in the host UI: the desktop left/right arrows are hidden on the first/last page respectively, the coarse-pointer nav-edge buttons are disabled at those boundaries, and touch taps/drags that start from the blocked outer edge no longer trigger page turns, swipe previews, or shell activity when there is no page in that direction.
- Current `reader_render_v5/runtime/protected-book-model.js` now runs in strict artifact-first mode for structural/media-bearing `v4` candidates:
  - chapter-opening clusters
  - comment-thread sections
  - ordered lists
  - blockquotes
  - figure sequences
  - standalone media-only blocks
- Current `reader_render_v5/runtime/protected-book-model.js` also no longer uses loose plain-paragraph fallback for ordinary text-bearing paragraph/heading blocks; text path matching now resolves against new-artifact block content instead of generic same-file substrate proximity.
- For those block classes, `v5` no longer silently substitutes old substrate data; missing or incompatible mapping must fail explicitly.
- Current chunk-level merge in `reader_render_v5/runtime/protected-book-model.js` now carries into the copied `v3` runtime:
  - synthetic TOC and updated book metadata from `/books/protected-content-v4/<bookId>`
  - figure-lead + image composition hints
  - `breakBefore` propagation for figure/list openings
  - sequence-aware comment-thread markers (`comment-heading` / `comment-body`)
  - `list-item` block matching for ordered-list sections
  - initial `blockquote` block-role propagation where the old substrate shape can be matched safely
- Current chunk adapter also tags chapter-opening clusters and suppresses internal page breaks inside those opening clusters, while comment-body paragraphs now inherit zero-indent thread composition from the new artifact.
- Current chunk adapter now also carries separate `figure` image members from the new artifact into the copied `v3` runtime instead of collapsing multi-block figures entirely into lead-text candidates, so figure composition is starting to follow the new artifact at block-sequence level rather than only through substrate media leftovers.
- Current strict artifact-first matching now also handles old `v3` runtime `blockquote` blocks directly; this removed a real hard-fail in `ch006.xhtml` where old `blockquote` substrate blocks had no dedicated strict matcher branch.
- Current strict artifact-first mode no longer treats leftover unmatched candidates at raw chunk boundaries as automatic failures, because chunk windows between the copied `v3` substrate and the new artifact can drift by a few leading/trailing blocks; per-block strict mismatches still fail explicitly, but chunk-boundary drift itself is no longer misreported as a content-contract error.
- Current protected v4 artifact build now writes strict source anchors for `inline-avatar` media:
  - `mediaItems[].sourceAnchor` points to the exact source `<img ...>` occurrence in the original text file
  - `mediaItems[].hostSourceAnchor` points to the exact host text node (`h*` / `p`) that owns that inline media in reading order
- Current protected v4 validation now rejects `inline-avatar` media items that do not carry both anchors.
- Current `reader_render_v5/runtime/protected-book-model.js` now allows `inline-avatar` remapping only when the new artifact `hostSourceAnchor` exactly matches the old `v3` substrate block source ref; loose same-file/same-level matching is no longer enough.
- Current protected v4 build also extracts standalone paragraph-wrapped images (`<p><img .../></p>`) as explicit `content-image` blocks, so real source media like `file45.jpg` are no longer dropped from `/books/protected-content-v4/<bookId>`.

## Current Reader1 Tooling Reality

- `tools/reader1/unpack_epub.py` is the current EPUB-to-`reader1` packaging entrypoint.
- `tools/reader1/publish_books.py` is the current `reader1` publish pipeline entrypoint.
- Local parity baseline for unprotected-reader audits is the locally served `reader1` route for manual book `1`:
  - `http://127.0.0.1:8788/books/reader1/?id=1&source=manual&entry=catalog`
- That local `reader1` baseline must stay clean for parity use: no missing-resource requests, no console errors, and no page errors during open.
- The `reader1` publish CLI exposes:
  - `status`
  - `run`
  - `resume`
  - `publish-epub`
  - `publish-dir`
  - `publish-zip`

## Current Content / Publishing Tooling Reality

- Source-document to EPUB helpers live under `books/content/`:
  - `make_epub_from_docx.sh`
  - `make_epub_from_pdf.sh`
  - `gen_epub_css_from_docx.py`
  - `epub_publish.sh`
- Catalog index generation lives under `tools/catalog/`.
- Gutenberg catalog-sync support also lives under `tools/catalog/`.
- SEO generation and upload helpers live under `tools/seo/`.
- Selective catalog/content publication to Cloudflare-backed storage currently goes through `books/content/epub_publish.sh`.
- SEO manifest publication currently goes through `tools/seo/upload_seo_indexes.sh`.

## Handoff Guidance

- Root context files are the startup documentation for this repository.
- The intended handoff picture is:
  - `reader1` for unprotected books;
  - `reader_new` plus `reader_render_v3` for protected books.
- Operational tooling instructions live in:
  - `docs/README.md`
  - `docs/gutenberg-pipeline.md`
  - `tools/README.md`
  - `reader_render_v3/tools/protected-ingestion/README.md`
  - `reader_render_v3/tools/protected-fonts/README.md`
- Historical and exploratory docs outside that set are no longer part of the intended handoff package.

## Local V5 Branch Notes

- In the current `reader_render_v5` line, non-inline protected media can now be opened from the reading surface:
  - desktop opens a centered image viewer modal on click and suppresses shell-bar toggles for that click;
  - phones/tablets open the full-screen image viewer only on long-press, while ordinary taps on the same image still follow the old shell behavior by zone (center toggles bars, edge zones page-turn).
- Current local `reader_render_v5` protected-ingestion now preserves ordinary EPUB hyperlinks in the runtime-safe artifact as real links while still classifying only real footnote-style anchors into `noteAnchors`; non-footnote links are emitted into `linkAnchors`, hit-tested separately from notes, and local runtime navigation now follows those links instead of routing them through the protected footnote popup path.
- Current `reader_render_v5` protected-ingestion now gives explicit absolute CSS image sizes priority over intrinsic image dimensions when extracting media metadata; intrinsic dimensions are used only as fallback when no concrete CSS width/height is present. This keeps legacy inline-avatar sizing in manual book `1` stable while still allowing intrinsic-size fallback for EPUB images such as `book 76`.
