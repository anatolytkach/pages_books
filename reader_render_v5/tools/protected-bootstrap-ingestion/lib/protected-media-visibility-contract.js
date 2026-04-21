export const PROTECTED_V4_MEDIA_VISIBILITY_PHASE1_VERSION = 1;
export const PROTECTED_V4_MEDIA_VISIBILITY_PHASE1_SCOPE = "manual/1-media-whitelist-v1";

export const PROTECTED_V4_MEDIA_VISIBILITY_ROLES = Object.freeze([
  "shell-cover",
  "content-cover",
  "inline-avatar",
  "content-image",
  "separator-image"
]);

export const PROTECTED_V4_MEDIA_VISIBILITY_PLACEMENTS = Object.freeze([
  "inline-avatar",
  "inline",
  "block"
]);

export function buildPhase1MediaVisibilityContract() {
  return {
    version: PROTECTED_V4_MEDIA_VISIBILITY_PHASE1_VERSION,
    scope: PROTECTED_V4_MEDIA_VISIBILITY_PHASE1_SCOPE,
    whitelistRoles: [...PROTECTED_V4_MEDIA_VISIBILITY_ROLES],
    manifestCoverField: "cover",
    mediaItemField: "logicalBlockList[].mediaItems[]",
    geometry: {
      intrinsic: {
        widthField: "intrinsicWidthPx",
        heightField: "intrinsicHeightPx"
      },
      preferredRender: {
        widthField: "preferredRenderWidthPx",
        heightField: "preferredRenderHeightPx"
      }
    },
    placement: {
      field: "placement",
      supportedValues: [...PROTECTED_V4_MEDIA_VISIBILITY_PLACEMENTS]
    },
    sourceAnchor: {
      field: "sourceAnchor",
      sourceTextHrefField: "sourceTextHref",
      nodeTagField: "nodeTag",
      htmlOffsetField: "htmlOffset",
      classNameField: "className"
    },
    hostSourceAnchor: {
      field: "hostSourceAnchor",
      sourceTextHrefField: "sourceTextHref",
      nodeTagField: "nodeTag",
      nodeIndexField: "nodeIndex",
      classNameField: "className"
    }
  };
}

function isFiniteNonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validateOptionalGeometryPair(target, widthField, heightField, label) {
  if (!target || typeof target !== "object") return;
  const hasWidth = Object.prototype.hasOwnProperty.call(target, widthField);
  const hasHeight = Object.prototype.hasOwnProperty.call(target, heightField);
  if (!hasWidth && !hasHeight) return;
  if (!hasWidth || !hasHeight) {
    throw new Error(`${label} must include both ${widthField} and ${heightField}`);
  }
  if (!isFiniteNonNegativeNumber(target[widthField]) || !isFiniteNonNegativeNumber(target[heightField])) {
    throw new Error(`${label} has invalid ${widthField}/${heightField}`);
  }
}

function validateMediaRole(role, label) {
  if (role == null || role === "") return;
  if (!PROTECTED_V4_MEDIA_VISIBILITY_ROLES.includes(String(role))) {
    throw new Error(`${label} has unsupported mediaRole ${role}`);
  }
}

function validatePlacement(placement, label) {
  if (placement == null || placement === "") return;
  if (!PROTECTED_V4_MEDIA_VISIBILITY_PLACEMENTS.includes(String(placement))) {
    throw new Error(`${label} has unsupported placement ${placement}`);
  }
}

function validateSourceAnchor(anchor, label) {
  if (!anchor || typeof anchor !== "object" || Array.isArray(anchor)) {
    throw new Error(`${label} must be an object`);
  }
  if (typeof anchor.sourceTextHref !== "string" || !anchor.sourceTextHref.trim()) {
    throw new Error(`${label}.sourceTextHref must be a non-empty string`);
  }
  if (typeof anchor.nodeTag !== "string" || !anchor.nodeTag.trim()) {
    throw new Error(`${label}.nodeTag must be a non-empty string`);
  }
  if (!isFiniteNonNegativeNumber(anchor.htmlOffset)) {
    throw new Error(`${label}.htmlOffset must be a non-negative number`);
  }
  if (anchor.className != null && typeof anchor.className !== "string") {
    throw new Error(`${label}.className must be a string when present`);
  }
}

function validateHostSourceAnchor(anchor, label) {
  if (!anchor || typeof anchor !== "object" || Array.isArray(anchor)) {
    throw new Error(`${label} must be an object`);
  }
  if (typeof anchor.sourceTextHref !== "string" || !anchor.sourceTextHref.trim()) {
    throw new Error(`${label}.sourceTextHref must be a non-empty string`);
  }
  if (typeof anchor.nodeTag !== "string" || !anchor.nodeTag.trim()) {
    throw new Error(`${label}.nodeTag must be a non-empty string`);
  }
  if (!Number.isInteger(anchor.nodeIndex) || anchor.nodeIndex < 0) {
    throw new Error(`${label}.nodeIndex must be a non-negative integer`);
  }
  if (anchor.className != null && typeof anchor.className !== "string") {
    throw new Error(`${label}.className must be a string when present`);
  }
}

export function validateManifestCover(cover) {
  if (cover == null) return;
  if (!cover || typeof cover !== "object" || Array.isArray(cover)) {
    throw new Error("manifest.cover must be null or an object");
  }
  validateMediaRole(cover.mediaRole, "manifest.cover");
  if (cover.mediaRole && cover.mediaRole !== "shell-cover") {
    throw new Error(`manifest.cover must use mediaRole shell-cover, got ${cover.mediaRole}`);
  }
  if (cover.resolvedHref != null && typeof cover.resolvedHref !== "string") {
    throw new Error("manifest.cover.resolvedHref must be a string when present");
  }
  if (cover.sourceHref != null && typeof cover.sourceHref !== "string") {
    throw new Error("manifest.cover.sourceHref must be a string when present");
  }
  validateOptionalGeometryPair(cover, "intrinsicWidthPx", "intrinsicHeightPx", "manifest.cover");
  validateOptionalGeometryPair(cover, "preferredRenderWidthPx", "preferredRenderHeightPx", "manifest.cover");
  validatePlacement(cover.placement, "manifest.cover");
}

export function validateMediaItemVisibilityShape(mediaItem, label) {
  if (!mediaItem || typeof mediaItem !== "object") return;
  validateMediaRole(mediaItem.mediaRole, label);
  validateOptionalGeometryPair(mediaItem, "intrinsicWidthPx", "intrinsicHeightPx", label);
  validateOptionalGeometryPair(mediaItem, "preferredRenderWidthPx", "preferredRenderHeightPx", label);
  validatePlacement(mediaItem.placement, label);
  if (String(mediaItem.mediaRole || "") === "inline-avatar") {
    validateSourceAnchor(mediaItem.sourceAnchor, `${label}.sourceAnchor`);
    validateHostSourceAnchor(mediaItem.hostSourceAnchor, `${label}.hostSourceAnchor`);
    if (String(mediaItem.sourceAnchor.nodeTag || "").trim().toLowerCase() !== "img") {
      throw new Error(`${label}.sourceAnchor.nodeTag must be img for inline-avatar`);
    }
    if (String(mediaItem.hostSourceAnchor.nodeTag || "").trim().toLowerCase() === "img") {
      throw new Error(`${label}.hostSourceAnchor.nodeTag must point to the host text node, not img`);
    }
  }
}

export function validatePhase1MediaVisibilityContract(contract) {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
    throw new Error("artifactContract.mediaVisibilityPhase1 must be an object");
  }
  if (Number(contract.version) !== PROTECTED_V4_MEDIA_VISIBILITY_PHASE1_VERSION) {
    throw new Error(`artifactContract.mediaVisibilityPhase1.version must be ${PROTECTED_V4_MEDIA_VISIBILITY_PHASE1_VERSION}`);
  }
  if (String(contract.scope || "") !== PROTECTED_V4_MEDIA_VISIBILITY_PHASE1_SCOPE) {
    throw new Error(`artifactContract.mediaVisibilityPhase1.scope must be ${PROTECTED_V4_MEDIA_VISIBILITY_PHASE1_SCOPE}`);
  }
  const whitelistRoles = Array.isArray(contract.whitelistRoles) ? contract.whitelistRoles : [];
  if (
    whitelistRoles.length !== PROTECTED_V4_MEDIA_VISIBILITY_ROLES.length ||
    whitelistRoles.some((role, index) => role !== PROTECTED_V4_MEDIA_VISIBILITY_ROLES[index])
  ) {
    throw new Error("artifactContract.mediaVisibilityPhase1.whitelistRoles does not match the supported whitelist");
  }
  if (String(contract.manifestCoverField || "") !== "cover") {
    throw new Error("artifactContract.mediaVisibilityPhase1.manifestCoverField must be cover");
  }
  if (String(contract.mediaItemField || "") !== "logicalBlockList[].mediaItems[]") {
    throw new Error("artifactContract.mediaVisibilityPhase1.mediaItemField must be logicalBlockList[].mediaItems[]");
  }
  const geometry = contract.geometry && typeof contract.geometry === "object" ? contract.geometry : null;
  if (!geometry || !geometry.intrinsic || !geometry.preferredRender) {
    throw new Error("artifactContract.mediaVisibilityPhase1.geometry is incomplete");
  }
  if (geometry.intrinsic.widthField !== "intrinsicWidthPx" || geometry.intrinsic.heightField !== "intrinsicHeightPx") {
    throw new Error("artifactContract.mediaVisibilityPhase1.geometry.intrinsic fields are invalid");
  }
  if (
    geometry.preferredRender.widthField !== "preferredRenderWidthPx" ||
    geometry.preferredRender.heightField !== "preferredRenderHeightPx"
  ) {
    throw new Error("artifactContract.mediaVisibilityPhase1.geometry.preferredRender fields are invalid");
  }
  const placement = contract.placement && typeof contract.placement === "object" ? contract.placement : null;
  if (!placement || placement.field !== "placement") {
    throw new Error("artifactContract.mediaVisibilityPhase1.placement.field must be placement");
  }
  const supportedValues = Array.isArray(placement.supportedValues) ? placement.supportedValues : [];
  if (
    supportedValues.length !== PROTECTED_V4_MEDIA_VISIBILITY_PLACEMENTS.length ||
    supportedValues.some((value, index) => value !== PROTECTED_V4_MEDIA_VISIBILITY_PLACEMENTS[index])
  ) {
    throw new Error("artifactContract.mediaVisibilityPhase1.placement.supportedValues is invalid");
  }
  const sourceAnchor = contract.sourceAnchor && typeof contract.sourceAnchor === "object" ? contract.sourceAnchor : null;
  if (
    !sourceAnchor ||
    sourceAnchor.field !== "sourceAnchor" ||
    sourceAnchor.sourceTextHrefField !== "sourceTextHref" ||
    sourceAnchor.nodeTagField !== "nodeTag" ||
    sourceAnchor.htmlOffsetField !== "htmlOffset" ||
    sourceAnchor.classNameField !== "className"
  ) {
    throw new Error("artifactContract.mediaVisibilityPhase1.sourceAnchor mapping is invalid");
  }
  const hostSourceAnchor = contract.hostSourceAnchor && typeof contract.hostSourceAnchor === "object" ? contract.hostSourceAnchor : null;
  if (
    !hostSourceAnchor ||
    hostSourceAnchor.field !== "hostSourceAnchor" ||
    hostSourceAnchor.sourceTextHrefField !== "sourceTextHref" ||
    hostSourceAnchor.nodeTagField !== "nodeTag" ||
    hostSourceAnchor.nodeIndexField !== "nodeIndex" ||
    hostSourceAnchor.classNameField !== "className"
  ) {
    throw new Error("artifactContract.mediaVisibilityPhase1.hostSourceAnchor mapping is invalid");
  }
}
