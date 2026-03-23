export const MAX_DAILY_CANDIDATES = 100;
export const TARGET_FILTERED_CANDIDATES_MIN = 30;
export const TARGET_FILTERED_CANDIDATES_MAX = 50;
export const MAX_DRAFT_GENERATIONS = 30;
export const DAILY_TASK_COUNT = 10;
export const REDDIT_DAILY_TARGET = 8;
export const QUORA_DAILY_TARGET = 2;
export const MAX_LINKED_TASKS_PER_DAY = 4;
export const REDDIT_AGE_EXPANSION_HOURS = [48, 168, 336, 720];
export const QUORA_QUERY_EXPANSION_LEVELS = [0, 1, 2];
export const ACCOUNT_MODE_WARMUP = "warmup";
export const ACCOUNT_MODE_EARLY_ACTIVE = "early_active";
export const ACCOUNT_MODE_ACTIVE = "active";

export const LINK_TYPE_BOOK = "book";
export const LINK_TYPE_CATEGORY = "category";
export const LINK_TYPE_CATALOG = "catalog";

export const PLATFORM_ACTIONS = {
  Reddit: "Comment",
  Quora: "Answer",
  Medium: "Article",
};

export function deriveRedditAccountMode(member) {
  const karma = Number(member?.karma || 0);
  const accountAgeDays = Number(member?.account_age_days || 0);
  if (karma < 75 || accountAgeDays < 7) return ACCOUNT_MODE_WARMUP;
  if (karma < 150 || accountAgeDays < 30) return ACCOUNT_MODE_EARLY_ACTIVE;
  return ACCOUNT_MODE_ACTIVE;
}

export function deriveDailyLinkLimit(accountMode) {
  if (accountMode === ACCOUNT_MODE_ACTIVE) return 2;
  if (accountMode === ACCOUNT_MODE_EARLY_ACTIVE) return 1;
  return 0;
}

export const TEAM_MEMBER_SEEDS = [
  {
    email: "itechfusion@gmail.com",
    karma: 182,
    account_age_days: 240,
  },
  {
    email: "tummycatapp@gmail.com",
    karma: 121,
    account_age_days: 41,
  },
  {
    email: "urphin.juice@gmail.com",
    karma: 88,
    account_age_days: 19,
  },
  {
    email: "phorever.cloud@gmail.com",
    karma: 79,
    account_age_days: 10,
  },
  {
    email: "brokersdigest@gmail.com",
    karma: 32,
    account_age_days: 3,
  },
].map((member) => ({
  ...member,
  account_mode: deriveRedditAccountMode(member),
  daily_link_limit: deriveDailyLinkLimit(deriveRedditAccountMode(member)),
}));

export const CATEGORY_KEYWORDS = [
  {
    slug: "science-fiction-fantasy",
    title: "Science-Fiction & Fantasy",
    keywords: ["sci-fi", "science fiction", "fantasy", "dystopia", "space opera", "dragon"],
  },
  {
    slug: "crime-thrillers-mystery",
    title: "Crime, Thrillers & Mystery",
    keywords: ["mystery", "thriller", "detective", "crime", "noir", "whodunit"],
  },
  {
    slug: "adventure",
    title: "Adventure",
    keywords: ["adventure", "pirate", "voyage", "expedition", "survival"],
  },
  {
    slug: "romance",
    title: "Romance",
    keywords: ["romance", "love story", "relationship", "heartbreak"],
  },
  {
    slug: "classics-of-literature",
    title: "Classics of Literature",
    keywords: ["classic", "classics", "literary fiction", "canon"],
  },
  {
    slug: "history-modern-1750",
    title: "Modern History",
    keywords: ["history", "historical", "war", "revolution", "empire"],
  },
  {
    slug: "children-young-adult-reading",
    title: "Children & Young Adult Reading",
    keywords: ["ya", "young adult", "middle grade", "kids", "children"],
  },
];

export const BOOK_HINTS = [
  {
    needle: "dracula",
    slug: "dracula",
    title: "Dracula",
    categorySlug: "crime-thrillers-mystery",
  },
  {
    needle: "frankenstein",
    slug: "frankenstein-or-the-modern-prometheus",
    title: "Frankenstein",
    categorySlug: "science-fiction-fantasy",
  },
  {
    needle: "pride and prejudice",
    slug: "pride-and-prejudice",
    title: "Pride and Prejudice",
    categorySlug: "romance",
  },
  {
    needle: "moby dick",
    slug: "moby-dick-or-the-whale",
    title: "Moby-Dick",
    categorySlug: "adventure",
  },
  {
    needle: "alice in wonderland",
    slug: "alice-s-adventures-in-wonderland",
    title: "Alice's Adventures in Wonderland",
    categorySlug: "children-young-adult-reading",
  },
  {
    needle: "sherlock holmes",
    slug: "the-adventures-of-sherlock-holmes",
    title: "The Adventures of Sherlock Holmes",
    categorySlug: "crime-thrillers-mystery",
  },
];

export const DEFAULT_CATEGORY_LINKS = [
  {
    slug: "classics-of-literature",
    title: "Classics of Literature",
  },
  {
    slug: "adventure",
    title: "Adventure",
  },
  {
    slug: "science-fiction-fantasy",
    title: "Science-Fiction & Fantasy",
  },
  {
    slug: "crime-thrillers-mystery",
    title: "Crime, Thrillers & Mystery",
  },
];

export const DEFAULT_BOOK_LINKS = [
  {
    slug: "dracula",
    title: "Dracula",
    categorySlug: "crime-thrillers-mystery",
  },
  {
    slug: "the-adventures-of-sherlock-holmes",
    title: "The Adventures of Sherlock Holmes",
    categorySlug: "crime-thrillers-mystery",
  },
  {
    slug: "frankenstein-or-the-modern-prometheus",
    title: "Frankenstein",
    categorySlug: "science-fiction-fantasy",
  },
  {
    slug: "pride-and-prejudice",
    title: "Pride and Prejudice",
    categorySlug: "romance",
  },
  {
    slug: "moby-dick-or-the-whale",
    title: "Moby-Dick",
    categorySlug: "adventure",
  },
];

export const DEFAULT_SCOUT_CONFIG = {
  redditMaxAgeHours: 48,
  quoraExpansionLevel: 0,
  redditSubreddits: [
    "books",
    "suggestmeabook",
    "booksuggestions",
    "whatsthatbook",
    "Fantasy",
    "printSF",
  ],
  quoraQueries: [
    "site:quora.com what classic book should I read",
    "site:quora.com public domain books worth reading",
    "site:quora.com best mystery novel for beginners",
    "site:quora.com what sci fi book should I read first",
  ],
};
