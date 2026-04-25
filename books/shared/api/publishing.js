import { api } from './core.js';

/** Upload a file (EPUB, DOCX, or ZIP) for publishing. */
export async function uploadBook(file) {
  return uploadBookForTenant(file, {});
}

/** Upload a file for publishing under a tenant context. */
export async function uploadBookForTenant(file, { tenant_id, tenant_slug } = {}) {
  const form = new FormData();
  form.append('file', file);
  if (tenant_id) form.append('tenant_id', tenant_id);
  if (tenant_slug) form.append('tenant_slug', tenant_slug);
  return api.post('/publish/upload', { body: form });
}

/** Fetch a book draft's current metadata. */
export async function getBookDraft(bookId) {
  return api.get(`/publish/books/${bookId}`);
}

/** Update metadata fields on a book draft. */
export async function updateBookMetadata(bookId, metadata) {
  return api.patch(`/publish/books/${bookId}/metadata`, { body: metadata });
}

/** Publish a book (transition from ready to published). */
export async function publishBook(bookId, { visibility } = {}) {
  return publishBookForTenant(bookId, { visibility });
}

/** Publish a book under a tenant context. */
export async function publishBookForTenant(bookId, { visibility, tenant_id, tenant_slug } = {}) {
  return api.post(`/publish/books/${bookId}/publish`, { body: { visibility, tenant_id, tenant_slug } });
}

