#!/usr/bin/env python3
import argparse
import csv
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import xml.etree.ElementTree as ET
import zipfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

THIS_DIR = Path(__file__).resolve().parent
TOOLS_DIR = THIS_DIR.parent
CATALOG_TOOLS_DIR = TOOLS_DIR / "catalog"
SEO_TOOLS_DIR = TOOLS_DIR / "seo"
for candidate in (str(CATALOG_TOOLS_DIR), str(SEO_TOOLS_DIR)):
    if candidate not in sys.path:
        sys.path.insert(0, candidate)

from sync_gutenberg_indexes import load_book_maps


ROOT_DIR = Path(__file__).resolve().parents[2]
CONTENT_ROOT = ROOT_DIR / "books" / "content"
INDEX_ROOT = ROOT_DIR / "reader_lang_indexes"
SEO_ROOT = ROOT_DIR / "reader_seo_indexes"
DEPLOY_ROOT = ROOT_DIR / "deploy"
BUILD_LANG_INDEXES = ROOT_DIR / "tools" / "catalog" / "build_lang_indexes.py"
BUILD_BOOK_LOCATIONS = ROOT_DIR / "tools" / "catalog" / "build_book_locations.py"
BUILD_NEWEST_RELEASES = ROOT_DIR / "tools" / "catalog" / "build_newest_releases.py"
BUILD_SEO_INDEXES = ROOT_DIR / "tools" / "seo" / "build_seo_indexes.py"
SYNC_GUTENBERG_INDEXES = ROOT_DIR / "tools" / "catalog" / "sync_gutenberg_indexes.py"
UPLOAD_SEO_INDEXES = ROOT_DIR / "tools" / "seo" / "upload_seo_indexes.sh"

USER_AGENT = "ReaderPub Gutenberg Catalog Update/1.0 (+https://reader.pub)"
RSS_URL = "https://www.gutenberg.org/cache/epub/feeds/today.rss"
CATALOG_CSV_URL = "https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv"
RDF_URL_TEMPLATE = "https://www.gutenberg.org/cache/epub/{book_id}/pg{book_id}.rdf"
EPUB_URL_TEMPLATE = "https://www.gutenberg.org/cache/epub/{book_id}/pg{book_id}.epub"
DEFAULT_STATE_R2_KEY = "system/gutenberg-pipeline/state.json"
DEFAULT_SAFETY_WINDOW_DAYS = 14
DEFAULT_NEWEST_WINDOW_DAYS = 30
DEFAULT_NEWEST_MAX_BOOKS = 0
DEFAULT_TIMEOUT = 30
DEFAULT_RETRIES = 3
DEFAULT_RCLONE_REMOTE = "r2"

DC_NS = "http://purl.org/dc/elements/1.1/"
DCTERMS_NS = "http://purl.org/dc/terms/"
CONTAINER_NS = "urn:oasis:names:tc:opendocument:xmlns:container"
OPF_NS = "http://www.idpf.org/2007/opf"


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


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


def parse_timestamp(value: str) -> Optional[datetime]:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        parsed = datetime.fromisoformat(raw)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return None


def parse_release_date(value: str) -> Optional[date]:
    raw = clean_text(value)
    if not raw:
        return None
    for fmt in ("%Y-%m-%d", "%b %d, %Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def log(message: str) -> None:
    print(f"[gutenberg-update] {message}", flush=True)


def warn(message: str) -> None:
    print(f"[gutenberg-update] WARNING: {message}", file=sys.stderr, flush=True)


def run_cmd(cmd: List[str], dry_run: bool = False, capture_output: bool = False) -> subprocess.CompletedProcess:
    if dry_run:
        log("[dry-run] " + " ".join(subprocess.list2cmdline([arg]) if " " in arg else arg for arg in cmd))
        class DummyResult:
            returncode = 0
            stdout = ""
            stderr = ""
        return DummyResult()  # type: ignore[return-value]
    return subprocess.run(
        cmd,
        check=True,
        text=True,
        capture_output=capture_output,
    )


def command_exists(cmd: str) -> bool:
    return shutil.which(cmd) is not None


def detect_rclone_remote(rclone_bin: str, preferred_remote: str = "") -> str:
    remote = clean_text(preferred_remote).rstrip(":")
    if remote:
        return remote
    if not command_exists(rclone_bin):
        return ""
    try:
        result = run_cmd([rclone_bin, "listremotes"], capture_output=True)
    except Exception:
        return ""
    remotes = {line.strip().rstrip(":") for line in result.stdout.splitlines() if line.strip()}
    if DEFAULT_RCLONE_REMOTE in remotes:
        return DEFAULT_RCLONE_REMOTE
    return ""


def rclone_target(remote: str, bucket: str, key: str = "") -> str:
    base = f"{remote.rstrip(':')}:{bucket}"
    suffix = str(key or "").strip("/")
    return f"{base}/{suffix}" if suffix else base


def get_r2_s3_config() -> dict:
    endpoint = clean_text(os.environ.get("R2_S3_ENDPOINT") or os.environ.get("AWS_ENDPOINT_URL"))
    access_key = clean_text(os.environ.get("R2_ACCESS_KEY_ID") or os.environ.get("AWS_ACCESS_KEY_ID"))
    secret_key = clean_text(os.environ.get("R2_SECRET_ACCESS_KEY") or os.environ.get("AWS_SECRET_ACCESS_KEY"))
    if not endpoint or not access_key or not secret_key:
        return {}
    return {
        "endpoint": endpoint,
        "access_key": access_key,
        "secret_key": secret_key,
    }


def aws_env(config: dict) -> dict:
    env = os.environ.copy()
    env["AWS_ACCESS_KEY_ID"] = config["access_key"]
    env["AWS_SECRET_ACCESS_KEY"] = config["secret_key"]
    env["AWS_EC2_METADATA_DISABLED"] = "true"
    env["AWS_PAGER"] = ""
    return env


def aws_cp_to_r2(local_path: Path, bucket: str, key: str, config: dict, dry_run: bool = False) -> None:
    run_cmd(
        [
            "aws",
            "s3",
            "cp",
            str(local_path),
            f"s3://{bucket}/{key}",
            "--endpoint-url",
            config["endpoint"],
        ],
        dry_run=dry_run,
    ) if dry_run else subprocess.run(
        [
            "aws",
            "s3",
            "cp",
            str(local_path),
            f"s3://{bucket}/{key}",
            "--endpoint-url",
            config["endpoint"],
        ],
        check=True,
        text=True,
        capture_output=True,
        env=aws_env(config),
    )


def aws_cp_from_r2(bucket: str, key: str, local_path: Path, config: dict) -> subprocess.CompletedProcess:
    return subprocess.run(
        [
            "aws",
            "s3",
            "cp",
            f"s3://{bucket}/{key}",
            str(local_path),
            "--endpoint-url",
            config["endpoint"],
        ],
        check=True,
        text=True,
        capture_output=True,
        env=aws_env(config),
    )


def fetch_bytes(url: str, timeout: int = DEFAULT_TIMEOUT, retries: int = DEFAULT_RETRIES) -> bytes:
    last_error = None
    for attempt in range(retries + 1):
        try:
            request = Request(url, headers={"User-Agent": USER_AGENT})
            with urlopen(request, timeout=timeout) as response:
                return response.read()
        except (HTTPError, URLError) as error:
            last_error = error
            if attempt >= retries:
                raise
            time.sleep(1.5 * (attempt + 1))
    if last_error:
        raise last_error
    raise RuntimeError(f"Failed to fetch {url}")


def fetch_text(url: str, timeout: int = DEFAULT_TIMEOUT, retries: int = DEFAULT_RETRIES) -> str:
    payload = fetch_bytes(url, timeout=timeout, retries=retries)
    return payload.decode("utf-8", errors="replace")


def url_exists(url: str, timeout: int = DEFAULT_TIMEOUT) -> bool:
    request = Request(url, headers={"User-Agent": USER_AGENT}, method="HEAD")
    try:
        with urlopen(request, timeout=timeout):
            return True
    except Exception:
        try:
            request = Request(url, headers={"User-Agent": USER_AGENT})
            with urlopen(request, timeout=timeout) as response:
                response.read(1)
                return True
        except Exception:
            return False


def iter_files(root: Path) -> Iterable[Path]:
    for path in sorted(root.rglob("*")):
        if path.is_file():
            yield path


def snapshot_mtimes(root: Path) -> Dict[str, int]:
    if not root.exists():
        return {}
    snapshot = {}
    for path in iter_files(root):
        snapshot[str(path.relative_to(root))] = path.stat().st_mtime_ns
    return snapshot


def changed_files(root: Path, before: Dict[str, int]) -> List[Path]:
    if not root.exists():
        return []
    changed = []
    current = snapshot_mtimes(root)
    for rel, mtime in current.items():
        if before.get(rel) != mtime:
            changed.append(root / rel)
    return sorted(changed)


def remove_local_language_search_dirs(index_root: Path) -> List[Path]:
    removed: List[Path] = []
    for path in sorted(index_root.glob("lang/*/search")):
        if not path.is_dir():
            continue
        shutil.rmtree(path)
        removed.append(path)
    return removed


def ensure_state_shape(state: dict) -> dict:
    payload = dict(state or {})
    payload.setdefault("last_run_started_at", "")
    payload.setdefault("last_run_finished_at", "")
    payload.setdefault("last_successful_run_at", "")
    payload.setdefault("processed", {})
    payload.setdefault("pending_retry", {})
    payload.setdefault("success", {})
    payload.setdefault("failed", {})
    payload.setdefault("skipped_missing_preferred_epub", {})
    return payload


def get_state_bucket(env_bucket: str) -> str:
    return env_bucket or os.environ.get("EPUB_PUBLISH_R2_BUCKET") or "reader-books"


def r2_get_json(bucket: str, key: str, wrangler_bin: str) -> dict:
    tmp_dir = Path(tempfile.mkdtemp(prefix="readerpub-state-r2-", dir="/tmp"))
    tmp_file = tmp_dir / "state.json"
    try:
        s3_config = get_r2_s3_config()
        if s3_config:
            try:
                aws_cp_from_r2(bucket, key, tmp_file, s3_config)
            except subprocess.CalledProcessError as error:
                output = f"{error.stdout}\n{error.stderr}"
                if "Not Found" in output or "404" in output or "NoSuchKey" in output or "does not exist" in output:
                    return ensure_state_shape({})
                raise
        else:
            cmd = [wrangler_bin, "r2", "object", "get", f"{bucket}/{key}", "--file", str(tmp_file), "--remote"]
            try:
                subprocess.run(cmd, check=True, text=True, capture_output=True)
            except subprocess.CalledProcessError as error:
                output = f"{error.stdout}\n{error.stderr}"
                if "No such object" in output or "404" in output or "could not be found" in output:
                    return ensure_state_shape({})
                raise
        return ensure_state_shape(read_json(tmp_file, {}) or {})
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def r2_put_json(bucket: str, key: str, payload: dict, wrangler_bin: str, dry_run: bool = False) -> None:
    tmp_dir = Path(tempfile.mkdtemp(prefix="readerpub-state-put-", dir="/tmp"))
    tmp_file = tmp_dir / "state.json"
    try:
        write_json(tmp_file, payload)
        s3_config = get_r2_s3_config()
        if s3_config:
            aws_cp_to_r2(tmp_file, bucket, key, s3_config, dry_run=dry_run)
        else:
            run_cmd(
                [wrangler_bin, "r2", "object", "put", f"{bucket}/{key}", "--file", str(tmp_file), "--remote"],
                dry_run=dry_run,
            )
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def parse_today_rss_candidates() -> Set[str]:
    ids: Set[str] = set()
    try:
        root = ET.fromstring(fetch_text(RSS_URL))
    except Exception as error:
        warn(f"Unable to parse today.rss: {error}")
        return ids

    for item in root.findall(".//item"):
        link_text = clean_text(item.findtext("link"))
        guid_text = clean_text(item.findtext("guid"))
        source = link_text or guid_text
        if not source:
            continue
        match = None
        parsed = urlparse(source)
        for token in parsed.path.split("/"):
            if token.isdigit():
                match = token
                break
        if match:
            ids.add(match)
    return ids


def parse_catalog_recent_candidates(window_days: int) -> Set[str]:
    ids: Set[str] = set()
    cutoff = datetime.now(timezone.utc).date() - timedelta(days=window_days)
    text = fetch_text(CATALOG_CSV_URL)
    reader = csv.DictReader(text.splitlines())
    for row in reader:
        ebook_no = clean_text(row.get("Text#") or row.get("ID") or row.get("book_id") or "")
        if not ebook_no.isdigit():
            continue
        release_date = parse_release_date(row.get("Issued") or row.get("Release Date") or "")
        if release_date and release_date >= cutoff:
            ids.add(ebook_no)
    return ids


def parse_catalog_bootstrap_candidates(min_book_id_exclusive: int) -> Set[str]:
    ids: Set[str] = set()
    text = fetch_text(CATALOG_CSV_URL)
    reader = csv.DictReader(text.splitlines())
    for row in reader:
        ebook_no = clean_text(row.get("Text#") or row.get("ID") or row.get("book_id") or "")
        if not ebook_no.isdigit():
            continue
        if int(ebook_no) > min_book_id_exclusive:
            ids.add(ebook_no)
    return ids


def parse_rdf_metadata(book_id: str) -> dict:
    url = RDF_URL_TEMPLATE.format(book_id=book_id)
    try:
        text = fetch_text(url)
    except Exception as error:
        return {"book_id": book_id, "rdf_error": str(error)}

    try:
        root = ET.fromstring(text)
    except Exception as error:
        return {"book_id": book_id, "rdf_error": f"Invalid RDF XML: {error}"}

    title = clean_text(root.findtext(f".//{{{DC_NS}}}title"))
    creators = [clean_text(node.text) for node in root.findall(f".//{{{DC_NS}}}creator") if clean_text(node.text)]
    languages = [clean_text(node.text) for node in root.findall(f".//{{{DC_NS}}}language") if clean_text(node.text)]
    subjects = [clean_text(node.text) for node in root.findall(f".//{{{DC_NS}}}subject") if clean_text(node.text)]
    release_date = ""
    for tag in (
        f".//{{{DCTERMS_NS}}}issued",
        f".//{{{DCTERMS_NS}}}created",
    ):
        text_value = clean_text(root.findtext(tag))
        if text_value:
            release_date = text_value
            break
    return {
        "book_id": book_id,
        "title": title,
        "authors": creators,
        "languages": languages,
        "subjects": subjects,
        "release_date": release_date,
    }


def discover_candidates(window_days: int, bootstrap_from_id: int = 0) -> Tuple[List[str], Dict[str, dict]]:
    if bootstrap_from_id > 0:
        candidate_ids = sorted(parse_catalog_bootstrap_candidates(bootstrap_from_id), key=lambda value: int(value))
    else:
        rss_ids = parse_today_rss_candidates()
        csv_ids = parse_catalog_recent_candidates(window_days)
        candidate_ids = sorted(rss_ids.union(csv_ids), key=lambda value: int(value))
    metadata = {}
    for book_id in candidate_ids:
        metadata[book_id] = parse_rdf_metadata(book_id)
    return candidate_ids, metadata


def parse_container(container_path: Path) -> str:
    tree = ET.parse(container_path)
    root = tree.getroot()
    rootfile = root.find(f".//{{{CONTAINER_NS}}}rootfile")
    return rootfile.attrib.get("full-path", "").strip() if rootfile is not None else ""


def parse_opf(opf_path: Path) -> dict:
    tree = ET.parse(opf_path)
    root = tree.getroot()
    title = clean_text(root.findtext(f".//{{{DC_NS}}}title"))
    creators = [clean_text(node.text) for node in root.findall(f".//{{{DC_NS}}}creator") if clean_text(node.text)]
    languages = [clean_text(node.text) for node in root.findall(f".//{{{DC_NS}}}language") if clean_text(node.text)]
    subjects = [clean_text(node.text) for node in root.findall(f".//{{{DC_NS}}}subject") if clean_text(node.text)]
    cover_href = ""
    cover_id = ""
    for meta in root.findall(f".//{{{OPF_NS}}}meta"):
        if meta.attrib.get("name") == "cover":
            cover_id = meta.attrib.get("content") or ""
            break
    if cover_id:
        for item in root.findall(f".//{{{OPF_NS}}}item"):
            if item.attrib.get("id") == cover_id:
                cover_href = item.attrib.get("href") or ""
                break
    if not cover_href:
        for item in root.findall(f".//{{{OPF_NS}}}item"):
            props = clean_text(item.attrib.get("properties", ""))
            if "cover-image" in props:
                cover_href = item.attrib.get("href") or ""
                break
    return {
        "title": title,
        "authors": creators,
        "languages": languages,
        "subjects": subjects,
        "cover_href": cover_href,
    }


def validate_epub_variant(path: Path, book_id: str) -> None:
    expected = f"pg{book_id}.epub"
    if path.name != expected:
        raise RuntimeError(f"Unexpected EPUB filename: {path.name}; expected {expected}")


def download_preferred_epub(book_id: str, destination: Path) -> str:
    url = EPUB_URL_TEMPLATE.format(book_id=book_id)
    if not url_exists(url):
        raise FileNotFoundError(f"Preferred EPUB variant missing for {book_id}: {url}")
    payload = fetch_bytes(url)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(payload)
    return url


def stage_unpacked_epub(book_id: str, epub_file: Path, staging_root: Path) -> dict:
    validate_epub_variant(epub_file, book_id)
    with zipfile.ZipFile(epub_file) as archive:
        archive.testzip()
        archive.extractall(staging_root)

    container_path = staging_root / "META-INF" / "container.xml"
    if not container_path.exists():
        raise RuntimeError("Unpacked EPUB missing META-INF/container.xml")

    opf_rel = parse_container(container_path)
    if not opf_rel:
        raise RuntimeError("container.xml does not declare OPF")

    opf_path = staging_root / opf_rel
    if not opf_path.exists():
        raise RuntimeError(f"Declared OPF missing: {opf_rel}")

    opf_data = parse_opf(opf_path)
    cover_url = ""
    if opf_data.get("cover_href"):
        cover_rel = (Path(opf_rel).parent / opf_data["cover_href"]).as_posix()
        cover_url = f"/books/content/{book_id}/{cover_rel}"

    return {
        "opf_rel": opf_rel,
        "metadata": {
            "gutenberg_id": book_id,
            "title": opf_data.get("title") or book_id,
            "authors": opf_data.get("authors") or [],
            "language": (opf_data.get("languages") or ["und"])[0],
            "languages": opf_data.get("languages") or [],
            "subjects": opf_data.get("subjects") or [],
            "cover": cover_url,
        },
    }


def upload_file_to_r2(bucket: str, key: str, path: Path, wrangler_bin: str, dry_run: bool = False) -> None:
    s3_config = get_r2_s3_config()
    if s3_config:
        aws_cp_to_r2(path, bucket, key, s3_config, dry_run=dry_run)
        return
    run_cmd(
        [wrangler_bin, "r2", "object", "put", f"{bucket}/{key}", "--file", str(path), "--remote"],
        dry_run=dry_run,
    )


def upload_content_directory(
    prefix: str,
    book_root: Path,
    bucket: str,
    wrangler_bin: str,
    rclone_bin: str = "rclone",
    rclone_remote: str = "",
    dry_run: bool = False,
) -> None:
    if rclone_remote:
        run_cmd(
            [rclone_bin, "copy", str(book_root), rclone_target(rclone_remote, bucket, prefix)],
            dry_run=dry_run,
        )
        return
    for file_path in iter_files(book_root):
        rel = file_path.relative_to(book_root).as_posix()
        upload_file_to_r2(bucket, f"{prefix.rstrip('/')}/{rel}", file_path, wrangler_bin, dry_run=dry_run)


def upload_api_files(
    files: List[Path],
    bucket: str,
    wrangler_bin: str,
    rclone_bin: str = "rclone",
    rclone_remote: str = "",
    dry_run: bool = False,
) -> None:
    if not files:
        return
    if rclone_remote:
        tmp_dir = Path(tempfile.mkdtemp(prefix="readerpub-api-upload-", dir="/tmp"))
        try:
            for file_path in files:
                rel = file_path.relative_to(INDEX_ROOT)
                staged_path = tmp_dir / rel
                staged_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(file_path, staged_path)
            run_cmd(
                [rclone_bin, "copy", str(tmp_dir), rclone_target(rclone_remote, bucket, "api")],
                dry_run=dry_run,
            )
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        return
    for file_path in files:
        rel = file_path.relative_to(INDEX_ROOT).as_posix()
        upload_file_to_r2(bucket, f"api/{rel}", file_path, wrangler_bin, dry_run=dry_run)


def purge_remote_language_search_dirs(
    bucket: str,
    wrangler_bin: str,
    rclone_bin: str = "rclone",
    rclone_remote: str = "",
    dry_run: bool = False,
) -> None:
    # Legacy cleanup only: older catalog builds wrote api/lang/<lang>/search/*.
    # The current contract uses global-only search files under api/search/*.
    if rclone_remote:
        if dry_run:
            log(f"[dry-run] purge language search dirs under {rclone_target(rclone_remote, bucket, 'api/lang')}")
            return
        result = run_cmd([rclone_bin, "lsf", rclone_target(rclone_remote, bucket, "api/lang")], capture_output=True)
        langs = [line.strip().rstrip("/") for line in result.stdout.splitlines() if line.strip().endswith("/")]
        for lang in langs:
            target = rclone_target(rclone_remote, bucket, f"api/lang/{lang}/search")
            proc = subprocess.run([rclone_bin, "purge", target], text=True, capture_output=True)
            if proc.returncode == 0:
                continue
            output = f"{proc.stdout}\n{proc.stderr}"
            if "directory not found" in output.lower() or "not found" in output.lower():
                continue
            raise RuntimeError(f"Failed to purge {target}: {output.strip()}")
        return

    s3_config = get_r2_s3_config()
    if s3_config:
        cmd = [
            "aws",
            "s3",
            "rm",
            f"s3://{bucket}/api/lang",
            "--recursive",
            "--exclude",
            "*",
            "--include",
            "*/search/*",
            "--endpoint-url",
            s3_config["endpoint"],
        ]
        if dry_run:
            run_cmd(cmd, dry_run=True)
            return
        subprocess.run(
            cmd,
            check=True,
            text=True,
            capture_output=True,
            env=aws_env(s3_config),
        )
        return

    warn("Skipping legacy cleanup for api/lang/*/search because neither rclone nor S3 credentials are configured.")


def deploy_pages(project: str, branch: str, wrangler_bin: str, dry_run: bool = False) -> None:
    cmd = [wrangler_bin, "pages", "deploy", str(DEPLOY_ROOT), "--project-name", project]
    if branch:
        cmd.extend(["--branch", branch])
    run_cmd(cmd, dry_run=dry_run)


def update_book_state(state: dict, book_id: str, **fields) -> dict:
    processed = state.setdefault("processed", {})
    item = processed.setdefault(book_id, {"status": "discovered", "attempts": 0})
    item.update(fields)
    item["updated_at"] = iso_now()
    if fields.get("status") in {"failed", "skipped_missing_preferred_epub"}:
        item["attempts"] = int(item.get("attempts") or 0) + 1
    return item


def collect_summary(state: dict, candidate_ids: List[str], indexed_ids: Set[str], newest_payload: dict) -> dict:
    processed = state.get("processed") or {}
    downloaded = ingested = skipped = skipped_missing = failed = indexed = 0
    for book_id, item in processed.items():
        status = str(item.get("status") or "")
        if item.get("downloaded_at"):
            downloaded += 1
        if item.get("uploaded_content_at"):
            ingested += 1
        if status == "skipped_missing_preferred_epub":
            skipped += 1
            skipped_missing += 1
        elif status == "failed":
            failed += 1
        if item.get("uploaded_api_at"):
            indexed += 1
    return {
        "found": len(candidate_ids),
        "already_indexed": len(indexed_ids),
        "downloaded": downloaded,
        "ingested": ingested,
        "skipped": skipped,
        "skipped_missing_pg_epub": skipped_missing,
        "failed": failed,
        "indexed": indexed,
        "newest_releases_count": newest_payload.get("count", 0),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Update ReaderPub catalog with new Project Gutenberg books.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--bootstrap-from-id", type=int, default=0)
    parser.add_argument("--safety-window-days", type=int, default=DEFAULT_SAFETY_WINDOW_DAYS)
    parser.add_argument("--newest-window-days", type=int, default=DEFAULT_NEWEST_WINDOW_DAYS)
    parser.add_argument("--newest-max-books", type=int, default=DEFAULT_NEWEST_MAX_BOOKS)
    parser.add_argument("--state-r2-key", default=os.environ.get("GUTENBERG_STATE_R2_KEY", DEFAULT_STATE_R2_KEY))
    parser.add_argument("--state-r2-bucket", default=os.environ.get("GUTENBERG_STATE_R2_BUCKET", ""))
    parser.add_argument("--wrangler-bin", default=os.environ.get("WRANGLER_BIN", "wrangler"))
    parser.add_argument("--rclone-bin", default=os.environ.get("RCLONE_BIN", "rclone"))
    parser.add_argument("--rclone-remote", default=os.environ.get("GUTENBERG_RCLONE_REMOTE", ""))
    parser.add_argument("--skip-rclone", action="store_true")
    parser.add_argument("--python-bin", default=os.environ.get("PYTHON_BIN", sys.executable or "python3"))
    parser.add_argument("--pages-project", default=os.environ.get("EPUB_PUBLISH_PAGES_PROJECT", "reader-books"))
    parser.add_argument("--pages-branch", default=os.environ.get("EPUB_PUBLISH_PAGES_BRANCH", "production"))
    parser.add_argument("--deploy-pages", action="store_true", default=True)
    parser.add_argument("--skip-pages-deploy", action="store_true")
    parser.add_argument("--skip-seo", action="store_true")
    parser.add_argument("--tmp-dir", default=os.environ.get("GUTENBERG_TMP_DIR", "/tmp"))
    args = parser.parse_args()

    bucket = get_state_bucket(args.state_r2_bucket)
    deploy_pages_enabled = args.deploy_pages and not args.skip_pages_deploy
    rclone_remote = "" if args.skip_rclone else detect_rclone_remote(args.rclone_bin, args.rclone_remote)
    state = ensure_state_shape({})
    state_uploaded = False
    temp_root = Path(tempfile.mkdtemp(prefix="readerpub-gutenberg-update-", dir=args.tmp_dir))
    run_started_at = iso_now()
    newest_payload = {"count": 0}
    staged_content_root = temp_root / "content"

    try:
        if not args.dry_run:
            state = r2_get_json(bucket, args.state_r2_key, args.wrangler_bin)
        state["last_run_started_at"] = run_started_at

        existing_global_books, _language_books = load_book_maps(INDEX_ROOT)
        existing_ids = set(existing_global_books.keys())
        candidate_ids, rdf_metadata = discover_candidates(args.safety_window_days, args.bootstrap_from_id)
        indexed_candidate_ids = {book_id for book_id in candidate_ids if book_id in existing_ids}

        queue = []
        for book_id in candidate_ids:
            processed = (state.get("processed") or {}).get(book_id, {})
            if book_id in existing_ids:
                continue
            if str(processed.get("status") or "") == "success":
                continue
            queue.append(book_id)

        if args.limit > 0:
            queue = queue[: args.limit]

        log(f"Discovered {len(candidate_ids)} candidate Gutenberg IDs; {len(queue)} need processing.")
        if rclone_remote:
            log(f"Using rclone remote '{rclone_remote}' for bulk R2 sync.")
        else:
            log("rclone bulk sync is not configured; falling back to per-file R2 uploads.")

        if args.dry_run:
            for book_id in queue:
                preferred_exists = url_exists(EPUB_URL_TEMPLATE.format(book_id=book_id))
                state_item = update_book_state(
                    state,
                    book_id,
                    status="dry_run_candidate" if preferred_exists else "skipped_missing_preferred_epub",
                    source_release_date=rdf_metadata.get(book_id, {}).get("release_date", ""),
                    last_error="" if preferred_exists else "missing preferred epub variant",
                )
                if not preferred_exists:
                    state["skipped_missing_preferred_epub"][book_id] = state_item
            write_json(temp_root / "state.dry-run.json", state)
            newest_payload = read_json(INDEX_ROOT / "discover" / "newest.json", {"count": 0}) or {"count": 0}
            summary = collect_summary(state, candidate_ids, indexed_candidate_ids, newest_payload)
            log("Summary: " + json.dumps(summary, ensure_ascii=False))
            return 0

        current_run_uploaded_ids: List[str] = []

        for book_id in queue:
            item = update_book_state(
                state,
                book_id,
                status="discovered",
                source="gutenberg",
                source_book_id=book_id,
                source_release_date=rdf_metadata.get(book_id, {}).get("release_date", ""),
                rdf_metadata=rdf_metadata.get(book_id, {}),
                last_error="",
            )
            book_temp = temp_root / book_id
            epub_file = book_temp / f"pg{book_id}.epub"
            unpack_dir = book_temp / "unpacked"
            legacy_content_path = f"/books/content/{book_id}/"
            # Gutenberg remains on the legacy public/storage layout.
            target_content_path = legacy_content_path
            target_content_prefix = f"content/{book_id}"
            try:
                epub_url = download_preferred_epub(book_id, epub_file)
                item["downloaded_at"] = iso_now()
                item["preferred_epub_url"] = epub_url
                item["status"] = "downloaded"

                staged = stage_unpacked_epub(book_id, epub_file, unpack_dir)
                item["normalized_metadata"] = staged["metadata"]
                item["status"] = "staged_local"

                final_root = staged_content_root / book_id
                final_root.parent.mkdir(parents=True, exist_ok=True)
                if final_root.exists():
                    shutil.rmtree(final_root)
                shutil.move(str(unpack_dir), str(final_root))
                item["local_staged_at"] = iso_now()
                item["status"] = "staged_local"
                item["local_content_path"] = legacy_content_path
                item["legacy_path"] = legacy_content_path
                item["target_path"] = target_content_path
                item["public_content_path"] = legacy_content_path
                item["public_path_mode"] = "legacy"

                upload_content_directory(
                    target_content_prefix,
                    final_root,
                    bucket,
                    args.wrangler_bin,
                    rclone_bin=args.rclone_bin,
                    rclone_remote=rclone_remote,
                    dry_run=False,
                )
                item["uploaded_content_at"] = iso_now()
                item["status"] = "uploaded_content"
                current_run_uploaded_ids.append(book_id)
            except FileNotFoundError as error:
                item["status"] = "skipped_missing_preferred_epub"
                item["last_error"] = str(error)
                item["attempts"] = int(item.get("attempts") or 0) + 1
                state["skipped_missing_preferred_epub"][book_id] = item
                warn(str(error))
            except Exception as error:
                item["status"] = "failed"
                item["last_error"] = str(error)
                item["attempts"] = int(item.get("attempts") or 0) + 1
                state["failed"][book_id] = item
                warn(f"Failed ingest for {book_id}: {error}")
            finally:
                shutil.rmtree(book_temp, ignore_errors=True)

        index_snapshot = snapshot_mtimes(INDEX_ROOT)
        if current_run_uploaded_ids:
            for book_id in current_run_uploaded_ids:
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
            for book_id in current_run_uploaded_ids:
                update_book_state(state, book_id, status="indexed_catalog")

        local_state_file = temp_root / "state.for-indexes.json"
        write_json(local_state_file, state)
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

        run_cmd([args.python_bin, str(SYNC_GUTENBERG_INDEXES), "--index-root", str(INDEX_ROOT)])

        local_state_file = temp_root / "state.for-newest.json"
        write_json(local_state_file, state)
        run_cmd(
            [
                args.python_bin,
                str(BUILD_NEWEST_RELEASES),
                "--state",
                str(local_state_file),
                "--index-root",
                str(INDEX_ROOT),
                "--window-days",
                str(args.newest_window_days),
                "--max-books",
                str(args.newest_max_books),
            ]
        )
        newest_payload = read_json(INDEX_ROOT / "discover" / "newest.json", {"count": 0}) or {"count": 0}

        removed_local_language_search_dirs = remove_local_language_search_dirs(INDEX_ROOT)
        if removed_local_language_search_dirs:
            log(f"Removed {len(removed_local_language_search_dirs)} stale local language search directories.")

        api_changed = changed_files(INDEX_ROOT, index_snapshot)
        if api_changed:
            upload_api_files(
                api_changed,
                bucket,
                args.wrangler_bin,
                rclone_bin=args.rclone_bin,
                rclone_remote=rclone_remote,
                dry_run=False,
            )
            uploaded_api_at = iso_now()
            for book_id in current_run_uploaded_ids:
                update_book_state(state, book_id, status="uploaded_api", uploaded_api_at=uploaded_api_at)

        purge_remote_language_search_dirs(
            bucket,
            args.wrangler_bin,
            rclone_bin=args.rclone_bin,
            rclone_remote=rclone_remote,
            dry_run=False,
        )

        if current_run_uploaded_ids and not args.skip_seo:
            run_cmd(
                [
                    args.python_bin,
                    str(BUILD_SEO_INDEXES),
                    "--index-root",
                    str(INDEX_ROOT),
                    "--content-root",
                    str(staged_content_root),
                    "--output-root",
                    str(SEO_ROOT),
                ]
            )
            run_cmd([str(UPLOAD_SEO_INDEXES), str(SEO_ROOT)])
            uploaded_seo_at = iso_now()
            for book_id in current_run_uploaded_ids:
                update_book_state(state, book_id, status="uploaded_seo", uploaded_seo_at=uploaded_seo_at)

        if deploy_pages_enabled:
            deploy_pages(args.pages_project, args.pages_branch, args.wrangler_bin, dry_run=False)
            deployed_at = iso_now()
        else:
            deployed_at = ""

        for book_id in current_run_uploaded_ids:
            item = update_book_state(state, book_id, status="success")
            item.setdefault("catalog_added_at", deployed_at or iso_now())
            if deployed_at:
                item["deployed_pages_at"] = deployed_at
            state["success"][book_id] = item
            state["pending_retry"].pop(book_id, None)
            state["failed"].pop(book_id, None)

        for book_id, item in (state.get("processed") or {}).items():
            if str(item.get("status") or "") not in {"success", "skipped_missing_preferred_epub"}:
                state["pending_retry"][book_id] = item

        state["last_run_finished_at"] = iso_now()
        if current_run_uploaded_ids or not queue:
            state["last_successful_run_at"] = state["last_run_finished_at"]

        r2_put_json(bucket, args.state_r2_key, state, args.wrangler_bin, dry_run=False)
        state_uploaded = True

        summary = collect_summary(state, candidate_ids, indexed_candidate_ids, newest_payload)
        log("Summary: " + json.dumps(summary, ensure_ascii=False))
        return 0
    finally:
        state["last_run_finished_at"] = state.get("last_run_finished_at") or iso_now()
        if not args.dry_run and not state_uploaded:
            try:
                r2_put_json(bucket, args.state_r2_key, state, args.wrangler_bin, dry_run=False)
            except Exception as error:
                warn(f"Failed to persist pipeline state to R2: {error}")
        shutil.rmtree(temp_root, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
