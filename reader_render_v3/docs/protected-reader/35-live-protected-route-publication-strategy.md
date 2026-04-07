# 35. Live Protected Route Publication Strategy

## Target Live/Staging Route

The internal live target is a Pages preview deployment for the current branch, not `reader.pub`.

Expected preview host pattern after a manual Pages deploy with `--branch <name>`:

- `https://<sanitized-branch>.reader-books.pages.dev`

Target route shape:

- old reader on preview:
  - `/reader/?id=<bookId>`
- protected reader on preview:
  - `/reader/?id=<bookId>&reader=protected&renderMode=shape&metricsMode=shape`

Direct integration route remains valid for diagnostics:

- `/reader_render_v3/integration/protected-reader.html?id=<bookId>&reader=protected&renderMode=shape&metricsMode=shape`

## Coexistence With Old Reader

- `reader.pub/books/reader/?id=...`
  - stays on the old reader default path
- protected reader does not become the canonical default
- protected mode is only used on:
  - explicit `reader=protected`
  - and only when rollout/eligibility checks pass

## Publication Rule

For internal live testing, publish a Pages preview bundle that contains:

- `_worker.js`
- `books/`
- `reader/`
- `reader1/`
- `reader_render_v3/`
- `publisher_tasks/`

This bundle is sufficient for:

- old preview reader shell
- protected redirect from `/reader/?reader=protected`
- integrated protected page
- runtime worker imports

## Expected Pages/Staging Behavior

Expected on the published preview alias:

1. `/reader/?id=19686`
   - opens old reader
2. `/reader/?id=19686&reader=protected...`
   - redirects into the integrated protected page
   - opens protected mode
   - shows canvas-only surface
3. rollout denial / missing artifact
   - returns a controlled fallback outcome
4. worker unavailable
   - stays fail-closed inside protected mode

## Readiness Runner Live Mode

The readiness runner must be able to check a published protected route with:

- `--live-url=<published_protected_url>`
- `--expect-live-protected=true`

Pass conditions:

- route is not `404`
- route does not serve the old reader shell
- route reaches the integrated protected page
- canvas-only reader surface is active
- rollout behavior remains controlled

## What This Step Does Not Do

- no production-wide protected rollout
- no automatic switch of `reader.pub` users to protected mode
- no removal of the old reader
- no weakening of protected worker-only behavior
