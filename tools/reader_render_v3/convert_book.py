#!/usr/bin/env python3
"""Reader Render V3 converter entrypoint."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

from v3_core import convert_to_v3


def detect_input_kind(path: Path) -> str:
    if path.is_file() and path.suffix.lower() == ".epub":
        return "epub"
    if path.is_dir():
        return "legacy_dir"
    raise ValueError(f"unsupported input: {path}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="convert_book.py",
        description="Scaffold entrypoint for Reader Render V3 book conversion",
    )
    parser.add_argument("input", help="Path to an epub file or unpacked legacy directory")
    parser.add_argument("output", help="Target directory for the future v3 render-book output")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    input_path = Path(args.input).expanduser().resolve()
    output_path = Path(args.output).expanduser().resolve()
    kind = detect_input_kind(input_path)

    print(
        f"[reader-render-v3] scaffold accepted input kind={kind} "
        f"input={input_path} output={output_path}"
    )
    convert_to_v3(input_path, output_path)
    print("[reader-render-v3] conversion finished")
    return 0


if __name__ == "__main__":
    sys.exit(main())
