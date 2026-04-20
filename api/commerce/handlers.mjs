import {
  createCommerceOffer,
  getCommerceEntitlementView,
  listCommerceBookOffers,
  listCommerceEntitlements,
  updateCommerceOffer,
} from "./service.mjs";

export async function handleCommerceApiRoute(context) {
  const {
    apiCorsHeaders,
    apiPath,
    jsonResponse,
    request,
    requireAuth,
    sbFetch,
    user,
  } = context;

  if (apiPath === "/me/entitlements" && request.method === "GET") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const result = await listCommerceEntitlements({
      sbFetch,
      userId: user.sub,
    });
    if (result.error) return jsonResponse({ error: result.error }, result.status || 500, apiCorsHeaders);
    return jsonResponse(result.data, result.status || 200, apiCorsHeaders);
  }

  const offersMatch = apiPath.match(/^\/books\/([0-9a-f-]+)\/offers$/);
  if (offersMatch && request.method === "GET") {
    const result = await listCommerceBookOffers({
      sbFetch,
      bookId: offersMatch[1],
    });
    if (result.error) return jsonResponse({ error: result.error }, result.status || 500, apiCorsHeaders);
    return jsonResponse(result.data, result.status || 200, apiCorsHeaders);
  }

  if (offersMatch && request.method === "POST") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const body = await request.json().catch(() => null);
    const result = await createCommerceOffer({
      sbFetch,
      bookId: offersMatch[1],
      userId: user.sub,
      body,
    });
    if (result.error) return jsonResponse({ error: result.error }, result.status || 500, apiCorsHeaders);
    return jsonResponse(result.data, result.status || 201, apiCorsHeaders);
  }

  const offerPatchMatch = apiPath.match(/^\/offers\/([0-9a-f-]+)$/);
  if (offerPatchMatch && request.method === "PATCH") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const body = await request.json().catch(() => null);
    if (!body) return jsonResponse({ error: "Invalid JSON" }, 400, apiCorsHeaders);
    const result = await updateCommerceOffer({
      sbFetch,
      offerId: offerPatchMatch[1],
      userId: user.sub,
      body,
    });
    if (result.error) return jsonResponse({ error: result.error }, result.status || 500, apiCorsHeaders);
    return jsonResponse(result.data, result.status || 200, apiCorsHeaders);
  }

  const entitlementMatch = apiPath.match(/^\/books\/([0-9a-f-]+)\/entitlement$/);
  if (entitlementMatch && request.method === "GET") {
    const result = await getCommerceEntitlementView({
      sbFetch,
      bookId: entitlementMatch[1],
      user,
    });
    if (result.error) return jsonResponse({ error: result.error }, result.status || 500, apiCorsHeaders);
    return jsonResponse(result.data, result.status || 200, apiCorsHeaders);
  }

  return null;
}
