function normalizeIdList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter((value) => /^\d+$/.test(value))
  )];
}

export const PROTECTED_READER_ROLLOUT_CONFIG = {
  version: "internal-rollout-v1",
  globalEnabled: true,
  requireExplicitOptIn: true,
  internalOnly: true,
  allowAllBooks: false,
  allowBookIds: normalizeIdList(["19686", "45", "11", "84", "1342"]),
  denyBookIds: normalizeIdList([])
};

export function parseBookIdCsv(input) {
  return normalizeIdList(String(input || "").split(","));
}

export function normalizeRolloutConfig(input = {}) {
  return {
    version: String(input.version || PROTECTED_READER_ROLLOUT_CONFIG.version),
    globalEnabled: input.globalEnabled !== false,
    requireExplicitOptIn: input.requireExplicitOptIn !== false,
    internalOnly: input.internalOnly !== false,
    allowAllBooks: !!input.allowAllBooks,
    allowBookIds: normalizeIdList(input.allowBookIds || PROTECTED_READER_ROLLOUT_CONFIG.allowBookIds),
    denyBookIds: normalizeIdList(input.denyBookIds || PROTECTED_READER_ROLLOUT_CONFIG.denyBookIds)
  };
}
