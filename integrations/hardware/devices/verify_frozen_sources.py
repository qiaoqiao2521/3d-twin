"""Independently verify complete original file indexes and fixed Git trees.

With --archives, also stream every byte of each full locally cached tarball;
this does not extract or duplicate the multi-gigabyte original CAD sources.
"""
import argparse
import hashlib
import json
from pathlib import Path
import tarfile


def git_digest(kind, data):
    return hashlib.sha1(f"{kind} {len(data)}\0".encode() + data).hexdigest()


def original_tree(files):
    root = {}
    for entry in files:
        parts = entry["path"].split("/")
        folder = root
        for name in parts[:-1]:
            folder = folder.setdefault(name, {})
        if parts[-1] in folder:
            raise RuntimeError("Repeated original path: " + entry["path"])
        folder[parts[-1]] = (entry["mode"], entry["gitBlob"])

    def tree(folder):
        content = bytearray()
        for name, value in sorted(folder.items(), key=lambda item: (item[0] + ("/" if isinstance(item[1], dict) else "")).encode()):
            mode, digest = ("40000", tree(value)) if isinstance(value, dict) else value
            content.extend(f"{mode} {name}\0".encode())
            content.extend(bytes.fromhex(digest))
        return git_digest("tree", content)
    return tree(root)


def verify(lock, archives=None):
    computed = original_tree(lock["files"])
    if computed != lock["tree"]:
        raise RuntimeError(f"Original Git tree differs for {lock['id']}: {computed}")
    checked = 0
    if archives:
        archive = Path(archives) / f"{lock['id']}-{lock['revision']}" / "archive.tar.gz"
        with archive.open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() != lock["archiveSha256"]:
                raise RuntimeError(f"Changed original archive: {archive}")
        if archive.stat().st_size != lock["archiveSize"]:
            raise RuntimeError("Original archive byte count differs")
        expected = {entry["path"]: entry for entry in lock["files"]}
        seen = set()
        with tarfile.open(archive, "r|gz") as contents:
            if contents.pax_headers.get("comment") != lock["revision"]:
                raise RuntimeError("Original archive does not identify its exact fixed commit")
            for member in contents:
                if member.isdir():
                    continue
                name = member.name.partition("/")[2]
                if name not in expected or name in seen:
                    raise RuntimeError("Unexpected or repeated original member: " + name)
                entry = expected[name]
                if member.issym():
                    payload = member.linkname.encode()
                    size = len(payload)
                    file_sha = hashlib.sha256(payload).hexdigest()
                    blob_sha = git_digest("blob", payload)
                elif member.isfile():
                    digest = hashlib.sha256()
                    blob = hashlib.sha1(f"blob {member.size}\0".encode())
                    size = 0
                    with contents.extractfile(member) as stream:
                        while block := stream.read(1024 * 1024):
                            digest.update(block)
                            blob.update(block)
                            size += len(block)
                    file_sha, blob_sha = digest.hexdigest(), blob.hexdigest()
                else:
                    raise RuntimeError("Unsupported archive member: " + name)
                if size != entry["size"] or file_sha != entry["sha256"] or blob_sha != entry["gitBlob"]:
                    raise RuntimeError("Original file bytes differ: " + name)
                mode = "120000" if member.issym() else "100755" if member.mode & 0o111 else "100644"
                if mode != entry["mode"]:
                    raise RuntimeError("Original mode differs: " + name)
                seen.add(name)
                checked += 1
        if seen != set(expected):
            raise RuntimeError("The complete original archive is missing indexed files")
    return {"id": lock["id"], "revision": lock["revision"], "tree": computed,
            "originalFiles": len(lock["files"]), "archiveBytes": lock["archiveSize"],
            "archiveSha256": lock["archiveSha256"], "archiveFilesVerified": checked,
            "status": "passed"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archives")
    parser.add_argument("--report")
    args = parser.parse_args()
    records = [verify(json.loads(file.read_text()), args.archives) for file in sorted(Path(__file__).with_name("frozen-sources").glob("*.json"))]
    report = {"schemaVersion": 1, "completeOriginalFiles": sum(record["originalFiles"] for record in records), "sources": records}
    if args.report:
        Path(args.report).write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
