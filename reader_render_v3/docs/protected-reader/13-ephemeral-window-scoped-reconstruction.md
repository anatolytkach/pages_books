# 13 Ephemeral Window-Scoped Reconstruction

Updated: 2026-04-04

## Why the previous reconstruction surface was still weak

Even after removing direct `codePoint` leakage from the main render payload, a strong
attacker could still target a separate reconstruction layer if it existed as:

- an easy-to-fetch extra file
- a chunk-wide linear decode table
- a long-lived runtime cache

That would still make mass extraction through runtime instrumentation too convenient.

## What changed

The protected runtime now narrows reconstruction in three ways:

1. no separate fetchable reconstruction file
2. no default full-chunk decode path
3. reconstruction results are short-lived and scope-bound

## Sealed reconstruction substrate

The reconstruction material is now embedded inside the glyph bundle as a sealed substrate.

Current properties:

- chunk-local
- glyph-token oriented
- encoded and indirect
- not exposed as direct `glyphToken -> codePoint`
- not delivered as `internal/*.recon.json`

This is not cryptographic DRM, but it removes a very convenient inspector-friendly attack surface.

## Window-scoped reconstruction

Runtime text reconstruction is now intended to happen only for narrow scopes:

- visible page/window in text mode
- current selection range
- explicit cross-chunk range reconstruction helper

The runtime should not predecode and retain full chunk text by default.

## Ephemeral reconstruction buffers

The runtime now uses short-lived reconstruction scopes:

- page-scoped scopes for visible-page text painting
- selection-scoped scopes for copy
- bounded temporary caches inside a scope
- explicit disposal after use

That means:

- no long-lived `fullChunkText`
- no convenience dump object
- no global retained decoded string state

## Page rendering

Protected main-thread rendering is now shape-only.

That means:

- visible page painting no longer receives decoded fragment strings in snapshot packets
- scoped reconstruction stays behind the worker boundary
- only narrow action results such as copy payload may return decoded text

Shape mode requires no text reconstruction at all for painting.

## Copy and selection

Copy now follows this narrow path:

1. build snapped selection range
2. create selection-scoped reconstruction scope
3. reconstruct only the selected offsets
4. write to clipboard
5. dispose the scope

This preserves selection/copy UX without keeping a wide reconstruction cache around.

## Highlight and note interaction

The annotation layer intentionally does not expand reconstruction scope.

Highlights and notes are stored as range descriptors. They do not retain a decoded book
excerpt as their source of truth. When the UI needs to navigate back to an annotation,
it resolves the saved range through global offsets and current page/chunk state.

If a future UI wants a tiny preview excerpt, it should request it through the same
scoped reconstruction rules rather than retaining a decoded text payload in annotation state.

## What became more expensive for an attacker

Compared to the previous state, a runtime instrumentation attacker now faces:

- no extra recon file to fetch directly
- no direct Unicode in render payload
- no default full-chunk decoded state
- narrower range-scoped decode paths
- ephemeral reconstruction buffers instead of convenient retained strings

This does not make extraction impossible, but it increases the amount of targeted
runtime interception an attacker must perform.

## What still remains attackable

This is still not absolute browser-side protection.

Possible remaining attack points:

- instrumenting the reconstruction helpers directly
- intercepting clipboard copy results
- walking page-by-page through the runtime
- path matching plus runtime hooks

The goal of this step is to reduce convenience and widen the work factor, not to make
impossible promises about browser-side secrecy.

## Worker boundary follow-up

After the worker-isolation step, scoped reconstruction is now expected to run behind a
worker protocol when the platform supports it.

That adds another useful constraint:

- main thread requests narrow copy/page data
- worker executes scoped reconstruction
- main thread receives only the result needed for the current action

Protected mode no longer falls back to a weaker main-thread reconstruction path. If the
secure worker boundary is unavailable, protected mode fails closed instead.

## Local verification

Build:

```bash
npm --prefix reader_render_v3 run protected:build -- --input books/content/19686 --output artifacts/protected-books/19686
```

Validate:

```bash
npm --prefix reader_render_v3 run protected:validate -- --input artifacts/protected-books/19686
```

Open:

```text
http://127.0.0.1:8788/reader_render_v3/dev/protected-reader.html?book=19686&renderMode=text
http://127.0.0.1:8788/reader_render_v3/dev/protected-reader.html?book=19686&renderMode=shape&metricsMode=shape
```

Check:

- no `/debug/` requests
- no fetchable `internal/*.recon.json`
- runtime diagnostics show a narrow reconstruction path
- selection and copy still work
- restore token and page navigation still work
