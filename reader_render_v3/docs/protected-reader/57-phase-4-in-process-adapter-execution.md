# Phase 4 In-Process Adapter Execution

## Scope
- ввести `in-process compatibility adapter` рядом с текущим bridge path
- сохранить bridge-backed path рабочим
- ввести явный dual-path verification:
  - legacy bridge-backed path
  - in-process adapter path

## Разрешено менять
- `reader_render_v3/dev/*` around protected reader runtime/bridge surface
- `reader_render_v3/integration/*` только там, где нужно выбрать transport mode и сохранить текущие routes
- `reader_render_v3/tools/internal/*` для adapter parity runner
- Phase 4 docs and bridge-to-adapter mapping docs

## Запрещено трогать
- bridge removal
- iframe removal
- protected old-shell route removal
- harness UI removal
- typed events/subscriptions
- direct rendering without iframe
- final route semantics rewrite
- broad legacy old reader rewrites

## Primary scope files
- `/Volumes/2T/se_ingest/pages_books/reader_render_v3/dev/protected-reader.js`
- `/Volumes/2T/se_ingest/pages_books/reader_render_v3/dev/protected-reader-compat-adapter.js`
- `/Volumes/2T/se_ingest/pages_books/reader_render_v3/dev/protected-reader-runtime-core.js`
- `/Volumes/2T/se_ingest/pages_books/reader_render_v3/integration/protected-old-shell-host.js`
- `/Volumes/2T/se_ingest/pages_books/reader_render_v3/integration/protected-reader-routing.js`
- `/Volumes/2T/se_ingest/pages_books/reader_render_v3/integration/protected-reader-bootstrap.js`
- `/Volumes/2T/se_ingest/pages_books/reader_render_v3/tools/internal/check-phase4-adapter-parity.js`
- `/Volumes/2T/se_ingest/pages_books/reader_render_v3/docs/protected-reader/58-phase-4-bridge-to-adapter-mapping.md`

## Routes / flags that must remain unchanged
- old reader default route
- current protected old-shell route
- current standalone protected route
- current published preview route
- iframe and bridge transport remain present
- adapter transport flag is internal-only:
  - `protectedCompatTransport=adapter`
  - default published route semantics stay unchanged when the flag is absent

## Phase 4 evidence package
- `protected:build`
- `protected:validate`
- localhost bridge path checks green
- localhost adapter path checks green
- preview bridge path checks green
- preview adapter path checks green if adapter mode is published/testable
- existing Phase 3 runners remain green
- new adapter parity runner green
- compat/security smoke green
- sanity perf comparison shows no material regression
