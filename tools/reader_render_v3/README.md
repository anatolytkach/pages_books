# Reader Render V3 Tools

This folder contains the isolated tooling for the next protected book format.

Current contents:
- `convert_book.py` — CLI entrypoint
- `v3_core.py` — conversion logic and storage-contract builder

Supported inputs:
- `.epub`
- unpacked legacy book directory

Current output:
- `book-manifest.json`
- `nav/`
- `order/`
- `layout/`
- `text/`
- `glyphs/`
- `assets/`

This is the first independent converter layer. It does not modify the current
reader pipeline.
