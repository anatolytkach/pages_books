#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function normalizeWhitespace(text) {
  return String(text || "").replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, num) => String.fromCodePoint(parseInt(num, 10)));
}

function stripTags(html) {
  return decodeEntities(String(html || "").replace(/<[^>]+>/g, " "));
}

function extractBody(html) {
  const match = String(html || "").match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1] : String(html || "");
}

function parseAttrs(attrText) {
  const attrs = {};
  String(attrText || "").replace(/([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*["']([^"']*)["']/g, (_, key, value) => {
    attrs[key] = value;
    return "";
  });
  return attrs;
}

function extractInlineRuns(innerHtml) {
  const runs = [];
  const linkTargets = [];
  const inlineIds = [];
  const stack = [{ bold: false, italic: false, superscript: false, href: "", nodeId: "" }];

  function currentState() {
    return stack[stack.length - 1];
  }

  function pushState(attrs, tagName) {
    const prev = currentState();
    const next = {
      bold: prev.bold || tagName === "strong" || tagName === "b",
      italic: prev.italic || tagName === "em" || tagName === "i",
      superscript: prev.superscript || tagName === "sup",
      href: tagName === "a" && attrs.href ? attrs.href : prev.href,
      nodeId: attrs.id || prev.nodeId || ""
    };
    if (attrs.id) inlineIds.push(attrs.id);
    if (tagName === "a" && attrs.href) {
      linkTargets.push({
        href: attrs.href,
        fragment: attrs.href.includes("#") ? attrs.href.split("#")[1] : "",
        textHint: ""
      });
    }
    stack.push(next);
  }

  const regex = /(<[^>]+>|[^<]+)/g;
  let match;
  while ((match = regex.exec(String(innerHtml || "")))) {
    const token = match[0];
    if (token.startsWith("<")) {
      if (/^<\//.test(token)) {
        if (stack.length > 1) stack.pop();
        continue;
      }
      const open = token.match(/^<([A-Za-z0-9:_-]+)([^>]*)>/);
      if (!open) continue;
      const tagName = String(open[1] || "").toLowerCase();
      const attrs = parseAttrs(open[2] || "");
      if (tagName === "br") {
        const state = currentState();
        runs.push({
          text: "\n",
          styleState: { bold: state.bold, italic: state.italic, superscript: state.superscript },
          linkTarget: state.href || "",
          sourceNodeId: state.nodeId || ""
        });
        continue;
      }
      pushState(attrs, tagName);
      continue;
    }
    const text = normalizeWhitespace(decodeEntities(token));
    if (!text) continue;
    const state = currentState();
    runs.push({
      text,
      styleState: { bold: state.bold, italic: state.italic, superscript: state.superscript },
      linkTarget: state.href || "",
      sourceNodeId: state.nodeId || ""
    });
    if (state.href && linkTargets.length) {
      linkTargets[linkTargets.length - 1].textHint += (linkTargets[linkTargets.length - 1].textHint ? " " : "") + text;
    }
  }

  return { runs, linkTargets, inlineIds };
}

function blockTypeForTag(tag, attrs = {}) {
  const className = String(attrs.class || "").toLowerCase();
  if (/^h([1-6])$/i.test(tag)) return `heading-${tag.slice(1)}`;
  if (tag === "li") return "list-item";
  if (tag === "blockquote") return "blockquote";
  if (tag === "pre") return "pre";
  if (/(^|\s)(poem|verse|stanza)(\s|$)/.test(className)) return "verse";
  return "paragraph";
}

function looksLikeNoteHref(href) {
  return /#(fn|note|footnote|endnote|noteref|ftn)/i.test(String(href || ""));
}

function extractBlocksFromHtml(html, spineItem) {
  const body = extractBody(html);
  const matches = Array.from(body.matchAll(/<(h[1-6]|p|li|blockquote|pre|div)\b([^>]*)>([\s\S]*?)<\/\1>/gi));
  const blocks = [];
  const candidates = matches.length ? matches : [[null, "div", "", body]];
  for (let index = 0; index < candidates.length; index += 1) {
    const match = candidates[index];
    const tag = String(match[1] || "div").toLowerCase();
    const attrs = parseAttrs(match[2] || "");
    const innerHtml = match[3] || "";
    const plainText = normalizeWhitespace(stripTags(innerHtml));
    if (!plainText) continue;
    const inline = extractInlineRuns(innerHtml);
    blocks.push({
      blockId: `${spineItem.spineId}-b-${String(index + 1).padStart(4, "0")}`,
      blockType: blockTypeForTag(tag, attrs),
      tagName: tag,
      text: plainText,
      sourceRef: {
        spineId: spineItem.spineId,
        spineIndex: spineItem.spineIndex,
        href: spineItem.href,
        filePath: spineItem.absolutePath,
        nodeTag: tag,
        nodeIndex: index,
        nodeId: attrs.id || "",
        nodeClass: attrs.class || ""
      },
      linkTargets: inline.linkTargets.map((item) => ({
        ...item,
        kind: looksLikeNoteHref(item.href) ? "note" : "link"
      })),
      inlineIds: inline.inlineIds,
      runs: inline.runs,
      styleSignals: {
        hasBold: inline.runs.some((run) => run.styleState.bold),
        hasItalic: inline.runs.some((run) => run.styleState.italic),
        hasSuperscript: inline.runs.some((run) => run.styleState.superscript),
        hasLinks: inline.linkTargets.length > 0
      }
    });
  }
  return blocks;
}

function extractTextBlocks({ book, spine }) {
  const blocks = [];
  for (const spineItem of spine) {
    const html = readText(spineItem.absolutePath);
    blocks.push(...extractBlocksFromHtml(html, spineItem));
  }

  const toc = (book.toc || []).map((item, index) => {
    const href = String(item.href || "").trim();
    const [spineHref, fragment] = href.split("#");
    return {
      id: item.id || `toc-${index + 1}`,
      label: String(item.label || "").trim(),
      href,
      spineHref: spineHref || "",
      fragment: fragment || ""
    };
  });

  return { blocks, toc };
}

module.exports = { extractTextBlocks };
