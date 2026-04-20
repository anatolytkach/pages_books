import { getBookReaderConfig } from "../protected-publishing/shared.mjs";

export async function handleReaderAccessApiRoute(context) {
  const {
    apiCorsHeaders,
    apiPath,
    env,
    jsonResponse,
    request,
    resolveBookContentAccessForRequest,
    sbFetch,
    user,
    userCanAccessTenantBook,
  } = context;

  const byContentAccessMatch = apiPath.match(/^\/books\/by-content\/(\d+)\/access$/);
  if (byContentAccessMatch && request.method === "GET") {
    const contentId = byContentAccessMatch[1];
    const access = await resolveBookContentAccessForRequest({ env, contentId, user });
    if (access.access === "full") {
      const payload = { access: "full", type: access.type };
      if (access.expires_at) payload.expires_at = access.expires_at;
      return jsonResponse(payload, 200, apiCorsHeaders);
    }
    return jsonResponse({ access: "none", book: access.book, offers: access.offers }, 200, apiCorsHeaders);
  }

  const byContentLocationMatch = apiPath.match(/^\/books\/by-content\/(\d+)\/location$/);
  if (byContentLocationMatch && request.method === "GET") {
    const contentId = byContentLocationMatch[1];
    const { data: book } = await sbFetch("books", {
      params: `content_id=eq.${contentId}&select=id,content_id,status,is_free,visibility,manifest,published_by_tenant_id,published_by_user_id,tenant:tenants!books_published_by_tenant_id_fkey(slug)`,
      single: true,
    });
    if (!book) return jsonResponse({ error: "Book not found" }, 404, apiCorsHeaders);

    let hasAccess = false;

    if (book.status !== "published" || book.is_free || book.visibility === "public") {
      hasAccess = true;
    } else if (user && book.published_by_user_id === user.sub) {
      hasAccess = true;
    } else if (user && await userCanAccessTenantBook(book, user.sub)) {
      hasAccess = true;
    } else if (user) {
      const { data: entitlements } = await sbFetch("entitlements", {
        params: `user_id=eq.${user.sub}&book_id=eq.${book.id}&is_active=eq.true&select=entitlement_type,expires_at&order=created_at.desc`,
      });
      if (entitlements && entitlements.length > 0) {
        for (const ent of entitlements) {
          if (ent.entitlement_type === "purchase") {
            hasAccess = true;
            break;
          }
          if (ent.entitlement_type === "rental" && (!ent.expires_at || new Date(ent.expires_at) > new Date())) {
            hasAccess = true;
            break;
          }
        }
      }
    }

    if (!hasAccess) {
      return jsonResponse({ error: "Access denied" }, 403, apiCorsHeaders);
    }

    const readerConfig = getBookReaderConfig(book);
    const payload = {
      id: String(book.content_id || contentId),
      source: String(readerConfig.protected.source || book?.tenant?.slug || ""),
      contentPath: `/books/content/${contentId}/`,
      localContentPath: `/books/content/${contentId}/`,
      readerType: readerConfig.readerType,
    };
    if (readerConfig.readerType === "protected" && readerConfig.protectedContentPath) {
      payload.protectedContentPath = readerConfig.protectedContentPath;
    }
    return jsonResponse(payload, 200, apiCorsHeaders);
  }

  return null;
}
