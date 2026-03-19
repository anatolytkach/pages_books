function jsonResponse(payload, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    ...extraHeaders,
  });
  headers.set("x-reader-worker", "1");
  return new Response(JSON.stringify(payload), { status, headers });
}

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
  const author = extractXmlTag(opfXml, "dc:creator") || extractXmlTag(opfXml, "creator");
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
async function updateCatalogIndexes(env, book) {
  if (!env.READER_BOOKS) return;

  const authorName = String(book.author || "").trim();
  const title = String(book.title || "").trim();
  const contentId = String(book.content_id || "");
  const coverUrl = book.cover_url || "";
  const language = String(book.language || "en").trim();
  if (!authorName || !title || !contentId) return;

  const { authorKey, indexKey, display: authorDisplay } = parseAuthorForIndex(authorName);

  // Update both root index and language-specific index
  const prefixes = ["api"];
  if (language && language !== "und") {
    prefixes.push(`api/lang/${language}`);
  }

  for (const apiPrefix of prefixes) {
    await updateCatalogIndexesForPrefix(env, apiPrefix, {
      authorKey, indexKey, authorDisplay, title, contentId, coverUrl,
    });
  }
}

async function updateCatalogIndexesForPrefix(env, apiPrefix, { authorKey, indexKey, authorDisplay, title, contentId, coverUrl }) {

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
  if (!authorData.books.some(b => b.id === contentId)) {
    authorData.books.push({ id: contentId, title, cover: coverUrl });
    authorData.books.sort((a, b) => a.title.localeCompare(b.title));
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
  const tokens = buildSearchTokens(title, authorDisplay);
  for (const token of tokens) {
    const r2Key = `${apiPrefix}/search/${token}.json`;
    let searchData;
    try {
      const obj = await env.READER_BOOKS.get(r2Key);
      searchData = obj ? await obj.json() : null;
    } catch { searchData = null; }

    if (!searchData) searchData = { items: [] };

    // Add book/title entry matching Python indexer format:
    // { id: "200005", title: "Trial by Sorcery", a: "Fierce, Richard", k: "richardfierce", cover: "/books/content/..." }
    const titleEntry = searchData.items.find(i => i.id === contentId);
    if (!titleEntry) {
      searchData.items.push({
        id: contentId,
        title: title,
        a: authorDisplay,
        k: authorKey,
        cover: coverUrl || "",
      });
    }

    await env.READER_BOOKS.put(r2Key, JSON.stringify(searchData), {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
    });
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

/**
 * Parse author name following the same convention as build_lang_indexes.py:
 * - Author key: first+last (e.g., "rexhurst" for "Hurst, Rex")
 * - Index key: last+first (e.g., "hurstrex") — used for prefix tree browsing
 * - Display: "Last, First" (e.g., "Hurst, Rex")
 */
function parseAuthorForIndex(name) {
  const raw = name.trim();
  let last, rest;
  if (raw.includes(",")) {
    [last, rest] = raw.split(",", 2).map(s => s.trim());
  } else {
    const parts = raw.split(/\s+/);
    if (parts.length <= 1) {
      last = raw;
      rest = "";
    } else {
      last = parts[parts.length - 1];
      rest = parts.slice(0, -1).join(" ");
    }
  }
  if (!last) last = raw;
  const display = rest ? `${last}, ${rest}` : last;
  const indexName = `${last} ${rest}`.trim();  // "Hurst Rex"

  const slugify = (s) => s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

  const authorKey = slugify(rest ? `${rest}${last}` : last);  // "rexhurst"
  const indexKey = slugify(indexName);                          // "hurstrex"

  return { authorKey, indexKey, display };
}

function buildPrefixLevels(indexKey) {
  // Build prefix hierarchy from index key (last name first)
  // e.g., "hurstrex" → ["h", "hu", "hur"]
  const levels = [];
  for (let i = 1; i <= Math.min(3, indexKey.length); i++) {
    levels.push(indexKey.slice(0, i));
  }
  return levels;
}

function buildSearchTokens(title, author) {
  const tokens = new Set();
  const words = `${title} ${author}`.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length >= 2);

  for (const word of words) {
    // Add 2-char and 3-char prefixes
    if (word.length >= 2) tokens.add(word.slice(0, 2));
    if (word.length >= 3) tokens.add(word.slice(0, 3));
  }
  return [...tokens];
}

function getFirstLetter(authorKey) {
  const ch = authorKey.charAt(0);
  if (ch >= "0" && ch <= "9") return "num";
  return ch;
}

function extractXmlTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : null;
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

async function readBucketObject(env, key) {
  if (!env.READER_BOOKS) return null;
  return await env.READER_BOOKS.get(key);
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
    "x-reader-seo-render": "9",
  };
}

function buildSitemapCacheHeaders(version) {
  return {
    "cache-control": "public, max-age=900, s-maxage=3600, stale-while-revalidate=86400",
    "x-reader-seo-version": String(version || ""),
    "x-reader-seo-render": "9",
  };
}

function buildSeoCacheKey(url, version, variant = "") {
  const cacheUrl = new URL(url.toString());
  cacheUrl.hash = "";
  cacheUrl.search = "";
  cacheUrl.searchParams.set("__seo_v", String(version || "0"));
  cacheUrl.searchParams.set("__seo_render", "9");
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
      .chapterHtml img { max-width: 100%; height: auto; }
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
  const description = sanitizeMetaDescription(
    book.description || book.meta_description || `${book.title} by ${book.authorName}`
  );
  const data = {
    "@context": "https://schema.org",
    "@type": "Book",
    name: book.title,
    url: `${origin}/book/${book.slug}`,
    author: {
      "@type": "Person",
      name: book.authorName,
      url: `${origin}/author/${book.authorSlug}`,
    },
    inLanguage: book.language || "und",
  };
  if (book.cover) data.image = `${origin}${book.cover}`;
  if (description) data.description = description;
  return data;
}

function contentDirForChapter(bookId, chapter) {
  const raw = String((chapter && chapter.sourcePath) || "").trim();
  const dir = raw.includes("/") ? raw.slice(0, raw.lastIndexOf("/") + 1) : "";
  return `/books/content/${bookId}/${dir}`;
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

function renderBookPage(origin, book) {
  const coverHtml = book.cover
    ? `<img class="cover" src="${escapeHtml(book.cover)}" alt="${escapeHtml(book.title)} cover" />`
    : "";
  const categoryHtml = Array.isArray(book.categories) && book.categories.length
    ? `<div class="tags">${book.categories
        .map(
          (item) =>
            `<a class="tag" href="${escapeHtml(buildCatalogCategoryHref(item.slug))}">${escapeHtml(item.title)}</a>`
        )
        .join("")}</div>`
    : "";
  const chaptersHtml = Array.isArray(book.chapters) && book.chapters.length
    ? `<ol class="list">${book.chapters
        .map(
          (chapter) =>
            `<li><a href="${escapeHtml(chapter.href)}">Chapter ${chapter.n}: ${escapeHtml(chapter.title)}</a></li>`
        )
        .join("")}</ol>`
    : `<div class="meta">No chapter map available.</div>`;
  const aboutText = book.description || book.excerpt || "";
  const excerptHtml = aboutText
    ? `<div class="excerpt"><p>${escapeHtml(aboutText)}</p></div>`
    : `<div class="meta">Excerpt is not available.</div>`;
  const heroClass = coverHtml ? "hero withCover" : "hero";
  const bodyHtml = `
    ${buildBreadcrumbs([
      { label: "Books", href: "/books/" },
      { label: book.authorName, href: `/author/${book.authorSlug}` },
      { label: book.title },
    ])}
    <main class="panel">
      <div class="${heroClass}">
        ${coverHtml}
        <div class="heroText">
          <h1>${escapeHtml(book.title)}</h1>
          <div class="meta">By <a href="/author/${encodeURIComponent(book.authorSlug)}">${escapeHtml(book.authorName)}</a></div>
          <div class="actions">
            <a class="btn" href="${escapeHtml(book.readerUrl)}">Open in WeRead</a>
            <a class="btn secondary" href="/books/">All Books</a>
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
      <section class="section">
        <div class="sectionHead">
          <h2 class="sectionTitle">Chapters</h2>
          <div class="sectionMeta">${Array.isArray(book.chapters) ? book.chapters.length : 0} chapters</div>
        </div>
        ${chaptersHtml}
      </section>
    </main>`;
  return renderSeoLayout({
    title: `${book.title} — ${book.authorName}`,
    description: book.meta_description || book.description || `${book.title} by ${book.authorName}`,
    canonical: seoCanonical(origin, `/book/${book.slug}`),
    structuredData: buildBookJsonLd(origin, book),
    bodyHtml,
  });
}

function renderChapterPage(origin, book, chapter, chapterHtml) {
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
      { label: book.authorName, href: `/author/${book.authorSlug}` },
      { label: book.title, href: `/book/${book.slug}` },
      { label: chapter.title },
    ])}
    <main class="panel">
      <div class="hero">
        <div class="heroText">
          <h1>${escapeHtml(book.title)}</h1>
          <div class="meta">Chapter ${chapter.n}: ${escapeHtml(chapter.title)}</div>
          <div class="actions">
            <a class="btn" href="${escapeHtml(book.readerUrl)}">Open in WeRead</a>
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
    bodyHtml,
  });
}

function renderAuthorPage(origin, author) {
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
      { label: author.name },
    ])}
    <main class="panel">
      <div class="hero">
        <div class="heroText">
          <h1>${escapeHtml(author.name)}</h1>
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
    title: `Books by ${author.name}`,
    description: `${author.count || 0} books by ${author.name} on ReaderPub.`,
    canonical: seoCanonical(origin, `/author/${author.slug}`),
    bodyHtml,
  });
}

function renderCategoryPage(origin, category) {
  const catalogHref = buildCatalogCategoryHref(category.slug);
  const booksHtml = Array.isArray(category.books) && category.books.length
    ? `<ol class="list">${category.books
        .map(
          (book) =>
            `<li><a href="/book/${encodeURIComponent(book.slug)}">${escapeHtml(book.title)}</a> <span class="submeta">by <a href="/author/${encodeURIComponent(book.authorSlug)}">${escapeHtml(book.author)}</a></span></li>`
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
            <a class="btn" href="${escapeHtml(catalogHref)}">Open in Catalog</a>
            <a class="btn secondary" href="/books/">All Books</a>
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
    return await withSeoCache(request, globalVersion, cacheVariant, async () => {
      const response = xmlResponse(buildSitemapXml(canonicalOrigin, payload.items || []), 200, {
        ...buildSitemapCacheHeaders(globalVersion),
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
      const response = htmlResponse(renderAuthorPage(canonicalOrigin, author), 200, {
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
      const response = htmlResponse(renderCategoryPage(canonicalOrigin, category), 200, {
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
      return await withSeoCache(request, book.version || globalVersion, cacheVariant, async () => {
        const response = htmlResponse(renderBookPage(canonicalOrigin, book), 200, {
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
      const sourceKey = `content/${book.id}/${chapter.sourcePath}`;
      let xhtmlText = await readBucketText(env, sourceKey);
      if (!xhtmlText) {
        xhtmlText = await fetchTextAbsolute(
          `${publicContentOrigin}/books/content/${book.id}/${chapter.sourcePath}`
        );
      }
      if (!xhtmlText) {
        return textResponse("Chapter source not found", 404, {
          "cache-control": "no-store",
          "x-reader-route": "seo-chapter-source-miss",
        });
      }
      const assetBase = contentDirForChapter(book.id, chapter);
      const chapterInner = rewriteRelativeChapterHtml(extractBodyInnerHtml(xhtmlText), assetBase);
      const response = htmlResponse(renderChapterPage(canonicalOrigin, book, chapter, chapterInner), 200, {
        ...buildSeoCacheHeaders(book.version || globalVersion),
        "x-reader-route": "seo-chapter",
      });
      return response;
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

    if (
      path === "/robots.txt" ||
      path === "/sitemap.xml" ||
      path.startsWith("/sitemaps/") ||
      path.startsWith("/book/") ||
      path.startsWith("/author/") ||
      path.startsWith("/category/")
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
      normalizedPath === "/books/api/notes-share" ||
      normalizedPath === "/api/notes-share" ||
      normalizedPath === "/books/reader/api/notes-share" ||
      normalizedPath === "/books/api/ns" ||
      normalizedPath === "/api/ns" ||
      normalizedPath === "/books/reader/api/ns" ||
      normalizedPath.startsWith("/books/api/notes-share/") ||
      normalizedPath.startsWith("/api/notes-share/") ||
      normalizedPath.startsWith("/books/reader/api/notes-share/") ||
      normalizedPath.startsWith("/books/api/ns/") ||
      normalizedPath.startsWith("/api/ns/") ||
      normalizedPath.startsWith("/books/reader/api/ns/")
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
        normalizedPath === "/books/api/ns" ||
        normalizedPath === "/api/ns" ||
        normalizedPath === "/books/reader/api/ns"
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
        return new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
            "access-control-allow-headers": "content-type, authorization",
            "access-control-max-age": "86400",
            "x-reader-worker": "1",
          },
        });
      }

      const apiPath = normalizedPath.startsWith("/books/api/v1/")
        ? normalizedPath.slice("/books/api/v1".length)
        : normalizedPath.slice("/api/v1".length);

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

      // ── GET /v1/me — current user profile ──
      if (apiPath === "/me" && request.method === "GET") {
        const authErr = requireAuth();
        if (authErr) return authErr;
        const { data, error } = await sbFetch("user_profiles", {
          params: `id=eq.${user.sub}&select=*`,
          single: true,
        });
        if (error) return jsonResponse({ error }, 500, apiCorsHeaders);
        return jsonResponse(data || {}, 200, apiCorsHeaders);
      }

      // ── GET /v1/me/entitlements — user's entitlements ──
      if (apiPath === "/me/entitlements" && request.method === "GET") {
        const authErr = requireAuth();
        if (authErr) return authErr;
        const { data, error } = await sbFetch("entitlements", {
          params: `user_id=eq.${user.sub}&is_active=eq.true&select=*,books:book_id(id,title,author,cover_url,content_id)`,
        });
        if (error) return jsonResponse({ error }, 500, apiCorsHeaders);
        return jsonResponse(data || [], 200, apiCorsHeaders);
      }

      // ── GET /v1/me/tenants — user's tenant memberships ──
      if (apiPath === "/me/tenants" && request.method === "GET") {
        const authErr = requireAuth();
        if (authErr) return authErr;
        const { data, error } = await sbFetch("tenant_memberships", {
          params: `user_id=eq.${user.sub}&is_active=eq.true&select=id,role,department,tenants:tenant_id(id,slug,name,tenant_type,logo_url)`,
        });
        if (error) return jsonResponse({ error }, 500, apiCorsHeaders);
        return jsonResponse(data || [], 200, apiCorsHeaders);
      }

      // ── GET /v1/debug/reindex/:contentId — temporary debug endpoint ──
      const debugReindexMatch = apiPath.match(/^\/debug\/reindex\/(\d+)$/);
      if (debugReindexMatch && request.method === "GET") {
        const contentId = debugReindexMatch[1];
        const { data: book } = await sbFetch("books", {
          params: `content_id=eq.${contentId}&select=*`,
          single: true,
        });
        if (!book) return jsonResponse({ error: "Book not found" }, 404, apiCorsHeaders);
        try {
          await updateCatalogIndexes(env, book);
          return jsonResponse({ ok: true, book: { id: book.id, content_id: book.content_id, title: book.title, author: book.author, language: book.language, cover_url: book.cover_url } }, 200, apiCorsHeaders);
        } catch (err) {
          return jsonResponse({ error: err.message, stack: err.stack }, 500, apiCorsHeaders);
        }
      }

      // ── GET /v1/genres — list genres ──
      if (apiPath === "/genres" && request.method === "GET") {
        const { data, error } = await sbFetch("genres", {
          params: "select=*&order=display_order",
        });
        if (error) return jsonResponse({ error }, 500, apiCorsHeaders);
        return jsonResponse(data || [], 200, apiCorsHeaders);
      }

      // ── GET /v1/books/by-content/:contentId — look up book by content_id ──
      const byContentMatch = apiPath.match(/^\/books\/by-content\/(\d+)$/);
      if (byContentMatch && request.method === "GET") {
        const contentId = byContentMatch[1];
        const { data: book } = await sbFetch("books", {
          params: `content_id=eq.${contentId}&select=id,title,author,annotation,cover_url,status,is_free,published_by_user_id`,
          single: true,
        });
        if (!book) return jsonResponse({ error: "Book not found" }, 404, apiCorsHeaders);
        return jsonResponse(book, 200, apiCorsHeaders);
      }

      // ── GET /v1/books/by-content/:contentId/access — combined lookup + entitlement check ──
      const byContentAccessMatch = apiPath.match(/^\/books\/by-content\/(\d+)\/access$/);
      if (byContentAccessMatch && request.method === "GET") {
        const contentId = byContentAccessMatch[1];
        const { data: book } = await sbFetch("books", {
          params: `content_id=eq.${contentId}&select=id,title,author,annotation,cover_url,status,is_free,published_by_user_id`,
          single: true,
        });

        // Not in DB — grant access (Gutenberg or unknown)
        if (!book) return jsonResponse({ access: "full", type: "free" }, 200, apiCorsHeaders);

        // Free books — grant access
        if (book.is_free) return jsonResponse({ access: "full", type: "free" }, 200, apiCorsHeaders);

        // Not published — grant access (draft/processing)
        if (book.status !== "published") return jsonResponse({ access: "full", type: "unpublished" }, 200, apiCorsHeaders);

        // Publisher always has access to their own books
        if (user && book.published_by_user_id === user.sub) {
          return jsonResponse({ access: "full", type: "publisher" }, 200, apiCorsHeaders);
        }

        // Check for purchase/rental entitlements
        if (user) {
          const { data: entitlements } = await sbFetch("entitlements", {
            params: `user_id=eq.${user.sub}&book_id=eq.${book.id}&is_active=eq.true&select=*&order=created_at.desc`,
          });
          if (entitlements && entitlements.length > 0) {
            for (const ent of entitlements) {
              if (ent.entitlement_type === "purchase") {
                return jsonResponse({ access: "full", type: "purchase" }, 200, apiCorsHeaders);
              }
              if (ent.entitlement_type === "rental") {
                if (!ent.expires_at || new Date(ent.expires_at) > new Date()) {
                  return jsonResponse({ access: "full", type: "rental", expires_at: ent.expires_at }, 200, apiCorsHeaders);
                }
              }
            }
          }
        }

        // Check if book has offers — if none, treat as free
        const { data: offers } = await sbFetch("book_offers", {
          params: `book_id=eq.${book.id}&is_active=eq.true&select=*`,
        });
        if (!offers || !offers.length) {
          return jsonResponse({ access: "full", type: "free" }, 200, apiCorsHeaders);
        }

        // Access denied — return book info and offers
        return jsonResponse({ access: "none", book, offers }, 200, apiCorsHeaders);
      }

      // ── GET /v1/books/:id/entitlement — check access ──
      const entitlementMatch = apiPath.match(/^\/books\/([0-9a-f-]+)\/entitlement$/);
      if (entitlementMatch && request.method === "GET") {
        const bookId = entitlementMatch[1];

        // Check if book is free
        const { data: book } = await sbFetch("books", {
          params: `id=eq.${bookId}&select=id,is_free,status`,
          single: true,
        });
        if (!book) return jsonResponse({ error: "Book not found" }, 404, apiCorsHeaders);
        if (book.is_free) {
          return jsonResponse({ access: "full", type: "free" }, 200, apiCorsHeaders);
        }

        // If not authenticated, check for offers
        if (!user) {
          const { data: offers } = await sbFetch("book_offers", {
            params: `book_id=eq.${bookId}&is_active=eq.true&select=*`,
          });
          return jsonResponse({ access: "none", offers: offers || [] }, 200, apiCorsHeaders);
        }

        // Check purchase entitlement
        const { data: entitlements } = await sbFetch("entitlements", {
          params: `user_id=eq.${user.sub}&book_id=eq.${bookId}&is_active=eq.true&select=*&order=created_at.desc`,
        });
        if (entitlements && entitlements.length > 0) {
          for (const ent of entitlements) {
            if (ent.entitlement_type === "purchase") {
              return jsonResponse({ access: "full", type: "purchase" }, 200, apiCorsHeaders);
            }
            if (ent.entitlement_type === "rental") {
              if (!ent.expires_at || new Date(ent.expires_at) > new Date()) {
                return jsonResponse({
                  access: "full",
                  type: "rental",
                  expires_at: ent.expires_at,
                }, 200, apiCorsHeaders);
              }
            }
          }
        }

        // No entitlement — check if there are any offers
        const { data: offers } = await sbFetch("book_offers", {
          params: `book_id=eq.${bookId}&is_active=eq.true&select=*`,
        });

        // If no offers exist, treat the book as publicly accessible
        if (!offers || !offers.length) {
          return jsonResponse({ access: "full", type: "free" }, 200, apiCorsHeaders);
        }

        return jsonResponse({ access: "none", offers }, 200, apiCorsHeaders);
      }

      // ── GET /v1/books/:id/offers — list offers ──
      const offersMatch = apiPath.match(/^\/books\/([0-9a-f-]+)\/offers$/);
      if (offersMatch && request.method === "GET") {
        const bookId = offersMatch[1];
        const { data, error } = await sbFetch("book_offers", {
          params: `book_id=eq.${bookId}&is_active=eq.true&select=*`,
        });
        if (error) return jsonResponse({ error }, 500, apiCorsHeaders);
        return jsonResponse(data || [], 200, apiCorsHeaders);
      }

      // ── POST /v1/books/:id/offers — create offer ──
      if (offersMatch && request.method === "POST") {
        const authErr = requireAuth();
        if (authErr) return authErr;
        const bookId = offersMatch[1];
        const body = await request.json().catch(() => null);
        if (!body || !body.offer_type) {
          return jsonResponse({ error: "offer_type is required" }, 400, apiCorsHeaders);
        }
        if (!["purchase", "rental"].includes(body.offer_type)) {
          return jsonResponse({ error: "offer_type must be 'purchase' or 'rental'" }, 400, apiCorsHeaders);
        }
        if (body.price_cents === undefined || body.price_cents < 0) {
          return jsonResponse({ error: "price_cents is required and must be >= 0" }, 400, apiCorsHeaders);
        }
        if (body.offer_type === "rental" && (!body.rental_days || body.rental_days < 1)) {
          return jsonResponse({ error: "rental_days is required for rental offers" }, 400, apiCorsHeaders);
        }

        // Verify user owns the book
        const { data: book } = await sbFetch("books", {
          params: `id=eq.${bookId}&published_by_user_id=eq.${user.sub}&select=id`,
          single: true,
        });
        if (!book) return jsonResponse({ error: "Book not found or not owned by you" }, 404, apiCorsHeaders);

        const offer = {
          book_id: bookId,
          offer_type: body.offer_type,
          price_cents: body.price_cents,
          currency: body.currency || "USD",
          created_by_user_id: user.sub,
        };
        if (body.offer_type === "rental") offer.rental_days = body.rental_days;

        const { data, error } = await sbFetch("book_offers", {
          method: "POST",
          body: offer,
          single: true,
        });
        if (error) return jsonResponse({ error }, 400, apiCorsHeaders);
        return jsonResponse(data, 201, apiCorsHeaders);
      }

      // ── PATCH /v1/offers/:id — update or deactivate offer ──
      const offerPatchMatch = apiPath.match(/^\/offers\/([0-9a-f-]+)$/);
      if (offerPatchMatch && request.method === "PATCH") {
        const authErr = requireAuth();
        if (authErr) return authErr;
        const offerId = offerPatchMatch[1];
        const body = await request.json().catch(() => null);
        if (!body) return jsonResponse({ error: "Invalid JSON" }, 400, apiCorsHeaders);

        const allowed = ["price_cents", "currency", "rental_days", "is_active"];
        const updates = {};
        for (const key of allowed) {
          if (body[key] !== undefined) updates[key] = body[key];
        }
        if (!Object.keys(updates).length) {
          return jsonResponse({ error: "No fields to update" }, 400, apiCorsHeaders);
        }

        const { data, error } = await sbFetch("book_offers", {
          method: "PATCH",
          params: `id=eq.${offerId}&created_by_user_id=eq.${user.sub}&select=*`,
          body: updates,
          single: true,
        });
        if (error) return jsonResponse({ error }, 400, apiCorsHeaders);
        if (!data) return jsonResponse({ error: "Offer not found" }, 404, apiCorsHeaders);
        return jsonResponse(data, 200, apiCorsHeaders);
      }

      // ── POST /v1/tenants — create tenant ──
      if (apiPath === "/tenants" && request.method === "POST") {
        const authErr = requireAuth();
        if (authErr) return authErr;
        const body = await request.json().catch(() => null);
        if (!body || !body.name || !body.slug || !body.tenant_type) {
          return jsonResponse({ error: "name, slug, and tenant_type are required" }, 400, apiCorsHeaders);
        }
        // Create tenant
        const { data: tenant, error: tenantErr } = await sbFetch("tenants", {
          method: "POST",
          body: { name: body.name, slug: body.slug, tenant_type: body.tenant_type },
          single: true,
        });
        if (tenantErr) return jsonResponse({ error: tenantErr }, 400, apiCorsHeaders);
        // Add creator as owner
        await sbFetch("tenant_memberships", {
          method: "POST",
          body: { tenant_id: tenant.id, user_id: user.sub, role: "owner" },
        });
        return jsonResponse(tenant, 201, apiCorsHeaders);
      }

      // ── GET /v1/tenants/:slug — tenant info ──
      const tenantSlugMatch = apiPath.match(/^\/tenants\/([a-z0-9][a-z0-9-]+[a-z0-9])$/);
      if (tenantSlugMatch && request.method === "GET") {
        const slug = tenantSlugMatch[1];
        const { data: tenant } = await sbFetch("tenants", {
          params: `slug=eq.${slug}&is_active=eq.true&select=*`,
          single: true,
        });
        if (!tenant) return jsonResponse({ error: "Tenant not found" }, 404, apiCorsHeaders);
        return jsonResponse(tenant, 200, apiCorsHeaders);
      }

      // ── GET /v1/tenants/:slug/members — list members (admin only) ──
      const tenantMembersMatch = apiPath.match(/^\/tenants\/([a-z0-9][a-z0-9-]+[a-z0-9])\/members$/);
      if (tenantMembersMatch && request.method === "GET") {
        const authErr = requireAuth();
        if (authErr) return authErr;
        const slug = tenantMembersMatch[1];
        const { data: tenant } = await sbFetch("tenants", {
          params: `slug=eq.${slug}&select=id`,
          single: true,
        });
        if (!tenant) return jsonResponse({ error: "Tenant not found" }, 404, apiCorsHeaders);

        // Check user is admin/owner
        const { data: membership } = await sbFetch("tenant_memberships", {
          params: `tenant_id=eq.${tenant.id}&user_id=eq.${user.sub}&is_active=eq.true&select=role`,
          single: true,
        });
        if (!membership || !["owner", "admin"].includes(membership.role)) {
          return jsonResponse({ error: "Not authorized" }, 403, apiCorsHeaders);
        }

        const { data: members } = await sbFetch("tenant_memberships", {
          params: `tenant_id=eq.${tenant.id}&is_active=eq.true&select=id,role,department,user_id,user_profiles:user_id(display_name,avatar_url)`,
        });
        return jsonResponse(members || [], 200, apiCorsHeaders);
      }

      // ── POST /v1/tenants/:slug/invite — invite by email ──
      const tenantInviteMatch = apiPath.match(/^\/tenants\/([a-z0-9][a-z0-9-]+[a-z0-9])\/invite$/);
      if (tenantInviteMatch && request.method === "POST") {
        const authErr = requireAuth();
        if (authErr) return authErr;
        const slug = tenantInviteMatch[1];
        const body = await request.json().catch(() => null);
        if (!body || !body.email || !body.role) {
          return jsonResponse({ error: "email and role are required" }, 400, apiCorsHeaders);
        }

        const { data: tenant } = await sbFetch("tenants", {
          params: `slug=eq.${slug}&select=id`,
          single: true,
        });
        if (!tenant) return jsonResponse({ error: "Tenant not found" }, 404, apiCorsHeaders);

        // Check user is admin/owner
        const { data: membership } = await sbFetch("tenant_memberships", {
          params: `tenant_id=eq.${tenant.id}&user_id=eq.${user.sub}&is_active=eq.true&select=role`,
          single: true,
        });
        if (!membership || !["owner", "admin"].includes(membership.role)) {
          return jsonResponse({ error: "Not authorized" }, 403, apiCorsHeaders);
        }

        const { data: invite, error: invErr } = await sbFetch("tenant_invitations", {
          method: "POST",
          body: {
            tenant_id: tenant.id,
            email: body.email,
            role: body.role,
            invited_by: user.sub,
          },
          single: true,
        });
        if (invErr) return jsonResponse({ error: invErr }, 400, apiCorsHeaders);
        return jsonResponse(invite, 201, apiCorsHeaders);
      }

      // ── GET /v1/publish/books — list user's books ──
      if (apiPath === "/publish/books" && request.method === "GET") {
        const authErr = requireAuth();
        if (authErr) return authErr;
        const { data, error } = await sbFetch("books", {
          params: `published_by_user_id=eq.${user.sub}&select=*&order=created_at.desc`,
        });
        if (error) return jsonResponse({ error }, 500, apiCorsHeaders);
        return jsonResponse(data || [], 200, apiCorsHeaders);
      }

      // ── GET /v1/publish/books/:id — get book draft ──
      const publishBookMatch = apiPath.match(/^\/publish\/books\/([0-9a-f-]+)$/);
      if (publishBookMatch && request.method === "GET") {
        const authErr = requireAuth();
        if (authErr) return authErr;
        const bookId = publishBookMatch[1];
        const { data: book } = await sbFetch("books", {
          params: `id=eq.${bookId}&published_by_user_id=eq.${user.sub}&select=*`,
          single: true,
        });
        if (!book) return jsonResponse({ error: "Book not found" }, 404, apiCorsHeaders);
        // Attach source asset info
        const { data: assets } = await sbFetch("source_assets", {
          params: `book_id=eq.${bookId}&select=*&order=created_at.desc&limit=1`,
        });
        if (assets && assets.length) book.source_asset = assets[0];
        return jsonResponse(book, 200, apiCorsHeaders);
      }

      // ── PATCH /v1/publish/books/:id/metadata — update metadata ──
      const metaMatch = apiPath.match(/^\/publish\/books\/([0-9a-f-]+)\/metadata$/);
      if (metaMatch && request.method === "PATCH") {
        const authErr = requireAuth();
        if (authErr) return authErr;
        const bookId = metaMatch[1];
        const body = await request.json().catch(() => null);
        if (!body) return jsonResponse({ error: "Invalid JSON" }, 400, apiCorsHeaders);

        const allowed = ["title", "author", "genre_id", "year_written", "isbn", "language", "annotation", "cover_url"];
        const updates = {};
        for (const key of allowed) {
          if (body[key] !== undefined) updates[key] = body[key];
        }
        if (!Object.keys(updates).length) {
          return jsonResponse({ error: "No fields to update" }, 400, apiCorsHeaders);
        }

        const { data, error } = await sbFetch("books", {
          method: "PATCH",
          params: `id=eq.${bookId}&published_by_user_id=eq.${user.sub}&select=*`,
          body: updates,
          single: true,
        });
        if (error) return jsonResponse({ error }, 400, apiCorsHeaders);
        return jsonResponse(data, 200, apiCorsHeaders);
      }

      // ── DELETE /v1/publish/books/:id — delete a draft/failed book ──
      if (publishBookMatch && request.method === "DELETE") {
        const authErr = requireAuth();
        if (authErr) return authErr;
        const bookId = publishBookMatch[1];

        // Only allow deleting draft or failed books
        const { data: book } = await sbFetch("books", {
          params: `id=eq.${bookId}&published_by_user_id=eq.${user.sub}&select=id,status`,
          single: true,
        });
        if (!book) return jsonResponse({ error: "Book not found" }, 404, apiCorsHeaders);
        if (book.status === "published") {
          return jsonResponse({ error: "Cannot delete a published book. Unpublish it first." }, 400, apiCorsHeaders);
        }

        // Delete source assets first
        await sbFetch("source_assets", {
          method: "DELETE",
          params: `book_id=eq.${bookId}`,
        });
        // Delete the book
        await sbFetch("books", {
          method: "DELETE",
          params: `id=eq.${bookId}&published_by_user_id=eq.${user.sub}`,
        });
        return jsonResponse({ deleted: true }, 200, apiCorsHeaders);
      }

      // ── POST /v1/publish/books/:id/publish — publish a book ──
      const pubMatch = apiPath.match(/^\/publish\/books\/([0-9a-f-]+)\/publish$/);
      if (pubMatch && request.method === "POST") {
        const authErr = requireAuth();
        if (authErr) return authErr;
        const bookId = pubMatch[1];
        const body = await request.json().catch(() => ({}));
        const visibility = body.visibility || "public";

        // Verify book is ready and belongs to user
        const { data: book } = await sbFetch("books", {
          params: `id=eq.${bookId}&published_by_user_id=eq.${user.sub}&select=*`,
          single: true,
        });
        if (!book) return jsonResponse({ error: "Book not found" }, 404, apiCorsHeaders);
        if (book.status !== "ready") {
          return jsonResponse({ error: `Book status is '${book.status}', must be 'ready' to publish` }, 400, apiCorsHeaders);
        }
        if (!book.title || !book.author || !book.genre_id || !book.annotation) {
          return jsonResponse({ error: "Complete all required metadata before publishing" }, 400, apiCorsHeaders);
        }

        const { data, error } = await sbFetch("books", {
          method: "PATCH",
          params: `id=eq.${bookId}&published_by_user_id=eq.${user.sub}&select=*`,
          body: { status: "published", visibility },
          single: true,
        });
        if (error) return jsonResponse({ error }, 500, apiCorsHeaders);

        // Update catalog indexes so the book appears in browse/search
        let indexError = null;
        try {
          await updateCatalogIndexes(env, data);
        } catch (indexErr) {
          indexError = indexErr.message || String(indexErr);
        }

        const result = { ...data };
        if (indexError) result._indexError = indexError;
        return jsonResponse(result, 200, apiCorsHeaders);
      }

      // ── POST /v1/publish/upload — upload EPUB file ──
      if (apiPath === "/publish/upload" && request.method === "POST") {
        const authErr = requireAuth();
        if (authErr) return authErr;

        if (!env.READER_BOOKS) {
          return jsonResponse({ error: "Storage not configured" }, 500, apiCorsHeaders);
        }

        try {
          const formData = await request.formData();
          const file = formData.get("file");
          if (!file || !file.name) {
            return jsonResponse({ error: "No file provided" }, 400, apiCorsHeaders);
          }

          const filename = file.name;
          const lower = filename.toLowerCase();

          if (!lower.endsWith(".epub")) {
            return jsonResponse({ error: "Only .epub files are supported at this time" }, 400, apiCorsHeaders);
          }

          if (file.size > 100 * 1024 * 1024) {
            return jsonResponse({ error: "File too large (max 100 MB)" }, 400, apiCorsHeaders);
          }

          const format = "epub";
          const uploadId = crypto.randomUUID();
          const r2Key = `uploads/${uploadId}/${filename}`;

          // Store file in R2
          const fileBytes = await file.arrayBuffer();
          await env.READER_BOOKS.put(r2Key, fileBytes, {
            httpMetadata: { contentType: file.type || "application/epub+zip" },
          });

          // Get next content_id
          const { data: contentId } = await sbRpc("nextval_content_id");

          // Create book row
          const { data: book, error: bookErr } = await sbFetch("books", {
            method: "POST",
            body: {
              title: filename.replace(/\.epub$/i, "").replace(/[_-]/g, " "),
              author: "Unknown",
              genre_id: "fiction",
              annotation: "",
              content_id: String(contentId),
              published_by_user_id: user.sub,
              status: "processing",
            },
            single: true,
          });
          if (bookErr) return jsonResponse({ error: bookErr }, 500, apiCorsHeaders);

          // Create source_assets row
          await sbFetch("source_assets", {
            method: "POST",
            body: {
              book_id: book.id,
              filename,
              format,
              r2_key: r2Key,
              file_size_bytes: file.size,
              validation_status: "validating",
              uploaded_by: user.sub,
            },
          });

          // Process EPUB: validate, extract metadata, unpack to R2
          try {
            const epubResult = await processEpub(env, fileBytes, book.id, String(contentId));

            // Update book with extracted metadata
            const metaUpdates = { status: "ready" };
            if (epubResult.title) metaUpdates.title = epubResult.title;
            if (epubResult.author) metaUpdates.author = epubResult.author;
            if (epubResult.language) metaUpdates.language = epubResult.language;
            if (epubResult.coverUrl) metaUpdates.cover_url = epubResult.coverUrl;

            await sbFetch("books", {
              method: "PATCH",
              params: `id=eq.${book.id}`,
              body: metaUpdates,
            });

            await sbFetch("source_assets", {
              method: "PATCH",
              params: `book_id=eq.${book.id}`,
              body: { validation_status: "valid" },
            });
          } catch (procErr) {
            await sbFetch("books", {
              method: "PATCH",
              params: `id=eq.${book.id}`,
              body: { status: "failed" },
            });
            await sbFetch("source_assets", {
              method: "PATCH",
              params: `book_id=eq.${book.id}`,
              body: {
                validation_status: "invalid",
                validation_errors: [{ message: procErr.message || String(procErr) }],
              },
            });
          }

          return jsonResponse({ bookId: book.id, contentId: String(contentId) }, 201, apiCorsHeaders);
        } catch (err) {
          return jsonResponse({ error: err.message || "Upload failed" }, 500, apiCorsHeaders);
        }
      }

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
    if (path === "/books/reader" || path === "/books/catalog") {
      const headers = new Headers({ location: `${path}/` });
      headers.set("x-reader-worker", "1");
      headers.set("x-reader-route", "slash-redirect");
      return new Response(null, { status: 302, headers });
    }

    // Rewrite /books/reader/* to /reader/* so it works without the router
    if (path.startsWith("/books/reader/")) {
      const rewrittenPath = path.replace(/^\/books\/reader/, "/reader");
      const rewrittenUrl = new URL(url);
      rewrittenUrl.pathname = rewrittenPath;
      const rewrittenRequest = new Request(rewrittenUrl.toString(), request);
      return env.ASSETS.fetch(rewrittenRequest);
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

    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    const isCatalogHtml =
      path === "/books" || path === "/books/" || path === "/books/index.html";
    const isReaderPath =
      path === "/books/reader/" ||
      path === "/books/reader/index.html" ||
      path.startsWith("/books/reader/css/") ||
      path.startsWith("/books/reader/js/") ||
      path.startsWith("/books/reader/icons/") ||
      path.startsWith("/books/reader/fonts/");
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

    if (isHtml && (driveClientId || posthogKey || posthogHost || rawPosthogEnabled)) {
      const rewritten = new HTMLRewriter()
        .on('meta[name="google-drive-client-id"]', {
          element(element) {
            element.setAttribute("content", driveClientId);
          },
        })
        .on('meta[name="posthog-enabled"]', {
          element(element) {
            element.setAttribute("content", posthogEnabled ? "true" : "false");
          },
        })
        .on('meta[name="posthog-key"]', {
          element(element) {
            element.setAttribute("content", posthogKey);
          },
        })
        .on('meta[name="posthog-host"]', {
          element(element) {
            element.setAttribute("content", posthogHost);
          },
        })
        .transform(
          new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          })
        );
      return rewritten;
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
