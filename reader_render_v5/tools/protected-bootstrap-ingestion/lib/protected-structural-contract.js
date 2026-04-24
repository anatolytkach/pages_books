export const PROTECTED_V4_STRUCTURAL_PHASE2_VERSION = 1;
export const PROTECTED_V4_STRUCTURAL_PHASE2_SCOPE = "manual/1-structural-whitelist-v1";

export const PROTECTED_V4_STRUCTURAL_TEXT_ALIGN_VALUES = Object.freeze([
  "left",
  "center",
  "right",
  "justify"
]);

export const PROTECTED_V4_STRUCTURAL_INLINE_MARKS = Object.freeze([
  "em",
  "strong",
  "sup"
]);

export const PROTECTED_V4_STRUCTURAL_INLINE_ANCHOR_ROLES = Object.freeze([
  "inline-link",
  "footnote-ref"
]);

export const PROTECTED_V4_STRUCTURAL_INLINE_TARGET_ROLES = Object.freeze([
  "footnote"
]);

export const PROTECTED_V4_STRUCTURAL_BLOCK_ROLES = Object.freeze([
  "blockquote"
]);

export const PROTECTED_V4_STRUCTURAL_LIST_TYPES = Object.freeze([
  "ordered"
]);

export const PROTECTED_V4_STRUCTURAL_LIST_MARKER_STYLES = Object.freeze([
  "decimal"
]);

export const PROTECTED_V4_STRUCTURAL_BLOCKQUOTE_VARIANTS = Object.freeze([
  "basic-quote"
]);

export function buildPhase2StructuralContract() {
  return {
    version: PROTECTED_V4_STRUCTURAL_PHASE2_VERSION,
    scope: PROTECTED_V4_STRUCTURAL_PHASE2_SCOPE,
    headingLevelField: "headingLevel",
    blockRoleField: "blockRole",
    supportedBlockRoles: [...PROTECTED_V4_STRUCTURAL_BLOCK_ROLES],
    blockPresentationField: "blockPresentation",
    blockPresentation: {
      textIndentField: "textIndentEm",
      marginTopField: "marginTopEm",
      marginBottomField: "marginBottomEm",
      textAlignField: "textAlign",
      supportedTextAlign: [...PROTECTED_V4_STRUCTURAL_TEXT_ALIGN_VALUES],
      lineHeightField: "lineHeight"
    },
    inlineSemanticsField: "inlineSemantics",
    inlineSemantics: {
      paragraphsField: "paragraphs[]",
      runsField: "runs[]",
      textField: "text",
      marksField: "marks[]",
      supportedMarks: [...PROTECTED_V4_STRUCTURAL_INLINE_MARKS],
      anchorField: "anchor",
      anchor: {
        roleField: "anchorRole",
        supportedRoles: [...PROTECTED_V4_STRUCTURAL_INLINE_ANCHOR_ROLES],
        hrefField: "href",
        sourceAnchorIdField: "sourceAnchorId",
        targetSourceHrefField: "targetSourceHref",
        targetAnchorIdField: "targetAnchorId",
        targetRoleField: "targetRole",
        supportedTargetRoles: [...PROTECTED_V4_STRUCTURAL_INLINE_TARGET_ROLES]
      }
    },
    listContainerField: "listContainers[]",
    listContainerIdField: "containerId",
    supportedListTypes: [...PROTECTED_V4_STRUCTURAL_LIST_TYPES],
    supportedMarkerStyles: [...PROTECTED_V4_STRUCTURAL_LIST_MARKER_STYLES],
    listItemReferenceField: "itemBlockIds[]",
    blockquotePresentationField: "blockquotePresentation",
    blockquotePresentation: {
      variantField: "variant",
      supportedVariants: [...PROTECTED_V4_STRUCTURAL_BLOCKQUOTE_VARIANTS],
      suppressTextIndentField: "suppressTextIndent"
    }
  };
}

function validateStringField(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function isFiniteNonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validateOptionalNonNegativeNumber(value, label) {
  if (value == null) return;
  if (!isFiniteNonNegativeNumber(value)) {
    throw new Error(`${label} must be a non-negative number when present`);
  }
}

export function validatePhase2StructuralContract(contract) {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
    throw new Error("artifactContract.structuralPhase2 must be an object");
  }
  if (Number(contract.version) !== PROTECTED_V4_STRUCTURAL_PHASE2_VERSION) {
    throw new Error(`artifactContract.structuralPhase2.version must be ${PROTECTED_V4_STRUCTURAL_PHASE2_VERSION}`);
  }
  if (String(contract.scope || "") !== PROTECTED_V4_STRUCTURAL_PHASE2_SCOPE) {
    throw new Error(`artifactContract.structuralPhase2.scope must be ${PROTECTED_V4_STRUCTURAL_PHASE2_SCOPE}`);
  }
  if (String(contract.headingLevelField || "") !== "headingLevel") {
    throw new Error("artifactContract.structuralPhase2.headingLevelField must be headingLevel");
  }
  if (String(contract.blockRoleField || "") !== "blockRole") {
    throw new Error("artifactContract.structuralPhase2.blockRoleField must be blockRole");
  }
  const supportedBlockRoles = Array.isArray(contract.supportedBlockRoles) ? contract.supportedBlockRoles : [];
  if (
    supportedBlockRoles.length !== PROTECTED_V4_STRUCTURAL_BLOCK_ROLES.length ||
    supportedBlockRoles.some((role, index) => role !== PROTECTED_V4_STRUCTURAL_BLOCK_ROLES[index])
  ) {
    throw new Error("artifactContract.structuralPhase2.supportedBlockRoles is invalid");
  }
  if (String(contract.blockPresentationField || "") !== "blockPresentation") {
    throw new Error("artifactContract.structuralPhase2.blockPresentationField must be blockPresentation");
  }
  const blockPresentation = contract.blockPresentation && typeof contract.blockPresentation === "object" ? contract.blockPresentation : null;
  if (!blockPresentation) {
    throw new Error("artifactContract.structuralPhase2.blockPresentation is missing");
  }
  if (
    blockPresentation.textIndentField !== "textIndentEm" ||
    blockPresentation.marginTopField !== "marginTopEm" ||
    blockPresentation.marginBottomField !== "marginBottomEm" ||
    blockPresentation.textAlignField !== "textAlign" ||
    blockPresentation.lineHeightField !== "lineHeight"
  ) {
    throw new Error("artifactContract.structuralPhase2.blockPresentation field mapping is invalid");
  }
  const supportedTextAlign = Array.isArray(blockPresentation.supportedTextAlign) ? blockPresentation.supportedTextAlign : [];
  if (
    supportedTextAlign.length !== PROTECTED_V4_STRUCTURAL_TEXT_ALIGN_VALUES.length ||
    supportedTextAlign.some((value, index) => value !== PROTECTED_V4_STRUCTURAL_TEXT_ALIGN_VALUES[index])
  ) {
    throw new Error("artifactContract.structuralPhase2.blockPresentation.supportedTextAlign is invalid");
  }
  if (String(contract.inlineSemanticsField || "") !== "inlineSemantics") {
    throw new Error("artifactContract.structuralPhase2.inlineSemanticsField must be inlineSemantics");
  }
  const inlineSemantics = contract.inlineSemantics && typeof contract.inlineSemantics === "object" ? contract.inlineSemantics : null;
  if (!inlineSemantics) {
    throw new Error("artifactContract.structuralPhase2.inlineSemantics is missing");
  }
  if (
    inlineSemantics.paragraphsField !== "paragraphs[]" ||
    inlineSemantics.runsField !== "runs[]" ||
    inlineSemantics.textField !== "text" ||
    inlineSemantics.marksField !== "marks[]"
  ) {
    throw new Error("artifactContract.structuralPhase2.inlineSemantics field mapping is invalid");
  }
  const supportedMarks = Array.isArray(inlineSemantics.supportedMarks) ? inlineSemantics.supportedMarks : [];
  if (
    supportedMarks.length !== PROTECTED_V4_STRUCTURAL_INLINE_MARKS.length ||
    supportedMarks.some((value, index) => value !== PROTECTED_V4_STRUCTURAL_INLINE_MARKS[index])
  ) {
    throw new Error("artifactContract.structuralPhase2.inlineSemantics.supportedMarks is invalid");
  }
  if (String(inlineSemantics.anchorField || "") !== "anchor") {
    throw new Error("artifactContract.structuralPhase2.inlineSemantics.anchorField must be anchor");
  }
  const inlineAnchor = inlineSemantics.anchor && typeof inlineSemantics.anchor === "object" ? inlineSemantics.anchor : null;
  if (!inlineAnchor) {
    throw new Error("artifactContract.structuralPhase2.inlineSemantics.anchor is missing");
  }
  if (
    inlineAnchor.roleField !== "anchorRole" ||
    inlineAnchor.hrefField !== "href" ||
    inlineAnchor.sourceAnchorIdField !== "sourceAnchorId" ||
    inlineAnchor.targetSourceHrefField !== "targetSourceHref" ||
    inlineAnchor.targetAnchorIdField !== "targetAnchorId" ||
    inlineAnchor.targetRoleField !== "targetRole"
  ) {
    throw new Error("artifactContract.structuralPhase2.inlineSemantics.anchor field mapping is invalid");
  }
  const supportedAnchorRoles = Array.isArray(inlineAnchor.supportedRoles) ? inlineAnchor.supportedRoles : [];
  if (
    supportedAnchorRoles.length !== PROTECTED_V4_STRUCTURAL_INLINE_ANCHOR_ROLES.length ||
    supportedAnchorRoles.some((value, index) => value !== PROTECTED_V4_STRUCTURAL_INLINE_ANCHOR_ROLES[index])
  ) {
    throw new Error("artifactContract.structuralPhase2.inlineSemantics.anchor.supportedRoles is invalid");
  }
  const supportedTargetRoles = Array.isArray(inlineAnchor.supportedTargetRoles) ? inlineAnchor.supportedTargetRoles : [];
  if (
    supportedTargetRoles.length !== PROTECTED_V4_STRUCTURAL_INLINE_TARGET_ROLES.length ||
    supportedTargetRoles.some((value, index) => value !== PROTECTED_V4_STRUCTURAL_INLINE_TARGET_ROLES[index])
  ) {
    throw new Error("artifactContract.structuralPhase2.inlineSemantics.anchor.supportedTargetRoles is invalid");
  }
  if (String(contract.listContainerField || "") !== "listContainers[]") {
    throw new Error("artifactContract.structuralPhase2.listContainerField must be listContainers[]");
  }
  if (String(contract.listContainerIdField || "") !== "containerId") {
    throw new Error("artifactContract.structuralPhase2.listContainerIdField must be containerId");
  }
  const supportedListTypes = Array.isArray(contract.supportedListTypes) ? contract.supportedListTypes : [];
  if (
    supportedListTypes.length !== PROTECTED_V4_STRUCTURAL_LIST_TYPES.length ||
    supportedListTypes.some((value, index) => value !== PROTECTED_V4_STRUCTURAL_LIST_TYPES[index])
  ) {
    throw new Error("artifactContract.structuralPhase2.supportedListTypes is invalid");
  }
  const supportedMarkerStyles = Array.isArray(contract.supportedMarkerStyles) ? contract.supportedMarkerStyles : [];
  if (
    supportedMarkerStyles.length !== PROTECTED_V4_STRUCTURAL_LIST_MARKER_STYLES.length ||
    supportedMarkerStyles.some((value, index) => value !== PROTECTED_V4_STRUCTURAL_LIST_MARKER_STYLES[index])
  ) {
    throw new Error("artifactContract.structuralPhase2.supportedMarkerStyles is invalid");
  }
  if (String(contract.listItemReferenceField || "") !== "itemBlockIds[]") {
    throw new Error("artifactContract.structuralPhase2.listItemReferenceField must be itemBlockIds[]");
  }
  if (String(contract.blockquotePresentationField || "") !== "blockquotePresentation") {
    throw new Error("artifactContract.structuralPhase2.blockquotePresentationField must be blockquotePresentation");
  }
  const blockquotePresentation = contract.blockquotePresentation && typeof contract.blockquotePresentation === "object" ? contract.blockquotePresentation : null;
  if (!blockquotePresentation) {
    throw new Error("artifactContract.structuralPhase2.blockquotePresentation is missing");
  }
  if (
    blockquotePresentation.variantField !== "variant" ||
    blockquotePresentation.suppressTextIndentField !== "suppressTextIndent"
  ) {
    throw new Error("artifactContract.structuralPhase2.blockquotePresentation field mapping is invalid");
  }
  const supportedVariants = Array.isArray(blockquotePresentation.supportedVariants) ? blockquotePresentation.supportedVariants : [];
  if (
    supportedVariants.length !== PROTECTED_V4_STRUCTURAL_BLOCKQUOTE_VARIANTS.length ||
    supportedVariants.some((value, index) => value !== PROTECTED_V4_STRUCTURAL_BLOCKQUOTE_VARIANTS[index])
  ) {
    throw new Error("artifactContract.structuralPhase2.blockquotePresentation.supportedVariants is invalid");
  }
}

export function validateStructuralBlockShape(block, label) {
  if (!block || typeof block !== "object") return;
  if (block.headingLevel != null) {
    if (!Number.isInteger(block.headingLevel) || block.headingLevel < 1 || block.headingLevel > 6) {
      throw new Error(`${label}.headingLevel must be an integer between 1 and 6`);
    }
  }
  if (block.blockRole != null && block.blockRole !== "") {
    const normalizedRole = String(block.blockRole);
    if (normalizedRole === "blockquote") {
      if (!PROTECTED_V4_STRUCTURAL_BLOCK_ROLES.includes(normalizedRole)) {
        throw new Error(`${label}.blockRole is unsupported`);
      }
    } else if (block.blockquotePresentation) {
      throw new Error(`${label}.blockRole is unsupported`);
    }
  }
  const presentation = block.blockPresentation && typeof block.blockPresentation === "object" ? block.blockPresentation : null;
  if (presentation) {
    validateOptionalNonNegativeNumber(presentation.textIndentEm, `${label}.blockPresentation.textIndentEm`);
    validateOptionalNonNegativeNumber(presentation.marginTopEm, `${label}.blockPresentation.marginTopEm`);
    validateOptionalNonNegativeNumber(presentation.marginBottomEm, `${label}.blockPresentation.marginBottomEm`);
    validateOptionalNonNegativeNumber(presentation.lineHeight, `${label}.blockPresentation.lineHeight`);
    if (presentation.textAlign != null && presentation.textAlign !== "" && !PROTECTED_V4_STRUCTURAL_TEXT_ALIGN_VALUES.includes(String(presentation.textAlign))) {
      throw new Error(`${label}.blockPresentation.textAlign is unsupported`);
    }
  }
  const inlineSemantics = block.inlineSemantics && typeof block.inlineSemantics === "object" ? block.inlineSemantics : null;
  if (inlineSemantics) {
    const paragraphs = Array.isArray(inlineSemantics.paragraphs) ? inlineSemantics.paragraphs : [];
    if (!paragraphs.length) {
      throw new Error(`${label}.inlineSemantics.paragraphs must contain at least one paragraph`);
    }
    paragraphs.forEach((paragraph, paragraphIndex) => {
      if (!paragraph || typeof paragraph !== "object" || Array.isArray(paragraph)) {
        throw new Error(`${label}.inlineSemantics.paragraphs[${paragraphIndex}] must be an object`);
      }
      const runs = Array.isArray(paragraph.runs) ? paragraph.runs : [];
      if (!runs.length) {
        throw new Error(`${label}.inlineSemantics.paragraphs[${paragraphIndex}].runs must contain at least one run`);
      }
      runs.forEach((run, runIndex) => {
        if (!run || typeof run !== "object" || Array.isArray(run)) {
          throw new Error(`${label}.inlineSemantics.paragraphs[${paragraphIndex}].runs[${runIndex}] must be an object`);
        }
        validateStringField(run.text, `${label}.inlineSemantics.paragraphs[${paragraphIndex}].runs[${runIndex}].text`);
        const marks = Array.isArray(run.marks) ? run.marks : [];
        marks.forEach((mark, markIndex) => {
          if (!PROTECTED_V4_STRUCTURAL_INLINE_MARKS.includes(String(mark || ""))) {
            throw new Error(`${label}.inlineSemantics.paragraphs[${paragraphIndex}].runs[${runIndex}].marks[${markIndex}] is unsupported`);
          }
        });
        const anchor = run.anchor && typeof run.anchor === "object" ? run.anchor : null;
        if (anchor) {
          if (!PROTECTED_V4_STRUCTURAL_INLINE_ANCHOR_ROLES.includes(String(anchor.anchorRole || ""))) {
            throw new Error(`${label}.inlineSemantics.paragraphs[${paragraphIndex}].runs[${runIndex}].anchor.anchorRole is unsupported`);
          }
          validateStringField(anchor.href, `${label}.inlineSemantics.paragraphs[${paragraphIndex}].runs[${runIndex}].anchor.href`);
          if (anchor.sourceAnchorId != null && (typeof anchor.sourceAnchorId !== "string" || !anchor.sourceAnchorId.trim())) {
            throw new Error(`${label}.inlineSemantics.paragraphs[${paragraphIndex}].runs[${runIndex}].anchor.sourceAnchorId must be a non-empty string when present`);
          }
          if (anchor.targetSourceHref != null && (typeof anchor.targetSourceHref !== "string" || !anchor.targetSourceHref.trim())) {
            throw new Error(`${label}.inlineSemantics.paragraphs[${paragraphIndex}].runs[${runIndex}].anchor.targetSourceHref must be a non-empty string when present`);
          }
          if (anchor.targetAnchorId != null && (typeof anchor.targetAnchorId !== "string" || !anchor.targetAnchorId.trim())) {
            throw new Error(`${label}.inlineSemantics.paragraphs[${paragraphIndex}].runs[${runIndex}].anchor.targetAnchorId must be a non-empty string when present`);
          }
          if (anchor.targetRole != null && anchor.targetRole !== "" && !PROTECTED_V4_STRUCTURAL_INLINE_TARGET_ROLES.includes(String(anchor.targetRole))) {
            throw new Error(`${label}.inlineSemantics.paragraphs[${paragraphIndex}].runs[${runIndex}].anchor.targetRole is unsupported`);
          }
        }
      });
    });
  }
  const blockquotePresentation = block.blockquotePresentation && typeof block.blockquotePresentation === "object" ? block.blockquotePresentation : null;
  if (blockquotePresentation) {
    if (!PROTECTED_V4_STRUCTURAL_BLOCKQUOTE_VARIANTS.includes(String(blockquotePresentation.variant || ""))) {
      throw new Error(`${label}.blockquotePresentation.variant is unsupported`);
    }
    if (
      blockquotePresentation.suppressTextIndent != null &&
      typeof blockquotePresentation.suppressTextIndent !== "boolean"
    ) {
      throw new Error(`${label}.blockquotePresentation.suppressTextIndent must be a boolean when present`);
    }
  }
}

export function validateListContainerShape(container, label) {
  if (!container || typeof container !== "object" || Array.isArray(container)) {
    throw new Error(`${label} must be an object`);
  }
  validateStringField(container.containerId, `${label}.containerId`);
  if (!PROTECTED_V4_STRUCTURAL_LIST_TYPES.includes(String(container.listType || ""))) {
    throw new Error(`${label}.listType is unsupported`);
  }
  if (!PROTECTED_V4_STRUCTURAL_LIST_MARKER_STYLES.includes(String(container.markerStyle || ""))) {
    throw new Error(`${label}.markerStyle is unsupported`);
  }
  validateOptionalNonNegativeNumber(container.start, `${label}.start`);
  if (container.sourceHref != null && (typeof container.sourceHref !== "string" || !container.sourceHref.trim())) {
    throw new Error(`${label}.sourceHref must be a non-empty string when present`);
  }
  const itemBlockIds = Array.isArray(container.itemBlockIds) ? container.itemBlockIds : [];
  if (!itemBlockIds.length) {
    throw new Error(`${label}.itemBlockIds must contain at least one block reference`);
  }
  itemBlockIds.forEach((itemBlockId, index) => {
    validateStringField(itemBlockId, `${label}.itemBlockIds[${index}]`);
  });
}
