# Gutenberg Manual Ingest

ReaderPub now uses a manual terminal-first Gutenberg pipeline instead of weekly automation.

Primary CLI:

- `tools/gutenberg/gutenberg_manual_ingest.py`

This CLI:

1. Detects the current maximum Gutenberg ID from the live catalog indexes.
2. Starts from the next Gutenberg ID automatically.
3. Downloads only the preferred EPUB variant `pg<ID>.epub`.
4. Unpacks each book into the existing legacy Gutenberg layout:
   - `books/content/<id>/...`
5. Uploads new content to R2 under:
   - `content/<id>/...`
6. Rebuilds only the changed catalog `api/*` files.
7. Rebuilds `Newest Releases` with a hard limit of `12` books.
8. Builds and uploads selective SEO only for the new books.
9. Stores run state in R2 at:
   - `system/gutenberg-pipeline/state.json`
10. Supports `resume` after a failed run.

## Canonical Model

Gutenberg stays in the legacy public model:

- reader URL: `?id=<gutenberg_id>`
- content path: `/books/content/<id>/`

Manual books stay source-qualified:

- reader URL: `?id=<manual_id>&source=manual`
- content path: `/books/content/manual/<manual_id>/`

`source=gutenberg` is not canonical and is not required for new Gutenberg books.

## Commands

Check current state:

```bash
python3 tools/gutenberg/gutenberg_manual_ingest.py status
```

Discover the next candidate set:

```bash
python3 tools/gutenberg/gutenberg_manual_ingest.py scan
```

Discover and also verify preferred EPUB availability:

```bash
python3 tools/gutenberg/gutenberg_manual_ingest.py scan --verify-epub-on-scan
```

Run a full import:

```bash
python3 tools/gutenberg/gutenberg_manual_ingest.py run
```

Run a limited batch:

```bash
python3 tools/gutenberg/gutenberg_manual_ingest.py run --limit 25
```

Resume after a failure:

```bash
python3 tools/gutenberg/gutenberg_manual_ingest.py resume
```

Run only selective SEO for the current pending run:

```bash
python3 tools/gutenberg/gutenberg_manual_ingest.py seo
```

Rebuild only `Newest Releases`:

```bash
python3 tools/gutenberg/gutenberg_manual_ingest.py newest
```

## Progress Output

The CLI prints phase-aware progress to the terminal and also writes a local run log:

- `/tmp/readerpub_gutenberg_runs/<timestamp>-<command>.log`

Typical output:

```text
[manual-gutenberg] [scan] max_gutenberg_id=78269 next_start=78270 found=24 pending=24
[manual-gutenberg] [books 1/24] id=78270 phase=download
[manual-gutenberg] [books 1/24] id=78270 phase=upload_content done
[manual-gutenberg] [index 1/24] id=78270 build_lang_indexes
[manual-gutenberg] [seo-build] building selective SEO for 24 books
[manual-gutenberg] [done] {"found":24,"downloaded":24,"ingested":24,"indexed":24,"newest_releases_count":12}
```

`status` shows:

- runtime mode
- whether runtime credentials are available
- max Gutenberg ID
- next start ID
- last scan summary
- current run status
- current book and phase
- counts for success, pending, failed, skipped

## Runtime Requirements

Preferred runtime mode:

- direct R2 S3 access

Required for that mode:

- `R2_S3_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

Fallback runtime mode:

- `wrangler`

Required for that mode:

- `CLOUDFLARE_API_TOKEN`

State bucket:

- `GUTENBERG_STATE_R2_BUCKET`

Optional:

- `GUTENBERG_STATE_R2_KEY`
- `WRANGLER_BIN`
- `PYTHON_BIN`

## Failure Handling

The pipeline retries transient network and upload problems where possible.

If a hard failure remains, the CLI prints:

- the book ID
- the phase
- the error
- the exact resume command

Example:

```text
[manual-gutenberg] [failed] book=78281 phase=upload_content error=...
[manual-gutenberg] [action] retry after fixing the issue:
[manual-gutenberg] [action] python3 tools/gutenberg/gutenberg_manual_ingest.py resume
```

## Newest Releases

`Newest Releases` is rebuilt from the current ingest state, not from Gutenberg release dates.

Rules:

- maximum `12` books
- choose the highest IDs from the latest new Gutenberg batch
- language selection does not filter this section

## SEO

The manual CLI uses selective SEO patching:

- new book pages only
- touched author pages only
- merged books sitemaps
- merged chapter sitemaps

It does not require a full rebuild of the entire SEO corpus for a normal Gutenberg ingest.
