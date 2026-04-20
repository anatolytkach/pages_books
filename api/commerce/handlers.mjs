export async function handleCommerceApiRoute(context) {
  const {
    apiCorsHeaders,
    apiPath,
    jsonResponse,
    request,
    requireAuth,
    sbFetch,
    user,
    userCanAccessTenantBook,
  } = context;

  if (apiPath === "/me/entitlements" && request.method === "GET") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const { data, error } = await sbFetch("entitlements", {
      params: `user_id=eq.${user.sub}&is_active=eq.true&select=*,books:book_id(id,title,author,cover_url,content_id)`,
    });
    if (error) return jsonResponse({ error }, 500, apiCorsHeaders);
    return jsonResponse(data || [], 200, apiCorsHeaders);
  }

  const offersMatch = apiPath.match(/^\/books\/([0-9a-f-]+)\/offers$/);
  if (offersMatch && request.method === "GET") {
    const bookId = offersMatch[1];
    const { data, error } = await sbFetch("book_offers", {
      params: `book_id=eq.${bookId}&is_active=eq.true&select=*`,
    });
    if (error) return jsonResponse({ error }, 500, apiCorsHeaders);
    return jsonResponse(data || [], 200, apiCorsHeaders);
  }

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

  const entitlementMatch = apiPath.match(/^\/books\/([0-9a-f-]+)\/entitlement$/);
  if (entitlementMatch && request.method === "GET") {
    const bookId = entitlementMatch[1];
    const { data: book } = await sbFetch("books", {
      params: `id=eq.${bookId}&select=id,is_free,status,visibility,published_by_tenant_id,published_by_user_id`,
      single: true,
    });
    if (!book) return jsonResponse({ error: "Book not found" }, 404, apiCorsHeaders);
    if (book.is_free) {
      return jsonResponse({ access: "full", type: "free" }, 200, apiCorsHeaders);
    }

    if (!user) {
      const { data: offers } = await sbFetch("book_offers", {
        params: `book_id=eq.${bookId}&is_active=eq.true&select=*`,
      });
      return jsonResponse({ access: "none", offers: offers || [] }, 200, apiCorsHeaders);
    }

    if (await userCanAccessTenantBook(book, user.sub)) {
      return jsonResponse({ access: "full", type: "tenant_membership" }, 200, apiCorsHeaders);
    }

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

    const { data: offers } = await sbFetch("book_offers", {
      params: `book_id=eq.${bookId}&is_active=eq.true&select=*`,
    });
    if (!offers || !offers.length) {
      return jsonResponse({ access: "full", type: "free" }, 200, apiCorsHeaders);
    }

    return jsonResponse({ access: "none", offers }, 200, apiCorsHeaders);
  }

  return null;
}
