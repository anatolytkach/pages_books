# Catalog Test Sections For `reader_new` Execution

## Scope

- add two visible temporary catalog sections for manual `reader_new` checking
- keep the rest of the catalog on its current baseline reader path
- make the cards in those temporary sections open `reader_new` directly and explicitly
- render both sections near the top of the catalog landing view so they are easy to find

## Sections Added

- `Protected Books For New Reader Testing`
- `Unprotected Books For New Reader Testing`

## Exact Books

- protected:
  - `19686`
  - `45`
- unprotected:
  - `11`
  - `84`
  - `1342`

## Link Targets

- protected cards open `reader_new` with explicit protected params:
  - `reader=protected`
  - `protectedArtifactBookId=<id>`
  - `protectedArtifactSource=r2`
  - `readerRemoteMode=strict`
  - `protectedUx=old-shell`
- unprotected-section books are still Gutenberg books, but for this temporary manual-check experiment they also open `reader_new` through the exact protected-style shell pipeline:
  - `reader=protected`
  - `protectedArtifactBookId=<id>`
  - `protectedArtifactSource=r2`
  - `readerRemoteMode=strict`
  - `protectedUx=old-shell`
- current explicit URLs:
  - protected:
    - `/books/reader_new/?id=19686&entry=catalog-test&reader=protected&protectedArtifactBookId=19686&protectedArtifactSource=r2&readerRemoteMode=strict&protectedUx=old-shell&renderMode=shape&metricsMode=shape`
    - `/books/reader_new/?id=45&entry=catalog-test&reader=protected&protectedArtifactBookId=45&protectedArtifactSource=r2&readerRemoteMode=strict&protectedUx=old-shell&renderMode=shape&metricsMode=shape`
  - unprotected section:
    - `/books/reader_new/?id=11&entry=catalog-test&reader=protected&protectedArtifactBookId=11&protectedArtifactSource=r2&readerRemoteMode=strict&protectedUx=old-shell&renderMode=shape&metricsMode=shape`
    - `/books/reader_new/?id=84&entry=catalog-test&reader=protected&protectedArtifactBookId=84&protectedArtifactSource=r2&readerRemoteMode=strict&protectedUx=old-shell&renderMode=shape&metricsMode=shape`
    - `/books/reader_new/?id=1342&entry=catalog-test&reader=protected&protectedArtifactBookId=1342&protectedArtifactSource=r2&readerRemoteMode=strict&protectedUx=old-shell&renderMode=shape&metricsMode=shape`

## Out Of Scope

- mass routing changes for existing catalog cards
- replacing the catalog baseline reader for all books
- fixing the whole old catalog click path
- protected rollout beyond the two explicit test books
- broad statement that all unprotected books now use the protected pipeline

## Completion Criteria

- both temporary sections are visible in catalog landing view
- protected section contains exactly `19686` and `45`
- unprotected section contains exactly `11`, `84`, and `1342`
- clicking those cards opens `reader_new`
- protected cards open as protected
- unprotected-section Gutenberg cards open in the same shell UX path as protected cards
- the rest of the catalog stays on the preserved baseline

## Failure Criteria

- the sections are missing or hard to find
- the sections contain wrong ids
- the cards open the wrong reader path
- protected cards do not open as protected
- unprotected-section Gutenberg cards do not open through the exact protected-style shell path
- the rest of the catalog is unintentionally rerouted

## Temporary Removal Path

- remove `readerNewTestSections` from `books/catalog.config.json`
- remove `renderReaderNewTestSection(...)` mounts from the catalog landing render path in `books/index.html`
- keep the preserved baseline reader routing for the rest of the catalog unchanged
Update on April 14, 2026:
- The preview-facing catalog experiment is now intentionally narrowed to book `45` only.
- The protected section contains only `45`.
- The unprotected section also contains only `45`.
- Earlier preview test books (`19686`, `11`, `84`, `1342`) were removed from the catalog-facing preview test surface.
