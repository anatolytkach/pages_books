INSERT INTO team_members (
  email,
  karma,
  account_age_days,
  account_mode,
  daily_link_limit,
  created_at,
  updated_at
) VALUES
  ('itechfusion@gmail.com', 182, 240, 'active', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tummycatapp@gmail.com', 121, 41, 'early_active', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('urphin.juice@gmail.com', 88, 19, 'early_active', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('phorever.cloud@gmail.com', 79, 10, 'early_active', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('brokersdigest@gmail.com', 32, 3, 'warmup', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(email) DO UPDATE SET
  karma = excluded.karma,
  account_age_days = excluded.account_age_days,
  account_mode = excluded.account_mode,
  daily_link_limit = excluded.daily_link_limit,
  updated_at = CURRENT_TIMESTAMP;
