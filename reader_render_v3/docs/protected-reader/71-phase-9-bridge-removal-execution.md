# 71. Phase 9 — Bridge Removal Execution

## Scope
- Удалить bridge как runtime dependency для protected path.
- Удалить protected bridge transport path и protected rollback-to-bridge operational path.
- Сохранить green protected direct path, old reader / unprotected path, compat/security invariants.

## Что удаляется
- Protected bridge facade publication в embedded protected runtime.
- Protected old-shell bridge transport selection and fallback glue.
- Protected iframe-backed bridge message / state synchronization used only by protected rollback path.
- Protected route defaults, которые раньше implicitly вели к bridge/iframe transport.

## Что намеренно НЕ удаляется
- Unprotected old route and its legacy helpers.
- Harness / diagnostics code beyond what is strictly needed for protected bridge removal.
- Whole-reader iframe-related legacy code outside proven protected-removal scope.
- Unprotected no-iframe completion work.

## Out of scope
- Phase 10 cleanup.
- Whole-reader no-iframe claim.
- Unprotected migration completion.
- Harness cleanup.

## Обязательные доказательства
- Removal scope table with remove-now / keep-now reasoning.
- Post-removal proof that live protected path no longer exposes or uses bridge runtime transport.
- Full localhost evidence green.
- Full preview evidence green.
- Unprotected non-regression green.

## Evidence package
- `reader_render_v3/docs/protected-reader/72-phase-9-removal-scope-table.md`
- `reader_render_v3/tools/internal/check-phase9-post-removal-proof.js`
- Existing protected / compat / security runners
- Localhost + preview browser-level verification
