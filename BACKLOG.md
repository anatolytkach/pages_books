# Backlog — Future Improvements

## Indexer

1. **Prefix tree threshold splitting** — JS indexer can't split an overloaded leaf node into a branch when it exceeds 50 authors. Requires periodic Python rebuild or porting the split logic.

2. **Multiple languages per book** — JS indexer only indexes under the primary language. Python handles books with multiple `dc:language` elements.

3. **Letter node structure creation** — JS can't create new letter-level nodes (authors vs prefixes decision). Only inserts into existing Python-built structure.

4. **Discover/categories for platform books** — Published books don't appear in Browse by Category. Need to map Supabase `genre_id` to discover category slugs, or build category assignment UI.

5. **Periodic full index rebuild** — Run Python `build_lang_indexes.py` periodically to fix any inconsistencies from incremental JS updates.

## Auth & Users

6. **Google OAuth** — Auth UI has the button ready but commented out. Needs Google Workspace or Cloud Console project with OAuth credentials configured in Supabase.

7. **RLS infinite recursion** — `tenant_memberships` table has overlapping SELECT policies causing infinite recursion with anon key. Service role key works fine. Fix the RLS policies.

8. **Supabase URL Configuration** — Verify Site URL and redirect URLs in Supabase dashboard → Authentication → URL Configuration.

## Commerce

9. **Stripe integration** (Phase 1 tasks 1.14-1.15) — Payment processing for book purchases and rentals. Deferred until needed.

10. **Book detail page** (Phase 1 task 1.18) — Standalone page for book info, currently partially covered by the reader entitlement gate.

## Publishing

11. **DOCX upload support** — Accept DOCX files, convert to EPUB. Currently rejected with "EPUB only" message.

12. **ZIP batch upload** — Accept ZIP with multiple EPUBs, process each independently. Phase 2 feature.

13. **Email notifications for tenant invitations** — Invitations are stored in DB but no email sent. Needs email provider integration.

14. **commit_logic.sh update** — Anatoly's commit script doesn't stage new directories (books/shared/, books/auth/, books/publish/, books/account/, supabase/, scripts/). Needs updating for the new file structure.

## Reader

15. **Reader shows EPUB metadata, not Supabase metadata** — Title/author in reader comes from OPF, not from the edited metadata in Supabase. Will be addressed when reader is further integrated with the platform.

16. **Cloudflare Access blocks staging API calls** — fetch() from staging.reader.pub to /books/api/v1/ gets intercepted by Access. Need to bypass API paths or use .pages.dev URLs for testing.

## Infrastructure

17. **Content ID sequence gaps** — Failed upload attempts consume sequence numbers (200000, 200001 were failures). Not harmful but untidy.

18. **Containerized ingestion worker** (Phase 2) — Deploy Python processing on Fly.io/Cloud Run for DOCX validation, virus scanning, and heavy processing.
