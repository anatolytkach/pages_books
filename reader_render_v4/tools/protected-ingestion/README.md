# Protected Ingestion v4

This is the isolated bootstrap ingestion surface for the `reader_render_v4`
contour.

Iteration 1 scope is intentionally narrow:

- write a minimal `v4` manifest artifact
- validate that manifest shape
- keep `v4` completely separate from `reader_render_v3`
- define only the Phase 1 media-visibility contract foundation for `manual/1`

Bootstrap artifact contract:

- manifest version: `1`
- contract kind: `protected-v4-bootstrap-v1`
- URL root used by the `v4` reader: `/books/protected-content-v4/<bookId>/`

## Phase 1 Media Visibility Contract

The `v4` bootstrap manifest now reserves a minimal media-visibility contract
for the whitelist of media semantics confirmed in `manual/1`. This is a narrow
schema foundation only. It is not a general EPUB media model.

Whitelisted media roles:

- `shell-cover`
- `content-cover`
- `inline-avatar`
- `content-image`
- `separator-image`

Minimal Phase 1 fields:

- `manifest.cover`
  - reserved location for shell-cover metadata
  - `null` when no canonical cover is known
- `logicalBlockList[].mediaItems[].mediaRole`
  - one of the whitelist roles above
- `logicalBlockList[].mediaItems[].intrinsicWidthPx`
- `logicalBlockList[].mediaItems[].intrinsicHeightPx`
  - intrinsic geometry
- `logicalBlockList[].mediaItems[].preferredRenderWidthPx`
- `logicalBlockList[].mediaItems[].preferredRenderHeightPx`
  - preferred render geometry
  - schema-only at this phase
- `logicalBlockList[].mediaItems[].placement`
  - supported values: `inline-avatar`, `inline`, `block`

The whitelist contract definition is written to:

- `manifest.json` as `artifactContract.mediaVisibilityPhase1`
- `manifest.json` as top-level `cover`

This step does not yet implement:

- general media extraction
- intrinsic geometry probing for non-cover images
- preferred render geometry derivation beyond the canonical shell cover
- media rendering in the `v4` reader

Build example:

```bash
npm --prefix reader_render_v4 run protected:build -- --input books/content/manual/1 --book-id 1 --title "Bootstrap Book" --output artifacts/protected-books/1
```

Validate example:

```bash
npm --prefix reader_render_v4 run protected:validate -- --input artifacts/protected-books/1
```

Phase 1 / P1-S2 adds a narrow shell-cover slice:

- if `EPUB/text/cover.xhtml` can be resolved canonically, `manifest.cover` is populated
- `manifest.source.publicRootPath` is written when the input lives under `books/content/`
- the `v4` host resolves shell cover from `manifest.cover` before consulting query `cover=`

Phase 1 / P1-S3 keeps intrinsic geometry extraction narrow:

- for the canonical shell cover, intrinsic dimensions are probed from the asset file itself first
- if probing fails, the XHTML `width` / `height` attributes are used as an explicit fallback
- if neither source is reliable, the intrinsic fields are left unset

Phase 1 / P1-S4 keeps preferred render + placement semantics equally narrow:

- for the canonical shell cover, preferred render geometry comes from explicit `cover.xhtml` image dimensions first
- if explicit cover dimensions are unavailable, preferred render geometry falls back to intrinsic dimensions
- shell cover `placement` is always `block`, because the current `v4` path extracts it only from the dedicated cover-page object
- `mediaRole` is filled only for this canonical cover path as `shell-cover`

The first non-cover media ingestion pass stays narrow as well:

- `inline-avatar`
  - extracted only from `<img class="inline-avatar" ...>`
  - `mediaRole: "inline-avatar"`
  - `placement: "inline-avatar"`
  - intrinsic geometry comes from the asset file
  - preferred render geometry is written only when explicit absolute width and height can be read reliably from the tag
- `content-image`
  - extracted only from `p.image-block > img`
  - `mediaRole: "content-image"`
  - `placement: "block"` for this narrow `image-block` path
  - intrinsic geometry comes from the asset file
  - preferred render geometry is written only when explicit absolute width and height can be derived reliably from the tag
- `separator-image`
  - extracted only from the narrow image-only heading pattern `h2 > img`
  - `mediaRole: "separator-image"`
  - `placement: "block"` for this dedicated separator-heading path
  - intrinsic geometry comes from the asset file
  - preferred render geometry is written only when explicit absolute width and height can be derived reliably from the tag

This pass does not yet attempt:

- figure/container semantics
- exhaustive image extraction across all XHTML patterns

## Phase 2 Structural Contract Foundation

The `v4` bootstrap manifest now also reserves a narrow structural contract for
the structural semantics actually present in `manual/1`. This is a whitelist
contract only. It is not a universal block model.

The contract is written to:

- `manifest.json` as `artifactContract.structuralPhase2`
- `manifest.json` as top-level `listContainers`

Minimal structural shape:

- `logicalBlockList[].headingLevel`
  - reserved for `h1`..`h6`
- `logicalBlockList[].blockPresentation`
  - whitelist fields only:
    - `textIndentEm`
    - `marginTopEm`
    - `marginBottomEm`
    - `textAlign`
    - `lineHeight`
- `logicalBlockList[].inlineSemantics`
  - optional narrow inline-rich representation
  - written only when whitelist inline tags are actually present
  - supports only:
    - `em`
    - `strong`
    - `sup`
- `logicalBlockList[].blockRole`
  - currently only `blockquote`
  - other phase-local block roles may still exist in the artifact; `structuralPhase2`
    only governs the `blockquote` case
- `logicalBlockList[].blockquotePresentation`
  - narrow quote metadata only:
    - `variant: "basic-quote"`
    - `suppressTextIndent`
- `listContainers[]`
  - narrow ordered-list metadata only:
    - `containerId`
    - `sourceHref`
    - `listType: "ordered"`
    - `markerStyle: "decimal"`
    - `start`
    - `itemBlockIds[]`

What this contract intentionally does not add:

- generic container nesting
- arbitrary block taxonomies
- a CSS cascade engine
- general layout instructions

At this step the contract is schema-only:

- `buildProtectedManifest()` writes an empty `listContainers: []`
- the validator understands structural fields if they appear later
- no structural extraction or structural rendering is implemented yet

Phase 2 / P2-S2 now adds a narrow ordered-list extraction pass for the exact
ordered-list pattern confirmed in `manual/1`:

- `ol type="1"`
- containing one or more `li > p`

What gets emitted:

- one `listContainers[]` entry per matched ordered list with:
  - `containerId`
  - `sourceHref`
  - `listType: "ordered"`
  - `markerStyle: "decimal"`
  - `start`
  - `itemBlockIds[]`
- one logical block per list item with:
  - `blockId`
  - `sourceHref`
  - `blockRole: "list-item"`
  - `textContent`

What this still does not attempt:

- list rendering
- unordered lists
- nested list semantics
- general list extraction across arbitrary EPUB patterns

Phase 2 / P2-S3 now adds a narrow blockquote extraction pass for the exact
blockquote cases confirmed in `manual/1`:

- `blockquote`
- containing one or more `p`

What gets emitted:

- one logical block per matched `blockquote` with:
  - `blockId`
  - `sourceHref`
  - `blockRole: "blockquote"`
  - `textContent`
  - `blockquotePresentation.variant: "basic-quote"`
  - `blockquotePresentation.suppressTextIndent: true`

The current extraction treats `suppressTextIndent` as canonically true for this
narrow `blockquote` source pattern and does not attempt broader presentation
recovery.

What this still does not attempt:

- blockquote rendering
- general quote extraction across arbitrary EPUB patterns
- general paragraph or heading presentation extraction

Phase 2 / P2-S4 now adds a narrow CSS-derived `blockPresentation` extraction
pass, still without a cascade engine.

Whitelisted `blockPresentation` fields:

- `textIndentEm`
- `marginTopEm`
- `marginBottomEm`
- `textAlign`
- `lineHeight`

This pass is intentionally limited to current `v4` logical blocks whose source
pattern is already known and whose presentation can be derived from exact
stylesheet rules in `EPUB/styles/stylesheet1.css`:

- `list-item`
  - uses the exact `p` rule for paragraph indent/alignment/margins
  - uses the exact `body` rule only for inherited `line-height`
- `blockquote`
  - uses the exact `blockquote` rule for indent/alignment/margins
  - uses the exact `body` rule only for inherited `line-height`
- `figure-lead`
  - uses the exact `p` rule as the narrow paragraph baseline
  - uses the exact `.figure-block td > p.figure-lead` rule for `margin-bottom`
  - uses the exact `body` rule only for inherited `line-height`

What this pass intentionally does not attempt:

- heading extraction
- paragraph extraction across the whole book
- any CSS cascade or inheritance engine beyond the narrow inherited
  `body -> line-height` case above
- recovery of values that cannot be read reliably from the exact matched rules

The next narrow structural step adds the main text layer:

- heading extraction for `h1`..`h6`
- general paragraph extraction for plain `p`

This pass stays deterministic and avoids re-extracting existing special cases.

What gets emitted:

- one heading block per matched heading with non-empty text:
  - `blockId`
  - `sourceHref`
  - `textContent`
  - `headingLevel`
- one paragraph block per matched plain paragraph with non-empty text:
  - `blockId`
  - `sourceHref`
  - `textContent`

What this pass explicitly does not re-extract:

- `figure-lead`
- `list-item`
- `blockquote`
- `p.image-block`
- image-only heading cases already emitted as `separator-image`
- inline-avatar media blocks already emitted from avatar headings

The current `blockPresentation` whitelist path now also applies to:

- heading blocks via exact `h1`..`h6` rules
- general paragraph blocks via exact `p` plus narrow inherited `body -> line-height`

This pass rebuilds `logicalBlockList` in narrow source order from the same
whitelist patterns and uses the already extracted special-case blocks in place.

What gets preserved in-order from existing extractors instead of duplicated:

- `inline-avatar`
- `content-image`
- `separator-image`
- `figure-lead`
- `list-item`
- `blockquote`

Reading-order fidelity now follows EPUB spine order from `EPUB/content.opf`
instead of directory sorting.

Current narrow rule:

- extraction walks XHTML documents using `<spine><itemref .../></spine>` order
- only linear spine items are included in the main reading flow
- `text/cover.xhtml` remains excluded from text assembly because shell-cover is
  still handled separately through `manifest.cover`
- non-linear notes documents such as `text/notes-*.xhtml` are present in the
  OPF but have `linear="no"` and are therefore not included in the main reading
  flow at this step

Inline semantics extraction now preserves a narrow whitelist of inline rich-text
marks for the already extracted main reading text blocks:

- heading blocks
- general paragraph blocks
- `figure-lead`
- `list-item`
- `blockquote`

The preserved inline field is:

- `logicalBlockList[].inlineSemantics`
  - `paragraphs[]`
  - `paragraphs[].runs[]`
  - `runs[].text`
  - optional `runs[].marks[]`

Supported marks are whitelist-only:

- `em`
- `strong`
- `sup`

Narrow link/anchor semantics are now also preserved inside the same
`inlineSemantics.runs[]` shape when inline anchors are actually present.

Supported narrow anchor roles:

- `inline-link`
- `footnote-ref`

Supported target role:

- `footnote`

When present, a run may now also carry:

- `anchor.anchorRole`
- `anchor.href`
- `anchor.sourceAnchorId`
- `anchor.targetSourceHref`
- `anchor.targetAnchorId`
- `anchor.targetRole`

Current whitelist extraction scope:

- inline `<a href="...">...</a>` in already extracted reading-text blocks
- footnote-like refs recognized from the confirmed `manual/1` pattern:
  - `class="footnote-ref"`
  - or `epub:type="noteref"`
  - or `role="doc-noteref"`
- footnote target ids confirmed from non-linear `notes-*.xhtml` documents via:
  - `<aside epub:type="footnote" role="doc-footnote" id="...">`

Current `v4` runtime also uses that preserved anchor metadata for a
prototype-only footnote preview path:

- footnote refs are resolved by `targetSourceHref + targetAnchorId`
- runtime fetches the referenced `notes-*.xhtml` source document
- runtime resolves the matching `aside` footnote target
- reading surface can show a narrow preview panel for the resolved note

What this still does not attempt:

- a full footnote system
- final click navigation
- backlink navigation
- integrating note documents into the main reading flow

Important scope limits:

- plain `textContent` is still kept for every text block
- blocks without these inline tags are not expanded unnecessarily
- no universal hyperlink model is introduced
- no footnote navigation system is introduced
- no final reader notes UI is introduced
- no universal inline HTML model or broad HTML/CSS engine is introduced

## Phase 3 Figure / Container Contract Foundation

The `v4` bootstrap manifest now also reserves a narrow figure/container
contract for figure-like sections confirmed in `manual/1`. This is a whitelist
contract only. It is not a universal EPUB container model.

The contract is written to:

- `manifest.json` as `artifactContract.figureContainerPhase3`
- `manifest.json` as top-level `figureContainers`

Minimal figure/container shape:

- `figureContainers[]`
  - `containerId`
    - canonical grouping identity for one figure-like section
  - `containerType`
    - currently only `"figure"`
  - `sourceHref`
    - optional source XHTML reference when known
  - `breakBefore`
    - optional narrow boundary hint
  - `members[]`
    - ordered membership list inside the figure container
    - `memberRole: "lead-text" | "image"`
    - `lead-text` members reference a future text block by `blockId`
    - `image` members reference a future media-bearing block by `mediaBlockId`
    - `image` members may also include `mediaId` when the image identity is known

What this contract intentionally does not add:

- generic nested containers
- arbitrary figure captions or role taxonomies
- page layout instructions
- a universal block/container engine

At this step the contract is schema-only:

- `buildProtectedManifest()` writes an empty `figureContainers: []`
- the validator understands and validates the shape if figure containers are
  later emitted
- no extraction logic or rendering logic is implemented yet

Phase 3 / P3-S2 now adds a narrow extraction pass for the exact figure-like
pattern confirmed in `manual/1`:

- `table.figure-block.figure-pair`
- containing `p.figure-lead`
- followed by `p.image-block > img`

What gets emitted:

- one `lead-text` logical block with:
  - `blockId`
  - `sourceHref`
  - `blockRole: "figure-lead"`
  - `textContent`
- one `figureContainers[]` entry that:
  - uses `containerType: "figure"`
  - references the extracted lead-text block by `blockId`
  - references the already extracted `content-image` block by `mediaBlockId`
  - references the already extracted image item by `mediaId`
  - sets `breakBefore: true` only when `figure-break-before` is present on the source table

This still does not attempt:

- figure rendering
- generic figure/container extraction across arbitrary EPUB patterns
- a general text block model outside this narrow figure-lead case
