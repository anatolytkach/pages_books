# Phase 1 — Implementation Progress & Architecture Notes

## What Was Done

### Task 1.1 — Supabase Project Setup
**Status: Complete**

- Created hosted Supabase project at `https://kalbegycglkhxulhatpx.supabase.co`
- Email/password authentication enabled (Google OAuth deferred — requires Google Workspace or Cloud org account)
- Magic link auth available but untested in production yet

### Task 1.2 — Local Dev Environment
**Status: Skipped**

- Decided to work directly against the hosted Supabase instance instead of running local Docker
- All development and testing uses the production Supabase database

### Task 1.3 — Database Migration: Identity & Tenancy
**Status: Complete**

Created `supabase/migrations/001_identity_tenancy.sql`:
- `user_profiles` — extends Supabase `auth.users` with display name and avatar
- `tenants` — publishers, libraries, universities, distributors (slug-based, with optional custom domain)
- `tenant_memberships` — user-to-tenant relationship with role hierarchy (owner → admin → publisher → editor → librarian → member)
- `tenant_groups` — sub-groups within tenants (departments, courses, branches)
- `tenant_group_members` — user-to-group relationship
- `tenant_invitations` — email-based invitations with expiry tokens
- Trigger: `handle_new_user()` auto-creates a `user_profiles` row on signup
- Trigger: `update_updated_at()` auto-updates timestamps
- Full RLS policies: users see own profile, tenant members see co-members, admins manage tenants

### Task 1.4 — Database Migration: Books & Publication
**Status: Complete**

Created `supabase/migrations/002_books_publication.sql`:
- `genres` — controlled vocabulary with parent/child hierarchy, seeded with fiction/nonfiction/academic subcategories
- `books` — main book table with title, author, genre, status workflow (draft → processing → ready → published), visibility (public/tenant_only/private), `is_free` flag for Gutenberg books, `content_id` for R2 path mapping
- `source_assets` — uploaded source files (EPUB/DOCX) with validation status tracking
- `publication_batches` — ZIP batch upload tracking with progress counters
- `book_content_id_seq` — sequence starting at 200000 to avoid collision with existing Gutenberg IDs
- Full RLS policies: published public books visible to all, publishers see own drafts, tenant members see tenant-only books

### Task 1.5 — Database Migration: Commerce & Entitlements
**Status: Complete**

Created `supabase/migrations/003_commerce_entitlements.sql`:
- `book_offers` — purchase/rental offers with price, currency, rental duration
- `entitlements` — user's right to access a book (purchase, rental, library_borrow, subscription, institutional) with optional expiry
- `payout_accounts` — Stripe Connect accounts for tenant payouts
- `transactions` — payment records with Stripe session/intent IDs, platform fee tracking
- RLS: users see own entitlements/transactions, offer creators manage offers, entitlements/transactions created by service role only (Worker)

### Task 1.4b — Helper Functions
**Status: Complete**

Created `supabase/migrations/004_helper_functions.sql`:
- `nextval_content_id()` — RPC function to get next book content ID from sequence

### Migration Application
**Status: Complete**

- All migrations combined in `supabase/migrations/all_combined.sql`
- Applied to hosted Supabase via SQL Editor (all 4 migrations in one run)

### Task 1.6 — Auth Client Library
**Status: Complete**

Created browser-side auth modules in `books/shared/`:

- **`config.js`** — Platform configuration loaded from `<meta>` tags (injected by Worker via HTMLRewriter) with fallback to hardcoded values:
  - `supabaseUrl`: `https://kalbegycglkhxulhatpx.supabase.co`
  - `supabaseAnonKey`: public anon key
  - `stripePublishableKey`: (empty, for future use)
  - `apiBase`: `/books/api/v1` (platform API prefix)

- **`supabase-client.js`** — Singleton Supabase client using `window.supabase` from CDN script tag. Exports `getClient()`, `getSession()`, `getAccessToken()`.

- **`auth.js`** — Authentication helpers: `signUp()`, `signIn()`, `signInWithGoogle()`, `signInWithMagicLink()`, `signOut()`, `getUser()`, `getProfile()`, `updateProfile()`, `getTenantMemberships()`, `hasRole()`. All return `{ data, error }` Supabase convention.

- **`api.js`** — Platform API client wrapping `fetch()` with automatic JWT injection from Supabase session. Exports `api.get/post/patch/put/delete` plus typed helpers: `uploadBook()`, `getBookDraft()`, `updateBookMetadata()`, `publishBook()`, `getGenres()`, `checkEntitlement()`, `getBookOffers()`, `createCheckout()`, `getMyEntitlements()`, `getMyTenants()`, `createTenant()`.

### Task 1.7 — Auth UI
**Status: Complete**

- **`books/auth/index.html`** — Login/signup page matching existing site design (teal accent, Source Sans 3 / Playfair Display fonts, cream gradient panels). Features:
  - Tab toggle between Sign In and Sign Up
  - Email + password sign in
  - Email + password sign up with display name
  - Magic link sign in
  - Google OAuth button (ready when Google provider is configured)
  - Error/success alerts with loading spinners
  - `?returnTo=` query param for post-auth redirect
  - Auto-redirects to catalog if already signed in

- **`books/auth/callback.html`** — Handles OAuth and magic link redirects. Waits for Supabase to establish session from URL tokens, then redirects to returnTo or catalog.

- **`books/shared/user-menu.js`** — `<user-menu>` web component (Shadow DOM):
  - Signed out: shows "Sign in" link styled as a bordered button
  - Signed in: shows avatar image or initials in a teal circle
  - Dropdown menu: user name, email, My Account, My Books, Publish, Sign Out
  - Loads profile from `user_profiles` table for display name and avatar
  - Listens for auth state changes to update in real-time

- Added `<user-menu>` element and Supabase CDN script to:
  - `books/index.html` (main catalog page served at `/books/`)
  - `catalog/index.html` (alternate catalog copy)
  - `reader/index.html` (reader page)

### Task 1.8 — Worker Auth Middleware
**Status: Complete**

Updated `_worker.js` with:

- **JWT verification** (`verifySupabaseJwt()`) — HMAC-SHA256 verification using `SUPABASE_JWT_SECRET` env var. Extracts user payload (sub, email, role) from Supabase JWTs. Uses Web Crypto API (no external dependencies).

- **Platform API routes** under `/books/api/v1/`:
  - `GET /v1/me` — current user profile (auth required)
  - `GET /v1/me/entitlements` — user's book entitlements with book details (auth required)
  - `GET /v1/me/tenants` — user's tenant memberships (auth required)
  - `GET /v1/genres` — list all genres (public)
  - `GET /v1/books/:id/entitlement` — check book access: returns free/purchase/rental/none with offers (public+auth)
  - `GET /v1/books/:id/offers` — list active offers for a book (public)
  - `POST /v1/tenants` — create a new tenant, creator becomes owner (auth required)
  - CORS preflight handling for all routes

- **Supabase REST API integration** from Worker using service role key:
  - `sbFetch()` — generic Supabase REST API caller
  - `sbRpc()` — Supabase RPC caller
  - All database operations go through Supabase REST API (not direct Postgres), so RLS policies are enforced when using anon key, and bypassed when using service role key

- Added no-cache headers for `/books/auth/` paths

---

## Application Architecture

### Domain & Hosting

- **Production domain**: `https://reader.pub`
- **Pages deployment**: `https://reader-books.pages.dev` (Cloudflare Pages project: `reader-books`)
- **Cloudflare account**: `Anatoly@tkach.me's Account` (ID: `764a8c94ce002764fc1d3d29faa4bb09`)
- Deploy command: `CLOUDFLARE_ACCOUNT_ID=764a8c94ce002764fc1d3d29faa4bb09 npx wrangler pages deploy deploy/ --project-name reader-books --branch production --commit-dirty=true`

### Two-Worker Architecture

There are **two separate Cloudflare Workers** serving the site:

#### 1. `reader-books` (Cloudflare Pages project)
- **Source**: `_worker.js` in this repo (deployed via `deploy/` directory)
- **Domain**: `reader-books.pages.dev`
- **Bindings**: `ASSETS` (Pages static files), `READER_BOOKS` (R2 bucket — only works on pages.dev, not on custom domain)
- **Responsibilities**:
  - Serve static assets (catalog, reader, auth pages, shared JS)
  - Notes share API (`/books/api/notes-share`)
  - Translate API (`/books/api/translate`)
  - R2 catalog index API (`/books/api/*.json`)
  - **New**: Platform API (`/books/api/v1/*`) with JWT auth
  - SEO page rendering (`/book/`, `/author/`, `/category/`)
  - HTMLRewriter for injecting env config into HTML meta tags

#### 2. `reader-books-router` (standalone Worker)
- **Source**: NOT in this repo — managed separately (visible in Cloudflare dashboard)
- **Domain**: `reader.pub` (custom domain)
- **Bindings**: `BOOKS` (R2 bucket — note: different binding name than Pages worker)
- **Responsibilities**:
  - Routes requests from `reader.pub` to the appropriate handler
  - Serves R2 content directly for `/books/api/` and `/books/content/` paths (using its own R2 binding)
  - Proxies to `reader-books.pages.dev` for: `/books/`, `/books/assets/`, `/books/shared/`, `/books/auth/`, `/books/api/v1/`
  - Proxies reader pages with path rewriting (`/books/reader/` → `/reader/`)
  - Handles SEO routes by delegating to the Pages worker's `renderSeoRoute()`
  - Serves its own `robots.txt`
  - Returns 404 for unrecognized paths

**Important routing detail**: The router has an **explicit allowlist** of paths it proxies. When adding new page directories (like `/books/auth/`, `/books/publish/`, `/books/account/`), the router must be updated to include them. This is done via the Cloudflare dashboard → Workers & Pages → reader-books-router → Quick Edit.

**Current router proxy paths** (as of 2026-03-17):
```js
path === "/books/" || path === "/books/index.html" ||
path === "/books/catalog.config.json" ||
path.startsWith("/books/assets/") ||
path.startsWith("/books/shared/") ||
path.startsWith("/books/auth/") ||
path.startsWith("/books/api/v1/")
```

### Deploy Directory Structure

The `deploy/` directory uses **Windows symlinks** (created manually, not Git symlinks) pointing to source directories:

```
deploy/
├── _worker.js  → ../_worker.js        (symlink)
├── books/      → ../books/            (symlink — contains catalog, auth, shared, content)
├── reader/     → ../reader/           (symlink)
├── docs/       → (actual directory)
└── .wranglerignore
```

**Critical note**: The catalog page served at `/books/` comes from `books/index.html`, NOT `catalog/index.html`. The old `deploy/catalog` symlink was removed and should not be recreated. Changes to the live catalog must be made in `books/index.html`.

### Environment Variables

#### Cloudflare Worker (reader-books Pages project)
Set in Cloudflare dashboard → Workers & Pages → reader-books → Settings → Environment Variables:
- `SUPABASE_URL` = `https://kalbegycglkhxulhatpx.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` = *(secret — from Supabase Settings → API)*
- `SUPABASE_JWT_SECRET` = *(secret — from Supabase Settings → API → JWT Settings)*
- `READERPUB_GOOGLE_CLIENT_ID` = *(existing — for Google Drive sync)*
- `READERPUB_GOOGLE_TRANSLATE_API_KEY` = *(existing — for translation)*
- `DOCS_AUTH_USER` / `DOCS_AUTH_PASS` = *(existing — for /docs/ basic auth)*

#### Cloudflare Worker (reader-books-router)
Has its own env vars configured separately, including:
- `BOOKS` — R2 bucket binding (same bucket as `READER_BOOKS` in Pages worker, different binding name)

#### Browser (public, hardcoded in config.js)
- Supabase URL and anon key — safe to expose, RLS protects data
- Stripe publishable key — safe to expose (empty until Stripe is set up)
- API base path — `/books/api/v1`

### Supabase Configuration

- **Project URL**: `https://kalbegycglkhxulhatpx.supabase.co`
- **Auth providers enabled**: Email/password
- **Auth providers available but not configured**: Google OAuth, Magic Link
- **URL Configuration**:
  - Site URL: needs to be set to `https://reader.pub`
  - Redirect URLs: should include `https://reader.pub/books/auth/callback`
- **Database**: All Phase 1 tables created with RLS policies

### File Layout (New & Modified Files)

```
pages_books/
├── _worker.js                          # MODIFIED: added JWT verification, platform API routes, auth path caching
├── books/
│   ├── index.html                      # MODIFIED: added <user-menu> + Supabase script (THIS IS THE LIVE CATALOG)
│   ├── auth/
│   │   ├── index.html                  # NEW: login/signup page
│   │   └── callback.html               # NEW: OAuth/magic link callback handler
│   └── shared/
│       ├── config.js                   # MODIFIED: updated with production Supabase URL and anon key, API base
│       ├── supabase-client.js          # NEW: Supabase client singleton
│       ├── auth.js                     # NEW: authentication helpers
│       ├── api.js                      # NEW: platform API client with JWT injection
│       ├── user-menu.js               # NEW: <user-menu> web component
│       └── drive-sync.js              # EXISTING: unchanged
├── catalog/
│   └── index.html                      # MODIFIED: added <user-menu> + Supabase script (NOT the live catalog)
├── reader/
│   └── index.html                      # MODIFIED: added <user-menu> + Supabase script
├── supabase/
│   └── migrations/
│       ├── 001_identity_tenancy.sql    # NEW: users, tenants, memberships, groups, invitations
│       ├── 002_books_publication.sql   # NEW: genres, books, source_assets, publication_batches
│       ├── 003_commerce_entitlements.sql # NEW: offers, entitlements, payouts, transactions
│       ├── 004_helper_functions.sql    # NEW: nextval_content_id() RPC
│       └── all_combined.sql            # NEW: all migrations concatenated for easy application
└── deploy/                             # Symlinks to source directories
```

---

## Remaining Phase 1 Tasks

| # | Task | Status |
|---|------|--------|
| 1.1 | Supabase project setup | Done |
| 1.2 | Local dev environment | Skipped (using hosted) |
| 1.3 | Migration: identity & tenancy | Done |
| 1.4 | Migration: books & publication | Done |
| 1.5 | Migration: commerce & entitlements | Done |
| 1.6 | Auth client library | Done |
| 1.7 | Auth UI | Done |
| 1.8 | Worker auth middleware | Done |
| 1.9 | Publisher console UI | Done |
| 1.10 | Upload API endpoint | Done |
| 1.11 | EPUB validation & processing | Done |
| 1.12 | Metadata completion API | Done (including catalog index integration) |
| 1.13 | Book offers API | **Next** |
| 1.14 | Stripe setup | Not started |
| 1.15 | Checkout flow | Not started |
| 1.16 | Entitlement check API | Done (basic — in Task 1.8) |
| 1.17 | WeRead entitlement gate | Not started |
| 1.18 | Book detail page | Not started |
| 1.19 | My Account page | Not started |
| 1.20 | Tenant creation | Done (basic — POST /v1/tenants in Task 1.8) |
| 1.21 | Environment config | Done (staging + production) |
| 1.22 | Integration testing | Not started |
| 1.23 | Deploy to production | Not started (staging validated) |

---

## Session 2 (2026-03-18): Environment Setup, Publisher Console, Catalog Index

### Environment & Version Control Setup

- Created `develop` branch for development, `master` remains production
- All Phase 1 work committed and pushed to `origin/develop`
- Staging environment configured:
  - Pages project: `readerpub-website-staging` (production branch changed to `develop`)
  - Domain: `staging.reader.pub` (CNAME direct to Pages, no router)
  - R2 binding `READER_BOOKS` → bucket `reader-books` (shared with production)
  - Supabase env vars set (shared DB with production)
  - Cloudflare Access protection on staging domain
- Deploy scripts created: `scripts/deploy-staging.sh`, `scripts/deploy-production.sh`, `scripts/setup-deploy-symlinks.sh`
- `catalog/index.html` removed (Anatoly deleted it from master; `books/index.html` is the live catalog)
- Merged Anatoly's master changes (SEO rendering, PostHog, category routing) into develop
- Router worker (`reader-books-router`) updated to proxy `/books/auth/` and `/books/api/v1/` paths

### Task 1.9 — Publisher Console UI
**Status: Complete**

Created `books/publish/index.html`:
- Auth-gated page (redirects to `/books/auth/` if not signed in)
- "My Books" list showing all books published by the current user
- Upload flow with drag-and-drop, file picker (.epub only for Phase 1), progress bar
- Metadata editor: title, author, genre (dropdown from DB), year, ISBN, language, annotation
- Status badges (draft, processing, ready, published, failed)
- Validation error display
- Save metadata and Publish buttons
- Polling for processing completion after upload

### Task 1.10 — Upload API Endpoint
**Status: Complete**

Added `POST /v1/publish/upload` to Worker:
- Accepts multipart form upload with EPUB file
- Stores source file in R2 at `uploads/<uuid>/<filename>`
- Gets next `content_id` from Supabase sequence (starts at 200000)
- Creates `books` row (status: processing) and `source_assets` row
- Triggers inline EPUB processing

### Task 1.11 — EPUB Validation & Processing
**Status: Complete**

Added inline EPUB processor to Worker (`processEpub` function):
- Custom ZIP parser using Web Crypto `DecompressionStream("deflate-raw")`
- Validates `META-INF/container.xml` exists
- Checks for DRM encryption (rejects encrypted EPUBs)
- Parses OPF to extract title, author, language, cover image path
- Unpacks all EPUB files to R2 at `content/<contentId>/`
- Updates book metadata and status in Supabase
- On failure: marks book as `failed` with validation errors

### Task 1.12 — Metadata Completion API + Catalog Index Integration
**Status: Complete**

Added Worker API routes:
- `GET /v1/publish/books` — list user's books
- `GET /v1/publish/books/:id` — get book draft with source asset info
- `PATCH /v1/publish/books/:id/metadata` — update metadata fields
- `POST /v1/publish/books/:id/publish` — transition to published status

**Catalog index integration** — when a book is published, incrementally updates R2 catalog indexes:
- Author detail file (`a/<authorKey>.json`)
- Prefix browse tree (`p/<prefix>.json`) — walks existing tree depth dynamically
- Search tokens (`search/<token>.json`) — 2 and 3 char prefixes from title and author words
- Letters index (`letters.json`)
- **Critical finding:** The catalog UI reads from language-specific indexes (`api/lang/en/`), not the root `api/` path. The index updater now writes to BOTH the root and the language-specific path based on the book's language.

### Key Technical Findings

1. **JWT algorithm**: Supabase now signs JWTs with ES256 (ECDSA), not HS256. Changed `verifySupabaseJwt` to validate tokens by calling Supabase's `/auth/v1/user` endpoint instead of local HMAC verification.

2. **Catalog index naming**: Author keys use first+last format (`rexhurst` for "Hurst, Rex"), but the prefix browse tree uses last+first index key (`hurstrex`). This matches the Python indexer's `parse_author_name` which builds `index_name = "{last} {rest}"`.

3. **Prefix tree depth varies**: The tree is not fixed at 3 levels. Common prefixes go deeper (e.g., `s` → `sc` → `sco` → `scot` → `scott`). The index updater walks the existing tree dynamically to find the correct leaf node.

4. **Language-specific indexes**: The catalog defaults to English view which reads from `api/lang/en/`. The root `api/` index is used for "All languages" view. Both must be updated when publishing.

5. **Staging has no router**: Unlike production (`reader.pub`) which uses `reader-books-router` to serve R2 content, staging (`staging.reader.pub`) is a direct CNAME to the Pages project. The Pages worker needed a `/books/content/` R2 handler added to serve book content on staging.

6. **catalog.config.json uses relative URLs**: Changed `baseUrl` from `https://reader.pub/books/api` to `/books/api` so the catalog works on both staging and production without CORS issues.

7. **Cloudflare Access blocks API calls**: On staging, Cloudflare Access intercepts fetch() requests to `/books/api/v1/` paths. Testing should use the `.pages.dev` URL directly, or the Access policy should bypass API paths.

---

## Known Issues & Notes

1. **Router updates required for new pages**: Any new page directory (e.g., `/books/account/`) must be added to the `reader-books-router` worker's proxy allowlist via the Cloudflare dashboard. Currently proxied: `/books/`, `/books/assets/`, `/books/shared/`, `/books/auth/`, `/books/api/v1/`.

2. **Google OAuth not configured**: Auth UI has the button commented out. Requires Google Workspace or Cloud Console project with OAuth credentials.

3. **Supabase URL Configuration**: Site URL and redirect URLs should be verified in Supabase dashboard → Authentication → URL Configuration.

4. **R2 binding names differ**: Pages worker uses `READER_BOOKS`, router worker uses `BOOKS`. Same bucket `reader-books`.

5. **Deploy symlinks**: `deploy/` directory uses Windows symlinks. Recreate with `scripts/setup-deploy-symlinks.sh` on new machines. `deploy/catalog` symlink removed (catalog/index.html deleted).

6. **Content ID sequence gaps**: Failed upload attempts consume sequence numbers. Current sequence may have gaps (e.g., 200000 and 200001 were failed attempts, 200002 was first successful book).

7. **Reader shows EPUB metadata, not Supabase metadata**: The reader loads title/author from the EPUB's OPF file, not from the Supabase `books` table. Metadata edits in the publish console don't affect what the reader displays. Will be addressed in Task 1.17.

8. **RLS infinite recursion**: The `tenant_memberships` table has overlapping SELECT policies that cause infinite recursion when querying with the anon key. Service role key works fine. Need to fix the RLS policies.

9. **Anatoly deploys independently**: Anatoly deploys to production from his own machine. Coordinate via git — always pull latest master before deploying to production. His deploy script is `commit_logic.sh` which only stages specific files (doesn't include `books/shared/`, `books/auth/`, `supabase/`, `scripts/`).
