CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  source_url TEXT NOT NULL UNIQUE,
  url_verified INTEGER NOT NULL DEFAULT 0,
  task_type TEXT NOT NULL DEFAULT 'presence',
  link_appropriate INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  intent TEXT NOT NULL,
  link_type TEXT NOT NULL,
  category_slug TEXT,
  category_title TEXT,
  book_hint_slug TEXT,
  book_hint_title TEXT,
  scout_score REAL DEFAULT 0,
  relevance_score REAL DEFAULT 0,
  deletion_risk REAL DEFAULT 0,
  click_probability REAL DEFAULT 0,
  total_score REAL DEFAULT 0,
  discovered_at TEXT NOT NULL,
  published_at TEXT,
  raw_payload TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_opportunities_total_score
  ON opportunities(total_score DESC, discovered_at DESC);

CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  action TEXT NOT NULL,
  title TEXT DEFAULT '',
  base_text TEXT NOT NULL,
  text TEXT NOT NULL,
  target_url TEXT DEFAULT '',
  generation_model TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (opportunity_id) REFERENCES opportunities(id)
);

CREATE INDEX IF NOT EXISTS idx_drafts_opportunity_id
  ON drafts(opportunity_id);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  run_date TEXT NOT NULL,
  sequence_no INTEGER NOT NULL,
  platform TEXT NOT NULL,
  action TEXT NOT NULL,
  publisher_email TEXT NOT NULL,
  source_url TEXT NOT NULL,
  url_verified INTEGER NOT NULL DEFAULT 0,
  task_type TEXT NOT NULL DEFAULT 'presence',
  link_appropriate INTEGER NOT NULL DEFAULT 0,
  why_this_link TEXT DEFAULT '',
  suggested_link_sentence TEXT DEFAULT '',
  title TEXT DEFAULT '',
  text TEXT NOT NULL,
  target_url TEXT DEFAULT '',
  link_type TEXT DEFAULT '',
  target_slug TEXT DEFAULT '',
  opportunity_id TEXT NOT NULL,
  draft_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  FOREIGN KEY (opportunity_id) REFERENCES opportunities(id),
  FOREIGN KEY (draft_id) REFERENCES drafts(id),
  FOREIGN KEY (publisher_email) REFERENCES team_members(email),
  UNIQUE (run_date, sequence_no)
);

CREATE INDEX IF NOT EXISTS idx_tasks_run_date
  ON tasks(run_date, sequence_no);

CREATE INDEX IF NOT EXISTS idx_tasks_publisher_email
  ON tasks(publisher_email, created_at DESC);

CREATE TABLE IF NOT EXISTS task_runs (
  run_date TEXT PRIMARY KEY,
  task_count INTEGER NOT NULL DEFAULT 0,
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_runs_created_at
  ON task_runs(created_at DESC);

CREATE TABLE IF NOT EXISTS outcomes (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  publisher_email TEXT NOT NULL,
  source_url TEXT NOT NULL,
  target_url TEXT DEFAULT '',
  status TEXT NOT NULL,
  notes TEXT DEFAULT '',
  event_name TEXT DEFAULT '',
  metadata_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (publisher_email) REFERENCES team_members(email)
);

CREATE INDEX IF NOT EXISTS idx_outcomes_task_id
  ON outcomes(task_id, created_at DESC);

CREATE TABLE IF NOT EXISTS team_members (
  email TEXT PRIMARY KEY,
  karma INTEGER NOT NULL DEFAULT 0,
  account_age_days INTEGER NOT NULL DEFAULT 0,
  account_mode TEXT NOT NULL CHECK (account_mode IN ('warmup', 'early_active', 'active')),
  daily_link_limit INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
