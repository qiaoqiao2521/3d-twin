#!/usr/bin/env python3
"""Check Jubilee's actual four original feet against its exported world matrices.

This is a CPU coordinate check of the pinned engineering assembly, not a visual
acceptance test. It independently compares the original STEPCAF occurrence
matrices recorded during conversion with the generated glTF scene matrices.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct


SOURCE_SHA256 = "533417712183775a544802ae29a6f94d50ef0839bc2f24f68bce7a048798afea"
FOOT_PRODUCTS = {
    "budget_foot_Back Right Foot", "budget_foot_Back Left Foot",
    "budget_foot_Front Right Foot", "budget_foot_Front Left Foot",
}


def identity():
    return [[float(row == column) for column in range(4)] for row in range(4)]


def multiply(a, b):
    return [[sum(a[row][k] * b[k][column] for k in range(4))
             for column in range(4)] for row in range(4)]


def gltf_matrix(node):
    if "matrix" in node:
        return [[node["matrix"][column * 4 + row] for column in range(4)] for row in range(4)]
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    out = [
        [1 - 2 * (y*y + z*z), 2*(x*y - z*w), 2*(x*z + y*w), 0],
        [2*(x*y + z*w), 1 - 2*(x*x + z*z), 2*(y*z - x*w), 0],
        [2*(x*z - y*w), 2*(y*z + x*w), 1 - 2*(x*x + y*y), 0],
        [0, 0, 0, 1],
    ]
    scale = node.get("scale", [1, 1, 1])
    for row in range(3):
        for column in range(3):
            out[row][column] *= scale[column]
        out[row][3] = node.get("translation", [0, 0, 0])[row]
    return out


def verify(directory):
    conversion = json.loads((directory / "assembly-conversion.json").read_text())
    content = (directory / "assembly.glb").read_bytes()
    magic, version, length, json_length, json_type = struct.unpack_from("<4sIIII", content)
    assert magic == b"glTF" and version == 2 and length == len(content) and json_type == 0x4E4F534A
    gltf = json.loads(content[20:20 + json_length])
    output_sha = hashlib.sha256(content).hexdigest()
    assert conversion["sourceSha256"] == SOURCE_SHA256, "Unexpected original Jubilee STEP"
    assert conversion["sourceUpAxis"] == conversion["outputUpAxis"] == "Y", "Jubilee must retain its original Y-up coordinates"
    assert conversion["outputSha256"] == output_sha
    original_feet = {}
    exported_feet = {}

    def visit_original(node, parent):
        local = [list(row) for row in node["localTransformMillimetres"]] + [[0, 0, 0, 1]]
        for row in range(3):
            local[row][3] /= 1000
        world = multiply(parent, local)
        if node["productName"] in FOOT_PRODUCTS:
            key = (node["name"], node["productName"])
            assert key not in original_feet
            original_feet[key] = world
        for child in node["children"]:
            visit_original(child, world)

    def visit_exported(index, parent):
        node = gltf["nodes"][index]
        world = multiply(parent, gltf_matrix(node))
        if "mesh" in node:
            product = gltf["meshes"][node["mesh"]].get("name", "")
            if product in FOOT_PRODUCTS:
                key = (node["name"], product)
                assert key not in exported_feet
                exported_feet[key] = world
        for child in node.get("children", []):
            visit_exported(child, world)

    for node in conversion["originalHierarchy"]:
        visit_original(node, identity())
    for node in gltf["scenes"][gltf.get("scene", 0)]["nodes"]:
        visit_exported(node, identity())
    assert len(original_feet) == 4 and original_feet.keys() == exported_feet.keys()
    evidence = []
    for key, original in original_feet.items():
        exported = exported_feet[key]
        max_error = max(abs(original[row][column] - exported[row][column])
                        for row in range(4) for column in range(4))
        assert max_error < 1e-7, f"Original foot transform was changed: {key}"
        evidence.append({"instanceName": key[0], "originalProductName": key[1],
                         "originalWorldOriginMetres": [original[row][3] for row in range(3)],
                         "exportedWorldOriginMetres": [exported[row][3] for row in range(3)],
                         "maximumMatrixDifference": max_error})
    points = [item["exportedWorldOriginMetres"] for item in evidence]
    span = [max(point[axis] for point in points) - min(point[axis] for point in points) for axis in range(3)]
    assert span[1] < 1e-7 and span[0] > 0.4 and span[2] > 0.4, "Four original feet are not level on the Y-up ground plane"
    return {"schemaVersion": 1, "status": "passed", "sourceSha256": SOURCE_SHA256,
            "outputSha256": output_sha, "sourceUpAxis": "Y", "outputUpAxis": "Y",
            "fourOriginalFeet": evidence, "worldOriginSpanMetres": span,
            "originalLocalAndWorldMatricesPreserved": True,
            "scope": "Original four foot origins and full world matrices; CPU coordinate verification, not WebGL visual acceptance"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", nargs="?", type=Path, default=Path("public/hardware/jubilee"))
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    report = verify(args.directory)
    text = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        temporary = args.report.with_suffix(args.report.suffix + ".tmp")
        temporary.write_text(text)
        temporary.replace(args.report)
    print(text, end="")
