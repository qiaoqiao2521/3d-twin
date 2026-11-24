"""Real STEP -> GLB regression for units, world axes, names and original color."""
import argparse
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest

from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
from OCP.gp import gp_Pnt, gp_Trsf, gp_Vec
from OCP.BRep import BRep_Builder
from OCP.IFSelect import IFSelect_RetDone
from OCP.Quantity import Quantity_Color, Quantity_TOC_RGB
from OCP.STEPCAFControl import STEPCAFControl_Writer
from OCP.STEPControl import STEPControl_AsIs
from OCP.TCollection import TCollection_ExtendedString
from OCP.TDataStd import TDataStd_Name
from OCP.TDocStd import TDocStd_Document
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS_Compound
from OCP.XCAFDoc import XCAFDoc_DocumentTool, XCAFDoc_ColorType

spec = importlib.util.spec_from_file_location("hardware_step_converter", Path(__file__).with_name("convert-step.py"))
converter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(converter)
reports = []


def multiply(a, b):
    return [[sum(a[r][k] * b[k][c] for k in range(4)) for c in range(4)] for r in range(4)]


def identity():
    return [[float(r == c) for c in range(4)] for r in range(4)]


def matrix(node):
    if "matrix" in node:
        return [[node["matrix"][c * 4 + r] for c in range(4)] for r in range(4)]
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    out = [
        [1 - 2 * (y*y + z*z), 2*(x*y-z*w), 2*(x*z+y*w), 0],
        [2*(x*y+z*w), 1 - 2*(x*x+z*z), 2*(y*z-x*w), 0],
        [2*(x*z-y*w), 2*(y*z+x*w), 1 - 2*(x*x+y*y), 0],
        [0, 0, 0, 1],
    ]
    scale = node.get("scale", [1, 1, 1])
    for row in range(3):
        for col in range(3):
            out[row][col] *= scale[col]
        out[row][3] = node.get("translation", [0, 0, 0])[row]
    return out


def world_bounds(file):
    data, chunks = converter.read_glb(file)
    binary = next(content for kind, content in chunks if kind == 0x004E4942)
    points = []
    def visit(index, parent):
        node = data["nodes"][index]
        world = multiply(parent, matrix(node))
        if "mesh" in node:
            for primitive in data["meshes"][node["mesh"]]["primitives"]:
                accessor = data["accessors"][primitive["attributes"]["POSITION"]]
                assert accessor["componentType"] == 5126 and accessor["type"] == "VEC3"
                view = data["bufferViews"][accessor["bufferView"]]
                offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
                stride = view.get("byteStride", 12)
                for item in range(accessor["count"]):
                    point = [*struct.unpack_from("<3f", binary, offset + item * stride), 1]
                    points.append([sum(world[row][col] * point[col] for col in range(4)) for row in range(3)])
        for child in node.get("children", []):
            visit(child, world)
    for root in data["scenes"][data.get("scene", 0)]["nodes"]:
        visit(root, identity())
    return data, [min(p[i] for p in points) for i in range(3)], [max(p[i] for p in points) for i in range(3)]


class ConversionTest(unittest.TestCase):
    def check_axis(self, axis, expected_minimum, expected_maximum, expected_span):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            document = TDocStd_Document(TCollection_ExtendedString("BinXCAF"))
            XCAFDoc_DocumentTool.SetLengthUnit_s(document, 0.001)
            shape = BRepPrimAPI_MakeBox(gp_Pnt(100, 200, 300), 1000, 2000, 3000).Shape()
            label = XCAFDoc_DocumentTool.ShapeTool_s(document.Main()).AddShape(shape, False)
            name = "Original calibration box 1000x2000x3000 mm"
            TDataStd_Name.Set_s(label, TCollection_ExtendedString(name))
            color = XCAFDoc_DocumentTool.ColorTool_s(document.Main())
            color.SetColor(label, Quantity_Color(1, 0, 0, Quantity_TOC_RGB), XCAFDoc_ColorType.XCAFDoc_ColorGen)
            writer = STEPCAFControl_Writer()
            writer.SetNameMode(True)
            writer.SetColorMode(True)
            self.assertTrue(writer.Transfer(document, STEPControl_AsIs))
            source = base / "calibration.step"
            self.assertEqual(writer.Write(str(source)), IFSelect_RetDone)
            report = converter.convert(source, base / "calibration.glb", source_up_axis=axis)
            gltf, low, high = world_bounds(base / "calibration.glb")
            span = [high[i] - low[i] for i in range(3)]
            for actual, expected in zip([*low, *high, *span], [*expected_minimum, *expected_maximum, *expected_span]):
                self.assertAlmostEqual(actual, expected, places=5)
            self.assertTrue(any(name in node.get("name", "") for node in gltf["nodes"]))
            self.assertTrue(any(material.get("pbrMetallicRoughness", {}).get("baseColorFactor", [])[:3] == [1, 0, 0] for material in gltf["materials"]))
            self.assertEqual(report["unmeshedNondegenerateFaces"], [])
            reports.append({"sourceUpAxis": axis, "sourceDimensionsMillimetres": [1000, 2000, 3000],
                            "worldMinimumMetres": low, "worldMaximumMetres": high, "worldSpanMetres": span,
                            "expectedWorldSpanMetres": expected_span, "namesPreserved": True, "originalRedMaterialPreserved": True,
                            "triangles": report["trianglesIncludingInstances"], "status": "passed"})

    def test_z_up_conversion_once(self):
        self.check_axis("Z", [0.1, 0.3, -2.2], [1.1, 3.3, -0.2], [1, 3, 2])

    def test_y_up_is_not_rotated(self):
        self.check_axis("Y", [0.1, 0.2, 0.3], [1.1, 2.2, 3.3], [1, 2, 3])

    def test_shared_original_product_keeps_both_occurrences(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            document = TDocStd_Document(TCollection_ExtendedString("BinXCAF"))
            XCAFDoc_DocumentTool.SetLengthUnit_s(document, 0.001)
            shapes = XCAFDoc_DocumentTool.ShapeTool_s(document.Main())
            product = shapes.AddShape(BRepPrimAPI_MakeBox(1000, 2000, 3000).Shape(), False)
            TDataStd_Name.Set_s(product, TCollection_ExtendedString("Shared original part"))
            compound = TopoDS_Compound()
            BRep_Builder().MakeCompound(compound)
            assembly = shapes.AddShape(compound, True)
            TDataStd_Name.Set_s(assembly, TCollection_ExtendedString("Original two-instance assembly"))
            for offset in (0, 3000):
                transform = gp_Trsf()
                transform.SetTranslation(gp_Vec(offset, 0, 0))
                shapes.AddComponent(assembly, product, TopLoc_Location(transform))
            shapes.UpdateAssemblies()
            source = base / "shared-original.step"
            writer = STEPCAFControl_Writer()
            writer.SetNameMode(True)
            self.assertTrue(writer.Transfer(document, STEPControl_AsIs))
            self.assertEqual(writer.Write(str(source)), IFSelect_RetDone)
            original_hash = converter.digest(source)
            report = converter.convert(source, base / "shared-original.glb", source_up_axis="Y")
            gltf, low, high = world_bounds(base / "shared-original.glb")
            self.assertEqual(report["uniqueOriginalLeafProducts"], 1)
            self.assertEqual(report["assemblyOccurrences"], 3)
            self.assertEqual(report["faceOccurrences"], 12)
            self.assertEqual(report["trianglesIncludingInstances"], 24)
            self.assertEqual(len([node for node in gltf["nodes"] if "mesh" in node]), 2)
            for actual, expected in zip([*low, *high], [0, 0, 0, 4, 2, 3]):
                self.assertAlmostEqual(actual, expected, places=5)
            self.assertEqual(original_hash, converter.digest(source))
            reports.append({"fixture": "two original occurrences of one original product", "sourceUnchanged": True,
                            "uniqueOriginalLeafProducts": 1, "originalOccurrences": 3, "renderedInstances": 2,
                            "exportedMeshes": len(gltf["meshes"]), "faceOccurrences": 12, "trianglesIncludingInstances": 24,
                            "worldMinimumMetres": low, "worldMaximumMetres": high, "status": "passed"})


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--report")
    args = parser.parse_args()
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(ConversionTest))
    if args.report:
        target = Path(args.report)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps({"schemaVersion": 1, "tests": reports, "successful": result.wasSuccessful()}, indent=2) + "\n")
    raise SystemExit(0 if result.wasSuccessful() else 1)
