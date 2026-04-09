#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

from sync_gutenberg_indexes import clean_text, parse_categories_index, slugify


def read_json(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))


def enrich_summary(summary: dict, mapping: dict) -> dict:
    groups = {}
    categories = []
    for item in summary.get("categories") or []:
        title = clean_text(item.get("title") or "")
        match = mapping.get(title)
        enriched = dict(item)
        if match:
            enriched["groupTitle"] = match["groupTitle"]
            enriched["groupSlug"] = match["groupSlug"]
            enriched["groupOrder"] = match["groupOrder"]
            group = groups.setdefault(
                match["groupSlug"],
                {
                    "slug": match["groupSlug"],
                    "title": match["groupTitle"],
                    "order": match["groupOrder"],
                    "count": 0,
                    "totalMatchedBooks": 0,
                    "categories": [],
                },
            )
            group["count"] += 1
            group["totalMatchedBooks"] += int(enriched.get("count") or 0)
            group["categories"].append(enriched)
        categories.append(enriched)

    grouped = list(groups.values())
    grouped.sort(key=lambda item: (item["order"], item["title"].lower()))
    for group in grouped:
        group["categories"].sort(key=lambda item: item["title"].lower())

    payload = dict(summary)
    payload["categories"] = categories
    payload["groups"] = grouped
    return payload


def main():
    parser = argparse.ArgumentParser(description="Attach Gutenberg grouping metadata to category summary payloads.")
    parser.add_argument("--gutenberg-html", required=True)
    parser.add_argument("--summary", action="append", default=[])
    args = parser.parse_args()

    html = Path(args.gutenberg_html).read_text(encoding="utf-8")
    sources = parse_categories_index(html, "https://www.gutenberg.org/ebooks/categories")
    mapping = {}
    for source in sources:
        title = clean_text(source.title)
        mapping[title] = {
            "groupTitle": source.group_title,
            "groupSlug": source.group_slug or slugify(source.group_title),
            "groupOrder": source.group_order,
        }

    for summary_path in args.summary:
        path = Path(summary_path)
        payload = read_json(path)
        write_json(path, enrich_summary(payload, mapping))
        print(f"Enriched {path}")


if __name__ == "__main__":
    raise SystemExit(main())
