import assert from "node:assert/strict";
import test from "node:test";

import { deriveDailyLinkLimit, deriveRedditAccountMode, TEAM_MEMBER_SEEDS } from "../../publisher_tasks/constants.mjs";
import { runScheduledPublisherTaskGeneration } from "../../publisher_tasks/service.mjs";
import { callWorker, readJson } from "../helpers/worker-test-utils.mjs";

function buildMockCandidates() {
  const out = [];
  const templates = [
    {
      platform: "Reddit",
      url: "https://www.reddit.com/r/books/comments/abc123/what_public_domain_scifi_still_feels_modern",
      title: "What public domain sci-fi still feels modern, and where can I read it online?",
      excerpt: "Need something easy to read on phone and a legitimate source would help.",
      topic_type: "book",
      task_type: "qualified_disclosure",
      intent: "book_recommendation",
      link_type: "category",
      category_slug: "science-fiction-fantasy",
      category_title: "Science-Fiction & Fantasy",
      action: "Comment",
    },
    {
      platform: "Reddit",
      url: "https://www.reddit.com/r/Recommend_A_Book/comments/ghi789/which_classic_mystery_book_should_i_start_with",
      title: "Which classic mystery book should I start with?",
      excerpt: "Sherlock style stories are fine, but I want something easy to get into.",
      topic_type: "book",
      task_type: "presence",
      intent: "specific_book",
      link_type: "book",
      category_slug: "crime-thrillers-mystery",
      category_title: "Crime, Thrillers & Mystery",
      book_hint_slug: "the-adventures-of-sherlock-holmes",
      book_hint_title: "The Adventures of Sherlock Holmes",
      action: "Comment",
    },
    {
      platform: "Reddit",
      url: "https://www.reddit.com/r/productivity/comments/def456/how_do_you_stop_every_hobby_from_becoming_a",
      title: "How do you stop every hobby from becoming a checklist?",
      excerpt: "Trying to keep some room for enjoyment instead of tracking everything.",
      topic_type: "general",
      task_type: "presence",
      intent: "general_reading",
      link_type: "catalog",
      category_slug: "classics-of-literature",
      category_title: "Classics of Literature",
      action: "Comment",
    },
    {
      platform: "Quora",
      url: "https://www.quora.com/What-is-the-best-way-to-read-any-book-on-a-phone",
      title: "What is the best way to read any book on a phone?",
      excerpt: "Looking for practical habits that make phone reading less distracting.",
      topic_type: "general",
      task_type: "presence",
      intent: "general_reading",
      link_type: "catalog",
      category_slug: "classics-of-literature",
      category_title: "Classics of Literature",
      action: "Answer",
    },
    {
      platform: "Quora",
      url: "https://www.quora.com/What-websites-apps-can-I-use-to-read-books-for-free",
      title: "What websites or apps can I use to read books for free?",
      excerpt: "Looking for a reliable source that works well on a phone.",
      topic_type: "book",
      task_type: "qualified_disclosure",
      intent: "general_reading",
      link_type: "catalog",
      category_slug: "classics-of-literature",
      category_title: "Classics of Literature",
      action: "Answer",
    },
  ];
  for (let i = 0; i < 18; i++) {
    const item = templates[i % templates.length];
    out.push({
      id: `opp_${i + 1}`,
      platform: item.platform,
      action: item.action,
      source_url: `${item.url}-${i + 1}`,
      title: item.title,
      excerpt: `${item.excerpt} ${i + 1}`,
      discovered_at: "2026-03-20T12:00:00.000Z",
      published_at: "2026-03-20T10:00:00.000Z",
      query: "mock",
      source_author: "mocker",
      url_verified: true,
      topic_type: item.topic_type,
      task_type: item.task_type,
      intent: item.intent,
      link_type: item.link_type,
      category_slug: item.category_slug,
      category_title: item.category_title,
      book_hint_slug: item.book_hint_slug || "",
      book_hint_title: item.book_hint_title || "",
      scout_score: 0.9 - i * 0.01,
      raw_payload: { mock: true },
    });
  }
  return out;
}

function buildAgeWindowMockCandidates() {
  const now = Date.now();
  return buildMockCandidates().map((item, index) => {
    const ageHours = index < 8 ? 24 : 120;
    const publishedAt = new Date(now - ageHours * 3600000).toISOString();
    return {
      ...item,
      published_at: publishedAt,
      discovered_at: publishedAt,
    };
  });
}

function buildRedditOnlyMockCandidates() {
  return buildMockCandidates().filter((item) => item.platform === "Reddit");
}

function buildSingleQuoraMockCandidates() {
  const items = buildMockCandidates();
  let quoraSeen = 0;
  return items.filter((item) => {
    if (item.platform !== "Quora") return true;
    quoraSeen += 1;
    return quoraSeen === 1;
  });
}

function buildRemovedRedditMockCandidates() {
  const items = buildMockCandidates();
  return items.map((item, index) => {
    if (index !== 0 || item.platform !== "Reddit") return item;
    return {
      ...item,
      source_url: "https://www.reddit.com/r/books/comments/removed123/removed_by_moderator/",
      title: "[ Removed by moderator ]",
      raw_payload: {
        ...(item.raw_payload || {}),
        mock: true,
        removed_by_category: "moderator",
      },
    };
  });
}

function buildPendingReviewRedditMockCandidates() {
  const items = buildMockCandidates();
  return items.map((item, index) => {
    if (index !== 0 || item.platform !== "Reddit") return item;
    return {
      ...item,
      source_url: "https://www.reddit.com/r/books/comments/pending123/post_under_review/",
      title: "Post under review",
      raw_payload: {
        ...(item.raw_payload || {}),
        mock: true,
        pending_moderation_review: true,
        comments: [
          {
            author: "books-ModTeam",
            distinguished: "moderator",
            body: "Hi there. Your post is currently awaiting moderator approval and is under review.",
          },
        ],
      },
    };
  });
}

function normalizedWords(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 3);
}

function sharesLongPhrase(source, text, size = 4) {
  const sourceTokens = normalizedWords(source);
  const textJoined = normalizedWords(text).join(" ");
  for (let i = 0; i + size <= sourceTokens.length; i++) {
    const phrase = sourceTokens.slice(i, i + size).join(" ");
    if (phrase && textJoined.includes(phrase)) return true;
  }
  return false;
}

test("publisher tasks: /run-daily generates 10 balanced tasks in safe mode", async () => {
  const env = {
    PUBLISHER_SCOUT_MOCK_CANDIDATES: JSON.stringify(buildMockCandidates()),
  };

  const response = await callWorker({
    url: "https://reader.pub/run-daily?date=2026-03-20",
    env,
  });
  const payload = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-reader-route"), "publisher-run-daily");
  assert.equal(payload.tasks.length, 10);
  assert.ok(payload.summary.qualified >= 2);
  assert.ok(payload.summary.presence >= 5);
  assert.ok(payload.summary.general >= 4);
  assert.equal(payload.tasks.filter((task) => task.platform === "Medium").length, 0);
  assert.equal(payload.tasks.filter((task) => task.platform === "Quora").length, 2);
  assert.equal(payload.tasks.filter((task) => task.platform === "Reddit").length, 8);
  assert.ok(payload.tasks.every((task) => task.url_verified));
  assert.ok(payload.tasks.every((task) => !/example\.com|placeholder/i.test(task.source_url)));
  assert.ok(
    payload.tasks
      .filter((task) => task.task_type === "qualified_disclosure" && task.target_url)
      .every((task) => task.link_appropriate && /https:\/\/reader\.pub\//.test(task.suggested_link_sentence || ""))
  );
  assert.ok(payload.tasks.every((task) => !/^(i had the same issue|i usually keep a few|what helped me was)/i.test(task.text)));
  assert.ok(new Set(payload.tasks.map((task) => task.text)).size >= 8);
  for (const task of payload.tasks) {
    const source = buildMockCandidates().find((item) => item.source_url === task.source_url);
    if (!source) continue;
    assert.equal(sharesLongPhrase(source.title, task.text), false);
    assert.equal(sharesLongPhrase(source.excerpt, task.text), false);
  }
  const redditTasks = payload.tasks.filter((task) => task.platform === "Reddit");
  const redditPublisherSegments = new Map();
  let previousEmail = null;
  for (const task of redditTasks) {
    if (task.publisher_email !== previousEmail) {
      redditPublisherSegments.set(task.publisher_email, (redditPublisherSegments.get(task.publisher_email) || 0) + 1);
      previousEmail = task.publisher_email;
    }
  }
  assert.ok([...redditPublisherSegments.values()].every((count) => count === 1));
});

test("publisher tasks: /get-tasks returns strict text blocks", async () => {
  const env = {
    PUBLISHER_SCOUT_MOCK_CANDIDATES: JSON.stringify(buildMockCandidates()),
  };

  await callWorker({
    url: "https://reader.pub/run-daily?date=2026-03-20",
    env,
  });

  const response = await callWorker({
    url: "https://reader.pub/get-tasks?date=2026-03-20&format=text",
    env,
  });
  const text = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-reader-route"), "publisher-get-tasks");
  assert.match(text, /^Task 1\nPlatform:/);
  assert.match(text, /Task 10/);
  assert.match(text, /Publisher email:/);
  assert.match(text, /\nText:\n/);
  assert.doesNotMatch(text, /Platform: Medium/);
});

test("publisher tasks: dated task page renders clickable links in html", async () => {
  const env = {
    PUBLISHER_SCOUT_MOCK_CANDIDATES: JSON.stringify(buildMockCandidates()),
  };

  await callWorker({
    url: "https://reader.pub/run-daily?date=2026-03-20",
    env,
  });

  const response = await callWorker({
    url: "https://reader.pub/get-tasks?date=2026-03-20",
    env,
  });
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-reader-route"), "publisher-get-tasks");
  assert.match(html, /Publisher Tasks for 2026-03-20/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /<a href="https:\/\/www\.reddit\.com\//);
});

test("publisher tasks: /get-tasks does not auto-generate missing date", async () => {
  const env = {
    PUBLISHER_SCOUT_MOCK_CANDIDATES: JSON.stringify(buildMockCandidates()),
  };

  const response = await callWorker({
    url: "https://reader.pub/get-tasks?date=2026-03-30",
    env,
  });
  const html = await response.text();

  assert.equal(response.status, 404);
  assert.equal(response.headers.get("x-reader-route"), "publisher-get-tasks-miss");
  assert.match(html, /No saved tasks for 2026-03-30/);
});

test("publisher tasks: /get-tasks without date returns date index", async () => {
  const env = {
    PUBLISHER_SCOUT_MOCK_CANDIDATES: JSON.stringify(buildMockCandidates()),
  };

  await callWorker({
    url: "https://reader.pub/run-daily?date=2026-03-20",
    env,
  });

  await callWorker({
    url: "https://reader.pub/run-daily?date=2026-03-21",
    env,
  });

  const response = await callWorker({
    url: "https://reader.pub/get-tasks",
    env,
  });
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-reader-route"), "publisher-get-task-dates");
  assert.match(html, /Publisher Task Dates/);
  assert.match(html, /href="\/get-tasks\?date=2026-03-21"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /href="\/get-tasks\?date=2026-03-20"/);
});

test("publisher tasks: empty daily run does not save a partial snapshot", async () => {
  const env = {
    PUBLISHER_SCOUT_MOCK_CANDIDATES: JSON.stringify([]),
  };

  const runResponse = await callWorker({
    url: "https://reader.pub/run-daily?date=2026-03-25",
    env,
  });
  assert.equal(runResponse.status, 500);

  const indexResponse = await callWorker({
    url: "https://reader.pub/get-tasks",
    env,
  });
  const html = await indexResponse.text();
  assert.doesNotMatch(html, /href="\/get-tasks\?date=2026-03-25"/);

  const dateResponse = await callWorker({
    url: "https://reader.pub/get-tasks?date=2026-03-25&format=json",
    env,
  });
  assert.equal(dateResponse.status, 404);
});

test("publisher tasks: expands Reddit freshness windows until batch reaches 10 tasks", async () => {
  const env = {
    PUBLISHER_SCOUT_MOCK_CANDIDATES: JSON.stringify(buildAgeWindowMockCandidates()),
    PUBLISHER_REDDIT_AGE_EXPANSION_HOURS_JSON: JSON.stringify([48, 336]),
  };

  const response = await callWorker({
    url: "https://reader.pub/run-daily?date=2026-03-26",
    env,
  });
  const payload = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(payload.reused, false);
  assert.equal(payload.tasks.length, 10);
  assert.equal(payload.tasks.filter((task) => task.platform === "Reddit").length, 8);
  assert.equal(payload.tasks.filter((task) => task.platform === "Quora").length, 2);
});

test("publisher tasks: removed Reddit posts are excluded from task output", async () => {
  const env = {
    PUBLISHER_SCOUT_MOCK_CANDIDATES: JSON.stringify(buildRemovedRedditMockCandidates()),
  };

  const response = await callWorker({
    url: "https://reader.pub/run-daily?date=2026-03-31",
    env,
  });
  const payload = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(payload.tasks.length, 10);
  assert.ok(payload.tasks.every((task) => task.source_url !== "https://www.reddit.com/r/books/comments/removed123/removed_by_moderator/"));
});

test("publisher tasks: Reddit posts awaiting moderator review are excluded from task output", async () => {
  const env = {
    PUBLISHER_SCOUT_MOCK_CANDIDATES: JSON.stringify(buildPendingReviewRedditMockCandidates()),
  };

  const response = await callWorker({
    url: "https://reader.pub/run-daily?date=2026-04-01",
    env,
  });
  const payload = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(payload.tasks.length, 10);
  assert.ok(payload.tasks.every((task) => task.source_url !== "https://www.reddit.com/r/books/comments/pending123/post_under_review/"));
});

test("publisher tasks: missing Quora tasks are replaced by Reddit to keep 10 total", async () => {
  const env = {
    PUBLISHER_SCOUT_MOCK_CANDIDATES: JSON.stringify(buildRedditOnlyMockCandidates()),
    PUBLISHER_REDDIT_AGE_EXPANSION_HOURS_JSON: JSON.stringify([48, 336]),
    PUBLISHER_QUORA_QUERY_EXPANSION_LEVELS_JSON: JSON.stringify([0]),
  };

  const response = await callWorker({
    url: "https://reader.pub/run-daily?date=2026-03-28",
    env,
  });
  const payload = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(payload.tasks.length, 10);
  assert.equal(payload.tasks.filter((task) => task.platform === "Quora").length, 0);
  assert.equal(payload.tasks.filter((task) => task.platform === "Reddit").length, 10);
});

test("publisher tasks: one missing Quora task is replaced by Reddit to keep 10 total", async () => {
  const env = {
    PUBLISHER_SCOUT_MOCK_CANDIDATES: JSON.stringify(buildSingleQuoraMockCandidates()),
    PUBLISHER_REDDIT_AGE_EXPANSION_HOURS_JSON: JSON.stringify([48, 336]),
    PUBLISHER_QUORA_QUERY_EXPANSION_LEVELS_JSON: JSON.stringify([0]),
  };

  const response = await callWorker({
    url: "https://reader.pub/run-daily?date=2026-03-29",
    env,
  });
  const payload = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(payload.tasks.length, 10);
  assert.equal(payload.tasks.filter((task) => task.platform === "Quora").length, 1);
  assert.equal(payload.tasks.filter((task) => task.platform === "Reddit").length, 9);
});

test("publisher tasks: daily run reuses saved snapshot for the same date", async () => {
  const env = {
    PUBLISHER_SCOUT_MOCK_CANDIDATES: JSON.stringify(buildMockCandidates()),
  };

  const firstResponse = await callWorker({
    url: "https://reader.pub/run-daily?date=2026-03-22",
    env,
  });
  const firstPayload = await readJson(firstResponse);

  const secondResponse = await callWorker({
    url: "https://reader.pub/run-daily?date=2026-03-22",
    env,
  });
  const secondPayload = await readJson(secondResponse);

  assert.equal(firstResponse.status, 200);
  assert.equal(secondResponse.status, 200);
  assert.equal(firstPayload.reused, false);
  assert.equal(secondPayload.reused, true);
  assert.deepEqual(
    secondPayload.tasks.map((task) => task.id),
    firstPayload.tasks.map((task) => task.id)
  );
});

test("publisher tasks: force=1 rebuilds an existing snapshot", async () => {
  const env = {
    PUBLISHER_SCOUT_MOCK_CANDIDATES: JSON.stringify(buildMockCandidates()),
  };

  const firstResponse = await callWorker({
    url: "https://reader.pub/run-daily?date=2026-03-23",
    env,
  });
  const firstPayload = await readJson(firstResponse);

  env.PUBLISHER_SCOUT_MOCK_CANDIDATES = JSON.stringify(buildRedditOnlyMockCandidates());

  const forcedResponse = await callWorker({
    url: "https://reader.pub/run-daily?date=2026-03-23&force=1",
    env,
  });
  const forcedPayload = await readJson(forcedResponse);

  assert.equal(firstPayload.reused, false);
  assert.equal(forcedPayload.reused, false);
  assert.equal(forcedPayload.tasks.length, 10);
  assert.equal(forcedPayload.tasks.filter((task) => task.platform === "Quora").length, 2);
  assert.equal(forcedPayload.tasks.filter((task) => task.platform === "Reddit").length, 8);
  const firstQuoraUrls = new Set(firstPayload.tasks.filter((task) => task.platform === "Quora").map((task) => task.source_url));
  const forcedQuoraUrls = new Set(forcedPayload.tasks.filter((task) => task.platform === "Quora").map((task) => task.source_url));
  assert.deepEqual(forcedQuoraUrls, firstQuoraUrls);
});

test("publisher tasks: repeated source URLs are reassigned to different publishers on later days", async () => {
  const env = {
    PUBLISHER_SCOUT_MOCK_CANDIDATES: JSON.stringify(buildMockCandidates()),
  };

  const firstResponse = await callWorker({
    url: "https://reader.pub/run-daily?date=2026-03-26",
    env,
  });
  const firstPayload = await readJson(firstResponse);

  const secondResponse = await callWorker({
    url: "https://reader.pub/run-daily?date=2026-03-27",
    env,
  });
  const secondPayload = await readJson(secondResponse);

  assert.equal(firstResponse.status, 200);
  assert.equal(secondResponse.status, 200);
  assert.equal(secondPayload.tasks.length, 10);

  const firstByUrl = new Map(firstPayload.tasks.map((task) => [task.source_url, task.publisher_email]));
  for (const task of secondPayload.tasks) {
    if (!firstByUrl.has(task.source_url)) continue;
    assert.notEqual(task.publisher_email, firstByUrl.get(task.source_url));
  }
});

test("publisher tasks: repair=quora-links rewrites known broken Quora URLs", async () => {
  const brokenSnapshotCandidates = buildMockCandidates().map((item) => {
    if (item.platform !== "Quora") return item;
    if (item.task_type === "qualified_disclosure") {
      return {
        ...item,
        source_url: "https://www.quora.com/Where-can-I-read-classic-novels-online-legally",
        title: "Where can I read classic novels online legally?",
      };
    }
    return {
      ...item,
      source_url: "https://www.quora.com/How-do-you-focus-better-on-your-phone",
      title: "How do you focus better on your phone when you want to read long-form things?",
    };
  });
  const env = {
    PUBLISHER_SCOUT_MOCK_CANDIDATES: JSON.stringify(brokenSnapshotCandidates),
  };

  await callWorker({
    url: "https://reader.pub/run-daily?date=2026-03-24",
    env,
  });

  const repairResponse = await callWorker({
    url: "https://reader.pub/run-daily?date=2026-03-24&repair=quora-links",
    env,
  });
  const repairPayload = await readJson(repairResponse);

  assert.equal(repairResponse.status, 200);
  assert.equal(repairPayload.repaired, true);
  assert.ok(
    repairPayload.tasks.some(
      (task) => task.source_url === "https://www.quora.com/What-is-the-best-way-to-read-any-book-on-a-phone"
    )
  );
  assert.ok(
    repairPayload.tasks.some(
      (task) => task.source_url === "https://www.quora.com/What-websites-apps-can-I-use-to-read-books-for-free"
    )
  );
});

test("publisher tasks: repair=restore-valid-quora restores saved valid Quora tasks", async () => {
  const env = {
    PUBLISHER_SCOUT_MOCK_CANDIDATES: JSON.stringify(buildRedditOnlyMockCandidates()),
  };

  const initialResponse = await callWorker({
    url: "https://reader.pub/run-daily?date=2026-03-22",
    env,
  });
  const initialPayload = await readJson(initialResponse);
  assert.equal(initialPayload.tasks.filter((task) => task.platform === "Quora").length, 0);

  const repairResponse = await callWorker({
    url: "https://reader.pub/run-daily?date=2026-03-22&repair=restore-valid-quora",
    env,
  });
  const repairPayload = await readJson(repairResponse);

  assert.equal(repairResponse.status, 200);
  assert.equal(repairPayload.tasks.filter((task) => task.platform === "Quora").length, 2);
  assert.ok(
    repairPayload.tasks.some(
      (task) => task.source_url === "https://www.quora.com/Can-you-recommend-must-read-classic-novels-for-literature-enthusiasts"
    )
  );
  assert.ok(
    repairPayload.tasks.some(
      (task) => task.source_url === "https://www.quora.com/In-what-order-of-classic-novels-should-I-read-as-a-beginner"
    )
  );
});

test("publisher tasks: /report-outcome stores accepted payload", async () => {
  const env = {
    PUBLISHER_SCOUT_MOCK_CANDIDATES: JSON.stringify(buildMockCandidates()),
  };

  const runResponse = await callWorker({
    url: "https://reader.pub/run-daily?date=2026-03-20",
    env,
  });
  const runPayload = await readJson(runResponse);
  const firstTask = runPayload.tasks[0];

  const response = await callWorker({
    url: "https://reader.pub/report-outcome",
    method: "POST",
    env,
    body: {
      task_id: firstTask.id,
      publisher_email: firstTask.publisher_email,
      source_url: firstTask.source_url,
      target_url: firstTask.target_url,
      status: "posted",
      event_name: "seo_to_catalog",
      seo_to_catalog: true,
    },
  });
  const payload = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-reader-route"), "publisher-report-outcome");
  assert.equal(payload.ok, true);
  assert.match(payload.outcome_id, /^outcome_/);
});

test("publisher tasks: Reddit link-capable tasks respect graduated ramp", async () => {
  const env = {
    PUBLISHER_ENABLE_AUTO_LINKS: "true",
    PUBLISHER_SCOUT_MOCK_CANDIDATES: JSON.stringify(buildMockCandidates()),
  };

  const response = await callWorker({
    url: "https://reader.pub/run-daily?date=2026-03-21",
    env,
  });
  const payload = await readJson(response);
  const redditLinked = payload.tasks.filter((task) => task.platform === "Reddit" && task.target_url);
  const linkCountByPublisher = new Map();
  for (const task of redditLinked) {
    linkCountByPublisher.set(
      task.publisher_email,
      (linkCountByPublisher.get(task.publisher_email) || 0) + 1
    );
  }

  for (const member of TEAM_MEMBER_SEEDS) {
    const mode = deriveRedditAccountMode(member);
    const limit = deriveDailyLinkLimit(mode);
    const actual = linkCountByPublisher.get(member.email) || 0;
    assert.ok(actual <= limit, `${member.email} exceeded link limit`);
    if (mode === "warmup") {
      assert.equal(actual, 0);
    }
  }
});

test("publisher tasks: scheduled run only executes at 5am New York", async () => {
  const env = {
    PUBLISHER_SCOUT_MOCK_CANDIDATES: JSON.stringify(buildMockCandidates()),
    PUBLISHER_TASK_TZ: "America/New_York",
  };

  const skipped = await runScheduledPublisherTaskGeneration(env, new Date("2026-03-20T08:00:00.000Z"));
  assert.equal(skipped.skipped, true);
  assert.equal(skipped.run_date, "2026-03-20");

  const executed = await runScheduledPublisherTaskGeneration(env, new Date("2026-03-20T09:00:00.000Z"));
  assert.equal(executed.reused, false);
  assert.equal(executed.run_date, "2026-03-20");
  assert.equal(executed.tasks.length, 10);

  const afterWindow = await runScheduledPublisherTaskGeneration(env, new Date("2026-03-20T15:00:00.000Z"));
  assert.equal(afterWindow.reused, true);
  assert.equal(afterWindow.run_date, "2026-03-20");
});
