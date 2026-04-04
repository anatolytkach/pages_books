export function downloadJsonFile({ fileName, payload, mimeType = "application/json" } = {}) {
  if (typeof document === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined") {
    throw new Error("JSON file download is unavailable in this environment.");
  }
  const blob = new Blob([String(payload || "")], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = String(fileName || "protected-sync.json");
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
  return {
    fileName: link.download,
    fileSize: blob.size
  };
}

export async function readTextFile(file) {
  if (!file || typeof file.text !== "function") {
    throw new Error("No import file was provided.");
  }
  return file.text();
}
