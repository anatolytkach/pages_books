# Session Handoff

## Session

- Date: 2026-04-12
- Worktree path: `C:\Users\yaran\Test1\pages_books\.worktrees\merge-reader-render-v3-staging-trim`
- Branch: `codex/protected-publish-jobs`
- Remote branch: `origin/codex/protected-publish-jobs`

## Goal

- Run a true staging end-to-end DOCX ingestion through the protected publishing flow
- Verify whether the Linux font fallback changes fix the earlier black-rectangle glyph failure

## Milestone Reached

- A fresh DOCX was processed end to end on staging from the local file:
  - `C:\Users\yaran\Documents\sample.docx`
- The staging protected publish job completed successfully
- The resulting protected content was generated under:
  - `contentId=200083`
  - `jobId=a2975a2a-402a-4050-96b9-529034a5c0b1`
- Reader URL:
  - `https://books-staging.reader.pub/books/reader/?id=200083&source=manual&entry=catalog&reader=protected&protectedUx=old-shell&protectedArtifactSource=r2&protectedAllowAll=1`

## What Was Verified

- Protected job creation succeeded through the staging API
- DOCX upload succeeded
- Upload completion dispatch succeeded
- Job status advanced through:
  - `queued`
  - `validating_source`
  - `building_artifact`
  - `completed`
- Validation passed for the sample DOCX
- Protected artifact files were present on staging, including:
  - `manifest.json`
  - `glyphs/chunk-000001.glyphs.json`
  - `shapes/chunk-000001.shapes.json`

## Glyph Extraction Result

- The new artifact is not in the earlier all-bad state seen on `id=200082`
- `shapes/chunk-000001.shapes.json` reported:
  - `total=150`
  - `extracted=146`
  - `synthetic=4`
  - `placeholder=0`
- Shape entries showed real extracted outlines with Linux fallback font resolution, for example:
  - `fontSourceType=policy`
  - `fontSourceName=Arial`
  - `fontSourceRef=LiberationSans-Regular.ttf`
  - `extractionStatus=ok`

## Interpretation

- This is strong evidence that the Linux font fallback support is now working for new DOCX conversions
- The old broken staging artifact `200082` was very likely produced before the font fix and should still be considered stale evidence
- The fix affects future conversions or explicit rebuilds, not previously generated protected artifacts

## Environment Notes

- A local `wrangler` binary was added under `reader_render_v3` as a dev dependency so this worktree can authenticate and run Cloudflare-related commands without relying on transient `npx` cache state
- The user authenticated successfully with `wrangler whoami` during this session
- Do not record or reuse browser auth tokens in docs, commits, or logs

## Known Gaps

- I verified the generated protected artifact contents over HTTP, but did not perform visual browser confirmation of the final rendered page in this handoff
- The sample artifact still contains a small number of synthetic shapes, so the result is improved and materially correct, but not mathematically perfect for every glyph token

## Recommended Next Steps

- Open the staging reader URL for `id=200083` and confirm visually that the sample book renders real glyphs instead of black rectangles
- If visual output looks correct, use `200083` as the post-fix proof point
- If needed later, rebuild `200082` rather than trying to diagnose it as if it were generated under the current pipeline

## Additional Milestone: Persist Normalized EPUB

- The protected DOCX pipeline now preserves the generated normalized EPUB instead of discarding it after glyph conversion
- DOCX jobs upload the normalized EPUB to:
  - `generated/protected-jobs/<jobId>/normalized.epub`
- The Actions runner now includes normalized EPUB metadata in job progress and finalization payloads
- The Worker now:
  - merges `result_payload` updates instead of overwriting them
  - exposes `normalized_epub` metadata on completed DOCX jobs
  - serves `GET /books/api/v1/protected-jobs/<jobId>/normalized-epub`
  - requires the requester to be either:
    - the user who created the job, or
    - an active tenant member with one of: `owner`, `admin`, `publisher`, `editor`

## Verification For EPUB Persistence

- Added unit coverage for:
  - completed DOCX job status exposing normalized EPUB metadata
  - authorized normalized EPUB download for a tenant member
- Verified with:
  - `node --test tests\unit\worker-protected-jobs.unit.test.mjs`
- Result:
  - `6` tests passed
  - `0` failed

## Additional Milestone: Staging Push And Deploy

- Pushed `codex/protected-publish-jobs` to `origin/codex/protected-publish-jobs`
- Deployed staging Pages project:
  - project: `readerpub-books-staging`
  - Pages branch: `develop`
  - deployed commit: `f9f542df8040d02e9ce7804b89a787a442f7d29e`
  - preview URL: `https://bd0ec7df.readerpub-books-staging.pages.dev`
- During deployment work, the repo deploy helpers were corrected to:
  - use LF line endings so `bash` can execute them on Windows-hosted repos
  - include `api/` in the Pages bundle because `_worker.js` imports `api/protected-publishing/*`
  - exclude `reader_render_v3/node_modules` and `reader_render_v3/artifacts` from the Pages bundle
    - `node_modules` contained platform-specific reparse points
    - `artifacts` contained generated files larger than the Pages 25 MiB per-file limit
  - record branch/commit using `git -c safe.directory=...`

## Live Verification After Deploy

- Fresh staging DOCX run after deploy:
  - `jobId=b04243e9-18be-4e7d-b672-78947c07f6f9`
  - `contentId=200088`
  - status: `completed`
  - validation: `passed`
- The completed job now returned:
  - `normalized_epub.available=true`
  - `download_url=/books/api/v1/protected-jobs/b04243e9-18be-4e7d-b672-78947c07f6f9/normalized-epub`
- Verified normalized EPUB download:
  - HTTP `200`
  - `Content-Type: application/epub+zip`
  - `Content-Disposition: attachment; filename="normalized.epub"`
  - downloaded bytes: `2325119`
  - file signature bytes: `80 75 3 4` (`PK..`, valid ZIP/EPUB header)
- Verified protected glyph output remained healthy after deploy:
  - shapes summary for `200088`:
    - `total=150`
    - `extracted=146`
    - `synthetic=4`
    - `placeholder=0`
- Reader URL for the post-deploy proof point:
  - `https://books-staging.reader.pub/books/reader/?id=200088&source=manual&entry=catalog&reader=protected&protectedUx=old-shell&protectedArtifactSource=r2&protectedAllowAll=1`

## Additional Milestone: Protected Image Preservation

- Problem observed after EPUB-return rollout:
  - normalized EPUB looked correct
  - protected reader output was missing inline images
- Root cause:
  - protected ingestion extracted only text-bearing blocks
  - image-only paragraphs were dropped before chunking
  - protected runtime layout/render path was also text-only
- Implemented fix:
  - preserve inline image-only blocks during protected extraction
  - assign image asset paths and copy referenced image files into protected artifact `assets/`
  - carry image block metadata into runtime chunk JSON
  - lay out image blocks in protected runtime
  - render image blocks on the protected canvas
- Added regression coverage:
  - `tests/unit/protected-ingestion-images.unit.test.mjs`
- Verified locally with:
  - `node --test tests\unit\protected-ingestion-images.unit.test.mjs tests\unit\worker-protected-jobs.unit.test.mjs`
  - result: `7` passed, `0` failed

## Live Verification After Image Fix

- Pushed image-preservation commit to `origin/codex/protected-publish-jobs`
- Deployed updated staging preview:
  - `https://8ec4e569.readerpub-books-staging.pages.dev`
- Fresh staging DOCX run after image fix:
  - `jobId=59a6a243-ff90-4e25-bb6c-f80209142657`
  - `contentId=200090`
  - status: `completed`
  - validation: `passed`
- Protected artifact verification:
  - `chunk-000001.json` now contains `2` image blocks
  - first image block points to:
    - `assets/image-18306f7acb079825.jpg`
    - alt text: `Golden Gate Bridge in fog`
  - live asset probe succeeded:
    - `https://books-staging.reader.pub/books/protected-content/200090/assets/image-18306f7acb079825.jpg`
    - HTTP `200`
    - `Content-Type: image/jpeg`
- Reader proof URL:
  - `https://books-staging.reader.pub/books/reader/?id=200090&source=manual&entry=catalog&reader=protected&protectedUx=old-shell&protectedArtifactSource=r2&protectedAllowAll=1`
- Glyph extraction remained healthy on the same run:
  - `total=150`
  - `extracted=146`
  - `synthetic=4`
  - `placeholder=0`

## Additional Milestone: Old-Shell First Paint Cleanup

- Problem observed after the image-preservation and sizing fixes:
  - protected books opened correctly in the old shell
  - users briefly saw the standalone `reader_render_v3` integration UI before the embedded shell finished booting
- Root cause:
  - `protected-reader.html` rendered its standalone sidebar/debug chrome on first paint
  - the embedded `old-shell` mode was only applied later, after module bootstrap ran
- Implemented fix:
  - detect `embedded=old-shell` in the document head before CSS paint
  - set the shell mode on the root element immediately
  - expand embedded-mode CSS selectors so the standalone chrome is suppressed from the first paint instead of after hydration
- Commit:
  - `7f75afed9a368948d6a5423fb520117316e1afb5`
- Remote:
  - pushed to `origin/codex/protected-publish-jobs`
- Staging deploy:
  - custom URL: `https://books-staging.reader.pub/books/`
  - preview URL: `https://932f2e6e.readerpub-books-staging.pages.dev`
- Verification target:
  - re-open the protected reader URL for `contentId=200091` and confirm the standalone test interface no longer flashes before the old shell appears

## Additional Milestone: Manual Local DOCX Debug Flow

- Added a repo doc for running a fully local:
  - `docx -> epub -> protected artifact -> local protected reader`
- New doc:
  - `docs/local-docx-to-protected-reader.md`

## Additional Milestone: Unprotected Reader Stabilization

- Branch used for this session:
  - `develop-anatoly`
- Local catalog server:
  - `http://127.0.0.1:8788/books/`
- Working unprotected reader route:
  - `/books/reader/`
  - served runtime: `reader1`
- Implemented fixes in the unprotected reader:
  - closing side panels in mobile landscape no longer immediately re-shows top/bottom bars
  - text selection color now matches the protected reader
  - search highlight color now matches the protected reader
  - desktop vertical text fields account for overlay bars without changing bar overlay behavior
  - search navigation now keeps the active highlighted match visible in paginated/two-column layouts
- Verification performed locally:
  - `node --check reader/js/fbreader-ui.js reader1/js/fbreader-ui.js reader/js/reader.js reader1/js/reader.js`
  - Playwright smoke tests against `http://127.0.0.1:8788/books/reader/`
  - search smoke on `id=1399`, query `single`, with visible highlights across repeated Next navigation
- Note:
  - Future unprotected-reader work should target the active `reader1` runtime unless explicitly requested otherwise.
- The documented flow covers:
  - DOCX validation
  - local DOCX to EPUB conversion
  - local EPUB to protected artifact conversion
  - local HTTP serving on `127.0.0.1:8788`
  - opening both the dev protected reader and old-shell protected reader locally

## Additional Milestone: Local Flow Doc Correction

- Corrected the local DOCX debug doc so it now matches the working localhost flow:
  - write the generated EPUB under `.tmp_local\`
  - build the protected artifact under numeric id `29686`
  - use the direct dev artifact URL for `protected-reader.html`
  - use the localhost old-shell URL with:
    - `reader=protected`
    - `protectedUx=old-shell`
    - `protectedAllowAll=1`
- Added notes explaining:
  - why the EPUB must not be placed under the protected output directory
  - why localhost old-shell expects a numeric id

## Additional Milestone: Publisher DOCX Plus Cover Plan

- Added a planning doc for the next publisher UX/backend change:
  - `docs/publisher-upload-docx-cover-plan.md`
- The plan defines a single upload flow for:
  - EPUB uploads
  - DOCX uploads with a required cover image
- It also records the required API, Worker, GitHub Actions, and DOCX-to-EPUB builder changes needed to make `docx + cover` behave as one logical protected publishing upload

## Additional Milestone: Publisher DOCX Plus Cover Implementation

- Implemented the first working pass of the publisher upload flow for:
  - EPUB uploads
  - DOCX uploads with a required cover image
- Upload modal changes:
  - `Publishing Source` label replaces `Publishing Destination`
  - single-choice publisher source now renders as a read-only input instead of a selectable dropdown
  - `Protect Content` is now a checkbox and defaults to enabled
  - `Visibility` is now a radio group with:
    - `Public`
    - `Member Only`
  - added `File Type` selector:
    - `EPUB`
    - `DOC`
  - moved the existing metadata fields into the upload modal
  - added `Cover Page` upload, required for DOC uploads
  - upload now switches into a dedicated progress state after manuscript selection
- Worker/API changes:
  - protected job creation now accepts `cover_filename` for DOCX jobs
  - DOCX jobs now return upload targets for both:
    - source manuscript
    - cover image
  - added authenticated cover upload endpoint:
    - `PUT /books/api/v1/protected-jobs/<jobId>/cover`
  - `upload-complete` now rejects DOCX jobs if the required cover upload is missing
  - GitHub dispatch payload now includes DOCX cover metadata
- Pipeline changes:
  - GitHub Actions workflow accepts cover-related inputs
  - the protected job runner downloads the DOCX cover image before normalization
  - `tools/publish/build_epub_from_docx.py` now supports:
    - `--cover-image`
  - DOCX normalization now passes the uploaded cover into Pandoc with:
    - `--epub-cover-image`
- Verification:
  - ran:
    - `node --test tests\unit\worker-protected-jobs.unit.test.mjs`
  - result:
    - `9` tests passed
    - `0` failed
- Current limitation:
  - this checkpoint verifies the Worker/API/runner contract and unit coverage
  - the updated upload GUI still needs a live browser pass on staging before it should be treated as fully validated for release

## Additional Milestone: Windows Staging Deploy Runbook

- Added a Windows-specific deployment runbook:
  - `docs/windows-staging-deploy.md`
- It records the deployment failure modes we hit:
  - `npx wrangler` not found under the bash staging script
  - `wrangler.cmd` not runnable from bash
  - POSIX `wrangler` failing because installed `workerd` was Windows-only
  - `Copy-Item -Recurse` failing on repo reparse-point content
  - mixed bash-path and PowerShell-path bundle handling causing `ENOENT`
- It also documents the working solution:
  - build the Pages bundle on Windows
  - use `robocopy`
  - exclude `reader_render_v3/node_modules` and `reader_render_v3/artifacts`
  - deploy with the local Windows `wrangler.cmd`
  - record the deployment afterward

## Additional Milestone: Protected Publish Post-Success Redirect And Cover Promotion

- Found two staging UX/content issues after the first DOCX plus cover GUI run:
  - successful protected uploads reopened `Book Details` even when the book was already published
  - the uploaded DOCX cover image did not become the book's published `cover_url`, so the title appeared in `My Publications` without a cover
- Implemented fixes:
  - successful protected upload polling now:
    - reloads the list
    - returns the user to `My Publications`
    - shows a success message instead of opening `Book Details`
  - protected finalize now copies the uploaded DOCX cover image into:
    - `content/<contentId>/cover/<filename>`
  - the published book row now receives:
    - `cover_url=/books/content/<contentId>/cover/<filename>`
- Added unit coverage:
  - finalize promotes the uploaded DOCX cover into the published book `cover_url`
- Verified with:
  - `node --test tests\unit\worker-protected-jobs.unit.test.mjs`
  - result:
    - `10` tests passed
    - `0` failed

## Additional Milestone: Catalog Author Letter Browse Hardening

- New staging issue reported after the publisher-flow work:
  - author browse on the public catalog failed after clicking a letter
  - the UI briefly showed `Loading prefixes...` and then produced no usable result
- Root cause:
  - the live letter node payload at `/books/api/p/<letter>.json` was returning a flattened prefix tree
  - example:
    - `/books/api/p/a.json` included deep prefixes such as `aab`, `abbot`, `admin`, not just the immediate next-step prefixes under `a`
  - the browser browse flow expects immediate child prefixes for the letter step
  - that mismatch caused the browse path to do unnecessary deep-node work and behave unreliably
- Implemented fix:
  - collapse flattened letter-prefix payloads to immediate children before caching/rendering
  - for example:
    - `a` now keeps only `aa`, `ab`, `ac`, ...
  - if no immediate children exist, the old fallback behavior is preserved
- Verification:
  - verified the live staging payload shape with:
    - `curl https://books-staging.reader.pub/books/api/p/a.json`
  - confirmed the fix is defensive client-side hardening for that payload shape
  - no dedicated automated test currently exists for this browser-only catalog flow

## Additional Milestone: Catalog Prefix View DOM Fix

- Follow-up issue after deploying the letter-prefix hardening:
  - clicking an author letter now changed the hash to `view=prefixes`
  - but the page rendered a blank prefix view with no loading message, no prefixes, and no authors
- Root cause:
  - `renderPrefixes()` and `renderAuthors()` cleared `els.content`
  - `#browseContent` lives inside that content container
  - clearing the parent detached `#browseContent` from the DOM and then the code appended new nodes into the detached element
  - the issue was amplified by the existing browse-shell movement:
    - landing mode moves `#browseHeader` into the landing content wrapper
    - `showLoading()` then clears `els.content`
    - that detaches the moved browse shell before prefix/author rendering runs
  - result:
    - the API requests succeeded
    - the view state changed
    - but the rendered browse content was invisible because it was no longer attached to the page
- Implemented fix:
  - stop clearing `els.content` inside:
    - `renderPrefixes()`
    - `renderAuthors()`
  - restore the browse header to its default mount before rendering:
    - `renderPrefixes()`
    - `renderAuthors()`
  - keep clearing only `els.browseContent`
- Verification:
  - reproduced the bug with a temporary Playwright probe against staging
  - confirmed:
    - letter click updated the URL to `#view=prefixes&letter=A...`
    - `/books/api/lang/en/p/a.json` and child prefix-node fetches returned `200`
    - DOM remained blank because `#browseContent` had been detached
  - staging redeploy and post-fix live probe still pending at the time of this note

## Additional Milestone: Publisher Upload Submit And Progress UX

- Updated the publisher upload flow so selecting a manuscript no longer starts processing immediately
- Added a selected-file summary and explicit `Submit` button to the upload form
- Reworked the progress panel to show:
  - a spinner
  - a persistent note that the process may take a few minutes and the page can be left safely
  - a two-column stage grid with:
    - current stage highlighted
    - completed stages checkmarked
    - future stages greyed out
- Added stage rendering for both:
  - protected uploads
  - legacy EPUB uploads
- Changed the Publishing list behavior:
  - clicking a published book now opens the reader
  - non-published books still open `Book Details`
- Verification:
  - code-level diff and `git diff --check`
  - no browser validation yet at the time of this note

## Additional Milestone: Test Cleanup Patch Integration

- Integrated the externally reviewed test-cleanup patch, with one adjustment:
  - accepted the `_worker.js` reader-asset rewrite/header preservation changes
  - accepted the portable repo-root helper and test fixture updates
  - replaced the proposed hardcoded `python3` npm test script with a cross-platform runner
- Test updates included:
  - new portable helper:
    - `tests/unit/helpers/repo-root.mjs`
  - removed hardcoded machine-specific repo paths from unit tests
  - updated stale assertions for:
    - catalog My Books cover hydration
    - TTS resume/search CSS expectations
    - translate worker tests
  - updated the reader1 metadata fixture to use:
    - `META-INF/container.xml`
    - `OPS/content.opf`
  - normalized Windows path separators in the reader1 cover assertion
- Runner changes:
  - `npm test` now runs a real cross-platform suite:
    - Node integration/unit tests
    - Python `tests/unit/test_validate_docx.py`
  - Python execution now:
    - resolves interpreter portably
    - sets `PYTHONPATH` to the repo root
    - does not require `pytest`
  - `npm run test:all` includes the currently unrelated `publisher-tasks` unit suite
  - default `npm test` excludes that suite because it already contains pre-existing failures unrelated to this patch
- Verification:
  - `npm.cmd test`
  - result:
    - `99` JS tests passed
    - `3` Python unittest cases passed

## Additional Milestone: Deployment Log Sync And Worktree Cleanup

- Confirmed `deployments/history.jsonl` contains the latest local staging deploy records through:
  - `2026-04-13T19:49:29.078Z`
  - commit `f1d66dcffa178844381f818e266f222689a0ca8d`
  - preview `https://82d65372.readerpub-books-staging.pages.dev`
- Cleaned local worktree junk left by prior failed or partial deploy attempts:
  - removed the malformed `C\...` directory tree created from a broken Windows path
  - removed remaining `.tmp_staging_deploy_*` directories
  - removed `.tmp_local` and `.tmp_staging_probe_robo`
- Left unrelated untracked planning docs alone

## Additional Milestone: Minimal KDP-Style Publisher Workflow Reframe

- Reframed the publisher UI in `books/publish/index.html` without changing the backend contract or core data model
- List view changes:
  - `Publishing Books` -> `Bookshelf`
  - `+ Upload Book` -> `+ Create New Title`
  - intro and empty-state copy now describe drafts, review, pricing, and publish flow
- Upload view changes:
  - `Upload Book` -> `Create New Title`
  - grouped existing fields into:
    - `Book Content`
    - `Book Details`
    - `Publishing Rights`
  - `Submit` -> `Upload and Continue`
  - added a lightweight 4-step indicator:
    - `Content`
    - `Details`
    - `Pricing`
    - `Publish`
- Edit view changes:
  - `Book Details` -> `Review and Publish`
  - grouped existing controls into:
    - `Book Details`
    - `Rights & Pricing`
    - `Publish`
  - reused the same simple 4-step indicator
- Upload progress changes:
  - kept the existing stage/status logic
  - relabeled visible stages to publishing-oriented checkpoints such as:
    - `Upload Manuscript`
    - `Prepare Draft`
    - `Validate Files`
    - `Convert Book`
    - `Build Reader Format`
    - `Ready for Review`
- Protected job completion change:
  - successful protected conversion now opens the existing editor path for the book
  - success message now tells the user:
    - `Your manuscript is ready. Review details, pricing, and publish.`
- Intentionally left unchanged:
  - backend contracts
  - publish gating logic except for preserving current behavior in the reframed UI
  - reader/reader1
  - pricing/offer data model

## Additional Milestone: Staging Deployment For Bookshelf Workflow

- Deployed the Bookshelf workflow reframe to staging from:
  - branch `codex/protected-publish-jobs`
  - commit `8ee3babaa15b5480da12649036505b4d073c2251`
- Staging URLs:
  - custom URL: `https://books-staging.reader.pub/books/`
  - preview URL: `https://6ddd66fe.readerpub-books-staging.pages.dev`
- Recorded the deployment in:
  - `deployments/history.jsonl`
- Cleaned the temporary deploy bundle directory after successful upload

## Additional Milestone: Bookshelf Resumable Workflow Stages

- Enhanced the Bookshelf list in `books/publish/index.html` so each title shows a lightweight user-facing workflow stage using existing fields only
- Added derived stage logic without backend/schema changes
- Bookshelf cards now show:
  - a stage badge
  - a short status line
  - an implied next action label such as:
    - `Continue Setup`
    - `Review Pricing`
    - `Publish`
    - `Open`
- Stage derivation is conservative and based on current list payload fields such as:
  - `status`
  - metadata completeness (`title`, `author`, `genre_id`, `annotation`)
  - content/upload presence (`content_id`, source asset/path/url)
  - pricing indicators when present (`offers`, `offer_count`, `active_offer_count`, `pricing_ready`)
- Intentionally left unchanged:
  - click behavior for list items
  - backend/API contracts
  - extra fetches for offer state resolution

## Additional Milestone: Staging Deployment For Bookshelf Stage Enhancements

- Deployed the Bookshelf stage enhancement to staging from:
  - branch `codex/protected-publish-jobs`
  - commit `2fa6e0303d166e56d990e201a95eb1ad0707fd1f`
- Staging URLs:
  - custom URL: `https://books-staging.reader.pub/books/`
  - preview URL: `https://a66d774b.readerpub-books-staging.pages.dev`
- Recorded the deployment in:
  - `deployments/history.jsonl`
- Cleaned the temporary deploy bundle directory after successful upload

## Additional Milestone: Self-Publisher Workflow Wording Polish

- Performed a narrow wording-only polish pass in `books/publish/index.html`
- Tightened the Bookshelf and draft/review language so manuscript processing no longer implies immediate publication
- Updated:
  - progress panel title and progress text
  - protected helper text
  - stage labels for protected and legacy flows
  - protected processing completion and pending messages
  - direct publish success message
  - several Bookshelf card detail lines
- Intentionally left unchanged:
  - backend/API wording outside this file
  - publish gating logic
  - click behavior
  - reader/reader1

## Additional Milestone: Staging Deployment For Workflow Wording Polish

- Deployed the self-publisher workflow wording polish to staging from:
  - branch `codex/protected-publish-jobs`
  - commit `24cd908e8c1c9d232eddeabaea51cd6778bd8d78`
- Staging URLs:
  - custom URL: `https://books-staging.reader.pub/books/`
  - preview URL: `https://75a1a891.readerpub-books-staging.pages.dev`
- Recorded the deployment in:
  - `deployments/history.jsonl`
- Cleaned the temporary deploy bundle directory after successful upload

## Short Handoff Summary

The protected DOCX staging pipeline was run end to end for `sample.docx`, producing `contentId=200083`. The job completed successfully and the protected artifact inspection showed `146` extracted shapes, `4` synthetic shapes, and `0` placeholders, with Linux fallback font mapping resolving Arial to `LiberationSans-Regular.ttf`. That is the strongest confirmation so far that the font fix is working for new conversions.

## Current Refactor State

- Date: `2026-04-19`
- Worktree path: `C:\Users\yaran\Test1\pages_books\.worktrees\merge-reader-render-v3-staging-trim`
- Current branch: `refactor/module-boundaries-v1`
- Current HEAD: `d4f2853e92c89917f0cf259399bb7803e8cbdfd9`
- Worktree status at handoff update:
  - clean
  - no uncommitted tracked or untracked changes

## Current Goal

- Continue the modular-monolith refactor without changing external behavior
- Establish clearer internal boundaries for:
  - catalog
  - publishing
  - reader
  - permissions
  - entitlements
  - commerce

## Completed Refactor Phases In This Branch

### Phase 1: Route-Domain Extraction

- `_worker.js` remains the routing shell
- Extracted route handlers under `api/`:
  - `api/catalog/handlers.mjs`
  - `api/publishing/handlers.mjs`
  - `api/identity/handlers.mjs`
  - `api/commerce/handlers.mjs`
  - `api/reader-access/handlers.mjs`
- Added small shared worker/context helpers:
  - `api/shared/worker-helpers.mjs`
  - `api/shared/context.mjs`

### Phase 2: Catalog vs Publishing Separation

- Introduced catalog projection/writer helpers:
  - `api/catalog/book-record.mjs`
- Introduced publishing pipeline projection/writer helpers:
  - `api/publishing/pipeline-record.mjs`
- Publishing and protected-publishing handlers now separate:
  - catalog metadata ownership
  - publishing pipeline/job/artifact state
- Existing API responses still preserve the legacy top-level fields
- Added nested snapshots for internal/domain clarity:
  - `catalog`
  - `publishing`

### Phase 3: Reader Service Boundary

- Added:
  - `api/reader/service.mjs`
  - `api/reader/handlers.mjs`
- Reader-facing API entry points now sit behind a reader service boundary for:
  - reader session/init payloads
  - reader package/location loading
  - note CRUD
  - note package create/read/list/delete
- `api/reader-access/handlers.mjs` delegates access/location loading to the reader service

### Phase 4: Initial Permissions Boundary

- Added:
  - `api/permissions/vocabulary.mjs`
  - `api/permissions/policy.mjs`
- Introduced central policy entry point:
  - `can(actorContext, permissionKey, resourceContext)`
- Initial vocabulary:
  - `title.view`
  - `title.edit_metadata`
  - `title.publish`
  - `artifact.reprocess`
  - `reader.access`
  - `offer.manage`
  - `tenant.manage_members`
  - `platform.manage_superusers`
- Wrapped high-value existing checks in context/protected publishing through the policy layer

### Phase 5: Incremental Policy Adoption

- Replaced a targeted set of direct checks with `can(...)` in:
  - `api/publishing/handlers.mjs`
  - `api/protected-publishing/handlers.mjs`
  - `api/identity/handlers.mjs`
- High-value policy-backed checks now include:
  - title view/edit ownership checks for publish drafts
  - title publish ownership + tenant-match checks
  - tenant member-management checks
  - protected publishing job access checks

### Phase 6: Reader Entitlements Boundary

- Added:
  - `api/entitlements/service.mjs`
- Reader-consumption access is now structurally separated from staff/admin permissions
- The entitlement service now owns:
  - tenant membership reader grants
  - publisher reader grants
  - purchase/rental grant resolution
  - active offer lookup for reader access
  - content-consumption access resolution
- Reader and commerce paths now consume that service rather than duplicating inline access logic

### Phase 7: Commerce Boundary Tightening

- Added:
  - `api/commerce/service.mjs`
- `api/commerce/handlers.mjs` is now a thin route adapter for commerce operations
- Commerce service now owns:
  - `GET /me/entitlements`
  - `GET /books/:id/offers`
  - offer create validation and payload shaping
  - offer update validation and patch shaping
  - commerce-facing entitlement view delegation
- Offer-management authorization now flows through:
  - `PERMISSIONS.offerManage`

## Files Introduced During Refactor Stream

- `api/shared/worker-helpers.mjs`
- `api/shared/context.mjs`
- `api/catalog/handlers.mjs`
- `api/catalog/book-record.mjs`
- `api/publishing/handlers.mjs`
- `api/publishing/pipeline-record.mjs`
- `api/identity/handlers.mjs`
- `api/commerce/handlers.mjs`
- `api/commerce/service.mjs`
- `api/reader-access/handlers.mjs`
- `api/reader/service.mjs`
- `api/reader/handlers.mjs`
- `api/permissions/vocabulary.mjs`
- `api/permissions/policy.mjs`
- `api/entitlements/service.mjs`

## Verification

- Latest verification command:
  - `npm.cmd test`
- Latest result:
  - `99` JS tests passed
  - `3` Python tests passed
- No deploy was performed for the refactor phases in this branch

## What Is Intentionally Deferred

- removing the legacy inline fallback copies that still remain in `_worker.js`
- full migration of all remaining authorization checks to `can(...)`
- full migration of all reader-consumption paths to the entitlement service outside the extracted main paths
- full cleanup of duplicated legacy commerce/access code still present in `_worker.js`
- any broad integrations abstraction
- reader/reader1/reader_render_v3 unification
- schema changes or backend contract changes

## Most Important Remaining Mixed Areas

- `_worker.js` still contains legacy inline route logic and duplicated pre-extraction code paths
- some direct ownership/management checks still exist outside the targeted migrated files
- note-share public routes remain inline rather than behind the reader boundary
- protected-content direct delivery in `_worker.js` still uses the legacy route shell and old access flow around it
- commerce and entitlement persistence still use the existing storage model rather than an explicit event boundary

## Recommended Next Step

- Phase 8 should thin `_worker.js` further by removing redundant legacy inline logic for already-extracted route families, but only where route precedence and behavior can be preserved exactly
- If the next priority is resilience rather than more refactor work:
  - keep updating this handoff after each milestone
  - commit and push immediately after each meaningful phase

## 2026-04-27 Reader1 Selection Share Link

- Updated unprotected `reader1` selection toolbar share action to include both selected text and a stable link to the selected CFI.
- Shared links now carry `selectionCfi` plus the CFI hash; opening the link navigates to that location and retries the iframe highlight until the content is ready.
- Desktop selection toolbar now shows Share second from the right; it copies the selection link to clipboard and shows a fading `Link copied` toast, while Copy shows `Text copied`.
- Cold opens from a selection link now pass `selectionCfi` into the normal reader startup CFI instead of issuing late UI-layer `rendition.display(...)` calls.
- Incoming selection handling only retries iframe highlighting after `book.ready` / first `reader.displayed`, so it does not trap normal page navigation.
- Reader relocation now follows the production-style position model again: it saves `readerpub:lastcfi:<id>` in localStorage and does not live-sync ordinary reading position into the URL hash.
- Swipe/tap and desktop next/prev no longer pre-commit neighbor CFI into the URL; one-shot share/deep-link CFI is only used as startup input.
- Startup now decodes percent-encoded CFI hashes before passing them to epub.js, avoiding reload fallback to the beginning when the browser encodes hash characters.
- Startup passes explicit CFI into `opts.previousLocationCfi`, then ordinary reading position is restored from localStorage on later reloads.
- Incoming share/deep-link URLs are cleaned after the first confirmed relocation by removing `selectionCfi`, `selectionText`, and the CFI hash, leaving subsequent reloads to restore from saved reading position.
- Initial cold render no longer overwrites the saved reading CFI before the first user interaction; this prevents refresh immediately after opening a private window from moving to a nearby spread/page.
- Desktop page-turn arrow/tap zones no longer derive their width from transient text bounds; they use stable edge widths so the hit areas cannot jump or collapse to `0px` while paging.
- Reader selection links now get server-rendered OG/Twitter preview metadata with ReaderPub, book title, author, cover image, and selected quote when the URL includes `selectionText`.
- Reader selection OG/Twitter metadata now applies to the actual `/reader1/` share URLs used on staging, not only to `/books/reader/` aliases.
- Reader selection share now creates short `/s/<id>` URLs through the Worker, stores the selection payload in R2, serves OG/Twitter preview metadata from the short URL, and redirects opens back to `/reader1/` with `selectionCfi`/`selectionText`.
- Mobile selection share keeps `navigator.share()` inside the tap gesture by prewarming short URLs before the Share button is pressed; this avoids losing Web Share API user activation.
- Mobile selection Share is now gated until the short `/s/<id>` URL is ready, so system share never falls back to sending the long selection URL.
- Short-link prewarm now retries while selection CFI/API creation is not ready and falls back to current reader CFI plus `selectionText`, preventing the mobile Share button from staying inactive.
- Selection short-link creation now uses a toolbar-local book id helper, preserves prepared links across unchanged selection updates, and exposes `window.__readerpubSelectionShareDebug` for staging/mobile diagnostics.
- Selection links also include a short `selectionText` fallback so mobile-generated links can highlight by text when the CFI navigates correctly but resolves to a non-visible range.
- `#reader1ViewStore` is explicitly hidden in CSS to avoid exposing the notes/view storage container during reload FOUC.
- Added inline mark styling and bumped the `fbreader-ui.js` cache key in `reader1/index.html`.
- Verification:
  - `node --check reader1/js/fbreader-ui.js` passed.
  - `npm test` was attempted earlier in the session and still failed on pre-existing unrelated worker/catalog/protected route expectations.

## 2026-04-27 Protected Selection Short Share

- Added protected-reader support to selection short links without changing the existing unprotected `reader1` payload shape.
- `/books/api/ss` now accepts `readerType: "protected"` with a protected range anchor, selected quote, route book id, artifact book id, protected UX, render mode, metrics mode, and artifact source.
- `/s/<id>` now redirects protected shares to `/books/protected/` with `protectedSelectionAnchor` and `selectionText`, while preserving OG/Twitter preview metadata through the existing catalog resolver.
- Protected short-link payloads preserve the staging rollout hint `protectedAllowAll=1` when it exists on the active protected route, so `/s/<id>` opens the same protected reader path instead of falling back to unavailable.
- Protected OG metadata resolver falls back from protected wrapper ids like `90025344` to public catalog ids like `25344` for title, author, and cover lookup.
- Follow-up fix: desktop protected selection toolbar now shows Share by removing the old desktop CSS hide rule, and mobile protected Share now calls `navigator.share({ url })` immediately from the tap handler using the prewarmed short URL instead of awaiting bridge capture first.
- Updated the active protected reader path (`reader/reader_new_v5.html` -> `reader_render_v5/reader_new/protected-host-ui.js` -> `reader_render_v5/dev/protected-reader.js`), not the old v3 path.
- Protected selection toolbar Share now prewarms `/s/<id>` links, copies only the short link on desktop, uses `navigator.share({ url })` on mobile only when the short link is ready, and leaves Copy as text-only.
- Added protected `window.__readerpubSelectionShareDebug.status()` with `shareUrl`, `pending`, endpoint/status/error, payload, last copied value, and last toolbar action.
- Protected shared opens create a transient highlight annotation from the incoming protected range and focus it without persisting it into the user's annotation store.
- Local preview server `tools/dev/local_preview_server.mjs` now mirrors protected selection short-link create/read behavior for local validation.
- Verification:
  - `node --test --test-name-pattern "selection share|protected selection share|reader1 selection" tests/integration/worker.integration.test.mjs` passed.
  - `node --check` passed for `_worker.js`, `tools/dev/local_preview_server.mjs`, `reader_render_v5/dev/protected-reader-host-bridge.js`, `reader_render_v5/dev/protected-reader.js`, and `reader_render_v5/reader_new/protected-host-ui.js`.
  - Local preview on `http://127.0.0.1:8788` created a protected `/s/<id>` and opened it into `reader_new_v5` with `focusedAnnotationId: "shared_selection_highlight"` and `focusHighlightCount: 1`.
  - Full `node --test tests/integration/worker.integration.test.mjs` still has two pre-existing unrelated failures around `/books/reader/` rewrite and PostHog meta expectations.

## 2026-04-29 Protected Selection Restore Follow-Up

- Fixed protected `/s/<id>` opens that could land at the book start or saved reading position instead of the selected quote.
- Root cause: the host could call `restoreSharedSelection()` as soon as the first protected snapshot was ready, then the runtime finalization path applied persisted/default reading state afterward and skipped reapplying the incoming share because `sharedSelectionApplied` was already true.
- The protected runtime now resets the incoming shared-selection application flag after the final artifact-load snapshot and before `applyIncomingProtectedSelectionIfAvailable()`, so URL-provided `protectedSelectionAnchor` wins over default/local reading restore.
- Bumped protected reader module cache keys in `reader/reader_new_v5.html` and `reader_render_v5/reader_new/protected-host-ui.js`.
- Verification:
  - `node --check reader_render_v5/dev/protected-reader.js` passed.
  - `node --check reader_render_v5/reader_new/protected-host-ui.js` passed.
  - Local preview created `http://127.0.0.1:8788/s/KAcMTGu5J` for protected artifact `90055040`; opening it restored to page `15 / 26` instead of page `1 / 26`.
