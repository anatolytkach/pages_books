# 99. Phase 13.3 Issue Register

## Status Legend

- `fixed` — reproduced and resolved in this phase
- `open` — still present after the corpus pass

## A. Critical

- none open on the final canonical certified corpus

### `P13.3-C01` — Manual-package books failed to boot in the new runtime
- reproduction:
  - localhost `?id=19&unprotectedRuntime=new`
  - runtime tried `META-INF/container.xml` only and failed on manual-package content
- book:
  - `19`
- domain:
  - boot
- impact:
  - blocks corpus hardening on non-standard packages
  - blocks removal confidence on manual-package content
- status:
  - `fixed`
- resolution:
  - `reader/js/unprotected-runtime-core.js` now falls back from `container.xml` loading to `book-manifest.json` + manual reading-order loading

### `P13.3-C02` — Expanded mapped corpus was not locally mirrorable in the current workspace
- reproduction:
  - localhost `?id=77752&unprotectedRuntime=new`
  - localhost `?id=77753&unprotectedRuntime=new`
  - local `/books/content/77752/` and `/books/content/77753/` roots are absent, while preview serves mapped manual paths
- book:
  - `77752`
  - `77753`
- domain:
  - rollout / certification
- impact:
  - blocks full localhost removal certification on the expanded corpus
  - forces preview-only evidence for part of the corpus
- status:
  - `fixed`
- phase 13.4 resolution:
  - local mirrors for `77752` and `77753` were materialized;
  - this removed the "missing local root" blocker;
  - it did not make those books equivalent certification members

### `P13.3-C03` — `id=19` was not cross-environment equivalent between localhost and preview
- reproduction:
  - localhost `?id=19&unprotectedRuntime=new` opens `Судьба цивилизатора`
  - preview `?id=19&unprotectedRuntime=new` opens `The Song of Hiawatha`
- book:
  - `19`
- domain:
  - rollout / certification
- impact:
  - blocks exact localhost-vs-preview certification for this corpus member
  - means preview green on `id=19` does not certify the same content exercised on localhost
- status:
  - `fixed`
- phase 13.4 resolution:
  - `19` is certification-valid only on the canonical route `?id=19&source=manual`
  - localhost and preview now resolve the same manual content on that route

## B. Major

### `P13.4-M01` — `77752` and `77753` are not cross-environment equivalent on canonical manual routes
- reproduction:
  - localhost `?id=77752&source=manual&unprotectedRuntime=new` opens mirrored Gutenberg content `Bibliography of the Bacon-Shakespeare controversy`
  - preview `?id=77752&source=manual&unprotectedRuntime=new` opens manual book `ВОПРОС`
  - localhost `?id=77753&source=manual&unprotectedRuntime=new` opens mirrored Gutenberg content `The population problem`
  - preview `?id=77753&source=manual&unprotectedRuntime=new` opens manual book `Человек в системе`
- book:
  - `77752`
  - `77753`
- domain:
  - rollout / certification
- impact:
  - these books cannot be used in the final certified cross-environment corpus
  - they remain exploratory only until local and preview content are truly aligned
- status:
  - `open`
- note:
  - this is an exploratory corpus divergence, not a blocker on the final canonical certified corpus

## C. Minor

### `P13.3-MI01` — Manual-package title extraction still leaks raw markup on edge sections
- reproduction:
  - new runtime on `19`
  - section `1/38` and `38/38` can expose raw markup-derived title strings in location/title surfaces
- book:
  - `19`
- domain:
  - shell parity / metadata presentation
- impact:
  - ugly section labels
  - does not break pagination, restore, search, notes, bookmarks, or TOC movement
- status:
  - `open`

### `P13.3-MI02` — Corpus aggregate runner needs escalated browser execution in the current desktop sandbox
- reproduction:
  - `check-phase13-3-corpus.js` under sandboxed multi-browser launches hits Chrome/Crashpad permission failures
- book:
  - all
- domain:
  - proof tooling
- impact:
  - aggregate runner is less convenient than the per-domain runners
  - does not invalidate the product proof collected via explicit per-book runs
- status:
  - `open`

## D. Cosmetic

### `P13.3-CO01` — Preview alias can lag behind the fresh deployment URL
- reproduction:
  - branch alias can briefly serve stale JS after deployment
- book:
  - all preview books
- domain:
  - tooling / preview routing
- impact:
  - preview evidence should use the fresh deployment URL as authority
- status:
  - `open`

## Removal Readiness Summary

Critical open items that still block iframe-removal readiness on the final canonical corpus:
- none

Critical product bugs fixed in this phase:
- `P13.3-C01`
- `P13.3-C02`
- `P13.3-C03`

Non-critical open items:
- `P13.4-M01`
- `P13.3-MI01`
- `P13.3-MI02`
- `P13.3-CO01`

## Phase 14 Note

No new critical removal blocker was found on the canonical certified corpus after switching the default unprotected route to the new runtime.

Observed non-gating removal warning:
- manual-package canonical book `19` still probes `META-INF/container.xml` before correctly falling back to `book-manifest.json`
- this is explicit runtime fallback behavior for manual packages, not iframe fallback and not a removal blocker
