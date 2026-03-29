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
        'owner', 'admin', 'publisher', 'editor', 'librarian',
        'acquisitions_manager', 'course_admin', 'member'
    )),
    invite_type TEXT NOT NULL DEFAULT 'tenant_reader' CHECK (invite_type IN (
        'tenant_reader', 'tenant_admin', 'self_publisher'
    )),
    invited_by UUID NOT NULL REFERENCES auth.users(id),
    token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
    accepted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenant_invitations_email ON tenant_invitations(email) WHERE accepted_at IS NULL;
CREATE INDEX idx_tenant_invitations_token ON tenant_invitations(token);

-- Platform-wide superusers live above tenants.
CREATE TABLE platform_superusers (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    granted_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE platform_superuser_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
    invited_by UUID NOT NULL REFERENCES auth.users(id),
    accepted_by UUID REFERENCES auth.users(id),
    accepted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_superuser_invitations_email
    ON platform_superuser_invitations(email) WHERE accepted_at IS NULL;
CREATE INDEX idx_platform_superuser_invitations_token
    ON platform_superuser_invitations(token);

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
ALTER TABLE platform_superusers ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_superuser_invitations ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY "Superusers can see their own superuser row"
    ON platform_superusers FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Superusers can manage superuser invitations"
    ON platform_superuser_invitations FOR ALL
    USING (
        auth.uid() IN (
            SELECT user_id FROM platform_superusers
        )
    )
    WITH CHECK (
        auth.uid() IN (
            SELECT user_id FROM platform_superusers
        )
    );
