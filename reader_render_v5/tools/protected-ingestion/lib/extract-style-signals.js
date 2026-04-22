#!/usr/bin/env node
"use strict";

function scriptBucketForCodePoint(codePoint) {
  if (codePoint >= 0x0041 && codePoint <= 0x024f) return "Latin";
  if (codePoint >= 0x0370 && codePoint <= 0x03ff) return "Greek";
  if (codePoint >= 0x0400 && codePoint <= 0x052f) return "Cyrillic";
  if (codePoint >= 0x3400 && codePoint <= 0x9fff) return "CJK";
  if (
    (codePoint >= 0x0020 && codePoint <= 0x0040) ||
    (codePoint >= 0x2000 && codePoint <= 0x206f)
  ) return "Common";
  return "Unknown";
}

function dominantScriptForText(text) {
  const counts = new Map();
  for (const char of Array.from(String(text || ""))) {
    const codePoint = char.codePointAt(0);
    const bucket = scriptBucketForCodePoint(codePoint);
    counts.set(bucket, (counts.get(bucket) || 0) + 1);
  }
  const ranked = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1]);
  return ranked.length ? ranked[0][0] : "Unknown";
}

function fontPolicyForScript(scriptBucket, fontPlan) {
  const assignments = (fontPlan && fontPlan.fontAssignments) || [];
  return assignments.find((item) => item.script === scriptBucket) ||
    assignments.find((item) => item.script === "Unknown") ||
    null;
}

function defaultFontFamilyFor(scriptBucket, blockType, fontMode = "sans") {
  if (blockType === "pre") return "Courier New";
  if (fontMode === "serif") {
    if (scriptBucket === "Latin" || scriptBucket === "Common") return "Noto Serif";
    if (scriptBucket === "Greek" || scriptBucket === "Cyrillic") return "Noto Serif";
    if (scriptBucket === "CJK") return "Noto Serif CJK";
    return "Noto Serif";
  }
  if (scriptBucket === "Latin" || scriptBucket === "Common") return "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
  if (scriptBucket === "Greek" || scriptBucket === "Cyrillic") return "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
  if (scriptBucket === "CJK") return "Noto Serif CJK";
  return "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
}

function fontRoleFor(blockType, fontMode) {
  if (blockType === "pre") return "monospace-fallback";
  const prefix = /^heading-(\d)$/.test(blockType) ? "display" : "body";
  return `${prefix}-${fontMode === "serif" ? "serif" : "sans"}`;
}

function buildFontProfiles() {
  const scriptBuckets = ["Latin", "Greek", "Cyrillic", "Common", "CJK", "Unknown"];
  const profiles = {};
  for (const fontMode of ["sans", "serif"]) {
    profiles[fontMode] = {
      byScriptBucket: Object.fromEntries(scriptBuckets.map((scriptBucket) => [
        scriptBucket,
        {
          fontFamilyCandidate: defaultFontFamilyFor(scriptBucket, "paragraph", fontMode),
          fontMode
        }
      ]))
    };
  }
  return {
    version: 1,
    supportedFontModes: ["sans", "serif"],
    defaultFontMode: "sans",
    profiles
  };
}

function blockRoleFor(blockType) {
  if (/^heading-\d$/.test(blockType)) return "heading";
  if (blockType === "list-item") return "list";
  if (blockType === "blockquote") return "quote";
  if (blockType === "pre") return "monospace";
  if (blockType === "verse") return "verse";
  return "body";
}

function styleTokenFrom(run, block) {
  const parts = [block.blockType || "paragraph"];
  if (run.styleState.bold) parts.push("bold");
  if (run.styleState.italic) parts.push("italic");
  if (run.styleState.superscript) parts.push("sup");
  if (run.styleState.dropCap) parts.push("dropcap");
  if (Number(run.styleState.fontScale || 1) !== 1) parts.push(`scale-${String(Math.round(Number(run.styleState.fontScale || 1) * 100)).padStart(3, "0")}`);
  if (Number(run.styleState.letterSpacingEm || 0) > 0) parts.push("track");
  if (run.linkTarget) parts.push("link");
  return parts.join("-");
}

function extractStyleSignals(blocks, options = {}) {
  const fontPlan = options.fontPlan || null;
  const styleRegistry = {};
  const fontProfiles = buildFontProfiles();

  for (const block of blocks) {
    for (const run of block.runs) {
      const token = styleTokenFrom(run, block);
      run.styleToken = token;
      const scriptBucket = dominantScriptForText(run.text);
      const fontPolicy = fontPolicyForScript(scriptBucket, fontPlan);
      const isHeading = /^heading-(\d)$/.test(block.blockType);
      const headingLevelMatch = block.blockType.match(/^heading-(\d)$/);
      const explicitRequestedFamily =
        run.styleState.fontFamily ||
        (block.blockPresentation && block.blockPresentation.fontFamily) ||
        "";
      const sansFamily = explicitRequestedFamily || defaultFontFamilyFor(scriptBucket, block.blockType, "sans");
      const serifFamily = explicitRequestedFamily || defaultFontFamilyFor(scriptBucket, block.blockType, "serif");
      const blockFontStyle = String(block.blockPresentation && block.blockPresentation.fontStyle || "").trim().toLowerCase();
      const blockFontWeight = String(block.blockPresentation && block.blockPresentation.fontWeight || "").trim().toLowerCase();
      const isItalic = !!run.styleState.italic || blockFontStyle === "italic";
      const isBold = !!run.styleState.bold || blockFontWeight === "bold";
      if (!styleRegistry[token]) {
        styleRegistry[token] = {
          styleToken: token,
          blockType: block.blockType,
          blockRole: blockRoleFor(block.blockType),
          headingLevel: headingLevelMatch ? parseInt(headingLevelMatch[1], 10) : 0,
          bold: isBold,
          italic: isItalic,
          superscript: !!run.styleState.superscript,
          boldItalic: isBold && isItalic,
          linkLike: !!run.linkTarget,
          scriptBucket,
          fontFamilyCandidate: sansFamily || (fontPolicy ? fontPolicy.fontSource : defaultFontFamilyFor(scriptBucket, block.blockType, "sans")),
          fontRole: isHeading ? "display-sans" : block.blockType === "pre" ? "monospace-fallback" : "body-sans",
          fontStyle: isItalic ? "italic" : "normal",
          fontWeight: isBold ? "bold" : "regular",
          fontSizePx: Number((block.blockPresentation && block.blockPresentation.fontSizePx) || 0) || 0,
          fontSizeScale: Number(run.styleState.fontScale || (block.blockPresentation && block.blockPresentation.fontSizeScale) || 1) || 1,
          lineHeightPx: Number((block.blockPresentation && block.blockPresentation.lineHeightPx) || 0) || 0,
          lineHeightFactor: Number(run.styleState.lineHeightFactor || (block.blockPresentation && block.blockPresentation.lineHeightFactor) || 1.5) || 1.5,
          letterSpacingPx: Number((block.blockPresentation && block.blockPresentation.letterSpacingPx) || 0) || 0,
          letterSpacingEm: Number(run.styleState.letterSpacingEm || (block.blockPresentation && block.blockPresentation.letterSpacingEm) || 0) || 0,
          trailingSpacingEm: Number(run.styleState.trailingSpacingEm || 0) || 0,
          wordSpacingPx: Number((block.blockPresentation && block.blockPresentation.wordSpacingPx) || 0) || 0,
          wordSpacingEm: Number((block.blockPresentation && block.blockPresentation.wordSpacingEm) || 0) || 0,
          textColor: run.styleState.color || (block.blockPresentation && block.blockPresentation.textColor) || "",
          dropCap: !!run.styleState.dropCap,
          textAlign: (block.blockPresentation && block.blockPresentation.textAlign) || "justify",
          whiteSpace: (block.blockPresentation && block.blockPresentation.whiteSpace) || "normal",
          textIndentPx: Number((block.blockPresentation && block.blockPresentation.textIndentPx) || 0) || 0,
          textIndentEm: Number((block.blockPresentation && block.blockPresentation.textIndentEm) || 0) || 0,
          marginTopPx: Number((block.blockPresentation && block.blockPresentation.marginTopPx) || 0) || 0,
          marginTopEm: Number((block.blockPresentation && block.blockPresentation.marginTopEm) || 0) || 0,
          marginBottomPx: Number((block.blockPresentation && block.blockPresentation.marginBottomPx) || 0) || 0,
          marginBottomEm: Number((block.blockPresentation && block.blockPresentation.marginBottomEm) || 0) || 0,
          marginLeftPx: Number((block.blockPresentation && block.blockPresentation.marginLeftPx) || 0) || 0,
          marginLeftEm: Number((block.blockPresentation && block.blockPresentation.marginLeftEm) || 0) || 0,
          marginRightPx: Number((block.blockPresentation && block.blockPresentation.marginRightPx) || 0) || 0,
          marginRightEm: Number((block.blockPresentation && block.blockPresentation.marginRightEm) || 0) || 0,
          paddingTopPx: Number((block.blockPresentation && block.blockPresentation.paddingTopPx) || 0) || 0,
          paddingTopEm: Number((block.blockPresentation && block.blockPresentation.paddingTopEm) || 0) || 0,
          paddingRightPx: Number((block.blockPresentation && block.blockPresentation.paddingRightPx) || 0) || 0,
          paddingRightEm: Number((block.blockPresentation && block.blockPresentation.paddingRightEm) || 0) || 0,
          paddingBottomPx: Number((block.blockPresentation && block.blockPresentation.paddingBottomPx) || 0) || 0,
          paddingBottomEm: Number((block.blockPresentation && block.blockPresentation.paddingBottomEm) || 0) || 0,
          paddingLeftPx: Number((block.blockPresentation && block.blockPresentation.paddingLeftPx) || 0) || 0,
          paddingLeftEm: Number((block.blockPresentation && block.blockPresentation.paddingLeftEm) || 0) || 0,
          policyStatus: fontPolicy ? "planned" : "incomplete",
          policyGaps: fontPolicy ? (fontPolicy.gaps || []) : [{ style: "all", note: "No font plan assignment found." }]
        };
      } else {
        if (styleRegistry[token].scriptBucket === "Common" && scriptBucket !== "Common") {
          styleRegistry[token].scriptBucket = scriptBucket;
        }
      }
    }
  }

  return {
    styleRegistry,
    stylesList: Object.values(styleRegistry),
    fontProfiles
  };
}

module.exports = { extractStyleSignals };
