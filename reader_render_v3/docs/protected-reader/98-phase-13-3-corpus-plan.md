# 98. Phase 13.3 Corpus Plan

## Scope

This phase hardens and certifies the **new** unprotected runtime on an expanded corpus.

It does:
- expand proof beyond the convenience books used in `Phase 13.1/13.2`;
- run the existing domain runners on a broader corpus;
- classify findings by removal impact;
- produce an honest removal-readiness answer.

It does not:
- remove iframe;
- add new user-facing features beyond critical bug fixes found during corpus runs;
- claim whole-reader no-iframe completion.

## Corpus Categories

Minimum categories covered:
- `A. Simple books (single spine)`
- `B. Multi-spine books`
- `C. Long books`
- `D. Non-standard package / layout`
- `E. TOC-heavy books`
- `F. Non-standard CSS / markup`
- `G. Text-heavy pages`

## Corpus Set

## Final Certification Corpus

The final cross-environment certification corpus for the rerun is:
- `19686`
- `45`
- `19` with `source=manual`

These three books are the canonical subset because they are the only books proven equivalent on:
- localhost
- preview (`https://c7ec2145.reader-books.pages.dev`)

The rerun of `Phase 13.3` must use exactly this subset.

### 1. `19686` — Crome Yellow
- categories:
  - `A. Simple books (single spine)`
  - `C. Long books`
  - `G. Text-heavy pages`
- environment:
  - localhost
  - preview
- expected behavior:
  - multi-page section pagination
  - restore after next/prev
  - runtime-owned search
  - selection / annotations / bookmarks
  - stable repeated page turns

### 2. `45` — Anne of Green Gables
- categories:
  - `B. Multi-spine books`
  - `C. Long books`
  - `E. TOC-heavy books`
- environment:
  - localhost
  - preview
- expected behavior:
  - section transitions remain runtime-owned
  - restore works across section changes
  - search traverses multiple sections/pages
  - TOC jump stays consistent with runtime location

### 3. `19` — Судьба цивилизатора
- categories:
  - `D. Non-standard package / layout`
  - `F. Non-standard CSS / markup`
  - `E. TOC-heavy books`
- environment:
  - localhost
  - preview
- expected behavior:
  - manual package loads without iframe fallback
  - Cyrillic text participates in runtime-owned pagination/search
  - restore / selection / notes / bookmarks stay green

Canonical route note:
- `19` is certification-valid only as `?id=19&source=manual&unprotectedRuntime=new`
- unqualified `?id=19` is not canonical for equivalence

### 4. `77752` — exploratory only, not in final certification corpus
- categories:
  - `B. Multi-spine books`
  - `E. TOC-heavy books`
  - `G. Text-heavy pages`
- environment:
  - localhost exploratory
  - preview exploratory
- expected behavior:
  - route can still be explored
  - must not be used for final cross-environment certification

Reason for exclusion:
- localhost `?id=77752&source=manual` resolves to mirrored Gutenberg content
- preview `?id=77752&source=manual` resolves to manual book `ВОПРОС`
- these are different books and therefore not certifiable as one corpus member

### 5. `77753` — exploratory only, not in final certification corpus
- categories:
  - `B. Multi-spine books`
  - `C. Long books`
  - `E. TOC-heavy books`
- environment:
  - localhost exploratory
  - preview exploratory
- expected behavior:
  - route can still be explored
  - must not be used for final cross-environment certification

Reason for exclusion:
- localhost `?id=77753&source=manual` resolves to mirrored Gutenberg content
- preview `?id=77753&source=manual` resolves to manual book `Человек в системе`
- these are different books and therefore not certifiable as one corpus member

## Localhost vs Preview Boundary

The original split corpus is no longer used for certification.

After `Phase 13.4`, the rule is:
- certification uses only books proven equivalent on localhost and preview;
- exploratory books may still be exercised, but they do not count toward the certification verdict.

Final certified cross-environment subset:
- `19686`
- `45`
- `19` with `source=manual`

Explicitly excluded from certification:
- `77752`
- `77753`

Reason:
- they are not the same content between localhost and preview on the canonical manual routes.

## Domains Run Per Book

Each corpus book is checked against:
- pagination
- restore
- search
- selection
- highlights / notes
- bookmarks
- TOC / navigation stability
- theme / typography shell wiring
- page counter correctness
- repeated interaction stability

## Proof Required

Mandatory proof for this phase:
- `check-phase13-4-corpus-equivalence.js`
- `check-phase13-runtime-skeleton.js`
- `check-phase13-1-pagination-model.js`
- `check-phase13-2-restore.js`
- `check-phase13-2-search.js`
- `check-phase13-2-selection.js`
- `check-phase13-2-annotations.js`
- `check-phase13-2-bookmarks.js`
- `check-phase13-2-capability-summary.js`
- `check-phase13-3-corpus.js`
- `check-live-rollout-smoke.js`
- `check-live-protected-route.js`
- `check-unprotected-bridge-dependency.js`
- `check-phase9-post-removal-proof.js` if shared wiring was touched

## Completion Criteria

This phase is complete only if:
- the final certification corpus is identical across localhost and preview;
- the new runtime is green on the final certification corpus locally and on preview;
- every discovered issue is classified;
- every critical product bug found during corpus runs is fixed;
- the final report states clearly whether iframe-removal readiness is supported or not.

## Phase 13.5 Decision Consumption

This corpus plan is the authoritative input for the final unprotected iframe-removal decision pass.

Decision corpus:
- `19686`
- `45`
- `19&source=manual`

Decision outcome:
- `GO_WITH_WARNINGS`

Boundary:
- the corpus is sufficient for the unprotected removal implementation decision;
- it is not a claim of broader exploratory-corpus parity or whole-reader iframe-free completion.
