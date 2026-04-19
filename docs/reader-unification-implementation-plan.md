# Reader / Reader1 Unification Plan

Repo snapshot: `pages_books-codex-protected-publish-jobs`
Date: 2026-04-13

## Recommendation

Make **`/reader` the canonical shell** and migrate `reader1` into a **loader mode** instead of maintaining two independent apps.

This repo already shows that the two readers are close forks:

- `reader/index.html` and `reader1/index.html` share the same shell structure, but `reader/index.html` carries entitlement and protected-reader bootstrap logic while `reader1/index.html` has cleaner `reader1-manifest.json` bootstrapping.
- `reader/js/reader.js` and `reader1/js/reader.js` are largely the same runtime, with `reader1` adding JSON-manifest-specific behavior such as `isJsonManifestBook()` and href normalization that strips source-qualified prefixes.
- `tools/reader1/publish_books.py` enforces `readerType=reader1` and emits `reader1-manifest.json`, so the publishing pipeline still treats `reader1` as a separate frontend instead of a content-loading mode.

The safest direction is:

1. Keep `/reader` as the main UX shell.
2. Extract route resolution and loader selection into small modules.
3. Teach `/reader` to load both legacy and `reader1-manifest.json` books.
4. Turn `/reader1` into a compatibility shim.

---

## Why this is the right target for this repo

### What `reader` currently does that `reader1` does not fully own

`reader/index.html` currently handles:

- platform entitlement checks
- protected-reader redirect / old-shell integration
- legacy platform path resolution
- URL canonicalization and state bootstrapping

That makes `reader` the stronger host shell.

### What `reader1` currently does better

`reader1/index.html` and `reader1/js/reader.js` currently handle:

- `reader1-manifest.json` detection
- source-qualified book roots such as `/books/content/<source>/<source_book_id>/`
- JSON-manifest-specific navigation and page-map behavior
- more robust href normalization for source-qualified books

That makes `reader1` the better **format loader**, not the better application shell.

---

## Target architecture

```text
/reader
  index.html                       canonical shell
  js/
    core/
      route-resolver.js            parses query/hash into a normalized open request
      loader-selector.js           chooses legacy vs reader1 vs protected
      boot-reader.js               shared shell bootstrap
    loaders/
      legacy-loader.js             legacy exploded-EPUB path loader
      reader1-loader.js            reader1-manifest.json loader
      protected-loader.js          protected-reader bridge/redirect adapter
    reader.js                      shared runtime (after reader1 deltas merged)
    fbreader-ui.js                 shared UI

/reader1
  index.html                       compatibility shim only
```

And on the publishing side:

```text
tools/reader1/publish_books.py
  still emits readerType=reader1
  but canonical open URL becomes /reader?... rather than /reader1?...
```

---

# Phase-by-phase implementation plan

## Phase 0 — Characterize current behavior

### Goal
Freeze what currently works before moving code.

### Tasks

1. Add characterization tests for:
   - opening a legacy book in `/reader`
   - opening a `reader1` book in `/reader1`
   - protected redirect path from `/reader`
   - URL canonicalization (`?id`, `?source`, `#id`, CFI hash preservation)
2. Document route matrix:
   - `/reader?id=...`
   - `/reader?reader=protected...`
   - `/reader1?id=...&source=...`
   - `/books/reader/*` worker rewrite path
3. Capture representative sample books:
   - legacy Gutenberg book
   - non-Gutenberg `reader1` book
   - protected book

### Acceptance criteria

- Current behavior is captured in tests/docs.
- Refactor work can be validated without guessing.

---

## Phase 1 — Extract shared boot flow from `reader`

### Goal
Move `reader` toward a shell that delegates book-opening decisions.

### Concrete code changes

#### 1. Add `reader/js/core/route-resolver.js`

```js
(function (global) {
  function getSearchParams() {
    try {
      return new URLSearchParams(global.location.search || "");
    } catch (e) {
      return new URLSearchParams();
    }
  }

  function resolveReaderOpenRequest() {
    var params = getSearchParams();
    var rawHash = String(global.location.hash || "").replace(/^#/, "");
    var hashIsId = /^\d+$/.test(rawHash);
    var hashIsCfi = /^epubcfi\(/i.test(rawHash);

    var id = String(
      params.get("id") ||
      params.get("i") ||
      (hashIsId ? rawHash : "") ||
      ""
    ).trim();

    var source = String(params.get("source") || "").trim();
    if (source === "gutenberg") source = "";

    return {
      id: id,
      source: source,
      entry: String(params.get("entry") || "").trim(),
      readerMode: String(params.get("reader") || "").trim().toLowerCase(),
      protectedUx: String(params.get("protectedUx") || params.get("ux") || "").trim().toLowerCase(),
      catalogReturn: String(params.get("catalog_return") || "").trim(),
      autostart: params.get("autostart") === "1",
      hash: rawHash,
      hashIsId: hashIsId,
      hashIsCfi: hashIsCfi,
      pathname: global.location.pathname || "",
      search: global.location.search || "",
      href: global.location.href || ""
    };
  }

  global.ReaderPubRouteResolver = {
    resolveReaderOpenRequest: resolveReaderOpenRequest
  };
})(window);
```

#### 2. Add `reader/js/core/loader-selector.js`

```js
(function (global) {
  function selectLoader(request, context) {
    if (request && request.readerMode === "protected") return "protected";
    if (context && context.readerType === "reader1") return "reader1";
    if (context && context.hasReader1Manifest) return "reader1";
    return "legacy";
  }

  global.ReaderPubLoaderSelector = {
    selectLoader: selectLoader
  };
})(window);
```

#### 3. Add `reader/js/core/boot-reader.js`

```js
(function (global) {
  function bootWithLoader(loader, request, context) {
    if (!loader || typeof loader.open !== "function") {
      throw new Error("Invalid loader");
    }
    return loader.open(request, context);
  }

  global.ReaderPubBoot = {
    bootWithLoader: bootWithLoader
  };
})(window);
```

#### 4. Update `reader/index.html`

Load the new scripts before the existing inline bootstrap block:

```html
<script src="js/core/route-resolver.js"></script>
<script src="js/core/loader-selector.js"></script>
<script src="js/core/boot-reader.js"></script>
```

Then replace the monolithic inline open-path setup with:

```js
const request = window.ReaderPubRouteResolver.resolveReaderOpenRequest();

if (request.readerMode === "protected" && request.protectedUx === "old-shell") {
  // preserve existing old-shell protected path
}
```

At this phase, behavior stays the same; this extraction is about shape, not new functionality.

### Acceptance criteria

- `/reader` still opens legacy books exactly as before.
- Protected redirect behavior remains unchanged.
- Route parsing no longer lives only in one giant inline block.

---

## Phase 2 — Bring `reader1` loading into `/reader`

### Goal
Teach `/reader` to open `reader1` books without changing the shell.

### Concrete code changes

#### 1. Add `reader/js/loaders/reader1-loader.js`

```js
(function (global) {
  function detectReader1OpenSpec(bookPath) {
    var normalized = String(bookPath || "");
    if (!normalized.endsWith("/")) normalized += "/";
    var manifestPath = normalized + "reader1-manifest.json";
    return fetch(manifestPath, { cache: "no-store" })
      .then(function (response) {
        if (response && response.ok) {
          return {
            path: manifestPath,
            openAs: "json",
            format: "reader1",
            rootPath: normalized,
            hasReader1Manifest: true
          };
        }
        return {
          path: normalized,
          openAs: "directory",
          format: "legacy",
          rootPath: normalized,
          hasReader1Manifest: false
        };
      })
      .catch(function () {
        return {
          path: normalized,
          openAs: "directory",
          format: "legacy",
          rootPath: normalized,
          hasReader1Manifest: false
        };
      });
  }

  function open(request, context) {
    var opts = { openAs: context.openAs, restore: true };
    global.__reader1BookFormat = context.format;
    global.reader = ePubReader(context.path, opts);
    return global.reader;
  }

  global.ReaderPubReader1Loader = {
    detectReader1OpenSpec: detectReader1OpenSpec,
    open: open
  };
})(window);
```

This is intentionally based on the current `reader1/index.html` logic so migration risk stays low.

#### 2. Add `reader/js/loaders/legacy-loader.js`

```js
(function (global) {
  function open(request, context) {
    var opts = { restore: true };
    global.__reader1BookFormat = "legacy";
    global.reader = ePubReader(context.path, opts);
    return global.reader;
  }

  global.ReaderPubLegacyLoader = {
    open: open
  };
})(window);
```

#### 3. Add `reader/js/loaders/protected-loader.js`

```js
(function (global) {
  function open(request) {
    var protectedUrl = new URL("/reader_render_v3/integration/protected-reader.html", global.location.origin);
    protectedUrl.search = global.location.search || "";
    protectedUrl.hash = global.location.hash || "";
    global.location.replace(protectedUrl.toString());
    return null;
  }

  global.ReaderPubProtectedLoader = {
    open: open
  };
})(window);
```

#### 4. Update `reader/index.html` boot path

Add the scripts:

```html
<script src="js/loaders/legacy-loader.js"></script>
<script src="js/loaders/reader1-loader.js"></script>
<script src="js/loaders/protected-loader.js"></script>
```

Then update boot logic so it can choose between loaders.

Starter pattern:

```js
(function () {
  const request = window.ReaderPubRouteResolver.resolveReaderOpenRequest();

  if (request.readerMode === "protected") {
    window.ReaderPubProtectedLoader.open(request);
    return;
  }

  resolveBookPathForRequest(request).then(function (bookPath) {
    return window.ReaderPubReader1Loader.detectReader1OpenSpec(bookPath)
      .then(function (spec) {
        const loaderName = window.ReaderPubLoaderSelector.selectLoader(request, spec);
        const loader = loaderName === "reader1"
          ? window.ReaderPubReader1Loader
          : window.ReaderPubLegacyLoader;
        return window.ReaderPubBoot.bootWithLoader(loader, request, spec);
      });
  });
})();
```

`resolveBookPathForRequest(request)` should initially wrap the exact logic already present in `reader/index.html` for:

- `fetchBookLocation(source, id)`
- platform fallback path resolution
- URL canonicalization

The aim is not to redesign all of that in one move; it is to route the final open call through a loader.

### Acceptance criteria

- `/reader` can open a known-good `reader1` book using `reader1-manifest.json`.
- `/reader` still opens legacy books.
- Protected route still redirects as before.

---

## Phase 3 — Merge `reader1` runtime-only deltas into `reader/js/reader.js`

### Goal
Remove the need for a separate `reader1/js/reader.js` runtime.

### Concrete code changes

Below are the changes worth cherry-picking from `reader1/js/reader.js` into `reader/js/reader.js`.

#### 1. Href normalization must handle source-qualified paths

Bring over the stronger `normalizeHref()` behavior:

```js
function normalizeHref(href) {
  if (!href) return "";
  var h = String(href).trim();
  try {
    if (/^https?:\/\//i.test(h)) {
      h = new URL(h).pathname || h;
    }
  } catch (eUrl) {}
  h = h.split("#")[0];
  try {
    h = h.replace(/^.*\/books\/content\/[^/]+\/[^/]+\//, "");
    h = h.replace(/^.*\/books\/content\/[^/]+\//, "");
    h = h.replace(/^.*\/(c|r|s)\//, "$1/");
  } catch (ePathStrip) {}
  h = h.replace(/^\/+/, "");
  h = h.replace(/^(\.\.\/)+/, "");
  h = h.replace(/^\.\//, "");
  return h;
}
```

#### 2. Add `isJsonManifestBook()` helper

```js
function isJsonManifestBook() {
  try {
    return !!(reader && reader.book && reader.book.package && reader.book.package.isJsonManifest);
  } catch (e) {}
  return false;
}
```

#### 3. Expand spine href lookup to basename fallback

`reader1/js/reader.js` adds basename-based lookup. This matters for manifest books where hrefs may be normalized differently.

```js
var base = h ? h.split("/").pop() : "";
if (base && reader._spineHrefToIndex[base] == null) {
  reader._spineHrefToIndex[base] = i;
}
```

And when resolving the chapter index:

```js
var base = href ? href.split("/").pop() : "";
if (base && reader._spineHrefToIndex && reader._spineHrefToIndex[base] != null) {
  return reader._spineHrefToIndex[base];
}
```

#### 4. Page count fallback logic should tolerate missing CFI percentage mapping

The `reader1` code falls back to `loc.start.percentage` and `loc.end.percentage`. That should be adopted in the shared runtime.

#### 5. TOC navigation should special-case JSON-manifest books

`reader1` strips the fragment before `rendition.display()` and then schedules page-map rebuild. That behavior belongs in the shared runtime behind `isJsonManifestBook()`.

### Acceptance criteria

- `reader/js/reader.js` can support both legacy and `reader1` books.
- `reader1/js/reader.js` is no longer the source of unique runtime behavior.

---

## Phase 4 — Turn `/reader1` into compatibility mode

### Goal
Keep old links working while using the canonical shell.

### Concrete code changes

#### Option A — Compatibility redirect (preferred)

Replace the boot logic in `reader1/index.html` with a redirect to `/reader` while preserving all existing query/hash params.

Starter block:

```html
<script>
(function () {
  try {
    var target = new URL('/reader/', window.location.origin);
    target.search = window.location.search || '';
    target.hash = window.location.hash || '';
    target.searchParams.set('compat_reader', 'reader1');
    window.location.replace(target.toString());
    return;
  } catch (e) {}
})();
</script>
```

#### Option B — Compatibility bootstrap (safer first deploy)

If redirect is too risky for bookmarks or embedding, keep `reader1/index.html` but make it load the canonical shell scripts instead of its own forked runtime.

Example:

```html
<script src="/reader/js/core/route-resolver.js"></script>
<script src="/reader/js/core/loader-selector.js"></script>
<script src="/reader/js/core/boot-reader.js"></script>
<script src="/reader/js/loaders/legacy-loader.js"></script>
<script src="/reader/js/loaders/reader1-loader.js"></script>
<script src="/reader/js/reader.js"></script>
```

This is the easier intermediate step if you want rollback safety.

### Acceptance criteria

- Existing `/reader1` deep links still work.
- Actual runtime and shell behavior now come from `/reader`.

---

## Phase 5 — Update worker routing to canonicalize old reader1 paths

### Goal
Keep edge routing aligned with the new shell ownership.

### Concrete code changes

In `_worker.js`, extend the existing reader rewrite logic so `reader1` compatibility paths can canonicalize toward `reader` while still going through the common response path.

Starter pattern:

```js
if (pathname.startsWith('/books/reader1/')) {
  const rewrittenPath = pathname.replace('/books/reader1/', '/reader1/');
  request = new Request(new URL(rewrittenPath + url.search, url.origin), request);
}
```

Then, once compatibility redirect/bootstrap is stable, canonicalize more aggressively:

```js
if (pathname.startsWith('/books/reader1/')) {
  const rewrittenPath = pathname.replace('/books/reader1/', '/reader/');
  const rewrittenUrl = new URL(rewrittenPath + url.search, url.origin);
  rewrittenUrl.searchParams.set('compat_reader', 'reader1');
  request = new Request(rewrittenUrl, request);
}
```

Important: do **not** reintroduce an early `return env.ASSETS.fetch(...)` path here. The request must continue through the existing response-decoration logic so headers and HTML injection stay correct.

### Acceptance criteria

- Edge-level reader compatibility works.
- Response headers and HTML rewriting continue to run.

---

## Phase 6 — Update publishing/index generation

### Goal
Stop treating `reader1` as a separate frontend destination.

### Concrete code changes

#### 1. Adjust `tools/reader1/publish_books.py`

Today it enforces `readerType=reader1` in book locations. That metadata can stay, but it should mean **loader mode**, not **frontend path**.

Add or update emitted metadata to include a canonical open URL pointing to `/reader`.

Example target shape in generated location metadata:

```json
{
  "readerType": "reader1",
  "openUrl": "/reader/?source=standardebooks&id=alice-in-wonderland",
  "contentPath": "/books/content/standardebooks/alice-in-wonderland/",
  "manifestPath": "/books/content/standardebooks/alice-in-wonderland/reader1-manifest.json"
}
```

Concrete adjustment area: wherever `book_locations` entries are written or validated.

#### 2. Keep `readerType=reader1` for now

This avoids breaking existing analytics and content typing, while allowing `/reader` to become the canonical UI.

### Acceptance criteria

- Newly published `reader1` books open through `/reader`.
- Existing metadata remains backward compatible.

---

## Phase 7 — Remove duplicate assets and code

### Goal
Retire the `reader1` fork once parity is proven.

### Tasks

1. Delete `reader1/js/reader.js` after shared runtime parity is reached.
2. Delete `reader1/js/fbreader-ui.js` if it no longer diverges.
3. Reduce `reader1/index.html` to a minimal compatibility file.

### Acceptance criteria

- One maintained shell.
- One maintained runtime.
- Compatibility-only `reader1` footprint.

---

# Ticket backlog with concrete scope

## Ticket 1 — Extract route resolver from `reader/index.html`

**Files**
- `reader/index.html`
- `reader/js/core/route-resolver.js`

**Acceptance criteria**
- Existing `/reader` flows still work.
- Route parsing is centralized.

## Ticket 2 — Introduce loader selector and reader1 loader in `/reader`

**Files**
- `reader/index.html`
- `reader/js/core/loader-selector.js`
- `reader/js/core/boot-reader.js`
- `reader/js/loaders/reader1-loader.js`
- `reader/js/loaders/legacy-loader.js`
- `reader/js/loaders/protected-loader.js`

**Acceptance criteria**
- `/reader` opens both a legacy book and a `reader1` book.

## Ticket 3 — Merge runtime deltas from `reader1/js/reader.js` into `reader/js/reader.js`

**Files**
- `reader/js/reader.js`
- optionally `tests/unit/reader-page-counter.unit.test.mjs`
- optionally add new tests for JSON-manifest behavior

**Acceptance criteria**
- `reader/js/reader.js` supports source-qualified manifest books.

## Ticket 4 — Convert `reader1/index.html` into compatibility bootstrap

**Files**
- `reader1/index.html`

**Acceptance criteria**
- Existing reader1 links still work.
- Runtime ownership is canonicalized.

## Ticket 5 — Canonicalize publishing/index output toward `/reader`

**Files**
- `tools/reader1/publish_books.py`
- any generated location metadata docs/tests

**Acceptance criteria**
- New `reader1` content opens in `/reader`.

## Ticket 6 — Worker compatibility routing

**Files**
- `_worker.js`
- `tests/integration/worker.integration.test.mjs`

**Acceptance criteria**
- `/books/reader1/*` compatibility paths work without losing response decoration.

---

# Test plan

## Automated

1. Worker integration tests
   - `/books/reader/*`
   - `/books/reader1/*`
   - HTML route markers and cache headers

2. Reader integration smoke tests
   - open legacy book in `/reader`
   - open `reader1` book in `/reader`
   - open protected mode in `/reader`
   - open old `/reader1` compatibility path

3. Runtime unit tests
   - href normalization
   - spine href resolution
   - JSON-manifest chapter lookup
   - page-count percentage fallback

## Manual QA matrix

| Case | URL | Expected |
|---|---|---|
| Legacy public book | `/reader/?id=75586` | opens in canonical reader |
| Reader1 public book | `/reader/?source=<src>&id=<book>` | opens manifest-backed book |
| Reader1 compatibility | `/reader1/?source=<src>&id=<book>` | redirects or boots canonical shell |
| Protected book | `/reader/?reader=protected&id=<id>` | protected reader path still works |
| Missing manifest | `/reader/?source=<src>&id=<bad>` | friendly error, not broken shell |

---

# Risks and mitigations

## Risk: hidden logic in `reader/index.html`

Mitigation: wrap existing logic first; do not attempt to simplify protected/entitlement flow in the same PR.

## Risk: `reader1` books with unusual hrefs

Mitigation: bring over `normalizeHref`, basename fallback, and JSON-manifest-specific TOC/page-count logic before switching traffic.

## Risk: saved positions/bookmarks drift

Mitigation: read old state keys during migration and keep URL semantics unchanged.

## Risk: worker rewrite regressions

Mitigation: ensure rewrites still pass through the common response path, with integration tests.

---

# What I would implement first

## First PR

- extract route resolver and loader selector into `/reader/js/core/*`
- add `reader1-loader.js` to `/reader`
- let `/reader` open a manifest-backed `reader1` book
- no `/reader1` redirect yet

## Second PR

- merge the specific `reader1/js/reader.js` runtime deltas into `reader/js/reader.js`
- add unit coverage for JSON-manifest behavior

## Third PR

- convert `reader1/index.html` into compatibility bootstrap or redirect
- update publishing output to point to `/reader`
- add worker compatibility rewrite coverage

---

# Bottom line

Do **not** replace `reader` with `reader1`.
Do **not** keep both as long-term forks.

Use `reader` as the canonical shell, and move `reader1` into a loader mode plus compatibility shim.

That matches the repo’s current strengths:

- `reader` already owns the shell concerns.
- `reader1` already owns the manifest-book loading concerns.

The implementation path above lets you combine those without a dangerous rewrite.
