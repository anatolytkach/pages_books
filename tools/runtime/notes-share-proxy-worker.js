function corsHeaders(extra) {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "x-reader-notes-proxy": "1",
    ...(extra || {})
  };
}

function json(payload, status, extraHeaders) {
  return new Response(JSON.stringify(payload), {
    status: status || 200,
    headers: corsHeaders(extraHeaders)
  });
}

function randomShareId() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
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
      comment: String(item.comment || "").slice(0, 8000)
    });
    if (out.length >= 500) break;
  }
  return out;
}

function extractShareIdFromPath(pathname) {
  const m = String(pathname || "").match(/\/(?:notes-share|ns)\/([A-Za-z0-9_-]+)$/);
  return m ? String(m[1]) : "";
}

function normalizePath(pathname) {
  let p = String(pathname || "");
  if (p.startsWith("/books/reader/api/notes-share")) p = p.replace("/books/reader/api/notes-share", "/books/api/notes-share");
  else if (p.startsWith("/books/reader/api/ns")) p = p.replace("/books/reader/api/ns", "/books/api/ns");
  else if (p.startsWith("/api/notes-share")) p = p.replace("/api/notes-share", "/books/api/notes-share");
  else if (p.startsWith("/api/ns")) p = p.replace("/api/ns", "/books/api/ns");
  return p;
}

async function fetchLegacyShare(url, request) {
  try {
    const upstream = new URL("https://master.reader-books.pages.dev");
    upstream.pathname = normalizePath(url.pathname);
    upstream.search = url.search;
    const resp = await fetch(new Request(upstream.toString(), request), { redirect: "follow" });
    if (!resp.ok) return null;
    return await resp.json();
  } catch (e) {}
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = String(request.method || "GET").toUpperCase();
    const pathname = normalizePath(url.pathname);
    const isCreateRoute =
      pathname === "/books/api/notes-share" ||
      pathname === "/books/api/ns";
    const isReadRoute =
      pathname.startsWith("/books/api/notes-share/") ||
      pathname.startsWith("/books/api/ns/");

    if (method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
    if (!isCreateRoute && !isReadRoute) return json({ error: "Not found" }, 404);

    const kv = env && env.READERPUB_NOTES_SHARE_KV ? env.READERPUB_NOTES_SHARE_KV : null;
    if (!kv) return json({ error: "KV binding missing" }, 500);

    if (isCreateRoute) {
      if (method !== "POST") return json({ error: "Method not allowed" }, 405);
      try {
        const body = await request.json();
        const notes = normalizeNotes(body && body.notes);
        if (!notes.length) return json({ error: "No notes to share" }, 400);
        const bookId = String((body && body.bookId) || "").trim().slice(0, 200);
        let shareId = "";
        for (let i = 0; i < 8; i++) {
          const candidate = randomShareId();
          const exists = await kv.get("ns:" + candidate);
          if (!exists) {
            shareId = candidate;
            break;
          }
        }
        if (!shareId) return json({ error: "Failed to create share id" }, 500);
        const payload = { v: 2, bookId, createdAt: Date.now(), notes };
        await kv.put("ns:" + shareId, JSON.stringify(payload), { expirationTtl: 31536000 });
        return json({ shareId, count: notes.length }, 200);
      } catch (e) {
        return json({ error: "Failed to create notes share" }, 500);
      }
    }

    if (method !== "GET") return json({ error: "Method not allowed" }, 405);
    const shareId = extractShareIdFromPath(pathname);
    if (!shareId) return json({ error: "Missing share id" }, 400);

    try {
      let payload = null;
      const raw = await kv.get("ns:" + shareId);
      if (raw) {
        try { payload = JSON.parse(raw); } catch (e0) { payload = null; }
      }
      if (!payload) {
        const legacy = await fetchLegacyShare(url, request);
        if (legacy && Array.isArray(legacy.notes) && legacy.notes.length) {
          payload = {
            v: 2,
            bookId: String(legacy.bookId || ""),
            createdAt: Date.now(),
            notes: normalizeNotes(legacy.notes)
          };
          await kv.put("ns:" + shareId, JSON.stringify(payload), { expirationTtl: 31536000 });
        }
      }
      if (!payload) return json({ error: "Not found" }, 404);
      return json(
        {
          shareId,
          bookId: String(payload.bookId || ""),
          notes: normalizeNotes(payload.notes)
        },
        200
      );
    } catch (e) {
      return json({ error: "Failed to load notes share" }, 500);
    }
  }
};
