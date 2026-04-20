import {
  createReaderNoteForBook,
  createReaderNoteForContent,
  createReaderNotePackage,
  deleteReaderNote,
  deleteReaderNotePackage,
  getReaderBookLookup,
  getReaderNotePackage,
  listReaderNotePackages,
  listReaderNotes,
  listReaderNotesByBook,
  listReaderNotesByContent,
  updateReaderNote,
} from "./service.mjs";

export async function handleReaderApiRoute(context) {
  const {
    apiCorsHeaders,
    apiPath,
    jsonResponse,
    request,
    requireAuth,
    sbFetch,
    user,
  } = context;

  const byContentMatch = apiPath.match(/^\/books\/by-content\/(\d+)$/);
  if (byContentMatch && request.method === "GET") {
    const result = await getReaderBookLookup({
      sbFetch,
      contentId: byContentMatch[1],
    });
    if (result.error) return jsonResponse({ error: result.error }, result.status || 500, apiCorsHeaders);
    return jsonResponse(result.data, result.status || 200, apiCorsHeaders);
  }

  const bookNotesMatch = apiPath.match(/^\/books\/([0-9a-f-]+)\/notes$/);
  if (bookNotesMatch && request.method === "GET") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const result = await listReaderNotesByBook({
      sbFetch,
      bookId: bookNotesMatch[1],
      userId: user.sub,
    });
    if (result.error) return jsonResponse({ error: result.error }, result.status || 500, apiCorsHeaders);
    return jsonResponse(result.data, result.status || 200, apiCorsHeaders);
  }

  if (bookNotesMatch && request.method === "POST") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const body = await request.json().catch(() => null);
    const result = await createReaderNoteForBook({
      sbFetch,
      bookId: bookNotesMatch[1],
      user,
      body,
    });
    if (result.error) return jsonResponse({ error: result.error }, result.status || 500, apiCorsHeaders);
    return jsonResponse(result.data, result.status || 201, apiCorsHeaders);
  }

  const noteMatch = apiPath.match(/^\/notes\/([0-9a-f-]+)$/);
  if (noteMatch && request.method === "PATCH") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const body = await request.json().catch(() => null);
    if (!body) return jsonResponse({ error: "Invalid JSON" }, 400, apiCorsHeaders);
    const result = await updateReaderNote({
      sbFetch,
      noteId: noteMatch[1],
      userId: user.sub,
      body,
    });
    if (result.error) return jsonResponse({ error: result.error }, result.status || 500, apiCorsHeaders);
    return jsonResponse(result.data, result.status || 200, apiCorsHeaders);
  }

  if (noteMatch && request.method === "DELETE") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const result = await deleteReaderNote({
      sbFetch,
      noteId: noteMatch[1],
      userId: user.sub,
    });
    return jsonResponse(result.data, result.status || 200, apiCorsHeaders);
  }

  if (apiPath === "/me/notes" && request.method === "GET") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const result = await listReaderNotes({
      sbFetch,
      userId: user.sub,
    });
    if (result.error) return jsonResponse({ error: result.error }, result.status || 500, apiCorsHeaders);
    return jsonResponse(result.data, result.status || 200, apiCorsHeaders);
  }

  const contentNotesMatch = apiPath.match(/^\/books\/by-content\/(\d+)\/notes$/);
  if (contentNotesMatch && request.method === "GET") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const result = await listReaderNotesByContent({
      sbFetch,
      contentId: contentNotesMatch[1],
      userId: user.sub,
    });
    if (result.error) return jsonResponse({ error: result.error }, result.status || 500, apiCorsHeaders);
    return jsonResponse(result.data, result.status || 200, apiCorsHeaders);
  }

  if (contentNotesMatch && request.method === "POST") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const body = await request.json().catch(() => null);
    const result = await createReaderNoteForContent({
      sbFetch,
      contentId: contentNotesMatch[1],
      user,
      body,
    });
    if (result.error) return jsonResponse({ error: result.error }, result.status || 500, apiCorsHeaders);
    return jsonResponse(result.data, result.status || 201, apiCorsHeaders);
  }

  if (apiPath === "/note-packages" && request.method === "POST") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const body = await request.json().catch(() => null);
    const result = await createReaderNotePackage({
      sbFetch,
      userId: user.sub,
      body,
    });
    if (result.error) return jsonResponse({ error: result.error }, result.status || 500, apiCorsHeaders);
    return jsonResponse(result.data, result.status || 201, apiCorsHeaders);
  }

  const pkgTokenMatch = apiPath.match(/^\/note-packages\/([a-f0-9]{24})$/);
  if (pkgTokenMatch && request.method === "GET") {
    const result = await getReaderNotePackage({
      sbFetch,
      token: pkgTokenMatch[1],
      user,
    });
    if (result.error) return jsonResponse({ error: result.error }, result.status || 500, apiCorsHeaders);
    return jsonResponse(result.data, result.status || 200, apiCorsHeaders);
  }

  if (apiPath === "/me/note-packages" && request.method === "GET") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const result = await listReaderNotePackages({
      sbFetch,
      userId: user.sub,
    });
    if (result.error) return jsonResponse({ error: result.error }, result.status || 500, apiCorsHeaders);
    return jsonResponse(result.data, result.status || 200, apiCorsHeaders);
  }

  const pkgIdMatch = apiPath.match(/^\/note-packages\/([0-9a-f-]{36})$/i);
  if (pkgIdMatch && request.method === "DELETE") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const result = await deleteReaderNotePackage({
      sbFetch,
      packageId: pkgIdMatch[1],
      userId: user.sub,
    });
    return jsonResponse(result.data, result.status || 200, apiCorsHeaders);
  }

  return null;
}
