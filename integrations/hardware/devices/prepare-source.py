#!/usr/bin/env python3
"""Fetch a pinned, hashed full upstream archive and extract selected originals.

The committed frozen-source manifest indexes EVERY original file, including
files retained only in the locally published complete archive. Only the
selected build inputs are extracted, to avoid duplicating multi-GB CAD trees.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import tarfile
import urllib.request


def sha256(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def safe_path(value):
    name = PurePosixPath(value)
    if name.is_absolute() or ".." in name.parts or "\\" in value or "\0" in value:
        raise RuntimeError(f"Unsafe upstream path {value!r}")
    return str(name)


def prepare(lock, cache_root, selection):
    if len(lock["revision"]) != 40:
        raise RuntimeError("An exact upstream revision is required")
    base = Path(cache_root) / f'{lock["id"]}-{lock["revision"]}'
    base.mkdir(parents=True, exist_ok=True)
    archive = base / "archive.tar.gz"
    if not archive.exists():
        temporary = base / "archive.tar.gz.partial"
        url = f'https://codeload.github.com/{lock["repository"]}/tar.gz/{lock["revision"]}'
        print(json.dumps({"stage": "download", "source": lock["id"], "url": url}), flush=True)
        request = urllib.request.Request(url, headers={"User-Agent": "hardware-source-pin/1.0"})
        try:
            with urllib.request.urlopen(request, timeout=180) as response, temporary.open("wb") as output:
                while chunk := response.read(1024 * 1024):
                    output.write(chunk)
            if sha256(temporary) != lock["archiveSha256"]:
                raise RuntimeError("Downloaded source archive SHA-256 differs from the committed pin")
            temporary.replace(archive)
        finally:
            temporary.unlink(missing_ok=True)
    if archive.stat().st_size != lock["archiveSize"] or sha256(archive) != lock["archiveSha256"]:
        raise RuntimeError(f"Corrupt source archive {archive}; remove the cache file and rebuild")
    files = {entry["path"]: entry for entry in lock["files"]}
    selection = [safe_path(value).rstrip("/") for value in selection]
    wanted = {
        name for name, entry in files.items()
        if entry.get("type", "file") == "file"
        and any(name == prefix or name.startswith(prefix + "/") for prefix in selection)
    }
    for prefix in selection:
        if not any(name == prefix or name.startswith(prefix + "/") for name in files):
            raise RuntimeError(f"Selected original path is absent from the frozen tree: {prefix}")
    source = base / "source"
    source.mkdir(exist_ok=True)
    missing = set()
    for name in wanted:
        original = source / name
        expected = files[name]
        if original.exists():
            if not original.is_file() or original.stat().st_size != expected["size"] or sha256(original) != expected["sha256"]:
                raise RuntimeError(f"Frozen original was modified: {original}")
        else:
            missing.add(name)
    if missing:
        with tarfile.open(archive, "r|gz") as contents:
            if contents.pax_headers.get("comment") != lock["revision"]:
                raise RuntimeError("Git archive revision header does not match the source pin")
            for member in contents:
                parts = member.name.split("/", 1)
                if len(parts) != 2 or not parts[1]:
                    continue
                name = safe_path(parts[1])
                if name not in missing:
                    continue
                if not member.isfile():
                    raise RuntimeError(f"Build input is not a regular original file: {name}")
                expected = files[name]
                if member.size != expected["size"]:
                    raise RuntimeError(f"Original size differs from the frozen tree: {name}")
                output = source / name
                output.parent.mkdir(parents=True, exist_ok=True)
                temporary = output.with_name(output.name + ".partial")
                reader = contents.extractfile(member)
                digest = hashlib.sha256()
                with temporary.open("wb") as stream:
                    while chunk := reader.read(1024 * 1024):
                        digest.update(chunk)
                        stream.write(chunk)
                if digest.hexdigest() != expected["sha256"]:
                    temporary.unlink(missing_ok=True)
                    raise RuntimeError(f"Original bytes differ from the frozen tree: {name}")
                temporary.replace(output)
                os.chmod(output, 0o755 if expected.get("mode") == "100755" else 0o644)
                missing.remove(name)
        if missing:
            raise RuntimeError(f"Missing original archive members: {sorted(missing)}")
    return {
        "sourceRoot": str(source.resolve()),
        "archivePath": str(archive.resolve()),
        "selectedFiles": sorted(wanted),
        "archiveSha256": lock["archiveSha256"],
        "revision": lock["revision"],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lock", required=True)
    parser.add_argument("--cache-root", required=True)
    parser.add_argument("--select-json", required=True)
    parser.add_argument("--result", required=True)
    args = parser.parse_args()
    result = prepare(json.loads(Path(args.lock).read_text()), args.cache_root, json.loads(args.select_json))
    target = Path(args.result)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"stage": "source-ready", "revision": result["revision"], "selected": len(result["selectedFiles"])}), flush=True)


if __name__ == "__main__":
    main()
