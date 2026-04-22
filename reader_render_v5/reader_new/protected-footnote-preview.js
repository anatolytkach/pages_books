const FOOTNOTE_DOC_CACHE = new Map();

function resolveFootnoteDocUrl(sourcePublicRootPath, targetSourceHref) {
  const root = String(sourcePublicRootPath || "").trim().replace(/\/$/, "");
  const href = String(targetSourceHref || "").trim().replace(/^\/+/, "");
  if (!root || !href) return "";
  return `${root}/${href}`;
}

function escapeSelectorValue(value) {
  return String(value || "").replace(/"/g, "\\\"");
}

function normalizeRunContent(value) {
  return String(value || "").replace(/\s+/g, " ");
}

function extractRunsFromNode(node, activeMarks = []) {
  if (!node) return [];
  if (node.nodeType === Node.TEXT_NODE) {
    const content = normalizeRunContent(node.textContent || "");
    if (!content) return [];
    return [activeMarks.length ? { content, marks: [...activeMarks] } : { content }];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return [];
  }
  const tagName = String(node.tagName || "").toLowerCase();
  if (tagName === "a" && /\bfootnote-back\b/.test(String(node.getAttribute("class") || ""))) {
    return [];
  }
  const nextMarks = [...activeMarks];
  if (tagName === "em" || tagName === "strong" || tagName === "sup") {
    nextMarks.push(tagName);
  }
  const runs = [];
  for (const childNode of Array.from(node.childNodes || [])) {
    const childRuns = extractRunsFromNode(childNode, nextMarks);
    for (const childRun of childRuns) {
      const previous = runs[runs.length - 1] || null;
      const previousMarks = Array.isArray(previous && previous.marks) ? previous.marks : [];
      const childMarks = Array.isArray(childRun && childRun.marks) ? childRun.marks : [];
      if (
        previous &&
        previousMarks.length === childMarks.length &&
        previousMarks.every((mark, index) => mark === childMarks[index])
      ) {
        previous.content += childRun.content;
      } else {
        runs.push(childMarks.length ? { content: childRun.content, marks: childMarks } : { content: childRun.content });
      }
    }
  }
  return runs;
}

function trimRuns(runs) {
  const normalizedRuns = Array.isArray(runs) ? runs.map((run) => ({ ...run })) : [];
  while (normalizedRuns.length && !String(normalizedRuns[0].content || "").trim()) {
    normalizedRuns.shift();
  }
  while (normalizedRuns.length && !String(normalizedRuns[normalizedRuns.length - 1].content || "").trim()) {
    normalizedRuns.pop();
  }
  if (!normalizedRuns.length) return [];
  normalizedRuns[0].content = String(normalizedRuns[0].content || "").replace(/^\s+/, "");
  normalizedRuns[normalizedRuns.length - 1].content = String(normalizedRuns[normalizedRuns.length - 1].content || "").replace(/\s+$/, "");
  return normalizedRuns.filter((run) => String(run.content || "").length);
}

function trimLeadingNoteSeparator(runs) {
  const normalizedRuns = Array.isArray(runs) ? runs.map((run) => ({ ...run })) : [];
  if (!normalizedRuns.length) return [];
  normalizedRuns[0].content = String(normalizedRuns[0].content || "").replace(/^\s*(?:\d+\s*[.)]?\s*|[.)]+\s*)/, "");
  return normalizedRuns.filter((run) => String(run.content || "").length);
}

function extractFootnotePreviewFromHtml(html, targetAnchorId) {
  if (typeof DOMParser === "undefined") return null;
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(String(html || ""), "application/xhtml+xml");
  const selector = `aside[id="${escapeSelectorValue(targetAnchorId)}"]`;
  const aside = documentNode.querySelector(selector);
  if (!aside) return null;
  const epubType = String(aside.getAttribute("epub:type") || "").trim();
  const role = String(aside.getAttribute("role") || "").trim();
  if (epubType !== "footnote" && role !== "doc-footnote") {
    return null;
  }
  const paragraphs = Array.from(aside.querySelectorAll("p"))
    .map((paragraphNode) => {
      const runs = trimLeadingNoteSeparator(trimRuns(extractRunsFromNode(paragraphNode)));
      return runs.length ? { runs } : null;
    })
    .filter(Boolean);
  if (!paragraphs.length) return null;
  return {
    targetAnchorId: String(targetAnchorId || "").trim(),
    paragraphs
  };
}

async function fetchFootnoteDoc(url) {
  if (FOOTNOTE_DOC_CACHE.has(url)) return FOOTNOTE_DOC_CACHE.get(url);
  const promise = fetch(url, { credentials: "same-origin" })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Footnote source request failed (${response.status}).`);
      }
      return response.text();
    })
    .catch((error) => {
      FOOTNOTE_DOC_CACHE.delete(url);
      throw error;
    });
  FOOTNOTE_DOC_CACHE.set(url, promise);
  return promise;
}

export async function loadProtectedFootnotePreview({
  sourcePublicRootPath,
  targetSourceHref,
  targetAnchorId
} = {}) {
  const url = resolveFootnoteDocUrl(sourcePublicRootPath, targetSourceHref);
  if (!url || !targetAnchorId) return null;
  const html = await fetchFootnoteDoc(url);
  const preview = extractFootnotePreviewFromHtml(html, targetAnchorId);
  if (!preview) return null;
  return {
    sourceUrl: url,
    targetSourceHref: String(targetSourceHref || "").trim(),
    targetAnchorId: String(targetAnchorId || "").trim(),
    paragraphs: preview.paragraphs
  };
}
