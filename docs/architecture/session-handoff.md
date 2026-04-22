# Session Handoff

## Workspace
- Repo root: `C:\Users\yaran\Test1\pages_books`
- Active worktree: `C:\Users\yaran\Test1\pages_books\.worktrees\merge-reader-render-v3-staging-trim`
- Active branch: `refactor/module-boundaries-v1`
- Worktree status at handoff: clean

## Recent commits
- `cf17ca48d` `Add architecture notes for permissions and session handoff`
- `31cbe36ca` `Add permission grant-aware context and policy support`
- `8633cb7ca` `Add architecture stabilization docs and AGENTS guidance`
- `60494d58b` `Phase 9: remove dead inline api route branches from worker`
- `aab9e3c49` `Phase 8: split frontend API behind compatibility facade`

## Completed backend/frontend refactor phases
- Phase 1 - route-domain handler extraction from `_worker.js`
- Phase 2 - separate catalog metadata from publishing pipeline state
- Phase 3 - introduce reader service boundary
- Phase 4 - introduce permissions policy skeleton
- Phase 5 - route core access checks through policy layer
- Phase 6 - separate reader entitlements from admin permissions
- Phase 7 - isolate commerce service boundary
- Phase 8 - split frontend API behind compatibility facade
- Phase 9 - remove dead inline `/api/v1` route logic from `_worker.js`

## Current permissions redesign track
### Completed
- Step 1 - additive migration for `permission_grants`
- Step 2 - extend policy layer to support grants plus role mapping
- Step 3 - add grant-aware context/helper support
- Step 4 - apply grant-aware policy support to a small set of high-value routes

### Current state after Step 4
- `permission_grants` migration added in `supabase/migrations/007_permission_grants.sql`
- policy evaluation order is now:
  - superuser
  - explicit grant
  - role-derived permission
  - ownership fallback
  - deny
- shared context/helpers support:
  - resolving candidate grant scopes
  - fetching active grants
  - resolving explicit grant matches
  - resolving tenant role facts
  - resolving role-derived permission access
- routes still call `can(...)`
- routes do not query `permission_grants` directly

## High-value routes now using grant-aware policy evaluation
### Organization member-management
- `GET /tenants/:slug/members`
- `GET /tenants/:slug/roster`
- `DELETE /tenants/:slug/invitations/:id`
- `POST /tenants/:slug/invite`

### Core publishing/title-management
- `GET /publish/books/:id`
- `PATCH /publish/books/:id/metadata`
- `DELETE /publish/books/:id`
- `POST /publish/books/:id/publish`

### Offer management
- `POST /books/:id/offers`
- `PATCH /offers/:id`

## Permission mapping currently in code
Defined in `api/permissions/policy.mjs`.

- `owner`
  - `title.publish`
  - `artifact.reprocess`
  - `offer.manage`
  - `tenant.manage_members`
- `admin`
  - `title.publish`
  - `artifact.reprocess`
  - `offer.manage`
  - `tenant.manage_members`
- `publisher`
  - `title.publish`
  - `artifact.reprocess`
  - `offer.manage`
- `editor`
  - `artifact.reprocess`

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
  - permission = can manage/operate
  - capability = can use own feature
  - entitlement = can read
  - visibility = can see
  - lifecycle state = where the title is in workflow/publication

## Files most relevant to resume work
- `_worker.js`
- `api/permissions/policy.mjs`
- `api/permissions/context-helpers.mjs`
- `api/shared/context.mjs`
- `api/identity/handlers.mjs`
- `api/publishing/handlers.mjs`
- `api/protected-publishing/handlers.mjs`
- `api/commerce/handlers.mjs`
- `api/commerce/service.mjs`
- `supabase/migrations/007_permission_grants.sql`
- `docs/architecture/Permisions and Access model.md`

## Verification already completed
- `node --check _worker.js`
- `node --check books/shared/api.js`
- `node --check books/shared/api/core.js`
- `node --check books/shared/api/catalog.js`
- `node --check books/shared/api/commerce.js`
- `node --check books/shared/api/entitlements.js`
- `node --check books/shared/api/identity.js`
- `node --check books/shared/api/permissions.js`
- `node --check books/shared/api/publishing.js`
- `node --check books/shared/api/reader.js`
- `node --check api/permissions/policy.mjs`
- `node --check api/permissions/context-helpers.mjs`
- `node --check api/shared/context.mjs`
- `node --check api/identity/handlers.mjs`
- `node --check api/publishing/handlers.mjs`
- `node --check api/protected-publishing/handlers.mjs`
- `node --check api/commerce/service.mjs`
- `node --check api/commerce/handlers.mjs`

## Remaining routes intentionally left for later
- non-policy-backed admin/staff routes outside the small high-value set above
- reader-facing routes
- entitlement-based access paths
- any route where changing policy wiring could affect fallback semantics

## Recommended next step
- Continue with a conservative next permissions step only if needed:
  - expand grant-aware policy usage to another narrow admin/publisher route set
  - or add focused tests around `can(...)`, grant scope matching, and compatibility fallbacks

## Guardrails for the next session
- preserve route behavior exactly
- do not merge reader entitlements into admin permission logic
- keep routes calling `can(...)` instead of querying `permission_grants` directly
- preserve ownership fallback unless there is explicit approval to tighten semantics
- avoid broad repo-wide migration
