-- ============================================================
-- Migration 006: Publishing Jobs
-- ============================================================

CREATE TABLE publishing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type TEXT NOT NULL CHECK (job_type IN (
        'protected_publish'
    )),
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    content_id TEXT NOT NULL,
    reader_type TEXT NOT NULL CHECK (reader_type IN (
        'protected'
    )),
    source_format TEXT NOT NULL CHECK (source_format IN (
        'epub', 'docx'
    )),
    converter_key TEXT,
    source_filename TEXT,
    source_mime_type TEXT,
    source_r2_key TEXT NOT NULL,
    protected_prefix TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN (
        'awaiting_upload',
        'uploaded',
        'queued',
        'validating_source',
        'not_validated',
        'normalizing',
        'building_artifact',
        'uploading_artifacts',
        'reindexing',
        'completed',
        'failed'
    )),
    validation_status TEXT NOT NULL DEFAULT 'pending' CHECK (validation_status IN (
        'pending',
        'passed',
        'rejected'
    )),
    validation_errors JSONB,
    visibility TEXT NOT NULL CHECK (visibility IN (
        'public',
        'tenant_only',
        'private'
    )),
    tenant_id UUID REFERENCES tenants(id),
    tenant_slug TEXT,
    submitted_title TEXT,
    submitted_author TEXT,
    publication_date DATE,
    triggered_by_user_id UUID NOT NULL REFERENCES auth.users(id),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    error_step TEXT,
    error_message TEXT,
    result_payload JSONB,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_publishing_jobs_status_created
    ON publishing_jobs(status, created_at);

CREATE INDEX idx_publishing_jobs_book
    ON publishing_jobs(book_id);

CREATE INDEX idx_publishing_jobs_triggered_by_created
    ON publishing_jobs(triggered_by_user_id, created_at DESC);

CREATE INDEX idx_publishing_jobs_content
    ON publishing_jobs(content_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON publishing_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE publishing_jobs ENABLE ROW LEVEL SECURITY;

-- Job submitters can read the jobs they created.
CREATE POLICY "Publishers see own publishing jobs"
    ON publishing_jobs FOR SELECT
    USING (triggered_by_user_id = auth.uid());

-- Tenant publishers/admins can read jobs associated with their tenant.
CREATE POLICY "Tenant publishers see tenant publishing jobs"
    ON publishing_jobs FOR SELECT
    USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_memberships
            WHERE user_id = auth.uid()
            AND role IN ('owner', 'admin', 'publisher', 'editor')
            AND is_active = true
        )
    );
