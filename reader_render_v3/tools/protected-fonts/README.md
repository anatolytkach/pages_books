# Protected Fonts Tooling

This folder contains audit and planning tooling for the protected reader stack.

It does not modify catalog routing or the live reader paths.

## Commands

Run from the repository root:

```bash
npm --prefix reader_render_v3 run protected:audit
```

Generates or refreshes:

- `/Volumes/2T/se_ingest/pages_books/reader_render_v3/artifacts/protected-fonts/audit-report.md`
- `/Volumes/2T/se_ingest/pages_books/reader_render_v3/artifacts/protected-fonts/format-report.md`

```bash
npm --prefix reader_render_v3 run protected:fonts:scan -- --input <path>
```

Scans a folder containing EPUB files and/or exploded book directories and writes:

- `/Volumes/2T/se_ingest/pages_books/reader_render_v3/artifacts/protected-fonts/corpus-report.json`

```bash
npm --prefix reader_render_v3 run protected:fonts:plan
```

Builds a font plan from the scan report and writes:

- `/Volumes/2T/se_ingest/pages_books/reader_render_v3/artifacts/protected-fonts/font-plan.json`

## Input expectations for `scan-corpus`

- A directory containing one or more `.epub` files
- A directory containing one or more exploded book directories
- A mixed directory containing both

Exploded books are detected by one or more of:

- `META-INF/container.xml`
- `*.opf`
- XHTML/HTML content files

## What the scan reports

- Unicode scripts and block buckets
- Code point inventory and frequencies
- Punctuation inventory
- Superscript signals used by notes/footnotes
- Presence of bold / italic / bold-italic markers from HTML and CSS heuristics

## Dependencies recorded by the tooling

- `harfbuzzjs` for shaping
- `opentype.js` for glyph path extraction

These dependencies are used by the audit/planning layer and remain separate from the live protected runtime path.
