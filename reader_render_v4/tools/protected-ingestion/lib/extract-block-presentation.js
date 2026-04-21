import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, "..", "..", "..", "..");

function resolveInputRoot(inputRoot) {
  const normalizedInputRoot = String(inputRoot || "").trim();
  if (!normalizedInputRoot) return "";
  return fs.existsSync(path.resolve(normalizedInputRoot))
    ? path.resolve(normalizedInputRoot)
    : path.resolve(REPO_ROOT, normalizedInputRoot);
}

function readStylesheet(inputRoot) {
  const resolvedInputRoot = resolveInputRoot(inputRoot);
  if (!resolvedInputRoot) return "";
  const stylesheetPath = path.join(resolvedInputRoot, "EPUB", "styles", "stylesheet1.css");
  if (!fs.existsSync(stylesheetPath)) return "";
  return fs.readFileSync(stylesheetPath, "utf8");
}

function findRuleBody(css, selector) {
  const normalizedSelector = String(selector || "").trim().toLowerCase();
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let resolvedBody = "";
  let match = rulePattern.exec(css);
  while (match) {
    const selectorList = String(match[1] || "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    if (selectorList.includes(normalizedSelector)) {
      resolvedBody = match[2] || "";
    }
    match = rulePattern.exec(css);
  }
  return resolvedBody;
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

function parseOptionalEm(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "0") return 0;
  if (/^-?\d*\.?\d+em$/.test(normalized)) {
    return Number.parseFloat(normalized);
  }
  return null;
}

function parseOptionalLineHeight(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (/^-?\d*\.?\d+$/.test(normalized)) {
    return Number.parseFloat(normalized);
  }
  if (/^-?\d*\.?\d+em$/.test(normalized)) {
    return Number.parseFloat(normalized);
  }
  return null;
}

function parseMarginTopBottom(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  const tokens = normalized.split(/\s+/).map((token) => parseOptionalEm(token));
  if (!tokens.length || tokens.some((token) => token == null)) {
    return null;
  }
  if (tokens.length === 1) {
    return { marginTopEm: tokens[0], marginBottomEm: tokens[0] };
  }
  if (tokens.length === 2) {
    return { marginTopEm: tokens[0], marginBottomEm: tokens[0] };
  }
  if (tokens.length === 3 || tokens.length === 4) {
    return { marginTopEm: tokens[0], marginBottomEm: tokens[2] };
  }
  return null;
}

function normalizeTextAlign(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  return ["left", "center", "right", "justify"].includes(normalized) ? normalized : "";
}

function buildPresentationFromDeclarations(declarations) {
  const presentation = {};

  const textIndentEm = parseOptionalEm(declarations["text-indent"]);
  if (textIndentEm != null) {
    presentation.textIndentEm = textIndentEm;
  }

  if (declarations.margin) {
    const margin = parseMarginTopBottom(declarations.margin);
    if (margin) {
      presentation.marginTopEm = margin.marginTopEm;
      presentation.marginBottomEm = margin.marginBottomEm;
    }
  }

  const marginTopEm = parseOptionalEm(declarations["margin-top"]);
  if (marginTopEm != null) {
    presentation.marginTopEm = marginTopEm;
  }

  const marginBottomEm = parseOptionalEm(declarations["margin-bottom"]);
  if (marginBottomEm != null) {
    presentation.marginBottomEm = marginBottomEm;
  }

  const textAlign = normalizeTextAlign(declarations["text-align"]);
  if (textAlign) {
    presentation.textAlign = textAlign;
  }

  const lineHeight = parseOptionalLineHeight(declarations["line-height"]);
  if (lineHeight != null) {
    presentation.lineHeight = lineHeight;
  }

  return Object.keys(presentation).length ? presentation : null;
}

function mergePresentations(...parts) {
  const merged = {};
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    for (const [key, value] of Object.entries(part)) {
      if (value != null) {
        merged[key] = value;
      }
    }
  }
  return Object.keys(merged).length ? merged : null;
}

function pickLineHeightOnly(presentation) {
  if (!presentation || presentation.lineHeight == null) return null;
  return { lineHeight: presentation.lineHeight };
}

function buildStyleContext(inputRoot) {
  const css = readStylesheet(inputRoot);
  if (!css) {
    return {
      paragraph: null,
      body: null,
      blockquote: null,
      figureLead: null
    };
  }
  return {
    paragraph: buildPresentationFromDeclarations(parseDeclarations(findRuleBody(css, "p"))),
    body: buildPresentationFromDeclarations(parseDeclarations(findRuleBody(css, "body"))),
    blockquote: buildPresentationFromDeclarations(parseDeclarations(findRuleBody(css, "blockquote"))),
    figureLead: buildPresentationFromDeclarations(parseDeclarations(findRuleBody(css, ".figure-block td > p.figure-lead"))),
    headings: {
      1: buildPresentationFromDeclarations(parseDeclarations(findRuleBody(css, "h1"))),
      2: buildPresentationFromDeclarations(parseDeclarations(findRuleBody(css, "h2"))),
      3: buildPresentationFromDeclarations(parseDeclarations(findRuleBody(css, "h3"))),
      4: buildPresentationFromDeclarations(parseDeclarations(findRuleBody(css, "h4"))),
      5: buildPresentationFromDeclarations(parseDeclarations(findRuleBody(css, "h5"))),
      6: buildPresentationFromDeclarations(parseDeclarations(findRuleBody(css, "h6")))
    }
  };
}

function buildPresentationForBlock(block, styleContext) {
  const role = String(block && block.blockRole || "").trim();
  const headingLevel = Number.isInteger(block && block.headingLevel) ? block.headingLevel : null;
  if (headingLevel && styleContext.headings && styleContext.headings[headingLevel]) {
    return mergePresentations(styleContext.headings[headingLevel], pickLineHeightOnly(styleContext.body));
  }
  if (role === "list-item") {
    return mergePresentations(styleContext.paragraph, pickLineHeightOnly(styleContext.body));
  }
  if (role === "blockquote") {
    return mergePresentations(styleContext.blockquote, pickLineHeightOnly(styleContext.body));
  }
  if (role === "figure-lead") {
    return mergePresentations(styleContext.paragraph, pickLineHeightOnly(styleContext.body), styleContext.figureLead);
  }
  if (!role && String(block && block.sourceTag || "").trim().toLowerCase() === "p" && String(block && block.textContent || "").trim()) {
    return mergePresentations(styleContext.paragraph, pickLineHeightOnly(styleContext.body));
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
