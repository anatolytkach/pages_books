#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_FONT_SIZE_PX = 16;
const PX_PER_PT = 96 / 72;

function normalizeSelector(value) {
  return String(value || "")
    .trim()
    .replace(/\s*>\s*/g, " > ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function resolveStylesheetPath(book) {
  const rootDir = path.resolve(String(book && book.rootDir || ""));
  if (!rootDir) return "";
  const candidates = [
    path.join(rootDir, "EPUB", "styles", "stylesheet1.css"),
    path.join(rootDir, "styles", "stylesheet1.css")
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function readStylesheet(book) {
  const stylesheetPath = resolveStylesheetPath(book);
  if (!stylesheetPath) return "";
  return fs.readFileSync(stylesheetPath, "utf8");
}

function parseDeclarations(ruleBody) {
  const declarations = {};
  for (const part of String(ruleBody || "").split(";")) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const property = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim();
    if (!property || !value) continue;
    declarations[property] = value;
  }
  return declarations;
}

function collectDeclarations(css, selector) {
  const target = normalizeSelector(selector);
  const declarations = {};
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match = rulePattern.exec(String(css || ""));
  while (match) {
    const selectors = String(match[1] || "")
      .split(",")
      .map((entry) => normalizeSelector(entry))
      .filter(Boolean);
    if (selectors.includes(target)) {
      Object.assign(declarations, parseDeclarations(match[2] || ""));
    }
    match = rulePattern.exec(String(css || ""));
  }
  return declarations;
}

function parseLengthToPx(value, fontSizePx = DEFAULT_FONT_SIZE_PX) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "0") return 0;
  const match = normalized.match(/^(-?\d*\.?\d+)(px|pt|em|rem|%)$/);
  if (!match) return null;
  const amount = Number.parseFloat(match[1]);
  const unit = match[2];
  if (!Number.isFinite(amount)) return null;
  if (unit === "px") return amount;
  if (unit === "pt") return amount * PX_PER_PT;
  if (unit === "em" || unit === "rem") return amount * fontSizePx;
  if (unit === "%") return (amount / 100) * fontSizePx;
  return null;
}

function pxToEm(px, fontSizePx = DEFAULT_FONT_SIZE_PX) {
  if (!Number.isFinite(px) || !Number.isFinite(fontSizePx) || fontSizePx <= 0) return null;
  return Math.round((px / fontSizePx) * 10000) / 10000;
}

function normalizeTextAlign(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["left", "center", "right", "justify"].includes(normalized) ? normalized : "";
}

function normalizeFontStyle(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "italic" ? "italic" : normalized === "normal" ? "normal" : "";
}

function normalizeFontWeight(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "bold") return "bold";
  if (normalized === "normal") return "regular";
  const numeric = Number.parseInt(normalized, 10);
  if (Number.isFinite(numeric)) {
    return numeric >= 600 ? "bold" : "regular";
  }
  return "";
}

function parseMarginPair(value, fontSizePx) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  const parts = normalized.split(/\s+/).map((part) => parseLengthToPx(part, fontSizePx));
  if (!parts.length || parts.some((part) => part == null)) return null;
  if (parts.length === 1) {
    return { topPx: parts[0], bottomPx: parts[0] };
  }
  if (parts.length === 2) {
    return { topPx: parts[0], bottomPx: parts[0] };
  }
  return { topPx: parts[0], bottomPx: parts[2] };
}

function parseLineHeightFactor(value, currentFontSizePx, inheritedFactor = null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return inheritedFactor;
  if (/^-?\d*\.?\d+$/.test(normalized)) {
    const factor = Number.parseFloat(normalized);
    return Number.isFinite(factor) ? factor : inheritedFactor;
  }
  const px = parseLengthToPx(normalized, currentFontSizePx);
  if (!Number.isFinite(px) || !Number.isFinite(currentFontSizePx) || currentFontSizePx <= 0) {
    return inheritedFactor;
  }
  return Math.round((px / currentFontSizePx) * 10000) / 10000;
}

function buildSelectorEntry(declarations, inherited, bodyFontSizePx) {
  const inheritedFontSizePx = Number.isFinite(inherited && inherited.fontSizePx)
    ? inherited.fontSizePx
    : bodyFontSizePx;
  const fontSizePx = parseLengthToPx(declarations["font-size"], inheritedFontSizePx) || inheritedFontSizePx;
  const lineHeightFactor = parseLineHeightFactor(
    declarations["line-height"],
    fontSizePx,
    Number.isFinite(inherited && inherited.lineHeightFactor) ? inherited.lineHeightFactor : null
  );
  const entry = {
    fontSizeScale: pxToEm(fontSizePx, bodyFontSizePx),
    lineHeightFactor,
    textAlign: normalizeTextAlign(declarations["text-align"]) || String(inherited && inherited.textAlign || "").trim(),
    fontSizePx
  };

  const textIndentPx = parseLengthToPx(declarations["text-indent"], fontSizePx);
  if (textIndentPx != null) {
    entry.textIndentEm = pxToEm(textIndentPx, fontSizePx);
  }

  const marginPair = parseMarginPair(declarations.margin, fontSizePx);
  if (marginPair) {
    entry.marginTopEm = pxToEm(marginPair.topPx, fontSizePx);
    entry.marginBottomEm = pxToEm(marginPair.bottomPx, fontSizePx);
  }

  const marginTopPx = parseLengthToPx(declarations["margin-top"], fontSizePx);
  if (marginTopPx != null) {
    entry.marginTopEm = pxToEm(marginTopPx, fontSizePx);
  }
  const marginBottomPx = parseLengthToPx(declarations["margin-bottom"], fontSizePx);
  if (marginBottomPx != null) {
    entry.marginBottomEm = pxToEm(marginBottomPx, fontSizePx);
  }

  const letterSpacingPx = parseLengthToPx(declarations["letter-spacing"], fontSizePx);
  if (letterSpacingPx != null) {
    entry.letterSpacingEm = pxToEm(letterSpacingPx, fontSizePx);
  }
  const wordSpacingPx = parseLengthToPx(declarations["word-spacing"], fontSizePx);
  if (wordSpacingPx != null) {
    entry.wordSpacingEm = pxToEm(wordSpacingPx, fontSizePx);
  }

  const fontStyle = normalizeFontStyle(declarations["font-style"]);
  if (fontStyle) entry.fontStyle = fontStyle;
  const fontWeight = normalizeFontWeight(declarations["font-weight"]);
  if (fontWeight) entry.fontWeight = fontWeight;
  const fontFamily = String(declarations["font-family"] || "").trim();
  if (fontFamily) entry.fontFamily = fontFamily;
  const textColor = String(declarations.color || "").trim();
  if (textColor) entry.textColor = textColor;

  return entry;
}

function buildStyleContext(book) {
  const css = readStylesheet(book);
  if (!css) {
    return {
      paragraph: null,
      blockquote: null,
      figureLead: null,
      listItem: null,
      headings: {}
    };
  }

  const bodyDeclarations = collectDeclarations(css, "body");
  const bodyFontSizePx = parseLengthToPx(bodyDeclarations["font-size"], DEFAULT_FONT_SIZE_PX) || DEFAULT_FONT_SIZE_PX;
  const bodyEntry = buildSelectorEntry(bodyDeclarations, {}, bodyFontSizePx);
  const paragraphEntry = buildSelectorEntry(collectDeclarations(css, "p"), bodyEntry, bodyFontSizePx);
  const blockquoteEntry = buildSelectorEntry(collectDeclarations(css, "blockquote"), bodyEntry, bodyFontSizePx);
  const figureLeadEntry = buildSelectorEntry(
    collectDeclarations(css, ".figure-block td > p.figure-lead"),
    paragraphEntry,
    bodyFontSizePx
  );

  const headings = {};
  for (let level = 1; level <= 6; level += 1) {
    headings[level] = buildSelectorEntry(collectDeclarations(css, `h${level}`), bodyEntry, bodyFontSizePx);
  }

  return {
    paragraph: paragraphEntry,
    blockquote: blockquoteEntry,
    figureLead: figureLeadEntry,
    listItem: paragraphEntry,
    headings
  };
}

module.exports = { buildStyleContext };
