"""Mesh one strictly verified original complete cone ending at its apex.

This covers the valid Voron faces with one degenerate apex edge, two seam
occurrences and a base circle split across original edges. It does not repair
or replace any B-rep geometry. Only the existing face's Poly_Triangulation
cache is populated, after exact-surface, original-boundary and area checks.
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
from OCP.TopAbs import TopAbs_EDGE, TopAbs_IN, TopAbs_ON, TopAbs_VERTEX, TopAbs_WIRE
from OCP.TopExp import TopExp_Explorer
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS
from OCP.gp import gp_Dir, gp_Pnt, gp_Pnt2d, gp_Vec


def _items(shape, kind, cast):
    explorer = TopExp_Explorer(shape, kind)
    while explorer.More():
        yield cast(explorer.Current())
        explorer.Next()


def _boundary(face, surface, location, bounds, apex_v, base_v, tolerance):
    """Require a complete, gap-free base, two seams and one true apex edge."""
    u0, u1, v0, v1 = bounds
    uv_tolerance = 1e-8 * max(1.0, u1 - u0, v1 - v0)
    close = lambda a, b: abs(a - b) <= uv_tolerance
    arcs, seams, apex_edges, edge_count, max_error = [], [], 0, 0, 0.0
    transform = location.Transformation()
    apex_world = surface.Apex().Transformed(transform)
    for edge in _items(face, TopAbs_EDGE, TopoDS.Edge_s):
        edge_count += 1
        curve = BRepAdaptor_Curve2d(edge, face)
        if curve.GetType() != GeomAbs_Line or not BRep_Tool.SameParameter_s(edge):
            return None
        first, last = curve.FirstParameter(), curve.LastParameter()
        a, b = curve.Value(first), curve.Value(last)
        if not all(math.isfinite(value) for value in (first, last, a.X(), a.Y(), b.X(), b.Y())) or last <= first:
            return None
        u_min, u_max = sorted((a.X(), b.X()))
        v_min, v_max = sorted((a.Y(), b.Y()))
        degenerate = BRep_Tool.Degenerated_s(edge)
        if degenerate:
            if not (close(a.Y(), apex_v) and close(b.Y(), apex_v) and close(u_min, u0) and close(u_max, u1)):
                return None
            apex_edges += 1
            vertices = list(_items(edge, TopAbs_VERTEX, TopoDS.Vertex_s))
            if not vertices or any(BRep_Tool.Pnt_s(vertex).Distance(apex_world) > max(tolerance, BRep_Tool.Tolerance_s(vertex)) for vertex in vertices):
                return None
        elif close(a.Y(), base_v) and close(b.Y(), base_v) and u_max - u_min > uv_tolerance:
            if u_min < u0 - uv_tolerance or u_max > u1 + uv_tolerance:
                return None
            arcs.append((u_min, u_max))
        elif close(v_min, v0) and close(v_max, v1) and close(a.X(), b.X()):
            if close(a.X(), u0):
                seams.append("u0")
            elif close(a.X(), u1):
                seams.append("u1")
            else:
                return None
        else:
            return None
        original_curve = None if degenerate else BRepAdaptor_Curve(edge)
        edge_tolerance = max(tolerance, BRep_Tool.Tolerance_s(edge))
        for fraction in (0, .25, .5, .75, 1):
            parameter = first + (last - first) * fraction
            uv = curve.Value(parameter)
            actual = surface.Value(uv.X(), uv.Y()).Transformed(transform)
            expected = apex_world if degenerate else original_curve.Value(parameter)
            error = actual.Distance(expected)
            if not math.isfinite(error) or error > edge_tolerance:
                return None
            max_error = max(max_error, error)
    arcs.sort()
    if apex_edges != 1 or sorted(seams) != ["u0", "u1"] or not arcs or len(arcs) > 256:
        return None
    if not close(arcs[0][0], u0) or not close(arcs[-1][1], u1):
        return None
    if any(not close(left[1], right[0]) for left, right in zip(arcs, arcs[1:])):
        return None
    return arcs, edge_count, max_error


def tessellate_apex_cone(face, deflection, angle):
    """Attach a checked original-surface fan, or fail closed with None.

    Coordinates/normals remain local. Existing face location and orientation
    are retained for the standard exporter; no source CAD file is written.
    Deflection is in model millimetres, angle is in radians.
    """
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
    apex_indices = [index for index, radius in enumerate(radii) if abs(radius) <= tolerance]
    if len(apex_indices) != 1:
        return None
    apex_index = apex_indices[0]
    apex_v, base_v = (v0, v1) if apex_index == 0 else (v1, v0)
    radius = radii[1 - apex_index]
    if radius <= tolerance or not math.isfinite(radius):
        return None  # Another nappe/apex crossing is outside this fallback.
    boundary = _boundary(face, surface, location, bounds, apex_v, base_v, tolerance)
    if boundary is None:
        return None
    arcs, edge_count, boundary_error = boundary
    properties = GProp_GProps()
    BRepGProp.SurfaceProperties_s(face, properties)
    original_area = abs(properties.Mass())
    analytic_area = math.pi * radius * abs(base_v - apex_v)
    if not math.isfinite(original_area) or original_area <= 1e-8 or abs(original_area - analytic_area) > max(1e-7 * analytic_area, tolerance * tolerance):
        return None

    def inside(u, v, boundary=False):
        state = BRepClass_FaceClassifier(face, gp_Pnt2d(u, v), tolerance).State()
        return state == TopAbs_ON if boundary else state in (TopAbs_IN, TopAbs_ON)

    def normal(u, v):
        point, du, dv = gp_Pnt(), gp_Vec(), gp_Vec()
        surface.D1(u, v, point, du, dv)
        cross = du.Crossed(dv)
        if cross.Magnitude() <= 1e-12 or not all(math.isfinite(value) for value in cross.Coord()):
            return None
        return gp_Dir(cross)

    # Chord deviation is maximal at the original base circle. The intermediate
    # generators interpolate linearly to the exact original apex.
    chord_step = 2 * math.acos(1 - min(deflection / radius, 1))
    step = min(angle, math.tau / 64, chord_step)
    if step < math.tau / 4096:
        return None
    apex, mid_v = surface.Apex(), (apex_v + base_v) / 2
    while True:
        segment_counts = [max(1, math.ceil((b - a) / step)) for a, b in arcs]
        segments = sum(segment_counts)
        if segments > 4096:
            return None
        points, normals, uv, triangles = [], [], [], []
        mesh_area = max_deviation = max_chord_deviation = 0.0
        for (start, end), count in zip(arcs, segment_counts):
            for index in range(count):
                a = start + (end - start) * index / count
                b = start + (end - start) * (index + 1) / count
                mid_u = (a + b) / 2
                ring_a, ring_b = surface.Value(a, base_v), surface.Value(b, base_v)
                normal_a, normal_b, apex_normal = normal(a, base_v), normal(b, base_v), normal(mid_u, mid_v)
                if any(value is None for value in (normal_a, normal_b, apex_normal)):
                    return None
                if not all(inside(u, v, True) for u, v in ((a, base_v), (b, base_v), (mid_u, base_v), (mid_u, apex_v))):
                    return None
                # A single UV coordinate cannot represent the apex's different
                # normal limits. Each sector gets its exact apex with its own
                # generator-limit normal, sampled on the same analytic cone.
                offset = len(points)
                points.extend((apex, ring_a, ring_b))
                normals.extend((apex_normal, normal_a, normal_b))
                uv.extend(((mid_u, apex_v), (a, base_v), (b, base_v)))
                triangle = (offset, offset + 2, offset + 1) if apex_index == 0 else (offset, offset + 1, offset + 2)
                first, second, third = (points[item] for item in triangle)
                cross = gp_Vec(first, second).Crossed(gp_Vec(first, third))
                if cross.Magnitude() <= 1e-14 or cross.Dot(gp_Vec(apex_normal)) <= 0:
                    return None
                mesh_area += cross.Magnitude() / 2
                triangles.append(triangle)
                checks = (
                    ((0, .5, .5), mid_u, base_v),
                    ((.5, .5, 0), a, mid_v),
                    ((.5, 0, .5), b, mid_v),
                    ((1 / 3, 1 / 3, 1 / 3), mid_u, (apex_v + 2 * base_v) / 3),
                )
                for weights, u, v in checks:
                    if not inside(u, v):
                        return None
                    linear = gp_Pnt(*(sum(weight * point.Coord()[axis] for weight, point in zip(weights, (apex, ring_a, ring_b))) for axis in range(3)))
                    max_deviation = max(max_deviation, linear.Distance(surface.Value(u, v)))
                max_chord_deviation = max(max_chord_deviation, radius * (1 - math.cos((b - a) / 2)))
        # Check the original seam generators explicitly, including their
        # boundary classification, independently of the interior fan samples.
        if not all(inside(u, mid_v, True) for u in (u0, u1)):
            return None
        relative_error = abs(mesh_area - original_area) / original_area
        if relative_error <= .005 and max(max_deviation, max_chord_deviation) <= deflection + tolerance:
            break
        step /= 2

    triangulation = Poly_Triangulation(len(points), len(triangles), True, True)
    for index, (point, direction, pair) in enumerate(zip(points, normals, uv), 1):
        triangulation.SetNode(index, point)
        triangulation.SetNormal(index, direction)
        triangulation.SetUVNode(index, gp_Pnt2d(*pair))
    for index, triangle in enumerate(triangles, 1):
        triangulation.SetTriangle(index, Poly_Triangle(*(item + 1 for item in triangle)))
    triangulation.Deflection(max(max_deviation, max_chord_deviation))
    # The only mutation: an exporter-readable mesh cache on the existing face.
    BRep_Builder().UpdateFace(face, triangulation)
    if not BRepCheck_Analyzer(face).IsValid():
        raise RuntimeError("Attaching apex cone tessellation invalidated the original face")
    return {
        "method": "original-complete-apex-cone-triangulation",
        "areaSquareMillimetres": original_area, "meshAreaSquareMillimetres": mesh_area,
        "analyticAreaSquareMillimetres": analytic_area, "relativeAreaError": relative_error,
        "linearDeflectionMillimetres": deflection, "angularDeflectionRadians": angle,
        "maxSampledDeviationMillimetres": max_deviation,
        "analyticMaxChordDeviationMillimetres": max_chord_deviation,
        "maxOriginalBoundaryDeviationMillimetres": boundary_error,
        "uvBounds": list(bounds), "apexV": apex_v, "baseV": base_v,
        "originalEdgeOccurrences": edge_count, "originalBaseArcCount": len(arcs),
        "baseArcSegments": segment_counts, "uSegments": segments,
        "nodes": len(points), "triangles": len(triangles),
        "validation": {
            "singleOriginalWire": True, "oneOriginalDegenerateApexEdge": True,
            "twoOriginalSeamEdges": True, "allOriginalBaseArcEndpointsRetained": True,
            "gapFreeCompleteOriginalConePeriod": True, "original3dEdgesMatchPcurves": True,
            "boundaryOnOriginalFace": True, "everyTriangleClassifiedOnOriginalFace": True,
            "triangleWindingMatchesOriginalSurfaceNormals": True,
            "relativeAreaErrorBelowHalfPercent": True,
            "originalAnalyticSurfaceTopologyAndPlacementRetained": True,
        },
    }
