"""Tessellate a narrowly verified original periodic conical face.

OCCT 7.8 can leave a valid, full-period cone without triangles. This fallback
only supplies Poly_Triangulation on that existing face: it never replaces the
analytic surface, trims, topology, placement or source CAD file. Anything other
than a single rectangular UV wire on a non-apical, complete conical period is
rejected. The caller must still fail conversion if any original face is absent.
"""

import math

from OCP.BRep import BRep_Builder, BRep_Tool
from OCP.BRepAdaptor import BRepAdaptor_Curve2d, BRepAdaptor_Surface
from OCP.BRepCheck import BRepCheck_Analyzer
from OCP.BRepClass import BRepClass_FaceClassifier
from OCP.BRepGProp import BRepGProp
from OCP.BRepTools import BRepTools
from OCP.GeomAbs import GeomAbs_Cone, GeomAbs_Line
from OCP.GProp import GProp_GProps
from OCP.Poly import Poly_Triangle, Poly_Triangulation
from OCP.TopAbs import TopAbs_EDGE, TopAbs_IN, TopAbs_ON, TopAbs_WIRE
from OCP.TopExp import TopExp_Explorer
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS
from OCP.gp import gp_Dir, gp_Pnt, gp_Pnt2d, gp_Vec


def _count(shape, kind):
    explorer = TopExp_Explorer(shape, kind)
    result = 0
    while explorer.More():
        result += 1
        explorer.Next()
    return result


def _rectangle_boundary(face, bounds):
    """Require the actual four pcurves to be the full UV rectangle sides."""
    u0, u1, v0, v1 = bounds
    tolerance = 1e-8 * max(1.0, abs(u1 - u0), abs(v1 - v0))
    close = lambda a, b: abs(a - b) <= tolerance
    sides = []
    explorer = TopExp_Explorer(face, TopAbs_EDGE)
    while explorer.More():
        edge = TopoDS.Edge_s(explorer.Current())
        curve = BRepAdaptor_Curve2d(edge, face)
        if BRep_Tool.Degenerated_s(edge) or curve.GetType() != GeomAbs_Line:
            return False
        start = curve.Value(curve.FirstParameter())
        end = curve.Value(curve.LastParameter())
        a, b = (start.X(), start.Y()), (end.X(), end.Y())
        side = None
        for key, value in (("u0", u0), ("u1", u1)):
            if close(a[0], value) and close(b[0], value) and close(min(a[1], b[1]), v0) and close(max(a[1], b[1]), v1):
                side = key
        for key, value in (("v0", v0), ("v1", v1)):
            if close(a[1], value) and close(b[1], value) and close(min(a[0], b[0]), u0) and close(max(a[0], b[0]), u1):
                side = key
        if side is None:
            return False
        sides.append(side)
        explorer.Next()
    return sorted(sides) == ["u0", "u1", "v0", "v1"]


def tessellate_periodic_cone(face, deflection, angle):
    """Attach validated tessellation and return its audit, or return None.

    Node coordinates and D1 normals remain in the surface's local coordinates;
    the existing TopLoc_Location is applied once by the standard CAD exporter.
    deflection is in the converter's millimetres, angle in radians.
    """
    if not all(math.isfinite(value) and value > 0 for value in (deflection, angle)):
        raise ValueError("Positive finite tessellation tolerances are required")
    existing = BRep_Tool.Triangulation_s(face, TopLoc_Location())
    if existing is not None and existing.NbTriangles():
        return None
    if BRepAdaptor_Surface(face).GetType() != GeomAbs_Cone or _count(face, TopAbs_WIRE) != 1 or not BRepCheck_Analyzer(face).IsValid():
        return None
    bounds = BRepTools.UVBounds_s(face)
    u0, u1, v0, v1 = bounds
    if not all(math.isfinite(value) for value in bounds) or v1 <= v0:
        return None
    location = TopLoc_Location()
    surface = BRep_Tool.Surface_s(face, location)
    if not surface.IsUPeriodic() or abs((u1 - u0) - surface.UPeriod()) > 1e-7 or abs(surface.UPeriod() - math.tau) > 1e-7:
        return None
    # A general scaled placement would also require scaling the tolerance and
    # area comparison. Leave such a face to the ordinary conversion failure.
    if abs(abs(location.Transformation().ScaleFactor()) - 1.0) > 1e-10 or not _rectangle_boundary(face, bounds):
        return None
    properties = GProp_GProps()
    BRepGProp.SurfaceProperties_s(face, properties)
    original_area = abs(properties.Mass())
    if not math.isfinite(original_area) or original_area <= 1e-8:
        return None
    tolerance = max(BRep_Tool.Tolerance_s(face), 1e-9)

    def inside(u, v, boundary=False):
        state = BRepClass_FaceClassifier(face, gp_Pnt2d(u, v), tolerance).State()
        return state == TopAbs_ON if boundary else state in (TopAbs_IN, TopAbs_ON)

    def sample(u, v):
        point, du, dv = gp_Pnt(), gp_Vec(), gp_Vec()
        surface.D1(u, v, point, du, dv)
        normal = du.Crossed(dv)
        if normal.Magnitude() <= 1e-12 or not all(math.isfinite(value) for value in (*point.Coord(), *normal.Coord())):
            return None
        return point, gp_Dir(normal), du.Magnitude()

    ends = [sample(u0, v) for v in (v0, v1)]
    if any(value is None or value[2] <= tolerance for value in ends):
        return None  # Apex triangles require a different topology, not this grid.
    radius = max(value[2] for value in ends)
    chord_half_angle = math.acos(1 - min(deflection / radius, 1))
    if chord_half_angle < math.pi / 4096 or angle < math.tau / 4096:
        return None  # Refuse an unbounded or numerically unrepresentable mesh.
    chord_segments = math.ceil(math.pi / chord_half_angle)
    segments = max(64, math.ceil(math.tau / min(angle, math.pi)), chord_segments)
    while segments <= 4096:
        points, normals, uv = [], [], []
        for v in (v0, v1):
            for i in range(segments + 1):
                u = u0 + (u1 - u0) * i / segments
                item = sample(u, v)
                if item is None or not inside(u, v, boundary=True):
                    return None
                points.append(item[0]); normals.append(item[1]); uv.append((u, v))
        for i in range(segments + 1):
            if not inside(u0 + (u1 - u0) * i / segments, (v0 + v1) / 2, boundary=i in (0, segments)):
                return None
        triangles = []
        for i in range(segments):
            a, b, c, d = i, i + 1, i + segments + 2, i + segments + 1
            triangles.extend(((a, b, c), (a, c, d)))
        mesh_area = max_deviation = 0.0
        for indices in triangles:
            a, b, c = [points[index] for index in indices]
            area = gp_Vec(a, b).Crossed(gp_Vec(a, c)).Magnitude() / 2
            if area <= 0 or not math.isfinite(area):
                return None
            mesh_area += area
            # Verify every triangle center and all edge midpoints against the
            # original trimmed surface, not just the generated polygon mesh.
            for weights in ((1 / 3, 1 / 3, 1 / 3), (.5, .5, 0), (0, .5, .5), (.5, 0, .5)):
                u = sum(weight * uv[index][0] for weight, index in zip(weights, indices))
                v = sum(weight * uv[index][1] for weight, index in zip(weights, indices))
                if not inside(u, v):
                    return None
                linear = gp_Pnt(*(sum(weight * points[index].Coord()[axis] for weight, index in zip(weights, indices)) for axis in range(3)))
                max_deviation = max(max_deviation, linear.Distance(surface.Value(u, v)))
        relative_error = abs(mesh_area - original_area) / original_area
        if relative_error <= .005 and max_deviation <= deflection + tolerance:
            break
        segments *= 2
    else:
        return None

    triangulation = Poly_Triangulation(len(points), len(triangles), True, True)
    for index, (point, normal, pair) in enumerate(zip(points, normals, uv), 1):
        triangulation.SetNode(index, point)
        triangulation.SetUVNode(index, gp_Pnt2d(*pair))
        triangulation.SetNormal(index, normal)
    for index, (a, b, c) in enumerate(triangles, 1):
        triangulation.SetTriangle(index, Poly_Triangle(a + 1, b + 1, c + 1))
    triangulation.Deflection(max_deviation)
    # The sole mutation is the existing face's display triangulation cache.
    BRep_Builder().UpdateFace(face, triangulation)
    if not BRepCheck_Analyzer(face).IsValid():
        raise RuntimeError("Attaching cone tessellation invalidated the original face")
    return {
        "method": "original-periodic-cone-uv-triangulation",
        "areaSquareMillimetres": original_area,
        "meshAreaSquareMillimetres": mesh_area,
        "relativeAreaError": relative_error,
        "linearDeflectionMillimetres": deflection,
        "angularDeflectionRadians": angle,
        "maxSampledDeviationMillimetres": max_deviation,
        "uvBounds": list(bounds), "uSegments": segments,
        "nodes": len(points), "triangles": len(triangles),
        "validation": {"singleOriginalWire": True, "fourOriginalRectangularPcurves": True,
            "fullOriginalConePeriod": True, "boundaryOnOriginalFace": True,
            "everyTriangleClassifiedOnOriginalFace": True, "relativeAreaErrorBelowHalfPercent": True,
            "originalAnalyticSurfaceAndPlacementRetained": True},
    }
