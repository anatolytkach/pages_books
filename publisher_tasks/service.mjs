import { analyzeDrafts } from "./analyst.mjs";
import { scoutOpportunities, markUrlProcessed } from "./scout.mjs";
import {
  DAILY_TASK_COUNT,
  QUORA_DAILY_TARGET,
  REDDIT_AGE_EXPANSION_HOURS,
  QUORA_QUERY_EXPANSION_LEVELS,
  REDDIT_DAILY_TARGET,
} from "./constants.mjs";
import {
  getTaskRun,
  getRecentTasksByPublisher,
  listTaskDates,
  listTasksByDate,
  listTeamMembers,
  replaceTasksForDate,
  saveDrafts,
  saveOpportunities,
  saveOutcome,
  saveTaskRun,
  seedTeamMembers,
} from "./storage.mjs";
import { orchestrateTasks, summarizeTaskRun } from "./orchestrator.mjs";
import { buildDrafts } from "./writer.mjs";
import { getDateInTimeZone, safeJsonParse, stableId, taskTextFormat } from "./utils.mjs";

function jsonResponse(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function textResponse(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function htmlResponse(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function scoreBatchCandidate(tasks) {
  const source = Array.isArray(tasks) ? tasks : [];
  const total = source.length;
  const redditCount = source.filter((task) => task.platform === "Reddit").length;
  const quoraCount = source.filter((task) => task.platform === "Quora").length;
  return {
    total,
    redditCount,
    quoraCount,
    score: total * 1000 + redditCount * 10 + quoraCount,
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildTaskDatesPage(dates, todayDate) {
  const items = (dates || [])
    .map((item) => {
      const runDate = escapeHtml(item.run_date);
      const taskCount = Number(item.task_count || 0);
      return `<li><a href="/get-tasks?date=${runDate}" target="_blank" rel="noopener noreferrer">${runDate}</a><span>${taskCount} tasks</span></li>`;
    })
    .join("");
  const empty = `<p class="empty">No task dates yet. Run <code>/run-daily?date=${escapeHtml(todayDate)}</code> first.</p>`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Publisher Task Dates</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font: 16px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f7fb; color: #172033; }
    main { max-width: 760px; margin: 0 auto; padding: 40px 20px 64px; }
    h1 { margin: 0 0 10px; font-size: 30px; }
    p { margin: 0 0 24px; color: #52607a; }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
    li { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 18px; background: #fff; border: 1px solid #d8dfec; border-radius: 14px; }
    a { color: #0b57d0; text-decoration: none; font-weight: 600; }
    a:hover { text-decoration: underline; }
    span { color: #5d6983; font-size: 14px; white-space: nowrap; }
    code { background: #eef2f8; padding: 2px 6px; border-radius: 6px; }
    .empty { padding: 18px; background: #fff; border: 1px solid #d8dfec; border-radius: 14px; }
  </style>
</head>
<body>
  <main>
    <h1>Publisher Task Dates</h1>
    <p>Open any date in a new tab to view the saved task set for that day.</p>
    ${items ? `<ul>${items}</ul>` : empty}
  </main>
</body>
</html>`;
}

function buildTaskDetailPage(runDate, tasks) {
  const cards = (tasks || [])
    .map((task, index) => {
      const lines = [
        `<div class="meta"><strong>Task ${index + 1}</strong></div>`,
        `<div class="row"><span>Platform</span><strong>${escapeHtml(task.platform)}</strong></div>`,
        `<div class="row"><span>Action</span><strong>${escapeHtml(task.action)}</strong></div>`,
        `<div class="row"><span>Publisher</span><strong>${escapeHtml(task.publisher_email)}</strong></div>`,
        `<div class="row"><span>URL</span><a href="${escapeHtml(task.source_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(task.source_url)}</a></div>`,
      ];
      if (task.target_url) {
        lines.push(
          `<div class="row"><span>Target URL</span><a href="${escapeHtml(task.target_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(task.target_url)}</a></div>`
        );
      }
      if (task.title) {
        lines.push(`<div class="row"><span>Title</span><strong>${escapeHtml(task.title)}</strong></div>`);
      }
      lines.push(`<pre>${escapeHtml(task.text || "")}</pre>`);
      return `<article>${lines.join("")}</article>`;
    })
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Publisher Tasks ${escapeHtml(runDate)}</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font: 16px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f7fb; color: #172033; }
    main { max-width: 980px; margin: 0 auto; padding: 32px 20px 64px; }
    h1 { margin: 0 0 8px; font-size: 30px; }
    p { margin: 0 0 24px; color: #52607a; }
    .back { display: inline-block; margin-bottom: 18px; color: #0b57d0; text-decoration: none; }
    .grid { display: grid; gap: 16px; }
    article { background: #fff; border: 1px solid #d8dfec; border-radius: 16px; padding: 18px; }
    .meta { margin-bottom: 12px; font-size: 18px; }
    .row { display: grid; grid-template-columns: 120px 1fr; gap: 12px; margin-bottom: 8px; align-items: start; }
    .row span { color: #5d6983; }
    a { color: #0b57d0; word-break: break-all; }
    pre { margin: 14px 0 0; white-space: pre-wrap; font: 15px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; background: #f8faff; border: 1px solid #e4eaf5; border-radius: 12px; padding: 14px; }
  </style>
</head>
<body>
  <main>
    <a class="back" href="/get-tasks">← All dates</a>
    <h1>Publisher Tasks for ${escapeHtml(runDate)}</h1>
    <p>All URLs on this page open in a new tab.</p>
    <section class="grid">${cards}</section>
  </main>
</body>
</html>`;
}

function buildMissingTaskDatePage(runDate) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>No Tasks for ${escapeHtml(runDate)}</title>
  <style>
    body { margin: 0; font: 16px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f7fb; color: #172033; }
    main { max-width: 760px; margin: 0 auto; padding: 40px 20px 64px; }
    a { color: #0b57d0; text-decoration: none; }
    article { background: #fff; border: 1px solid #d8dfec; border-radius: 16px; padding: 20px; }
    p { color: #52607a; }
  </style>
</head>
<body>
  <main>
    <a href="/get-tasks">← All dates</a>
    <article>
      <h1>No saved tasks for ${escapeHtml(runDate)}</h1>
      <p>This date has no generated snapshot yet.</p>
    </article>
  </main>
</body>
</html>`;
}

async function capturePosthog(env, eventName, properties) {
  const apiKey = String(env.POSTHOG_API_KEY || env.READERPUB_POSTHOG_API_KEY || "").trim();
  const host = String(env.READERPUB_POSTHOG_HOST || env.POSTHOG_HOST || "https://us.i.posthog.com").trim();
  if (!apiKey || !eventName) return;
  try {
    await fetch(`${host.replace(/\/$/, "")}/capture/`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        event: eventName,
        properties,
      }),
    });
  } catch (error) {}
}

async function runDailyPipeline(env, runDate) {
  await seedTeamMembers(env);
  const existingRun = await getTaskRun(env, runDate);
  if (existingRun) {
    const existing = await listTasksByDate(env, runDate);
    return {
      run_date: runDate,
      reused: true,
      tasks: existing,
      summary: existing.length ? summarizeTaskRun(existing) : safeJsonParse(existingRun.summary_json || "{}", {}),
    };
  }

  const teamMembers = await listTeamMembers(env);
  const configuredWindows = safeJsonParse(String(env.PUBLISHER_REDDIT_AGE_EXPANSION_HOURS_JSON || ""), null);
  const ageWindows = Array.isArray(configuredWindows) && configuredWindows.length
    ? configuredWindows.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
    : REDDIT_AGE_EXPANSION_HOURS;
  const configuredQuoraLevels = safeJsonParse(String(env.PUBLISHER_QUORA_QUERY_EXPANSION_LEVELS_JSON || ""), null);
  const quoraLevels = Array.isArray(configuredQuoraLevels) && configuredQuoraLevels.length
    ? configuredQuoraLevels.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value >= 0)
    : QUORA_QUERY_EXPANSION_LEVELS;

  let opportunities = [];
  let drafts = [];
  let analyzed = [];
  let tasks = [];
  let bestAttempt = {
    opportunities,
    drafts,
    analyzed,
    tasks,
    metrics: scoreBatchCandidate([]),
  };

  outer:
  for (const quoraExpansionLevel of quoraLevels) {
    for (const redditMaxAgeHours of ageWindows) {
      opportunities = await scoutOpportunities(env, { redditMaxAgeHours, quoraExpansionLevel });
      drafts = await buildDrafts(env, opportunities);
      analyzed = analyzeDrafts(opportunities, drafts);
      tasks = orchestrateTasks(env, runDate, teamMembers, analyzed, drafts);
      const metrics = scoreBatchCandidate(tasks);
      if (metrics.score > bestAttempt.metrics.score) {
        bestAttempt = {
          opportunities,
          drafts,
          analyzed,
          tasks,
          metrics,
        };
      }
      if (
        metrics.total >= DAILY_TASK_COUNT &&
        metrics.redditCount >= REDDIT_DAILY_TARGET &&
        metrics.quoraCount >= QUORA_DAILY_TARGET
      ) {
        break outer;
      }
    }
  }

  if (bestAttempt.metrics.score > scoreBatchCandidate(tasks).score) {
    opportunities = bestAttempt.opportunities;
    drafts = bestAttempt.drafts;
    analyzed = bestAttempt.analyzed;
    tasks = bestAttempt.tasks;
  }

  await saveOpportunities(env, opportunities);
  await saveDrafts(env, drafts);
  await saveOpportunities(env, analyzed);
  await replaceTasksForDate(env, runDate, tasks);
  const summary = summarizeTaskRun(tasks);
  await saveTaskRun(env, runDate, tasks.length, summary);
  for (const task of tasks) {
    await markUrlProcessed(env, task.source_url);
  }
  return {
    run_date: runDate,
    reused: false,
    tasks,
    summary,
  };
}

export async function runDailySnapshot(env, runDate) {
  return runDailyPipeline(env, runDate);
}

export async function runScheduledPublisherTaskGeneration(env, scheduledAt = new Date()) {
  const timeZone = String(env.PUBLISHER_TASK_TZ || "America/New_York");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(scheduledAt);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(values.hour || "0");
  if (hour < 5) {
    return {
      ok: true,
      skipped: true,
      reason: `outside-run-window:${hour}`,
      run_date: getDateInTimeZone(timeZone, scheduledAt),
    };
  }
  return runDailyPipeline(env, getDateInTimeZone(timeZone, scheduledAt));
}

async function readRequestJson(request) {
  try {
    return await request.json();
  } catch (error) {
    return {};
  }
}

function routeMatches(pathname, suffix) {
  return pathname === suffix || pathname === `/books/api${suffix}` || pathname === `/api${suffix}`;
}

export async function handlePublisherTaskRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const todayDate = getDateInTimeZone(String(env.PUBLISHER_TASK_TZ || "America/New_York"));
  const runDate = url.searchParams.get("date") || todayDate;

  if (routeMatches(path, "/run-daily")) {
    const result = await runDailyPipeline(env, runDate);
    if (url.searchParams.get("format") === "text") {
      return textResponse(taskTextFormat(result.tasks), 200, {
        "x-reader-route": "publisher-run-daily",
      });
    }
    return jsonResponse(
      {
        ok: true,
        run_date: result.run_date,
        reused: result.reused,
        summary: result.summary,
        tasks: result.tasks,
      },
      200,
      { "x-reader-route": "publisher-run-daily" }
    );
  }

  if (routeMatches(path, "/get-tasks")) {
    await seedTeamMembers(env);
    const requestedDate = url.searchParams.get("date");
    if (!requestedDate) {
      const dates = await listTaskDates(env);
      if (url.searchParams.get("format") === "json") {
        return jsonResponse(
          { ok: true, dates },
          200,
          { "x-reader-route": "publisher-get-task-dates" }
        );
      }
      return htmlResponse(buildTaskDatesPage(dates, todayDate), 200, {
        "x-reader-route": "publisher-get-task-dates",
      });
    }
    const tasks = await listTasksByDate(env, runDate);
    const taskRun = await getTaskRun(env, runDate);
    if (!tasks.length && !taskRun) {
      if (url.searchParams.get("format") === "json") {
        return jsonResponse(
          { ok: false, error: "No saved tasks for this date", run_date: runDate, tasks: [] },
          404,
          { "x-reader-route": "publisher-get-tasks-miss" }
        );
      }
      if (url.searchParams.get("format") === "text") {
        return textResponse(`No saved tasks for ${runDate}`, 404, {
          "x-reader-route": "publisher-get-tasks-miss",
        });
      }
      return htmlResponse(buildMissingTaskDatePage(runDate), 404, {
        "x-reader-route": "publisher-get-tasks-miss",
      });
    }
    if (url.searchParams.get("format") === "json") {
      return jsonResponse(
        { ok: true, run_date: runDate, tasks },
        200,
        { "x-reader-route": "publisher-get-tasks" }
      );
    }
    if (url.searchParams.get("format") === "text") {
      return textResponse(taskTextFormat(tasks), 200, {
        "x-reader-route": "publisher-get-tasks",
      });
    }
    return htmlResponse(buildTaskDetailPage(runDate, tasks), 200, {
      "x-reader-route": "publisher-get-tasks",
    });
  }

  if (routeMatches(path, "/report-outcome")) {
    if (request.method !== "POST") {
      return jsonResponse(
        { error: "Method not allowed" },
        405,
        { "x-reader-route": "publisher-report-outcome-method" }
      );
    }
    const body = await readRequestJson(request);
    const eventName = String(body.event_name || "").trim();
    const outcome = {
      id: stableId("outcome", `${body.task_id}:${body.publisher_email}:${body.status}:${Date.now()}`),
      task_id: String(body.task_id || "").trim(),
      publisher_email: String(body.publisher_email || "").trim(),
      source_url: String(body.source_url || "").trim(),
      target_url: String(body.target_url || "").trim(),
      status: String(body.status || "unknown").trim(),
      notes: String(body.notes || "").trim(),
      event_name: eventName,
      metadata: {
        seo_to_catalog: body.seo_to_catalog ?? null,
        seo_to_reader: body.seo_to_reader ?? null,
        book_open: body.book_open ?? null,
      },
      created_at: new Date().toISOString(),
    };
    await saveOutcome(env, outcome);
    if (eventName) {
      await capturePosthog(env, eventName, {
        source_url: outcome.source_url,
        target_url: outcome.target_url,
        publisher_email: outcome.publisher_email,
        task_id: outcome.task_id,
      });
    }
    return jsonResponse(
      { ok: true, outcome_id: outcome.id },
      200,
      { "x-reader-route": "publisher-report-outcome" }
    );
  }

  return null;
}
