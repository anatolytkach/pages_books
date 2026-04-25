#!/usr/bin/env node
"use strict";

function extractSpine(book) {
  return (book.spineItems || []).map((item, index) => ({
    spineIndex: item.spineIndex != null ? item.spineIndex : index,
    spineId: item.spineId || `spine-${index + 1}`,
    href: item.href,
    absolutePath: item.absolutePath,
    linear: item.linear || "yes",
    properties: item.properties || []
  }));
}

module.exports = { extractSpine };
