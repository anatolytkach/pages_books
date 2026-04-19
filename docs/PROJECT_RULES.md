# Project Rules

## Scope

- Change only the subsystem required for the task.
- Keep `reader1/` work, protected-reader work, catalog work, and worker/runtime work separate unless the task explicitly crosses those boundaries.
- Do not refactor adjacent code without a task-level reason.

## Source Of Truth

- Code, configuration, and the current worktree are authoritative.
- Root context files must follow the code.
- Do not record guesses as facts.
- Do not introduce silent fallback routes, path substitutions, or alternate behaviors when config or user-requested behavior is missing. Fail explicitly instead.

## Reader Rules

- Treat `reader1/` as the reader for unprotected books.
- Treat `reader/reader_new.html` plus `reader_render_v3/` as the protected-only reader stack.
- Describe the protected reader as its own protected-only subsystem with its own host, runtime, tooling, and validation path.
- When changing launch behavior, verify both:
  - the catalog-side URL generation;
  - the receiving reader/runtime path.

## Tooling Rules

- Prefer the existing script entrypoints over ad hoc local commands.
- For protected-reader checks, use the `reader_render_v3/package.json` smoke commands first.
- For protected artifacts, use the protected-ingestion build and validate scripts before touching artifacts by hand.
- For catalog and SEO work, use the existing `tools/catalog/*` and `tools/seo/*` scripts rather than inventing one-off pipelines.

## Documentation Rules

- Keep root docs compact and handoff-oriented.
- Root docs should describe the current architecture, current tool entry points, and current boundaries.
- Root docs should present the repository as a two-reader system with clear ownership:
  - `reader1` for unprotected books;
  - `reader_new` / `reader_render_v3` for protected books.
- Historical phase docs are reference material, not startup material.
- Do not put cleanup history, debugging history, or long historical diaries into root context files.

## Updating Context Files

- Update context files in `docs/` after significant architecture, ownership, tooling, or workflow changes.
- Do not update context files in `docs/` for trivial UI or copy edits.
- Use:
  - `docs/PROJECT_CONTEXT.md` for stable architecture and tool entry points;
  - `docs/PROJECT_RULES.md` for standing workflow rules;
  - `docs/CURRENT_STATE.md` for current accepted operational reality;
  - `docs/COMPONENT_GUIDE.md` for component boundaries and cross-component risks.

## Verification

- Verify reader changes in the relevant form factor instead of relying only on static inspection.
- Verify catalog/routing changes by checking the generated URLs and the landing reader path.
- Verify protected-reader changes with the protected smoke tooling whenever possible.
