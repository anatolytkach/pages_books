import assert from "node:assert/strict";
import test from "node:test";

import {
  callWorker,
  createFetchMockSequence,
  patchGlobal,
  readJson,
} from "../helpers/worker-test-utils.mjs";

test("E2E: health endpoint /books/ping returns pong", async () => {
  // Arrange
  const url = "https://reader.pub/books/ping";

  // Act
  const response = await callWorker({ url });

  // Assert
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-reader-route"), "ping");
  assert.equal(response.headers.get("x-reader-ping"), "1");
  assert.equal(await response.text(), "pong\n");
});

test("E2E: book id redirects to production reader route", async () => {
  // Arrange
  const url = "https://reader.pub/books/12345";

  // Act
  const response = await callWorker({ url });

  // Assert
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("x-reader-route"), "redirect");
  assert.equal(response.headers.get("location"), "/books/reader/#12345");
});

test("E2E: book id redirects to pages.dev reader route", async () => {
  // Arrange
  const url = "https://reader-books.pages.dev/books/987/";

  // Act
  const response = await callWorker({ url });

  // Assert
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("x-reader-route"), "redirect");
  assert.equal(response.headers.get("location"), "/reader/#987");
});

test("E2E: translate endpoint completes successful flow with upstream", async (t) => {
  // Arrange
  const fetchMock = createFetchMockSequence([
    new Response(
      JSON.stringify([[["Bonjour"]], null, "en"]),
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
    body: { text: "Hello", source: "en", target: "fr" },
  });
  const payload = await readJson(response);

  // Assert
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-reader-route"), "translate");
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(payload.translatedText, "Bonjour");
  assert.equal(payload.detectedSource, "en");
  assert.equal(payload.target, "fr");
});
