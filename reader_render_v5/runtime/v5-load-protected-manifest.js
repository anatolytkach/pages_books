import {
  PROTECTED_V4_BOOTSTRAP_CONTRACT_KIND,
  PROTECTED_V4_BOOTSTRAP_MANIFEST_VERSION
} from "/reader_render_v4/tools/protected-ingestion/lib/build-protected-manifest.js";

async function fetchJson(url) {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

export async function loadProtectedManifest(artifactRoot) {
  const baseHref = globalThis.location && globalThis.location.href
    ? globalThis.location.href
    : "http://127.0.0.1:8791/books/reader_new_v4/";
  const rootUrl = new URL(String(artifactRoot || "").replace(/\/?$/, "/"), baseHref).toString();
  const manifestUrl = new URL("manifest.json", rootUrl).toString();
  const manifest = await fetchJson(manifestUrl);

  if (Number(manifest.version) !== PROTECTED_V4_BOOTSTRAP_MANIFEST_VERSION) {
    throw new Error(`Unsupported v4 manifest version: ${manifest.version}`);
  }
  if (String(manifest.mode || "") !== "protected-v4-bootstrap") {
    throw new Error(`Unsupported v4 manifest mode: ${manifest.mode || "<missing>"}`);
  }
  if (!manifest.artifactContract || manifest.artifactContract.kind !== PROTECTED_V4_BOOTSTRAP_CONTRACT_KIND) {
    throw new Error(`Unsupported v4 contract kind: ${manifest && manifest.artifactContract && manifest.artifactContract.kind}`);
  }

  return {
    rootUrl: rootUrl.replace(/\/$/, ""),
    manifestUrl,
    manifest
  };
}
