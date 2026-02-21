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

test("Unit: TTS keeps segment speech and updates highlight by boundary", () => {
  const js = read("reader/js/fbreader-ui.js");
  assert.match(js, /function speakSegment\(idx\)/);
  assert.match(js, /u\.onboundary = function \(ev\)/);
  assert.match(js, /applyHighlight\(seg\.start \+ Math\.max\(0, ev\.charIndex\)\)/);
  assert.doesNotMatch(js, /function speakWord\(idx\)/);
});

test("Unit: TTS highlight uses word offsets in map entries", () => {
  const js = read("reader/js/fbreader-ui.js");
  assert.match(js, /startOffset: startOff/);
  assert.match(js, /endOffset: endOff/);
  assert.match(js, /r\.setStart\(seg\.node, so\)/);
  assert.match(js, /r\.setEnd\(seg\.node, eo\)/);
});

test("Unit: mobile fallback sweep advances highlight without boundary events", () => {
  const js = read("reader/js/fbreader-ui.js");
  assert.match(js, /function isMobileLikeDevice\(\)/);
  assert.match(js, /function startFallbackSweepIfNeeded\(\)/);
  assert.match(js, /fallbackWordMs = Math\.max\(120, Math\.min\(700, Number\(state\.fallbackMsPerWord \|\| 240\)\)\)/);
  assert.match(js, /fallbackStartDelayMs = Math\.max\(80, Math\.min\(320, Math\.round\(fallbackWordMs \* 0\.5\)\)\)/);
  assert.match(js, /segmentSweepStartTimer = setTimeout\(startFallbackSweepIfNeeded, fallbackStartDelayMs\)/);
  assert.match(js, /segmentSweepTimer = setInterval/);
  assert.match(js, /var target = Math\.min\(words\.length - 1, Math\.floor\(elapsed \/ fallbackWordMs\)\)/);
  assert.match(js, /boundarySeen = true;/);
  assert.match(js, /state\.fallbackMsPerWord = Math\.round\(\(state\.fallbackMsPerWord \* 0\.75\) \+ \(measured \* 0\.25\)\)/);
  assert.match(js, /stopSegmentSweep\(\);/);
});
