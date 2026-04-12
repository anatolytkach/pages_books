#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tempfile
from pathlib import Path


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def write_merged_css(base_css: Path, generated_css: Path, merged_css: Path) -> None:
    merged_css.write_text(
        "/* AUTO-BUILT: DO NOT EDIT */\n"
        + base_css.read_text(encoding="utf-8")
        + "\n"
        + generated_css.read_text(encoding="utf-8"),
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert a DOCX document into an EPUB suitable for protected ingestion.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--title", default="")
    parser.add_argument("--author", default="Unknown")
    parser.add_argument("--language", default="en")
    args = parser.parse_args()

    workspace_root = Path(__file__).resolve().parents[2]
    content_tools = workspace_root / "books" / "content"
    base_css = content_tools / "epub.base.css"
    css_generator = content_tools / "gen_epub_css_from_docx.py"

    input_docx = Path(args.input).resolve()
    output_epub = Path(args.output).resolve()
    output_epub.parent.mkdir(parents=True, exist_ok=True)
    title = args.title.strip() or input_docx.stem.replace("_", " ").replace("-", " ")
    author = args.author.strip() or "Unknown"
    language = args.language.strip() or "en"

    with tempfile.TemporaryDirectory(prefix="docx-epub-build-") as tmp_dir_str:
        tmp_dir = Path(tmp_dir_str)
        auto_css = tmp_dir / "epub.headings.auto.css"
        merged_css = tmp_dir / "epub.css"

        run([sys.executable, str(css_generator), str(input_docx), str(auto_css), "--force-no-bold"])
        write_merged_css(base_css, auto_css, merged_css)

        pandoc_command = [
            "pandoc",
            str(input_docx),
            "--from=docx",
            "--to=epub3",
            "-o",
            str(output_epub),
            f"--css={merged_css}",
            "--metadata", f"title={title}",
            "--metadata", f"author={author}",
            "--metadata", f"lang={language}",
            "--metadata", f"language={language}",
            "--metadata", f"dc.language={language}",
        ]
        run(pandoc_command)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
