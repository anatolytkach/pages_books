import {
  PROTECTED_READER_ROLLOUT_CONFIG,
  normalizeRolloutConfig,
  parseBookIdCsv
} from "./protected-reader-rollout-config.js";

function boolFromQuery(value, fallback = null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(normalized)) return false;
  return fallback;
}

export function resolveProtectedReaderRollout(route, config = PROTECTED_READER_ROLLOUT_CONFIG) {
  const resolved = normalizeRolloutConfig(config);
  const query = route && route.query ? route.query : {};
  const explicitProtectedRequest = !!(route && route.explicitProtectedRequest);
  const queryGlobalOverride = boolFromQuery(query.protectedRollout, null);
  const queryAllowAll = boolFromQuery(query.protectedAllowAll, null);
  const queryAllowList = parseBookIdCsv(query.protectedBooks || "");
  const queryDenyList = parseBookIdCsv(query.protectedDenyBooks || "");
  const globalEnabled = queryGlobalOverride == null ? resolved.globalEnabled : queryGlobalOverride;
  const allowAllBooks = queryAllowAll == null ? resolved.allowAllBooks : queryAllowAll;
  const allowBookIds = queryAllowList.length ? queryAllowList : resolved.allowBookIds;
  const denyBookIds = queryDenyList.length ? queryDenyList : resolved.denyBookIds;
  const bookId = route && route.bookId ? String(route.bookId) : "";
  const denylisted = denyBookIds.includes(bookId);
  const allowlisted = allowAllBooks || allowBookIds.includes(bookId);
  const bookAllowed = !denylisted && allowlisted;

  return {
    kind: "protected-reader-rollout-v1",
    configVersion: resolved.version,
    explicitProtectedRequest,
    globalEnabled,
    requireExplicitOptIn: resolved.requireExplicitOptIn,
    internalOnly: resolved.internalOnly,
    allowAllBooks,
    allowBookIds,
    denyBookIds,
    allowlisted,
    denylisted,
    bookAllowed,
    rolloutEnabled: globalEnabled && (!resolved.requireExplicitOptIn || explicitProtectedRequest)
  };
}
