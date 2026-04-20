export function jsonResponse(payload, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    ...extraHeaders,
  });
  headers.set("x-reader-worker", "1");
  return new Response(JSON.stringify(payload), { status, headers });
}

export function createApiCorsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "cache-control": "no-store",
  };
}

export function buildApiOptionsResponse() {
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

export async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function base64UrlDecode(str) {
  let s = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const binary = atob(s);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function roleRank(role) {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "owner") return 100;
  if (normalized === "admin") return 90;
  if (normalized === "publisher") return 80;
  if (normalized === "editor") return 70;
  return 10;
}

export async function verifySupabaseJwt(token, env) {
  try {
    const supabaseUrl = String(env.SUPABASE_URL || "").trim();
    const supabaseKey = String(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || "").trim();
    if (!supabaseUrl) return null;

    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        authorization: `Bearer ${token}`,
        apikey: supabaseKey,
      },
    });

    if (!res.ok) return null;

    const user = await res.json();
    if (!user || !user.id) return null;

    payload.sub = user.id;
    payload.email = user.email;
    return payload;
  } catch {
    return null;
  }
}

export function getSupabaseAdminConfig(env) {
  const url = String(env?.SUPABASE_URL || "").trim();
  const key = String(env?.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) return null;
  return { url, key };
}

export async function sbFetchWithEnv(env, table, { method = "GET", params = "", body, single = false } = {}, fetchImpl = fetch) {
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

export async function sbRpcWithEnv(env, fn, args = {}, fetchImpl = fetch) {
  const sb = getSupabaseAdminConfig(env);
  if (!sb) return { data: null, error: "Supabase not configured" };
  const res = await fetchImpl(`${sb.url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: sb.key,
      authorization: `Bearer ${sb.key}`,
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
}

export async function getActiveUserTenantIdsForAccess(env, userId, fetchImpl = fetch) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return [];
  const { data, error } = await sbFetchWithEnv(env, "tenant_memberships", {
    params: `user_id=eq.${normalizedUserId}&is_active=eq.true&select=tenant_id`,
  }, fetchImpl);
  if (error || !Array.isArray(data)) return [];
  return [...new Set(data.map((row) => String(row.tenant_id || "").trim()).filter(Boolean))];
}

export async function userCanAccessTenantBookForAccess(env, book, userId, fetchImpl = fetch) {
  if (!book || !userId) return false;
  if (String(book.published_by_user_id || "") === String(userId)) return true;
  const visibility = String(book.visibility || "");
  const tenantId = String(book.published_by_tenant_id || "").trim();
  if (visibility !== "tenant_only" || !tenantId) return false;
  const tenantIds = await getActiveUserTenantIdsForAccess(env, userId, fetchImpl);
  return tenantIds.includes(tenantId);
}

export async function resolveBookContentAccessForRequest({ env, contentId, user = null, fetchImpl = fetch }) {
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
