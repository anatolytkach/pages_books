import { MAX_DRAFT_GENERATIONS } from "./constants.mjs";
import { compactWhitespace, trimToLength } from "./utils.mjs";

const RESPONSE_TYPES = [
  "opinion",
  "agreement",
  "observation",
  "personal_experience",
  "recommendation",
];

const FORBIDDEN_OPENINGS = [
  "i had the same issue",
  "i usually keep a few",
  "what helped me was",
  "a practical angle here is",
  "i usually read it here",
];

function stableNumber(value) {
  const source = String(value || "");
  let hash = 0;
  for (let i = 0; i < source.length; i++) {
    hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickResponseType(opportunity, attempt = 0) {
  const seed = stableNumber(`${opportunity.id}:${attempt}:${opportunity.topic_type || ""}`);
  return RESPONSE_TYPES[seed % RESPONSE_TYPES.length];
}

function pickVariant(opportunity, count, attempt = 0) {
  return stableNumber(`${opportunity.id}:${count}:${attempt}`) % count;
}

function extractFocus(opportunity) {
  const title = compactWhitespace(opportunity.title || "");
  const excerpt = compactWhitespace(opportunity.excerpt || "");
  const source = `${title}. ${excerpt}`.toLowerCase();
  if (/\b(scroll|scrolling|screen time|screentime|dopamine|hobby|hobbies|offline)\b/.test(source)) {
    return "protecting attention for offline hobbies";
  }
  if (/\b(focus|attention|routine|habit)\b/.test(source)) return "keeping attention steady";
  if (/\b(format friction|continuity|finish)\b/.test(source)) return "reducing format friction";
  if (/\b(mystery|detective|sherlock)\b/.test(source)) return "starting with a mystery that moves quickly";
  if (/\b(phone|mobile|browser|screen)\b/.test(source)) return "reading on a phone";
  if (/\b(reading slump|returning to reading|read more)\b/.test(source)) return "getting back into a reading rhythm";
  if (/\b(recommend|recommendation|what should i read)\b/.test(source)) return "narrowing the next pick";
  if (/\b(project hail mary|sci[- ]?fi|science fiction)\b/.test(source)) return "science-fiction pacing";
  if (/\b(classic|classics)\b/.test(source)) return "approaching classics without overthinking them";
  if (title) return trimToLength(title.replace(/[?!.]+$/, ""), 70);
  return opportunity.topic_type === "general" ? "the routine itself" : "the reading choice";
}

function extractDetail(opportunity) {
  const excerpt = compactWhitespace(opportunity.excerpt || "")
    .replace(/\btopic lane\b.*$/i, "")
    .replace(/\b\d+\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const title = compactWhitespace(opportunity.title || "");
  const source = `${title} ${excerpt}`.toLowerCase();
  if (/\b(free books|find books that are free|reliable place|where can i read|legal source|public domain)\b/.test(source)) {
    return "having one reliable source is easier than piecing scattered links together";
  }
  if (/\b(well-formatted|formatted collection|kindle store)\b/.test(source)) {
    return "format quality matters almost as much as the book itself";
  }
  if (/\b(scroll|scrolling|screen time|screentime|dopamine)\b/.test(source)) {
    return "attention comes back faster when the phone stops filling every empty minute";
  }
  if (/\b(hobby|hobbies)\b/.test(source)) {
    return "a hobby lasts longer when it is not competing with constant stimulation";
  }
  if (/\b(short|brief|quick)\b/.test(source)) return "starting shorter usually works better than forcing a big commitment";
  if (/\b(dense|intimidating)\b/.test(source)) return "pace matters more than reputation";
  if (/\b(commute|travel)\b/.test(source)) return "small windows of attention change what feels readable";
  if (/\b(phone|mobile)\b/.test(source)) return "shorter sessions help more than waiting for perfect focus";
  if (/\b(recommend|what should i read)\b/.test(source)) return "tone is often a better filter than popularity";
  if (/\b(habit|routine|checklist)\b/.test(source)) return "the habit lasts longer when it stays light";
  if (/\b(sherlock|mystery|detective)\b/.test(source)) return "a clean voice and steady pacing matter more than complexity";
  if (/\b(tone|pacing|fit)\b/.test(source)) return "tone and pacing tell you more than reputation does";
  if (/\b(rhythm|attention|burnout)\b/.test(source)) return "light rituals usually beat grand plans";
  if (/\b(continuity|motivation|format friction)\b/.test(source)) return "continuity matters more than motivation";
  const cleaned = trimToLength(excerpt || title || "the specifics change from person to person", 90);
  return cleaned.replace(/[.;,:-]+$/g, "");
}

function buildOpinion(opportunity, attempt = 0) {
  const focus = extractFocus(opportunity);
  const detail = extractDetail(opportunity);
  const variants = [
    `For me, ${focus} works best when ${detail}.`,
    `${focus[0].toUpperCase()}${focus.slice(1)} feels easier once ${detail}.`,
    `My take is that ${focus} gets much simpler when ${detail}.`,
  ];
  return variants[pickVariant(opportunity, variants.length, attempt)];
}

function buildAgreement(opportunity, attempt = 0) {
  const focus = extractFocus(opportunity);
  const detail = extractDetail(opportunity);
  const variants = [
    `I agree with the people saying ${detail}; that usually decides whether ${focus} lands or not.`,
    `That lines up with my experience: once ${detail}, ${focus} stops feeling like work.`,
    `Same direction here. When ${detail}, ${focus} tends to click much faster.`,
  ];
  return variants[pickVariant(opportunity, variants.length, attempt)];
}

function buildObservation(opportunity, attempt = 0) {
  const focus = extractFocus(opportunity);
  const detail = extractDetail(opportunity);
  const variants = [
    `One thing that stands out in threads like this is how often ${detail} matters more than people expect around ${focus}.`,
    `The pattern I keep noticing is that ${focus} improves once ${detail}.`,
    `What jumps out to me is that ${detail}, and that changes the whole feel of ${focus}.`,
  ];
  return variants[pickVariant(opportunity, variants.length, attempt)];
}

function buildPersonalExperience(opportunity, attempt = 0) {
  const focus = extractFocus(opportunity);
  const detail = extractDetail(opportunity);
  const variants = [
    `I only started enjoying ${focus} after I realized ${detail}.`,
    `The point where this clicked for me was when ${detail}; after that, ${focus} felt much lighter.`,
    `My own experience was pretty simple: once ${detail}, ${focus} became easier to stick with.`,
  ];
  return variants[pickVariant(opportunity, variants.length, attempt)];
}

function buildRecommendation(opportunity, attempt = 0) {
  const focus = extractFocus(opportunity);
  const detail = extractDetail(opportunity);
  const variants = [
    `If I were answering this directly, I would start with ${focus} and keep in mind that ${detail}.`,
    `A practical recommendation is to treat ${focus} as the priority and remember that ${detail}.`,
    `The approach I would suggest is simple: pick for ${focus}, not prestige, because ${detail}.`,
  ];
  return variants[pickVariant(opportunity, variants.length, attempt)];
}

function sanitizeText(text, limit) {
  const normalized = trimToLength(compactWhitespace(text), limit);
  const lower = normalized.toLowerCase();
  if (FORBIDDEN_OPENINGS.some((item) => lower.startsWith(item))) {
    return trimToLength(`Personally, ${normalized[0].toLowerCase()}${normalized.slice(1)}`, limit);
  }
  return normalized;
}

function buildFallbackCopy(opportunity, attempt = 0) {
  const responseType = pickResponseType(opportunity, attempt);
  const limit = opportunity.platform === "Reddit" ? 400 : 1200;
  const builders = {
    opinion: buildOpinion,
    agreement: buildAgreement,
    observation: buildObservation,
    personal_experience: buildPersonalExperience,
    recommendation: buildRecommendation,
  };
  return {
    text: sanitizeText(builders[responseType](opportunity, attempt), limit),
    response_type: responseType,
  };
}

function tokenSet(text) {
  return new Set(
    compactWhitespace(text)
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((token) => token.length >= 4)
  );
}

function similarity(left, right) {
  const leftSet = tokenSet(left);
  const rightSet = tokenSet(right);
  if (!leftSet.size || !rightSet.size) return 0;
  let overlap = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) overlap += 1;
  }
  return overlap / Math.max(leftSet.size, rightSet.size);
}

async function generateViaOpenAI(env, opportunity, usedOpenings = [], attempt = 0) {
  const apiKey = String(env.OPENAI_API_KEY || env.READERPUB_OPENAI_API_KEY || "").trim();
  if (!apiKey) return null;
  const limit = opportunity.platform === "Reddit" ? 400 : 1200;
  const responseType = pickResponseType(opportunity, attempt);
  const prompt = [
    "Write one natural, non-promotional reply for manual human publishing.",
    `Platform: ${opportunity.platform}`,
    `Hard limit: ${limit} characters`,
    `Response mode: ${responseType}`,
    `Topic type: ${opportunity.topic_type || "book"}`,
    "The text must react to the specific thread, not sound reusable.",
    "Do not start with any of these phrases:",
    ...FORBIDDEN_OPENINGS.map((item) => `- ${item}`),
    "Avoid repeating the same opening style used elsewhere in the batch:",
    ...usedOpenings.map((item) => `- ${item}`),
    'Return JSON: {"text":"...","title":"...optional for Medium only","response_type":"..."}',
    `Source title: ${opportunity.title || ""}`,
    `Source excerpt: ${opportunity.excerpt || ""}`,
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.PUBLISHER_OPENAI_MODEL || "gpt-5-mini",
        input: prompt,
        text: {
          format: {
            type: "json_schema",
            name: "publisher_draft",
            schema: {
              type: "object",
              properties: {
                text: { type: "string" },
                title: { type: "string" },
                response_type: { type: "string" },
              },
              required: ["text"],
              additionalProperties: false,
            },
          },
        },
      }),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const text = payload?.output?.[0]?.content?.[0]?.text || payload?.output_text || "";
    const parsed = JSON.parse(String(text || "{}"));
    return {
      text: sanitizeText(parsed.text || "", limit),
      title:
        opportunity.platform === "Medium"
          ? trimToLength(compactWhitespace(parsed.title || opportunity.title || ""), 120)
          : "",
      generation_model: env.PUBLISHER_OPENAI_MODEL || "gpt-5-mini",
      response_type: parsed.response_type || responseType,
    };
  } catch (error) {
    return null;
  }
}

function firstWords(text, count = 4) {
  return compactWhitespace(text)
    .toLowerCase()
    .split(/\s+/)
    .slice(0, count)
    .join(" ");
}

async function buildSingleDraft(env, opportunity, usedOpenings = [], attempt = 0) {
  const generated = await generateViaOpenAI(env, opportunity, usedOpenings, attempt);
  const fallback = buildFallbackCopy(opportunity, attempt);
  const resolved = generated?.text ? generated : fallback;
  return {
    id: `${opportunity.id}_draft`,
    opportunity_id: opportunity.id,
    platform: opportunity.platform,
    action: opportunity.action,
    title:
      opportunity.platform === "Medium"
        ? generated?.title || trimToLength(opportunity.title || "Discussion note", 120)
        : "",
    base_text: resolved.text,
    text: resolved.text,
    target_url: "",
    generation_model: generated?.generation_model || "heuristic",
    response_type: resolved.response_type || fallback.response_type,
    created_at: new Date().toISOString(),
  };
}

async function deduplicateDrafts(env, opportunities, drafts) {
  const draftByOpportunity = new Map(drafts.map((draft) => [draft.opportunity_id, draft]));
  for (const opportunity of opportunities) {
    const current = draftByOpportunity.get(opportunity.id);
    if (!current) continue;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const currentDraft = draftByOpportunity.get(opportunity.id);
      const currentOpening = firstWords(currentDraft.text);
      const allDrafts = [...draftByOpportunity.values()];
      const tooSimilar = allDrafts.some(
        (other) =>
          other.id !== currentDraft.id &&
          (currentOpening === firstWords(other.text) || similarity(currentDraft.text, other.text) >= 0.58)
      );
      if (!tooSimilar) break;
      const replacement = await buildSingleDraft(
        env,
        opportunity,
        allDrafts.map((draft) => firstWords(draft.text)).filter((item) => item !== currentOpening),
        attempt
      );
      draftByOpportunity.set(opportunity.id, replacement);
    }
  }
  return opportunities.map((opportunity) => draftByOpportunity.get(opportunity.id)).filter(Boolean);
}

export async function buildDrafts(env, opportunities) {
  const drafts = [];
  const usedOpenings = [];
  for (const opportunity of (opportunities || []).slice(0, MAX_DRAFT_GENERATIONS)) {
    const draft = await buildSingleDraft(env, opportunity, usedOpenings, 0);
    usedOpenings.push(firstWords(draft.text));
    drafts.push(draft);
  }
  return deduplicateDrafts(env, opportunities.slice(0, MAX_DRAFT_GENERATIONS), drafts);
}

export function materializeDraft(draft, opportunity, targetUrl) {
  const fallback = buildFallbackCopy(opportunity, 0);
  return {
    ...draft,
    target_url: targetUrl || "",
    title:
      draft?.title ||
      (opportunity?.platform === "Medium"
        ? trimToLength(compactWhitespace(opportunity?.title || "Discussion note"), 120)
        : ""),
    base_text: draft?.base_text || draft?.text || fallback.text,
    text: draft?.base_text || draft?.text || fallback.text,
    generation_model: draft?.generation_model || "heuristic-fallback",
    response_type: draft?.response_type || fallback.response_type,
  };
}
