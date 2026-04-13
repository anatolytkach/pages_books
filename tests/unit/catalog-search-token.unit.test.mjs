import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { REPO_ROOT as ROOT } from "./helpers/repo-root.mjs";

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

test("Unit: catalog search requires three characters on the frontend", () => {
  const html = read("books/index.html");
  assert.match(html, /if \(base\.length < 3\) return "";/);
  assert.match(html, /return base\.slice\(0, 3\);/);
  assert.match(html, /Enter at least three characters in the Search field/);
});

test("Unit: search indexes and selective publish use three-character search tokens", () => {
  const buildScript = read("tools/catalog/build_lang_indexes.py");
  const publishScript = read("books/content/epub_publish.sh");
  assert.match(buildScript, /return base\[:3\] if len\(base\) >= 3 else ""/);
  assert.match(publishScript, /return base\[:3\] if len\(base\) >= 3 else ""/);
});

test("Unit: books and authors are indexed by significant words with author stop-word filtering", () => {
  const buildScript = read("tools/catalog/build_lang_indexes.py");
  const publishScript = read("books/content/epub_publish.sh");
  assert.match(buildScript, /BOOK_SEARCH_STOP_WORDS = \{/);
  assert.match(buildScript, /BOOK_SEARCH_SERVICE_WORDS = \{/);
  assert.match(buildScript, /def build_author_search_tokens\(value: str\) -> list\[str\]:/);
  assert.match(buildScript, /def build_book_search_tokens\(value: str\) -> list\[str\]:/);
  assert.match(buildScript, /if word in BOOK_SEARCH_STOP_WORDS:\s+continue/);
  assert.match(buildScript, /for token in build_author_search_tokens\(author_search_name\):/);
  assert.match(buildScript, /for token in build_book_search_tokens\(book.get\("title"\) or ""\):/);
  assert.match(publishScript, /def build_author_search_tokens\(value: str\):/);
  assert.match(publishScript, /def build_book_search_tokens\(value: str\):/);
  assert.match(publishScript, /if word in BOOK_SEARCH_STOP_WORDS:\s+continue/);
  assert.match(publishScript, /for token in build_author_search_tokens\(name\):/);
  assert.match(publishScript, /for token in build_book_search_tokens\(book.get\("title"\) or ""\):/);
});

test("Unit: language catalog keeps browse indexes but does not generate language search indexes", () => {
  const buildScript = read("tools/catalog/build_lang_indexes.py");
  const publishScript = read("books/content/epub_publish.sh");
  assert.match(buildScript, /if lang == "all":/);
  assert.match(buildScript, /if lang == "all":\s+for token, items in search_map\.items\(\):\s+write_json\(os\.path\.join\(lang_root, "search", f"\{token\}\.json"\), \{"items": items\}\)/s);
  assert.doesNotMatch(publishScript, /\$INDEX_DIR\/lang\/\$lang\/search\/\$token\.json/);
});

test("Unit: catalog search paginates results and author books use Show more", () => {
  const html = read("books/index.html");
  assert.match(html, /const SEARCH_PAGE_SIZE = 24;/);
  assert.match(html, /const AUTHOR_BOOKS_PAGE_SIZE = 24;/);
  assert.match(html, /Page \$\{page\} of \$\{totalPages\}/);
  assert.match(html, /function buildSearchPager\(page, totalPages\)/);
  assert.match(html, /els\.searchResults\.appendChild\(buildSearchPager\(page, totalPages\)\);/);
  assert.match(html, /goToSearchPage\(Math\.max\(1, page - 1\)\);/);
  assert.match(html, /goToSearchPage\(Math\.min\(totalPages, page \+ 1\)\);/);
  assert.match(html, /els\.searchResults\.scrollIntoView\(\{ behavior: "smooth", block: "start" \}\);/);
  assert.match(html, /Show more \(\$\{books\.length - visibleLimit\} remaining\)/);
  assert.match(html, /authorBooksState\.visibleLimit = visibleLimit \+ AUTHOR_BOOKS_PAGE_SIZE;/);
});

test("Unit: author search matches both surname and given names on the frontend", () => {
  const html = read("books/index.html");
  assert.match(html, /if \(item\.type === "author"\) \{\s+const parsed = normalizeAuthorName\(item\.name\);\s+fields = \[parsed\.last, parsed\.rest, parsed\.display, item\.name\];\s+\}/s);
  assert.doesNotMatch(html, /compactNeedle/);
  assert.match(html, /const queryTerms = needle\s+\.split\(\/\[\^\\p\{L\}\\p\{N\}\]\+\/gu\)/s);
  assert.match(html, /return queryTerms\.every\(\(term\) => \{/);
  assert.match(html, /return hayTokens\.some\(\(token\) => token\.startsWith\(term\)\);/);
});

test("Unit: search results are sorted alphabetically within authors and titles", () => {
  const html = read("books/index.html");
  assert.match(html, /\.sort\(\(a, b\) => \{\s+if \(a\.kind !== b\.kind\) return a\.kind === "author" \? -1 : 1;/s);
  assert.match(html, /return String\(a\.title \|\| ""\)\.localeCompare\(String\(b\.title \|\| ""\), undefined, \{\s+numeric: true,\s+sensitivity: "base",\s+\}\);/s);
});
