import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = "/Volumes/2T/se_ingest/pages_books";

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
  assert.match(html, /searchState\.page = Math\.max\(1, page - 1\);/);
  assert.match(html, /searchState\.page = Math\.min\(totalPages, page \+ 1\);/);
  assert.match(html, /Show more \(\$\{books\.length - visibleLimit\} remaining\)/);
  assert.match(html, /authorBooksState\.visibleLimit = visibleLimit \+ AUTHOR_BOOKS_PAGE_SIZE;/);
});
