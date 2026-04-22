-- ============================================================
-- Migration 007: Permission Grants
-- ============================================================

CREATE TABLE permission_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    permission_key TEXT NOT NULL,
    scope_type TEXT NOT NULL CHECK (scope_type IN (
        'platform', 'organization', 'title'
    )),
    scope_id UUID,
    granted_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX idx_permission_grants_user
    ON permission_grants(user_id);

CREATE INDEX idx_permission_grants_scope
    ON permission_grants(scope_type, scope_id);

CREATE INDEX idx_permission_grants_user_permission
    ON permission_grants(user_id, permission_key);

ALTER TABLE permission_grants ENABLE ROW LEVEL SECURITY;

-- Policies are intentionally deferred for now.
-- Current access runs through the Worker/service-role path, and this table
-- is not yet exposed to direct client reads or writes. With RLS enabled and
-- no policies, anon/authenticated clients have no access, while service_role
-- continues to work for future backend-managed use.
