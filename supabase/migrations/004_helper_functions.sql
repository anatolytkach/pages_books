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
