export const PROTECTED_V4_BOOTSTRAP_MANIFEST_VERSION = 1;
export const PROTECTED_V4_BOOTSTRAP_CONTRACT_KIND = "protected-v4-bootstrap-v1";

import { buildPhase1MediaVisibilityContract } from "./protected-media-visibility-contract.js";
import { buildPhase2StructuralContract } from "./protected-structural-contract.js";
import { buildPhase3FigureContainerContract } from "./protected-figure-container-contract.js";

export function buildProtectedManifest({
  bookId,
  title,
  cover = null,
  publicRootPath = "",
  logicalBlockList = [],
  typographyStyles = null,
  listContainers = [],
  figureContainers = []
}) {
  const normalizedBookId = String(bookId || "").trim();
  const normalizedTitle = String(title || normalizedBookId || "Untitled v4 book").trim();

  if (!normalizedBookId) {
    throw new Error("buildProtectedManifest requires a bookId");
  }

  return {
    version: PROTECTED_V4_BOOTSTRAP_MANIFEST_VERSION,
    mode: "protected-v4-bootstrap",
    artifactContract: {
      kind: PROTECTED_V4_BOOTSTRAP_CONTRACT_KIND,
      mediaVisibilityPhase1: buildPhase1MediaVisibilityContract(),
      structuralPhase2: buildPhase2StructuralContract(),
      figureContainerPhase3: buildPhase3FigureContainerContract()
    },
    cover: null,
    metadata: {
      title: normalizedTitle
    },
    source: {
      bookId: normalizedBookId,
      publicRootPath: String(publicRootPath || "").trim()
    },
    cover,
    logicalBlockList: Array.isArray(logicalBlockList) ? logicalBlockList : [],
    typographyStyles: typographyStyles && typeof typographyStyles === "object" ? typographyStyles : null,
    listContainers: Array.isArray(listContainers) ? listContainers : [],
    figureContainers: Array.isArray(figureContainers) ? figureContainers : []
  };
}
