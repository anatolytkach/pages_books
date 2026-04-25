function normalizeText(value) {
  return String(value || "").trim();
}

export function getCatalogBook(record) {
  const book = record && typeof record === "object" ? record : {};
  return {
    id: normalizeText(book.id),
    contentId: normalizeText(book.content_id),
    title: normalizeText(book.title),
    author: normalizeText(book.author),
    annotation: normalizeText(book.annotation),
    coverUrl: normalizeText(book.cover_url),
    genreId: normalizeText(book.genre_id),
    yearWritten: book.year_written ?? null,
    isbn: normalizeText(book.isbn),
    language: normalizeText(book.language),
    visibility: normalizeText(book.visibility) || "public",
    isFree: !!book.is_free,
    rights: {
      visibility: normalizeText(book.visibility) || "public",
      isFree: !!book.is_free,
      publishedByTenantId: normalizeText(book.published_by_tenant_id),
      publishedByUserId: normalizeText(book.published_by_user_id),
    },
  };
}

export function buildCatalogMetadataPatch(input = {}) {
  const patch = {};
  const allowed = ["title", "author", "genre_id", "year_written", "isbn", "language", "annotation", "cover_url", "visibility"];
  for (const key of allowed) {
    if (input[key] !== undefined) patch[key] = input[key];
  }
  return patch;
}

export function buildCatalogBookInsert({
  metadata = {},
  contentId = "",
  publishedByTenantId = null,
  publishedByUserId = "",
} = {}) {
  const patch = buildCatalogMetadataPatch(metadata);
  return {
    ...patch,
    content_id: String(contentId || "").trim(),
    published_by_tenant_id: publishedByTenantId || null,
    published_by_user_id: String(publishedByUserId || "").trim(),
  };
}

export function attachCatalogSnapshot(record) {
  return {
    ...(record || {}),
    catalog: getCatalogBook(record),
  };
}
