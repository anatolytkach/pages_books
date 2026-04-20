import {
  attachCatalogSnapshot,
  buildCatalogBookInsert,
  buildCatalogMetadataPatch,
  getCatalogBook,
} from "../catalog/book-record.mjs";
import {
  completeProtectedPublishingUpload,
  createProtectedPublishingJob,
  downloadProtectedPublishingNormalizedEpub,
  failProtectedPublishingJob,
  finalizeProtectedPublishingJob,
  getProtectedPublishingJob,
  uploadProtectedPublishingCover,
  uploadProtectedPublishingSource,
  updateProtectedPublishingProgress,
} from "../protected-publishing/handlers.mjs";
import {
  buildBookManifest,
  getBookReaderConfig,
  getRequestedReaderType,
} from "../protected-publishing/shared.mjs";
import { can, PERMISSIONS } from "../permissions/policy.mjs";
import {
  attachPublishingSnapshot,
  buildPublishingBookInsert,
  buildPublishingStatePatch,
} from "./pipeline-record.mjs";

async function checkOwnedTitleAccess({ book, userId, tenantContext = null }) {
  if (!book || !userId) return false;
  if (String(book.published_by_user_id || "") !== String(userId)) return false;
  if (!tenantContext) return true;
  if (tenantContext.personal) return !String(book.published_by_tenant_id || "").trim();
  return String(book.published_by_tenant_id || "") === String(tenantContext.tenantId || "");
}

export async function handlePublishingApiRoute(context, deps) {
  const {
    apiCorsHeaders,
    apiPath,
    env,
    jsonResponse,
    request,
    requireAuth,
    requireInternalTaskAuth,
    resolvePublishingTenant,
    sbFetch,
    sbRpc,
    user,
    getTenantSourceSlug,
  } = context;
  const { processEpub, updateCatalogIndexes } = deps;

  if (apiPath === "/protected-jobs" && request.method === "POST") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const body = await request.json().catch(() => null);
    if (!body) return jsonResponse({ error: "Invalid JSON" }, 400, apiCorsHeaders);
    const created = await createProtectedPublishingJob({
      env,
      user,
      body,
      sbFetch,
      sbRpc,
      resolvePublishingTenant,
      getTenantSourceSlug,
    });
    if (created.response) return created.response;
    if (created.error) return jsonResponse({ error: created.error }, created.status || 500, apiCorsHeaders);
    return jsonResponse(created.data, created.status || 201, apiCorsHeaders);
  }

  const protectedJobMatch = apiPath.match(/^\/protected-jobs\/([0-9a-f-]+)$/);
  if (protectedJobMatch && request.method === "GET") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const result = await getProtectedPublishingJob({
      sbFetch,
      jobId: protectedJobMatch[1],
      user,
    });
    if (result.error) return jsonResponse({ error: result.error }, result.status || 500, apiCorsHeaders);
    return jsonResponse(result.data, result.status || 200, apiCorsHeaders);
  }

  const protectedNormalizedEpubMatch = apiPath.match(/^\/protected-jobs\/([0-9a-f-]+)\/normalized-epub$/);
  if (protectedNormalizedEpubMatch && request.method === "GET") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const result = await downloadProtectedPublishingNormalizedEpub({
      env,
      sbFetch,
      jobId: protectedNormalizedEpubMatch[1],
      user,
    });
    if (result.error) return jsonResponse({ error: result.error }, result.status || 500, apiCorsHeaders);
    result.headers.set("x-reader-worker", "1");
    return new Response(result.body, {
      status: result.status || 200,
      headers: result.headers,
    });
  }

  const protectedSourceUploadMatch = apiPath.match(/^\/protected-jobs\/([0-9a-f-]+)\/source$/);
  if (protectedSourceUploadMatch && request.method === "PUT") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const result = await uploadProtectedPublishingSource({
      env,
      sbFetch,
      jobId: protectedSourceUploadMatch[1],
      user,
      request,
    });
    if (result.error) return jsonResponse({ error: result.error }, result.status || 500, apiCorsHeaders);
    return jsonResponse(result.data, result.status || 201, apiCorsHeaders);
  }

  const protectedCoverUploadMatch = apiPath.match(/^\/protected-jobs\/([0-9a-f-]+)\/cover$/);
  if (protectedCoverUploadMatch && request.method === "PUT") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const result = await uploadProtectedPublishingCover({
      env,
      sbFetch,
      jobId: protectedCoverUploadMatch[1],
      user,
      request,
    });
    if (result.error) return jsonResponse({ error: result.error }, result.status || 500, apiCorsHeaders);
    return jsonResponse(result.data, result.status || 201, apiCorsHeaders);
  }

  const protectedUploadCompleteMatch = apiPath.match(/^\/protected-jobs\/([0-9a-f-]+)\/upload-complete$/);
  if (protectedUploadCompleteMatch && request.method === "POST") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const result = await completeProtectedPublishingUpload({
      env,
      sbFetch,
      jobId: protectedUploadCompleteMatch[1],
      user,
    });
    if (result.error) return jsonResponse({ error: result.error }, result.status || 500, apiCorsHeaders);
    return jsonResponse(result.data, result.status || 202, apiCorsHeaders);
  }

  const protectedProgressMatch = apiPath.match(/^\/protected-jobs\/([0-9a-f-]+)\/progress$/);
  if (protectedProgressMatch && request.method === "POST") {
    const authErr = requireInternalTaskAuth();
    if (authErr) return authErr;
    const body = await request.json().catch(() => ({}));
    const result = await updateProtectedPublishingProgress({
      sbFetch,
      jobId: protectedProgressMatch[1],
      payload: body,
    });
    if (result.error) return jsonResponse({ error: result.error }, result.status || 500, apiCorsHeaders);
    return jsonResponse(result.data, result.status || 200, apiCorsHeaders);
  }

  const protectedFinalizeMatch = apiPath.match(/^\/protected-jobs\/([0-9a-f-]+)\/finalize$/);
  if (protectedFinalizeMatch && request.method === "POST") {
    const authErr = requireInternalTaskAuth();
    if (authErr) return authErr;
    const body = await request.json().catch(() => ({}));
    const result = await finalizeProtectedPublishingJob({
      env,
      sbFetch,
      jobId: protectedFinalizeMatch[1],
      updateCatalogIndexes,
      payload: body,
    });
    if (result.error) return jsonResponse({ error: result.error }, result.status || 500, apiCorsHeaders);
    return jsonResponse(result.data, result.status || 200, apiCorsHeaders);
  }

  const protectedFailMatch = apiPath.match(/^\/protected-jobs\/([0-9a-f-]+)\/fail$/);
  if (protectedFailMatch && request.method === "POST") {
    const authErr = requireInternalTaskAuth();
    if (authErr) return authErr;
    const body = await request.json().catch(() => ({}));
    const result = await failProtectedPublishingJob({
      sbFetch,
      jobId: protectedFailMatch[1],
      payload: body,
    });
    if (result.error) return jsonResponse({ error: result.error }, result.status || 500, apiCorsHeaders);
    return jsonResponse(result.data, result.status || 200, apiCorsHeaders);
  }

  if (apiPath === "/publish/books" && request.method === "GET") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const { data, error } = await sbFetch("books", {
      params: `published_by_user_id=eq.${user.sub}&select=*,tenant:tenants!books_published_by_tenant_id_fkey(id,slug,name,tenant_type)&order=created_at.desc`,
    });
    if (error) return jsonResponse({ error }, 500, apiCorsHeaders);
    return jsonResponse((data || []).map((item) => attachPublishingSnapshot(attachCatalogSnapshot(item))), 200, apiCorsHeaders);
  }

  const publishBookMatch = apiPath.match(/^\/publish\/books\/([0-9a-f-]+)$/);
  if (publishBookMatch && request.method === "GET") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const bookId = publishBookMatch[1];
    const { data: book } = await sbFetch("books", {
      params: `id=eq.${bookId}&select=*,tenant:tenants!books_published_by_tenant_id_fkey(id,slug,name,tenant_type)`,
      single: true,
    });
    if (!book) return jsonResponse({ error: "Book not found" }, 404, apiCorsHeaders);
    const decision = await can({ userId: user.sub }, PERMISSIONS.titleView, {
      book,
      checkTitleAccess: checkOwnedTitleAccess,
    });
    if (!decision.allowed) return jsonResponse({ error: "Book not found" }, 404, apiCorsHeaders);
    const { data: assets } = await sbFetch("source_assets", {
      params: `book_id=eq.${bookId}&select=*&order=created_at.desc&limit=1`,
    });
    if (assets && assets.length) book.source_asset = assets[0];
    return jsonResponse(attachPublishingSnapshot(attachCatalogSnapshot(book), { sourceAsset: book.source_asset }), 200, apiCorsHeaders);
  }

  const metaMatch = apiPath.match(/^\/publish\/books\/([0-9a-f-]+)\/metadata$/);
  if (metaMatch && request.method === "PATCH") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const bookId = metaMatch[1];
    const body = await request.json().catch(() => null);
    if (!body) return jsonResponse({ error: "Invalid JSON" }, 400, apiCorsHeaders);

    const updates = buildCatalogMetadataPatch(body);
    if (body.reader_type !== undefined || body.readerType !== undefined || body.protected !== undefined) {
      const { data: existingBook } = await sbFetch("books", {
        params: `id=eq.${bookId}&select=id,content_id,manifest,published_by_user_id,published_by_tenant_id`,
        single: true,
      });
      if (!existingBook) return jsonResponse({ error: "Book not found" }, 404, apiCorsHeaders);
      const decision = await can({ userId: user.sub }, PERMISSIONS.titleEditMetadata, {
        book: existingBook,
        checkTitleAccess: checkOwnedTitleAccess,
      });
      if (!decision.allowed) return jsonResponse({ error: "Book not found" }, 404, apiCorsHeaders);
      Object.assign(updates, buildPublishingStatePatch({
        manifest: buildBookManifest(existingBook.manifest, {
          readerType: getRequestedReaderType(body, existingBook),
          contentId: String(existingBook.content_id || "").trim(),
        }),
      }));
    }
    if (!Object.keys(updates).length) {
      return jsonResponse({ error: "No fields to update" }, 400, apiCorsHeaders);
    }

    const { data, error } = await sbFetch("books", {
      method: "PATCH",
      params: `id=eq.${bookId}&select=*`,
      body: updates,
      single: true,
    });
    if (error) return jsonResponse({ error }, 400, apiCorsHeaders);
    return jsonResponse(data, 200, apiCorsHeaders);
  }

  if (publishBookMatch && request.method === "DELETE") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const bookId = publishBookMatch[1];
    const { data: book } = await sbFetch("books", {
      params: `id=eq.${bookId}&select=id,status,published_by_user_id,published_by_tenant_id`,
      single: true,
    });
    if (!book) return jsonResponse({ error: "Book not found" }, 404, apiCorsHeaders);
    const decision = await can({ userId: user.sub }, PERMISSIONS.titleEditMetadata, {
      book,
      checkTitleAccess: checkOwnedTitleAccess,
    });
    if (!decision.allowed) return jsonResponse({ error: "Book not found" }, 404, apiCorsHeaders);
    if (book.status === "published") {
      return jsonResponse({ error: "Cannot delete a published book. Unpublish it first." }, 400, apiCorsHeaders);
    }

    await sbFetch("source_assets", {
      method: "DELETE",
      params: `book_id=eq.${bookId}`,
    });
    await sbFetch("books", {
      method: "DELETE",
      params: `id=eq.${bookId}`,
    });
    return jsonResponse({ deleted: true }, 200, apiCorsHeaders);
  }

  const pubMatch = apiPath.match(/^\/publish\/books\/([0-9a-f-]+)\/publish$/);
  if (pubMatch && request.method === "POST") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const bookId = pubMatch[1];
    const body = await request.json().catch(() => ({}));
    const visibility = body.visibility || "public";
    if (!["public", "tenant_only"].includes(visibility)) {
      return jsonResponse({ error: "visibility must be 'public' or 'tenant_only'" }, 400, apiCorsHeaders);
    }

    const tenantContext = await resolvePublishingTenant({
      tenantId: body.tenant_id,
      tenantSlug: body.tenant_slug,
    });
    if (tenantContext.error) return tenantContext.error;

    const { data: book } = await sbFetch("books", {
      params: `id=eq.${bookId}&select=*`,
      single: true,
    });
    if (!book) return jsonResponse({ error: "Book not found" }, 404, apiCorsHeaders);
    const publishDecision = await can({ userId: user.sub }, PERMISSIONS.titlePublish, {
      book,
      tenantContext,
      checkTitlePublishAccess: checkOwnedTitleAccess,
    });
    if (!publishDecision.allowed) return jsonResponse({ error: "Book not found" }, 404, apiCorsHeaders);
    if (book.status !== "ready") {
      return jsonResponse({ error: `Book status is '${book.status}', must be 'ready' to publish` }, 400, apiCorsHeaders);
    }
    if (!book.title || !book.author || !book.genre_id || !book.annotation) {
      return jsonResponse({ error: "Complete all required metadata before publishing" }, 400, apiCorsHeaders);
    }

    const source = tenantContext.personal ? "manual" : (await getTenantSourceSlug(tenantContext.tenantId) || "manual");
    const requestedReaderType = getRequestedReaderType(body, book);
    const readerConfig = getBookReaderConfig(book);
    const nextManifest = buildBookManifest(book.manifest, {
      readerType: requestedReaderType,
      contentId: String(book.content_id || ""),
      visibility,
      source,
      sourceBookId: String(book.content_id || ""),
      tenantId: tenantContext.personal ? "" : tenantContext.tenantId,
      tenantSlug: tenantContext.personal ? "" : source,
      publishRequested: requestedReaderType === "protected",
      artifactStatus: requestedReaderType === "protected"
        ? (readerConfig.protected.artifactStatus || "pending")
        : "",
      protectedContentPath: requestedReaderType === "protected"
        ? (readerConfig.protectedContentPath || `/books/protected-content/${book.content_id}`)
        : "",
      lastError: requestedReaderType === "protected" ? readerConfig.protected.lastError : "",
    });

        if (requestedReaderType === "protected" && readerConfig.protected.artifactStatus !== "ready") {
      const { data, error } = await sbFetch("books", {
        method: "PATCH",
        params: `id=eq.${bookId}&select=*`,
        body: {
          ...buildCatalogMetadataPatch({ visibility }),
          ...buildPublishingStatePatch({
            status: "processing",
            manifest: nextManifest,
          }),
        },
        single: true,
      });
      if (error) return jsonResponse({ error }, 500, apiCorsHeaders);
      return jsonResponse({
        ...data,
        pendingProtectedConversion: true,
        message: "Protected conversion queued. Publication will finish after artifact generation.",
      }, 202, apiCorsHeaders);
    }

    const { data, error } = await sbFetch("books", {
      method: "PATCH",
      params: `id=eq.${bookId}&select=*`,
      body: {
        ...buildCatalogMetadataPatch({ visibility }),
        ...buildPublishingStatePatch({
          status: "published",
          manifest: buildBookManifest(nextManifest, {
            readerType: requestedReaderType,
            contentId: String(book.content_id || ""),
            visibility,
            source,
            sourceBookId: String(book.content_id || ""),
            tenantId: tenantContext.personal ? "" : tenantContext.tenantId,
            tenantSlug: tenantContext.personal ? "" : source,
            publishRequested: false,
            artifactStatus: requestedReaderType === "protected" ? "ready" : "",
            protectedContentPath: requestedReaderType === "protected"
              ? (readerConfig.protectedContentPath || `/books/protected-content/${book.content_id}`)
              : "",
            publishedAt: new Date().toISOString(),
          }),
        }),
      },
      single: true,
    });
    if (error) return jsonResponse({ error }, 500, apiCorsHeaders);

    if (visibility === "public") {
      try {
        await updateCatalogIndexes(env, data, {
          source,
          sourceBookId: String(data.content_id || ""),
        });
      } catch (indexErr) {}
    }

    return jsonResponse(data, 200, apiCorsHeaders);
  }

  const finalizeProtectedMatch = apiPath.match(/^\/publish\/books\/([0-9a-f-]+)\/finalize-protected$/);
  if (finalizeProtectedMatch && request.method === "POST") {
    const authErr = requireInternalTaskAuth();
    if (authErr) return authErr;
    const bookId = finalizeProtectedMatch[1];
    const { data: book } = await sbFetch("books", {
      params: `id=eq.${bookId}&select=*,tenant:tenants!books_published_by_tenant_id_fkey(slug)`,
      single: true,
    });
    if (!book) return jsonResponse({ error: "Book not found" }, 404, apiCorsHeaders);
    const readerConfig = getBookReaderConfig(book);
    if (readerConfig.readerType !== "protected") {
      return jsonResponse({ error: "Book is not configured for protected publication" }, 400, apiCorsHeaders);
    }
    if (readerConfig.protected.artifactStatus !== "ready") {
      return jsonResponse({ error: "Protected artifact is not ready" }, 409, apiCorsHeaders);
    }

    const visibility = readerConfig.protected.visibility || book.visibility || "public";
    const source = readerConfig.protected.source || String(book?.tenant?.slug || "").trim() || "manual";
    const sourceBookId = readerConfig.protected.sourceBookId || String(book.content_id || "");
    const catalogBook = getCatalogBook(book);
    const { data, error } = await sbFetch("books", {
      method: "PATCH",
      params: `id=eq.${bookId}&select=*`,
      body: {
        ...buildCatalogMetadataPatch({ visibility: catalogBook.visibility || visibility }),
        ...buildPublishingStatePatch({
          status: "published",
          manifest: buildBookManifest(book.manifest, {
            readerType: "protected",
            contentId: String(book.content_id || ""),
            visibility,
            source,
            sourceBookId,
            tenantId: String(book.published_by_tenant_id || ""),
            tenantSlug: String(book?.tenant?.slug || ""),
            publishRequested: false,
            artifactStatus: "ready",
            protectedContentPath: readerConfig.protectedContentPath || `/books/protected-content/${book.content_id}`,
            publishedAt: new Date().toISOString(),
            lastError: "",
          }),
        }),
      },
      single: true,
    });
    if (error) return jsonResponse({ error }, 500, apiCorsHeaders);

    if (visibility === "public") {
      try {
        await updateCatalogIndexes(env, data, {
          source,
          sourceBookId,
        });
      } catch {}
    }
    return jsonResponse(data, 200, apiCorsHeaders);
  }

  if (apiPath === "/publish/upload" && request.method === "POST") {
    const authErr = requireAuth();
    if (authErr) return authErr;

    if (!env.READER_BOOKS) {
      return jsonResponse({ error: "Storage not configured" }, 500, apiCorsHeaders);
    }

    try {
      const formData = await request.formData();
      const tenantContext = await resolvePublishingTenant({
        tenantId: formData.get("tenant_id"),
        tenantSlug: formData.get("tenant_slug"),
      });
      if (tenantContext.error) return tenantContext.error;
      const requestedReaderType = getRequestedReaderType({
        reader_type: formData.get("reader_type"),
        protected: formData.get("protected"),
      });
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

      const fileBytes = await file.arrayBuffer();
      await env.READER_BOOKS.put(r2Key, fileBytes, {
        httpMetadata: { contentType: file.type || "application/epub+zip" },
      });

      const { data: contentId } = await sbRpc("nextval_content_id");
      const source = tenantContext.personal ? "manual" : (await getTenantSourceSlug(tenantContext.tenantId) || "manual");
      const initialManifest = buildBookManifest({}, {
        readerType: requestedReaderType,
        contentId: String(contentId),
        artifactStatus: requestedReaderType === "protected" ? "pending" : "",
        publishRequested: false,
        visibility: "public",
        source,
        sourceBookId: String(contentId),
        tenantId: tenantContext.personal ? "" : tenantContext.tenantId,
        tenantSlug: tenantContext.personal ? "" : source,
        protectedContentPath: requestedReaderType === "protected" ? `/books/protected-content/${contentId}` : "",
      });

      const catalogInsert = buildCatalogBookInsert({
        metadata: {
          title: filename.replace(/\.epub$/i, "").replace(/[_-]/g, " "),
          author: "Unknown",
          genre_id: "fiction",
          annotation: "",
        },
        contentId: String(contentId),
        publishedByTenantId: tenantContext.personal ? null : tenantContext.tenantId,
        publishedByUserId: user.sub,
      });
      const publishingInsert = buildPublishingBookInsert({
        status: "processing",
        manifest: initialManifest,
      });

      const { data: book, error: bookErr } = await sbFetch("books", {
        method: "POST",
        body: {
          ...catalogInsert,
          ...publishingInsert,
        },
        single: true,
      });
      if (bookErr) return jsonResponse({ error: bookErr }, 500, apiCorsHeaders);

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

      try {
        const epubResult = await processEpub(env, fileBytes, book.id, String(contentId));

        const metaUpdates = {
          ...buildPublishingStatePatch({
            status: "ready",
            manifest: buildBookManifest(initialManifest, {
              readerType: requestedReaderType,
              contentId: String(contentId),
              artifactStatus: requestedReaderType === "protected" ? "pending" : "",
              publishRequested: false,
              visibility: "public",
              source,
              sourceBookId: String(contentId),
              tenantId: tenantContext.personal ? "" : tenantContext.tenantId,
              tenantSlug: tenantContext.personal ? "" : source,
              protectedContentPath: requestedReaderType === "protected" ? `/books/protected-content/${contentId}` : "",
            }),
          }),
        };
        Object.assign(metaUpdates, buildCatalogMetadataPatch({
          ...(epubResult.title ? { title: epubResult.title } : {}),
          ...(epubResult.author ? { author: epubResult.author } : {}),
          ...(epubResult.language ? { language: epubResult.language } : {}),
          ...(epubResult.coverUrl ? { cover_url: epubResult.coverUrl } : {}),
        }));

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
          body: buildPublishingStatePatch({ status: "failed" }),
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

  return null;
}
