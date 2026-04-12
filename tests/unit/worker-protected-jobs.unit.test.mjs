import assert from "node:assert/strict";
import test from "node:test";

import {
  callWorker,
  createFetchMockSequence,
  createR2Bucket,
  patchGlobal,
  readJson,
} from "../helpers/worker-test-utils.mjs";

function buildJwt(sub = "user-1", email = "publisher@example.com") {
  const tokenPayload = Buffer.from(JSON.stringify({ sub, email, exp: 4102444800 }))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `x.${tokenPayload}.y`;
}

test("Unit: protected job creation creates draft book and presigned upload", async (t) => {
  const jwt = buildJwt();
  const jobId = "123e4567-e89b-12d3-a456-426614174111";
  const fetchMock = createFetchMockSequence([
    new Response(
      JSON.stringify({ id: "user-1", email: "publisher@example.com" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(JSON.stringify({}), { status: 404, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response(
      JSON.stringify([
        {
          id: "membership-1",
          role: "publisher",
          tenant_id: "tenant-1",
          tenants: {
            id: "tenant-1",
            slug: "acme-publishing",
            name: "Acme Publishing",
            tenant_type: "publisher",
          },
        },
      ]),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify(200555),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({ slug: "acme-publishing" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({
        id: "book-1",
        content_id: "200555",
        title: "Ben Hur",
        author: "Lew Wallace",
        manifest: {
          readerType: "protected",
        },
      }),
      { status: 201, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({
        id: jobId,
        book_id: "book-1",
        content_id: "200555",
        status: "awaiting_upload",
        source_format: "epub",
        protected_prefix: "protected-content/200555",
      }),
      { status: 201, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({
        id: jobId,
        book_id: "book-1",
        content_id: "200555",
        status: "awaiting_upload",
        source_format: "epub",
        source_r2_key: `uploads/protected/${jobId}/Ben-Hur.epub`,
        protected_prefix: "protected-content/200555",
      }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(JSON.stringify({}), { status: 404, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response(
      JSON.stringify({
        id: "asset-1",
      }),
      { status: 201, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
  ]);
  const restoreFetch = patchGlobal("fetch", fetchMock);
  t.after(restoreFetch);

  const response = await callWorker({
    url: "https://reader.pub/books/api/v1/protected-jobs",
    method: "POST",
    headers: { authorization: `Bearer ${jwt}` },
    body: {
      title: "Ben Hur",
      author: "Lew Wallace",
      filename: "Ben-Hur.epub",
      source_format: "epub",
      visibility: "public",
      tenant_id: "tenant-1",
    },
    env: {
      READER_BOOKS: createR2Bucket(),
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      CLOUDFLARE_ACCOUNT_ID: "764a8c94ce002764fc1d3d29faa4bb09",
      R2_BUCKET_NAME: "reader-books",
      R2_ACCESS_KEY_ID: "access-key",
      R2_SECRET_ACCESS_KEY: "secret-key",
    },
  });
  const payload = await readJson(response);

  assert.equal(response.status, 201);
  assert.equal(payload.jobId, jobId);
  assert.equal(payload.bookId, "book-1");
  assert.equal(payload.contentId, "200555");
  assert.equal(payload.status, "awaiting_upload");
  assert.equal(payload.sourceObjectKey, `uploads/protected/${jobId}/Ben-Hur.epub`);
  assert.equal(payload.upload.method, "PUT");
  assert.match(payload.upload.url, new RegExp(`^https://764a8c94ce002764fc1d3d29faa4bb09\\.r2\\.cloudflarestorage\\.com/reader-books/uploads/protected/${jobId}/Ben-Hur\\.epub\\?`));
});

test("Unit: protected job creation falls back to worker upload when presign config is missing", async (t) => {
  const jwt = buildJwt();
  const jobId = "223e4567-e89b-12d3-a456-426614174111";
  const fetchMock = createFetchMockSequence([
    new Response(
      JSON.stringify({ id: "user-1", email: "publisher@example.com" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(JSON.stringify({}), { status: 404, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response(
      JSON.stringify([
        {
          id: "membership-1",
          role: "publisher",
          tenant_id: "tenant-1",
          tenants: {
            id: "tenant-1",
            slug: "acme-publishing",
            name: "Acme Publishing",
            tenant_type: "publisher",
          },
        },
      ]),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify(200556),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({ slug: "acme-publishing" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({
        id: "book-2",
        content_id: "200556",
        title: "Ben Hur",
        author: "Lew Wallace",
        manifest: {
          readerType: "protected",
        },
      }),
      { status: 201, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({
        id: jobId,
        book_id: "book-2",
        content_id: "200556",
        status: "awaiting_upload",
        source_format: "epub",
        protected_prefix: "protected-content/200556",
      }),
      { status: 201, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({
        id: jobId,
        book_id: "book-2",
        content_id: "200556",
        status: "awaiting_upload",
        source_format: "epub",
        source_r2_key: `uploads/protected/${jobId}/Ben-Hur.epub`,
        protected_prefix: "protected-content/200556",
      }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(JSON.stringify({}), { status: 404, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response(
      JSON.stringify({
        id: "asset-2",
      }),
      { status: 201, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
  ]);
  const restoreFetch = patchGlobal("fetch", fetchMock);
  t.after(restoreFetch);

  const response = await callWorker({
    url: "https://reader.pub/books/api/v1/protected-jobs",
    method: "POST",
    headers: { authorization: `Bearer ${jwt}` },
    body: {
      title: "Ben Hur",
      author: "Lew Wallace",
      filename: "Ben-Hur.epub",
      source_format: "epub",
      visibility: "public",
      tenant_id: "tenant-1",
    },
    env: {
      READER_BOOKS: createR2Bucket(),
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    },
  });
  const payload = await readJson(response);

  assert.equal(response.status, 201);
  assert.equal(payload.jobId, jobId);
  assert.equal(payload.upload.kind, "worker");
  assert.equal(payload.upload.method, "PUT");
  assert.equal(payload.upload.url, `/books/api/v1/protected-jobs/${jobId}/source`);
});

test("Unit: protected job source upload stores the source in R2", async (t) => {
  const jwt = buildJwt();
  const jobId = "323e4567-e89b-12d3-a456-426614174111";
  const bucket = createR2Bucket();
  const fetchMock = createFetchMockSequence([
    new Response(
      JSON.stringify({ id: "user-1", email: "publisher@example.com" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({
        id: jobId,
        book_id: "book-3",
        content_id: "200557",
        status: "awaiting_upload",
        source_format: "epub",
        source_r2_key: `uploads/protected/${jobId}/Ben-Hur.epub`,
        triggered_by_user_id: "user-1",
      }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
  ]);
  const restoreFetch = patchGlobal("fetch", fetchMock);
  t.after(restoreFetch);

  const response = await callWorker({
    url: `https://reader.pub/books/api/v1/protected-jobs/${jobId}/source`,
    method: "PUT",
    headers: {
      authorization: `Bearer ${jwt}`,
      "content-type": "application/epub+zip",
    },
    body: "epub-bytes",
    env: {
      READER_BOOKS: bucket,
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    },
  });
  const payload = await readJson(response);
  const stored = await bucket.get(`uploads/protected/${jobId}/Ben-Hur.epub`);

  assert.equal(response.status, 201);
  assert.equal(payload.uploaded, true);
  assert.ok(stored);
});

test("Unit: upload-complete verifies R2 object and dispatches GitHub job", async (t) => {
  const jwt = buildJwt();
  const jobId = "123e4567-e89b-12d3-a456-426614174111";
  const bucket = createR2Bucket({
    objectsByKey: {
      [`uploads/protected/${jobId}/Ben-Hur.epub`]: {
        body: "epub",
        async text() {
          return "epub";
        },
        async json() {
          return { ok: true };
        },
        writeHttpMetadata() {},
      },
    },
  });
  const fetchMock = createFetchMockSequence([
    new Response(
      JSON.stringify({ id: "user-1", email: "publisher@example.com" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({
        id: jobId,
        book_id: "book-1",
        content_id: "200555",
        status: "awaiting_upload",
        source_format: "epub",
        source_r2_key: `uploads/protected/${jobId}/Ben-Hur.epub`,
        protected_prefix: "protected-content/200555",
        visibility: "public",
        triggered_by_user_id: "user-1",
      }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({ id: jobId, status: "uploaded", source_format: "epub" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({ id: "book-1", status: "processing" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({
        id: jobId,
        book_id: "book-1",
        content_id: "200555",
        status: "queued",
        source_format: "epub",
      }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    (...args) => {
      const [url, options] = args;
      assert.equal(url, "https://api.github.com/repos/anatolytkach/pages_books/actions/workflows/process-protected-job.yml/dispatches");
      assert.equal(options.method, "POST");
      const body = JSON.parse(options.body);
      assert.equal(body.ref, "codex/protected-publish-jobs");
      assert.equal(body.inputs.job_id, jobId);
      assert.equal(body.inputs.source_format, "epub");
      return new Response(null, { status: 204 });
    },
  ]);
  const restoreFetch = patchGlobal("fetch", fetchMock);
  t.after(restoreFetch);

  const response = await callWorker({
    url: `https://reader.pub/books/api/v1/protected-jobs/${jobId}/upload-complete`,
    method: "POST",
    headers: { authorization: `Bearer ${jwt}` },
    env: {
      READER_BOOKS: bucket,
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      GITHUB_REPO_DISPATCH_TOKEN: "github-token",
      GITHUB_REPO_OWNER: "anatolytkach",
      GITHUB_REPO_NAME: "pages_books",
      GITHUB_WORKFLOW_REF: "codex/protected-publish-jobs",
    },
  });
  const payload = await readJson(response);

  assert.equal(response.status, 202);
  assert.equal(payload.status, "queued");
  assert.equal(payload.message, "Queued for protected conversion");
});
