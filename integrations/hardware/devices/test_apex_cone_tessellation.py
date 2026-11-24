"""CPU regressions using original Voron faces plus generated boundary cases."""

import hashlib
import json
import math
from pathlib import Path
import unittest

from OCP.BRep import BRep_Builder, BRep_Tool
from OCP.BRepAdaptor import BRepAdaptor_Surface
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeFace
from OCP.BRepTools import BRepTools
from OCP.Geom import Geom_ConicalSurface, Geom_CylindricalSurface
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS, TopoDS_Shape
from OCP.gp import gp_Ax1, gp_Ax3, gp_Dir, gp_Pnt, gp_Trsf, gp_Vec

from apex_cone_tessellation import tessellate_apex_cone
from cone_tessellation import tessellate_periodic_cone


FIXTURES = Path(__file__).parent / 'fixtures' / 'voron-apex-cones'


def original_face(name='face-2340.brep'):
    shape = TopoDS_Shape()
    if not BRepTools.Read_s(shape, str(FIXTURES / name), BRep_Builder()):
        raise RuntimeError(f'Cannot read original fixture {name}')
    return TopoDS.Face_s(shape)


def cone(angle=math.pi / 3, u_end=math.tau, apex=True):
    surface = Geom_ConicalSurface(gp_Ax3(), angle, 1.5)
    apex_v = -1.5 / math.sin(angle)
    low, high = sorted((apex_v if apex else apex_v / 2, 0))
    return BRepBuilderAPI_MakeFace(surface, 0, u_end, low, high, 1e-8).Face()


class ApexConeTessellationTest(unittest.TestCase):
    def assert_original_mesh(self, face, report):
        self.assertIsNotNone(report)
        self.assertLess(report['relativeAreaError'], .005)
        self.assertLessEqual(report['maxSampledDeviationMillimetres'], report['linearDeflectionMillimetres'])
        self.assertLessEqual(report['analyticMaxChordDeviationMillimetres'], report['linearDeflectionMillimetres'])
        location = TopLoc_Location()
        tri = BRep_Tool.Triangulation_s(face, location)
        local_surface = BRep_Tool.Surface_s(face, TopLoc_Location())
        world_surface = BRepAdaptor_Surface(face)
        self.assertEqual(tri.NbTriangles(), report['triangles'])
        for index in range(1, tri.NbNodes() + 1):
            uv = tri.UVNode(index)
            local = local_surface.Value(uv.X(), uv.Y())
            self.assertLess(local.Distance(tri.Node(index)), 1e-8)
            world = tri.Node(index).Transformed(location.Transformation())
            self.assertLess(world.Distance(world_surface.Value(uv.X(), uv.Y())), 1e-8)
            # Apex has a distinct limiting normal for each generator sector.
            v = (report['apexV'] + report['baseV']) / 2 if abs(uv.Y() - report['apexV']) < 1e-8 else uv.Y()
            point, du, dv = gp_Pnt(), gp_Vec(), gp_Vec()
            local_surface.D1(uv.X(), v, point, du, dv)
            expected = du.Crossed(dv).Normalized()
            self.assertGreater(gp_Vec(tri.Normal(index)).Dot(expected), .999999)
        for index in range(1, tri.NbTriangles() + 1):
            a, b, c = tri.Triangle(index).Get()
            cross = gp_Vec(tri.Node(a), tri.Node(b)).Crossed(gp_Vec(tri.Node(a), tri.Node(c)))
            self.assertGreater(cross.Dot(gp_Vec(tri.Normal(a))), 0)

    def test_all_three_original_voron_faces_preserve_geometry_and_source_bytes(self):
        manifest = json.loads((FIXTURES / 'SOURCE.json').read_text())
        for item in manifest['files']:
            with self.subTest(face=item['sourceFaceOrdinal']):
                fixture = FIXTURES / item['path']
                self.assertEqual(hashlib.sha256(fixture.read_bytes()).hexdigest(), item['sha256'])
                face = original_face(item['path'])
                surface = BRep_Tool.Surface_s(face, TopLoc_Location())
                original_bounds = BRepTools.UVBounds_s(face)[2:]
                before = [surface.Value(u, v).Coord() for u in (-math.pi, 0, math.pi) for v in original_bounds]
                orientation = face.Orientation()
                # The earlier non-apex fallback must retain its narrower guard.
                self.assertIsNone(tessellate_periodic_cone(face, .05, .2))
                report = tessellate_apex_cone(face, .05, .2)
                self.assert_original_mesh(face, report)
                self.assertEqual(report['originalEdgeOccurrences'], 9)
                self.assertEqual(report['originalBaseArcCount'], 6)
                self.assertEqual(report['baseArcSegments'], [11] * 6)
                self.assertEqual(report['triangles'], 66)
                self.assertAlmostEqual(report['areaSquareMillimetres'], item['originalAreaSquareMillimetres'], delta=1e-8)
                self.assertEqual(orientation, face.Orientation())
                after_surface = BRep_Tool.Surface_s(face, TopLoc_Location())
                # Evaluate the same original parameter samples, not recomputed
                # cached UV bounds, which OCCT may tighten at machine precision.
                after = [after_surface.Value(u, v).Coord() for u in (-math.pi, 0, math.pi) for v in original_bounds]
                for a, b in zip(before, after):
                    self.assertLess(gp_Pnt(*a).Distance(gp_Pnt(*b)), 1e-8)
                self.assertEqual(hashlib.sha256(fixture.read_bytes()).hexdigest(), item['sha256'])

    def test_original_six_base_arc_endpoints_remain_exact_mesh_vertices(self):
        face = original_face()
        report = tessellate_apex_cone(face, .05, .2)
        tri = BRep_Tool.Triangulation_s(face, TopLoc_Location())
        surface = BRep_Tool.Surface_s(face, TopLoc_Location())
        for index in range(7):
            u = -math.pi + index * math.pi / 3
            expected = surface.Value(u, report['baseV'])
            self.assertLess(min(expected.Distance(tri.Node(node)) for node in range(1, tri.NbNodes() + 1)), 1e-10)

    def test_positive_and_negative_cone_angles_keep_correct_apex_winding(self):
        for angle in (math.pi / 3, -math.pi / 3):
            with self.subTest(angle=angle):
                face = cone(angle)
                self.assert_original_mesh(face, tessellate_apex_cone(face, .05, .2))

    def test_nonidentity_placement_is_applied_once(self):
        transform = gp_Trsf()
        transform.SetRotation(gp_Ax1(gp_Pnt(), gp_Dir(0, 1, 0)), .7)
        transform.SetTranslationPart(gp_Vec(19, 7, -3))
        face = TopoDS.Face_s(cone().Moved(TopLoc_Location(transform)))
        self.assert_original_mesh(face, tessellate_apex_cone(face, .05, .2))

    def test_requested_smaller_deviation_refines_the_original_surface(self):
        face = original_face()
        report = tessellate_apex_cone(face, .0001, .03)
        self.assert_original_mesh(face, report)
        self.assertGreater(report['triangles'], 66)
        self.assertLess(report['analyticMaxChordDeviationMillimetres'], .0001)

    def test_partial_period_and_non_apex_cones_are_rejected(self):
        for face in (cone(u_end=math.pi), cone(apex=False)):
            self.assertIsNone(tessellate_apex_cone(face, .05, .2))
            self.assertIsNone(BRep_Tool.Triangulation_s(face, TopLoc_Location()))

    def test_other_surface_is_not_replaced_with_a_cone(self):
        surface = Geom_CylindricalSurface(gp_Ax3(), 1.5)
        face = BRepBuilderAPI_MakeFace(surface, 0, math.tau, -1, 0, 1e-8).Face()
        self.assertIsNone(tessellate_apex_cone(face, .05, .2))

    def test_existing_triangulation_is_not_overwritten(self):
        face = original_face()
        first = tessellate_apex_cone(face, .05, .2)
        self.assertIsNone(tessellate_apex_cone(face, .001, .05))
        self.assertEqual(BRep_Tool.Triangulation_s(face, TopLoc_Location()).NbTriangles(), first['triangles'])

    def test_invalid_and_unbounded_tolerances_fail_closed(self):
        for value in (0, -1, float('inf'), float('nan')):
            with self.assertRaises(ValueError):
                tessellate_apex_cone(cone(), value, .2)
        for deflection, angle in ((1e-30, .2), (.05, 1e-30)):
            face = cone()
            self.assertIsNone(tessellate_apex_cone(face, deflection, angle))
            self.assertIsNone(BRep_Tool.Triangulation_s(face, TopLoc_Location()))


if __name__ == '__main__':
    unittest.main(verbosity=2)
