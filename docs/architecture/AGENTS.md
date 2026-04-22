
---

# 📄 2. `AGENTS.md`

```md
# AGENTS.md

## Purpose

This repository uses a modular monolith architecture with clearly defined boundaries between domains.

This file provides guidance for both human developers and AI tools (e.g., Codex) working in this codebase.

---

## Architecture Overview

Core backend modules:

- `api/catalog/*` — catalog metadata
- `api/publishing/*` — publishing pipeline
- `api/reader/*` — reader-facing endpoints
- `api/reader-access/*` — reader access routing
- `api/permissions/*` — admin/staff access policy
- `api/entitlements/*` — reader consumption access
- `api/commerce/*` — offers, pricing, purchase logic
- `api/shared/*` — shared context and helpers

Frontend API:

- `books/shared/api/*` — domain-aligned API modules
- `books/shared/api.js` — compatibility facade

---

## Critical Architectural Rules

### 1. `_worker.js` is a shell

It must NOT:
- contain domain logic
- implement publishing workflows
- implement permission or entitlement decisions

It SHOULD:
- route requests
- delegate to domain handlers
- handle static/asset fallthrough
- handle reader rewrite shell

---

### 2. Permissions vs Entitlements

- Permissions = admin/staff actions
- Entitlements = reader consumption access

Never merge these concepts.

---

### 3. Module Ownership

Each module owns its domain:

- Catalog → metadata
- Publishing → pipeline and artifacts
- Reader → consumption interface
- Permissions → admin access
- Entitlements → read access
- Commerce → offers and pricing

Do not cross boundaries without explicit reason.

---

### 4. Change Strategy

- No big-bang rewrites
- No microservice split
- Preserve external contracts
- Prefer wrapping existing logic
- Move code, don’t reinterpret it

---

### 5. Codex / AI Guidance

When using AI tools:

- use small, scoped prompts
- plan before implementing large changes
- review diffs before committing
- do not expand scope beyond the prompt
- do not refactor unrelated files

---

### 6. Reader Boundary

Reader implementation is currently evolving externally.

Rules:
- do not redesign reader rendering here
- do not merge reader implementations in this branch
- backend reader boundary should remain stable

---

### 7. What to Avoid

- putting logic back into `_worker.js`
- mixing commerce into reader or publishing
- mixing entitlements into permissions
- redesigning routes without explicit intent
- expanding scope beyond a single phase

---

## Working Model

Preferred workflow:

1. plan change
2. implement small step
3. review diff
4. commit
5. repeat

---

## Current State

The repository has completed a multi-phase modular refactor.

Future work should:
- build on these boundaries
- not collapse them