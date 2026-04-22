#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { buildStyleContext } = require("./extract-source-typography");

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

function parseInlineStyle(styleText) {
  const style = {};
  String(styleText || "").split(";").forEach((part) => {
    const [rawKey, rawValue] = String(part || "").split(":");
    const key = String(rawKey || "").trim().toLowerCase();
    const value = String(rawValue || "").trim();
    if (!key || !value) return;
    style[key] = value;
  });
  return style;
}

function parseCssLengthEm(value, fallback = 0) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return fallback;
  const pxMatch = raw.match(/^(-?\d+(?:\.\d+)?)px$/);
  if (pxMatch) return Number(pxMatch[1]) / 16;
  const emMatch = raw.match(/^(-?\d+(?:\.\d+)?)(em|rem)$/);
  if (emMatch) return Number(emMatch[1]);
  const percentMatch = raw.match(/^(-?\d+(?:\.\d+)?)%$/);
  if (percentMatch) return Number(percentMatch[1]) / 100;
  const unitlessMatch = raw.match(/^(-?\d+(?:\.\d+)?)$/);
  if (unitlessMatch) return Number(unitlessMatch[1]);
  return fallback;
}

function classList(attrs = {}) {
  return String(attrs.class || "")
    .split(/\s+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function resolveContentHref(baseHref, target) {
  const rawBase = String(baseHref || "").trim();
  const rawTarget = String(target || "").trim();
  if (!rawTarget) return "";
  if (/^(?:https?:)?\/\//i.test(rawTarget)) return rawTarget;
  const baseDir = path.posix.dirname(rawBase || "");
  return path.posix.normalize(path.posix.join(baseDir === "." ? "" : baseDir, rawTarget));
}

function mergePresentation(base, override = {}) {
  return {
    ...base,
    ...Object.fromEntries(Object.entries(override).filter(([, value]) => value != null && value !== ""))
  };
}

function pickSourcePresentation(styleEntry) {
  if (!styleEntry || typeof styleEntry !== "object") return null;
  const presentation = {};
  const numericFields = [
    "textIndentEm",
    "marginTopEm",
    "marginBottomEm",
    "lineHeightFactor",
    "fontSizeScale",
    "letterSpacingEm",
    "wordSpacingEm"
  ];
  for (const field of numericFields) {
    if (Number.isFinite(styleEntry[field])) {
      presentation[field] = styleEntry[field];
    }
  }
  const stringFields = ["textAlign", "fontStyle", "fontWeight", "fontFamily", "textColor"];
  for (const field of stringFields) {
    if (styleEntry[field]) {
      presentation[field] = styleEntry[field];
    }
  }
  return Object.keys(presentation).length ? presentation : null;
}

function blockPresentationFor(tag, attrs = {}, styleContext = null) {
  const classes = classList(attrs);
  const inlineStyle = parseInlineStyle(attrs.style || "");
  const headingMatch = String(tag || "").match(/^h([1-6])$/i);
  let presentation = {
    textAlign: "justify",
    textIndentEm: 1,
    marginTopEm: 0,
    marginBottomEm: 0,
    lineHeightFactor: 1.5,
    fontSizeScale: 1,
    letterSpacingEm: 0,
    wordSpacingEm: 0,
    pageBreakBefore: false,
    fontFamily: "",
    fontStyle: "normal",
    fontWeight: "regular",
    textColor: ""
  };

  if (headingMatch) {
    const level = Number(headingMatch[1]);
    presentation = mergePresentation(
      presentation,
      pickSourcePresentation(styleContext && styleContext.headings && styleContext.headings[level])
    );
  }

  if (!headingMatch) {
    if (tag === "blockquote") {
      presentation = mergePresentation(presentation, pickSourcePresentation(styleContext && styleContext.blockquote));
    } else if (tag === "li") {
      presentation = mergePresentation(presentation, pickSourcePresentation(styleContext && styleContext.listItem));
    } else if (tag === "p" || tag === "div" || tag === "td") {
      presentation = mergePresentation(presentation, pickSourcePresentation(styleContext && styleContext.paragraph));
    }
  }

  if (classes.includes("pfirst") || classes.includes("noindent")) {
    presentation.textIndentEm = 0;
  }
  if (classes.includes("center")) {
    presentation.textAlign = "center";
    presentation.textIndentEm = 0;
    presentation.marginTopEm = 1;
    presentation.marginBottomEm = 1;
  }
  if (classes.includes("right")) {
    presentation.textAlign = "right";
    presentation.textIndentEm = 0;
    presentation.marginTopEm = 1;
    presentation.marginBottomEm = 1;
  }
  if (classes.includes("letter")) {
    presentation.textIndentEm = 0;
    presentation.marginTopEm = 1;
    presentation.marginBottomEm = 1;
  }
  if (classes.includes("poem") || classes.includes("verse") || classes.includes("stanza")) {
    presentation.textAlign = "left";
    presentation.textIndentEm = 0;
    presentation.marginTopEm = 1;
    presentation.marginBottomEm = 1;
    presentation.fontSizeScale = 0.9;
  }
  if (
    classes.includes("figure-block") ||
    classes.includes("image-block") ||
    classes.includes("cover") ||
    String(attrs.id || "").trim().toLowerCase() === "cover-image"
  ) {
    presentation.textAlign = "center";
    presentation.textIndentEm = 0;
    presentation.marginTopEm = 1;
    presentation.marginBottomEm = 1;
  }
  if (classes.includes("figure-lead")) {
    presentation = mergePresentation(presentation, pickSourcePresentation(styleContext && styleContext.figureLead));
  }

  if (inlineStyle["text-align"]) presentation.textAlign = String(inlineStyle["text-align"]).toLowerCase();
  if (inlineStyle["text-indent"]) presentation.textIndentEm = parseCssLengthEm(inlineStyle["text-indent"], presentation.textIndentEm);
  if (inlineStyle["margin-top"]) presentation.marginTopEm = parseCssLengthEm(inlineStyle["margin-top"], presentation.marginTopEm);
  if (inlineStyle["margin-bottom"]) presentation.marginBottomEm = parseCssLengthEm(inlineStyle["margin-bottom"], presentation.marginBottomEm);
  if (inlineStyle["line-height"]) presentation.lineHeightFactor = parseCssLengthEm(inlineStyle["line-height"], presentation.lineHeightFactor);
  if (inlineStyle["font-size"]) presentation.fontSizeScale = parseCssLengthEm(inlineStyle["font-size"], presentation.fontSizeScale);
  if (inlineStyle["letter-spacing"]) presentation.letterSpacingEm = parseCssLengthEm(inlineStyle["letter-spacing"], presentation.letterSpacingEm);
  if (inlineStyle["word-spacing"]) presentation.wordSpacingEm = parseCssLengthEm(inlineStyle["word-spacing"], presentation.wordSpacingEm);
  if (inlineStyle["font-family"]) presentation.fontFamily = String(inlineStyle["font-family"]).trim();
  if (inlineStyle["font-style"]) presentation.fontStyle = String(inlineStyle["font-style"]).trim().toLowerCase();
  if (inlineStyle["font-weight"]) {
    const rawWeight = String(inlineStyle["font-weight"]).trim().toLowerCase();
    presentation.fontWeight = rawWeight === "bold" ? "bold" : (/^\d+$/.test(rawWeight) ? (Number(rawWeight) >= 600 ? "bold" : "regular") : rawWeight);
  }
  if (inlineStyle.color) presentation.textColor = String(inlineStyle.color).trim();

  return presentation;
}

function extractMediaItems(innerHtml, spineItem, attrs = {}) {
  const items = [];
  const tokenRegex = /<(img|image)\b([^>]*)\/?>/gi;
  let match;
  while ((match = tokenRegex.exec(String(innerHtml || "")))) {
    const tagName = String(match[1] || "").toLowerCase();
    const tokenAttrs = parseAttrs(match[2] || "");
    const classes = classList(tokenAttrs);
    const inlineStyle = parseInlineStyle(tokenAttrs.style || "");
    const sourceHref = tokenAttrs.src || tokenAttrs["xlink:href"] || "";
    if (!sourceHref) continue;
    const widthPx = tokenAttrs.width
      ? Math.round(parseCssLengthEm(tokenAttrs.width, 0) * 16)
      : Math.round(parseCssLengthEm(inlineStyle.width || "", 0) * 16);
    const heightPx = tokenAttrs.height
      ? Math.round(parseCssLengthEm(tokenAttrs.height, 0) * 16)
      : Math.round(parseCssLengthEm(inlineStyle.height || "", 0) * 16);
    const isInlineAvatar = classes.includes("inline-avatar");
    const containerClasses = classList(attrs);
    items.push({
      mediaId: `${spineItem.spineId}-media-${String(items.length + 1).padStart(4, "0")}`,
      kind: "image",
      tagName,
      sourceHref,
      resolvedHref: resolveContentHref(spineItem.href, sourceHref),
      nodeId: tokenAttrs.id || "",
      className: tokenAttrs.class || "",
      widthPx: widthPx > 0 ? widthPx : 0,
      heightPx: heightPx > 0 ? heightPx : 0,
      inlineAvatar: isInlineAvatar,
      placement:
        isInlineAvatar
          ? "inline-avatar"
          : (containerClasses.includes("figure-block") || containerClasses.includes("image-block") || String(attrs.id || "").trim().toLowerCase() === "cover-image")
            ? "block"
            : "inline"
    });
  }
  return items;
}

function extractInlineRuns(innerHtml) {
  const runs = [];
  const linkTargets = [];
  const inlineIds = [];
  const stack = [{
    bold: false,
    italic: false,
    superscript: false,
    href: "",
    nodeId: "",
    className: "",
    color: "",
    fontScale: null,
    lineHeightFactor: null,
    letterSpacingEm: null,
    trailingSpacingEm: null,
    fontFamily: "",
    dropCap: false
  }];

  function currentState() {
    return stack[stack.length - 1];
  }

  function pushState(attrs, tagName) {
    const prev = currentState();
    const classes = classList(attrs);
    const inlineStyle = parseInlineStyle(attrs.style || "");
    const next = {
      bold: prev.bold || tagName === "strong" || tagName === "b",
      italic: prev.italic || tagName === "em" || tagName === "i",
      superscript: prev.superscript || tagName === "sup",
      href: tagName === "a" && attrs.href ? attrs.href : prev.href,
      nodeId: attrs.id || prev.nodeId || "",
      className: classes.join(" "),
      color: inlineStyle.color || prev.color || "",
      fontScale: inlineStyle["font-size"] ? parseCssLengthEm(inlineStyle["font-size"], prev.fontScale || 1) : (prev.fontScale ?? null),
      lineHeightFactor: inlineStyle["line-height"] ? parseCssLengthEm(inlineStyle["line-height"], prev.lineHeightFactor || 1) : (prev.lineHeightFactor ?? null),
      letterSpacingEm: inlineStyle["letter-spacing"] ? parseCssLengthEm(inlineStyle["letter-spacing"], prev.letterSpacingEm || 0) : (prev.letterSpacingEm ?? null),
      trailingSpacingEm: inlineStyle["margin-right"] ? parseCssLengthEm(inlineStyle["margin-right"], prev.trailingSpacingEm || 0) : (prev.trailingSpacingEm ?? null),
      fontFamily: inlineStyle["font-family"] || prev.fontFamily || "",
      dropCap: prev.dropCap || classes.includes("dropcap")
    };
    if (classes.includes("dropcap")) {
      if (next.lineHeightFactor == null) next.lineHeightFactor = 0.8;
      if (next.trailingSpacingEm == null) next.trailingSpacingEm = 0.1;
    }
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
          text: "",
          hardBreak: true,
          styleState: {
            bold: state.bold,
            italic: state.italic,
            superscript: state.superscript,
            className: state.className,
            color: state.color,
            fontScale: state.fontScale,
            lineHeightFactor: state.lineHeightFactor,
            letterSpacingEm: state.letterSpacingEm,
            trailingSpacingEm: state.trailingSpacingEm,
            fontFamily: state.fontFamily,
            dropCap: state.dropCap
          },
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
      hardBreak: false,
      styleState: {
        bold: state.bold,
        italic: state.italic,
        superscript: state.superscript,
        className: state.className,
        color: state.color,
        fontScale: state.fontScale,
        lineHeightFactor: state.lineHeightFactor,
        letterSpacingEm: state.letterSpacingEm,
        trailingSpacingEm: state.trailingSpacingEm,
        fontFamily: state.fontFamily,
        dropCap: state.dropCap
      },
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
  if (/(^|\s)(figure-block|image-block)(\s|$)/.test(className) || String(attrs.id || "").trim().toLowerCase() === "cover-image") {
    return "figure";
  }
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

function extractBlocksFromHtml(html, spineItem, styleContext) {
  const body = extractBody(html);
  const matches = Array.from(body.matchAll(/<(h[1-6]|p|li|blockquote|pre|div|td)\b([^>]*)>([\s\S]*?)<\/\1>/gi));
  const blocks = [];
  const candidates = matches.length ? matches : [[null, "div", "", body]];
  for (let index = 0; index < candidates.length; index += 1) {
    const match = candidates[index];
    const tag = String(match[1] || "div").toLowerCase();
    const attrs = parseAttrs(match[2] || "");
    const innerHtml = match[3] || "";
    const plainText = normalizeWhitespace(stripTags(innerHtml));
    const mediaItems = extractMediaItems(innerHtml, spineItem, attrs);
    if (!plainText && !mediaItems.length) continue;
    const inline = extractInlineRuns(innerHtml);
    const blockType =
      !plainText && mediaItems.length
        ? "figure"
        : blockTypeForTag(tag, attrs);
    blocks.push({
      blockId: `${spineItem.spineId}-b-${String(index + 1).padStart(4, "0")}`,
      blockType,
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
      mediaItems,
      blockPresentation: blockPresentationFor(tag, attrs, styleContext),
      runs: inline.runs,
      styleSignals: {
        hasBold: inline.runs.some((run) => run.styleState.bold),
        hasItalic: inline.runs.some((run) => run.styleState.italic),
        hasSuperscript: inline.runs.some((run) => run.styleState.superscript),
        hasLinks: inline.linkTargets.length > 0,
        hasDropCap: inline.runs.some((run) => run.styleState.dropCap),
        hasCustomScale: inline.runs.some((run) => Number(run.styleState.fontScale || 1) !== 1),
        hasMedia: mediaItems.length > 0
      }
    });
  }
  return blocks;
}

function extractTextBlocks({ book, spine }) {
  const styleContext = buildStyleContext(book);
  const blocks = [];
  for (const spineItem of spine) {
    const html = readText(spineItem.absolutePath);
    blocks.push(...extractBlocksFromHtml(html, spineItem, styleContext));
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
