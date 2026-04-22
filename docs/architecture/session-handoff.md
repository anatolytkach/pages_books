# Session Handoff

## Workspace
- Repo root: `C:\Users\yaran\Test1\pages_books`
- Active worktree: `.worktrees\merge-reader-render-v3-staging-trim`
- Active branch: `refactor/module-boundaries-v1`

## Completed backend/frontend refactor phases
- Phase 1 — route-domain handler extraction from `_worker.js`
- Phase 2 — separate catalog metadata from publishing pipeline state
- Phase 3 — introduce reader service boundary
- Phase 4 — introduce permissions policy skeleton
- Phase 5 — route core access checks through policy layer
- Phase 6 — separate reader entitlements from admin permissions
- Phase 7 — isolate commerce service boundary
- Phase 8 — split frontend API behind compatibility facade
- Phase 9 — remove dead inline `/api/v1` route logic from `_worker.js`

## Current permissions redesign track
### Completed
- Prompt 1 — additive migration for `permission_grants`
- Prompt 2 — extend policy layer to support grants + role mapping
- Prompt 3 — add grant-aware context/helper support

### Current state after Prompt 3
- `permission_grants` migration added
- policy layer supports:
  - superuser
  - explicit grant
  - role-derived permission
  - ownership fallback
- shared context/helpers now support:
  - resolving candidate scopes
  - fetching active grants
  - resolving explicit grants
  - resolving role-derived access
- routes still call `can(...)`
- routes do not query `permission_grants` directly

## Business-model decisions locked
- canonical read-access evaluator:
  - lifecycle state
  - visibility
  - public/free
  - entitlement
  - preview/admin override
- org reading is `either`:
  - membership-based org access
  - or entitlement-based org access
- publisher preview access is a special access override powered by permissions
- canonical vocabulary:
  - permission = admin/operator authority
  - capability = self-scoped user feature ability
  - entitlement = right to read
  - visibility = can see
  - lifecycle state = workflow/publication state

## Current schema adaptation decisions
- existing schema remains the base
- keep:
  - `tenants`
  - `tenant_memberships.role`
  - `books`
  - `book_offers`
  - `entitlements`
  - current publishing tables
- additive schema approach only
- `permission_grants` is the key new table
- roles remain legacy/default permission templates for now

## DDL facts reviewed
Reviewed migrations for:
- Identity & tenancy
- Books & publication
- Commerce & entitlements
- helper function for content id sequence

## Next step
- Prompt 4 — migrate a very small set of routes so explicit permission grants can actually influence access through the existing policy layer

## Rules for next step
- preserve behavior exactly
- migrate only a few high-value routes
- do not touch reader access semantics
- do not redesign RLS
- do not remove role fallback