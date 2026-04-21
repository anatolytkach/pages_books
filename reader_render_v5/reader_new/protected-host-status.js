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
    case "ineligible-hard-blocked":
      return "Protected mode is blocked by a hard protected-reader guard.";
    default:
      return "Protected mode is unavailable.";
  }
}

export function buildProtectedReaderStatus(route, rollout, eligibility, pilot = null) {
  const status = eligibility.status;
  let action = "open-protected-reader";
  if (status === "ineligible-worker-unavailable" || !eligibility.eligible) {
    action = "protected-unavailable-show-message";
  }
  return {
    kind: "protected-reader-status-v1",
    action,
    status,
    message: statusMessage(status),
    unavailableReason: eligibility.eligible ? "" : status,
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
