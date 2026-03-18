-- ============================================================
-- Migration 001: Identity & Tenancy
-- ============================================================

-- User profiles (extends Supabase auth.users)
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profiles (id, display_name)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Tenants: publishers, libraries, universities, distributors
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
    name TEXT NOT NULL,
    tenant_type TEXT NOT NULL CHECK (tenant_type IN (
        'publisher', 'distributor', 'library', 'university', 'consortium', 'individual_author'
    )),
    custom_domain TEXT,
    logo_url TEXT,
    settings JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenants_custom_domain ON tenants(custom_domain) WHERE custom_domain IS NOT NULL;

-- Membership: user belongs to tenant with a role
CREATE TABLE tenant_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN (
        'owner', 'admin', 'publisher', 'editor', 'librarian',
        'acquisitions_manager', 'course_admin', 'member'
    )),
    department TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, user_id)
);

CREATE INDEX idx_tenant_memberships_user ON tenant_memberships(user_id) WHERE is_active = true;
CREATE INDEX idx_tenant_memberships_tenant ON tenant_memberships(tenant_id) WHERE is_active = true;

-- Groups within a tenant (departments, courses, branches)
CREATE TABLE tenant_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    group_type TEXT NOT NULL CHECK (group_type IN (
        'department', 'course', 'branch', 'team', 'custom'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, name)
);

CREATE TABLE tenant_group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES tenant_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(group_id, user_id)
);

-- Pending invitations
CREATE TABLE tenant_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN (
        'admin', 'publisher', 'editor', 'librarian',
        'acquisitions_manager', 'course_admin', 'member'
    )),
    invited_by UUID NOT NULL REFERENCES auth.users(id),
    token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
    accepted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenant_invitations_email ON tenant_invitations(email) WHERE accepted_at IS NULL;

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_invitations ENABLE ROW LEVEL SECURITY;

-- user_profiles: users read any profile, update only own
CREATE POLICY "Profiles are viewable by everyone"
    ON user_profiles FOR SELECT
    USING (true);

CREATE POLICY "Users can update own profile"
    ON user_profiles FOR UPDATE
    USING (id = auth.uid());

-- tenants: active tenants are publicly readable, only owners can update
CREATE POLICY "Active tenants are viewable by everyone"
    ON tenants FOR SELECT
    USING (is_active = true);

CREATE POLICY "Authenticated users can create tenants"
    ON tenants FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Tenant owners can update their tenant"
    ON tenants FOR UPDATE
    USING (
        id IN (
            SELECT tenant_id FROM tenant_memberships
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin') AND is_active = true
        )
    );

-- tenant_memberships: members see own tenant's memberships
CREATE POLICY "Users see their own memberships"
    ON tenant_memberships FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Tenant members see co-members"
    ON tenant_memberships FOR SELECT
    USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_memberships
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "Tenant admins can insert memberships"
    ON tenant_memberships FOR INSERT
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM tenant_memberships
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin') AND is_active = true
        )
    );

CREATE POLICY "Tenant admins can update memberships"
    ON tenant_memberships FOR UPDATE
    USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_memberships
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin') AND is_active = true
        )
    );

-- tenant_groups: visible to tenant members
CREATE POLICY "Tenant members see groups"
    ON tenant_groups FOR SELECT
    USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_memberships
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "Tenant admins manage groups"
    ON tenant_groups FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_memberships
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'course_admin') AND is_active = true
        )
    );

-- tenant_group_members: visible to tenant members
CREATE POLICY "Tenant members see group members"
    ON tenant_group_members FOR SELECT
    USING (
        group_id IN (
            SELECT id FROM tenant_groups WHERE tenant_id IN (
                SELECT tenant_id FROM tenant_memberships
                WHERE user_id = auth.uid() AND is_active = true
            )
        )
    );

CREATE POLICY "Tenant admins manage group members"
    ON tenant_group_members FOR ALL
    USING (
        group_id IN (
            SELECT id FROM tenant_groups WHERE tenant_id IN (
                SELECT tenant_id FROM tenant_memberships
                WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'course_admin') AND is_active = true
            )
        )
    );

-- tenant_invitations: admins of the tenant can manage
CREATE POLICY "Tenant admins manage invitations"
    ON tenant_invitations FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_memberships
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin') AND is_active = true
        )
    );

-- Anyone can read their own invitation by email (for accepting)
CREATE POLICY "Users can see invitations to their email"
    ON tenant_invitations FOR SELECT
    USING (
        email = (SELECT email FROM auth.users WHERE id = auth.uid())
    );
-- ============================================================
-- Migration 002: Books & Publication
-- ============================================================

-- Controlled vocabulary for genres
CREATE TABLE genres (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES genres(id),
    display_order INTEGER NOT NULL DEFAULT 0
);

-- Seed genres
INSERT INTO genres (id, name, parent_id, display_order) VALUES
    ('fiction',            'Fiction',                NULL, 1),
    ('fiction.literary',   'Literary Fiction',       'fiction', 1),
    ('fiction.romance',    'Romance',                'fiction', 2),
    ('fiction.mystery',    'Mystery & Thriller',     'fiction', 3),
    ('fiction.scifi',      'Science Fiction',        'fiction', 4),
    ('fiction.fantasy',    'Fantasy',                'fiction', 5),
    ('fiction.horror',     'Horror',                 'fiction', 6),
    ('fiction.historical', 'Historical Fiction',     'fiction', 7),
    ('fiction.adventure',  'Adventure',              'fiction', 8),
    ('fiction.humor',      'Humor & Satire',         'fiction', 9),
    ('fiction.ya',         'Young Adult',            'fiction', 10),
    ('fiction.children',   'Children''s Fiction',    'fiction', 11),
    ('fiction.classic',    'Classic Literature',     'fiction', 12),
    ('fiction.short',      'Short Stories',          'fiction', 13),
    ('fiction.poetry',     'Poetry',                 'fiction', 14),
    ('fiction.drama',      'Drama & Plays',          'fiction', 15),
    ('nonfiction',              'Nonfiction',                    NULL, 2),
    ('nonfiction.biography',    'Biography & Memoir',            'nonfiction', 1),
    ('nonfiction.history',      'History',                       'nonfiction', 2),
    ('nonfiction.science',      'Science & Nature',              'nonfiction', 3),
    ('nonfiction.technology',   'Technology & Computing',        'nonfiction', 4),
    ('nonfiction.philosophy',   'Philosophy',                    'nonfiction', 5),
    ('nonfiction.psychology',   'Psychology',                    'nonfiction', 6),
    ('nonfiction.selfhelp',     'Self-Help & Personal Growth',   'nonfiction', 7),
    ('nonfiction.business',     'Business & Economics',          'nonfiction', 8),
    ('nonfiction.politics',     'Politics & Government',         'nonfiction', 9),
    ('nonfiction.education',    'Education',                     'nonfiction', 10),
    ('nonfiction.travel',       'Travel',                        'nonfiction', 11),
    ('nonfiction.health',       'Health & Wellness',             'nonfiction', 12),
    ('nonfiction.art',          'Art & Photography',             'nonfiction', 13),
    ('nonfiction.music',        'Music',                         'nonfiction', 14),
    ('nonfiction.cooking',      'Cooking & Food',                'nonfiction', 15),
    ('nonfiction.religion',     'Religion & Spirituality',       'nonfiction', 16),
    ('nonfiction.law',          'Law',                           'nonfiction', 17),
    ('nonfiction.reference',    'Reference & Encyclopedias',     'nonfiction', 18),
    ('nonfiction.essays',       'Essays & Criticism',            'nonfiction', 19),
    ('academic',                'Academic & Research',           NULL, 3),
    ('academic.monograph',      'Monograph',                     'academic', 1),
    ('academic.textbook',       'Textbook',                      'academic', 2),
    ('academic.thesis',         'Thesis & Dissertation',         'academic', 3),
    ('academic.proceedings',    'Conference Proceedings',         'academic', 4),
    ('academic.openaccess',     'Open Access',                   'academic', 5);

-- Books
CREATE TABLE books (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    genre_id TEXT NOT NULL REFERENCES genres(id),
    year_written INTEGER,
    isbn TEXT,
    annotation TEXT NOT NULL DEFAULT '',
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
    is_free BOOLEAN NOT NULL DEFAULT false,  -- true for Gutenberg and other free books
    manifest JSONB,                          -- chapter list, OPF path, cover path, etc.
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_books_status ON books(status) WHERE status = 'published';
CREATE INDEX idx_books_tenant ON books(published_by_tenant_id);
CREATE INDEX idx_books_publisher ON books(published_by_user_id);
CREATE INDEX idx_books_genre ON books(genre_id);
CREATE INDEX idx_books_content_id ON books(content_id);

-- Source files uploaded for processing
CREATE TABLE source_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID REFERENCES books(id) ON DELETE SET NULL,
    batch_id UUID,  -- references publication_batches, added after that table is created
    filename TEXT NOT NULL,
    format TEXT NOT NULL CHECK (format IN ('epub', 'docx')),
    r2_key TEXT NOT NULL,
    file_size_bytes BIGINT,
    validation_status TEXT NOT NULL DEFAULT 'pending' CHECK (validation_status IN (
        'pending', 'validating', 'valid', 'invalid', 'error'
    )),
    validation_errors JSONB,                 -- array of { rule, message, location }
    uploaded_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Batch uploads (ZIP with multiple files)
CREATE TABLE publication_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
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

-- Now add the FK from source_assets to publication_batches
ALTER TABLE source_assets
    ADD CONSTRAINT fk_source_assets_batch
    FOREIGN KEY (batch_id) REFERENCES publication_batches(id) ON DELETE SET NULL;

-- Content ID sequence: for assigning numeric IDs to new books
-- Starts after the highest existing Gutenberg book ID
CREATE SEQUENCE book_content_id_seq START WITH 200000;

-- Triggers
CREATE TRIGGER set_updated_at BEFORE UPDATE ON books
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON publication_batches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE publication_batches ENABLE ROW LEVEL SECURITY;

-- genres: readable by everyone
CREATE POLICY "Genres are viewable by everyone"
    ON genres FOR SELECT
    USING (true);

-- books: published+public books readable by everyone
CREATE POLICY "Published public books are viewable by everyone"
    ON books FOR SELECT
    USING (status = 'published' AND visibility = 'public');

-- books: tenant members see tenant-only books
CREATE POLICY "Tenant members see tenant-only books"
    ON books FOR SELECT
    USING (
        visibility = 'tenant_only'
        AND status = 'published'
        AND published_by_tenant_id IN (
            SELECT tenant_id FROM tenant_memberships
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

-- books: publishers see their own books (any status)
CREATE POLICY "Publishers see own books"
    ON books FOR SELECT
    USING (published_by_user_id = auth.uid());

-- books: tenant publishers see tenant's books
CREATE POLICY "Tenant publishers see tenant books"
    ON books FOR SELECT
    USING (
        published_by_tenant_id IN (
            SELECT tenant_id FROM tenant_memberships
            WHERE user_id = auth.uid()
            AND role IN ('owner', 'admin', 'publisher', 'editor')
            AND is_active = true
        )
    );

-- books: authenticated users can create
CREATE POLICY "Authenticated users can create books"
    ON books FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL AND published_by_user_id = auth.uid());

-- books: publisher or tenant admin can update
CREATE POLICY "Publishers can update own books"
    ON books FOR UPDATE
    USING (
        published_by_user_id = auth.uid()
        OR published_by_tenant_id IN (
            SELECT tenant_id FROM tenant_memberships
            WHERE user_id = auth.uid()
            AND role IN ('owner', 'admin', 'publisher', 'editor')
            AND is_active = true
        )
    );

-- source_assets: uploader and tenant publishers can see
CREATE POLICY "Uploaders see own assets"
    ON source_assets FOR SELECT
    USING (uploaded_by = auth.uid());

CREATE POLICY "Authenticated users can create assets"
    ON source_assets FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL AND uploaded_by = auth.uid());

-- publication_batches: uploader and tenant admins can see
CREATE POLICY "Uploaders see own batches"
    ON publication_batches FOR SELECT
    USING (uploaded_by = auth.uid());

CREATE POLICY "Authenticated users can create batches"
    ON publication_batches FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL AND uploaded_by = auth.uid());

CREATE POLICY "Uploaders can update own batches"
    ON publication_batches FOR UPDATE
    USING (uploaded_by = auth.uid());
-- ============================================================
-- Migration 003: Commerce & Entitlements
-- ============================================================

-- What's for sale/rent on a book
CREATE TABLE book_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    offer_type TEXT NOT NULL CHECK (offer_type IN (
        'purchase', 'rental', 'library_license', 'subscription_inclusion'
    )),
    created_by_tenant_id UUID REFERENCES tenants(id),
    created_by_user_id UUID NOT NULL REFERENCES auth.users(id),
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
    rental_days INTEGER CHECK (
        (offer_type = 'rental' AND rental_days > 0)
        OR (offer_type != 'rental' AND rental_days IS NULL)
    ),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_book_offers_book ON book_offers(book_id) WHERE is_active = true;

-- User's right to access a book
CREATE TABLE entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    entitlement_type TEXT NOT NULL CHECK (entitlement_type IN (
        'purchase', 'rental', 'library_borrow', 'subscription', 'institutional'
    )),
    granted_by_tenant_id UUID REFERENCES tenants(id),
    offer_id UUID REFERENCES book_offers(id),
    starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,                  -- NULL = permanent (purchase)
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_entitlements_user_book ON entitlements(user_id, book_id) WHERE is_active = true;
CREATE INDEX idx_entitlements_user ON entitlements(user_id) WHERE is_active = true;

-- Stripe-connected payout accounts for tenants/publishers
CREATE TABLE payout_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    stripe_account_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'active', 'disabled'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id)
);

-- Payment transactions
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    book_id UUID NOT NULL REFERENCES books(id),
    offer_id UUID NOT NULL REFERENCES book_offers(id),
    entitlement_id UUID REFERENCES entitlements(id),
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

CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_stripe ON transactions(stripe_checkout_session_id)
    WHERE stripe_checkout_session_id IS NOT NULL;

-- Triggers
CREATE TRIGGER set_updated_at BEFORE UPDATE ON book_offers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON payout_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE book_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- book_offers: active offers on published books are public
CREATE POLICY "Active offers on published books are viewable"
    ON book_offers FOR SELECT
    USING (
        is_active = true
        AND book_id IN (SELECT id FROM books WHERE status = 'published')
    );

-- book_offers: creators see all their offers
CREATE POLICY "Creators see own offers"
    ON book_offers FOR SELECT
    USING (created_by_user_id = auth.uid());

-- book_offers: authenticated book publishers can create offers
CREATE POLICY "Book publishers can create offers"
    ON book_offers FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND created_by_user_id = auth.uid()
        AND book_id IN (
            SELECT id FROM books
            WHERE published_by_user_id = auth.uid()
               OR published_by_tenant_id IN (
                   SELECT tenant_id FROM tenant_memberships
                   WHERE user_id = auth.uid()
                   AND role IN ('owner', 'admin', 'publisher')
                   AND is_active = true
               )
        )
    );

-- book_offers: creators can update
CREATE POLICY "Offer creators can update"
    ON book_offers FOR UPDATE
    USING (
        created_by_user_id = auth.uid()
        OR created_by_tenant_id IN (
            SELECT tenant_id FROM tenant_memberships
            WHERE user_id = auth.uid()
            AND role IN ('owner', 'admin', 'publisher')
            AND is_active = true
        )
    );

-- entitlements: users see only their own
CREATE POLICY "Users see own entitlements"
    ON entitlements FOR SELECT
    USING (user_id = auth.uid());

-- entitlements: created by service role (via Worker with service key) — no direct user insert
-- The Worker creates entitlements after successful Stripe payment
CREATE POLICY "Service role creates entitlements"
    ON entitlements FOR INSERT
    WITH CHECK (false);  -- blocked for anon/authenticated; service_role bypasses RLS

-- payout_accounts: tenant owners see their own
CREATE POLICY "Tenant owners see payout accounts"
    ON payout_accounts FOR SELECT
    USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_memberships
            WHERE user_id = auth.uid() AND role = 'owner' AND is_active = true
        )
    );

-- transactions: users see own transactions
CREATE POLICY "Users see own transactions"
    ON transactions FOR SELECT
    USING (user_id = auth.uid());

-- transactions: created by service role only
CREATE POLICY "Service role creates transactions"
    ON transactions FOR INSERT
    WITH CHECK (false);  -- blocked for anon/authenticated; service_role bypasses RLS
-- ============================================================
-- Migration 004: Helper functions
-- ============================================================

-- Function to get next content_id (called from Worker via RPC)
CREATE OR REPLACE FUNCTION nextval_content_id()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT nextval('book_content_id_seq')::text;
$$;

-- Grant execute to authenticated users (Worker uses service role, but just in case)
GRANT EXECUTE ON FUNCTION nextval_content_id() TO authenticated;
GRANT EXECUTE ON FUNCTION nextval_content_id() TO service_role;
