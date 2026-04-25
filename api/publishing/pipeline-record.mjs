import { getBookReaderConfig } from "../protected-publishing/shared.mjs";

function normalizeText(value) {
  return String(value || "").trim();
}

export function getPublishingPipeline(record, { sourceAsset = null, job = null } = {}) {
  const book = record && typeof record === "object" ? record : {};
  const readerConfig = getBookReaderConfig(book);
  const asset = sourceAsset && typeof sourceAsset === "object" ? sourceAsset : null;
  const publishingJob = job && typeof job === "object" ? job : null;
  return {
    bookId: normalizeText(book.id),
    contentId: normalizeText(book.content_id),
    state: normalizeText(book.status).toLowerCase(),
    sourceAsset: asset ? {
      id: normalizeText(asset.id),
      filename: normalizeText(asset.filename),
      format: normalizeText(asset.format),
      r2Key: normalizeText(asset.r2_key),
      validationStatus: normalizeText(asset.validation_status),
      validationErrors: asset.validation_errors ?? null,
      fileSizeBytes: asset.file_size_bytes ?? null,
      uploadedBy: normalizeText(asset.uploaded_by),
    } : null,
    reader: {
      type: readerConfig.readerType,
      protectedContentPath: normalizeText(readerConfig.protectedContentPath),
      protected: {
        enabled: !!readerConfig.protected.enabled,
        artifactStatus: normalizeText(readerConfig.protected.artifactStatus),
        publishRequested: !!readerConfig.protected.publishRequested,
        source: normalizeText(readerConfig.protected.source),
        sourceBookId: normalizeText(readerConfig.protected.sourceBookId),
        tenantId: normalizeText(readerConfig.protected.tenantId),
        tenantSlug: normalizeText(readerConfig.protected.tenantSlug),
        lastError: normalizeText(readerConfig.protected.lastError),
      },
    },
    job: publishingJob ? {
      id: normalizeText(publishingJob.id),
      type: normalizeText(publishingJob.job_type),
      status: normalizeText(publishingJob.status),
      validationStatus: normalizeText(publishingJob.validation_status),
      sourceFormat: normalizeText(publishingJob.source_format),
      sourceFilename: normalizeText(publishingJob.source_filename),
      protectedPrefix: normalizeText(publishingJob.protected_prefix),
    } : null,
  };
}

export function buildPublishingStatePatch({
  status,
  manifest,
} = {}) {
  const patch = {};
  if (status !== undefined) patch.status = status;
  if (manifest !== undefined) patch.manifest = manifest;
  return patch;
}

export function buildPublishingBookInsert({
  status,
  manifest,
} = {}) {
  return buildPublishingStatePatch({ status, manifest });
}

export function buildSourceAssetStatePatch({
  bookId,
  filename,
  format,
  r2Key,
  fileSizeBytes,
  validationStatus,
  validationErrors,
  uploadedBy,
} = {}) {
  return {
    book_id: bookId,
    filename,
    format,
    r2_key: r2Key,
    file_size_bytes: fileSizeBytes ?? null,
    validation_status: validationStatus,
    validation_errors: validationErrors ?? null,
    uploaded_by: uploadedBy,
  };
}

export function attachPublishingSnapshot(record, options = {}) {
  return {
    ...(record || {}),
    publishing: getPublishingPipeline(record, options),
  };
}
