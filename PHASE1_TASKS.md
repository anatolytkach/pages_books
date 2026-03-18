# Phase 1 — Platform Core: Task Breakdown

## Overview
Introduce user accounts, tenant model, single-book browser publishing, basic retail (purchase + rental), and entitlement-gated reading.

**Estimated duration:** 2–3 weeks with Claude assistance

---

## Week 1: Foundation

### Task 1.1 — Supabase Project Setup
**Time: 1–2 hours (you, manually)**

- [ ] Create Supabase account at supabase.com
- [ ] Create new project (choose region closest to your users)
- [ ] Note down: project URL, anon key, service role key
- [ ] Enable Google OAuth provider in Supabase Auth settings (reuse your existing Google Cloud OAuth client, add Supabase callback URL)
- [ ] Enable email/password auth

**Deliverable:** Running Supabase instance with auth configured.

---

### Task 1.2 — Local Supabase Dev Environment
**Time: 1 hour (Claude writes config, you run commands)**

- [ ] Install Supabase CLI: `npm install -g supabase`
- [ ] Run `supabase init` in project root
- [ ] Run `supabase start` (requires Docker)
- [ ] Verify local Supabase dashboard at `localhost:54323`
- [ ] Add `supabase/` to `.gitignore` where appropriate

**Deliverable:** Local Supabase running in Docker for development.

---

### Task 1.3 — Database Migration: Identity & Tenancy
**Time: 2–3 hours (Claude writes SQL, you review and apply)**

- [ ] Create `supabase/migrations/001_identity_tenancy.sql`
  - `user_profiles` table
  - `tenants` table
  - `tenant_memberships` table
  - `tenant_groups` table
  - `tenant_group_members` table
  - RLS policies: users see own profile, members see own tenant, admins manage tenant
- [ ] Apply migration locally: `supabase db push`
- [ ] Test: create a user, create a tenant, add membership

**Deliverable:** Identity tables with RLS policies, tested locally.

---

### Task 1.4 — Database Migration: Books & Publication
**Time: 2–3 hours (Claude writes SQL, you review and apply)**

- [ ] Create `supabase/migrations/002_books_publication.sql`
  - `genres` table with seed data (fiction, nonfiction, subcategories)
  - `books` table
  - `source_assets` table
  - `publication_batches` table
  - RLS policies: publishers manage own books, public reads published books
- [ ] Apply and test locally

**Deliverable:** Book and publication tables with RLS policies.

---

### Task 1.5 — Database Migration: Commerce & Entitlements
**Time: 2–3 hours (Claude writes SQL, you review and apply)**

- [ ] Create `supabase/migrations/003_commerce_entitlements.sql`
  - `book_offers` table
  - `entitlements` table
  - `payout_accounts` table
  - `transactions` table
  - RLS policies: users see own entitlements, offer creators manage offers
- [ ] Apply and test locally

**Deliverable:** Commerce tables with RLS policies.

---

### Task 1.6 — Auth Client Library
**Time: 3–4 hours (Claude writes code, you test in browser)**

- [ ] Create `shared/supabase-client.js`
  - Initialize Supabase client with project URL and anon key
  - Config loaded from environment (different for local dev vs production)
- [ ] Create `shared/auth.js`
  - `signUp(email, password, displayName)`
  - `signIn(email, password)`
  - `signInWithGoogle()`
  - `signOut()`
  - `getSession()` — returns current JWT + user
  - `onAuthStateChange(callback)`
  - `getProfile()` — fetch from `user_profiles`
  - `getTenantMemberships()` — fetch user's tenants and roles
- [ ] Preserve existing Google Drive sync as optional feature (not replaced)

**Deliverable:** Browser auth module that works with Supabase.

---

### Task 1.7 — Auth UI
**Time: 4–6 hours (Claude writes HTML/JS, you review UX)**

- [ ] Create login/signup page at `/auth/index.html`
  - Email + password form
  - Google sign-in button
  - Magic link option
  - Toggle between sign-up and sign-in
  - Error handling (invalid credentials, email taken, etc.)
- [ ] Add auth state indicator to existing pages
  - Small user menu in top-right of reader, catalog, etc.
  - Shows "Sign in" or user name + avatar
  - Dropdown: My Account, My Books, Sign Out
- [ ] Handle auth redirects (after login, return to previous page)

**Deliverable:** Working login/signup flow in the browser.

---

### Task 1.8 — Worker Auth Middleware
**Time: 3–4 hours (Claude writes code, you test)**

- [ ] Update `_worker.js` to:
  - Extract JWT from `Authorization: Bearer <token>` header
  - Verify JWT using Supabase JWT secret (via `jsonwebtoken` or manual verification)
  - Attach `user_id` and `role` to request context
  - Pass through unauthenticated requests for public routes
- [ ] Define which routes require auth:
  - Public: catalog, book pages, public content
  - Authenticated: publish, purchase, rent, notes, booktree, institution admin
- [ ] Test with real JWT from Supabase Auth

**Deliverable:** Worker validates auth on protected routes.

---

## Week 2: Publishing & Commerce

### Task 1.9 — Publisher Console UI (Basic)
**Time: 6–8 hours (Claude writes code, you review UX and test)**

- [ ] Create `/publish/index.html` — publisher dashboard
  - Requires authentication
  - Shows "My Books" list (books published by this user/tenant)
  - "Upload New Book" button
- [ ] Upload flow:
  - File picker: accept `.epub`, `.docx`, `.zip`
  - Upload to R2 via Worker endpoint (resumable for large files)
  - Show upload progress
- [ ] For single file (EPUB or DOCX):
  - Show validation status (pending → validating → valid/invalid)
  - If invalid: show errors (for DOCX: heading issues, vector images, background images)
  - If valid: show metadata form
- [ ] Metadata form:
  - Title (text, required)
  - Author (text, required)
  - Genre (dropdown from `genres` table, required)
  - Year written (number, required)
  - ISBN (text, optional)
  - Annotation (textarea, required)
  - Cover image upload (optional — extracted from EPUB if not provided)
- [ ] "Publish" button — only enabled when validation passed + all metadata filled

**Deliverable:** Working browser UI to upload and publish a single book.

---

### Task 1.10 — Upload API Endpoint
**Time: 3–4 hours (Claude writes code, you test)**

- [ ] Add to Worker:
  - `POST /api/publish/upload` — accepts file, stores in R2 at `uploads/<uuid>/<filename>`
  - Creates `source_assets` row in Supabase (status: `pending`)
  - Creates `books` row (status: `draft`)
  - Returns `{ bookId, assetId }`
- [ ] For ZIP files:
  - Creates `publication_batches` row
  - Returns `{ batchId }` — actual unpacking happens async (Phase 2 does this properly; for now, reject ZIP with "ZIP batch upload coming soon")
- [ ] Size limits: 100MB per file, 500MB per ZIP

**Deliverable:** Books can be uploaded from browser to R2 with tracking in Supabase.

---

### Task 1.11 — Basic EPUB Validation & Processing
**Time: 4–6 hours (Claude writes code, you test with real EPUBs)**

- [ ] Add to Worker (or lightweight Edge Function):
  - Triggered after upload
  - Fetch EPUB from R2
  - Check: is it a valid ZIP with `META-INF/container.xml`?
  - Check: no `encryption.xml` with DRM entries?
  - Parse OPF: extract title, author, language, cover
  - Pre-fill metadata from OPF into `books` row
  - Unpack EPUB to R2 at `content/<content_id>/`
  - Update `books.status` = `ready`
  - Update `source_assets.validation_status` = `valid`
- [ ] For DOCX: mark as `valid` but don't process yet (full DOCX pipeline is Phase 2)
  - For now: return message "DOCX processing coming soon — please convert to EPUB first"

**Deliverable:** EPUB files are validated, unpacked, and published to R2 via browser.

---

### Task 1.12 — Metadata Completion API
**Time: 2–3 hours (Claude writes code, you test)**

- [ ] Add to Worker:
  - `GET /api/publish/books/:id` — return book draft with current metadata
  - `PATCH /api/publish/books/:id/metadata` — update metadata fields
  - `POST /api/publish/books/:id/publish` — transition status from `ready` → `published`
    - Validate all required fields present
    - Set `visibility` (public, tenant_only, private)
    - Trigger catalog index update (call existing `build_lang_indexes.py` logic or simplified JS version)
- [ ] RLS: only the book's publisher can update/publish

**Deliverable:** Complete publish flow from upload to live in catalog.

---

### Task 1.13 — Book Offers API
**Time: 2–3 hours (Claude writes code, you test)**

- [ ] Add to Worker:
  - `POST /api/books/:id/offers` — create purchase or rental offer
    - `{ offer_type: "purchase", price_cents: 999, currency: "USD" }`
    - `{ offer_type: "rental", price_cents: 399, rental_days: 14 }`
  - `GET /api/books/:id/offers` — list active offers for a book
  - `PATCH /api/offers/:id` — update price, deactivate
- [ ] Free books (Gutenberg catalog) have no offers — remain publicly accessible with no entitlement check

**Deliverable:** Publishers can set prices for their books.

---

### Task 1.14 — Stripe Setup
**Time: 2–3 hours (you, manually + Claude helps with config)**

- [ ] Create Stripe account (or use existing)
- [ ] Enable Stripe Connect (Standard or Express)
- [ ] Create webhook endpoint secret
- [ ] Store in Cloudflare Worker environment variables:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_PUBLISHABLE_KEY`
- [ ] Install Stripe JS in browser (`@stripe/stripe-js`)

**Deliverable:** Stripe account ready for payments.

---

### Task 1.15 — Checkout Flow
**Time: 4–6 hours (Claude writes code, you test with Stripe test mode)**

- [ ] Add to Worker:
  - `POST /api/books/:id/checkout`
    - Input: `{ offer_id }`
    - Creates Stripe Checkout Session with:
      - Line item (book title, price from offer)
      - Success URL → `/reader/#<book_id>`
      - Cancel URL → back to book page
      - Metadata: `{ book_id, offer_id, user_id }`
    - Returns `{ checkoutUrl }`
  - `POST /api/webhooks/stripe`
    - Verifies Stripe signature
    - On `checkout.session.completed`:
      - Creates `transactions` row
      - Creates `entitlements` row
        - Purchase: `expires_at = NULL` (permanent)
        - Rental: `expires_at = now() + offer.rental_days`
- [ ] Browser: redirect to Stripe Checkout when user clicks Buy/Rent
- [ ] Test full cycle in Stripe test mode

**Deliverable:** Users can buy or rent books, entitlement created on payment.

---

### Task 1.16 — Entitlement Check API
**Time: 3–4 hours (Claude writes code, you test)**

- [ ] Add to Worker:
  - `GET /api/books/:id/entitlement`
    - Check 1: does user have a `purchase` entitlement? → `{ access: "full", type: "purchase" }`
    - Check 2: does user have an active `rental`? (expires_at > now) → `{ access: "full", type: "rental", expires_at }`
    - Check 3: no entitlement → `{ access: "none", offers: [...available offers] }`
    - (Library and subscription checks added in Phase 3)
  - For books with no offers (free/Gutenberg): → `{ access: "full", type: "free" }`
- [ ] Cache entitlement result briefly in KV for performance

**Deliverable:** API that resolves whether a user can read a specific book.

---

## Week 3: Reader Integration & Polish

### Task 1.17 — WeRead Entitlement Gate
**Time: 4–6 hours (Claude writes code, you test)**

- [ ] Modify `reader/js/reader.js`:
  - On book load, call `/api/books/:id/entitlement`
  - If `access: "full"` → load book normally (existing behavior)
  - If `access: "none"` → show book info page instead:
    - Cover image
    - Title, author, annotation
    - Available offers with Buy/Rent buttons
    - "Sign in" prompt if not authenticated
  - If `access: "full", type: "rental"` → show expiry indicator in reader UI
- [ ] Gutenberg books (no offers in DB) → always `access: "full"` — no change to current behavior
- [ ] Unauthenticated users can still read free books

**Deliverable:** Paid books are gated; free books work as before.

---

### Task 1.18 — Book Detail Page
**Time: 3–4 hours (Claude writes code, you test)**

- [ ] Create a book detail view (either in catalog or as `/book/:id` route)
  - Title, author, cover, annotation, genre, year
  - "Read Now" if free or already entitled
  - Buy / Rent buttons with prices if not entitled
  - Shows rental duration (e.g., "Rent for 14 days — $3.99")
- [ ] Link from catalog cards to this detail page
- [ ] After successful purchase/rental → redirect to reader

**Deliverable:** Users can discover a book and purchase/rent it from one page.

---

### Task 1.19 — My Account Page
**Time: 2–3 hours (Claude writes code, you test)**

- [ ] Create `/account/index.html`
  - Profile info (name, email, avatar)
  - "My Books" — list of all entitlements (purchased + rented)
    - Show rental expiry dates
    - Click to open in reader
  - "My Tenants" — list of tenant memberships (if any)
  - Sign out button
- [ ] Link from user menu dropdown

**Deliverable:** Users can see what they own/rent and manage their account.

---

### Task 1.20 — Tenant Creation (Basic)
**Time: 3–4 hours (Claude writes code, you test)**

- [ ] Add to Worker:
  - `POST /api/tenants` — create a new tenant
    - Input: `{ name, slug, tenant_type }`
    - Creator automatically gets `owner` role
  - `GET /api/tenants/:slug` — tenant info
  - `POST /api/tenants/:slug/invite` — invite user by email (creates pending membership)
  - `GET /api/tenants/:slug/members` — list members (admin only)
- [ ] Basic tenant management UI in `/publish/` console
  - "Create Publisher Account" flow for new publishers
  - Invite collaborators

**Deliverable:** Publishers can create tenant accounts and invite team members.

---

### Task 1.21 — Environment Configuration
**Time: 2–3 hours (Claude writes config, you deploy)**

- [ ] Cloudflare Worker environment variables (via Wrangler or dashboard):
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_PUBLISHABLE_KEY`
  - Keep existing: `READERPUB_GOOGLE_CLIENT_ID`, `READERPUB_GOOGLE_TRANSLATE_API_KEY`
- [ ] Browser config file: `shared/config.js`
  - `SUPABASE_URL` and `SUPABASE_ANON_KEY` (these are public)
  - `STRIPE_PUBLISHABLE_KEY` (public)
  - Different values for local dev vs production
- [ ] Update deploy script to include new files

**Deliverable:** All services connected in both dev and production.

---

### Task 1.22 — Integration Testing
**Time: 4–6 hours (you, with Claude debugging)**

- [ ] End-to-end test: sign up → upload EPUB → fill metadata → publish → see in catalog
- [ ] End-to-end test: browse catalog → find published book → buy → read
- [ ] End-to-end test: rent book → read → verify expiry
- [ ] Test: Gutenberg books still work with no login
- [ ] Test: existing Google Drive sync still works alongside Supabase auth
- [ ] Test: multiple users can't access each other's drafts
- [ ] Test: Stripe webhook creates entitlement correctly

**Deliverable:** Phase 1 working end-to-end.

---

### Task 1.23 — Deploy to Production
**Time: 2–3 hours (you, with Claude helping)**

- [ ] Push Supabase migrations to hosted project: `supabase db push --linked`
- [ ] Set all Worker environment variables in Cloudflare dashboard
- [ ] Configure Stripe webhook URL to point to production Worker
- [ ] Deploy: `wrangler pages deploy deploy/`
- [ ] Verify: catalog still works, Gutenberg books still readable
- [ ] Verify: sign up, publish, purchase flow works on production
- [ ] Set up Supabase daily backups (automatic on Pro plan)

**Deliverable:** Phase 1 live in production.

---

## Task Summary

| # | Task | Estimated Time | Who Does Most Work |
|---|------|---------------|-------------------|
| 1.1 | Supabase project setup | 1–2h | You |
| 1.2 | Local dev environment | 1h | Both |
| 1.3 | Migration: identity & tenancy | 2–3h | Claude writes, you review |
| 1.4 | Migration: books & publication | 2–3h | Claude writes, you review |
| 1.5 | Migration: commerce & entitlements | 2–3h | Claude writes, you review |
| 1.6 | Auth client library | 3–4h | Claude writes, you test |
| 1.7 | Auth UI | 4–6h | Claude writes, you review UX |
| 1.8 | Worker auth middleware | 3–4h | Claude writes, you test |
| 1.9 | Publisher console UI | 6–8h | Claude writes, you review UX |
| 1.10 | Upload API endpoint | 3–4h | Claude writes, you test |
| 1.11 | EPUB validation & processing | 4–6h | Claude writes, you test with real files |
| 1.12 | Metadata completion API | 2–3h | Claude writes, you test |
| 1.13 | Book offers API | 2–3h | Claude writes, you test |
| 1.14 | Stripe setup | 2–3h | You |
| 1.15 | Checkout flow | 4–6h | Claude writes, you test |
| 1.16 | Entitlement check API | 3–4h | Claude writes, you test |
| 1.17 | WeRead entitlement gate | 4–6h | Claude writes, you test |
| 1.18 | Book detail page | 3–4h | Claude writes, you test |
| 1.19 | My Account page | 2–3h | Claude writes, you test |
| 1.20 | Tenant creation | 3–4h | Claude writes, you test |
| 1.21 | Environment config | 2–3h | Both |
| 1.22 | Integration testing | 4–6h | You (Claude debugs) |
| 1.23 | Deploy to production | 2–3h | You (Claude helps) |
| | **Total** | **~65–95h** | |

At ~6 productive hours/day = **11–16 working days ≈ 2.5–3 weeks**
