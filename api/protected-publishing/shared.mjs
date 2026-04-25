export function cloneJsonObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return { ...value };
  }
}

export function normalizeReaderType(value) {
  return String(value || "").trim().toLowerCase() === "protected" ? "protected" : "legacy";
}

export function parseProtectedFlag(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return false;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on" || raw === "protected";
}

export function getBookReaderConfig(book) {
  const manifest = cloneJsonObject(book?.manifest);
  const protectedState = manifest.protected && typeof manifest.protected === "object" && !Array.isArray(manifest.protected)
    ? cloneJsonObject(manifest.protected)
    : {};
  const readerType = normalizeReaderType(
    manifest.readerType ||
    manifest.reader_type ||
    (protectedState.enabled ? "protected" : "")
  );
  const contentId = String(book?.content_id || "").trim();
  const protectedContentPath = String(
    manifest.protectedContentPath ||
    manifest.protected_content_path ||
    protectedState.protectedContentPath ||
    protectedState.protected_content_path ||
    (contentId ? `/books/protected-content/${contentId}` : "")
  ).trim();
  return {
    manifest,
    readerType,
    protectedContentPath,
    protected: {
      ...protectedState,
      enabled: readerType === "protected",
      artifactStatus: String(protectedState.artifactStatus || "").trim().toLowerCase() || (readerType === "protected" ? "pending" : ""),
      publishRequested: !!protectedState.publishRequested,
      visibility: String(protectedState.visibility || book?.visibility || "public").trim() || "public",
      source: String(protectedState.source || "").trim(),
      sourceBookId: String(protectedState.sourceBookId || contentId).trim() || contentId,
      tenantId: String(protectedState.tenantId || book?.published_by_tenant_id || "").trim(),
      tenantSlug: String(protectedState.tenantSlug || book?.tenant?.slug || "").trim(),
      lastError: String(protectedState.lastError || "").trim(),
    },
  };
}

export function buildBookManifest(existingManifest, {
  readerType,
  contentId,
  artifactStatus,
  publishRequested,
  visibility,
  source,
  sourceBookId,
  tenantId,
  tenantSlug,
  protectedContentPath,
  lastError,
  publishedAt,
} = {}) {
  const manifest = cloneJsonObject(existingManifest);
  const nextReaderType = normalizeReaderType(readerType || manifest.readerType || manifest.reader_type);
  if (nextReaderType !== "protected") {
    manifest.readerType = "legacy";
    delete manifest.protectedContentPath;
    delete manifest.protected_content_path;
    delete manifest.protected;
    return manifest;
  }

  const protectedState = manifest.protected && typeof manifest.protected === "object" && !Array.isArray(manifest.protected)
    ? cloneJsonObject(manifest.protected)
    : {};
  const nextProtectedContentPath = String(
    protectedContentPath ||
    manifest.protectedContentPath ||
    manifest.protected_content_path ||
    protectedState.protectedContentPath ||
    protectedState.protected_content_path ||
    (contentId ? `/books/protected-content/${contentId}` : "")
  ).trim();

  manifest.readerType = "protected";
  manifest.protectedContentPath = nextProtectedContentPath;
  delete manifest.protected_content_path;
  manifest.protected = {
    ...protectedState,
    enabled: true,
    artifactStatus: artifactStatus || protectedState.artifactStatus || "pending",
    publishRequested: publishRequested !== undefined ? !!publishRequested : !!protectedState.publishRequested,
    visibility: String(visibility || protectedState.visibility || "public").trim() || "public",
    source: String(source || protectedState.source || "").trim(),
    sourceBookId: String(sourceBookId || protectedState.sourceBookId || contentId || "").trim(),
    tenantId: String(tenantId || protectedState.tenantId || "").trim(),
    tenantSlug: String(tenantSlug || protectedState.tenantSlug || "").trim(),
    protectedContentPath: nextProtectedContentPath,
    updatedAt: new Date().toISOString(),
  };
  if (lastError !== undefined) {
    manifest.protected.lastError = String(lastError || "").trim();
  }
  if (publishedAt !== undefined) {
    manifest.protected.publishedAt = publishedAt;
  }
  return manifest;
}

export function getRequestedReaderType(payload, existingBook = null) {
  const direct = String(
    payload?.reader_type ||
    payload?.readerType ||
    ""
  ).trim();
  if (direct) return normalizeReaderType(direct);
  if (parseProtectedFlag(payload?.protected)) return "protected";
  if (existingBook) return getBookReaderConfig(existingBook).readerType;
  return "legacy";
}
