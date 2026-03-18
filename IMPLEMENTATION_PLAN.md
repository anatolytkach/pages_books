# ReaderPub Platform — Implementation Plan

## Vision

Transform the current ReaderPub project (a static EPUB reader + catalog on Cloudflare Pages/R2) into a full **multi-tenant web publishing and reading platform** with five modules: **WeRead**, **WePub**, **WeNote**, **BookTree**, and a **Rights & Licensing Engine** — supporting retail purchase, rental, library licensing, institutional distribution, and collaborative annotation.

---

## Current State

| Component | Status | What Exists |
|-----------|--------|-------------|
| Reader (WeRead) | Functional | EPUB.js reader with annotations, TTS, search, bookmarks, dark mode |
| Catalog | Functional | 111K+ books indexed, A-Z browse, author pages, search, 78 languages |
| Publishing pipeline | CLI-only | Bash scripts for DOCX/PDF→EPUB conversion, Python indexer, R2 upload |
| Notes/Annotations | Basic | Local storage + Google Drive sync, shareable note links via R2 |
| BookTree | Not started | No knowledge accumulation module |
| Authentication | Minimal | Google Drive OAuth only (no user accounts, no user DB) |
| Commerce | Not started | No payments, licensing, or entitlements |
| Multi-tenant | Not started | Single R2 bucket, single domain |
| Database | None | No relational DB — only R2, localStorage, Google Drive |

---

## Target Architecture: 5 Production Cores

```
┌─────────────────────────────────────────────────────────────────┐
│                   BROWSER-ONLY APPLICATION LAYER                │
│                                                                 │
│  Public Site │ Tenant Storefronts │ WeRead │ WeNote │ BookTree  │
│  Publisher Console │ Institution Console │ Platform Admin        │
└──────────────────────────┬──────────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              │    Cloudflare Edge      │
              │  Workers + Pages + R2   │
              │  KV + Queues + DO       │
              └────────────┬────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
   ┌─────┴─────┐   ┌──────┴──────┐   ┌─────┴─────┐
   │  Supabase │   │  Stripe     │   │  Ingestion │
   │  Postgres │   │  Connect +  │   │  Workers   │
   │  + Auth   │   │  Billing    │   │  (Python/  │
   │  + RLS    │   │             │   │   Node)    │
   └───────────┘   └─────────────┘   └───────────┘
```

### Core 1 — Identity & Tenancy
Who the user is, which institution they belong to, what roles they hold.

### Core 2 — Publication (WePub)
Ingestion, validation, conversion, metadata, catalog, web publication.

### Core 3 — Rights & Licensing
Purchase, rental, library license, subscription, institutional access entitlements.

### Core 4 — Reading & Notes (WeRead + WeNote + BookTree)
Web reader, personal notes, note transfer packages, research accumulation.

### Core 5 — Financial & Settlement
Payments, subscriptions, payouts, revenue splits, institutional invoicing.

---

## Technical Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Edge / delivery | Cloudflare Workers + Pages | API gateway, domain routing, content delivery, entitlement checks |
| Object storage | Cloudflare R2 | EPUB content, uploaded source files, publication packages, note exports |
| Edge cache | Cloudflare KV | Catalog page caches, routing config, feature flags |
| Async jobs | Cloudflare Queues | Ingestion jobs, ZIP fan-out, validation, email |
| Stateful coordination | Cloudflare Durable Objects | Live reading sessions, collaborative note presence |
| Relational DB | Supabase (Postgres + Auth + RLS) | System of record: users, tenants, books, entitlements, notes, payouts |
| Payments | Stripe Connect + Billing | Retail, rental, subscriptions, platform fee, multi-party payouts |
| Ingestion workers | Containerized Python/Node (Fly.io or Cloud Run) | DOCX validation, EPUB parsing, image inspection, batch processing |
| Search | Postgres full-text (phase 1), dedicated index later | Catalog search, in-book search, note search |
| Domain routing | Cloudflare Custom Domains | Tenant subdomains and custom domains with auto-SSL |

---

## Phase 1 — Platform Core

**Goal:** Introduce user accounts, tenant model, single-book publish via browser, and basic retail purchase + rental.

### 1.1 Supabase Setup

**What to do:**
- Create a Supabase project
- Configure Supabase Auth (email/password, Google OAuth, magic link)
- Design and deploy initial schema (see tables below)
- Set up Row Level Security policies for multi-tenant isolation

**Schema — Identity & Tenancy tables:**

```sql
-- Users (managed by Supabase Auth, extended with profile)
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tenants: publishers, libraries, universities, distributors
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,               -- used in subdomain: slug.readerpub.com
    name TEXT NOT NULL,
    tenant_type TEXT NOT NULL CHECK (tenant_type IN (
        'publisher', 'distributor', 'library', 'university', 'consortium', 'individual_author'
    )),
    custom_domain TEXT,                      -- e.g. books.university.edu
    logo_url TEXT,
    settings JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Membership: user belongs to tenant with a role
CREATE TABLE tenant_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    role TEXT NOT NULL CHECK (role IN (
        'owner', 'admin', 'publisher', 'editor', 'librarian',
        'acquisitions_manager', 'course_admin', 'member'
    )),
    department TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, user_id)
);

-- Groups within a tenant (departments, courses, branches)
CREATE TABLE tenant_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    group_type TEXT NOT NULL CHECK (group_type IN (
        'department', 'course', 'branch', 'team', 'custom'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tenant_group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES tenant_groups(id),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(group_id, user_id)
);
```

**Schema — Books & Publication tables:**

```sql
CREATE TABLE books (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    genre TEXT NOT NULL,                     -- from controlled vocabulary
    year_written INTEGER,
    isbn TEXT,
    annotation TEXT NOT NULL,
    cover_url TEXT,
    language TEXT NOT NULL DEFAULT 'und',
    content_id TEXT UNIQUE,                  -- numeric ID used in R2 path: content/<content_id>/
    published_by_tenant_id UUID REFERENCES tenants(id),
    published_by_user_id UUID NOT NULL REFERENCES auth.users(id),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft', 'processing', 'ready', 'published', 'unpublished', 'failed'
    )),
    visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN (
        'public', 'tenant_only', 'private'
    )),
    manifest JSONB,                          -- chapter list, OPF path, etc.
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Source files uploaded for processing
CREATE TABLE source_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID REFERENCES books(id),
    batch_id UUID REFERENCES publication_batches(id),
    filename TEXT NOT NULL,
    format TEXT NOT NULL CHECK (format IN ('epub', 'docx')),
    r2_key TEXT NOT NULL,                    -- path in R2 where source is stored
    file_size_bytes BIGINT,
    validation_status TEXT NOT NULL DEFAULT 'pending' CHECK (validation_status IN (
        'pending', 'validating', 'valid', 'invalid', 'error'
    )),
    validation_errors JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Batch uploads (ZIP with multiple files)
CREATE TABLE publication_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    uploaded_by UUID NOT NULL REFERENCES auth.users(id),
    status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN (
        'uploaded', 'unpacking', 'metadata_pending', 'processing',
        'partially_ready', 'ready', 'published', 'failed'
    )),
    total_files INTEGER NOT NULL DEFAULT 0,
    completed_files INTEGER NOT NULL DEFAULT 0,
    failed_files INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Controlled vocabulary for genres
CREATE TABLE genres (
    id TEXT PRIMARY KEY,                     -- e.g. 'fiction.literary', 'nonfiction.science'
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES genres(id),
    display_order INTEGER NOT NULL DEFAULT 0
);
```

**Schema — Commerce & Entitlements tables:**

```sql
-- What's for sale/rent/license on a book
CREATE TABLE book_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES books(id),
    offer_type TEXT NOT NULL CHECK (offer_type IN (
        'purchase', 'rental', 'library_license', 'subscription_inclusion'
    )),
    created_by_tenant_id UUID REFERENCES tenants(id),
    price_cents INTEGER,
    currency TEXT NOT NULL DEFAULT 'USD',
    rental_days INTEGER,                     -- for rental offers
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User's right to access a book
CREATE TABLE entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    book_id UUID NOT NULL REFERENCES books(id),
    entitlement_type TEXT NOT NULL CHECK (entitlement_type IN (
        'purchase', 'rental', 'library_borrow', 'subscription', 'institutional'
    )),
    granted_by_tenant_id UUID REFERENCES tenants(id),
    offer_id UUID REFERENCES book_offers(id),
    license_agreement_id UUID REFERENCES library_license_agreements(id),
    subscription_plan_id UUID REFERENCES subscription_plans(id),
    starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,                  -- NULL = permanent (purchase)
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stripe integration
CREATE TABLE payout_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    stripe_account_id TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    book_id UUID NOT NULL REFERENCES books(id),
    offer_id UUID NOT NULL REFERENCES book_offers(id),
    stripe_checkout_session_id TEXT,
    stripe_payment_intent_id TEXT,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    platform_fee_cents INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'completed', 'failed', 'refunded'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 1.2 Auth Migration

**What to change vs. current state:**
- Replace the optional Google Drive-only OAuth with Supabase Auth
- Keep Google Drive sync as an optional feature for reading state backup
- Add login/signup UI (email + Google + magic link)
- Every API call from browser carries Supabase JWT
- Worker validates JWT and extracts user_id + tenant memberships

**New files:**
- `shared/auth.js` — Supabase client init, session management, JWT helpers
- Auth UI components in the public site / reader

### 1.3 Worker API Expansion

**What to change vs. current state:**
- Current `_worker.js` handles notes-share, translate, R2 content, and redirects
- Expand to handle all platform API routes, delegating to Supabase for data
- Add JWT verification middleware
- Add tenant routing (resolve subdomain → tenant_id)

**New API routes (added to Worker):**
```
POST   /api/auth/session          — validate/refresh Supabase session
GET    /api/books/:id             — book metadata + available offers
GET    /api/books/:id/entitlement — check current user's access rights
POST   /api/books/:id/checkout    — create Stripe checkout session
POST   /api/books/:id/borrow      — library borrow (if entitled)
GET    /api/catalog/...           — existing catalog endpoints (keep)
POST   /api/publish/upload        — upload EPUB/DOCX/ZIP
GET    /api/publish/batch/:id     — batch status
PATCH  /api/publish/batch/:id/book/:bookId/metadata — complete metadata
POST   /api/publish/batch/:id/publish — publish batch
GET    /api/tenant/:slug          — tenant info + catalog
```

### 1.4 WeRead Entitlement Gate

**What to change vs. current state:**
- Currently all books are publicly readable — no access checks
- Add entitlement check before rendering protected content
- Free/public books (e.g. Gutenberg) remain unrestricted
- For paid books: WeRead calls `/api/books/:id/entitlement` on load
- If no entitlement → show book page with cover, annotation, offers, and purchase/rent buttons
- If entitled → load chapters from R2 as before

**Changes to `reader/js/reader.js`:**
- On book load, check entitlement API
- Gate chapter fetching behind access token
- Show rental expiry countdown if applicable
- Preserve existing reading features (TTS, bookmarks, search, themes)

### 1.5 Stripe Integration

**What to do:**
- Create Stripe account with Connect enabled
- Implement Stripe Checkout for purchase and rental
- Implement webhook handler (in Worker) for `checkout.session.completed`
- On successful payment → create `entitlements` row in Supabase
- For rentals → set `expires_at` based on offer's `rental_days`

### 1.6 Basic Publisher Console (browser)

**What to do:**
- New route: `/publish/` — browser UI for uploading and managing books
- Upload single EPUB or DOCX
- Upload ZIP with multiple files
- Show validation status and errors
- Metadata completion form (title, author, genre from dropdown, year, ISBN, annotation)
- For ZIP: list all files, require metadata for each before allowing publish
- Publish button → triggers processing → book appears in catalog

---

## Phase 2 — WePub Full Ingestion

**Goal:** Move the entire publishing pipeline from CLI scripts to browser-driven, queue-based processing with DOCX validation.

### 2.1 Ingestion Worker Service

**What to do:**
- Deploy a containerized Python/Node service (Fly.io or Cloud Run)
- Triggered by Cloudflare Queues messages
- Replaces current bash scripts (`make_epub_from_docx.sh`, `epub_unpack.sh`, etc.)

**Processing pipeline per file:**

```
Upload (R2)
  → Queue message
    → Ingestion Worker picks up job
      → Virus scan (ClamAV or similar)
      → Format detection (EPUB vs DOCX)
      → Validation
      → Conversion (DOCX → EPUB if needed)
      → EPUB unpack
      → Manifest generation (chapters, cover, search text)
      → Upload web package to R2
      → Update catalog indexes
      → Update book status in Supabase
```

### 2.2 DOCX Validation Rules

**Implemented in ingestion worker (Python):**

| Rule | Check | Reject if |
|------|-------|-----------|
| Headings | Parse `styles.xml` — only standard `Heading 1`–`Heading 9` allowed | Custom pseudo-headings used for structure |
| Images — raster only | Inspect `word/media/*` + `document.xml` relationships | SVG, EMF, WMF, or DrawingML vector shapes found |
| Images — no background | Parse `document.xml` for `wp:anchor` and `wp:inline` elements | Any image has `behindDoc="1"` or `wrapNone` with text overlap |

**Implementation:**
- Use `python-docx` for DOCX parsing
- Use `lxml` for direct XML inspection of `document.xml` and `styles.xml`
- Return structured validation errors (file, rule, location, message)

### 2.3 EPUB Validation

- Must be DRM-free (no `encryption.xml` with non-trivial entries)
- Must contain valid `META-INF/container.xml`
- Must have parseable OPF with `dc:title` and `dc:creator`

### 2.4 ZIP Batch Processing

**Flow:**
1. ZIP uploaded to R2
2. Queue message → ingestion worker unpacks ZIP
3. Identifies all `.epub` and `.docx` files inside
4. Creates one `source_assets` row per file
5. Updates `publication_batches.total_files`
6. Each file is validated and processed independently
7. Batch status updated as files complete
8. Publisher console shows progress per file
9. Batch cannot be published until all files have `valid` status and complete metadata

### 2.5 Catalog Index Rebuild

**What to change vs. current state:**
- Current: Python script `build_lang_indexes.py` runs locally, uploads JSON to R2
- New: Ingestion worker calls the same indexing logic after processing
- Incremental index updates (per-book, not full rebuild)
- Keep existing JSON index structure for backward compatibility

---

## Phase 3 — Institutional Layer

**Goal:** Enable libraries, universities, and distributors to operate as tenants with user management, library licensing, and branded domains.

### 3.1 Library Licensing Engine

**New tables:**

```sql
-- Library-specific license offers (extends book_offers)
CREATE TABLE library_license_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_offer_id UUID NOT NULL REFERENCES book_offers(id),
    license_model TEXT NOT NULL CHECK (license_model IN (
        'one_copy_one_user',
        'multi_copy',
        'unlimited_simultaneous',
        'metered_loans',
        'metered_time',
        'subscription_pool',
        'hybrid'
    )),
    max_concurrent_users INTEGER,            -- for one_copy/multi_copy
    max_loans INTEGER,                       -- for metered_loans
    duration_days INTEGER,                   -- for metered_time
    borrow_days_default INTEGER DEFAULT 14,
    free_read_enabled BOOLEAN DEFAULT false,
    patron_rental_enabled BOOLEAN DEFAULT false,
    patron_rental_price_cents INTEGER,
    renewable BOOLEAN DEFAULT true,
    terms_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Executed license between rightsholder and library/distributor
CREATE TABLE library_license_agreements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES books(id),
    license_offer_id UUID NOT NULL REFERENCES library_license_offers(id),
    licensor_tenant_id UUID NOT NULL REFERENCES tenants(id),
    licensee_tenant_id UUID NOT NULL REFERENCES tenants(id),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
        'pending', 'active', 'expired', 'terminated', 'suspended'
    )),
    starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    concurrency_limit INTEGER,
    loan_limit INTEGER,
    loans_used INTEGER NOT NULL DEFAULT 0,
    borrow_days INTEGER NOT NULL DEFAULT 14,
    free_read_enabled BOOLEAN NOT NULL DEFAULT false,
    patron_rental_enabled BOOLEAN NOT NULL DEFAULT false,
    invoice_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Scope rules: which users within licensee tenant can access
CREATE TABLE license_scope_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_agreement_id UUID NOT NULL REFERENCES library_license_agreements(id),
    scope_type TEXT NOT NULL CHECK (scope_type IN (
        'all_members', 'groups_only', 'departments_only', 'branches_only', 'custom'
    )),
    allowed_group_ids UUID[],
    rule_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Borrow records for one_copy_one_user and similar models
CREATE TABLE borrow_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_agreement_id UUID NOT NULL REFERENCES library_license_agreements(id),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    book_id UUID NOT NULL REFERENCES books(id),
    borrowed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    due_at TIMESTAMPTZ NOT NULL,
    returned_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
        'active', 'returned', 'expired', 'recalled'
    ))
);

-- Concurrency slot tracking
CREATE TABLE concurrency_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_agreement_id UUID NOT NULL REFERENCES library_license_agreements(id),
    slot_number INTEGER NOT NULL,
    occupied_by_borrow_id UUID REFERENCES borrow_records(id),
    occupied_until TIMESTAMPTZ,
    UNIQUE(license_agreement_id, slot_number)
);

-- Subscription plans (for distributor-backed access)
CREATE TABLE subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    billing_interval TEXT NOT NULL DEFAULT 'month' CHECK (billing_interval IN ('month', 'year')),
    stripe_price_id TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE subscription_plan_books (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES subscription_plans(id),
    book_id UUID NOT NULL REFERENCES books(id),
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(plan_id, book_id)
);

CREATE TABLE user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    plan_id UUID NOT NULL REFERENCES subscription_plans(id),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    stripe_subscription_id TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
        'active', 'past_due', 'canceled', 'expired'
    )),
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.2 Access Resolution Logic (in Worker)

When a user opens a book, the entitlement check runs in this order:

```
1. Does user own it (purchase entitlement)?          → full access
2. Does user have active rental?                     → access until expires_at
3. Is user member of a tenant with active license?
   a. Check license_scope_rules                      → is user in scope?
   b. Check license_model:
      - unlimited_simultaneous                       → access granted
      - one_copy_one_user / multi_copy               → check concurrency_slots
        - slot available                             → create borrow_record, grant access
        - no slot                                    → add to waitlist / show queue position
      - metered_loans                                → check loans_used < loan_limit
      - metered_time                                 → check agreement not expired
   c. If patron_rental_enabled and no free slot      → offer patron rental
4. Does user have active subscription via tenant?
   a. Check user_subscriptions.status = 'active'
   b. Check book is in subscription_plan_books       → access granted
5. No entitlement                                    → show purchase/rent offers
```

### 3.3 Institution Console (browser)

**New route: `/institution/`**

Features:
- Invite users (by email or domain whitelist)
- Assign roles (admin, librarian, member, course_admin, etc.)
- Create groups (departments, courses, branches)
- Browse available library license offers
- Purchase/subscribe to licenses
- Assign license scope (all members, specific groups)
- Configure patron access modes per book (free read, rental, subscription)
- View usage analytics (borrows, active readers, popular books)
- Manage branded domain settings

### 3.4 Branded Domain Routing

**What to do:**
- Worker resolves incoming hostname → tenant
- Lookup in `tenants` table: match `custom_domain` or `slug.readerpub.com`
- Apply tenant branding (logo, colors, catalog scope)
- Cloudflare Custom Domains API for SSL provisioning

**Changes to `_worker.js`:**
- Add tenant resolution middleware at top of request chain
- Filter catalog API responses by tenant scope
- Inject tenant branding into HTML via `HTMLRewriter`

---

## Phase 4 — WeNote

**Goal:** Enable transfer of annotated note packages between users, with author attribution and entitlement-gated book access.

### 4.1 Note Schema

```sql
CREATE TABLE notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES books(id),
    author_user_id UUID NOT NULL REFERENCES auth.users(id),
    author_display_name TEXT NOT NULL,
    anchor_cfi TEXT NOT NULL,                -- EPUB Canonical Fragment Identifier
    anchor_href TEXT,                        -- chapter path
    quote TEXT,                              -- selected text
    note_text TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN (
        'private', 'package', 'group', 'public'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Share packages
CREATE TABLE note_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID NOT NULL REFERENCES auth.users(id),
    title TEXT,
    package_type TEXT NOT NULL CHECK (package_type IN (
        'single_book', 'multi_book', 'course', 'institution_curated'
    )),
    share_token TEXT UNIQUE,                 -- for link-based sharing
    share_link_expires_at TIMESTAMPTZ,
    audience_scope TEXT DEFAULT 'anyone' CHECK (audience_scope IN (
        'anyone', 'tenant_only', 'group_only', 'specific_users'
    )),
    audience_tenant_id UUID REFERENCES tenants(id),
    audience_group_id UUID REFERENCES tenant_groups(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE note_package_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES note_packages(id),
    note_id UUID NOT NULL REFERENCES notes(id),
    display_order INTEGER NOT NULL DEFAULT 0
);

-- Track who received a package
CREATE TABLE note_package_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES note_packages(id),
    recipient_user_id UUID NOT NULL REFERENCES auth.users(id),
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(package_id, recipient_user_id)
);
```

### 4.2 WeNote Transfer Flow

**Sending (via platform):**
1. User selects notes in WeRead → "Create Note Package"
2. Chooses audience: specific user, group, course, link
3. System creates `note_packages` + `note_package_items`
4. Generates share_token for link sharing
5. Recipient notified (in-app or email)

**Sending (via link):**
1. User creates package → gets link: `readerpub.com/notes/<share_token>`
2. Anyone with link can open it
3. On open: system checks if recipient has book entitlement
4. If entitled → shows book text + overlaid notes with author attribution
5. If not entitled → shows note previews (quotes, author names) + purchase/rent/subscribe offers

**Receiving from BookTree (multi-book):**
1. User selects notes across multiple books in BookTree
2. Exports to WeNote as multi-book package
3. Per-book entitlement check on recipient side

### 4.3 Changes to WeRead

- Add note authorship display (who wrote each note)
- Add "import note package" button
- Overlay shared notes alongside personal notes (visually distinct)
- Show package source info (who shared, when)

### 4.4 Migration from Current Notes

**What to change vs. current state:**
- Current: notes stored in localStorage + Google Drive sync + R2 share links
- Keep backward compatibility: migrate existing note format to new schema
- Existing `/api/notes-share` endpoint → redirect to new WeNote package system
- Google Drive sync continues for personal reading state (positions, bookmarks)
- Notes themselves move to Supabase for collaboration features

---

## Phase 5 — BookTree

**Goal:** Personal knowledge accumulation across multiple books, exportable to WeNote.

### 5.1 BookTree Schema

```sql
CREATE TABLE booktree_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE booktree_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id UUID NOT NULL REFERENCES booktree_collections(id),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    parent_node_id UUID REFERENCES booktree_nodes(id),
    node_type TEXT NOT NULL CHECK (node_type IN (
        'folder', 'note', 'extract', 'idea', 'link'
    )),
    title TEXT,
    content TEXT,
    book_id UUID REFERENCES books(id),
    source_note_id UUID REFERENCES notes(id),  -- if extracted from a reading note
    source_cfi TEXT,
    source_quote TEXT,
    tags TEXT[],
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for cross-book search
CREATE INDEX idx_booktree_nodes_user ON booktree_nodes(user_id);
CREATE INDEX idx_booktree_nodes_book ON booktree_nodes(book_id);
CREATE INDEX idx_booktree_nodes_tags ON booktree_nodes USING GIN(tags);
```

### 5.2 BookTree UI

**New route: `/booktree/`**

Features:
- Tree/folder view of collections
- Drag-and-drop organization
- Search across all personal notes and extracts
- Filter by book, tag, or date
- "Send to WeNote" button on any selection of nodes
- Manuscript workspace: arrange extracts into a writing outline

### 5.3 BookTree ↔ WeNote Bridge

- Select nodes in BookTree → "Export to WeNote"
- System creates a `note_package` of type `multi_book`
- Maps each `booktree_node` with a `source_note_id` to a `note_package_item`
- For nodes without a source note (ideas, links), creates synthetic notes
- Package is then shareable via all WeNote mechanisms

---

## Phase 6 — Advanced Distribution & SEO

**Goal:** Distributor subscription catalogs, library policy models, institution storefronts, and Gutenberg SEO engine.

### 6.1 Distributor Subscription Catalog

- Distributor tenant creates subscription plans
- Assigns books to plans
- Libraries/universities subscribe to plans
- Their members get access to all books in the plan
- Billing via Stripe Billing (recurring)

### 6.2 Library Policy Models

Full support for all models described in the license engine:
- One copy / one user (with waitlist)
- Multi-copy / N users
- Unlimited simultaneous
- Metered by loans (26/52 loan limits)
- Metered by time (12/24 month expiry)
- Subscription pool inclusion
- Hybrid (free read + patron rental + subscription)

### 6.3 SEO Infrastructure for Gutenberg Catalog

**What to do:**
- Generate server-rendered HTML pages for each book: `/book/<slug>`
- Generate author pages: `/author/<slug>`
- Generate genre pages: `/genre/<slug>`
- Generate chapter-level URLs: `/book/<slug>/chapter-<n>`
- Add `schema.org/Book` structured data
- Add Open Graph and Twitter Card meta tags
- Add sitemap.xml generation (incremental)
- Add canonical URLs

**Implementation:**
- Worker generates HTML on-the-fly from book metadata in Supabase + chapter content from R2
- Cache rendered pages in KV (invalidate on book update)
- Existing 111K+ Gutenberg books become 111K+ SEO landing pages

### 6.4 Analytics & Audit

```sql
CREATE TABLE audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    actor_user_id UUID REFERENCES auth.users(id),
    actor_tenant_id UUID REFERENCES tenants(id),
    target_type TEXT,                        -- 'book', 'entitlement', 'license', 'note_package', etc.
    target_id UUID,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE read_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    book_id UUID NOT NULL REFERENCES books(id),
    tenant_id UUID REFERENCES tenants(id),
    session_start TIMESTAMPTZ NOT NULL,
    session_end TIMESTAMPTZ,
    chapters_read INTEGER NOT NULL DEFAULT 0,
    access_type TEXT NOT NULL,               -- 'purchase', 'rental', 'library', 'subscription', 'free'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## Changes Required vs. Current State — Summary

| Area | Current | Required Change |
|------|---------|-----------------|
| **Authentication** | Google Drive OAuth only, no user DB | Add Supabase Auth (email, Google, magic link), JWT-based API auth |
| **Database** | None (R2 + localStorage + Drive) | Add Supabase Postgres as system of record for all entities |
| **User accounts** | None | Full user profiles, tenant memberships, roles |
| **Publishing** | CLI bash scripts run locally | Browser upload UI + queue-driven ingestion workers |
| **DOCX validation** | CSS extraction only (gen_epub_css_from_docx.py) | Add heading validation, raster-only image check, no-background-image check |
| **Book access** | All public, no gates | Entitlement engine: purchase, rental, library, subscription |
| **Payments** | None | Stripe Connect + Billing for purchases, rentals, subscriptions, payouts |
| **Notes** | localStorage + Drive sync + R2 share links | Supabase-stored notes with authorship, packages, entitlement-gated transfer |
| **BookTree** | Not implemented | New module: collections, nodes, cross-book search, WeNote export |
| **Multi-tenant** | Single instance | Tenant model with roles, groups, branded domains, scoped catalogs |
| **Library licensing** | Not implemented | Full licensing engine with multiple models, concurrency, borrowing |
| **Domain routing** | Single domain | Custom domain support via Cloudflare, tenant-aware Worker routing |
| **Catalog** | Static JSON indexes on R2 | Keep for public SEO; add Supabase-backed dynamic catalog for tenant/commerce |
| **Worker** | Notes-share, translate, R2 proxy, redirects | Expand to full API gateway with auth, entitlements, commerce, tenant routing |
| **SEO** | None (catalog is client-side SPA) | Server-rendered book/author/genre pages with structured data |
| **Analytics** | None | Read analytics, institutional usage, audit trail |

---

## Infrastructure Costs Estimate (Early Stage)

| Service | Tier | Estimated Monthly Cost |
|---------|------|----------------------|
| Supabase | Pro | $25 |
| Cloudflare Workers | Paid | $5 |
| Cloudflare R2 | Pay-as-you-go | $5–15 (storage) + egress |
| Cloudflare KV | Included with Workers Paid | $0 |
| Cloudflare Queues | Pay-as-you-go | $1–5 |
| Fly.io (ingestion workers) | 1–2 machines | $10–30 |
| Stripe | 2.9% + 30¢ per transaction | Variable |
| **Total fixed** | | **~$50–80/month** |

---

## File Structure (New)

```
pages_books/
├── _worker.js                      # Expanded: auth, entitlements, tenant routing, all APIs
├── reader/                         # WeRead (existing, enhanced with entitlement gates)
├── catalog/                        # Public catalog (existing, enhanced with SEO pages)
├── publish/                        # NEW: WePub browser UI
│   ├── index.html
│   └── js/
├── institution/                    # NEW: Institution/library console
│   ├── index.html
│   └── js/
├── booktree/                       # NEW: BookTree UI
│   ├── index.html
│   └── js/
├── admin/                          # NEW: Platform admin console
│   ├── index.html
│   └── js/
├── shared/                         # Shared browser modules
│   ├── auth.js                     # NEW: Supabase auth client
│   ├── api.js                      # NEW: Platform API client
│   ├── drive-sync.js               # Existing: Google Drive sync
│   └── entitlements.js             # NEW: Entitlement check helpers
├── books/
│   ├── content/                    # Existing: book content + scripts
│   └── shared/                     # Existing: drive-sync
├── tools/
│   ├── build_lang_indexes.py       # Existing: catalog indexer
│   └── ingestion/                  # NEW: DOCX validator, EPUB processor
│       ├── validate_docx.py
│       ├── validate_epub.py
│       ├── process_book.py
│       └── Dockerfile
├── supabase/
│   └── migrations/                 # NEW: All SQL migrations
│       ├── 001_identity_tenancy.sql
│       ├── 002_books_publication.sql
│       ├── 003_commerce_entitlements.sql
│       ├── 004_library_licensing.sql
│       ├── 005_notes_wenote.sql
│       ├── 006_booktree.sql
│       └── 007_analytics_audit.sql
├── tests/                          # Existing: expand with new module tests
├── deploy/                         # Existing: deployment artifacts
└── reader_lang_indexes/            # Existing: pre-built catalog indexes
```

---

## Critical Architectural Principle

**Book, Entitlement, and Note Layer are three separate entities. Never one.**

- `Book` — the content and its metadata
- `Entitlement` — the right to access that content (purchase, rental, license, subscription)
- `Note` — the user/social/research layer on top of content

WeRead renders. WePub publishes. WeNote transfers. BookTree accumulates. The Rights Engine decides access. Stripe settles money. Each module talks to the others through well-defined contracts in Supabase, never by embedding one concern inside another.
