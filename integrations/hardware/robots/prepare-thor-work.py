"""Prepare a CAD-only FreeCAD working copy with explicit filename case aliases.

Thor was authored on a case-insensitive filesystem. Resolve saved XLink paths
on Linux. In this working copy only, omit serialized add-on Python objects so
conversion uses the saved original B-reps and GUI appearance without executing
unavailable Assembly4/Fasteners scripts. Original downloads remain untouched.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import xml.etree.ElementTree as ET
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source")
parser.add_argument("output")
parser.add_argument("report")
args = parser.parse_args()
source, output = Path(args.source).resolve(), Path(args.output).resolve()
output.mkdir(parents=True, exist_ok=True)
files = [file for file in source.iterdir() if file.is_file()]
by_case = {}
for file in files:
    by_case.setdefault(file.name.casefold(), []).append(file)


def publish(file, target):
    if target.is_file() and os.path.samefile(file, target):
        return
    if target.exists():
        target.unlink()
    try:
        os.link(file, target)
    except OSError:
        shutil.copyfile(file, target)


documents = []
for file in files:
    target = output / file.name
    if file.suffix.lower() != ".fcstd":
        publish(file, target)
        continue
    changes = []
    preserved = []
    temporary = target.with_name(target.name + ".tmp")
    with zipfile.ZipFile(file) as original, zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED) as working:
        for member in original.infolist():
            content = original.read(member.filename)
            if member.filename in {"Document.xml", "GuiDocument.xml"}:
                document = ET.fromstring(content)
                for properties in document.findall(".//Properties"):
                    for property in list(properties):
                        if property.get("type") == "App::PropertyPythonObject":
                            changes.append({"member": member.filename, "property": property.get("name"), "python": dict(property.find("Python").attrib) if property.find("Python") is not None else {}})
                            properties.remove(property)
                    if "Count" in properties.attrib:
                        properties.set("Count", str(len(properties.findall("Property"))))
                content = ET.tostring(document, encoding="utf-8", xml_declaration=True)
            else:
                preserved.append({"member": member.filename, "sha256": hashlib.sha256(content).hexdigest()})
            working.writestr(member, content)
    # Atomic replacement is essential: a previous work tree may hardlink the
    # original. Never truncate an existing hardlink while adapting a copy.
    os.replace(temporary, target)
    documents.append({"original": file.name, "sourceSha256": hashlib.sha256(file.read_bytes()).hexdigest(), "workSha256": hashlib.sha256(target.read_bytes()).hexdigest(), "omittedRuntimeProxies": changes, "unchangedGeometryAndOtherMembers": preserved})

aliases = {}
for file in files:
    if file.suffix.lower() != ".fcstd":
        continue
    with zipfile.ZipFile(file) as zipped:
        document = ET.fromstring(zipped.read("Document.xml"))
    for link in document.findall(".//XLink"):
        relative = link.get("file")
        if not relative or (source / relative).is_file():
            continue
        matches = by_case.get(relative.casefold(), [])
        if len(matches) != 1 or Path(relative).name != relative:
            raise RuntimeError(f"Original CAD reference cannot be resolved without changing geometry: {file.name} -> {relative}")
        target = matches[0]
        publish(output / target.name, output / relative)
        aliases[relative] = {"original": target.name, "sha256": hashlib.sha256(target.read_bytes()).hexdigest()}

Path(args.report).write_text(json.dumps({"schemaVersion": 1, "source": "freecad-src", "fileCount": len(files), "caseAliases": aliases, "workingDocuments": documents, "originalDocumentsRewritten": False, "geometryReconstructed": False, "workingCopyAdaptation": "Serialized add-on Python objects omitted only in conversion copy; all saved B-rep/placement/color binary members are unchanged. No recompute or source save."}, indent=2) + "\n")
