import { buildGlobalLocationModel, localOffsetToGlobal } from "./protected-global-location.js";

function normalizeHref(value) {
  return String(value || "").trim().replace(/^\.\//, "");
}

function splitHrefAndFragment(href) {
  const raw = normalizeHref(href);
  const hashIndex = raw.indexOf("#");
  if (hashIndex === -1) {
    return {
      href: raw,
      fragment: ""
    };
  }
  return {
    href: raw.slice(0, hashIndex),
    fragment: raw.slice(hashIndex + 1)
  };
}

function buildPosition(globalModel, chunkEntry, blockBoundary, localOffset, sourceRef = null) {
  return {
    bookId: globalModel.bookId,
    chunkId: chunkEntry.chunkId,
    chunkOrder: chunkEntry.chunkOrder,
    localOffset,
    globalOffset: localOffsetToGlobal(globalModel, chunkEntry.chunkId, localOffset),
    blockId: blockBoundary ? blockBoundary.blockId : null,
    lineIndex: null,
    locationId: blockBoundary ? blockBoundary.locationId : chunkEntry.locationId,
    sourceRef: sourceRef || (blockBoundary ? blockBoundary.sourceRef || null : null),
    restoreAnchor: chunkEntry.restoreAnchor || null
  };
}

function buildRangeFromBlock(globalModel, chunkEntry, blockBoundary) {
  const startOffset = Math.max(0, blockBoundary.startOffset || 0);
  const endOffset = Math.max(startOffset + 1, blockBoundary.endOffset || startOffset + 1);
  return {
    kind: "protected-range-v1",
    bookId: globalModel.bookId,
    selectionMode: "production-import",
    wordSnapped: false,
    start: buildPosition(globalModel, chunkEntry, blockBoundary, startOffset),
    end: buildPosition(globalModel, chunkEntry, blockBoundary, endOffset),
    sourceAnchors: [
      {
        type: "production-block-anchor",
        blockId: blockBoundary.blockId,
        locationId: blockBoundary.locationId,
        href: blockBoundary.sourceRef?.href || ""
      }
    ],
    excerptHashSeed: `${globalModel.bookId}:${chunkEntry.chunkId}:${blockBoundary.blockId}`
  };
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function parseCfiScalar(rawCfi) {
  const cfi = String(rawCfi || "").trim();
  if (!cfi) return null;
  const match = cfi.match(/^epubcfi\((.+)\)$/i);
  const body = match ? match[1] : cfi;
  const parts = body.split("!");
  const packagePath = parts[0] || "";
  const contentPath = parts[1] || "";
  const offsetMatch = contentPath.match(/:(\d+)$/);
  const offset = offsetMatch ? Number(offsetMatch[1]) : 0;
  const pathWithoutOffset = contentPath.replace(/:\d+$/, "");
  const stepNumbers = pathWithoutOffset
    .split("/")
    .filter(Boolean)
    .map((item) => {
      const m = item.match(/^(\d+)/);
      return m ? Number(m[1]) : null;
    })
    .filter((value) => Number.isFinite(value));
  const packageSteps = packagePath
    .split("/")
    .filter(Boolean)
    .map((item) => {
      const m = item.match(/^(\d+)/);
      return m ? Number(m[1]) : null;
    })
    .filter((value) => Number.isFinite(value));

  const packageEven = packageSteps.filter((value) => value % 2 === 0);
  const contentEven = stepNumbers.filter((value) => value % 2 === 0);
  const spineStep = packageEven.length ? packageEven[packageEven.length - 1] : null;
  const nodeStep = contentEven.length ? contentEven[contentEven.length - 1] : null;

  return {
    raw: cfi,
    packageSteps,
    contentSteps: stepNumbers,
    offset,
    approxSpineIndex: spineStep != null ? Math.max(0, Math.floor(spineStep / 2) - 1) : null,
    approxNodeIndex: nodeStep != null ? Math.max(0, Math.floor(nodeStep / 2) - 1) : null
  };
}

export function buildProtectedCfiResolver(book) {
  const globalModel = book.globalLocationModel || buildGlobalLocationModel(book);
  const chunks = globalModel.chunks || [];
  const blockRecords = [];
  const chunkById = new Map(chunks.map((chunk) => [chunk.chunkId, chunk]));

  for (const chunk of chunks) {
    for (const block of chunk.blockBoundaries || []) {
      blockRecords.push({
        chunk,
        block,
        sourceRef: block.sourceRef || null
      });
    }
  }

  const byHref = new Map();
  const byNodeId = new Map();
  const bySpineIndex = new Map();
  const byNodeIndex = new Map();

  for (const record of blockRecords) {
    const href = normalizeHref(record.sourceRef?.href || "");
    const nodeId = String(record.sourceRef?.nodeId || "").trim();
    const spineIndex = record.sourceRef?.spineIndex;
    const nodeIndex = record.sourceRef?.nodeIndex;

    if (href) {
      if (!byHref.has(href)) byHref.set(href, []);
      byHref.get(href).push(record);
    }
    if (href && nodeId) byNodeId.set(`${href}#${nodeId}`, record);
    if (Number.isFinite(spineIndex)) {
      if (!bySpineIndex.has(spineIndex)) bySpineIndex.set(spineIndex, []);
      bySpineIndex.get(spineIndex).push(record);
    }
    if (Number.isFinite(spineIndex) && Number.isFinite(nodeIndex)) {
      byNodeIndex.set(`${spineIndex}:${nodeIndex}`, record);
    }
  }

  function resolveFromHref(rawHref) {
    const { href, fragment } = splitHrefAndFragment(rawHref);
    if (!href) return null;
    if (fragment) {
      const exact = byNodeId.get(`${href}#${fragment}`) || null;
      if (exact) {
        return {
          status: "exact",
          reason: "href-fragment-nodeId",
          chunkId: exact.chunk.chunkId,
          rangeDescriptor: buildRangeFromBlock(globalModel, exact.chunk, exact.block),
          sourceRef: exact.sourceRef || null
        };
      }
    }
    const records = byHref.get(href) || [];
    if (!records.length) return null;
    const record = records[0];
    return {
      status: "approximate",
      reason: "href-matched-first-block",
      chunkId: record.chunk.chunkId,
      rangeDescriptor: buildRangeFromBlock(globalModel, record.chunk, record.block),
      sourceRef: record.sourceRef || null,
      warnings: [`Resolved href ${href} without exact fragment match.`]
    };
  }

  function resolveFromCfi(rawCfi, rawHref = "") {
    const parsed = parseCfiScalar(rawCfi);
    if (!parsed) return null;
    const hrefResult = rawHref ? resolveFromHref(rawHref) : null;

    if (parsed.approxSpineIndex != null && parsed.approxNodeIndex != null) {
      const exactNode = byNodeIndex.get(`${parsed.approxSpineIndex}:${parsed.approxNodeIndex}`) || null;
      if (exactNode) {
        return {
          status: hrefResult && hrefResult.status === "exact" ? "exact" : "approximate",
          reason: hrefResult && hrefResult.status === "exact" ? "href+nodeIndex" : "cfi-nodeIndex",
          chunkId: exactNode.chunk.chunkId,
          rangeDescriptor: buildRangeFromBlock(globalModel, exactNode.chunk, exactNode.block),
          sourceRef: exactNode.sourceRef || null,
          warnings:
            hrefResult && hrefResult.status !== "exact"
              ? [`CFI nodeIndex matched source nodeIndex ${parsed.approxNodeIndex}.`]
              : []
        };
      }
    }

    if (hrefResult) return hrefResult;

    if (parsed.approxSpineIndex != null) {
      const spineRecords = bySpineIndex.get(parsed.approxSpineIndex) || [];
      if (spineRecords.length) {
        const record = spineRecords[0];
        return {
          status: "approximate",
          reason: "cfi-spine-only",
          chunkId: record.chunk.chunkId,
          rangeDescriptor: buildRangeFromBlock(globalModel, record.chunk, record.block),
          sourceRef: record.sourceRef || null,
          warnings: [`Resolved CFI using spineIndex ${parsed.approxSpineIndex} only.`]
        };
      }
    }

    return {
      status: "unresolved",
      reason: "no-production-anchor",
      chunkId: "",
      rangeDescriptor: null,
      sourceRef: null,
      warnings: [`Unable to resolve CFI ${String(rawCfi).slice(0, 80)}.`]
    };
  }

  function resolveProductionNote(note) {
    const href = note?.href || note?.anchorHref || "";
    const currentShape = note && typeof note === "object" ? note : {};
    if (href) {
      const fromHref = resolveFromHref(href);
      if (fromHref && fromHref.status === "exact") return fromHref;
    }
    const cfi = currentShape.cfi || currentShape.anchor || "";
    if (cfi) {
      return resolveFromCfi(cfi, href);
    }
    if (href) {
      return (
        resolveFromHref(href) || {
          status: "unresolved",
          reason: "href-not-found",
          chunkId: "",
          rangeDescriptor: null,
          sourceRef: null,
          warnings: [`Unable to resolve href ${href}.`]
        }
      );
    }
    return {
      status: "unresolved",
      reason: "missing-cfi-and-href",
      chunkId: "",
      rangeDescriptor: null,
      sourceRef: null,
      warnings: ["Production note is missing both cfi and href."]
    };
  }

  function resolveProductionReadingState(readingState = {}) {
    const cfi = readingState?.cfi || "";
    const result = cfi ? resolveFromCfi(cfi, "") : null;
    if (result && result.rangeDescriptor) {
      return {
        status: result.status,
        reason: result.reason,
        protectedReadingState: {
          globalPosition: cloneRangeEdge(result.rangeDescriptor.start),
          productionSnapshot: {
            cfi: String(cfi || "")
          },
          updatedAt: readingState.updatedAt || Date.now()
        },
        warnings: result.warnings || []
      };
    }
    return {
      status: "unresolved",
      reason: "reading-state-unresolved",
      protectedReadingState: null,
      warnings: cfi ? [`Unable to resolve reading-state CFI ${cfi}.`] : ["Missing reading-state CFI."]
    };
  }

  return {
    globalModel,
    chunks,
    resolveFromHref,
    resolveFromCfi,
    resolveProductionNote,
    resolveProductionReadingState
  };
}

function cloneRangeEdge(edge) {
  return edge ? JSON.parse(JSON.stringify(edge)) : null;
}

export function normalizeProductionPayloadShape(payload) {
  if (Array.isArray(payload)) return { kind: "production-notes-array", notes: payload };
  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.notes)) {
      return {
        kind: payload.v ? "production-share-payload" : "production-notes-object",
        bookId: payload.bookId ? String(payload.bookId) : "",
        createdAt: payload.createdAt || 0,
        notes: payload.notes
      };
    }
    if (payload.notes && typeof payload.notes === "object") {
      let bookId = String(payload.bookId || payload.id || "").trim();
      if (!bookId) {
        const noteKeys = Object.keys(payload.notes).filter((key) => Array.isArray(payload.notes[key]));
        if (noteKeys.length === 1) bookId = noteKeys[0];
      }
      const notes = bookId && Array.isArray(payload.notes[bookId]) ? payload.notes[bookId] : [];
      return {
        kind: "production-snapshot-fragment",
        bookId,
        notes,
        readingState:
          bookId && payload.positions && payload.positions[bookId]
            ? payload.positions[bookId]
            : null
      };
    }
  }
  return { kind: "unknown", notes: [] };
}

export function collectResolverDiagnostics(resolutions = []) {
  const stats = {
    total: resolutions.length,
    exact: 0,
    approximate: 0,
    unresolved: 0,
    warnings: []
  };
  for (const item of resolutions) {
    if (item.status === "exact") stats.exact += 1;
    else if (item.status === "approximate") stats.approximate += 1;
    else stats.unresolved += 1;
    for (const warning of item.warnings || []) stats.warnings.push(warning);
  }
  stats.warnings = uniqueBy(stats.warnings, (value) => value);
  return stats;
}
