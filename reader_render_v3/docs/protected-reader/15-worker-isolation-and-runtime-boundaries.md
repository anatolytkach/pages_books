# 15 Worker Isolation And Runtime Boundaries

Updated: 2026-04-04

## Goal

This step moves the protected dev reader closer to a Kindle-like runtime boundary by
separating sensitive model preparation from the visible UI thread.

It does not claim browser-side invulnerability.

It does aim to:

- narrow the convenient instrumentation surface
- reduce access to reconstruction internals in main thread
- move layout and page preparation behind a worker boundary
- keep a safe fallback when worker execution is not available

## What now lives in the worker path

The worker-side runtime core now handles:

- artifact loading and parsing
- protected book model creation
- chunk loading
- layout preparation
- pagination model preparation
- selection hit-testing state updates
- page render packet preparation
- selection-range reconstruction for copy payloads
- restore-token resolution
- annotation range projection into visible page geometry

Main thread no longer needs the full book model or reconstruction helpers to operate
the dev shell.

## What stays in main thread

Main thread remains responsible for:

- UI controls
- pointer and button events
- clipboard writes
- annotation panel interactions
- lightweight annotation store
- rendering prepared packets to canvas
- diagnostics display

This keeps the UI responsive while avoiding direct access to the wider runtime model.

## Protocol shape

The worker protocol is intentionally narrow.

Current message families include:

- `initBook`
- `goToChunk`
- `goToToc`
- `goToNextPage`
- `goToPrevPage`
- `updateRenderConfig`
- `pointerDown`
- `pointerMove`
- `pointerUp`
- `clearSelection`
- `requestCopyPayload`
- `getRestoreToken`
- `restoreFromToken`
- `getSelectionRange`
- `goToAnnotation`
- `getRuntimeStatus`

There is no generic:

- dump model
- dump reconstruction substrate
- get full chunk text
- get internal state

API in the worker protocol.

## Render preparation boundary

The main thread now receives a prepared render packet rather than assembling the page
from raw runtime-safe files itself.

The packet can include:

- current page window
- layout geometry
- selection overlay geometry
- saved highlight geometry
- note marker geometry
- glyph ops for shape mode
- page-scoped text fragments for text mode
- diagnostics

That means reconstruction and layout preparation are no longer convenience functions
in the UI controller.

## Reconstruction boundary

Copy now follows a narrower path:

1. UI requests copy payload
2. worker reconstructs only the selected range
3. worker returns only the copy payload text and minimal diagnostics
4. main thread writes to clipboard

The main thread does not keep a reconstruction helper or full-chunk text cache.

## OffscreenCanvas foundation

The layout engine now supports worker-side scratch measurement via `OffscreenCanvas`
when available.

Current state:

- worker-side layout preparation uses `OffscreenCanvas` for measurement when the platform supports it
- actual painting still remains in main thread canvas host
- diagnostics report `OffscreenCanvas` as available or not available
- this is a foundation step, not a full worker-painting cutover

## Fallback

If a worker cannot be created, the client falls back to a main-thread runtime core.

Important constraints still hold in fallback mode:

- same narrow protocol surface
- no debug artifact usage
- no hidden DOM text
- no convenience full-chunk decode API

Fallback is reported explicitly in diagnostics as `fallback-main-thread`.

## What this hardening helps with

This makes convenient instrumentation attacks more expensive because:

- the UI thread no longer carries the full book/chunk/layout model
- reconstruction helpers are not directly attached to UI state
- layout and copy preparation move behind a request/response boundary
- protocol methods are narrow and task-oriented

## What it does not solve

This still does not prevent a strong attacker from:

- instrumenting worker code itself
- hooking message responses
- intercepting clipboard payloads
- stepping through page-by-page rendering

So the value here is practical hardening and boundary discipline, not impossible browser DRM claims.
