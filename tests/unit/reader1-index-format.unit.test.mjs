import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { REPO_ROOT as ROOT } from "./helpers/repo-root.mjs";

const execFile = promisify(execFileCallback);
const INDEX_TOOL = path.join(ROOT, "tools/catalog/build_lang_indexes.py");

function getPythonInvocation() {
  const configured = String(process.env.PYTHON_BIN || "").trim();
  if (configured) {
    const parts = configured.split(/\s+/).filter(Boolean);
    return { command: parts[0], args: parts.slice(1) };
  }
  if (process.platform === "win32") {
    return { command: "py", args: ["-3"] };
  }
  return { command: "python3", args: [] };
}

test("Unit: build_lang_indexes reads OPF metadata and cover path from a manual book", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "reader1-index-"));
  const inputRoot = path.join(tempRoot, "input");
  const outputRoot = path.join(tempRoot, "output");
  const bookDir = path.join(inputRoot, "manual", "42");
  const metaInfDir = path.join(bookDir, "META-INF");
  const opsDir = path.join(bookDir, "OPS");
  const locationsPath = path.join(tempRoot, "book-locations.json");
  const registryPath = path.join(tempRoot, "registry.json");

  await fs.mkdir(metaInfDir, { recursive: true });
  await fs.mkdir(opsDir, { recursive: true });
  await fs.mkdir(path.join(bookDir, "r"), { recursive: true });
  await fs.writeFile(
    path.join(metaInfDir, "container.xml"),
    `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
    "utf8",
  );
  await fs.writeFile(
    path.join(opsDir, "content.opf"),
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Structured Reader1 Book</dc:title>
    <dc:creator>Doe, Jane</dc:creator>
    <dc:language>ru</dc:language>
    <meta name="cover" content="cover-image" />
  </metadata>
  <manifest>
    <item id="cover-image" href="../r/cover.jpg" media-type="image/jpeg" />
  </manifest>
  <spine />
</package>`,
    "utf8",
  );
  await fs.writeFile(
    locationsPath,
    JSON.stringify({
      items: {
        "42": {
          readerId: "42",
          source: "manual",
          sourceBookId: "42",
          localContentPath: "/books/content/manual/42/",
          contentPath: "/books/content/manual/42/",
        },
      },
    }),
    "utf8",
  );
  await fs.writeFile(registryPath, "{}", "utf8");

  const python = getPythonInvocation();
  await execFile(python.command, [
    ...python.args,
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
  assert.equal(String(authorData.books[0].cover || "").replace(/\\/g, "/"), "/books/content/manual/42/r/cover.jpg");
  assert.deepEqual(languagesData.languages, [{ code: "ru", count: 1 }]);
});
