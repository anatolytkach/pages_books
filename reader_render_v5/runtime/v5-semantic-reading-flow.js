function getEntrySourceHref(entry) {
  if (!entry || typeof entry !== "object") return "";
  if (entry.block && typeof entry.block === "object") {
    return String(entry.block.sourceHref || "").trim();
  }
  if (entry.container && typeof entry.container === "object") {
    return String(entry.container.sourceHref || "").trim();
  }
  return "";
}

function getEntryMediaRole(entry) {
  if (!entry || entry.entryType !== "media") return "";
  const media = Array.isArray(entry.block && entry.block.mediaItems) ? entry.block.mediaItems[0] : null;
  return String(media && media.mediaRole || "").trim();
}

function getEntryHeadingLevel(entry) {
  return Number.isInteger(entry && entry.block && entry.block.headingLevel) ? entry.block.headingLevel : null;
}

function isTextEntry(entry) {
  return !!(entry && entry.entryType === "text" && entry.block);
}

function isHeadingEntry(entry) {
  return isTextEntry(entry) && Number.isInteger(entry.block.headingLevel);
}

function isPlainParagraphEntry(entry) {
  return isTextEntry(entry) && !Number.isInteger(entry.block.headingLevel);
}

function isStandaloneMediaEntry(entry) {
  const role = getEntryMediaRole(entry);
  return role === "separator-image" || role === "content-image";
}

function isInlineAvatarEntry(entry) {
  return getEntryMediaRole(entry) === "inline-avatar";
}

function isSpeakerHeading(entry) {
  if (!isHeadingEntry(entry)) return false;
  if (entry.block.headingLevel !== 5) return false;
  const text = String(entry.block.textContent || "").trim();
  return !!text && text.length <= 120;
}

function shouldStartHeadingCluster(entry, nextEntry) {
  if (!isHeadingEntry(entry)) return false;
  const headingLevel = getEntryHeadingLevel(entry);
  if (!(headingLevel === 1 || headingLevel === 2)) return false;
  return !!nextEntry && getEntrySourceHref(nextEntry) === getEntrySourceHref(entry);
}

function shouldIncludeHeadingClusterEntry(entry, sourceHref, seenParagraph) {
  if (!entry) return false;
  if (getEntrySourceHref(entry) !== sourceHref) return false;
  if (isHeadingEntry(entry)) return true;
  if (isStandaloneMediaEntry(entry)) return !seenParagraph;
  return false;
}

function collectHeadingCluster(entries, startIndex) {
  const lead = entries[startIndex];
  const sourceHref = getEntrySourceHref(lead);
  const grouped = [lead];
  let index = startIndex + 1;
  let seenParagraph = false;

  while (index < entries.length) {
    const candidate = entries[index];
    if (!shouldIncludeHeadingClusterEntry(candidate, sourceHref, seenParagraph)) {
      if (isPlainParagraphEntry(candidate) && getEntrySourceHref(candidate) === sourceHref) {
        seenParagraph = true;
      }
      break;
    }
    grouped.push(candidate);
    index += 1;
  }

  if (grouped.length <= 1) {
    return null;
  }

  return {
    entryType: "heading-cluster",
    sourceHref,
    entries: grouped
  };
}

function collectCommentGroup(entries, startIndex) {
  const lead = entries[startIndex];
  const sourceHref = getEntrySourceHref(lead);
  const grouped = [lead];
  let index = startIndex + 1;
  let consumedText = false;

  if (index < entries.length && isSpeakerHeading(entries[index]) && getEntrySourceHref(entries[index]) === sourceHref) {
    grouped.push(entries[index]);
    index += 1;
  }

  while (index < entries.length) {
    const candidate = entries[index];
    if (getEntrySourceHref(candidate) !== sourceHref) break;
    if (isInlineAvatarEntry(candidate)) break;
    if (isHeadingEntry(candidate) && !isSpeakerHeading(candidate)) break;
    if (candidate.entryType === "ordered-list" || candidate.entryType === "blockquote" || candidate.entryType === "figure") break;
    if (candidate.entryType === "media" && getEntryMediaRole(candidate) !== "inline-avatar") break;
    if (!isTextEntry(candidate)) break;
    grouped.push(candidate);
    consumedText = true;
    index += 1;
  }

  if (!consumedText) {
    return null;
  }

  return {
    entryType: "comment-group",
    sourceHref,
    entries: grouped
  };
}

export function buildSemanticReadingFlow(structuredFlow) {
  const flow = structuredFlow && typeof structuredFlow === "object" ? structuredFlow : { entries: [] };
  const sourceEntries = Array.isArray(flow.entries) ? flow.entries : [];
  const entries = [];

  for (let index = 0; index < sourceEntries.length; index += 1) {
    const entry = sourceEntries[index];
    const nextEntry = sourceEntries[index + 1] || null;

    if (isInlineAvatarEntry(entry)) {
      const commentGroup = collectCommentGroup(sourceEntries, index);
      if (commentGroup) {
        entries.push(commentGroup);
        index += commentGroup.entries.length - 1;
        continue;
      }
    }

    if (shouldStartHeadingCluster(entry, nextEntry)) {
      const headingCluster = collectHeadingCluster(sourceEntries, index);
      if (headingCluster) {
        entries.push(headingCluster);
        index += headingCluster.entries.length - 1;
        continue;
      }
    }

    entries.push(entry);
  }

  return {
    mode: "semantic-reading-flow-v1",
    totalEntries: entries.length,
    entryCounts: entries.reduce((counts, entry) => {
      const key = String(entry && entry.entryType || "unknown");
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {}),
    entries
  };
}
