function parseInputToUrl(input) {
  if (input instanceof URL) return new URL(input.toString());
  const raw = String(input || "");
  if (/^https?:\/\//i.test(raw)) return new URL(raw);
  return new URL(raw || "http://127.0.0.1/");
}

export function parseProductionShareState(input) {
  const url = parseInputToUrl(input);
  return {
    bookId: String(url.searchParams.get("id") || url.searchParams.get("i") || "").trim(),
    source: String(url.searchParams.get("source") || "").trim(),
    shareId: String(url.searchParams.get("n") || url.searchParams.get("notesShare") || "").trim(),
    legacyNotesToken: String(url.searchParams.get("notes") || "").trim(),
    compressedNotesToken: String(url.searchParams.get("notesz") || "").trim(),
    locationHash: String(url.hash || "").replace(/^#/, "").trim()
  };
}

export function buildProductionBookShareState({
  bookId,
  source = "",
  shareId = "",
  legacyNotesToken = "",
  compressedNotesToken = "",
  locationHash = ""
}) {
  const url = new URL("http://127.0.0.1/books/reader/");
  if (bookId) {
    url.searchParams.set(shareId || legacyNotesToken || compressedNotesToken ? "i" : "id", String(bookId));
  }
  if (source) url.searchParams.set("source", String(source));
  if (shareId) url.searchParams.set("n", String(shareId));
  if (legacyNotesToken) url.searchParams.set("notes", String(legacyNotesToken));
  if (compressedNotesToken) url.searchParams.set("notesz", String(compressedNotesToken));
  if (locationHash) url.hash = String(locationHash);
  return {
    kind: "production-share-state-v1",
    bookId: String(bookId || ""),
    source: String(source || ""),
    shareId: String(shareId || ""),
    legacyNotesToken: String(legacyNotesToken || ""),
    compressedNotesToken: String(compressedNotesToken || ""),
    locationHash: String(locationHash || ""),
    url: `${url.pathname}${url.search}${url.hash}`
  };
}
