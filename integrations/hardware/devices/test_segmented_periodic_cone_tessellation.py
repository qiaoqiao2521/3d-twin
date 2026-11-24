"""Actual original split-ring CAD regressions; no browser or GPU required."""

import hashlib
import json
import math
from pathlib import Path
import unittest

from OCP.BRep import BRep_Builder, BRep_Tool
from OCP.BRepAdaptor import BRepAdaptor_Curve, BRepAdaptor_Surface
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeFace
from OCP.BRepTools import BRepTools
from OCP.Geom import Geom_ConicalSurface, Geom_CylindricalSurface
from OCP.TopAbs import TopAbs_EDGE, TopAbs_REVERSED
from OCP.TopExp import TopExp_Explorer
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS, TopoDS_Shape
from OCP.gp import gp_Ax3, gp_Pnt, gp_Vec

from apex_cone_tessellation import tessellate_apex_cone
from cone_tessellation import tessellate_periodic_cone
from segmented_periodic_cone_tessellation import tessellate_segmented_periodic_cone


FIXTURES = Path(__file__).parent / 'fixtures' / 'voron-segmented-cones'


def original_face(name='face-38509.brep'):
    shape = TopoDS_Shape()
    if not BRepTools.Read_s(shape, str(FIXTURES / name), BRep_Builder()):
        raise RuntimeError(f'Cannot read original fixture {name}')
    return TopoDS.Face_s(shape)


class SegmentedConeTessellationTest(unittest.TestCase):
    def assert_original_mesh(self, face, report):
        self.assertIsNotNone(report)
        self.assertLess(report['relativeAreaError'], .005)
        self.assertLessEqual(report['maxSampledDeviationMillimetres'], report['analyticMaxLinearDeviationBoundMillimetres'])
        self.assertLessEqual(report['analyticMaxLinearDeviationBoundMillimetres'], report['linearDeflectionMillimetres'])
        location = TopLoc_Location()
        tri = BRep_Tool.Triangulation_s(face, location)
        self.assertFalse(location.IsIdentity())
        surface = BRep_Tool.Surface_s(face, TopLoc_Location())
        world_surface = BRepAdaptor_Surface(face)
        for index in range(1, tri.NbNodes() + 1):
            uv = tri.UVNode(index)
            self.assertLess(tri.Node(index).Distance(surface.Value(uv.X(), uv.Y())), 1e-10)
            self.assertLess(tri.Node(index).Transformed(location.Transformation()).Distance(world_surface.Value(uv.X(), uv.Y())), 1e-9)
            point, du, dv = gp_Pnt(), gp_Vec(), gp_Vec()
            surface.D1(uv.X(), uv.Y(), point, du, dv)
            self.assertGreater(gp_Vec(tri.Normal(index)).Dot(du.Crossed(dv).Normalized()), .999999)
        for index in range(1, tri.NbTriangles() + 1):
            a, b, c = tri.Triangle(index).Get()
            cross = gp_Vec(tri.Node(a), tri.Node(b)).Crossed(gp_Vec(tri.Node(a), tri.Node(c)))
            self.assertGreater(cross.Dot(gp_Vec(tri.Normal(a))), 0)

    def test_actual_three_original_faces_keep_geometry_source_and_orientation(self):
        source = json.loads((FIXTURES / 'SOURCE.json').read_text())
        for item in source['files']:
            with self.subTest(face=item['sourceFaceOrdinal']):
                file = FIXTURES / item['path']
                self.assertEqual(hashlib.sha256(file.read_bytes()).hexdigest(), item['sha256'])
                face = original_face(item['path'])
                orientation = face.Orientation()
                surface = BRep_Tool.Surface_s(face, TopLoc_Location())
                params = [(u, v) for u in BRepTools.UVBounds_s(face)[:2] for v in BRepTools.UVBounds_s(face)[2:]]
                before = [surface.Value(u, v).Coord() for u, v in params]
                self.assertIsNone(tessellate_periodic_cone(face, .05, .2))
                self.assertIsNone(tessellate_apex_cone(face, .05, .2))
                report = tessellate_segmented_periodic_cone(face, .05, .2)
                self.assert_original_mesh(face, report)
                self.assertEqual(report['originalEdgeOccurrences'], 5)
                self.assertEqual(report['originalRingArcCounts'], [2, 1])
                self.assertAlmostEqual(report['areaSquareMillimetres'], item['originalAreaSquareMillimetres'], delta=1e-8)
                self.assertEqual(orientation, face.Orientation())
                after = BRep_Tool.Surface_s(face, TopLoc_Location())
                self.assertEqual(before, [after.Value(u, v).Coord() for u, v in params])
                self.assertEqual(hashlib.sha256(file.read_bytes()).hexdigest(), item['sha256'])

    def test_every_original_3d_edge_endpoint_exists_in_the_placed_mesh(self):
        for filename in ('face-38016.brep', 'face-38509.brep', 'face-38510.brep'):
            face = original_face(filename)
            report = tessellate_segmented_periodic_cone(face, .05, .2)
            self.assertLess(report['maxOriginalArcEndpointDeviationMillimetres'], 1e-7)
            location = TopLoc_Location()
            tri = BRep_Tool.Triangulation_s(face, location)
            world_nodes = [tri.Node(index).Transformed(location.Transformation()) for index in range(1, tri.NbNodes() + 1)]
            explorer = TopExp_Explorer(face, TopAbs_EDGE)
            while explorer.More():
                edge = TopoDS.Edge_s(explorer.Current())
                curve = BRepAdaptor_Curve(edge)
                for parameter in (curve.FirstParameter(), curve.LastParameter()):
                    point = curve.Value(parameter)
                    self.assertLess(min(point.Distance(node) for node in world_nodes), 1e-7)
                explorer.Next()

    def test_reversed_face_keeps_surface_winding_for_standard_exporter(self):
        face = original_face('face-38509.brep')
        self.assertEqual(face.Orientation(), TopAbs_REVERSED)
        self.assert_original_mesh(face, tessellate_segmented_periodic_cone(face, .05, .2))
        self.assertEqual(face.Orientation(), TopAbs_REVERSED)

    def test_full_triangle_deviation_bound_covers_dense_barycentric_samples(self):
        face = original_face()
        report = tessellate_segmented_periodic_cone(face, .05, .2)
        tri = BRep_Tool.Triangulation_s(face, TopLoc_Location())
        surface = BRep_Tool.Surface_s(face, TopLoc_Location())
        for index in range(1, tri.NbTriangles() + 1):
            vertices = tri.Triangle(index).Get()
            for a in range(9):
                for b in range(9 - a):
                    weights = (a / 8, b / 8, (8 - a - b) / 8)
                    u = sum(weight * tri.UVNode(vertex).X() for weight, vertex in zip(weights, vertices))
                    v = sum(weight * tri.UVNode(vertex).Y() for weight, vertex in zip(weights, vertices))
                    linear = gp_Pnt(*(sum(weight * tri.Node(vertex).Coord()[axis] for weight, vertex in zip(weights, vertices)) for axis in range(3)))
                    self.assertLessEqual(linear.Distance(surface.Value(u, v)), report['analyticMaxLinearDeviationBoundMillimetres'] + 1e-10)

    def test_smaller_tolerance_refines_without_dropping_original_endpoints(self):
        face = original_face()
        report = tessellate_segmented_periodic_cone(face, .005, .08)
        self.assert_original_mesh(face, report)
        self.assertGreater(report['triangles'], 130)
        self.assertLess(report['maxOriginalArcEndpointDeviationMillimetres'], 1e-7)

    def test_unsegmented_partial_apex_and_other_surfaces_are_rejected(self):
        surface = Geom_ConicalSurface(gp_Ax3(), math.pi / 4, 1.5)
        cylinder = Geom_CylindricalSurface(gp_Ax3(), 1.5)
        for source, u, v in ((surface, math.tau, -1), (surface, math.pi, -1), (surface, math.tau, -1.5 / math.sin(math.pi / 4)), (cylinder, math.tau, -1)):
            face = BRepBuilderAPI_MakeFace(source, 0, u, v, 0, 1e-8).Face()
            self.assertIsNone(tessellate_segmented_periodic_cone(face, .05, .2))
            self.assertIsNone(BRep_Tool.Triangulation_s(face, TopLoc_Location()))

    def test_existing_mesh_is_not_overwritten(self):
        face = original_face()
        first = tessellate_segmented_periodic_cone(face, .05, .2)
        self.assertIsNone(tessellate_segmented_periodic_cone(face, .005, .08))
        self.assertEqual(BRep_Tool.Triangulation_s(face, TopLoc_Location()).NbTriangles(), first['triangles'])

    def test_invalid_or_unbounded_tolerances_fail_closed(self):
        for value in (0, -1, float('inf'), float('nan')):
            with self.assertRaises(ValueError):
                tessellate_segmented_periodic_cone(original_face(), value, .2)
        for deflection, angle in ((1e-30, .2), (.05, 1e-30)):
            face = original_face()
            self.assertIsNone(tessellate_segmented_periodic_cone(face, deflection, angle))
            self.assertIsNone(BRep_Tool.Triangulation_s(face, TopLoc_Location()))


if __name__ == '__main__':
    unittest.main(verbosity=2)
