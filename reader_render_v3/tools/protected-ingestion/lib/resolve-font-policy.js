#!/usr/bin/env node
"use strict";

const path = require("path");
const { normalizeFamilyName } = require("./extract-font-assets");

function styleVariantFor(styleTokenRecord = {}) {
  if (styleTokenRecord.boldItalic || (styleTokenRecord.bold && styleTokenRecord.italic)) return "boldItalic";
  if (styleTokenRecord.italic) return "italic";
  if (styleTokenRecord.bold) return "bold";
  return "regular";
}

function defaultFamilyForMode(fontMode) {
  return fontMode === "serif" ? "Noto Serif" : "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
}

function policyFamilyCandidates(styleTokenRecord = {}, glyph, fontMode = "sans") {
  const modeCandidate = styleTokenRecord.fontModeCandidates &&
    styleTokenRecord.fontModeCandidates[fontMode] &&
    styleTokenRecord.fontModeCandidates[fontMode].fontFamilyCandidate;
  const glyphModeCandidate = glyph.visualRefs &&
    glyph.visualRefs[fontMode] &&
    glyph.visualRefs[fontMode].fontFamilyCandidate;
  const requested =
    modeCandidate ||
    glyphModeCandidate ||
    styleTokenRecord.fontFamilyCandidate ||
    glyph.fontFamilyCandidate ||
    defaultFamilyForMode(fontMode);
  if (/system-ui|-apple-system|blinkmacsystemfont|segoe ui|roboto|arial/i.test(requested)) {
    return ["Arial", "Helvetica", "Times New Roman", "Georgia"];
  }
  if (/noto serif cjk/i.test(requested)) return ["Times New Roman", "Georgia"];
  if (/noto serif/i.test(requested)) return ["Times New Roman", "Georgia"];
  return [requested, "Times New Roman", "Georgia"];
}

function resolveEmbeddedFont(embedded, familyCandidates, variant) {
  const families = embedded && embedded.byFamily;
  if (!families) return null;
  for (const familyName of familyCandidates) {
    const normalized = normalizeFamilyName(familyName);
    const match = families.get(normalized);
    if (!match) continue;
    const fontFile = match[variant] || match.regular || "";
    if (!fontFile) continue;
    return {
      fontSourceType: "embedded",
      fontSourceName: familyName,
      fontSourceRef: path.basename(fontFile),
      fontFile,
      extractionStatus: "ready",
      requestedVariant: variant,
      resolvedVariant: match[variant] ? variant : "regular"
    };
  }
  return null;
}

function resolvePolicyFont(policy, familyCandidates, variant) {
  for (const familyName of familyCandidates) {
    const normalized = normalizeFamilyName(familyName);
    const match = policy.get(normalized);
    if (!match) continue;
    const fontFile = match.styles[variant] || match.styles.regular || "";
    if (!fontFile) continue;
    return {
      fontSourceType: "policy",
      fontSourceName: match.familyName,
      fontSourceRef: path.basename(fontFile),
      fontFile,
      extractionStatus: "ready",
      requestedVariant: variant,
      resolvedVariant: match.styles[variant] ? variant : "regular"
    };
  }
  return null;
}

function resolveFontPolicy({ glyph, styleTokenRecord, fontAssets, fontMode = "sans" }) {
  const requestedVariant = styleVariantFor(styleTokenRecord);
  const familyCandidates = policyFamilyCandidates(styleTokenRecord, glyph, fontMode);
  const embedded = resolveEmbeddedFont(fontAssets.embedded, familyCandidates, requestedVariant);
  if (embedded) return { ...embedded, requestedFontMode: fontMode };
  const policy = resolvePolicyFont(fontAssets.policy, familyCandidates, requestedVariant);
  if (policy) return { ...policy, requestedFontMode: fontMode };
  return {
    fontSourceType: "fallback",
    fontSourceName: familyCandidates[0] || "fallback-serif",
    fontSourceRef: "",
    fontFile: "",
    extractionStatus: "missing-font",
    requestedVariant,
    resolvedVariant: "",
    requestedFontMode: fontMode
  };
}

module.exports = { resolveFontPolicy, styleVariantFor };
