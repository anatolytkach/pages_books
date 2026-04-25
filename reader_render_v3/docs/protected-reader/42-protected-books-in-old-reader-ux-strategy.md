# 42. Protected Books In Old Reader UX Strategy

## Chosen architecture

The integration model is:

- old reader shell
- protected reading engine

That means:

- the top-level route stays the normal reader route
- the user sees the existing shell and controls zone
- the protected reading engine is mounted inside that shell as an embedded protected surface

## Shell vs engine split

Old shell responsibilities:

- route shell
- title/header area
- menu/sidebar metadata
- top-right shell controls
- overlay/menu shell
- notes panel entry point
- top-level navigation affordances

Protected engine responsibilities:

- protected artifact loading
- worker-only runtime
- canvas rendering
- selection/copy/highlight/note behavior
- protected persistence
- protected sync/handoff/transport model
- protected search implementation behind the old shell search UI
- protected theme application behind the old shell theme UI

## Canonical integration route

Automation-safe route:

- `/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape`

Published preview equivalent:

- `/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape`
  on `https://codex-reader-render-v3.reader-books.pages.dev`

## Why this is testable without manual OAuth

In automation-safe mode:

- Drive is explicitly marked disabled for the embedded protected engine
- basic open/read/navigate/highlight/note/persistence flows do not require Drive auth
- no popup or Google login is needed for UX integration smoke

This does not remove real Drive transport. It only keeps Drive non-blocking for shell-integration checks.

## UX parity rule

Protected books should not expose the green technical panel in the normal user path.

Normal old-shell protected UX must use:

- old-shell menu/sidebar
- old-shell top-right controls
- old-shell notes overlay
- old-shell next/prev affordances

Technical controls remain available only behind explicit internal flags.

## Coexistence with the old reader

- old route without protected opt-in stays old reader
- protected route still requires explicit opt-in and rollout checks
- the old reader engine remains intact for non-protected usage
