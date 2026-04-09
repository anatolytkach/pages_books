#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

import { buildGlobalLocationModel } from "../../runtime/protected-global-location.js";
import { importProductionPayloadToProtected } from "../../runtime/protected-production-import.js";
import { exportProtectedAnnotationsToProduction } from "../../runtime/protected-production-export.js";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    out[token.slice(2)] = argv[i + 1];
    i += 1;
  }
  return out;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function loadCompatBook(artifactRoot) {
  const root = path.resolve(artifactRoot);
  const manifest = await readJson(path.join(root, "manifest.json"));
  const locations = await readJson(path.join(root, "locations.json"));
  return {
    manifest,
    locations,
    globalLocationModel: buildGlobalLocationModel({ manifest, locations })
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const artifact = args.artifact;
  const input = args.input;
  if (!artifact || !input) {
    throw new Error("Usage: node check-annotation-compat.js --artifact <artifactRoot> --input <jsonFile>");
  }

  const [book, payload] = await Promise.all([loadCompatBook(artifact), readJson(input)]);
  const imported = await importProductionPayloadToProtected({ book, payload });
  const exported = await exportProtectedAnnotationsToProduction({
    annotations: imported.bundle.annotations,
    bookId: book.globalLocationModel.bookId,
    readingState: imported.bundle.readingState
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        artifact: path.resolve(artifact),
        input: path.resolve(input),
        importReport: imported.report,
        exportReport: exported.report,
        producedAnnotations: imported.bundle.annotations.length,
        producedProductionNotes: exported.productionNotes.length
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error.message || String(error)
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
