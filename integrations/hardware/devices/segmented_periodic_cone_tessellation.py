"""Mesh a verified original cone frustum with segmented circular boundaries.

Unlike the four-edge rectangular fallback, this separately guarded case keeps
every original arc endpoint when a complete base/top circle has several edges.
Only Poly_Triangulation is attached; the original geometry/topology is retained.
"""

import math

from OCP.BRep import BRep_Builder, BRep_Tool
from OCP.BRepAdaptor import BRepAdaptor_Curve, BRepAdaptor_Curve2d, BRepAdaptor_Surface
from OCP.BRepCheck import BRepCheck_Analyzer
from OCP.BRepClass import BRepClass_FaceClassifier
from OCP.BRepGProp import BRepGProp
from OCP.BRepTools import BRepTools
from OCP.Geom import Geom_ConicalSurface
from OCP.GeomAbs import GeomAbs_Cone, GeomAbs_Line
from OCP.GProp import GProp_GProps
from OCP.Poly import Poly_Triangle, Poly_Triangulation
from OCP.TopAbs import TopAbs_EDGE, TopAbs_IN, TopAbs_ON, TopAbs_WIRE
from OCP.TopExp import TopExp_Explorer
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS
from OCP.gp import gp_Dir, gp_Pnt, gp_Pnt2d, gp_Vec


def _items(shape, kind, cast):
    explorer = TopExp_Explorer(shape, kind)
    while explorer.More():
        yield cast(explorer.Current())
        explorer.Next()


def _segmented_boundary(face, surface, location, bounds, tolerance):
    u0, u1, v0, v1 = bounds
    uv_tolerance = 1e-8 * max(1.0, u1 - u0, v1 - v0)
    close = lambda a, b: abs(a - b) <= uv_tolerance
    rings, seams, edge_count, max_error = [[], []], [], 0, 0.0
    transform = location.Transformation()
    for edge in _items(face, TopAbs_EDGE, TopoDS.Edge_s):
        edge_count += 1
        curve = BRepAdaptor_Curve2d(edge, face)
        if BRep_Tool.Degenerated_s(edge) or curve.GetType() != GeomAbs_Line or not BRep_Tool.SameParameter_s(edge):
            return None
        first, last = curve.FirstParameter(), curve.LastParameter()
        a, b = curve.Value(first), curve.Value(last)
        if not all(math.isfinite(value) for value in (first, last, a.X(), a.Y(), b.X(), b.Y())) or last <= first:
            return None
        low_u, high_u = sorted((a.X(), b.X()))
        low_v, high_v = sorted((a.Y(), b.Y()))
        ring_index = next((index for index, v in enumerate((v0, v1)) if close(a.Y(), v) and close(b.Y(), v)), None)
        if ring_index is not None:
            if high_u - low_u <= uv_tolerance or low_u < u0 - uv_tolerance or high_u > u1 + uv_tolerance:
                return None
            rings[ring_index].append((low_u, high_u))
        elif close(low_v, v0) and close(high_v, v1) and close(a.X(), b.X()):
            if close(a.X(), u0):
                seams.append("u0")
            elif close(a.X(), u1):
                seams.append("u1")
            else:
                return None
        else:
            return None
        original = BRepAdaptor_Curve(edge)
        for fraction in (0, .25, .5, .75, 1):
            parameter = first + (last - first) * fraction
            pair = curve.Value(parameter)
            point = surface.Value(pair.X(), pair.Y()).Transformed(transform)
            error = point.Distance(original.Value(parameter))
            if not math.isfinite(error) or error > max(tolerance, BRep_Tool.Tolerance_s(edge)):
                return None
            max_error = max(max_error, error)
    if sorted(seams) != ["u0", "u1"] or not any(len(ring) > 1 for ring in rings):
        return None  # The existing four-edge helper owns the unsegmented case.
    for ring in rings:
        ring.sort()
        if not ring or len(ring) > 256 or not close(ring[0][0], u0) or not close(ring[-1][1], u1):
            return None
        if any(not close(left[1], right[0]) for left, right in zip(ring, ring[1:])):
            return None
    # Use both rings' actual partitions in one conforming grid. Endpoints that
    # differ only within the original CAD tolerance share a mesh vertex.
    endpoints = sorted(value for ring in rings for arc in ring for value in arc)
    cuts = []
    for value in endpoints:
        if not cuts or not close(value, cuts[-1]):
            cuts.append(value)
    cuts[0], cuts[-1] = u0, u1
    if any(right - left <= uv_tolerance for left, right in zip(cuts, cuts[1:])):
        return None
    return rings, cuts, edge_count, max_error


def tessellate_segmented_periodic_cone(face, deflection, angle):
    """Return an audit after attaching a checked mesh, or reject with None."""
    if not all(math.isfinite(value) and value > 0 for value in (deflection, angle)):
        raise ValueError("Positive finite tessellation tolerances are required")
    existing = BRep_Tool.Triangulation_s(face, TopLoc_Location())
    if existing is not None and existing.NbTriangles():
        return None
    if BRepAdaptor_Surface(face).GetType() != GeomAbs_Cone or len(list(_items(face, TopAbs_WIRE, TopoDS.Wire_s))) != 1 or not BRepCheck_Analyzer(face).IsValid():
        return None
    bounds = BRepTools.UVBounds_s(face)
    u0, u1, v0, v1 = bounds
    location = TopLoc_Location()
    surface = BRep_Tool.Surface_s(face, location)
    if not isinstance(surface, Geom_ConicalSurface) or not all(math.isfinite(value) for value in bounds) or v1 <= v0:
        return None
    if abs(u1 - u0 - math.tau) > 1e-7 or not surface.IsUPeriodic() or abs(surface.UPeriod() - math.tau) > 1e-7:
        return None
    if abs(abs(location.Transformation().ScaleFactor()) - 1) > 1e-10:
        return None
    tolerance = max(BRep_Tool.Tolerance_s(face), 1e-9)
    radii = [surface.RefRadius() + v * math.sin(surface.SemiAngle()) for v in (v0, v1)]
    if not all(math.isfinite(radius) and radius > tolerance for radius in radii):
        return None  # No apex, negative nappe or apex crossing is supported.
    boundary = _segmented_boundary(face, surface, location, bounds, tolerance)
    if boundary is None:
        return None
    rings, cuts, edge_count, boundary_error = boundary
    properties = GProp_GProps()
    BRepGProp.SurfaceProperties_s(face, properties)
    original_area = abs(properties.Mass())
    analytic_area = math.pi * sum(radii) * (v1 - v0)
    if not math.isfinite(original_area) or original_area <= 1e-8 or abs(original_area - analytic_area) > max(1e-7 * analytic_area, tolerance * tolerance):
        return None

    def inside(u, v, boundary=False):
        state = BRepClass_FaceClassifier(face, gp_Pnt2d(u, v), tolerance).State()
        return state == TopAbs_ON if boundary else state in (TopAbs_IN, TopAbs_ON)

    def sample(u, v):
        point, du, dv = gp_Pnt(), gp_Vec(), gp_Vec()
        surface.D1(u, v, point, du, dv)
        cross = du.Crossed(dv)
        if cross.Magnitude() <= 1e-12 or not all(math.isfinite(value) for value in (*point.Coord(), *cross.Coord())):
            return None
        return point, gp_Dir(cross)

    radius = max(radii)
    chord_step = 2 * math.acos(1 - min(deflection / radius, 1))
    step = min(angle, math.tau / 64, chord_step)
    if step < math.tau / 4096:
        return None
    while True:
        counts = [max(1, math.ceil((right - left) / step)) for left, right in zip(cuts, cuts[1:])]
        segments = sum(counts)
        if segments > 4096:
            return None
        values = [cuts[0]]
        for (left, right), count in zip(zip(cuts, cuts[1:]), counts):
            values.extend(left + (right - left) * index / count for index in range(1, count + 1))
        points, normals, uv = [], [], []
        for v in (v0, v1):
            for u in values:
                item = sample(u, v)
                if item is None or not inside(u, v, True):
                    return None
                points.append(item[0]); normals.append(item[1]); uv.append((u, v))
        endpoint_error = 0.0
        for ring_index, ring in enumerate(rings):
            v = (v0, v1)[ring_index]
            mesh_ring = points[ring_index * (segments + 1):(ring_index + 1) * (segments + 1)]
            for arc in ring:
                for u in arc:
                    original_endpoint = surface.Value(u, v)
                    error = min(original_endpoint.Distance(point) for point in mesh_ring)
                    if error > tolerance:
                        return None
                    endpoint_error = max(endpoint_error, error)
        if not all(inside(u, (v0 + v1) / 2, True) for u in (u0, u1)):
            return None
        triangles = []
        for index in range(segments):
            a, b, c, d = index, index + 1, index + segments + 2, index + segments + 1
            triangles.extend(((a, b, c), (a, c, d)))
        mesh_area = max_deviation = 0.0
        for triangle in triangles:
            a, b, c = (points[index] for index in triangle)
            cross = gp_Vec(a, b).Crossed(gp_Vec(a, c))
            mid_u = sum(uv[index][0] for index in triangle) / 3
            mid_v = sum(uv[index][1] for index in triangle) / 3
            expected = sample(mid_u, mid_v)
            if expected is None or cross.Magnitude() <= 1e-14 or cross.Dot(gp_Vec(expected[1])) <= 0:
                return None
            mesh_area += cross.Magnitude() / 2
            for weights in ((1 / 3, 1 / 3, 1 / 3), (.5, .5, 0), (0, .5, .5), (.5, 0, .5)):
                u = sum(weight * uv[index][0] for weight, index in zip(weights, triangle))
                v = sum(weight * uv[index][1] for weight, index in zip(weights, triangle))
                if not inside(u, v):
                    return None
                linear = gp_Pnt(*(sum(weight * points[index].Coord()[axis] for weight, index in zip(weights, triangle)) for axis in range(3)))
                max_deviation = max(max_deviation, linear.Distance(surface.Value(u, v)))
        # A bound for every barycentric point, not only the samples above:
        # e(u)'s Taylor remainder <= delta_u^2 / 8; covariance of the linear
        # radius and u <= range(radius) * delta_u / 4. Axial interpolation is
        # exact. This also bounds a diagonal across the two different radii.
        largest_step = max(right - left for left, right in zip(values, values[1:]))
        deviation_bound = radius * largest_step ** 2 / 8 + abs(radii[1] - radii[0]) * largest_step / 4
        relative_error = abs(mesh_area - original_area) / original_area
        if relative_error <= .005 and max(max_deviation, deviation_bound) <= deflection + tolerance:
            break
        step /= 2
    triangulation = Poly_Triangulation(len(points), len(triangles), True, True)
    for index, (point, normal, pair) in enumerate(zip(points, normals, uv), 1):
        triangulation.SetNode(index, point)
        triangulation.SetNormal(index, normal)
        triangulation.SetUVNode(index, gp_Pnt2d(*pair))
    for index, triangle in enumerate(triangles, 1):
        triangulation.SetTriangle(index, Poly_Triangle(*(item + 1 for item in triangle)))
    triangulation.Deflection(max(max_deviation, deviation_bound))
    # Keep face orientation (including REVERSED) for the normal CAD exporter;
    # local triangle winding follows D1 only, avoiding a second orientation flip.
    BRep_Builder().UpdateFace(face, triangulation)
    if not BRepCheck_Analyzer(face).IsValid():
        raise RuntimeError("Attaching segmented cone tessellation invalidated the original face")
    return {
        "method": "original-segmented-periodic-cone-triangulation",
        "areaSquareMillimetres": original_area, "meshAreaSquareMillimetres": mesh_area,
        "analyticAreaSquareMillimetres": analytic_area, "relativeAreaError": relative_error,
        "linearDeflectionMillimetres": deflection, "angularDeflectionRadians": angle,
        "maxSampledDeviationMillimetres": max_deviation,
        "analyticMaxLinearDeviationBoundMillimetres": deviation_bound,
        "maxOriginalBoundaryDeviationMillimetres": boundary_error,
        "maxOriginalArcEndpointDeviationMillimetres": endpoint_error,
        "uvBounds": list(bounds), "uSegments": segments, "originalEdgeOccurrences": edge_count,
        "originalRingArcCounts": [len(ring) for ring in rings], "originalUPartitions": cuts,
        "partitionSegments": counts, "nodes": len(points), "triangles": len(triangles),
        "validation": {
            "singleOriginalWire": True, "twoOriginalSeamEdges": True,
            "twoGapFreeCompleteOriginalRings": True, "noApexOrCrossedNappe": True,
            "allOriginalArcEndpointsRetainedWithinCadTolerance": True,
            "original3dEdgesMatchPcurves": True, "boundaryOnOriginalFace": True,
            "everyTriangleClassifiedOnOriginalFace": True,
            "triangleWindingMatchesOriginalSurfaceNormals": True,
            "faceOrientationRetainedForStandardExporter": True,
            "relativeAreaErrorBelowHalfPercent": True,
            "originalAnalyticSurfaceTopologyAndPlacementRetained": True,
        },
    }
