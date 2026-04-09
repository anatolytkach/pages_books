function withFallbackReason(oldReaderUrl, reason, baseUrl = "http://127.0.0.1") {
  const url = new URL(oldReaderUrl, baseUrl);
  url.searchParams.set("protectedFallbackReason", reason);
  url.searchParams.set("protectedRequested", "1");
  return `${url.pathname}${url.search}${url.hash}`;
}

function statusMessage(status) {
  switch (status) {
    case "eligible":
      return "Protected mode allowed for this book.";
    case "eligible-with-warnings":
      return "Protected mode allowed with rollout warnings.";
    case "ineligible-no-protected-artifact":
      return "Protected mode unavailable for this book because no protected artifact is available.";
    case "ineligible-worker-unavailable":
      return "Protected mode is unavailable in this environment.";
    case "ineligible-rollout-disabled":
      return "Protected mode is disabled by rollout policy.";
    case "ineligible-book-not-allowed":
      return "Protected mode is not enabled for this book.";
    case "ineligible-hard-compat-failure":
      return "Protected mode is blocked by a hard compatibility failure.";
    default:
      return "Protected mode is unavailable.";
  }
}

export function buildProtectedReaderStatus(route, rollout, eligibility, pilot = null) {
  const status = eligibility.status;
  let action = "open-protected-reader";
  let fallbackUrl = "";
  if (status === "ineligible-worker-unavailable") {
    action = "protected-unavailable-show-message";
  } else if (!eligibility.eligible) {
    action = "redirect-to-old-reader-with-reason";
    fallbackUrl = withFallbackReason(route.oldReaderUrl, status, route.url || "http://127.0.0.1");
  }
  return {
    kind: "protected-reader-status-v1",
    action,
    status,
    message: statusMessage(status),
    fallbackReason: eligibility.eligible ? "" : status,
    fallbackUrl,
    rolloutEnabled: rollout.rolloutEnabled,
    explicitProtectedRequest: rollout.explicitProtectedRequest,
    bookAllowed: rollout.bookAllowed,
    allowlisted: rollout.allowlisted,
    denylisted: rollout.denylisted,
    artifactAvailable: eligibility.artifactAvailable,
    workerAvailable: eligibility.workerAvailable,
    driveConfigured: eligibility.driveConfigured,
    warnings: eligibility.warnings || [],
    pilotStatus: pilot && pilot.status ? pilot.status : "none",
    pilotCertified: !!(pilot && pilot.pilotCertified),
    pilotRecommended: !!(pilot && pilot.recommended)
  };
}
