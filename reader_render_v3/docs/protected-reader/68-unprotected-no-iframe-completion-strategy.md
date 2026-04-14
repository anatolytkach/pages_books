# 68. Unprotected No-Iframe Completion Strategy

## 1. Why This Track Is Needed

Текущий migration plan уже покрывает:
- protected runtime extraction and direct integration;
- shared shell contract stabilization;
- mandatory non-regression for unprotected path.

Этого достаточно для protected-level claim, но недостаточно для whole-reader claim.

Нельзя смешивать два разных утверждения:
- `protected path no longer depends on iframe/bridge`
- `the reader as a whole no longer relies on iframe architecture`

Если финальная архитектурная цель относится ко всей новой читалке, то unprotected path требует отдельной no-iframe completion strategy.

## 2. Scope

Этот документ определяет, что именно считается завершением no-iframe migration для unprotected path.

В scope входят:
- unprotected runtime path without iframe architectural boundary;
- unprotected rendering/host integration in the shared shell;
- unprotected feature parity under the shared reader contract;
- localhost + preview certification for unprotected no-iframe path;
- final whole-reader no-iframe certification together with protected path.

В scope не входят:
- переписывание уже завершённых protected phases;
- откат или переопределение `Phase 3/4/5/6/7`;
- изменение текущего `Phase 8/9` protected scope;
- обязательная унификация внутренних runtime механизмов protected и unprotected.

## 3. Target Model

Целевая модель для whole-reader no-iframe architecture:
- same shell;
- same reader interface contract;
- no iframe runtime path for protected;
- no iframe runtime path for unprotected;
- backend internals may still differ where justified;
- no iframe boundary as architectural integration model for either book type.

Иными словами, whole-reader target model:
- `shared shell + shared contract + protected backend + unprotected backend`

Но при этом:
- ни один backend больше не должен опираться на iframe boundary как на основной runtime integration boundary.

## 4. What May Remain Backend-Specific

Даже после whole-reader no-iframe completion допустимо сохранять backend-specific различия:
- EPUB/unprotected parsing internals;
- layout and pagination internals;
- rendering implementation details;
- backend-local persistence details;
- backend-local import/export preparation details, если shell-level contract не расходится.

Недопустимо сохранять:
- iframe as architectural runtime boundary;
- separate shell-visible contract semantics for protected and unprotected;
- backend-specific event vocabulary, просачивающуюся в shared shell.

## 5. What Must Become Shared

Для whole-reader no-iframe claim общими должны быть:
- shell;
- route semantics at shell level;
- theme semantics;
- search contract;
- notes/bookmarks/share contract;
- event model at shell contract level;
- rendering host integration model without iframe boundary;
- readiness and verification signals;
- certification expectations for localhost and preview.

## 6. What Is Already Proven After Current Phases

После текущих completed phases уже доказано для unprotected path:
- shared shell contract remains non-regressed;
- navigation/search/theme/sidebar/share shell semantics участвуют в regression matrix;
- unprotected path является mandatory verification participant, а не только route-open smoke;
- dual-book-type strategy уже запрещает закреплять protected-only contract semantics как общую модель reader shell.

Также уже доказано, что:
- protected migration не должна ломать unprotected shell behavior;
- shared contract zones должны проектироваться с учётом обоих book types.

## 7. What Is Not Yet Proven

Для unprotected path ещё не доказано:
- direct runtime readiness without iframe boundary;
- direct rendering or equivalent no-iframe host integration;
- feature-complete no-iframe path under the shared shell contract;
- no-iframe readiness for notes/search/bookmarks/share flows where applicable;
- localhost + preview no-iframe certification comparable to protected path;
- final removal readiness for iframe dependency on unprotected path.

Ключевое правило:
- `unprotected non-regression` не равно `unprotected no-iframe completion`.

## 8. Proposed Completion Branch

Отдельная ветка whole-reader completion должна идти после текущего protected removal track.

Рекомендуемая структура:

### Phase 12 — Unprotected Direct Runtime Readiness
- определить unprotected runtime boundary;
- ввести explicit no-iframe runtime path or readiness layer;
- доказать shared contract coverage without iframe dependency as primary runtime boundary;
- сохранить old/unprotected baseline until parity proven.

### Phase 13 — Unprotected Direct Rendering / Host Integration
- создать новый unprotected runtime skeleton без iframe boundary;
- интегрировать direct render host для нового runtime;
- держать legacy iframe runtime отдельно и нетронутым;
- не переносить legacy EPUB.js iframe runtime в direct host.

### Phase 14 — Unprotected Feature Completion and Whole-Reader Certification
- довести features и parity для нового unprotected runtime;
- пройти dual-book-type no-iframe certification;
- только после этого разрешить whole-reader no-iframe claim.

## 9. Certification Requirements For Unprotected No-Iframe Completion

Чтобы честно сказать, что unprotected path тоже no-iframe ready, обязательно нужны:
- route behavior green;
- navigation green;
- search green;
- theme green;
- notes/bookmarks/share flows green where applicable;
- selection behavior green where applicable;
- rendering host behavior green;
- localhost green;
- preview green;
- browser-level proof, not synthetic-only proof;
- no hidden DOM text;
- no `/debug/`;
- security invariants preserved;
- performance sanity within accepted band.

Дополнительно обязательно:
- no contradiction between browser behavior and synthetic runners;
- no regression of shared shell contract across protected and unprotected paths.

## 10. Relation To Phase 8 / Phase 9

`Phase 8` и `Phase 9` в текущем плане относятся к:
- protected bridge dependency removal readiness;
- protected iframe dependency removal readiness and closeout.

Они не должны автоматически интерпретироваться как:
- whole-reader no-iframe completion;
- unprotected no-iframe certification;
- разрешение делать глобальный claim про всю reader architecture.

После `Phase 8/9` допустим только protected-level claim, если unprotected completion branch ещё не выполнен.

## 11. Claim Boundaries

### Protected-level success
Корректная формулировка:
- protected reader path no longer depends on iframe/bridge;
- protected direct runtime path is production-ready;
- shared shell contract remains green for protected and unprotected.

### Whole-reader success
Корректная формулировка допустима только после completion branch for unprotected:
- the reader as a whole no longer relies on iframe architecture;
- both protected and unprotected paths are certified under no-iframe runtime integration.

Нельзя говорить:
- `the reader no longer uses iframe architecture`

если доказательство существует только для protected path.

## 12. Decision Rule

До завершения unprotected no-iframe completion branch итоговые conclusions должны явно различать:
- protected migration success;
- whole-reader architectural success.

Любой rollout note, completion report или migration summary, который смешивает эти уровни, считается архитектурно некорректным.

## 13. Post-Phase-11 Clarification

После `Phase 11` должно читаться однозначно:
- protected migration branch complete;
- unprotected iframe still present;
- unprotected iframe removal is future work;
- future work remains reserved for `Phase 12–14`.

После `Phase 11` запрещено писать или подразумевать:
- that the reader as a whole is iframe-free;
- that unprotected books no longer use iframe architecture;
- that the unprotected legacy backend has already been replaced.

## 14. Phase-12 Readiness Packaging Rule

`Phase 12` является readiness-only фазой внутри unprotected completion branch.

Она обязана:
- зафиксировать фактическую unprotected iframe/bridge dependency baseline;
- отделить critical vs non-critical dependencies;
- определить direct runtime host requirements;
- определить migration surfaces for `Phase 13` and `Phase 14`;
- определить verification gates before any unprotected iframe removal work.

Она не имеет права:
- удалять iframe for unprotected;
- подразумевать unprotected completion;
- ослаблять already recorded warning boundaries;
- размывать distinction between protected completion and future unprotected work.

Связанный Phase 12 package:
- `reader_render_v3/docs/protected-reader/82-phase-12-unprotected-direct-runtime-readiness-execution.md`
- `reader_render_v3/docs/protected-reader/83-unprotected-direct-runtime-readiness-package.md`
- `reader_render_v3/docs/protected-reader/84-unprotected-direct-runtime-known-limits-and-warnings.md`
- `reader_render_v3/docs/protected-reader/85-phase-12-to-14-branch-boundary-summary.md`

## 15. Current Readiness Gate Before Real Iframe Removal

After the current Phase 13 recovery work, the correct conclusion is:
- unprotected direct path is proven on the audited `19686` route set;
- unprotected direct path is **not** yet proven as removal-ready for the minimal edge-case corpus;
- whole-reader iframe removal is therefore still blocked.

The current authoritative blocker register and go/no-go decision live in:
- `reader_render_v3/docs/protected-reader/90-phase-14a-remove-iframe-readiness.md`

This means:
- the unprotected iframe is still intentionally present;
- it is still required future removal work;
- real removal must not start until the readiness blocker register has no unresolved `gating` items.

## 16. Architectural Pivot After Failed Legacy Direct-Host Attempt

The attempted strategy
- “extract EPUB.js iframe runtime into a direct host and keep fixing edge cases”

is now explicitly rejected as the main migration path.

Why:
- the old runtime is iframe-coupled in layout, input, search, theme, and navigation ownership;
- multi-spine failures proved that patching the legacy model does not scale;
- the system keeps accumulating hybrid complexity instead of moving toward a clean replacement.

The replacement strategy is now authoritative:
- legacy unprotected runtime remains legacy-only;
- a new unprotected runtime must be built under the same shell and contract;
- the new runtime must be direct-host-native and iframe-free by design;
- parity must be proven on the new runtime before iframe removal is allowed.

Authoritative pivot architecture:
- `reader_render_v3/docs/protected-reader/91-unprotected-runtime-replacement-architecture.md`

Current implementation status after the first redefined `Phase 13` step:
- a new unprotected runtime skeleton exists behind an explicit route flag;
- legacy iframe path remains default and untouched;
- the new runtime is not yet parity-complete and does not authorize iframe removal.
- exact flag:
  - `unprotectedRuntime=new`
- exact current capability boundary:
  - runtime-owned API/state/events are present
  - direct render root is present
  - first renderable state is present
  - page-level location model is present
  - page-level pagination state is present
  - direct-host page rendering is present
  - restore is green on the current two-book corpus
  - runtime-owned search is green on the current two-book corpus
  - selection state is green on the current two-book corpus
  - highlights / notes are green on the current two-book corpus
  - bookmarks are green on the current two-book corpus
  - TOC jump and shell counter/theme/font wiring are green on the current two-book corpus
- exact intentionally missing capability boundary:
  - full parity against every legacy UX surface
  - broader corpus certification
  - iframe removal readiness

Execution audit artifact:
- `reader_render_v3/docs/protected-reader/86-phase-12-unprotected-iframe-dependency-audit.md`

Observed readiness result:
- bridge is not a proven critical blocker for the scoped unprotected old-route flows on localhost and preview;
- iframe-backed rendition boot, iframe-local touch/swipe delivery, iframe-local search lifecycle, and iframe-targeted theme application remain explicit blockers before `Phase 13`.

## Phase 13.5 Final Removal Decision

Canonical decision corpus:
- `19686`
- `45`
- `19&source=manual`

Decision:
- `GO_WITH_WARNINGS`

What is authorized now:
- the next phase may implement real unprotected iframe removal against the canonical certified runtime path.

What is still not authorized:
- protected iframe removal
- whole-reader no-iframe completion claims
- broader exploratory-corpus readiness claims beyond the canonical certified set

## Phase 14 Active-Path Removal Outcome

The unprotected active path is now iframe-free by default on the canonical certified corpus.

Exact default behavior now:
- `/reader/?id=...` on unprotected books boots the new runtime by default
- the legacy iframe runtime is no longer the default active path

Exact retained rollback behavior:
- `/reader/?id=...&unprotectedRuntime=legacy`

Exact scope boundary:
- this is an unprotected-path claim only
- this is not a protected-path claim
- this is not a whole-reader iframe-free claim
