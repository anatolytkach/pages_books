# 109. Current Branch Delta Summary

This document explains the difference between the previous commit and the current branch state.

It is intentionally outcome-oriented.

It does not try to retell the step-by-step execution history.

## Scope of the Delta

This branch changes the active `reader_new` architecture and the local verification workflow.

The main outcomes are:

- active `reader_new` ownership moved out of `reader_render_v3/integration/*`
- former integration host/bootstrap/routing/rollout/pilot/status/config files are no longer active owners
- most of that former integration family was physically deleted
- `reader_new` now has its own entrypoint
- localhost UX verification now supports local UI with Cloudflare-backed book/artifact payloads
- unprotected test opens are normalized into the same new UX host contract used by protected opens
- catalog test sections and proof tooling were updated around that architecture

## What Changed in Runtime Ownership

Before this branch state:

- `reader_new` still depended on ownership living under `reader_render_v3/integration/*`
- standalone integration artifacts and transitional host/bootstrap code were still part of the operational story
- old and new host responsibilities were mixed across `reader/index.html` and integration-era modules

After this branch state:

- active `reader_new` ownership lives under `reader_render_v3/reader_new/*`
- `reader_new` boots through its own entrypoint:
  - [reader_new.html](/Volumes/2T/se_ingest/pages_books/reader/reader_new.html)
- active protected/new-reader modules now live here:
  - [protected-host-ui.js](/Volumes/2T/se_ingest/pages_books/reader_render_v3/reader_new/protected-host-ui.js)
  - [protected-host-bootstrap.js](/Volumes/2T/se_ingest/pages_books/reader_render_v3/reader_new/protected-host-bootstrap.js)
  - [protected-host-routing.js](/Volumes/2T/se_ingest/pages_books/reader_render_v3/reader_new/protected-host-routing.js)
  - [protected-host-rollout.js](/Volumes/2T/se_ingest/pages_books/reader_render_v3/reader_new/protected-host-rollout.js)
  - [protected-host-eligibility.js](/Volumes/2T/se_ingest/pages_books/reader_render_v3/reader_new/protected-host-eligibility.js)
  - [protected-host-pilot.js](/Volumes/2T/se_ingest/pages_books/reader_render_v3/reader_new/protected-host-pilot.js)
  - [protected-host-status.js](/Volumes/2T/se_ingest/pages_books/reader_render_v3/reader_new/protected-host-status.js)
  - [protected-host-rollout-config.js](/Volumes/2T/se_ingest/pages_books/reader_render_v3/reader_new/protected-host-rollout-config.js)
  - [protected-host-pilot-config.js](/Volumes/2T/se_ingest/pages_books/reader_render_v3/reader_new/protected-host-pilot-config.js)

## What Was Removed

The following former integration owners were removed from the codebase:

- `reader_render_v3/integration/protected-old-shell-host.js`
- `reader_render_v3/integration/protected-reader-bootstrap.js`
- `reader_render_v3/integration/protected-reader-routing.js`
- `reader_render_v3/integration/protected-reader-rollout.js`
- `reader_render_v3/integration/protected-reader-eligibility.js`
- `reader_render_v3/integration/protected-reader-pilot.js`
- `reader_render_v3/integration/protected-reader-status.js`
- `reader_render_v3/integration/protected-reader-rollout-config.js`
- `reader_render_v3/integration/protected-reader-pilot-config.js`
- `reader_render_v3/integration/protected-reader-entry.js`

The old standalone protected integration page was also demoted from an active host into a compatibility redirect shim:

- [protected-reader.html](/Volumes/2T/se_ingest/pages_books/reader_render_v3/integration/protected-reader.html)

## What Changed in Route Behavior

### `reader_new`

`reader_new` is now the canonical new-reader host.

It no longer depends on the former integration ownership layer.

Plain unprotected test opens on `reader_new` are normalized into the same protected-style host contract used by protected opens.

For the current localhost UX baseline, this means:

- protected `45` opens in the new host with remote protected artifact data
- unprotected `45` also ends up in the same new host path, not in the old `/reader/` UX

### `/reader/`

The old `/reader/` path still exists as a legacy route entry.

But its protected host import now points directly at the new host module path rather than the removed integration host file.

That means legacy protected entry still functions, but it no longer keeps the deleted integration host alive.

## What Changed for Local UX Debugging

The branch now supports a practical localhost workflow where:

- the UI runs locally
- the book or protected artifact is fetched from Cloudflare-backed canonical origin
- silent local fallback can be locked out in strict mode

The operational localhost verification URLs for book `45` are:

- protected:
  - [http://127.0.0.1:8792/books/reader_new/?id=45&entry=catalog-test&reader=protected&protectedArtifactBookId=45&protectedArtifactSource=r2&readerRemoteMode=strict&protectedUx=old-shell&renderMode=shape&metricsMode=shape](http://127.0.0.1:8792/books/reader_new/?id=45&entry=catalog-test&reader=protected&protectedArtifactBookId=45&protectedArtifactSource=r2&readerRemoteMode=strict&protectedUx=old-shell&renderMode=shape&metricsMode=shape)
- unprotected open normalized into the same new UX:
  - [http://127.0.0.1:8792/books/reader_new/?id=45&readerContentSource=r2&readerRemoteMode=strict](http://127.0.0.1:8792/books/reader_new/?id=45&readerContentSource=r2&readerRemoteMode=strict)

## What Changed in Catalog Experiment Support

Catalog experiment support remains in place and was aligned with the new-reader ownership changes.

Relevant files:

- [books/index.html](/Volumes/2T/se_ingest/pages_books/books/index.html)
- [books/catalog.config.json](/Volumes/2T/se_ingest/pages_books/books/catalog.config.json)

The intent remains narrow:

- temporary test sections in catalog
- selected books only
- no global catalog migration

## What Changed in Tooling

Proof tooling was updated so it no longer assumes the old standalone integration page is the canonical protected path.

Important examples:

- [check-live-protected-route.js](/Volumes/2T/se_ingest/pages_books/reader_render_v3/tools/internal/check-live-protected-route.js)
- [check-protected-reader-readiness.js](/Volumes/2T/se_ingest/pages_books/reader_render_v3/tools/internal/check-protected-reader-readiness.js)
- [check-rollout-eligibility.js](/Volumes/2T/se_ingest/pages_books/reader_render_v3/tools/annotation-compat/check-rollout-eligibility.js)

The current expectation is:

- `reader_new` is the canonical new-reader host
- legacy `/reader/` protected opens are acceptable only if runtime meta still reports:
  - `Reader host = reader_new`

## What a Reviewer Should Check

If you are reviewing only the current delta, focus on these questions:

1. Did active ownership move from `integration/*` to `reader_new/*`?
2. Were former integration owner files actually removed, not just bypassed?
3. Does `reader_new` still open correctly for protected and normalized-unprotected localhost book `45`?
4. Does the local strict-remote workflow still use Cloudflare-backed payloads?
5. Does legacy `/reader/?reader=protected...` still resolve into the new host without reviving removed integration ownership?

## Non-Goals of This Summary

This document does not describe:

- the chronological phase-by-phase execution trail
- every historical readiness checkpoint
- every intermediate branch decision

Those details still exist in the historical phase documents, but they are not needed to review the current delta.
