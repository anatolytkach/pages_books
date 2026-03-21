import { evaluateBatchQuality } from "./analyst.mjs";
import {
  ACCOUNT_MODE_ACTIVE,
  ACCOUNT_MODE_EARLY_ACTIVE,
  DAILY_TASK_COUNT,
  DEFAULT_BOOK_LINKS,
  DEFAULT_CATEGORY_LINKS,
  LINK_TYPE_BOOK,
  LINK_TYPE_CATALOG,
  LINK_TYPE_CATEGORY,
  MAX_LINKED_TASKS_PER_DAY,
  QUORA_DAILY_TARGET,
  REDDIT_DAILY_TARGET,
} from "./constants.mjs";
import { materializeDraft } from "./writer.mjs";
import {
  buildSuggestedLinkSentence,
  nowIso,
  pickLinkMetadata,
  stableId,
} from "./utils.mjs";

function parseJsonEnvArray(value, fallback) {
  try {
    const parsed = JSON.parse(String(value || ""));
    return Array.isArray(parsed) && parsed.length ? parsed : fallback;
  } catch (error) {
    return fallback;
  }
}

function selectCategoryLink(categorySlug, categories, usedCategorySlugs = new Set()) {
  const exact = (categories || []).find((item) => item.slug === categorySlug && !usedCategorySlugs.has(item.slug));
  if (exact) return exact;
  return (categories || []).find((item) => !usedCategorySlugs.has(item.slug)) || categories[0] || null;
}

function selectBookLink(bookHintSlug, categorySlug, books, usedBookSlugs = new Set()) {
  const exact = (books || []).find((item) => item.slug === bookHintSlug && !usedBookSlugs.has(item.slug));
  if (exact) return exact;
  const categoryMatch = (books || []).find(
    (item) => item.categorySlug === categorySlug && !usedBookSlugs.has(item.slug)
  );
  if (categoryMatch) return categoryMatch;
  return (books || []).find((item) => !usedBookSlugs.has(item.slug)) || books[0] || null;
}

function chooseLinkBudget(teamMembers) {
  const totalCapacity = (teamMembers || []).reduce(
    (sum, member) => sum + Number(member.daily_link_limit || 0),
    0
  );
  return Math.max(0, Math.min(MAX_LINKED_TASKS_PER_DAY, totalCapacity, 3));
}

function rankOpportunities(opportunities) {
  return [...(opportunities || [])]
    .filter((item) => item.url_verified)
    .filter((item) => (item.total_score || 0) >= 0.38)
    .filter((item) => (item.template_risk || 0) <= 0.62)
    .sort((left, right) => {
      const scoreGap = (right.total_score || 0) - (left.total_score || 0);
      if (scoreGap !== 0) return scoreGap;
      return (left.draft_similarity_max || 0) - (right.draft_similarity_max || 0);
    });
}

function takeUnique(pool, count, selectedIds) {
  const out = [];
  for (const item of pool) {
    if (selectedIds.has(item.id)) continue;
    out.push(item);
    selectedIds.add(item.id);
    if (out.length >= count) break;
  }
  return out;
}

function takeUniqueWithPredicate(pool, count, selectedIds, predicate = () => true) {
  const out = [];
  for (const item of pool) {
    if (selectedIds.has(item.id)) continue;
    if (!predicate(item, out)) continue;
    out.push(item);
    selectedIds.add(item.id);
    if (out.length >= count) break;
  }
  return out;
}

function reorderNaturally(source) {
  const remaining = [...source];
  const ordered = [];
  while (remaining.length) {
    const previous = ordered[ordered.length - 1];
    remaining.sort((left, right) => {
      const leftPenalty =
        Number(previous && previous.topic_type === left.topic_type) +
        Number(previous && previous.platform === left.platform) +
        Number((left.draft_similarity_max || 0) > 0.5);
      const rightPenalty =
        Number(previous && previous.topic_type === right.topic_type) +
        Number(previous && previous.platform === right.platform) +
        Number((right.draft_similarity_max || 0) > 0.5);
      if (leftPenalty !== rightPenalty) return leftPenalty - rightPenalty;
      return (right.total_score || 0) - (left.total_score || 0);
    });
    ordered.push(remaining.shift());
  }
  return ordered;
}

function groupTasksForOutput(tasks) {
  const source = [...(tasks || [])];
  const redditByPublisher = new Map();
  const redditPublisherOrder = [];
  const nonReddit = [];

  for (const task of source) {
    if (task.platform !== "Reddit") {
      nonReddit.push(task);
      continue;
    }
    const key = String(task.publisher_email || "");
    if (!redditByPublisher.has(key)) {
      redditByPublisher.set(key, []);
      redditPublisherOrder.push(key);
    }
    redditByPublisher.get(key).push(task);
  }

  const groupedReddit = redditPublisherOrder.flatMap((email) => redditByPublisher.get(email) || []);
  return [...groupedReddit, ...nonReddit].map((task, index) => ({
    ...task,
    sequence_no: index + 1,
  }));
}

function assignPublishers(teamMembers, tasks) {
  const counters = new Map((teamMembers || []).map((member) => [member.email, 0]));
  const linkCounters = new Map((teamMembers || []).map((member) => [member.email, 0]));
  const allMembers = [...(teamMembers || [])];
  for (const task of tasks) {
    let eligible = allMembers;
    if (task.target_url && task.platform === "Reddit") {
      eligible = allMembers.filter(
        (member) => Number(linkCounters.get(member.email) || 0) < Number(member.daily_link_limit || 0)
      );
      if (!eligible.length) {
        eligible = allMembers.filter((member) => member.account_mode !== "warmup");
      }
    } else if (task.target_url) {
      eligible = allMembers.filter((member) => member.account_mode !== "warmup");
      if (!eligible.length) eligible = allMembers;
    }
    eligible.sort((left, right) => {
      const leftLoad = (counters.get(left.email) || 0) + (linkCounters.get(left.email) || 0) * 0.25;
      const rightLoad = (counters.get(right.email) || 0) + (linkCounters.get(right.email) || 0) * 0.25;
      if (leftLoad !== rightLoad) return leftLoad - rightLoad;
      return Number(right.daily_link_limit || 0) - Number(left.daily_link_limit || 0);
    });
    const selected = eligible[0] || allMembers[0];
    task.publisher_email = selected?.email || "";
    counters.set(task.publisher_email, (counters.get(task.publisher_email) || 0) + 1);
    if (task.target_url) {
      linkCounters.set(task.publisher_email, (linkCounters.get(task.publisher_email) || 0) + 1);
    }
  }
  return tasks;
}

function resolveQualifiedDisclosureTarget(teamMembers, opportunity, books, categories, usedBookSlugs, usedCategorySlugs) {
  const linkBudget = chooseLinkBudget(teamMembers);
  if (!linkBudget) return { target_url: "", link_type: "", target_slug: "" };
  if (opportunity.task_type !== "qualified_disclosure") return { target_url: "", link_type: "", target_slug: "" };
  if (opportunity.topic_type !== "book") return { target_url: "", link_type: "", target_slug: "" };
  if ((opportunity.total_score || 0) < 0.48 || (opportunity.deletion_risk || 1) > 0.45) {
    return { target_url: "", link_type: "", target_slug: "" };
  }
  const hasEligibleMember = (teamMembers || []).some((member) => {
    if (opportunity.platform === "Reddit") {
      return Number(member.daily_link_limit || 0) > 0;
    }
    return member.account_mode !== "warmup";
  });
  if (!hasEligibleMember) return { target_url: "", link_type: "", target_slug: "" };
  const bookLink = selectBookLink(opportunity.book_hint_slug, opportunity.category_slug, books, usedBookSlugs);
  const categoryLink = selectCategoryLink(opportunity.category_slug, categories, usedCategorySlugs);
  const linkMeta = pickLinkMetadata(opportunity, bookLink, categoryLink);
  if (linkMeta.link_type === LINK_TYPE_BOOK && bookLink) usedBookSlugs.add(bookLink.slug);
  if (linkMeta.link_type === LINK_TYPE_CATEGORY && categoryLink) usedCategorySlugs.add(categoryLink.slug);
  return linkMeta;
}

function enforceTopicMix(selected, ranked, selectedIds) {
  const quality = evaluateBatchQuality(selected);
  if (quality.general_count >= 4 && quality.book_count <= 6) return selected;
  const repaired = [...selected];
  if (quality.general_count < 4) {
    const needed = 4 - quality.general_count;
    const generalPool = ranked.filter((item) => item.topic_type === "general" && item.platform === "Reddit");
    const replacements = takeUniqueWithPredicate(generalPool, needed, selectedIds, () => true);
    for (const candidate of replacements) {
      const replaceIndex = repaired.findIndex((item) => item.topic_type !== "general" && item.platform !== "Medium");
      if (replaceIndex >= 0) repaired[replaceIndex] = candidate;
    }
  }
  return repaired;
}

function enforcePlatformMix(selected, ranked) {
  const repaired = [...selected];
  let quoraCount = repaired.filter((item) => item.platform === "Quora").length;
  if (quoraCount <= 2) return repaired;
  const redditFallback = ranked.filter(
    (item) =>
      item.platform === "Reddit" &&
      !repaired.some((selectedItem) => selectedItem.id === item.id)
  );
  for (let i = repaired.length - 1; i >= 0 && quoraCount > 2; i--) {
    if (repaired[i].platform !== "Quora") continue;
    const replacement = redditFallback.shift();
    if (!replacement) break;
    repaired[i] = replacement;
    quoraCount -= 1;
  }
  return repaired;
}

function enforceTaskTypeMix(selected, ranked) {
  const repaired = [...selected];
  let qualifiedCount = repaired.filter((item) => item.task_type === "qualified_disclosure").length;
  if (qualifiedCount <= 3) return repaired;
  const presenceFallback = ranked.filter(
    (item) =>
      item.task_type !== "qualified_disclosure" &&
      item.platform === "Reddit" &&
      !repaired.some((selectedItem) => selectedItem.id === item.id)
  );
  const anyPresenceFallback = ranked.filter(
    (item) =>
      item.task_type !== "qualified_disclosure" &&
      !repaired.some((selectedItem) => selectedItem.id === item.id) &&
      !presenceFallback.some((presenceItem) => presenceItem.id === item.id)
  );
  for (let i = repaired.length - 1; i >= 0 && qualifiedCount > 3; i--) {
    if (repaired[i].task_type !== "qualified_disclosure") continue;
    const replacement = presenceFallback.shift() || anyPresenceFallback.shift();
    if (!replacement) break;
    repaired[i] = replacement;
    qualifiedCount -= 1;
  }
  return repaired;
}

function buildCandidateBatch(teamMembers, opportunities) {
  const selectedIds = new Set();
  const ranked = rankOpportunities(opportunities).filter((item) => item.platform !== "Medium");
  const quoraPool = ranked.filter((item) => item.platform === "Quora");
  const redditPool = ranked.filter((item) => item.platform === "Reddit");
  const qualifiedPool = ranked.filter((item) => item.task_type === "qualified_disclosure");
  const qualifiedQuoraPool = qualifiedPool.filter((item) => item.platform === "Quora");
  const qualifiedRedditPool = qualifiedPool.filter((item) => item.platform === "Reddit");
  const presenceQuoraPool = quoraPool.filter((item) => item.task_type !== "qualified_disclosure");
  const presenceRedditPool = redditPool.filter((item) => item.task_type !== "qualified_disclosure");
  const generalRedditPresencePool = presenceRedditPool.filter((item) => item.topic_type === "general");
  const bookRedditPresencePool = presenceRedditPool.filter((item) => item.topic_type !== "general");
  const quoraTarget = quoraPool.length >= QUORA_DAILY_TARGET ? QUORA_DAILY_TARGET : quoraPool.length;
  const qualifiedTarget = qualifiedPool.length >= 3
    ? 3
    : qualifiedPool.length >= 2
      ? 2
      : qualifiedPool.length;

  const batch = [];
  batch.push(...takeUnique(qualifiedQuoraPool, Math.min(quoraTarget, qualifiedTarget), selectedIds));
  batch.push(...takeUnique(qualifiedRedditPool, Math.max(0, qualifiedTarget - batch.length), selectedIds));
  batch.push(...takeUnique(presenceQuoraPool, Math.max(0, quoraTarget - batch.filter((item) => item.platform === "Quora").length), selectedIds));

  const redditPresenceSlots = Math.max(0, REDDIT_DAILY_TARGET - batch.filter((item) => item.platform === "Reddit").length);
  const generalPresenceTarget = Math.min(generalRedditPresencePool.length, Math.max(4, Math.floor(redditPresenceSlots * 0.4)));
  batch.push(...takeUnique(generalRedditPresencePool, generalPresenceTarget, selectedIds));
  batch.push(...takeUnique(bookRedditPresencePool, Math.max(0, REDDIT_DAILY_TARGET - batch.filter((item) => item.platform === "Reddit").length), selectedIds));

  if (batch.filter((item) => item.platform === "Reddit").length < REDDIT_DAILY_TARGET) {
    const remainingRedditPresence = presenceRedditPool.filter((item) => !selectedIds.has(item.id));
    batch.push(...takeUnique(remainingRedditPresence, Math.max(0, REDDIT_DAILY_TARGET - batch.filter((item) => item.platform === "Reddit").length), selectedIds));
  }

  if (batch.filter((item) => item.platform === "Quora").length < QUORA_DAILY_TARGET) {
    const quoraFallback = quoraPool
      .filter((item) => item.task_type !== "qualified_disclosure" && !selectedIds.has(item.id))
      .slice(0, Math.max(0, quoraTarget - batch.filter((item) => item.platform === "Quora").length));
    batch.push(...takeUnique(quoraFallback, Math.max(0, QUORA_DAILY_TARGET - batch.filter((item) => item.platform === "Quora").length), selectedIds));
  }

  if (batch.length < DAILY_TASK_COUNT) {
    const redditFallback = redditPool.filter((item) => !selectedIds.has(item.id));
    batch.push(...takeUnique(redditFallback, DAILY_TASK_COUNT - batch.length, selectedIds));
  }

  if (batch.length < DAILY_TASK_COUNT) {
    const quoraQualifiedFallback = quoraPool
      .filter((item) => !selectedIds.has(item.id))
      .slice(0, Math.max(0, quoraTarget - batch.filter((item) => item.platform === "Quora").length));
    batch.push(...takeUnique(quoraQualifiedFallback, DAILY_TASK_COUNT - batch.length, selectedIds));
  }

  return reorderNaturally(
    enforcePlatformMix(
      enforceTaskTypeMix(
        enforcePlatformMix(enforceTopicMix(batch.slice(0, DAILY_TASK_COUNT), ranked, selectedIds), ranked),
        ranked
      ),
      ranked
    )
  );
}

export function orchestrateTasks(env, runDate, teamMembers, opportunities, drafts) {
  const books = parseJsonEnvArray(env.PUBLISHER_BOOK_LINKS_JSON, DEFAULT_BOOK_LINKS);
  const categories = parseJsonEnvArray(env.PUBLISHER_CATEGORY_LINKS_JSON, DEFAULT_CATEGORY_LINKS);
  const draftByOpportunity = new Map((drafts || []).map((draft) => [draft.opportunity_id, draft]));
  const selectedOpportunities = buildCandidateBatch(teamMembers, opportunities || []);
  const usedBookSlugs = new Set();
  const usedCategorySlugs = new Set();

  const tasks = selectedOpportunities.map((opportunity, index) => {
    const draft = draftByOpportunity.get(opportunity.id);
    const linkMeta = resolveQualifiedDisclosureTarget(
      teamMembers,
      opportunity,
      books,
      categories,
      usedBookSlugs,
      usedCategorySlugs
    );
    const finalized = materializeDraft(draft, opportunity, "");
    const linkAppropriate = Boolean((opportunity.task_type || "presence") === "qualified_disclosure" && linkMeta.target_url);
    return {
      id: stableId("task", `${runDate}:${index + 1}:${opportunity.source_url}`),
      run_date: runDate,
      sequence_no: index + 1,
      platform: opportunity.platform,
      action: opportunity.action,
      publisher_email: "",
      source_url: opportunity.source_url,
      url_verified: Boolean(opportunity.url_verified),
      task_type: opportunity.task_type || "presence",
      link_appropriate: linkAppropriate,
      suggested_link_sentence: "",
      title: finalized.title || "",
      text: finalized.text,
      target_url: linkMeta.target_url || "",
      link_type: linkMeta.link_type || "",
      target_slug: linkMeta.target_slug || "",
      opportunity_id: opportunity.id,
      draft_id: finalized.id,
      status: "pending",
      created_at: nowIso(),
      topic_type: opportunity.topic_type || "book",
      publisher_mode_required:
        opportunity.platform === "Reddit" && linkMeta.target_url
          ? ACCOUNT_MODE_EARLY_ACTIVE
          : linkMeta.target_url
            ? ACCOUNT_MODE_ACTIVE
            : "",
    };
  }).map((task) => ({
    ...task,
    suggested_link_sentence: buildSuggestedLinkSentence(task),
  }));

  const quality = evaluateBatchQuality(
    tasks.map((task) => {
      const opportunity = selectedOpportunities.find((item) => item.id === task.opportunity_id) || {};
      return {
        ...task,
        total_score: opportunity.total_score,
        template_risk: opportunity.template_risk,
      };
    })
  );

  if (quality.general_count < 4 || quality.book_count > 6 || quality.duplicate_pairs > 0) {
    const repaired = reorderNaturally(tasks.sort((left, right) => {
      if (left.topic_type !== right.topic_type) {
        return left.topic_type === "general" ? -1 : 1;
      }
      return left.sequence_no - right.sequence_no;
    })).map((task, index) => ({ ...task, sequence_no: index + 1 }));
    return groupTasksForOutput(assignPublishers(teamMembers, repaired));
  }

  return groupTasksForOutput(assignPublishers(teamMembers, tasks));
}

export function summarizeTaskRun(tasks) {
  const summary = {
    total: tasks.length,
    linked: 0,
    qualified: 0,
    presence: 0,
    book: 0,
    category: 0,
    catalog: 0,
    general: 0,
  };
  for (const task of tasks || []) {
    if (task.topic_type === "general") summary.general += 1;
    if (task.task_type === "qualified_disclosure") summary.qualified += 1;
    else summary.presence += 1;
    if (!task.target_url) continue;
    summary.linked += 1;
    if (task.link_type === LINK_TYPE_BOOK) summary.book += 1;
    if (task.link_type === LINK_TYPE_CATEGORY) summary.category += 1;
    if (task.link_type === LINK_TYPE_CATALOG) summary.catalog += 1;
  }
  return summary;
}
