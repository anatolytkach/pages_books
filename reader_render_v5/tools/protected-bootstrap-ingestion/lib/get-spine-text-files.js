import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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

function parseOpfManifest(opfXml) {
  const manifest = new Map();
  const itemPattern = /<item\b([^>]*)\/?>/gi;
  let match = itemPattern.exec(opfXml);
  while (match) {
    const attrs = {};
    const attrPattern = /([^\s=]+)\s*=\s*"([^"]*)"/g;
    let attrMatch = attrPattern.exec(match[1]);
    while (attrMatch) {
      attrs[attrMatch[1]] = attrMatch[2];
      attrMatch = attrPattern.exec(match[1]);
    }
    const id = String(attrs.id || "").trim();
    const href = String(attrs.href || "").trim();
    const mediaType = String(attrs["media-type"] || "").trim();
    if (id && href && mediaType === "application/xhtml+xml") {
      manifest.set(id, {
        href,
        properties: String(attrs.properties || "").trim()
      });
    }
    match = itemPattern.exec(opfXml);
  }
  return manifest;
}

function parseSpineRefs(opfXml) {
  const refs = [];
  const spineMatch = /<spine\b[^>]*>([\s\S]*?)<\/spine>/i.exec(opfXml);
  if (!spineMatch) {
    throw new Error("EPUB OPF is missing <spine>");
  }
  const itemrefPattern = /<itemref\b([^>]*)\/?>/gi;
  let match = itemrefPattern.exec(spineMatch[1]);
  while (match) {
    const attrs = {};
    const attrPattern = /([^\s=]+)\s*=\s*"([^"]*)"/g;
    let attrMatch = attrPattern.exec(match[1]);
    while (attrMatch) {
      attrs[attrMatch[1]] = attrMatch[2];
      attrMatch = attrPattern.exec(match[1]);
    }
    const idref = String(attrs.idref || "").trim();
    const linear = String(attrs.linear || "").trim().toLowerCase();
    if (idref && linear !== "no") {
      refs.push(idref);
    }
    match = itemrefPattern.exec(spineMatch[1]);
  }
  return refs;
}

export function getSpineTextFiles(inputRoot, options = {}) {
  const resolvedInputRoot = resolveInputRoot(inputRoot);
  if (!resolvedInputRoot) {
    return [];
  }
  const opfPath = path.join(resolvedInputRoot, "EPUB", "content.opf");
  if (!fs.existsSync(opfPath)) {
    throw new Error(`Missing EPUB OPF at ${opfPath}`);
  }
  const opfXml = fs.readFileSync(opfPath, "utf8");
  const manifest = parseOpfManifest(opfXml);
  const spineRefs = parseSpineRefs(opfXml);
  const includeCover = !!options.includeCover;
  const opfDir = path.dirname(opfPath);
  const files = [];

  for (const idref of spineRefs) {
    const item = manifest.get(idref);
    if (!item) {
      throw new Error(`Spine idref ${idref} is missing from OPF manifest`);
    }
    const normalizedHref = normalizePath(item.href);
    if (!normalizedHref.endsWith(".xhtml")) {
      continue;
    }
    if (!includeCover && normalizedHref === "text/cover.xhtml") {
      continue;
    }
    const textFilePath = path.resolve(opfDir, item.href);
    if (!fs.existsSync(textFilePath)) {
      throw new Error(`Spine document is missing on disk: ${textFilePath}`);
    }
    files.push({
      idref,
      href: normalizedHref,
      textFilePath,
      textHref: resolveTextHref(textFilePath, resolvedInputRoot),
      properties: item.properties
    });
  }

  return files;
}
