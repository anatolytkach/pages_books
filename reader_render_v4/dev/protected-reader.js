import { loadProtectedBook } from "../runtime/protected-book-model.js";

const ARTIFACT_ROOT_PREFIX = "/books/protected-content-v4/";
let cleanupPaginatedReadingSurface = null;
const SHELL_MENU_SVG = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M4 6.5h16"></path>
    <path d="M4 12h16"></path>
    <path d="M4 17.5h16"></path>
  </svg>
`;
const SHELL_BOOKMARK_SVG = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M7 4.5h10v15l-5-3-5 3z"></path>
  </svg>
`;

function getArtifactBookId() {
  const params = new URLSearchParams(globalThis.location && globalThis.location.search || "");
  return String(params.get("artifactBookId") || "").trim();
}

function getQueryCoverUrl() {
  const params = new URLSearchParams(globalThis.location && globalThis.location.search || "");
  return String(params.get("cover") || "").trim();
}

function renderScreen(html) {
  const mount = document.getElementById("v4-reader-status");
  if (!mount) return;
  mount.innerHTML = html;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "unset";
}

function formatEm(value) {
  return typeof value === "number" && Number.isFinite(value) ? `${value}em` : "";
}

function buildBlockPresentationStyle(presentation) {
  if (!presentation || typeof presentation !== "object") return "";
  const styles = [];
  if (typeof presentation.textIndentEm === "number" && Number.isFinite(presentation.textIndentEm)) {
    styles.push(`text-indent:${presentation.textIndentEm}em`);
  }
  if (typeof presentation.marginTopEm === "number" && Number.isFinite(presentation.marginTopEm)) {
    styles.push(`margin-top:${presentation.marginTopEm}em`);
  }
  if (typeof presentation.marginBottomEm === "number" && Number.isFinite(presentation.marginBottomEm)) {
    styles.push(`margin-bottom:${presentation.marginBottomEm}em`);
  }
  if (typeof presentation.lineHeight === "number" && Number.isFinite(presentation.lineHeight)) {
    styles.push(`line-height:${presentation.lineHeight}`);
  }
  const textAlign = String(presentation.textAlign || "").trim();
  if (textAlign) {
    styles.push(`text-align:${textAlign}`);
  }
  return styles.join(";");
}

function buildBlockquoteStyle(block) {
  const presentation = block && block.blockPresentation && typeof block.blockPresentation === "object"
    ? { ...block.blockPresentation }
    : {};
  const quotePresentation = block && block.blockquotePresentation && typeof block.blockquotePresentation === "object"
    ? block.blockquotePresentation
    : null;
  if (quotePresentation && quotePresentation.suppressTextIndent) {
    presentation.textIndentEm = 0;
  }
  return buildBlockPresentationStyle(presentation);
}

function renderInlineRuns(runs) {
  const normalizedRuns = Array.isArray(runs) ? runs : [];
  return normalizedRuns.map((run) => {
    let html = escapeHtml(run && run.text || "");
    const marks = Array.isArray(run && run.marks) ? run.marks : [];
    for (const mark of marks) {
      if (mark === "em" || mark === "strong" || mark === "sup") {
        html = `<${mark}>${html}</${mark}>`;
      }
    }
    const anchor = run && run.anchor && typeof run.anchor === "object" ? run.anchor : null;
    if (anchor) {
      const classNames = ["v4-reading-inline-anchor"];
      if (anchor.anchorRole === "footnote-ref") {
        classNames.push("v4-reading-footnote-ref");
      } else {
        classNames.push("v4-reading-inline-link");
      }
      const targetParts = [];
      if (anchor.targetSourceHref) {
        targetParts.push(anchor.targetSourceHref);
      }
      if (anchor.targetAnchorId) {
        targetParts.push(`#${anchor.targetAnchorId}`);
      }
      const title = targetParts.length ? targetParts.join("") : (anchor.href || "");
      const footnoteKey = anchor.targetSourceHref && anchor.targetAnchorId
        ? `${anchor.targetSourceHref}#${anchor.targetAnchorId}`
        : "";
      if (anchor.anchorRole === "footnote-ref") {
        html = `<button type="button" class="${classNames.join(" ")}" data-anchor-role="${escapeHtml(anchor.anchorRole || "")}" data-href="${escapeHtml(anchor.href || "")}" data-target-source-href="${escapeHtml(anchor.targetSourceHref || "")}" data-target-anchor-id="${escapeHtml(anchor.targetAnchorId || "")}" data-target-role="${escapeHtml(anchor.targetRole || "")}" data-footnote-key="${escapeHtml(footnoteKey)}"${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</button>`;
      } else {
        html = `<span class="${classNames.join(" ")}" data-anchor-role="${escapeHtml(anchor.anchorRole || "")}" data-href="${escapeHtml(anchor.href || "")}" data-target-source-href="${escapeHtml(anchor.targetSourceHref || "")}" data-target-anchor-id="${escapeHtml(anchor.targetAnchorId || "")}" data-target-role="${escapeHtml(anchor.targetRole || "")}"${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</span>`;
      }
    }
    return html;
  }).join("");
}

function renderRichTextParagraphs(text, inlineSemantics, className, style) {
  const semanticParagraphs = inlineSemantics && Array.isArray(inlineSemantics.paragraphs)
    ? inlineSemantics.paragraphs
      .map((paragraph) => {
        const html = renderInlineRuns(paragraph && paragraph.runs);
        return html ? `<p class="${className}"${style ? ` style="${escapeHtml(style)}"` : ""}>${html}</p>` : "";
      })
      .filter(Boolean)
    : [];
  if (semanticParagraphs.length) {
    return semanticParagraphs.join("");
  }
  const paragraphs = String(text || "")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!paragraphs.length) {
    return "";
  }
  return paragraphs.map((paragraph) => `<p class="${className}"${style ? ` style="${escapeHtml(style)}"` : ""}>${escapeHtml(paragraph)}</p>`).join("");
}

function cloneAnchor(anchor) {
  if (!anchor || typeof anchor !== "object") return null;
  const cloned = {};
  for (const field of ["anchorRole", "href", "sourceAnchorId", "targetSourceHref", "targetAnchorId", "targetRole"]) {
    const value = String(anchor[field] || "").trim();
    if (value) {
      cloned[field] = value;
    }
  }
  return Object.keys(cloned).length ? cloned : null;
}

function cloneRun(run) {
  if (!run || typeof run !== "object") return null;
  const text = String(run.text || "");
  if (!text) return null;
  const cloned = { text };
  const marks = Array.isArray(run.marks)
    ? run.marks.map((mark) => String(mark || "").trim()).filter(Boolean)
    : [];
  if (marks.length) {
    cloned.marks = marks;
  }
  const anchor = cloneAnchor(run.anchor);
  if (anchor) {
    cloned.anchor = anchor;
  }
  return cloned;
}

function normalizeRichTextParagraphs(text, inlineSemantics) {
  const semanticParagraphs = inlineSemantics && Array.isArray(inlineSemantics.paragraphs)
    ? inlineSemantics.paragraphs
      .map((paragraph) => {
        const runs = Array.isArray(paragraph && paragraph.runs)
          ? paragraph.runs.map((run) => cloneRun(run)).filter(Boolean)
          : [];
        return runs.length ? { runs } : null;
      })
      .filter(Boolean)
    : [];
  if (semanticParagraphs.length) {
    return semanticParagraphs;
  }
  return String(text || "")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((paragraph) => ({
      runs: [{ text: paragraph }]
    }));
}

function splitTextIntoPieces(text) {
  return String(text || "")
    .split(/(\s+)/)
    .filter((piece) => piece.length > 0);
}

function sameAnchor(left, right) {
  const leftValue = left && typeof left === "object" ? left : null;
  const rightValue = right && typeof right === "object" ? right : null;
  const fields = ["anchorRole", "href", "sourceAnchorId", "targetSourceHref", "targetAnchorId", "targetRole"];
  return fields.every((field) => String(leftValue && leftValue[field] || "") === String(rightValue && rightValue[field] || ""));
}

function buildRichTextSource(text, inlineSemantics) {
  const paragraphs = normalizeRichTextParagraphs(text, inlineSemantics);
  const paragraphPieces = [];
  let pieceCount = 0;
  for (const paragraph of paragraphs) {
    const pieces = [];
    for (const run of paragraph.runs) {
      const textPieces = splitTextIntoPieces(run.text);
      for (const pieceText of textPieces) {
        pieces.push({
          text: pieceText,
          marks: Array.isArray(run.marks) ? run.marks.slice() : [],
          anchor: cloneAnchor(run.anchor)
        });
        pieceCount += 1;
      }
    }
    paragraphPieces.push({ pieces });
  }
  return {
    paragraphs: paragraphPieces,
    pieceCount
  };
}

function sliceRichTextSource(source, startPiece, endPiece) {
  const normalizedSource = source && typeof source === "object" ? source : { paragraphs: [], pieceCount: 0 };
  const totalPieces = Number.isInteger(normalizedSource.pieceCount) ? normalizedSource.pieceCount : 0;
  const clampedStart = Math.max(0, Math.min(startPiece, totalPieces));
  const clampedEnd = Math.max(clampedStart, Math.min(endPiece, totalPieces));
  const slicedParagraphs = [];
  let cursor = 0;

  for (const paragraph of Array.isArray(normalizedSource.paragraphs) ? normalizedSource.paragraphs : []) {
    const paragraphRuns = [];
    const pieces = Array.isArray(paragraph && paragraph.pieces) ? paragraph.pieces : [];
    for (const piece of pieces) {
      const nextCursor = cursor + 1;
      if (nextCursor > clampedStart && cursor < clampedEnd) {
        const previousRun = paragraphRuns[paragraphRuns.length - 1] || null;
        const sameMarks = JSON.stringify(previousRun && previousRun.marks || []) === JSON.stringify(Array.isArray(piece.marks) ? piece.marks : []);
        const sameAnchorValue = sameAnchor(previousRun && previousRun.anchor, piece.anchor);
        if (previousRun && sameMarks && sameAnchorValue) {
          previousRun.text += piece.text;
        } else {
          const nextRun = { text: piece.text };
          if (Array.isArray(piece.marks) && piece.marks.length) {
            nextRun.marks = piece.marks.slice();
          }
          const anchor = cloneAnchor(piece.anchor);
          if (anchor) {
            nextRun.anchor = anchor;
          }
          paragraphRuns.push(nextRun);
        }
      }
      cursor = nextCursor;
    }
    if (paragraphRuns.some((run) => String(run.text || "").trim())) {
      slicedParagraphs.push({ runs: paragraphRuns });
    }
  }

  return {
    paragraphs: slicedParagraphs,
    pieceCount: Math.max(0, clampedEnd - clampedStart)
  };
}

function mergeRichTextSources(sources) {
  const merged = { paragraphs: [], pieceCount: 0 };
  const normalizedSources = Array.isArray(sources) ? sources : [];
  for (const source of normalizedSources) {
    const nextSource = source && typeof source === "object" ? source : null;
    if (!nextSource || !Array.isArray(nextSource.paragraphs) || !nextSource.paragraphs.length) continue;
    for (const paragraph of nextSource.paragraphs) {
      const runs = Array.isArray(paragraph && paragraph.runs)
        ? paragraph.runs.map((run) => cloneRun(run)).filter(Boolean)
        : [];
      if (!runs.length) continue;
      merged.paragraphs.push({ runs });
    }
    merged.pieceCount += Number.isInteger(nextSource.pieceCount) ? nextSource.pieceCount : 0;
  }
  return merged;
}

function renderRichParagraphSource(paragraphSource, className, style) {
  const paragraphs = paragraphSource && Array.isArray(paragraphSource.paragraphs) ? paragraphSource.paragraphs : [];
  if (!paragraphs.length) return "";
  return paragraphs.map((paragraph) => {
    const html = renderInlineRuns(paragraph && paragraph.runs);
    return html ? `<p class="${className}"${style ? ` style="${escapeHtml(style)}"` : ""}>${html}</p>` : "";
  }).filter(Boolean).join("");
}

function getDiagnosticImageStyle(media) {
  if (!media || typeof media !== "object") return "";
  const role = String(media.mediaRole || "").trim();
  if (role === "inline-avatar") {
    const width = typeof media.preferredRenderWidthPx === "number" && media.preferredRenderWidthPx > 0
      ? media.preferredRenderWidthPx
      : (typeof media.intrinsicWidthPx === "number" && media.intrinsicWidthPx > 0 ? media.intrinsicWidthPx : 24);
    const height = typeof media.preferredRenderHeightPx === "number" && media.preferredRenderHeightPx > 0
      ? media.preferredRenderHeightPx
      : (typeof media.intrinsicHeightPx === "number" && media.intrinsicHeightPx > 0 ? media.intrinsicHeightPx : 24);
    return `width:${width}px;height:${height}px;`;
  }
  const width = typeof media.preferredRenderWidthPx === "number" && media.preferredRenderWidthPx > 0
    ? media.preferredRenderWidthPx
    : (typeof media.intrinsicWidthPx === "number" && media.intrinsicWidthPx > 0 ? media.intrinsicWidthPx : 0);
  const height = typeof media.preferredRenderHeightPx === "number" && media.preferredRenderHeightPx > 0
    ? media.preferredRenderHeightPx
    : (typeof media.intrinsicHeightPx === "number" && media.intrinsicHeightPx > 0 ? media.intrinsicHeightPx : 0);
  const styleParts = [];
  if (width > 0) {
    styleParts.push(`width:${Math.min(width, 280)}px`);
  }
  if (height > 0 && width <= 0) {
    styleParts.push(`height:${Math.min(height, 220)}px`);
  }
  return styleParts.join(";");
}

function getFigureImagePresentation(media) {
  if (!media || typeof media !== "object") {
    return {
      style: "",
      aspect: "unknown",
      source: "unset"
    };
  }
  const width = typeof media.preferredRenderWidthPx === "number" && media.preferredRenderWidthPx > 0
    ? media.preferredRenderWidthPx
    : (typeof media.intrinsicWidthPx === "number" && media.intrinsicWidthPx > 0 ? media.intrinsicWidthPx : 0);
  const height = typeof media.preferredRenderHeightPx === "number" && media.preferredRenderHeightPx > 0
    ? media.preferredRenderHeightPx
    : (typeof media.intrinsicHeightPx === "number" && media.intrinsicHeightPx > 0 ? media.intrinsicHeightPx : 0);
  const hasPreferred = typeof media.preferredRenderWidthPx === "number" && media.preferredRenderWidthPx > 0
    && typeof media.preferredRenderHeightPx === "number" && media.preferredRenderHeightPx > 0;
  const source = hasPreferred ? "preferred" : "intrinsic";
  if (width <= 0 || height <= 0) {
    return {
      style: getDiagnosticImageStyle(media),
      aspect: "unknown",
      source
    };
  }
  const ratio = width / height;
  const aspect = ratio >= 1.2 ? "landscape" : (ratio <= 0.82 ? "portrait" : "square");
  let maxWidth = 420;
  let maxHeight = 420;
  if (aspect === "landscape") {
    maxWidth = 460;
    maxHeight = 320;
  } else if (aspect === "portrait") {
    maxWidth = 320;
    maxHeight = 440;
  } else {
    maxWidth = 380;
    maxHeight = 380;
  }
  const styleParts = [`width:${Math.min(width, maxWidth)}px`];
  styleParts.push(`max-height:${Math.min(height, maxHeight)}px`);
  return {
    style: styleParts.join(";"),
    aspect,
    source
  };
}

function renderMediaPreview(block, media) {
  if (!media || !media.assetUrl) {
    return `<div class="v4-diagnostic-preview v4-diagnostic-preview-empty">No asset URL</div>`;
  }
  const role = String(media.mediaRole || "").trim();
    const previewClass = role === "inline-avatar"
    ? "v4-diagnostic-preview v4-diagnostic-preview-avatar"
    : (role === "separator-image"
      ? "v4-diagnostic-preview v4-diagnostic-preview-separator"
      : "v4-diagnostic-preview v4-diagnostic-preview-content");
  const style = getDiagnosticImageStyle(media);
  return `<div class="${previewClass}">
    <img
      class="v4-diagnostic-image"
      src="${escapeHtml(media.assetUrl)}"
      alt="${escapeHtml(`${role || "media"} sample from ${block.blockId || "unknown block"}`)}"
      ${style ? `style="${escapeHtml(style)}"` : ""}
    />
  </div>`;
}

function renderMediaSamples(samples, emptyLabel) {
  const items = Array.isArray(samples) ? samples : [];
  if (!items.length) {
    return `<p class="v4-diagnostic-empty">${escapeHtml(emptyLabel)}</p>`;
  }
  return `<div class="v4-diagnostic-list">${items.map((block) => {
    const media = Array.isArray(block.mediaItems) ? block.mediaItems[0] : null;
    return `<div class="v4-diagnostic-item">
      ${renderMediaPreview(block, media)}
      <div><strong>blockId</strong> ${escapeHtml(block.blockId || "")}</div>
      <div><strong>source</strong> ${escapeHtml(block.sourceHref || "")}</div>
      <div><strong>role</strong> ${escapeHtml(media && media.mediaRole || "")}</div>
      <div><strong>resolvedHref</strong> ${escapeHtml(media && media.resolvedHref || "")}</div>
      <div><strong>assetUrl</strong> ${escapeHtml(media && media.assetUrl || "unset")}</div>
      <div><strong>intrinsic</strong> ${escapeHtml(`${formatNumber(media && media.intrinsicWidthPx)} × ${formatNumber(media && media.intrinsicHeightPx)}`)}</div>
      <div><strong>preferred</strong> ${escapeHtml(`${formatNumber(media && media.preferredRenderWidthPx)} × ${formatNumber(media && media.preferredRenderHeightPx)}`)}</div>
      <div><strong>placement</strong> ${escapeHtml(media && media.placement || "unset")}</div>
    </div>`;
  }).join("")}</div>`;
}

function renderFlowBlock(block) {
  const media = Array.isArray(block && block.mediaItems) ? block.mediaItems[0] : null;
  if (!media) return "";
  const role = String(media.mediaRole || "").trim();
  const style = getDiagnosticImageStyle(media);
  if (role === "inline-avatar") {
    return `<article class="v4-flow-inline-fragment">
      <span class="v4-flow-inline-chip">
        <img
          class="v4-flow-avatar"
          src="${escapeHtml(media.assetUrl || "")}"
          alt="${escapeHtml(`${role || "media"} flow block ${block.blockId || ""}`)}"
          ${style ? `style="${escapeHtml(style)}"` : ""}
        />
        <span class="v4-flow-inline-copy">
          <span class="v4-flow-inline-label">prototype inline-avatar</span>
          <span class="v4-flow-inline-source">${escapeHtml(block.sourceHref || block.blockId || "")}</span>
        </span>
      </span>
      <span class="v4-flow-inline-tail">${escapeHtml(media.resolvedHref || "")}</span>
    </article>`;
  }
  const modifier = role === "separator-image" ? " v4-flow-block-separator" : "";
  return `<article class="v4-flow-block${modifier}">
    <div class="v4-flow-meta">${escapeHtml(role || "media")} block</div>
    <img
      class="v4-flow-image"
      src="${escapeHtml(media.assetUrl || "")}"
      alt="${escapeHtml(`${role || "media"} flow block ${block.blockId || ""}`)}"
      ${style ? `style="${escapeHtml(style)}"` : ""}
    />
    <div class="v4-flow-title">${escapeHtml(block.sourceHref || block.blockId || "")}</div>
    <div class="v4-flow-subtle">${escapeHtml(media.resolvedHref || "")}</div>
  </article>`;
}

function renderInFlowSurface(book, excerpt) {
  const flow = excerpt && typeof excerpt === "object" ? excerpt : { blocks: [], includesRoles: [] };
  const blocks = Array.isArray(flow.blocks) ? flow.blocks : [];
  const coverHtml = book && typeof book.coverUrl === "string" && book.coverUrl.trim()
    ? `<article class="v4-flow-block v4-flow-block-cover">
        <div class="v4-flow-meta">shell-cover block</div>
        <img class="v4-flow-cover" src="${escapeHtml(book.coverUrl)}" alt="${escapeHtml(book.title || "Book cover")}" />
        <div class="v4-flow-title">${escapeHtml(book.title || "Untitled")}</div>
        <div class="v4-flow-subtle">artifact-first cover path</div>
      </article>`
    : "";
  const blocksHtml = blocks.length
    ? blocks.map((block) => renderFlowBlock(block)).join("")
    : `<p class="v4-diagnostic-empty">No in-flow media excerpt available.</p>`;
  return `<section class="v4-diagnostic-section">
    <h2>prototype in-flow reading surface</h2>
    <p class="v4-flow-note">Prototype-only simplified flow. It follows current artifact media block order, not final reader layout semantics.</p>
    <div class="v4-flow-meta-row">
      <span><strong>mode</strong> ${escapeHtml(flow.mode || "prototype-media-flow")}</span>
      <span><strong>roles</strong> ${escapeHtml((flow.includesRoles || []).join(", ") || "none")}</span>
      <span><strong>blocks</strong> ${escapeHtml(String(flow.totalBlocks || 0))}</span>
    </div>
    <div class="v4-flow-stream">
      ${coverHtml}
      ${blocksHtml}
    </div>
  </section>`;
}

function renderStructuredAvatar(block, media) {
  const style = getDiagnosticImageStyle(media);
  return `<article class="v4-reading-inline-fragment">
    <span class="v4-reading-inline-chip">
      <img
        class="v4-reading-avatar"
        src="${escapeHtml(media.assetUrl || "")}"
        alt="${escapeHtml(`${media.mediaRole || "inline-avatar"} ${block.blockId || ""}`)}"
        loading="lazy"
        ${style ? `style="${escapeHtml(style)}"` : ""}
      />
    </span>
  </article>`;
}

function renderStructuredMedia(block) {
  const media = Array.isArray(block && block.mediaItems) ? block.mediaItems[0] : null;
  if (!media) return "";
  if (media.mediaRole === "inline-avatar") {
    return renderStructuredAvatar(block, media);
  }
  const style = getDiagnosticImageStyle(media);
  if (media.mediaRole === "separator-image") {
    return `<article class="v4-reading-media v4-reading-media-separator">
      <div class="v4-reading-separator-shell">
        <div class="v4-reading-separator-center">
          <div class="v4-reading-separator-frame">
            <img
              class="v4-reading-image v4-reading-separator-image"
              src="${escapeHtml(media.assetUrl || "")}"
              alt="${escapeHtml(`${media.mediaRole || "media"} ${block.blockId || ""}`)}"
              loading="lazy"
              ${style ? `style="${escapeHtml(style)}"` : ""}
            />
          </div>
        </div>
      </div>
    </article>`;
  }
  return `<article class="v4-reading-media v4-reading-media-content">
    <div class="v4-reading-media-shell">
      <div class="v4-reading-media-frame">
        <img
          class="v4-reading-image v4-reading-content-image"
          src="${escapeHtml(media.assetUrl || "")}"
          alt="${escapeHtml(`${media.mediaRole || "media"} ${block.blockId || ""}`)}"
          loading="lazy"
          ${style ? `style="${escapeHtml(style)}"` : ""}
        />
      </div>
    </div>
  </article>`;
}

function renderStructuredTextBlock(block, paragraphSource, continuation = {}) {
  const richSource = paragraphSource || buildRichTextSource(block && block.textContent, block && block.inlineSemantics);
  if (block && Number.isInteger(block.headingLevel)) {
    const headingLevel = Math.min(Math.max(Number(block.headingLevel), 1), 6);
    const presentationStyle = buildBlockPresentationStyle(block && block.blockPresentation);
    return `<article class="v4-reading-heading-block v4-reading-heading-block-level-${headingLevel}">
      ${renderRichParagraphSource(richSource, `v4-reading-heading v4-reading-heading-level-${headingLevel}`, presentationStyle)}
    </article>`;
  }
  const presentationStyle = buildBlockPresentationStyle(block && block.blockPresentation);
  const classes = ["v4-reading-text-block"];
  if (continuation.fromPreviousPage) {
    classes.push("v4-reading-text-block-continued");
  }
  return `<article class="${classes.join(" ")}">
    ${renderRichParagraphSource(richSource, "v4-reading-paragraph", presentationStyle)}
  </article>`;
}

function renderStructuredBlockquote(block, paragraphSource, continuation = {}) {
  const presentationStyle = buildBlockquoteStyle(block);
  const variant = String(block && block.blockquotePresentation && block.blockquotePresentation.variant || "basic-quote").trim() || "basic-quote";
  const suppressTextIndent = !!(block && block.blockquotePresentation && block.blockquotePresentation.suppressTextIndent);
  const classes = ["v4-reading-blockquote"];
  if (continuation.fromPreviousPage) {
    classes.push("v4-reading-blockquote-continued");
  }
  return `<blockquote class="${classes.join(" ")}" data-quote-variant="${escapeHtml(variant)}" data-suppress-text-indent="${suppressTextIndent ? "true" : "false"}">
    <div class="v4-reading-blockquote-mark" aria-hidden="true">“</div>
    <div class="v4-reading-blockquote-body">
      ${renderRichParagraphSource(paragraphSource || buildRichTextSource(block && block.textContent, block && block.inlineSemantics), "v4-reading-blockquote-text", presentationStyle)}
    </div>
  </blockquote>`;
}

function renderStructuredList(container, fragmentItems = null, continuation = {}) {
  const items = Array.isArray(fragmentItems) ? fragmentItems : (Array.isArray(container && container.items) ? container.items : []);
  if (!items.length) return "";
  const classes = ["v4-reading-list"];
  if (continuation.fromPreviousPage) {
    classes.push("v4-reading-list-continued");
  }
  return `<section class="${classes.join(" ")}">
    <div class="v4-reading-list-items" role="list">
      ${items.map((item) => {
        const style = buildBlockPresentationStyle(item.blockPresentation);
        return `<div class="v4-reading-list-item" role="listitem">
          <div class="v4-reading-list-marker" aria-hidden="true">${escapeHtml(`${String(item.listNumber || "")}.`)}</div>
          <div class="v4-reading-list-content">
            ${renderRichParagraphSource(item.paragraphSource || buildRichTextSource(item.textContent, item.inlineSemantics), "v4-reading-list-text", style)}
          </div>
        </div>`;
      }).join("")}
    </div>
  </section>`;
}

function renderStructuredFigure(container, leadParagraphSource = null, continuation = {}) {
  const lead = container && container.lead ? container.lead : null;
  const image = container && container.image ? container.image : null;
  const imagePresentation = getFigureImagePresentation(image);
  const imageStyle = imagePresentation.style;
  const leadStyle = buildBlockPresentationStyle(lead && lead.blockPresentation);
  const resolvedLeadSource = leadParagraphSource || buildRichTextSource(lead && lead.textContent, lead && lead.inlineSemantics);
  const hasLeadContent = !!(resolvedLeadSource && Array.isArray(resolvedLeadSource.paragraphs) && resolvedLeadSource.paragraphs.length);
  const breakBadge = container && container.breakBefore
    ? `<div class="v4-reading-break-before">
        <span class="v4-reading-break-before-rule" aria-hidden="true"></span>
      </div>`
    : "";
  const leadHtml = lead && lead.textContent && !continuation.hideLead && hasLeadContent
    ? `<section class="v4-reading-figure-lead-wrap">
        <figcaption class="v4-reading-figure-lead">
          ${renderRichParagraphSource(resolvedLeadSource, "v4-reading-figure-text", leadStyle)}
        </figcaption>
      </section>`
    : "";
  const imageHtml = continuation.hideImage ? "" : (image && image.assetUrl
    ? `<section class="v4-reading-figure-image-wrap" data-figure-image-aspect="${escapeHtml(imagePresentation.aspect)}" data-figure-image-source="${escapeHtml(imagePresentation.source)}">
        <div class="v4-reading-figure-image-frame">
          <img
            class="v4-reading-figure-image"
            src="${escapeHtml(image.assetUrl)}"
            alt="${escapeHtml(`figure image ${container.containerId || ""}`)}"
            loading="lazy"
            ${imageStyle ? `style="${escapeHtml(imageStyle)}"` : ""}
          />
        </div>
      </section>`
    : "");
  const classes = ["v4-reading-figure"];
  if (continuation.fromPreviousPage) {
    classes.push("v4-reading-figure-continued");
  }
  return `<figure class="${classes.join(" ")}"${container && container.breakBefore ? ` data-break-before="true"` : ""}>
    ${breakBadge}
    <div class="v4-reading-figure-body">
      ${leadHtml}
      ${imageHtml}
    </div>
  </figure>`;
}

function renderStructuredCommentGroup(item) {
  const continuation = item && item.continuation && typeof item.continuation === "object" ? item.continuation : {};
  const classes = ["v4-reading-comment-group"];
  if (continuation.fromPreviousPage) {
    classes.push("v4-reading-comment-group-continued");
  }
  const identityHtml = continuation.hideIdentity
    ? ""
    : `<div class="v4-reading-comment-group-identity">
        ${item && item.avatarMedia && item.avatarMedia.assetUrl ? `<img class="v4-reading-comment-avatar" src="${escapeHtml(item.avatarMedia.assetUrl)}" alt="${escapeHtml(item.nameText || "Comment avatar")}" loading="lazy" />` : ""}
        ${item && item.nameText ? `<h5 class="v4-reading-comment-name">${escapeHtml(item.nameText)}</h5>` : ""}
      </div>`;
  const bodySource = sliceRichTextSource(item && item.bodySource, item && item.fragmentStart || 0, item && item.fragmentEnd || 0);
  return `<article class="${classes.join(" ")}">
    ${identityHtml}
    <div class="v4-reading-comment-body">
      ${renderRichParagraphSource(bodySource, "v4-reading-paragraph")}
    </div>
  </article>`;
}

function renderStructuredReadingSurface(book, structuredFlow) {
  const flow = structuredFlow && typeof structuredFlow === "object" ? structuredFlow : {
    mode: "structured-reading-flow-v1",
    totalEntries: 0,
    entryCounts: {},
    entries: []
  };
  const entries = Array.isArray(flow.entries) ? flow.entries : [];
  const coverHtml = book && typeof book.coverUrl === "string" && book.coverUrl.trim()
    ? `<article class="v4-reading-cover">
        <img class="v4-reading-cover-image" src="${escapeHtml(book.coverUrl)}" alt="${escapeHtml(book.title || "Book cover")}" loading="lazy" />
      </article>`
    : "";
  const entriesHtml = entries.length
    ? entries.map((entry) => {
      if (entry.entryType === "media") {
        return renderStructuredMedia(entry.block);
      }
      if (entry.entryType === "ordered-list") {
        return renderStructuredList(entry.container);
      }
      if (entry.entryType === "blockquote") {
        return renderStructuredBlockquote(entry.block);
      }
      if (entry.entryType === "figure") {
        return renderStructuredFigure(entry.container);
      }
      if (entry.entryType === "text") {
        return renderStructuredTextBlock(entry.block);
      }
      return "";
    }).join("")
    : `<p class="v4-diagnostic-empty">No structured reading entries available.</p>`;
  const entryCounts = flow.entryCounts && typeof flow.entryCounts === "object" ? flow.entryCounts : {};
  const footnoteSummary = book && book.footnotePreviews ? book.footnotePreviews : {
    totalRefs: 0,
    uniqueTargets: 0,
    resolvedTargets: 0,
    resolvedRefs: 0
  };
  return `<section class="v4-reading-shell">
    <div class="v4-reading-header">
      <div class="v4-eyebrow">v4 structured reading</div>
      <h1 class="v4-reading-title">${escapeHtml(book && book.title || "Untitled")}</h1>
      <div class="v4-reading-meta">
        <span><strong>entries</strong> ${escapeHtml(String(flow.totalEntries || 0))}</span>
        <span><strong>text</strong> ${escapeHtml(String(entryCounts.text || 0))}</span>
        <span><strong>lists</strong> ${escapeHtml(String(entryCounts["ordered-list"] || 0))}</span>
        <span><strong>quotes</strong> ${escapeHtml(String(entryCounts.blockquote || 0))}</span>
        <span><strong>figures</strong> ${escapeHtml(String(entryCounts.figure || 0))}</span>
        <span><strong>media</strong> ${escapeHtml(String(entryCounts.media || 0))}</span>
        <span><strong>footnotes</strong> ${escapeHtml(String(footnoteSummary.resolvedRefs || 0))}</span>
      </div>
    </div>
    <div class="v4-reading-stream">
      ${coverHtml}
      ${entriesHtml}
    </div>
    <aside class="v4-footnote-preview-shell" data-footnote-preview-shell hidden>
      <div class="v4-footnote-preview-meta">prototype footnote preview</div>
      <div class="v4-footnote-preview-body" data-footnote-preview-body>Select a footnote reference to preview its note content.</div>
    </aside>
  </section>`;
}

function renderFootnotePreviewParagraphs(inlinePreview, previewText) {
  if (inlinePreview && Array.isArray(inlinePreview.paragraphs) && inlinePreview.paragraphs.length) {
    return inlinePreview.paragraphs.map((paragraph) => `<p class="v4-footnote-preview-text">${renderInlineRuns(paragraph && paragraph.runs)}</p>`).join("");
  }
  return String(previewText || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p class="v4-footnote-preview-text">${escapeHtml(paragraph)}</p>`)
    .join("");
}

function renderFootnotePreviewContent(preview) {
  if (!preview || typeof preview !== "object") {
    return `<p class="v4-footnote-preview-empty">Footnote preview is unavailable.</p>`;
  }
  return `<div class="v4-footnote-preview-card">
    <div class="v4-footnote-preview-path">${escapeHtml(`${preview.targetSourceHref || ""}#${preview.targetAnchorId || ""}`)}</div>
    ${renderFootnotePreviewParagraphs(preview.inlinePreview, preview.previewText)}
  </div>`;
}

function attachFootnotePreviewHandlers(footnoteSummary, scopeRoot) {
  const shell = document.querySelector("[data-footnote-preview-shell]");
  const body = document.querySelector("[data-footnote-preview-body]");
  if (!shell || !body) return;
  const scope = scopeRoot && typeof scopeRoot.querySelectorAll === "function" ? scopeRoot : document;
  const previewMap = footnoteSummary && typeof footnoteSummary === "object" && footnoteSummary.previewMap && typeof footnoteSummary.previewMap === "object"
    ? footnoteSummary.previewMap
    : {};
  const buttons = Array.from(scope.querySelectorAll(".v4-reading-footnote-ref[data-footnote-key]"));
  if (!buttons.length) {
    shell.hidden = true;
    body.innerHTML = `<p class="v4-footnote-preview-empty">Select a footnote reference to preview its note content.</p>`;
    return;
  }

  let activeKey = "";
  const setActive = (button, previewKey) => {
    buttons.forEach((candidate) => {
      candidate.setAttribute("aria-pressed", candidate === button && previewKey === activeKey ? "true" : "false");
    });
  };

  const renderPreview = (previewKey) => {
    const preview = previewMap[previewKey] || null;
    shell.hidden = false;
    body.innerHTML = renderFootnotePreviewContent(preview);
  };

  buttons.forEach((button) => {
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      const previewKey = String(button.dataset.footnoteKey || "").trim();
      if (!previewKey) return;
      if (activeKey === previewKey) {
        activeKey = "";
        shell.hidden = true;
        body.innerHTML = "";
        setActive(null, "");
        return;
      }
      activeKey = previewKey;
      renderPreview(previewKey);
      setActive(button, previewKey);
      shell.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  });
}

function renderPaginatedCoverPage(book) {
  const coverUrl = book && typeof book.coverUrl === "string" ? book.coverUrl.trim() : "";
  const title = String(book && book.title || "Untitled");
  const creator = String(book && book.manifest && book.manifest.metadata && book.manifest.metadata.creator || "").trim();
  return `<section class="v4-page-cover-entry">
    <h1 class="v4-page-cover-title">${escapeHtml(title)}</h1>
    ${creator ? `<div class="v4-page-cover-author">${escapeHtml(creator)}</div>` : ""}
    ${coverUrl ? `<img class="v4-page-cover-image" src="${escapeHtml(coverUrl)}" alt="${escapeHtml(title)}" loading="lazy" />` : ""}
  </section>`;
}

function renderStructuredEntry(entry) {
  if (!entry || typeof entry !== "object") return "";
  if (entry.entryType === "media") {
    return renderStructuredMedia(entry.block);
  }
  if (entry.entryType === "ordered-list") {
    return renderStructuredList(entry.container);
  }
  if (entry.entryType === "blockquote") {
    return renderStructuredBlockquote(entry.block);
  }
  if (entry.entryType === "figure") {
    return renderStructuredFigure(entry.container);
  }
  if (entry.entryType === "text") {
    return renderStructuredTextBlock(entry.block);
  }
  return "";
}

function buildListFragmentItem(baseId, container, itemFragments, continuation = {}) {
  return {
    pageItemId: baseId,
    pageItemType: "ordered-list",
    rendererType: "ordered-list",
    container,
    itemFragments,
    continuation
  };
}

function buildRichTextItem(baseId, pageItemType, rendererType, block, source, continuation = {}) {
  return {
    pageItemId: baseId,
    pageItemType,
    rendererType,
    block,
    richTextSource: source,
    fragmentStart: 0,
    fragmentEnd: source && Number.isInteger(source.pieceCount) ? source.pieceCount : 0,
    continuation
  };
}

function buildFigureItem(baseId, container, leadSource, continuation = {}) {
  return {
    pageItemId: baseId,
    pageItemType: "figure",
    rendererType: "figure",
    container,
    leadSource,
    fragmentStart: 0,
    fragmentEnd: leadSource && Number.isInteger(leadSource.pieceCount) ? leadSource.pieceCount : 0,
    continuation
  };
}

function buildCommentGroupItem(baseId, entry) {
  const groupedEntries = Array.isArray(entry && entry.entries) ? entry.entries : [];
  const avatarEntry = groupedEntries.find((groupEntry) => groupEntry && groupEntry.entryType === "media" && Array.isArray(groupEntry.block && groupEntry.block.mediaItems) && groupEntry.block.mediaItems[0] && groupEntry.block.mediaItems[0].mediaRole === "inline-avatar") || null;
  const speakerEntry = groupedEntries.find((groupEntry) => groupEntry && groupEntry.entryType === "text" && groupEntry.block && groupEntry.block.headingLevel === 5) || null;
  const bodySources = groupedEntries
    .filter((groupEntry) => groupEntry && groupEntry.entryType === "text" && groupEntry !== speakerEntry)
    .map((groupEntry) => buildRichTextSource(groupEntry.block && groupEntry.block.textContent, groupEntry.block && groupEntry.block.inlineSemantics));
  const bodySource = mergeRichTextSources(bodySources);
  return {
    pageItemId: baseId,
    pageItemType: "comment-group",
    rendererType: "comment-group",
    sourceHref: String(entry && entry.sourceHref || ""),
    avatarMedia: avatarEntry && avatarEntry.block && Array.isArray(avatarEntry.block.mediaItems) ? avatarEntry.block.mediaItems[0] || null : null,
    nameText: String(speakerEntry && speakerEntry.block && speakerEntry.block.textContent || "").trim(),
    bodySource,
    fragmentStart: 0,
    fragmentEnd: bodySource && Number.isInteger(bodySource.pieceCount) ? bodySource.pieceCount : 0,
    continuation: {}
  };
}

function buildPaginatedItemForEntry(entry, itemId) {
  if (!entry || typeof entry !== "object") return null;
  if (entry.entryType === "comment-group") {
    return buildCommentGroupItem(itemId, entry);
  }
  if (entry.entryType === "text") {
    return buildRichTextItem(itemId, "text", "text", entry.block, buildRichTextSource(entry.block && entry.block.textContent, entry.block && entry.block.inlineSemantics));
  }
  if (entry.entryType === "blockquote") {
    return buildRichTextItem(itemId, "blockquote", "blockquote", entry.block, buildRichTextSource(entry.block && entry.block.textContent, entry.block && entry.block.inlineSemantics));
  }
  if (entry.entryType === "ordered-list") {
    const itemFragments = Array.isArray(entry.container && entry.container.items)
      ? entry.container.items.map((item, itemIndex) => {
        const richTextSource = buildRichTextSource(item.textContent, item.inlineSemantics);
        return {
          fragmentId: `${itemId}-item-${itemIndex}`,
          blockId: item.blockId,
          listNumber: item.listNumber,
          blockPresentation: item.blockPresentation,
          textContent: item.textContent,
          inlineSemantics: item.inlineSemantics,
          richTextSource,
          fragmentStart: 0,
          fragmentEnd: richTextSource.pieceCount
        };
      })
      : [];
    return buildListFragmentItem(itemId, entry.container, itemFragments);
  }
  if (entry.entryType === "figure") {
    const leadSource = buildRichTextSource(
      entry.container && entry.container.lead && entry.container.lead.textContent,
      entry.container && entry.container.lead && entry.container.lead.inlineSemantics
    );
    return buildFigureItem(itemId, entry.container, leadSource, { hideImage: false });
  }
  if (entry.entryType === "media") {
    return {
      pageItemId: itemId,
      pageItemType: "media",
      rendererType: "media",
      block: entry.block
    };
  }
  return null;
}

function buildPaginationUnits(book, semanticReadingFlow) {
  const flow = semanticReadingFlow && typeof semanticReadingFlow === "object" ? semanticReadingFlow : { entries: [] };
  const units = [];
  if (book && typeof book.coverUrl === "string" && book.coverUrl.trim()) {
    units.push({
      unitId: "cover-unit",
      unitType: "cover",
      items: [{
        pageItemId: "cover-page",
        pageItemType: "cover",
        rendererType: "cover",
        book
      }]
    });
  }
  const entries = Array.isArray(flow.entries) ? flow.entries : [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const unitId = `unit-${index}`;
    if (entry && entry.entryType === "comment-group") {
      const item = buildPaginatedItemForEntry(entry, `${unitId}-entry-0`);
      if (item) {
        units.push({
          unitId,
          unitType: entry.entryType,
          items: [item]
        });
      }
      continue;
    }
    if (entry && entry.entryType === "heading-cluster") {
      const groupedEntries = Array.isArray(entry.entries) ? entry.entries : [];
      const items = groupedEntries
        .map((groupEntry, groupIndex) => buildPaginatedItemForEntry(groupEntry, `${unitId}-entry-${groupIndex}`))
        .filter(Boolean);
      if (items.length) {
        units.push({
          unitId,
          unitType: entry.entryType,
          items
        });
      }
      continue;
    }
    const item = buildPaginatedItemForEntry(entry, `${unitId}-entry-0`);
    if (item) {
      units.push({
        unitId,
        unitType: entry && entry.entryType || "entry",
        items: [item]
      });
    }
  }
  return units;
}

function renderPaginatedItem(item) {
  if (!item || typeof item !== "object") return "";
  if (item.rendererType === "cover") {
    return renderPaginatedCoverPage(item.book);
  }
  if (item.rendererType === "media") {
    return renderStructuredMedia(item.block);
  }
  if (item.rendererType === "text") {
    return renderStructuredTextBlock(
      item.block,
      sliceRichTextSource(item.richTextSource, item.fragmentStart, item.fragmentEnd),
      {
        fromPreviousPage: !!(item.continuation && item.continuation.fromPreviousPage),
        continuesToNextPage: !!(item.continuation && item.continuation.continuesToNextPage)
      }
    );
  }
  if (item.rendererType === "blockquote") {
    return renderStructuredBlockquote(
      item.block,
      sliceRichTextSource(item.richTextSource, item.fragmentStart, item.fragmentEnd),
      {
        fromPreviousPage: !!(item.continuation && item.continuation.fromPreviousPage),
        continuesToNextPage: !!(item.continuation && item.continuation.continuesToNextPage)
      }
    );
  }
  if (item.rendererType === "ordered-list") {
    const listItems = Array.isArray(item.itemFragments)
      ? item.itemFragments.map((fragment) => ({
        blockId: fragment.blockId,
        listNumber: fragment.listNumber,
        blockPresentation: fragment.blockPresentation,
        paragraphSource: sliceRichTextSource(fragment.richTextSource, fragment.fragmentStart, fragment.fragmentEnd)
      }))
      : [];
    return renderStructuredList(item.container, listItems, {
      fromPreviousPage: !!(item.continuation && item.continuation.fromPreviousPage),
      continuesToNextPage: !!(item.continuation && item.continuation.continuesToNextPage)
    });
  }
  if (item.rendererType === "figure") {
    return renderStructuredFigure(
      item.container,
      sliceRichTextSource(item.leadSource, item.fragmentStart, item.fragmentEnd),
      {
        fromPreviousPage: !!(item.continuation && item.continuation.fromPreviousPage),
        continuesToNextPage: !!(item.continuation && item.continuation.continuesToNextPage),
        hideImage: !!(item.continuation && item.continuation.hideImage)
      }
    );
  }
  if (item.rendererType === "comment-group") {
    return renderStructuredCommentGroup(item);
  }
  return "";
}

function createPaginatedItemNode(item) {
  const wrapper = document.createElement("div");
  wrapper.className = "v4-page-entry";
  wrapper.dataset.pageItemId = String(item && item.pageItemId || "");
  wrapper.dataset.pageItemType = String(item && item.pageItemType || "");
  if (item && item.continuation && item.continuation.fromPreviousPage) {
    wrapper.dataset.pageContinuationStart = "true";
  }
  if (item && item.continuation && item.continuation.continuesToNextPage) {
    wrapper.dataset.pageContinuationEnd = "true";
  }
  wrapper.innerHTML = renderPaginatedItem(item);
  return wrapper;
}

function cloneContinuation(continuation, overrides = {}) {
  return {
    ...(continuation && typeof continuation === "object" ? continuation : {}),
    ...overrides
  };
}

function cloneRichTextItem(item, fragmentStart, fragmentEnd, continuationOverrides = {}) {
  return {
    ...item,
    fragmentStart,
    fragmentEnd,
    continuation: cloneContinuation(item.continuation, continuationOverrides)
  };
}

function splitRichTextItem(item, measureContent) {
  const total = Math.max(0, (item.fragmentEnd || 0) - (item.fragmentStart || 0));
  if (total <= 1) return null;
  let low = 1;
  let high = total - 1;
  let bestHead = null;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = cloneRichTextItem(
      item,
      item.fragmentStart,
      item.fragmentStart + mid,
      {
        fromPreviousPage: !!(item.continuation && item.continuation.fromPreviousPage),
        continuesToNextPage: true
      }
    );
    const node = createPaginatedItemNode(candidate);
    measureContent.appendChild(node);
    const fits = measureContent.scrollHeight <= measureContent.clientHeight + 1;
    measureContent.removeChild(node);
    if (fits) {
      bestHead = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (!bestHead) return null;
  const tail = cloneRichTextItem(
    item,
    bestHead.fragmentEnd,
    item.fragmentEnd,
    {
      fromPreviousPage: true,
      continuesToNextPage: !!(item.continuation && item.continuation.continuesToNextPage)
    }
  );
  return { head: bestHead, tail };
}

function cloneListFragment(fragment, overrides = {}) {
  return {
    ...fragment,
    ...overrides
  };
}

function buildListContinuation(item, overrides = {}) {
  return cloneContinuation(item.continuation, overrides);
}

function splitListItemFragment(fragment, baseId, listNumber, measureContent, buildCandidate) {
  const total = Math.max(0, (fragment.fragmentEnd || 0) - (fragment.fragmentStart || 0));
  if (total <= 1) return null;
  let low = 1;
  let high = total - 1;
  let bestHead = null;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidateFragment = cloneListFragment(fragment, {
      fragmentStart: fragment.fragmentStart,
      fragmentEnd: fragment.fragmentStart + mid
    });
    const candidate = buildCandidate([candidateFragment], true);
    const node = createPaginatedItemNode(candidate);
    measureContent.appendChild(node);
    const fits = measureContent.scrollHeight <= measureContent.clientHeight + 1;
    measureContent.removeChild(node);
    if (fits) {
      bestHead = candidateFragment;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (!bestHead) return null;
  const tail = cloneListFragment(fragment, {
    fragmentStart: bestHead.fragmentEnd,
    fragmentEnd: fragment.fragmentEnd
  });
  return { head: bestHead, tail };
}

function splitOrderedListItem(item, measureContent) {
  const fragments = Array.isArray(item.itemFragments) ? item.itemFragments : [];
  if (!fragments.length) return null;

  const buildCandidate = (itemFragments, continuesToNextPage, fromPreviousPage = false) => buildListFragmentItem(
    item.pageItemId,
    item.container,
    itemFragments,
    buildListContinuation(item, {
      fromPreviousPage,
      continuesToNextPage
    })
  );

  let bestCount = 0;
  for (let count = 1; count <= fragments.length; count += 1) {
    const candidate = buildCandidate(fragments.slice(0, count), count < fragments.length, !!(item.continuation && item.continuation.fromPreviousPage));
    const node = createPaginatedItemNode(candidate);
    measureContent.appendChild(node);
    const fits = measureContent.scrollHeight <= measureContent.clientHeight + 1;
    measureContent.removeChild(node);
    if (fits) {
      bestCount = count;
    } else {
      break;
    }
  }

  if (bestCount > 0) {
    const headFragments = fragments.slice(0, bestCount);
    const tailFragments = fragments.slice(bestCount);
    return {
      head: buildCandidate(headFragments, tailFragments.length > 0, !!(item.continuation && item.continuation.fromPreviousPage)),
      tail: tailFragments.length ? buildCandidate(tailFragments, !!(item.continuation && item.continuation.continuesToNextPage), true) : null
    };
  }

  const firstFragment = fragments[0];
  const splitFirst = splitListItemFragment(firstFragment, item.pageItemId, firstFragment.listNumber, measureContent, (parts, continuesToNextPage) => buildCandidate(parts, continuesToNextPage, !!(item.continuation && item.continuation.fromPreviousPage)));
  if (!splitFirst) return null;
  const head = buildCandidate([splitFirst.head], true, !!(item.continuation && item.continuation.fromPreviousPage));
  const tailFragments = [splitFirst.tail, ...fragments.slice(1)];
  const tail = buildCandidate(tailFragments, !!(item.continuation && item.continuation.continuesToNextPage), true);
  return { head, tail };
}

function splitFigureItem(item, measureContent) {
  const total = Math.max(0, (item.fragmentEnd || 0) - (item.fragmentStart || 0));
  const hasImage = !!(item.container && item.container.image && item.container.image.assetUrl) && !(item.continuation && item.continuation.hideImage);

  if (hasImage) {
    const leadOnly = {
      ...item,
      continuation: cloneContinuation(item.continuation, {
        hideImage: true,
        continuesToNextPage: true
      })
    };
    const node = createPaginatedItemNode(leadOnly);
    measureContent.appendChild(node);
    const fits = measureContent.scrollHeight <= measureContent.clientHeight + 1;
    measureContent.removeChild(node);
    if (fits) {
      const tail = {
        ...item,
        continuation: cloneContinuation(item.continuation, {
          fromPreviousPage: true,
          hideLead: true,
          hideImage: false,
          continuesToNextPage: false
        }),
        fragmentStart: item.fragmentEnd,
        fragmentEnd: item.fragmentEnd
      };
      return { head: leadOnly, tail };
    }
  }

  if (total <= 1) return null;
  let low = 1;
  let high = total - 1;
  let bestHead = null;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = {
      ...item,
      fragmentStart: item.fragmentStart,
      fragmentEnd: item.fragmentStart + mid,
      continuation: cloneContinuation(item.continuation, {
        fromPreviousPage: !!(item.continuation && item.continuation.fromPreviousPage),
        hideImage: true,
        continuesToNextPage: true
      })
    };
    const node = createPaginatedItemNode(candidate);
    measureContent.appendChild(node);
    const fits = measureContent.scrollHeight <= measureContent.clientHeight + 1;
    measureContent.removeChild(node);
    if (fits) {
      bestHead = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  if (!bestHead) return null;
  const tail = {
    ...item,
    fragmentStart: bestHead.fragmentEnd,
    fragmentEnd: item.fragmentEnd,
    continuation: cloneContinuation(item.continuation, {
      fromPreviousPage: true,
      hideImage: false,
      continuesToNextPage: false
    })
  };
  return { head: bestHead, tail };
}

function splitPaginatedItemToFit(item, measureContent) {
  if (!item || typeof item !== "object") return null;
  if (item.rendererType === "text" || item.rendererType === "blockquote") {
    return splitRichTextItem(item, measureContent);
  }
  if (item.rendererType === "comment-group") {
    const split = splitRichTextItem({
      ...item,
      richTextSource: item.bodySource
    }, measureContent);
    if (!split || !split.head) return null;
    return {
      head: {
        ...item,
        fragmentStart: split.head.fragmentStart,
        fragmentEnd: split.head.fragmentEnd,
        continuation: cloneContinuation(item.continuation, {
          fromPreviousPage: !!(item.continuation && item.continuation.fromPreviousPage),
          continuesToNextPage: true,
          hideIdentity: !!(item.continuation && item.continuation.hideIdentity)
        })
      },
      tail: split.tail ? {
        ...item,
        fragmentStart: split.tail.fragmentStart,
        fragmentEnd: split.tail.fragmentEnd,
        continuation: cloneContinuation(item.continuation, {
          fromPreviousPage: true,
          continuesToNextPage: !!(item.continuation && item.continuation.continuesToNextPage),
          hideIdentity: true
        })
      } : null
    };
  }
  if (item.rendererType === "ordered-list") {
    return splitOrderedListItem(item, measureContent);
  }
  if (item.rendererType === "figure") {
    return splitFigureItem(item, measureContent);
  }
  return null;
}

function clonePaginationUnit(unit, overrides = {}) {
  return {
    ...(unit && typeof unit === "object" ? unit : {}),
    ...overrides
  };
}

function splitPaginationUnitToFit(unit, measureContent) {
  if (!unit || !Array.isArray(unit.items) || !unit.items.length) return null;
  if (unit.items.length === 1) {
    const split = splitPaginatedItemToFit(unit.items[0], measureContent);
    if (!split || !split.head) return null;
    return {
      headItems: [split.head],
      tailUnit: split.tail
        ? clonePaginationUnit(unit, { items: [split.tail] })
        : null
    };
  }

  const headItems = [];
  for (let index = 0; index < unit.items.length; index += 1) {
    const item = unit.items[index];
    const node = createPaginatedItemNode(item);
    measureContent.appendChild(node);
    const fits = measureContent.scrollHeight <= measureContent.clientHeight + 1;
    measureContent.removeChild(node);
    if (!fits) {
      if (!headItems.length) {
        const split = splitPaginatedItemToFit(item, measureContent);
        if (!split || !split.head) return null;
        return {
          headItems: [split.head],
          tailUnit: clonePaginationUnit(unit, {
            items: [split.tail, ...unit.items.slice(index + 1)].filter(Boolean)
          })
        };
      }
      return {
        headItems,
        tailUnit: clonePaginationUnit(unit, {
          items: unit.items.slice(index)
        })
      };
    }
    headItems.push(item);
    measureContent.appendChild(node);
  }

  while (measureContent.lastChild) {
    measureContent.removeChild(measureContent.lastChild);
  }
  return {
    headItems,
    tailUnit: null
  };
}

function paginateUnitsIntoPages(units, measureContent) {
  if (!measureContent) return [];
  const pages = [];
  const queue = Array.isArray(units) ? units.map((unit) => clonePaginationUnit(unit, { items: Array.isArray(unit.items) ? unit.items.slice() : [] })) : [];

  while (queue.length) {
    measureContent.innerHTML = "";
    const currentPage = [];

    while (queue.length) {
      const unit = queue.shift();
      const appendedNodes = [];
      for (const item of unit.items) {
        const node = createPaginatedItemNode(item);
        appendedNodes.push(node);
        measureContent.appendChild(node);
      }
      const fits = measureContent.scrollHeight <= measureContent.clientHeight + 1;
      if (fits) {
        currentPage.push(...unit.items);
        continue;
      }

      while (appendedNodes.length) {
        const node = appendedNodes.pop();
        if (node && node.parentNode === measureContent) {
          measureContent.removeChild(node);
        }
      }

      const split = splitPaginationUnitToFit(unit, measureContent);
      if (split && Array.isArray(split.headItems) && split.headItems.length) {
        for (const headItem of split.headItems) {
          const headNode = createPaginatedItemNode(headItem);
          measureContent.appendChild(headNode);
          currentPage.push(headItem);
        }
        if (split.tailUnit && Array.isArray(split.tailUnit.items) && split.tailUnit.items.length) {
          queue.unshift(split.tailUnit);
        }
        break;
      }

      if (currentPage.length) {
        queue.unshift(unit);
        break;
      }

      for (const item of unit.items) {
        const node = createPaginatedItemNode(item);
        measureContent.appendChild(node);
        currentPage.push(item);
      }
      break;
    }

    if (currentPage.length) {
      pages.push(currentPage);
    } else {
      break;
    }
  }

  measureContent.innerHTML = "";
  return pages;
}

function renderPaginatedReadingSurface(book, semanticReadingFlow) {
  const flow = semanticReadingFlow && typeof semanticReadingFlow === "object" ? semanticReadingFlow : {
    mode: "semantic-reading-flow-v1",
    totalEntries: 0,
    entryCounts: {},
    entries: []
  };
  return `<section class="v4-paginated-shell" data-v4-paginated-shell>
    <div class="v4-paginated-stage">
      <div class="v4-paginated-page-frame">
        <div class="v4-paginated-page">
          <div class="v4-page-content" data-v4-page-live></div>
        </div>
      </div>
      <aside class="v4-footnote-preview-shell" data-footnote-preview-shell hidden>
        <div class="v4-footnote-preview-body" data-footnote-preview-body>Select a footnote reference to preview its note content.</div>
      </aside>
    </div>
    <div class="v4-paginated-measure" aria-hidden="true">
      <div class="v4-paginated-page-frame">
        <div class="v4-paginated-page">
          <div class="v4-page-content" data-v4-page-measure></div>
        </div>
      </div>
    </div>
  </section>`;
}

function renderV3DerivedShell(book, semanticReadingFlow) {
  return `<div id="main" class="v4-shell-main">
    <div id="titlebar">
      <div id="opener" aria-hidden="true">
        <span class="shell-control shell-control-menu">${SHELL_MENU_SVG}</span>
      </div>
      <div id="metainfo">
        <div id="metaText">
          <div id="book-title">${escapeHtml(book && book.title || "Untitled")}</div>
          <div id="chapter-title"></div>
        </div>
      </div>
      <div id="title-controls" aria-hidden="true">
        <span class="shell-control shell-control-bookmark">${SHELL_BOOKMARK_SVG}</span>
      </div>
    </div>
    <div id="divider"></div>
    <button type="button" class="arrow" id="prev" aria-label="Previous page">‹</button>
    <div id="viewerStack" aria-label="Book Viewer">
      <div id="viewer" class="viewer-layer viewer-current">
        <div class="v4-card">
          ${renderPaginatedReadingSurface(book, semanticReadingFlow)}
        </div>
      </div>
    </div>
    <button type="button" class="arrow" id="next" aria-label="Next page">›</button>
    <div id="bottombar">
      <div id="bottom-controls">
        <span class="page-count" id="page-count">0 / 0</span>
      </div>
    </div>
  </div>`;
}

function resolveShellChapterTitle(liveContent, previousTitle = "") {
  if (!liveContent) return previousTitle || "";
  const headings = Array.from(liveContent.querySelectorAll(".v4-reading-heading-level-1, .v4-reading-heading-level-2, .v4-reading-heading-level-3"))
    .map((node) => String(node && node.textContent || "").trim())
    .filter(Boolean);
  if (!headings.length) return previousTitle || "";
  const chapterLike = headings.find((text) => /^(глава|chapter)\b/i.test(text));
  if (chapterLike) return chapterLike;
  const nonDateHeadings = headings.filter((text) => !/^\d{1,2}\s+[^\n]+\d{4}/i.test(text));
  return nonDateHeadings[nonDateHeadings.length - 1] || headings[headings.length - 1] || previousTitle || "";
}

function mountPaginatedReadingSurface(book, semanticReadingFlow, footnoteSummary) {
  if (typeof cleanupPaginatedReadingSurface === "function") {
    cleanupPaginatedReadingSurface();
    cleanupPaginatedReadingSurface = null;
  }
  const shell = document.querySelector("[data-v4-paginated-shell]");
  if (!shell) return;
  const liveContent = shell.querySelector("[data-v4-page-live]");
  const measureContent = shell.querySelector("[data-v4-page-measure]");
  const prevButton = document.getElementById("prev");
  const nextButton = document.getElementById("next");
  const counter = document.getElementById("page-count");
  const chapterTitleNode = document.getElementById("chapter-title");
  const previewShell = shell.querySelector("[data-footnote-preview-shell]");
  const previewBody = shell.querySelector("[data-footnote-preview-body]");
  if (!liveContent || !measureContent || !prevButton || !nextButton || !counter) return;

  const units = buildPaginationUnits(book, semanticReadingFlow);
  let pages = [];
  let currentPageIndex = 0;
  let lastChapterTitle = "";

  const updateDiagnostics = () => {
    try {
      const diagnostics = window.__READERPUB_V4_DIAGNOSTICS__ || {};
      diagnostics.pagination = {
        mode: "paginated-semantic-flow-v1",
        totalUnits: units.length,
        totalPages: pages.length,
        currentPage: currentPageIndex + 1
      };
      window.__READERPUB_V4_DIAGNOSTICS__ = diagnostics;
    } catch (_error) {}
  };

  const renderPage = () => {
    const pageItems = pages[currentPageIndex] || [];
    liveContent.innerHTML = pageItems.map((item) => {
      const node = createPaginatedItemNode(item);
      return node.outerHTML;
    }).join("");
    counter.textContent = `${pages.length ? currentPageIndex + 1 : 0} / ${pages.length}`;
    prevButton.disabled = currentPageIndex <= 0;
    nextButton.disabled = currentPageIndex >= pages.length - 1;
    prevButton.classList.toggle("disabled", currentPageIndex <= 0);
    nextButton.classList.toggle("disabled", currentPageIndex >= pages.length - 1);
    lastChapterTitle = resolveShellChapterTitle(liveContent, lastChapterTitle);
    if (chapterTitleNode) chapterTitleNode.textContent = lastChapterTitle;
    if (previewShell && previewBody) {
      previewShell.hidden = true;
      previewBody.innerHTML = "Select a footnote reference to preview its note content.";
    }
    attachFootnotePreviewHandlers(footnoteSummary, liveContent);
    updateDiagnostics();
  };

  const repaginate = () => {
    const liveRect = liveContent.getBoundingClientRect();
    measureContent.style.width = `${Math.max(Math.round(liveRect.width), 1)}px`;
    measureContent.style.minHeight = `${Math.max(Math.round(liveContent.clientHeight), 1)}px`;
    measureContent.style.maxHeight = `${Math.max(Math.round(liveContent.clientHeight), 1)}px`;
    pages = paginateUnitsIntoPages(units, measureContent);
    if (!pages.length) {
      pages = [[]];
    }
    currentPageIndex = Math.min(currentPageIndex, pages.length - 1);
    renderPage();
  };

  const goToPage = (nextIndex) => {
    const clamped = Math.max(0, Math.min(nextIndex, pages.length - 1));
    if (clamped === currentPageIndex) return;
    currentPageIndex = clamped;
    renderPage();
  };

  const onPrev = () => goToPage(currentPageIndex - 1);
  const onNext = () => goToPage(currentPageIndex + 1);
  const onKeyDown = (event) => {
    if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      onPrev();
    } else if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
      event.preventDefault();
      onNext();
    }
  };

  let resizeTimer = 0;
  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      repaginate();
    }, 120);
  };

  prevButton.addEventListener("click", onPrev);
  nextButton.addEventListener("click", onNext);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("resize", onResize);

  repaginate();

  cleanupPaginatedReadingSurface = () => {
    prevButton.removeEventListener("click", onPrev);
    nextButton.removeEventListener("click", onNext);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("resize", onResize);
    window.clearTimeout(resizeTimer);
  };
}

function renderFigureSamples(figureSummary) {
  const summary = figureSummary && typeof figureSummary === "object" ? figureSummary : { samples: [] };
  const samples = Array.isArray(summary.samples) ? summary.samples : [];
  if (!samples.length) {
    return `<p class="v4-diagnostic-empty">No figure containers resolved.</p>`;
  }
  return `<div class="v4-figure-list">${samples.map((container) => {
    const lead = container && container.lead ? container.lead : null;
    const image = container && container.image ? container.image : null;
    const imageStyle = image ? getDiagnosticImageStyle(image) : "";
    const breakBadge = container && container.breakBefore
      ? `<span class="v4-figure-break">break-before</span>`
      : "";
    return `<article class="v4-figure-card">
      <div class="v4-figure-meta-row">
        <span class="v4-flow-meta">figure container</span>
        ${breakBadge}
      </div>
      <div class="v4-figure-id">${escapeHtml(container.containerId || "")}</div>
      <div class="v4-figure-source">${escapeHtml(container.sourceHref || "")}</div>
      <div class="v4-figure-group">
        <section class="v4-figure-lead">
          <div class="v4-flow-meta">lead-text</div>
          <p class="v4-figure-lead-text">${escapeHtml(lead && lead.textContent || "Lead text not resolved.")}</p>
          <div class="v4-flow-subtle">${escapeHtml(lead && lead.blockId || "unset")}</div>
        </section>
        <section class="v4-figure-image-wrap">
          <div class="v4-flow-meta">image</div>
          ${image && image.assetUrl ? `<img class="v4-figure-image" src="${escapeHtml(image.assetUrl)}" alt="${escapeHtml(`figure image ${container.containerId || ""}`)}" ${imageStyle ? `style="${escapeHtml(imageStyle)}"` : ""} />` : `<div class="v4-diagnostic-preview v4-diagnostic-preview-empty">Image not resolved</div>`}
          <div class="v4-flow-subtle">${escapeHtml(image && image.mediaBlockId || "unset")}</div>
        </section>
      </div>
    </article>`;
  }).join("")}</div>`;
}

function resolveShellCoverUrl(book) {
  if (book && typeof book.coverUrl === "string" && book.coverUrl.trim()) {
    return {
      url: book.coverUrl.trim(),
      source: "manifest.cover"
    };
  }
  const queryCoverUrl = getQueryCoverUrl();
  if (queryCoverUrl) {
    return {
      url: queryCoverUrl,
      source: "query cover"
    };
  }
  return {
    url: "",
    source: ""
  };
}

function renderStatus(book, artifactRoot) {
  const shellCover = resolveShellCoverUrl(book);
  const mediaSummary = book && book.nonCoverMedia ? book.nonCoverMedia : {
    mediaBlocks: 0,
    inlineAvatarBlocks: 0,
    contentImageBlocks: 0,
    separatorImageBlocks: 0,
    avatarSamples: [],
    contentImageSamples: [],
    separatorImageSamples: [],
    inFlowExcerpt: { mode: "prototype-media-flow", totalBlocks: 0, includesRoles: [], blocks: [] }
  };
  const logicalBlockSummary = book && book.logicalBlockSummary ? book.logicalBlockSummary : {
    totalLogicalBlocks: 0,
    mediaBlocks: 0,
    headingBlocks: 0,
    paragraphBlocks: 0,
    figureLeadBlocks: 0,
    listItemBlocks: 0,
    blockquoteBlocks: 0,
    blocksWithPresentation: 0
  };
  const figureSummary = book && book.figureContainers ? book.figureContainers : {
    totalContainers: 0,
    breakBeforeCount: 0,
    resolvedLeadCount: 0,
    resolvedImageCount: 0,
    samples: [],
    containers: []
  };
  const listSummary = book && book.listContainers ? book.listContainers : {
    totalContainers: 0,
    totalItems: 0,
    samples: [],
    containers: []
  };
  const structuredFlow = book && book.structuredFlow ? book.structuredFlow : {
    mode: "structured-reading-flow-v1",
    totalEntries: 0,
    entryCounts: {},
    entries: []
  };
  const semanticReadingFlow = book && book.semanticReadingFlow ? book.semanticReadingFlow : {
    mode: "semantic-reading-flow-v1",
    totalEntries: 0,
    entryCounts: {},
    entries: []
  };
  const footnoteSummary = book && book.footnotePreviews ? book.footnotePreviews : {
    totalRefs: 0,
    uniqueTargets: 0,
    resolvedTargets: 0,
    resolvedRefs: 0,
    previewMap: {}
  };
  renderScreen(
    renderV3DerivedShell(book, semanticReadingFlow)
  );
  try {
    window.__READERPUB_V4_DIAGNOSTICS__ = {
      status: "artifact-loaded",
      artifactRoot,
      bookId: book.bookId,
      title: book.title,
      contractKind: book.contractKind,
      shellCoverSource: shellCover.source || "",
      shellCoverUrl: shellCover.url || "",
      logicalBlockSummary,
      nonCoverMedia: mediaSummary,
      listContainers: listSummary,
      figureContainers: figureSummary,
      footnotePreviews: footnoteSummary,
      structuredFlow,
      semanticReadingFlow
    };
  } catch (_error) {}
  mountPaginatedReadingSurface(book, semanticReadingFlow, footnoteSummary);
}

function renderError(message) {
  if (typeof cleanupPaginatedReadingSurface === "function") {
    cleanupPaginatedReadingSurface();
    cleanupPaginatedReadingSurface = null;
  }
  try {
    window.__READERPUB_V4_DIAGNOSTICS__ = {
      status: "artifact-load-failed",
      error: String(message || "")
    };
  } catch (_error) {}
  renderScreen(
    `<div class="v4-card">
      <div class="v4-eyebrow">v4 reader</div>
      <h1>artifact load failed</h1>
      <p>${escapeHtml(message)}</p>
    </div>`
  );
}

async function main() {
  const artifactBookId = getArtifactBookId();
  if (!artifactBookId) {
    renderError("Missing artifactBookId query parameter.");
    return;
  }
  const artifactRoot = `${ARTIFACT_ROOT_PREFIX}${encodeURIComponent(artifactBookId)}/`;
  try {
    const book = await loadProtectedBook(artifactRoot);
    renderStatus(book, artifactRoot);
  } catch (error) {
    renderError(error && error.message ? error.message : String(error));
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void main();
  }, { once: true });
} else {
  void main();
}
