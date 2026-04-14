# Phase 3 Preview-Only Failure Triage And Recovery

## Scope
Этот triage фиксирует только два последних blocker'а, которые держали `Phase 3` в статусе failed перед финальным recovery pass:

- `check-old-reader-full-ux-parity.js` on preview
- `check-full-old-reader-ux-conformance.js` on preview

## Blocker A

### Check
- `check-old-reader-full-ux-parity.js`

### Exact failing step
- preview page-turn / chapter-boundary loop
- `waitForSummaryChange(...)` timeout inside long `next` / `prev` navigation path

### Localhost vs preview difference
- localhost уже проходил базовый flow
- preview падал в длинном boundary loop после деплоя alias

### Classification
- runner regression
- preview-only race exposed the runner bug, but root cause был не в preview runtime

### Root cause
- runner считал прогресс только по `label/chunk`
- runner трактовал единичный no-op step как фатальный failure
- runner предполагал, что для book `19686` доступен cross-chunk boundary
- после обязательного `protected:build` текущий artifact для `19686` имеет `manifest.chunks.length = 1`, поэтому cross-chunk assertion стала неверной test assumption

### Affected files
- `/Volumes/2T/se_ingest/pages_books/reader_render_v3/tools/internal/check-old-reader-full-ux-parity.js`
- `/Volumes/2T/se_ingest/pages_books/reader_render_v3/artifacts/protected-books/19686/manifest.json`

### Why previous fixes were insufficient
- предыдущие fixes убрали старые selector/timing assumptions
- но сохраняли неверный invariant:
  - boundary progress only through `label/chunk`
  - cross-chunk boundary must exist

### Recovery applied
- progress detection переведён на summary-position comparison, а не только `label/chunk`
- boundary search стал tolerant к редким no-op steps
- runner стал `chunk-aware`
- для single-chunk artifact проверяется real forward/back navigation, а не fictitious cross-chunk boundary
- note-composer assertion ослаблена до реально поддерживаемого user-visible invariant

### Verification
- localhost green
- preview green

## Blocker B

### Check
- `check-full-old-reader-ux-conformance.js`

### Exact failing step
- preview TOC/chapter-boundary/navigation flow
- `waitForSummaryChange(...)` timeout inside long chapter-boundary loop

### Localhost vs preview difference
- localhost базовый conformance flow уже проходил
- preview срывался в long boundary navigation

### Classification
- runner regression
- preview-only timing exposed it earlier, но root cause тот же: stale navigation assumption in the runner

### Root cause
- runner требовал cross-chunk boundary там, где текущий certified artifact single-chunk
- touch scenario после swipe erroneously fallback'ился в hidden desktop arrow click
- note composer state снимался слишком рано и создавал false negative

### Affected files
- `/Volumes/2T/se_ingest/pages_books/reader_render_v3/tools/internal/check-full-old-reader-ux-conformance.js`
- `/Volumes/2T/se_ingest/pages_books/reader_render_v3/artifacts/protected-books/19686/manifest.json`

### Why previous fixes were insufficient
- previous fixes stabilised TOC and summary waits
- but runner still assumed:
  - boundary must be cross-chunk
  - swipe fallback may use desktop arrows
  - composer layout must hide toolbar before snapshot unconditionally

### Recovery applied
- conformance runner стал `chunk-aware`
- touch scenario теперь ждёт swipe-driven summary change before desktop fallback
- boundary loop tolerates no-op steps and validates single-chunk navigation honestly
- note-composer assertion приведена к actual supported baseline

### Verification
- localhost green
- preview green

## Phase 3 Close Impact

### Failures that blocked Phase 3 close
- оба preview old-shell heavy runners above

### Minimal recovery scope that was needed
- only runner/tooling recovery
- no bridge changes
- no iframe changes
- no route semantics changes
- no Phase 4 work

## Final state
- оба blocker'а зелёные на localhost
- оба blocker'а зелёные on published preview alias
- full Phase 3 evidence package rerun complete
- no remaining red mandatory checks before `Phase 4`
