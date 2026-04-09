#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, List


ROOT_DIR = Path(__file__).resolve().parents[2]
TOOLS_DIR = ROOT_DIR / "tools"
GUTENBERG_TOOLS_DIR = TOOLS_DIR / "gutenberg"
CATALOG_TOOLS_DIR = TOOLS_DIR / "catalog"

for candidate in (str(GUTENBERG_TOOLS_DIR), str(CATALOG_TOOLS_DIR), str(Path(__file__).resolve().parent)):
    if candidate not in sys.path:
        sys.path.insert(0, candidate)

from unpack_epub import convert_epub
from update_gutenberg_catalog import (
    BUILD_BOOK_LOCATIONS,
    BUILD_LANG_INDEXES,
    BUILD_NEWEST_RELEASES,
    INDEX_ROOT,
    changed_files,
    detect_rclone_remote,
    get_state_bucket,
    iso_now,
    run_cmd,
    snapshot_mtimes,
    upload_api_files,
    upload_content_directory,
)


CONTENT_ROOT = ROOT_DIR / "books" / "content"
REGISTRY_PATH = ROOT_DIR / "tools" / "state" / "source_registry.json"
STATE_PATH = ROOT_DIR / "tools" / "state" / "reader1_publish_state.json"
QUEUE_ROOT = ROOT_DIR / "tools" / "state" / "reader1_publish_queue"
RUNS_DIR = Path("/tmp/reader1_publish_runs")


def clean_text(value: str) -> str:
    return " ".join(str(value or "").split())


def read_json(path: Path, default=None):
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return default


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)


class RunLogger:
    def __init__(self, run_name: str) -> None:
        RUNS_DIR.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        self.path = RUNS_DIR / f"{stamp}-{run_name}.log"

    def log(self, message: str) -> None:
        line = f"[reader1-publish] {message}"
        print(line, flush=True)
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")


@dataclass
class PublishItem:
    reader_id: str
    source_book_id: str
    source: str
    staged_epub_path: Path
    output_dir: Path


def ensure_registry_shape(path: Path) -> dict:
    data = read_json(path, {}) or {}
    if not isinstance(data, dict):
        data = {}
    defaults = data.get("defaults")
    if not isinstance(defaults, dict):
        data["defaults"] = {}
    return data


def ensure_pipeline_state(path: Path) -> dict:
    data = read_json(path, {}) or {}
    if not isinstance(data, dict):
        data = {}
    data.setdefault("last_run_started_at", "")
    data.setdefault("last_run_finished_at", "")
    data.setdefault("last_successful_run_at", "")
    data.setdefault("processed", {})
    data.setdefault("pending_retry", {})
    data.setdefault("success", {})
    data.setdefault("failed", {})
    data.setdefault("reader1_cli", {})
    data["reader1_cli"].setdefault("current_run", {})
    data["reader1_cli"].setdefault("state_load_ok", True)
    data["reader1_cli"].setdefault("runtime_mode", "local")
    return data


def save_state(path: Path, state: dict) -> None:
    write_json(path, state)


def numeric_values(values: Iterable[str]) -> list[int]:
    result = []
    for value in values:
        raw = clean_text(value)
        if raw.isdigit():
            result.append(int(raw))
    return result


def next_reader_id(registry: dict, state: dict, index_root: Path) -> str:
    values = []
    for source, items in registry.items():
        if source == "defaults" or not isinstance(items, dict):
            continue
        for item in items.values():
            if isinstance(item, dict):
                values.append(str(item.get("reader_id") or ""))
    values.extend(str(key) for key in (state.get("processed") or {}).keys())
    book_locations = read_json(index_root / "book-locations.json", {}) or {}
    location_items = book_locations.get("items") if isinstance(book_locations.get("items"), dict) else {}
    if isinstance(location_items, dict):
        values.extend(str(key) for key in location_items.keys())
    ints = numeric_values(values)
    return str(max(ints, default=0) + 1)


def next_source_book_id(registry: dict, source: str) -> str:
    items = registry.get(source) if isinstance(registry.get(source), dict) else {}
    values = [str(key) for key in items.keys()]
    values.extend(str((item or {}).get("source_book_id") or "") for item in items.values() if isinstance(item, dict))
    ints = numeric_values(values)
    return str(max(ints, default=0) + 1)


def collect_epubs_from_dir(directory: Path) -> list[Path]:
    return sorted(
        [path for path in directory.rglob("*") if path.is_file() and path.suffix.lower() == ".epub"],
        key=lambda path: path.as_posix().lower(),
    )


def collect_epubs_from_zip(zip_path: Path) -> tuple[Path, list[Path]]:
    temp_root = Path(tempfile.mkdtemp(prefix="reader1_publish_zip_", dir="/tmp"))
    with zipfile.ZipFile(zip_path, "r") as archive:
        archive.extractall(temp_root)
    return temp_root, collect_epubs_from_dir(temp_root)


def ensure_source_defaults(registry: dict, source: str) -> None:
    defaults = registry.setdefault("defaults", {})
    source_defaults = defaults.get(source)
    if not isinstance(source_defaults, dict):
        source_defaults = {}
        defaults[source] = source_defaults
    source_defaults.setdefault("public_path_mode", "target")


def update_current_run(state: dict, **fields) -> None:
    current_run = state.setdefault("reader1_cli", {}).setdefault("current_run", {})
    current_run.update(fields)
    current_run["updated_at"] = iso_now()


def set_run_progress(state: dict, *, reader_id: str = "", phase: str = "", index: int = 0, total: int = 0, status: str = "") -> None:
    fields = {}
    if reader_id:
        fields["current_book_id"] = str(reader_id)
    if phase:
        fields["current_phase"] = phase
    if index:
        fields["current_index"] = index
    if total:
        fields["total"] = total
    if status:
        fields["status"] = status
    if fields:
        update_current_run(state, **fields)


def update_book_state(state: dict, reader_id: str, **fields) -> dict:
    processed = state.setdefault("processed", {})
    item = processed.setdefault(reader_id, {"status": "queued", "attempts": 0})
    item.update(fields)
    item["updated_at"] = iso_now()
    return item


def render_status(state: dict) -> str:
    current_run = (state.get("reader1_cli") or {}).get("current_run") or {}
    processed = state.get("processed") or {}
    candidate_ids = [str(value) for value in current_run.get("candidate_ids") or [] if str(value)]
    current_success = 0
    current_failed = 0
    current_pending = 0
    for reader_id in candidate_ids:
        item = processed.get(reader_id) or {}
        status = clean_text(item.get("status", ""))
        if status == "success":
            current_success += 1
        elif status == "failed":
            current_failed += 1
        elif status:
            current_pending += 1
    lines = [
        f"runtime_mode: {clean_text(((state.get('reader1_cli') or {}).get('runtime_mode', 'local')) or 'local')}",
        f"last_run_started_at: {clean_text(state.get('last_run_started_at', '')) or '-'}",
        f"last_run_finished_at: {clean_text(state.get('last_run_finished_at', '')) or '-'}",
        f"last_successful_run_at: {clean_text(state.get('last_successful_run_at', '')) or '-'}",
    ]
    if current_run:
        lines.extend(
            [
                f"current_run_id: {clean_text(current_run.get('run_id', '')) or '-'}",
                f"current_run_source: {clean_text(current_run.get('source', '')) or '-'}",
                f"current_run_status: {clean_text(current_run.get('status', '')) or 'idle'}",
                f"current_run_input_mode: {clean_text(current_run.get('input_mode', '')) or '-'}",
                f"current_run_candidates: {len(candidate_ids)}",
                f"current_run_book: {clean_text(current_run.get('current_book_id', '')) or '-'}",
                f"current_run_phase: {clean_text(current_run.get('current_phase', '')) or '-'}",
                f"current_run_progress: {clean_text(current_run.get('current_index', '0'))}/{clean_text(current_run.get('total', '0'))}",
                f"current_run_success: {current_success}",
                f"current_run_pending: {current_pending}",
                f"current_run_failed: {current_failed}",
                f"current_run_log: {clean_text(current_run.get('log_path', '')) or '-'}",
            ]
        )
    return "\n".join(lines)


def stage_sources_for_run(epub_paths: list[Path], queue_dir: Path) -> list[Path]:
    sources_dir = queue_dir / "sources"
    sources_dir.mkdir(parents=True, exist_ok=True)
    staged_paths = []
    for index, epub_path in enumerate(epub_paths, start=1):
        target = sources_dir / f"{index:04d}-{epub_path.name}"
        shutil.copy2(epub_path, target)
        staged_paths.append(target)
    return staged_paths


def prepare_new_run_items(args, registry: dict, state: dict, index_root: Path, logger: RunLogger) -> tuple[list[PublishItem], Path | None, str, Path]:
    extracted_root = None
    if args.input_mode == "epub":
        epub_paths = [Path(args.epub).resolve()]
    elif args.input_mode == "dir":
        epub_paths = collect_epubs_from_dir(Path(args.input_dir).resolve())
    else:
        extracted_root, epub_paths = collect_epubs_from_zip(Path(args.input_zip).resolve())
    if not epub_paths:
        raise RuntimeError("No EPUB files found for publishing")

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    queue_dir = Path(args.queue_root).resolve() / run_id
    staged_paths = stage_sources_for_run(epub_paths, queue_dir)
    next_source_id = int(args.start_source_book_id) if clean_text(args.start_source_book_id) else None

    items: list[PublishItem] = []
    for index, staged_epub in enumerate(staged_paths):
        if args.input_mode == "epub" and clean_text(args.source_book_id):
            source_book_id = clean_text(args.source_book_id)
        elif next_source_id is not None:
            source_book_id = str(next_source_id + index)
        else:
            source_book_id = next_source_book_id(registry, args.source)
            while source_book_id in registry.get(args.source, {}):
                source_book_id = str(int(source_book_id) + 1)
        if source_book_id in registry.get(args.source, {}):
            raise RuntimeError(f"sourceBookId already exists for source={args.source}: {source_book_id}")

        reader_id = next_reader_id(registry, state, index_root)
        while reader_id in (state.get("processed") or {}):
            reader_id = str(int(reader_id) + 1)

        output_dir = Path(args.content_root).resolve() / args.source / source_book_id
        if output_dir.exists():
            raise RuntimeError(f"Output directory already exists: {output_dir}")

        items.append(
            PublishItem(
                reader_id=reader_id,
                source_book_id=source_book_id,
                source=args.source,
                staged_epub_path=staged_epub,
                output_dir=output_dir,
            )
        )

        registry.setdefault(args.source, {})
        registry[args.source][source_book_id] = {
            "reader_id": reader_id,
            "source_book_id": source_book_id,
            "label": clean_text(args.label) or f"{args.source} import",
            "local_content_path": f"/books/content/{args.source}/{source_book_id}/",
        }
        update_book_state(
            state,
            reader_id,
            status="queued",
            attempts=0,
            source=args.source,
            source_book_id=source_book_id,
            staged_epub_path=str(staged_epub),
            output_dir=str(output_dir),
            input_name=staged_epub.name,
            public_path_mode="target",
            local_content_path=f"/books/content/{args.source}/{source_book_id}/",
            target_path=f"/books/content/{args.source}/{source_book_id}/",
            public_content_path=f"/books/content/{args.source}/{source_book_id}/",
        )
        logger.log(f"[queue] reader_id={reader_id} source_book_id={source_book_id} file={staged_epub.name}")

    return items, extracted_root, run_id, queue_dir


def items_from_state(state: dict) -> list[PublishItem]:
    current_run = (state.get("reader1_cli") or {}).get("current_run") or {}
    candidate_ids = [str(value) for value in current_run.get("candidate_ids") or [] if str(value)]
    processed = state.get("processed") or {}
    items: list[PublishItem] = []
    for reader_id in candidate_ids:
        item = processed.get(reader_id) or {}
        status = clean_text(item.get("status", ""))
        if status == "success":
            continue
        staged_epub_path = Path(clean_text(item.get("staged_epub_path", "")))
        output_dir = Path(clean_text(item.get("output_dir", "")))
        if not staged_epub_path.exists():
            raise RuntimeError(f"Missing staged source EPUB for resume: {staged_epub_path}")
        items.append(
            PublishItem(
                reader_id=reader_id,
                source_book_id=clean_text(item.get("source_book_id", "")),
                source=clean_text(item.get("source", "")),
                staged_epub_path=staged_epub_path,
                output_dir=output_dir,
            )
        )
    return items


def search_tokens_for_title(title: str) -> list[str]:
    import re
    import unicodedata

    stop_words = {"the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "by", "vol", "volume", "no", "part", "chapter"}
    normalized = unicodedata.normalize("NFKD", clean_text(title).lower())
    stripped = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    words = re.findall(r"[\w]+", stripped, flags=re.UNICODE)
    tokens = []
    for word in words:
        word = word.replace("_", "")
        if len(word) < 3 or word in stop_words:
            continue
        token = word[:3]
        if token not in tokens:
            tokens.append(token)
    return tokens


def slugify_author(name: str) -> str:
    import re
    import unicodedata

    normalized = unicodedata.normalize("NFKD", clean_text(name).lower())
    stripped = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^\w]+", "", stripped, flags=re.UNICODE).replace("_", "")


def author_letter(name: str, lang: str) -> str:
    import re
    import unicodedata

    normalized = unicodedata.normalize("NFKD", clean_text(name).lower())
    stripped = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    token = re.sub(r"[^\w]+", "", stripped, flags=re.UNICODE).replace("_", "")
    if lang == "en":
        token = re.sub(r"[^a-z0-9]+", "", token)
    if not token:
        return "#"
    return "#" if token[0].isdigit() else token[0].upper()


def validate_outputs(index_root: Path, items: list[PublishItem], logger: RunLogger) -> None:
    book_locations = read_json(index_root / "book-locations.json", {}) or {}
    location_items = book_locations.get("items") if isinstance(book_locations.get("items"), dict) else {}
    if not isinstance(location_items, dict):
        raise RuntimeError("book-locations.json has no items map")

    for item in items:
        location = location_items.get(item.reader_id)
        if not isinstance(location, dict):
            raise RuntimeError(f"Missing book-locations entry for reader_id={item.reader_id}")
        if clean_text(location.get("source")) != item.source:
            raise RuntimeError(f"Incorrect source in book-locations for reader_id={item.reader_id}")
        if clean_text(location.get("sourceBookId")) != item.source_book_id:
            raise RuntimeError(f"Incorrect sourceBookId in book-locations for reader_id={item.reader_id}")
        if clean_text(location.get("readerType")) != "reader1":
            raise RuntimeError(f"Missing readerType=reader1 in book-locations for reader_id={item.reader_id}")

        if item.source_book_id.isdigit():
            shard = f"{int(item.source_book_id) % 100:02d}"
            shard_payload = read_json(index_root / "book-locations" / item.source / f"{shard}.json", {}) or {}
            shard_items = shard_payload.get("items") if isinstance(shard_payload.get("items"), dict) else {}
            if item.source_book_id not in shard_items:
                raise RuntimeError(f"Missing source shard entry for {item.source}/{item.source_book_id}")

        manifest = read_json(item.output_dir / "reader1-manifest.json", {}) or {}
        metadata = manifest.get("metadata") if isinstance(manifest.get("metadata"), dict) else {}
        title = clean_text(metadata.get("title") or metadata.get("bookTitle") or "")
        creator_list = metadata.get("creators") if isinstance(metadata.get("creators"), list) else []
        author = clean_text(creator_list[0] if creator_list else metadata.get("creator") or "")
        languages = metadata.get("languages") if isinstance(metadata.get("languages"), list) else []
        if not languages:
            language = clean_text(metadata.get("language") or "")
            if language:
                languages = [language]
        lang = clean_text(languages[0] if languages else "und").lower().split("-", 1)[0] or "und"

        author_key = slugify_author(author)
        author_payload = read_json(index_root / "a" / f"{author_key}.json", {}) or {}
        books = author_payload.get("books") if isinstance(author_payload.get("books"), list) else []
        if not any(clean_text(book.get("source")) == item.source and clean_text(book.get("sourceBookId") or book.get("id")) == item.source_book_id for book in books):
            raise RuntimeError(f"Missing author entry in global author file for {item.reader_id}")

        lang_author_payload = read_json(index_root / "lang" / lang / "a" / f"{author_key}.json", {}) or {}
        lang_books = lang_author_payload.get("books") if isinstance(lang_author_payload.get("books"), list) else []
        if not any(clean_text(book.get("source")) == item.source and clean_text(book.get("sourceBookId") or book.get("id")) == item.source_book_id for book in lang_books):
            raise RuntimeError(f"Missing author entry in language author file for {item.reader_id}")

        author_display_name = clean_text(lang_author_payload.get("name") or author_payload.get("name") or author)
        letter = author_letter(author_display_name, lang)
        global_letters = read_json(index_root / "letters.json", {}) or {}
        global_letter_items = global_letters.get("letters") if isinstance(global_letters.get("letters"), list) else []
        if not any(clean_text(entry.get("letter")) == letter for entry in global_letter_items):
            raise RuntimeError(f"Missing global author letter entry for {item.reader_id}")

        lang_letters = read_json(index_root / "lang" / lang / "letters.json", {}) or {}
        lang_letter_items = lang_letters.get("letters") if isinstance(lang_letters.get("letters"), list) else []
        if not any(clean_text(entry.get("letter")) == letter for entry in lang_letter_items):
            raise RuntimeError(f"Missing language author letter entry for {item.reader_id}")

        letter_key = "num" if letter == "#" else letter.lower()
        global_prefix = read_json(index_root / "p" / f"{letter_key}.json", {}) or {}
        if not ("authors" in global_prefix or "prefixes" in global_prefix):
            raise RuntimeError(f"Missing global author prefix node for {item.reader_id}")
        lang_prefix = read_json(index_root / "lang" / lang / "p" / f"{letter_key}.json", {}) or {}
        if not ("authors" in lang_prefix or "prefixes" in lang_prefix):
            raise RuntimeError(f"Missing language author prefix node for {item.reader_id}")

        tokens = search_tokens_for_title(title)
        if tokens:
            found = False
            for token in tokens:
                payload = read_json(index_root / "search" / f"{token}.json", {}) or {}
                search_items = payload.get("items") if isinstance(payload.get("items"), list) else []
                if any(clean_text(entry.get("source")) == item.source and clean_text(entry.get("id")) == item.source_book_id for entry in search_items):
                    found = True
                    break
            if not found:
                raise RuntimeError(f"Missing global search entry for {item.reader_id}")
        logger.log(f"[validate] ok reader_id={item.reader_id} source={item.source} source_book_id={item.source_book_id}")


def publish_items(args, items: list[PublishItem], api_changed: list[Path], logger: RunLogger) -> None:
    bucket = get_state_bucket(args.state_r2_bucket)
    for item in items:
        prefix = f"content/{item.source}/{item.source_book_id}"
        logger.log(f"[upload-content] {item.staged_epub_path.name} -> {prefix}")
        upload_content_directory(
            prefix,
            item.output_dir,
            bucket,
            args.wrangler_bin,
            rclone_bin=args.rclone_bin,
            rclone_remote=args.rclone_remote_effective,
            dry_run=args.dry_run,
        )
    if api_changed:
        logger.log(f"[upload-api] changed_files={len(api_changed)}")
        upload_api_files(
            api_changed,
            bucket,
            args.wrangler_bin,
            rclone_bin=args.rclone_bin,
            rclone_remote=args.rclone_remote_effective,
            dry_run=args.dry_run,
        )


def build_newest(index_root: Path, state_path: Path, python_bin: str, newest_window_days: int, newest_max_books: int, logger: RunLogger) -> None:
    run_cmd(
        [
            python_bin,
            str(BUILD_NEWEST_RELEASES),
            "--state",
            str(state_path),
            "--index-root",
            str(index_root),
            "--window-days",
            str(newest_window_days),
            "--max-books",
            str(newest_max_books),
        ]
    )
    logger.log("[newest] rebuilt newest releases")


def fail_with_guidance(logger: RunLogger, *, reader_id: str = "", phase: str = "", error: Exception | str = "") -> None:
    if reader_id:
        logger.log(f"[failed] reader_id={reader_id} phase={phase or '-'} error={error}")
    else:
        logger.log(f"[failed] phase={phase or '-'} error={error}")
    logger.log("[action] retry after fixing the issue:")
    logger.log("[action] python3 tools/reader1/publish_books.py resume")


def queue_from_state(state: dict) -> list[str]:
    current_run = (state.get("reader1_cli") or {}).get("current_run") or {}
    candidate_ids = [str(value) for value in current_run.get("candidate_ids") or [] if str(value)]
    if not candidate_ids:
        candidate_ids = sorted((state.get("pending_retry") or {}).keys(), key=lambda value: int(value) if str(value).isdigit() else value)
    processed = state.get("processed") or {}
    queue = []
    for reader_id in candidate_ids:
        status = clean_text((processed.get(reader_id) or {}).get("status", ""))
        if status == "success":
            continue
        queue.append(reader_id)
    return queue


def remove_queue_dir(run_id: str, queue_root: Path) -> None:
    if not run_id:
        return
    shutil.rmtree(queue_root / run_id, ignore_errors=True)


def run_pipeline(args, state_path: Path, registry_path: Path, index_root: Path, state: dict, registry: dict, items: list[PublishItem], mode: str, logger: RunLogger) -> int:
    state["last_run_started_at"] = iso_now()
    update_current_run(
        state,
        mode=mode,
        status="running",
        started_at=state["last_run_started_at"],
        source=items[0].source if items else clean_text(((state.get("reader1_cli") or {}).get("current_run") or {}).get("source", "")),
        total=len(items),
        candidate_ids=[item.reader_id for item in items],
        log_path=str(logger.path),
    )
    save_state(state_path, state)

    completed_items: list[PublishItem] = []
    index_snapshot = snapshot_mtimes(index_root)
    current_run = (state.get("reader1_cli") or {}).get("current_run") or {}
    run_id = clean_text(current_run.get("run_id", ""))

    try:
        for index, item in enumerate(items, start=1):
            book_state = update_book_state(state, item.reader_id, attempts=int((state.get("processed") or {}).get(item.reader_id, {}).get("attempts") or 0) + 1)
            set_run_progress(state, reader_id=item.reader_id, phase="convert", index=index, total=len(items), status="running")
            save_state(state_path, state)
            logger.log(f"[books {index}/{len(items)}] reader_id={item.reader_id} phase=convert")
            try:
                convert_epub(item.staged_epub_path, item.output_dir)
                book_state.update(
                    {
                        "status": "staged_local",
                        "phase": "staged_local",
                        "local_staged_at": iso_now(),
                        "local_content_path": f"/books/content/{item.source}/{item.source_book_id}/",
                        "legacy_path": f"/books/content/{item.reader_id}/",
                        "target_path": f"/books/content/{item.source}/{item.source_book_id}/",
                        "public_content_path": f"/books/content/{item.source}/{item.source_book_id}/",
                        "public_path_mode": "target",
                    }
                )
                if args.publish:
                    logger.log(f"[books {index}/{len(items)}] reader_id={item.reader_id} phase=upload_content")
                    set_run_progress(state, reader_id=item.reader_id, phase="upload_content", index=index, total=len(items), status="running")
                    publish_items(args, [item], [], logger)
                    book_state["uploaded_content_at"] = iso_now()
                    book_state["status"] = "uploaded_content"
                    book_state["phase"] = "upload_content_done"
                completed_items.append(item)
                logger.log(f"[books {index}/{len(items)}] reader_id={item.reader_id} phase=done")
            except Exception as error:
                book_state["status"] = "failed"
                book_state["phase"] = clean_text(book_state.get("phase", "")) or "convert"
                book_state["last_error"] = str(error)
                state["failed"][item.reader_id] = dict(book_state)
                fail_with_guidance(logger, reader_id=item.reader_id, phase=book_state["phase"], error=error)
            finally:
                save_state(state_path, state)

        if completed_items:
            total = len(completed_items)
            for index, item in enumerate(completed_items, start=1):
                logger.log(f"[index {index}/{total}] reader_id={item.reader_id} build_lang_indexes")
                set_run_progress(state, reader_id=item.reader_id, phase="index_catalog", index=index, total=total, status="running")
                save_state(state_path, state)
                run_cmd(
                    [
                        args.python_bin,
                        str(BUILD_LANG_INDEXES),
                        "--input",
                        str(Path(args.content_root).resolve()),
                        "--output",
                        str(index_root),
                        "--registry",
                        str(registry_path),
                        "--book-id",
                        item.reader_id,
                    ]
                )
                update_book_state(state, item.reader_id, status="indexed_catalog", phase="index_catalog_done")
                save_state(state_path, state)

        if completed_items:
            logger.log("[index] build_book_locations")
            set_run_progress(state, phase="book_locations", status="running")
            save_state(state_path, state)
            run_cmd(
                [
                    args.python_bin,
                    str(BUILD_BOOK_LOCATIONS),
                    "--index-root",
                    str(index_root),
                    "--registry",
                    str(registry_path),
                    "--output",
                    str(index_root / "book-locations.json"),
                    "--shards-dir",
                    str(index_root / "book-locations"),
                ]
            )
            logger.log("[index] rebuilt book-locations")

            set_run_progress(state, phase="newest", status="running")
            save_state(state_path, state)
            build_newest(index_root, state_path, args.python_bin, args.newest_window_days, args.newest_max_books, logger)

            set_run_progress(state, phase="validate", status="running")
            save_state(state_path, state)
            validate_outputs(index_root, completed_items, logger)

            api_changed = changed_files(index_root, index_snapshot)
            if args.publish and api_changed:
                set_run_progress(state, phase="upload_api", status="running")
                save_state(state_path, state)
                publish_items(args, [], api_changed, logger)
                uploaded_api_at = iso_now()
                for item in completed_items:
                    update_book_state(state, item.reader_id, status="uploaded_api", uploaded_api_at=uploaded_api_at, phase="upload_api_done")

        for item in completed_items:
            final = update_book_state(state, item.reader_id, status="success", phase="done")
            final.setdefault("catalog_added_at", iso_now())
            state["success"][item.reader_id] = dict(final)
            state["pending_retry"].pop(item.reader_id, None)
            state["failed"].pop(item.reader_id, None)

        for reader_id, item in (state.get("processed") or {}).items():
            if clean_text(item.get("status", "")) != "success":
                state["pending_retry"][reader_id] = item

        state["last_run_finished_at"] = iso_now()
        if completed_items:
            state["last_successful_run_at"] = state["last_run_finished_at"]
        update_current_run(state, status="success", finished_at=state["last_run_finished_at"], current_phase="done")
        save_state(state_path, state)
        remove_queue_dir(run_id, Path(args.queue_root).resolve())
        logger.log(f"[done] books={len(completed_items)} publish={'yes' if args.publish else 'no'}")
        return 0
    except Exception as error:
        state["last_run_finished_at"] = iso_now()
        update_current_run(state, status="failed", finished_at=state["last_run_finished_at"], last_error=str(error))
        save_state(state_path, state)
        fail_with_guidance(
            logger,
            reader_id=clean_text(((state.get("reader1_cli") or {}).get("current_run") or {}).get("current_book_id", "")),
            phase=clean_text(((state.get("reader1_cli") or {}).get("current_run") or {}).get("current_phase", "")),
            error=error,
        )
        return 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Reader1 publish pipeline for source-qualified EPUB imports.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--source")
    common.add_argument("--content-root", default=str(CONTENT_ROOT))
    common.add_argument("--index-root", default=str(INDEX_ROOT))
    common.add_argument("--registry", default=str(REGISTRY_PATH))
    common.add_argument("--state-file", default=str(STATE_PATH))
    common.add_argument("--queue-root", default=str(QUEUE_ROOT))
    common.add_argument("--label", default="Reader1 import")
    common.add_argument("--start-source-book-id", default="")
    common.add_argument("--publish", action="store_true")
    common.add_argument("--dry-run", action="store_true")
    common.add_argument("--wrangler-bin", default=os.environ.get("WRANGLER_BIN", "wrangler"))
    common.add_argument("--rclone-bin", default=os.environ.get("RCLONE_BIN", "rclone"))
    common.add_argument("--rclone-remote", default=os.environ.get("READER1_RCLONE_REMOTE", ""))
    common.add_argument("--skip-rclone", action="store_true")
    common.add_argument("--state-r2-bucket", default=os.environ.get("GUTENBERG_STATE_R2_BUCKET", ""))
    common.add_argument("--python-bin", default=os.environ.get("PYTHON_BIN", sys.executable or "python3"))
    common.add_argument("--newest-window-days", type=int, default=30)
    common.add_argument("--newest-max-books", type=int, default=0)

    subparsers.add_parser("status", parents=[common])

    run_parser = subparsers.add_parser("run", parents=[common])
    input_group = run_parser.add_mutually_exclusive_group(required=True)
    input_group.add_argument("--epub")
    input_group.add_argument("--input-dir")
    input_group.add_argument("--input-zip")
    run_parser.add_argument("--source-book-id", default="")

    subparsers.add_parser("resume", parents=[common])

    # Backward-compatible aliases.
    single = subparsers.add_parser("publish-epub", parents=[common])
    single.add_argument("epub")
    single.add_argument("--source-book-id", default="")
    multi_dir = subparsers.add_parser("publish-dir", parents=[common])
    multi_dir.add_argument("input_dir")
    multi_zip = subparsers.add_parser("publish-zip", parents=[common])
    multi_zip.add_argument("input_zip")
    return parser.parse_args()


def normalize_args(args: argparse.Namespace) -> None:
    if args.command == "publish-epub":
        args.command = "run"
        args.input_mode = "epub"
    elif args.command == "publish-dir":
        args.command = "run"
        args.input_mode = "dir"
    elif args.command == "publish-zip":
        args.command = "run"
        args.input_mode = "zip"
    elif args.command == "run":
        if clean_text(args.epub):
            args.input_mode = "epub"
        elif clean_text(args.input_dir):
            args.input_mode = "dir"
        else:
            args.input_mode = "zip"
    else:
        args.input_mode = ""


def main() -> int:
    args = parse_args()
    normalize_args(args)
    if clean_text(args.source).lower() == "gutenberg":
        raise SystemExit(
            "source=gutenberg is not supported by tools/reader1/publish_books.py. "
            "Continue using the Gutenberg pipeline for legacy-format books."
        )
    args.rclone_remote_effective = "" if args.skip_rclone else detect_rclone_remote(args.rclone_bin, args.rclone_remote)

    state_path = Path(args.state_file).resolve()
    registry_path = Path(args.registry).resolve()
    index_root = Path(args.index_root).resolve()
    state = ensure_pipeline_state(state_path)
    registry = ensure_registry_shape(registry_path)

    if args.command == "status":
        print(render_status(state))
        return 0

    logger = RunLogger(args.command)
    logger.log(f"[start] command={args.command}")

    if args.command == "resume":
        queue_ids = queue_from_state(state)
        if not queue_ids:
            logger.log("[resume] no unfinished run")
            return 0
        items = items_from_state(state)
        return run_pipeline(args, state_path, registry_path, index_root, state, registry, items, "resume", logger)

    if not clean_text(args.source):
        raise SystemExit("--source is required")

    ensure_source_defaults(registry, args.source)
    items, extracted_root, run_id, queue_dir = prepare_new_run_items(args, registry, state, index_root, logger)
    state["reader1_cli"]["runtime_mode"] = "publish" if args.publish else "local"
    update_current_run(
        state,
        run_id=run_id,
        source=args.source,
        input_mode=args.input_mode,
        queue_dir=str(queue_dir),
        candidate_ids=[item.reader_id for item in items],
        status="queued",
        total=len(items),
        started_at=iso_now(),
        log_path=str(logger.path),
    )
    save_state(state_path, state)
    write_json(registry_path, registry)

    try:
        return run_pipeline(args, state_path, registry_path, index_root, state, registry, items, "run", logger)
    finally:
        if extracted_root:
            shutil.rmtree(extracted_root, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
