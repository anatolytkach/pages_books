import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const ROOT = "/Volumes/2T/se_ingest/pages_books";
const INDEX_TOOL = path.join(ROOT, "tools/catalog/build_lang_indexes.py");

test("Unit: build_lang_indexes reads reader1 manifest metadata and cover path", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "reader1-index-"));
  const inputRoot = path.join(tempRoot, "input");
  const outputRoot = path.join(tempRoot, "output");
  const manifestDir = path.join(inputRoot, "manual", "42");
  const locationsPath = path.join(tempRoot, "book-locations.json");
  const registryPath = path.join(tempRoot, "registry.json");

  await fs.mkdir(path.join(manifestDir, "r"), { recursive: true });
  await fs.writeFile(
    path.join(manifestDir, "reader1-manifest.json"),
    JSON.stringify({
      format: "reader1",
      version: 1,
      metadata: {
        title: "Structured Reader1 Book",
        creators: ["Doe, Jane"],
        languages: ["ru"],
      },
      resources: [
        { href: "r/cover.jpg", type: "image/jpeg", rel: ["cover"] },
      ],
      spine: [
        { idref: "s1", href: "c/a1.xhtml", linear: "yes", properties: [] },
      ],
      toc: [
        { href: "c/a1.xhtml", title: "Chapter 1" },
      ],
    }),
    "utf8",
  );
  await fs.writeFile(path.join(locationsPath), JSON.stringify({
    items: {
      "42": {
        readerId: "42",
        source: "manual",
        sourceBookId: "42",
        localContentPath: "/books/content/manual/42/",
        contentPath: "/books/content/manual/42/",
      },
    },
  }), "utf8");
  await fs.writeFile(path.join(registryPath), "{}", "utf8");

  await execFile("python3", [
    INDEX_TOOL,
    "--input", inputRoot,
    "--output", outputRoot,
    "--locations", locationsPath,
    "--registry", registryPath,
    "--book-id", "42",
  ]);

  const authorPath = path.join(outputRoot, "a", "doejane.json");
  const languagesPath = path.join(outputRoot, "languages.json");
  const authorData = JSON.parse(await fs.readFile(authorPath, "utf8"));
  const languagesData = JSON.parse(await fs.readFile(languagesPath, "utf8"));

  assert.equal(authorData.name, "Doe, Jane");
  assert.equal(authorData.books[0].title, "Structured Reader1 Book");
  assert.equal(authorData.books[0].cover, "/books/content/manual/42/r/cover.jpg");
  assert.deepEqual(languagesData.languages, [{ code: "ru", count: 1 }]);
});
