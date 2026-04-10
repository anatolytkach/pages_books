#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { loadBook } = require("./lib/load-book");
const { extractSpine } = require("./lib/extract-spine");
const { extractTextBlocks } = require("./lib/extract-text-blocks");
const { extractStyleSignals } = require("./lib/extract-style-signals");
const { chunkTextBlocks } = require("./lib/chunk-text-blocks");
const { extractFontAssets } = require("./lib/extract-font-assets");
const { buildSelectionLayer } = require("./lib/build-selection-layer");
const { buildGlyphLayer } = require("./lib/build-glyph-layer");
const { buildShapeLayer } = require("./lib/build-shape-layer");
const { buildReconstructionLayer } = require("./lib/build-reconstruction-layer");
const { buildProtectedManifest } = require("./lib/build-protected-manifest");
const { writeProtectedBook } = require("./lib/write-protected-book");

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return "";
  return process.argv[idx + 1] || "";
}

function parseNumber(flag, fallback) {
  const value = getArg(flag);
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function cleanText(value) {
  return String(value || "").trim();
}

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const WORKSPACE_ROOT = path.resolve(PROJECT_ROOT, "..");
const FONT_PLAN_PATH = path.join(PROJECT_ROOT, "artifacts", "protected-fonts", "font-plan.json");
const INDEX_ROOT = path.join(WORKSPACE_ROOT, "reader_lang_indexes");
const CONTENT_ROOT = path.join(WORKSPACE_ROOT, "books", "content");
const REGISTRY_PATH = path.join(WORKSPACE_ROOT, "tools", "state", "source_registry.json");
const OVERRIDES_PATH = path.join(WORKSPACE_ROOT, "tools", "state", "book_path_overrides.json");
const BUILD_LANG_INDEXES = path.join(WORKSPACE_ROOT, "tools", "catalog", "build_lang_indexes.py");
const BUILD_BOOK_LOCATIONS = path.join(WORKSPACE_ROOT, "tools", "catalog", "build_book_locations.py");
const DEFAULT_BUCKET = process.env.EPUB_PUBLISH_R2_BUCKET || "reader-books";
const DEFAULT_RCLONE_REMOTE = "r2";

function resolveInput(input) {
  const direct = path.resolve(input);
  const workspaceRelative = path.resolve(WORKSPACE_ROOT, input);
  return fs.existsSync(direct) ? direct : workspaceRelative;
}

function resolveOutput(output) {
  if (path.isAbsolute(output)) return output;
  return path.resolve(PROJECT_ROOT, output);
}

function readJson(filePath, fallback = null) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonSafe(filePath, fallback = {}) {
  try {
    return readJson(filePath, fallback);
  } catch (_) {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function log(message) {
  process.stdout.write(`[protected-build] ${message}\n`);
}

function quoteArg(value) {
  const raw = String(value);
  if (process.platform === "win32") {
    return `"${raw.replace(/"/g, '\\"')}"`;
  }
  return `'${raw.replace(/'/g, `'\\''`)}'`;
}

function runCommand(command, args, options = {}) {
  const opts = {
    cwd: WORKSPACE_ROOT,
    captureOutput: false,
    allowFailure: false,
    dryRun: false,
    ...options
  };
  const rendered = [command, ...args].map(quoteArg).join(" ");
  if (opts.dryRun) {
    log(`[dry-run] ${rendered}`);
    return { stdout: "", stderr: "", status: 0 };
  }
  const spawnOptions = {
    cwd: opts.cwd,
    encoding: "utf8",
    stdio: opts.captureOutput ? ["ignore", "pipe", "pipe"] : "inherit"
  };
  let result;
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(String(command))) {
    const cmdLine = [String(command), ...args.map(quoteArg)].join(" ");
    result = spawnSync("cmd.exe", ["/d", "/c", cmdLine], spawnOptions);
  } else {
    result = spawnSync(command, args, spawnOptions);
  }
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0 && !opts.allowFailure) {
    const details = opts.captureOutput ? `\n${result.stdout || ""}\n${result.stderr || ""}` : "";
    throw new Error(`Command failed (${result.status}): ${rendered}${details}`.trim());
  }
  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    status: result.status || 0
  };
}

function commandExists(command) {
  try {
    const probe = process.platform === "win32" ? "where" : "which";
    const result = runCommand(probe, [command], { captureOutput: true, allowFailure: true });
    return result.status === 0;
  } catch (_) {
    return false;
  }
}

function detectRcloneRemote(rcloneBin, preferredRemote) {
  const preferred = cleanText(preferredRemote).replace(/:+$/, "");
  if (preferred) return preferred;
  if (!commandExists(rcloneBin)) return "";
  const result = runCommand(rcloneBin, ["listremotes"], { captureOutput: true, allowFailure: true });
  if (result.status !== 0) return "";
  const remotes = result.stdout
    .split(/\r?\n/)
    .map((line) => cleanText(line).replace(/:+$/, ""))
    .filter(Boolean);
  return remotes.includes(DEFAULT_RCLONE_REMOTE) ? DEFAULT_RCLONE_REMOTE : "";
}

function iterFiles(rootDir) {
  const files = [];
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function snapshotMtimes(rootDir) {
  const snapshot = new Map();
  if (!fs.existsSync(rootDir)) return snapshot;
  for (const filePath of iterFiles(rootDir)) {
    const rel = path.relative(rootDir, filePath).replace(/\\/g, "/");
    snapshot.set(rel, fs.statSync(filePath).mtimeMs);
  }
  return snapshot;
}

function changedFiles(rootDir, before) {
  const changed = [];
  if (!fs.existsSync(rootDir)) return changed;
  for (const filePath of iterFiles(rootDir)) {
    const rel = path.relative(rootDir, filePath).replace(/\\/g, "/");
    if (!before.has(rel) || before.get(rel) !== fs.statSync(filePath).mtimeMs) {
      changed.push(filePath);
    }
  }
  return changed;
}

function uploadFileToR2(bucket, key, filePath, wranglerBin, dryRun) {
  runCommand(wranglerBin, ["r2", "object", "put", `${bucket}/${key}`, "--file", filePath, "--remote"], { dryRun });
}

function downloadFileFromR2(bucket, key, filePath, wranglerBin, dryRun) {
  runCommand(wranglerBin, ["r2", "object", "get", `${bucket}/${key}`, "--file", filePath, "--remote"], {
    dryRun,
    allowFailure: true
  });
}

function uploadDirectory(prefix, sourceDir, options) {
  const normalizedPrefix = cleanText(prefix).replace(/^\/+|\/+$/g, "");
  if (options.rcloneRemote) {
    runCommand(options.rcloneBin, ["copy", sourceDir, `${options.rcloneRemote}:${options.bucket}/${normalizedPrefix}`], { dryRun: options.dryRun });
    return;
  }
  for (const filePath of iterFiles(sourceDir)) {
    const rel = path.relative(sourceDir, filePath).replace(/\\/g, "/");
    uploadFileToR2(options.bucket, `${normalizedPrefix}/${rel}`, filePath, options.wranglerBin, options.dryRun);
  }
}

function uploadApiFiles(files, indexRoot, options) {
  if (!files.length) return;
  if (options.rcloneRemote) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "protected-api-upload-"));
    try {
      for (const filePath of files) {
        const rel = path.relative(indexRoot, filePath);
        const stagedPath = path.join(tmpDir, rel);
        fs.mkdirSync(path.dirname(stagedPath), { recursive: true });
        fs.copyFileSync(filePath, stagedPath);
      }
      runCommand(options.rcloneBin, ["copy", tmpDir, `${options.rcloneRemote}:${options.bucket}/api`], { dryRun: options.dryRun });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    return;
  }
  for (const filePath of files) {
    const rel = path.relative(indexRoot, filePath).replace(/\\/g, "/");
    uploadFileToR2(options.bucket, `api/${rel}`, filePath, options.wranglerBin, options.dryRun);
  }
}

function readRemoteCatalogJson(bucket, key, wranglerBin, dryRun, fallback) {
  if (dryRun) {
    log(`[dry-run] would read ${bucket}/${key}`);
    return fallback;
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "protected-r2-read-"));
  const tempPath = path.join(tempDir, "payload.json");
  try {
    const result = downloadFileFromR2(bucket, key, tempPath, wranglerBin, false);
    if (!fs.existsSync(tempPath)) return fallback;
    return readJsonSafe(tempPath, fallback);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function writeRemoteCatalogJson(bucket, key, payload, wranglerBin, dryRun) {
  if (dryRun) {
    log(`[dry-run] would write ${bucket}/${key}`);
    return;
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "protected-r2-write-"));
  const tempPath = path.join(tempDir, "payload.json");
  try {
    writeJson(tempPath, payload);
    uploadFileToR2(bucket, key, tempPath, wranglerBin, false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function relativeBookContentPath(bookId) {
  return `/books/content/${bookId}/`;
}

function shardForReaderId(value) {
  const raw = cleanText(value);
  if (!raw) return "00";
  if (/^\d+$/.test(raw)) return String(parseInt(raw, 10) % 100).padStart(2, "0");
  let total = 0;
  for (let index = 0; index < raw.length; index += 1) {
    total = (total + raw.charCodeAt(index)) % 100;
  }
  return String(total).padStart(2, "0");
}

function copyDirectory(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
      continue;
    }
    if (entry.isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function updateOverridesFile(overridesPath, bookId, fields, dryRun) {
  const payload = readJsonSafe(overridesPath, {}) || {};
  const items = payload.items && typeof payload.items === "object" ? payload.items : {};
  const existing = items[String(bookId)] && typeof items[String(bookId)] === "object" ? items[String(bookId)] : {};
  items[String(bookId)] = {
    ...existing,
    ...fields
  };
  payload.version = payload.version || "1";
  payload.generatedAt = new Date().toISOString();
  payload.items = items;
  if (dryRun) {
    log(`[dry-run] would update ${overridesPath} for bookId=${bookId}`);
    return;
  }
  writeJson(overridesPath, payload);
}

function loadRegistryByReaderId(registryPath) {
  const data = readJsonSafe(registryPath, {}) || {};
  const byReaderId = new Map();
  for (const [source, items] of Object.entries(data)) {
    if (source === "defaults" || !items || typeof items !== "object") continue;
    for (const [key, item] of Object.entries(items)) {
      if (!item || typeof item !== "object") continue;
      const readerId = cleanText(item.reader_id || key);
      if (!readerId) continue;
      byReaderId.set(readerId, {
        source,
        sourceBookId: cleanText(item.source_book_id || key) || readerId,
        localContentPath: cleanText(item.local_content_path || "")
      });
    }
  }
  return byReaderId;
}

function loadExistingCatalogIdentity(bookId, locationsPath, registryPath) {
  const locations = readJsonSafe(locationsPath, {}) || {};
  const locationItems = locations.items && typeof locations.items === "object" ? locations.items : {};
  const existingLocation = locationItems[String(bookId)] && typeof locationItems[String(bookId)] === "object"
    ? locationItems[String(bookId)]
    : null;
  if (existingLocation) {
    return {
      source: cleanText(existingLocation.source) || "gutenberg",
      sourceBookId: cleanText(existingLocation.sourceBookId) || String(bookId),
      localContentPath: cleanText(existingLocation.localContentPath) || relativeBookContentPath(bookId),
      publicContentPath: cleanText(existingLocation.contentPath) || relativeBookContentPath(bookId),
      targetPath: cleanText(existingLocation.targetPath) || relativeBookContentPath(bookId),
      publicPathMode: cleanText(existingLocation.publicPathMode) || "legacy"
    };
  }
  const registryByReaderId = loadRegistryByReaderId(registryPath);
  const registryItem = registryByReaderId.get(String(bookId));
  if (registryItem) {
    const source = cleanText(registryItem.source) || "gutenberg";
    const sourceBookId = cleanText(registryItem.sourceBookId) || String(bookId);
    const localContentPath = cleanText(registryItem.localContentPath) || relativeBookContentPath(bookId);
    return {
      source,
      sourceBookId,
      localContentPath,
      publicContentPath: localContentPath,
      targetPath: localContentPath,
      publicPathMode: "legacy"
    };
  }
  return {
    source: cleanText(getArg("--source")) || "gutenberg",
    sourceBookId: cleanText(getArg("--source-book-id")) || String(bookId),
    localContentPath: relativeBookContentPath(bookId),
    publicContentPath: cleanText(getArg("--public-content-path")) || (
      cleanText(getArg("--source")) && cleanText(getArg("--source")) !== "gutenberg"
        ? `/books/content/${cleanText(getArg("--source"))}/${cleanText(getArg("--source-book-id")) || String(bookId)}/`
        : relativeBookContentPath(bookId)
    ),
    targetPath: cleanText(getArg("--target-path")) || (
      cleanText(getArg("--source")) && cleanText(getArg("--source")) !== "gutenberg"
        ? `/books/content/${cleanText(getArg("--source"))}/${cleanText(getArg("--source-book-id")) || String(bookId)}/`
        : relativeBookContentPath(bookId)
    ),
    publicPathMode: cleanText(getArg("--source")) && cleanText(getArg("--source")) !== "gutenberg" ? "target" : "legacy"
  };
}

function prepareRegistrationContentRoot(book, bookId, contentRoot, catalogIdentity) {
  const candidate = path.join(contentRoot, String(bookId));
  if (fs.existsSync(candidate)) {
    return {
      contentRoot,
      localContentPath: catalogIdentity.localContentPath || relativeBookContentPath(bookId),
      cleanup() {}
    };
  }

  if (!book.rootDir || !fs.existsSync(book.rootDir)) {
    throw new Error(`Catalog registration requires local content for ${bookId}, but no extracted book root is available.`);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `protected-register-${bookId}-`));
  const stagedBookRoot = path.join(tempRoot, String(bookId));
  copyDirectory(book.rootDir, stagedBookRoot);
  return {
    contentRoot: tempRoot,
    localContentPath: relativeBookContentPath(bookId),
    cleanup() {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  };
}

function rebuildCatalogForBook(bookId, options) {
  runCommand(options.pythonBin, [
    BUILD_LANG_INDEXES,
    "--input", options.contentRoot,
    "--output", options.indexRoot,
    "--locations", options.locationsPath,
    "--registry", options.registryPath,
    "--overrides", options.overridesPath,
    "--book-id", String(bookId)
  ], { dryRun: options.dryRun });

  runCommand(options.pythonBin, [
    BUILD_BOOK_LOCATIONS,
    "--index-root", options.indexRoot,
    "--registry", options.registryPath,
    "--overrides", options.overridesPath,
    "--output", path.join(options.indexRoot, "book-locations.json"),
    "--shards-dir", path.join(options.indexRoot, "book-locations")
  ], { dryRun: options.dryRun });
}

function buildProtectedCatalogLocationItem(bookId, catalogIdentity, metadata, protectedPrefix) {
  const normalizedSource = cleanText(catalogIdentity.source) || "gutenberg";
  const normalizedSourceBookId = cleanText(catalogIdentity.sourceBookId) || String(bookId);
  const normalizedLocalContentPath = cleanText(catalogIdentity.localContentPath) || relativeBookContentPath(bookId);
  const normalizedTargetPath = cleanText(catalogIdentity.targetPath) || (
    normalizedSource !== "gutenberg"
      ? `/books/content/${normalizedSource}/${normalizedSourceBookId}/`
      : relativeBookContentPath(bookId)
  );
  const normalizedPublicPathMode = cleanText(catalogIdentity.publicPathMode) || "legacy";
  const normalizedPublicContentPath = cleanText(catalogIdentity.publicContentPath) || (
    normalizedPublicPathMode === "target" ? normalizedTargetPath : relativeBookContentPath(bookId)
  );
  const item = {
    readerId: String(bookId),
    legacyId: String(bookId),
    source: normalizedSource,
    sourceBookId: normalizedSourceBookId,
    legacyPath: relativeBookContentPath(bookId),
    localContentPath: normalizedLocalContentPath,
    contentPath: normalizedPublicContentPath,
    targetPath: normalizedTargetPath,
    publicPathMode: normalizedPublicPathMode,
    title: cleanText(metadata.title) || String(bookId),
    author: cleanText(metadata.author),
    cover: cleanText(metadata.cover),
    readerType: "protected",
    protectedContentPath: `/books/${cleanText(protectedPrefix)}`
  };
  return item;
}

function updateRemoteBookLocationIndexes(bookId, item, options) {
  const generatedAt = new Date().toISOString();
  const rootKey = "api/book-locations.json";
  const rootData = readRemoteCatalogJson(options.bucket, rootKey, options.wranglerBin, options.dryRun, {
    version: "1",
    generatedAt,
    count: 0,
    items: {}
  }) || {};
  if (!rootData.items || typeof rootData.items !== "object") rootData.items = {};
  rootData.version = "1";
  rootData.generatedAt = generatedAt;
  rootData.items[String(bookId)] = item;
  rootData.count = Object.keys(rootData.items).length;
  writeRemoteCatalogJson(options.bucket, rootKey, rootData, options.wranglerBin, options.dryRun);

  const normalizedSource = cleanText(item.source) || "gutenberg";
  const shard = shardForReaderId(item.sourceBookId || bookId);
  const sourceShardKey = `api/book-locations/${normalizedSource}/${shard}.json`;
  const shardData = readRemoteCatalogJson(options.bucket, sourceShardKey, options.wranglerBin, options.dryRun, {
    version: "1",
    generatedAt,
    source: normalizedSource,
    count: 0,
    shard,
    items: {}
  }) || {};
  if (!shardData.items || typeof shardData.items !== "object") shardData.items = {};
  shardData.version = "1";
  shardData.generatedAt = generatedAt;
  shardData.source = normalizedSource;
  shardData.shard = shard;
  shardData.items[String(item.sourceBookId || bookId)] = item;
  shardData.count = Object.keys(shardData.items).length;
  writeRemoteCatalogJson(options.bucket, sourceShardKey, shardData, options.wranglerBin, options.dryRun);
}

async function main() {
  const input = getArg("--input");
  const output = getArg("--output");
  const debugArtifactEnabled = hasFlag("--debug-artifact");
  const uploadEnabled = hasFlag("--upload") || hasFlag("--publish");
  const registerEnabled = hasFlag("--register") || hasFlag("--publish");
  const dryRun = hasFlag("--dry-run");
  if (!input || !output) {
    console.error("Usage: protected:build -- --input <path-to-book> --output <path-to-artifact> [--maxCharacters N] [--maxBlocks N] [--debug-artifact] [--upload] [--register] [--publish]");
    process.exit(1);
  }

  const config = {
    maxCharacters: parseNumber("--maxCharacters", 64000),
    maxBlocks: parseNumber("--maxBlocks", 900)
  };

  const resolvedInput = resolveInput(input);
  const resolvedOutput = resolveOutput(output);
  const fontPlan = fs.existsSync(FONT_PLAN_PATH) ? readJson(FONT_PLAN_PATH) : null;
  const book = await loadBook(resolvedInput);
  try {
    const bookId = cleanText(getArg("--book-id")) || cleanText(book.bookId);
    if (!bookId) {
      throw new Error("Could not determine bookId. Pass --book-id explicitly.");
    }

    const bucket = cleanText(getArg("--bucket")) || DEFAULT_BUCKET;
    const wranglerBin = cleanText(getArg("--wrangler-bin")) || process.env.WRANGLER_BIN || "wrangler";
    const rcloneBin = cleanText(getArg("--rclone-bin")) || process.env.RCLONE_BIN || "rclone";
    const rcloneRemote = hasFlag("--skip-rclone")
      ? ""
      : detectRcloneRemote(rcloneBin, cleanText(getArg("--rclone-remote")) || process.env.PROTECTED_RCLONE_REMOTE || "");
    const pythonBin = cleanText(getArg("--python-bin")) || process.env.PYTHON_BIN || "python";
    const indexRoot = path.resolve(cleanText(getArg("--index-root")) || INDEX_ROOT);
    const contentRoot = path.resolve(cleanText(getArg("--content-root")) || CONTENT_ROOT);
    const registryPath = path.resolve(cleanText(getArg("--registry")) || REGISTRY_PATH);
    const overridesPath = path.resolve(cleanText(getArg("--overrides")) || OVERRIDES_PATH);
    const locationsPath = path.join(indexRoot, "book-locations.json");
    const protectedPrefix = cleanText(getArg("--protected-prefix")) || `protected-content/${bookId}`;

    const spine = extractSpine(book);
    const extracted = extractTextBlocks({ book, spine });
    const styles = extractStyleSignals(extracted.blocks, { fontPlan });
    const fontAssets = extractFontAssets(book);
    const chunks = chunkTextBlocks(extracted.blocks, config);

    const runtimeChunks = [];
    const runtimeGlyphChunks = [];
    const runtimeShapeChunks = [];
    const debugChunks = [];
    const debugGlyphChunks = [];

    let globalStart = 0;
    for (const chunk of chunks) {
      const selectionLayer = buildSelectionLayer(chunk, { globalStart });
      const glyphLayer = buildGlyphLayer({
        bookId,
        chunkId: chunk.chunkId,
        blocks: chunk.blocks,
        styleRegistry: styles.styleRegistry
      });

      runtimeChunks.push({
        chunkId: chunk.chunkId,
        sourceRefs: chunk.sourceRefs,
        logicalBlockList: chunk.blocks.map((block) => ({
          blockId: block.blockId,
          blockType: block.blockType,
          textLength: block.text.length,
          labelHint: String(block.text || "").slice(0, 180),
          sourceRef: block.sourceRef,
          linkTargets: block.linkTargets,
          inlineIds: block.inlineIds,
          blockPresentation: block.blockPresentation,
          styleSignals: block.styleSignals
        })),
        renderLayer: {
          chunkGlyphsRef: `../glyphs/${chunk.chunkId}.glyphs.json`,
          glyphRuns: glyphLayer.renderRuns
        },
        selectionLayer: selectionLayer.runtime
      });

      runtimeGlyphChunks.push({
        chunkId: chunk.chunkId,
        seed: glyphLayer.seed,
        glyphs: Object.fromEntries(glyphLayer.runtimeGlyphs.map((glyph) => [glyph.glyphId, glyph])),
        substrate: buildReconstructionLayer({
          chunkId: chunk.chunkId,
          seed: glyphLayer.seed,
          internalGlyphs: glyphLayer.internalGlyphs
        })
      });
      runtimeShapeChunks.push(buildShapeLayer({
        chunkId: chunk.chunkId,
        internalGlyphs: glyphLayer.internalGlyphs,
        styleRegistry: styles.styleRegistry,
        fontAssets
      }));

      if (debugArtifactEnabled) {
        debugChunks.push({
          chunkId: chunk.chunkId,
          sourceRefs: chunk.sourceRefs,
          selectionLayer: selectionLayer.debug,
          logicalBlocks: chunk.blocks.map((block) => ({
            blockId: block.blockId,
            blockType: block.blockType,
            text: block.text,
            labelHint: String(block.text || "").slice(0, 180),
            sourceRef: block.sourceRef,
            linkTargets: block.linkTargets,
            inlineIds: block.inlineIds,
            blockPresentation: block.blockPresentation
          }))
        });

        debugGlyphChunks.push({
          chunkId: chunk.chunkId,
          seed: glyphLayer.seed,
          glyphs: Object.fromEntries(glyphLayer.debugGlyphs.map((glyph) => [glyph.glyphId, glyph]))
        });
      }

      globalStart = selectionLayer.runtime.chunkRange.end;
    }

    const built = buildProtectedManifest({
      book,
      toc: extracted.toc,
      runtimeChunks,
      runtimeGlyphChunks,
      runtimeShapeChunks,
      debugChunks,
      debugGlyphChunks,
      styles,
      fontPlan,
      debugArtifactEnabled
    });

    writeProtectedBook(resolvedOutput, built);
    log(`wrote local artifact to ${resolvedOutput}`);

    const metadata = {
      title: book && book.metadata ? book.metadata.title : "",
      author: book && book.metadata && Array.isArray(book.metadata.creators) ? book.metadata.creators.join(", ") : "",
      cover: ""
    };
    const canRebuildCatalogLocally = registerEnabled && fs.existsSync(indexRoot);
    const indexSnapshot = canRebuildCatalogLocally ? snapshotMtimes(indexRoot) : null;

    if (uploadEnabled) {
      uploadDirectory(protectedPrefix, resolvedOutput, {
        bucket,
        wranglerBin,
        rcloneBin,
        rcloneRemote,
        dryRun
      });
      log(`uploaded protected artifact to ${protectedPrefix}`);
    }

    if (registerEnabled) {
      const catalogIdentity = loadExistingCatalogIdentity(bookId, locationsPath, registryPath);
      if (canRebuildCatalogLocally) {
        const registrationContent = prepareRegistrationContentRoot(book, bookId, contentRoot, catalogIdentity);
        try {
          updateOverridesFile(overridesPath, bookId, {
            source: catalogIdentity.source,
            sourceBookId: catalogIdentity.sourceBookId,
            localContentPath: registrationContent.localContentPath,
            publicContentPath: catalogIdentity.publicContentPath,
            targetPath: catalogIdentity.targetPath,
            publicPathMode: catalogIdentity.publicPathMode,
            readerType: "protected",
            protectedContentPath: `/books/${protectedPrefix}`
          }, dryRun);
          rebuildCatalogForBook(bookId, {
            pythonBin,
            indexRoot,
            contentRoot: registrationContent.contentRoot,
            registryPath,
            overridesPath,
            locationsPath,
            dryRun
          });
          log(`rebuilt catalog metadata for book ${bookId}`);

          if (uploadEnabled && indexSnapshot) {
            const apiChanged = changedFiles(indexRoot, indexSnapshot);
            uploadApiFiles(apiChanged, indexRoot, {
              bucket,
              wranglerBin,
              rcloneBin,
              rcloneRemote,
              dryRun
            });
            log(`uploaded ${apiChanged.length} changed API files`);
          }
        } finally {
          registrationContent.cleanup();
        }
      } else if (uploadEnabled) {
        const locationItem = buildProtectedCatalogLocationItem(bookId, catalogIdentity, metadata, protectedPrefix);
        updateRemoteBookLocationIndexes(bookId, locationItem, {
          bucket,
          wranglerBin,
          dryRun
        });
        log(`patched remote catalog metadata for book ${bookId}`);
      } else {
        throw new Error(`Catalog registration for ${bookId} requires either a local index root at ${indexRoot} or --upload for remote patching.`);
      }
    }

    console.log(JSON.stringify({
      ok: true,
      input: resolvedInput,
      output: resolvedOutput,
      bookId,
      chunks: runtimeChunks.length,
      inputType: book.inputType,
      tocItems: (built.toc.items || []).length,
      debugArtifact: debugArtifactEnabled,
      uploadEnabled,
      registerEnabled,
      protectedPrefix,
      bucket,
      rcloneRemote: rcloneRemote || null
    }, null, 2));
  } finally {
    if (typeof book.cleanup === "function") {
      try { book.cleanup(); } catch (_) {}
    }
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
