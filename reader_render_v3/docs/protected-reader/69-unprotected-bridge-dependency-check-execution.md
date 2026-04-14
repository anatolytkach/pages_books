# 69. Unprotected Bridge Dependency Check Execution

## Scope
- Проверить, является ли `bridge` или bridge-adjacent path обязательной operational dependency для critical unprotected flows.
- Не делать removal, cleanup или route rewrite.
- Дать честный ответ: `Phase 9 safe` или `Phase 9 blocked`.

## Что считается bridge dependency for unprotected
- Operational dependency существует только если critical unprotected flow реально требует bridge-like transport / bridge-like state sync / iframe message bridge как обязательный рабочий путь.
- Legacy code presence сама по себе dependency не доказывает.

## Critical unprotected flows
- Navigation: open book, `next/prev`, TOC navigation, reading position restore.
- Search: open / submit / next / prev / clear / return where exposed, shell-visible search state.
- Theme / typography / shell behavior: theme toggle, sidebar behavior, font controls where exposed.
- Notes / bookmarks / share: bookmark flows where exposed; notes/share only where реально поддержаны old route shell.
- Route behavior: standard unprotected route on localhost and preview.
- Security / stability: no hidden debug exposure, no regressions from the check itself.

## Required evidence
- Honest unprotected bridge dependency audit.
- Localhost runner proof.
- Preview runner proof.
- Relevant old-route / rollout checks green.

## Result rule
- `UNPROTECTED BRIDGE CHECK PASSED` only if zero critical bridge dependencies are proven for the scoped unprotected flows and localhost/preview do not contradict each other.
- Otherwise the check fails and `Phase 9` is blocked.
