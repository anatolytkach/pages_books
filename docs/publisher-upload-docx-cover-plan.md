# Publisher Upload DOCX Plus Cover Plan

## Goal

Support a single publisher upload flow where the user can submit either:

- an EPUB file, or
- a DOCX file plus a required cover image

From the publisher's perspective this stays one upload flow inside the staging GUI. The system handles any intermediate DOCX-to-EPUB conversion before protected conversion.

## Product Decisions

### Upload modal changes

In the `Upload Book` modal:

- rename `Publishing Destination` to `Publishing Source`
- when the logged-in publisher has only one allowed tenant identity:
  - replace the editable tenant select with a read-only text input
- replace `Reader Type` with:
  - `Protect Content` checkbox
  - default: checked
- replace visibility select with:
  - `Visibility` radio group
  - options:
    - `Public`
    - `Member Only`
  - default: `Public`
- add `File type` selector:
  - `EPUB`
  - `DOCX`
  - default should match the most common path we want to encourage
- move the book metadata fields into the modal flow so the publisher completes everything in one place
- add `Book Cover`
  - shown for all uploads if we want explicit override support later
  - required when `File type = DOCX`
- keep one main upload zone for the source manuscript file
- after file selection/drop:
  - switch to a progress screen immediately
  - show upload and processing progress without leaving the flow in an ambiguous state

### DOCX-specific behavior

If the publisher selects `DOCX`:

- the source upload is the `.doc` or `.docx` file
- the cover image becomes required
- accepted cover formats should include normal raster inputs such as:
  - `.png`
  - `.jpg`
  - `.jpeg`
  - `.webp`
- backend creates a normalized EPUB from the DOCX
- that normalized EPUB must include the uploaded cover image
- protected conversion then runs from that normalized EPUB

### EPUB-specific behavior

If the publisher selects `EPUB`:

- cover upload is optional in v1 unless we explicitly choose to support cover override
- if no cover is uploaded, existing EPUB metadata/cover behavior remains unchanged
- protected conversion continues to run directly from the EPUB

## UX Flow

### Screen 1: Upload details

Fields in order:

1. `Publishing Source`
2. `Protect Content`
3. `Visibility`
4. `File type`
5. existing metadata fields currently shown on `/books/publish`
6. `Book Cover`
   - required only for `DOCX`
7. source upload zone

Validation rules:

- source manuscript file is always required
- `Book Cover` is required for `DOCX`
- invalid source/cover combinations should be blocked before upload starts
- the form should explain clearly which file is the manuscript and which file is the cover

### Screen 2: Progress

Once the source file is selected:

- freeze the metadata used for this run
- switch to a progress view
- show:
  - upload progress
  - job state
  - validation state
  - conversion state
  - final completion or failure

The progress view should treat `DOCX + cover` as one logical upload, not two separate publishing operations.

## Backend Contract Changes

The protected publishing job contract needs to distinguish between:

- source upload
- optional or required cover upload
- source format

### Proposed job creation payload

`POST /books/api/v1/protected-jobs`

Add:

- `source_format`
  - `epub`
  - `docx`
- cover metadata when applicable

Example shape:

```json
{
  "title": "Book title",
  "author": "Author name",
  "language": "en",
  "visibility": "public",
  "reader_type": "protected",
  "source_format": "docx",
  "filename": "book.docx",
  "cover_filename": "cover.jpg"
}
```

### Proposed upload response shape

Return upload targets for both logical assets when needed:

```json
{
  "jobId": "uuid",
  "bookId": "uuid",
  "contentId": "200123",
  "status": "awaiting_upload",
  "uploads": {
    "source": {
      "objectKey": "uploads/protected/<jobId>/source/book.docx",
      "method": "PUT",
      "url": "..."
    },
    "cover": {
      "objectKey": "uploads/protected/<jobId>/cover/cover.jpg",
      "method": "PUT",
      "url": "..."
    }
  }
}
```

Rules:

- for `EPUB`, `uploads.cover` may be omitted or optional
- for `DOCX`, `uploads.cover` is required

### Upload completion payload

`POST /books/api/v1/protected-jobs/:id/upload-complete`

It should confirm:

- source object exists
- cover object exists when `source_format = docx`

The job should not queue conversion until both required uploads are present.

## Pipeline Changes

### Worker

Update protected publishing job handling so it stores:

- `source_format`
- source upload key
- cover upload key when present
- normalized EPUB metadata when generated

Validation rules in the Worker:

- reject `DOCX` job completion if cover is missing
- reject unsupported cover MIME types
- keep authorization checks identical to current protected job rules

### GitHub Actions

For `DOCX` jobs:

1. download DOCX
2. download cover image
3. validate DOCX
4. build normalized EPUB from DOCX with the cover image embedded
5. persist normalized EPUB to R2
6. run protected conversion from normalized EPUB
7. finalize the book as usual

For `EPUB` jobs:

1. download EPUB
2. run protected conversion directly
3. finalize the book as usual

### DOCX to EPUB builder

Extend `tools/publish/build_epub_from_docx.py` to accept:

- `--cover-image <path>`

Implementation detail:

- pass the cover image into Pandoc with `--epub-cover-image`

This keeps cover embedding aligned with the existing shell-based DOCX->EPUB flow already present in the repo.

## Data Model Changes

Existing protected publishing job records should grow fields for:

- `source_format`
- `cover_r2_key`
- `cover_filename`
- `cover_content_type`

If we want result inspection later, also keep:

- `normalized_epub`
- cover processing details in `result_payload`

## Validation And Error Handling

### Frontend validation

- reject start if `DOCX` is selected and no cover is supplied
- reject obvious file type mismatches early
- keep error copy specific:
  - missing cover
  - unsupported cover type
  - unsupported manuscript type

### Backend validation

- re-check everything server-side
- treat frontend validation as convenience, not authority
- fail the job with a clear step and message if cover or DOCX validation fails

### Recovery behavior

- failed jobs should preserve enough metadata for retry/debugging
- progress screen should show a stable failure state rather than dropping the user back to the form with no explanation

## Tests Needed

### Frontend

- self-publisher sees read-only `Publishing Source`
- multi-tenant publisher still sees a selectable source control
- `Protect Content` defaults to checked
- `Visibility` defaults to `Public`
- `DOCX` requires cover before upload can start
- `EPUB` does not require cover in v1
- selecting a source file switches the modal to progress state

### Worker/API

- create job with `source_format = epub`
- create job with `source_format = docx`
- reject DOCX upload completion when cover object is missing
- expose normalized EPUB metadata after DOCX completion

### Pipeline

- DOCX job embeds uploaded cover into normalized EPUB
- DOCX job still produces protected artifact successfully
- EPUB job behavior remains unchanged

## Recommended Implementation Order

1. update the publisher modal UI and client-side validation
2. extend protected job creation and upload-complete APIs for `source_format` and cover uploads
3. extend the DOCX-to-EPUB builder to accept `--cover-image`
4. update the GitHub Actions job runner for dual-upload DOCX jobs
5. add tests
6. run a staging end-to-end DOCX plus cover upload

## Non-Goals For This Pass

- multiple manuscript files in one upload
- drag-and-drop of several covers
- cover cropping/editing UI
- EPUB cover override semantics beyond the minimal agreed behavior
- redesign of the full publish page outside the upload modal

## Release Note

From the publisher's point of view the intended end state is:

- one upload flow
- one manuscript file
- one required cover file for DOCX
- one progress experience
- automatic DOCX to EPUB normalization before protected conversion
