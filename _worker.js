import { handlePublisherTaskRequest } from "./publisher_tasks/service.mjs";
import {
  completeProtectedPublishingUpload,
  createProtectedPublishingJob,
  downloadProtectedPublishingNormalizedEpub,
  failProtectedPublishingJob,
  finalizeProtectedPublishingJob,
  getProtectedPublishingJob,
  uploadProtectedPublishingCover,
  uploadProtectedPublishingSource,
  updateProtectedPublishingProgress,
} from "./api/protected-publishing/handlers.mjs";
import {
  buildBookManifest,
  getBookReaderConfig,
  getRequestedReaderType,
  normalizeReaderType,
} from "./api/protected-publishing/shared.mjs";
import { handleCatalogApiRoute } from "./api/catalog/handlers.mjs";
import { handleCommerceApiRoute } from "./api/commerce/handlers.mjs";
import { createApiContext } from "./api/shared/context.mjs";
import {
  buildApiOptionsResponse,
  getSupabaseAdminConfig as sharedGetSupabaseAdminConfig,
  jsonResponse,
  readJsonSafe as sharedReadJsonSafe,
  resolveBookContentAccessForRequest as sharedResolveBookContentAccessForRequest,
  sbFetchWithEnv as sharedSbFetchWithEnv,
  verifySupabaseJwt as sharedVerifySupabaseJwt,
} from "./api/shared/worker-helpers.mjs";
import { handleIdentityApiRoute } from "./api/identity/handlers.mjs";
import { handlePublishingApiRoute } from "./api/publishing/handlers.mjs";
import { handleReaderApiRoute } from "./api/reader/handlers.mjs";
import { handleReaderAccessApiRoute } from "./api/reader-access/handlers.mjs";

function notesShareCorsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "cache-control": "no-store",
  };
}

function randomShareId() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

function buildNotesShareCacheKey(shareId) {
  return new Request(`https://notes-share.reader.pub/${encodeURIComponent(String(shareId || ""))}`);
}

function buildSelectionShareCacheKey(shareId) {
  return new Request(`https://selection-share.reader.pub/${encodeURIComponent(String(shareId || ""))}`);
}

async function cachePutNotesShare(shareId, payload) {
  try {
    const cache = caches && caches.default ? caches.default : null;
    if (!cache) return false;
    const key = buildNotesShareCacheKey(shareId);
    const body = JSON.stringify(payload || {});
    const resp = new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=31536000",
      },
    });
    await cache.put(key, resp);
    return true;
  } catch (e) {}
  return false;
}

async function cachePutSelectionShare(shareId, payload) {
  try {
    const cache = caches && caches.default ? caches.default : null;
    if (!cache) return false;
    const key = buildSelectionShareCacheKey(shareId);
    const body = JSON.stringify(payload || {});
    const resp = new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=31536000",
      },
    });
    await cache.put(key, resp);
    return true;
  } catch (e) {}
  return false;
}

async function cacheGetNotesShare(shareId) {
  try {
    const cache = caches && caches.default ? caches.default : null;
    if (!cache) return null;
    const key = buildNotesShareCacheKey(shareId);
    const hit = await cache.match(key);
    if (!hit) return null;
    return await hit.json();
  } catch (e) {}
  return null;
}

async function cacheGetSelectionShare(shareId) {
  try {
    const cache = caches && caches.default ? caches.default : null;
    if (!cache) return null;
    const key = buildSelectionShareCacheKey(shareId);
    const hit = await cache.match(key);
    if (!hit) return null;
    return await hit.json();
  } catch (e) {}
  return null;
}

function normalizeNotes(raw) {
  const src = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const item of src) {
    if (!item || typeof item !== "object") continue;
    const cfi = String(item.cfi || "").trim();
    if (!cfi) continue;
    out.push({
      id: String(item.id || "").trim() || undefined,
      cfi,
      href: item.href == null ? null : String(item.href),
      quote: String(item.quote || "").slice(0, 2000),
      comment: String(item.comment || "").slice(0, 8000),
    });
    if (out.length >= 500) break;
  }
  return out;
}

/**
 * Verify a Supabase JWT by calling Supabase's auth API.
 * Supports both HS256 and ES256 tokens.
 * Returns the decoded payload { sub, email, role, ... } or null.
 */
async function verifySupabaseJwt(token, env) {
  try {
    const supabaseUrl = String(env.SUPABASE_URL || "").trim();
    const supabaseKey = String(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || "").trim();
    if (!supabaseUrl) return null;

    // Decode payload to get basic claims (sub, exp)
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(base64UrlDecode(parts[1]));

    // Check expiry locally first (avoid network call for expired tokens)
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    // Verify token by calling Supabase auth — this validates the signature server-side
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        "authorization": `Bearer ${token}`,
        "apikey": supabaseKey,
      },
    });

    if (!res.ok) return null;

    const user = await res.json();
    if (!user || !user.id) return null;

    // Return payload enriched with verified user id
    payload.sub = user.id;
    payload.email = user.email;
    return payload;
  } catch {
    return null;
  }
}

function getSupabaseAdminConfig(env) {
  const url = String(env?.SUPABASE_URL || "").trim();
  const key = String(env?.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) return null;
  return { url, key };
}

async function sbFetchWithEnv(env, table, { method = "GET", params = "", body, single = false } = {}, fetchImpl = fetch) {
  const sb = getSupabaseAdminConfig(env);
  if (!sb) return { data: null, error: "Supabase not configured" };
  const fetchUrl = `${sb.url}/rest/v1/${table}${params ? "?" + params : ""}`;
  const headers = {
    apikey: sb.key,
    authorization: `Bearer ${sb.key}`,
    "content-type": "application/json",
  };
  if (single) headers.accept = "application/vnd.pgrst.object+json";
  if (method === "POST" || method === "PATCH") headers.prefer = "return=representation";
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetchImpl(fetchUrl, opts);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { data: null, error: detail || `HTTP ${res.status}` };
  }
  const data = await res.json().catch(() => null);
  return { data, error: null };
}

async function getActiveUserTenantIdsForAccess(env, userId, fetchImpl = fetch) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return [];
  const { data, error } = await sbFetchWithEnv(env, "tenant_memberships", {
    params: `user_id=eq.${normalizedUserId}&is_active=eq.true&select=tenant_id`,
  }, fetchImpl);
  if (error || !Array.isArray(data)) return [];
  return [...new Set(data.map((row) => String(row.tenant_id || "").trim()).filter(Boolean))];
}

async function userCanAccessTenantBookForAccess(env, book, userId, fetchImpl = fetch) {
  if (!book || !userId) return false;
  if (String(book.published_by_user_id || "") === String(userId)) return true;
  const visibility = String(book.visibility || "");
  const tenantId = String(book.published_by_tenant_id || "").trim();
  if (visibility !== "tenant_only" || !tenantId) return false;
  const tenantIds = await getActiveUserTenantIdsForAccess(env, userId, fetchImpl);
  return tenantIds.includes(tenantId);
}

async function resolveBookContentAccessForRequest({ env, contentId, user = null, fetchImpl = fetch }) {
  const { data: book } = await sbFetchWithEnv(env, "books", {
    params: `content_id=eq.${contentId}&select=id,title,author,annotation,cover_url,status,is_free,visibility,published_by_tenant_id,published_by_user_id`,
    single: true,
  }, fetchImpl);

  if (!book) return { access: "full", type: "free", book: null, offers: [] };
  if (book.is_free) return { access: "full", type: "free", book, offers: [] };
  if (book.status !== "published") return { access: "full", type: "unpublished", book, offers: [] };
  if (user && book.published_by_user_id === user.sub) {
    return { access: "full", type: "publisher", book, offers: [] };
  }
  if (user && await userCanAccessTenantBookForAccess(env, book, user.sub, fetchImpl)) {
    return { access: "full", type: "tenant_membership", book, offers: [] };
  }

  if (user) {
    const { data: entitlements } = await sbFetchWithEnv(env, "entitlements", {
      params: `user_id=eq.${user.sub}&book_id=eq.${book.id}&is_active=eq.true&select=*&order=created_at.desc`,
    }, fetchImpl);
    if (entitlements && entitlements.length > 0) {
      for (const ent of entitlements) {
        if (ent.entitlement_type === "purchase") {
          return { access: "full", type: "purchase", book, offers: [] };
        }
        if (ent.entitlement_type === "rental" && (!ent.expires_at || new Date(ent.expires_at) > new Date())) {
          return { access: "full", type: "rental", expires_at: ent.expires_at, book, offers: [] };
        }
      }
    }
  }

  const { data: offers } = await sbFetchWithEnv(env, "book_offers", {
    params: `book_id=eq.${book.id}&is_active=eq.true&select=*`,
  }, fetchImpl);
  if (!offers || !offers.length) return { access: "full", type: "free", book, offers: [] };

  return { access: "none", type: "offers_required", book, offers };
}

/**
 * Process an EPUB file: validate, extract metadata, unpack to R2.
 * Runs inline in the Worker (no external service needed for Phase 1).
 * Uses the Web-standard DecompressionStream for ZIP handling.
 */
async function processEpub(env, fileBytes, bookId, contentId) {
  const zipEntries = await parseZipEntries(new Uint8Array(fileBytes));

  // Validate: must have META-INF/container.xml
  const containerEntry = zipEntries.find(e => e.filename === "META-INF/container.xml");
  if (!containerEntry) {
    throw new Error("Invalid EPUB: missing META-INF/container.xml");
  }

  // Check for DRM
  const encEntry = zipEntries.find(e => e.filename === "META-INF/encryption.xml");
  if (encEntry) {
    const encText = new TextDecoder().decode(encEntry.data);
    if (encText.includes("EncryptedData") && !encText.includes("algorithm=\"http://www.idpf.org/2008/embedding\"")) {
      throw new Error("EPUB contains DRM encryption and cannot be processed");
    }
  }

  // Parse container.xml to find OPF path
  const containerXml = new TextDecoder().decode(containerEntry.data);
  const opfPathMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!opfPathMatch) throw new Error("Cannot find OPF path in container.xml");
  const opfPath = opfPathMatch[1];

  // Parse OPF for metadata
  const opfEntry = zipEntries.find(e => e.filename === opfPath);
  if (!opfEntry) throw new Error(`OPF file not found: ${opfPath}`);
  const opfXml = new TextDecoder().decode(opfEntry.data);

  const title = extractXmlTag(opfXml, "dc:title") || extractXmlTag(opfXml, "title");
  // Extract all creators (multiple dc:creator elements)
  const creators = extractAllXmlTags(opfXml, "dc:creator");
  if (!creators.length) creators.push(...extractAllXmlTags(opfXml, "creator"));
  const author = creators.join(", ") || null;
  const language = extractXmlTag(opfXml, "dc:language") || extractXmlTag(opfXml, "language") || "und";

  // Find cover image
  let coverUrl = null;
  const coverMeta = opfXml.match(/name="cover"\s+content="([^"]+)"/);
  const coverProp = opfXml.match(/properties="cover-image"[^>]*href="([^"]+)"/);
  const coverProp2 = opfXml.match(/href="([^"]+)"[^>]*properties="cover-image"/);
  let coverHref = null;
  if (coverMeta) {
    const coverId = coverMeta[1];
    // Match <item> with this id — href may appear before or after id
    const itemMatch = opfXml.match(new RegExp(`id="${coverId}"[^>]*href="([^"]+)"`))
      || opfXml.match(new RegExp(`href="([^"]+)"[^>]*id="${coverId}"`));
    if (itemMatch) coverHref = itemMatch[1];
  } else if (coverProp) {
    coverHref = coverProp[1];
  } else if (coverProp2) {
    coverHref = coverProp2[1];
  }

  // Upload all files to R2 at content/<contentId>/
  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";

  for (const entry of zipEntries) {
    if (entry.filename.endsWith("/")) continue; // skip directories
    const r2Key = `content/${contentId}/${entry.filename}`;
    const contentType = guessContentType(entry.filename);
    await env.READER_BOOKS.put(r2Key, entry.data, {
      httpMetadata: { contentType },
    });
  }

  // Resolve cover URL
  if (coverHref) {
    const resolvedCover = coverHref.startsWith("/")
      ? coverHref.slice(1)
      : opfDir + coverHref;
    coverUrl = `/books/content/${contentId}/${resolvedCover}`;
  }

  return { title, author, language, coverUrl };
}

/**
 * Update R2 catalog indexes when a book is published.
 * Performs incremental updates to: author file, prefix tree, search tokens, letters.
 */
async function updateCatalogIndexes(env, book, options = {}) {
  if (!env.READER_BOOKS) return;

  const authorName = String(book.author || "").trim();
  const title = String(book.title || "").trim();
  const contentId = String(book.content_id || "");
  const coverUrl = book.cover_url || "";
  const language = String(book.language || "en").trim();
  const source = String(options.source || book.source || "manual").trim() || "manual";
  const sourceBookId = String(options.sourceBookId || contentId).trim() || contentId;
  const readerConfig = getBookReaderConfig(book);
  if (!authorName || !title || !contentId) return;

  const { authorKey, indexKey, indexKeyAscii, display: authorDisplay } = parseAuthorForIndex(authorName);

  // Update both root index (Unicode keys) and language-specific index
  // English uses ASCII-only keys; other languages use Unicode-aware keys
  const updates = [
    { apiPrefix: "api", useIndexKey: indexKey },
  ];
  if (language && language !== "und") {
    updates.push({
      apiPrefix: `api/lang/${language}`,
      useIndexKey: language === "en" ? indexKeyAscii : indexKey,
    });
  }

  for (const { apiPrefix, useIndexKey } of updates) {
    await updateCatalogIndexesForPrefix(env, apiPrefix, {
      authorKey, indexKey: useIndexKey, authorDisplay, title, contentId, coverUrl, source, sourceBookId,
    });
  }

  await updateBookLocationIndexes(env, {
    contentId,
    title,
    author: authorDisplay,
    coverUrl,
    source,
    sourceBookId,
    readerType: readerConfig.readerType,
    protectedContentPath: readerConfig.protectedContentPath,
  });

  await updateNewestDiscoveryIndexes(env, {
    contentId,
    title,
    author: authorDisplay,
    coverUrl,
    language,
    source,
    sourceBookId,
  });

  // 5. Update languages.json — ensure the book's language is listed
  if (language && language !== "und") {
    const langR2Key = "api/languages.json";
    let langData;
    try {
      const obj = await env.READER_BOOKS.get(langR2Key);
      langData = obj ? await obj.json() : null;
    } catch { langData = null; }

    if (!langData) langData = { languages: [] };

    const langEntry = langData.languages.find(l => l.code === language);
    if (langEntry) {
      langEntry.count = (langEntry.count || 0) + 1;
    } else {
      langData.languages.push({ code: language, count: 1 });
      langData.languages.sort((a, b) => (b.count || 0) - (a.count || 0));
    }

    await env.READER_BOOKS.put(langR2Key, JSON.stringify(langData), {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
    });
  }
}

async function updateNewestDiscoveryIndexes(env, { contentId, title, author, coverUrl, language, source, sourceBookId }) {
  const generatedAt = new Date().toISOString();
  const catalogAddedAt = generatedAt;
  const entry = {
    id: contentId,
    source: String(source || "manual"),
    legacyId: contentId,
    sourceBookId: String(sourceBookId || contentId),
    title: String(title || contentId),
    author: String(author || ""),
    cover: String(coverUrl || ""),
    language: String(language || ""),
    catalogAddedAt,
  };

  const prefixes = ["api"];
  if (language && language !== "und") {
    prefixes.push(`api/lang/${language}`);
  }

  for (const apiPrefix of prefixes) {
    const newestKey = `${apiPrefix}/discover/newest.json`;
    const payload = await getCatalogJson(env, newestKey, {
      windowDays: 30,
      generatedAt,
      count: 0,
      books: [],
    });
    const books = Array.isArray(payload && payload.books) ? payload.books : [];
    const withoutCurrent = books.filter((item) => String(item && (item.legacyId || item.id || "")) !== contentId);
    withoutCurrent.unshift(entry);
    const windowDays = Number(payload && payload.windowDays) > 0 ? Number(payload.windowDays) : 30;
    payload.windowDays = windowDays;
    payload.generatedAt = generatedAt;
    payload.books = withoutCurrent.slice(0, Math.max(100, books.length || 0));
    payload.count = payload.books.length;
    await putCatalogJson(env, newestKey, payload);
  }
}

async function updateCatalogIndexesForPrefix(env, apiPrefix, { authorKey, indexKey, authorDisplay, title, contentId, coverUrl, source, sourceBookId }) {
  const bookEntry = {
    id: contentId,
    source: String(source || "manual"),
    sourceBookId: String(sourceBookId || contentId),
    legacyId: contentId,
    title,
    cover: coverUrl || "",
  };

  // 1. Update author file: <apiPrefix>/a/<authorKey>.json
  const authorR2Key = `${apiPrefix}/a/${authorKey}.json`;
  let authorData;
  try {
    const obj = await env.READER_BOOKS.get(authorR2Key);
    authorData = obj ? await obj.json() : null;
  } catch { authorData = null; }

  if (!authorData) {
    authorData = { key: authorKey, name: authorDisplay, books: [] };
  }
  // Avoid duplicates
  if (!authorData.books.some(b => String(b.legacyId || b.id || "") === contentId)) {
    authorData.books.push(bookEntry);
    authorData.books.sort((a, b) => a.title.localeCompare(b.title));
  } else {
    const existingBook = authorData.books.find(b => String(b.legacyId || b.id || "") === contentId);
    if (existingBook) Object.assign(existingBook, bookEntry);
  }
  await env.READER_BOOKS.put(authorR2Key, JSON.stringify(authorData), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });

  // 2. Update prefix tree: walk the existing tree from 1-char prefix down
  // until we find a leaf node (has "authors" array), then insert there.
  // If no existing node, create a leaf at the deepest level we walk to.
  let inserted = false;
  for (let depth = 1; depth <= indexKey.length && !inserted; depth++) {
    const prefix = indexKey.slice(0, depth);
    const r2Key = `${apiPrefix}/p/${prefix}.json`;
    let prefixData;
    try {
      const obj = await env.READER_BOOKS.get(r2Key);
      prefixData = obj ? await obj.json() : null;
    } catch { prefixData = null; }

    if (!prefixData) {
      // No node at this level — we need to walk parent chain to add child pointer
      // But first check if parent exists and is a branch
      if (depth === 1) {
        // Create new leaf at single letter
        prefixData = { authorCount: 1, authors: [{ key: authorKey, name: authorDisplay, count: authorData.books.length }] };
        await env.READER_BOOKS.put(r2Key, JSON.stringify(prefixData), {
          httpMetadata: { contentType: "application/json; charset=utf-8" },
        });
        inserted = true;
      }
      // For deeper levels, the parent should create a child pointer — skip
      continue;
    }

    if (prefixData.authors) {
      // Leaf node: add author here
      if (!prefixData.authors.some(a => a.key === authorKey)) {
        prefixData.authors.push({ key: authorKey, name: authorDisplay, count: authorData.books.length });
        prefixData.authors.sort((a, b) => a.name.localeCompare(b.name));
        prefixData.authorCount = prefixData.authors.length;
      } else {
        const existing = prefixData.authors.find(a => a.key === authorKey);
        if (existing) existing.count = authorData.books.length;
      }
      await env.READER_BOOKS.put(r2Key, JSON.stringify(prefixData), {
        httpMetadata: { contentType: "application/json; charset=utf-8" },
      });
      inserted = true;
    } else if (prefixData.prefixes) {
      // Branch node: ensure child prefix exists, then continue walking down
      const childPrefix = indexKey.slice(0, depth + 1);
      const existing = prefixData.prefixes.find(p => p.prefix === childPrefix);
      if (!existing) {
        prefixData.prefixes.push({ prefix: childPrefix, count: 1 });
        prefixData.prefixes.sort((a, b) => a.prefix.localeCompare(b.prefix));
        prefixData.authorCount = prefixData.prefixes.reduce((sum, p) => sum + p.count, 0);
        await env.READER_BOOKS.put(r2Key, JSON.stringify(prefixData), {
          httpMetadata: { contentType: "application/json; charset=utf-8" },
        });
        // Create leaf at child level
        const childR2Key = `${apiPrefix}/p/${childPrefix}.json`;
        const childData = { authorCount: 1, authors: [{ key: authorKey, name: authorDisplay, count: authorData.books.length }] };
        await env.READER_BOOKS.put(childR2Key, JSON.stringify(childData), {
          httpMetadata: { contentType: "application/json; charset=utf-8" },
        });
        inserted = true;
      }
      // If child exists, continue walking deeper
    }
  }

  // 3. Update search tokens
  // Python generates: one author token (from index name) + one book token (from title)
  // Author entry format: { t: "a", k: authorKey, n: authorDisplay, c: bookCount }
  // Book entry format: { id: contentId, title, a: authorDisplay, k: authorKey, cover }

  // Helper: update a single search token file
  async function updateSearchToken(token, entry, dedupeKey, dedupeField) {
    const r2Key = `${apiPrefix}/search/${token}.json`;
    let searchData;
    try {
      const obj = await env.READER_BOOKS.get(r2Key);
      searchData = obj ? await obj.json() : null;
    } catch { searchData = null; }
    if (!searchData) searchData = { items: [] };

    const existing = searchData.items.find(i => i[dedupeField] === dedupeKey);
    if (!existing) {
      searchData.items.push(entry);
    } else {
      // Update existing entry
      Object.assign(existing, entry);
    }

    await env.READER_BOOKS.put(r2Key, JSON.stringify(searchData), {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
    });
  }

  // Search is global-only in the current catalog contract.
  if (apiPrefix === "api") {
    for (const authorToken of buildAuthorSearchTokens(authorDisplay)) {
      await updateSearchToken(authorToken, {
        t: "a",
        k: authorKey,
        n: authorDisplay,
        c: authorData.books.length,
      }, authorKey, "k");
    }

    // Keep the historical normalized-title token for compatibility.
    const titleNorm = normalizeIndex(title);
    const titleToken = titleNorm.length >= 3 ? titleNorm.slice(0, 3) : "";
    if (titleToken) {
      await updateSearchToken(titleToken, {
        id: contentId,
        source: String(source || "manual"),
        sourceBookId: String(sourceBookId || contentId),
        legacyId: contentId,
        title: title,
        a: authorDisplay,
        k: authorKey,
        cover: coverUrl || "",
      }, contentId, "id");
    }

    // Also add tokens from significant title words.
    const titleWords = buildBookSearchTokens(title);
    for (const token of titleWords) {
      if (token === titleToken) continue;
      await updateSearchToken(token, {
        id: contentId,
        source: String(source || "manual"),
        sourceBookId: String(sourceBookId || contentId),
        legacyId: contentId,
        title: title,
        a: authorDisplay,
        k: authorKey,
        cover: coverUrl || "",
      }, contentId, "id");
    }
  }

  // 4. Update letters.json (based on index key = last name first)
  const firstLetter = getFirstLetter(indexKey);
  const lettersR2Key = `${apiPrefix}/letters.json`;
  let lettersData;
  try {
    const obj = await env.READER_BOOKS.get(lettersR2Key);
    lettersData = obj ? await obj.json() : null;
  } catch { lettersData = null; }

  if (!lettersData) lettersData = { letters: [] };

  const letterEntry = lettersData.letters.find(l => l.key === firstLetter);
  if (letterEntry) {
    // Don't increment here — count represents unique authors, which is complex.
    // Just ensure the letter exists. Full recount would require reading all prefix files.
  } else {
    const displayLetter = firstLetter === "num" ? "#" : firstLetter.toUpperCase();
    lettersData.letters.push({ letter: displayLetter, key: firstLetter, count: 1 });
    lettersData.letters.sort((a, b) => a.letter.localeCompare(b.letter));
  }

  await env.READER_BOOKS.put(lettersR2Key, JSON.stringify(lettersData), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}

function shardForReaderId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "00";
  if (/^\d+$/.test(raw)) return String(parseInt(raw, 10) % 100).padStart(2, "0");
  let total = 0;
  for (let i = 0; i < raw.length; i++) total = (total + raw.charCodeAt(i)) % 100;
  return String(total).padStart(2, "0");
}

async function putCatalogJson(env, r2Key, payload) {
  await env.READER_BOOKS.put(r2Key, JSON.stringify(payload), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}

async function getCatalogJson(env, r2Key, fallback) {
  try {
    const obj = await env.READER_BOOKS.get(r2Key);
    return obj ? await obj.json() : fallback;
  } catch {
    return fallback;
  }
}

async function updateBookLocationIndexes(env, { contentId, title, author, coverUrl, source, sourceBookId, readerType, protectedContentPath }) {
  const generatedAt = new Date().toISOString();
  const normalizedSource = String(source || "manual").trim() || "manual";
  const normalizedSourceBookId = String(sourceBookId || contentId).trim() || contentId;
  const item = {
    readerId: contentId,
    legacyId: contentId,
    source: normalizedSource,
    sourceBookId: normalizedSourceBookId,
    legacyPath: `/books/content/${contentId}/`,
    localContentPath: `/books/content/${contentId}/`,
    contentPath: `/books/content/${contentId}/`,
    targetPath: `/books/content/${contentId}/`,
    publicPathMode: "legacy",
    title: String(title || contentId),
    author: String(author || ""),
    cover: String(coverUrl || ""),
    readerType: normalizeReaderType(readerType),
  };
  if (item.readerType === "protected" && String(protectedContentPath || "").trim()) {
    item.protectedContentPath = String(protectedContentPath).trim();
  }

  const rootKey = "api/book-locations.json";
  const rootData = await getCatalogJson(env, rootKey, { version: "1", generatedAt, count: 0, items: {} });
  if (!rootData || typeof rootData !== "object") return;
  if (!rootData.items || typeof rootData.items !== "object") rootData.items = {};
  rootData.version = "1";
  rootData.generatedAt = generatedAt;
  rootData.items[contentId] = item;
  rootData.count = Object.keys(rootData.items).length;
  await putCatalogJson(env, rootKey, rootData);

  const shard = shardForReaderId(contentId);
  const sourceShardKey = `api/book-locations/${normalizedSource}/${shard}.json`;
  const shardData = await getCatalogJson(env, sourceShardKey, {
    version: "1",
    generatedAt,
    source: normalizedSource,
    count: 0,
    shard,
    items: {},
  });
  if (!shardData.items || typeof shardData.items !== "object") shardData.items = {};
  shardData.version = "1";
  shardData.generatedAt = generatedAt;
  shardData.source = normalizedSource;
  shardData.shard = shard;
  shardData.items[contentId] = item;
  shardData.count = Object.keys(shardData.items).length;
  await putCatalogJson(env, sourceShardKey, shardData);
}

// ── Catalog index helpers (ported from build_lang_indexes.py) ──

/**
 * Strip diacritics: "Fiévée" → "Fievee"
 */
function stripDiacritics(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Normalize to Unicode-aware index key (keeps Cyrillic, CJK, etc.)
 * Matches Python's normalize_index()
 */
function normalizeIndex(value) {
  const base = stripDiacritics(String(value || "").replace(/\s+/g, " ").trim()).toLowerCase();
  return base.replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * Normalize to ASCII-only index key (for English language index)
 * Matches Python's normalize_index_ascii()
 */
function normalizeIndexAscii(value) {
  const base = stripDiacritics(String(value || "").replace(/\s+/g, " ").trim()).toLowerCase();
  return base.replace(/[^a-z0-9]+/g, "");
}

function normalizeSearchMatch(value) {
  return stripDiacritics(String(value || "").replace(/\s+/g, " ").trim()).toLowerCase();
}

/**
 * Parse author name following build_lang_indexes.py parse_author_name().
 * Handles suffixes (Jr., Sr., II, III), particles (van, von, de, la, etc.),
 * and "Last, First" vs "First Last" formats.
 *
 * Returns { authorKey, indexKey, indexKeyAscii, display }
 */
function parseAuthorForIndex(name) {
  const raw = String(name || "").replace(/\s+/g, " ").trim();
  if (!raw) return { authorKey: "", indexKey: "", indexKeyAscii: "", display: "" };

  let last, rest;
  if (raw.includes(",")) {
    const commaIdx = raw.indexOf(",");
    last = raw.slice(0, commaIdx).trim();
    rest = raw.slice(commaIdx + 1).trim();
  } else {
    const parts = raw.split(" ");
    if (parts.length === 1) {
      last = raw;
      rest = "";
    } else {
      const suffixes = new Set(["jr.", "jr", "sr.", "sr", "ii", "iii", "iv", "v"]);
      const particles = new Set([
        "da", "de", "del", "der", "di", "du", "la", "le",
        "van", "von", "st", "st.", "saint", "san",
        "den", "ter", "ten", "dos", "das",
        "della", "dell", "dall", "d'", "l'"
      ]);
      const lastToken = parts[parts.length - 1].toLowerCase();
      if (suffixes.has(lastToken) && parts.length >= 3) {
        last = parts.slice(-2).join(" ");
        rest = parts.slice(0, -2).join(" ");
      } else if (parts.length >= 3 && particles.has(parts[parts.length - 2].toLowerCase())) {
        last = parts.slice(-2).join(" ");
        rest = parts.slice(0, -2).join(" ");
      } else {
        last = parts[parts.length - 1];
        rest = parts.slice(0, -1).join(" ");
      }
    }
  }

  if (!last) last = raw;
  const display = rest ? `${last}, ${rest}` : last;
  const indexName = `${last} ${rest}`.trim();

  const authorKey = normalizeIndex(rest ? `${rest}${last}` : last);
  const indexKey = normalizeIndex(indexName);
  const indexKeyAscii = normalizeIndexAscii(indexName);

  return { authorKey, indexKey, indexKeyAscii, display };
}

const BOOK_SEARCH_STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "by",
]);

const BOOK_SEARCH_SERVICE_WORDS = new Set([
  "vol",
  "volume",
  "no",
  "part",
  "chapter",
]);

function tokenizeSearchWords(value) {
  return normalizeSearchMatch(value)
    .match(/[\p{L}\p{N}_]+/gu)
    ?.map((word) => word.replace(/_/g, ""))
    .filter(Boolean) || [];
}

function buildAuthorSearchTokens(value) {
  const tokens = [];
  const seen = new Set();
  for (const word of tokenizeSearchWords(value)) {
    if (word.length < 3) continue;
    if (BOOK_SEARCH_STOP_WORDS.has(word)) continue;
    const token = word.slice(0, 3);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
  return tokens;
}

function buildBookSearchTokens(value) {
  const tokens = [];
  const seen = new Set();
  for (const word of tokenizeSearchWords(value)) {
    if (word.length < 3) continue;
    if (BOOK_SEARCH_STOP_WORDS.has(word) || BOOK_SEARCH_SERVICE_WORDS.has(word)) continue;
    const token = word.slice(0, 3);
    if (seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
  return tokens;
}

function getFirstLetter(indexKey) {
  const ch = indexKey.charAt(0);
  if (ch >= "0" && ch <= "9") return "num";
  return ch;
}

function extractXmlTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function extractAllXmlTags(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "gi");
  const results = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    const val = m[1].trim();
    if (val) results.push(val);
  }
  return results;
}

function guessContentType(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  const map = {
    xml: "application/xml", opf: "application/oebps-package+xml",
    xhtml: "application/xhtml+xml", html: "text/html", htm: "text/html",
    css: "text/css", js: "application/javascript",
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    gif: "image/gif", svg: "image/svg+xml", webp: "image/webp",
    woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
    ncx: "application/x-dtbncx+xml", json: "application/json",
  };
  return map[ext] || "application/octet-stream";
}

/**
 * Minimal ZIP parser for EPUB files.
 * EPUBs are standard ZIP archives. This parses the central directory
 * and extracts all entries using DecompressionStream (Deflate).
 */
async function parseZipEntries(zipBytes) {
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  const entries = [];

  // Find End of Central Directory record (scan backwards)
  let eocdOffset = -1;
  for (let i = zipBytes.length - 22; i >= 0 && i >= zipBytes.length - 65558; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("Not a valid ZIP file");

  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const cdEntries = view.getUint16(eocdOffset + 10, true);

  let offset = cdOffset;
  for (let i = 0; i < cdEntries; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;

    const compression = view.getUint16(offset + 10, true);
    const compSize = view.getUint32(offset + 20, true);
    const uncompSize = view.getUint32(offset + 24, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);

    const filename = new TextDecoder().decode(zipBytes.slice(offset + 46, offset + 46 + nameLen));

    // Read local header to find actual data offset
    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen;

    const compressedData = zipBytes.slice(dataOffset, dataOffset + compSize);

    let data;
    if (compression === 0) {
      // Stored (no compression)
      data = compressedData;
    } else if (compression === 8) {
      // Deflate
      data = await inflateData(compressedData);
    } else {
      // Skip unsupported compression
      offset += 46 + nameLen + extraLen + commentLen;
      continue;
    }

    entries.push({ filename, data });
    offset += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

async function inflateData(compressedBytes) {
  // Use DecompressionStream (raw deflate)
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();

  writer.write(compressedBytes);
  writer.close();

  const chunks = [];
  let totalLen = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLen += value.length;
  }

  const result = new Uint8Array(totalLen);
  let pos = 0;
  for (const chunk of chunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  return result;
}

function base64UrlDecode(str) {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const binary = atob(s);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function base64UrlDecodeBytes(str) {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const binary = atob(s);
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
}

function decodeBase64Utf8(value) {
  const source = String(value || "");
  try {
    if (typeof atob === "function") {
      const binary = atob(source);
      const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
  } catch (e) {}
  try {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(source, "base64").toString("utf8");
    }
  } catch (e2) {}
  return "";
}

function parseBasicAuthCredentials(authorizationHeader) {
  const header = String(authorizationHeader || "").trim();
  const match = header.match(/^Basic\s+([A-Za-z0-9+/=]+)$/i);
  if (!match) return null;
  const decoded = decodeBase64Utf8(match[1]);
  const idx = decoded.indexOf(":");
  if (idx < 0) return null;
  return {
    user: decoded.slice(0, idx),
    pass: decoded.slice(idx + 1),
  };
}

function docsAuthUnauthorizedResponse(route) {
  const headers = new Headers({
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "www-authenticate": 'Basic realm="ReaderPub Docs", charset="UTF-8"',
  });
  headers.set("x-reader-worker", "1");
  headers.set("x-reader-route", route || "docs-auth");
  return new Response("Authentication required", { status: 401, headers });
}

function textResponse(body, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "content-type": "text/plain; charset=utf-8",
    ...extraHeaders,
  });
  headers.set("x-reader-worker", "1");
  return new Response(body, { status, headers });
}

function xmlResponse(body, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "content-type": "application/xml; charset=utf-8",
    ...extraHeaders,
  });
  headers.set("x-reader-worker", "1");
  return new Response(body, { status, headers });
}

function htmlResponse(body, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "content-type": "text/html; charset=utf-8",
    ...extraHeaders,
  });
  headers.set("x-reader-worker", "1");
  return new Response(body, { status, headers });
}

function stripTrailingSlash(path) {
  if (!path || path === "/") return "/";
  return path.replace(/\/+$/, "") || "/";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeXml(value) {
  return escapeHtml(value);
}

function sanitizeMetaDescription(value) {
  const source = String(value || "").replace(/\s+/g, " ").trim();
  if (source.length <= 160) return source;
  const cut = source.slice(0, 157).replace(/\s+\S*$/, "");
  return `${cut || source.slice(0, 157)}...`;
}

function formatAuthorDisplayName(value) {
  const source = String(value || "").trim();
  if (!source.includes(",")) return source;
  const parts = source
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (parts.length < 2) return source;
  return `${parts.slice(1).join(" ")} ${parts[0]}`.replace(/\s+/g, " ").trim();
}

function getReaderPreviewMetaIds(id) {
  const raw = String(id || "").trim();
  const ids = raw ? [raw] : [];
  if (/^900\d{1,}$/.test(raw)) {
    const unprotectedId = raw.slice(3).replace(/^0+/, "") || raw.slice(3);
    if (unprotectedId && !ids.includes(unprotectedId)) ids.push(unprotectedId);
  }
  return ids;
}

function normalizePreviewText(value, maxLength = 220) {
  const source = String(value || "").replace(/\s+/g, " ").trim();
  if (source.length <= maxLength) return source;
  const cut = source.slice(0, Math.max(0, maxLength - 1)).replace(/\s+\S*$/, "");
  return `${cut || source.slice(0, Math.max(0, maxLength - 1))}...`;
}

function buildReaderFallbackDescription(title, authorName) {
  const author = formatAuthorDisplayName(authorName) || String(authorName || "").trim();
  return `Read "${String(title || "").trim()}" by ${author} on ReaderPub.`;
}

async function resolveReaderPreviewMeta(env, url) {
  const id = String(url.searchParams.get("id") || url.searchParams.get("i") || "").trim();
  if (!id) return null;
  const shard = shardForReaderId(id);
  const source = String(url.searchParams.get("source") || "").trim();
  const candidates = [];
  if (source) candidates.push(await getCatalogJson(env, `api/book-locations/${source}/${shard}.json`, null));
  candidates.push(await getCatalogJson(env, `api/book-locations/${shard}.json`, null));
  if (source !== "gutenberg") candidates.push(await getCatalogJson(env, `api/book-locations/gutenberg/${shard}.json`, null));

  let item = null;
  for (const payload of candidates) {
    for (const candidateId of getReaderPreviewMetaIds(id)) {
      const found = payload && payload.items && payload.items[candidateId] ? payload.items[candidateId] : null;
      if (found) {
        item = found;
        break;
      }
    }
    if (item) break;
  }
  if (!item) return null;

  const title = String(item.title || "ReaderPub").trim();
  const author = formatAuthorDisplayName(item.author || item.creator || "");
  const quote = normalizePreviewText(url.searchParams.get("selectionText") || "", 240);
  const description = quote
    ? `${author ? `by ${author}. ` : ""}"${quote}"`
    : `${author ? `by ${author}. ` : ""}Read on ReaderPub.`;
  let image = String(item.cover || item.coverUrl || item.cover_url || "").trim();
  if (image && !/^https?:\/\//i.test(image)) {
    image = `${url.origin}${image.startsWith("/") ? "" : "/"}${image}`;
  }
  return {
    title,
    author,
    description: normalizePreviewText(description, 300),
    image,
    url: url.toString(),
  };
}

function buildReaderPreviewMetaTags(meta) {
  if (!meta) return "";
  return [
    `<meta property="og:site_name" content="ReaderPub" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(meta.url)}" />`,
    meta.image ? `<meta property="og:image" content="${escapeHtml(meta.image)}" />` : "",
    meta.image ? `<meta property="og:image:secure_url" content="${escapeHtml(meta.image)}" />` : "",
    meta.image ? `<meta property="og:image:type" content="image/jpeg" />` : "",
    meta.image ? `<meta property="og:image:width" content="600" />` : "",
    meta.image ? `<meta property="og:image:height" content="900" />` : "",
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    meta.image ? `<meta name="twitter:image" content="${escapeHtml(meta.image)}" />` : "",
    meta.author ? `<meta name="author" content="${escapeHtml(meta.author)}" />` : "",
  ].filter(Boolean).join("\n");
}

function normalizeSelectionSharePayload(raw) {
  if (!raw || typeof raw !== "object") return null;
  const readerType = String(raw.readerType || raw.reader || "").trim().toLowerCase();
  if (readerType === "protected") return normalizeProtectedSelectionSharePayload(raw);
  const bookId = String(raw.bookId || raw.id || raw.i || "").trim().slice(0, 200);
  const selectionCfi = String(raw.selectionCfi || raw.cfi || "").trim().slice(0, 2000);
  if (!bookId || !/^epubcfi\(/i.test(selectionCfi)) return null;
  const source = String(raw.source || "").trim().slice(0, 200);
  const selectionText = String(raw.selectionText || raw.text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  return {
    v: 1,
    type: "reader-selection",
    bookId,
    source,
    selectionCfi,
    selectionText,
    createdAt: Number(raw.createdAt || Date.now()) || Date.now(),
  };
}

function normalizeProtectedSelectionAnchor(rawAnchor) {
  let anchor = rawAnchor;
  if (typeof rawAnchor === "string") {
    try {
      anchor = JSON.parse(rawAnchor);
    } catch (_error) {
      return null;
    }
  }
  if (!anchor || typeof anchor !== "object") return null;
  const start = anchor.start && typeof anchor.start === "object" ? anchor.start : null;
  const end = anchor.end && typeof anchor.end === "object" ? anchor.end : null;
  if (!start || !end) return null;
  const bookId = String(anchor.bookId || start.bookId || end.bookId || "").trim().slice(0, 200);
  const startGlobal = Number(start.globalOffset);
  const endGlobal = Number(end.globalOffset);
  if (!bookId || !Number.isFinite(startGlobal) || !Number.isFinite(endGlobal) || startGlobal === endGlobal) {
    return null;
  }
  const clone = JSON.parse(JSON.stringify(anchor));
  clone.kind = String(clone.kind || "protected-range-v1").slice(0, 80);
  clone.bookId = bookId;
  return clone;
}

function normalizeProtectedSelectionSharePayload(raw) {
  const bookId = String(raw.bookId || raw.id || raw.i || raw.artifactBookId || raw.protectedArtifactBookId || "").trim().slice(0, 200);
  const artifactBookId = String(raw.artifactBookId || raw.protectedArtifactBookId || raw.protectedBookId || bookId).trim().slice(0, 200);
  const protectedAnchor = normalizeProtectedSelectionAnchor(
    raw.protectedAnchor || raw.selectionAnchor || raw.selectionRange || raw.rangeDescriptor
  );
  if (!bookId || !artifactBookId || !protectedAnchor) return null;
  const selectionText = String(raw.selectionText || raw.text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  return {
    v: 1,
    type: "reader-selection",
    readerType: "protected",
    bookId,
    artifactBookId,
    source: String(raw.source || "").trim().slice(0, 200),
    protectedArtifactSource: String(raw.protectedArtifactSource || raw.artifactSource || "").trim().slice(0, 80),
    protectedAllowAll: /^(1|true|yes|on)$/i.test(String(raw.protectedAllowAll || "").trim()) ? "1" : "",
    protectedUx: String(raw.protectedUx || "protected-shell").trim().slice(0, 80),
    renderMode: String(raw.renderMode || "shape").trim() === "text" ? "text" : "shape",
    metricsMode: String(raw.metricsMode || "shape").trim() === "text" ? "text" : "shape",
    protectedAnchor,
    selectionText,
    createdAt: Number(raw.createdAt || Date.now()) || Date.now(),
  };
}

function buildSelectionReaderUrl(origin, payload, options = {}) {
  const safePayload = normalizeSelectionSharePayload(payload);
  if (!safePayload) return "";
  const selectionShareId = String(options.selectionShareId || options.shareId || "").trim();
  if (safePayload.readerType === "protected") {
    const u = new URL("/books/protected/", origin);
    u.searchParams.set("id", safePayload.bookId);
    u.searchParams.set("reader", "protected");
    u.searchParams.set("protectedArtifactBookId", safePayload.artifactBookId || safePayload.bookId);
    if (safePayload.source) u.searchParams.set("source", safePayload.source);
    if (safePayload.protectedArtifactSource) u.searchParams.set("protectedArtifactSource", safePayload.protectedArtifactSource);
    if (safePayload.protectedAllowAll) u.searchParams.set("protectedAllowAll", safePayload.protectedAllowAll);
    u.searchParams.set("protectedUx", safePayload.protectedUx || "protected-shell");
    u.searchParams.set("renderMode", safePayload.renderMode || "shape");
    u.searchParams.set("metricsMode", safePayload.metricsMode || "shape");
    if (selectionShareId) {
      u.searchParams.set("selectionShareId", selectionShareId);
    } else {
      u.searchParams.set("protectedSelectionAnchor", JSON.stringify(safePayload.protectedAnchor));
    }
    if (safePayload.selectionText) u.searchParams.set("selectionText", safePayload.selectionText);
    return u.toString();
  }
  const u = new URL("/reader1/", origin);
  u.searchParams.set("id", safePayload.bookId);
  if (safePayload.source) u.searchParams.set("source", safePayload.source);
  u.searchParams.set("selectionCfi", safePayload.selectionCfi);
  if (safePayload.selectionText) u.searchParams.set("selectionText", safePayload.selectionText);
  u.hash = safePayload.selectionCfi;
  return u.toString();
}

async function getSelectionSharePayload(env, shareId, prefix) {
  let data = null;
  if (env.READER_BOOKS) {
    const obj = await env.READER_BOOKS.get(`${prefix}${shareId}.json`);
    if (obj) data = await obj.json();
  } else {
    data = await cacheGetSelectionShare(shareId);
  }
  return normalizeSelectionSharePayload(data);
}

function renderSelectionShareLandingPage(meta, targetUrl) {
  const metaTags = buildReaderPreviewMetaTags(meta);
  const safeTarget = escapeHtml(targetUrl);
  const title = escapeHtml((meta && meta.title) || "ReaderPub");
  const description = escapeHtml((meta && meta.description) || "Open this quote in ReaderPub.");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<meta name="description" content="${description}" />
${metaTags}
<link rel="canonical" href="${safeTarget}" />
<meta http-equiv="refresh" content="0;url=${safeTarget}" />
<script>window.location.replace(${JSON.stringify(targetUrl)});</script>
</head>
<body>
<main>
<p><a href="${safeTarget}">Open in ReaderPub</a></p>
</main>
</body>
</html>`;
}

function getRenderableBookDescription(book) {
  const title = String(book?.title || "").trim();
  const authorName = String(book?.authorName || "").trim();
  const description = String(book?.description || "").trim();
  const metaDescription = String(book?.meta_description || "").trim();
  const fallback = buildReaderFallbackDescription(title, authorName);
  const selected = description || metaDescription;
  if (!selected) return fallback;
  if (String(book?.description_source || "").trim() === "fallback_title_author") {
    return fallback;
  }
  if (/^(Read|Explore)\s+"[^"]+"\s+by\s+.+\s+on ReaderPub\.$/i.test(selected)) {
    return fallback;
  }
  return selected;
}

function normalizeComparableTitle(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, " ")
    .trim();
}

function serializeJsonForScript(value) {
  return JSON.stringify(value || {})
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function normalizePosthogHost(host) {
  const value = String(host || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value.replace(/\/$/, "");
  return `https://${value.replace(/\/$/, "")}`;
}

function getPosthogPublicConfig(env) {
  const key = String(env.READERPUB_POSTHOG_KEY || env.POSTHOG_KEY || "").trim();
  const host = normalizePosthogHost(
    String(env.READERPUB_POSTHOG_HOST || env.POSTHOG_HOST || "").trim()
  );
  const rawEnabled = String(env.READERPUB_POSTHOG_ENABLED || env.POSTHOG_ENABLED || "").trim();
  const enabled = /^(1|true|yes|on)$/i.test(rawEnabled) && !!key && !!host;
  return { enabled, key, host };
}

function buildSeoAnalyticsHtml(posthogConfig, pageData) {
  const config = posthogConfig || {};
  const pagePayload = pageData || {};
  return `
    <meta name="posthog-enabled" content="${config.enabled ? "true" : "false"}" />
    <meta name="posthog-key" content="${escapeHtml(config.key || "")}" />
    <meta name="posthog-host" content="${escapeHtml(config.host || "")}" />
    <script src="/books/shared/posthog.js"></script>
    <script>
      (function () {
        if (window.__readerpubSeoAnalyticsBooted) return;
        window.__readerpubSeoAnalyticsBooted = true;
        var pageData = ${serializeJsonForScript(pagePayload)};

        function buildClickPayload(anchor) {
          var href = String(anchor.getAttribute("href") || "");
          var destinationPath = "";
          var destinationHash = "";
          try {
            var url = new URL(href, window.location.href);
            destinationPath = url.pathname || "";
            destinationHash = url.hash || "";
          } catch (error) {}
          return Object.assign({}, pageData, {
            destination_path: destinationPath,
            destination_hash: destinationHash,
            cta_type: String(anchor.getAttribute("data-seo-cta-type") || "").trim(),
            link_text: String(anchor.getAttribute("data-seo-link-text") || anchor.textContent || "").trim(),
          });
        }

        try {
          if (window.ReaderPubAnalytics && typeof window.ReaderPubAnalytics.boot === "function") {
            window.ReaderPubAnalytics.boot();
            if (typeof window.ReaderPubAnalytics.captureSeoPageview === "function") {
              window.ReaderPubAnalytics.captureSeoPageview(pageData);
            }
          }
        } catch (error) {}

        document.addEventListener("click", function (event) {
          var target = event.target;
          if (!target || typeof target.closest !== "function") return;
          var anchor = target.closest("a[data-seo-track]");
          if (!anchor) return;
          try {
            if (!window.ReaderPubAnalytics || typeof window.ReaderPubAnalytics.boot !== "function") return;
            window.ReaderPubAnalytics.boot();
            var mode = String(anchor.getAttribute("data-seo-track") || "").trim();
            var payload = buildClickPayload(anchor);
            if (mode === "catalog" && typeof window.ReaderPubAnalytics.captureSeoToCatalog === "function") {
              window.ReaderPubAnalytics.captureSeoToCatalog(payload);
            } else if (mode === "reader" && typeof window.ReaderPubAnalytics.captureSeoToReader === "function") {
              window.ReaderPubAnalytics.captureSeoToReader(payload);
            }
          } catch (error) {}
        }, { capture: true });
      })();
    </script>`;
}

async function readBucketObject(env, key) {
  if (!env.READER_BOOKS) return null;
  return await env.READER_BOOKS.get(key);
}

function contentTypeFromR2Key(key) {
  const normalized = String(key || "").toLowerCase().split("?")[0];
  if (normalized.endsWith(".json")) return "application/json; charset=utf-8";
  if (normalized.endsWith(".html") || normalized.endsWith(".htm")) return "text/html; charset=utf-8";
  if (normalized.endsWith(".xhtml")) return "application/xhtml+xml; charset=utf-8";
  if (normalized.endsWith(".xml") || normalized.endsWith(".opf")) return "application/xml; charset=utf-8";
  if (normalized.endsWith(".ncx")) return "application/x-dtbncx+xml";
  if (normalized.endsWith(".css")) return "text/css; charset=utf-8";
  if (normalized.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (normalized.endsWith(".svg")) return "image/svg+xml";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".gif")) return "image/gif";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".avif")) return "image/avif";
  if (normalized.endsWith(".woff2")) return "font/woff2";
  if (normalized.endsWith(".woff")) return "font/woff";
  if (normalized.endsWith(".ttf")) return "font/ttf";
  if (normalized.endsWith(".otf")) return "font/otf";
  return "application/octet-stream";
}

async function readBucketText(env, key) {
  const object = await readBucketObject(env, key);
  if (!object) return null;
  if (typeof object.text === "function") return await object.text();
  if (typeof object.body === "string") return object.body;
  if (object.body instanceof Uint8Array) return new TextDecoder().decode(object.body);
  if (object.body) return await new Response(object.body).text();
  return "";
}

async function readBucketJson(env, key) {
  const text = await readBucketText(env, key);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

async function readSeoText(env, key) {
  return await readBucketText(env, `seo/${key}`);
}

async function readSeoJson(env, key) {
  const text = await readBucketText(env, `seo/${key}`);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

const SEO_SHARD_PREFIX_LENGTH = 2;
const SEO_SHARD_MAX_PREFIX_LENGTH = 8;

function seoShardPrefix(slug, prefixLength = SEO_SHARD_PREFIX_LENGTH) {
  const normalized = String(slug || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  if (!normalized) return "_".repeat(prefixLength);
  if (normalized.length >= prefixLength) {
    return normalized.slice(0, prefixLength);
  }
  return normalized + "_".repeat(prefixLength - normalized.length);
}

async function readSeoShardedJson(env, folder, slug) {
  for (let prefixLength = SEO_SHARD_MAX_PREFIX_LENGTH; prefixLength >= SEO_SHARD_PREFIX_LENGTH; prefixLength -= 1) {
    const prefix = seoShardPrefix(String(slug || "").slice(0), prefixLength);
    const payload = await readSeoJson(env, `${folder}/${prefix}.json`);
    if (!payload || !payload.items || typeof payload.items !== "object") continue;
    if (payload.items[slug]) return payload.items[slug];
  }
  return null;
}

async function fetchTextAbsolute(url) {
  try {
    const response = await fetch(url, { method: "GET" });
    if (!response || !response.ok) return null;
    return await response.text();
  } catch (e) {
    return null;
  }
}

function buildSeoCacheHeaders(version) {
  return {
    "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    "x-reader-seo-version": String(version || ""),
    "x-reader-seo-render": "14",
  };
}

function buildSitemapCacheHeaders(version) {
  return {
    "cache-control": "public, max-age=900, s-maxage=3600, stale-while-revalidate=86400",
    "x-reader-seo-version": String(version || ""),
    "x-reader-seo-render": "14",
  };
}

function buildSeoCacheKey(url, version, variant = "") {
  const cacheUrl = new URL(url.toString());
  cacheUrl.hash = "";
  cacheUrl.search = "";
  cacheUrl.searchParams.set("__seo_v", String(version || "0"));
  cacheUrl.searchParams.set("__seo_render", "14");
  if (variant) cacheUrl.searchParams.set("__seo_variant", String(variant));
  return new Request(cacheUrl.toString(), { method: "GET" });
}

async function withSeoCache(request, version, variant, buildResponse) {
  const cache = typeof caches !== "undefined" && caches.default ? caches.default : null;
  const cacheKey = buildSeoCacheKey(request.url, version, variant);
  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
    } catch (e) {}
  }
  const response = await buildResponse();
  if (cache && response && response.ok && request.method === "GET") {
    try {
      await cache.put(cacheKey, response.clone());
    } catch (e) {}
  }
  return response;
}

function seoCanonical(origin, path) {
  return `${origin}${stripTrailingSlash(path)}`;
}

function renderSeoLayout({
  title,
  description,
  canonical,
  bodyHtml,
  structuredData,
  analyticsHtml,
}) {
  const metaDescription = sanitizeMetaDescription(description || "");
  const structuredDataHtml = structuredData
    ? `<script type="application/ld+json">${JSON.stringify(structuredData)}</script>`
    : "";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(metaDescription)}" />
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <link rel="icon" type="image/svg+xml" href="/books/assets/logo.svg" />
    ${analyticsHtml || ""}
    ${structuredDataHtml}
    <style>
      @import url("https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Source+Sans+3:wght@400;600&display=swap");

      :root {
        color-scheme: light;
        --bg: #ffffff;
        --ink: #1f1b16;
        --muted: #6c645a;
        --accent: #028f80;
        --accent-2: #016b61;
        --border: #d8dee8;
        --panel: #ffffff;
        --rect-bg: linear-gradient(90deg, #fcfaf8 0%, #ffffff 100%);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Source Sans 3", "Helvetica Neue", sans-serif;
        font-size: 16px;
        line-height: 1.5;
        color: var(--ink);
        background: var(--bg);
      }
      a { color: var(--accent); text-decoration: none; }
      a:hover { text-decoration: none; }
      .wrap {
        max-width: 1180px;
        margin: 0 auto;
        padding: 28px 24px 24px;
      }
      .crumbs {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        color: var(--muted);
        font-size: 14px;
        margin: 0 0 22px;
        align-items: center;
      }
      .crumbs a {
        color: var(--accent);
      }
      .crumbs a:hover {
        color: var(--accent-2);
      }
      .crumbs .sep {
        color: var(--muted);
        opacity: 0.7;
      }
      .panel {
        background: var(--rect-bg);
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 18px;
      }
      .hero {
        display: grid;
        gap: 16px;
        margin-bottom: 6px;
      }
      .hero.withCover {
        grid-template-columns: minmax(0, 1fr);
      }
      .heroText {
        min-width: 0;
      }
      h1,h2,h3 { line-height: 1.15; margin: 0 0 12px; }
      h1,h2,h3 {
        font-family: "Playfair Display", "Times New Roman", serif;
        font-weight: 700;
      }
      h1 { font-size: 32px; letter-spacing: 0.2px; }
      h2 { font-size: 26px; margin-top: 28px; }
      h3 { font-size: 22px; }
      .meta {
        color: var(--muted);
        margin-bottom: 16px;
        font-size: 14px;
      }
      .actions { display: flex; flex-wrap: wrap; gap: 12px; margin: 18px 0 24px; }
      .section {
        margin-top: 26px;
      }
      .sectionHead {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
        flex-wrap: wrap;
      }
      .sectionTitle {
        font-family: "Playfair Display", "Times New Roman", serif;
        font-size: 26px;
        line-height: 1.1;
        color: var(--ink);
        margin: 0;
      }
      .sectionMeta {
        font-size: 13px;
        color: var(--muted);
      }
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--accent);
        background: var(--accent);
        color: #fff;
        border-radius: 999px;
        padding: 10px 16px;
        font-weight: 600;
        font-size: 14px;
        transition: background-color 0.08s ease, border-color 0.08s ease, color 0.08s ease;
      }
      .btn:hover {
        background: var(--accent-2);
        border-color: var(--accent-2);
        color: #fff;
      }
      .btn.secondary {
        background: transparent;
        color: var(--accent);
      }
      .btn.secondary:hover {
        background: rgba(2, 143, 128, 0.08);
        border-color: var(--accent);
        color: var(--accent);
      }
      .list {
        display: grid;
        gap: 12px;
        margin: 18px 0 0;
        padding: 0;
        list-style: none;
      }
      .list li {
        border-top: 1px solid var(--border);
        padding: 12px 0 0;
        line-height: 1.45;
      }
      .list:first-child,
      .section > .list {
        margin-top: 0;
      }
      .list .submeta,
      .submeta {
        display: inline;
        color: var(--muted);
        font-size: 13px;
        font-weight: 400;
      }
      .excerpt, .chapterHtml {
        line-height: 1.62;
        font-size: 16px;
      }
      .excerpt p, .chapterHtml p { margin: 0 0 16px; }
      .cover {
        display: block;
        max-width: 200px;
        border: 1px solid var(--border);
        border-radius: 12px;
        margin: 0 0 20px;
      }
      .tags {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin: 16px 0 0;
      }
      .tag {
        border: 1px solid var(--border);
        border-radius: 999px;
        padding: 8px 12px;
        color: var(--muted);
        font-size: 14px;
        background: #fffdfa;
      }
      .tag:hover {
        background: rgba(2, 143, 128, 0.08);
        color: var(--ink);
      }
      .recGrid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 14px;
      }
      .recCard {
        display: grid;
        gap: 10px;
        align-content: start;
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 12px;
        background: #fffdfa;
        color: var(--ink);
      }
      .recCard:hover {
        background: rgba(2, 143, 128, 0.06);
      }
      .recCover {
        width: 100%;
        aspect-ratio: 3 / 4;
        object-fit: cover;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: #f8f5f1;
      }
      .recCoverPlaceholder {
        display: block;
      }
      .recBody {
        display: grid;
        gap: 4px;
      }
      .recTitle {
        font-weight: 600;
        line-height: 1.35;
        color: var(--accent-2);
      }
      .recMeta {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.35;
      }
      .chapterNav {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        margin: 24px 0;
        padding: 12px 0;
        border-top: 1px solid var(--border);
        border-bottom: 1px solid var(--border);
      }
      .chapterNav a {
        color: var(--accent-2);
        font-weight: 600;
      }
      .chapterHtml img,
      .chapterHtml svg,
      .chapterHtml canvas,
      .chapterHtml video,
      .chapterHtml iframe {
        display: block;
        max-width: 100% !important;
        width: auto !important;
        height: auto !important;
        max-height: none !important;
        object-fit: contain;
      }
      .chapterHtml figure,
      .chapterHtml .figure,
      .chapterHtml .image {
        max-width: 100%;
      }
      .chapterHtml h1,
      .chapterHtml h2,
      .chapterHtml h3,
      .chapterHtml h4,
      .chapterHtml h5,
      .chapterHtml h6 {
        font-family: "Playfair Display", "Times New Roman", serif;
        line-height: 1.2;
        margin: 24px 0 12px;
      }
      .list a {
        color: var(--accent-2);
        font-weight: 600;
      }
      @media (max-width: 720px) {
        .wrap {
          padding: 20px 16px 20px;
        }
        .panel {
          padding: 16px;
        }
        .hero {
          gap: 14px;
        }
        h1 {
          font-size: 28px;
        }
        h2 {
          font-size: 24px;
        }
        h3 {
          font-size: 20px;
        }
        .actions {
          gap: 10px;
          margin: 16px 0 20px;
        }
        .btn {
          width: 100%;
        }
        .chapterNav {
          flex-direction: column;
          align-items: flex-start;
        }
        .recGrid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .sectionTitle {
          font-size: 24px;
        }
        .excerpt,
        .chapterHtml {
          font-size: 15px;
          line-height: 1.58;
        }
        .chapterHtml p {
          margin: 0 0 14px;
        }
      }
      @media (pointer: coarse) and (orientation: portrait) {
        .chapterHtml img,
        .chapterHtml svg,
        .chapterHtml canvas,
        .chapterHtml video,
        .chapterHtml iframe {
          margin-left: auto;
          margin-right: auto;
          max-width: 100% !important;
          width: auto !important;
          height: auto !important;
          max-height: 78vh !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      ${bodyHtml}
    </div>
  </body>
</html>`;
}

function buildBreadcrumbs(items) {
  return `<nav class="crumbs" aria-label="Breadcrumbs">${items
    .map((item) =>
      item.href
        ? `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`
        : `<span>${escapeHtml(item.label)}</span>`
    )
    .join('<span class="sep">›</span>')}</nav>`;
}

function buildBookJsonLd(origin, book) {
  const authorDisplayName = formatAuthorDisplayName(book.authorName);
  const description = sanitizeMetaDescription(getRenderableBookDescription(book));
  const data = {
    "@context": "https://schema.org",
    "@type": "Book",
    name: book.title,
    url: `${origin}/book/${book.slug}`,
    author: {
      "@type": "Person",
      name: authorDisplayName,
      url: `${origin}/author/${book.authorSlug}`,
    },
    inLanguage: book.language || "und",
  };
  if (book.cover) data.image = `${origin}${book.cover}`;
  if (description) data.description = description;
  return data;
}

function contentDirForChapter(book, chapter) {
  const raw = String((chapter && chapter.sourcePath) || "").trim();
  const dir = raw.includes("/") ? raw.slice(0, raw.lastIndexOf("/") + 1) : "";
  const base = String((book && (book.contentPath || book.content_path)) || `/books/content/${book && book.id ? book.id : ""}/`).replace(/\/?$/, "/");
  return `${base}${dir}`;
}

function rewriteRelativeChapterHtml(html, assetBase) {
  return String(html || "").replace(
    /(src|href)=("|\')([^"\']+)("|\')/g,
    (match, attr, quote, value) => {
      if (!value || value.startsWith("http://") || value.startsWith("https://") || value.startsWith("#") || value.startsWith("mailto:") || value.startsWith("data:")) {
        return match;
      }
      const absolute = new URL(value, `https://reader.pub${assetBase}`).pathname;
      return `${attr}=${quote}${absolute}${quote}`;
    }
  );
}

function extractBodyInnerHtml(xhtmlText) {
  const match = String(xhtmlText || "").match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1].trim() : "";
}

function buildCatalogCategoryHref(slug) {
  const params = new URLSearchParams();
  params.set("view", "category");
  params.set("category", String(slug || ""));
  return `/books/#${params.toString()}`;
}

function buildPrimaryExploreHref(book) {
  const categories = Array.isArray(book?.categories) ? book.categories : [];
  const primaryCategory = categories.find((item) => item && item.slug);
  return primaryCategory ? buildCatalogCategoryHref(primaryCategory.slug) : "/books/";
}

function buildReaderHrefForRecommendation(item) {
  const explicit = String(item?.readerUrl || "").trim();
  if (explicit) return explicit;
  const id = String(item?.id || "").trim();
  if (id) return `/books/${encodeURIComponent(id)}/`;
  return "";
}

async function findSiblingEditionBook(env, book) {
  if (!book?.authorSlug || !book?.title) return null;
  const author = await readSeoShardedJson(env, "author-shards", book.authorSlug);
  const authorBooks = Array.isArray(author?.books) ? author.books : [];
  const targetTitle = normalizeComparableTitle(book.title);
  if (!targetTitle) return null;
  for (const item of authorBooks) {
    if (!item || !item.slug || item.slug === book.slug) continue;
    if (normalizeComparableTitle(item.title) !== targetTitle) continue;
    const sibling = await readSeoShardedJson(env, "book-shards", item.slug);
    if (!sibling) continue;
    if (sibling.cover || (Array.isArray(sibling.categories) && sibling.categories.length)) {
      return sibling;
    }
  }
  return null;
}

async function enrichBookForDisplay(env, book) {
  const enriched = { ...(book || {}) };
  const needsSibling = !enriched.cover || !Array.isArray(enriched.categories) || !enriched.categories.length;
  if (!needsSibling) return enriched;
  const sibling = await findSiblingEditionBook(env, enriched);
  if (!sibling) return enriched;
  if (!enriched.cover && sibling.cover) enriched.cover = sibling.cover;
  if ((!Array.isArray(enriched.categories) || !enriched.categories.length) && Array.isArray(sibling.categories) && sibling.categories.length) {
    enriched.categories = sibling.categories;
  }
  return enriched;
}

async function buildBookRecommendationSections(env, book) {
  const sections = [];
  const currentSlug = String(book?.slug || "");
  const categories = Array.isArray(book?.categories) ? book.categories : [];
  const primaryCategory = categories.find((item) => item && item.slug);
  if (primaryCategory) {
    const category = await readSeoJson(env, `category/${primaryCategory.slug}.json`);
    const categoryBooks = Array.isArray(category?.books) ? category.books : [];
    const items = categoryBooks
      .filter((item) => item && item.slug && item.slug !== currentSlug)
      .slice(0, 6)
      .map((item) => ({
        id: item.id || "",
        slug: item.slug,
        title: item.title,
        author: item.author || item.authorName || "",
        authorSlug: item.authorSlug || "",
        cover: item.cover || "",
        readerUrl: buildReaderHrefForRecommendation(item),
      }));
    if (items.length) {
      sections.push({ title: "You May Also Like", items, source: "category" });
    }
  }

  if (book?.authorSlug) {
    const author = await readSeoShardedJson(env, "author-shards", book.authorSlug);
    const authorBooks = Array.isArray(author?.books) ? author.books : [];
    const items = authorBooks
      .filter((item) => item && item.slug && item.slug !== currentSlug)
      .slice(0, 6)
      .map((item) => ({
        id: item.id || "",
        slug: item.slug,
        title: item.title,
        author: book.authorName || author.name || "",
        authorSlug: book.authorSlug || author.slug || "",
        cover: item.cover || "",
        readerUrl: buildReaderHrefForRecommendation(item),
      }));
    if (items.length) {
      sections.push({ title: "More Books by This Author", items, source: "author" });
    }
  }

  return sections;
}

function renderBookPage(origin, book, posthogConfig, recommendationSections) {
  const authorDisplayName = formatAuthorDisplayName(book.authorName);
  const aboutText = getRenderableBookDescription(book) || book.excerpt || "";
  const coverHtml = book.cover
    ? `<img class="cover" src="${escapeHtml(book.cover)}" alt="${escapeHtml(book.title)} cover" />`
    : "";
  const primaryExploreHref = buildPrimaryExploreHref(book);
  const categoryHtml = Array.isArray(book.categories) && book.categories.length
    ? `<div class="tags">${book.categories
        .map(
          (item) =>
            `<a class="tag" href="${escapeHtml(buildCatalogCategoryHref(item.slug))}" data-seo-track="catalog" data-seo-cta-type="category_tag" data-seo-link-text="${escapeHtml(item.title)}">${escapeHtml(item.title)}</a>`
        )
        .join("")}</div>`
    : "";
  const sections = Array.isArray(recommendationSections) ? recommendationSections.filter((item) => item && Array.isArray(item.items) && item.items.length) : [];
  const recommendationsHtml = sections
    .map((section) => {
      const cardsHtml = section.items
        .filter((item) => item && item.readerUrl)
        .map(
          (item) => `
            <a class="recCard" href="${escapeHtml(item.readerUrl)}" data-seo-track="reader" data-seo-cta-type="recommendation_card" data-seo-link-text="${escapeHtml(item.title)}">
              ${item.cover ? `<img class="recCover" src="${escapeHtml(item.cover)}" alt="${escapeHtml(item.title)} cover" />` : `<span class="recCover recCoverPlaceholder" aria-hidden="true"></span>`}
              <span class="recBody">
                <span class="recTitle">${escapeHtml(item.title)}</span>
                ${item.author ? `<span class="recMeta">by ${escapeHtml(formatAuthorDisplayName(item.author))}</span>` : ""}
              </span>
            </a>`
        )
        .join("");
      if (!cardsHtml) return "";
      return `
      <section class="section">
        <div class="sectionHead">
          <h2 class="sectionTitle">${escapeHtml(section.title)}</h2>
          <div class="sectionMeta">${section.items.length} picks</div>
        </div>
        <div class="recGrid">${cardsHtml}</div>
      </section>`;
    })
    .join("");
  const chaptersHtml = Array.isArray(book.chapters) && book.chapters.length
    ? `<ol class="list">${book.chapters
        .map(
          (chapter) =>
            `<li><a href="${escapeHtml(chapter.href)}">Chapter ${chapter.n}: ${escapeHtml(chapter.title)}</a></li>`
        )
        .join("")}</ol>`
    : `<div class="meta">No chapter map available.</div>`;
  const excerptHtml = aboutText
    ? `<div class="excerpt"><p>${escapeHtml(aboutText)}</p></div>`
    : `<div class="meta">Excerpt is not available.</div>`;
  const heroClass = coverHtml ? "hero withCover" : "hero";
  const bodyHtml = `
    ${buildBreadcrumbs([
      { label: "Books", href: "/books/" },
      { label: authorDisplayName, href: `/author/${book.authorSlug}` },
      { label: book.title },
    ])}
    <main class="panel">
      <div class="${heroClass}">
        ${coverHtml}
        <div class="heroText">
          <h1>${escapeHtml(book.title)}</h1>
          <div class="meta">By <a href="/author/${encodeURIComponent(book.authorSlug)}">${escapeHtml(authorDisplayName)}</a></div>
          <div class="actions">
            <a class="btn secondary" href="${escapeHtml(book.readerUrl)}" data-seo-track="reader" data-seo-cta-type="open_in_weread" data-seo-link-text="Open in WeRead">Open in WeRead</a>
            <a class="btn" href="${escapeHtml(primaryExploreHref)}" data-seo-track="catalog" data-seo-cta-type="primary_explore_cta" data-seo-link-text="Explore More Books Like This">Explore More Books Like This</a>
          </div>
          ${categoryHtml}
        </div>
      </div>
      <section class="section">
        <div class="sectionHead">
          <h2 class="sectionTitle">About This Book</h2>
        </div>
        ${excerptHtml}
      </section>
      ${recommendationsHtml}
      <section class="section">
        <div class="sectionHead">
          <h2 class="sectionTitle">Chapters</h2>
          <div class="sectionMeta">${Array.isArray(book.chapters) ? book.chapters.length : 0} chapters</div>
        </div>
        ${chaptersHtml}
      </section>
    </main>`;
  return renderSeoLayout({
    title: `${book.title} — ${authorDisplayName}`,
    description: sanitizeMetaDescription(aboutText),
    canonical: seoCanonical(origin, `/book/${book.slug}`),
    structuredData: buildBookJsonLd(origin, book),
    analyticsHtml: buildSeoAnalyticsHtml(posthogConfig, {
      page_type: "book",
      pathname: `/book/${book.slug}`,
      slug: book.slug,
      book_id: String(book.id || ""),
      book_slug: book.slug,
      author_slug: book.authorSlug || "",
      category_slug: "",
      language: book.language || "",
    }),
    bodyHtml,
  });
}

function renderChapterPage(origin, book, chapter, chapterHtml, posthogConfig) {
  const authorDisplayName = formatAuthorDisplayName(book.authorName);
  const idx = (book.chapters || []).findIndex((item) => item.n === chapter.n);
  const prev = idx > 0 ? book.chapters[idx - 1] : null;
  const next = idx >= 0 && idx < book.chapters.length - 1 ? book.chapters[idx + 1] : null;
  const navHtml = `<div class="chapterNav">
      <div>${prev ? `<a href="${escapeHtml(prev.href)}">← Previous chapter</a>` : ""}</div>
      <div>${next ? `<a href="${escapeHtml(next.href)}">Next chapter →</a>` : ""}</div>
    </div>`;
  const bodyHtml = `
    ${buildBreadcrumbs([
      { label: "Books", href: "/books/" },
      { label: authorDisplayName, href: `/author/${book.authorSlug}` },
      { label: book.title, href: `/book/${book.slug}` },
      { label: chapter.title },
    ])}
    <main class="panel">
      <div class="hero">
        <div class="heroText">
          <h1>${escapeHtml(book.title)}</h1>
          <div class="meta">Chapter ${chapter.n}: ${escapeHtml(chapter.title)}</div>
          <div class="actions">
            <a class="btn" href="${escapeHtml(book.readerUrl)}" data-seo-track="reader" data-seo-cta-type="open_in_weread" data-seo-link-text="Open in WeRead">Open in WeRead</a>
            <a class="btn secondary" href="/book/${encodeURIComponent(book.slug)}">Back to Book</a>
          </div>
        </div>
      </div>
      ${navHtml}
      <article class="chapterHtml">${chapterHtml}</article>
      ${navHtml}
    </main>`;
  return renderSeoLayout({
    title: `${book.title} — Chapter ${chapter.n}`,
    description: `${book.title}, chapter ${chapter.n}: ${chapter.title}`,
    canonical: seoCanonical(origin, chapter.href),
    analyticsHtml: buildSeoAnalyticsHtml(posthogConfig, {
      page_type: "chapter",
      pathname: chapter.href,
      slug: chapter.slug || `chapter-${chapter.n}`,
      book_id: String(book.id || ""),
      book_slug: book.slug,
      author_slug: book.authorSlug || "",
      category_slug: "",
      language: book.language || "",
    }),
    bodyHtml,
  });
}

function renderAuthorPage(origin, author, posthogConfig) {
  const authorDisplayName = formatAuthorDisplayName(author.name);
  const booksHtml = Array.isArray(author.books) && author.books.length
    ? `<ol class="list">${author.books
        .map(
          (book) =>
            `<li><a href="/book/${encodeURIComponent(book.slug)}">${escapeHtml(book.title)}</a></li>`
        )
        .join("")}</ol>`
    : `<div class="meta">No books are indexed for this author yet.</div>`;
  const bodyHtml = `
    ${buildBreadcrumbs([
      { label: "Books", href: "/books/" },
      { label: authorDisplayName },
    ])}
    <main class="panel">
      <div class="hero">
        <div class="heroText">
          <h1>${escapeHtml(authorDisplayName)}</h1>
          <div class="meta">${author.count || 0} books</div>
        </div>
      </div>
      <section class="section">
        <div class="sectionHead">
          <h2 class="sectionTitle">Books by This Author</h2>
          <div class="sectionMeta">${author.count || 0} titles</div>
        </div>
        ${booksHtml}
      </section>
    </main>`;
  return renderSeoLayout({
    title: `Books by ${authorDisplayName}`,
    description: `${author.count || 0} books by ${authorDisplayName} on ReaderPub.`,
    canonical: seoCanonical(origin, `/author/${author.slug}`),
    analyticsHtml: buildSeoAnalyticsHtml(posthogConfig, {
      page_type: "author",
      pathname: `/author/${author.slug}`,
      slug: author.slug,
      book_id: "",
      book_slug: "",
      author_slug: author.slug,
      category_slug: "",
      language: "",
    }),
    bodyHtml,
  });
}

function renderCategoryPage(origin, category, posthogConfig) {
  const catalogHref = buildCatalogCategoryHref(category.slug);
  const booksHtml = Array.isArray(category.books) && category.books.length
    ? `<ol class="list">${category.books
        .map(
          (book) =>
            `<li><a href="/book/${encodeURIComponent(book.slug)}">${escapeHtml(book.title)}</a> <span class="submeta">by <a href="/author/${encodeURIComponent(book.authorSlug)}">${escapeHtml(formatAuthorDisplayName(book.author))}</a></span></li>`
        )
        .join("")}</ol>`
    : `<div class="meta">No books are indexed in this category yet.</div>`;
  const bodyHtml = `
    ${buildBreadcrumbs([
      { label: "Books", href: "/books/" },
      { label: "Categories", href: "/books/" },
      { label: category.title },
    ])}
    <main class="panel">
      <div class="hero">
        <div class="heroText">
          <h1>${escapeHtml(category.title)}</h1>
          <div class="meta">${category.count || 0} books</div>
          <div class="actions">
            <a class="btn" href="${escapeHtml(catalogHref)}" data-seo-track="catalog" data-seo-cta-type="open_in_catalog" data-seo-link-text="Open in Catalog">Open in Catalog</a>
            <a class="btn secondary" href="/books/" data-seo-track="catalog" data-seo-cta-type="all_books" data-seo-link-text="All Books">All Books</a>
          </div>
        </div>
      </div>
      <section class="section">
        <div class="sectionHead">
          <h2 class="sectionTitle">Books in This Category</h2>
          <div class="sectionMeta">${category.count || 0} titles</div>
        </div>
        ${booksHtml}
      </section>
    </main>`;
  return renderSeoLayout({
    title: `${category.title} Books`,
    description: `${category.count || 0} books in the ${category.title} category on ReaderPub.`,
    canonical: seoCanonical(origin, `/category/${category.slug}`),
    analyticsHtml: buildSeoAnalyticsHtml(posthogConfig, {
      page_type: "category",
      pathname: `/category/${category.slug}`,
      slug: category.slug,
      book_id: "",
      book_slug: "",
      author_slug: "",
      category_slug: category.slug,
      language: "",
    }),
    bodyHtml,
  });
}

function buildSitemapXml(origin, items) {
  const body = (items || [])
    .map(
      (item) =>
        `<url><loc>${escapeXml(`${origin}${item.loc}`)}</loc>${
          item.lastmod ? `<lastmod>${escapeXml(String(item.lastmod))}</lastmod>` : ""
        }</url>`
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}

function buildSitemapIndexXml(origin, sitemaps) {
  const body = (sitemaps || [])
    .map(
      (item) =>
        `<sitemap><loc>${escapeXml(`${origin}${item.path}`)}</loc></sitemap>`
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</sitemapindex>`;
}

async function renderSeoRoute(request, env, url, path) {
  const assetOrigin = url.origin;
  const posthogConfig = getPosthogPublicConfig(env);
  const forwardedOrigin = String(request.headers.get("x-reader-canonical-origin") || "").trim();
  const canonicalOrigin =
    /^https?:\/\/[a-z0-9.-]+$/i.test(forwardedOrigin) ? forwardedOrigin.replace(/\/+$/, "") : assetOrigin;
  const cacheVariant = canonicalOrigin;
  const publicContentOrigin =
    canonicalOrigin.includes(".pages.dev") ? "https://reader.pub" : canonicalOrigin;
  const versionMeta = await readSeoJson(env, "version.json");
  const globalVersion = versionMeta && versionMeta.version ? String(versionMeta.version) : "0";

  if (path === "/robots.txt") {
    return await withSeoCache(request, globalVersion, cacheVariant, async () => {
      const body = [
        "User-agent: *",
        "Allow: /book/",
        "Allow: /author/",
        "Allow: /category/",
        "Allow: /sitemap.xml",
        "Allow: /sitemaps/",
        "Disallow: /books/reader/",
        "Disallow: /books/api/",
        "",
        `Sitemap: ${canonicalOrigin}/sitemap.xml`,
      ].join("\n");
      const response = textResponse(body, 200, {
        "cache-control": "public, max-age=3600, s-maxage=86400",
        "x-reader-route": "seo-robots",
        "x-reader-seo-version": globalVersion,
      });
      return response;
    });
  }

  if (path === "/sitemap.xml") {
    const sitemapIndex = await readSeoJson(env, "sitemaps/index.json");
    if (!sitemapIndex) {
      return textResponse("Sitemap index not found", 404, {
        "cache-control": "no-store",
        "x-reader-route": "seo-sitemap-miss",
      });
    }
    return await withSeoCache(request, sitemapIndex.version || globalVersion, cacheVariant, async () => {
      const response = xmlResponse(buildSitemapIndexXml(canonicalOrigin, sitemapIndex.sitemaps || []), 200, {
        ...buildSitemapCacheHeaders(sitemapIndex.version || globalVersion),
        "x-reader-route": "seo-sitemap-index",
      });
      return response;
    });
  }

  const sitemapMatch = path.match(/^\/sitemaps\/(books-\d+|chapters-\d+|authors|categories)\.xml$/);
  if (sitemapMatch) {
    const slug = `${sitemapMatch[1]}.json`;
    const payload = await readSeoJson(env, `sitemaps/${slug}`);
    if (!payload) {
      return textResponse("Sitemap not found", 404, {
        "cache-control": "no-store",
        "x-reader-route": "seo-sitemap-miss",
      });
    }
    const sitemapVersion = payload.version || globalVersion;
    return await withSeoCache(request, sitemapVersion, cacheVariant, async () => {
      const response = xmlResponse(buildSitemapXml(canonicalOrigin, payload.items || []), 200, {
        ...buildSitemapCacheHeaders(sitemapVersion),
        "x-reader-route": "seo-sitemap",
      });
      return response;
    });
  }

  const authorMatch = path.match(/^\/author\/([^/]+)\/?$/);
  if (authorMatch) {
    const slug = authorMatch[1];
    const author = await readSeoShardedJson(env, "author-shards", slug);
    if (!author) {
      return textResponse("Author not found", 404, {
        "cache-control": "no-store",
        "x-reader-route": "seo-author-miss",
      });
    }
    const canonicalPath = `/author/${author.slug}`;
    if (stripTrailingSlash(path) !== canonicalPath) {
      const headers = new Headers({ location: canonicalPath });
      headers.set("x-reader-worker", "1");
      headers.set("x-reader-route", "seo-author-canonical");
      return new Response(null, { status: 301, headers });
    }
    return await withSeoCache(request, author.version || globalVersion, cacheVariant, async () => {
      const response = htmlResponse(renderAuthorPage(canonicalOrigin, author, posthogConfig), 200, {
        ...buildSeoCacheHeaders(author.version || globalVersion),
        "x-reader-route": "seo-author",
      });
      return response;
    });
  }

  const categoryMatch = path.match(/^\/category\/([^/]+)\/?$/);
  if (categoryMatch) {
    const slug = categoryMatch[1];
    const category = await readSeoJson(env, `category/${slug}.json`);
    if (!category) {
      return textResponse("Category not found", 404, {
        "cache-control": "no-store",
        "x-reader-route": "seo-category-miss",
      });
    }
    const canonicalPath = `/category/${category.slug}`;
    if (stripTrailingSlash(path) !== canonicalPath) {
      const headers = new Headers({ location: canonicalPath });
      headers.set("x-reader-worker", "1");
      headers.set("x-reader-route", "seo-category-canonical");
      return new Response(null, { status: 301, headers });
    }
    return await withSeoCache(request, category.version || globalVersion, cacheVariant, async () => {
      const response = htmlResponse(renderCategoryPage(canonicalOrigin, category, posthogConfig), 200, {
        ...buildSeoCacheHeaders(category.version || globalVersion),
        "x-reader-route": "seo-category",
      });
      return response;
    });
  }

  const bookMatch = path.match(/^\/book\/([^/]+?)(?:\/chapter-(\d+)(?:-([^/]+))?)?\/?$/);
  if (bookMatch) {
    const slug = bookMatch[1];
    const chapterNumber = bookMatch[2] ? parseInt(bookMatch[2], 10) : 0;
    const chapterSlug = bookMatch[3] || "";
    const book = await readSeoShardedJson(env, "book-shards", slug);
    if (!book) {
      return textResponse("Book not found", 404, {
        "cache-control": "no-store",
        "x-reader-route": "seo-book-miss",
      });
    }
    if (!chapterNumber) {
      const canonicalPath = `/book/${book.slug}`;
      if (stripTrailingSlash(path) !== canonicalPath) {
        const headers = new Headers({ location: canonicalPath });
        headers.set("x-reader-worker", "1");
        headers.set("x-reader-route", "seo-book-canonical");
        return new Response(null, { status: 301, headers });
      }
      const displayBook = await enrichBookForDisplay(env, book);
      const recommendations = await buildBookRecommendationSections(env, displayBook);
      return await withSeoCache(request, book.version || globalVersion, cacheVariant, async () => {
        const response = htmlResponse(renderBookPage(canonicalOrigin, displayBook, posthogConfig, recommendations), 200, {
          ...buildSeoCacheHeaders(book.version || globalVersion),
          "x-reader-route": "seo-book",
        });
        return response;
      });
    }

    const chapter = Array.isArray(book.chapters)
      ? book.chapters.find((item) => Number(item.n) === chapterNumber)
      : null;
    if (!chapter) {
      return textResponse("Chapter not found", 404, {
        "cache-control": "no-store",
        "x-reader-route": "seo-chapter-miss",
      });
    }
    const canonicalChapterPath = chapter.href || `/book/${book.slug}/chapter-${chapter.n}${chapter.slug ? `-${chapter.slug}` : ""}`;
    const requestedPath = stripTrailingSlash(path);
    if (requestedPath !== canonicalChapterPath || (chapter.slug && chapterSlug && chapterSlug !== chapter.slug)) {
      const headers = new Headers({ location: canonicalChapterPath });
      headers.set("x-reader-worker", "1");
      headers.set("x-reader-route", "seo-chapter-canonical");
      return new Response(null, { status: 301, headers });
    }
    return await withSeoCache(request, book.version || globalVersion, cacheVariant, async () => {
      const contentPath = String(book.contentPath || book.content_path || `/books/content/${book.id}/`);
      const contentKeyPrefix = contentPath.replace(/^\/books\//, "").replace(/^\/+/, "").replace(/\/?$/, "/");
      const sourceKey = `${contentKeyPrefix}${chapter.sourcePath}`;
      let xhtmlText = await readBucketText(env, sourceKey);
      if (!xhtmlText) {
        xhtmlText = await fetchTextAbsolute(
          `${publicContentOrigin}${contentPath.replace(/\/?$/, "/")}${chapter.sourcePath}`
        );
      }
      if (!xhtmlText) {
        return textResponse("Chapter source not found", 404, {
          "cache-control": "no-store",
          "x-reader-route": "seo-chapter-source-miss",
        });
      }
      const assetBase = contentDirForChapter(book, chapter);
      const chapterInner = rewriteRelativeChapterHtml(extractBodyInnerHtml(xhtmlText), assetBase);
      const response = htmlResponse(renderChapterPage(canonicalOrigin, book, chapter, chapterInner, posthogConfig), 200, {
        ...buildSeoCacheHeaders(book.version || globalVersion),
        "x-reader-route": "seo-chapter",
      });
      return response;
    });
  }

  // ── /notes/<token> — shared notes landing page ──
  const notesMatch = path.match(/^\/notes\/([a-f0-9]+)$/);
  if (notesMatch) {
    const shareToken = notesMatch[1];

    // Fetch package from Supabase via service role
    const sbUrl = String(env.SUPABASE_URL || "").trim();
    const sbKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
    if (!sbUrl || !sbKey) {
      return textResponse("Service not configured", 500, { "x-reader-route": "notes-share-config" });
    }

    // Fetch package
    const pkgRes = await fetch(`${sbUrl}/rest/v1/note_packages?share_token=eq.${shareToken}&select=*`, {
      headers: { apikey: sbKey, authorization: `Bearer ${sbKey}`, accept: "application/vnd.pgrst.object+json" },
    });
    if (!pkgRes.ok) {
      return textResponse("Notes not found", 404, { "cache-control": "no-store", "x-reader-route": "notes-share-miss" });
    }
    const pkg = await pkgRes.json();
    if (!pkg || !pkg.id) {
      return textResponse("Notes not found", 404, { "cache-control": "no-store", "x-reader-route": "notes-share-miss" });
    }

    // Fetch notes via package items
    const itemsRes = await fetch(
      `${sbUrl}/rest/v1/note_package_items?package_id=eq.${pkg.id}&select=display_order,notes:note_id(id,anchor_cfi,quote,note_text,author_display_name)&order=display_order`,
      { headers: { apikey: sbKey, authorization: `Bearer ${sbKey}` } }
    );
    const items = itemsRes.ok ? await itemsRes.json() : [];
    const notes = items.map(i => i.notes).filter(Boolean);

    // Fetch book info
    let book = null;
    if (pkg.book_id) {
      const bookRes = await fetch(
        `${sbUrl}/rest/v1/books?id=eq.${pkg.book_id}&select=id,title,author,cover_url,content_id,annotation`,
        { headers: { apikey: sbKey, authorization: `Bearer ${sbKey}`, accept: "application/vnd.pgrst.object+json" } }
      );
      if (bookRes.ok) book = await bookRes.json();
    }

    // Fetch creator
    let creatorName = "Someone";
    if (pkg.created_by) {
      const creatorRes = await fetch(
        `${sbUrl}/rest/v1/user_profiles?id=eq.${pkg.created_by}&select=display_name`,
        { headers: { apikey: sbKey, authorization: `Bearer ${sbKey}`, accept: "application/vnd.pgrst.object+json" } }
      );
      if (creatorRes.ok) {
        const creator = await creatorRes.json();
        if (creator && creator.display_name) creatorName = creator.display_name;
      }
    }

    // Build OG meta description
    const firstQuote = notes.length > 0 ? (notes[0].quote || "").slice(0, 150) : "";
    const ogTitle = book
      ? `Notes on "${book.title}" by ${creatorName}`
      : (pkg.title || `Shared notes by ${creatorName}`);
    const ogDescription = firstQuote
      ? `"${firstQuote}${firstQuote.length >= 150 ? '...' : ''}" — and ${Math.max(0, notes.length - 1)} more notes`
      : `${notes.length} shared notes by ${creatorName}`;
    const ogImage = book && book.cover_url
      ? (book.cover_url.startsWith("http") ? book.cover_url : `${canonicalOrigin}${book.cover_url}`)
      : "";
    const readerUrl = book && book.content_id
      ? `${canonicalOrigin}/books/reader/?id=${book.content_id}&n=${shareToken}`
      : "";

    // Render notes list HTML
    const notesHtml = notes.map(n => `
      <div style="border-left:3px solid #028f80;padding:8px 0 8px 16px;margin-bottom:16px;">
        ${n.quote ? `<div style="font-style:italic;color:#1f1b16;margin-bottom:6px;">"${escapeHtml(n.quote)}"</div>` : ''}
        ${n.note_text ? `<div style="color:#6c645a;font-size:14px;">${escapeHtml(n.note_text)}</div>` : ''}
        <div style="color:#028f80;font-size:12px;font-weight:600;margin-top:4px;">— ${escapeHtml(n.author_display_name || 'Anonymous')}</div>
      </div>
    `).join('');

    // Social share URLs
    const pageUrl = `${canonicalOrigin}/notes/${shareToken}`;
    const encodedUrl = encodeURIComponent(pageUrl);
    const encodedTitle = encodeURIComponent(ogTitle);

    const socialHtml = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;">
        <a href="https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}" target="_blank" rel="noopener"
           style="padding:8px 14px;background:#1DA1F2;color:#fff;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;">Twitter/X</a>
        <a href="https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}" target="_blank" rel="noopener"
           style="padding:8px 14px;background:#1877F2;color:#fff;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;">Facebook</a>
        <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}" target="_blank" rel="noopener"
           style="padding:8px 14px;background:#0A66C2;color:#fff;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;">LinkedIn</a>
        <a href="https://api.whatsapp.com/send?text=${encodedTitle}%20${encodedUrl}" target="_blank" rel="noopener"
           style="padding:8px 14px;background:#25D366;color:#fff;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;">WhatsApp</a>
        <a href="https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}" target="_blank" rel="noopener"
           style="padding:8px 14px;background:#0088cc;color:#fff;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;">Telegram</a>
      </div>
    `;

    const bodyHtml = `
      <main style="max-width:680px;margin:0 auto;">
        ${book && book.cover_url ? `<img src="${escapeHtml(book.cover_url)}" style="max-width:160px;border-radius:12px;border:1px solid #d8dee8;margin-bottom:20px;" alt="" />` : ''}
        <h1 style="font-family:'Playfair Display',serif;font-size:28px;margin:0 0 8px;">${escapeHtml(ogTitle)}</h1>
        ${book ? `<div style="color:#6c645a;margin-bottom:8px;">from <strong>${escapeHtml(book.title)}</strong> by ${escapeHtml(book.author || '')}</div>` : ''}
        <div style="color:#6c645a;font-size:14px;margin-bottom:20px;">${notes.length} note${notes.length !== 1 ? 's' : ''} shared by ${escapeHtml(creatorName)}</div>
        ${readerUrl ? `<a href="${escapeHtml(readerUrl)}" style="display:inline-block;padding:10px 20px;background:#028f80;color:#fff;border-radius:10px;font-weight:600;text-decoration:none;margin-bottom:24px;">Open in Reader</a>` : ''}
        <div style="margin-top:24px;">${notesHtml}</div>
        ${socialHtml}
        <div style="margin-top:24px;padding-top:16px;border-top:1px solid #d8dee8;">
          <a href="/books/" style="color:#028f80;text-decoration:none;font-size:14px;">Browse catalog</a>
        </div>
      </main>
    `;

    const html = renderSeoLayout({
      title: ogTitle,
      description: ogDescription,
      canonical: pageUrl,
      bodyHtml,
    });

    // Add OG tags manually (renderSeoLayout doesn't include them all)
    const ogTags = `
    <meta property="og:title" content="${escapeHtml(ogTitle)}" />
    <meta property="og:description" content="${escapeHtml(ogDescription)}" />
    <meta property="og:url" content="${escapeHtml(pageUrl)}" />
    <meta property="og:type" content="article" />
    ${ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}" />` : ''}
    <meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}" />
    <meta name="twitter:title" content="${escapeHtml(ogTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(ogDescription)}" />
    ${ogImage ? `<meta name="twitter:image" content="${escapeHtml(ogImage)}" />` : ''}
    `;
    const finalHtml = html.replace('</head>', ogTags + '</head>');

    return htmlResponse(finalHtml, 200, {
      "cache-control": "public, max-age=300, s-maxage=600",
      "x-reader-route": "notes-share-page",
    });
  }

  return null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const decodedPath = decodeURIComponent(path);
    const normalizedPath = decodedPath.replace(/\/+$/, "") || "/";
    if (
      normalizedPath === "/run-daily" ||
      normalizedPath === "/get-tasks" ||
      normalizedPath === "/report-outcome" ||
      normalizedPath === "/books/api/run-daily" ||
      normalizedPath === "/books/api/get-tasks" ||
      normalizedPath === "/books/api/report-outcome" ||
      normalizedPath === "/api/run-daily" ||
      normalizedPath === "/api/get-tasks" ||
      normalizedPath === "/api/report-outcome"
    ) {
      const publisherResponse = await handlePublisherTaskRequest(request, env);
      if (publisherResponse) {
        const headers = new Headers(publisherResponse.headers);
        headers.set("x-reader-worker", "1");
        return new Response(publisherResponse.body, {
          status: publisherResponse.status,
          statusText: publisherResponse.statusText,
          headers,
        });
      }
    }
    const isPagesDevHost = url.hostname.endsWith(".pages.dev");
    const driveClientId = String(
      env.READERPUB_GOOGLE_CLIENT_ID || env.GOOGLE_DRIVE_CLIENT_ID || ""
    ).trim();
    const posthogKey = String(
      env.READERPUB_POSTHOG_KEY || env.POSTHOG_KEY || ""
    ).trim();
    const posthogHost = String(
      env.READERPUB_POSTHOG_HOST || env.POSTHOG_HOST || ""
    ).trim();
    const rawPosthogEnabled = String(
      env.READERPUB_POSTHOG_ENABLED || env.POSTHOG_ENABLED || ""
    ).trim();
    const posthogEnabled =
      /^(1|true|yes|on)$/i.test(rawPosthogEnabled) && !!posthogKey && !!posthogHost;
    const notesSharePrefix = "api/notes_shares/";
    const selectionSharePrefix = "api/selection_shares/";

    if (normalizedPath.startsWith("/s/")) {
      const shareId = normalizedPath.slice(3).trim();
      if (!/^[A-Za-z0-9_-]{4,64}$/.test(shareId)) {
        return textResponse("Not found", 404, {
          "cache-control": "no-store",
          "x-reader-route": "selection-share-miss",
        });
      }
      const payload = await getSelectionSharePayload(env, shareId, selectionSharePrefix);
      if (!payload) {
        return textResponse("Not found", 404, {
          "cache-control": "no-store",
          "x-reader-route": "selection-share-miss",
        });
      }
      const forwardedOrigin = String(request.headers.get("x-reader-canonical-origin") || "").trim();
      const publicOrigin =
        /^https?:\/\/[a-z0-9.-]+$/i.test(forwardedOrigin) ? forwardedOrigin.replace(/\/+$/, "") : url.origin;
      const targetUrl = buildSelectionReaderUrl(publicOrigin, payload, { selectionShareId: shareId });
      const previewUrl = new URL(targetUrl);
      const meta = await resolveReaderPreviewMeta(env, previewUrl);
      if (meta) {
        meta.url = new URL(`/s/${encodeURIComponent(shareId)}`, url.origin).toString();
      }
      return htmlResponse(renderSelectionShareLandingPage(meta, targetUrl), 200, {
        "cache-control": "public, max-age=300, s-maxage=600",
        "x-reader-route": "selection-share-page",
      });
    }

    if (
      path === "/robots.txt" ||
      path === "/sitemap.xml" ||
      path.startsWith("/sitemaps/") ||
      path.startsWith("/book/") ||
      path.startsWith("/author/") ||
      path.startsWith("/category/") ||
      path.startsWith("/notes/")
    ) {
      if (!env.READER_BOOKS && !env.ASSETS) {
        return textResponse("SEO storage missing", 500, {
          "cache-control": "no-store",
          "x-reader-route": "seo-storage-missing",
        });
      }
      const seoResponse = await renderSeoRoute(request, env, url, stripTrailingSlash(path));
      if (seoResponse) return seoResponse;
    }

    if (
      normalizedPath === "/books/api/selection-share" ||
      normalizedPath === "/api/selection-share" ||
      normalizedPath === "/books/reader/api/selection-share" ||
      normalizedPath === "/books/reader1/api/selection-share" ||
      normalizedPath === "/books/api/ss" ||
      normalizedPath === "/api/ss" ||
      normalizedPath === "/books/reader/api/ss" ||
      normalizedPath === "/books/reader1/api/ss"
    ) {
      if (request.method === "OPTIONS") {
        const headers = new Headers(notesShareCorsHeaders());
        headers.set("x-reader-worker", "1");
        headers.set("x-reader-route", "selection-share-options");
        return new Response(null, { status: 204, headers });
      }
      if (request.method !== "POST") {
        const headers = new Headers(notesShareCorsHeaders());
        headers.set("content-type", "application/json; charset=utf-8");
        headers.set("x-reader-worker", "1");
        headers.set("x-reader-route", "selection-share-method");
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405,
          headers,
        });
      }
      try {
        const body = await request.json();
        const payload = normalizeSelectionSharePayload(body);
        if (!payload) {
          return jsonResponse(
            { error: "Invalid selection share payload" },
            400,
            notesShareCorsHeaders()
          );
        }
        let shareId = "";
        let key = "";
        for (let i = 0; i < 5; i++) {
          shareId = randomShareId();
          key = `${selectionSharePrefix}${shareId}.json`;
          if (env.READER_BOOKS) {
            const existing = await env.READER_BOOKS.get(key);
            if (!existing) break;
          } else {
            const existing = await cacheGetSelectionShare(shareId);
            if (!existing) break;
          }
          shareId = "";
        }
        if (!shareId) {
          return jsonResponse(
            { error: "Failed to create share id" },
            500,
            notesShareCorsHeaders()
          );
        }
        if (env.READER_BOOKS) {
          await env.READER_BOOKS.put(key, JSON.stringify(payload), {
            httpMetadata: { contentType: "application/json; charset=utf-8" },
          });
        } else {
          const cached = await cachePutSelectionShare(shareId, payload);
          if (!cached) {
            return jsonResponse(
              { error: "Selection share storage unavailable" },
              500,
              notesShareCorsHeaders()
            );
          }
        }
        return jsonResponse(
          {
            shareId,
            url: new URL(`/s/${encodeURIComponent(shareId)}`, url.origin).toString(),
          },
          200,
          notesShareCorsHeaders()
        );
      } catch (error) {
        return jsonResponse(
          {
            error: "Failed to create selection share",
            detail: error && error.message ? error.message : String(error || ""),
          },
          500,
          notesShareCorsHeaders()
        );
      }
    }

    const selectionShareReadMatch = normalizedPath.match(
      /^\/(?:books\/api\/selection-share|api\/selection-share|books\/reader\/api\/selection-share|books\/reader1\/api\/selection-share|books\/api\/ss|api\/ss|books\/reader\/api\/ss|books\/reader1\/api\/ss)\/([A-Za-z0-9_-]{4,64})$/
    );
    if (selectionShareReadMatch) {
      if (request.method === "OPTIONS") {
        const headers = new Headers(notesShareCorsHeaders());
        headers.set("x-reader-worker", "1");
        headers.set("x-reader-route", "selection-share-read-options");
        return new Response(null, { status: 204, headers });
      }
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed" }, 405, notesShareCorsHeaders());
      }
      try {
        const shareId = String(selectionShareReadMatch[1] || "");
        const payload = await getSelectionSharePayload(env, shareId, selectionSharePrefix);
        if (!payload) return jsonResponse({ error: "Not found" }, 404, notesShareCorsHeaders());
        return jsonResponse({ shareId, payload }, 200, notesShareCorsHeaders());
      } catch (error) {
        return jsonResponse(
          {
            error: "Failed to load selection share",
            detail: error && error.message ? error.message : String(error || ""),
          },
          500,
          notesShareCorsHeaders()
        );
      }
    }

    if (
      normalizedPath === "/books/api/notes-share" ||
      normalizedPath === "/api/notes-share" ||
      normalizedPath === "/books/reader/api/notes-share" ||
      normalizedPath === "/books/reader1/api/notes-share" ||
      normalizedPath === "/books/api/ns" ||
      normalizedPath === "/api/ns" ||
      normalizedPath === "/books/reader/api/ns" ||
      normalizedPath === "/books/reader1/api/ns" ||
      normalizedPath.startsWith("/books/api/notes-share/") ||
      normalizedPath.startsWith("/api/notes-share/") ||
      normalizedPath.startsWith("/books/reader/api/notes-share/") ||
      normalizedPath.startsWith("/books/reader1/api/notes-share/") ||
      normalizedPath.startsWith("/books/api/ns/") ||
      normalizedPath.startsWith("/api/ns/") ||
      normalizedPath.startsWith("/books/reader/api/ns/") ||
      normalizedPath.startsWith("/books/reader1/api/ns/")
    ) {
      if (request.method === "OPTIONS") {
        const headers = new Headers(notesShareCorsHeaders());
        headers.set("x-reader-worker", "1");
        headers.set("x-reader-route", "notes-share-options");
        return new Response(null, { status: 204, headers });
      }
      if (
        normalizedPath === "/books/api/notes-share" ||
        normalizedPath === "/api/notes-share" ||
        normalizedPath === "/books/reader/api/notes-share" ||
        normalizedPath === "/books/reader1/api/notes-share" ||
        normalizedPath === "/books/api/ns" ||
        normalizedPath === "/api/ns" ||
        normalizedPath === "/books/reader/api/ns" ||
        normalizedPath === "/books/reader1/api/ns"
      ) {
        if (request.method !== "POST") {
          const headers = new Headers(notesShareCorsHeaders());
          headers.set("content-type", "application/json; charset=utf-8");
          headers.set("x-reader-worker", "1");
          headers.set("x-reader-route", "notes-share-method");
          return new Response(JSON.stringify({ error: "Method not allowed" }), {
            status: 405,
            headers,
          });
        }
        try {
          const body = await request.json();
          const notes = normalizeNotes(body?.notes);
          if (!notes.length) {
            return jsonResponse(
              { error: "No notes to share" },
              400,
              notesShareCorsHeaders()
            );
          }
          const bookId = String(body?.bookId || "").trim().slice(0, 200);
          const createdAt = Date.now();
          let shareId = "";
          let key = "";
          for (let i = 0; i < 5; i++) {
            shareId = randomShareId();
            key = `${notesSharePrefix}${shareId}.json`;
            if (env.READER_BOOKS) {
              const existing = await env.READER_BOOKS.get(key);
              if (!existing) break;
            } else {
              const existing = await cacheGetNotesShare(shareId);
              if (!existing) break;
            }
            shareId = "";
          }
          if (!shareId) {
            return jsonResponse(
              { error: "Failed to create share id" },
              500,
              notesShareCorsHeaders()
            );
          }
          const payload = {
            v: 1,
            bookId,
            createdAt,
            notes,
          };
          if (env.READER_BOOKS) {
            await env.READER_BOOKS.put(key, JSON.stringify(payload), {
              httpMetadata: { contentType: "application/json; charset=utf-8" },
            });
          } else {
            const cached = await cachePutNotesShare(shareId, payload);
            if (!cached) {
              return jsonResponse(
                { error: "Notes share storage unavailable" },
                500,
                notesShareCorsHeaders()
              );
            }
          }
          return jsonResponse(
            { shareId, count: notes.length },
            200,
            notesShareCorsHeaders()
          );
        } catch (error) {
          return jsonResponse(
            {
              error: "Failed to create notes share",
              detail: error && error.message ? error.message : String(error || ""),
            },
            500,
            notesShareCorsHeaders()
          );
        }
      }

      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed" }, 405, notesShareCorsHeaders());
      }
      try {
        const idMatch = normalizedPath.match(/\/(?:notes-share|ns)\/([A-Za-z0-9_-]+)$/);
        const shareId = idMatch ? String(idMatch[1]) : "";
        if (!shareId) {
          return jsonResponse({ error: "Missing share id" }, 400, notesShareCorsHeaders());
        }
        let data = null;
        if (env.READER_BOOKS) {
          const key = `${notesSharePrefix}${shareId}.json`;
          const obj = await env.READER_BOOKS.get(key);
          if (obj) data = await obj.json();
        } else {
          data = await cacheGetNotesShare(shareId);
        }
        if (!data) return jsonResponse({ error: "Not found" }, 404, notesShareCorsHeaders());
        const notes = normalizeNotes(data?.notes);
        return jsonResponse(
          { shareId, bookId: String(data?.bookId || ""), notes },
          200,
          notesShareCorsHeaders()
        );
      } catch (error) {
        return jsonResponse(
          {
            error: "Failed to load notes share",
            detail: error && error.message ? error.message : String(error || ""),
          },
          500,
          notesShareCorsHeaders()
        );
      }
    }

    if (
      normalizedPath === "/books/api/translate" ||
      normalizedPath === "/api/translate"
    ) {
      if (request.method === "OPTIONS") {
        const headers = new Headers({
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type",
          "cache-control": "no-store",
        });
        headers.set("x-reader-worker", "1");
        headers.set("x-reader-route", "translate-options");
        return new Response(null, { status: 204, headers });
      }
      if (request.method !== "POST") {
        const headers = new Headers({
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type",
        });
        headers.set("x-reader-worker", "1");
        headers.set("x-reader-route", "translate-method");
        return new Response(
          JSON.stringify({ error: "Method not allowed. Use POST." }),
          { status: 405, headers }
        );
      }
      try {
        const body = await request.json();
        const text = String(body?.text || "").trim();
        const source = String(body?.source || "auto").trim() || "auto";
        const target = String(body?.target || "en").trim() || "en";
        const translateApiKey = String(
          env.READERPUB_GOOGLE_TRANSLATE_API_KEY ||
            env.GOOGLE_TRANSLATE_API_KEY ||
            ""
        ).trim();
        if (!text) {
          const headers = new Headers({
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "content-type",
          });
          headers.set("x-reader-worker", "1");
          headers.set("x-reader-route", "translate-empty");
          return new Response(
            JSON.stringify({ error: "Empty text." }),
            { status: 400, headers }
          );
        }
        if (!translateApiKey) {
          const headers = new Headers({
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "content-type",
          });
          headers.set("x-reader-worker", "1");
          headers.set("x-reader-route", "translate-config");
          return new Response(
            JSON.stringify({ error: "Translate API key is not configured." }),
            { status: 503, headers }
          );
        }

        const queryText = text.slice(0, 5000);
        const endpoint = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(
          translateApiKey
        )}`;
        const decodeHtmlEntities = (input) =>
          String(input || "")
            .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
              String.fromCodePoint(parseInt(hex, 16))
            )
            .replace(/&#(\d+);/g, (_, dec) =>
              String.fromCodePoint(parseInt(dec, 10))
            )
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&apos;/g, "'")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&");
        const payload = {
          q: queryText,
          target,
          format: "text",
        };
        if (source && source !== "auto") payload.source = source;
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        let translatedText = "";
        let detectedSource = source;
        let lastFailure = {
          status: 0,
          detail: "",
        };
        let attempts = 0;

        for (let attempt = 1; attempt <= 3 && !translatedText; attempt++) {
          attempts = attempt;
          let controller = null;
          let timeoutId = null;
          try {
            if (typeof AbortController !== "undefined") {
              controller = new AbortController();
              timeoutId = setTimeout(() => {
                try {
                  controller.abort();
                } catch (e0) {}
              }, 9000);
            }
            const upstream = await fetch(endpoint, {
              method: "POST",
              headers: {
                accept: "application/json,text/plain,*/*",
                "content-type": "application/json; charset=utf-8",
              },
              body: JSON.stringify(payload),
              signal: controller ? controller.signal : undefined,
            });
            const raw = await upstream.text();
            let data = null;
            try {
              data = raw ? JSON.parse(raw) : null;
            } catch (e0) {
              data = null;
            }
            if (!upstream.ok) {
              const errorDetail =
                (data &&
                  data.error &&
                  (data.error.message || data.error.status || data.error.code)) ||
                raw ||
                "";
              lastFailure = {
                status: upstream.status || 0,
                detail: String(errorDetail).slice(0, 300),
              };
              if (attempt < 3 && (upstream.status === 429 || upstream.status >= 500)) {
                await sleep(220 * attempt);
                continue;
              }
              break;
            }
            const first =
              data &&
              data.data &&
              Array.isArray(data.data.translations) &&
              data.data.translations.length
                ? data.data.translations[0]
                : null;
            if (!first || !first.translatedText) {
              lastFailure = {
                status: 502,
                detail: "Official API returned empty translation.",
              };
              if (attempt < 3) {
                await sleep(220 * attempt);
                continue;
              }
              break;
            }
            translatedText = decodeHtmlEntities(first.translatedText);
            detectedSource =
              (first.detectedSourceLanguage &&
                String(first.detectedSourceLanguage).trim()) ||
              source;
          } catch (e) {
            lastFailure = {
              status: 0,
              detail: e && e.message ? String(e.message).slice(0, 300) : "network error",
            };
            if (attempt < 3) {
              await sleep(220 * attempt);
              continue;
            }
          } finally {
            if (timeoutId) clearTimeout(timeoutId);
          }
        }

        if (!translatedText) {
          const headers = new Headers({
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "content-type",
          });
          headers.set("x-reader-worker", "1");
          headers.set("x-reader-route", "translate-upstream");
          return new Response(
            JSON.stringify({
              error: "Translate upstream failed.",
              status: lastFailure.status,
              detail: lastFailure.detail,
              attempts,
            }),
            { status: 502, headers }
          );
        }

        const headers = new Headers({
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
        });
        headers.set("x-reader-worker", "1");
        headers.set("x-reader-route", "translate");
        return new Response(
          JSON.stringify({ translatedText, detectedSource, target }),
          { status: 200, headers }
        );
      } catch (error) {
        const headers = new Headers({
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type",
        });
        headers.set("x-reader-worker", "1");
        headers.set("x-reader-route", "translate-error");
        return new Response(
          JSON.stringify({
            error: "Translate request failed.",
            detail: error && error.message ? error.message : String(error || ""),
          }),
          { status: 500, headers }
        );
      }
    }

    // ── Platform API (v1) ──────────────────────────────────
    if (
      normalizedPath.startsWith("/books/api/v1/") ||
      normalizedPath.startsWith("/api/v1/")
    ) {
      // CORS preflight for all platform API routes
      if (request.method === "OPTIONS") {
        return buildApiOptionsResponse();
      }

      const apiPath = normalizedPath.startsWith("/books/api/v1/")
        ? normalizedPath.slice("/books/api/v1".length)
        : normalizedPath.slice("/api/v1".length);

      const extractedApiContext = {
        ...(await createApiContext({ request, env, url })),
        apiPath,
      };

      let extractedResponse = await handleIdentityApiRoute(extractedApiContext);
      if (extractedResponse) return extractedResponse;

      extractedResponse = await handleCatalogApiRoute(extractedApiContext);
      if (extractedResponse) return extractedResponse;

      extractedResponse = await handleReaderApiRoute(extractedApiContext);
      if (extractedResponse) return extractedResponse;

      extractedResponse = await handleReaderAccessApiRoute(extractedApiContext);
      if (extractedResponse) return extractedResponse;

      extractedResponse = await handleCommerceApiRoute(extractedApiContext);
      if (extractedResponse) return extractedResponse;

      extractedResponse = await handlePublishingApiRoute(extractedApiContext, {
        processEpub,
        updateCatalogIndexes,
      });
      if (extractedResponse) return extractedResponse;

      // Parse JWT if present (does not reject — some routes are public)
      let user = null;
      const authHeader = request.headers.get("authorization") || "";
      if (authHeader.startsWith("Bearer ")) {
        const token = authHeader.slice(7);
        user = await verifySupabaseJwt(token, env);
      }

      // Route definitions with auth requirements
      const apiCorsHeaders = {
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      };

      // Helper: require auth
      const requireAuth = () => {
        if (!user) {
          return jsonResponse(
            { error: "Authentication required" },
            401,
            apiCorsHeaders
          );
        }
        return null;
      };

      const requireInternalTaskAuth = () => {
        const provided = String(request.headers.get("x-reader-internal-key") || "").trim();
        const acceptedSecrets = [
          String(env.PROTECTED_JOB_CALLBACK_SECRET || "").trim(),
          String(env.INTERNAL_TASK_SECRET || "").trim(),
          String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
        ].filter(Boolean);
        if (!provided || acceptedSecrets.length === 0 || !acceptedSecrets.includes(provided)) {
          return jsonResponse({ error: "Forbidden" }, 403, apiCorsHeaders);
        }
        return null;
      };

      const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
      const roleRank = (role) => {
        const normalized = String(role || "").trim().toLowerCase();
        if (normalized === "owner") return 100;
        if (normalized === "admin") return 90;
        if (normalized === "publisher") return 80;
        if (normalized === "editor") return 70;
        return 10;
      };

      const bootstrapSuperuserEmails = new Set(
        String(env.PLATFORM_BOOTSTRAP_SUPERUSER_EMAILS || "yarane@gmail.com")
          .split(",")
          .map((item) => normalizeEmail(item))
          .filter(Boolean)
      );

      // Helper: create Supabase admin client (service role)
      const supabaseAdmin = () => {
        const url = String(env.SUPABASE_URL || "").trim();
        const key = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
        if (!url || !key) return null;
        return { url, key };
      };

      // Helper: fetch from Supabase REST API
      const sbFetch = async (table, { method = "GET", params = "", body, key, single = false } = {}) => {
        const sb = supabaseAdmin();
        if (!sb) return { data: null, error: "Supabase not configured" };
        const fetchUrl = `${sb.url}/rest/v1/${table}${params ? "?" + params : ""}`;
        const headers = {
          "apikey": sb.key,
          "authorization": `Bearer ${sb.key}`,
          "content-type": "application/json",
        };
        if (single) headers["accept"] = "application/vnd.pgrst.object+json";
        if (method === "POST") headers["prefer"] = "return=representation";
        if (method === "PATCH") headers["prefer"] = "return=representation";
        const opts = { method, headers };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(fetchUrl, opts);
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          return { data: null, error: detail || `HTTP ${res.status}` };
        }
        const data = await res.json().catch(() => null);
        return { data, error: null };
      };

      const buildInviteUrl = (token) => {
        const baseUrl = String(env.PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
        const origin = baseUrl || url.origin;
        const inviteUrl = new URL("/books/auth/", origin);
        inviteUrl.searchParams.set("invite", String(token || "").trim());
        return inviteUrl.toString();
      };

      const sendInviteEmail = async ({ email, subject, html, text, trackingId = "" }) => {
        const apiKey = String(env.PINGRAM_API_KEY || "").trim();
        const clientId = String(env.PINGRAM_CLIENT_ID || "").trim();
        const clientSecret = String(env.PINGRAM_CLIENT_SECRET || "").trim();
        const baseUrl = String(env.PINGRAM_API_BASE_URL || env.NOTIFICATIONAPI_BASE_URL || "https://api.notificationapi.com").trim().replace(/\/+$/, "");
        const senderName = String(env.PINGRAM_SENDER_NAME || "reader.pub").trim();
        const senderEmail = String(env.PINGRAM_SENDER_EMAIL || "").trim();
        if (!email) return { sent: false, skipped: true, reason: "missing-email" };
        if (!apiKey && !(clientId && clientSecret)) {
          return { sent: false, skipped: true, reason: "missing-pingram-config" };
        }
        if (!senderEmail) {
          return { sent: false, skipped: true, reason: "missing-pingram-sender-email" };
        }

        const payload = {
          type: "readerpub_invite",
          to: {
            id: normalizeEmail(email) || String(email).trim(),
            email: normalizeEmail(email),
          },
          email: {
            subject,
            html,
            senderName,
            senderEmail,
          },
        };
        if (text) payload.email.previewText = text.slice(0, 200);

        let endpoint = `${baseUrl}/send`;
        const headers = {
          "content-type": "application/json",
        };

        if (apiKey) {
          headers.authorization = `Bearer ${apiKey}`;
          headers["x-api-key"] = apiKey;
        } else {
          endpoint = `${baseUrl}/${encodeURIComponent(clientId)}/sender`;
          headers.authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
        }
        if (trackingId) headers["x-reader-tracking-id"] = trackingId;

        const response = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          throw new Error(detail || `Pingram request failed with HTTP ${response.status}`);
        }
        return {
          sent: true,
          skipped: false,
          detail: await readJsonSafe(response),
        };
      };

      const sbAuthAdmin = async (path, { method = "GET", body } = {}) => {
        const sb = supabaseAdmin();
        if (!sb) return { data: null, error: "Supabase not configured", detail: null };
        const response = await fetch(`${sb.url}/auth/v1/admin${path}`, {
          method,
          headers: {
            "apikey": sb.key,
            "authorization": `Bearer ${sb.key}`,
            "content-type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const data = await readJsonSafe(response);
        if (!response.ok) {
          const errorMessage = data?.msg || data?.message || data?.error || `HTTP ${response.status}`;
          return { data: null, error: errorMessage, detail: data };
        }
        return { data, error: null, detail: data };
      };

      const createPasswordUser = async ({ email, password, displayName }) => {
        const normalizedEmail = normalizeEmail(email);
        const normalizedPassword = String(password || "");
        const normalizedDisplayName = String(displayName || "").trim();
        if (!normalizedEmail) return { data: null, error: "email is required", detail: null };
        if (normalizedPassword.length < 6) {
          return { data: null, error: "password must be at least 6 characters", detail: null };
        }

        const result = await sbAuthAdmin("/users", {
          method: "POST",
          body: {
            email: normalizedEmail,
            password: normalizedPassword,
            email_confirm: true,
            user_metadata: normalizedDisplayName ? { display_name: normalizedDisplayName } : {},
          },
        });
        if (result.error) return result;
        return {
          data: {
            id: result.data?.id,
            email: result.data?.email || normalizedEmail,
          },
          error: null,
          detail: result.detail,
        };
      };

      const applyTenantInviteForUser = async (invite, { userId, email }) => {
        if (!invite) return { data: null, error: "Invitation not found" };
        if (invite.accepted_at) return { data: null, error: "Invitation already accepted" };
        if (invite.expires_at && new Date(invite.expires_at) <= new Date()) {
          return { data: null, error: "Invitation has expired" };
        }
        if (normalizeEmail(invite.email) !== normalizeEmail(email)) {
          return { data: null, error: "Invitation email does not match authenticated user" };
        }

        const grantedRole = invite.invite_type === "self_publisher" ? "owner" : invite.role;

        const { data: existingMembership } = await sbFetch("tenant_memberships", {
          params: `tenant_id=eq.${invite.tenant_id}&user_id=eq.${userId}&select=id,role,is_active`,
          single: true,
        });
        if (existingMembership) {
          const nextRole = roleRank(existingMembership.role) >= roleRank(grantedRole)
            ? existingMembership.role
            : grantedRole;
          await sbFetch("tenant_memberships", {
            method: "PATCH",
            params: `id=eq.${existingMembership.id}`,
            body: { role: nextRole, is_active: true },
          });
        } else {
          const { error: membershipErr } = await sbFetch("tenant_memberships", {
            method: "POST",
            body: {
              tenant_id: invite.tenant_id,
              user_id: userId,
              role: grantedRole,
            },
            single: true,
          });
          if (membershipErr) return { data: null, error: membershipErr };
        }

        await sbFetch("tenant_invitations", {
          method: "PATCH",
          params: `id=eq.${invite.id}&select=*`,
          body: { accepted_at: new Date().toISOString() },
        });

        const { data: tenant } = await sbFetch("tenants", {
          params: `id=eq.${invite.tenant_id}&select=id,slug,name,tenant_type`,
          single: true,
        });
        return {
          data: {
            accepted: true,
            invite_type: invite.invite_type || "tenant_reader",
            role: grantedRole,
            tenant,
          },
          error: null,
        };
      };

      const applySuperuserInviteForUser = async (invite, { userId, email }) => {
        if (!invite) return { data: null, error: "Invitation not found" };
        if (invite.accepted_at) return { data: null, error: "Invitation already accepted" };
        if (invite.expires_at && new Date(invite.expires_at) <= new Date()) {
          return { data: null, error: "Invitation has expired" };
        }
        if (normalizeEmail(invite.email) !== normalizeEmail(email)) {
          return { data: null, error: "Invitation email does not match authenticated user" };
        }

        const { data: existingSuperuser } = await sbFetch("platform_superusers", {
          params: `user_id=eq.${userId}&select=user_id`,
          single: true,
        });
        if (!existingSuperuser) {
          const { error: grantErr } = await sbFetch("platform_superusers", {
            method: "POST",
            body: {
              user_id: userId,
              granted_by: invite.invited_by || userId,
            },
            single: true,
          });
          if (grantErr) return { data: null, error: grantErr };
        }

        await sbFetch("platform_superuser_invitations", {
          method: "PATCH",
          params: `id=eq.${invite.id}&select=*`,
          body: {
            accepted_at: new Date().toISOString(),
            accepted_by: userId,
          },
        });

        return {
          data: {
            accepted: true,
            invite_type: "platform_superuser",
            role: "superuser",
          },
          error: null,
        };
      };

      const applyInvitationTokenForUser = async (token, { userId, email }) => {
        const { data: invite, error: inviteErr } = await sbFetch("tenant_invitations", {
          params: `token=eq.${token}&select=*`,
          single: true,
        });
        if (!inviteErr && invite) {
          return applyTenantInviteForUser(invite, { userId, email });
        }

        const { data: superInvite, error: superInviteErr } = await sbFetch("platform_superuser_invitations", {
          params: `token=eq.${token}&select=*`,
          single: true,
        });
        if (superInviteErr || !superInvite) {
          return { data: null, error: "Invitation not found" };
        }
        return applySuperuserInviteForUser(superInvite, { userId, email });
      };

      const inspectInvitationToken = async (token) => {
        const { data: invite, error: inviteErr } = await sbFetch("tenant_invitations", {
          params: `token=eq.${token}&select=*`,
          single: true,
        });
        if (!inviteErr && invite) {
          const { data: tenant } = await sbFetch("tenants", {
            params: `id=eq.${invite.tenant_id}&select=id,slug,name,tenant_type`,
            single: true,
          });
          return {
            data: {
              token,
              email: invite.email,
              role: invite.role,
              invite_type: invite.invite_type || "tenant_reader",
              accepted_at: invite.accepted_at || null,
              expires_at: invite.expires_at || null,
              tenant,
            },
            error: null,
          };
        }

        const { data: superInvite, error: superInviteErr } = await sbFetch("platform_superuser_invitations", {
          params: `token=eq.${token}&select=*`,
          single: true,
        });
        if (superInviteErr || !superInvite) {
          return { data: null, error: "Invitation not found" };
        }
        return {
          data: {
            token,
            email: superInvite.email,
            role: "superuser",
            invite_type: "platform_superuser",
            accepted_at: superInvite.accepted_at || null,
            expires_at: superInvite.expires_at || null,
            tenant: null,
          },
          error: null,
        };
      };

      const sendTenantInviteNotification = async ({ invite, tenant, audienceLabel }) => {
        if (!invite?.token || !invite?.email || !tenant?.name) {
          return { sent: false, skipped: true, reason: "missing-invite-data" };
        }
        const inviteUrl = buildInviteUrl(invite.token);
        const roleLabel = String(invite.role || "member").replace(/_/g, " ");
        return sendInviteEmail({
          email: invite.email,
          subject: `You were invited to join ${tenant.name} on reader.pub`,
          html: `
            <p>You were invited to join <strong>${escapeHtml(tenant.name)}</strong> on reader.pub.</p>
            <p>Access level: <strong>${escapeHtml(roleLabel)}</strong>${audienceLabel ? ` (${escapeHtml(audienceLabel)})` : ""}</p>
            <p><a href="${escapeHtml(inviteUrl)}">Accept your invitation</a></p>
            <p>If you do not have an account yet, the link will let you set a password directly without waiting for a confirmation email.</p>
          `,
          text:
            `You were invited to join ${tenant.name} on reader.pub as ${roleLabel}. ` +
            `Open this link to accept your invitation: ${inviteUrl}`,
          trackingId: `tenant-invite:${invite.id || invite.token}`,
        });
      };

      const sendSuperuserInviteNotification = async ({ invite }) => {
        if (!invite?.token || !invite?.email) {
          return { sent: false, skipped: true, reason: "missing-invite-data" };
        }
        const inviteUrl = buildInviteUrl(invite.token);
        return sendInviteEmail({
          email: invite.email,
          subject: "You were invited to become a reader.pub superuser",
          html: `
            <p>You were invited to become a <strong>reader.pub superuser</strong>.</p>
            <p><a href="${escapeHtml(inviteUrl)}">Accept your invitation</a></p>
            <p>The link will let you create an account or sign in without relying on Supabase email delivery.</p>
          `,
          text:
            `You were invited to become a reader.pub superuser. ` +
            `Open this link to accept your invitation: ${inviteUrl}`,
          trackingId: `superuser-invite:${invite.id || invite.token}`,
        });
      };

      const getPlatformSuperuserStatus = async () => {
        if (!user) return false;
        if (bootstrapSuperuserEmails.has(normalizeEmail(user.email))) return true;
        const { data, error } = await sbFetch("platform_superusers", {
          params: `user_id=eq.${user.sub}&select=user_id`,
          single: true,
        });
        return !error && !!data;
      };

      const requireSuperuser = async () => {
        const authErr = requireAuth();
        if (authErr) return authErr;
        if (await getPlatformSuperuserStatus()) return null;
        return jsonResponse({ error: "Superuser access required" }, 403, apiCorsHeaders);
      };

      const getTenantAdminMemberships = async () => {
        if (!user) return [];
        const { data, error } = await sbFetch("tenant_memberships", {
          params: `user_id=eq.${user.sub}&is_active=eq.true&role=in.(owner,admin)&select=id,role,tenant_id,tenants:tenant_id(id,slug,name,tenant_type)`,
        });
        if (error || !Array.isArray(data)) return [];
        return data;
      };

      const getTenantPublishingMemberships = async () => {
        if (!user) return [];
        const { data, error } = await sbFetch("tenant_memberships", {
          params: `user_id=eq.${user.sub}&is_active=eq.true&role=in.(owner,admin,publisher)&select=id,role,tenant_id,tenants:tenant_id(id,slug,name,tenant_type)`,
        });
        if (error || !Array.isArray(data)) return [];
        return data;
      };

      const listPlatformTenants = async () => {
        const { data, error } = await sbFetch("tenants", {
          params: "select=id,slug,name,tenant_type,is_active,created_at&order=name.asc",
        });
        if (error || !Array.isArray(data)) return [];
        return data;
      };

      const attachProfilesToMemberships = async (memberships) => {
        const rows = Array.isArray(memberships) ? memberships : [];
        const userIds = [...new Set(rows.map((row) => String(row.user_id || "").trim()).filter(Boolean))];
        if (!userIds.length) return rows.map((row) => ({ ...row, profile: null }));

        const encodedIds = userIds.map((id) => `"${id}"`).join(",");
        const { data: profiles } = await sbFetch("user_profiles", {
          params: `id=in.(${encodedIds})&select=id,display_name,avatar_url`,
        });
        const byId = new Map((Array.isArray(profiles) ? profiles : []).map((profile) => [String(profile.id), profile]));

        return rows.map((row) => ({
          ...row,
          profile: byId.get(String(row.user_id || "")) || null,
        }));
      };

      const canManageTenantUsers = async (tenantId) => {
        const normalizedTenantId = String(tenantId || "").trim();
        if (!normalizedTenantId || !user) return false;
        if (await getPlatformSuperuserStatus()) return true;
        const { data: membership } = await sbFetch("tenant_memberships", {
          params: `tenant_id=eq.${normalizedTenantId}&user_id=eq.${user.sub}&is_active=eq.true&select=role`,
          single: true,
        });
        return !!membership && ["owner", "admin"].includes(String(membership.role || ""));
      };

      const listPlatformTenantsWithRoster = async () => {
        const [tenants, membershipsRes, invitesRes] = await Promise.all([
          listPlatformTenants(),
          sbFetch("tenant_memberships", {
            params: "is_active=eq.true&select=id,tenant_id,user_id,role,department,created_at&order=created_at.asc",
          }),
          sbFetch("tenant_invitations", {
            params: "accepted_at=is.null&select=id,tenant_id,email,role,invite_type,token,created_at,expires_at&order=created_at.desc",
          }),
        ]);

        const memberships = await attachProfilesToMemberships(Array.isArray(membershipsRes?.data) ? membershipsRes.data : []);
        const pendingInvites = Array.isArray(invitesRes?.data) ? invitesRes.data : [];

        return tenants.map((tenant) => ({
          ...tenant,
          members: memberships
            .filter((row) => String(row.tenant_id || "") === String(tenant.id))
            .map((row) => ({
              id: row.id,
              user_id: row.user_id,
              role: row.role,
              department: row.department,
              created_at: row.created_at,
              status: "active",
              profile: row.profile || null,
            })),
          pending_invites: pendingInvites
            .filter((row) => String(row.tenant_id || "") === String(tenant.id))
            .map((row) => ({
              id: row.id,
              email: row.email,
              role: row.role,
              invite_type: row.invite_type,
              token: row.token,
              created_at: row.created_at,
              expires_at: row.expires_at,
              status: "pending",
            })),
        }));
      };

      const getActiveUserTenantIds = async (userId) => {
        const normalizedUserId = String(userId || "").trim();
        if (!normalizedUserId) return [];
        const { data, error } = await sbFetch("tenant_memberships", {
          params: `user_id=eq.${normalizedUserId}&is_active=eq.true&select=tenant_id`,
        });
        if (error || !Array.isArray(data)) return [];
        return [...new Set(data.map((row) => String(row.tenant_id || "").trim()).filter(Boolean))];
      };

      const userCanAccessTenantBook = async (book, userId) => {
        if (!book || !userId) return false;
        if (String(book.published_by_user_id || "") === String(userId)) return true;
        const visibility = String(book.visibility || "");
        const tenantId = String(book.published_by_tenant_id || "").trim();
        if (visibility !== "tenant_only" || !tenantId) return false;
        const tenantIds = await getActiveUserTenantIds(userId);
        return tenantIds.includes(tenantId);
      };

      const resolvePublishingTenant = async ({ tenantId = "", tenantSlug = "" } = {}) => {
        const [isSuperuser, memberships] = await Promise.all([
          getPlatformSuperuserStatus(),
          getTenantPublishingMemberships(),
        ]);

        const normalizedTenantId = String(tenantId || "").trim();
        const normalizedTenantSlug = String(tenantSlug || "").trim().toLowerCase();

        if (!normalizedTenantId && !normalizedTenantSlug && isSuperuser) {
          return {
            tenantId: "",
            tenantSlug: "",
            membership: null,
            personal: true,
          };
        }

        if (!memberships.length) {
          return { error: jsonResponse({ error: "Publishing access required" }, 403, apiCorsHeaders) };
        }

        let match = null;
        if (normalizedTenantId) {
          match = memberships.find((item) => String(item.tenant_id || "") === normalizedTenantId) || null;
          if (!match) {
            return { error: jsonResponse({ error: "Not authorized for requested tenant" }, 403, apiCorsHeaders) };
          }
        } else if (normalizedTenantSlug) {
          match = memberships.find((item) => String(item?.tenants?.slug || "").toLowerCase() === normalizedTenantSlug) || null;
          if (!match) {
            return { error: jsonResponse({ error: "Not authorized for requested tenant" }, 403, apiCorsHeaders) };
          }
        } else if (memberships.length === 1) {
          match = memberships[0];
        } else {
          return { error: jsonResponse({ error: "tenant_id or tenant_slug is required when you administer multiple tenants" }, 400, apiCorsHeaders) };
        }

        return {
          tenantId: String(match.tenant_id || ""),
          tenantSlug: String(match?.tenants?.slug || ""),
          membership: match,
          personal: false,
        };
      };

      // Helper: call Supabase RPC
      const sbRpc = async (fn, args = {}) => {
        const sb = supabaseAdmin();
        if (!sb) return { data: null, error: "Supabase not configured" };
        const res = await fetch(`${sb.url}/rest/v1/rpc/${fn}`, {
          method: "POST",
          headers: {
            "apikey": sb.key,
            "authorization": `Bearer ${sb.key}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(args),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          return { data: null, error: detail || `HTTP ${res.status}` };
        }
        const data = await res.json().catch(() => null);
        return { data, error: null };
      };


      // ── Fallback: route not found ──
      return jsonResponse({ error: "Not found" }, 404, apiCorsHeaders);
    }

    if (decodedPath.startsWith("/books/api/")) {
      const decodedKey = `api/${decodedPath.slice("/books/api/".length)}`;
      const rawKey = `api/${path.slice("/books/api/".length)}`;
      if (!env.READER_BOOKS) {
        const headers = new Headers({
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        });
        headers.set("x-reader-worker", "1");
        headers.set("x-reader-route", "r2-missing");
        return new Response("R2 binding missing", { status: 500, headers });
      }
      let object = await env.READER_BOOKS.get(decodedKey);
      if (!object && rawKey !== decodedKey) {
        object = await env.READER_BOOKS.get(rawKey);
      }
      const lowerDecodedKey = decodedKey.toLocaleLowerCase();
      const lowerRawKey = rawKey.toLocaleLowerCase();
      if (!object && lowerDecodedKey !== decodedKey && lowerDecodedKey !== rawKey) {
        object = await env.READER_BOOKS.get(lowerDecodedKey);
      }
      if (!object && lowerRawKey !== rawKey && lowerRawKey !== decodedKey && lowerRawKey !== lowerDecodedKey) {
        object = await env.READER_BOOKS.get(lowerRawKey);
      }
      if (!object) {
        const headers = new Headers({
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        });
        headers.set("x-reader-worker", "1");
        headers.set("x-reader-route", "r2-miss");
        return new Response("Not found", { status: 404, headers });
      }
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("etag", object.httpEtag);
      headers.set("cache-control", "no-store");
      headers.set("x-reader-worker", "1");
      headers.set("x-reader-route", "r2");
      return new Response(object.body, { headers });
    }

    if (decodedPath.startsWith("/books/content/")) {
      const key = `content/${decodedPath.slice("/books/content/".length)}`;
      if (!env.READER_BOOKS) {
        const headers = new Headers({
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        });
        headers.set("x-reader-worker", "1");
        headers.set("x-reader-route", "r2-content-missing");
        return new Response("R2 binding missing", { status: 500, headers });
      }
      const object = await env.READER_BOOKS.get(key);
      if (!object) {
        const headers = new Headers({
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        });
        headers.set("x-reader-worker", "1");
        headers.set("x-reader-route", "r2-content-miss");
        return new Response("Not found", { status: 404, headers });
      }
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("etag", object.httpEtag);
      headers.set("cache-control", "public, max-age=3600");
      headers.set("x-reader-worker", "1");
      headers.set("x-reader-route", "r2-content");
      return new Response(object.body, { headers });
    }

    if (decodedPath.startsWith("/books/protected-content/")) {
      if (!env.READER_BOOKS) {
        return proxyReaderBooksUpstream(request, path, "proxy-reader-books-protected-content");
      }
      const decodedKey = `protected-content/${decodedPath.slice("/books/protected-content/".length)}`;
      const rawKey = `protected-content/${path.slice("/books/protected-content/".length)}`;
      let object = await env.READER_BOOKS.get(decodedKey);
      if (!object && rawKey !== decodedKey) {
        object = await env.READER_BOOKS.get(rawKey);
      }
      if (!object) {
        const headers = new Headers({
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
        });
        headers.set("x-reader-worker", "1");
        headers.set("x-reader-route", "r2-protected-content-miss");
        return new Response("Not found", { status: 404, headers });
      }
      const headers = new Headers({
        "content-type": contentTypeFromR2Key(decodedKey),
        "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
        "cdn-cache-control": "no-store",
        "cloudflare-cdn-cache-control": "no-store",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, HEAD, OPTIONS",
        "access-control-allow-headers": "content-type",
      });
      try {
        object.writeHttpMetadata(headers);
      } catch (error) {}
      headers.set("etag", object.httpEtag);
      headers.set("x-reader-worker", "1");
      headers.set("x-reader-route", "r2-protected-content");
      return new Response(object.body, { headers });
    }

    if (path === "/books/ping") {
      const headers = new Headers({
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "x-reader-ping": "1",
      });
      headers.set("x-reader-worker", "1");
      headers.set("x-reader-route", "ping");
      return new Response("pong\n", { status: 200, headers });
    }

    if (path === "/docs") {
      const headers = new Headers({ location: "/docs/" });
      headers.set("x-reader-worker", "1");
      headers.set("x-reader-route", "docs-slash-redirect");
      return new Response(null, { status: 302, headers });
    }

    if (decodedPath.startsWith("/docs/") && !isPagesDevHost) {
      const docsUser = String(env.DOCS_AUTH_USER || "").trim();
      const docsPass = String(env.DOCS_AUTH_PASS || "");
      if (!docsUser || !docsPass) {
        const headers = new Headers({
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        });
        headers.set("x-reader-worker", "1");
        headers.set("x-reader-route", "docs-auth-config");
        return new Response("Docs auth is not configured", { status: 503, headers });
      }
      const credentials = parseBasicAuthCredentials(
        request.headers.get("authorization")
      );
      if (
        !credentials ||
        credentials.user !== docsUser ||
        credentials.pass !== docsPass
      ) {
        return docsAuthUnauthorizedResponse("docs-auth");
      }
    }

    // Normalize reader/catalog roots to trailing-slash form to avoid 404 on some routes.
    if (
      path === "/books/reader" ||
      path === "/books/reader_new" ||
      path === "/books/reader_new_v5" ||
      path === "/books/protected" ||
      path === "/books/reader_new_v4" ||
      path === "/books/reader1" ||
      path === "/books/catalog"
    ) {
      const headers = new Headers({ location: `${path}/${url.search || ""}` });
      headers.set("x-reader-worker", "1");
      headers.set("x-reader-route", "slash-redirect");
      return new Response(null, { status: 302, headers });
    }

    let assetRequest = request;
    let assetPath = path;

    // Rewrite /books/reader/* to /reader/* so it works without the router,
    // while still applying the standard response headers and HTML rewriting.
    if (path.startsWith("/books/reader/")) {
      const rewrittenPath =
        path === "/books/reader/" || path === "/books/reader/index.html"
          ? "/reader1/index.html"
          : path.replace(/^\/books\/reader/, "/reader1");
      const rewrittenUrl = new URL(url);
      rewrittenUrl.pathname = rewrittenPath;
      assetRequest = new Request(rewrittenUrl.toString(), request);
      assetPath = rewrittenPath;
    }

    const idMatch = path.match(/^\/books\/(\d+)(\/)?$/);
    if (idMatch) {
      const id = idMatch[1];
      const isPagesDev = url.hostname.endsWith(".pages.dev");
      const location = isPagesDev ? `/reader/#${id}` : `/books/reader/#${id}`;
      const headers = new Headers({ location });
      headers.set("x-reader-worker", "1");
      headers.set("x-reader-route", "redirect");
      return new Response(null, { status: 302, headers });
    }

    if (path === "/books/reader_new/" || path === "/books/reader_new/index.html" || path.startsWith("/books/reader_new/css/") || path.startsWith("/books/reader_new/js/") || path.startsWith("/books/reader_new/icons/") || path.startsWith("/books/reader_new/fonts/") || path.startsWith("/books/reader_new/img/")) {
      const rewrittenUrl = new URL(request.url);
      rewrittenUrl.pathname =
        path === "/books/reader_new/" || path === "/books/reader_new/index.html"
          ? "/reader/reader_new.html"
          : path.replace(/^\/books\/reader_new/, "/books/reader");
      assetRequest = new Request(rewrittenUrl.toString(), request);
      assetPath = rewrittenUrl.pathname;
    } else if (path === "/books/reader_new_v4/" || path === "/books/reader_new_v4/index.html") {
      const rewrittenUrl = new URL(request.url);
      rewrittenUrl.pathname = "/reader/reader_new_v4.html";
      assetRequest = new Request(rewrittenUrl.toString(), request);
      assetPath = rewrittenUrl.pathname;
    } else if (path === "/books/reader_new_v5/" || path === "/books/reader_new_v5/index.html" || path === "/books/protected/" || path === "/books/protected/index.html") {
      const rewrittenUrl = new URL(request.url);
      rewrittenUrl.pathname = "/reader/reader_new_v5.html";
      assetRequest = new Request(rewrittenUrl.toString(), request);
      assetPath = rewrittenUrl.pathname;
    } else if (path.startsWith("/books/protected/css/") || path.startsWith("/books/protected/js/") || path.startsWith("/books/protected/icons/") || path.startsWith("/books/protected/font/") || path.startsWith("/books/protected/fonts/") || path.startsWith("/books/protected/img/")) {
      const rewrittenUrl = new URL(request.url);
      rewrittenUrl.pathname = path.replace(/^\/books\/protected/, "/reader");
      assetRequest = new Request(rewrittenUrl.toString(), request);
      assetPath = rewrittenUrl.pathname;
    } else if (path === "/reader_new/" || path === "/reader_new/index.html" || path.startsWith("/reader_new/css/") || path.startsWith("/reader_new/js/") || path.startsWith("/reader_new/icons/") || path.startsWith("/reader_new/fonts/") || path.startsWith("/reader_new/img/")) {
      const rewrittenUrl = new URL(request.url);
      rewrittenUrl.pathname =
        path === "/reader_new/" || path === "/reader_new/index.html"
          ? "/reader/reader_new.html"
          : path.replace(/^\/reader_new/, "/reader");
      assetRequest = new Request(rewrittenUrl.toString(), request);
      assetPath = rewrittenUrl.pathname;
    }
    const response = await env.ASSETS.fetch(assetRequest);
    const headers = new Headers(response.headers);
    const isCatalogHtml =
      path === "/books" || path === "/books/" || path === "/books/index.html";
    const isReaderPath =
      path === "/books/reader/" ||
      path === "/books/reader/index.html" ||
      path.startsWith("/books/reader/css/") ||
      path.startsWith("/books/reader/js/") ||
      path.startsWith("/books/reader/icons/") ||
      path.startsWith("/books/reader/fonts/") ||
      path.startsWith("/books/reader/img/") ||
      assetPath === "/reader/" ||
      assetPath === "/reader/index.html" ||
      assetPath.startsWith("/reader/css/") ||
      assetPath.startsWith("/reader/js/") ||
      assetPath.startsWith("/reader/icons/") ||
      assetPath.startsWith("/reader/fonts/") ||
      assetPath.startsWith("/reader/img/") ||
      path === "/books/reader_new/" ||
      path === "/books/reader_new/index.html" ||
      path.startsWith("/books/reader_new/css/") ||
      path.startsWith("/books/reader_new/js/") ||
      path.startsWith("/books/reader_new/icons/") ||
      path.startsWith("/books/reader_new/fonts/") ||
      path.startsWith("/books/reader_new/img/") ||
      path === "/books/reader_new_v4/" ||
      path === "/books/reader_new_v4/index.html" ||
      path === "/books/reader_new_v5/" ||
      path === "/books/reader_new_v5/index.html" ||
      path === "/books/protected/" ||
      path === "/books/protected/index.html" ||
      path.startsWith("/books/protected/css/") ||
      path.startsWith("/books/protected/js/") ||
      path.startsWith("/books/protected/icons/") ||
      path.startsWith("/books/protected/font/") ||
      path.startsWith("/books/protected/fonts/") ||
      path.startsWith("/books/protected/img/") ||
      path === "/books/reader1/" ||
      path === "/books/reader1/index.html" ||
      path.startsWith("/books/reader1/css/") ||
      path.startsWith("/books/reader1/js/") ||
      path.startsWith("/books/reader1/icons/") ||
      path.startsWith("/books/reader1/fonts/") ||
      path.startsWith("/books/reader1/img/");
    const isAuthPath =
      path.startsWith("/books/auth/");
    const isDocsPath = path === "/docs/" || path.startsWith("/docs/");
    const contentType = String(headers.get("content-type") || "").toLowerCase();
    const isHtml = contentType.includes("text/html");

    headers.set("x-reader-worker", "1");
    if (isCatalogHtml) {
      headers.set("x-reader-route", "catalog");
    } else if (isDocsPath) {
      headers.set("x-reader-route", "docs");
    } else {
      headers.set("x-reader-route", "assets");
    }
    if (isCatalogHtml) {
      headers.set("cache-control", "no-store");
    }
    if (isDocsPath) {
      headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
      headers.set("pragma", "no-cache");
      headers.set("expires", "0");
      headers.set("cdn-cache-control", "no-store");
      headers.set("cloudflare-cdn-cache-control", "no-store");
    }
    if (isReaderPath) {
      headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
      headers.set("pragma", "no-cache");
      headers.set("expires", "0");
      headers.set("cdn-cache-control", "no-store");
      headers.set("cloudflare-cdn-cache-control", "no-store");
    }
    if (isAuthPath) {
      headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
      headers.set("pragma", "no-cache");
    }

    const isReaderPreviewHtml =
      path === "/books/reader/" ||
      path === "/books/reader/index.html" ||
      path === "/reader1/" ||
      path === "/reader1/index.html";
    const readerPreviewMeta = isHtml && isReaderPreviewHtml
      ? await resolveReaderPreviewMeta(env, url)
      : null;
    const readerPreviewMetaTags = buildReaderPreviewMetaTags(readerPreviewMeta);

    if (isHtml && (driveClientId || posthogKey || posthogHost || rawPosthogEnabled || readerPreviewMetaTags)) {
      let rewriter = new HTMLRewriter();
      if (driveClientId) {
        rewriter = rewriter.on('meta[name="google-drive-client-id"]', {
          element(element) {
            element.setAttribute("content", driveClientId);
          },
        });
      }
      if (rawPosthogEnabled || posthogKey || posthogHost) {
        rewriter = rewriter.on('meta[name="posthog-enabled"]', {
          element(element) {
            element.setAttribute("content", posthogEnabled ? "true" : "false");
          },
        });
      }
      if (posthogKey) {
        rewriter = rewriter.on('meta[name="posthog-key"]', {
          element(element) {
            element.setAttribute("content", posthogKey);
          },
        });
      }
      if (posthogHost) {
        rewriter = rewriter.on('meta[name="posthog-host"]', {
          element(element) {
            element.setAttribute("content", posthogHost);
          },
        });
      }
      if (readerPreviewMetaTags) {
        rewriter = rewriter.on("head", {
          element(element) {
            element.append(readerPreviewMetaTags, { html: true });
          },
        });
      }
      const rewritten = rewriter.transform(new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      }));
      return rewritten;
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
