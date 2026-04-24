import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  PROTECTED_V4_STRUCTURAL_INLINE_ANCHOR_ROLES,
  PROTECTED_V4_STRUCTURAL_INLINE_MARKS,
  PROTECTED_V4_STRUCTURAL_INLINE_TARGET_ROLES
} from "./protected-structural-contract.js";

const INLINE_MARK_SET = new Set(PROTECTED_V4_STRUCTURAL_INLINE_MARKS);
const INLINE_ANCHOR_ROLE_SET = new Set(PROTECTED_V4_STRUCTURAL_INLINE_ANCHOR_ROLES);
const INLINE_TARGET_ROLE_SET = new Set(PROTECTED_V4_STRUCTURAL_INLINE_TARGET_ROLES);
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, "..", "..", "..", "..");
const NOTE_TARGET_CACHE = new Map();

export function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

export function stripHtmlToText(value) {
  return decodeEntities(String(value || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRunText(value) {
  return decodeEntities(value).replace(/\s+/g, " ");
}

function normalizePath(value) {
  return String(value || "").trim().replace(/\\/g, "/");
}

function resolveInputRoot(inputRoot) {
  const normalizedInputRoot = String(inputRoot || "").trim();
  if (!normalizedInputRoot) return "";
  return fs.existsSync(path.resolve(normalizedInputRoot))
    ? path.resolve(normalizedInputRoot)
    : path.resolve(REPO_ROOT, normalizedInputRoot);
}

function parseAttributes(tagOpen) {
  const attrs = {};
  const attrPattern = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match = attrPattern.exec(String(tagOpen || ""));
  while (match) {
    attrs[match[1]] = match[2] ?? match[3] ?? "";
    match = attrPattern.exec(String(tagOpen || ""));
  }
  return attrs;
}

function normalizeMarks(marks) {
  const set = new Set(Array.isArray(marks) ? marks : []);
  return PROTECTED_V4_STRUCTURAL_INLINE_MARKS.filter((mark) => set.has(mark));
}

function normalizeAnchor(anchor) {
  if (!anchor || typeof anchor !== "object") return null;
  const normalized = {};
  const anchorRole = String(anchor.anchorRole || "").trim();
  if (INLINE_ANCHOR_ROLE_SET.has(anchorRole)) {
    normalized.anchorRole = anchorRole;
  }
  const href = String(anchor.href || "").trim();
  if (href) {
    normalized.href = href;
  }
  const sourceAnchorId = String(anchor.sourceAnchorId || "").trim();
  if (sourceAnchorId) {
    normalized.sourceAnchorId = sourceAnchorId;
  }
  const targetSourceHref = String(anchor.targetSourceHref || "").trim();
  if (targetSourceHref) {
    normalized.targetSourceHref = targetSourceHref;
  }
  const targetAnchorId = String(anchor.targetAnchorId || "").trim();
  if (targetAnchorId) {
    normalized.targetAnchorId = targetAnchorId;
  }
  const targetRole = String(anchor.targetRole || "").trim();
  if (INLINE_TARGET_ROLE_SET.has(targetRole)) {
    normalized.targetRole = targetRole;
  }
  return Object.keys(normalized).length ? normalized : null;
}

function anchorsEqual(left, right) {
  const normalizedLeft = normalizeAnchor(left);
  const normalizedRight = normalizeAnchor(right);
  if (!normalizedLeft && !normalizedRight) return true;
  if (!normalizedLeft || !normalizedRight) return false;
  const leftKeys = Object.keys(normalizedLeft).sort();
  const rightKeys = Object.keys(normalizedRight).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key, index) => key === rightKeys[index] && normalizedLeft[key] === normalizedRight[key]);
}

function appendRun(runs, text, marks, anchor) {
  const normalizedText = normalizeRunText(text);
  if (!normalizedText) return;
  const normalizedMarks = normalizeMarks(marks);
  const normalizedAnchor = normalizeAnchor(anchor);
  const previous = runs[runs.length - 1] || null;
  const previousMarks = normalizeMarks(previous && previous.marks);
  if (
    previous &&
    previousMarks.length === normalizedMarks.length &&
    previousMarks.every((mark, index) => mark === normalizedMarks[index]) &&
    anchorsEqual(previous && previous.anchor, normalizedAnchor)
  ) {
    previous.text += normalizedText;
    return;
  }
  const run = normalizedMarks.length ? { text: normalizedText, marks: normalizedMarks } : { text: normalizedText };
  if (normalizedAnchor) {
    run.anchor = normalizedAnchor;
  }
  runs.push(run);
}

function trimRuns(runs) {
  const normalizedRuns = Array.isArray(runs) ? runs.map((run) => ({ ...run })) : [];
  while (normalizedRuns.length && !String(normalizedRuns[0].text || "").trim()) {
    normalizedRuns.shift();
  }
  while (normalizedRuns.length && !String(normalizedRuns[normalizedRuns.length - 1].text || "").trim()) {
    normalizedRuns.pop();
  }
  if (!normalizedRuns.length) {
    return [];
  }
  normalizedRuns[0].text = String(normalizedRuns[0].text || "").replace(/^\s+/, "");
  normalizedRuns[normalizedRuns.length - 1].text = String(normalizedRuns[normalizedRuns.length - 1].text || "").replace(/\s+$/, "");
  return normalizedRuns.filter((run) => String(run.text || "").length);
}

function buildNoteTargetIndex(inputRoot) {
  const resolvedInputRoot = resolveInputRoot(inputRoot);
  if (!resolvedInputRoot) {
    return new Map();
  }
  if (NOTE_TARGET_CACHE.has(resolvedInputRoot)) {
    return NOTE_TARGET_CACHE.get(resolvedInputRoot);
  }
  const index = new Map();
  const notesDir = path.join(resolvedInputRoot, "EPUB", "text");
  if (!fs.existsSync(notesDir)) {
    NOTE_TARGET_CACHE.set(resolvedInputRoot, index);
    return index;
  }
  const entries = fs.readdirSync(notesDir)
    .filter((entry) => /^notes-.*\.xhtml$/i.test(entry))
    .sort();
  for (const entry of entries) {
    const filePath = path.join(notesDir, entry);
    const xhtml = fs.readFileSync(filePath, "utf8");
    const sourceHref = normalizePath(path.relative(resolvedInputRoot, filePath));
    const asidePattern = /<aside\b([^>]*)>/gi;
    let match = asidePattern.exec(xhtml);
    while (match) {
      const attrs = parseAttributes(match[1]);
      const id = String(attrs.id || "").trim();
      if (!id) {
        match = asidePattern.exec(xhtml);
        continue;
      }
      const epubType = String(attrs["epub:type"] || "").trim();
      const role = String(attrs.role || "").trim();
      if (epubType === "footnote" || role === "doc-footnote") {
        index.set(`${sourceHref}#${id}`, {
          targetSourceHref: sourceHref,
          targetAnchorId: id,
          targetRole: "footnote"
        });
      }
      match = asidePattern.exec(xhtml);
    }
  }
  NOTE_TARGET_CACHE.set(resolvedInputRoot, index);
  return index;
}

function resolveAnchorTarget(sourceHref, href) {
  const normalizedHref = String(href || "").trim();
  if (!normalizedHref) return null;
  const hashIndex = normalizedHref.indexOf("#");
  const hrefPart = hashIndex === -1 ? normalizedHref : normalizedHref.slice(0, hashIndex);
  const anchorId = hashIndex === -1 ? "" : normalizedHref.slice(hashIndex + 1);
  const targetSourceHref = hrefPart
    ? normalizePath(path.posix.normalize(path.posix.join(path.posix.dirname(sourceHref), hrefPart)))
    : String(sourceHref || "").trim();
  return {
    targetSourceHref: targetSourceHref || "",
    targetAnchorId: String(anchorId || "").trim()
  };
}

function buildAnchor(attrs, context) {
  const href = String(attrs.href || "").trim();
  const sourceAnchorId = String(attrs.id || "").trim();
  if (!href && !sourceAnchorId) {
    return null;
  }
  const className = String(attrs.class || "").trim();
  const epubType = String(attrs["epub:type"] || "").trim();
  const role = String(attrs.role || "").trim();
  const sourceHref = String(context && context.sourceHref || "").trim();
  const anchor = {
    href,
    sourceAnchorId,
    anchorRole: /\bfootnote-ref\b/.test(className) || epubType === "noteref" || role === "doc-noteref"
      ? "footnote-ref"
      : "inline-link"
  };
  const target = resolveAnchorTarget(sourceHref, href);
  if (target && target.targetSourceHref) {
    anchor.targetSourceHref = target.targetSourceHref;
  }
  if (target && target.targetAnchorId) {
    anchor.targetAnchorId = target.targetAnchorId;
  }
  if (anchor.anchorRole === "footnote-ref" && target && target.targetSourceHref && target.targetAnchorId) {
    const noteTargetIndex = buildNoteTargetIndex(context && context.inputRoot);
    const noteTarget = noteTargetIndex.get(`${target.targetSourceHref}#${target.targetAnchorId}`) || null;
    if (noteTarget && noteTarget.targetRole) {
      anchor.targetRole = noteTarget.targetRole;
    }
  }
  return normalizeAnchor(anchor);
}

function extractRunsFromInlineHtml(html, context) {
  const tokenPattern = /<[^>]+>|[^<]+/g;
  const runs = [];
  const markStack = [];
  const anchorStack = [];
  let match = tokenPattern.exec(String(html || ""));
  while (match) {
    const token = match[0];
    if (token.startsWith("<")) {
      const closingMatch = /^<\s*\/\s*([a-zA-Z0-9]+)[^>]*>/.exec(token);
      if (closingMatch) {
        const closingTag = String(closingMatch[1] || "").trim().toLowerCase();
        if (closingTag === "a" && anchorStack.length) {
          anchorStack.pop();
        }
        for (let index = markStack.length - 1; index >= 0; index -= 1) {
          if (markStack[index] === closingTag) {
            markStack.splice(index, 1);
            break;
          }
        }
        match = tokenPattern.exec(String(html || ""));
        continue;
      }
      const openingMatch = /^<\s*([a-zA-Z0-9]+)\b[^>]*>/.exec(token);
      if (openingMatch) {
        const openingTag = String(openingMatch[1] || "").trim().toLowerCase();
        const selfClosing = /\/\s*>$/.test(token);
        if (INLINE_MARK_SET.has(openingTag) && !selfClosing) {
          markStack.push(openingTag);
        }
        if (openingTag === "a" && !selfClosing) {
          const anchor = buildAnchor(parseAttributes(token), context);
          anchorStack.push(anchor);
        }
      }
      match = tokenPattern.exec(String(html || ""));
      continue;
    }
    appendRun(runs, token, markStack, anchorStack[anchorStack.length - 1] || null);
    match = tokenPattern.exec(String(html || ""));
  }
  return trimRuns(runs);
}

export function extractInlineTextFromParagraphHtmlList(paragraphHtmlList, context = {}) {
  const paragraphs = Array.isArray(paragraphHtmlList) ? paragraphHtmlList : [];
  const normalizedParagraphs = [];
  let hasInlineSemantics = false;

  for (const paragraphHtml of paragraphs) {
    const runs = extractRunsFromInlineHtml(paragraphHtml, context);
    const textContent = runs.map((run) => String(run.text || "")).join("").trim();
    if (!textContent) {
      continue;
    }
    if (runs.some((run) => (
      (Array.isArray(run.marks) && run.marks.length) ||
      (run.anchor && typeof run.anchor === "object")
    ))) {
      hasInlineSemantics = true;
    }
    normalizedParagraphs.push({
      textContent,
      runs
    });
  }

  if (!normalizedParagraphs.length) {
    return {
      textContent: "",
      inlineSemantics: null
    };
  }

  return {
    textContent: normalizedParagraphs.map((paragraph) => paragraph.textContent).join("\n\n"),
    inlineSemantics: hasInlineSemantics
      ? {
        paragraphs: normalizedParagraphs.map((paragraph) => ({
          runs: paragraph.runs.map((run) => {
            const normalizedRun = Array.isArray(run.marks) && run.marks.length
              ? { text: run.text, marks: [...run.marks] }
              : { text: run.text };
            if (run.anchor && typeof run.anchor === "object") {
              normalizedRun.anchor = { ...run.anchor };
            }
            return normalizedRun;
          })
        }))
      }
      : null
  };
}
