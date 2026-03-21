import { clamp } from "./utils.mjs";

function normalizedTokens(text) {
  return compactText(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 4);
}

function compactText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function textSimilarity(left, right) {
  const leftTokens = new Set(normalizedTokens(left));
  const rightTokens = new Set(normalizedTokens(right));
  if (!leftTokens.size || !rightTokens.size) return 0;
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function hasQualifiedDisclosureSignal(text) {
  return /\b(where can i read|where could i read|where to read|where do you find|where can i find|read online|available online|public domain|legal(?:ly)? read|source|resource|catalog|place to read|better format|better reading experience|formatted edition)\b/i.test(
    text
  );
}

export function scoreOpportunity(opportunity, draft, neighborDrafts = []) {
  const text = `${opportunity.title || ""} ${opportunity.excerpt || ""}`.toLowerCase();
  let relevance = 0.42;
  if (opportunity.topic_type === "book") {
    if (/\b(book|books|read|reading|author|novel|literature|recommend)\b/.test(text)) relevance += 0.24;
    if (/\b(phone|mobile|ebook|format|kindle|reading slump)\b/.test(text)) relevance += 0.14;
  } else {
    if (/\b(habit|routine|focus|attention|productivity|burnout|screen time|commute)\b/.test(text)) relevance += 0.24;
    if (/\b(discussion|question|advice|anyone else|how do you)\b/.test(text)) relevance += 0.12;
  }

  let deletionRisk = 0.18;
  if (opportunity.platform === "Reddit") deletionRisk += 0.08;
  if (/\bself promo|promote|promotion|my article|my blog|check out\b/.test(text)) deletionRisk += 0.2;
  if (!draft?.text) deletionRisk += 0.12;

  let quality = 0.4;
  if (draft?.text) quality += 0.18;
  if (opportunity.entry_score >= 0.45) quality += 0.12;
  if (draft?.response_type) quality += 0.08;

  let templateRisk = 0.08;
  const draftText = compactText(draft?.text || "");
  if (/^i had the same issue\b|^i usually keep a few\b|^what helped me was\b/i.test(draftText)) {
    templateRisk += 0.5;
  }
  const maxSimilarity = neighborDrafts.reduce(
    (max, other) => Math.max(max, textSimilarity(draftText, compactText(other?.text || ""))),
    0
  );
  if (maxSimilarity >= 0.58) templateRisk += 0.28;
  if (maxSimilarity >= 0.7) templateRisk += 0.18;

  let clickProbability = 0.18;
  if (opportunity.topic_type === "book" && /\b(recommend|worth reading|reading slump|phone)\b/.test(text)) clickProbability += 0.18;
  if (opportunity.topic_type === "general" && /\b(habit|focus|routine|attention)\b/.test(text)) clickProbability += 0.08;
  if (opportunity.task_type === "qualified_disclosure") {
    if (hasQualifiedDisclosureSignal(text)) {
      relevance += 0.08;
      clickProbability += 0.06;
    } else {
      deletionRisk += 0.08;
      quality -= 0.08;
    }
  }

  relevance = clamp(relevance, 0, 1);
  deletionRisk = clamp(deletionRisk + templateRisk * 0.25, 0, 1);
  quality = clamp(quality - templateRisk * 0.15, 0, 1);
  templateRisk = clamp(templateRisk, 0, 1);
  clickProbability = clamp(clickProbability, 0, 1);

  const totalScore = clamp(
    relevance * 0.42 + quality * 0.28 + (1 - deletionRisk) * 0.18 + clickProbability * 0.12,
    0,
    1
  );

  return {
    relevance_score: Number(relevance.toFixed(4)),
    deletion_risk: Number(deletionRisk.toFixed(4)),
    click_probability: Number(clickProbability.toFixed(4)),
    quality_score: Number(quality.toFixed(4)),
    template_risk: Number(templateRisk.toFixed(4)),
    draft_similarity_max: Number(maxSimilarity.toFixed(4)),
    total_score: Number(totalScore.toFixed(4)),
  };
}

export function analyzeDrafts(opportunities, drafts) {
  const draftByOpportunity = new Map((drafts || []).map((draft) => [draft.opportunity_id, draft]));
  return (opportunities || []).map((opportunity) => {
    const draft = draftByOpportunity.get(opportunity.id);
    const neighborDrafts = (drafts || []).filter((item) => item.opportunity_id !== opportunity.id);
    return {
      ...opportunity,
      ...scoreOpportunity(opportunity, draft, neighborDrafts),
    };
  });
}

export function evaluateBatchQuality(items) {
  const source = Array.isArray(items) ? items : [];
  let duplicatePairs = 0;
  let maxSimilarity = 0;
  let generalCount = 0;
  let bookCount = 0;
  let weakCount = 0;
  for (let i = 0; i < source.length; i++) {
    const item = source[i];
    if (item.topic_type === "general") generalCount += 1;
    if (item.topic_type === "book") bookCount += 1;
    if ((item.total_score || 0) < 0.48 || (item.template_risk || 0) > 0.45) weakCount += 1;
    for (let j = i + 1; j < source.length; j++) {
      const similarity = textSimilarity(source[i].text || source[i].excerpt || "", source[j].text || source[j].excerpt || "");
      maxSimilarity = Math.max(maxSimilarity, similarity);
      if (similarity >= 0.58) duplicatePairs += 1;
    }
  }
  return {
    total: source.length,
    general_count: generalCount,
    book_count: bookCount,
    duplicate_pairs: duplicatePairs,
    weak_count: weakCount,
    max_similarity: Number(maxSimilarity.toFixed(4)),
  };
}
