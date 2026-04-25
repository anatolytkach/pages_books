#!/usr/bin/env node

const fs = require("fs");

function parseArgs(argv) {
  const args = {
    input: "",
    bookId: "19686",
    output: "",
    url: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--input") args.input = argv[++i] || "";
    else if (value === "--book") args.bookId = argv[++i] || args.bookId;
    else if (value === "--output") args.output = argv[++i] || "";
    else if (value === "--url") args.url = true;
  }
  return args;
}

function toBase64Url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.input) {
    throw new Error("Usage: make-notesz-fixture.js --input <production-notes.json> [--book 19686] [--output file] [--url]");
  }
  const raw = JSON.parse(fs.readFileSync(args.input, "utf8"));
  const notes = Array.isArray(raw) ? raw : Array.isArray(raw.notes) ? raw.notes : [];
  const token = toBase64Url(require("zlib").gzipSync(Buffer.from(JSON.stringify(notes), "utf8")));
  const payload = args.url
    ? `http://127.0.0.1:8788/books/reader/?i=${encodeURIComponent(args.bookId)}&reader=protected&renderMode=shape&metricsMode=shape&notesz=${encodeURIComponent(token)}`
    : token;
  if (args.output) {
    fs.writeFileSync(args.output, payload);
  } else {
    process.stdout.write(String(payload));
    if (!String(payload).endsWith("\n")) process.stdout.write("\n");
  }
}

try {
  main();
} catch (error) {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
}
