# Phase 3 — Runtime Core Extraction

## Scope
- Выделить runtime core из `protected-reader` harness/dev shell в отдельный reusable модуль.
- Перенести ownership runtime state из harness/dev UI в runtime-core слой.
- Сохранить текущие bridge, iframe, route и compatibility paths без удаления и без замены transport.

## Разрешено менять
- `reader_render_v3/dev/protected-reader.js`
- новые runtime-core модули рядом с `protected-reader.js`
- минимальный integration glue в `reader_render_v3/integration/*`, если это нужно только для extraction boundary
- migration docs по факту выполненного Phase 3

## Запрещено трогать
- удаление bridge transport
- удаление iframe path
- удаление protected old-shell route
- удаление harness diagnostics UI
- final route semantics
- in-process adapter work
- typed events/subscriptions replacement
- direct rendering without iframe
- final no-iframe path
- широкие правки legacy old-reader файлов

## Primary scope files
- `/Volumes/2T/se_ingest/pages_books/reader_render_v3/dev/protected-reader.js`
- `/Volumes/2T/se_ingest/pages_books/reader_render_v3/integration/protected-reader-bootstrap.js`
- `/Volumes/2T/se_ingest/pages_books/reader_render_v3/integration/protected-reader-entry.js`
- `/Volumes/2T/se_ingest/pages_books/reader_render_v3/integration/protected-reader-routing.js`
- `/Volumes/2T/se_ingest/pages_books/reader_render_v3/runtime/*`

## Intentionally out of scope
- `/Volumes/2T/se_ingest/pages_books/reader/js/reader.js`
- `/Volumes/2T/se_ingest/pages_books/reader/js/fbreader-ui.js`
- bridge removal
- iframe removal
- route deletion
- compatibility-layer deletion

## Evidence package
- `protected:build` green for book `19686`
- `protected:validate` green for artifact `19686`
- localhost protected old-shell route green
- localhost old reader route green
- preview protected old-shell route green
- preview old reader route green
- existing readiness / parity / rollout-smoke checks green where applicable
- compat smoke green where applicable
- basic perf sanity: initial load and page turn without obvious regression
