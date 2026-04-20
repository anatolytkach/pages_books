import {
  canConsumeReaderBook,
  resolveReaderContentAccess,
} from "../entitlements/service.mjs";
import { getBookReaderConfig } from "../protected-publishing/shared.mjs";

function normalizeText(value) {
  return String(value || "").trim();
}

function buildReaderProgressState() {
  return {
    mode: "client_local_drive",
    bookmarks: "client_local_drive",
    annotations: "notes_api",
  };
}

async function getUserDisplayName(sbFetch, user) {
  const { data: profile } = await sbFetch("user_profiles", {
    params: `id=eq.${user.sub}&select=display_name`,
    single: true,
  });
  return profile?.display_name || user.email || "Anonymous";
}

function buildNoteInsert(body, { bookId, userId, displayName }) {
  return {
    book_id: bookId,
    author_user_id: userId,
    author_display_name: displayName,
    anchor_cfi: body.cfi,
    anchor_href: body.href || null,
    quote: body.quote || "",
    note_text: body.comment || body.note_text || "",
    visibility: body.visibility || "private",
  };
}

function buildNoteUpdate(body) {
  const allowed = ["note_text", "quote", "visibility"];
  const updates = {};
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }
  if (body.comment !== undefined && !updates.note_text) updates.note_text = body.comment;
  return updates;
}

async function getBookIdByContentId(sbFetch, contentId) {
  const { data: book } = await sbFetch("books", {
    params: `content_id=eq.${contentId}&select=id`,
    single: true,
  });
  return book?.id || "";
}

export async function getReaderBookLookup({ sbFetch, contentId }) {
  const { data: book } = await sbFetch("books", {
    params: `content_id=eq.${contentId}&select=id,title,author,annotation,cover_url,status,is_free,published_by_user_id`,
    single: true,
  });
  if (!book) {
    return { error: "Book not found", status: 404 };
  }
  return { data: book, status: 200 };
}

export async function getReaderAccessPayload({ env, resolveBookContentAccessForRequest, contentId, user }) {
  const access = await resolveBookContentAccessForRequest({ env, contentId, user });
  if (access.access === "full") {
    const payload = { access: "full", type: access.type };
    if (access.expires_at) payload.expires_at = access.expires_at;
    return {
      data: payload,
      session: {
        contentId: String(contentId || ""),
        access,
        progress: buildReaderProgressState(),
      },
      status: 200,
    };
  }
  return {
    data: { access: "none", book: access.book, offers: access.offers },
    session: {
      contentId: String(contentId || ""),
      access,
      progress: buildReaderProgressState(),
    },
    status: 200,
  };
}

export async function getReaderLocationPayload({ sbFetch, contentId, user, userCanAccessTenantBook }) {
  const { data: book } = await sbFetch("books", {
    params: `content_id=eq.${contentId}&select=id,content_id,status,is_free,visibility,manifest,published_by_tenant_id,published_by_user_id,tenant:tenants!books_published_by_tenant_id_fkey(slug)`,
    single: true,
  });
  if (!book) {
    return { error: "Book not found", status: 404 };
  }

  const hasAccess = await canConsumeReaderBook({
    sbFetch,
    book,
    user,
  });

  if (!hasAccess) {
    return { error: "Access denied", status: 403 };
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

  return {
    data: payload,
    session: {
      contentId: String(book.content_id || contentId),
      bookId: normalizeText(book.id),
      readerType: readerConfig.readerType,
      package: payload,
      progress: buildReaderProgressState(),
    },
    status: 200,
  };
}

export async function listReaderNotesByBook({ sbFetch, bookId, userId }) {
  const { data, error } = await sbFetch("notes", {
    params: `book_id=eq.${bookId}&author_user_id=eq.${userId}&select=*&order=created_at`,
  });
  if (error) return { error, status: 500 };
  return { data: data || [], status: 200 };
}

export async function createReaderNoteForBook({ sbFetch, bookId, user, body }) {
  if (!body || !body.cfi) {
    return { error: "cfi is required", status: 400 };
  }
  const displayName = await getUserDisplayName(sbFetch, user);
  const { data, error } = await sbFetch("notes", {
    method: "POST",
    body: buildNoteInsert(body, {
      bookId,
      userId: user.sub,
      displayName,
    }),
    single: true,
  });
  if (error) return { error, status: 400 };
  return { data, status: 201 };
}

export async function listReaderNotesByContent({ sbFetch, contentId, userId }) {
  const bookId = await getBookIdByContentId(sbFetch, contentId);
  if (!bookId) return { data: [], status: 200 };
  return listReaderNotesByBook({ sbFetch, bookId, userId });
}

export async function createReaderNoteForContent({ sbFetch, contentId, user, body }) {
  const bookId = await getBookIdByContentId(sbFetch, contentId);
  if (!bookId) return { error: "Book not found", status: 404 };
  return createReaderNoteForBook({ sbFetch, bookId, user, body });
}

export async function updateReaderNote({ sbFetch, noteId, userId, body }) {
  const updates = buildNoteUpdate(body || {});
  if (!Object.keys(updates).length) {
    return { error: "No fields to update", status: 400 };
  }
  const { data, error } = await sbFetch("notes", {
    method: "PATCH",
    params: `id=eq.${noteId}&author_user_id=eq.${userId}&select=*`,
    body: updates,
    single: true,
  });
  if (error) return { error, status: 400 };
  if (!data) return { error: "Note not found", status: 404 };
  return { data, status: 200 };
}

export async function deleteReaderNote({ sbFetch, noteId, userId }) {
  await sbFetch("notes", {
    method: "DELETE",
    params: `id=eq.${noteId}&author_user_id=eq.${userId}`,
  });
  return { data: { deleted: true }, status: 200 };
}

export async function listReaderNotes({ sbFetch, userId }) {
  const { data, error } = await sbFetch("notes", {
    params: `author_user_id=eq.${userId}&select=*,books:book_id(id,title,author,content_id,cover_url)&order=created_at.desc`,
  });
  if (error) return { error, status: 500 };
  return { data: data || [], status: 200 };
}

export async function createReaderNotePackage({ sbFetch, userId, body }) {
  if (!body || !Array.isArray(body.note_ids) || !body.note_ids.length) {
    return { error: "note_ids array is required", status: 400 };
  }

  const noteIdList = body.note_ids.map((id) => `"${id}"`).join(",");
  const { data: notes } = await sbFetch("notes", {
    params: `id=in.(${noteIdList})&author_user_id=eq.${userId}&select=id,book_id`,
  });
  if (!notes || notes.length !== body.note_ids.length) {
    return { error: "Some notes not found or not owned by you", status: 400 };
  }

  const bookIds = [...new Set(notes.map((n) => n.book_id))];
  const packageType = bookIds.length === 1 ? "single_book" : "multi_book";
  const bookId = bookIds.length === 1 ? bookIds[0] : null;

  const { data: pkg, error: pkgErr } = await sbFetch("note_packages", {
    method: "POST",
    body: {
      created_by: userId,
      title: body.title || null,
      book_id: bookId,
      package_type: packageType,
      audience_scope: body.audience_scope || "anyone",
    },
    single: true,
  });
  if (pkgErr) return { error: pkgErr, status: 400 };

  for (let i = 0; i < body.note_ids.length; i++) {
    await sbFetch("note_package_items", {
      method: "POST",
      body: { package_id: pkg.id, note_id: body.note_ids[i], display_order: i },
    });
  }

  for (const noteId of body.note_ids) {
    await sbFetch("notes", {
      method: "PATCH",
      params: `id=eq.${noteId}&author_user_id=eq.${userId}`,
      body: { visibility: "package" },
    });
  }

  return {
    data: {
      packageId: pkg.id,
      shareToken: pkg.share_token,
      shareUrl: `/notes/${pkg.share_token}`,
    },
    status: 201,
  };
}

export async function getReaderNotePackage({ sbFetch, token, user }) {
  const { data: pkg } = await sbFetch("note_packages", {
    params: `share_token=eq.${token}&select=*`,
    single: true,
  });
  if (!pkg) return { error: "Package not found", status: 404 };
  if (pkg.share_link_expires_at && new Date(pkg.share_link_expires_at) < new Date()) {
    return { error: "Share link has expired", status: 410 };
  }

  const { data: items } = await sbFetch("note_package_items", {
    params: `package_id=eq.${pkg.id}&select=display_order,notes:note_id(id,anchor_cfi,anchor_href,quote,note_text,author_display_name,author_user_id,created_at)&order=display_order`,
  });

  let book = null;
  if (pkg.book_id) {
    const { data: bookData } = await sbFetch("books", {
      params: `id=eq.${pkg.book_id}&select=id,title,author,cover_url,content_id,annotation`,
      single: true,
    });
    book = bookData;
  }

  const { data: creator } = await sbFetch("user_profiles", {
    params: `id=eq.${pkg.created_by}&select=display_name,avatar_url`,
    single: true,
  });

  if (user && user.sub !== pkg.created_by) {
    await sbFetch("note_package_recipients", {
      method: "POST",
      body: { package_id: pkg.id, recipient_user_id: user.sub },
    }).catch(() => {});
  }

  return {
    data: {
      id: pkg.id,
      title: pkg.title,
      shareToken: pkg.share_token,
      packageType: pkg.package_type,
      createdAt: pkg.created_at,
      creator: creator ? { displayName: creator.display_name, avatarUrl: creator.avatar_url } : null,
      book,
      notes: (items || []).map((item) => item.notes).filter(Boolean),
    },
    status: 200,
  };
}

export async function listReaderNotePackages({ sbFetch, userId }) {
  const { data, error } = await sbFetch("note_packages", {
    params: `created_by=eq.${userId}&select=*&order=created_at.desc`,
  });
  if (error) return { error, status: 500 };
  return { data: data || [], status: 200 };
}

export async function deleteReaderNotePackage({ sbFetch, packageId, userId }) {
  await sbFetch("note_package_items", { method: "DELETE", params: `package_id=eq.${packageId}` });
  await sbFetch("note_package_recipients", { method: "DELETE", params: `package_id=eq.${packageId}` });
  await sbFetch("note_packages", { method: "DELETE", params: `id=eq.${packageId}&created_by=eq.${userId}` });
  return { data: { deleted: true }, status: 200 };
}
