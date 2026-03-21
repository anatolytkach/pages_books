# Publisher Task System

Production-ready MVP for daily manual publishing tasks that drive users to `https://reader.pub/books/`.

## Project structure

- `_worker.js`
  Routes requests and delegates task-system endpoints to the publisher pipeline.
- `publisher_tasks/scout.mjs`
  Finds candidates on Reddit, Quora, and Medium, filters them, and respects the daily candidate cap.
- `publisher_tasks/writer.mjs`
  Generates one draft per opportunity with OpenAI fallback to deterministic copy.
- `publisher_tasks/analyst.mjs`
  Scores relevance, deletion risk, and click probability without exposing analytics in output.
- `publisher_tasks/orchestrator.mjs`
  Picks 10 tasks, assigns publishers, chooses link type, and enforces warmup vs active rules.
- `publisher_tasks/storage.mjs`
  Persists to D1 in production and falls back to in-memory storage for tests.
- `publisher_tasks/service.mjs`
  End-to-end pipeline and HTTP handlers for `/run-daily`, `/get-tasks`, `/report-outcome`.
- `d1/publisher_tasks_schema.sql`
  D1 schema for `opportunities`, `drafts`, `tasks`, `outcomes`, `team_members`.
- `d1/publisher_tasks_seed.sql`
  Seeds the five publisher accounts and derives `account_mode`.
- `examples/publisher_daily_run.json`
  Example daily-run response summary.
- `examples/publisher_output.txt`
  Example task output in the required human-readable format.

## Endpoints

- `GET /run-daily`
  Runs the full pipeline for the requested `date` or the current America/New_York day.
- `GET /get-tasks`
  Returns the daily tasks as plain text in the required task block format.
- `GET /get-tasks?format=json`
  Returns machine-readable tasks.
- `POST /report-outcome`
  Stores manual publishing results and forwards PostHog events when configured.

The same endpoints are also available under `/api/...` and `/books/api/...`.

## Required bindings

- `PUBLISHER_DB`
  Cloudflare D1 binding.
- `PUBLISHER_TASK_CACHE`
  Cloudflare KV binding storing `URL -> { processed: true, timestamp }`.
- `OPENAI_API_KEY`
  Optional. If missing, the Writer falls back to deterministic copy.
- `POSTHOG_API_KEY`
  Optional. If present, `report-outcome` forwards events to PostHog.

## Safety note

Your requirements contain a hard conflict:

- 10 tasks/day
- 50/30/20 link mix
- warmup accounts may not post links
- active accounts should stay below aggressive link density

Because of that, this MVP caps the daily linked subset at 4 tasks and applies the 50/30/20 mix inside that linked subset:

- 2 book links
- 1 category link
- 1 catalog link

The remaining tasks are no-link warmup-safe tasks.
