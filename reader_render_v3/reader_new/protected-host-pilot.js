import {
  PROTECTED_READER_PILOT_CONFIG,
  normalizeProtectedReaderPilotConfig
} from "./protected-host-pilot-config.js";

export function resolveProtectedReaderPilot(
  route,
  rollout,
  eligibility,
  config = PROTECTED_READER_PILOT_CONFIG
) {
  const resolved = normalizeProtectedReaderPilotConfig(config);
  const bookId = String(route && route.bookId ? route.bookId : "");
  const userScope = String(
    route && route.query && (route.query.userScope || route.query.protectedUserScope)
      ? route.query.userScope || route.query.protectedUserScope
      : resolved.defaultPilotScope
  ).trim() || resolved.defaultPilotScope;
  const scopeAllowed = resolved.pilotScopes.includes(userScope);
  const blocked = resolved.blockedBookIds.includes(bookId);
  const pilotReadyBook = resolved.pilotBookIds.includes(bookId);
  const candidateBook = resolved.candidateBookIds.includes(bookId);

  let status = "not-pilot-book";
  let pilotCertified = false;
  let recommended = false;
  let warnings = [];

  if (blocked) {
    status = "pilot-blocked";
  } else if (!scopeAllowed) {
    status = "pilot-scope-not-allowed";
  } else if (pilotReadyBook && eligibility && eligibility.eligible) {
    status = "pilot-ready";
    pilotCertified = true;
    recommended = true;
  } else if (pilotReadyBook) {
    status = "pilot-configured-but-not-ready";
  } else if (candidateBook && eligibility && eligibility.eligible) {
    status = "candidate-ready-but-not-certified";
    warnings = ["candidate-not-yet-certified"];
  } else if (candidateBook) {
    status = "candidate-not-ready";
  }

  return {
    kind: "protected-reader-pilot-v1",
    version: resolved.version,
    label: resolved.label,
    internalOnly: resolved.internalOnly,
    bookId,
    userScope,
    scopeAllowed,
    blocked,
    pilotReadyBook,
    candidateBook,
    pilotCertified,
    recommended,
    status,
    warnings
  };
}
