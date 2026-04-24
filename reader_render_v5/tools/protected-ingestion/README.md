# Protected Ingestion

This module builds local protected book artifacts for `reader_render_v3`.

The build and validate commands operate on artifact directories only. They do
not publish content by themselves.

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

## Scope

- Builds artifact directories under `reader_render_v3/artifacts/protected-books/`
- Validates runtime-safe artifact structure
- Supports debug artifact output with `--debug-artifact`

Publishing protected artifacts to remote storage is handled outside this module.
