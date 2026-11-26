"""Composition contract: original transforms, mesh URIs and limits are unchanged."""
import importlib.util
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET

spec = importlib.util.spec_from_file_location("motoman_weld", Path(__file__).with_name("expand-motoman-weld.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def fixture(count):
    robot = ET.Element("robot", name="fixture")
    ET.SubElement(robot, "link", name="base_link")
    for i in range(count):
        name = f"link_{i}"
        link = ET.SubElement(robot, "link", name=name)
        ET.SubElement(ET.SubElement(ET.SubElement(link, "visual"), "geometry"), "mesh", filename=f"package://fixture/{i}.stl")
        joint = ET.SubElement(robot, "joint", name=f"joint_{i}", type="revolute")
        ET.SubElement(joint, "parent", link=f"link_{i-1}" if i else "base_link")
        ET.SubElement(joint, "child", link=name)
        ET.SubElement(joint, "origin", xyz="0.1 0.2 0.3", rpy="0 0 0")
        ET.SubElement(joint, "axis", xyz="0 1 0")
        ET.SubElement(joint, "limit", lower="-1", upper="1", velocity="2", effort="3")
    return robot


class CompositionTest(unittest.TestCase):
    def test_preserves_geometry_and_eight_axes(self):
        arm, pos = fixture(6), fixture(2)
        before = [ET.tostring(arm), ET.tostring(pos)]
        cell = module.compose(arm, pos)
        self.assertEqual(before, [ET.tostring(arm), ET.tostring(pos)])
        self.assertEqual(module.root_link(cell), "world")
        self.assertEqual(len(module.movable(cell)), 8)
        self.assertEqual(len(cell.findall("joint")), 10)
        self.assertEqual(cell.find("joint[@name='positioner_mount']/origin").get("xyz"), "2.0 0.0 0.0")
        for original, prefix in [(arm, "arm_"), (pos, "positioner_")]:
            for joint in module.movable(original):
                copied = cell.find(f"joint[@name='{prefix + joint.get('name')}']")
                for tag in ["origin", "axis", "limit"]:
                    self.assertEqual(joint.find(tag).attrib, copied.find(tag).attrib)
            for link in original.findall("link"):
                copied = cell.find(f"link[@name='{prefix + link.get('name')}']")
                self.assertEqual([m.attrib for m in link.findall(".//mesh")], [m.attrib for m in copied.findall(".//mesh")])

    def test_invalid_layout_or_axis_count_fails(self):
        with self.assertRaises(ValueError):
            module.compose(fixture(6), fixture(2), (float("nan"), 0, 0))
        with self.assertRaises(ValueError):
            module.compose(fixture(5), fixture(2))


if __name__ == "__main__":
    unittest.main()
