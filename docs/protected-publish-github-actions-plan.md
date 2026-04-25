# Protected Publish Implementation Plan

This document defines the recommended implementation for publisher-uploaded protected EPUBs when the web app runs on Cloudflare and the protected glyph converter still requires Node.js.

The design goal is:

- clients upload EPUBs from arbitrary browsers
- the browser is not responsible for conversion
- Cloudflare stays the primary app runtime
- protected conversion runs only when needed
- catalog/index updates remain incremental and preserve existing visibility rules

## Decision Summary

Use these systems:

- Supabase: source of truth for books, source assets, tenants, entitlements, and protected publish jobs
- Cloudflare Worker / Pages Worker: API layer, auth checks, upload orchestration, job status, finalization, incremental catalog patching
- R2: source EPUB storage and protected artifact storage
- GitHub Actions: on-demand Node.js execution environment for the current protected converter

Do not use these as the primary v1 job store:

- Cloudflare D1
- Durable Objects

Reason:

- publishing already depends on Supabase book/tenant/access state
- D1 would introduce a second durable store for the same workflow
- Durable Objects are useful for live coordination, not as the durable relational source of truth for publishing jobs

## Why GitHub Actions

Protected conversion currently depends on Node-only tooling:

- `fs`
- `path`
- `os`
- `child_process`
- local temp directories
- local file inputs

That converter cannot run in the current Cloudflare Worker runtime without a substantial rewrite.

GitHub Actions is the recommended execution environment because:

- it runs only when a protected publish job exists
- it does not require a permanent VM
- it supports the current Node-based converter
- it avoids idle polling cost when using `repository_dispatch`

## End-to-End Flow

### Step 1: Browser creates the protected publish job

Browser sends metadata to the Worker:

- title
- author
- publication date
- optional tenant / organization
- visibility
- `reader_type = protected`

Worker:

- validates publishing rights
- creates or updates a draft `books` row
- allocates `content_id`
- creates a `publishing_jobs` row
- returns:
  - `jobId`
  - `sourceObjectKey`
  - direct-to-R2 upload instructions

### Step 2: Browser uploads EPUB directly to R2

Browser uploads the EPUB directly to the returned R2 target.

The Worker should not proxy the file bytes for this flow.

Recommended source object key:

- `uploads/protected/<jobId>/<filename>.epub`

### Step 3: Browser confirms upload completion

Browser calls:

- `POST /api/v1/protected-jobs/:id/upload-complete`

Worker:

- verifies that the R2 object exists
- marks job `uploaded`
- marks job `queued`
- marks the book `processing`
- triggers GitHub Actions via `repository_dispatch`

### Step 4: GitHub Action runs the converter

GitHub Actions:

- checks out the repo
- installs `reader_render_v3` dependencies
- downloads the source EPUB from R2
- updates job progress via Worker internal endpoint
- runs protected conversion
- uploads `protected-content/<contentId>/...` to R2
- calls Worker finalize endpoint

Recommended artifact prefix:

- `protected-content/<contentId>/...`

### Step 5: Worker finalizes publication

Worker:

- verifies protected artifact root exists in R2
- updates the book manifest:
  - `readerType = protected`
  - `protectedContentPath = /books/protected-content/<contentId>`
- marks the book `published`
- patches incremental catalog/book-location data
- marks job `completed`

### Step 6: Browser watches status

Browser polls:

- `GET /api/v1/protected-jobs/:id`

Polling cadence:

- every 2 to 3 seconds while the job is active

Closing the browser must not interrupt the job. The job is durable and independent of any client session.

## Data Model

Create a new Supabase table:

- `publishing_jobs`

Suggested columns:

- `id uuid primary key default gen_random_uuid()`
- `job_type text not null`
- `book_id uuid not null references books(id) on delete cascade`
- `content_id text not null`
- `reader_type text not null default 'protected'`
- `status text not null`
- `source_r2_key text not null`
- `protected_prefix text not null`
- `visibility text not null`
- `tenant_id uuid null references tenants(id)`
- `tenant_slug text null`
- `submitted_title text null`
- `submitted_author text null`
- `publication_date date null`
- `triggered_by_user_id uuid not null references auth.users(id)`
- `attempt_count integer not null default 0`
- `error_step text null`
- `error_message text null`
- `result_payload jsonb null`
- `started_at timestamptz null`
- `completed_at timestamptz null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Allowed status values:

- `awaiting_upload`
- `uploaded`
- `queued`
- `validating`
- `converting`
- `uploading_artifacts`
- `reindexing`
- `completed`
- `failed`

Recommended indexes:

- `(status, created_at)`
- `(book_id)`
- `(triggered_by_user_id, created_at desc)`

## API Contract

### Public Worker endpoints

#### `POST /api/v1/protected-jobs`

Purpose:

- create a new protected publishing job

Input:

```json
{
  "book_id": "optional-existing-draft-book-id",
  "title": "Book title",
  "author": "Author name",
  "publication_date": "2026-04-10",
  "visibility": "public",
  "tenant_id": "optional-tenant-uuid",
  "tenant_slug": "optional-tenant-slug",
  "reader_type": "protected",
  "filename": "example.epub"
}
```

Output:

```json
{
  "jobId": "uuid",
  "bookId": "uuid",
  "contentId": "200123",
  "status": "awaiting_upload",
  "sourceObjectKey": "uploads/protected/<jobId>/example.epub",
  "upload": {
    "method": "PUT",
    "url": "signed-or-authorized-r2-upload-url"
  }
}
```

#### `POST /api/v1/protected-jobs/:id/upload-complete`

Purpose:

- confirm that the browser upload finished

Behavior:

- verify the source R2 object exists
- transition:
  - `awaiting_upload -> uploaded -> queued`
- set related `books.status = processing`
- trigger GitHub Action via `repository_dispatch`

Output:

```json
{
  "id": "uuid",
  "status": "queued"
}
```

#### `GET /api/v1/protected-jobs/:id`

Purpose:

- read current job state for browser polling

Output:

```json
{
  "id": "uuid",
  "status": "converting",
  "message": "Generating protected glyph artifact",
  "updated_at": "2026-04-10T18:22:11Z",
  "error_step": null,
  "error_message": null,
  "result_payload": null
}
```

When complete:

```json
{
  "id": "uuid",
  "status": "completed",
  "message": "Protected book published",
  "updated_at": "2026-04-10T18:23:02Z",
  "error_step": null,
  "error_message": null,
  "result_payload": {
    "content_id": "200123",
    "protected_content_path": "/books/protected-content/200123",
    "reader_type": "protected"
  }
}
```

### Internal Worker endpoints

These endpoints must require a secret header:

- `x-reader-internal-key: <shared-secret>`

Do not expose them publicly.

#### `POST /api/v1/protected-jobs/:id/progress`

Purpose:

- update job progress from GitHub Actions

Input:

```json
{
  "status": "converting",
  "message": "Generating glyph artifact"
}
```

Optional fields:

- `error_step`
- `error_message`
- `result_payload`

#### `POST /api/v1/protected-jobs/:id/finalize`

Purpose:

- finalize a successful protected publish

Behavior:

- verify artifact root exists in R2
- publish the book
- patch incremental catalog shards
- mark job `completed`

#### `POST /api/v1/protected-jobs/:id/fail`

Purpose:

- mark the job failed

Input:

```json
{
  "error_step": "converting",
  "error_message": "Font extraction failed"
}
```

Behavior:

- mark job `failed`
- persist failure details
- optionally mark related book `failed`

## Indexing Model

For single-book GUI publishing, indexing should remain incremental.

Do not run full catalog rebuilds per uploaded protected book.

### What finalize should patch

Always patch:

- `api/book-locations.json`
- `api/book-locations/<source>/<shard>.json`

If `visibility = public`, also patch:

- author file
- search token files
- prefix tree files
- letters file

If `visibility = tenant_only`, skip public browse/search writes.

This preserves the current visibility model and keeps the job bounded.

## Browser Status Behavior

Use polling for v1.

Recommended polling loop:

- start after `upload-complete`
- call `GET /api/v1/protected-jobs/:id`
- interval: 2 to 3 seconds
- stop when status is:
  - `completed`
  - `failed`

The browser is not required to remain open while the job runs.

If the browser closes:

- the job continues
- the browser can resume polling later by reloading the job or book page

## GitHub Actions Workflow Design

Create:

- `.github/workflows/process-protected-job.yml`

Trigger:

- `repository_dispatch`

Dispatch type:

- `protected_publish_job`

Expected payload:

```json
{
  "event_type": "protected_publish_job",
  "client_payload": {
    "jobId": "uuid",
    "bookId": "uuid",
    "contentId": "200123",
    "sourceR2Key": "uploads/protected/<jobId>/example.epub",
    "protectedPrefix": "protected-content/200123"
  }
}
```

### Workflow steps

1. checkout repo
2. setup Node
3. install protected-reader dependencies:

```bash
npm --prefix reader_render_v3 install
```

4. call Worker progress endpoint:

- `validating`

5. download source EPUB from R2
6. call Worker progress endpoint:

- `converting`

7. run conversion:

```bash
npm --prefix reader_render_v3 run protected:build -- \
  --input <downloaded-epub> \
  --output <local-output-dir> \
  --book-id <contentId> \
  --upload \
  --bucket <bucket> \
  --wrangler-bin wrangler \
  --skip-rclone
```

8. call Worker progress endpoint:

- `uploading_artifacts`

9. call Worker progress endpoint:

- `reindexing`

10. call Worker finalize endpoint
11. on failure, call Worker fail endpoint

## Security Model

### General rules

- browser never receives internal secrets
- GitHub Actions should avoid direct Supabase writes if possible
- Worker remains the authority for publishing state and catalog writes
- GitHub Actions should talk to Worker internal endpoints, not mutate app state directly

### Worker secrets

Cloudflare Worker / Pages Worker should store:

- `GITHUB_REPO_DISPATCH_TOKEN`
- `PROTECTED_JOB_CALLBACK_SECRET`
- existing Supabase secrets
- existing R2 bindings

### GitHub repository secrets

Store these in GitHub Actions secrets or environment secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `READER_API_BASE`
- `PROTECTED_JOB_CALLBACK_SECRET`
- optional:
  - `R2_BUCKET_NAME`

### Scope and access

- do not run secret-bearing workflows on untrusted fork PRs
- restrict write/admin repo access tightly
- anyone who can modify workflows on the default branch is privileged
- use the narrowest Cloudflare token possible

### Callback authentication

All internal job endpoints must require:

- `x-reader-internal-key`

This value should be the shared secret between GitHub Actions and the Worker.

## Cost Model

Protected publishing is infrequent, so use event-driven GitHub Actions.

Do not use scheduled polling workflows for the main path, because idle schedule runs consume GitHub minutes even when there are no jobs.

Use:

- `repository_dispatch`

That means:

- GitHub runners start only when a real protected publish job exists
- no idle Actions waste

Main cost drivers:

- GitHub runner minutes
- R2 operations
- protected artifact storage volume

Based on local testing, conversion time itself may be short, but artifact upload/storage can be much larger than the source EPUB.

## Cloudflare Setup Checklist

### Required actions in Cloudflare

1. Confirm the Worker project has access to the correct R2 bucket.
2. Add Worker secrets:
   - `GITHUB_REPO_DISPATCH_TOKEN`
   - `PROTECTED_JOB_CALLBACK_SECRET`
3. Confirm existing secrets remain available:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Decide and keep stable R2 key layout:
   - source uploads:
     - `uploads/protected/<jobId>/<filename>.epub`
   - protected output:
     - `protected-content/<contentId>/...`
5. Configure the Worker with GitHub repo coordinates:
   - owner
   - repo
6. For staging and production, use separate secrets where appropriate.

## GitHub Setup Checklist

### Required actions in GitHub

1. Add repository or environment secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `READER_API_BASE`
   - `PROTECTED_JOB_CALLBACK_SECRET`
2. Add the workflow:
   - `.github/workflows/process-protected-job.yml`
3. Restrict workflow usage to trusted branches/environments.
4. Ensure the workflow is triggered only by:
   - `repository_dispatch`
5. Avoid exposing secrets to untrusted PR workflows.

## Recommended Implementation Order

1. Add `publishing_jobs` schema and indexes in Supabase.
2. Add Worker APIs for:
   - job creation
   - upload completion
   - polling
   - progress
   - finalize
   - fail
3. Switch protected upload UI to the new job-based flow.
4. Add GitHub `repository_dispatch` trigger in the Worker.
5. Add the GitHub Actions workflow.
6. Test the full path on staging with one uploaded EPUB.
7. Verify:
   - upload succeeds
   - job survives browser close/reopen
   - artifact lands in `protected-content/<contentId>/...`
   - book appears in catalog according to visibility rules
   - protected reader opens through normal reader routing

## v1 Non-Goals

These are not required for the first release:

- live status push via Durable Objects
- full Worker-native rewrite of the converter
- migration of publishing state to D1
- full catalog rebuild per uploaded book

## Final Recommendation

Use:

- Supabase for durable publishing/job state
- Cloudflare Worker for auth, orchestration, finalization, and indexing
- R2 for source and protected artifacts
- GitHub Actions `repository_dispatch` for on-demand Node conversion

Do not use:

- D1 as the main job store
- Durable Objects as the main job store
- scheduled polling workflows for rare jobs

This gives the system the needed backend compute without introducing a permanent VM and without depending on client machines.
