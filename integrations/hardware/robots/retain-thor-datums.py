"""Retain three original Thor auxiliary frames without unbounded plane meshes."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import struct

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source_glb")
parser.add_argument("native_report")
parser.add_argument("output")
parser.add_argument("report")
args = parser.parse_args()
source, output = Path(args.source_glb), Path(args.output)
native = json.loads(Path(args.native_report).read_text())
content = source.read_bytes()
magic, version, length = struct.unpack_from("<4sII", content)
if magic != b"glTF" or version != 2 or length != len(content):
    raise RuntimeError("Invalid mechanical GLB")
size, kind = struct.unpack_from("<II", content, 12)
if kind != 0x4E4F534A:
    raise RuntimeError("GLB is missing its JSON chunk")
data = json.loads(content[20:20 + size])
remaining = content[20 + size:]
original_nodes = len(data["nodes"])
frames = []
for frame in native["auxiliaryFrames"]:
    parent_name = frame["parentAssembly"]
    matches = [(index, node) for index, node in enumerate(data["nodes"][:original_nodes]) if re.sub(r":\d+$", "", node.get("name", "")) == parent_name]
    if len(matches) != 1:
        names = [node.get("name") for node in data["nodes"] if parent_name in node.get("name", "")]
        raise RuntimeError(f"Cannot uniquely locate original auxiliary-frame parent {parent_name}: {names}")
    parent_index, parent = matches[0]
    values = frame["originalLocalMatrixMillimetres"]
    # FreeCAD stores row-major millimetre transforms; glTF stores column-major
    # metre transforms. This is the same documented unit adapter as the CAD.
    matrix = [values[row * 4 + column] * (0.001 if column == 3 and row < 3 else 1) for column in range(4) for row in range(4)]
    index = len(data["nodes"])
    data["nodes"].append({"name": frame["name"], "matrix": matrix, "extras": {"originalAuxiliaryDatum": frame, "noSyntheticGeometry": True}})
    parent.setdefault("children", []).append(index)
    frames.append({**frame, "glbParentNode": parent_index, "glbParentName": parent.get("name"), "glbNode": index, "glbLocalMatrixMetres": matrix})
data.setdefault("asset", {}).setdefault("extras", {})["originalAuxiliaryFramesRetained"] = len(frames)
payload = json.dumps(data, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()
payload += b" " * (-len(payload) % 4)
total = 20 + len(payload) + len(remaining)
temporary = output.with_name(output.name + ".tmp")
temporary.write_bytes(struct.pack("<4sII", b"glTF", 2, total) + struct.pack("<II", len(payload), kind) + payload + remaining)
temporary.replace(output)
report = {"schemaVersion": 1, "inputSha256": hashlib.sha256(content).hexdigest(), "outputSha256": hashlib.sha256(output.read_bytes()).hexdigest(), "unchangedMechanicalNodes": original_nodes, "unchangedGeometryChunksSha256": hashlib.sha256(remaining).hexdigest(), "unchangedMaterials": len(data.get("materials", [])), "originalAuxiliaryFrames": frames, "inventedMeshGeometry": False}
Path(args.report).write_text(json.dumps(report, indent=2) + "\n")
