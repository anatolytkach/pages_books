import { createR2PresignedUploadUrl } from "./r2-presign.mjs";
import { createPublishingJob, fetchPublishingJob, updatePublishingJob } from "./storage.mjs";
import { dispatchProtectedPublishJob } from "./github-dispatch.mjs";
import { buildBookManifest } from "./shared.mjs";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeFormat(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeVisibility(value) {
  const normalized = normalizeText(value).toLowerCase();
  return ["public", "tenant_only", "private"].includes(normalized) ? normalized : "public";
}

function inferMimeType(sourceFormat) {
  return sourceFormat === "docx"
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : "application/epub+zip";
}

function inferCoverMimeType(filename) {
  const normalized = normalizeText(filename).toLowerCase();
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".gif")) return "image/gif";
  return "";
}

function sanitizeFilename(filename, sourceFormat) {
  const fallbackExtension = String(sourceFormat || "").startsWith(".")
    ? String(sourceFormat)
    : (sourceFormat === "docx" ? ".docx" : ".epub");
  const raw = normalizeText(filename).split(/[\\/]/).pop() || `upload${fallbackExtension}`;
  const safe = raw.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  const withFallback = safe || `upload${fallbackExtension}`;
  return withFallback.toLowerCase().endsWith(fallbackExtension) ? withFallback : `${withFallback}${fallbackExtension}`;
}

function buildJobMessage(status, sourceFormat = "") {
  const formatLabel = normalizeFormat(sourceFormat) || "source file";
  switch (status) {
    case "awaiting_upload":
      return `Awaiting ${formatLabel.toUpperCase()} upload`;
    case "uploaded":
      return "Upload received";
    case "queued":
      return "Queued for protected conversion";
    case "validating_source":
      return "Validating source document";
    case "not_validated":
      return "Source document did not pass validation";
    case "normalizing":
      return "Normalizing source document";
    case "building_artifact":
      return "Building protected artifact";
    case "uploading_artifacts":
      return "Uploading protected artifact";
    case "reindexing":
      return "Updating catalog indexes";
    case "completed":
      return "Protected book published";
    case "failed":
      return "Protected publishing failed";
    default:
      return "";
  }
}

function buildProtectedPrefix(contentId) {
  return `protected-content/${contentId}`;
}

function buildSourceObjectKey(jobId, filename) {
  return `uploads/protected/${jobId}/${filename}`;
}

function buildCoverObjectKey(jobId, filename) {
  return `uploads/protected/${jobId}/cover/${filename}`;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeJsonObjects(baseValue, nextValue) {
  if (!isPlainObject(baseValue)) return isPlainObject(nextValue) ? { ...nextValue } : nextValue;
  if (!isPlainObject(nextValue)) return nextValue;
  const merged = { ...baseValue };
  for (const [key, value] of Object.entries(nextValue)) {
    const current = merged[key];
    merged[key] = isPlainObject(current) && isPlainObject(value)
      ? mergeJsonObjects(current, value)
      : value;
  }
  return merged;
}

function sanitizeDownloadStem(value, fallback = "normalized-book") {
  const raw = normalizeText(value).replace(/\.[^.]+$/, "");
  const safe = raw.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  return safe || fallback;
}

function buildNormalizedEpubFilename(job) {
  const preferred = sanitizeDownloadStem(job?.submitted_title, "");
  if (preferred) return `${preferred}.epub`;
  const sourceStem = sanitizeDownloadStem(job?.source_filename, "");
  if (sourceStem) return `${sourceStem}.epub`;
  return "normalized-book.epub";
}

function buildNormalizedEpubResponse(job) {
  const normalized = job?.result_payload?.normalized_epub;
  if (normalizeFormat(job?.source_format) !== "docx") return null;
  if (normalizeText(job?.status) !== "completed") return null;
  if (!normalized || !normalized.r2_key) return null;
  return {
    available: true,
    filename: normalizeText(normalized.filename) || buildNormalizedEpubFilename(job),
    download_url: `/books/api/v1/protected-jobs/${job.id}/normalized-epub`,
  };
}

function getCoverUploadMetadata(job) {
  const coverUpload = job?.result_payload?.cover_upload;
  if (!coverUpload || typeof coverUpload !== "object") return null;
  const r2Key = normalizeText(coverUpload.r2_key);
  const filename = normalizeText(coverUpload.filename);
  const contentType = normalizeText(coverUpload.content_type);
  if (!r2Key || !filename) return null;
  return {
    r2_key: r2Key,
    filename,
    content_type: contentType || inferCoverMimeType(filename) || "application/octet-stream",
  };
}

async function canUserAccessPublishingJob(sbFetch, job, userId) {
  const normalizedUserId = normalizeText(userId);
  if (!job || !normalizedUserId) return false;
  if (normalizeText(job.triggered_by_user_id) === normalizedUserId) return true;
  const tenantId = normalizeText(job.tenant_id);
  if (!tenantId) return false;
  const { data: membership } = await sbFetch("tenant_memberships", {
    params: `tenant_id=eq.${tenantId}&user_id=eq.${normalizedUserId}&is_active=eq.true&role=in.(owner,admin,publisher,editor)&select=id`,
    single: true,
  });
  return Boolean(membership?.id);
}

async function updateBookSourceAsset(sbFetch, bookId, payload) {
  const { data: existingAsset } = await sbFetch("source_assets", {
    params: `book_id=eq.${bookId}&select=id&order=created_at.desc&limit=1`,
    single: true,
  });
  if (existingAsset?.id) {
    return sbFetch("source_assets", {
      method: "PATCH",
      params: `id=eq.${existingAsset.id}&select=*`,
      body: payload,
      single: true,
    });
  }
  return sbFetch("source_assets", {
    method: "POST",
    body: payload,
    single: true,
  });
}

export async function createProtectedPublishingJob(context) {
  const {
    env,
    user,
    body,
    sbFetch,
    sbRpc,
    resolvePublishingTenant,
    getTenantSourceSlug,
  } = context;

  const sourceFormat = normalizeFormat(body?.source_format || body?.format || body?.converter_key);
  if (!["epub", "docx"].includes(sourceFormat)) {
    return { error: "source_format must be 'epub' or 'docx'", status: 400 };
  }

  const filename = sanitizeFilename(body?.filename, sourceFormat);
  const rawCoverFilename = normalizeText(body?.cover_filename);
  const sanitizedCoverFilename = rawCoverFilename
    ? sanitizeFilename(rawCoverFilename, `.${rawCoverFilename.split(".").pop() || "jpg"}`)
    : "";
  const coverMimeType = inferCoverMimeType(sanitizedCoverFilename);
  if (sourceFormat === "docx" && !sanitizedCoverFilename) {
    return { error: "cover_filename is required when source_format is 'docx'", status: 400 };
  }
  if (sanitizedCoverFilename && !coverMimeType) {
    return { error: "cover file must be png, jpg, jpeg, webp, or gif", status: 400 };
  }
  const visibility = normalizeVisibility(body?.visibility);
  const tenantContext = await resolvePublishingTenant({
    tenantId: body?.tenant_id,
    tenantSlug: body?.tenant_slug,
  });
  if (tenantContext.error) {
    return { response: tenantContext.error };
  }

  const existingBookId = normalizeText(body?.book_id);
  let book = null;
  let contentId = "";

  if (existingBookId) {
    const { data: existingBook } = await sbFetch("books", {
      params: tenantContext.personal
        ? `id=eq.${existingBookId}&published_by_user_id=eq.${user.sub}&published_by_tenant_id=is.null&select=*`
        : `id=eq.${existingBookId}&published_by_user_id=eq.${user.sub}&published_by_tenant_id=eq.${tenantContext.tenantId}&select=*`,
      single: true,
    });
    if (!existingBook) {
      return { error: "Book not found", status: 404 };
    }
    book = existingBook;
    contentId = normalizeText(existingBook.content_id);
  } else {
    const nextContentId = await sbRpc("nextval_content_id");
    contentId = normalizeText(nextContentId?.data);
    if (!contentId) {
      return { error: "Unable to allocate content ID", status: 500 };
    }
  }

  const source = tenantContext.personal ? "manual" : (await getTenantSourceSlug(tenantContext.tenantId) || "manual");
  const protectedContentPath = `/books/${buildProtectedPrefix(contentId)}`;
  const converterKey = sourceFormat === "docx" ? "docx-to-protected" : "epub-to-protected";
  const commonBookPayload = {
    title: normalizeText(body?.title) || filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "),
    author: normalizeText(body?.author) || "Unknown",
    annotation: normalizeText(body?.annotation || body?.description),
    genre_id: normalizeText(body?.genre_id) || "fiction",
    year_written: body?.year_written || null,
    language: normalizeText(body?.language) || "und",
    visibility,
    status: "draft",
    manifest: buildBookManifest(book?.manifest, {
      readerType: "protected",
      contentId,
      artifactStatus: "pending",
      publishRequested: true,
      visibility,
      source,
      sourceBookId: contentId,
      tenantId: tenantContext.personal ? "" : tenantContext.tenantId,
      tenantSlug: tenantContext.personal ? "" : source,
      protectedContentPath,
      lastError: "",
    }),
  };

  if (!book) {
    const createResult = await sbFetch("books", {
      method: "POST",
      body: {
        ...commonBookPayload,
        content_id: contentId,
        published_by_tenant_id: tenantContext.personal ? null : tenantContext.tenantId,
        published_by_user_id: user.sub,
      },
      single: true,
    });
    if (createResult.error || !createResult.data) {
      return { error: createResult.error || "Unable to create draft book", status: 500 };
    }
    book = createResult.data;
  } else {
    const updateResult = await sbFetch("books", {
      method: "PATCH",
      params: `id=eq.${book.id}&select=*`,
      body: commonBookPayload,
      single: true,
    });
    if (updateResult.error || !updateResult.data) {
      return { error: updateResult.error || "Unable to update draft book", status: 500 };
    }
    book = updateResult.data;
  }

  const jobPayload = {
    job_type: "protected_publish",
    book_id: book.id,
    content_id: contentId,
    reader_type: "protected",
    source_format: sourceFormat,
    converter_key: converterKey,
    source_filename: filename,
    source_mime_type: inferMimeType(sourceFormat),
    source_r2_key: "",
    protected_prefix: buildProtectedPrefix(contentId),
    status: "awaiting_upload",
    validation_status: "pending",
    visibility,
    tenant_id: tenantContext.personal ? null : tenantContext.tenantId,
    tenant_slug: tenantContext.personal ? null : source,
    submitted_title: commonBookPayload.title,
    submitted_author: commonBookPayload.author,
    publication_date: body?.publication_date || null,
    triggered_by_user_id: user.sub,
  };

  const createdJob = await createPublishingJob(sbFetch, jobPayload);
  if (createdJob.error || !createdJob.data) {
    return { error: createdJob.error || "Unable to create publishing job", status: 500 };
  }

  const sourceObjectKey = buildSourceObjectKey(createdJob.data.id, filename);
  const coverObjectKey = sanitizedCoverFilename ? buildCoverObjectKey(createdJob.data.id, sanitizedCoverFilename) : "";
  const updatedJob = await updatePublishingJob(sbFetch, createdJob.data.id, {
    source_r2_key: sourceObjectKey,
    result_payload: {
      source_format: sourceFormat,
      upload_status: "awaiting_upload",
      ...(coverObjectKey ? {
        cover_upload: {
          filename: sanitizedCoverFilename,
          r2_key: coverObjectKey,
          content_type: coverMimeType,
          status: "awaiting_upload",
        },
      } : {}),
    },
  });
  if (updatedJob.error || !updatedJob.data) {
    return { error: updatedJob.error || "Unable to update publishing job", status: 500 };
  }

  await updateBookSourceAsset(sbFetch, book.id, {
    book_id: book.id,
    filename,
    format: sourceFormat,
    r2_key: sourceObjectKey,
    file_size_bytes: null,
    validation_status: "pending",
    validation_errors: null,
    uploaded_by: user.sub,
  });

  async function createUploadTarget(objectKey, contentType, workerPath) {
    try {
      return await createR2PresignedUploadUrl({
        accountId: env.CLOUDFLARE_ACCOUNT_ID,
        bucket: env.R2_BUCKET_NAME || env.READER_BOOKS_BUCKET || "reader-books",
        objectKey,
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      });
    } catch (error) {
      if (!env.READER_BOOKS) {
        throw error;
      }
      return {
        kind: "worker",
        method: "PUT",
        url: workerPath,
        headers: {
          "content-type": contentType,
        },
      };
    }
  }

  let sourceUpload = null;
  let coverUpload = null;
  try {
    sourceUpload = await createUploadTarget(
      sourceObjectKey,
      inferMimeType(sourceFormat),
      `/books/api/v1/protected-jobs/${updatedJob.data.id}/source`,
    );
    if (coverObjectKey) {
      coverUpload = await createUploadTarget(
        coverObjectKey,
        coverMimeType,
        `/books/api/v1/protected-jobs/${updatedJob.data.id}/cover`,
      );
    }
  } catch (error) {
    return { error: error.message || "R2 upload signing is not configured", status: 500 };
  }

  return {
    status: 201,
    data: {
      jobId: updatedJob.data.id,
      bookId: book.id,
      contentId,
      status: updatedJob.data.status,
      sourceFormat,
      sourceObjectKey,
      protectedPrefix: updatedJob.data.protected_prefix,
      upload: sourceUpload,
      uploads: {
        source: {
          objectKey: sourceObjectKey,
          ...(sourceUpload || {}),
        },
        ...(coverObjectKey ? {
          cover: {
            objectKey: coverObjectKey,
            filename: sanitizedCoverFilename,
            contentType: coverMimeType,
            ...(coverUpload || {}),
          },
        } : {}),
      },
    },
  };
}

export async function uploadProtectedPublishingSource(context) {
  const { env, sbFetch, jobId, user, request } = context;
  const jobResult = await fetchPublishingJob(sbFetch, jobId, {
    params: `triggered_by_user_id=eq.${user.sub}`,
  });
  if (jobResult.error) return { error: jobResult.error, status: 500 };
  if (!jobResult.data) return { error: "Job not found", status: 404 };
  if (jobResult.data.status !== "awaiting_upload") {
    return { error: "Source upload is no longer accepted for this job", status: 409 };
  }
  if (!env.READER_BOOKS) {
    return { error: "Storage not configured", status: 500 };
  }

  const contentType = normalizeText(request.headers.get("content-type")) || inferMimeType(jobResult.data.source_format);
  const body = await request.arrayBuffer();
  if (!body || !body.byteLength) {
    return { error: "Source upload is empty", status: 400 };
  }

  await env.READER_BOOKS.put(jobResult.data.source_r2_key, body, {
    httpMetadata: {
      contentType,
    },
  });

  return {
    status: 201,
    data: {
      jobId: jobResult.data.id,
      uploaded: true,
      bytes: body.byteLength,
    },
  };
}

export async function uploadProtectedPublishingCover(context) {
  const { env, sbFetch, jobId, user, request } = context;
  const jobResult = await fetchPublishingJob(sbFetch, jobId, {
    params: `triggered_by_user_id=eq.${user.sub}`,
  });
  if (jobResult.error) return { error: jobResult.error, status: 500 };
  if (!jobResult.data) return { error: "Job not found", status: 404 };
  if (jobResult.data.status !== "awaiting_upload") {
    return { error: "Cover upload is no longer accepted for this job", status: 409 };
  }
  if (!env.READER_BOOKS) {
    return { error: "Storage not configured", status: 500 };
  }

  const coverUpload = getCoverUploadMetadata(jobResult.data);
  if (!coverUpload) {
    return { error: "Cover upload is not configured for this job", status: 409 };
  }

  const contentType = normalizeText(request.headers.get("content-type")) || coverUpload.content_type;
  const body = await request.arrayBuffer();
  if (!body || !body.byteLength) {
    return { error: "Cover upload is empty", status: 400 };
  }

  await env.READER_BOOKS.put(coverUpload.r2_key, body, {
    httpMetadata: {
      contentType,
    },
  });

  await updatePublishingJob(sbFetch, jobId, {
    result_payload: mergeJsonObjects(jobResult.data.result_payload || {}, {
      cover_upload: {
        ...coverUpload,
        status: "uploaded",
        uploaded_bytes: body.byteLength,
      },
    }),
  });

  return {
    status: 201,
    data: {
      jobId: jobResult.data.id,
      uploaded: true,
      bytes: body.byteLength,
    },
  };
}

export async function getProtectedPublishingJob(context) {
  const { sbFetch, jobId, user, internal = false } = context;
  const result = await fetchPublishingJob(sbFetch, jobId);
  if (result.error) return { error: result.error, status: 500 };
  if (!result.data) return { error: "Job not found", status: 404 };
  if (!internal) {
    const allowed = await canUserAccessPublishingJob(sbFetch, result.data, user.sub);
    if (!allowed) return { error: "Job not found", status: 404 };
  }
  const normalizedEpub = buildNormalizedEpubResponse(result.data);
  return {
    status: 200,
    data: {
      ...result.data,
      message: buildJobMessage(result.data.status, result.data.source_format),
      ...(normalizedEpub ? { normalized_epub: normalizedEpub } : {}),
    },
  };
}

export async function markProtectedPublishingJobQueued(context) {
  const { env, sbFetch, jobId, dispatchPayload, ownershipParams = "" } = context;
  const updated = await updatePublishingJob(sbFetch, jobId, { status: "queued" }, { params: ownershipParams });
  if (updated.error) return { error: updated.error, status: 500 };
  if (!updated.data) return { error: "Job not found", status: 404 };
  const dispatch = await dispatchProtectedPublishJob(env, dispatchPayload);
  if (!dispatch.ok) {
    return { data: updated.data, error: dispatch.error, status: 502 };
  }
  return { data: updated.data, status: 200 };
}

export async function completeProtectedPublishingUpload(context) {
  const { env, sbFetch, jobId, user } = context;
  const jobResult = await fetchPublishingJob(sbFetch, jobId, {
    params: `triggered_by_user_id=eq.${user.sub}`,
  });
  if (jobResult.error) return { error: jobResult.error, status: 500 };
  if (!jobResult.data) return { error: "Job not found", status: 404 };
  if (jobResult.data.status !== "awaiting_upload") {
    return { status: 200, data: { ...jobResult.data, message: buildJobMessage(jobResult.data.status, jobResult.data.source_format) } };
  }
  if (!env.READER_BOOKS) {
    return { error: "Storage not configured", status: 500 };
  }
  const object = await env.READER_BOOKS.get(jobResult.data.source_r2_key);
  if (!object) {
    return { error: "Uploaded source object was not found", status: 409 };
  }
  const coverUpload = getCoverUploadMetadata(jobResult.data);
  if (normalizeFormat(jobResult.data.source_format) === "docx") {
    if (!coverUpload?.r2_key) {
      return { error: "Uploaded cover object metadata was not found", status: 409 };
    }
    const coverObject = await env.READER_BOOKS.get(coverUpload.r2_key);
    if (!coverObject) {
      return { error: "Uploaded cover object was not found", status: 409 };
    }
  }

  await updatePublishingJob(sbFetch, jobId, {
    status: "uploaded",
    started_at: new Date().toISOString(),
    result_payload: mergeJsonObjects(jobResult.data.result_payload || {}, coverUpload ? {
      cover_upload: {
        ...coverUpload,
        status: "uploaded",
      },
    } : {}),
  }, { params: `triggered_by_user_id=eq.${user.sub}` });

  await sbFetch("books", {
    method: "PATCH",
    params: `id=eq.${jobResult.data.book_id}&published_by_user_id=eq.${user.sub}&select=*`,
    body: { status: "processing" },
    single: true,
  });

  const dispatchPayload = {
    jobId: jobResult.data.id,
    bookId: jobResult.data.book_id,
    contentId: jobResult.data.content_id,
    sourceFormat: jobResult.data.source_format,
    sourceR2Key: jobResult.data.source_r2_key,
    coverR2Key: coverUpload?.r2_key || "",
    coverFilename: coverUpload?.filename || "",
    coverContentType: coverUpload?.content_type || "",
    protectedPrefix: jobResult.data.protected_prefix,
    readerType: "protected",
  };

  const queued = await markProtectedPublishingJobQueued({
    env,
    sbFetch,
    jobId,
    dispatchPayload,
    ownershipParams: `triggered_by_user_id=eq.${user.sub}`,
  });
  if (queued.error) {
    return { error: queued.error, status: queued.status || 500 };
  }

  return {
    status: 202,
    data: {
      ...queued.data,
      message: buildJobMessage("queued", queued.data.source_format),
    },
  };
}

export async function updateProtectedPublishingProgress(context) {
  const { sbFetch, jobId, payload } = context;
  const jobResult = await fetchPublishingJob(sbFetch, jobId);
  if (jobResult.error) return { error: jobResult.error, status: 500 };
  if (!jobResult.data) return { error: "Job not found", status: 404 };
  const nextStatus = normalizeText(payload?.status);
  const updates = {
    updated_at: new Date().toISOString(),
  };
  if (nextStatus) updates.status = nextStatus;
  if (payload?.validation_status !== undefined) updates.validation_status = payload.validation_status;
  if (payload?.validation_errors !== undefined) updates.validation_errors = payload.validation_errors;
  if (payload?.error_step !== undefined) updates.error_step = payload.error_step;
  if (payload?.error_message !== undefined) updates.error_message = payload.error_message;
  if (payload?.result_payload !== undefined) {
    updates.result_payload = mergeJsonObjects(jobResult.data.result_payload || {}, payload.result_payload);
  }
  if (payload?.started_at !== undefined) updates.started_at = payload.started_at;
  if (payload?.completed_at !== undefined) updates.completed_at = payload.completed_at;
  const updated = await updatePublishingJob(sbFetch, jobId, updates);
  if (updated.error) return { error: updated.error, status: 500 };
  return {
    status: 200,
    data: {
      ...updated.data,
      message: buildJobMessage(updated.data.status, updated.data.source_format),
    },
  };
}

export async function failProtectedPublishingJob(context) {
  const { sbFetch, jobId, payload } = context;
  const jobResult = await fetchPublishingJob(sbFetch, jobId);
  if (jobResult.error) return { error: jobResult.error, status: 500 };
  if (!jobResult.data) return { error: "Job not found", status: 404 };

  const isValidationFailure = normalizeText(payload?.status) === "not_validated";
  const nextStatus = isValidationFailure ? "not_validated" : "failed";
  const validationStatus = isValidationFailure ? "rejected" : (payload?.validation_status || "pending");
  const updated = await updatePublishingJob(sbFetch, jobId, {
    status: nextStatus,
    validation_status: validationStatus,
    validation_errors: payload?.validation_errors ?? jobResult.data.validation_errors,
    error_step: payload?.error_step || jobResult.data.error_step || nextStatus,
    error_message: payload?.error_message || jobResult.data.error_message || "",
    completed_at: new Date().toISOString(),
  });
  if (updated.error) return { error: updated.error, status: 500 };

  await sbFetch("books", {
    method: "PATCH",
    params: `id=eq.${jobResult.data.book_id}&select=*`,
    body: {
      status: "failed",
      manifest: buildBookManifest({}, {
        readerType: "protected",
        contentId: jobResult.data.content_id,
        artifactStatus: "failed",
        publishRequested: false,
        visibility: jobResult.data.visibility,
        protectedContentPath: `/books/${jobResult.data.protected_prefix}`,
        lastError: payload?.error_message || "Protected publishing failed",
      }),
    },
    single: true,
  });

  await updateBookSourceAsset(sbFetch, jobResult.data.book_id, {
    book_id: jobResult.data.book_id,
    filename: jobResult.data.source_filename,
    format: jobResult.data.source_format,
    r2_key: jobResult.data.source_r2_key,
    validation_status: isValidationFailure ? "invalid" : "error",
    validation_errors: payload?.validation_errors || [{ message: payload?.error_message || "Protected publishing failed" }],
    uploaded_by: jobResult.data.triggered_by_user_id,
  });

  return {
    status: 200,
    data: {
      ...updated.data,
      message: buildJobMessage(updated.data.status, updated.data.source_format),
    },
  };
}

export async function finalizeProtectedPublishingJob(context) {
  const { env, sbFetch, jobId, updateCatalogIndexes, payload } = context;
  const jobResult = await fetchPublishingJob(sbFetch, jobId);
  if (jobResult.error) return { error: jobResult.error, status: 500 };
  if (!jobResult.data) return { error: "Job not found", status: 404 };
  if (!env.READER_BOOKS) return { error: "Storage not configured", status: 500 };

  const manifestKey = `${jobResult.data.protected_prefix}/manifest.json`;
  const manifestObject = await env.READER_BOOKS.get(manifestKey);
  if (!manifestObject) {
    return { error: `Protected artifact root is missing: ${manifestKey}`, status: 409 };
  }

  const { data: book } = await sbFetch("books", {
    params: `id=eq.${jobResult.data.book_id}&select=*,tenant:tenants!books_published_by_tenant_id_fkey(slug)`,
    single: true,
  });
  if (!book) return { error: "Book not found", status: 404 };

  const source = normalizeText(jobResult.data.tenant_slug) || normalizeText(book?.tenant?.slug) || "manual";
  const protectedContentPath = `/books/${jobResult.data.protected_prefix}`;
  const bookUpdate = await sbFetch("books", {
    method: "PATCH",
    params: `id=eq.${jobResult.data.book_id}&select=*`,
    body: {
      title: jobResult.data.submitted_title || book.title,
      author: jobResult.data.submitted_author || book.author,
      status: "published",
      visibility: jobResult.data.visibility || book.visibility || "public",
      manifest: buildBookManifest(book.manifest, {
        readerType: "protected",
        contentId: jobResult.data.content_id,
        artifactStatus: "ready",
        publishRequested: false,
        visibility: jobResult.data.visibility || book.visibility || "public",
        source,
        sourceBookId: jobResult.data.content_id,
        tenantId: normalizeText(jobResult.data.tenant_id),
        tenantSlug: source,
        protectedContentPath,
        lastError: "",
        publishedAt: new Date().toISOString(),
      }),
    },
    single: true,
  });
  if (bookUpdate.error || !bookUpdate.data) {
    return { error: bookUpdate.error || "Unable to publish book", status: 500 };
  }

  await updateBookSourceAsset(sbFetch, jobResult.data.book_id, {
    book_id: jobResult.data.book_id,
    filename: jobResult.data.source_filename,
    format: jobResult.data.source_format,
    r2_key: jobResult.data.source_r2_key,
    validation_status: "valid",
    validation_errors: null,
    uploaded_by: jobResult.data.triggered_by_user_id,
  });

  if ((jobResult.data.visibility || "public") === "public") {
    try {
      await updateCatalogIndexes(env, bookUpdate.data, {
        source,
        sourceBookId: jobResult.data.content_id,
      });
    } catch {}
  }

  const updated = await updatePublishingJob(sbFetch, jobId, {
    status: "completed",
    validation_status: "passed",
    error_step: null,
    error_message: null,
    completed_at: new Date().toISOString(),
    result_payload: mergeJsonObjects(jobResult.data.result_payload || {}, {
      content_id: jobResult.data.content_id,
      protected_content_path: protectedContentPath,
      reader_type: "protected",
      book_id: jobResult.data.book_id,
      ...(payload?.result_payload || {}),
    }),
  });
  if (updated.error) return { error: updated.error, status: 500 };
  return {
    status: 200,
    data: {
      ...updated.data,
      message: buildJobMessage("completed", updated.data.source_format),
    },
  };
}

export async function downloadProtectedPublishingNormalizedEpub(context) {
  const { env, sbFetch, jobId, user } = context;
  if (!env.READER_BOOKS) return { error: "Storage not configured", status: 500 };

  const jobResult = await fetchPublishingJob(sbFetch, jobId);
  if (jobResult.error) return { error: jobResult.error, status: 500 };
  if (!jobResult.data) return { error: "Job not found", status: 404 };

  const allowed = await canUserAccessPublishingJob(sbFetch, jobResult.data, user.sub);
  if (!allowed) return { error: "Job not found", status: 404 };

  const normalized = buildNormalizedEpubResponse(jobResult.data);
  if (!normalized) {
    return { error: "Normalized EPUB is not available for this job", status: 404 };
  }

  const r2Key = normalizeText(jobResult.data?.result_payload?.normalized_epub?.r2_key);
  if (!r2Key) {
    return { error: "Normalized EPUB is not available for this job", status: 404 };
  }

  const object = await env.READER_BOOKS.get(r2Key);
  if (!object) return { error: "Normalized EPUB file is missing", status: 404 };

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", "application/epub+zip");
  headers.set("content-disposition", `attachment; filename="${normalized.filename}"`);
  headers.set("cache-control", "no-store");
  headers.set("etag", object.httpEtag);

  return {
    status: 200,
    body: object.body,
    headers,
  };
}
