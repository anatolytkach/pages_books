#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const options = {};
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const eq = raw.indexOf("=");
    if (eq === -1) {
      options[raw.slice(2)] = "1";
      continue;
    }
    options[raw.slice(2, eq)] = raw.slice(eq + 1);
  }
  return options;
}

function requireOption(options, key) {
  const value = String(options[key] || "").trim();
  if (!value) {
    throw new Error(`Missing required option --${key}=...`);
  }
  return value;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function resolveBookBase(origin, bookId) {
  return `${String(origin || "https://reader.pub").replace(/\/$/, "")}/books/content/${encodeURIComponent(bookId)}`;
}

function extractContainerOpfRel(xml) {
  const match = String(xml || "").match(/<rootfile[^>]+full-path="([^"]+)"/i);
  if (!match) throw new Error("container.xml does not declare a rootfile");
  return match[1];
}

function extractManifestHrefs(opfText) {
  const hrefs = [];
  const pattern = /<item\b[^>]*\shref="([^"]+)"/gi;
  let match = null;
  while ((match = pattern.exec(opfText))) hrefs.push(match[1]);
  return hrefs;
}

async function fetchText(url) {
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.text();
}

async function fetchBytes(url) {
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const bookId = requireOption(options, "book-id");
  const outputDir = path.resolve(requireOption(options, "output"));
  const origin = String(options.origin || "https://reader.pub").trim() || "https://reader.pub";
  const base = resolveBookBase(origin, bookId);

  const containerText = await fetchText(`${base}/META-INF/container.xml`);
  const opfRel = extractContainerOpfRel(containerText);
  const opfText = await fetchText(`${base}/${opfRel}`);
  const opfDir = path.posix.dirname(opfRel);
  const manifestHrefs = extractManifestHrefs(opfText);
  const relPaths = unique([
    "META-INF/container.xml",
    opfRel,
    ...manifestHrefs.map((href) => path.posix.normalize(path.posix.join(opfDir, href))),
  ]);

  for (const relPath of relPaths) {
    const targetPath = path.join(outputDir, relPath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    const bytes = await fetchBytes(`${base}/${relPath}`);
    await writeFile(targetPath, bytes);
    process.stdout.write(`${relPath}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error && error.message ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
