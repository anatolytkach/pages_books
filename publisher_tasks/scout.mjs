import {
  DEFAULT_SCOUT_CONFIG,
  MAX_DAILY_CANDIDATES,
  PLATFORM_ACTIONS,
  QUORA_FALLBACK_CANDIDATES,
  QUORA_DAILY_TARGET,
  TARGET_FILTERED_CANDIDATES_MAX,
  TARGET_FILTERED_CANDIDATES_MIN,
} from "./constants.mjs";
import {
  compactWhitespace,
  determineIntent,
  detectCategory,
  nowIso,
  safeJsonParse,
  stableId,
  summarizeExcerpt,
} from "./utils.mjs";

const BOOK_DISCUSSION_KEYWORDS = [
  "book",
  "books",
  "read",
  "reading",
  "novel",
  "novels",
  "fiction",
  "nonfiction",
  "author",
  "authors",
  "chapter",
  "kindle",
  "ebook",
  "public domain",
  "literature",
];

const GENERAL_DISCUSSION_KEYWORDS = [
  "habit",
  "routine",
  "focus",
  "attention",
  "productivity",
  "screen time",
  "phone",
  "mobile",
  "commute",
  "note-taking",
  "workflow",
  "burnout",
  "hobby",
  "discussion",
  "community",
];

const ENTRY_CUES = [
  "what",
  "which",
  "why",
  "how",
  "does anyone",
  "anyone else",
  "looking for",
  "thoughts on",
  "do you",
  "help me",
  "recommend",
  "advice",
];

const QUALIFIED_DISCLOSURE_PATTERNS = [
  /\bwhere can i read\b/i,
  /\bwhere could i read\b/i,
  /\bwhere do you read\b/i,
  /\bwhere to read\b/i,
  /\bwhere do you find\b/i,
  /\bwhere can i find\b/i,
  /\bread online\b/i,
  /\bfree online\b/i,
  /\blegal(?:ly)? read\b/i,
  /\bpublic domain\b/i,
  /\bsource for\b/i,
  /\bcatalog\b/i,
  /\blooking for (?:a )?(?:source|resource|site|place)\b/i,
  /\bis there (?:a )?(?:source|resource|site|place)\b/i,
  /\bavailable online\b/i,
  /\bfind (?:a )?copy\b/i,
  /\bbetter format\b/i,
  /\bbetter reading experience\b/i,
  /\bformatted edition\b/i,
];

function hasQualifiedDisclosureSignal(text) {
  const source = compactWhitespace(text);
  return QUALIFIED_DISCLOSURE_PATTERNS.some((pattern) => pattern.test(source));
}

function fetchTextOrNull(response) {
  if (!response || !response.ok) return null;
  return response.text();
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function keywordScore(text, keywords) {
  const source = compactWhitespace(text).toLowerCase();
  return keywords.reduce((sum, keyword) => sum + (source.includes(keyword) ? 1 : 0), 0);
}

function classifyTopicType(text) {
  const source = compactWhitespace(text);
  const bookScore = keywordScore(source, BOOK_DISCUSSION_KEYWORDS);
  const generalScore = keywordScore(source, GENERAL_DISCUSSION_KEYWORDS);
  if (bookScore >= generalScore && bookScore > 0) return "book";
  return "general";
}

function classifyTaskType(text, topicType) {
  const source = compactWhitespace(text);
  if (topicType !== "book" && !/\b(read|reading|format|phone|mobile|public domain)\b/i.test(source)) {
    return "presence";
  }
  if (hasQualifiedDisclosureSignal(source)) {
    return "qualified_disclosure";
  }
  return "presence";
}

function computeNaturalEntryScore(text, meta = {}) {
  const source = compactWhitespace(text).toLowerCase();
  let score = 0;
  if (source.length >= 40) score += 0.2;
  if (ENTRY_CUES.some((cue) => source.includes(cue))) score += 0.3;
  if (source.includes("?")) score += 0.2;
  if (/\b(i think|for me|in my experience|personally|i noticed)\b/.test(source)) score += 0.15;
  const comments = Number(meta.comments || 0);
  const votes = Number(meta.score || 0);
  if (comments >= 5) score += 0.15;
  if (votes >= 3) score += 0.1;
  return score;
}

function computeRedditAgeBoost(ageHours, maxAgeHours) {
  if (!Number.isFinite(ageHours) || ageHours < 0) return 0;
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) return 0;
  const freshness = Math.max(0, 1 - ageHours / maxAgeHours);
  return Number((freshness * 0.18).toFixed(4));
}

function candidateAgeHours(candidate, now = Date.now()) {
  const published = Date.parse(candidate?.published_at || candidate?.discovered_at || "");
  if (!Number.isFinite(published)) return null;
  return (now - published) / 3600000;
}

function withinRedditAgeWindow(candidate, maxAgeHours, now = Date.now()) {
  if (candidate?.platform !== "Reddit") return true;
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) return true;
  const ageHours = candidateAgeHours(candidate, now);
  if (!Number.isFinite(ageHours)) return true;
  return ageHours <= maxAgeHours;
}

function computeRelevanceSignal(text, topicType) {
  const source = compactWhitespace(text).toLowerCase();
  if (topicType === "book") {
    let score = keywordScore(source, BOOK_DISCUSSION_KEYWORDS) * 0.12;
    if (/\b(what should i read|recommend|worth reading|favorite author|reading slump|reading on phone)\b/.test(source)) {
      score += 0.25;
    }
    return score;
  }
  let score = keywordScore(source, GENERAL_DISCUSSION_KEYWORDS) * 0.12;
  if (/\b(habit|routine|focus|burnout|commute|screen time|productivity|note-taking)\b/.test(source)) {
    score += 0.25;
  }
  return score;
}

function isStrongCandidate(candidate) {
  const merged = compactWhitespace(`${candidate.title || ""} ${candidate.excerpt || ""}`);
  const topicType = candidate.topic_type || classifyTopicType(merged);
  const relevance = computeRelevanceSignal(merged, topicType);
  const entry = computeNaturalEntryScore(merged, candidate.raw_payload || {});
  if (topicType === "book") {
    return relevance + entry >= 0.45;
  }
  return relevance + entry >= 0.4;
}

function buildCandidate(platform, sourceUrl, title, body, publishedAt, meta = {}) {
  const mergedText = compactWhitespace(`${title || ""} ${body || ""}`);
  const inferred = determineIntent(mergedText);
  const category = detectCategory(mergedText);
  const topicType = meta.topic_type || classifyTopicType(mergedText);
  const taskType = meta.task_type || classifyTaskType(mergedText, topicType);
  return {
    id: stableId("opp", sourceUrl),
    platform,
    action: PLATFORM_ACTIONS[platform] || "Comment",
    source_url: sourceUrl,
    title: compactWhitespace(title),
    excerpt: summarizeExcerpt(body || title),
    discovered_at: nowIso(),
    published_at: publishedAt || nowIso(),
    query: meta.query || "",
    source_author: meta.sourceAuthor || "",
    intent: inferred.intent,
    link_type: inferred.targetType,
    category_slug: inferred.categoryHint || category.slug,
    category_title: category.title,
    book_hint_slug: inferred.bookHint ? inferred.bookHint.slug : "",
    book_hint_title: inferred.bookHint ? inferred.bookHint.title : "",
    topic_type: topicType,
    task_type: taskType,
    link_appropriate: taskType === "qualified_disclosure",
    url_verified: Boolean(meta.url_verified),
    entry_score: Number(computeNaturalEntryScore(mergedText, meta.rawPayload || {}).toFixed(4)),
    scout_score: meta.scoutScore || 0,
    raw_payload: meta.rawPayload || null,
  };
}

async function readKvCache(env, url) {
  try {
    if (env.PUBLISHER_TASK_CACHE && typeof env.PUBLISHER_TASK_CACHE.get === "function") {
      const cached = await env.PUBLISHER_TASK_CACHE.get(url, "json");
      if (cached && cached.processed) return cached;
    }
  } catch (error) {}
  if (!env.__publisherCache) env.__publisherCache = new Map();
  return env.__publisherCache.get(url) || null;
}

export async function markUrlProcessed(env, url, timestamp = nowIso()) {
  const value = { processed: true, timestamp };
  try {
    if (env.PUBLISHER_TASK_CACHE && typeof env.PUBLISHER_TASK_CACHE.put === "function") {
      await env.PUBLISHER_TASK_CACHE.put(url, JSON.stringify(value));
      return;
    }
  } catch (error) {}
  if (!env.__publisherCache) env.__publisherCache = new Map();
  env.__publisherCache.set(url, value);
}

function mergedScoutConfig(config) {
  const quoraExpansionLevel = Math.max(0, Number(config.quoraExpansionLevel || 0));
  const quoraExpansionQueries = [
    "site:quora.com where can I read classic novels online legally",
    "site:quora.com where can I find free books to read online",
    "site:quora.com best site to read public domain books on phone",
    "site:quora.com where do you read books on your phone",
    "site:quora.com where can I find a good catalog of free books",
    "site:quora.com better reading experience than Project Gutenberg",
  ];
  const quoraDeeperQueries = [
    "site:quora.com where can I read Sherlock Holmes online",
    "site:quora.com where can I read Dracula online legally",
    "site:quora.com where can I find public domain mystery books",
    "site:quora.com where to read classic science fiction online",
    "site:quora.com where can I read books online with better formatting",
  ];
  return {
    ...config,
    redditSubreddits: [
      ...(config.redditSubreddits || []),
      "productivity",
      "simpleliving",
      "nosurf",
      "getdisciplined",
      "CasualConversation",
    ],
    quoraQueries: [
      ...(config.quoraQueries || []),
      "site:quora.com how do you keep a reading habit",
      "site:quora.com how do you focus better on your phone",
      "site:quora.com what habits helped you read more",
      "site:quora.com how do you avoid doomscrolling",
      ...(quoraExpansionLevel >= 1 ? quoraExpansionQueries : []),
      ...(quoraExpansionLevel >= 2 ? quoraDeeperQueries : []),
    ],
  };
}

function isPlaceholderUrl(value) {
  const source = String(value || "").trim().toLowerCase();
  return !source || /example\.com|placeholder|synthetic|mock|localhost/.test(source);
}

function matchesExpectedPlatform(url, platform) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname;
    if (platform === "Reddit") {
      return /(^|\.)reddit\.com$/.test(host) && /^\/r\/[^/]+\/comments\/[^/]+/i.test(path);
    }
    if (platform === "Quora") {
      return /(^|\.)quora\.com$/.test(host);
    }
    if (platform === "Medium") {
      return /(^|\.)medium\.com$/.test(host);
    }
  } catch (error) {}
  return false;
}

async function checkUrlStatus(url, method = "HEAD") {
  const response = await fetch(url, {
    method,
    redirect: "manual",
    headers: {
      accept: "text/html,application/json,application/rss+xml,text/xml",
      "user-agent": "readerpub-task-scout/1.0",
    },
  });
  return response?.status || 0;
}

async function verifyCandidateUrl(candidate) {
  if (!candidate?.source_url || isPlaceholderUrl(candidate.source_url)) return false;
  if (!matchesExpectedPlatform(candidate.source_url, candidate.platform)) return false;
  try {
    const headStatus = await checkUrlStatus(candidate.source_url, "HEAD");
    if ([200, 301, 302].includes(headStatus)) return true;
    if (headStatus === 403 && candidate.platform === "Reddit") return true;
    if (headStatus === 403 && candidate.platform === "Quora") return true;
    if (headStatus === 405 || headStatus >= 500 || headStatus === 0) {
      const getStatus = await checkUrlStatus(candidate.source_url, "GET");
      if ([200, 301, 302].includes(getStatus)) return true;
      if (getStatus === 403 && candidate.platform === "Reddit") return true;
      if (getStatus === 403 && candidate.platform === "Quora") return true;
    }
  } catch (error) {}
  return false;
}

async function fetchRedditCandidates(env, config) {
  const out = [];
  const now = Date.now();
  const maxAgeHours = Math.max(48, Number(config.redditMaxAgeHours || DEFAULT_SCOUT_CONFIG.redditMaxAgeHours || 336));
  for (const subreddit of config.redditSubreddits || []) {
    const endpoint = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/new.json?limit=20`;
    try {
      const response = await fetch(endpoint, {
        headers: {
          accept: "application/json",
          "user-agent": "readerpub-task-scout/1.0",
        },
      });
      const payload = await response.json();
      const items = Array.isArray(payload?.data?.children) ? payload.data.children : [];
      for (const item of items) {
        const data = item?.data || {};
        const created = Number(data.created_utc || 0) * 1000;
        const ageHours = created ? (now - created) / 3600000 : 999;
        if (ageHours > maxAgeHours) continue;
        const candidate = buildCandidate(
          "Reddit",
          `https://www.reddit.com${data.permalink || ""}`,
          data.title || "",
          data.selftext || "",
          created ? new Date(created).toISOString() : nowIso(),
          {
            query: subreddit,
            sourceAuthor: data.author || "",
            scoutScore: Number((0.58 + computeRedditAgeBoost(ageHours, maxAgeHours)).toFixed(4)),
            rawPayload: {
              subreddit,
              score: data.score || 0,
              comments: data.num_comments || 0,
              age_hours: Number(ageHours.toFixed(2)),
            },
          }
        );
        if (!isStrongCandidate(candidate)) continue;
        candidate.url_verified = true;
        out.push(candidate);
      }
    } catch (error) {}
    if (out.length >= 40) break;
  }
  return out;
}

function extractQuoraUrlsFromHtml(html) {
  const out = [];
  const regex = /https?:\/\/(?:www\.)?quora\.com\/[^"'&<>\s]+/gi;
  const seen = new Set();
  for (const match of String(html || "").matchAll(regex)) {
    const url = decodeURIComponent(String(match[0]).replace(/&amp;/g, "&"));
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= 20) break;
  }
  return out;
}

async function fetchQuoraCandidates(env, config) {
  const out = [];
  const endpoints = [
    (query) => `https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`,
    (query) => `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
  ];
  for (const query of config.quoraQueries || []) {
    for (const buildEndpoint of endpoints) {
      try {
        const response = await fetch(buildEndpoint(query), {
          headers: {
            accept: "text/html,application/rss+xml,text/xml",
            "user-agent": "readerpub-task-scout/1.0",
          },
        });
        const body = await fetchTextOrNull(response);
        if (!body) continue;
        const rssItems = body.includes("<rss") ? parseRssItems(body) : [];
        const rssUrls = rssItems
          .filter((item) => matchesExpectedPlatform(item.link, "Quora"))
          .map((item) => ({
            url: item.link,
            title: item.title || query,
            excerpt: item.description || `Question discovered for query: ${query}`,
            publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : nowIso(),
          }));
        const htmlUrls = rssItems.length
          ? []
          : extractQuoraUrlsFromHtml(body).map((url) => ({
              url,
              title: query,
              excerpt: `Question discovered for query: ${query}`,
              publishedAt: nowIso(),
            }));
        const discovered = rssUrls.length ? rssUrls : htmlUrls;
        for (const item of discovered) {
          const candidate = buildCandidate("Quora", item.url, item.title, item.excerpt, item.publishedAt, {
            query,
            scoutScore: 0.64,
            rawPayload: { query },
          });
          if (!isStrongCandidate(candidate)) continue;
          out.push(candidate);
        }
        if (out.length >= 30) break;
      } catch (error) {}
    }
    if (out.length >= 30) break;
  }
  return out;
}

function buildQuoraFallbackCandidates() {
  return QUORA_FALLBACK_CANDIDATES.map((item, index) =>
    normalizeMockCandidate({
      id: `opp_quora_fallback_${index + 1}`,
      platform: "Quora",
      action: "Answer",
      source_url: item.source_url,
      title: item.title,
      excerpt: item.excerpt,
      discovered_at: nowIso(),
      published_at: nowIso(),
      query: "quora-fallback",
      source_author: "",
      url_verified: true,
      topic_type: item.topic_type,
      task_type: item.task_type,
      intent: item.intent,
      link_type: item.link_type,
      category_slug: item.category_slug,
      category_title: item.category_title,
      raw_payload: { fallback: true },
      scout_score: 0.66,
    })
  ).filter(Boolean);
}

function parseRssItems(xml) {
  const items = [];
  const matches = String(xml || "").match(/<item>[\s\S]*?<\/item>/gi) || [];
  for (const rawItem of matches) {
    const title = decodeHtmlEntities(
      (rawItem.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i) || [])[1] ||
      (rawItem.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] ||
      ""
    );
    const link = decodeHtmlEntities((rawItem.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || "");
    const description = decodeHtmlEntities(
      (rawItem.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i) || [])[1] || ""
    );
    const pubDate = compactWhitespace((rawItem.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1] || "");
    if (!link) continue;
    items.push({ title, link, description, pubDate });
  }
  return items;
}

function normalizeMockCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  if (candidate.topic_type && candidate.entry_score != null) {
    return {
      ...candidate,
      task_type: candidate.task_type || classifyTaskType(`${candidate.title || ""} ${candidate.excerpt || ""}`, candidate.topic_type),
      link_appropriate:
        candidate.link_appropriate ?? ((candidate.task_type || classifyTaskType(`${candidate.title || ""} ${candidate.excerpt || ""}`, candidate.topic_type)) === "qualified_disclosure"),
      url_verified: Boolean(candidate.url_verified),
    };
  }
  const normalized = buildCandidate(
    candidate.platform || "Reddit",
    candidate.source_url,
    candidate.title || "",
    candidate.excerpt || candidate.body || "",
    candidate.published_at || nowIso(),
    {
      query: candidate.query || "mock",
      sourceAuthor: candidate.source_author || "",
      scoutScore: candidate.scout_score || 0.75,
      topic_type: candidate.topic_type,
      task_type: candidate.task_type,
      url_verified: candidate.url_verified,
      rawPayload: candidate.raw_payload || { mock: true, comments: 10, score: 5 },
    }
  );
  return normalized;
}

export async function scoutOpportunities(env, options = {}) {
  const rawConfig = safeJsonParse(String(env.PUBLISHER_SCOUT_CONFIG_JSON || ""), null);
  const config = mergedScoutConfig({
    ...(rawConfig ? { ...DEFAULT_SCOUT_CONFIG, ...rawConfig } : DEFAULT_SCOUT_CONFIG),
    ...(options || {}),
  });
  const mocked = safeJsonParse(String(env.PUBLISHER_SCOUT_MOCK_CANDIDATES || ""), null);
  const enableQuoraFallback = String(env.PUBLISHER_ENABLE_QUORA_FALLBACK || "true").toLowerCase() !== "false";
  const now = Date.now();
  let rawCandidates = Array.isArray(mocked) && mocked.length
    ? mocked
        .map(normalizeMockCandidate)
        .filter(Boolean)
        .filter((candidate) => withinRedditAgeWindow(candidate, Number(config.redditMaxAgeHours || 0), now))
    : [
        ...(await fetchRedditCandidates(env, config)),
        ...(await fetchQuoraCandidates(env, config)),
      ];

  const currentQuoraCount = rawCandidates.filter((candidate) => candidate?.platform === "Quora").length;
  if (enableQuoraFallback && currentQuoraCount < QUORA_DAILY_TARGET) {
    rawCandidates = rawCandidates.concat(buildQuoraFallbackCandidates());
  }

  const deduped = [];
  const seen = new Set();
  for (const candidate of rawCandidates) {
    if (!candidate || !candidate.source_url) continue;
    if (seen.has(candidate.source_url)) continue;
    seen.add(candidate.source_url);
    deduped.push(candidate);
    if (deduped.length >= MAX_DAILY_CANDIDATES) break;
  }

  const filtered = [];
  let generalCount = 0;
  let bookCount = 0;
  for (const candidate of deduped) {
    if (!isStrongCandidate(candidate)) continue;
    if (!candidate.url_verified) {
      candidate.url_verified = await verifyCandidateUrl(candidate);
    }
    if (!candidate.url_verified) continue;
    const cached = await readKvCache(env, candidate.source_url);
    if (cached?.processed && !candidate?.raw_payload?.fallback) continue;
    if (candidate.topic_type === "general" && generalCount >= Math.ceil(TARGET_FILTERED_CANDIDATES_MAX * 0.5)) continue;
    if (candidate.topic_type === "book" && bookCount >= Math.ceil(TARGET_FILTERED_CANDIDATES_MAX * 0.65)) continue;
    filtered.push(candidate);
    if (candidate.topic_type === "general") generalCount += 1;
    if (candidate.topic_type === "book") bookCount += 1;
    if (filtered.length >= TARGET_FILTERED_CANDIDATES_MAX) break;
  }

  return filtered.slice(0, TARGET_FILTERED_CANDIDATES_MAX);
}
