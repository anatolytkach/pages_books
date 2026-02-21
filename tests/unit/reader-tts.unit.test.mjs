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
  assert.match(html, /id="voiceLangSelect"/);
  assert.match(html, /id="voiceLangDropdown"/);
  assert.match(html, /id="voiceLangToggle"/);
  assert.match(html, /id="voiceLangList"/);
  assert.match(html, /id="voiceSelect"/);
  assert.match(html, /id="voiceDropdown"/);
  assert.match(html, /id="voiceToggle"/);
  assert.match(html, /id="voiceList"/);
  assert.match(html, /id="voiceStatus" class="voice-picker-status"[^>]*>Select a voice for reading aloud\./);
  assert.doesNotMatch(html, /id="voiceRefresh"/);
});

test("Unit: reader html exposes desktop and mobile TTS buttons", () => {
  const html = read("reader/index.html");
  assert.match(html, /id="ttsToggleDesktop"/);
  assert.match(html, /id="ttsToggleMobile"/);
});

test("Unit: fbreader speech setup wires speech synthesis", () => {
  const js = read("reader/js/fbreader-ui.js");
  assert.match(js, /function setupSpeech\(reader\)/);
  assert.match(js, /window\.speechSynthesis/);
  assert.match(js, /function toggleSpeech\(\)/);
  assert.match(js, /function stopAndRevealLastWord\(\)/);
});

test("Unit: speech toggle updates icon state and highlight hooks", () => {
  const js = read("reader/js/fbreader-ui.js");
  assert.match(js, /classList\.toggle\("is-speaking", !!on\)/);
  assert.match(js, /HIGHLIGHT_NAME = "fb-tts"/);
  assert.match(js, /VOICE_LANG_KEY = "fbreader:tts:voiceLang"/);
  assert.match(js, /voiceLangSelect\.addEventListener\("change"/);
  assert.match(js, /voiceSelect\.addEventListener\("change"/);
});

test("Unit: voice picker filters voices by selected language", () => {
  const js = read("reader/js/fbreader-ui.js");
  assert.match(js, /function normalizeLangTag\(lang\)/);
  assert.match(js, /function closeVoiceDropdowns\(\)/);
  assert.match(js, /function syncCustomDropdown\(selectEl, dropdownEl, toggleEl, listEl\)/);
  assert.match(js, /function bindCustomDropdown\(dropdownEl, toggleEl, listEl\)/);
  assert.match(js, /function uniqueLangsFromVoices\(voices\)/);
  assert.match(js, /var defaultUs = "en-us"/);
  assert.match(js, /normalizeLangTag\(vv\.lang \|\| ""\) === wantLang/);
  assert.match(js, /buildLangLabel\(a\.raw\)\.localeCompare\(buildLangLabel\(b\.raw\)/);
  assert.match(js, /filtered\.sort\(function \(a, b\)/);
  assert.match(js, /bindCustomDropdown\(voiceLangDropdown, voiceLangToggle, voiceLangList\)/);
  assert.match(js, /bindCustomDropdown\(voiceDropdown, voiceToggle, voiceList\)/);
  assert.match(js, /setVoiceMessage\("No voices found for the selected language\."\)/);
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
  assert.match(js, /start && start\.displayed && start\.displayed\.page/);
  assert.match(js, /key\.push\("s=" \+ scfi\)/);
  assert.match(js, /rr0\.setStart\(n, baseOffset \+ mm0\.index\)/);
  assert.match(js, /rr0\.setEnd\(n, baseOffset \+ mm0\.index \+ mm0\[0\]\.length\)/);
  assert.match(js, /reachedLowerHalf/);
  assert.match(js, /lastTop !== null && reachedLowerHalf/);
});

test("Unit: TTS does not restart on font controls", () => {
  const js = read("reader/js/fbreader-ui.js");
  assert.doesNotMatch(js, /function bindFontRestart\(id\)/);
  assert.doesNotMatch(js, /bindFontRestart\("fontInc"\)/);
  assert.doesNotMatch(js, /bindFontRestart\("fontDec"\)/);
});

test("Unit: TTS keeps segment speech and tracks last spoken word by boundary", () => {
  const js = read("reader/js/fbreader-ui.js");
  assert.match(js, /function speakSegment\(idx\)/);
  assert.match(js, /u\.onboundary = function \(ev\)/);
  assert.match(js, /state\.lastSpokenSeg = segRef/);
  assert.match(js, /state\.lastWordCfi = segToCfi\(segRef\)/);
  assert.doesNotMatch(js, /applyHighlight\(seg\.start \+ Math\.max\(0, ev\.charIndex\)\)/);
  assert.doesNotMatch(js, /function speakWord\(idx\)/);
});

test("Unit: TTS no longer auto-advances page", () => {
  const js = read("reader/js/fbreader-ui.js");
  assert.match(js, /if \(idx >= segments\.length\)/);
  assert.match(js, /state\.enabled = false;/);
  assert.doesNotMatch(js, /Promise\.resolve\(requestAutoNextPage\(\)\)/);
});

test("Unit: TTS highlight uses word offsets in map entries", () => {
  const js = read("reader/js/fbreader-ui.js");
  assert.match(js, /startOffset: startOff/);
  assert.match(js, /endOffset: endOff/);
  assert.match(js, /r\.setStart\(seg\.node, so\)/);
  assert.match(js, /r\.setEnd\(seg\.node, eo\)/);
});

test("Unit: mobile fallback sweep tracks last spoken word without boundary events", () => {
  const js = read("reader/js/fbreader-ui.js");
  assert.match(js, /function isMobileLikeDevice\(\)/);
  assert.match(js, /function startFallbackSweepIfNeeded\(\)/);
  assert.match(js, /fallbackWordMs = Math\.max\(120, Math\.min\(700, Number\(state\.fallbackMsPerWord \|\| 240\)\)\)/);
  assert.match(js, /fallbackStartDelayMs = Math\.max\(80, Math\.min\(320, Math\.round\(fallbackWordMs \* 0\.5\)\)\)/);
  assert.match(js, /segmentSweepStartTimer = setTimeout\(startFallbackSweepIfNeeded, fallbackStartDelayMs\)/);
  assert.match(js, /segmentSweepTimer = setInterval/);
  assert.match(js, /var target = Math\.min\(words\.length - 1, Math\.floor\(elapsed \/ fallbackWordMs\)\)/);
  assert.match(js, /state\.lastSpokenSeg = words\[wi\]/);
  assert.match(js, /state\.lastWordCfi = segToCfi\(words\[wi\]\)/);
  assert.match(js, /boundarySeen = true;/);
  assert.match(js, /state\.fallbackMsPerWord = Math\.round\(\(state\.fallbackMsPerWord \* 0\.75\) \+ \(measured \* 0\.25\)\)/);
  assert.match(js, /stopSegmentSweep\(\);/);
});

test("Unit: TTS stop reveals location and highlights last spoken word", () => {
  const js = read("reader/js/fbreader-ui.js");
  assert.match(js, /function stopAndRevealLastWord\(\)/);
  assert.match(js, /segToCfi\(state\.lastSpokenSeg\)/);
  assert.match(js, /reader\.rendition\.display\(targetCfi\)/);
  assert.match(js, /reader\.rendition\.display\(fallbackPageCfi\)/);
  assert.match(js, /function showStoppedWordHighlight\(\)/);
  assert.match(js, /function applyStopHighlightRange\(doc, range\)/);
});
