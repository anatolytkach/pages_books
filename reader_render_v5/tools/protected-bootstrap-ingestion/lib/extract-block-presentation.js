import { buildStyleContext } from "./extract-typography-styles.js";

function pickBlockPresentation(entry) {
  if (!entry || typeof entry !== "object") return null;
  const presentation = {};
  if (Number.isFinite(entry.textIndentEm)) {
    presentation.textIndentEm = entry.textIndentEm;
  }
  if (Number.isFinite(entry.marginTopEm)) {
    presentation.marginTopEm = entry.marginTopEm;
  }
  if (Number.isFinite(entry.marginBottomEm)) {
    presentation.marginBottomEm = entry.marginBottomEm;
  }
  if (entry.textAlign) {
    presentation.textAlign = entry.textAlign;
  }
  if (Number.isFinite(entry.lineHeightFactor) && entry.lineHeightFactor > 0) {
    presentation.lineHeight = entry.lineHeightFactor;
  }
  return Object.keys(presentation).length ? presentation : null;
}

function buildPresentationForBlock(block, styleContext) {
  const role = String(block && block.blockRole || "").trim();
  const headingLevel = Number.isInteger(block && block.headingLevel) ? block.headingLevel : null;
  if (headingLevel && styleContext.headings && styleContext.headings[headingLevel]) {
    return pickBlockPresentation(styleContext.headings[headingLevel]);
  }
  if (role === "list-item") {
    return pickBlockPresentation(styleContext.listItem);
  }
  if (role === "blockquote") {
    return pickBlockPresentation(styleContext.blockquote);
  }
  if (role === "figure-lead") {
    return pickBlockPresentation(styleContext.figureLead || styleContext.paragraph);
  }
  if (!role && String(block && block.sourceTag || "").trim().toLowerCase() === "p" && String(block && block.textContent || "").trim()) {
    return pickBlockPresentation(styleContext.paragraph);
  }
  return null;
}

export function extractBlockPresentation(inputRoot, logicalBlockList) {
  const blocks = Array.isArray(logicalBlockList) ? [...logicalBlockList] : [];
  if (!blocks.length) return blocks;

  const styleContext = buildStyleContext(inputRoot);

  return blocks.map((block) => {
    if (!block || typeof block !== "object") {
      return block;
    }
    const {
      sourceTag,
      sourceClassName,
      ...persistedBlock
    } = block;
    const blockPresentation = buildPresentationForBlock(block, styleContext);
    if (!blockPresentation) {
      return persistedBlock;
    }
    return {
      ...persistedBlock,
      blockPresentation
    };
  });
}
