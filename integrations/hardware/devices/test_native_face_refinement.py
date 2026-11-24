"""Original tiny/curved CAD faces must pass real coverage, not mesh presence."""

import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

from OCP.BRep import BRep_Builder, BRep_Tool
from OCP.BRepCheck import BRepCheck_Analyzer
from OCP.BRepGProp import BRepGProp
from OCP.BRepTools import BRepTools
from OCP.GProp import GProp_GProps
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS, TopoDS_Shape
from OCP.gp import gp_Vec

spec = importlib.util.spec_from_file_location('hardware_native_refinement_converter', Path(__file__).with_name('convert-step.py'))
converter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(converter)
FIXTURES = Path(__file__).parent / 'fixtures' / 'voron-native-refinement'


def original_face(name):
    shape = TopoDS_Shape()
    if not BRepTools.Read_s(shape, str(FIXTURES / name), BRep_Builder()):
        raise RuntimeError(f'Cannot read original fixture {name}')
    return TopoDS.Face_s(shape)


def actual_mesh_area(face):
    tri = BRep_Tool.Triangulation_s(face, TopLoc_Location())
    if tri is None:
        return 0.0, 0
    area = 0.0
    for index in range(1, tri.NbTriangles() + 1):
        a, b, c = tri.Triangle(index).Get()
        area += gp_Vec(tri.Node(a), tri.Node(b)).Crossed(gp_Vec(tri.Node(a), tri.Node(c))).Magnitude() / 2
    return area, tri.NbTriangles()


class NativeOriginalFaceRefinementTest(unittest.TestCase):
    def test_thin_plane_uses_stable_adaptive_original_area(self):
        face = original_face('face-9019.brep')
        default = GProp_GProps()
        BRepGProp.SurfaceProperties_s(face, default)
        area, estimated_error = converter.precise_face_area(face)
        independently_tighter = GProp_GProps()
        BRepGProp.SurfaceProperties_s(face, independently_tighter, 1e-12)
        self.assertAlmostEqual(area, .0005334845439710955, delta=1e-12)
        self.assertAlmostEqual(area, independently_tighter.Mass(), delta=1e-12)
        self.assertLess(estimated_error, 1e-7)
        # The old default integral is a measurable inaccurate reference here.
        self.assertGreater(abs(default.Mass() - area) / area, .03)

    def test_thin_plane_does_not_accept_the_one_triangle_or_coarse_mesh(self):
        face = original_face('face-9019.brep')
        area, _ = converter.precise_face_area(face)
        report = converter.refine_original_face(face, .25, .45)
        self.assertIsNotNone(report)
        mesh_area, triangles = actual_mesh_area(face)
        self.assertGreater(triangles, 200)
        self.assertLessEqual(abs(mesh_area - area) / area, .005)
        self.assertTrue(BRepCheck_Analyzer(face).IsValid())

    def test_nine_original_curved_planar_strips_keep_area_and_placement(self):
        source = json.loads((FIXTURES / 'SOURCE.json').read_text())
        names = [item['path'] for item in source['files'] if item['sourceFaceOrdinal'] not in (8935, 9019)]
        self.assertEqual(len(names), 9)
        for name in names:
            with self.subTest(face=name):
                face = original_face(name)
                before_location = TopLoc_Location()
                surface = BRep_Tool.Surface_s(face, before_location)
                bounds = BRepTools.UVBounds_s(face)
                points = [(u, v) for u in bounds[:2] for v in bounds[2:]]
                before = [surface.Value(u, v).Coord() for u, v in points]
                orientation = face.Orientation()
                area, _ = converter.precise_face_area(face)
                self.assertIsNotNone(converter.refine_original_face(face, .25, .45))
                mesh_area, triangles = actual_mesh_area(face)
                self.assertGreaterEqual(triangles, 100)
                self.assertLessEqual(abs(mesh_area - area) / area, .005)
                location = TopLoc_Location()
                after = BRep_Tool.Surface_s(face, location)
                self.assertEqual(before, [after.Value(u, v).Coord() for u, v in points])
                self.assertEqual(face.Orientation(), orientation)
                self.assertTrue(location.IsEqual(before_location))
                self.assertTrue(BRepCheck_Analyzer(face).IsValid())

    def test_all_original_fixture_hashes_match_upstream_extraction_record(self):
        source = json.loads((FIXTURES / 'SOURCE.json').read_text())
        self.assertEqual(len(source['files']), 11)
        for item in source['files']:
            self.assertEqual(hashlib.sha256((FIXTURES / item['path']).read_bytes()).hexdigest(), item['sha256'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
