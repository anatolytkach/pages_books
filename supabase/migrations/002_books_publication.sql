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
