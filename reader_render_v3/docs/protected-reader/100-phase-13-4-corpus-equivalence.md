# 100. Phase 13.4 Corpus Equivalence

## Scope

This phase does not change runtime behavior.

It does:
- prove which books are equivalent between localhost and preview;
- define the final certification corpus;
- rerun `Phase 13.3` only on that corpus.

It does not:
- add features;
- patch UX;
- remove iframe;
- treat different books as "close enough".

## Strategy Chosen

`B. Canonical corpus strategy`

Reason:
- local mirror work removed the "missing local file" blocker for `77752` and `77753`;
- equivalence validation then proved that those IDs still resolve to different content across localhost and preview on canonical manual routes;
- therefore the only honest certification path is to certify a strict subset that is truly equivalent.

## Before

Pre-fix corpus used in `Phase 13.3`:
- localhost: `19686`, `45`, `19`
- preview: `19686`, `45`, `77752`, `77753`

That certification was invalid because it compared different books.

## Equivalence Table

### `19686`
- localhost source:
  - default
- preview source:
  - default
- title:
  - `Crome Yellow`
- fingerprint:
  - `e8c3cf75111e320065720ea09e0d6f4f25d3f346`
- text length sample:
  - `600`
- content match:
  - `yes`

### `45`
- localhost source:
  - default
- preview source:
  - default
- title:
  - `Anne of Green Gables`
- fingerprint:
  - `26366e316d94887b059c0e91714d089d9dee9162`
- text length sample:
  - `210`
- content match:
  - `yes`

### `19`
- localhost source:
  - `manual`
- preview source:
  - `manual`
- title:
  - `Судьба цивилизатора. Теория и практика гибели империй`
- fingerprint:
  - `104d349ef9a29faff69775437bf72144dc9856a8`
- text length sample:
  - `600`
- content match:
  - `yes`

### `77752`
- localhost source:
  - `manual`
- preview source:
  - `manual`
- localhost title:
  - `Bibliography of the Bacon-Shakespeare controversy`
- preview title:
  - `ВОПРОС`
- localhost fingerprint:
  - `dd9ff7523a52c1315fc731ae31902f6fbf9305bf`
- preview fingerprint:
  - `32b674e34f95c31f64ff38b0046ad6787e3407f0`
- content match:
  - `no`

### `77753`
- localhost source:
  - `manual`
- preview source:
  - `manual`
- localhost title:
  - `The population problem`
- preview title:
  - `Человек в системе`
- localhost fingerprint:
  - `0f50c5134898281fa7ec574645075c3c217b678e`
- preview fingerprint:
  - `f5a60383b29c18a42a5177f2994ade7a9ad266de`
- content match:
  - `no`

## Final Certification Corpus

The final equivalent certification corpus is:
- `19686`
- `45`
- `19` with `source=manual`

Coverage of required categories:
- simple:
  - `19686`
- multi-spine:
  - `45`
- long:
  - `19686`, `45`
- non-standard:
  - `19`
- TOC-heavy:
  - `45`, `19`

Excluded from certification:
- `77752`
- `77753`

Justification:
- they are not the same book between localhost and preview on canonical routes.

## Phase 13.3 Rerun Result On Final Corpus

Rerun status:
- localhost: `green`
- preview: `green`

Rerun scope:
- `check-phase13-2-restore.js`
- `check-phase13-2-search.js`
- `check-phase13-2-selection.js`
- `check-phase13-2-annotations.js`
- `check-phase13-2-bookmarks.js`
- `check-phase13-2-capability-summary.js`
- `check-phase13-3-corpus.js`

All were run on the same final corpus:
- `19686`
- `45`
- `19&source=manual`

## Final Status

`COMPLETE`

Meaning:
- corpus ambiguity is removed for the certification subset;
- `Phase 13.3` can now be repeated honestly on the same books in both environments;
- this phase alone does not claim iframe-removal readiness.

## Phase 13.5 Consumption

This equivalence result is the basis for the final unprotected iframe-removal decision pass.

Used decision corpus:
- `19686`
- `45`
- `19&source=manual`

Not used for the decision:
- `77752`
- `77753`

Decision relevance:
- the excluded books remain exploratory-only because they are not cross-environment equivalent;
- they do not block the canonical unprotected removal decision;
- they still cannot be used to make broader corpus-readiness claims.

## Phase 14 Consumption

The same final canonical corpus was used for the real unprotected iframe-removal implementation proof:
- `19686`
- `45`
- `19&source=manual`

Outcome:
- localhost and preview remained equivalent on the canonical corpus after the default route switched to the new runtime.
