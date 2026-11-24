"""Verify published robot originals, mesh closure and original joint topology.

This is a file/format check. It deliberately does not claim browser rendering,
physical dynamics, real hardware control, or visual acceptance.
"""
import hashlib
import json
import math
from pathlib import Path
import re
import struct
import sys
from urllib.parse import unquote
import xml.etree.ElementTree as ET

root = Path(sys.argv[1]).resolve()
asset = json.loads((root / "asset.json").read_text())
originals = json.loads((root / asset["filesIndex"]).read_text())["files"]


def inside(relative, base=root, allow_empty=False):
    file = (base / unquote(relative)).resolve()
    if not file.is_relative_to(root) or not file.is_file():
        raise RuntimeError(f"Missing or external published resource: {relative}")
    if not allow_empty and file.stat().st_size == 0:
        raise RuntimeError(f"Empty published resource: {relative}")
    return file


def digest(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def mesh_resource(file):
    if file.suffix.lower() == ".dae":
        document = ET.parse(file)
        for image in document.findall(".//{*}library_images/{*}image/{*}init_from"):
            if image.text and not image.text.startswith("data:"):
                inside(image.text, file.parent)
    if file.suffix.lower() == ".stl":
        with file.open("rb") as stream:
            header = stream.read(84)
        binary = len(header) == 84 and 84 + 50 * struct.unpack_from("<I", header, 80)[0] == file.stat().st_size
        if not binary:
            text = file.read_text()
            if "facet normal" not in text or "endfacet" not in text or "endsolid" not in text:
                raise RuntimeError(f"Invalid original STL: {file}")


def urdf(model, file):
    robot = ET.parse(file).getroot()
    links = {link.get("name") for link in robot.findall("link")}
    joints = {joint.get("name"): joint for joint in robot.findall("joint")}
    if len(links) != len(robot.findall("link")) or len(joints) != len(robot.findall("joint")):
        raise RuntimeError(f"Duplicate original link/joint names in {model['id']}")
    children = set()
    mimic, movable = [], []
    for name, joint in joints.items():
        parent, child = joint.find("parent").get("link"), joint.find("child").get("link")
        if parent not in links or child not in links or child in children:
            raise RuntimeError(f"Invalid original joint tree in {model['id']}: {name}")
        children.add(child)
        if joint.get("type") != "fixed":
            movable.append(name)
            axis = joint.find("axis")
            xyz = [float(value) for value in (axis.get("xyz") if axis is not None else "1 0 0").split()]
            if len(xyz) != 3 or not all(math.isfinite(value) for value in xyz) or sum(value * value for value in xyz) == 0:
                raise RuntimeError(f"Invalid original joint axis: {name}")
            if joint.get("type") in {"revolute", "prismatic"}:
                limit = joint.find("limit")
                if limit is None or float(limit.get("lower")) > float(limit.get("upper")):
                    raise RuntimeError(f"Invalid original joint limits: {name}")
        follower = joint.find("mimic")
        if follower is not None:
            if follower.get("joint") not in joints:
                raise RuntimeError(f"Missing mimic leader: {name}")
            mimic.append({"joint": name, "leader": follower.get("joint"),
                          "multiplier": follower.get("multiplier", "1"),
                          "offset": follower.get("offset", "0")})
    if len(links - children) != 1:
        raise RuntimeError(f"The original URDF is not a single rooted tree: {model['id']}")
    resources = set()
    for mesh in robot.findall(".//mesh"):
        filename = mesh.get("filename")
        if filename.startswith("package://"):
            package, relative = filename[len("package://"):].split("/", 1)
            if package not in model.get("packages", {}):
                raise RuntimeError(f"Unmapped ROS package: {package}")
            mesh_file = inside(relative, root / model["packages"][package])
        else:
            if re.match(r"^[a-zA-Z]+:", filename):
                raise RuntimeError(f"External URDF mesh: {filename}")
            mesh_file = inside(filename, file.parent)
        resources.add(mesh_file)
    for texture in robot.findall(".//texture"):
        filename = texture.get("filename")
        if filename:
            resources.add(inside(filename, file.parent))
    for resource in resources:
        mesh_resource(resource)
    return {"id": model["id"], "format": "urdf", "links": len(links), "joints": len(joints), "movableJoints": movable, "mimicJoints": mimic, "closedMeshResources": len(resources), "physicalSimulation": False}


def glb(model, file):
    content = file.read_bytes()
    magic, version, size = struct.unpack_from("<4sII", content)
    if magic != b"glTF" or version != 2 or size != len(content):
        raise RuntimeError(f"Invalid GLB: {file}")
    json_size, kind = struct.unpack_from("<II", content, 12)
    if kind != 0x4E4F534A:
        raise RuntimeError("Missing GLB JSON chunk")
    data = json.loads(content[20:20 + json_size])
    if not data.get("meshes") or not data.get("nodes"):
        raise RuntimeError("Empty CAD conversion")
    for resource in [*data.get("buffers", []), *data.get("images", [])]:
        if "uri" in resource and not resource["uri"].startswith("data:"):
            inside(resource["uri"], file.parent)
    provenance = data.get("asset", {}).get("extras", {}).get("hardwareSource", {})
    if provenance.get("noSyntheticGeometry") is not True or provenance.get("outputUnit") != "metre":
        raise RuntimeError("CAD conversion omitted its original-source/unit declaration")
    return {"id": model["id"], "format": "gltf", "originalNodesAndCoordinateAdapter": len(data["nodes"]), "meshes": len(data["meshes"]), "materials": len(data.get("materials", [])), "sha256": digest(file), "physicalJointsInferred": False}


indexed = set()
direct = 0
for item in originals:
    key = (item["sourceId"], item["path"])
    if key in indexed:
        raise RuntimeError(f"Duplicate original index member: {key}")
    indexed.add(key)
    if not item.get("url") and not item.get("archive"):
        raise RuntimeError(f"Original is not downloadable: {key}")
    if item.get("url"):
        file = inside(item["url"], allow_empty=True)
        if file.stat().st_size != item["size"] or digest(file) != item["sha256"]:
            raise RuntimeError(f"Published original differs from frozen source: {key}")
        direct += 1
for source in asset["sources"]:
    archive = inside(source["archive"])
    if digest(archive) != source["archiveSha256"] or archive.stat().st_size != source["archiveSize"]:
        raise RuntimeError(f"Original archive checksum failed: {source['id']}")
    if len([key for key in indexed if key[0] == source["id"]]) != source["fileCount"]:
        raise RuntimeError(f"Original archive index is incomplete: {source['id']}")

models = []
for model in asset["models"]:
    file = inside(model["path"])
    if (model["source"]["id"], model["source"]["path"]) not in indexed:
        raise RuntimeError(f"Model source is missing from originals: {model['id']}")
    if model["format"] == "urdf":
        models.append(urdf(model, file))
    elif model["format"] == "gltf":
        models.append(glb(model, file))
    elif model["format"] == "html":
        html = file.read_text()
        external = re.findall(r'<(?:script|iframe|img|link|source)\b[^>]*(?:src|href)\s*=\s*[\"\x27](https?://[^\"\x27]+)', html, re.I)
        if external:
            raise RuntimeError(f"Original HTML has external static resources: {external}")
        models.append({"id": model["id"], "format": "html", "sha256": digest(file), "externalStaticResources": external, "browserExecutionTested": False})
    else:
        raise RuntimeError(f"Unsupported model format: {model['format']}")

report = {"schemaVersion": 1, "id": asset["id"], "originalFiles": len(indexed), "directOriginalFiles": direct, "completeOriginalArchives": len(asset["sources"]), "models": models, "browserVisualAcceptance": "not performed by this validator", "realHardwareConnection": False}
(root / "reports").mkdir(exist_ok=True)
temporary = root / "reports/verification.json.tmp"
temporary.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
temporary.replace(root / "reports/verification.json")
print(json.dumps(report, ensure_ascii=False))
