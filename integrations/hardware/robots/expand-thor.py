"""Expand the original Thor Xacro with an explicit offline package lookup."""
import argparse
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

import xacro
import xacro.substitution_args

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source_root")
parser.add_argument("output")
parser.add_argument("report")
args = parser.parse_args()
root = Path(args.source_root).resolve()
packages = root / "ws_thor/src"
input_file = packages / "thor_urdf/urdf/thor.urdf.xacro"
digest = hashlib.sha256(input_file.read_bytes()).hexdigest()


def find_package(name):
    if name not in {"thor_urdf", "thor_controller"}:
        raise RuntimeError(f"Unexpected original Xacro package dependency: {name}")
    directory = packages / name
    if not directory.is_dir():
        raise RuntimeError(f"Missing frozen package: {name}")
    return str(directory)


xacro.substitution_args._eval_find = find_package
document = xacro.process_file(str(input_file), mappings={"is_sim": "true"})
output = Path(args.output)
output.parent.mkdir(parents=True, exist_ok=True)
text = document.toprettyxml(indent="  ")
# Preserve the original ros2_control/gazebo data as portable metadata rather
# than leaking this build machine's cache path into a published URDF.
for package in ["thor_urdf", "thor_controller"]:
    text = text.replace(str(packages / package) + "/", "package://" + package + "/")
output.write_text(text)
robot = ET.fromstring(text)
joints = robot.findall("joint")
if len([joint for joint in joints if joint.get("type") == "revolute"]) != 12:
    raise RuntimeError("Original Thor arm/gripper joint count changed")
if hashlib.sha256(input_file.read_bytes()).hexdigest() != digest:
    raise RuntimeError("Original Thor Xacro was modified")
Path(args.report).write_text(json.dumps({
    "schemaVersion": 1, "source": "ws_thor/src/thor_urdf/urdf/thor.urdf.xacro",
    "sourceSha256": digest, "outputSha256": hashlib.sha256(output.read_bytes()).hexdigest(),
    "processor": "standard xacro; frozen local package resolution; is_sim=true",
    "links": len(robot.findall("link")), "joints": len(joints),
    "movableJoints": len([joint for joint in joints if joint.get("type") != "fixed"]),
    "mimicJoints": len([joint for joint in joints if joint.find("mimic") is not None]),
    "hardwareConnected": False,
}, indent=2) + "\n")
