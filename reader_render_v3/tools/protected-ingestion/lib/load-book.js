#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function ensureExists(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing file: ${filePath}`);
  return filePath;
}

function stripTags(text) {
  return String(text || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function attrMap(src) {
  const map = {};
  String(src || "").replace(/([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*["']([^"']*)["']/g, (_, key, value) => {
    map[key] = value;
    return "";
  });
  return map;
}

function parseCurrentStorage(rootDir) {
  const manifestPath = path.join(rootDir, "book-manifest.json");
  const manifest = readJson(ensureExists(manifestPath));
  const metadata = manifest.metadata || {};
  const tocPath = path.join(rootDir, manifest.navigation && manifest.navigation.toc || "n/toc.json");
  const orderEntry = path.join(rootDir, manifest.readingOrder && manifest.readingOrder.entry || "");
  const tocPayload = fs.existsSync(tocPath) ? readJson(tocPath) : { i: [] };
  const orderPayload = readJson(ensureExists(orderEntry));
  const spineItems = (orderPayload.i || []).map((item, index) => ({
    spineIndex: index,
    spineId: String(item.i || `item-${index + 1}`),
    href: String(item.r || ""),
    absolutePath: path.join(rootDir, String(item.r || "")),
    linear: String(item.l || "yes"),
    properties: item.p || []
  }));
  const toc = (tocPayload.i || []).map((item, index) => ({
    id: `toc-${index + 1}`,
    label: String(item.t || "").trim(),
    href: String(item.h || "").trim()
  }));

  return {
    inputType: "current-storage",
    rootDir,
    bookId: path.basename(rootDir),
    metadata: {
      title: metadata.title || metadata.bookTitle || path.basename(rootDir),
      creators: metadata.creators || (metadata.creator ? [metadata.creator] : []),
      languages: metadata.languages || (metadata.language ? [metadata.language] : [])
    },
    spineItems,
    toc,
    cleanup() {}
  };
}

function parseLegacyExploded(rootDir) {
  const containerPath = ensureExists(path.join(rootDir, "META-INF", "container.xml"));
  const containerXml = readText(containerPath);
  const rootfileMatch = containerXml.match(/full-path=["']([^"']+)["']/i);
  if (!rootfileMatch) throw new Error(`Could not find OPF rootfile in ${containerPath}`);
  const opfRelativePath = rootfileMatch[1];
  const opfPath = ensureExists(path.join(rootDir, opfRelativePath));
  const opfXml = readText(opfPath);

  const manifestItems = {};
  const itemMatches = opfXml.matchAll(/<item\b([^>]+?)\/?>/gi);
  for (const match of itemMatches) {
    const attrs = attrMap(match[1]);
    if (attrs.id) manifestItems[attrs.id] = attrs;
  }

  const spineItems = [];
  const itemRefMatches = opfXml.matchAll(/<itemref\b([^>]+?)\/?>/gi);
  let spineIndex = 0;
  for (const match of itemRefMatches) {
    const attrs = attrMap(match[1]);
    const manifestItem = manifestItems[attrs.idref];
    if (!manifestItem || !manifestItem.href) continue;
    const baseDir = path.dirname(opfRelativePath);
    const href = path.posix.join(baseDir === "." ? "" : baseDir, manifestItem.href).replace(/\\/g, "/");
    spineItems.push({
      spineIndex,
      spineId: attrs.idref,
      href,
      absolutePath: path.join(rootDir, href),
      linear: String(attrs.linear || "yes"),
      properties: manifestItem.properties ? String(manifestItem.properties).split(/\s+/) : []
    });
    spineIndex += 1;
  }

  let toc = [];
  const ncxItem = Object.values(manifestItems).find((item) => String(item["media-type"] || "").includes("ncx"));
  if (ncxItem && ncxItem.href) {
    const baseDir = path.dirname(opfRelativePath);
    const ncxPath = ensureExists(path.join(rootDir, path.posix.join(baseDir === "." ? "" : baseDir, ncxItem.href)));
    const ncxXml = readText(ncxPath);
    toc = Array.from(ncxXml.matchAll(/<navPoint[\s\S]*?<text>([\s\S]*?)<\/text>[\s\S]*?<content[^>]+src=["']([^"']+)["']/gi)).map((match, index) => ({
      id: `toc-${index + 1}`,
      label: stripTags(match[1]),
      href: String(match[2] || "").trim()
    }));
  }

  const titleMatch = opfXml.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
  const creatorMatches = Array.from(opfXml.matchAll(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/gi));
  const languageMatches = Array.from(opfXml.matchAll(/<dc:language[^>]*>([\s\S]*?)<\/dc:language>/gi));

  return {
    inputType: "legacy-exploded",
    rootDir,
    bookId: path.basename(rootDir),
    metadata: {
      title: titleMatch ? stripTags(titleMatch[1]) : path.basename(rootDir),
      creators: creatorMatches.map((match) => stripTags(match[1])).filter(Boolean),
      languages: languageMatches.map((match) => stripTags(match[1])).filter(Boolean)
    },
    spineItems,
    toc,
    cleanup() {}
  };
}

function unzipEpub(epubPath) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "protected-build-"));
  execFileSync("unzip", ["-q", epubPath, "-d", tempDir], { stdio: "ignore" });
  return tempDir;
}

async function loadBook(input) {
  const candidate = path.resolve(input);
  if (!fs.existsSync(candidate)) throw new Error(`Input path does not exist: ${candidate}`);
  const stat = fs.statSync(candidate);
  if (stat.isFile() && /\.epub$/i.test(candidate)) {
    const tempDir = unzipEpub(candidate);
    const loaded = parseLegacyExploded(tempDir);
    loaded.inputType = "epub";
    loaded.cleanup = () => fs.rmSync(tempDir, { recursive: true, force: true });
    loaded.bookId = path.basename(candidate, path.extname(candidate));
    return loaded;
  }
  if (!stat.isDirectory()) throw new Error(`Unsupported input: ${candidate}`);
  if (fs.existsSync(path.join(candidate, "book-manifest.json"))) return parseCurrentStorage(candidate);
  if (fs.existsSync(path.join(candidate, "META-INF", "container.xml"))) return parseLegacyExploded(candidate);
  throw new Error(`Unsupported book root: ${candidate}`);
}

module.exports = { loadBook };
