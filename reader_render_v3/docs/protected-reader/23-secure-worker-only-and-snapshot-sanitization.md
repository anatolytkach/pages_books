# 23 Secure Worker Only And Snapshot Sanitization

Updated: 2026-04-04

## Problem

Two hardening gaps remained in the protected reader:

1. protected mode could conceptually degrade to a weaker main-thread runtime path
2. worker snapshots could still expose text-like payloads to main thread if render packets contained decoded fragments

Both weaken the point of the protected runtime contract.

## What changed

Protected mode is now secure-worker-only.

If the protected worker cannot be created or is explicitly disabled for testing:

- protected mode fails closed
- the reader does not open in a weaker fallback path
- the UI shows a controlled unavailable state
- the integrated page still offers a link back to the old reader

This behavior applies only to protected mode. The old reader remains independent.

## Insecure fallback removal

Protected worker client creation now results in only two meaningful states:

- `worker`
- `unavailable`

There is no protected-mode main-thread reconstruction/layout fallback anymore.

The protected route may still fail, but it now fails honestly instead of quietly widening
the attack surface.

## Snapshot sanitization

`buildSnapshot()` and protocol sanitization now enforce a shape-only render packet for
main thread.

Main-thread render packets may include:

- page and chunk ids
- layout geometry
- page window geometry
- glyph ops
- shape records
- selection highlight geometry
- annotation highlight geometry
- note marker geometry
- diagnostics without book text

Main-thread render packets must not include:

- decoded strings
- text fragments
- line text
- page text
- selection text
- quote or excerpt previews
- preview text fields

Forbidden keys now trigger a hard failure in worker protocol sanitization.

## Copy boundary

Copy still works, but only through the narrow worker action result:

1. main thread sends `copyCurrentSelection`
2. worker reconstructs only the current selection range
3. worker returns only the clipboard payload needed for clipboard write
4. main thread does not retain decoded page or chunk text in snapshot state

This keeps copy usable without reopening a text-like snapshot surface.

## Annotation boundary

Highlights and notes continue to use:

- ids
- range descriptors
- offsets
- user-authored note text
- metadata

They do not receive automatic book-text previews in the normal snapshot path.

## Controlled failure UX

Integrated protected mode now shows a controlled failure state when secure worker mode is
not available.

Diagnostics expose:

- worker mode
- artifact load status
- fail-closed status
- reason

This replaces silent hangs or insecure degraded startup.

## Verification

Normal protected mode:

- opens in secure worker mode
- keeps selection, copy, page navigation, highlights, and notes working

Forced worker failure:

- `/books/reader/?id=19686&reader=protected&worker=disabled`
- shows `Protected mode is unavailable in this environment.`
- does not open a weaker protected runtime
- keeps the old-reader link available

Snapshot check:

- worker snapshot packets contain no `textFragments`, `pageText`, `lineText`, `segmentText`,
  `quoteText`, `previewText`, or `fullText`

## Remaining limits

This still does not make browser extraction impossible.

Strong attackers can still:

- instrument the worker itself
- intercept narrow copy responses
- automate page turns and repeated copy actions

The improvement is that protected mode no longer weakens itself through a broader
main-thread runtime surface.
