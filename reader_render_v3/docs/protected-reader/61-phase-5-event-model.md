# Phase 5 Event Model

## 1. Contract rule
Events in `Phase 5` must express **UI-level reader contract**, not protected runtime internals.

Allowed:
- user-visible state transitions
- shell-consumed state
- contract-level changes shared across book types

Forbidden:
- worker internals
- glyph/layout internals
- protected-only rendering internals
- private runtime state transitions not meant for shell consumption

## 2. UI-level canonical events

### `pageChanged`
Contract event.
Used by shell for:
- visible page label
- navigation state
- chapter/page status updates

### `selectionChanged`
Contract event.
Used by shell for:
- selection presence
- selection toolbar eligibility
- focused annotation state

### `searchStateChanged`
Contract event.
Used by shell for:
- search open/active state
- query and count state
- next/prev/return availability

### `annotationsChanged`
Contract event.
Used by shell for:
- notes/bookmarks counts
- notes list refresh
- annotation-focused state

### `themeChanged`
Contract event.
Used by shell for:
- light/dark state
- shell-visible reading appearance state

### `readingPositionChanged`
Contract event.
Used by shell for:
- restore token / current reading position
- route/share reconstruction related UI state

### `toolbarStateChanged`
Contract event where shell uses explicit toolbar visibility state.
Used by shell for:
- selection toolbar visibility and suppression behavior

## 3. Derived / UI events
These may exist as shell-level derived signals, but are not required to define backend internals:
- `sidebarStateChanged`
- `searchResultsLoaded`
- `bookmarkUpdated`
- `noteFocused`

These are allowed only if they remain UI-level and do not expose backend internals.

## 4. Internal runtime events that must not be exposed in contract
The following examples are explicitly forbidden as reader-interface contract events:
- `glyphLayoutUpdated`
- `chunkReflow`
- `protectedSelectionResolved`
- `internalRenderStateChanged`
- `workerStateChanged`
- `layoutInternalChanged`

Equivalent protected-only events may exist internally, but must stay hidden behind canonical UI-level events.

## 5. Common vs type-specific rule
Canonical events are part of shared reader contract for:
- protected books
- unprotected books

Backend-specific internals may differ, but they must map into the same shell-level event vocabulary where the UI promise is shared.
