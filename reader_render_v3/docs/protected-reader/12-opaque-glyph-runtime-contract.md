# 12 Opaque Glyph Runtime Contract

Updated: 2026-04-04

## Why the previous contract was too weak

The previous runtime-safe contract still leaked too much of the book's text model:

- glyph records exposed direct `codePoint`
- render payload looked too much like a linear reading-order stream
- a scraper could recover text from JSON without having to reason about shapes first

That was closer to a thinly disguised text delivery model than to a Kindle-like
glyph-first runtime.

## What changed

The runtime-safe delivery contract now separates two paths much more clearly.

### A. Runtime-safe render path

This path is what the renderer consumes.

It now contains:

- chunk-local `glyphToken`
- `glyphId`
- `shapeRef`
- style and script metadata
- shape bundles with extracted or synthetic path descriptors
- glyph placement ops and layout geometry

It no longer contains:

- `codePoint`
- `char`
- `fullText`
- readable text runs

### B. Controlled reconstruction path

This path exists only so runtime logic can still support:

- selection reconstruction
- copy selected text
- future restore/highlight/note foundations

It is no longer delivered as a separate fetchable reconstruction file.

Instead, a sealed reconstruction substrate is embedded into the glyph payload in a
less convenient, non-text-oriented form.

Current properties:

- chunk-scoped
- keyed by opaque glyph tokens
- encoded, not direct Unicode
- embedded as a sealed substrate rather than a separate recon dump
- used only through narrow runtime reconstruction helpers
- not exposed in DOM
- not treated as debug artifact

This is not absolute protection, but it raises extraction cost significantly compared
to direct `codePoint` leakage in `glyphs/` or `shapes/`.

## Opaque glyph token model

For each chunk:

- runtime-safe glyph identity is `glyphToken`
- the same character in another chunk gets a different token
- shape bundles are resolved through `shapeRef`
- render ops operate on glyph tokens and placements, not Unicode

This makes the delivery model closer to:

- glyph token -> shape/path/render metadata

rather than:

- glyph token -> direct Unicode symbol

## Runtime-safe files after this step

The main delivery files are now:

- `chunks/*.json`
- `glyphs/*.glyphs.json`
- `shapes/*.shapes.json`

The render path and reconstruction path are physically separated.
The reconstruction substrate is embedded inside the glyph bundle rather than exposed as
an additional fetchable text-like file.

## Why this is closer to Kindle Web

This step moves the protected format closer to the Kindle-style pattern where the browser
primarily receives shape/glyph instructions and placement metadata, not a near-plain-text stream.

Kindle Web is still stronger in several ways:

- more aggressive glyph indirection
- more complex reading-order recovery cost
- tighter coupling between render instructions and page model

But removing direct `codePoint` leakage and making glyph tokens the primary runtime unit
is a material improvement over the previous contract.

## What still remains attackable

This is still not absolute DRM-like protection.

A determined attacker can still target:

- extracted path matching
- runtime instrumentation of controlled reconstruction
- layout traversal and selection interception

So this step should be understood as:

- strong reduction in inspector-level scraping convenience
- not cryptographic prevention of all extraction

## Validation expectations

The validator now enforces that runtime-safe payloads do not expose:

- `codePoint`
- `char`
- `fullText`
- plain `text` leakage in protected render paths

It also checks:

- runtime glyph records use `glyphToken`
- render payload uses `glyphRuns`
- shape bundles link correctly to glyphs
- a sealed reconstruction substrate is present without becoming a readable recon dump

## Local verification

Build:

```bash
npm --prefix reader_render_v3 run protected:build -- --input books/content/19686 --output artifacts/protected-books/19686
```

Validate:

```bash
npm --prefix reader_render_v3 run protected:validate -- --input artifacts/protected-books/19686
```

Then inspect:

- `glyphs/*.glyphs.json` should have no `codePoint`
- `shapes/*.shapes.json` should have no `codePoint`
- `chunks/*.json` should use `renderLayer.glyphRuns`
- no `internal/*.recon.json` network surface should exist
- glyph bundles should carry a sealed substrate rather than a readable recon file

## Annotation interaction with the opaque contract

Highlights and notes now sit on top of the opaque render contract without changing it.

They persist stable range descriptors and user-authored note text, not raw book text.
When the dev shell restores an annotation, it does so through:

- global offsets
- chunk/page resolution
- current layout geometry

rather than by storing a text excerpt as the anchor of truth.

## Worker isolation interaction

The opaque render contract is now also consumed through a worker-oriented runtime path.

That means the browser page script no longer needs to directly own:

- protected book model loading
- chunk parsing
- layout preparation
- copy reconstruction internals

It instead receives prepared page packets and narrow action results.
