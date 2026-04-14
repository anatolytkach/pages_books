# Phase 4 Bridge-to-Adapter Mapping

## Contract surface

| Bridge-shaped call | Direct adapter equivalent | Phase 4 status | Critical for Phase 4 |
|---|---|---|---|
| `getSummary` | `compatAdapter.getSummary` | implemented direct | yes |
| `getDebugLayoutState` | `compatAdapter.getDebugLayoutState` | implemented direct | yes |
| `nextPage` / `prevPage` | `compatAdapter.nextPage` / `compatAdapter.prevPage` | implemented direct | yes |
| `preparePageTurnPreviews` | `compatAdapter.preparePageTurnPreviews` | implemented direct | yes |
| `goToToc` | `compatAdapter.goToToc` | implemented direct | yes |
| `goToAnnotation` | `compatAdapter.goToAnnotation` | implemented direct | yes |
| `restoreFromToken` | `compatAdapter.restoreFromToken` | implemented direct | yes |
| `goToGlobalOffset` | `compatAdapter.goToGlobalOffset` | implemented direct | yes |
| `copySelection` | `compatAdapter.copySelection` | implemented direct | yes |
| `exportSelectionForUserAction` | `compatAdapter.exportSelectionForUserAction` | implemented direct | yes |
| `captureSelectionForUserAction` | `compatAdapter.captureSelectionForUserAction` | implemented direct | yes |
| `captureSelectionForNote` | `compatAdapter.captureSelectionForNote` | implemented direct | yes |
| `selectAutomationSample` | `compatAdapter.selectAutomationSample` | implemented direct | yes |
| `createHighlight` | `compatAdapter.createHighlight` | implemented direct | yes |
| `addNoteToSelection` | `compatAdapter.addNoteToSelection` | implemented direct | yes |
| `addNoteFromCapturedSelection` | `compatAdapter.addNoteFromCapturedSelection` | implemented direct | yes |
| `addNoteFromRangeDescriptor` | `compatAdapter.addNoteFromRangeDescriptor` | implemented direct | yes |
| `deleteAnnotation` | `compatAdapter.deleteAnnotation` | implemented direct | yes |
| `clearSelection` | `compatAdapter.clearSelection` | implemented direct | yes |
| `exportNotesSharePayload` | `compatAdapter.exportNotesSharePayload` | implemented direct | yes |
| `searchBook` | `compatAdapter.searchBook` | implemented direct | yes |
| `goToSearchResult` | `compatAdapter.goToSearchResult` | implemented direct | yes |
| `searchNextResult` / `searchPrevResult` | `compatAdapter.searchNextResult` / `compatAdapter.searchPrevResult` | implemented direct | yes |
| `clearSearch` | `compatAdapter.clearSearch` | implemented direct | yes |
| `getSearchResults` | `compatAdapter.getSearchResults` | implemented direct | yes |
| `getPageNumbersForGlobalOffsets` | `compatAdapter.getPageNumbersForGlobalOffsets` | implemented direct | no |
| `getReadAloudPayload` | `compatAdapter.getReadAloudPayload` | implemented direct | no |
| `setTheme` | `compatAdapter.setTheme` | implemented direct | yes |
| `setFontScale` | `compatAdapter.setFontScale` | implemented direct | yes |
| `setFontMode` | `compatAdapter.setFontMode` | implemented direct | yes |

## Still legacy bridge-backed or intentionally deferred

- iframe embedding lifecycle remains legacy
- host-side polling and summary consumption remain legacy
- bookmark UI flows remain host-owned and are not part of the bridge-shaped invoke surface
- transport removal is intentionally deferred to later phases
