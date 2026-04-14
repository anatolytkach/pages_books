# 54. Финальный план миграции protected runtime в прямую интеграцию с новой читалкой

## 1. Executive Summary

### Что именно мигрируется
Мигрируется текущая архитектура protected reader из модели:
- `iframe`
- `bridge`
- embedded / harness runtime

в модель:
- реальный UI новой читалки;
- прямой internal runtime layer;
- единый contract между UI shell и runtime core;
- отсутствие `iframe/bridge` в final protected runtime path.

### Зачем это делается
Текущая архитектура создаёт системный класс дефектов:
- рассинхрон state между host и embedded runtime;
- stale summary / stale generation;
- theme-toggle regressions;
- selection/search/toolbar races;
- дублирование ownership;
- сложность верификации и отладки;
- излишнюю хрупкость любого UX-фикса.

### Что считается successful migration
Миграция считается успешной только если:
- protected runtime больше не зависит от `iframe/bridge`;
- critical UX не хуже current protected old-shell baseline;
- old reader path и unprotected path не деградируют;
- production-compatible formats сохраняются;
- localhost и preview оба проходят verification matrix;
- synthetic pass не противоречит реальному browser behavior.

### Final architecture claim clarification
После завершения текущих `Phase 8/9` в рамках этого плана можно будет делать только **protected-level claim**:
- protected path больше не зависит от `iframe/bridge`;
- protected direct runtime path production-ready;
- shared shell contract remains green for protected and unprotected paths.

После завершения текущих `Phase 8/9` **нельзя автоматически делать whole-reader claim**:
- “the reader no longer uses iframe architecture”
- “the new reader as a whole no longer relies on iframe runtime boundaries”

Такие формулировки допустимы только если дополнительно доказано:
- unprotected path тоже больше не использует iframe boundary как архитектурную основу;
- unprotected path прошёл отдельную no-iframe readiness and removal track;
- whole-reader certification green for both book types under no-iframe target model.

Жёсткое правило:
- **protected no-iframe success** и **whole-reader no-iframe success** — разные уровни claims;
- их запрещено смешивать в финальных выводах, rollout notes и completion criteria.

### Что категорически нельзя ломать
- old reader default path
- protected old-shell route
- current live/staging preview route
- selection
- notes / highlights
- search
- theme switching
- page navigation
- share / export
- compat formats
- secure worker-only protected mode
- readiness runners
- отсутствие hidden DOM text
- отсутствие production-visible debug UI

### Жёсткое правило миграции
Удаление `iframe` или `bridge` запрещено, пока не готовы:
- unified reader interface contract;
- ownership map;
- in-process compatibility adapter;
- typed events/subscriptions;
- automated verification harness;
- certification scope;
- golden baselines / fixtures;
- compat corpus;
- rollback path;
- phase exit evidence package.

## 2. Target Architecture

### 2.1. Целевые слои

#### UI shell новой читалки
Отвечает за:
- top/bottom bars;
- sidebars;
- toolbar visibility and placement;
- search UI mode;
- route interpretation;
- shell theme state;
- responsive shell behavior.

#### Unified reader interface contract
Это единственный формальный интерфейс между UI и runtime. Он определяет:
- navigation commands;
- theme commands;
- selection commands/events;
- search commands/events;
- notes/bookmarks commands/events;
- share/export requests;
- pagination/layout notifications.

#### Runtime core
Владеет:
- pagination state;
- selection state;
- annotation state;
- bookmark state;
- search state;
- render config;
- runtime layout snapshot;
- page/chunk anchors;
- compat export payload generation.

#### Worker / rendering layer
Владеет:
- shaping;
- hit testing;
- selection geometry;
- page rendering;
- highlight geometry;
- viewport-dependent recomputation.

#### Persistence / integration layer
Владеет:
- local persistence;
- import/export serialization;
- share endpoint calls;
- compatibility invariants.

### 2.2. Ownership map

#### UI shell владеет
- visibility state верхних/нижних баров;
- состоянием sidebar’ов;
- visibility и placement toolbar’ов;
- search UI mode;
- shell-level theme choice;
- route/URL synchronization;
- responsive shell behavior.

#### Runtime core владеет
- selection state;
- search match state;
- annotation repository;
- bookmark state;
- pagination state;
- render config;
- layout snapshot;
- compat payload generation.

#### Worker/render layer владеет
- glyph shaping inputs;
- selection geometry;
- hit-testing result geometry;
- final render surfaces.

### 2.3. Жёсткие правила ownership
- Ни один critical UX flow не должен зависеть от polling-only summary как от целевой архитектуры.
- Один и тот же state не может иметь двух равноправных владельцев.
- Host не должен реконструировать runtime state эвристически.
- UI не должен держать копию runtime state “на всякий случай”.
- Worker state должен зависеть только от runtime state и contract-driven commands.

### 2.4. Dual-Book-Type Target Model After Phase 4
После завершения `Phase 4` целевая модель фиксируется явно:
- **единый UI shell**
- **единый reader interface contract**
- **два runtime backend'а**

Это означает именно модель:
- `shared shell + shared reader interface contract + protected backend + unprotected backend`

Это **не** означает:
- немедленный перенос unprotected runtime на protected internal model;
- обязательную унификацию внутренних runtime механизмов в рамках текущей миграции;
- право кодировать protected-specific state/event semantics как глобальную модель всей новой читалки.

Что считается общей частью для обоих типов книг:
- shell route interpretation;
- top/bottom bars;
- sidebars;
- toolbar placement and visibility;
- shell-level theme semantics;
- shell-level search mode semantics;
- shell-level note/bookmark/share entry points;
- shell-level navigation intents;
- shell-level readiness and verification signals.

Что считается backend-specific:
- rendering internals;
- layout/glyph mechanics;
- selection internals;
- protected security/copy restrictions;
- EPUB/unprotected runtime-specific internals;
- backend-local state derivation and worker behavior.

Текущая миграция направлена на protected backend path. Unprotected path в рамках этой миграции:
- остаётся самостоятельным backend path;
- участвует как обязательный shared-shell contract consumer;
- остаётся обязательным non-regression и certification participant;
- не считается объектом внутренней runtime rewrite в текущем проекте.

Подробная стратегия после `Phase 4` зафиксирована отдельно в:
- `reader_render_v3/docs/protected-reader/59-dual-book-type-strategy-after-phase-4.md`

### 2.5. Unprotected Status After Current Phases
После завершённых `Phase 3/4/5/6/7` для unprotected path уже доказано:
- shared shell contract не деградировал;
- shared shell event vocabulary остаётся совместимой;
- search/theme/sidebar/navigation shell semantics остаются частью обязательной regression matrix;
- unprotected path участвует в localhost + preview verification, а не только в route-open smoke.

При этом для unprotected path **ещё не доказано**:
- no-iframe runtime readiness;

### 2.6. Unprotected Pivot Clarification
После failed attempt to port the legacy EPUB.js runtime into a direct host, текущая стратегия уточняется жёстко:
- legacy unprotected runtime не считается переносимой основой для no-iframe architecture;
- следующий implementation step для unprotected должен строить **новый runtime**, а не продолжать чинить legacy EPUB.js direct-host path;
- shared shell and reader contract remain the target integration boundary;
- legacy iframe path должен оставаться отдельным legacy path до тех пор, пока новый runtime не достигнет требуемой parity.

Authoritative architecture pivot:
- `reader_render_v3/docs/protected-reader/91-unprotected-runtime-replacement-architecture.md`

### 2.7. First Redefined Phase-13 Implementation Status

Current factual state:
- a new unprotected runtime skeleton now exists behind an explicit route flag;
- the legacy unprotected iframe path remains the default path;
- the new runtime owns its own API/state/event surface and mounts into a direct host without iframe boundary;
- feature parity is still intentionally incomplete.
- exact flag:
  - `unprotectedRuntime=new`
- exact currently implemented skeleton capabilities:
  - direct-host boot
  - runtime-owned loading / ready / error lifecycle
  - runtime-owned API surface
  - runtime-owned state surface
  - runtime-owned event surface
  - page-level location and pagination model
  - direct-host page rendering
  - honest section-boundary transitions
- exact capability status after `Phase 13.2`:
  - restore is implemented and green on the current two-book corpus
  - runtime-owned search is implemented and green on the current two-book corpus
  - selection state and toolbar wiring are implemented and green on the current two-book corpus
  - highlights / notes and bookmarks are implemented and green on the current two-book corpus
  - TOC jump and shell counter/theme/font wiring are green on the current two-book corpus
- exact intentionally missing capabilities:
  - full legacy-parity certification
  - broader corpus certification beyond `19686` and `45`
  - removal readiness for iframe

Execution artifact:
- `reader_render_v3/docs/protected-reader/92-phase-13-redefined-unprotected-runtime-skeleton-execution.md`
- corpus-hardening artifacts:
  - `reader_render_v3/docs/protected-reader/98-phase-13-3-corpus-plan.md`
  - `reader_render_v3/docs/protected-reader/99-phase-13-3-issue-register.md`

### 2.8. Phase 13.3 Corpus-Hardening Outcome

Current factual state after corpus hardening:
- localhost runtime proof is green on `19686`, `45`, and `19`;
- preview runtime proof is green on `19686`, `45`, `77752`, and `77753`;
- no hidden iframe fallback was observed on the new runtime route for the audited corpus;
- manual-package boot/search hardening for `19` is now green.

Current factual blocker:
- expanded-corpus localhost certification is incomplete because the current workspace does not contain local content mirrors for mapped preview IDs `77752` and `77753`.
- exact localhost/preview equivalence is also incomplete because `id=19` resolves to different content across environments.

Allowed claim after `Phase 13.3`:
- the new unprotected runtime is stable on the audited local corpus and on the audited expanded preview corpus.

Forbidden claim after `Phase 13.3`:
- unprotected iframe removal is now authorized.
- direct-render host replacement for its current iframe/runtime boundary;
- feature-complete direct runtime path without legacy iframe architecture;
- final removal readiness comparable to protected `Phase 8/9`.

### 2.9. Phase 13.5 Final Unprotected Removal-Decision Outcome

Canonical decision corpus:
- `19686`
- `45`
- `19&source=manual`

Decision outcome:
- `GO_WITH_WARNINGS`

Meaning:
- real unprotected iframe-removal implementation may start as the next phase;
- the decision is supported by canonical localhost/preview certification, static architecture audit, and regression controls;
- the decision does not authorize protected-path removal or whole-reader iframe-free claims.

Non-gating warnings:
- `77752` and `77753` remain exploratory-only because they are not cross-environment equivalent;
- broader exploratory-corpus breadth is still outside the canonical unprotected removal gate.

### 2.10. Phase 14 Unprotected Iframe-Removal Outcome

Implemented scope:
- the default active unprotected route now boots the new runtime by default;
- the legacy iframe-backed unprotected path now survives only as explicit rollback mode:
  - `?unprotectedRuntime=legacy`

Verified outcome:
- canonical corpus `19686`, `45`, `19&source=manual` is green on localhost and preview on the default route;
- post-removal proof shows:
  - `defaultRuntimePath = new`
  - `iframeCount = 0`
  - `legacyPathStillDefault = false`
  - explicit rollback path present and non-default

Still forbidden after `Phase 14`:
- protected removal claims
- whole-reader iframe-free claims
- broader exploratory-corpus completion claims

Текущий factual status:
- unprotected path сейчас covered as shared-shell contract consumer;
- unprotected path intentionally remains legacy-backed at runtime level;
- текущие completed phases дают **unprotected non-regression**, но **не дают unprotected no-iframe completion proof**.
- отдельный pre-Phase-9 safety gate по bridge dependency для scoped unprotected critical flows пройден:
  - `reader_render_v3/docs/protected-reader/69-unprotected-bridge-dependency-check-execution.md`
  - `reader_render_v3/docs/protected-reader/70-unprotected-bridge-dependency-audit.md`
- factual gate conclusion:
  - zero critical bridge dependencies proven for the scoped unprotected old-route critical flows on localhost and preview;
  - remaining bridge-adjacent code on unprotected path is legacy/compatibility-oriented, not a proven critical operational dependency;
  - этот результат разрешает `Phase 9` с точки зрения hidden unprotected bridge blocker, но **не** заменяет отдельную unprotected no-iframe completion branch.
- `Phase 12` execution audit additionally established:
  - active unprotected route still uses iframe-backed rendition surfaces;
  - the highest-confidence blockers before `Phase 13` are route/bootstrap ownership, iframe-backed `renderTo(...)` host creation, iframe-local touch/swipe delivery, iframe-local search lifecycle, and iframe-targeted theme application;
  - these blockers are now explicitly recorded in:
    - `reader_render_v3/docs/protected-reader/86-phase-12-unprotected-iframe-dependency-audit.md`

Отдельная стратегическая ветка для этого зафиксирована в:
- `reader_render_v3/docs/protected-reader/68-unprotected-no-iframe-completion-strategy.md`

## 3. Certification Scope

### 3.1. Baseline certification books
Фаза не может считаться завершённой, если она прошла только на одной удобной книге. Минимальный certification set:

1. **Primary protected baseline book**
   - `Anne of Green Gables`
   - baseline для protected old-shell parity

2. **Protected note-heavy book**
   - книга с несколькими notes/highlights/bookmarks

3. **Protected search-heavy book**
   - книга с большим количеством search matches и многостраничной навигацией по результатам

4. **Protected long-session / pagination stress book**
   - книга для долгого чтения, repeated page turns, theme toggles, reopen loops

5. **Unprotected baseline book**
   - для контроля отсутствия regressions в unified shell behavior

### 3.2. Expansion books
Дополнительные книги добавляются в certification matrix, если фаза затрагивает:
- typography/font mode;
- selection edge cases;
- note density;
- unusual metadata/share payloads;
- multilingual / non-Latin content, если поддержка заявлена;
- chapter/layout structures, которых нет в baseline set.

### 3.3. Criteria for adding books into certification matrix
Новая книга должна добавляться, если она покрывает хотя бы один новый risk class:
- новый payload shape;
- новый notes/share/bookmark edge case;
- pagination stress case;
- theme/selection stress case;
- route/share reconstruction edge case.

### 3.4. Certification rule
Фаза **не считается complete**, если она прошла только на одной cherry-picked книге, кроме случаев, когда фаза явно помечена как:
- `single-book instrumentation phase`
- `contract-only phase`
- `non-UX internal extraction phase`

Любая UX-affecting фаза обязана проходить на representative certification set.

### 3.5. Dual-book-type certification logic
Certification matrix после `Phase 4` делится на два обязательных слоя:

#### Protected certification layer
Покрывает migration-specific risks:
- bridge/adapter/runtime changes;
- protected rendering/layout behavior;
- protected selection/search/notes/share flows;
- protected security/copy invariants;
- protected route behavior.

#### Unprotected certification layer
Покрывает shared-shell and contract non-regression:
- old reader / unprotected route behavior;
- shell-level navigation;
- shell-level theme behavior;
- shell-level search UX semantics;
- shell-level notes/bookmarks/share entry behavior;
- sidebar/top-bar behavior;
- preview/localhost consistency.

Правило:
- если фаза меняет только protected internals, unprotected остаётся минимум mandatory non-regression layer;
- если фаза меняет shared shell behavior или reader contract semantics, unprotected становится mandatory contract-verification participant;
- к `Phase 11` оба book types обязательны в final certification, а не только protected path.

### 3.6. Unprotected certification baseline
Минимальный unprotected certification set после `Phase 4`:
- primary unprotected baseline book;
- unprotected book with search-heavy usage, если фаза затрагивает shared search semantics;
- unprotected book with notes/bookmarks/share coverage, если фаза затрагивает shared annotation/share shell behavior.

Unprotected path запрещено сводить к проверке “route opens”. Для relevant phases должны проверяться:
- navigation;
- theme;
- search;
- notes/bookmarks;
- share/export;
- sidebar/shell behavior;
- route semantics.

### 3.7. Whole-reader no-iframe certification clarification
До выполнения отдельной unprotected no-iframe completion branch certification matrix разделяется на два разных outcome levels:

#### Protected no-iframe certification
Достаточна для claim:
- protected path no longer depends on iframe/bridge.

#### Whole-reader no-iframe certification
Недостаточно одной protected certification.

Чтобы claim был допустим для всей читалки, дополнительно обязательны:
- unprotected no-iframe route/host readiness;
- unprotected no-iframe rendering host proof;
- unprotected feature parity under no-iframe architecture;
- localhost + preview green for unprotected no-iframe path;
- browser-level proof that whole-reader shell no longer relies on iframe boundaries.

## 4. Golden Baselines and Fixtures

### 4.1. Обязательные baseline artifacts
Должны существовать canonical baselines:
- representative notes payload fixtures;
- representative share payload fixtures;
- representative bookmark fixtures;
- representative search fixtures;
- representative protected sync fixtures;
- route behavior fixtures;
- representative state-transition traces;
- representative UX screenshots или structured UI snapshots там, где это полезно;
- representative security invariants.

### 4.2. Что именно сравнивается по доменам

#### Notes
- exported payload structure
- note count
- anchor fidelity
- import/export roundtrip fidelity

#### Share
- outgoing payload shape
- short-link creation behavior
- protected vs unprotected route preservation
- `n=<shareId>` route behavior

#### Bookmarks
- payload structure
- anchor stability
- create/delete/restore behavior

#### Search
- result structure
- match count semantics
- next/prev state
- return-to-origin behavior

#### Progress / counters
- page counter
- search counter
- note/bookmark counts where surfaced

#### Route behavior
- protected route semantics
- unprotected route semantics
- share/open behavior
- preview/public route consistency

#### Security invariants
- no hidden DOM text
- no production debug UI
- worker-only protected mode preserved

### 4.3. Golden baseline rule
Фраза “parity passed” недопустима без ссылки на:
- golden fixture;
- canonical state trace;
- structured UI baseline,
если для данного домена такой baseline определён.

## 5. Compatibility Corpus and Roundtrip Rules

### 5.1. Required compat corpus
Должен существовать отдельный compat corpus для:
- production note fixtures;
- production share fixtures;
- bookmark fixtures;
- search fixtures;
- protected sync file fixtures.

### 5.2. Roundtrip expectations

#### Обязаны roundtrip’иться losslessly
- notes payloads
- bookmark payloads
- share payloads до server submission
- protected sync payloads / bundles там, где они поддерживаются

#### Обязаны сохранять observable behavior
- search result navigation semantics
- share-link route reconstruction
- theme persistence behavior
- progress restoration behavior

#### Approximation допустима только если явно задокументирована
- незначимые визуальные отличия без потери anchors/UX semantics
- внутренний event ordering, если конечное user-visible behavior идентично

### 5.3. Automatic no-go incompatibilities
Автоматический stop, если появляется:
- потеря notes/bookmarks;
- изменение share payload contract;
- изменение route semantics protected vs unprotected;
- изменение search state contract, ломающего текущий UX;
- изменение sync file structure без compatibility strategy.

## 6. Performance and Memory Gates

### 6.1. Общий принцип
Correctness недостаточна. Каждая relevant phase обязана пройти performance/memory gates.

### 6.2. Базовое правило
Если не согласовано иное, новая фаза должна быть:
- не хуже baseline;
- либо в пределах заранее зафиксированного acceptable regression band.

### 6.3. Обязательные comparative checks

#### Initial load latency
- first protected load
- reopen after prior session restore

#### Next / prev page latency
- page turn forward
- page turn backward

#### Search latency
- submit to first match
- next / prev result latency

#### Note create latency
- create note
- delete note
- open notes pane latency

#### Font resize / reflow latency
- font size change to stable layout

#### Viewport resize / reflow latency
- resize to stable layout

#### Memory stability
- prolonged reading session
- repeated reload/reopen loops
- repeated theme toggle loops
- repeated navigation loops

### 6.4. Memory rule
Нельзя идти дальше, если появляется:
- runaway growth;
- unbounded accumulation over loops;
- materially worse memory stability than baseline.

### 6.5. Фазы, где perf/memory gates обязательны
- Phase 3
- Phase 4
- Phase 5
- Phase 6
- Phase 7
- Phase 8
- Phase 9
- Phase 10
- Phase 11

## 7. Module / File Migration Matrix

Ниже фиксируется, какие файлы/модули можно трогать, когда они становятся compatibility-only, и когда их удаление запрещено.

| Файл / модуль | Текущая роль | Целевая роль | Самая ранняя фаза изменений | С какой фазы compatibility-only | Самая ранняя фаза удаления | Когда удаление запрещено |
|---|---|---|---|---|---|---|
| `reader/index.html` | old reader route shell | preserved legacy route entry | 8+ только при необходимости compat wiring | никогда не должен становиться compatibility-only в рамках этой миграции | не входит в scope удаления | всегда запрещено до полного final non-regression proof |
| `reader/js/reader.js` | legacy old reader orchestration | preserved legacy path / isolated compat behavior | 3, только при явной compat изоляции | не ранее 8 | не удаляется в этом проекте | запрещено трогать в первых технических фазах без прямого обоснования |
| `reader/js/fbreader-ui.js` | legacy UX logic (search/notes/theme/etc.) | preserved old reader implementation, source of compat behavior | 3, только для compat isolation / listener fencing | не ранее 8 | не удаляется в этом проекте | запрещено использовать как место “быстрых фиксов” новой архитектуры |
| `reader_render_v3/integration/protected-old-shell-host.js` | текущий UI host для protected old-shell, bridge caller | transitional shell layer, затем direct shell/runtime integration point | 3 | 8 | не ранее 10 | removed on April 14, 2026 after ownership moved to `reader_render_v3/reader_new/protected-host-ui.js` |
| `reader_render_v3/integration/protected-reader-routing.js` | routing into protected reader paths | final route owner for direct protected path | 3 | 8 | не ранее 10 | removed on April 14, 2026 after ownership moved to `reader_render_v3/reader_new/protected-host-routing.js` |
| `reader_render_v3/integration/protected-reader-bootstrap.js` | bootstrap transport / init glue | direct runtime bootstrap | 3 | 8 | не ранее 10 | removed on April 14, 2026 after ownership moved to `reader_render_v3/reader_new/protected-host-bootstrap.js` |
| `reader_render_v3/integration/protected-reader-entry.js` | entry wrapper for embedded runtime path | direct runtime entry or compat entry | 3 | 8 | не ранее 10 | запрещено удалять до Phase 9 pass |
| `reader_render_v3/dev/protected-reader.js` | embedded runtime + harness layer | runtime-core source + temporary compat shell during extraction | 3 | 4 | не ранее 10 | запрещено wholesale-delete до завершения harness cleanup |
| `reader_render_v3/dev/protected-reader-compat-adapter.js` | explicit in-process compatibility adapter over runtime-core methods | bridge-shaped direct adapter surface for Phase 4 dual-path verification | 4 | 8 | не ранее 10 | запрещено удалять до завершения Phase 9 |
| `reader_render_v3/runtime/protected-worker-core.js` | worker core logic | final worker core logic | 3 | никогда | не удаляется | удаление вне scope |
| `reader_render_v3/runtime/protected-worker-client.js` | bridge/client-side worker wiring | final direct client-side worker adapter | 4 | 8 | не ранее 10 | запрещено удалять до final direct path stability |
| `reader_render_v3/runtime/protected-worker-protocol.js` | worker protocol definitions | final protocol / event contract support | 3 | никогда, если protocol remains in-process | вероятно не удаляется | удаление запрещено до contract freeze and direct path stabilization |
| runtime core modules | protected runtime state/render/search/selection internals | final runtime core | 3 | никогда | не удаляются как класс, а refactor only | запрещено массово переписывать до завершения Phase 2 |
| selection modules | selection lifecycle/hit-testing/state | final direct selection path | 5 | 8 | не ранее 10 для obsolete wrappers | запрещено early-delete до stable direct selection parity |
| search modules | old-search/protected search runtime integration | final direct search path | 5 | 8 | не ранее 10 | запрещено удалять compat export/state paths до parity proof |
| notes/share/bookmark modules | notes/bookmarks/share payload and UX integration | final direct notes/share/bookmark path | 5 | 8 | не ранее 10 | запрещено удалять compat payload generation до corpus pass |
| `invokeBridge` paths / bridge registry paths | host-to-embedded runtime transport | temporary compatibility transport only | 4 | 8 | 9 | запрещено удалять до zero-critical-dependency report |
| harness-only UI paths | debug/test UI around embedded runtime | compatibility-only diagnostics, затем delete | 3 | 3 | 10 | запрещено удалять до конца 9 и до доказанной стабильности |
| readiness runners / parity runners | regression/certification tooling | mandatory verification tooling | 0 | никогда | не удаляются до завершения rollout | удаление запрещено на всех фазах миграции |

### 7.1. Правило file-scope
- Ранние технические фазы не должны менять legacy files без прямой необходимости compat isolation.
- Первые рабочие изменения должны концентрироваться в `reader_render_v3/*`, а не в `reader/*`.
- Любое раннее изменение в `reader/js/reader.js` или `reader/js/fbreader-ui.js` требует явного compat justification.

## 8. Route / Flag Matrix Per Phase

Этот раздел фиксирует, какие route/flags обязаны существовать и когда они могут быть удалены.

| Route / flag / mode | Назначение | Вводится с фазы | Обязателен до фазы | Может быть объявлен deprecated с фазы | Может быть удалён с фазы | Localhost-only или preview-mandatory |
|---|---|---|---|---|---|---|
| old reader default route | legacy regression baseline | уже существует | до финального rollout и после него | не депрекейтится этой миграцией | не удаляется | localhost + preview mandatory always |
| protected old-shell route | основной protected baseline route | уже существует | минимум до завершения Phase 9 | 10 | не ранее post-migration decision, не в рамках этой фазы автоматически | localhost + preview mandatory |
| live/staging preview route | публичный verification target | уже существует | до конца миграции | никогда | не удаляется в рамках плана | preview mandatory |
| bridge-backed protected route | текущий production-like protected runtime transport | уже существует | до завершения Phase 8 | 8 | 9 | localhost + preview mandatory с UX-affecting фаз |
| in-process adapter route / mode | проверка direct transport без удаления bridge | 4 | до завершения Phase 9 | 9 | 10 | localhost-only в ранней части, затем preview mandatory |
| direct render route / flag | проверка rendering without iframe removal | 6 | до завершения Phase 9 | 9 | 10 | localhost first, затем preview mandatory |
| no-iframe final route | финальный protected runtime path | 9 | далее постоянно | не депрекейтится в этой миграции | не удаляется | localhost + preview mandatory |

### 8.1. Route policy
- Нельзя вводить финальный route раньше, чем direct path доказан на certification set.
- Нельзя удалять bridge-backed route до Phase 9.
- Нельзя удалять protected old-shell baseline route, пока final route не прошёл полную verification matrix.

## 9. Compatibility Layer Lifetime Matrix

### 9.1. Что считается compatibility layer
Compatibility layer в этом проекте включает:
- bridge transport;
- bridge-shaped adapter surface;
- summary/polling paths, которые ещё не заменены typed events;
- compat payload/export paths;
- harness-only UI, если он ещё нужен для migration diagnostics;
- route-level fallback на старый protected transport.

### 9.2. Матрица времени жизни

| Compatibility piece | Должен жить минимум до | Может быть downgraded с | Может быть удалён с | Удаление запрещено пока |
|---|---|---|---|---|
| bridge transport | конца Phase 8 | 8 | 9 | нет zero-critical-dependency proof |
| bridge-shaped adapter | конца Phase 9 | 8 | 10 | direct path не feature-complete |
| summary/polling compatibility paths | конца Phase 5 | 5 | не ранее 8 для remaining compat-only consumers | critical UX ещё зависит от polling |
| compat payload/export generation | конца Phase 9 и далее, если нужен production compat | никогда без explicit replacement proof | только если replacement proven identical | compat corpus не green |
| harness-only diagnostics UI | конца Phase 9 | 9 | 10 | нет final direct path stability proof |
| protected old-shell baseline route | до финального rollout decision | 10 | не автоматически в рамках этой миграции | final route не прошёл localhost+preview+certification |

### 9.3. Признаки, что compatibility layer ещё нельзя трогать
- хотя бы один critical flow всё ещё идёт через bridge;
- хотя бы один critical UX path зависит от summary/polling;
- compat corpus не green;
- preview route расходится с localhost;
- browser-level behavior contradicts synthetic pass;
- rollback path отсутствует.

## 10. Prerequisites Before Any Bridge Removal

До удаления `iframe/bridge` обязательно должны быть готовы:
- unified reader interface contract
- state ownership map
- in-process compatibility adapter
- typed events/subscriptions
- automated verification harness
- certification scope и certification matrix
- golden baselines and fixtures
- compatibility corpus and roundtrip rules
- preserved protected old-shell route
- preserved live/staging preview route
- preserved production-compatible note/share/search/bookmark formats
- rollback path to previous safe phase

Если хотя бы один пункт отсутствует, удаление bridge блокируется.

## 11. Phased Deployment / Publication Rules

### 11.1. Localhost-only phases
Следующие фазы могут оставаться localhost-only, пока не затрагивают user-visible route behavior:
- Phase 0
- Phase 1
- Phase 2
- ранние внутренние шаги Phase 3, если UX не меняется

### 11.2. Preview-mandatory phases
Начиная с первой фазы, которая меняет observable runtime behavior или route behavior, preview publication обязательна:
- Phase 3 close
- Phase 4
- Phase 5
- Phase 6
- Phase 7
- Phase 8
- Phase 9
- Phase 10
- Phase 11

### 11.3. Dual-pass rule
Для preview-mandatory phases продолжение запрещено, если:
- localhost зелёный, а preview нет;
- preview зелёный, а localhost нет;
- их поведение расходится.

### 11.4. Preview mismatch rule
Любой необъяснённый mismatch между localhost и preview — automatic no-go.

### 11.5. Canonical published preview rule
Когда фаза стала preview-mandatory, published preview route становится обязательной частью truth set. Нельзя продолжать реализацию, игнорируя preview.

## 12. Phased Execution Plan

### Phase 0 — Baseline Freeze and Constraints
**Цель**
- Зафиксировать baseline и operational constraints.

**Затрагивает**
- документацию
- baseline runners/checklists

**Что должно появиться на выходе**
- baseline matrix
- route inventory
- critical UX inventory
- compat inventory

**Что нельзя ломать**
- ничего; runtime/UI не меняются

**Automated checks**
- current localhost smoke
- current preview smoke
- old reader smoke
- protected route smoke

**Browser-level сценарии, которые Codex обязан сам прогнать**
- protected old-shell light/dark
- selection
- toolbar
- notes
- search
- share
- desktop/touch where relevant

**Performance/memory**
- запись baseline measurements

**Deliverables / Exit evidence**
- baseline document
- certification matrix stub
- baseline runner logs
- baseline perf/memory sheet

**Go / No-Go**
- no-go, если baseline не воспроизводится на localhost и preview

### Phase 1 — Unified Reader Interface Contract
**Цель**
- Зафиксировать единый interface contract до основной миграции.

**Затрагивает**
- спецификацию и документацию

**Что должно появиться на выходе**
- command surface
- event surface
- transport-agnostic interface contract

**Что нельзя ломать**
- runtime/UI не меняются

**Automated checks**
- baseline only

**Browser-level checks**
- baseline confirmation only

**Deliverables / Exit evidence**
- contract document
- command/event inventory
- coverage map against current bridge surface

**Go / No-Go**
- no-go, если contract не покрывает полностью:
  - navigation
  - theme
  - selection
  - search
  - notes/bookmarks
  - share/export
  - pagination/layout notifications

### Phase 2 — State Normalization and Ownership Map
**Цель**
- Жёстко определить ownership и replacement plan для polling/snapshots.

**Затрагивает**
- документацию и state inventory

**Что должно появиться на выходе**
- normalized ownership matrix
- list of summary/polling dependencies
- typed-event replacement map

**Что нельзя ломать**
- runtime/UI не меняются

**Automated checks**
- baseline only

**Browser-level checks**
- baseline confirmation only

**Deliverables / Exit evidence**
- ownership matrix
- summary/polling inventory
- replacement map

**Go / No-Go**
- no-go, если остаётся ambiguous ownership;
- no-go, если любой critical polling path не имеет replacement plan.

### Phase 3 — Runtime Core Extraction
**Цель**
- Отделить runtime core от harness/dev UI, не меняя transport model.

**Фактически выделено**
- runtime state initialization и entry/config normalization вынесены в отдельный runtime-core модуль;
- `protected-reader.js` остаётся harness/dev shell с DOM wiring, bridge registration и boot logic;
- integration glue (`protected-reader-bootstrap.js`, `protected-reader-entry.js`, `protected-reader-routing.js`, `protected-old-shell-host.js`) на этой фазе не переводится на новый transport и не теряет compatibility behavior.

**Технический долг к Phase 4**
- bridge, iframe и current route semantics остаются без изменений;
- typed events/subscriptions не вводятся;
- runtime core extraction сохранён без отката;
- full Phase-3 evidence package повторно прогнан и зелёный на localhost и published preview;
- бывшие preview-only blockers `check-old-reader-full-ux-parity.js` и `check-full-old-reader-ux-conformance.js` закрыты runner recovery pass без расширения scope;
- остаётся только non-blocking operational warning из pilot readiness:
  - production-payload reading-state import smoke skipped because `/tmp/reader_render_v3_prod_notes.json` is absent;
- переход к `Phase 4` разрешён только после отдельного явного старта следующей фазы, но не является частью этого recovery pass.

**Затрагивает**
- protected runtime internals
- harness isolation

**Что должно появиться на выходе**
- runtime core module
- harness UI, переставший владеть runtime state

**Что нельзя ломать**
- protected old-shell route
- preview route
- old reader path
- compat formats

**Automated checks**
- localhost protected route
- preview protected route
- old reader regression
- compat fixtures smoke

**Browser-level checks**
- selection
- toolbar
- search
- notes/bookmarks
- share
- theme

**Performance/memory**
- initial load
- page turn
- memory stability vs baseline

**Deliverables / Exit evidence**
- extraction summary
- green localhost runner
- green preview runner
- green compat fixtures
- perf/memory comparison report

**Go / No-Go**
- no-go, если изменился UX;
- no-go, если preview расходится с localhost;
- no-go, если compat fixtures падают.

### Phase 4 — In-Process Compatibility Adapter
**Цель**
- Ввести direct in-process adapter с тем же contract, сохранив bridge path.

**Фактически сделано**
- введён явный in-process adapter module:
  - `reader_render_v3/dev/protected-reader-compat-adapter.js`;
- bridge-shaped runtime surface теперь существует в двух совместимых формах:
  - legacy bridge facade: `window.__PROTECTED_READER_BRIDGE__`
  - direct adapter surface: `window.__PROTECTED_READER_COMPAT_ADAPTER__`;
- old-shell host умеет выбирать transport без смены route semantics:
  - default: legacy bridge
  - internal flag: `protectedCompatTransport=adapter`;
- bridge-to-adapter mapping зафиксирован отдельно в:
  - `reader_render_v3/docs/protected-reader/58-phase-4-bridge-to-adapter-mapping.md`;
- dual-path verification введён отдельным runner:
  - `reader_render_v3/tools/internal/check-phase4-adapter-parity.js`;
- full Phase-4 evidence package прогнан на localhost и published preview;
- bridge path, iframe path и current published routes сохранены.

**Intentionally not done yet**
- bridge removal;
- iframe removal;
- typed events/subscriptions replacement;
- direct rendering without iframe;
- route semantics rewrite;
- cleanup compatibility layer beyond explicit adapter coexistence.

**Затрагивает**
- adapter layer
- runtime call routing

**Что должно появиться на выходе**
- in-process compatibility adapter
- bridge-to-adapter mapping

**Что нельзя ломать**
- current bridge path
- current routes

**Automated checks**
- bridge path smoke
- adapter path smoke
- compat fixtures
- route behavior fixtures

**Browser-level checks**
- protected route contract parity scenarios

**Performance/memory**
- adapter overhead не должен materially regress baseline

**Deliverables / Exit evidence**
- adapter coverage report
- green dual-path checks
- green compat fixtures
- green route fixture checks

**Go / No-Go**
- no-go, если хоть один critical call живёт только в bridge path;
- no-go, если adapter не воспроизводит baseline state transitions.

### Phase 5 — Typed Events / Subscription Replacement
**Цель**
- Заменить critical summary polling на typed events/subscriptions.

**Затрагивает**
- runtime-to-shell state flow
- summary consumers

**Что должно появиться на выходе**
- event-driven runtime notifications
- polling-only paths downgraded to compatibility-only status

**Что нельзя ломать**
- selection
- search
- theme
- notes/share
- page navigation

**Automated checks**
- stale-state regressions
- theme-cycle regressions
- selection lifecycle checks
- search lifecycle checks
- compat fixtures

**Browser-level checks**
- repeated selection
- theme light/dark/light
- search return-to-origin
- notes open/edit/delete/share

**Performance/memory**
- no regression beyond accepted band for selection/search/theme flows

**Deliverables / Exit evidence**
- event/subscription spec
- removed/retired polling paths list
- green localhost and preview runners
- green perf report

**Go / No-Go**
- no-go, если critical UX всё ещё зависит от polling;
- no-go, если stale-state regressions сохраняются;
- compatibility layer остаётся обязательным, если хоть один critical flow ещё зависит от snapshots.

**Phase 5 factual status**
- completed with green localhost + preview evidence package;
- canonical UI-level events introduced:
  - `pageChanged`
  - `selectionChanged`
  - `searchStateChanged`
  - `annotationsChanged`
  - `themeChanged`
  - `readingPositionChanged`
  - `toolbarStateChanged`
- shared shell event vocabulary on unprotected path also includes:
  - `sidebarStateChanged`
  - `bookmarkUpdated`
  - `noteFocused`
- protected old-shell host no longer uses interval `getSummary()` polling as primary source of truth;
- adapter path now delivers canonical events, not only bridge-shaped calls;
- `getSummary()` remains available only as compatibility snapshot / bootstrap fallback;
- forbidden internal runtime event shapes are explicitly out of contract:
  - `onGlyphLayoutUpdated`
  - `onChunkReflow`
  - `onProtectedSelectionResolved`
  - `onInternalRenderStateChanged`
- reference docs:
  - `reader_render_v3/docs/protected-reader/60-phase-5-events-execution.md`
  - `reader_render_v3/docs/protected-reader/61-phase-5-event-model.md`

### Phase 6 — Direct Rendering Integration Without Iframe Removal
**Цель**
- Ввести direct rendering path behind flag, сохранив iframe route.

**Затрагивает**
- render surfaces
- coordinate spaces
- event routing

**Что должно появиться на выходе**
- direct render host path
- сравнимый render behavior under flag

**Что нельзя ломать**
- existing iframe route
- protected old-shell route
- preview route

**Automated checks**
- hit-test checks
- selection geometry checks
- light/dark checks
- route checks

**Browser-level checks**
- desktop mouse selection
- touch selection
- page turns
- theme cycles

**Performance/memory**
- load latency
- page turn latency
- resize/reflow latency
- memory stability in direct path

**Deliverables / Exit evidence**
- direct-render parity report
- green localhost and preview checks
- green perf/memory report
- certification-set partial pass report

**Go / No-Go**
- no-go, если есть coordinate drift;
- no-go, если direct path не проходит certification set;
- iframe path запрещено удалять, пока direct path не stabilised.

**Factual status after current implementation pass**
- direct old-shell render host flag introduced via `protectedRenderHost=direct`;
- iframe-backed old-shell path preserved;
- direct old-shell host now mounts protected runtime in-process and publishes bridge-shaped compat surface;
- direct mobile viewport sizing bug was fixed;
- focused touch recovery pass completed;
- touch-selection proof is green on localhost for iframe and direct paths;
- touch-selection proof is green on preview for iframe and direct paths;
- direct-render parity runner is green on localhost and preview;
- Phase 6 is complete after touch recovery, with only non-blocking pilot-readiness warning for absent production payload fixture.

### Phase 7 — Direct Runtime Feature Integration
**Цель**
- Подключить selection/search/notes/bookmarks/share/theme напрямую к новому shell через in-process runtime.

**Фактически выполнено**
- direct protected feature verification закрыта под явным сочетанием флагов:
  - `protectedCompatTransport=adapter`
  - `protectedRenderHost=direct`
- shell-level feature flows подтверждены как working against the shared contract on both:
  - bridge-backed protected old-shell path
  - direct protected old-shell path
- новым focused evidence runner зафиксирована parity по доменам:
  - selection / toolbar
  - search lifecycle
  - notes create / focus / list refresh
  - bookmark create / jump / delete / list refresh
  - share/export payload shape
  - theme / typography cycles
- unprotected old route остался в Phase 7 regression matrix и прошёл shell-contract checks for:
  - search
  - theme
  - sidebar
  - shared reader event vocabulary
- rollout smoke tooling обновлён, чтобы preview rollout checks ждали final protected ready state, а не transient `Loading runtime-safe artifact ...` state

**Что intentionally не сделано в этой фазе**
- bridge path не удалён
- iframe path не удалён
- bookmark persistence ownership в old-shell host остаётся legacy-backed
- dependency removal / bridge audit отложены до Phase 8

**Затрагивает**
- selection lifecycle
- search lifecycle
- notes/bookmarks flows
- share/export flows
- theme path

**Что должно появиться на выходе**
- feature-complete direct protected path under flag

**Что нельзя ломать**
- current protected route
- old reader path
- compat formats

**Automated checks**
- selection suite
- search suite
- notes/share suite
- bookmark suite
- theme suite
- compat corpus checks

**Browser-level checks**
- repeated selection desktop/touch
- search desktop/mobile
- note create/delete/share
- bookmark create/delete
- theme cycles

**Performance/memory**
- search latency
- note create latency
- font resize/reflow latency
- navigation-loop memory stability

**Deliverables / Exit evidence**
- green localhost runner
- green preview runner
- green compat corpus
- green perf report
- certification set pass report

**Go / No-Go**
- no-go, если any critical UX passes only on one book;
- no-go, если synthetic checks green, а browser behavior contradicts them;
- no-go, если compat roundtrip fails.

### Phase 8 — Bridge Decommission Readiness
**Цель**
- Доказать, что bridge больше не нужен для protected path.

**Затрагивает**
- dependency audit
- compatibility audit

**Что должно появиться на выходе**
- bridge dependency report
- rollback proof

**Что нельзя ломать**
- protected route
- preview route
- runners

**Automated checks**
- full localhost regression
- full preview regression
- old reader regression
- compat corpus
- perf regression

**Browser-level checks**
- full critical matrix on certification set

**Deliverables / Exit evidence**
- bridge dependency report with zero critical dependencies
- rollback path documented and tested
- green localhost + preview + compat + perf reports
- factual Phase 8 proof artifacts:
  - `reader_render_v3/docs/protected-reader/65-phase-8-bridge-readiness-execution.md`
  - `reader_render_v3/docs/protected-reader/66-phase-8-bridge-dependency-audit.md`
  - `reader_render_v3/docs/protected-reader/67-phase-8-rollback-proof.md`
  - `reader_render_v3/tools/internal/check-phase8-bridge-readiness.js`

**Go / No-Go**
- no-go, если хоть один critical feature всё ещё traverses bridge;
- no-go, если rollback path отсутствует;
- no-go, если preview mismatch persists.

### Phase 9 — Bridge Removal
**Цель**
- Удалить bridge как runtime dependency только для protected path после readiness proof.

**Затрагивает**
- protected bridge facade publication
- protected old-shell bridge transport glue
- protected-only iframe-backed transport fallback
- protected route defaults, которые раньше вели к bridge/iframe transport

**Что должно появиться на выходе**
- protected path is bridge-free in live runtime operation
- post-removal proof artifact for live protected path
- no hidden protected bridge usage on localhost and preview

**Что нельзя ломать**
- protected route
- old reader path
- compat formats
- preview route
- unprotected route
- shared shell contract for unprotected path

**Что намеренно не удаляется**
- unprotected legacy helpers and old-route runtime model
- harness / diagnostics beyond strict protected bridge-removal scope
- whole-reader iframe legacy outside the proven protected removal set
- whole-reader no-iframe completion branch

**Automated checks**
- full localhost regression
- full preview regression
- compat corpus
- perf comparison
- post-removal proof:
  - `reader_render_v3/tools/internal/check-phase9-post-removal-proof.js`
- readiness confirmation:
  - `reader_render_v3/tools/internal/check-phase8-bridge-readiness.js`
  - `reader_render_v3/tools/internal/check-unprotected-bridge-dependency.js`

**Browser-level checks**
- full critical matrix on certification set

**Deliverables / Exit evidence**
- bridge removal diff summary
- removal scope table
- post-removal proof report
- green localhost + preview + compat + perf reports
- narrow architectural claim only:
  - protected path no longer depends on bridge/iframe runtime transport
- explicit no-overclaim note that whole-reader no-iframe completion remains a later branch

**Go / No-Go**
- immediate rollback on critical regression;
- no-go, если browser-level behavior contradicts synthetic pass.

### Phase 10 — Harness Cleanup
**Цель**
- Удалить только тот protected-only harness/dev scaffolding, который после `Phase 9` доказано obsolete и больше не нужен live protected path.

**Затрагивает**
- production-visible integrated harness UI on protected route
- dead protected bridge leftovers, пережившие `Phase 9`
- dead polling/summary leftovers
- dead internal probes, не участвующие в readiness/support

**Что должно появиться на выходе**
- cleaner protected production path
- no production-visible harness/debug leakage on protected route
- preserved diagnostics minimum for support and `Phase 11` sign-off

**Что нельзя ломать**
- runtime diagnostics, необходимые для поддержки
- production routes
- runners
- unprotected old route
- future unprotected no-iframe branch separation

**Automated checks**
- full localhost regression
- full preview regression
- no hidden debug exposure checks
- diagnostics-minimum-preserved proof

**Browser-level checks**
- full critical matrix

**Performance/memory**
- не хуже baseline в accepted band

**Deliverables / Exit evidence**
- `reader_render_v3/docs/protected-reader/73-phase-10-harness-cleanup-execution.md`
- `reader_render_v3/docs/protected-reader/74-phase-10-cleanup-scope-table.md`
- `reader_render_v3/docs/protected-reader/75-phase-10-required-diagnostics-minimum.md`
- `reader_render_v3/tools/internal/check-phase10-cleanup-proof.js`
- green localhost + preview + compat + security + perf reports
- explicit note that only protected-path cleanup is complete; whole-reader no-iframe completion remains later

**Go / No-Go**
- no-go, если cleanup убирает последние нужные diagnostics раньше, чем стабильность доказана.
- no-go, если cleanup ломает existing readiness runners.

### Phase 11 — Final Rollout Readiness Check
**Цель**
- Формально закрыть current protected migration track и собрать final production-readiness package без whole-reader overclaim.

**Что должно появиться на выходе**
- final readiness package
- final claims matrix
- final known-limits / warnings summary
- explicit post-Phase-11 note that unprotected iframe removal remains future work in `Phase 12–14`

**Automated checks**
- all required suites green on localhost and preview

**Browser-level checks**
- full critical matrix on certification set

**Deliverables / Exit evidence**
- `reader_render_v3/docs/protected-reader/76-phase-11-final-readiness-execution.md`
- `reader_render_v3/docs/protected-reader/77-protected-migration-final-readiness-package.md`
- `reader_render_v3/docs/protected-reader/78-protected-migration-known-limits-and-warnings.md`
- `reader_render_v3/docs/protected-reader/79-post-phase-11-next-branch-summary.md`
- `reader_render_v3/docs/protected-reader/80-final-claims-matrix.md`
- `reader_render_v3/docs/protected-reader/81-protected-path-rollout-and-operations-summary.md`
- signed readiness checklist
- final certification report
- final perf/memory report
- final compat report

**Go / No-Go**
- rollout blocked unless all success criteria are met.
- no-go if final docs imply whole-reader no-iframe completion.

### Phase 12 — Unprotected Direct Runtime Readiness
**Цель**
- Подготовить unprotected path к removal of iframe architecture without changing current protected completion track и без удаления iframe в самой Phase 12.

**Затрагивает**
- unprotected runtime boundary audit
- unprotected iframe touchpoint inventory
- unprotected bridge-adjacent touchpoint inventory
- unprotected shell/runtime contract coverage
- unprotected direct runtime host requirements
- unprotected event/state/transport/rendering/feature surface map
- Phase 13 entry gates

**Что должно появиться на выходе**
- explicit unprotected no-iframe readiness report
- unprotected runtime boundary map
- unprotected direct-host feasibility proof
- explicit critical vs non-critical dependency classification
- explicit risk map for direct runtime adoption
- explicit verification matrix for Phase 13 and Phase 14
- explicit claim-boundary note that iframe for unprotected still remains present after Phase 12

**Что нельзя ломать**
- protected no-iframe path
- old reader baseline
- current unprotected production behavior

**Automated checks**
- unprotected contract verification
- route behavior checks
- theme/search/sidebar checks

**Browser-level checks**
- unprotected navigation
- unprotected theme
- unprotected search
- unprotected share/notes/bookmarks where applicable

**Deliverables / Exit evidence**
- unprotected readiness report
- localhost + preview green for current unprotected baseline
- feasibility evidence for no-iframe host transition
- `reader_render_v3/docs/protected-reader/82-phase-12-unprotected-direct-runtime-readiness-execution.md`
- `reader_render_v3/docs/protected-reader/83-unprotected-direct-runtime-readiness-package.md`
- `reader_render_v3/docs/protected-reader/84-unprotected-direct-runtime-known-limits-and-warnings.md`
- `reader_render_v3/docs/protected-reader/85-phase-12-to-14-branch-boundary-summary.md`

**Go / No-Go**
- no-go if Phase 12 documentation implies that unprotected iframe removal has already happened.
- no-go if critical vs non-critical dependencies are not explicitly separated.
- no-go if Phase 13 entry criteria remain ambiguous.

### Phase 13 — Unprotected Direct Rendering / Host Integration
**Цель**
- Ввести unprotected no-iframe render/runtime host path behind explicit flag, не меняя current protected completion track.

**Затрагивает**
- unprotected render host
- coordinate space / overlay integration
- shell/runtime feature wiring for unprotected backend

**Что должно появиться на выходе**
- unprotected direct host path under flag
- parity runner for unprotected iframe vs no-iframe path

**Что нельзя ломать**
- protected path
- shared shell contract
- old reader baseline

**Automated checks**
- unprotected direct-path parity runner
- shared shell contract checks
- perf sanity

**Browser-level checks**
- unprotected rendering behavior
- unprotected navigation/search/theme/selection where applicable
- localhost + preview

**Deliverables / Exit evidence**
- green localhost + preview parity for unprotected no-iframe path
- no hidden DOM text / no unexpected regressions

**Фактический статус после текущего выполнения**
- `unprotectedRenderHost=direct` route introduced
- default iframe route preserved
- localhost recovery proof confirms:
  - direct route mounts with `frameCount=0`
  - direct route renders book content into a direct host
  - direct route forms real paginated width
  - direct next/prev and page counter parity are green
  - direct persisted restore after next/reload and TOC+jump+reload is green
- preview proof confirms:
  - iframe baseline remains green
  - direct pagination proof is green
  - direct restore proof is green
  - direct-vs-iframe parity runner is green
- итог: `Phase 13 COMPLETE WITH WARNINGS`
- warnings remain narrow:
  - preview/localhost restore proof records multiple internal `display()` calls after reload, but the final restored location and visible counter are correct
  - iframe path remains the default path by design; iframe removal still belongs to later work
- before `Phase 14`, no whole-reader no-iframe claim is allowed and no iframe removal for unprotected has happened yet

### Phase 14 — Unprotected Feature Completion and Whole-Reader Certification
**Цель**
- Доказать, что no-iframe architecture applies to both protected and unprotected paths, so the claim becomes valid for the reader as a whole.

**Затрагивает**
- unprotected feature parity
- whole-reader certification
- final architecture claim validation

**Что должно появиться на выходе**
- whole-reader no-iframe certification package

**Automated checks**
- protected full regression
- unprotected full regression
- shared shell contract matrix
- localhost + preview full matrix

**Browser-level checks**
- protected and unprotected critical UX matrix

**Deliverables / Exit evidence**
- whole-reader no-iframe certification report
- final claim checklist proving iframe architecture removal for both book types

**Go / No-Go**
- no-go, если whole-reader no-iframe claim опирается только на protected path evidence.

### Remaining Phases — Dual-Book-Type Impact

#### Phase 5
- Primary implementation target: protected backend state flow.
- Unprotected path intentionally не переводится на protected event internals.
- Но typed events/subscriptions нельзя проектировать как protected-only global reader model.
- До старта `Phase 5` common contract zones и type-specific internals должны быть явно разделены.
- Unprotected обязан участвовать в shared contract verification и shell-level non-regression.

#### Phase 6
- Direct rendering work остаётся protected-specific implementation phase.
- Unprotected path не мигрируется на protected rendering internals.
- Но unprotected остаётся mandatory participant для shell-level regressions, route behavior и theme/search/navigation semantics.

#### Phase 7
- Direct runtime feature integration реализуется для protected backend.
- Все shell-level commands и user-visible semantics, которые становятся direct для protected, должны оставаться совместимыми с unprotected shell contract.
- На этой фазе unprotected уже обязателен не только как smoke baseline, а как shared UX certification participant по тем доменам, где shell behavior общий.

#### Phase 8
- Bridge decommission readiness касается protected transport path.
- Unprotected runtime не считается bridge-removal target в рамках текущей миграции.
- Но unprotected обязан оставаться полноправной частью regression matrix, чтобы bridge cleanup preparation не закрепила protected-only shell assumptions.
- Phase 8 close не даёт права объявить whole-reader no-iframe completion.

#### Phase 9
- Bridge removal относится только к protected path.
- Unprotected path обязан остаться рабочим как отдельный backend under shared shell.
- Любой route, shell или contract regression на unprotected path блокирует фазу так же, как и protected regression.
- Phase 9 close даёт только protected-level no-iframe success claim.

#### Phase 10
- Harness cleanup не должен удалить diagnostics, shell signals или verification hooks, которые ещё нужны для cross-book-type regression контроля.
- Cleanup запрещён, если после него protected path чистый, а unprotected shell contract verification теряет наблюдаемость или стабильность.

#### Phase 11
- Final readiness package обязан включать both book types:
  - protected migration certification;
  - unprotected final non-regression certification.
- Финальный rollout blocked, если shared shell contract green только для protected path.

#### Post-Phase-11 whole-reader completion branch
- Если конечный architectural claim должен относиться ко **всей** новой читалке, а не только к protected path, после текущей protected migration ветки обязателен отдельный unprotected no-iframe completion track.
- Этот track intentionally не входит в текущие `Phase 3..11` и не должен быть задним числом подразумеваем как already complete.

## 13. Phase Entry / Exit Checklists

Этот раздел не заменяет phased plan, а фиксирует короткие operational checklists перед стартом и перед закрытием фаз.

### Phase 3 — Entry
- Phase 0 complete
- Phase 1 complete
- Phase 2 complete
- baseline docs и certification matrix существуют
- golden fixtures и compat corpus зафиксированы хотя бы в baseline version

### Phase 3 — Exit
- runtime core extracted
- harness UI перестал владеть runtime state
- localhost green
- preview green
- compat fixtures green
- perf/memory comparison acceptable

### Phase 4 — Entry
- Phase 3 complete
- contract freeze не нарушен
- runtime core extraction validated on certification baseline

### Phase 4 — Exit
- in-process adapter covers required contract
- bridge path still works
- adapter path green
- route fixtures green
- no-go report absent

### Phase 5 — Entry
- Phase 4 complete
- adapter usable for all critical commands/events
- ownership map still valid
- dual-book-type target model defined explicitly
- common contract zones vs type-specific internals documented
- no ambiguity whether typed events are protected-only internals or shared shell contract semantics
- unprotected non-regression obligations for Phase 5 explicit
- Phase 4 adapter surface reviewed as contract input, not as protected-only reader model

### Phase 5 — Exit
- typed events cover critical UX
- summary polling no longer critical for key flows
- localhost green
- preview green
- stale-state regressions absent

### Phase 6 — Entry
- Phase 5 complete
- event model validated
- compatibility layer intact

### Phase 6 — Exit
- direct render path exists behind flag
- coordinate/hit-test checks green
- certification partial set passes
- iframe path still preserved
- touch-selection proof green on localhost
- touch-selection proof green on preview for published direct path

### Phase 7 — Entry
- Phase 6 complete
- direct render path stable enough on certification set
- compat corpus current and green

### Phase 7 — Exit
- direct path feature-complete under flag
- selection/search/notes/bookmarks/share/theme green
- localhost green
- preview green
- perf/memory acceptable

### Phase 8 — Entry
- Phase 7 complete
- no unresolved critical regression
- certification set green on direct path

### Phase 8 — Exit
- bridge dependency report shows zero critical dependencies
- rollback path tested
- direct path proven on localhost and preview
- bridge remains compatibility/rollback-only for protected path; removal still deferred to Phase 9

### Phase 9 — Entry
- Phase 8 complete
- zero-critical-bridge-dependency proof exists
- rollback path exists
- pre-Phase-9 unprotected bridge dependency check complete:
  - no critical unprotected bridge dependency proven for the scoped old-route critical flows;
  - localhost and preview evidence do not contradict each other;
  - `Phase 9` is not blocked by hidden bridge dependency on the current unprotected shell path.

### Phase 9 — Exit
- protected bridge runtime dependency removed
- `reader_render_v3/tools/internal/check-phase9-post-removal-proof.js` green on localhost and preview
- hidden protected bridge usage not detected
- protected path green
- unprotected path non-regressed
- compat/security green
- localhost + preview + perf green
- only protected-level no-iframe success claim allowed
- `Phase 10` allowed

### Phase 10 — Exit
- obsolete protected-only harness cleanup completed where proven safe
- production-visible harness/debug UI removed from integrated protected route
- dead protected `pollTimer` leftover removed from old-shell host state
- dead internal migration probes removed from `reader_render_v3/tools/internal/`
- required diagnostics minimum preserved:
  - runtime meta/status/selection diagnostics DOM
  - direct-path geometry/state surfaces
  - readiness/parity/conformance/security runners
  - post-removal and unprotected bridge dependency runners
- `reader_render_v3/tools/internal/check-phase10-cleanup-proof.js` green on localhost and preview
- hidden harness/debug leakage not detected on protected production path
- protected path green
- unprotected path non-regressed
- compat/security green
- localhost + preview + perf green
- only protected-path cleanup claim allowed; whole-reader no-iframe completion still remains a later branch
- `Phase 11` allowed

### Phase 11 — Exit
- final readiness package assembled
- final claims matrix honest and unambiguous
- protected current branch explicitly marked complete
- unprotected iframe removal explicitly marked future work in `Phase 12–14`
- localhost + preview + compat + security + perf green
- protected path green
- unprotected path non-regressed
- only protected-level production-ready / no-iframe-runtime-dependency claims allowed
- current protected migration track closed
- next branch is `Phase 12–14` for unprotected no-iframe completion

## 14. Explicit Go / No-Go Gates

### 14.1. Formal real-browser contradiction rule
Если automated/synthetic checks зелёные, но реальное browser-level behavior или user-observed behavior им противоречит, то:
- фаза автоматически считается failed;
- synthetic checks должны быть пересмотрены;
- миграция не может продолжаться.

Это жёсткое правило.

### 14.2. Дополнительные stop conditions
- Фаза не закрывается без evidence package.
- Нельзя идти дальше, если localhost pass, а preview нет.
- Нельзя идти дальше, если certification scope требует representative set, а прошла только одна книга.
- Нельзя идти дальше, если perf/memory materially regress beyond accepted band.

## 15. Explicit Non-Regression Requirements

Всё время миграции обязано оставаться рабочим:
- old reader default path
- protected old-shell route
- current live/staging preview route
- selection
- notes/highlights
- search
- theme
- page navigation
- share/export
- notes/bookmark compat formats
- no hidden DOM text
- no `/debug/`
- secure worker-only protected mode
- readiness runners

Нарушение любого пункта блокирует фазу.

### 15.1. Unprotected non-regression domains
Для unprotected path отдельно запрещено ломать:
- navigation;
- theme behavior;
- search UX semantics;
- notes/bookmarks shell-level behavior;
- share/export shell-level behavior;
- route behavior;
- sidebar/top-bar/shell behavior.

Правило для remaining phases:
- если фаза меняет только protected internals и не меняет shared shell contract, unprotected минимум проходит mandatory non-regression suite;
- если фаза меняет shell contract semantics, shell event model или shared shell UI behavior, unprotected обязан проходить расширенную contract-verification suite;
- отсутствие явной unprotected verification на shared-shell changes блокирует закрытие фазы.

### 15.2. Non-regression vs architectural completion
Нужно жёстко различать:

#### Unprotected non-regression
Это означает:
- current unprotected path remains working under the shared shell;
- shell contract semantics stay compatible;
- localhost + preview stay green for baseline checks.

#### Unprotected no-iframe migration completion
Это означает:
- unprotected path no longer uses iframe boundary as its runtime architecture;
- direct host/render integration proven;
- unprotected feature parity proven under no-iframe mode;
- localhost + preview certification green for that new path.

Completed `Phase 3..7` дают только первый результат.
Они **не** дают второй результат автоматически.

## 16. Automated Verification Strategy

### 16.1. Обязательные automated categories
- localhost protected route checks
- localhost old reader checks
- preview protected route checks
- preview old reader checks
- compat corpus checks
- perf/memory checks
- route behavior checks
- light/dark checks
- desktop/mobile/touch checks where relevant

### 16.2. Обязательные browser-level сценарии
- desktop light
- desktop dark
- repeated selection
- toolbar appearance/dismiss
- search open/submit/next/prev/return
- notes create/edit/delete
- bookmark create/delete
- notes share short-link
- page navigation
- sidebar close/open
- mobile/touch where applicable
- tablet where realistic

### 16.3. Manual-input rule
Если для продолжения требуется пользовательский логин или ручной ввод:
- Codex сначала должен дойти до границы полной автоматизации;
- показать, почему дальше без пользователя нельзя;
- только после этого просить ручное действие.

### 16.4. Unprotected no-iframe verification policy
Когда начнётся отдельная unprotected no-iframe completion branch, verification policy должна требовать не только non-regression, а именно architectural proof.

Минимум:
- localhost green for unprotected no-iframe path;
- preview green for unprotected no-iframe path;
- route semantics preserved;
- navigation/search/theme/sidebar/share shell contract green;
- notes/bookmarks/selection where applicable green;
- no hidden DOM text;
- no unexpected `/debug/` exposure;
- perf sanity within accepted band;
- browser-level proof that no iframe boundary remains in the unprotected runtime path.

### 16.4. Dual-book-type verification policy
После `Phase 4` verification strategy обязана различать:

#### Protected verification
- backend-specific runtime behavior;
- protected routes;
- protected rendering/selection/security behavior;
- protected compat corpus.

#### Unprotected verification
- old/unprotected route behavior;
- shared shell contract behavior;
- shell-level navigation/theme/search/notes/bookmarks/share semantics;
- preview/localhost consistency under shared shell.

Обязательное правило для remaining phases:
- ни одна фаза не считается complete, если protected checks green, а unprotected shared-shell checks не определены или не прогнаны там, где фаза затрагивает общий contract.

## 17. Risks and Failure Modes

### Selection migration risk
- Risk: coordinate drift, broken toolbar, gesture lifecycle regressions
- Mitigation: dedicated selection matrix on certification books
- Detection: repeated selection desktop/touch, light/dark
- Rollback: keep compatibility path until parity proven

### Search migration risk
- Risk: old-search UX regressions
- Mitigation: preserve search contract and golden traces
- Detection: search lifecycle checks
- Rollback: revert to previous search integration phase

### Notes / Share compat risk
- Risk: payload drift, short-link breakage
- Mitigation: golden fixtures + roundtrip rules
- Detection: compat corpus checks
- Rollback: keep old export path until parity proven

### Theme / Render lifecycle risk
- Risk: theme toggle breaks selection/search/toolbar
- Mitigation: mandatory light/dark/light checks on every relevant phase
- Detection: theme cycle regressions + browser checks
- Rollback: revert latest theme-affecting phase

### Stale state / ownership risk
- Risk: dual ownership, stale snapshots
- Mitigation: Phase 2 normalization before implementation
- Detection: ownership audit + stale-state checks
- Rollback: compatibility layer remains

### Route / Publication risk
- Risk: localhost passes, preview fails
- Mitigation: explicit preview gate policy
- Detection: preview comparison
- Rollback: phase blocked

### Worker / Main-thread boundary risk
- Risk: event or geometry drift after integration
- Mitigation: direct render phase before bridge removal
- Detection: hit-test and selection checks
- Rollback: keep iframe path

### Compatibility layer removal too early
- Risk: no safe rollback path
- Mitigation: compatibility layer mandatory until Phase 9 gate passes
- Detection: dependency audit
- Rollback: deletion forbidden

### Synthetic pass / real failure risk
- Risk: false confidence from automation
- Mitigation: formal contradiction rule
- Detection: real browser/manual contradiction
- Rollback: automatic phase fail

## 18. Phase Exit Evidence Requirements

Каждая фаза должна оставлять после себя конкретный evidence package.

Минимум:
- updated docs for that phase
- green localhost runner(s), required for the phase
- green preview runner(s), если preview обязателен
- green compat fixture/corpus checks, если фаза затрагивает compat
- green perf/memory comparison, если фаза влияет на runtime behavior
- certification-set pass report, если фаза UX-affecting
- no unresolved no-go report

Фаза не считается закрытой, пока evidence package не собран.

## 19. Safe Start of Implementation

### Minimal safe first coding phase
Минимально безопасная первая техническая фаза:
- **Phase 3 — Runtime Core Extraction**

### First implementation move
Первый реальный implementation move:
- начать с отделения runtime core от harness/dev UI;
- не трогать bridge removal;
- не трогать final route replacement;
- не трогать old reader route semantics.

### Safe file scope for first coding phase
На старте разрешено трогать в первую очередь:
- `reader_render_v3/dev/protected-reader.js`
- runtime core modules under `reader_render_v3/runtime/*`
- removed April 14, 2026: `reader_render_v3/integration/protected-reader-bootstrap.js`
- removed April 14, 2026: `reader_render_v3/integration/protected-reader-routing.js`
- `reader_render_v3/integration/protected-reader-entry.js`
- removed April 14, 2026: `reader_render_v3/integration/protected-old-shell-host.js`; ownership isolated in `reader_render_v3/reader_new/protected-host-ui.js`

### Files explicitly forbidden to touch first
На первом implementation шаге запрещено начинать с:
- удаления `invokeBridge` paths
- удаления bridge registry
- удаления `iframe` route
- удаления harness UI
- широких правок в `reader/js/reader.js`
- широких правок в `reader/js/fbreader-ui.js`
- любых early deletions compatibility layer
- любых route removals

### Forbidden early deletions
До завершения Phase 8 / readiness proof запрещено удалять:
- bridge transport
- protected old-shell route
- compat payload generation
- harness diagnostics, если они ещё нужны для migration verification

### Required proof before first real code PR is acceptable
До первого acceptable technical PR должны already be green:
- Phase 0 evidence package
- Phase 1 contract
- Phase 2 ownership map
- baseline localhost runners
- baseline preview runners
- baseline certification matrix
- baseline compat fixtures

Если этого нет, реализация технически стартовать не должна.

## 20. Success Criteria

Миграция считается успешной только если одновременно выполняется всё:
- no iframe/bridge in protected runtime path
- unified reader interface contract fully implemented
- unified reader interface contract пригоден для shared shell across protected and unprotected book types
- normalized state ownership with no critical overlap
- no critical UX dependency on summary polling
- protected books UX same or better than current protected old-shell baseline
- production-compatible notes/share/search/bookmark formats preserved
- localhost regression matrix green
- preview regression matrix green
- certification set green
- performance and memory within accepted bounds
- old reader path non-regressed
- unprotected path non-regressed
- protected backend migration does not force protected-only shell semantics onto unprotected path
- no hidden debug/harness UI in production path

### 20.1. Protected-path success criteria
Эти критерии достаточны, чтобы честно сказать:
- protected path no longer depends on iframe/bridge.

Для этого должны одновременно выполняться:
- `Phase 8/9` completed for protected path;
- protected runtime no longer depends on iframe/bridge;
- protected direct feature path green;
- bridge-backed baseline preserved through the required readiness/removal gates;
- localhost + preview green;
- compat + security green;
- unprotected path remains non-regressed under the shared shell contract.

### 20.2. Whole-reader success criteria
Эти критерии достаточны, чтобы честно сказать:
- the reader as a whole no longer relies on iframe architecture.

Для этого protected-path success criteria **недостаточно**.
Дополнительно должны одновременно выполняться:
- unprotected no-iframe completion branch completed;
- unprotected runtime path no longer uses iframe as architectural boundary;
- unprotected direct host/render integration certified;
- localhost + preview green for protected and unprotected no-iframe paths;
- whole-reader certification package green for both book types.

Подробная стратегия для этого отдельного outcome зафиксирована в:
- `reader_render_v3/docs/protected-reader/68-unprotected-no-iframe-completion-strategy.md`

## 21. Post-Phase-13 / Whole-Reader Removal Readiness

Current factual state after protected completion and unprotected direct-path introduction:
- protected path is already free of active iframe runtime dependency;
- unprotected direct path now has a new runtime with green restore/search/selection/annotations/bookmarks/TOC-shell flows on the audited `19686` and `45` corpus;
- whole-reader remove-iframe readiness is **not** achieved yet.

Current readiness decision:
- **NO-GO for real whole-reader iframe removal**

Exact reason:
- minimal edge-case corpus is not fully green for unprotected direct/runtime and restore semantics;
- multi-spine / cover-wrapper old-reader behavior still exposes runtime and proof instability;
- shared old-reader runtime still encodes iframe-default assumptions in navigation/input/theme/search rescue paths.

Authoritative readiness artifact:
- `reader_render_v3/docs/protected-reader/90-phase-14a-remove-iframe-readiness.md`

Next branch before any real iframe deletion:
- whole-reader remove-iframe hardening against the blocker register in `90-phase-14a-remove-iframe-readiness.md`

Explicitly still forbidden after this readiness pass:
- claiming the whole reader is iframe-free;
- claiming unprotected iframe removal is done;
- starting real iframe removal without clearing all `gating` blockers from the blocker register.
