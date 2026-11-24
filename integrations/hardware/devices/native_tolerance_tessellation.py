"""Retain one pinned original OCCT micro-face under its authored precision.

This is not a general geometry repair. The complete original STEP hash, face
ordinal, original topology/geometry and declared tolerances must match the
fixed source audit. No node is moved or projected, and no UV closing edge is
invented. All other faces continue through the normal completeness/area gate.
"""

from collections import Counter
import hashlib
import importlib.metadata
import json
import math
from pathlib import Path

from OCP.BRep import BRep_Tool
from OCP.BRepAdaptor import BRepAdaptor_Curve, BRepAdaptor_Curve2d
from OCP.BRepCheck import BRepCheck_Analyzer
from OCP.BRepClass import BRepClass_FaceClassifier
from OCP.BRepGProp import BRepGProp
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.BRepTools import BRepTools
from OCP.Geom import Geom_BSplineSurface
from OCP.GeomAbs import GeomAbs_BSplineCurve
from OCP.GProp import GProp_GProps
from OCP.TopAbs import TopAbs_EDGE, TopAbs_IN, TopAbs_ON, TopAbs_WIRE
from OCP.TopExp import TopExp, TopExp_Explorer
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS
from OCP.gp import gp_Pnt, gp_Pnt2d, gp_Vec


AUDIT_PATH = Path(__file__).parent / 'native-tolerance-audits' / 'voron-2.4-face-8935.json'


def _items(shape, kind, cast):
    explorer = TopExp_Explorer(shape, kind)
    while explorer.More():
        yield cast(explorer.Current())
        explorer.Next()


def _close(a, b):
    return math.isclose(a, b, rel_tol=1e-8, abs_tol=1e-13)


def _blend(points, weights):
    return gp_Pnt(*(math.fsum(weight * point.Coord()[axis] for weight, point in zip(weights, points)) for axis in range(3)))


def tessellate_original_tolerance_face(face, deflection, angle, source_sha256, face_index):
    """Return the sampled source-fidelity audit for the one pinned native mesh.

    None means unsupported or a failed source/audit check. The source STEP and
    B-rep geometry are never written; only original OCCT tessellation is used.
    This result explicitly does not certify unsigned area or a whole-domain
    surface error bound, and is separate from ordinary area-certified faces.
    """
    raw_policy = AUDIT_PATH.read_bytes()
    policy = json.loads(raw_policy)
    source, expected, native = policy['source'], policy['expectedTopology'], policy['nativeMeshing']
    if source_sha256 != source['stepSha256'] or face_index != source['faceIndex']:
        return None
    if not all(math.isfinite(value) and value > 0 for value in (deflection, angle)):
        return None
    if deflection < native['linearDeflectionMillimetres'] or angle < native['angularDeflectionRadians']:
        return None
    if importlib.metadata.version(native['package']) != native['version']:
        return None
    existing = BRep_Tool.Triangulation_s(face, TopLoc_Location())
    if existing is not None and existing.NbTriangles():
        return None
    if not BRepCheck_Analyzer(face).IsValid() or str(face.Orientation()) != expected['orientation']:
        return None
    if len(list(_items(face, TopAbs_WIRE, TopoDS.Wire_s))) != expected['wireCount']:
        return None
    location = TopLoc_Location()
    surface = BRep_Tool.Surface_s(face, location)
    if not isinstance(surface, Geom_BSplineSurface) or abs(abs(location.Transformation().ScaleFactor()) - 1) > 1e-10:
        return None
    if (surface.UDegree(), surface.VDegree(), surface.NbUPoles(), surface.NbVPoles(), surface.NbUKnots(), surface.NbVKnots()) != tuple(expected[key] for key in ('uDegree', 'vDegree', 'uPoles', 'vPoles', 'uKnots', 'vKnots')):
        return None
    if not _close(BRep_Tool.Tolerance_s(face), expected['faceToleranceMillimetres']):
        return None
    if not all(_close(a, b) for a, b in zip(BRepTools.UVBounds_s(face), expected['uvBounds'])):
        return None
    transform = location.Transformation()
    original_edges = list(_items(face, TopAbs_EDGE, TopoDS.Edge_s))
    if len(original_edges) != expected['edgeOccurrences']:
        return None
    edges, vertices, source_edge_checks = [], [], []
    for index, (edge, record) in enumerate(zip(original_edges, policy['originalEdges'])):
        curve2d = BRepAdaptor_Curve2d(edge, face)
        if BRep_Tool.Degenerated_s(edge) or not BRep_Tool.SameParameter_s(edge) or curve2d.GetType() != GeomAbs_BSplineCurve:
            return None
        spline = curve2d.BSpline()
        if spline.Degree() != 1 or spline.IsRational() or spline.NbPoles() != 2 or str(edge.Orientation()) != record['orientation']:
            return None
        if not _close(BRep_Tool.Tolerance_s(edge), record['edgeToleranceMillimetres']):
            return None
        for pole, pair in zip((spline.Pole(1), spline.Pole(2)), record['poles']):
            if not all(_close(a, b) for a, b in zip(pole.Coord(), pair)):
                return None
        curve = BRepAdaptor_Curve(edge)
        endpoint_vertices = (TopExp.FirstVertex_s(edge), TopExp.LastVertex_s(edge))
        for vertex, endpoint in zip(endpoint_vertices, record['endpoints']):
            if not _close(BRep_Tool.Tolerance_s(vertex), endpoint['vertexToleranceMillimetres']):
                return None
            if BRep_Tool.Pnt_s(vertex).Distance(gp_Pnt(*endpoint['vertexPoint'])) > 1e-7:
                return None
            if not any(vertex.IsSame(known) for known in vertices):
                vertices.append(vertex)
        first, last = curve2d.FirstParameter(), curve2d.LastParameter()
        max_error = 0.0
        for sample in range(policy['sampledAuditPolicy']['originalEdgeIntervals'] + 1):
            parameter = first + (last - first) * sample / policy['sampledAuditPolicy']['originalEdgeIntervals']
            uv = curve2d.Value(parameter)
            error = curve.Value(parameter).Distance(surface.Value(uv.X(), uv.Y()).Transformed(transform))
            if error > BRep_Tool.Tolerance_s(edge) * (1 + 1e-8):
                return None
            max_error = max(max_error, error)
        edges.append({'edge': edge, 'curve': curve, 'pcurve': curve2d, 'vertices': endpoint_vertices})
        source_edge_checks.append({'originalEdge': index, 'declaredToleranceMillimetres': BRep_Tool.Tolerance_s(edge), 'samples': policy['sampledAuditPolicy']['originalEdgeIntervals'] + 1, 'maxOriginalCurveToSurfaceDeviationMillimetres': max_error})
    if len(vertices) != expected['uniqueVertices']:
        return None
    if not all(any(vertex.IsSame(candidate) for candidate in edges[1]['vertices']) for vertex in edges[0]['vertices']):
        return None
    properties = GProp_GProps()
    estimated_error = BRepGProp.SurfaceProperties_s(face, properties, 1e-10)
    signed_integral = properties.Mass()
    if not _close(signed_integral, policy['referenceAreaEvidence']['signedAdaptiveIntegralSquareMillimetres']):
        return None

    def reject():
        BRepTools.Clean_s(face)
        return None

    BRepTools.Clean_s(face)
    mesher = BRepMesh_IncrementalMesh(face, native['linearDeflectionMillimetres'], False, native['angularDeflectionRadians'], False)
    tri_location = TopLoc_Location()
    tri = BRep_Tool.Triangulation_s(face, tri_location)
    if not mesher.IsDone() or mesher.GetStatusFlags() != 0 or tri is None:
        return reject()
    if tri.NbNodes() != native['expectedNodes'] or tri.NbTriangles() != native['expectedTriangles'] or not tri_location.IsEqual(location):
        return reject()
    node_entities, world_nodes = {}, {}
    for node in range(1, tri.NbNodes() + 1):
        point = tri.Node(node).Transformed(transform)
        pair = tri.UVNode(node)
        world_nodes[node] = point
        entity = None
        for vertex_index, vertex in enumerate(vertices):
            distance = point.Distance(BRep_Tool.Pnt_s(vertex))
            if distance <= expected['faceToleranceMillimetres']:
                parameters = {index: BRep_Tool.Parameter_s(vertex, item['edge']) for index, item in enumerate(edges) if any(vertex.IsSame(candidate) for candidate in item['vertices'])}
                entity = {'kind': 'originalVertex', 'index': vertex_index, 'originalToleranceMillimetres': BRep_Tool.Tolerance_s(vertex), 'edgeParameters': parameters, 'distanceToOriginalEntityMillimetres': distance}
                break
        if entity is None:
            for index, item in enumerate(edges):
                curve = item['pcurve']
                first, last = curve.FirstParameter(), curve.LastParameter()
                a, b = curve.Value(first), curve.Value(last)
                parameter = first + (last - first) * (pair.X() - a.X()) / (b.X() - a.X())
                if parameter < first - 1e-12 or parameter > last + 1e-12 or curve.Value(parameter).Distance(pair) > 1e-12:
                    continue
                distance = point.Distance(item['curve'].Value(parameter))
                if distance <= expected['faceToleranceMillimetres']:
                    entity = {'kind': 'originalEdge', 'index': index, 'originalToleranceMillimetres': BRep_Tool.Tolerance_s(item['edge']), 'edgeParameters': {index: parameter}, 'distanceToOriginalEntityMillimetres': distance}
                    break
        if entity is None:
            return reject()
        deviation = point.Distance(surface.Value(pair.X(), pair.Y()).Transformed(transform))
        if deviation > entity['originalToleranceMillimetres']:
            return reject()
        entity['distanceToOriginalSurfaceAtMeshUVMillimetres'] = deviation
        node_entities[node] = entity
    mesh_edges = Counter()
    triangle_audits = []
    mesh_area = 0.0
    order = policy['sampledAuditPolicy']['triangleBarycentricOrder']
    for index in range(1, tri.NbTriangles() + 1):
        nodes = tri.Triangle(index).Get()
        for first, second in zip(nodes, (*nodes[1:], nodes[0])):
            mesh_edges[tuple(sorted((first, second)))] += 1
        points = [tri.Node(node) for node in nodes]
        cross = gp_Vec(points[0], points[1]).Crossed(gp_Vec(points[0], points[2]))
        mesh_area += cross.Magnitude() / 2
        center_u = math.fsum(tri.UVNode(node).X() for node in nodes) / 3
        center_v = math.fsum(tri.UVNode(node).Y() for node in nodes) / 3
        point, du, dv = gp_Pnt(), gp_Vec(), gp_Vec()
        surface.D1(center_u, center_v, point, du, dv)
        if cross.Dot(du.Crossed(dv)) <= 0:
            return reject()
        max_deviation = max_ratio = 0.0
        samples = 0
        for a in range(order + 1):
            for b in range(order + 1 - a):
                weights = (a / order, b / order, (order - a - b) / order)
                u = math.fsum(weight * tri.UVNode(node).X() for weight, node in zip(weights, nodes))
                v = math.fsum(weight * tri.UVNode(node).Y() for weight, node in zip(weights, nodes))
                if BRepClass_FaceClassifier(face, gp_Pnt2d(u, v), 1e-12).State() not in (TopAbs_IN, TopAbs_ON):
                    return reject()
                actual = _blend([tri.Node(node) for node in nodes], weights)
                deviation = actual.Distance(surface.Value(u, v))
                allowance = math.fsum(weight * node_entities[node]['originalToleranceMillimetres'] for weight, node in zip(weights, nodes))
                ratio = deviation / allowance
                if ratio > 1:
                    return reject()
                max_deviation, max_ratio = max(max_deviation, deviation), max(max_ratio, ratio)
                samples += 1
        triangle_audits.append({'triangle': index, 'nodes': list(nodes), 'samples': samples, 'maxSampledSurfaceDeviationMillimetres': max_deviation, 'maxSampledDeviationOverInterpolatedOriginalEntityTolerance': max_ratio})
    if any(count not in (1, 2) for count in mesh_edges.values()):
        return reject()
    boundary_audits = []
    for (first, second), count in mesh_edges.items():
        if count != 1:
            continue
        candidates = set(node_entities[first]['edgeParameters']) & set(node_entities[second]['edgeParameters'])
        if len(candidates) != 1:
            return reject()
        edge_index = candidates.pop()
        a, b = (node_entities[node]['edgeParameters'][edge_index] for node in (first, second))
        intervals = policy['sampledAuditPolicy']['nativeBoundarySegmentIntervals']
        max_deviation = max_ratio = 0.0
        for sample in range(intervals + 1):
            fraction = sample / intervals
            weights = (1 - fraction, fraction)
            actual = _blend([world_nodes[first], world_nodes[second]], weights)
            original = edges[edge_index]['curve'].Value(a * (1 - fraction) + b * fraction)
            deviation = actual.Distance(original)
            allowance = math.fsum(weight * node_entities[node]['originalToleranceMillimetres'] for weight, node in zip(weights, (first, second)))
            ratio = deviation / allowance
            if ratio > 1:
                return reject()
            max_deviation, max_ratio = max(max_deviation, deviation), max(max_ratio, ratio)
        boundary_audits.append({'nodes': [first, second], 'originalEdge': edge_index, 'samples': intervals + 1, 'maxSampledChordToOriginalCurveDeviationMillimetres': max_deviation, 'maxSampledDeviationOverInterpolatedOriginalEntityTolerance': max_ratio})
    if len(boundary_audits) != 6 or set(item['originalEdge'] for item in boundary_audits) != {0, 1}:
        return reject()
    if not BRepCheck_Analyzer(face).IsValid():
        return reject()
    return {
        'method': 'pinned-original-occt-authored-tolerance-micro-face',
        'sourceSha256': source_sha256, 'sourceFaceIndex': face_index,
        'fixedSourceAudit': AUDIT_PATH.name, 'fixedSourceAuditSha256': hashlib.sha256(raw_policy).hexdigest(),
        'linearDeflectionMillimetres': native['linearDeflectionMillimetres'], 'angularDeflectionRadians': native['angularDeflectionRadians'],
        'nodes': tri.NbNodes(), 'triangles': tri.NbTriangles(), 'kernelStatusFlags': mesher.GetStatusFlags(),
        'nativeMeshAreaSquareMillimetres': mesh_area,
        'signedOriginalIntegralNotAnUnsignedAreaReference': signed_integral,
        'estimatedSignedIntegralRelativeError': estimated_error,
        'areaCertification': False, 'wholeDomainSurfaceErrorBoundClaimed': False,
        'sampledAuditInterpretation': policy['sampledAuditPolicy']['sampleAllowance'],
        'originalEdgeChecks': source_edge_checks, 'nodeEntities': node_entities,
        'triangleSampleAudits': triangle_audits, 'originalBoundarySegmentAudits': boundary_audits,
        'originalKernelNodesAndTrianglesUnchanged': True, 'noProjectionOrAddedClosingEdges': True,
        'originalGeometryTopologyAndPlacementUnchanged': True,
        'limitation': policy['limitation'],
    }
