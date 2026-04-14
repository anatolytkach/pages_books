# 65. Phase 8 — Bridge Decommission Readiness Execution

## Scope
- Доказать, что `bridge` больше не является critical operational dependency для protected direct path.
- Ничего не удалять.
- Сохранить green bridge-backed rollback path, iframe path, old-shell baseline, unprotected non-regression, compat/security invariants.

## Что считается bridge dependency
- `bridge` считается dependency только если critical protected flow требует `window.__PROTECTED_READER_BRIDGE__` или bridge transport как обязательный operational path.
- Bridge-shaped naming само по себе не считается dependency, если call в direct mode обслуживается через in-process adapter/runtime path.

## Critical flows этой фазы
- Navigation: `next/prev`, `goToToc`, `goToAnnotation`, `restoreFromToken`.
- Selection / toolbar / highlights: selection start/change/clear, `createHighlight`, `addNote`, copy/export selection, note focus jump.
- Search: submit / next / prev / clear / return-to-origin, search highlights, shell-visible search state.
- Notes / bookmarks: create / delete / list refresh / jump.
- Share / export: `exportNotesSharePayload`, protected route preservation.
- Theme / typography: theme toggle, font scale, font mode, state survival after cycles.
- Security invariants: no hidden DOM text, no `/debug/`, copy-surface hardening intact.

## Что нельзя трогать
- Bridge removal.
- Iframe removal.
- Compatibility layer removal.
- Harness cleanup.
- Wide route semantics changes.

## Обязательные доказательства
- Honest bridge dependency audit.
- Zero-critical bridge dependency proof for protected direct path.
- Documented and tested rollback path.
- Full localhost evidence green.
- Full preview evidence green.

## Evidence package
- `reader_render_v3/docs/protected-reader/66-phase-8-bridge-dependency-audit.md`
- `reader_render_v3/docs/protected-reader/67-phase-8-rollback-proof.md`
- `reader_render_v3/tools/internal/check-phase8-bridge-readiness.js`
- Full localhost + preview runner matrix
- Compat/security/perf sanity results
