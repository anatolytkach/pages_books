import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { probeImageDimensions } from "./probe-image-dimensions.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, "..", "..", "..", "..");

function normalizePath(value) {
  return String(value || "").trim().replace(/\\/g, "/");
}

function resolvePublicRootPath(inputRoot) {
  const normalized = normalizePath(inputRoot);
  const marker = "/books/content/";
  const idx = normalized.indexOf(marker);
  if (idx === -1) return "";
  return `/books/content/${normalized.slice(idx + marker.length).replace(/^\/+/, "")}`;
}

function parseCoverXhtml(coverPath) {
  const source = fs.readFileSync(coverPath, "utf8");
  const imageMatch =
    source.match(/<image\b[^>]*xlink:href="([^"]+)"[^>]*width="([^"]+)"[^>]*height="([^"]+)"/i) ||
    source.match(/<image\b[^>]*width="([^"]+)"[^>]*height="([^"]+)"[^>]*xlink:href="([^"]+)"/i);
  if (!imageMatch) return null;

  let sourceHref = "";
  let widthRaw = "";
  let heightRaw = "";
  if (imageMatch[1] && imageMatch[1].includes("../")) {
    sourceHref = imageMatch[1];
    widthRaw = imageMatch[2];
    heightRaw = imageMatch[3];
  } else {
    widthRaw = imageMatch[1];
    heightRaw = imageMatch[2];
    sourceHref = imageMatch[3];
  }

  const resolvedHref = normalizePath(path.posix.join("EPUB", path.posix.normalize(path.posix.join("text", sourceHref))));
  if (!sourceHref || !resolvedHref) {
    return null;
  }

  const assetPath = path.resolve(path.dirname(coverPath), sourceHref);
  const probed = probeImageDimensions(assetPath);
  const fallbackWidthPx = Number(widthRaw || 0);
  const fallbackHeightPx = Number(heightRaw || 0);
  const intrinsicWidthPx = probed && Number.isFinite(probed.width) && probed.width > 0
    ? probed.width
    : (Number.isFinite(fallbackWidthPx) && fallbackWidthPx > 0 ? fallbackWidthPx : undefined);
  const intrinsicHeightPx = probed && Number.isFinite(probed.height) && probed.height > 0
    ? probed.height
    : (Number.isFinite(fallbackHeightPx) && fallbackHeightPx > 0 ? fallbackHeightPx : undefined);
  const preferredRenderWidthPx = Number.isFinite(fallbackWidthPx) && fallbackWidthPx > 0
    ? fallbackWidthPx
    : intrinsicWidthPx;
  const preferredRenderHeightPx = Number.isFinite(fallbackHeightPx) && fallbackHeightPx > 0
    ? fallbackHeightPx
    : intrinsicHeightPx;

  return {
    mediaRole: "shell-cover",
    sourceHref,
    resolvedHref,
    intrinsicWidthPx,
    intrinsicHeightPx,
    preferredRenderWidthPx,
    preferredRenderHeightPx,
    placement: "block"
  };
}

export function extractBookCover(inputRoot) {
  const normalizedInputRoot = String(inputRoot || "").trim();
  if (!normalizedInputRoot) {
    return {
      cover: null,
      publicRootPath: ""
    };
  }

  const resolvedInputRoot = fs.existsSync(path.resolve(normalizedInputRoot))
    ? path.resolve(normalizedInputRoot)
    : path.resolve(REPO_ROOT, normalizedInputRoot);
  const coverPath = path.join(resolvedInputRoot, "EPUB", "text", "cover.xhtml");
  return {
    cover: fs.existsSync(coverPath) ? parseCoverXhtml(coverPath) : null,
    publicRootPath: resolvePublicRootPath(resolvedInputRoot)
  };
}
