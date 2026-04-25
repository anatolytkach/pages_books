# Repository Working Guide

Start here for any new Codex task in this repository.

Always read these context files first:
- `docs/PROJECT_CONTEXT.md`
- `docs/PROJECT_RULES.md`
- `docs/CURRENT_STATE.md`
- `docs/COMPONENT_GUIDE.md`

Working rules:
- Keep the read scope narrow. After the context files, read only the component sections relevant to the task.
- Keep the change scope narrow. Do not refactor adjacent code unless the task requires it.
- Treat code, config, and the current repository state as the source of truth. If a state file is stale, update the file rather than following stale text.
- Do not invent facts. Record only what is supported by code, config, docs, or the repository state.
- User task completion standard: treat every user task as requiring exact fulfillment against the user's stated acceptance criteria. Do not report a task as completed based on a partial technical approximation, intermediate integration, or an unverified hypothesis when the user asked for an exact behavioral or visual match.
- After significant changes, update the relevant context/state files in `docs/`. Do not update them for trivial edits.
- Prefer file-based context over chat history. New Codex branches should be able to start from these files.
- Always use `rclone` for uploading book content/artifacts to R2. Do not use per-file `wrangler r2 object put` for book uploads unless `rclone` is unavailable and the user approves the fallback.

Production deploy target for `reader.pub`:
- Static reader/catalog changes for the live site must be deployed to Cloudflare Pages project `reader-books` on branch `production`.
- Use `npx wrangler pages deploy <deploy-dir> --project-name reader-books --branch production --commit-dirty=true`.
- Do not deploy live updates with the current Git branch name or `--branch main`; those create Preview deployments and do not update `reader.pub`.
- The live router serves `reader.pub/books*` and `reader.pub/reader_render_v5*` through the production `reader-books.pages.dev` deployment.
- Build a temporary deploy directory from `deploy/` with symlinks followed and exclude protected sources/artifacts before deploying. At minimum exclude:
  - `books/gutenberg_protected_epub3_sources/**`
  - `reader_render_v5/artifacts/protected-books/**`
  - `reader_render_v5/artifacts/protected-bootstrap-books/**`
  - `reader_render_v5/node_modules/**`
- Verify after deploy with `curl https://reader.pub/books/protected/?id=<id>` and confirm the expected cache-busted asset URL or changed content is present.
