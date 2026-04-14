# Dual-Book-Type Strategy After Phase 4

## 1. Why this strategy is fixed now
После завершения `Phase 4` уже существует не теоретическая, а реальная contract-shaped surface:
- in-process compatibility adapter;
- bridge-shaped direct adapter surface;
- bridge-to-adapter mapping;
- dual-path verification evidence.

Именно на этом этапе уже достаточно информации, чтобы зафиксировать:
- что является shared UI contract;
- что остаётся protected-specific backend behavior;
- как unprotected path должен участвовать в remaining migration phases.

До `Phase 4` это было бы слишком предположительно. После `Phase 4` отсутствие этой стратегии уже опасно, потому что `Phase 5` может случайно закрепить protected-specific event/state model как общий reader model.

## 2. Chosen target model
Выбранная целевая модель:
- **единый UI shell**
- **единый reader interface contract**
- **два runtime backend'а**

Это означает:
- shared shell обслуживает оба типа книг;
- UI shell не должен знать внутренние runtime различия;
- protected и unprotected могут иметь разные backend implementations;
- shell-level contract должен быть максимально общим;
- дальнейшая внутренняя convergence backend'ов возможна только как отдельное будущее решение, а не как скрытое допущение текущей миграции.

Эта стратегия соответствует модели:
- `shared shell + shared contract + protected backend + unprotected backend`

## 3. Shared vs backend-specific architecture

### 3.1. Shared shell
Shared shell включает:
- route interpretation at shell level;
- top/bottom bars;
- sidebars;
- shell toolbar placement and visibility;
- shell theme mode semantics;
- shell search mode semantics;
- note/bookmark/share entry points;
- shell navigation intents;
- readiness/probe/debug surfaces that are part of verification.

### 3.2. Shared reader interface contract
Contract на уровне shell должен быть общим для protected и unprotected в тех зонах, где UX обещание одно и то же:
- navigation commands;
- theme commands;
- shell-visible selection availability/state where applicable;
- search lifecycle semantics;
- note/bookmark/share shell commands;
- route/share reconstruction semantics where shared;
- pagination/layout notifications as consumed by shell;
- readiness/status signals used by shell and verification.

### 3.3. Protected backend
Protected backend может сохранять свои internal specifics:
- worker-backed rendering;
- protected layout/glyph mechanics;
- protected selection geometry and copy restrictions;
- protected security invariants;
- protected runtime state derivation.

Эти детали должны быть скрыты behind contract и не должны просачиваться в shell как отдельная protected-only UI model.

### 3.4. Unprotected backend
Unprotected backend в рамках текущей миграции:
- остаётся на существующем runtime path;
- не переписывается на protected internal model;
- не обязан технически совпадать с protected runtime;
- обязан оставаться совместимым с shared shell contract там, где shell surface общий.

Если позже будет рассматриваться deeper convergence, это должен быть отдельный проект с отдельным evidence package, а не неявное продолжение текущей миграции.

## 4. Contract zones: common vs type-specific

### 4.1. Common contract for both book types
Общими должны считаться:
- navigation intents and results;
- theme changes at shell level;
- shell-level search open/submit/next/prev/return semantics;
- shell-level note/bookmark/share actions;
- sidebar/top-bar interactions;
- route semantics where the same UI promise is made;
- readiness states required by shell and test tooling.

### 4.2. Protected-specific internals hidden behind the contract
Protected-specific internals:
- worker-backed rendering internals;
- protected layout snapshots;
- protected selection and annotation capture internals;
- protected copy/security restrictions;
- protected bridge/adapter transport details during migration.

### 4.3. Possibly unprotected-specific internals hidden behind the contract
Unprotected-specific internals may remain:
- EPUB/runtime-specific navigation mechanics;
- unprotected selection/layout mechanics;
- unprotected persistence details where they are not shell-visible;
- any legacy backend details not promised at shell level.

Правило:
- различия допустимы на backend level;
- различия недопустимы как неявно расходящиеся shell contracts.

## 5. Unprotected path status during current migration
В текущей миграции unprotected path:
- intentionally **не** переводится на protected runtime internals;
- intentionally **не** является target для bridge-removal work;
- intentionally **не** является target для direct-render protected work;
- остаётся baseline and non-regression path;
- участвует в shared shell contract verification;
- обязан сохранять старые route semantics и ожидаемый UX.

Что unprotected path currently does:
- служит обязательным baseline for route and shell non-regression;
- подтверждает, что shared shell contract не стал protected-only;
- входит в certification matrix whenever shell-visible behavior changes.

Что intentionally out of scope:
- полная runtime rewrite unprotected backend;
- forced convergence to protected rendering/worker architecture;
- перенос unprotected на protected-specific state model.

## 6. Phase impact on unprotected books

### Phase 5
- Protected: typed events/subscriptions implementation target.
- Unprotected: no matching internal rewrite required.
- But contract vocabulary and shell-facing semantics must remain shared.
- Phase 5 cannot start if there is ambiguity whether new events are protected-only internals or common shell contract signals.

### Phase 6
- Protected: direct rendering without iframe.
- Unprotected: non-regression plus shared shell contract verification.
- If shell behavior changes around rendering state, loading, toolbar, or theme, unprotected must be certified on those same shell-visible domains.

### Phase 7
- Protected: direct runtime feature integration.
- Unprotected: mandatory shared UX certification participant on navigation, theme, search, notes/bookmarks/share entry points, sidebar behavior.
- This is where unprotected stops being only background smoke and becomes a required shell-contract witness.

### Phase 8
- Protected: bridge decommission readiness.
- Unprotected: must remain green in shared shell regression matrix so protected bridge audit does not silently narrow the shell model.

### Phase 9
- Protected: bridge removal.
- Unprotected: still separate backend under shared shell.
- Any unprotected shell/route regression blocks Phase 9 closure.

### Phase 10
- Cleanup must not delete diagnostics or verification hooks still needed to certify shared shell behavior across both book types.

### Phase 11
- Final readiness requires:
  - protected migration certification green;
  - unprotected final non-regression certification green;
  - shared shell contract green for both book types.

## 7. Certification strategy for both book types

### 7.1. Protected certification layer
Protected books remain the main migration-risk set for:
- transport changes;
- runtime ownership changes;
- rendering and selection changes;
- security/copy restrictions;
- compat payload preservation.

### 7.2. Unprotected certification layer
Unprotected books are mandatory for:
- route baseline;
- shared shell baseline;
- shared search/theme/navigation semantics;
- shared note/bookmark/share entry behavior where applicable.

### 7.3. When unprotected certification becomes stronger
- Phase 5: mandatory contract-verification participant
- Phase 7: mandatory shared UX certification participant
- Phase 11: mandatory final certification participant

Unprotected cannot remain only “route still opens” after `Phase 4`.

## 8. Phase 5 entry clarification
Before `Phase 5` starts, all of the following must already be explicit:
- common contract zones are defined;
- protected-specific internals are isolated conceptually;
- unprotected-specific internals are acknowledged as backend details, not shell contract;
- unprotected non-regression obligations for shared shell changes are written down;
- adapter surface is treated as contract evidence, not as proof that protected internals define the whole future reader model.

Hard rule:
- `Phase 5` must not encode a protected-only event/state vocabulary as the global reader contract unless that vocabulary is explicitly proven to be valid at the shared shell layer for both book types.

## 9. Longer-term convergence vs current scope
Current migration scope includes:
- protected path migration away from iframe/bridge dependence;
- shared shell contract normalization;
- protected adapter/event/render integration phases;
- preservation of old reader and unprotected non-regression.

Current migration scope does **not** include:
- rewriting unprotected backend to match protected internals;
- forcing both book types onto a single identical runtime implementation;
- implicit future-proofing by leaking protected-specific internals into shell contract.

Longer-term convergence may be considered later only if:
- shared shell contract is already stable;
- both book types are green under that contract;
- a separate migration plan and certification package are created;
- the change is justified by measured product or maintenance value, not by architectural neatness alone.
