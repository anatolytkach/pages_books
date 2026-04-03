# Protected Ingestion Dry-Run

This module builds a local-only protected book artifact for `reader_render_v3`.

It does **not**:

- write to R2
- change the current catalog
- change the current public reader
- change live routing

It is a dry-run builder for a future protected pipeline.

## Commands

Run from the repository root:

```bash
npm --prefix reader_render_v3 run protected:build -- --input books/content/19686 --output artifacts/protected-books/19686
```

Or from inside `/Volumes/2T/se_ingest/pages_books/reader_render_v3`:

```bash
npm run protected:build -- --input ../books/content/19686 --output artifacts/protected-books/19686
```

Debug build:

```bash
npm --prefix reader_render_v3 run protected:build -- --input books/content/19686 --output artifacts/protected-books/19686 --debug-artifact
```

Validate runtime-safe artifact:

```bash
npm --prefix reader_render_v3 run protected:validate -- --input artifacts/protected-books/19686
```

## Accepted input

- an exploded EPUB directory with `META-INF/container.xml`
- a current local book root such as:
  - `/Volumes/2T/se_ingest/pages_books/books/content/19686`
  - `/Volumes/2T/se_ingest/pages_books/books/content/manual/19`
- an `.epub` file (unzipped to a temp folder for dry-run processing)

## Output

The builder writes a runtime-safe protected artifact with:

- `manifest.json`
- `toc.json`
- `locations.json`
- `styles.json`
- `chunks/*.json`
- `glyphs/*.glyphs.json`
- `assets/`

When `--debug-artifact` is enabled it also writes:

- `debug/chunks/*.debug.json`
- `debug/glyphs/*.glyphs.debug.json`

Each runtime-safe chunk contains two distinct layers:

- `renderLayer`
- `selectionLayer`

The render layer does not expose readable text runs directly.
The runtime-safe selection layer stores only logical range metadata and does not contain `fullText`.

Readable debug fields such as `char` and `fullText` live only inside the optional `debug/` subtree.

## Current limitations

- no final renderer
- no pagination engine
- no canvas integration
- no server protection
- no note runtime
- no full footnote runtime

The goal of this step is only to prove that one current book can be deterministically converted into a chunk-based protected artifact while preserving source traceability.
