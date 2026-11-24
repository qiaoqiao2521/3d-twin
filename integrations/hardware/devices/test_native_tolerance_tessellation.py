"""The sole authored-precision exception retains the exact original kernel mesh."""

import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

from OCP.BRep import BRep_Builder, BRep_Tool
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.BRepTools import BRepTools
from OCP.TopAbs import TopAbs_EDGE
from OCP.TopExp import TopExp_Explorer
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS, TopoDS_Shape
from OCP.gp import gp_Trsf, gp_Vec

from native_tolerance_tessellation import AUDIT_PATH, tessellate_original_tolerance_face

FIXTURE = Path(__file__).parent / 'fixtures' / 'voron-native-refinement' / 'face-8935.brep'
POLICY = json.loads(AUDIT_PATH.read_text())
SOURCE_SHA = POLICY['source']['stepSha256']
spec = importlib.util.spec_from_file_location('hardware_tolerance_gate_converter', Path(__file__).with_name('convert-step.py'))
converter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(converter)


def original_face():
    shape = TopoDS_Shape()
    if not BRepTools.Read_s(shape, str(FIXTURE), BRep_Builder()):
        raise RuntimeError('Cannot read original tolerance-limited CAD fixture')
    return TopoDS.Face_s(shape)


def mesh_snapshot(face):
    tri = BRep_Tool.Triangulation_s(face, TopLoc_Location())
    return {
        'nodes': [tri.Node(index).Coord() for index in range(1, tri.NbNodes() + 1)],
        'uv': [tri.UVNode(index).Coord() for index in range(1, tri.NbNodes() + 1)],
        'triangles': [tri.Triangle(index).Get() for index in range(1, tri.NbTriangles() + 1)],
    }


class NativeToleranceTessellationTest(unittest.TestCase):
    def test_exact_original_kernel_nodes_uv_and_triangles_are_retained(self):
        original = original_face()
        parameters = POLICY['nativeMeshing']
        BRepMesh_IncrementalMesh(original, parameters['linearDeflectionMillimetres'], False, parameters['angularDeflectionRadians'], False)
        expected = mesh_snapshot(original)
        face = original_face()
        report = tessellate_original_tolerance_face(face, .25, .45, SOURCE_SHA, 8935)
        self.assertIsNotNone(report)
        self.assertEqual(mesh_snapshot(face), expected)
        self.assertEqual(report['triangles'], 4)
        self.assertEqual(report['nodes'], 6)
        self.assertFalse(report['areaCertification'])
        self.assertFalse(report['wholeDomainSurfaceErrorBoundClaimed'])
        self.assertTrue(report['noProjectionOrAddedClosingEdges'])
        self.assertEqual(sum(row['samples'] for row in report['triangleSampleAudits']), 3444)
        self.assertEqual(sum(row['samples'] for row in report['originalBoundarySegmentAudits']), 390)
        self.assertLess(max(row['maxSampledDeviationOverInterpolatedOriginalEntityTolerance'] for row in report['triangleSampleAudits']), .8)
        self.assertLess(max(row['maxSampledDeviationOverInterpolatedOriginalEntityTolerance'] for row in report['originalBoundarySegmentAudits']), 1)
        self.assertEqual(sum(row['kind'] == 'originalVertex' for row in report['nodeEntities'].values()), 2)
        self.assertEqual(sum(row['kind'] == 'originalEdge' for row in report['nodeEntities'].values()), 4)
        self.assertLess(max(row['distanceToOriginalEntityMillimetres'] for row in report['nodeEntities'].values()), 1e-10)

    def test_other_complete_source_hash_or_face_ordinal_is_rejected(self):
        for sha, index in ((SOURCE_SHA, 8936), ('0' * 64, 8935), ('', 8935)):
            face = original_face()
            self.assertIsNone(tessellate_original_tolerance_face(face, .25, .45, sha, index))
            self.assertIsNone(BRep_Tool.Triangulation_s(face, TopLoc_Location()))

    def test_relocated_face_cannot_borrow_the_pinned_source_identity(self):
        transform = gp_Trsf()
        transform.SetTranslation(gp_Vec(1, 0, 0))
        face = TopoDS.Face_s(original_face().Moved(TopLoc_Location(transform)))
        self.assertIsNone(tessellate_original_tolerance_face(face, .25, .45, SOURCE_SHA, 8935))
        self.assertIsNone(BRep_Tool.Triangulation_s(face, TopLoc_Location()))

    def test_increased_original_edge_tolerance_is_not_a_way_to_pass(self):
        face = original_face()
        explorer = TopExp_Explorer(face, TopAbs_EDGE)
        edge = TopoDS.Edge_s(explorer.Current())
        BRep_Builder().UpdateEdge(edge, BRep_Tool.Tolerance_s(edge) * 2)
        self.assertIsNone(tessellate_original_tolerance_face(face, .25, .45, SOURCE_SHA, 8935))
        self.assertIsNone(BRep_Tool.Triangulation_s(face, TopLoc_Location()))

    def test_request_for_precision_beyond_recorded_native_mesh_is_not_overridden(self):
        for deflection, angle in ((1e-6, .45), (.25, 1e-4), (0, .45)):
            face = original_face()
            self.assertIsNone(tessellate_original_tolerance_face(face, deflection, angle, SOURCE_SHA, 8935))
            self.assertIsNone(BRep_Tool.Triangulation_s(face, TopLoc_Location()))

    def test_negative_signed_integral_is_not_an_unsigned_area_target(self):
        face = original_face()
        signed, _ = converter.precise_face_area(face)
        self.assertLess(signed, 0)
        self.assertIsNone(converter.refine_original_face(face, .25, .45))
        report = tessellate_original_tolerance_face(face, .25, .45, SOURCE_SHA, 8935)
        self.assertIsNotNone(report)
        self.assertLess(report['signedOriginalIntegralNotAnUnsignedAreaReference'], 0)
        self.assertFalse(report['areaCertification'])

    def test_existing_native_mesh_is_never_rewritten(self):
        face = original_face()
        self.assertIsNotNone(tessellate_original_tolerance_face(face, .25, .45, SOURCE_SHA, 8935))
        before = mesh_snapshot(face)
        self.assertIsNone(tessellate_original_tolerance_face(face, .25, .45, SOURCE_SHA, 8935))
        self.assertEqual(before, mesh_snapshot(face))

    def test_source_fixture_and_fixed_audit_are_only_read(self):
        fixture_sha = hashlib.sha256(FIXTURE.read_bytes()).hexdigest()
        audit_sha = hashlib.sha256(AUDIT_PATH.read_bytes()).hexdigest()
        self.assertEqual(fixture_sha, POLICY['source']['diagnosticBrepSha256'])
        report = tessellate_original_tolerance_face(original_face(), .25, .45, SOURCE_SHA, 8935)
        self.assertIsNotNone(report)
        self.assertEqual(report['fixedSourceAuditSha256'], audit_sha)
        self.assertEqual(hashlib.sha256(FIXTURE.read_bytes()).hexdigest(), fixture_sha)
        self.assertEqual(hashlib.sha256(AUDIT_PATH.read_bytes()).hexdigest(), audit_sha)


if __name__ == '__main__':
    unittest.main(verbosity=2)
