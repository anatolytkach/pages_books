import {
  getReaderAccessPayload,
  getReaderLocationPayload,
} from "../reader/service.mjs";

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
    const result = await getReaderAccessPayload({
      env,
      resolveBookContentAccessForRequest,
      contentId: byContentAccessMatch[1],
      user,
    });
    return jsonResponse(result.data, result.status || 200, apiCorsHeaders);
  }

  const byContentLocationMatch = apiPath.match(/^\/books\/by-content\/(\d+)\/location$/);
  if (byContentLocationMatch && request.method === "GET") {
    const result = await getReaderLocationPayload({
      sbFetch,
      contentId: byContentLocationMatch[1],
      user,
      userCanAccessTenantBook,
    });
    if (result.error) return jsonResponse({ error: result.error }, result.status || 500, apiCorsHeaders);
    return jsonResponse(result.data, result.status || 200, apiCorsHeaders);
  }

  return null;
}
