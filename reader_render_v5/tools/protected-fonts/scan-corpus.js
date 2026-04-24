#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const WORKSPACE_ROOT = path.resolve(ROOT, "..");
const ARTIFACTS_DIR = path.join(ROOT, "artifacts", "protected-fonts");
const OUTPUT = path.join(ARTIFACTS_DIR, "corpus-report.json");

function usage() {
  console.error("Usage: npm run protected:fonts:scan -- --input <path>");
  process.exit(1);
}

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return "";
  return process.argv[idx + 1] || "";
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function listDir(dir) {
  return fs.readdirSync(dir, { withFileTypes: true });
}

function isLikelyContentFile(filePath) {
  return /\.(xhtml|html|htm|xml|css|opf)$/i.test(filePath);
}

function normalizeWhitespace(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function blockForCodePoint(cp) {
  if (cp <= 0x007f) return "Basic Latin";
  if (cp <= 0x00ff) return "Latin-1 Supplement";
  if (cp >= 0x0100 && cp <= 0x024f) return "Latin Extended";
  if (cp >= 0x0370 && cp <= 0x03ff) return "Greek and Coptic";
  if (cp >= 0x0400 && cp <= 0x052f) return "Cyrillic";
  if (cp >= 0x0530 && cp <= 0x058f) return "Armenian";
  if (cp >= 0x0590 && cp <= 0x05ff) return "Hebrew";
  if (cp >= 0x0600 && cp <= 0x06ff) return "Arabic";
  if (cp >= 0x0900 && cp <= 0x097f) return "Devanagari";
  if (cp >= 0x0980 && cp <= 0x09ff) return "Bengali";
  if (cp >= 0x0a00 && cp <= 0x0a7f) return "Gurmukhi";
  if (cp >= 0x0a80 && cp <= 0x0aff) return "Gujarati";
  if (cp >= 0x0b00 && cp <= 0x0b7f) return "Oriya";
  if (cp >= 0x0b80 && cp <= 0x0bff) return "Tamil";
  if (cp >= 0x0c00 && cp <= 0x0c7f) return "Telugu";
  if (cp >= 0x0c80 && cp <= 0x0cff) return "Kannada";
  if (cp >= 0x0d00 && cp <= 0x0d7f) return "Malayalam";
  if (cp >= 0x0d80 && cp <= 0x0dff) return "Sinhala";
  if (cp >= 0x0e00 && cp <= 0x0e7f) return "Thai";
  if (cp >= 0x0e80 && cp <= 0x0eff) return "Lao";
  if (cp >= 0x1000 && cp <= 0x109f) return "Myanmar";
  if (cp >= 0x10a0 && cp <= 0x10ff) return "Georgian";
  if (cp >= 0x1200 && cp <= 0x137f) return "Ethiopic";
  if (cp >= 0x1780 && cp <= 0x17ff) return "Khmer";
  if (cp >= 0x3040 && cp <= 0x309f) return "Hiragana";
  if (cp >= 0x30a0 && cp <= 0x30ff) return "Katakana";
  if (cp >= 0x3100 && cp <= 0x312f) return "Bopomofo";
  if (cp >= 0x3400 && cp <= 0x9fff) return "CJK Unified Ideographs";
  if (cp >= 0xac00 && cp <= 0xd7af) return "Hangul Syllables";
  return "Other";
}

function scriptForChar(ch) {
  const scripts = [
    "Latin",
    "Greek",
    "Cyrillic",
    "Han",
    "Hiragana",
    "Katakana",
    "Hangul",
    "Hebrew",
    "Arabic",
    "Devanagari",
    "Bengali",
    "Gurmukhi",
    "Gujarati",
    "Oriya",
    "Tamil",
    "Telugu",
    "Kannada",
    "Malayalam",
    "Sinhala",
    "Thai",
    "Lao",
    "Myanmar",
    "Khmer",
    "Georgian",
    "Armenian",
    "Ethiopic"
  ];
  for (const script of scripts) {
    try {
      if (new RegExp(`\\p{Script=${script}}`, "u").test(ch)) return script;
    } catch (_) {
      break;
    }
  }
  return "Unknown";
}

function isSuperscriptChar(ch) {
  const cp = ch.codePointAt(0);
  return (
    (cp >= 0x2070 && cp <= 0x209f) ||
    "¹²³".includes(ch)
  );
}

function analyzeCss(cssText, report) {
  const text = String(cssText || "");
  const superMatch = text.match(/vertical-align\s*:\s*super/gi);
  if (superMatch) report.superscript.cssVerticalAlignSuper += superMatch.length;
  const boldMatch = text.match(/font-weight\s*:\s*(bold|[6-9]00)/gi);
  if (boldMatch) report.styleSignals.cssBold += boldMatch.length;
  const italicMatch = text.match(/font-style\s*:\s*italic/gi);
  if (italicMatch) report.styleSignals.cssItalic += italicMatch.length;
  const boldItalicRules =
    (text.match(/font-weight\s*:\s*(bold|[6-9]00)[^}]*font-style\s*:\s*italic/gi) || []).length +
    (text.match(/font-style\s*:\s*italic[^}]*font-weight\s*:\s*(bold|[6-9]00)/gi) || []).length;
  report.styleSignals.cssBoldItalic += boldItalicRules;
}

function stripTags(text) {
  return String(text || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function analyzeHtml(htmlText, report, relPath) {
  const html = String(htmlText || "");
  report.filesAnalyzed.push(relPath);

  const tagCounts = {
    sup: (html.match(/<sup\b/gi) || []).length,
    strong: (html.match(/<strong\b/gi) || []).length,
    bold: (html.match(/<b\b/gi) || []).length,
    italic: (html.match(/<i\b/gi) || []).length,
    emphasis: (html.match(/<em\b/gi) || []).length
  };

  report.superscript.supTags += tagCounts.sup;
  report.styleSignals.htmlBold += tagCounts.strong + tagCounts.bold;
  report.styleSignals.htmlItalic += tagCounts.italic + tagCounts.emphasis;

  const styleAttrs = html.match(/style\s*=\s*["'][^"']*["']/gi) || [];
  for (const attr of styleAttrs) analyzeCss(attr, report);

  const classAttrs = html.match(/class\s*=\s*["'][^"']*["']/gi) || [];
  for (const attr of classAttrs) {
    if (/sup/i.test(attr)) report.superscript.classHints += 1;
    if (/bold/i.test(attr)) report.styleSignals.classBoldHints += 1;
    if (/italic|emph/i.test(attr)) report.styleSignals.classItalicHints += 1;
  }

  const text = stripTags(html);
  for (const ch of text) {
    if (!ch || /\s/u.test(ch)) continue;
    const cp = ch.codePointAt(0);
    const cpKey = `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
    report.codePoints[cpKey] = (report.codePoints[cpKey] || 0) + 1;
    const script = scriptForChar(ch);
    report.scripts[script] = (report.scripts[script] || 0) + 1;
    const block = blockForCodePoint(cp);
    report.blocks[block] = (report.blocks[block] || 0) + 1;
    if (/\p{P}/u.test(ch)) report.punctuation[ch] = (report.punctuation[ch] || 0) + 1;
    if (isSuperscriptChar(ch)) report.superscript.unicodeSuperscripts += 1;
  }

  const boldItalicTagPairs =
    (html.match(/<(strong|b)\b[\s\S]*?<(em|i)\b/gi) || []).length +
    (html.match(/<(em|i)\b[\s\S]*?<(strong|b)\b/gi) || []).length;
  report.styleSignals.htmlBoldItalic += boldItalicTagPairs;
}

function detectExplodedBook(dir) {
  const metaInf = path.join(dir, "META-INF", "container.xml");
  if (fs.existsSync(metaInf)) return true;
  const entries = listDir(dir);
  if (entries.some((entry) => entry.isFile() && /^(book-manifest|reader1-manifest)\.json$/i.test(entry.name))) {
    return true;
  }
  if (entries.some((entry) => entry.isFile() && /\.(opf|xhtml|html)$/i.test(entry.name))) {
    return true;
  }
  if (entries.some((entry) => entry.isDirectory() && /^(META-INF|OEBPS|OPS|EPUB|c|r|n|o|s)$/i.test(entry.name))) {
    return true;
  }
  return false;
}

function walkFiles(rootDir) {
  const out = [];
  function walk(current) {
    for (const entry of listDir(current)) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(full);
    }
  }
  walk(rootDir);
  return out;
}

function unzipToTemp(epubPath) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "protected-fonts-"));
  execFileSync("unzip", ["-q", epubPath, "-d", tempRoot], { stdio: "ignore" });
  return tempRoot;
}

function collectBooks(inputPath) {
  const direct = path.resolve(inputPath);
  const workspaceRelative = path.resolve(WORKSPACE_ROOT, inputPath);
  const full = fs.existsSync(direct) ? direct : workspaceRelative;
  if (!fs.existsSync(full)) throw new Error(`Input path does not exist: ${full}`);
  const stat = fs.statSync(full);
  const books = [];
  if (stat.isFile()) {
    if (/\.epub$/i.test(full)) books.push({ type: "epub", path: full });
    return books;
  }
  function walk(current) {
    const entries = listDir(current);
    let treatedCurrentAsBook = false;
    if (detectExplodedBook(current)) {
      books.push({ type: "exploded", path: current });
      treatedCurrentAsBook = true;
    }
    for (const entry of entries) {
      const fullEntry = path.join(current, entry.name);
      if (entry.isFile() && /\.epub$/i.test(entry.name)) {
        books.push({ type: "epub", path: fullEntry });
      } else if (entry.isDirectory() && !treatedCurrentAsBook) {
        walk(fullEntry);
      }
    }
  }
  walk(full);
  return dedupeBooks(books);
}

function dedupeBooks(books) {
  const seen = new Set();
  return books.filter((book) => {
    const key = `${book.type}:${book.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function analyzeBook(book, report) {
  let rootDir = book.path;
  let cleanupDir = "";
  if (book.type === "epub") {
    rootDir = unzipToTemp(book.path);
    cleanupDir = rootDir;
  }
  try {
    const files = walkFiles(rootDir);
    for (const filePath of files) {
      if (!isLikelyContentFile(filePath)) continue;
      const rel = path.relative(rootDir, filePath);
      const text = readText(filePath);
      if (/\.css$/i.test(filePath)) analyzeCss(text, report);
      else analyzeHtml(text, report, `${book.type}:${rel}`);
    }
  } finally {
    if (cleanupDir) fs.rmSync(cleanupDir, { recursive: true, force: true });
  }
}

function summarizeTop(map, limit) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, value]) => ({ key, count: value }));
}

function main() {
  const input = getArg("--input");
  if (!input) usage();

  const books = collectBooks(input);
  if (!books.length) {
    throw new Error(`No EPUB files or exploded books found under ${input}`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    input: path.resolve(input),
    booksScanned: books.length,
    sources: books,
    filesAnalyzed: [],
    scripts: {},
    blocks: {},
    codePoints: {},
    punctuation: {},
    superscript: {
      supTags: 0,
      cssVerticalAlignSuper: 0,
      unicodeSuperscripts: 0,
      classHints: 0
    },
    styleSignals: {
      htmlBold: 0,
      htmlItalic: 0,
      htmlBoldItalic: 0,
      cssBold: 0,
      cssItalic: 0,
      cssBoldItalic: 0,
      classBoldHints: 0,
      classItalicHints: 0
    }
  };

  for (const book of books) analyzeBook(book, report);

  report.summary = {
    topScripts: summarizeTop(report.scripts, 12),
    topBlocks: summarizeTop(report.blocks, 20),
    topCodePoints: summarizeTop(report.codePoints, 40),
    topPunctuation: summarizeTop(report.punctuation, 20),
    detectedStyleNeeds: {
      bold: report.styleSignals.htmlBold > 0 || report.styleSignals.cssBold > 0,
      italic: report.styleSignals.htmlItalic > 0 || report.styleSignals.cssItalic > 0,
      boldItalic: report.styleSignals.htmlBoldItalic > 0 || report.styleSignals.cssBoldItalic > 0,
      superscript: Object.values(report.superscript).some(Boolean)
    },
    fingerprint: crypto.createHash("sha1").update(JSON.stringify({
      input: report.input,
      booksScanned: report.booksScanned,
      topScripts: report.scripts,
      topBlocks: report.blocks
    })).digest("hex")
  };

  writeJson(OUTPUT, report);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT)}`);
}

main();
