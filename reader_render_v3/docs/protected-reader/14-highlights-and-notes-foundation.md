# 14 Highlights And Notes Foundation

Updated: 2026-04-04

## Goal of this step

This step adds a real annotation foundation on top of the existing protected runtime:

- global reading model
- serializable ranges
- cross-chunk range helpers
- page navigation
- restore tokens
- fine-grained selection with word snapping

The scope started as dev-only and in-memory. It still does not introduce production
cutover or cloud persistence, but the integrated protected reader now persists the same
annotation model through a local-first repository layer.

## Annotation model

Annotations are range-first, not text-first.

Each annotation stores:

- `annotationId`
- `type`: `highlight` or `note`
- `bookId`
- `rangeDescriptor`
- `color`
- `createdAt`
- `updatedAt`
- optional metadata

Notes additionally store:

- `noteText`
- optional `highlightId`

The range descriptor remains the source of truth. Raw book text is not stored as the
primary annotation anchor.

## Store

The dev runtime now has an in-memory annotation store that can:

- add highlights
- add notes
- update notes
- delete annotations
- query annotations by global range
- list notes attached to a highlight
- export/import annotations as JSON

This keeps the architecture ready for a later persistence step without binding the
annotation source of truth to DOM state or a production backend.

The integrated protected reader now mounts the same annotation model through a repository
abstraction backed by a versioned local-first protected bundle.

## Rendering model

Persistent highlights are rendered through the overlay canvas, not through DOM text.

Layering now looks like this:

1. saved highlights
2. current active selection
3. note markers

Current selection stays soft gray.
Saved highlights use a distinct warm highlight fill.
Notes use a small marker placed near the start of the annotated range on the current chunk.

## Range anchoring and restore

Annotations are restored by stable ranges:

- exact global offsets first
- chunk and page resolution through the existing global location model
- current chunk projection for overlay geometry

This means a highlight survives:

- leaving the current page
- switching chunks
- restoring back to the same range later in the session

## Export, import, and persistence

The dev shell can now export and import a protected persisted bundle as JSON.

The payload contains:

- bundle schema/version
- book identity and fingerprint
- annotation ids
- types
- range descriptors
- reading state
- note text
- metadata

It still does not contain:

- book text dumps
- reconstruction substrate
- debug artifact payload

## Current limitations

Still missing:

- backend or cloud storage
- cross-device sync
- final note editor polish
- annotation conflict handling
- migration logic for changed chunking/layout in future formats

But the data model and runtime behavior are now aligned with a local-first persistence
step and a later file-sync/backend step.

## Worker interaction

The current annotation store remains lightweight and UI-oriented, but highlight geometry
projection can now be prepared through the worker runtime along with current page layout.

This keeps annotation UX working without pulling reconstruction or full book/chunk models
back into the main thread controller.

After snapshot sanitization, annotation packets sent to main thread remain geometry- and
range-based. They do not include automatic decoded quote previews or excerpt text from
the book.

## Production compatibility direction

This annotation foundation intentionally stays range-first. Compatibility with the existing production reader should be added through adapters, not by replacing the protected internal model.

See:

- `/Volumes/2T/se_ingest/pages_books/reader_render_v3/docs/protected-reader/16-production-reader-notes-compatibility-audit.md`
- `/Volumes/2T/se_ingest/pages_books/reader_render_v3/docs/protected-reader/17-production-to-protected-annotation-mapping.md`

The intended persistence path is:

1. protected bundle as internal source of truth
2. production note/share/sync export through compatibility adapters
3. reading-state compatibility through explicit CFI bridge metadata where needed

The first live version of that bridge now exists and is documented in:

- `/Volumes/2T/se_ingest/pages_books/reader_render_v3/docs/protected-reader/18-cfi-to-protected-range-resolver-and-compat-bridge.md`
