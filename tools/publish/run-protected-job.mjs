#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function cleanText(value) {
  return String(value || "").trim();
}

function envText(name, fallback = "") {
  return cleanText(process.env[name] || fallback);
}

function log(message) {
  process.stdout.write(`[protected-job] ${message}\n`);
}

function requireEnv(name) {
  const value = envText(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    encoding: "utf8",
    stdio: options.captureOutput ? ["ignore", "pipe", "pipe"] : "inherit",
    env: {
      ...process.env,
      ...(options.env || {}),
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const detail = options.captureOutput ? `\n${result.stdout || ""}\n${result.stderr || ""}` : "";
    throw new Error(`Command failed (${result.status}): ${command} ${args.join(" ")}${detail}`.trim());
  }
  return result;
}

async function postWorkerJson(baseUrl, secret, pathname, payload) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-reader-internal-key": secret,
    },
    body: JSON.stringify(payload || {}),
  });
  if (!response.ok) {
    throw new Error(await response.text().catch(() => `HTTP ${response.status}`));
  }
  return response.json().catch(() => null);
}

async function updateProgress(baseUrl, secret, jobId, payload) {
  return postWorkerJson(baseUrl, secret, `/protected-jobs/${jobId}/progress`, payload);
}

async function failJob(baseUrl, secret, jobId, payload) {
  return postWorkerJson(baseUrl, secret, `/protected-jobs/${jobId}/fail`, payload);
}

async function finalizeJob(baseUrl, secret, jobId, payload = {}) {
  return postWorkerJson(baseUrl, secret, `/protected-jobs/${jobId}/finalize`, payload);
}

function buildNormalizedEpubObjectKey(jobId) {
  return `generated/protected-jobs/${jobId}/normalized.epub`;
}

function resolveWranglerBin(workspaceRoot) {
  return envText("WRANGLER_BIN") || path.join(workspaceRoot, "reader_render_v3", "node_modules", ".bin", process.platform === "win32" ? "wrangler.cmd" : "wrangler");
}

function resolvePythonBin() {
  return envText("PYTHON_BIN") || "python3";
}

async function main() {
  const workspaceRoot = process.cwd();
  const apiBase = requireEnv("READER_API_BASE");
  const callbackSecret = requireEnv("PROTECTED_JOB_CALLBACK_SECRET");
  const bucketName = envText("R2_BUCKET_NAME", "reader-books");
  const jobId = requireEnv("JOB_ID");
  const contentId = requireEnv("CONTENT_ID");
  const sourceR2Key = requireEnv("SOURCE_R2_KEY");
  const coverR2Key = envText("COVER_R2_KEY");
  const coverFilename = envText("COVER_FILENAME");
  const coverContentType = envText("COVER_CONTENT_TYPE");
  const protectedPrefix = requireEnv("PROTECTED_PREFIX");
  const sourceFormat = envText("SOURCE_FORMAT", "epub").toLowerCase();
  const wranglerBin = resolveWranglerBin(workspaceRoot);
  const pythonBin = resolvePythonBin();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `protected-job-${contentId}-`));

  try {
    const sourcePath = path.join(tempRoot, `source.${sourceFormat}`);
    const outputPath = path.join(tempRoot, "artifact");
    const normalizedEpubPath = path.join(tempRoot, "normalized.epub");
    const coverPath = coverFilename ? path.join(tempRoot, coverFilename) : path.join(tempRoot, "cover-image");
    const buildScript = path.join(workspaceRoot, "reader_render_v3", "tools", "protected-ingestion", "build-protected-book.js");
    const validateDocxScript = path.join(workspaceRoot, "tools", "publish", "validate_docx.py");
    const buildEpubFromDocxScript = path.join(workspaceRoot, "tools", "publish", "build_epub_from_docx.py");

    await updateProgress(apiBase, callbackSecret, jobId, {
      status: "validating_source",
      started_at: new Date().toISOString(),
      result_payload: {
        source_format: sourceFormat,
        source_r2_key: sourceR2Key,
      },
    });

    log(`downloading ${sourceR2Key}`);
    run(wranglerBin, ["r2", "object", "get", `${bucketName}/${sourceR2Key}`, "--file", sourcePath, "--remote"], {
      env: {
        CLOUDFLARE_API_TOKEN: requireEnv("CLOUDFLARE_API_TOKEN"),
        CLOUDFLARE_ACCOUNT_ID: requireEnv("CLOUDFLARE_ACCOUNT_ID"),
      },
    });

    let protectedInputPath = sourcePath;
    let normalizedEpubR2Key = "";
    if (sourceFormat === "docx") {
      if (!coverR2Key) {
        throw new Error("DOCX protected jobs require COVER_R2_KEY");
      }
      log(`downloading ${coverR2Key}`);
      run(wranglerBin, ["r2", "object", "get", `${bucketName}/${coverR2Key}`, "--file", coverPath, "--remote"], {
        env: {
          CLOUDFLARE_API_TOKEN: requireEnv("CLOUDFLARE_API_TOKEN"),
          CLOUDFLARE_ACCOUNT_ID: requireEnv("CLOUDFLARE_ACCOUNT_ID"),
        },
      });

      const validationResult = run(pythonBin, [validateDocxScript, sourcePath, "--json"], {
        captureOutput: true,
        allowFailure: true,
      });
      const validationPayload = JSON.parse(validationResult.stdout || "{}");
      if (validationResult.status !== 0 && validationResult.status !== 2) {
        throw new Error(validationResult.stderr || validationResult.stdout || "DOCX validation command failed");
      }
      if (!validationPayload.ok) {
        await failJob(apiBase, callbackSecret, jobId, {
          status: "not_validated",
          validation_status: "rejected",
          error_step: "validating_source",
          error_message: "DOCX source did not pass validation.",
          validation_errors: Array.isArray(validationPayload.errors) ? validationPayload.errors : [],
        });
        return;
      }

      await updateProgress(apiBase, callbackSecret, jobId, {
        status: "normalizing",
        validation_status: "passed",
        validation_errors: [],
      });

      run(pythonBin, [
        buildEpubFromDocxScript,
        "--input", sourcePath,
        "--output", normalizedEpubPath,
        "--cover-image", coverPath,
      ]);
      normalizedEpubR2Key = buildNormalizedEpubObjectKey(jobId);
      log(`uploading normalized EPUB to ${normalizedEpubR2Key}`);
      run(wranglerBin, ["r2", "object", "put", `${bucketName}/${normalizedEpubR2Key}`, "--file", normalizedEpubPath, "--remote"], {
        env: {
          CLOUDFLARE_API_TOKEN: requireEnv("CLOUDFLARE_API_TOKEN"),
          CLOUDFLARE_ACCOUNT_ID: requireEnv("CLOUDFLARE_ACCOUNT_ID"),
        },
      });
      await updateProgress(apiBase, callbackSecret, jobId, {
        result_payload: {
          normalized_epub: {
            available: true,
            r2_key: normalizedEpubR2Key,
            filename: "normalized.epub",
          },
          cover_upload: {
            filename: coverFilename || path.basename(coverPath),
            r2_key: coverR2Key,
            content_type: coverContentType || "",
          },
        },
      });
      protectedInputPath = normalizedEpubPath;
    }

    await updateProgress(apiBase, callbackSecret, jobId, {
      status: "building_artifact",
      validation_status: sourceFormat === "docx" ? "passed" : "passed",
      validation_errors: [],
    });

    log(`building protected artifact for contentId=${contentId}`);
    run(process.execPath, [
      buildScript,
      "--input", protectedInputPath,
      "--output", outputPath,
      "--book-id", contentId,
      "--protected-prefix", protectedPrefix,
      "--upload",
      "--bucket", bucketName,
      "--wrangler-bin", wranglerBin,
      "--skip-rclone",
      ...(sourceFormat === "docx" ? ["--allow-partial-toc"] : []),
    ], {
      env: {
        CLOUDFLARE_API_TOKEN: requireEnv("CLOUDFLARE_API_TOKEN"),
        CLOUDFLARE_ACCOUNT_ID: requireEnv("CLOUDFLARE_ACCOUNT_ID"),
      },
      captureOutput: true,
    });

    await updateProgress(apiBase, callbackSecret, jobId, {
      status: "reindexing",
      result_payload: {
        content_id: contentId,
        protected_prefix: protectedPrefix,
        protected_content_path: `/books/${protectedPrefix}`,
        ...(normalizedEpubR2Key ? {
          normalized_epub: {
            available: true,
            r2_key: normalizedEpubR2Key,
            filename: "normalized.epub",
          },
        } : {}),
      },
    });

    await finalizeJob(apiBase, callbackSecret, jobId, {
      result_payload: normalizedEpubR2Key ? {
        normalized_epub: {
          available: true,
          r2_key: normalizedEpubR2Key,
          filename: "normalized.epub",
        },
      } : {},
    });
    log(`completed job ${jobId}`);
  } catch (error) {
    await failJob(apiBase, callbackSecret, jobId, {
      status: "failed",
      validation_status: "pending",
      error_step: "building_artifact",
      error_message: error.message || String(error),
    }).catch(() => {});
    throw error;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
