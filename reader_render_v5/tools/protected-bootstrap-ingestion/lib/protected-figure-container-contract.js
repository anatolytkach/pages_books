export const PROTECTED_V4_FIGURE_CONTAINER_PHASE3_VERSION = 1;
export const PROTECTED_V4_FIGURE_CONTAINER_PHASE3_SCOPE = "manual/1-figure-like-whitelist-v1";

export const PROTECTED_V4_FIGURE_CONTAINER_TYPES = Object.freeze([
  "figure"
]);

export const PROTECTED_V4_FIGURE_MEMBER_ROLES = Object.freeze([
  "lead-text",
  "image"
]);

export function buildPhase3FigureContainerContract() {
  return {
    version: PROTECTED_V4_FIGURE_CONTAINER_PHASE3_VERSION,
    scope: PROTECTED_V4_FIGURE_CONTAINER_PHASE3_SCOPE,
    containerField: "figureContainers[]",
    containerIdField: "containerId",
    supportedContainerTypes: [...PROTECTED_V4_FIGURE_CONTAINER_TYPES],
    memberField: "members[]",
    memberRoleField: "memberRole",
    supportedMemberRoles: [...PROTECTED_V4_FIGURE_MEMBER_ROLES],
    memberReferences: {
      leadTextBlockField: "blockId",
      imageBlockField: "mediaBlockId",
      imageMediaField: "mediaId"
    },
    boundaryHints: {
      breakBeforeField: "breakBefore"
    }
  };
}

function validateStringField(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

export function validatePhase3FigureContainerContract(contract) {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
    throw new Error("artifactContract.figureContainerPhase3 must be an object");
  }
  if (Number(contract.version) !== PROTECTED_V4_FIGURE_CONTAINER_PHASE3_VERSION) {
    throw new Error(`artifactContract.figureContainerPhase3.version must be ${PROTECTED_V4_FIGURE_CONTAINER_PHASE3_VERSION}`);
  }
  if (String(contract.scope || "") !== PROTECTED_V4_FIGURE_CONTAINER_PHASE3_SCOPE) {
    throw new Error(`artifactContract.figureContainerPhase3.scope must be ${PROTECTED_V4_FIGURE_CONTAINER_PHASE3_SCOPE}`);
  }
  if (String(contract.containerField || "") !== "figureContainers[]") {
    throw new Error("artifactContract.figureContainerPhase3.containerField must be figureContainers[]");
  }
  if (String(contract.containerIdField || "") !== "containerId") {
    throw new Error("artifactContract.figureContainerPhase3.containerIdField must be containerId");
  }
  const types = Array.isArray(contract.supportedContainerTypes) ? contract.supportedContainerTypes : [];
  if (
    types.length !== PROTECTED_V4_FIGURE_CONTAINER_TYPES.length ||
    types.some((type, index) => type !== PROTECTED_V4_FIGURE_CONTAINER_TYPES[index])
  ) {
    throw new Error("artifactContract.figureContainerPhase3.supportedContainerTypes is invalid");
  }
  if (String(contract.memberField || "") !== "members[]") {
    throw new Error("artifactContract.figureContainerPhase3.memberField must be members[]");
  }
  if (String(contract.memberRoleField || "") !== "memberRole") {
    throw new Error("artifactContract.figureContainerPhase3.memberRoleField must be memberRole");
  }
  const memberRoles = Array.isArray(contract.supportedMemberRoles) ? contract.supportedMemberRoles : [];
  if (
    memberRoles.length !== PROTECTED_V4_FIGURE_MEMBER_ROLES.length ||
    memberRoles.some((role, index) => role !== PROTECTED_V4_FIGURE_MEMBER_ROLES[index])
  ) {
    throw new Error("artifactContract.figureContainerPhase3.supportedMemberRoles is invalid");
  }
  const refs = contract.memberReferences && typeof contract.memberReferences === "object" ? contract.memberReferences : null;
  if (!refs) {
    throw new Error("artifactContract.figureContainerPhase3.memberReferences is missing");
  }
  if (refs.leadTextBlockField !== "blockId" || refs.imageBlockField !== "mediaBlockId" || refs.imageMediaField !== "mediaId") {
    throw new Error("artifactContract.figureContainerPhase3.memberReferences is invalid");
  }
  const boundaryHints = contract.boundaryHints && typeof contract.boundaryHints === "object" ? contract.boundaryHints : null;
  if (!boundaryHints || boundaryHints.breakBeforeField !== "breakBefore") {
    throw new Error("artifactContract.figureContainerPhase3.boundaryHints.breakBeforeField must be breakBefore");
  }
}

export function validateFigureContainerShape(container, label) {
  if (!container || typeof container !== "object" || Array.isArray(container)) {
    throw new Error(`${label} must be an object`);
  }
  validateStringField(container.containerId, `${label}.containerId`);
  if (container.containerType !== "figure") {
    throw new Error(`${label}.containerType must be figure`);
  }
  if (container.sourceHref != null && (typeof container.sourceHref !== "string" || !container.sourceHref.trim())) {
    throw new Error(`${label}.sourceHref must be a non-empty string when present`);
  }
  if (container.breakBefore != null && typeof container.breakBefore !== "boolean") {
    throw new Error(`${label}.breakBefore must be a boolean when present`);
  }
  const members = Array.isArray(container.members) ? container.members : [];
  if (!members.length) {
    throw new Error(`${label}.members must contain at least one entry`);
  }
  members.forEach((member, index) => {
    const memberLabel = `${label}.members[${index}]`;
    if (!member || typeof member !== "object" || Array.isArray(member)) {
      throw new Error(`${memberLabel} must be an object`);
    }
    validateStringField(member.memberId, `${memberLabel}.memberId`);
    if (!PROTECTED_V4_FIGURE_MEMBER_ROLES.includes(String(member.memberRole || ""))) {
      throw new Error(`${memberLabel}.memberRole is unsupported`);
    }
    if (member.memberRole === "lead-text") {
      validateStringField(member.blockId, `${memberLabel}.blockId`);
      if (member.mediaBlockId != null || member.mediaId != null) {
        throw new Error(`${memberLabel} lead-text member cannot use mediaBlockId/mediaId`);
      }
      return;
    }
    validateStringField(member.mediaBlockId, `${memberLabel}.mediaBlockId`);
    if (member.mediaId != null) {
      validateStringField(member.mediaId, `${memberLabel}.mediaId`);
    }
    if (member.blockId != null) {
      throw new Error(`${memberLabel} image member cannot use blockId`);
    }
  });
}
