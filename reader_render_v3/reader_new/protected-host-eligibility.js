function driveConfiguredInDocument(doc = document) {
  try {
    const meta = doc.querySelector('meta[name="google-drive-client-id"]');
    return !!(meta && String(meta.content || "").trim());
  } catch (_error) {
    return false;
  }
}

function hasHardCompatFailure(route, options = {}) {
  if (typeof options.hardCompatFailure === "boolean") return options.hardCompatFailure;
  const query = route && route.query ? route.query : {};
  const raw = String(query.protectedCompat || query.protectedHardCompat || "").trim().toLowerCase();
  return ["fail", "hard-fail", "fatal"].includes(raw);
}

function defaultWorkerAvailability(route) {
  if (route && route.forceWorkerUnavailable) return false;
  return typeof Worker !== "undefined";
}

async function checkProtectedArtifact(artifactRoot, fetchImpl = fetch) {
  const manifestUrl = `${String(artifactRoot || "").replace(/\/$/, "")}/manifest.json`;
  try {
    const response = await fetchImpl(manifestUrl, { method: "GET", cache: "no-store" });
    return {
      available: !!response.ok,
      checkedUrl: manifestUrl,
      status: response.status || 0
    };
  } catch (_error) {
    return {
      available: false,
      checkedUrl: manifestUrl,
      status: 0
    };
  }
}

export async function assessProtectedReaderEligibility(route, rollout, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const workerAvailable =
    typeof options.workerAvailable === "boolean"
      ? options.workerAvailable
      : defaultWorkerAvailability(route);
  const artifact = await checkProtectedArtifact(route.artifactRoot, fetchImpl);
  const warnings = [];
  const hardCompatFailure = hasHardCompatFailure(route, options);
  if (!driveConfiguredInDocument(options.document || (typeof document !== "undefined" ? document : null))) {
    warnings.push("drive-unconfigured");
  }

  let status = "eligible";
  let eligible = true;
  if (!route.bookId) {
    status = "ineligible-book-not-allowed";
    eligible = false;
  } else if (!rollout.rolloutEnabled) {
    status = "ineligible-rollout-disabled";
    eligible = false;
  } else if (!rollout.bookAllowed) {
    status = "ineligible-book-not-allowed";
    eligible = false;
  } else if (hardCompatFailure) {
    status = "ineligible-hard-compat-failure";
    eligible = false;
  } else if (!artifact.available) {
    status = "ineligible-no-protected-artifact";
    eligible = false;
  } else if (!workerAvailable) {
    status = "ineligible-worker-unavailable";
    eligible = false;
  } else if (warnings.length) {
    status = "eligible-with-warnings";
  }

  return {
    kind: "protected-reader-eligibility-v1",
    status,
    eligible,
    warnings,
    bookId: route.bookId,
    artifactAvailable: artifact.available,
    artifactCheckUrl: artifact.checkedUrl,
    artifactStatus: artifact.status,
    workerAvailable,
    rolloutEnabled: rollout.rolloutEnabled,
    bookAllowed: rollout.bookAllowed,
    explicitProtectedRequest: rollout.explicitProtectedRequest,
    allowlisted: rollout.allowlisted,
    denylisted: rollout.denylisted,
    driveConfigured: !warnings.includes("drive-unconfigured"),
    hardCompatFailure
  };
}
