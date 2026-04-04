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
  const output = args.output;
  const mode = args.mode || "to-protected";

  if (!artifact || !input || !output) {
    throw new Error(
      "Usage: node convert-production-notes.js --artifact <artifactRoot> --input <jsonFile> --output <jsonFile> --mode to-protected|to-production"
    );
  }

  const book = await loadCompatBook(artifact);
  const payload = await readJson(input);

  let result;
  if (mode === "to-protected") {
    result = await importProductionPayloadToProtected({ book, payload });
    await fs.writeFile(output, JSON.stringify(result.bundle, null, 2));
  } else if (mode === "to-production") {
    result = await exportProtectedAnnotationsToProduction({
      annotations: Array.isArray(payload.annotations) ? payload.annotations : [],
      bookId: payload.bookId || book.globalLocationModel.bookId,
      readingState: payload.readingState || null
    });
    await fs.writeFile(
      output,
      JSON.stringify(
        {
          notes: result.productionNotes,
          sharePayload: result.sharePayload,
          snapshotPatch: result.snapshotPatch,
          report: result.report
        },
        null,
        2
      )
    );
  } else {
    throw new Error(`Unsupported mode: ${mode}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode,
        artifact: path.resolve(artifact),
        input: path.resolve(input),
        output: path.resolve(output)
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
