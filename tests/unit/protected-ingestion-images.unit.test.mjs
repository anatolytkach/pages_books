import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { extractTextBlocks } = require("../../reader_render_v3/tools/protected-ingestion/lib/extract-text-blocks.js");

test("Unit: protected ingestion preserves inline image-only blocks", async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "protected-images-"));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

  const chapterPath = path.join(tempRoot, "OEBPS", "chapter.xhtml");
  const imagePath = path.join(tempRoot, "OEBPS", "media", "pic.jpg");
  fs.mkdirSync(path.dirname(chapterPath), { recursive: true });
  fs.mkdirSync(path.dirname(imagePath), { recursive: true });
  fs.writeFileSync(imagePath, "fake-image");
  fs.writeFileSync(
    chapterPath,
    `<?xml version="1.0"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <p><img src="media/pic.jpg" alt="sample art" width="320" height="180" /></p>
      </body>
    </html>`,
    "utf8"
  );

  const result = extractTextBlocks({
    book: { toc: [] },
    spine: [{
      spineIndex: 0,
      spineId: "item-1",
      href: "OEBPS/chapter.xhtml",
      absolutePath: chapterPath,
      linear: "yes",
      properties: []
    }]
  });

  assert.equal(result.blocks.length, 1);
  assert.equal(result.blocks[0].blockType, "image");
  assert.equal(result.blocks[0].image.alt, "sample art");
  assert.equal(result.blocks[0].image.href, "OEBPS/media/pic.jpg");
  assert.equal(result.blocks[0].image.absolutePath, imagePath);
});
