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

function parseCssLengthPx(value, fallback = 0) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return fallback;
  const pxMatch = raw.match(/^(-?\d+(?:\.\d+)?)px$/);
  if (pxMatch) return Number(pxMatch[1]);
  const emMatch = raw.match(/^(-?\d+(?:\.\d+)?)(em|rem)$/);
  if (emMatch) return Number(emMatch[1]) * 16;
  const percentMatch = raw.match(/^(-?\d+(?:\.\d+)?)%$/);
  if (percentMatch) return Number(percentMatch[1]);
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

function blockPresentationFor(tag, attrs = {}) {
  const classes = classList(attrs);
  const inlineStyle = parseInlineStyle(attrs.style || "");
  const headingMatch = String(tag || "").match(/^h([1-6])$/i);
  const presentation = {
    textAlign: "justify",
    textIndentEm: 1,
    marginTopEm: 0.25,
    marginBottomEm: 0.25,
    lineHeightFactor: 1.5,
    fontSizeScale: 1,
    letterSpacingEm: 0,
    wordSpacingEm: 0,
    pageBreakBefore: false,
    fontFamily: ""
  };

  if (headingMatch) {
    const level = Number(headingMatch[1]);
    presentation.textAlign = "center";
    presentation.textIndentEm = 0;
    presentation.lineHeightFactor = 1.5;
    presentation.marginTopEm = level === 1 ? 0.6 : level === 2 ? 2 : 1;
    presentation.marginBottomEm = level === 1 ? 0.6 : level === 2 ? 1 : 0.5;
    presentation.fontSizeScale =
      level === 1 ? 3 :
      level === 2 ? 1.5 :
      level === 3 ? 1.3 :
      level === 4 ? 1.2 :
      1.1;
    presentation.pageBreakBefore = level === 2;
    if (level === 1) {
      presentation.letterSpacingEm = 0.12;
      presentation.wordSpacingEm = 0.2;
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

  if (inlineStyle["text-align"]) presentation.textAlign = String(inlineStyle["text-align"]).toLowerCase();
  if (inlineStyle["text-indent"]) presentation.textIndentEm = parseCssLengthEm(inlineStyle["text-indent"], presentation.textIndentEm);
  if (inlineStyle["margin-top"]) presentation.marginTopEm = parseCssLengthEm(inlineStyle["margin-top"], presentation.marginTopEm);
  if (inlineStyle["margin-bottom"]) presentation.marginBottomEm = parseCssLengthEm(inlineStyle["margin-bottom"], presentation.marginBottomEm);
  if (inlineStyle["line-height"]) presentation.lineHeightFactor = parseCssLengthEm(inlineStyle["line-height"], presentation.lineHeightFactor);
  if (inlineStyle["font-size"]) presentation.fontSizeScale = parseCssLengthEm(inlineStyle["font-size"], presentation.fontSizeScale);
  if (inlineStyle["letter-spacing"]) presentation.letterSpacingEm = parseCssLengthEm(inlineStyle["letter-spacing"], presentation.letterSpacingEm);
  if (inlineStyle["word-spacing"]) presentation.wordSpacingEm = parseCssLengthEm(inlineStyle["word-spacing"], presentation.wordSpacingEm);
  if (inlineStyle["font-family"]) presentation.fontFamily = String(inlineStyle["font-family"]).trim();

  return presentation;
}

function imageBlockPresentation(attrs = {}) {
  const inlineStyle = parseInlineStyle(attrs.style || "");
  return {
    textAlign: "center",
    textIndentEm: 0,
    marginTopEm: 0.75,
    marginBottomEm: 0.75,
    lineHeightFactor: 1,
    fontSizeScale: 1,
    letterSpacingEm: 0,
    wordSpacingEm: 0,
    pageBreakBefore: false,
    fontFamily: "",
    widthPx: parseCssLengthPx(inlineStyle.width || attrs.width || "", 0),
    heightPx: parseCssLengthPx(inlineStyle.height || attrs.height || "", 0)
  };
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

function normalizeHref(value) {
  return String(value || "").trim().replace(/\\/g, "/");
}

function resolveImageSource(spineItem, src) {
  const rawSrc = normalizeHref(src);
  if (!rawSrc) return null;
  const cleanSrc = rawSrc.split("?")[0].split("#")[0];
  if (!cleanSrc) return null;
  const spineDirHref = path.posix.dirname(normalizeHref(spineItem && spineItem.href) || "");
  const href = cleanSrc.startsWith("/")
    ? cleanSrc.replace(/^\/+/, "")
    : path.posix.normalize(path.posix.join(spineDirHref === "." ? "" : spineDirHref, cleanSrc));
  const absolutePath = path.resolve(path.dirname(spineItem.absolutePath), cleanSrc);
  return {
    href,
    absolutePath
  };
}

function extractImageBlocks(innerHtml, spineItem, blockIndex, attrs = {}) {
  const matches = Array.from(String(innerHtml || "").matchAll(/<img\b([^>]*?)\/?>/gi));
  const blocks = [];
  for (let imageIndex = 0; imageIndex < matches.length; imageIndex += 1) {
    const imageAttrs = parseAttrs(matches[imageIndex][1] || "");
    const source = resolveImageSource(spineItem, imageAttrs.src || "");
    if (!source || !source.absolutePath || !fs.existsSync(source.absolutePath)) continue;
    blocks.push({
      blockId: `${spineItem.spineId}-img-${String(blockIndex + 1).padStart(4, "0")}-${String(imageIndex + 1).padStart(2, "0")}`,
      blockType: "image",
      tagName: "img",
      text: "",
      sourceRef: {
        spineId: spineItem.spineId,
        spineIndex: spineItem.spineIndex,
        href: spineItem.href,
        filePath: spineItem.absolutePath,
        nodeTag: "img",
        nodeIndex: blockIndex,
        nodeId: imageAttrs.id || "",
        nodeClass: imageAttrs.class || ""
      },
      linkTargets: [],
      inlineIds: imageAttrs.id ? [imageAttrs.id] : [],
      blockPresentation: imageBlockPresentation(imageAttrs),
      runs: [],
      styleSignals: {
        hasBold: false,
        hasItalic: false,
        hasSuperscript: false,
        hasLinks: false,
        hasDropCap: false,
        hasCustomScale: false
      },
      image: {
        href: source.href,
        absolutePath: source.absolutePath,
        alt: normalizeWhitespace(decodeEntities(imageAttrs.alt || imageAttrs.title || "")),
        widthPx: parseCssLengthPx(imageAttrs.width || "", 0),
        heightPx: parseCssLengthPx(imageAttrs.height || "", 0)
      }
    });
  }
  return blocks;
}

function extractBlocksFromHtml(html, spineItem) {
  const body = extractBody(html);
  const matches = Array.from(body.matchAll(/<(h[1-6]|p|li|blockquote|pre)\b([^>]*)>([\s\S]*?)<\/\1>/gi));
  const blocks = [];
  const candidates = matches.length ? matches : [[null, "div", "", body]];
  for (let index = 0; index < candidates.length; index += 1) {
    const match = candidates[index];
    const tag = String(match[1] || "div").toLowerCase();
    const attrs = parseAttrs(match[2] || "");
    const innerHtml = match[3] || "";
    const plainText = normalizeWhitespace(stripTags(innerHtml));
    const imageBlocks = extractImageBlocks(innerHtml, spineItem, index, attrs);
    if (!plainText && !imageBlocks.length) continue;
    const inline = extractInlineRuns(innerHtml);
    if (plainText) {
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
        blockPresentation: blockPresentationFor(tag, attrs),
        runs: inline.runs,
        styleSignals: {
          hasBold: inline.runs.some((run) => run.styleState.bold),
          hasItalic: inline.runs.some((run) => run.styleState.italic),
          hasSuperscript: inline.runs.some((run) => run.styleState.superscript),
          hasLinks: inline.linkTargets.length > 0,
          hasDropCap: inline.runs.some((run) => run.styleState.dropCap),
          hasCustomScale: inline.runs.some((run) => Number(run.styleState.fontScale || 1) !== 1)
        }
      });
    }
    blocks.push(...imageBlocks);
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
