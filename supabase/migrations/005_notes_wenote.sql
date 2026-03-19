-- ============================================================
-- Migration 005: Notes & WeNote Packages
-- ============================================================

-- User notes on books (replaces localStorage as primary store)
CREATE TABLE notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    author_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    author_display_name TEXT NOT NULL,
    anchor_cfi TEXT NOT NULL,                -- EPUB Canonical Fragment Identifier
    anchor_href TEXT,                        -- chapter path
    quote TEXT,                              -- selected text
    note_text TEXT NOT NULL DEFAULT '',       -- user's comment
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN (
        'private', 'package', 'group', 'public'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notes_user_book ON notes(author_user_id, book_id);
CREATE INDEX idx_notes_book ON notes(book_id);

-- Share packages: a curated set of notes that can be shared via link
CREATE TABLE note_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT,
    book_id UUID REFERENCES books(id),       -- NULL for multi-book packages
    package_type TEXT NOT NULL DEFAULT 'single_book' CHECK (package_type IN (
        'single_book', 'multi_book', 'course', 'institution_curated'
    )),
    share_token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(12), 'hex'),
    share_link_expires_at TIMESTAMPTZ,
    audience_scope TEXT NOT NULL DEFAULT 'anyone' CHECK (audience_scope IN (
        'anyone', 'tenant_only', 'group_only', 'specific_users'
    )),
    audience_tenant_id UUID REFERENCES tenants(id),
    audience_group_id UUID REFERENCES tenant_groups(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_note_packages_token ON note_packages(share_token);
CREATE INDEX idx_note_packages_creator ON note_packages(created_by);

-- Items in a package (which notes are included)
CREATE TABLE note_package_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES note_packages(id) ON DELETE CASCADE,
    note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    display_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE(package_id, note_id)
);

-- Track who received/opened a package
CREATE TABLE note_package_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES note_packages(id) ON DELETE CASCADE,
    recipient_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(package_id, recipient_user_id)
);

-- Triggers
CREATE TRIGGER set_updated_at BEFORE UPDATE ON notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_package_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_package_recipients ENABLE ROW LEVEL SECURITY;

-- notes: users see own notes
CREATE POLICY "Users see own notes"
    ON notes FOR SELECT
    USING (author_user_id = auth.uid());

-- notes: users see public notes on books they can access
CREATE POLICY "Public notes are viewable"
    ON notes FOR SELECT
    USING (visibility = 'public');

-- notes: users see notes shared with them via packages
CREATE POLICY "Package notes are viewable by recipients"
    ON notes FOR SELECT
    USING (
        id IN (
            SELECT npi.note_id FROM note_package_items npi
            JOIN note_package_recipients npr ON npr.package_id = npi.package_id
            WHERE npr.recipient_user_id = auth.uid()
        )
    );

-- notes: authenticated users can create their own notes
CREATE POLICY "Users can create own notes"
    ON notes FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL AND author_user_id = auth.uid());

-- notes: users can update own notes
CREATE POLICY "Users can update own notes"
    ON notes FOR UPDATE
    USING (author_user_id = auth.uid());

-- notes: users can delete own notes
CREATE POLICY "Users can delete own notes"
    ON notes FOR DELETE
    USING (author_user_id = auth.uid());

-- note_packages: creators see own packages
CREATE POLICY "Creators see own packages"
    ON note_packages FOR SELECT
    USING (created_by = auth.uid());

-- note_packages: anyone can view packages by share_token (handled via service role in Worker)
-- The Worker fetches packages by token using service role key, so no anon SELECT needed.

-- note_packages: authenticated users can create packages
CREATE POLICY "Users can create packages"
    ON note_packages FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());

-- note_packages: creators can delete own packages
CREATE POLICY "Creators can delete own packages"
    ON note_packages FOR DELETE
    USING (created_by = auth.uid());

-- note_package_items: viewable if user can see the package
CREATE POLICY "Package items viewable by creator"
    ON note_package_items FOR SELECT
    USING (
        package_id IN (
            SELECT id FROM note_packages WHERE created_by = auth.uid()
        )
    );

-- note_package_items: creator can manage
CREATE POLICY "Package creator can manage items"
    ON note_package_items FOR ALL
    USING (
        package_id IN (
            SELECT id FROM note_packages WHERE created_by = auth.uid()
        )
    );

-- note_package_recipients: users see packages shared with them
CREATE POLICY "Recipients see own receipts"
    ON note_package_recipients FOR SELECT
    USING (recipient_user_id = auth.uid());

-- note_package_recipients: service role creates (via Worker)
CREATE POLICY "Service role creates recipients"
    ON note_package_recipients FOR INSERT
    WITH CHECK (false);  -- blocked for anon/authenticated; service_role bypasses RLS
