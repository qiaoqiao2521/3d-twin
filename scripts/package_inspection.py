#!/usr/bin/env python3
"""Package only the shared inspection contract; never include robot assets."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

SOURCE_PATH = "src/shared/inspection/sceneInspection.ts"
SOURCE_REPOSITORY = "qiaoqiao2521/digital-twin-and-robotics-baseline"


def package(repo_root: Path, output: Path, revision: str) -> dict:
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("A full source commit SHA is required.")
    source = repo_root / SOURCE_PATH
    if source.is_symlink() or not source.is_file():
        raise ValueError("The shared source is missing or is a symbolic link.")
    data = source.read_bytes()
    committed = subprocess.check_output(["git", "show", f"{revision}:{SOURCE_PATH}"], cwd=repo_root)
    if data != committed:
        raise ValueError("Source bytes differ from the declared commit; commit or restore them before packaging.")
    manifest = {
        "schemaVersion": 1,
        "sourceRepository": SOURCE_REPOSITORY,
        "sourceRevision": revision,
        "files": [{"path": SOURCE_PATH, "sha256": hashlib.sha256(data).hexdigest()}],
    }
    output.mkdir(parents=True, exist_ok=True)
    if output.is_symlink():
        raise ValueError("Package output cannot be a symbolic link.")
    (output / "sceneInspection.ts").write_bytes(data)
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--revision")
    args = parser.parse_args()
    revision = args.revision or subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=args.repo_root, text=True
    ).strip()
    print(json.dumps(package(args.repo_root.resolve(), args.output, revision), ensure_ascii=False))


if __name__ == "__main__":
    main()
