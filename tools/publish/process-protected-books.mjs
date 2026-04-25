#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_API_BASE = process.env.READER_PUBLISH_API_BASE || "https://reader.pub/books/api/v1";
const DEFAULT_BUCKET = process.env.EPUB_PUBLISH_R2_BUCKET || "reader-books";
const DEFAULT_WRANGLER_BIN = process.env.WRANGLER_BIN || "wrangler";
const INTERNAL_TASK_SECRET = String(process.env.INTERNAL_TASK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeReaderType(value) {
  return cleanText(value).toLowerCase() === "protected" ? "protected" : "legacy";
}

function cloneJsonObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return { ...value };
  }
}

function getBookReaderConfig(book) {
  const manifest = cloneJsonObject(book?.manifest);
  const protectedState = manifest.protected && typeof manifest.protected === "object" && !Array.isArray(manifest.protected)
    ? cloneJsonObject(manifest.protected)
    : {};
  return {
    manifest,
    readerType: normalizeReaderType(manifest.readerType || manifest.reader_type || (protectedState.enabled ? "protected" : "")),
    protected: {
      ...protectedState,
      artifactStatus: cleanText(protectedState.artifactStatus).toLowerCase() || "pending",
      publishRequested: !!protectedState.publishRequested,
      protectedContentPath: cleanText(
        manifest.protectedContentPath ||
        manifest.protected_content_path ||
        protectedState.protectedContentPath ||
        protectedState.protected_content_path ||
        (book?.content_id ? `/books/protected-content/${book.content_id}` : "")
      ),
    },
  };
}

function buildManifest(existingManifest, contentId, patch = {}) {
  const manifest = cloneJsonObject(existingManifest);
  const protectedState = manifest.protected && typeof manifest.protected === "object" && !Array.isArray(manifest.protected)
    ? cloneJsonObject(manifest.protected)
    : {};
  manifest.readerType = "protected";
  manifest.protectedContentPath = cleanText(
    patch.protectedContentPath ||
    manifest.protectedContentPath ||
    protectedState.protectedContentPath ||
    `/books/protected-content/${contentId}`
  );
  manifest.protected = {
    ...protectedState,
    enabled: true,
    artifactStatus: cleanText(patch.artifactStatus || protectedState.artifactStatus || "pending"),
    publishRequested: patch.publishRequested !== undefined ? !!patch.publishRequested : !!protectedState.publishRequested,
    visibility: cleanText(patch.visibility || protectedState.visibility || "public") || "public",
    source: cleanText(patch.source || protectedState.source || ""),
    sourceBookId: cleanText(patch.sourceBookId || protectedState.sourceBookId || contentId) || contentId,
    tenantId: cleanText(patch.tenantId || protectedState.tenantId || ""),
    tenantSlug: cleanText(patch.tenantSlug || protectedState.tenantSlug || ""),
    protectedContentPath: manifest.protectedContentPath,
    lastError: patch.lastError !== undefined ? cleanText(patch.lastError) : cleanText(protectedState.lastError || ""),
    updatedAt: new Date().toISOString(),
  };
  return manifest;
}

function log(message) {
  process.stdout.write(`[protected-publish] ${message}\n`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: options.captureOutput ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.captureOutput ? `\n${result.stdout || ""}\n${result.stderr || ""}` : "";
    throw new Error(`Command failed (${result.status}): ${command} ${args.join(" ")}${detail}`);
  }
  return result;
}

async function sbFetch(pathname, { method = "GET", body } = {}) {
  const supabaseUrl = cleanText(process.env.SUPABASE_URL);
  const serviceKey = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  const headers = {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    "content-type": "application/json",
  };
  const response = await fetch(`${supabaseUrl}/rest/v1/${pathname}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(await response.text().catch(() => `HTTP ${response.status}`));
  }
  return response.json().catch(() => null);
}

async function listCandidateBooks(limit) {
  const data = await sbFetch(
    `books?status=eq.processing&select=id,content_id,visibility,manifest,published_by_tenant_id&order=updated_at.asc${limit ? `&limit=${limit}` : ""}`
  );
  return (Array.isArray(data) ? data : []).filter((book) => {
    const config = getBookReaderConfig(book);
    return config.readerType === "protected" && config.protected.publishRequested;
  });
}

async function fetchLatestSourceAsset(bookId) {
  const data = await sbFetch(`source_assets?book_id=eq.${bookId}&select=id,r2_key,filename,validation_status&order=created_at.desc&limit=1`);
  return Array.isArray(data) && data.length ? data[0] : null;
}

async function patchBookManifest(bookId, manifest) {
  await sbFetch(`books?id=eq.${bookId}`, {
    method: "PATCH",
    body: { manifest },
  });
}

async function finalizePublication(bookId) {
  const response = await fetch(`${DEFAULT_API_BASE}/publish/books/${bookId}/finalize-protected`, {
    method: "POST",
    headers: {
      "x-reader-internal-key": INTERNAL_TASK_SECRET,
    },
  });
  if (!response.ok) {
    throw new Error(await response.text().catch(() => `HTTP ${response.status}`));
  }
  return response.json().catch(() => null);
}

async function processBook(book) {
  const asset = await fetchLatestSourceAsset(book.id);
  if (!asset || !asset.r2_key) {
    throw new Error("Missing source asset");
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `protected-publish-${book.content_id}-`));
  try {
    const epubPath = path.join(tempDir, asset.filename || `${book.content_id}.epub`);
    const outputDir = path.join(tempDir, "artifact", String(book.content_id));
    run(DEFAULT_WRANGLER_BIN, ["r2", "object", "get", `${DEFAULT_BUCKET}/${asset.r2_key}`, "--file", epubPath, "--remote"]);
    run(process.execPath, [
      path.join(ROOT, "reader_render_v3", "tools", "protected-ingestion", "build-protected-book.js"),
      "--input", epubPath,
      "--output", outputDir,
      "--book-id", String(book.content_id),
      "--upload",
      "--bucket", DEFAULT_BUCKET,
      "--wrangler-bin", DEFAULT_WRANGLER_BIN,
      "--skip-rclone",
    ]);
    const manifest = buildManifest(book.manifest, String(book.content_id), {
      artifactStatus: "ready",
      protectedContentPath: `/books/protected-content/${book.content_id}`,
      lastError: "",
    });
    await patchBookManifest(book.id, manifest);
    await finalizePublication(book.id);
    log(`published protected book content_id=${book.content_id}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function markFailed(book, error) {
  const manifest = buildManifest(book.manifest, String(book.content_id), {
    artifactStatus: "failed",
    lastError: error.message || String(error),
  });
  await patchBookManifest(book.id, manifest);
}

async function main() {
  if (!INTERNAL_TASK_SECRET) {
    throw new Error("INTERNAL_TASK_SECRET or SUPABASE_SERVICE_ROLE_KEY is required");
  }
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg !== -1 ? parseInt(process.argv[limitArg + 1] || "0", 10) : 0;
  const books = await listCandidateBooks(limit > 0 ? limit : 0);
  if (!books.length) {
    log("no pending protected books");
    return;
  }
  for (const book of books) {
    try {
      await processBook(book);
    } catch (error) {
      await markFailed(book, error);
      log(`failed content_id=${book.content_id}: ${error.message || error}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
