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

function splitHrefTarget(value) {
  const raw = String(value || "").trim();
  if (!raw) return { path: "", fragment: "" };
  const hashIndex = raw.indexOf("#");
  if (hashIndex < 0) return { path: raw, fragment: "" };
  return {
    path: raw.slice(0, hashIndex),
    fragment: raw.slice(hashIndex + 1)
  };
}

function normalizePathTail(value) {
  const raw = String(value || "").trim().replace(/\\/g, "/");
  if (!raw) return "";
  const noOrigin = raw.replace(/^https?:\/\/[^/]+/i, "");
  const noLeading = noOrigin.replace(/^\/+/, "");
  const parts = noLeading.split("/").filter(Boolean);
  if (!parts.length) return "";
  const oebpsIndex = parts.lastIndexOf("OEBPS");
  if (oebpsIndex >= 0) return parts.slice(oebpsIndex).join("/");
  return parts.join("/");
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
    "textIndentPx",
    "marginTopEm",
    "marginTopPx",
    "marginBottomEm",
    "marginBottomPx",
    "marginLeftEm",
    "marginLeftPx",
    "marginRightEm",
    "marginRightPx",
    "paddingTopEm",
    "paddingTopPx",
    "paddingRightEm",
    "paddingRightPx",
    "paddingBottomEm",
    "paddingBottomPx",
    "paddingLeftEm",
    "paddingLeftPx",
    "lineHeightFactor",
    "lineHeightPx",
    "fontSizePx",
    "fontSizeScale",
    "letterSpacingEm",
    "letterSpacingPx",
    "wordSpacingEm",
    "wordSpacingPx"
  ];
  for (const field of numericFields) {
    if (Number.isFinite(styleEntry[field])) {
      presentation[field] = styleEntry[field];
    }
  }
  const stringFields = [
    "textAlign",
    "fontStyle",
    "fontWeight",
    "fontFamily",
    "textColor",
    "whiteSpace",
    "hyphens",
    "wordBreak",
    "overflowWrap"
  ];
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
    textIndentPx: 16,
    marginTopEm: 0,
    marginTopPx: 0,
    marginBottomEm: 0,
    marginBottomPx: 0,
    marginLeftEm: 0,
    marginLeftPx: 0,
    marginRightEm: 0,
    marginRightPx: 0,
    paddingTopEm: 0,
    paddingTopPx: 0,
    paddingRightEm: 0,
    paddingRightPx: 0,
    paddingBottomEm: 0,
    paddingBottomPx: 0,
    paddingLeftEm: 0,
    paddingLeftPx: 0,
    lineHeightFactor: 1.5,
    lineHeightPx: 24,
    fontSizePx: 16,
    fontSizeScale: 1,
    letterSpacingEm: 0,
    letterSpacingPx: 0,
    wordSpacingEm: 0,
    wordSpacingPx: 0,
    pageBreakBefore: false,
    fontFamily: "",
    fontStyle: "normal",
    fontWeight: "regular",
    textColor: "",
    whiteSpace: "normal",
    hyphens: "manual",
    wordBreak: "normal",
    overflowWrap: "normal"
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
  if (inlineStyle["text-indent"]) {
    const valueEm = parseCssLengthEm(inlineStyle["text-indent"], presentation.textIndentEm);
    presentation.textIndentEm = valueEm;
    presentation.textIndentPx = Math.round(valueEm * Math.max(1, Number(presentation.fontSizePx || 16)) * 1000) / 1000;
  }
  if (inlineStyle["margin-top"]) {
    const valueEm = parseCssLengthEm(inlineStyle["margin-top"], presentation.marginTopEm);
    presentation.marginTopEm = valueEm;
    presentation.marginTopPx = Math.round(valueEm * Math.max(1, Number(presentation.fontSizePx || 16)) * 1000) / 1000;
  }
  if (inlineStyle["margin-bottom"]) {
    const valueEm = parseCssLengthEm(inlineStyle["margin-bottom"], presentation.marginBottomEm);
    presentation.marginBottomEm = valueEm;
    presentation.marginBottomPx = Math.round(valueEm * Math.max(1, Number(presentation.fontSizePx || 16)) * 1000) / 1000;
  }
  if (inlineStyle["margin-left"]) {
    const valueEm = parseCssLengthEm(inlineStyle["margin-left"], presentation.marginLeftEm);
    presentation.marginLeftEm = valueEm;
    presentation.marginLeftPx = Math.round(valueEm * Math.max(1, Number(presentation.fontSizePx || 16)) * 1000) / 1000;
  }
  if (inlineStyle["margin-right"]) {
    const valueEm = parseCssLengthEm(inlineStyle["margin-right"], presentation.marginRightEm);
    presentation.marginRightEm = valueEm;
    presentation.marginRightPx = Math.round(valueEm * Math.max(1, Number(presentation.fontSizePx || 16)) * 1000) / 1000;
  }
  if (inlineStyle["padding-top"]) {
    const valueEm = parseCssLengthEm(inlineStyle["padding-top"], presentation.paddingTopEm);
    presentation.paddingTopEm = valueEm;
    presentation.paddingTopPx = Math.round(valueEm * Math.max(1, Number(presentation.fontSizePx || 16)) * 1000) / 1000;
  }
  if (inlineStyle["padding-right"]) {
    const valueEm = parseCssLengthEm(inlineStyle["padding-right"], presentation.paddingRightEm);
    presentation.paddingRightEm = valueEm;
    presentation.paddingRightPx = Math.round(valueEm * Math.max(1, Number(presentation.fontSizePx || 16)) * 1000) / 1000;
  }
  if (inlineStyle["padding-bottom"]) {
    const valueEm = parseCssLengthEm(inlineStyle["padding-bottom"], presentation.paddingBottomEm);
    presentation.paddingBottomEm = valueEm;
    presentation.paddingBottomPx = Math.round(valueEm * Math.max(1, Number(presentation.fontSizePx || 16)) * 1000) / 1000;
  }
  if (inlineStyle["padding-left"]) {
    const valueEm = parseCssLengthEm(inlineStyle["padding-left"], presentation.paddingLeftEm);
    presentation.paddingLeftEm = valueEm;
    presentation.paddingLeftPx = Math.round(valueEm * Math.max(1, Number(presentation.fontSizePx || 16)) * 1000) / 1000;
  }
  if (inlineStyle["line-height"]) {
    const valueFactor = parseCssLengthEm(inlineStyle["line-height"], presentation.lineHeightFactor);
    presentation.lineHeightFactor = valueFactor;
    presentation.lineHeightPx = Math.round(valueFactor * Math.max(1, Number(presentation.fontSizePx || 16)) * 1000) / 1000;
  }
  if (inlineStyle["font-size"]) {
    const valueEm = parseCssLengthEm(inlineStyle["font-size"], presentation.fontSizeScale);
    presentation.fontSizeScale = valueEm;
    presentation.fontSizePx = Math.round(valueEm * 16 * 1000) / 1000;
  }
  if (inlineStyle["letter-spacing"]) {
    const valueEm = parseCssLengthEm(inlineStyle["letter-spacing"], presentation.letterSpacingEm);
    presentation.letterSpacingEm = valueEm;
    presentation.letterSpacingPx = Math.round(valueEm * Math.max(1, Number(presentation.fontSizePx || 16)) * 1000) / 1000;
  }
  if (inlineStyle["word-spacing"]) {
    const valueEm = parseCssLengthEm(inlineStyle["word-spacing"], presentation.wordSpacingEm);
    presentation.wordSpacingEm = valueEm;
    presentation.wordSpacingPx = Math.round(valueEm * Math.max(1, Number(presentation.fontSizePx || 16)) * 1000) / 1000;
  }
  if (inlineStyle["font-family"]) presentation.fontFamily = String(inlineStyle["font-family"]).trim();
  if (inlineStyle["font-style"]) presentation.fontStyle = String(inlineStyle["font-style"]).trim().toLowerCase();
  if (inlineStyle["font-weight"]) {
    const rawWeight = String(inlineStyle["font-weight"]).trim().toLowerCase();
    presentation.fontWeight = rawWeight === "bold" ? "bold" : (/^\d+$/.test(rawWeight) ? (Number(rawWeight) >= 600 ? "bold" : "regular") : rawWeight);
  }
  if (inlineStyle.color) presentation.textColor = String(inlineStyle.color).trim();
  if (inlineStyle["white-space"]) presentation.whiteSpace = String(inlineStyle["white-space"]).trim().toLowerCase();
  if (inlineStyle.hyphens || inlineStyle["-epub-hyphens"] || inlineStyle["-webkit-hyphens"] || inlineStyle["-moz-hyphens"]) {
    presentation.hyphens = String(
      inlineStyle.hyphens ||
      inlineStyle["-epub-hyphens"] ||
      inlineStyle["-webkit-hyphens"] ||
      inlineStyle["-moz-hyphens"]
    ).trim().toLowerCase();
  }
  if (inlineStyle["word-break"]) presentation.wordBreak = String(inlineStyle["word-break"]).trim().toLowerCase();
  if (inlineStyle["overflow-wrap"] || inlineStyle["word-wrap"]) {
    presentation.overflowWrap = String(inlineStyle["overflow-wrap"] || inlineStyle["word-wrap"]).trim().toLowerCase();
  }

  const fontSizePx = Math.max(1, Number(presentation.fontSizePx || 16));
  presentation.textIndentPx = Math.round((Number(presentation.textIndentEm || 0) || 0) * fontSizePx * 1000) / 1000;
  presentation.marginTopPx = Math.round((Number(presentation.marginTopEm || 0) || 0) * fontSizePx * 1000) / 1000;
  presentation.marginBottomPx = Math.round((Number(presentation.marginBottomEm || 0) || 0) * fontSizePx * 1000) / 1000;
  presentation.marginLeftPx = Math.round((Number(presentation.marginLeftEm || 0) || 0) * fontSizePx * 1000) / 1000;
  presentation.marginRightPx = Math.round((Number(presentation.marginRightEm || 0) || 0) * fontSizePx * 1000) / 1000;
  presentation.paddingTopPx = Math.round((Number(presentation.paddingTopEm || 0) || 0) * fontSizePx * 1000) / 1000;
  presentation.paddingRightPx = Math.round((Number(presentation.paddingRightEm || 0) || 0) * fontSizePx * 1000) / 1000;
  presentation.paddingBottomPx = Math.round((Number(presentation.paddingBottomEm || 0) || 0) * fontSizePx * 1000) / 1000;
  presentation.paddingLeftPx = Math.round((Number(presentation.paddingLeftEm || 0) || 0) * fontSizePx * 1000) / 1000;
  presentation.letterSpacingPx = Math.round((Number(presentation.letterSpacingEm || 0) || 0) * fontSizePx * 1000) / 1000;
  presentation.wordSpacingPx = Math.round((Number(presentation.wordSpacingEm || 0) || 0) * fontSizePx * 1000) / 1000;
  presentation.lineHeightPx = Math.round((Number(presentation.lineHeightFactor || 1.5) || 1.5) * fontSizePx * 1000) / 1000;

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

function buildBlockRecord({
  blockIndex,
  tag,
  attrs = {},
  innerHtml = "",
  spineItem,
  styleContext,
  blockTypeOverride = ""
}) {
  const plainText = normalizeWhitespace(stripTags(innerHtml));
  const mediaItems = extractMediaItems(innerHtml, spineItem, attrs);
  if (!plainText && !mediaItems.length) return null;
  const inline = extractInlineRuns(innerHtml);
  const blockType =
    blockTypeOverride ||
    (
      !plainText && mediaItems.length
        ? "figure"
        : blockTypeForTag(tag, attrs)
    );
  return {
    blockId: `${spineItem.spineId}-b-${String(blockIndex + 1).padStart(4, "0")}`,
    blockType,
    tagName: tag,
    text: plainText,
    sourceRef: {
      spineId: spineItem.spineId,
      spineIndex: spineItem.spineIndex,
      href: spineItem.href,
      filePath: spineItem.absolutePath,
      nodeTag: tag,
      nodeIndex: blockIndex,
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
  };
}

function extractNestedBlockquoteBlocks(innerHtml, spineItem, attrs, styleContext, parentIndex) {
  const nestedMatches = Array.from(
    String(innerHtml || "").matchAll(/<(p|li|div|pre)\b([^>]*)>([\s\S]*?)<\/\1>/gi)
  );
  if (!nestedMatches.length) return [];
  const blocks = [];
  for (let nestedIndex = 0; nestedIndex < nestedMatches.length; nestedIndex += 1) {
    const match = nestedMatches[nestedIndex];
    const nestedTag = String(match[1] || "p").toLowerCase();
    const nestedAttrs = parseAttrs(match[2] || "");
    const mergedAttrs = {
      ...attrs,
      ...nestedAttrs,
      class: [attrs.class || "", nestedAttrs.class || ""].filter(Boolean).join(" ").trim(),
      style: [attrs.style || "", nestedAttrs.style || ""].filter(Boolean).join("; ")
    };
    const block = buildBlockRecord({
      blockIndex: (parentIndex * 1000) + nestedIndex,
      tag: "blockquote",
      attrs: mergedAttrs,
      innerHtml: match[3] || "",
      spineItem,
      styleContext,
      blockTypeOverride: "blockquote"
    });
    if (block) {
      block.tagName = nestedTag;
      block.sourceRef = {
        ...block.sourceRef,
        nodeTag: nestedTag
      };
      blocks.push(block);
    }
  }
  return blocks;
}

function sourceRefMatchesToc(sourceRef, tocItem, inlineIds = []) {
  const { path, fragment } = splitHrefTarget(tocItem && tocItem.href);
  const tocHref = normalizePathTail(path || (tocItem && tocItem.spineHref));
  const sourceHref = normalizePathTail(sourceRef && sourceRef.href);
  if (!tocHref || !sourceHref) return false;
  const hrefMatches =
    sourceHref === tocHref ||
    sourceHref.endsWith(`/${tocHref}`) ||
    tocHref.endsWith(`/${sourceHref}`);
  if (!hrefMatches) return false;
  if (!fragment) return true;
  const nodeId = String(sourceRef && sourceRef.nodeId || "").trim();
  if (nodeId && nodeId === fragment) return true;
  return Array.isArray(inlineIds) && inlineIds.some((value) => String(value || "").trim() === fragment);
}

function normalizeLabel(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s.'’:-]/gu, "")
    .trim();
}

function blocksShareSpineHref(block, tocItem) {
  const sourceHref = normalizePathTail(block && block.sourceRef && block.sourceRef.href);
  const tocHref = normalizePathTail(tocItem && (splitHrefTarget(tocItem.href).path || tocItem.spineHref));
  if (!sourceHref || !tocHref) return false;
  return (
    sourceHref === tocHref ||
    sourceHref.endsWith(`/${tocHref}`) ||
    tocHref.endsWith(`/${sourceHref}`)
  );
}

function findChapterStartBlock(blocks, tocItem) {
  const directMatch = blocks.find((block) => sourceRefMatchesToc(block && block.sourceRef, tocItem, block && block.inlineIds)) || null;
  if (directMatch) return directMatch;
  const labelMatch = blocks.find((block) => (
    blocksShareSpineHref(block, tocItem) &&
    normalizeLabel(block && block.text) === normalizeLabel(tocItem && tocItem.label)
  )) || null;
  if (labelMatch) return labelMatch;
  return blocks.find((block) => (
    blocksShareSpineHref(block, tocItem) &&
    /^heading-\d+$/.test(String(block && block.blockType || ""))
  )) || null;
}

function applyChapterPageBreaks(blocks, tocItems) {
  const normalizedBlocks = Array.isArray(blocks) ? blocks : [];
  const normalizedToc = Array.isArray(tocItems) ? tocItems : [];
  const chapterStartIds = new Set();

  for (const tocItem of normalizedToc) {
    const chapterStart = findChapterStartBlock(normalizedBlocks, tocItem);
    if (!chapterStart || !chapterStart.blockId) continue;
    chapterStartIds.add(String(chapterStart.blockId));
  }

  return normalizedBlocks.map((block, index) => {
    if (!block || !block.blockId || !chapterStartIds.has(String(block.blockId))) return block;
    return {
      ...block,
      blockPresentation: {
        ...(block.blockPresentation || {}),
        pageBreakBefore: index > 0
      }
    };
  });
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
    if (tag === "blockquote") {
      const nestedBlocks = extractNestedBlockquoteBlocks(innerHtml, spineItem, attrs, styleContext, index);
      if (nestedBlocks.length) {
        blocks.push(...nestedBlocks);
        continue;
      }
    }
    const block = buildBlockRecord({
      blockIndex: index,
      tag,
      attrs,
      innerHtml,
      spineItem,
      styleContext
    });
    if (block) blocks.push(block);
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

  return {
    blocks: applyChapterPageBreaks(blocks, toc),
    toc
  };
}

module.exports = { extractTextBlocks };
