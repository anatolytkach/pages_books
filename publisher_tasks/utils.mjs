import {
  BOOK_HINTS,
  CATEGORY_KEYWORDS,
  LINK_TYPE_BOOK,
  LINK_TYPE_CATALOG,
  LINK_TYPE_CATEGORY,
} from "./constants.mjs";

export function nowIso() {
  return new Date().toISOString();
}

export function getDateInTimeZone(timeZone = "America/New_York", date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function stableId(prefix, value) {
  const source = String(value || "");
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const encoded = (hash >>> 0).toString(36);
  return `${prefix}_${encoded}`;
}

export function clamp(num, min, max) {
  return Math.max(min, Math.min(max, Number(num)));
}

export function compactWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function trimToLength(value, maxLength) {
  const source = compactWhitespace(value);
  if (source.length <= maxLength) return source;
  const cut = source.slice(0, maxLength - 3).replace(/\s+\S*$/, "");
  return `${cut || source.slice(0, maxLength - 3)}...`;
}

export function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

export function buildBookUrl(slug) {
  return `https://reader.pub/book/${slug}`;
}

export function buildCategoryUrl(slug) {
  return `https://reader.pub/books/#view=category&category=${encodeURIComponent(slug)}`;
}

export function buildCatalogUrl() {
  return "https://reader.pub/books/";
}

export function determineIntent(text) {
  const source = compactWhitespace(text).toLowerCase();
  const bookHint = BOOK_HINTS.find((item) => source.includes(item.needle));
  if (bookHint) {
    return {
      intent: "specific_book",
      targetType: LINK_TYPE_BOOK,
      bookHint,
      categoryHint: bookHint.categorySlug,
    };
  }
  if (
    /\b(what should i read|what to read|book recommendations|recommend me|any good books|looking for books|what are some books)\b/i.test(
      source
    )
  ) {
    const category = detectCategory(source);
    return {
      intent: "book_recommendation",
      targetType: LINK_TYPE_CATEGORY,
      bookHint: null,
      categoryHint: category.slug,
    };
  }
  return {
    intent: "general_reading",
    targetType: LINK_TYPE_CATALOG,
    bookHint: null,
    categoryHint: detectCategory(source).slug,
  };
}

export function detectCategory(text) {
  const source = compactWhitespace(text).toLowerCase();
  let best = CATEGORY_KEYWORDS[0];
  let bestScore = -1;
  for (const category of CATEGORY_KEYWORDS) {
    const score = category.keywords.reduce(
      (sum, keyword) => sum + (source.includes(keyword) ? 1 : 0),
      0
    );
    if (score > bestScore) {
      best = category;
      bestScore = score;
    }
  }
  return best;
}

export function summarizeExcerpt(text, maxLength = 240) {
  return trimToLength(String(text || "").replace(/\n+/g, " "), maxLength);
}

export function taskTextFormat(tasks) {
  return (tasks || [])
    .map((task, index) => {
      const lines = [
        `Task ${index + 1}`,
        `Platform: ${task.platform}`,
        `Action: ${task.action}`,
        `Publisher email: ${task.publisher_email}`,
      ];
      if (task.platform !== "Medium") {
        lines.push(`URL: ${task.source_url}`);
      }
      if (task.title) {
        lines.push(`Title: ${task.title}`);
      }
      lines.push("Text:");
      lines.push(task.text || "");
      return lines.join("\n");
    })
    .join("\n\n");
}

export function inferLinkTypeFromIntent(intent) {
  if (intent === "specific_book") return LINK_TYPE_BOOK;
  if (intent === "book_recommendation") return LINK_TYPE_CATEGORY;
  return LINK_TYPE_CATALOG;
}

export function pickLinkMetadata(opportunity, bookLink, categoryLink) {
  if (opportunity.link_type === LINK_TYPE_BOOK && bookLink) {
    return {
      link_type: LINK_TYPE_BOOK,
      target_url: buildBookUrl(bookLink.slug),
      target_slug: bookLink.slug,
      target_title: bookLink.title,
    };
  }
  if (opportunity.link_type === LINK_TYPE_CATEGORY && categoryLink) {
    return {
      link_type: LINK_TYPE_CATEGORY,
      target_url: buildCategoryUrl(categoryLink.slug),
      target_slug: categoryLink.slug,
      target_title: categoryLink.title,
    };
  }
  return {
    link_type: LINK_TYPE_CATALOG,
    target_url: buildCatalogUrl(),
    target_slug: "catalog",
    target_title: "Catalog",
  };
}

export function buildWhyThisLink(task) {
  if (!task?.target_url) return "";
  if (task.platform === "Quora") {
    if (task.link_type === LINK_TYPE_BOOK) {
      return "This points to a concrete edition that matches a question about a specific book.";
    }
    if (task.link_type === LINK_TYPE_CATEGORY) {
      return "This narrows the answer to a relevant category instead of sending the reader to a generic starting point.";
    }
    return "This gives a broad starting point when the question is about reading options in general rather than one title.";
  }
  if (task.link_type === LINK_TYPE_BOOK) {
    return "This points to a direct edition instead of a broad catalog.";
  }
  if (task.link_type === LINK_TYPE_CATEGORY) {
    return "This narrows the answer to a useful category page.";
  }
  return "This gives a broad catalog entry point.";
}

export function buildSuggestedLinkSentence(task) {
  const targetUrl = String(task?.target_url || "").trim();
  if (!targetUrl || !task?.link_appropriate) return "";
  if (task.link_type === LINK_TYPE_BOOK) {
    return `I usually point people here when they want a direct edition instead of hunting around: ${targetUrl}`;
  }
  if (task.link_type === LINK_TYPE_CATEGORY) {
    return `If someone wants a narrower set of options, this category page is a practical place to start: ${targetUrl}`;
  }
  return `I usually browse here when I want one consistent place to look through free books: ${targetUrl}`;
}
