"""Check that original stored Thor face colors survive native STEP and GLB.

FreeCAD 1.0 Import::Tools maps App::Color (sRGB + transparency) to OCCT linear
RGB + opacity; glTF baseColorFactor is linear RGB + opacity. This comparison
checks data, not browser lighting, tone mapping or visual acceptance.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("native_report")
parser.add_argument("glb")
parser.add_argument("report")
args = parser.parse_args()
native = json.loads(Path(args.native_report).read_text())
glb = Path(args.glb)
content = glb.read_bytes()
size = struct.unpack_from("<I", content, 12)[0]
model = json.loads(content[20:20 + size])
actual = [material.get("pbrMetallicRoughness", {}).get("baseColorFactor", [1, 1, 1, 1]) for material in model.get("materials", [])]
if any("material" not in primitive for mesh in model.get("meshes", []) for primitive in mesh["primitives"]):
    actual.append([1, 1, 1, 1])


def linear(value):
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


original = sorted({tuple(color) for part in native["colorParts"] for color in part["uniqueColors"]})
missing = []
matched = []
for color in original:
    expected = [*(linear(channel) for channel in color[:3]), 1 - color[3]]
    error = min((max(abs(a - b) for a, b in zip(expected, value)) for value in actual), default=float("inf"))
    row = {"originalSrgbAndTransparency": color, "expectedLinearRgba": expected, "nearestMaterialMaximumDelta": error}
    (matched if error < 2e-5 else missing).append(row)
report = {"schemaVersion": 1, "originalDistinctFaceColors": len(original), "glbMaterials": len(model.get("materials", [])), "matchedOriginalColors": matched, "missingOriginalColors": missing, "glbSha256": hashlib.sha256(content).hexdigest(), "colorSpace": "Original sRGB/transparency -> linear glTF RGB/opacity", "browserAppearanceTested": False}
Path(args.report).write_text(json.dumps(report, indent=2) + "\n")
if missing:
    raise RuntimeError(f"Original Thor face colors missing after native export: {missing}")
print(json.dumps({"originalColors": len(original), "glbMaterials": report["glbMaterials"], "allOriginalColorsPresent": True}))
