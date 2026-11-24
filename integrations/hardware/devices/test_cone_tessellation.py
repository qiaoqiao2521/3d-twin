"""CPU geometry regressions for the narrowly scoped original-cone fallback."""
import math
import unittest

from OCP.BRep import BRep_Tool
from OCP.BRepAdaptor import BRepAdaptor_Surface
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeFace
from OCP.BRepTools import BRepTools
from OCP.Geom import Geom_ConicalSurface, Geom_CylindricalSurface
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS
from OCP.gp import gp_Ax1, gp_Ax3, gp_Dir, gp_Pnt, gp_Trsf, gp_Vec

from cone_tessellation import tessellate_periodic_cone


def cone(u_end=math.tau, v_start=-.1):
    surface = Geom_ConicalSurface(gp_Ax3(), math.pi / 4, .25)
    return BRepBuilderAPI_MakeFace(surface, 0, u_end, v_start, 0, 1e-8).Face()


class ConeTessellationTest(unittest.TestCase):
    def test_complete_cone_keeps_the_exact_surface_bounds_and_normals(self):
        face = cone()
        surface = BRep_Tool.Surface_s(face, TopLoc_Location())
        original_bounds = BRepTools.UVBounds_s(face)
        report = tessellate_periodic_cone(face, .05, .2)
        self.assertIsNotNone(report)
        self.assertLess(report['relativeAreaError'], .005)
        self.assertLessEqual(report['maxSampledDeviationMillimetres'], .05)
        self.assertEqual(original_bounds, BRepTools.UVBounds_s(face))
        tri = BRep_Tool.Triangulation_s(face, TopLoc_Location())
        self.assertEqual(tri.NbTriangles(), report['triangles'])
        for i in range(1, tri.NbNodes() + 1):
            uv = tri.UVNode(i)
            expected, du, dv = gp_Pnt(), gp_Vec(), gp_Vec()
            surface.D1(uv.X(), uv.Y(), expected, du, dv)
            self.assertLess(tri.Node(i).Distance(expected), 1e-12)
            self.assertGreater(gp_Vec(tri.Normal(i)).Dot(du.Crossed(dv).Normalized()), .999999)
        for i in range(1, tri.NbTriangles() + 1):
            a, b, c = tri.Triangle(i).Get()
            cross = gp_Vec(tri.Node(a), tri.Node(b)).Crossed(gp_Vec(tri.Node(a), tri.Node(c)))
            self.assertGreater(cross.Dot(gp_Vec(tri.Normal(a))), 0)

    def test_nonidentity_placement_is_applied_exactly_once(self):
        transform = gp_Trsf()
        transform.SetRotation(gp_Ax1(gp_Pnt(), gp_Dir(0, 1, 0)), .7)
        transform.SetTranslationPart(gp_Vec(19, 7, -3))
        face = TopoDS.Face_s(cone().Moved(TopLoc_Location(transform)))
        self.assertIsNotNone(tessellate_periodic_cone(face, .05, .2))
        location = TopLoc_Location()
        tri = BRep_Tool.Triangulation_s(face, location)
        self.assertFalse(location.IsIdentity())
        original = BRepAdaptor_Surface(face)
        for i in range(1, tri.NbNodes() + 1):
            uv = tri.UVNode(i)
            self.assertLess(tri.Node(i).Transformed(location.Transformation()).Distance(original.Value(uv.X(), uv.Y())), 1e-9)

    def test_partial_period_is_rejected_without_a_mesh(self):
        face = cone(math.pi)
        self.assertIsNone(tessellate_periodic_cone(face, .05, .2))
        self.assertIsNone(BRep_Tool.Triangulation_s(face, TopLoc_Location()))

    def test_other_surfaces_are_not_replaced_by_a_cone(self):
        surface = Geom_CylindricalSurface(gp_Ax3(), .25)
        face = BRepBuilderAPI_MakeFace(surface, 0, math.tau, -.1, 0, 1e-8).Face()
        self.assertIsNone(tessellate_periodic_cone(face, .05, .2))
        self.assertIsNone(BRep_Tool.Triangulation_s(face, TopLoc_Location()))

    def test_apex_topology_is_rejected(self):
        face = cone(v_start=-.25 / math.sin(math.pi / 4))
        self.assertIsNone(tessellate_periodic_cone(face, .05, .2))

    def test_existing_triangulation_is_never_overwritten(self):
        face = cone()
        self.assertIsNotNone(tessellate_periodic_cone(face, .05, .2))
        before = BRep_Tool.Triangulation_s(face, TopLoc_Location()).NbTriangles()
        self.assertIsNone(tessellate_periodic_cone(face, .01, .1))
        self.assertEqual(before, BRep_Tool.Triangulation_s(face, TopLoc_Location()).NbTriangles())

    def test_invalid_or_unbounded_tolerances_fail_closed(self):
        with self.assertRaises(ValueError):
            tessellate_periodic_cone(cone(), 0, .2)
        self.assertIsNone(tessellate_periodic_cone(cone(), 1e-30, .2))
        self.assertIsNone(tessellate_periodic_cone(cone(), .05, 1e-30))


if __name__ == '__main__':
    unittest.main(verbosity=2)
