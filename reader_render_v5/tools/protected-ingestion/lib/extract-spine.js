#!/usr/bin/env node
"use strict";

function normalizePath(value) {
  return String(value || "").trim().replace(/\\/g, "/").toLowerCase();
}

function isNoteSpineItem(item) {
  const href = normalizePath(item && item.href);
  const properties = Array.isArray(item && item.properties)
    ? item.properties.map((value) => String(value || "").trim().toLowerCase())
    : [];
  if (properties.some((value) => /(?:^|[\s-])(footnote|endnote|notes?)(?:$|[\s-])/.test(value))) {
    return true;
  }
  return /(?:^|\/)notes?-[^/]+\.xhtml?$/.test(href);
}

function extractSpine(book) {
  return (book.spineItems || [])
    .filter((item) => !isNoteSpineItem(item))
    .map((item, index) => ({
      spineIndex: index,
      spineId: item.spineId || `spine-${index + 1}`,
      href: item.href,
      absolutePath: item.absolutePath,
      linear: item.linear || "yes",
      properties: item.properties || []
    }));
}

module.exports = { extractSpine };
