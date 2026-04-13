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

## Short Handoff Summary

The protected DOCX staging pipeline was run end to end for `sample.docx`, producing `contentId=200083`. The job completed successfully and the protected artifact inspection showed `146` extracted shapes, `4` synthetic shapes, and `0` placeholders, with Linux fallback font mapping resolving Arial to `LiberationSans-Regular.ttf`. That is the strongest confirmation so far that the font fix is working for new conversions.
