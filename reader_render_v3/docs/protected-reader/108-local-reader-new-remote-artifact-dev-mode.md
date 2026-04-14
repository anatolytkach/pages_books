# Local `reader_new` Remote-Artifact Dev Mode

## Scope

Use this mode for localhost UX work on `reader_new` while forcing book artifacts to resolve from the canonical Cloudflare-backed source instead of silently using local protected artifacts.

This is the correct development mode when:

- UI code is local
- the books must behave like preview books
- silent local artifact fallback is not allowed

## Required Route Parameters

Use all of these on localhost `reader_new` routes:

- `reader=protected`
- `protectedArtifactBookId=<id>`
- `protectedArtifactSource=r2`
- `readerRemoteMode=strict`
- `protectedUx=old-shell`
- `renderMode=shape`
- `metricsMode=shape`

Example:

`/books/reader_new/?id=45&reader=protected&protectedArtifactBookId=45&protectedArtifactSource=r2&readerRemoteMode=strict&protectedUx=old-shell&renderMode=shape&metricsMode=shape`

## Strict Mode Behavior

`readerRemoteMode=strict` means:

- localhost UI stays local
- protected artifact requests are locked to the Cloudflare-backed source
- local protected artifact files must not silently win just because they exist on disk

## How Silent Local Fallback Is Prevented

On localhost reader boot, the reader writes:

- `readerpub_artifact_source`
- `readerpub_remote_mode`

When these cookies are:

- `readerpub_artifact_source=r2`
- `readerpub_remote_mode=strict`

the local preview server forces `/books/protected-content/...` requests to proxy upstream instead of serving local files.

This makes strict mode operational, not cosmetic.

## Proof Markers In `runtime-meta`

The protected-style host now exposes these rows:

- `Artifact source requested`
- `Artifact remote mode`
- `Artifact source resolved`
- `Artifact origin resolved`
- `Artifact fallback detected`

Expected localhost values in strict remote mode:

- `Artifact source requested = r2`
- `Artifact remote mode = strict`
- `Artifact source resolved = remote`
- `Artifact origin resolved = https://reader.pub`
- `Artifact fallback detected = strict-remote-lock`

## Server Headers Used For Proof

The localhost preview server now emits these headers for `/books/protected-content/...`:

- `x-reader-artifact-source`
- `x-reader-artifact-origin`
- `x-reader-artifact-fallback`

The reader does a manifest preflight and surfaces those values into `runtime-meta`.

## Invalid Session Conditions

Treat the localhost run as invalid if any of these is true:

- `Artifact source requested != r2`
- `Artifact remote mode != strict`
- `Artifact source resolved != remote`
- `Artifact fallback detected != strict-remote-lock`

## Current Known Limitation

Strict remote mode only works for books that already have the required canonical protected-style artifacts on the Cloudflare-backed origin.

At the moment this means:

- `45` works in strict remote mode
- books like `11` can fail closed into `ineligible-no-protected-artifact`

This is a correct signal, not a bug in the mode itself. The mode is designed to expose missing remote artifacts instead of masking them with local files.

## Workflow

1. Run localhost preview.
2. Open localhost `reader_new` with the strict remote params above.
3. Check the runtime-meta markers.
4. Only then debug UX.
5. After localhost green, repeat on preview.

## `45` Reference Routes For Local UX Work

Protected `45`, local UI + remote protected artifact:

- `http://127.0.0.1:8791/books/reader_new/?id=45&entry=catalog-test&reader=protected&protectedArtifactBookId=45&protectedArtifactSource=r2&readerRemoteMode=strict&protectedUx=old-shell&renderMode=shape&metricsMode=shape`

Unprotected `45`, local UI + remote raw book content:

- `http://127.0.0.1:8791/books/reader/?id=45&readerContentSource=r2&readerRemoteMode=strict`

The protected route is the strict remote protected-artifact baseline.

The unprotected route is the strict remote raw-content baseline.
