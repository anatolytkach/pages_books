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
  if (run.linkTarget) parts.push("link");
  return parts.join("-");
}

function extractStyleSignals(blocks, options = {}) {
  const fontPlan = options.fontPlan || null;
  const styleRegistry = {};

  for (const block of blocks) {
    for (const run of block.runs) {
      const token = styleTokenFrom(run, block);
      run.styleToken = token;
      const scriptBucket = dominantScriptForText(run.text);
      const fontPolicy = fontPolicyForScript(scriptBucket, fontPlan);
      const isHeading = /^heading-(\d)$/.test(block.blockType);
      const headingLevelMatch = block.blockType.match(/^heading-(\d)$/);
      if (!styleRegistry[token]) {
        styleRegistry[token] = {
          styleToken: token,
          blockType: block.blockType,
          blockRole: blockRoleFor(block.blockType),
          headingLevel: headingLevelMatch ? parseInt(headingLevelMatch[1], 10) : 0,
          bold: !!run.styleState.bold,
          italic: !!run.styleState.italic,
          superscript: !!run.styleState.superscript,
          boldItalic: !!run.styleState.bold && !!run.styleState.italic,
          linkLike: !!run.linkTarget,
          scriptBucket,
          fontFamilyCandidate: fontPolicy ? fontPolicy.fontSource : "Appropriate Noto family",
          fontRole: isHeading ? "display-serif" : block.blockType === "pre" ? "monospace-fallback" : "body-serif",
          fontStyle: run.styleState.italic ? "italic" : "normal",
          fontWeight: run.styleState.bold ? "bold" : "regular",
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
    stylesList: Object.values(styleRegistry)
  };
}

module.exports = { extractStyleSignals };
