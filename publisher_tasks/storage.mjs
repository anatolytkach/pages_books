import { deriveDailyLinkLimit, deriveRedditAccountMode, TEAM_MEMBER_SEEDS } from "./constants.mjs";
import { nowIso } from "./utils.mjs";

function asText(value, fallback = "") {
  return value == null ? fallback : String(value);
}

function asNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function asNullableText(value) {
  return value == null ? null : String(value);
}

function getMemoryStore(env) {
  if (!env.__publisherTaskStore) {
    env.__publisherTaskStore = {
      team_members: [],
      opportunities: [],
      drafts: [],
      tasks: [],
      task_runs: [],
      outcomes: [],
    };
  }
  return env.__publisherTaskStore;
}

function hasD1(env) {
  return !!env.PUBLISHER_DB?.prepare;
}

async function seedTeamMembersD1(env) {
  for (const member of TEAM_MEMBER_SEEDS) {
    const accountMode = deriveRedditAccountMode(member);
    const dailyLinkLimit = deriveDailyLinkLimit(accountMode);
    await env.PUBLISHER_DB.prepare(
      `INSERT INTO team_members (
        email, karma, account_age_days, account_mode, daily_link_limit, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        karma = excluded.karma,
        account_age_days = excluded.account_age_days,
        account_mode = excluded.account_mode,
        daily_link_limit = excluded.daily_link_limit,
        updated_at = excluded.updated_at`
    )
      .bind(
        member.email,
        member.karma,
        member.account_age_days,
        accountMode,
        dailyLinkLimit,
        nowIso(),
        nowIso()
      )
      .run();
  }
}

async function listTeamMembersD1(env) {
  const result = await env.PUBLISHER_DB.prepare(
    `SELECT email, karma, account_age_days, account_mode, daily_link_limit
     FROM team_members
     ORDER BY email ASC`
  ).all();
  return result?.results || [];
}

async function saveOpportunityD1(env, item) {
  await env.PUBLISHER_DB.prepare(
    `INSERT INTO opportunities (
      id, platform, source_url, url_verified, task_type, link_appropriate, title, excerpt, intent, link_type, category_slug, category_title,
      book_hint_slug, book_hint_title, scout_score, relevance_score, deletion_risk, click_probability,
      total_score, discovered_at, published_at, raw_payload, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      platform = excluded.platform,
      source_url = excluded.source_url,
      url_verified = excluded.url_verified,
      task_type = excluded.task_type,
      link_appropriate = excluded.link_appropriate,
      title = excluded.title,
      excerpt = excluded.excerpt,
      intent = excluded.intent,
      link_type = excluded.link_type,
      category_slug = excluded.category_slug,
      category_title = excluded.category_title,
      book_hint_slug = excluded.book_hint_slug,
      book_hint_title = excluded.book_hint_title,
      scout_score = excluded.scout_score,
      relevance_score = excluded.relevance_score,
      deletion_risk = excluded.deletion_risk,
      click_probability = excluded.click_probability,
      total_score = excluded.total_score,
      published_at = excluded.published_at,
      raw_payload = excluded.raw_payload,
      updated_at = excluded.updated_at`
    )
      .bind(
        asText(item.id),
        asText(item.platform),
        asText(item.source_url),
        item.url_verified ? 1 : 0,
        asText(item.task_type || "presence"),
        item.link_appropriate ? 1 : 0,
        asText(item.title),
        asText(item.excerpt),
        asText(item.intent),
        asText(item.link_type),
        asNullableText(item.category_slug),
        asNullableText(item.category_title),
        asNullableText(item.book_hint_slug),
        asNullableText(item.book_hint_title),
        asNumber(item.scout_score),
        asNumber(item.relevance_score),
        asNumber(item.deletion_risk),
        asNumber(item.click_probability),
        asNumber(item.total_score),
        asText(item.discovered_at),
        asNullableText(item.published_at),
        JSON.stringify(item.raw_payload || {}),
        nowIso()
      )
    .run();
}

async function saveDraftD1(env, draft) {
  await env.PUBLISHER_DB.prepare(
    `INSERT INTO drafts (
      id, opportunity_id, platform, action, title, base_text, text, target_url, generation_model, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      base_text = excluded.base_text,
      text = excluded.text,
      target_url = excluded.target_url,
      generation_model = excluded.generation_model`
    )
    .bind(
      asText(draft.id),
      asText(draft.opportunity_id),
      asText(draft.platform),
      asText(draft.action),
      asText(draft.title),
      asText(draft.base_text),
      asText(draft.text),
      asText(draft.target_url),
      asText(draft.generation_model),
      asText(draft.created_at)
    )
    .run();
}

async function deleteTasksForDateD1(env, runDate) {
  await env.PUBLISHER_DB.prepare(`DELETE FROM tasks WHERE run_date = ?`).bind(runDate).run();
}

async function saveTaskD1(env, task) {
  await env.PUBLISHER_DB.prepare(
    `INSERT OR IGNORE INTO drafts (
      id, opportunity_id, platform, action, title, base_text, text, target_url, generation_model, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      asText(task.draft_id),
      asText(task.opportunity_id),
      asText(task.platform),
      asText(task.action),
      asText(task.title || ""),
      asText(task.text),
      asText(task.text),
      asText(task.target_url || ""),
      "system-fallback",
      asText(task.created_at)
    )
    .run();

  await env.PUBLISHER_DB.prepare(
    `INSERT INTO tasks (
      id, run_date, sequence_no, platform, action, publisher_email, source_url, url_verified, task_type, link_appropriate, suggested_link_sentence, title, text, target_url,
      link_type, target_slug, opportunity_id, draft_id, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      publisher_email = excluded.publisher_email,
      url_verified = excluded.url_verified,
      task_type = excluded.task_type,
      link_appropriate = excluded.link_appropriate,
      suggested_link_sentence = excluded.suggested_link_sentence,
      title = excluded.title,
      text = excluded.text,
      target_url = excluded.target_url,
      link_type = excluded.link_type,
      target_slug = excluded.target_slug,
      status = excluded.status`
    )
    .bind(
      asText(task.id),
      asText(task.run_date),
      asNumber(task.sequence_no),
      asText(task.platform),
      asText(task.action),
      asText(task.publisher_email),
      asText(task.source_url),
      task.url_verified ? 1 : 0,
      asText(task.task_type || "presence"),
      task.link_appropriate ? 1 : 0,
      asText(task.suggested_link_sentence || ""),
      asText(task.title || ""),
      asText(task.text),
      asText(task.target_url || ""),
      asText(task.link_type || ""),
      asText(task.target_slug || ""),
      asText(task.opportunity_id),
      asText(task.draft_id),
      asText(task.status),
      asText(task.created_at)
    )
    .run();
}

async function listTasksByDateD1(env, runDate) {
  const result = await env.PUBLISHER_DB.prepare(
    `SELECT id, run_date, sequence_no, platform, action, publisher_email, source_url, url_verified, task_type, link_appropriate, suggested_link_sentence, title, text, target_url,
            link_type, target_slug, opportunity_id, draft_id, status, created_at
     FROM tasks
     WHERE run_date = ?
     ORDER BY sequence_no ASC`
  )
    .bind(runDate)
    .all();
  return result?.results || [];
}

async function getRecentTasksByPublisherD1(env, email, limit = 10) {
  const result = await env.PUBLISHER_DB.prepare(
    `SELECT *
     FROM tasks
     WHERE publisher_email = ?
     ORDER BY created_at DESC
     LIMIT ?`
  )
    .bind(email, limit)
    .all();
  return result?.results || [];
}

async function listTaskDatesD1(env, limit = 90) {
  const result = await env.PUBLISHER_DB.prepare(
    `SELECT run_date, MAX(task_count) AS task_count
     FROM (
       SELECT run_date, task_count FROM task_runs
       UNION ALL
       SELECT run_date, COUNT(*) AS task_count FROM tasks GROUP BY run_date
     )
     GROUP BY run_date
     ORDER BY run_date DESC
     LIMIT ?`
  )
    .bind(limit)
    .all();
  return result?.results || [];
}

async function getTaskRunD1(env, runDate) {
  const result = await env.PUBLISHER_DB.prepare(
    `SELECT run_date, task_count, summary_json, created_at, updated_at
     FROM task_runs
     WHERE run_date = ?`
  )
    .bind(runDate)
    .first();
  if (result) return result;
  const fallback = await env.PUBLISHER_DB.prepare(
    `SELECT run_date, COUNT(*) AS task_count
     FROM tasks
     WHERE run_date = ?
     GROUP BY run_date`
  )
    .bind(runDate)
    .first();
  if (!fallback) return null;
  return {
    run_date: fallback.run_date,
    task_count: fallback.task_count,
    summary_json: "{}",
    created_at: "",
    updated_at: "",
  };
}

async function saveTaskRunD1(env, runDate, taskCount, summary) {
  await env.PUBLISHER_DB.prepare(
    `INSERT INTO task_runs (
      run_date, task_count, summary_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(run_date) DO UPDATE SET
      task_count = excluded.task_count,
      summary_json = excluded.summary_json,
      updated_at = excluded.updated_at`
  )
    .bind(
      asText(runDate),
      asNumber(taskCount),
      JSON.stringify(summary || {}),
      nowIso(),
      nowIso()
    )
    .run();
}

async function saveOutcomeD1(env, outcome) {
  await env.PUBLISHER_DB.prepare(
    `INSERT INTO outcomes (
      id, task_id, publisher_email, source_url, target_url, status, notes, event_name, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      asText(outcome.id),
      asText(outcome.task_id),
      asText(outcome.publisher_email),
      asText(outcome.source_url),
      asText(outcome.target_url),
      asText(outcome.status),
      asText(outcome.notes || ""),
      asText(outcome.event_name || ""),
      JSON.stringify(outcome.metadata || {}),
      asText(outcome.created_at)
    )
    .run();
}

export async function seedTeamMembers(env) {
  if (hasD1(env)) return seedTeamMembersD1(env);
  const store = getMemoryStore(env);
  if (store.team_members.length) return;
  store.team_members = TEAM_MEMBER_SEEDS.map((item) => {
    const accountMode = deriveRedditAccountMode(item);
    return {
      ...item,
      account_mode: accountMode,
      daily_link_limit: deriveDailyLinkLimit(accountMode),
    };
  });
}

export async function listTeamMembers(env) {
  if (hasD1(env)) return listTeamMembersD1(env);
  return [...getMemoryStore(env).team_members];
}

export async function saveOpportunities(env, items) {
  if (hasD1(env)) {
    for (const item of items || []) {
      await saveOpportunityD1(env, item);
    }
    return;
  }
  const store = getMemoryStore(env);
  const map = new Map(store.opportunities.map((item) => [item.id, item]));
  for (const item of items || []) {
    map.set(item.id, { ...map.get(item.id), ...item });
  }
  store.opportunities = [...map.values()];
}

export async function saveDrafts(env, drafts) {
  if (hasD1(env)) {
    for (const draft of drafts || []) {
      await saveDraftD1(env, draft);
    }
    return;
  }
  const store = getMemoryStore(env);
  const map = new Map(store.drafts.map((item) => [item.id, item]));
  for (const draft of drafts || []) {
    map.set(draft.id, draft);
  }
  store.drafts = [...map.values()];
}

export async function replaceTasksForDate(env, runDate, tasks) {
  if (hasD1(env)) {
    await deleteTasksForDateD1(env, runDate);
    for (const task of tasks || []) {
      await saveTaskD1(env, task);
    }
    return;
  }
  const store = getMemoryStore(env);
  store.tasks = store.tasks.filter((item) => item.run_date !== runDate).concat(tasks || []);
}

export async function listTasksByDate(env, runDate) {
  if (hasD1(env)) return listTasksByDateD1(env, runDate);
  return getMemoryStore(env)
    .tasks.filter((item) => item.run_date === runDate)
    .sort((a, b) => a.sequence_no - b.sequence_no);
}

export async function getRecentTasksByPublisher(env, email, limit = 10) {
  if (hasD1(env)) return getRecentTasksByPublisherD1(env, email, limit);
  return getMemoryStore(env)
    .tasks.filter((item) => item.publisher_email === email)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, limit);
}

export async function listTaskDates(env, limit = 90) {
  if (hasD1(env)) return listTaskDatesD1(env, limit);
  return [...getMemoryStore(env).task_runs]
    .sort((left, right) => String(right.run_date).localeCompare(String(left.run_date)))
    .slice(0, limit)
    .map((item) => ({ run_date: item.run_date, task_count: item.task_count }));
}

export async function getTaskRun(env, runDate) {
  if (hasD1(env)) return getTaskRunD1(env, runDate);
  return getMemoryStore(env).task_runs.find((item) => item.run_date === runDate) || null;
}

export async function saveTaskRun(env, runDate, taskCount, summary) {
  if (hasD1(env)) return saveTaskRunD1(env, runDate, taskCount, summary);
  const store = getMemoryStore(env);
  const next = {
    run_date: runDate,
    task_count: asNumber(taskCount),
    summary_json: summary || {},
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  const index = store.task_runs.findIndex((item) => item.run_date === runDate);
  if (index >= 0) {
    store.task_runs[index] = {
      ...store.task_runs[index],
      task_count: next.task_count,
      summary_json: next.summary_json,
      updated_at: next.updated_at,
    };
    return;
  }
  store.task_runs.push(next);
}

export async function listLegacyTaskDatesFromTasks(env, limit = 90) {
  const counts = new Map();
  for (const task of getMemoryStore(env).tasks) {
    counts.set(task.run_date, (counts.get(task.run_date) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => String(right[0]).localeCompare(String(left[0])))
    .slice(0, limit)
    .map(([run_date, task_count]) => ({ run_date, task_count }));
}

export async function saveOutcome(env, outcome) {
  if (hasD1(env)) return saveOutcomeD1(env, outcome);
  getMemoryStore(env).outcomes.push(outcome);
}
