export async function handleCatalogApiRoute(context) {
  const {
    apiCorsHeaders,
    apiPath,
    jsonResponse,
    request,
    requireAuth,
    sbFetch,
    user,
    getActiveUserTenantIds,
  } = context;

  if (apiPath === "/genres" && request.method === "GET") {
    const { data, error } = await sbFetch("genres", {
      params: "select=*&order=display_order",
    });
    if (error) return jsonResponse({ error }, 500, apiCorsHeaders);
    return jsonResponse(data || [], 200, apiCorsHeaders);
  }

  if (apiPath === "/me/catalog-books" && request.method === "GET") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const tenantIds = await getActiveUserTenantIds(user.sub);
    if (!tenantIds.length) return jsonResponse([], 200, apiCorsHeaders);

    const encodedTenantIds = tenantIds.map((id) => `"${id}"`).join(",");
    const { data, error } = await sbFetch("books", {
      params: `status=eq.published&visibility=eq.tenant_only&published_by_tenant_id=in.(${encodedTenantIds})&select=id,title,author,cover_url,content_id,published_by_tenant_id,tenant:tenants!books_published_by_tenant_id_fkey(slug,name)&order=updated_at.desc`,
    });
    if (error) return jsonResponse({ error }, 500, apiCorsHeaders);

    const items = (Array.isArray(data) ? data : [])
      .filter((book) => String(book.content_id || "").trim())
      .map((book) => ({
        id: String(book.content_id),
        source: String(book?.tenant?.slug || "").trim(),
        title: String(book.title || ""),
        author: String(book.author || ""),
        cover: String(book.cover_url || ""),
        visibility: "tenant_only",
        tenant_name: String(book?.tenant?.name || ""),
      }));
    return jsonResponse(items, 200, apiCorsHeaders);
  }

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

  return null;
}
