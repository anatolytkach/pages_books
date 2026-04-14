#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function getArg(name, fallback = "") {
  for (const item of process.argv.slice(2)) {
    if (item.startsWith(`--${name}=`)) return item.slice(name.length + 3);
  }
  return fallback;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeText(filePath, text) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, text);
}

function writeBuffer(filePath, buffer) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, buffer);
}

function parseAttrs(src) {
  const out = {};
  String(src || "").replace(/([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*["']([^"']*)["']/g, (_m, key, value) => {
    out[key] = value;
    return "";
  });
  return out;
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

async function fetchText(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Fetch failed ${response.status} for ${url}`);
  return await response.text();
}

async function fetchBuffer(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Fetch failed ${response.status} for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const baseUrl = getArg("base-url");
  const outputDir = getArg("output");
  if (!baseUrl) throw new Error("Missing --base-url=<remote book root>");
  if (!outputDir) throw new Error("Missing --output=<local output dir>");

  const normalizedBase = String(baseUrl).endsWith("/") ? String(baseUrl) : `${String(baseUrl)}/`;
  const rootDir = path.resolve(outputDir);
  ensureDir(rootDir);

  const containerRel = "META-INF/container.xml";
  const containerXml = await fetchText(new URL(containerRel, normalizedBase).toString());
  writeText(path.join(rootDir, containerRel), containerXml);

  const rootfileMatch = containerXml.match(/full-path=["']([^"']+)["']/i);
  if (!rootfileMatch) throw new Error("Could not find OPF rootfile in container.xml");
  const opfRel = rootfileMatch[1];
  const opfXml = await fetchText(new URL(opfRel, normalizedBase).toString());
  writeText(path.join(rootDir, opfRel), opfXml);

  const manifestHrefs = [];
  for (const match of opfXml.matchAll(/<item\b([^>]+?)\/?>/gi)) {
    const attrs = parseAttrs(match[1]);
    if (attrs.href) {
      const rel = path.posix.join(path.posix.dirname(opfRel), attrs.href).replace(/\\/g, "/");
      manifestHrefs.push(rel);
    }
  }

  const extraFiles = ["mimetype"];
  const filesToFetch = unique([...extraFiles, ...manifestHrefs]).filter((rel) => rel !== ".");

  for (const rel of filesToFetch) {
    const remoteUrl = new URL(rel, normalizedBase).toString();
    const localPath = path.join(rootDir, rel);
    const buffer = await fetchBuffer(remoteUrl);
    writeBuffer(localPath, buffer);
  }

  const result = {
    ok: true,
    baseUrl: normalizedBase,
    outputDir: rootDir,
    opf: opfRel,
    fileCount: filesToFetch.length + 2
  };
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(String(error && error.stack ? error.stack : error));
  process.exit(1);
});
