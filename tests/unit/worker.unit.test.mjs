import assert from "node:assert/strict";
import test from "node:test";

import {
  callWorker,
  createR2Bucket,
  createFetchMockSequence,
  patchGlobal,
  readJson,
} from "../helpers/worker-test-utils.mjs";

test("Unit: translate OPTIONS returns preflight response with CORS headers", async () => {
  // Arrange
  const url = "https://reader.pub/books/api/translate";

  // Act
  const response = await callWorker({ url, method: "OPTIONS" });

  // Assert
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("x-reader-route"), "translate-options");
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(response.headers.get("access-control-allow-methods"), "POST, OPTIONS");
});

test("Unit: translate rejects non-POST method", async () => {
  // Arrange
  const url = "https://reader.pub/books/api/translate";

  // Act
  const response = await callWorker({ url, method: "GET" });
  const payload = await readJson(response);

  // Assert
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("x-reader-route"), "translate-method");
  assert.equal(payload.error, "Method not allowed. Use POST.");
});

test("Unit: translate validates empty text", async () => {
  // Arrange
  const url = "https://reader.pub/books/api/translate";

  // Act
  const response = await callWorker({
    url,
    method: "POST",
    body: { text: "   ", source: "auto", target: "en" },
  });
  const payload = await readJson(response);

  // Assert
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("x-reader-route"), "translate-empty");
  assert.equal(payload.error, "Empty text.");
});

test("Unit: translate trims params and truncates query text to 5000 chars", async (t) => {
  // Arrange
  const longText = "x".repeat(5100);
  const fetchMock = createFetchMockSequence([
    new Response(
      JSON.stringify([[["Bonjour "], ["monde"]], null, "fr"]),
      {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      }
    ),
  ]);
  const restoreFetch = patchGlobal("fetch", fetchMock);
  t.after(restoreFetch);

  // Act
  const response = await callWorker({
    url: "https://reader.pub/books/api/translate",
    method: "POST",
    body: { text: longText, source: "  auto ", target: "  fr " },
  });
  const payload = await readJson(response);
  const upstreamUrl = new URL(fetchMock.calls[0][0]);

  // Assert
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-reader-route"), "translate");
  assert.equal(payload.translatedText, "Bonjour monde");
  assert.equal(payload.detectedSource, "fr");
  assert.equal(payload.target, "fr");
  assert.equal(fetchMock.calls.length, 1);
  assert.equal(upstreamUrl.searchParams.get("q").length, 5000);
  assert.equal(upstreamUrl.searchParams.get("sl"), "auto");
  assert.equal(upstreamUrl.searchParams.get("tl"), "fr");
});

test("Unit: translate uses provided source when upstream omits detected language", async (t) => {
  // Arrange
  const fetchMock = createFetchMockSequence([
    new Response(
      JSON.stringify([[["Hola"]], null, null]),
      {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      }
    ),
  ]);
  const restoreFetch = patchGlobal("fetch", fetchMock);
  t.after(restoreFetch);

  // Act
  const response = await callWorker({
    url: "https://reader.pub/books/api/translate",
    method: "POST",
    body: { text: "hello", source: "es", target: "en" },
  });
  const payload = await readJson(response);

  // Assert
  assert.equal(response.status, 200);
  assert.equal(payload.translatedText, "Hola");
  assert.equal(payload.detectedSource, "es");
  assert.equal(payload.target, "en");
});

test("Unit: translate returns upstream error payload after retries", async (t) => {
  // Arrange
  const fetchMock = createFetchMockSequence([
    () => new Response("bad gateway", { status: 502 }),
  ]);
  const restoreFetch = patchGlobal("fetch", fetchMock);
  t.after(restoreFetch);

  // Act
  const response = await callWorker({
    url: "https://reader.pub/books/api/translate",
    method: "POST",
    body: { text: "hello", source: "en", target: "fr" },
  });
  const payload = await readJson(response);

  // Assert
  assert.equal(response.status, 502);
  assert.equal(response.headers.get("x-reader-route"), "translate-upstream");
  assert.equal(payload.error, "Translate upstream failed.");
  assert.equal(payload.status, 502);
  assert.equal(payload.detail, "bad gateway");
  assert.equal(payload.attempts, 6);
});

test("Unit: translate returns 500 when request JSON is invalid", async () => {
  // Arrange
  const url = "https://reader.pub/books/api/translate";

  // Act
  const response = await callWorker({
    url,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{broken json",
  });
  const payload = await readJson(response);

  // Assert
  assert.equal(response.status, 500);
  assert.equal(response.headers.get("x-reader-route"), "translate-error");
  assert.equal(payload.error, "Translate request failed.");
});

test("Unit: translate alias /api/translate is supported", async (t) => {
  // Arrange
  const fetchMock = createFetchMockSequence([
    new Response(
      JSON.stringify([[["Hi"]], null, "en"]),
      {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      }
    ),
  ]);
  const restoreFetch = patchGlobal("fetch", fetchMock);
  t.after(restoreFetch);

  // Act
  const response = await callWorker({
    url: "https://reader.pub/api/translate/",
    method: "POST",
    body: { text: "Privet", source: "auto", target: "en" },
  });
  const payload = await readJson(response);

  // Assert
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-reader-route"), "translate");
  assert.equal(payload.translatedText, "Hi");
});
