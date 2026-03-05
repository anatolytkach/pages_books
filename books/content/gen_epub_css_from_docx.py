#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Optional, Tuple

from docx import Document


def fmt_em(x: float) -> str:
    s = f"{x:.4f}".rstrip("0").rstrip(".")
    return s if s else "0"


def pt_to_em(pt: float, base_pt: float) -> float:
    if base_pt <= 0:
        base_pt = 12.0
    return pt / base_pt


def find_style(doc: Document, name: str):
    for s in doc.styles:
        if s.name == name:
            return s
    return None


def walk_style_chain(style):
    seen = set()
    s = style
    while s is not None and id(s) not in seen:
        seen.add(id(s))
        yield s
        s = getattr(s, "base_style", None)


def first_non_none(getter, style):
    for s in walk_style_chain(style):
        v = getter(s)
        if v is not None:
            return v
    return None


def get_font_obj(style):
    return getattr(style, "font", None)


def get_pf(style):
    return getattr(style, "paragraph_format", None)


def base_font_pt(doc: Document, fallback: float = 12.0) -> float:
    s = find_style(doc, "Normal")
    if s is not None:
        f = get_font_obj(s)
        if f is not None and f.size is not None:
            return float(f.size.pt)
    return fallback


def get_font_size_pt(style, base_pt: float) -> float:
    def g(s):
        f = get_font_obj(s)
        if f is None or f.size is None:
            return None
        return float(f.size.pt)

    v = first_non_none(g, style)
    return v if v is not None else base_pt


def get_bool_font_prop(style, attr: str) -> Optional[bool]:
    def g(s):
        f = get_font_obj(s)
        if f is None:
            return None
        return getattr(f, attr, None)

    v = first_non_none(g, style)
    return bool(v) if v is not None else None


def get_alignment_css(style) -> Optional[str]:
    """
    python-docx enum:
      0 LEFT
      1 CENTER
      2 RIGHT
      3 JUSTIFY
    """
    def g(s):
        pf = get_pf(s)
        if pf is None:
            return None
        return pf.alignment

    a = first_non_none(g, style)
    if a is None:
        return None

    ai = int(a)
    if ai == 1:
        return "center"
    if ai == 2:
        return "right"
    if ai == 3:
        return "justify"
    return "left"


def get_spacing_pt(style) -> Tuple[float, float]:
    def g_before(s):
        pf = get_pf(s)
        if pf is None or pf.space_before is None:
            return None
        return float(pf.space_before.pt)

    def g_after(s):
        pf = get_pf(s)
        if pf is None or pf.space_after is None:
            return None
        return float(pf.space_after.pt)

    before = first_non_none(g_before, style)
    after = first_non_none(g_after, style)
    return (before if before is not None else 0.0, after if after is not None else 0.0)


def get_indents_pt(style) -> Tuple[float, float, float]:
    def g_left(s):
        pf = get_pf(s)
        if pf is None or pf.left_indent is None:
            return None
        return float(pf.left_indent.pt)

    def g_right(s):
        pf = get_pf(s)
        if pf is None or pf.right_indent is None:
            return None
        return float(pf.right_indent.pt)

    def g_first(s):
        pf = get_pf(s)
        if pf is None or pf.first_line_indent is None:
            return None
        return float(pf.first_line_indent.pt)

    li = first_non_none(g_left, style)
    ri = first_non_none(g_right, style)
    fi = first_non_none(g_first, style)
    return (li if li is not None else 0.0, ri if ri is not None else 0.0, fi if fi is not None else 0.0)


def get_line_spacing_multiple(style) -> Optional[float]:
    def g(s):
        pf = get_pf(s)
        if pf is None:
            return None
        return pf.line_spacing

    ls = first_non_none(g, style)
    if ls is None:
        return None
    try:
        return float(ls)
    except Exception:
        return None


def generate_headings_css(
    docx_path: Path,
    out_path: Path,
    max_level: int = 6,
    base_pt_override: Optional[float] = None,
    force_no_bold: bool = False,
    suppress_inline_strong: bool = True,
) -> None:
    doc = Document(str(docx_path))
    base_pt = base_pt_override if base_pt_override and base_pt_override > 0 else base_font_pt(doc)

    lines = []
    lines.append("/* AUTO-GENERATED FILE. DO NOT EDIT. */")
    lines.append(f"/* source: {docx_path.name} */")
    lines.append(f"/* base font: {base_pt:.2f}pt (used for pt->em) */")
    lines.append("")

    # Не задаем тут text-align, чтобы не убить центровку.
    lines.append("h1, h2, h3, h4, h5, h6 {")
    lines.append("  margin: 0;")
    lines.append("  padding: 0;")
    lines.append("  display: block;")
    lines.append("  text-indent: 0;")
    lines.append("  hyphens: none;")
    lines.append("  break-after: avoid;")
    lines.append("  page-break-after: avoid;")
    lines.append("}")
    lines.append("")

    for n in range(1, max_level + 1):
        s = find_style(doc, f"Heading {n}")
        if s is None:
            continue

        font_pt = get_font_size_pt(s, base_pt)
        before_pt, after_pt = get_spacing_pt(s)
        left_pt, right_pt, first_pt = get_indents_pt(s)

        italic = get_bool_font_prop(s, "italic")
        underline = get_bool_font_prop(s, "underline")
        all_caps = get_bool_font_prop(s, "all_caps")
        small_caps = get_bool_font_prop(s, "small_caps")

        align = get_alignment_css(s)
        line_spacing = get_line_spacing_multiple(s)

        lines.append(f"h{n} {{")
        lines.append(f"  font-size: {fmt_em(pt_to_em(font_pt, base_pt))}em;")
        lines.append(f"  margin-top: {fmt_em(pt_to_em(before_pt, base_pt))}em;")
        lines.append(f"  margin-bottom: {fmt_em(pt_to_em(after_pt, base_pt))}em;")

        if align is not None:
            lines.append(f"  text-align: {align};")

        if italic is not None:
            lines.append(f"  font-style: {'italic' if italic else 'normal'};")

        # Жирный — всегда убираем, если попросили
        if force_no_bold:
            lines.append("  font-weight: 400;")
        else:
            bold = get_bool_font_prop(s, "bold")
            if bold is not None:
                lines.append(f"  font-weight: {700 if bold else 400};")

        if underline is not None:
            lines.append(f"  text-decoration: {'underline' if underline else 'none'};")

        if all_caps is True:
            lines.append("  text-transform: uppercase;")

        if small_caps is True:
            lines.append("  font-variant: small-caps;")

        # Инденты Word отражаем в CSS
        if abs(left_pt) > 1e-6:
            lines.append(f"  margin-left: {fmt_em(pt_to_em(left_pt, base_pt))}em;")
        if abs(right_pt) > 1e-6:
            lines.append(f"  margin-right: {fmt_em(pt_to_em(right_pt, base_pt))}em;")

        if abs(first_pt) > 1e-6:
            lines.append(f"  text-indent: {fmt_em(pt_to_em(first_pt, base_pt))}em;")
        else:
            lines.append("  text-indent: 0;")

        if line_spacing is not None and line_spacing > 0:
            lines.append(f"  line-height: {line_spacing:.3f};")

        lines.append("}")
        lines.append("")

    if suppress_inline_strong:
        # По твоему требованию: жирный в заголовках никогда.
        lines.append("/* suppress inline strong/b inside headings */")
        lines.append("h1 strong, h2 strong, h3 strong, h4 strong, h5 strong, h6 strong,")
        lines.append("h1 b, h2 b, h3 b, h4 b, h5 b, h6 b {")
        lines.append("  font-weight: 400;")
        lines.append("}")
        lines.append("")

    out_path.write_text("\n".join(lines), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input_docx", type=Path)
    ap.add_argument("output_css", type=Path)
    ap.add_argument("--max-level", type=int, default=6, choices=range(1, 7))
    ap.add_argument("--base-pt", type=float, default=0.0)
    ap.add_argument("--force-no-bold", action="store_true")
    ap.add_argument("--keep-strong", action="store_true")
    args = ap.parse_args()

    generate_headings_css(
        docx_path=args.input_docx,
        out_path=args.output_css,
        max_level=args.max_level,
        base_pt_override=args.base_pt if args.base_pt > 0 else None,
        force_no_bold=args.force_no_bold,
        suppress_inline_strong=not args.keep_strong,
    )


if __name__ == "__main__":
    main()
