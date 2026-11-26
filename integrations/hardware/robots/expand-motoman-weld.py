"""Expand two frozen manufacturer Xacros and compose an explicitly local layout."""
import copy
import hashlib
import json
import math
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

ARM = "motoman_ma2010_support"
POSITIONER = "motoman_motopos_d500_support"
PACKAGES = {ARM, POSITIONER, "motoman_resources"}
ARM_PATH = f"{ARM}/urdf/ma2010.xacro"
POSITIONER_PATH = f"{POSITIONER}/urdf/motopos_d500.xacro"


def movable(root):
    return [joint for joint in root.findall("joint") if joint.get("type") != "fixed"]


def root_link(robot):
    links = [link.attrib["name"] for link in robot.findall("link")]
    children = [joint.find("child").attrib["link"] for joint in robot.findall("joint")]
    if len(links) != len(set(links)) or len(children) != len(set(children)):
        raise ValueError("Duplicate links or multiple parents")
    roots = set(links) - set(children)
    if len(roots) != 1:
        raise ValueError(f"Expected one root: {roots}")
    return next(iter(roots))


def compose(arm, positioner, offset=(2.0, 0.0, 0.0)):
    """Preserve all original visual/collision and joint data; only scope names."""
    if len(offset) != 3 or not all(math.isfinite(v) for v in offset):
        raise ValueError("Invalid illustrative installation translation")
    cell = ET.Element("robot", name="motoman_weld_cell_illustrative")
    ET.SubElement(cell, "link", name="world")
    for robot, prefix, xyz in ((arm, "arm_", (0, 0, 0)), (positioner, "positioner_", offset)):
        links = {link.attrib["name"] for link in robot.findall("link")}
        joints = {joint.attrib["name"] for joint in robot.findall("joint")}
        materials = {material.attrib["name"] for material in robot.findall("material") if material.get("name")}
        for original in robot:
            node = copy.deepcopy(original)
            if node.tag not in {"link", "joint", "material"}:
                raise ValueError(f"Unexpected top-level model element {node.tag}")
            if node.get("name"):
                node.set("name", prefix + node.attrib["name"])
            for child in node.iter():
                if child.tag in {"parent", "child"}:
                    value = child.attrib["link"]
                    if value not in links:
                        raise ValueError(f"Unknown link {value}")
                    child.set("link", prefix + value)
                if child.tag == "mimic":
                    value = child.attrib["joint"]
                    if value not in joints:
                        raise ValueError(f"Unknown mimic joint {value}")
                    child.set("joint", prefix + value)
                if child is not node and child.tag == "material" and child.get("name") in materials:
                    child.set("name", prefix + child.attrib["name"])
            cell.append(node)
        mount = ET.SubElement(cell, "joint", name=prefix + "mount", type="fixed")
        ET.SubElement(mount, "parent", link="world")
        ET.SubElement(mount, "child", link=prefix + root_link(robot))
        ET.SubElement(mount, "origin", xyz=" ".join(map(str, xyz)), rpy="0 0 0")
    if root_link(cell) != "world" or len(movable(cell)) != 8:
        raise ValueError("Combined model must have one world root and eight movable joints")
    return cell


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def write_atomic(file, data):
    temporary = file.with_suffix(file.suffix + ".tmp")
    temporary.write_bytes(data)
    temporary.replace(file)


def build(source, output):
    import xacro
    import xacro.substitution_args

    source = Path(source).resolve()
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=True)

    def find_package(name):
        if name not in PACKAGES:
            raise ValueError(f"Unexpected upstream package: {name}")
        package = source / name
        if not package.is_dir():
            raise FileNotFoundError(package)
        return str(package)

    xacro.substitution_args._eval_find = find_package
    models = []
    roots = []
    for relative, filename, count in [(ARM_PATH, "ma2010.urdf", 6), (POSITIONER_PATH, "motopos-d500.urdf", 2)]:
        original = source / relative
        before = digest(original)
        text = xacro.process_file(str(original)).toprettyxml(indent="  ")
        for package in PACKAGES:
            text = text.replace(str(source / package) + "/", "package://" + package + "/")
        robot = ET.fromstring(text)
        if len(movable(robot)) != count:
            raise ValueError(f"{relative}: unexpected joint count")
        root_link(robot)
        for mesh in robot.findall(".//mesh"):
            uri = mesh.attrib["filename"]
            if not uri.startswith("package://"):
                raise ValueError(f"Non-package mesh {uri}")
            pkg, rest = uri[len("package://"):].split("/", 1)
            if pkg not in PACKAGES:
                raise ValueError(f"Unknown mesh package {pkg}")
            target = (source / pkg / rest).resolve()
            if not target.is_relative_to(source / pkg) or not target.is_file() or not target.stat().st_size:
                raise ValueError(f"Missing original mesh: {uri}")
        destination = output / filename
        write_atomic(destination, text.encode("utf-8"))
        if digest(original) != before:
            raise ValueError("Original Xacro was modified")
        models.append({"source": relative, "sourceSha256": before, "output": filename, "outputSha256": digest(destination), "movableJoints": count})
        roots.append(robot)
    cell = compose(*roots)
    ET.indent(cell, space="  ")
    destination = output / "weld-cell.urdf"
    write_atomic(destination, ET.tostring(cell, encoding="utf-8", xml_declaration=True))
    models.append({"sources": [ARM_PATH, POSITIONER_PATH], "output": destination.name, "outputSha256": digest(destination), "movableJoints": 8, "localMountTranslationMetres": [2, 0, 0]})
    write_atomic(output / "expansion.json", (json.dumps({"schemaVersion": 1, "models": models, "physicalSimulation": False, "collisionChecked": False, "hardwareConnected": False, "layoutCalibrated": False}, indent=2) + "\n").encode("utf-8"))


if __name__ == "__main__":
    build(sys.argv[1], sys.argv[2])
