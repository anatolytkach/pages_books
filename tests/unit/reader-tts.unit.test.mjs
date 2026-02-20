import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = "/Volumes/2T/se_ingest/pages_books";

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

test("Unit: reader html exposes Choose Voice in sidebar menu", () => {
  const html = read("reader/index.html");
  assert.match(html, /data-menu="voice"/);
  assert.match(html, /overlay-voice/);
  assert.match(html, /id="voiceSelect"/);
  assert.match(html, /id="voiceRefresh"/);
});

test("Unit: reader html exposes desktop and mobile TTS buttons", () => {
  const html = read("reader/index.html");
  assert.match(html, /id="ttsToggleDesktop"/);
  assert.match(html, /id="ttsToggleMobile"/);
});

test("Unit: fbreader speech setup wires speech synthesis and relocated restart", () => {
  const js = read("reader/js/fbreader-ui.js");
  assert.match(js, /function setupSpeech\(reader\)/);
  assert.match(js, /window\.speechSynthesis/);
  assert.match(js, /reader\.rendition\.on\("relocated", function \(\) \{/);
  assert.match(js, /restartCurrentPage\(\)/);
  assert.match(js, /reader\.rendition\.next/);
});

test("Unit: speech toggle updates icon state and highlight hooks", () => {
  const js = read("reader/js/fbreader-ui.js");
  assert.match(js, /classList\.toggle\("is-speaking", !!on\)/);
  assert.match(js, /HIGHLIGHT_NAME = "fb-tts"/);
  assert.match(js, /voiceSelect\.addEventListener\("change"/);
});

test("Unit: TTS payload samples visible viewport blocks", () => {
  const js = read("reader/js/fbreader-ui.js");
  assert.match(js, /collectVisibleTextByViewport/);
  assert.match(js, /doc\.elementFromPoint/);
});

test("Unit: TTS payload is anchored to current CFI", () => {
  const js = read("reader/js/fbreader-ui.js");
  assert.match(js, /payloadFromCurrentCfi/);
  assert.match(js, /currentLocation\(\)/);
  assert.match(js, /\.range\(cfi\)/);
});
