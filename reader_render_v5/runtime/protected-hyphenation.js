function normalizeLanguage(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized.startsWith("ru")) return "ru";
  if (normalized.startsWith("en")) return "en";
  return normalized.split(/[-_]/)[0] || normalized;
}

function isLetter(char) {
  return /\p{L}/u.test(String(char || ""));
}

function isVowel(char, language) {
  const value = String(char || "").toLowerCase();
  if (!value) return false;
  if (language === "ru") return /[аеёиоуыэюя]/u.test(value);
  if (language === "en") return /[aeiouy]/u.test(value);
  return /[aeiouyаеёиоуыэюя]/u.test(value);
}

function isRussianServiceLetter(char) {
  return /[ьъй]/iu.test(String(char || ""));
}

function hasVowel(chars, start, end, language) {
  for (let index = start; index < end; index += 1) {
    if (isVowel(chars[index], language)) return true;
  }
  return false;
}

function collectRussianHyphenPoints(chars) {
  const points = [];
  for (let splitIndex = 2; splitIndex <= chars.length - 2; splitIndex += 1) {
    const prev = chars[splitIndex - 1];
    const next = chars[splitIndex];
    if (!isLetter(prev) || !isLetter(next)) continue;
    if (!hasVowel(chars, 0, splitIndex, "ru")) continue;
    if (!hasVowel(chars, splitIndex, chars.length, "ru")) continue;
    if (isRussianServiceLetter(prev) || isRussianServiceLetter(next)) continue;
    const prevIsVowel = isVowel(prev, "ru");
    const nextIsVowel = isVowel(next, "ru");
    const nextNext = chars[splitIndex + 1] || "";
    const nextNextIsVowel = isVowel(nextNext, "ru");
    if (prevIsVowel && !nextIsVowel) {
      points.push(splitIndex);
      continue;
    }
    if (!prevIsVowel && !nextIsVowel && nextNext && nextNextIsVowel) {
      points.push(splitIndex);
    }
  }
  return Array.from(new Set(points)).sort((a, b) => a - b);
}

function collectEnglishHyphenPoints(chars) {
  const points = [];
  for (let splitIndex = 3; splitIndex <= chars.length - 3; splitIndex += 1) {
    const prev = chars[splitIndex - 1];
    const next = chars[splitIndex];
    if (!isLetter(prev) || !isLetter(next)) continue;
    if (!hasVowel(chars, 0, splitIndex, "en")) continue;
    if (!hasVowel(chars, splitIndex, chars.length, "en")) continue;
    const prevIsVowel = isVowel(prev, "en");
    const nextIsVowel = isVowel(next, "en");
    if (prevIsVowel !== nextIsVowel) {
      points.push(splitIndex);
    }
  }
  return Array.from(new Set(points)).sort((a, b) => a - b);
}

export function collectHyphenationPoints(text, language) {
  const normalizedLanguage = normalizeLanguage(language);
  const chars = Array.from(String(text || ""));
  if (chars.length < 5 || chars.some((char) => !isLetter(char))) return [];
  if (normalizedLanguage === "ru") return collectRussianHyphenPoints(chars);
  if (normalizedLanguage === "en") return collectEnglishHyphenPoints(chars);
  return [];
}

export function normalizeHyphenationLanguage(value) {
  return normalizeLanguage(value);
}
