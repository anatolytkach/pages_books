function resolveTextDocUrl(manifest, sourceHref) {
  const publicRootPath = String(manifest && manifest.source && manifest.source.publicRootPath || "").trim().replace(/\/$/, "");
  const normalizedHref = String(sourceHref || "").trim().replace(/^\/+/, "");
  if (!publicRootPath || !normalizedHref) return "";
  return `${publicRootPath}/${normalizedHref}`;
}

function escapeSelectorValue(value) {
  return String(value || "").replace(/"/g, "\\\"");
}

function normalizeRunText(value) {
  return String(value || "").replace(/\s+/g, " ");
}

function extractRunsFromNode(node, activeMarks = []) {
  if (!node) return [];
  if (node.nodeType === Node.TEXT_NODE) {
    const text = normalizeRunText(node.textContent || "");
    if (!text) return [];
    return [activeMarks.length ? { text, marks: [...activeMarks] } : { text }];
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
        previous.text += childRun.text;
      } else {
        runs.push(childMarks.length ? { text: childRun.text, marks: childMarks } : { text: childRun.text });
      }
    }
  }
  return runs;
}

function trimRuns(runs) {
  const normalizedRuns = Array.isArray(runs) ? runs.map((run) => ({ ...run })) : [];
  while (normalizedRuns.length && !String(normalizedRuns[0].text || "").trim()) {
    normalizedRuns.shift();
  }
  while (normalizedRuns.length && !String(normalizedRuns[normalizedRuns.length - 1].text || "").trim()) {
    normalizedRuns.pop();
  }
  if (!normalizedRuns.length) return [];
  normalizedRuns[0].text = String(normalizedRuns[0].text || "").replace(/^\s+/, "");
  normalizedRuns[normalizedRuns.length - 1].text = String(normalizedRuns[normalizedRuns.length - 1].text || "").replace(/\s+$/, "");
  return normalizedRuns.filter((run) => String(run.text || "").length);
}

function trimLeadingNoteSeparator(runs) {
  const normalizedRuns = Array.isArray(runs) ? runs.map((run) => ({ ...run })) : [];
  if (!normalizedRuns.length) {
    return [];
  }
  normalizedRuns[0].text = String(normalizedRuns[0].text || "").replace(/^\s*[.)]\s*/, "");
  return normalizedRuns.filter((run) => String(run.text || "").length);
}

function extractNotePreviewFromDocument(html, targetAnchorId) {
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(String(html || ""), "application/xhtml+xml");
  const selector = `aside[id="${escapeSelectorValue(targetAnchorId)}"]`;
  const aside = documentNode.querySelector(selector);
  if (!aside) {
    return null;
  }
  const epubType = String(aside.getAttribute("epub:type") || "").trim();
  const role = String(aside.getAttribute("role") || "").trim();
  if (epubType !== "footnote" && role !== "doc-footnote") {
    return null;
  }
  const paragraphNodes = Array.from(aside.querySelectorAll("p"));
  const paragraphs = paragraphNodes
    .map((paragraphNode) => {
      const runs = trimLeadingNoteSeparator(trimRuns(extractRunsFromNode(paragraphNode)));
      return runs.length ? { runs } : null;
    })
    .filter(Boolean);
  const previewText = paragraphs
    .map((paragraph) => paragraph.runs.map((run) => String(run.text || "")).join("").trim())
    .filter(Boolean)
    .join("\n\n");
  if (!previewText) {
    return null;
  }
  return {
    targetAnchorId: String(targetAnchorId || "").trim(),
    previewText,
    inlinePreview: {
      paragraphs
    }
  };
}

function collectFootnoteTargets(logicalBlocks) {
  const targets = new Map();
  const blocks = Array.isArray(logicalBlocks) ? logicalBlocks : [];
  for (const block of blocks) {
    const paragraphs = Array.isArray(block && block.inlineSemantics && block.inlineSemantics.paragraphs)
      ? block.inlineSemantics.paragraphs
      : [];
    for (const paragraph of paragraphs) {
      const runs = Array.isArray(paragraph && paragraph.runs) ? paragraph.runs : [];
      for (const run of runs) {
        const anchor = run && run.anchor && typeof run.anchor === "object" ? run.anchor : null;
        if (!anchor || String(anchor.targetRole || "").trim() !== "footnote") {
          continue;
        }
        const targetSourceHref = String(anchor.targetSourceHref || "").trim();
        const targetAnchorId = String(anchor.targetAnchorId || "").trim();
        if (!targetSourceHref || !targetAnchorId) {
          continue;
        }
        const key = `${targetSourceHref}#${targetAnchorId}`;
        if (!targets.has(key)) {
          targets.set(key, {
            targetSourceHref,
            targetAnchorId
          });
        }
      }
    }
  }
  return Array.from(targets.values());
}

export async function resolveFootnotePreviews(manifest, logicalBlocks) {
  const targets = collectFootnoteTargets(logicalBlocks);
  if (!targets.length) {
    return {
      totalRefs: 0,
      uniqueTargets: 0,
      resolvedTargets: 0,
      resolvedRefs: 0,
      targets: [],
      previewMap: {}
    };
  }

  const refs = [];
  for (const block of Array.isArray(logicalBlocks) ? logicalBlocks : []) {
    const paragraphs = Array.isArray(block && block.inlineSemantics && block.inlineSemantics.paragraphs)
      ? block.inlineSemantics.paragraphs
      : [];
    for (const paragraph of paragraphs) {
      const runs = Array.isArray(paragraph && paragraph.runs) ? paragraph.runs : [];
      for (const run of runs) {
        const anchor = run && run.anchor && typeof run.anchor === "object" ? run.anchor : null;
        if (!anchor || String(anchor.targetRole || "").trim() !== "footnote") continue;
        refs.push(anchor);
      }
    }
  }

  const bySourceDoc = new Map();
  for (const target of targets) {
    const targetSourceHref = String(target.targetSourceHref || "").trim();
    if (!bySourceDoc.has(targetSourceHref)) {
      bySourceDoc.set(targetSourceHref, []);
    }
    bySourceDoc.get(targetSourceHref).push(target);
  }

  const previewMap = {};
  for (const [targetSourceHref, docTargets] of bySourceDoc.entries()) {
    const url = resolveTextDocUrl(manifest, targetSourceHref);
    if (!url) {
      continue;
    }
    let html = "";
    try {
      const response = await fetch(url, { credentials: "same-origin" });
      if (!response.ok) {
        continue;
      }
      html = await response.text();
    } catch (_error) {
      continue;
    }
    for (const target of docTargets) {
      const preview = extractNotePreviewFromDocument(html, target.targetAnchorId);
      if (!preview) {
        continue;
      }
      const key = `${targetSourceHref}#${target.targetAnchorId}`;
      previewMap[key] = {
        targetSourceHref,
        targetAnchorId: target.targetAnchorId,
        targetRole: "footnote",
        previewText: preview.previewText,
        inlinePreview: preview.inlinePreview
      };
    }
  }

  const resolvedTargets = Object.keys(previewMap).length;
  const resolvedRefs = refs.filter((anchor) => previewMap[`${anchor.targetSourceHref}#${anchor.targetAnchorId}`]).length;
  return {
    totalRefs: refs.length,
    uniqueTargets: targets.length,
    resolvedTargets,
    resolvedRefs,
    targets,
    previewMap
  };
}
