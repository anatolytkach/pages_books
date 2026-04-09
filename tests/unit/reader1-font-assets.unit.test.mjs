import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

function fileExists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

test("Unit: reader1 ships font assets required by bookmark glyph CSS", () => {
  const required = [
    "reader1/font/fontello.eot",
    "reader1/font/fontello.woff",
    "reader1/font/fontello.ttf",
    "reader1/font/fontello.svg",
  ];

  for (const relPath of required) {
    assert.equal(fileExists(relPath), true, `${relPath} should exist`);
  }
});

test("Unit: reader1 derives its catalog menu link from the active origin", () => {
  const reader1Html = fs.readFileSync(path.join(ROOT, "reader1/index.html"), "utf8");
  const reader1Js = fs.readFileSync(path.join(ROOT, "reader1/js/reader.js"), "utf8");

  assert.match(reader1Html, /id="menuCatalogLink"/);
  assert.match(reader1Js, /function resolveReaderPubBooksHref\(/);
  assert.match(reader1Js, /new URL\("\/books\/", window\.location\.origin\)/);
  assert.match(reader1Js, /syncCatalogMenuHref\(\);/);
});
