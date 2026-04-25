function normalizeIdList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter((value) => /^\d+$/.test(value))
  )];
}

function normalizeStringList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )];
}

export const PROTECTED_READER_PILOT_CONFIG = {
  version: "internal-pilot-v1",
  label: "internal-pilot",
  internalOnly: true,
  pilotBookIds: normalizeIdList(["19686"]),
  candidateBookIds: normalizeIdList([]),
  blockedBookIds: normalizeIdList([]),
  pilotScopes: normalizeStringList(["default"]),
  defaultPilotScope: "default"
};

export function normalizeProtectedReaderPilotConfig(input = {}) {
  return {
    version: String(input.version || PROTECTED_READER_PILOT_CONFIG.version),
    label: String(input.label || PROTECTED_READER_PILOT_CONFIG.label),
    internalOnly: input.internalOnly !== false,
    pilotBookIds: normalizeIdList(input.pilotBookIds || PROTECTED_READER_PILOT_CONFIG.pilotBookIds),
    candidateBookIds: normalizeIdList(input.candidateBookIds || PROTECTED_READER_PILOT_CONFIG.candidateBookIds),
    blockedBookIds: normalizeIdList(input.blockedBookIds || PROTECTED_READER_PILOT_CONFIG.blockedBookIds),
    pilotScopes: normalizeStringList(input.pilotScopes || PROTECTED_READER_PILOT_CONFIG.pilotScopes),
    defaultPilotScope: String(input.defaultPilotScope || PROTECTED_READER_PILOT_CONFIG.defaultPilotScope)
  };
}
