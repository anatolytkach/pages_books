# Render Book V3 Contract

The v3 book format is a render-oriented storage contract intended to reduce
direct exposure of readable HTML chapters.

## Storage Layout

Each v3 book lives under a single book root and is composed of:

- `book-manifest.json`
- `nav/`
- `order/`
- `layout/`
- `text/`
- `glyphs/`
- `assets/`

## Manifest Responsibilities

`book-manifest.json` must contain:
- metadata
- cover/resource references
- entry pointers for navigation, order, layout, text, and glyph payloads

`book-manifest.json` must not contain:
- a full explicit spine array
- direct chapter-by-chapter reading order in one place
- readable source-like filenames

## Navigation Payloads

`nav/*.json` payloads hold:
- TOC labels
- locators for TOC targets
- note/bookmark-compatible anchors

## Order Payloads

`order/*.json` payloads hold:
- partial reading-order graphs
- next pointers
- block/page sequence references

## Layout Payloads

`layout/*.json` payloads hold:
- page layout blocks
- line boxes
- visual coordinates for rendered content

## Text Payloads

`text/*.json` payloads hold:
- logical text content
- offsets
- selection ranges
- note/highlight locators

## Glyph Payloads

`glyphs/*.json` payloads hold:
- glyph maps
- atlas/shape references
- render references used by the canvas layer

## Compatibility Strategy

The future public `reader` must support:
- legacy books
- current manifest-based books
- render-book v3 books

The v3 format is introduced in isolation first, then integrated into the public
reader only after local validation.
