import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getSpineTextFiles } from "./get-spine-text-files.js";
import { probeImageDimensions } from "./probe-image-dimensions.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, "..", "..", "..", "..");

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

function resolveTextHref(filePath, inputRoot) {
  const relativePath = normalizePath(path.relative(inputRoot, filePath));
  return relativePath ? relativePath : "";
}

function toResolvedHref(textDirRelativePath, sourceHref) {
  return normalizePath(path.posix.normalize(path.posix.join(path.posix.dirname(textDirRelativePath), sourceHref)));
}

function parseStyleMap(styleValue) {
  const out = new Map();
  const raw = String(styleValue || "");
  raw.split(";").forEach((entry) => {
    const [rawKey, rawValue] = entry.split(":");
    const key = String(rawKey || "").trim().toLowerCase();
    const value = String(rawValue || "").trim();
    if (key && value) out.set(key, value);
  });
  return out;
}

function cssLengthToPx(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw || raw === "auto") return undefined;
  const match = raw.match(/^([0-9]*\.?[0-9]+)(px|in|cm|mm|pt|pc)$/);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const unit = match[2];
  switch (unit) {
    case "px": return amount;
    case "in": return amount * 96;
    case "cm": return amount * (96 / 2.54);
    case "mm": return amount * (96 / 25.4);
    case "pt": return amount * (96 / 72);
    case "pc": return amount * 16;
    default: return undefined;
  }
}

function extractPreferredGeometryFromTag(tag) {
  const attrs = tag.attrs || {};
  const styleMap = parseStyleMap(attrs.style || "");
  const widthFromStyle = cssLengthToPx(styleMap.get("width"));
  const heightFromStyle = cssLengthToPx(styleMap.get("height"));
  if (widthFromStyle && heightFromStyle) {
    return {
      preferredRenderWidthPx: widthFromStyle,
      preferredRenderHeightPx: heightFromStyle
    };
  }

  const widthFromAttr = cssLengthToPx(attrs.width ? `${attrs.width}px` : "");
  const heightFromAttr = cssLengthToPx(attrs.height ? `${attrs.height}px` : "");
  if (widthFromAttr && heightFromAttr) {
    return {
      preferredRenderWidthPx: widthFromAttr,
      preferredRenderHeightPx: heightFromAttr
    };
  }

  return {};
}

function parseAttributes(rawAttrs) {
  const attrs = {};
  const attrPattern = /([^\s=]+)\s*=\s*"([^"]*)"/g;
  let match = attrPattern.exec(rawAttrs);
  while (match) {
    attrs[match[1]] = match[2];
    match = attrPattern.exec(rawAttrs);
  }
  return attrs;
}

function probeIntrinsicGeometry(assetPath) {
  const probed = probeImageDimensions(assetPath);
  if (!probed || !Number.isFinite(probed.width) || !Number.isFinite(probed.height) || probed.width <= 0 || probed.height <= 0) {
    return {};
  }
  return {
    intrinsicWidthPx: probed.width,
    intrinsicHeightPx: probed.height
  };
}

function buildMediaItem({ mediaId, mediaRole, sourceHref, resolvedHref, assetPath, attrs, placement }) {
  const intrinsic = probeIntrinsicGeometry(assetPath);
  const preferred = extractPreferredGeometryFromTag({ attrs });
  const item = {
    mediaId,
    mediaRole,
    sourceHref,
    resolvedHref,
    ...intrinsic
  };
  if (placement) item.placement = placement;
  if (preferred.preferredRenderWidthPx && preferred.preferredRenderHeightPx) {
    item.preferredRenderWidthPx = preferred.preferredRenderWidthPx;
    item.preferredRenderHeightPx = preferred.preferredRenderHeightPx;
  }
  return item;
}

function extractInlineAvatars({ xhtml, textHref, inputRoot, textFilePath }) {
  const out = [];
  const avatarPattern = /<img\b([^>]*class="[^"]*\binline-avatar\b[^"]*"[^>]*)\/?>/gi;
  let match = avatarPattern.exec(xhtml);
  let index = 0;
  while (match) {
    index += 1;
    const attrs = parseAttributes(match[1]);
    const sourceHref = String(attrs.src || "").trim();
    if (sourceHref) {
      const assetPath = path.resolve(path.dirname(textFilePath), sourceHref);
      out.push({
        blockId: `${textHref.replace(/[^\w]+/g, "_")}-avatar-${String(index).padStart(4, "0")}`,
        sourceHref: textHref,
        mediaItems: [
          buildMediaItem({
            mediaId: `${textHref.replace(/[^\w]+/g, "_")}-media-${String(index).padStart(4, "0")}`,
            mediaRole: "inline-avatar",
            sourceHref,
            resolvedHref: toResolvedHref(textHref, sourceHref),
            assetPath,
            attrs,
            placement: "inline-avatar"
          })
        ]
      });
    }
    match = avatarPattern.exec(xhtml);
  }
  return out;
}

function extractContentImages({ xhtml, textHref, textFilePath }) {
  const out = [];
  const imageBlockPattern = /<p\b([^>]*)class="[^"]*\bimage-block\b[^"]*"[^>]*>\s*<img\b([^>]*)\/?>\s*<\/p>/gi;
  let match = imageBlockPattern.exec(xhtml);
  let index = 0;
  while (match) {
    index += 1;
    const attrs = parseAttributes(match[2]);
    const sourceHref = String(attrs.src || "").trim();
    if (sourceHref) {
      const assetPath = path.resolve(path.dirname(textFilePath), sourceHref);
      out.push({
        blockId: `${textHref.replace(/[^\w]+/g, "_")}-content-image-${String(index).padStart(4, "0")}`,
        sourceHref: textHref,
        mediaItems: [
          buildMediaItem({
            mediaId: `${textHref.replace(/[^\w]+/g, "_")}-content-media-${String(index).padStart(4, "0")}`,
            mediaRole: "content-image",
            sourceHref,
            resolvedHref: toResolvedHref(textHref, sourceHref),
            assetPath,
            attrs,
            placement: "block"
          })
        ]
      });
    }
    match = imageBlockPattern.exec(xhtml);
  }
  return out;
}

function extractSeparatorImages({ xhtml, textHref, textFilePath }) {
  const out = [];
  const separatorPattern = /<h2\b[^>]*>\s*<img\b([^>]*)\/?>\s*<\/h2>/gi;
  let match = separatorPattern.exec(xhtml);
  let index = 0;
  while (match) {
    index += 1;
    const attrs = parseAttributes(match[1]);
    const sourceHref = String(attrs.src || "").trim();
    if (sourceHref) {
      const assetPath = path.resolve(path.dirname(textFilePath), sourceHref);
      out.push({
        blockId: `${textHref.replace(/[^\w]+/g, "_")}-separator-image-${String(index).padStart(4, "0")}`,
        sourceHref: textHref,
        mediaItems: [
          buildMediaItem({
            mediaId: `${textHref.replace(/[^\w]+/g, "_")}-separator-media-${String(index).padStart(4, "0")}`,
            mediaRole: "separator-image",
            sourceHref,
            resolvedHref: toResolvedHref(textHref, sourceHref),
            assetPath,
            attrs,
            placement: "block"
          })
        ]
      });
    }
    match = separatorPattern.exec(xhtml);
  }
  return out;
}

export function extractNonCoverMedia(inputRoot) {
  const resolvedInputRoot = resolveInputRoot(inputRoot);
  if (!resolvedInputRoot) return [];
  const files = getSpineTextFiles(resolvedInputRoot, { includeCover: false });

  const blocks = [];
  for (const file of files) {
    const textFilePath = file.textFilePath;
    const xhtml = fs.readFileSync(textFilePath, "utf8");
    const textHref = file.textHref;
    blocks.push(
      ...extractInlineAvatars({ xhtml, textHref, inputRoot: resolvedInputRoot, textFilePath }),
      ...extractContentImages({ xhtml, textHref, textFilePath }),
      ...extractSeparatorImages({ xhtml, textHref, textFilePath })
    );
  }
  return blocks;
}
