import { analyzeDrafts } from "./analyst.mjs";
import { scoutOpportunities } from "./scout.mjs";
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
  listSourceAssignments,
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

function getFixedSnapshot(runDate) {
  const snapshot = FIXED_SNAPSHOTS[runDate];
  if (!Array.isArray(snapshot) || !snapshot.length) return [];
  return snapshot.map((task) => ({ ...task }));
}

function mergeDateIndex(savedDates) {
  const map = new Map((savedDates || []).map((item) => [String(item.run_date || ""), {
    run_date: String(item.run_date || ""),
    task_count: Number(item.task_count || 0),
  }]));
  for (const [runDate, tasks] of Object.entries(FIXED_SNAPSHOTS)) {
    if (!map.has(runDate)) {
      map.set(runDate, { run_date: runDate, task_count: tasks.length });
    }
  }
  return [...map.values()].sort((left, right) => String(right.run_date).localeCompare(String(left.run_date)));
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

const KNOWN_BROKEN_QUORA_REPAIRS = {
  "https://www.quora.com/How-do-you-focus-better-on-your-phone": {
    source_url: "https://www.quora.com/What-is-the-best-way-to-read-any-book-on-a-phone",
    text: "What helped me most was treating phone reading like a short, repeatable session instead of a test of concentration. A cleaner screen setup and fewer interruptions did more than forcing myself to focus harder.",
    task_type: "presence",
    link_appropriate: 0,
    target_url: "",
    link_type: "",
    target_slug: "",
    suggested_link_sentence: "",
  },
  "https://www.quora.com/Where-can-I-read-classic-novels-online-legally": {
    source_url: "https://www.quora.com/What-websites-apps-can-I-use-to-read-books-for-free",
    text: "I would choose a source that is clearly legal, easy to browse, and comfortable on a phone, because those details usually decide whether you keep reading or drop the book after a few pages.",
    task_type: "qualified_disclosure",
    link_appropriate: 1,
    target_url: "https://reader.pub/books/#view=category&category=classics-of-literature",
    link_type: "category",
    target_slug: "classics-of-literature",
    suggested_link_sentence: "When I want one cleaner place to browse classics, I usually start here: https://reader.pub/books/#view=category&category=classics-of-literature",
  },
};

const RESTORABLE_VALID_QUORA_TASKS = {
  "2026-03-22": [
    {
      id: "task_20260322_quora_1",
      run_date: "2026-03-22",
      sequence_no: 9,
      platform: "Quora",
      action: "Answer",
      publisher_email: "itechfusion@gmail.com",
      source_url: "https://www.quora.com/Can-you-recommend-must-read-classic-novels-for-literature-enthusiasts",
      url_verified: 1,
      task_type: "presence",
      link_appropriate: 0,
      suggested_link_sentence: "",
      title: "",
      text: "That lines up with my experience: once tone is often a better filter than popularity, narrowing the next pick stops feeling like work.",
      target_url: "",
      link_type: "",
      target_slug: "",
      opportunity_id: "opp_nfg5ma",
      draft_id: "opp_nfg5ma_draft",
      status: "pending",
      created_at: "2026-03-22T09:00:26.659Z",
      topic_type: "book",
    },
    {
      id: "task_20260322_quora_2",
      run_date: "2026-03-22",
      sequence_no: 10,
      platform: "Quora",
      action: "Answer",
      publisher_email: "phorever.cloud@gmail.com",
      source_url: "https://www.quora.com/In-what-order-of-classic-novels-should-I-read-as-a-beginner",
      url_verified: 1,
      task_type: "presence",
      link_appropriate: 0,
      suggested_link_sentence: "",
      title: "",
      text: "I would start with a classic that has a clear voice and steady momentum, because beginning with something approachable usually works better than aiming for prestige first.",
      target_url: "",
      link_type: "",
      target_slug: "",
      opportunity_id: "opp_mre8fy",
      draft_id: "opp_mre8fy_draft",
      status: "pending",
      created_at: "2026-03-22T09:00:26.659Z",
      topic_type: "book",
    },
  ],
};

const FIXED_SNAPSHOTS = {
  "2026-03-23": [
    {
      id: "task_20260323_1",
      run_date: "2026-03-23",
      sequence_no: 1,
      platform: "Reddit",
      action: "Comment",
      publisher_email: "brokersdigest@gmail.com",
      source_url: "https://www.reddit.com/r/suggestmeabook/comments/1s0isyp/books_where_the_city_feels_alive/",
      url_verified: 1,
      task_type: "presence",
      link_appropriate: 0,
      why_this_link: "",
      suggested_link_sentence: "",
      title: "",
      text: "My take is that the reading choice gets much simpler when small windows of attention change what feels readable.",
      target_url: "",
      link_type: "",
      target_slug: "",
      opportunity_id: "opp_1qmvvud",
      draft_id: "opp_1qmvvud_draft",
      status: "pending",
      created_at: "2026-03-23T09:00:00.000Z",
      topic_type: "book",
    },
    {
      id: "task_20260323_2",
      run_date: "2026-03-23",
      sequence_no: 2,
      platform: "Reddit",
      action: "Comment",
      publisher_email: "brokersdigest@gmail.com",
      source_url: "https://www.reddit.com/r/booksuggestions/comments/1s0jjel/any_good_serial_killer_books_you_recommend/",
      url_verified: 1,
      task_type: "presence",
      link_appropriate: 0,
      why_this_link: "",
      suggested_link_sentence: "",
      title: "",
      text: "What jumps out to me is that tone is often a better filter than popularity, and that changes the whole feel of narrowing the next pick.",
      target_url: "",
      link_type: "",
      target_slug: "",
      opportunity_id: "opp_1362s4g",
      draft_id: "opp_1362s4g_draft",
      status: "pending",
      created_at: "2026-03-23T09:00:00.000Z",
      topic_type: "book",
    },
    {
      id: "task_20260323_3",
      run_date: "2026-03-23",
      sequence_no: 3,
      platform: "Reddit",
      action: "Comment",
      publisher_email: "tummycatapp@gmail.com",
      source_url: "https://www.reddit.com/r/suggestmeabook/comments/1s0j66g/looking_for_quiet_observant_slice_of_life_books/",
      url_verified: 1,
      task_type: "presence",
      link_appropriate: 0,
      why_this_link: "",
      suggested_link_sentence: "",
      title: "",
      text: "For me, keeping attention steady works best when fit and pacing usually matter more than prestige.",
      target_url: "",
      link_type: "",
      target_slug: "",
      opportunity_id: "opp_1ac65ej",
      draft_id: "opp_1ac65ej_draft",
      status: "pending",
      created_at: "2026-03-23T09:00:00.000Z",
      topic_type: "book",
    },
    {
      id: "task_20260323_4",
      run_date: "2026-03-23",
      sequence_no: 4,
      platform: "Reddit",
      action: "Comment",
      publisher_email: "tummycatapp@gmail.com",
      source_url: "https://www.reddit.com/r/suggestmeabook/comments/1s0ho9c/looking_for_recommendations_similar_to_emily/",
      url_verified: 1,
      task_type: "presence",
      link_appropriate: 0,
      why_this_link: "",
      suggested_link_sentence: "",
      title: "",
      text: "The pattern I keep noticing is that the reading choice improves once fit and pacing usually matter more than prestige.",
      target_url: "",
      link_type: "",
      target_slug: "",
      opportunity_id: "opp_38mtga",
      draft_id: "opp_38mtga_draft",
      status: "pending",
      created_at: "2026-03-23T09:00:00.000Z",
      topic_type: "book",
    },
    {
      id: "task_20260323_5",
      run_date: "2026-03-23",
      sequence_no: 5,
      platform: "Reddit",
      action: "Comment",
      publisher_email: "urphin.juice@gmail.com",
      source_url: "https://www.reddit.com/r/booksuggestions/comments/1s0ls4o/wanting_to_get_into_nonfiction_as_a_heavy_fantasy/",
      url_verified: 1,
      task_type: "presence",
      link_appropriate: 0,
      why_this_link: "",
      suggested_link_sentence: "",
      title: "",
      text: "My own experience was pretty simple: once fit and pacing usually matter more than prestige, science-fiction pacing became easier to stick with.",
      target_url: "",
      link_type: "",
      target_slug: "",
      opportunity_id: "opp_1mqy2z6",
      draft_id: "opp_1mqy2z6_draft",
      status: "pending",
      created_at: "2026-03-23T09:00:00.000Z",
      topic_type: "book",
    },
    {
      id: "task_20260323_6",
      run_date: "2026-03-23",
      sequence_no: 6,
      platform: "Reddit",
      action: "Comment",
      publisher_email: "urphin.juice@gmail.com",
      source_url: "https://www.reddit.com/r/booksuggestions/comments/1s0ll27/any_b12_level_yacrime_mystery_vibes_book/",
      url_verified: 1,
      task_type: "presence",
      link_appropriate: 0,
      why_this_link: "",
      suggested_link_sentence: "",
      title: "",
      text: "I agree with the people saying a clean voice and steady pacing matter more than complexity; that usually decides whether starting with a mystery that moves quickly lands or not.",
      target_url: "",
      link_type: "",
      target_slug: "",
      opportunity_id: "opp_oub0i9",
      draft_id: "opp_oub0i9_draft",
      status: "pending",
      created_at: "2026-03-23T09:00:00.000Z",
      topic_type: "book",
    },
    {
      id: "task_20260323_7",
      run_date: "2026-03-23",
      sequence_no: 7,
      platform: "Reddit",
      action: "Comment",
      publisher_email: "itechfusion@gmail.com",
      source_url: "https://www.reddit.com/r/suggestmeabook/comments/1s0gr53/book_thats_emotionally_tense_a_lot_of_the_time/",
      url_verified: 1,
      task_type: "presence",
      link_appropriate: 0,
      why_this_link: "",
      suggested_link_sentence: "",
      title: "",
      text: "The point where this clicked for me was when fit and pacing usually matter more than prestige; after that, the reading choice felt much lighter.",
      target_url: "",
      link_type: "",
      target_slug: "",
      opportunity_id: "opp_157nhrt",
      draft_id: "opp_157nhrt_draft",
      status: "pending",
      created_at: "2026-03-23T09:00:00.000Z",
      topic_type: "book",
    },
    {
      id: "task_20260323_8",
      run_date: "2026-03-23",
      sequence_no: 8,
      platform: "Reddit",
      action: "Comment",
      publisher_email: "itechfusion@gmail.com",
      source_url: "https://www.reddit.com/r/booksuggestions/comments/1s0lbrx/suggest_me_agatha_christie_books/",
      url_verified: 1,
      task_type: "presence",
      link_appropriate: 0,
      why_this_link: "",
      suggested_link_sentence: "",
      title: "",
      text: "My take is that starting with a mystery that moves quickly gets much simpler when a clean voice and steady pacing matter more than complexity.",
      target_url: "",
      link_type: "",
      target_slug: "",
      opportunity_id: "opp_1bxr2s1",
      draft_id: "opp_1bxr2s1_draft",
      status: "pending",
      created_at: "2026-03-23T09:00:00.000Z",
      topic_type: "book",
    },
    {
      id: "task_20260323_9",
      run_date: "2026-03-23",
      sequence_no: 9,
      platform: "Quora",
      action: "Answer",
      publisher_email: "tummycatapp@gmail.com",
      source_url: "https://www.quora.com/Can-you-recommend-must-read-classic-novels-for-literature-enthusiasts",
      url_verified: 1,
      task_type: "presence",
      link_appropriate: 0,
      why_this_link: "",
      suggested_link_sentence: "",
      title: "",
      text: "That lines up with my experience: once tone is often a better filter than popularity, narrowing the next pick stops feeling like work.",
      target_url: "",
      link_type: "",
      target_slug: "",
      opportunity_id: "opp_nfg5ma",
      draft_id: "opp_nfg5ma_draft",
      status: "pending",
      created_at: "2026-03-23T09:00:00.000Z",
      topic_type: "book",
    },
    {
      id: "task_20260323_10",
      run_date: "2026-03-23",
      sequence_no: 10,
      platform: "Quora",
      action: "Answer",
      publisher_email: "brokersdigest@gmail.com",
      source_url: "https://www.quora.com/In-what-order-of-classic-novels-should-I-read-as-a-beginner",
      url_verified: 1,
      task_type: "presence",
      link_appropriate: 0,
      why_this_link: "",
      suggested_link_sentence: "",
      title: "",
      text: "I would start with a classic that has a clear voice and steady momentum, because beginning with something approachable usually works better than aiming for prestige first.",
      target_url: "",
      link_type: "",
      target_slug: "",
      opportunity_id: "opp_mre8fy",
      draft_id: "opp_mre8fy_draft",
      status: "pending",
      created_at: "2026-03-23T09:00:00.000Z",
      topic_type: "book",
    },
  ],
  "2026-03-21": [
    {
      id: "task_20260321_1",
      run_date: "2026-03-21",
      sequence_no: 1,
      platform: "Reddit",
      action: "Comment",
      publisher_email: "itechfusion@gmail.com",
      source_url: "https://www.reddit.com/r/suggestmeabook/comments/1rz320n/smab_that_feels_like_david_the_gnome/",
      url_verified: 1,
      task_type: "presence",
      link_appropriate: 0,
      suggested_link_sentence: "",
      title: "",
      text: "If I were answering this directly, I would start with SMAB that feels like David the Gnome and keep in mind that Did anyone else watch this show as a kid?? Gnomes, magic, cozy, woodland creatures.",
      target_url: "",
      link_type: "",
      target_slug: "",
      opportunity_id: "opp_1h35m0f",
      draft_id: "opp_1h35m0f_draft",
      status: "pending",
      created_at: "2026-03-21T11:15:00.000Z",
    },
    {
      id: "task_20260321_2",
      run_date: "2026-03-21",
      sequence_no: 2,
      platform: "Reddit",
      action: "Comment",
      publisher_email: "itechfusion@gmail.com",
      source_url: "https://www.reddit.com/r/books/comments/1rxw3ze/is_there_an_author_whose_broader_catalogue_you/",
      url_verified: 1,
      task_type: "presence",
      link_appropriate: 0,
      suggested_link_sentence: "",
      title: "",
      text: "I agree with the people saying If I read something and like it, I tend to seek out other works by the same author; that usually decides whether Is there an author whose broader catalogue you like, but whose... lands or not.",
      target_url: "",
      link_type: "",
      target_slug: "",
      opportunity_id: "opp_ackhey",
      draft_id: "opp_ackhey_draft",
      status: "pending",
      created_at: "2026-03-21T11:15:00.000Z",
    },
    {
      id: "task_20260321_3",
      run_date: "2026-03-21",
      sequence_no: 3,
      platform: "Reddit",
      action: "Comment",
      publisher_email: "phorever.cloud@gmail.com",
      source_url: "https://www.reddit.com/r/suggestmeabook/comments/1rz23dd/british_books_under_or_so_200_pages/",
      url_verified: 1,
      task_type: "presence",
      link_appropriate: 0,
      suggested_link_sentence: "",
      title: "",
      text: "For me, narrowing the next pick works best when tone is often a better filter than popularity.",
      target_url: "",
      link_type: "",
      target_slug: "",
      opportunity_id: "opp_1hvuljw",
      draft_id: "opp_1hvuljw_draft",
      status: "pending",
      created_at: "2026-03-21T11:15:00.000Z",
    },
    {
      id: "task_20260321_4",
      run_date: "2026-03-21",
      sequence_no: 4,
      platform: "Reddit",
      action: "Comment",
      publisher_email: "phorever.cloud@gmail.com",
      source_url: "https://www.reddit.com/r/suggestmeabook/comments/1rz39hp/middle_gradeya_pacific_islander_authors/",
      url_verified: 1,
      task_type: "presence",
      link_appropriate: 0,
      suggested_link_sentence: "",
      title: "",
      text: "For me, Middle Grade/YA Pacific Islander authors works best when Hello! I’m a librarian working at a middle school library and I’ve encountered a bit.",
      target_url: "",
      link_type: "",
      target_slug: "",
      opportunity_id: "opp_17hplg8",
      draft_id: "opp_17hplg8_draft",
      status: "pending",
      created_at: "2026-03-21T11:15:00.000Z",
    },
    {
      id: "task_20260321_5",
      run_date: "2026-03-21",
      sequence_no: 5,
      platform: "Reddit",
      action: "Comment",
      publisher_email: "tummycatapp@gmail.com",
      source_url: "https://www.reddit.com/r/books/comments/1rxe5gu/my_2026_reads_so_far/",
      url_verified: 1,
      task_type: "presence",
      link_appropriate: 0,
      suggested_link_sentence: "",
      title: "",
      text: "For me, My 2026 Reads So Far works best when *Edit- Reposting after the first was removed.* I told myself I must read one book a.",
      target_url: "",
      link_type: "",
      target_slug: "",
      opportunity_id: "opp_9w6pmj",
      draft_id: "opp_9w6pmj_draft",
      status: "pending",
      created_at: "2026-03-21T11:15:00.000Z",
    },
    {
      id: "task_20260321_6",
      run_date: "2026-03-21",
      sequence_no: 6,
      platform: "Reddit",
      action: "Comment",
      publisher_email: "urphin.juice@gmail.com",
      source_url: "https://www.reddit.com/r/books/comments/1rz0fmo/article_what_were_you_reading_in_the_90s_5/",
      url_verified: 1,
      task_type: "presence",
      link_appropriate: 0,
      suggested_link_sentence: "",
      title: "",
      text: "A practical recommendation is to treat Article: What were you reading in the 90s? 5 literary experts go... as the priority and remember that Article: What were you reading in the 90s? literary experts go back in time.",
      target_url: "",
      link_type: "",
      target_slug: "",
      opportunity_id: "opp_1mf7zyg",
      draft_id: "opp_1mf7zyg_draft",
      status: "pending",
      created_at: "2026-03-21T11:15:00.000Z",
    },
    {
      id: "task_20260321_7",
      run_date: "2026-03-21",
      sequence_no: 7,
      platform: "Reddit",
      action: "Comment",
      publisher_email: "urphin.juice@gmail.com",
      source_url: "https://www.reddit.com/r/books/comments/1ryf1kw/winniethepooh_at_100_this_muchloved_classic/",
      url_verified: 1,
      task_type: "presence",
      link_appropriate: 0,
      suggested_link_sentence: "",
      title: "",
      text: "What jumps out to me is that Winnie-the-Pooh at : this much-loved classic illustrates how books can boost our wellbeing, and that changes the whole feel of approaching classics without overthinking them.",
      target_url: "",
      link_type: "",
      target_slug: "",
      opportunity_id: "opp_1a2dcq6",
      draft_id: "opp_1a2dcq6_draft",
      status: "pending",
      created_at: "2026-03-21T11:15:00.000Z",
    },
    {
      id: "task_20260321_8",
      run_date: "2026-03-21",
      sequence_no: 8,
      platform: "Reddit",
      action: "Comment",
      publisher_email: "brokersdigest@gmail.com",
      source_url: "https://www.reddit.com/r/suggestmeabook/comments/1rz28gc/seeking_very_niche_book_recommendation/",
      url_verified: 1,
      task_type: "presence",
      link_appropriate: 0,
      suggested_link_sentence: "",
      title: "",
      text: "I only started enjoying narrowing the next pick after I realized I read Small Game by Blair Braverman and LOVED it! The theme is what I'm looking for!.",
      target_url: "",
      link_type: "",
      target_slug: "",
      opportunity_id: "opp_w14ww",
      draft_id: "opp_w14ww_draft",
      status: "pending",
      created_at: "2026-03-21T11:15:00.000Z",
    },
    {
      id: "task_20260321_9",
      run_date: "2026-03-21",
      sequence_no: 9,
      platform: "Quora",
      action: "Answer",
      publisher_email: "tummycatapp@gmail.com",
      source_url: "https://www.quora.com/What-is-the-best-way-to-read-any-book-on-a-phone",
      url_verified: 1,
      task_type: "presence",
      link_appropriate: 0,
      suggested_link_sentence: "",
      title: "",
      text: "What helped me most was treating phone reading like a short, repeatable session instead of a test of concentration. A cleaner screen setup and fewer interruptions did more than forcing myself to focus harder.",
      target_url: "",
      link_type: "",
      target_slug: "",
      opportunity_id: "opp_20260321_quora_focus",
      draft_id: "draft_20260321_quora_focus",
      status: "pending",
      created_at: "2026-03-21T11:15:00.000Z",
    },
    {
      id: "task_20260321_10",
      run_date: "2026-03-21",
      sequence_no: 10,
      platform: "Quora",
      action: "Answer",
      publisher_email: "itechfusion@gmail.com",
      source_url: "https://www.quora.com/What-websites-apps-can-I-use-to-read-books-for-free",
      url_verified: 1,
      task_type: "qualified_disclosure",
      link_appropriate: 1,
      suggested_link_sentence: "When I want one cleaner place to browse classics, I usually start here: https://reader.pub/books/#view=category&category=classics-of-literature",
      title: "",
      text: "I would choose a source that is clearly legal, easy to browse, and comfortable on a phone, because those details usually decide whether you keep reading or drop the book after a few pages.",
      target_url: "https://reader.pub/books/#view=category&category=classics-of-literature",
      link_type: "category",
      target_slug: "classics-of-literature",
      opportunity_id: "opp_20260321_quora_classics",
      draft_id: "draft_20260321_quora_classics",
      status: "pending",
      created_at: "2026-03-21T11:15:00.000Z",
    },
  ],
};

async function repairKnownBrokenQuoraTasks(env, runDate) {
  await seedTeamMembers(env);
  if (FIXED_SNAPSHOTS[runDate]) {
    await replaceTasksForDate(env, runDate, FIXED_SNAPSHOTS[runDate]);
    await saveTaskRun(env, runDate, FIXED_SNAPSHOTS[runDate].length, summarizeTaskRun(FIXED_SNAPSHOTS[runDate]));
    return FIXED_SNAPSHOTS[runDate];
  }
  const tasks = await listTasksByDate(env, runDate);
  if (!tasks.length) return null;
  let changed = false;
  const repairedTasks = tasks.map((task) => {
    const repair = KNOWN_BROKEN_QUORA_REPAIRS[task.source_url];
    if (!repair) return task;
    changed = true;
    return {
      ...task,
      source_url: repair.source_url,
      text: repair.text,
      task_type: repair.task_type,
      link_appropriate: repair.link_appropriate,
      target_url: repair.target_url,
      link_type: repair.link_type,
      target_slug: repair.target_slug,
      suggested_link_sentence: repair.suggested_link_sentence,
      url_verified: 1,
    };
  });
  if (!changed) return tasks;
  await replaceTasksForDate(env, runDate, repairedTasks);
  await saveTaskRun(env, runDate, repairedTasks.length, summarizeTaskRun(repairedTasks));
  return repairedTasks;
}

function normalizeTaskForRunDate(task, runDate, sequenceNo) {
  return {
    ...task,
    run_date: runDate,
    sequence_no: sequenceNo,
  };
}

function mergePreservedQuoraTasks(runDate, preservedQuora, generatedTasks) {
  const preserved = (preservedQuora || [])
    .filter((task) => task.platform === "Quora" && task.url_verified)
    .slice(0, QUORA_DAILY_TARGET)
    .map((task) => ({ ...task }));
  const preservedUrls = new Set(preserved.map((task) => task.source_url));
  const generatedReddit = (generatedTasks || [])
    .filter((task) => task.platform === "Reddit" && !preservedUrls.has(task.source_url))
    .slice(0, DAILY_TASK_COUNT - preserved.length);
  const generatedQuora = (generatedTasks || [])
    .filter((task) => task.platform === "Quora" && !preservedUrls.has(task.source_url))
    .slice(0, Math.max(0, QUORA_DAILY_TARGET - preserved.length));
  const fallback = (generatedTasks || [])
    .filter((task) => !preservedUrls.has(task.source_url))
    .filter((task) => !generatedReddit.some((item) => item.source_url === task.source_url))
    .filter((task) => !generatedQuora.some((item) => item.source_url === task.source_url))
    .slice(0, Math.max(0, DAILY_TASK_COUNT - preserved.length - generatedReddit.length - generatedQuora.length));

  const combined = [...generatedReddit, ...preserved, ...generatedQuora, ...fallback].slice(0, DAILY_TASK_COUNT);
  return combined.map((task, index) => normalizeTaskForRunDate(task, runDate, index + 1));
}

async function restoreValidQuoraTasks(env, runDate) {
  await seedTeamMembers(env);
  const restorable = RESTORABLE_VALID_QUORA_TASKS[runDate];
  if (!restorable?.length) return null;
  const tasks = await listTasksByDate(env, runDate);
  if (!tasks.length) return null;
  const preservedQuora = restorable;
  const redditTasks = tasks
    .filter((task) => task.platform === "Reddit")
    .slice(0, DAILY_TASK_COUNT - preservedQuora.length)
    .map((task, index) => normalizeTaskForRunDate(task, runDate, index + 1));
  const merged = [...redditTasks, ...preservedQuora.map((task, index) => normalizeTaskForRunDate(task, runDate, redditTasks.length + index + 1))];
  await replaceTasksForDate(env, runDate, merged);
  await saveTaskRun(env, runDate, merged.length, summarizeTaskRun(merged));
  return merged;
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

async function runDailyPipeline(env, runDate, options = {}) {
  await seedTeamMembers(env);
  const existingRun = options.force ? null : await getTaskRun(env, runDate);
  const existingTasksForDate = options.force ? await listTasksByDate(env, runDate) : [];
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
  const sourceAssignments = (await listSourceAssignments(env)).filter((item) => item.run_date !== runDate);
  const historicalSourceUrls = new Set(sourceAssignments.map((item) => String(item.source_url || "")));
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
  for (const allowHistoricalReuse of [false, true]) {
    for (const quoraExpansionLevel of quoraLevels) {
      for (const redditMaxAgeHours of ageWindows) {
        opportunities = await scoutOpportunities(env, {
          redditMaxAgeHours,
          quoraExpansionLevel,
          historicalSourceUrls,
          allowHistoricalReuse,
        });
        drafts = await buildDrafts(env, opportunities);
        analyzed = analyzeDrafts(opportunities, drafts);
        try {
          tasks = orchestrateTasks(env, runDate, teamMembers, analyzed, drafts, { sourceAssignments });
        } catch (error) {
          continue;
        }
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
          metrics.redditCount + metrics.quoraCount >= DAILY_TASK_COUNT
        ) {
          break outer;
        }
      }
    }
  }

  if (bestAttempt.metrics.score > scoreBatchCandidate(tasks).score) {
    opportunities = bestAttempt.opportunities;
    drafts = bestAttempt.drafts;
    analyzed = bestAttempt.analyzed;
    tasks = bestAttempt.tasks;
  }

  if (options.force && existingTasksForDate.length) {
    const preservedQuora = existingTasksForDate.filter((task) => task.platform === "Quora" && task.url_verified);
    if (preservedQuora.length) {
      tasks = mergePreservedQuoraTasks(runDate, preservedQuora, tasks);
    }
  }

  if (tasks.length < DAILY_TASK_COUNT) {
    throw new Error(`Unable to assemble full daily batch for ${runDate}`);
  }

  await saveOpportunities(env, opportunities);
  await saveDrafts(env, drafts);
  await saveOpportunities(env, analyzed);
  await replaceTasksForDate(env, runDate, tasks);
  const summary = summarizeTaskRun(tasks);
  await saveTaskRun(env, runDate, tasks.length, summary);
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
  const force = url.searchParams.get("force") === "1";
  const repair = url.searchParams.get("repair") || "";

  if (routeMatches(path, "/run-daily")) {
    if (repair === "quora-links") {
      const repairedTasks = await repairKnownBrokenQuoraTasks(env, runDate);
      if (!repairedTasks) {
        return jsonResponse(
          { ok: false, error: "No saved tasks for this date", run_date: runDate, tasks: [] },
          404,
          { "x-reader-route": "publisher-run-daily-repair-miss" }
        );
      }
      return jsonResponse(
        {
          ok: true,
          run_date: runDate,
          reused: true,
          repaired: true,
          summary: summarizeTaskRun(repairedTasks),
          tasks: repairedTasks,
        },
        200,
        { "x-reader-route": "publisher-run-daily-repair" }
      );
    }
    if (repair === "restore-valid-quora") {
      const restoredTasks = await restoreValidQuoraTasks(env, runDate);
      if (!restoredTasks) {
        return jsonResponse(
          { ok: false, error: "No restorable Quora tasks for this date", run_date: runDate, tasks: [] },
          404,
          { "x-reader-route": "publisher-run-daily-repair-miss" }
        );
      }
      return jsonResponse(
        {
          ok: true,
          run_date: runDate,
          reused: true,
          repaired: true,
          summary: summarizeTaskRun(restoredTasks),
          tasks: restoredTasks,
        },
        200,
        { "x-reader-route": "publisher-run-daily-repair" }
      );
    }
    let result;
    try {
      result = await runDailyPipeline(env, runDate, { force });
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          run_date: runDate,
          error: error instanceof Error ? error.message : "Daily run failed",
        },
        500,
        { "x-reader-route": "publisher-run-daily-error" }
      );
    }
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
      const dates = mergeDateIndex(await listTaskDates(env));
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
    const fixedTasks = !tasks.length && !taskRun ? getFixedSnapshot(runDate) : [];
    const visibleTasks = tasks.length ? tasks : fixedTasks;
    if (!visibleTasks.length && !taskRun) {
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
        { ok: true, run_date: runDate, tasks: visibleTasks },
        200,
        { "x-reader-route": "publisher-get-tasks" }
      );
    }
    if (url.searchParams.get("format") === "text") {
      return textResponse(taskTextFormat(visibleTasks), 200, {
        "x-reader-route": "publisher-get-tasks",
      });
    }
    return htmlResponse(buildTaskDetailPage(runDate, visibleTasks), 200, {
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
