import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = "/Volumes/2T/se_ingest/pages_books";

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

test("Unit: catalog prunes empty prefixes before rendering prefixes view", () => {
  const html = read("books/index.html");
  assert.match(html, /async function pruneEmptyPrefixes\(letter,\s*prefixes,\s*nonce\)/);
  assert.match(html, /const node = await getPrefixNode\(letter,\s*item\.prefix,\s*nonce\);/);
  assert.match(html, /const prefixes = await pruneEmptyPrefixes\(state\.letter,\s*prefixesRaw,\s*nonce\);/);
});
