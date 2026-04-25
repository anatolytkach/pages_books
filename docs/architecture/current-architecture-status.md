# WePub Current Architecture Status

## 1. Purpose

This document captures the current architecture of the WePub / ReaderPub system after the modular refactor.

It is intended to:
- define module ownership
- prevent regression into mixed concerns
- guide future development and refactoring
- provide context for both human developers and AI-assisted changes

---

## 2. Completed Refactor Phases

The following phases have been completed:

- Phase 1 — Extract route-domain handlers from `_worker.js`
- Phase 2 — Separate catalog metadata from publishing pipeline state
- Phase 3 — Introduce reader service boundary
- Phase 4 — Introduce permissions policy skeleton
- Phase 5 — Route core access checks through policy layer
- Phase 6 — Separate reader entitlements from admin permissions
- Phase 7 — Isolate commerce service boundary
- Phase 8 — Split frontend API behind compatibility facade
- Phase 9 — Remove dead inline `/api/v1` route logic from `_worker.js`

---

## 3. Backend Module Boundaries

### Catalog (`api/catalog/*`)
Owns:
- title metadata
- author/publisher relationships
- catalog-facing fields (genre, language, etc.)
- visibility facts

Does NOT own:
- pipeline state
- artifact generation
- access decisions

---

### Publishing (`api/publishing/*`, `api/protected-publishing/*`)
Owns:
- ingestion
- validation
- conversion
- artifact lifecycle
- publishing jobs and status

Does NOT own:
- catalog metadata
- reader behavior
- commerce logic

---

### Reader (`api/reader/*`, `api/reader-access/*`)
Owns:
- reader-facing endpoints
- notes / highlights / packages
- reader session payload construction

Does NOT own:
- entitlement resolution logic (delegates)
- publishing workflows
- pricing or offers

---

### Permissions (`api/permissions/*`)
Owns:
- permission vocabulary
- policy entry point (`can(...)`)
- admin/staff access decisions

Does NOT own:
- reader consumption decisions

---

### Entitlements (`api/entitlements/*`)
Owns:
- reader consumption access
- purchase/rental/subscription resolution
- tenant/publisher read access (legacy-compatible)
- "can read this book" logic

Does NOT own:
- admin/staff permissions

---

### Commerce (`api/commerce/*`)
Owns:
- offers
- pricing
- entitlement-facing commerce operations
- purchase-related logic

Does NOT own:
- reader delivery
- publishing workflow

---

### Shared (`api/shared/*`)
Owns:
- request context construction
- shared helpers
- transport utilities

---

## 4. Frontend API Boundaries

Frontend API is structured under:

```text
books/shared/api/

Modules:

core.js — transport and shared plumbing
catalog.js
publishing.js
identity.js
commerce.js
entitlements.js
permissions.js
reader.js (placeholder)
api.js — compatibility facade

All callers continue using:

import * as api from "books/shared/api.js";

## 5. _worker.js Role

_worker.js is now a routing shell only.

It owns:

fetch(...) entrypoint
route ordering
request normalization
static asset fallthrough
reader route rewriting
protected content delivery shell
non-extracted shell behaviors (SEO, notes-share, etc.)

It does NOT own:

domain logic
publishing workflows
entitlement logic
permission logic

## 6. Permissions vs Entitlements

This distinction is fundamental:

Permissions
admin/staff actions
example: title.publish, tenant.manage_members
Entitlements
reader consumption access
example: "user can read this book"

Rules:

permissions do NOT grant reading access
entitlements do NOT grant admin capability
they must remain separate systems

## 7. Deferred Concerns

The following areas are intentionally deferred:

Reader implementation consolidation (reader, reader1, reader_render_v3)
Scoped permission model (resource-level grants)
Cleanup of remaining helper overlap in _worker.js
Removal of legacy fallback logic outside /api/v1
Full separation of entitlement sources (currently preserves legacy mixed access)
Integrations abstraction (Stripe, Supabase, PostHog, etc.)

## 8. Rules for Future Changes
Do not reintroduce domain logic into _worker.js
Do not merge permissions and entitlements
Do not change route contracts casually
Do not redesign reader behavior in this branch
Prefer wrapping over rewriting
Prefer small, incremental changes over broad refactors
Preserve behavior unless explicitly changing it

## 9. Recommended Next Tracks
Reader consolidation strategy (external dependency acknowledged)
Scoped permissions design
Targeted cleanup passes (small, isolated)
Frontend feature alignment

---