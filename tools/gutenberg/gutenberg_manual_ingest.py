#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

THIS_DIR = Path(__file__).resolve().parent
TOOLS_DIR = THIS_DIR.parent
CATALOG_TOOLS_DIR = TOOLS_DIR / "catalog"
SEO_TOOLS_DIR = TOOLS_DIR / "seo"
for candidate in (str(CATALOG_TOOLS_DIR), str(SEO_TOOLS_DIR), str(THIS_DIR)):
    if candidate not in sys.path:
        sys.path.insert(0, candidate)

from sync_gutenberg_indexes import load_book_maps
from update_gutenberg_catalog import (
    BUILD_BOOK_LOCATIONS,
    BUILD_LANG_INDEXES,
    BUILD_NEWEST_RELEASES,
    BUILD_SEO_INDEXES,
    DEFAULT_NEWEST_MAX_BOOKS,
    DEFAULT_NEWEST_WINDOW_DAYS,
    DEFAULT_SAFETY_WINDOW_DAYS,
    DEFAULT_STATE_R2_KEY,
    INDEX_ROOT,
    ROOT_DIR,
    SEO_ROOT,
    SYNC_GUTENBERG_INDEXES,
    UPLOAD_SEO_INDEXES,
    changed_files,
    clean_text,
    collect_summary,
    download_preferred_epub,
    ensure_state_shape,
    get_r2_s3_config,
    get_state_bucket,
    iso_now,
    parse_catalog_bootstrap_candidates,
    parse_rdf_metadata,
    r2_get_json,
    r2_put_json,
    run_cmd,
    snapshot_mtimes,
    stage_unpacked_epub,
    update_book_state,
    upload_api_files,
    upload_content_directory,
)


CONTENT_ROOT = ROOT_DIR / "books" / "content"
RUNS_DIR = Path("/tmp/readerpub_gutenberg_runs")


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
        line = f"[manual-gutenberg] {message}"
        print(line, flush=True)
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")


def runtime_mode() -> str:
    if get_r2_s3_config():
        return "aws-r2"
    return "wrangler"


def has_runtime_credentials() -> Tuple[bool, str]:
    if get_r2_s3_config():
        return True, "R2_S3_ENDPOINT + R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY"
    api_token = clean_text(os.environ.get("CLOUDFLARE_API_TOKEN", ""))
    if api_token:
        return True, "CLOUDFLARE_API_TOKEN"
    return False, "Missing R2 S3 credentials and CLOUDFLARE_API_TOKEN"


def describe_resume_hint() -> str:
    return "python3 tools/gutenberg/gutenberg_manual_ingest.py resume"


def ensure_manual_cli_state(state: dict) -> dict:
    payload = ensure_state_shape(state)
    payload.setdefault("last_successful_gutenberg_id", 0)
    payload.setdefault("manual_cli", {})
    payload["manual_cli"].setdefault("last_scan", {})
    payload["manual_cli"].setdefault("current_run", {})
    payload["manual_cli"].setdefault("runtime_mode", runtime_mode())
    payload["manual_cli"].setdefault("state_load_ok", False)
    return payload


def load_book_location_items(index_root: Path) -> Dict[str, dict]:
    data = read_json(index_root / "book-locations.json", {}) or {}
    items = data.get("items") or {}
    return items if isinstance(items, dict) else {}


def detect_max_gutenberg_id(index_root: Path) -> int:
    items = load_book_location_items(index_root)
    max_id = 0
    for item in items.values():
        if not isinstance(item, dict):
            continue
        if clean_text(item.get("source", "")).lower() != "gutenberg":
            continue
        source_book_id = clean_text(item.get("sourceBookId") or item.get("readerId") or "")
        if source_book_id.isdigit():
            max_id = max(max_id, int(source_book_id))
    return max_id


def queue_from_state(state: dict) -> List[str]:
    current_run = (state.get("manual_cli") or {}).get("current_run") or {}
    candidate_ids = [str(value) for value in current_run.get("candidate_ids") or [] if str(value).isdigit()]
    if not candidate_ids:
        pending_retry = state.get("pending_retry") or {}
        candidate_ids = sorted([str(value) for value in pending_retry.keys() if str(value).isdigit()], key=lambda value: int(value))
    if not candidate_ids:
        return []
    processed = state.get("processed") or {}
    queue = []
    for book_id in candidate_ids:
        item = processed.get(book_id, {})
        status = clean_text(item.get("status", ""))
        if status in {"success", "skipped_missing_preferred_epub"}:
            continue
        queue.append(book_id)
    return queue


def discover_new_queue(index_root: Path, state: dict, logger: RunLogger | None = None) -> tuple[int, List[str]]:
    max_gutenberg_id = detect_max_gutenberg_id(index_root)
    existing_global_books, _ = load_book_maps(index_root)
    existing_ids = set(existing_global_books.keys())
    candidate_ids = sorted(parse_catalog_bootstrap_candidates(max_gutenberg_id), key=lambda value: int(value))
    queue = []
    for book_id in candidate_ids:
        processed = (state.get("processed") or {}).get(book_id, {})
        if book_id in existing_ids:
            continue
        if clean_text(processed.get("status", "")) == "success":
            continue
        queue.append(book_id)
    if logger:
        logger.log(
            f"[scan] max_gutenberg_id={max_gutenberg_id} next_start={max_gutenberg_id + 1} "
            f"found={len(candidate_ids)} pending={len(queue)}"
        )
    return max_gutenberg_id, queue


def update_current_run(state: dict, **fields) -> None:
    manual_state = state.setdefault("manual_cli", {})
    current_run = manual_state.setdefault("current_run", {})
    current_run.update(fields)
    current_run["updated_at"] = iso_now()


def set_run_progress(state: dict, *, book_id: str = "", phase: str = "", index: int = 0, total: int = 0, status: str = "") -> None:
    fields = {}
    if book_id:
        fields["current_book_id"] = str(book_id)
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


def render_scan_summary(last_scan: dict) -> List[str]:
    if not last_scan:
        return []
    return [
        f"last_scan_at: {clean_text(last_scan.get('scanned_at', '')) or '-'}",
        f"last_scan_max_gutenberg_id: {clean_text(last_scan.get('max_gutenberg_id', '')) or '-'}",
        f"last_scan_next_start_id: {clean_text(last_scan.get('next_start_id', '')) or '-'}",
        f"last_scan_candidates: {clean_text(last_scan.get('candidate_count', '')) or '0'}",
        f"last_scan_log: {clean_text(last_scan.get('log_path', '')) or '-'}",
    ]


def render_status(index_root: Path, state: dict) -> str:
    max_gutenberg_id = detect_max_gutenberg_id(index_root)
    next_start_id = max_gutenberg_id + 1
    manual_cli = state.get("manual_cli") or {}
    current_run = manual_cli.get("current_run") or {}
    last_scan = manual_cli.get("last_scan") or {}
    creds_ok, creds_source = has_runtime_credentials()
    state_load_ok = bool(manual_cli.get("state_load_ok"))
    if not creds_ok and state_load_ok and runtime_mode() == "wrangler":
        creds_ok = True
        creds_source = "active wrangler session"
    current_candidate_ids = [str(value) for value in current_run.get("candidate_ids") or [] if str(value).isdigit()]
    processed = state.get("processed") or {}
    current_success = 0
    current_failed = 0
    current_skipped = 0
    current_pending = 0
    for book_id in current_candidate_ids:
        item = processed.get(book_id) or {}
        status = clean_text(item.get("status", ""))
        if status == "success":
            current_success += 1
        elif status == "failed":
            current_failed += 1
        elif status == "skipped_missing_preferred_epub":
            current_skipped += 1
        elif status:
            current_pending += 1
    lines = [
        f"runtime_mode: {runtime_mode()}",
        f"runtime_credentials: {'ok' if creds_ok else 'missing'} ({creds_source})",
        f"max_gutenberg_id: {max_gutenberg_id}",
        f"next_start_id: {next_start_id}",
    ]
    lines.extend(render_scan_summary(last_scan))
    if current_run:
        lines.extend(
            [
                f"current_run_status: {clean_text(current_run.get('status', '')) or 'idle'}",
                f"current_run_candidates: {len(current_run.get('candidate_ids') or [])}",
                f"current_run_book: {clean_text(current_run.get('current_book_id', '')) or '-'}",
                f"current_run_phase: {clean_text(current_run.get('current_phase', '')) or '-'}",
                f"current_run_progress: {clean_text(current_run.get('current_index', '0'))}/{clean_text(current_run.get('total', '0'))}",
                f"current_run_success: {current_success}",
                f"current_run_pending: {current_pending}",
                f"current_run_failed: {current_failed}",
                f"current_run_skipped_missing_pg_epub: {current_skipped}",
                f"current_run_started_at: {clean_text(current_run.get('started_at', '')) or '-'}",
                f"current_run_finished_at: {clean_text(current_run.get('finished_at', '')) or '-'}",
                f"current_run_log: {clean_text(current_run.get('log_path', ''))}",
            ]
        )
    return "\n".join(lines)


def load_state_for_command(command: str, bucket: str, key: str, wrangler_bin: str) -> dict:
    try:
        state = ensure_manual_cli_state(r2_get_json(bucket, key, wrangler_bin))
        state.setdefault("manual_cli", {})["state_load_ok"] = True
        state["manual_cli"]["runtime_mode"] = runtime_mode()
        return state
    except Exception as error:
        if command in {"status", "scan"}:
            state = ensure_manual_cli_state({})
            state.setdefault("manual_cli", {}).setdefault("load_warning", str(error))
            state["manual_cli"]["runtime_mode"] = runtime_mode()
            return state
        raise RuntimeError(
            "Unable to load pipeline state from R2. "
            "Set either R2_S3_ENDPOINT/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY "
            "or a working wrangler auth session, then rerun the command."
        ) from error


def chunk_items(items: List[dict], size: int) -> Iterable[List[dict]]:
    for index in range(0, len(items), size):
        yield items[index:index + size]


def merge_dict_items(existing_path: Path, new_path: Path, target_path: Path) -> None:
    existing = read_json(existing_path, {}) or {}
    new = read_json(new_path, {}) or {}
    existing_items = existing.get("items") if isinstance(existing.get("items"), dict) else {}
    new_items = new.get("items") if isinstance(new.get("items"), dict) else {}
    payload = dict(existing if existing else new)
    payload["version"] = new.get("version") or existing.get("version") or str(int(datetime.now(timezone.utc).timestamp()))
    payload["items"] = {**existing_items, **new_items}
    target_path.parent.mkdir(parents=True, exist_ok=True)
    with target_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))


def merge_author_shard(existing_path: Path, new_path: Path, target_path: Path) -> None:
    existing = read_json(existing_path, {}) or {}
    new = read_json(new_path, {}) or {}
    existing_items = existing.get("items") if isinstance(existing.get("items"), dict) else {}
    new_items = new.get("items") if isinstance(new.get("items"), dict) else {}
    merged = {}
    merged.update(existing_items)
    for slug, author in new_items.items():
        if slug not in merged:
            merged[slug] = author
            continue
        current = dict(merged[slug] or {})
        current.update({key: value for key, value in author.items() if key != "books"})
        books = {}
        for book in current.get("books") or []:
            key = clean_text(book.get("slug") or book.get("id") or book.get("title"))
            if key:
                books[key] = book
        for book in author.get("books") or []:
            key = clean_text(book.get("slug") or book.get("id") or book.get("title"))
            if key:
                books[key] = book
        current["books"] = sorted(
            books.values(),
            key=lambda item: (clean_text(item.get("title", "")).lower(), clean_text(item.get("id", ""))),
        )
        current["count"] = len(current["books"])
        merged[slug] = current
    payload = dict(existing if existing else new)
    payload["version"] = new.get("version") or existing.get("version") or str(int(datetime.now(timezone.utc).timestamp()))
    payload["items"] = merged
    target_path.parent.mkdir(parents=True, exist_ok=True)
    with target_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))


def merge_sitemap_family(existing_root: Path, new_root: Path, patch_root: Path, family: str) -> List[dict]:
    merged = {}
    for path in sorted(existing_root.glob(f"{family}-*.json")):
        data = read_json(path, {}) or {}
        for item in data.get("items") or []:
            loc = clean_text(item.get("loc", ""))
            if loc:
                merged.setdefault(loc, item)
    for path in sorted(new_root.glob(f"{family}-*.json")):
        data = read_json(path, {}) or {}
        for item in data.get("items") or []:
            loc = clean_text(item.get("loc", ""))
            if loc:
                merged.setdefault(loc, item)
    for old in patch_root.glob(f"{family}-*.json"):
        old.unlink()
    items = list(merged.values())
    chunks_meta = []
    for idx, chunk in enumerate(chunk_items(items, 5000), start=1):
        slug = f"{family}-{idx}.json"
        out = patch_root / slug
        write_json(out, {"items": chunk})
        chunks_meta.append({"slug": slug, "path": f"/sitemaps/{family}-{idx}.xml", "count": len(chunk)})
    return chunks_meta


def merge_single_sitemap(existing_path: Path, new_path: Path, target_path: Path) -> dict:
    merged = {}
    for path in [existing_path, new_path]:
        data = read_json(path, {}) or {}
        for item in data.get("items") or []:
            loc = clean_text(item.get("loc", ""))
            if loc:
                merged.setdefault(loc, item)
    payload = {"items": list(merged.values())}
    write_json(target_path, payload)
    return {"slug": target_path.name, "path": f"/sitemaps/{target_path.stem}.xml", "count": len(payload["items"])}


def build_selective_seo_patch(
    book_ids: List[str],
    staged_content_root: Path,
    python_bin: str,
    logger: RunLogger,
) -> Path:
    temp_root = Path(tempfile.mkdtemp(prefix="readerpub-gutenberg-seo-", dir="/tmp"))
    temp_build = temp_root / "build"
    patch_root = temp_root / "patch"
    patch_sitemaps = patch_root / "sitemaps"
    patch_root.mkdir(parents=True, exist_ok=True)
    patch_sitemaps.mkdir(parents=True, exist_ok=True)

    logger.log(f"[seo-build] building selective SEO for {len(book_ids)} books")
    run_cmd(
        [
            python_bin,
            str(BUILD_SEO_INDEXES),
            "--index-root",
            str(INDEX_ROOT),
            "--content-root",
            str(staged_content_root),
            "--output-root",
            str(temp_build),
            "--book-id",
            ",".join(book_ids),
        ]
    )

    existing_seo = SEO_ROOT
    temp_seo = temp_build / "seo"

    for path in sorted((temp_seo / "book-shards").glob("*.json")):
        merge_dict_items(existing_seo / "book-shards" / path.name, path, patch_root / "book-shards" / path.name)
    logger.log(f"[seo-books] merged {len(list((temp_seo / 'book-shards').glob('*.json')))} shards")

    for path in sorted((temp_seo / "author-shards").glob("*.json")):
        merge_author_shard(existing_seo / "author-shards" / path.name, path, patch_root / "author-shards" / path.name)
    logger.log(f"[seo-authors] merged {len(list((temp_seo / 'author-shards').glob('*.json')))} shards")

    books_chunks = merge_sitemap_family(existing_seo / "sitemaps", temp_seo / "sitemaps", patch_sitemaps, "books")
    chapter_chunks = merge_sitemap_family(existing_seo / "sitemaps", temp_seo / "sitemaps", patch_sitemaps, "chapters")
    authors_meta = merge_single_sitemap(existing_seo / "sitemaps" / "authors.json", temp_seo / "sitemaps" / "authors.json", patch_sitemaps / "authors.json")

    existing_index = read_json(existing_seo / "sitemaps" / "index.json", {}) or {}
    other_entries = [
        entry
        for entry in existing_index.get("sitemaps") or []
        if not (
            clean_text(entry.get("slug", "")).startswith("books-")
            or clean_text(entry.get("slug", "")).startswith("chapters-")
            or clean_text(entry.get("slug", "")) == "authors.json"
        )
    ]
    merged_index = {
        "version": read_json(temp_seo / "version.json", {}).get("version") or existing_index.get("version") or str(int(datetime.now(timezone.utc).timestamp())),
        "generatedAt": iso_now(),
        "sitemaps": books_chunks + chapter_chunks + [authors_meta] + other_entries,
    }
    write_json(patch_sitemaps / "index.json", merged_index)

    existing_version = read_json(existing_seo / "version.json", {}) or {}
    temp_version = read_json(temp_seo / "version.json", {}) or {}
    version_payload = dict(existing_version)
    version_payload.update(
        {
            "version": temp_version.get("version") or existing_version.get("version") or str(int(datetime.now(timezone.utc).timestamp())),
            "generatedAt": iso_now(),
            "books": existing_version.get("books", 0) + temp_version.get("books", 0),
            "authors": existing_version.get("authors", 0),
            "categories": existing_version.get("categories", 0),
            "chapters": sum(item["count"] for item in chapter_chunks),
            "failures": existing_version.get("failures", 0),
        }
    )
    write_json(patch_root / "version.json", version_payload)

    logger.log(
        f"[seo-sitemaps] books_chunks={len(books_chunks)} chapters_chunks={len(chapter_chunks)} "
        f"authors={authors_meta['count']}"
    )
    return patch_root


def upload_seo_patch(patch_root: Path, logger: RunLogger) -> None:
    s3_config = get_r2_s3_config()
    if s3_config:
        env = os.environ.copy()
        env["AWS_ACCESS_KEY_ID"] = s3_config["access_key"]
        env["AWS_SECRET_ACCESS_KEY"] = s3_config["secret_key"]
        env["AWS_EC2_METADATA_DISABLED"] = "true"
        env["AWS_PAGER"] = ""
        subprocess.run(
            [
                "aws",
                "s3",
                "sync",
                str(patch_root),
                "s3://reader-books/seo",
                "--endpoint-url",
                s3_config["endpoint"],
                "--only-show-errors",
            ],
            check=True,
            text=True,
            capture_output=True,
            env=env,
        )
        logger.log("[seo-upload] uploaded via aws s3 sync")
        return
    run_cmd([str(UPLOAD_SEO_INDEXES), str(patch_root)])
    logger.log("[seo-upload] uploaded via upload_seo_indexes.sh")


def verify_preferred_epub_candidates(candidate_ids: List[str], logger: RunLogger) -> Tuple[List[str], List[str]]:
    valid: List[str] = []
    missing: List[str] = []
    total = len(candidate_ids)
    for index, book_id in enumerate(candidate_ids, start=1):
        tmp_dir = Path(tempfile.mkdtemp(prefix=f"readerpub-verify-{book_id}-", dir="/tmp"))
        destination = tmp_dir / f"pg{book_id}.epub"
        try:
            download_preferred_epub(book_id, destination)
            valid.append(book_id)
            logger.log(f"[verify {index}/{total}] id={book_id} preferred_epub=ok")
        except FileNotFoundError:
            missing.append(book_id)
            logger.log(f"[verify {index}/{total}] id={book_id} preferred_epub=missing")
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)
    return valid, missing


def build_newest(state_file: Path, newest_window_days: int, newest_max_books: int, logger: RunLogger) -> None:
    run_cmd(
        [
            sys.executable,
            str(BUILD_NEWEST_RELEASES),
            "--state",
            str(state_file),
            "--index-root",
            str(INDEX_ROOT),
            "--window-days",
            str(newest_window_days),
            "--max-books",
            str(newest_max_books),
        ]
    )
    logger.log(f"[newest] rebuilt newest releases with max={newest_max_books}")


def fail_with_guidance(logger: RunLogger, *, book_id: str = "", phase: str = "", error: Exception | str = "") -> None:
    if book_id:
        logger.log(f"[failed] book={book_id} phase={phase or '-'} error={error}")
    else:
        logger.log(f"[failed] phase={phase or '-'} error={error}")
    logger.log("[action] retry after fixing the issue:")
    logger.log(f"[action] {describe_resume_hint()}")


def run_ingest_pipeline(args, state: dict, queue: List[str], mode: str, logger: RunLogger) -> int:
    bucket = get_state_bucket(args.state_r2_bucket)
    temp_root = Path(tempfile.mkdtemp(prefix="readerpub-gutenberg-manual-", dir=args.tmp_dir))
    staged_content_root = temp_root / "content"
    state_uploaded = False
    current_run_uploaded_ids: List[str] = []
    state["last_run_started_at"] = iso_now()
    update_current_run(
        state,
        mode=mode,
        status="running",
        started_at=state["last_run_started_at"],
        candidate_ids=queue,
        total=len(queue),
        log_path=str(logger.path),
    )
    logger.log(f"[run] mode={mode} total={len(queue)} log={logger.path}")
    try:
        if queue:
            logger.log("[scan] fetching RDF metadata for candidate books")
            for index, book_id in enumerate(queue, start=1):
                set_run_progress(state, book_id=book_id, phase="rdf_metadata", index=index, total=len(queue), status="running")
                metadata = parse_rdf_metadata(book_id)
                state.setdefault("manual_cli", {}).setdefault("rdf_metadata", {})[book_id] = metadata
                logger.log(f"[scan] metadata {index}/{len(queue)} id={book_id}")
        index_snapshot = snapshot_mtimes(INDEX_ROOT)

        for index, book_id in enumerate(queue, start=1):
            set_run_progress(state, book_id=book_id, phase="prepare", index=index, total=len(queue), status="running")
            item = update_book_state(
                state,
                book_id,
                status="discovered",
                source="gutenberg",
                source_book_id=book_id,
                source_release_date=((state.get("manual_cli") or {}).get("rdf_metadata") or {}).get(book_id, {}).get("release_date", ""),
                rdf_metadata=((state.get("manual_cli") or {}).get("rdf_metadata") or {}).get(book_id, {}),
                last_error="",
            )
            book_temp = temp_root / book_id
            epub_file = book_temp / f"pg{book_id}.epub"
            unpack_dir = book_temp / "unpacked"
            logger.log(f"[books {index}/{len(queue)}] id={book_id} phase=download")
            try:
                item["phase"] = "download"
                set_run_progress(state, book_id=book_id, phase="download", index=index, total=len(queue), status="running")
                epub_url = download_preferred_epub(book_id, epub_file)
                item["downloaded_at"] = iso_now()
                item["preferred_epub_url"] = epub_url
                item["status"] = "downloaded"

                logger.log(f"[books {index}/{len(queue)}] id={book_id} phase=unpack")
                item["phase"] = "unpack"
                set_run_progress(state, book_id=book_id, phase="unpack", index=index, total=len(queue), status="running")
                staged = stage_unpacked_epub(book_id, epub_file, unpack_dir)
                item["normalized_metadata"] = staged["metadata"]
                item["status"] = "staged_local"

                final_root = staged_content_root / book_id
                final_root.parent.mkdir(parents=True, exist_ok=True)
                if final_root.exists():
                    shutil.rmtree(final_root)
                shutil.move(str(unpack_dir), str(final_root))
                item["local_staged_at"] = iso_now()
                item["local_content_path"] = f"/books/content/{book_id}/"
                item["legacy_path"] = f"/books/content/{book_id}/"
                item["target_path"] = f"/books/content/{book_id}/"
                item["public_content_path"] = f"/books/content/{book_id}/"
                item["public_path_mode"] = "legacy"

                logger.log(f"[books {index}/{len(queue)}] id={book_id} phase=upload_content")
                item["phase"] = "upload_content"
                set_run_progress(state, book_id=book_id, phase="upload_content", index=index, total=len(queue), status="running")
                upload_content_directory(f"content/{book_id}", final_root, bucket, args.wrangler_bin, dry_run=False)
                item["uploaded_content_at"] = iso_now()
                item["status"] = "uploaded_content"
                current_run_uploaded_ids.append(book_id)
                state["last_successful_gutenberg_id"] = max(int(state.get("last_successful_gutenberg_id") or 0), int(book_id))
                item["phase"] = "upload_content_done"
                logger.log(f"[books {index}/{len(queue)}] id={book_id} phase=upload_content done")
            except FileNotFoundError as error:
                item["status"] = "skipped_missing_preferred_epub"
                item["last_error"] = str(error)
                item["attempts"] = int(item.get("attempts") or 0) + 1
                item["phase"] = "skipped_missing_preferred_epub"
                state["skipped_missing_preferred_epub"][book_id] = item
                logger.log(f"[books {index}/{len(queue)}] id={book_id} phase=skip reason=missing_pg_epub")
            except Exception as error:
                item["status"] = "failed"
                item["last_error"] = str(error)
                item["attempts"] = int(item.get("attempts") or 0) + 1
                item["phase"] = clean_text(item.get("phase", "")) or "unknown"
                state["failed"][book_id] = item
                fail_with_guidance(logger, book_id=book_id, phase=item["phase"], error=error)
            finally:
                shutil.rmtree(book_temp, ignore_errors=True)
                r2_put_json(bucket, args.state_r2_key, state, args.wrangler_bin, dry_run=False)

        if current_run_uploaded_ids:
            total = len(current_run_uploaded_ids)
            for index, book_id in enumerate(current_run_uploaded_ids, start=1):
                logger.log(f"[index {index}/{total}] id={book_id} build_lang_indexes")
                set_run_progress(state, book_id=book_id, phase="index_catalog", index=index, total=total, status="running")
                run_cmd(
                    [
                        args.python_bin,
                        str(BUILD_LANG_INDEXES),
                        "--input",
                        str(staged_content_root),
                        "--output",
                        str(INDEX_ROOT),
                        "--book-id",
                        book_id,
                    ]
                )
                update_book_state(state, book_id, status="indexed_catalog")

        local_state_file = temp_root / "state.for-indexes.json"
        write_json(local_state_file, state)
        set_run_progress(state, phase="book_locations", status="running")
        run_cmd(
            [
                args.python_bin,
                str(BUILD_BOOK_LOCATIONS),
                "--index-root",
                str(INDEX_ROOT),
                "--state",
                str(local_state_file),
            ]
        )
        logger.log("[index] rebuilt book-locations")

        set_run_progress(state, phase="discover_indexes", status="running")
        run_cmd([args.python_bin, str(SYNC_GUTENBERG_INDEXES), "--index-root", str(INDEX_ROOT)])
        logger.log("[index] refreshed Gutenberg discover indexes")

        local_state_file = temp_root / "state.for-newest.json"
        write_json(local_state_file, state)
        set_run_progress(state, phase="newest", status="running")
        build_newest(local_state_file, args.newest_window_days, args.newest_max_books, logger)

        api_changed = changed_files(INDEX_ROOT, index_snapshot)
        if api_changed:
            logger.log(f"[api-upload] uploading {len(api_changed)} changed files")
            set_run_progress(state, phase="upload_api", status="running")
            upload_api_files(api_changed, bucket, args.wrangler_bin, dry_run=False)
            uploaded_api_at = iso_now()
            for book_id in current_run_uploaded_ids:
                update_book_state(state, book_id, status="uploaded_api", uploaded_api_at=uploaded_api_at)

        if current_run_uploaded_ids and not args.skip_seo:
            set_run_progress(state, phase="seo_build", status="running")
            patch_root = build_selective_seo_patch(current_run_uploaded_ids, staged_content_root, args.python_bin, logger)
            set_run_progress(state, phase="seo_upload", status="running")
            upload_seo_patch(patch_root, logger)
            uploaded_seo_at = iso_now()
            for book_id in current_run_uploaded_ids:
                update_book_state(state, book_id, status="uploaded_seo", uploaded_seo_at=uploaded_seo_at)

        for book_id in current_run_uploaded_ids:
            item = update_book_state(state, book_id, status="success")
            item.setdefault("catalog_added_at", iso_now())
            state["success"][book_id] = item
            state["pending_retry"].pop(book_id, None)
            state["failed"].pop(book_id, None)

        for book_id, item in (state.get("processed") or {}).items():
            if clean_text(item.get("status", "")) not in {"success", "skipped_missing_preferred_epub"}:
                state["pending_retry"][book_id] = item

        state["last_run_finished_at"] = iso_now()
        if current_run_uploaded_ids or not queue:
            state["last_successful_run_at"] = state["last_run_finished_at"]
        update_current_run(state, status="success", finished_at=state["last_run_finished_at"], current_phase="done")
        r2_put_json(bucket, args.state_r2_key, state, args.wrangler_bin, dry_run=False)
        state_uploaded = True

        newest_payload = read_json(INDEX_ROOT / "discover" / "newest.json", {"count": 0}) or {"count": 0}
        summary = collect_summary(state, queue, set(), newest_payload)
        logger.log("[done] " + json.dumps(summary, ensure_ascii=False))
        return 0
    except Exception as error:
        state["last_run_finished_at"] = iso_now()
        update_current_run(state, status="failed", finished_at=state["last_run_finished_at"], last_error=str(error))
        fail_with_guidance(
            logger,
            book_id=clean_text(((state.get("manual_cli") or {}).get("current_run") or {}).get("current_book_id", "")),
            phase=clean_text(((state.get("manual_cli") or {}).get("current_run") or {}).get("current_phase", "")),
            error=error,
        )
        r2_put_json(bucket, args.state_r2_key, state, args.wrangler_bin, dry_run=False)
        state_uploaded = True
        return 1
    finally:
        if not state_uploaded:
            try:
                r2_put_json(bucket, args.state_r2_key, state, args.wrangler_bin, dry_run=False)
            except Exception:
                pass
        shutil.rmtree(temp_root, ignore_errors=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Manual terminal-first Gutenberg ingest for ReaderPub.")
    parser.add_argument("command", choices=["status", "scan", "run", "resume", "seo", "newest"])
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--state-r2-key", default=os.environ.get("GUTENBERG_STATE_R2_KEY", DEFAULT_STATE_R2_KEY))
    parser.add_argument("--state-r2-bucket", default=os.environ.get("GUTENBERG_STATE_R2_BUCKET", ""))
    parser.add_argument("--wrangler-bin", default=os.environ.get("WRANGLER_BIN", "wrangler"))
    parser.add_argument("--python-bin", default=os.environ.get("PYTHON_BIN", sys.executable or "python3"))
    parser.add_argument("--safety-window-days", type=int, default=DEFAULT_SAFETY_WINDOW_DAYS)
    parser.add_argument("--newest-window-days", type=int, default=DEFAULT_NEWEST_WINDOW_DAYS)
    parser.add_argument("--newest-max-books", type=int, default=DEFAULT_NEWEST_MAX_BOOKS)
    parser.add_argument("--skip-seo", action="store_true")
    parser.add_argument("--verify-epub-on-scan", action="store_true")
    parser.add_argument("--tmp-dir", default="/tmp")
    args = parser.parse_args()

    bucket = get_state_bucket(args.state_r2_bucket)
    state = load_state_for_command(args.command, bucket, args.state_r2_key, args.wrangler_bin)

    if args.command == "status":
        output = render_status(INDEX_ROOT, state)
        warning = clean_text(((state.get("manual_cli") or {}).get("load_warning", "")))
        if warning:
            output += "\nstate_warning: unavailable (using index-only status)"
        print(output)
        return 0

    logger = RunLogger(args.command)

    if args.command == "scan":
        max_gutenberg_id, queue = discover_new_queue(INDEX_ROOT, state, logger=logger)
        if args.limit > 0:
            queue = queue[: args.limit]
        missing_preferred: List[str] = []
        if args.verify_epub_on_scan and queue:
            queue, missing_preferred = verify_preferred_epub_candidates(queue, logger)
        manual_state = state.setdefault("manual_cli", {})
        manual_state["last_scan"] = {
            "max_gutenberg_id": max_gutenberg_id,
            "next_start_id": max_gutenberg_id + 1,
            "candidate_count": len(queue),
            "candidate_ids": queue,
            "missing_preferred_epub_count": len(missing_preferred),
            "missing_preferred_epub_ids": missing_preferred,
            "scanned_at": iso_now(),
            "log_path": str(logger.path),
        }
        update_current_run(
            state,
            status="scanned",
            candidate_ids=queue,
            total=len(queue),
            started_at=iso_now(),
            log_path=str(logger.path),
        )
        r2_put_json(bucket, args.state_r2_key, state, args.wrangler_bin, dry_run=False)
        logger.log(
            f"[scan-summary] next_start={max_gutenberg_id + 1} candidates={len(queue)} "
            f"missing_preferred_epub={len(missing_preferred)}"
        )
        return 0

    if args.command == "newest":
        temp_root = Path(tempfile.mkdtemp(prefix="readerpub-gutenberg-newest-", dir=args.tmp_dir))
        try:
            state_file = temp_root / "state.json"
            write_json(state_file, state)
            index_snapshot = snapshot_mtimes(INDEX_ROOT)
            build_newest(state_file, args.newest_window_days, args.newest_max_books, logger)
            bucket = get_state_bucket(args.state_r2_bucket)
            api_changed = changed_files(INDEX_ROOT, index_snapshot)
            if api_changed:
                upload_api_files(api_changed, bucket, args.wrangler_bin, dry_run=False)
            logger.log(f"[newest] uploaded {len(api_changed)} changed api files")
            return 0
        finally:
            shutil.rmtree(temp_root, ignore_errors=True)

    if args.command == "seo":
        current_run = (state.get("manual_cli") or {}).get("current_run") or {}
        candidate_ids = [str(value) for value in current_run.get("candidate_ids") or [] if str(value).isdigit()]
        book_ids = []
        for book_id in candidate_ids:
            item = (state.get("processed") or {}).get(book_id, {})
            if clean_text(item.get("status", "")) in {"uploaded_api", "indexed_catalog", "uploaded_content", "uploaded_seo", "success"}:
                book_ids.append(book_id)
        if args.limit > 0:
            book_ids = book_ids[: args.limit]
        if not book_ids:
            logger.log("[seo] no pending books found")
            return 0
        temp_root = Path(tempfile.mkdtemp(prefix="readerpub-gutenberg-seo-only-", dir=args.tmp_dir))
        try:
            staged_content_root = temp_root / "content"
            for book_id in book_ids:
                source = CONTENT_ROOT / book_id
                target = staged_content_root / book_id
                if target.exists():
                    shutil.rmtree(target)
                shutil.copytree(source, target)
            patch_root = build_selective_seo_patch(book_ids, staged_content_root, args.python_bin, logger)
            upload_seo_patch(patch_root, logger)
            uploaded_seo_at = iso_now()
            for book_id in book_ids:
                update_book_state(state, book_id, status="uploaded_seo", uploaded_seo_at=uploaded_seo_at)
            r2_put_json(bucket, args.state_r2_key, state, args.wrangler_bin, dry_run=False)
            return 0
        finally:
            shutil.rmtree(temp_root, ignore_errors=True)

    if args.command == "resume":
        queue = queue_from_state(state)
        if not queue:
            logger.log("[resume] no unfinished run, falling back to run")
            max_gutenberg_id, queue = discover_new_queue(INDEX_ROOT, state, logger=logger)
            if args.limit > 0:
                queue = queue[: args.limit]
            update_current_run(
                state,
                status="running",
                candidate_ids=queue,
                total=len(queue),
                started_at=iso_now(),
                max_gutenberg_id=max_gutenberg_id,
                next_start_id=max_gutenberg_id + 1,
                log_path=str(logger.path),
            )
        return run_ingest_pipeline(args, state, queue, "resume", logger)

    if args.command == "run":
        max_gutenberg_id, queue = discover_new_queue(INDEX_ROOT, state, logger=logger)
        if args.limit > 0:
            queue = queue[: args.limit]
        update_current_run(
            state,
            status="running",
            candidate_ids=queue,
            total=len(queue),
            started_at=iso_now(),
            max_gutenberg_id=max_gutenberg_id,
            next_start_id=max_gutenberg_id + 1,
            log_path=str(logger.path),
        )
        return run_ingest_pipeline(args, state, queue, "run", logger)

    raise SystemExit(f"Unsupported command: {args.command}")


if __name__ == "__main__":
    raise SystemExit(main())
