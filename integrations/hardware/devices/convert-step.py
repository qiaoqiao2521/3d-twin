#!/usr/bin/env python3
"""Triangulate an original STEP assembly without rebuilding its geometry.

STEPCAF preserves the XCAF product tree, occurrences, placements, names and
colors. OpenCascade performs tessellation; its glTF writer keeps individual
parts and instances. Only faces within the same part may be merged. Originals
are read-only and remain the authoritative engineering files.
"""

import argparse
import gc
import hashlib
import importlib.metadata
import json
import math
from pathlib import Path
import struct
import time

from OCP.Bnd import Bnd_Box
from OCP.BRep import BRep_Tool
from OCP.BRepBndLib import BRepBndLib
from OCP.BRepGProp import BRepGProp
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.BRepTools import BRepTools
from OCP.GProp import GProp_GProps
from OCP.IFSelect import IFSelect_RetDone
from OCP.Interface import Interface_Static
from OCP.Message import Message_ProgressRange
from OCP.RWGltf import RWGltf_CafWriter
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TCollection import TCollection_AsciiString, TCollection_ExtendedString
from OCP.TColStd import TColStd_IndexedDataMapOfStringString
from OCP.TDataStd import TDataStd_Name
from OCP.TDF import TDF_Label, TDF_LabelSequence, TDF_Tool
from OCP.TDocStd import TDocStd_Document
from OCP.TopAbs import TopAbs_FACE
from OCP.TopExp import TopExp_Explorer
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS
from OCP.XCAFDoc import XCAFDoc_DocumentTool, XCAFDoc_ShapeTool
from OCP.gp import gp_Vec

from cone_tessellation import tessellate_periodic_cone
from apex_cone_tessellation import tessellate_apex_cone
from segmented_periodic_cone_tessellation import tessellate_segmented_periodic_cone
from native_tolerance_tessellation import tessellate_original_tolerance_face


def digest(file):
    with Path(file).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def precise_face_area(face):
    """Return the signed adaptive surface integral and its error estimate.

    The default fixed-order integration has measurable cancellation error on
    original narrow trimmed faces; it must not be used as their mesh target.
    This reads the original geometry and does not repair or alter its bounds.
    A negative integral can expose a tolerance-sewn, non-closed UV boundary;
    its absolute value must not be treated as a certified geometric area.
    """
    properties = GProp_GProps()
    estimate = BRepGProp.SurfaceProperties_s(face, properties, 1e-10)
    area = properties.Mass()
    if not math.isfinite(area):
        raise RuntimeError("Original face has a non-finite adaptive surface area")
    return area, estimate


def refine_original_face(face, deflection, angle):
    """Refine a missing original mesh; accept original-kernel area agreement.

    Only the triangulation cache is changed. Having some triangles alone is
    insufficient: OCCT can return an incomplete approximation for a very thin
    face even with status 0. Each accepted result must also agree with adaptive
    original-surface area to within 0.5 percent.
    """
    original_area, area_estimate = precise_face_area(face)
    if original_area <= 0:
        return None
    attempts = []
    for factor in [50, 250, 1250, 6250, 31250]:
        local_deflection = deflection / factor
        local_angle = max(angle / math.sqrt(factor), 0.02)
        BRepTools.Clean_s(face)
        mesher = BRepMesh_IncrementalMesh(face, local_deflection, False, local_angle, False)
        triangulation_location = TopLoc_Location()
        triangulation = BRep_Tool.Triangulation_s(face, triangulation_location)
        count = triangulation.NbTriangles() if triangulation is not None else 0
        mesh_area = 0.0
        if count:
            areas = []
            for index in range(1, count + 1):
                a, b, c = (triangulation.Node(vertex) for vertex in triangulation.Triangle(index).Get())
                areas.append(gp_Vec(a, b).Crossed(gp_Vec(a, c)).Magnitude() / 2)
            mesh_area = math.fsum(areas) * triangulation_location.Transformation().ScaleFactor() ** 2
        relative_error = abs(mesh_area - original_area) / original_area
        accepted = bool(mesher.IsDone() and mesher.GetStatusFlags() == 0 and count
                        and math.isfinite(relative_error) and relative_error <= 0.005)
        attempt = {"factor": factor, "linearDeflectionMillimetres": local_deflection,
                   "angularDeflectionRadians": local_angle, "kernelStatusFlags": mesher.GetStatusFlags(),
                   "triangles": count, "meshAreaSquareMillimetres": mesh_area,
                   "relativeAreaError": relative_error, "accepted": accepted}
        attempts.append(attempt)
        del mesher
        if accepted:
            return {"method": "original-occt-native-local-refinement",
                    "areaSquareMillimetres": original_area,
                    "originalAreaIntegration": "adaptive BRepGProp SurfaceProperties, relative target 1e-10",
                    "estimatedAreaIntegrationRelativeError": area_estimate,
                    **attempt, "attempts": attempts,
                    "originalGeometryAndBoundaryUnchanged": True}
        print(json.dumps({"stage": "native-refinement-not-yet-accurate", **attempt}), flush=True)
    return None


def label_id(label):
    value = TCollection_AsciiString()
    TDF_Tool.Entry_s(label, value)
    return value.ToCString()


def label_name(label):
    value = TDataStd_Name()
    return value.Get().ToExtString() if label.FindAttribute(TDataStd_Name.GetID_s(), value) else ""


def describe_occurrence(label, ancestors=()):
    identity = label_id(label)
    if identity in ancestors:
        raise RuntimeError(f"Cycle in original XCAF assembly: {identity}")
    product = TDF_Label()
    reference = XCAFDoc_ShapeTool.GetReferredShape_s(label, product)
    target = product if reference else label
    location = XCAFDoc_ShapeTool.GetLocation_s(label).Transformation()
    parts = TDF_LabelSequence()
    XCAFDoc_ShapeTool.GetComponents_s(target, parts, False)
    return {
        "label": identity,
        "productLabel": label_id(target),
        "name": label_name(label) or label_name(target) or identity,
        "productName": label_name(target),
        "isAssembly": XCAFDoc_ShapeTool.IsAssembly_s(target),
        "isReference": reference,
        "localTransformMillimetres": [
            [location.Value(row, col) for col in range(1, 5)]
            for row in range(1, 4)
        ],
        "children": [
            describe_occurrence(parts.Value(i), (*ancestors, identity))
            for i in range(1, parts.Length() + 1)
        ],
    }


def count_occurrences(items):
    return sum(1 + count_occurrences(item["children"]) for item in items)


def original_leaf_products(roots):
    """Return original product labels once, without rebuilding the XCAF tree.

    A complete machine can contain thousands of repeated occurrences. Passing
    the whole located root to BRepMesh builds a large temporary mesher graph.
    Tessellating each shared original leaf product once instead attaches the
    same mesh cache to the existing shapes used by all original occurrences.
    """
    seen = set()
    leaves = []

    def visit(label, ancestors=()):
        referred = TDF_Label()
        target = referred if XCAFDoc_ShapeTool.GetReferredShape_s(label, referred) else label
        identity = label_id(target)
        if identity in ancestors:
            raise RuntimeError(f"Cycle in original product definitions: {identity}")
        if identity in seen:
            return
        seen.add(identity)
        children = TDF_LabelSequence()
        XCAFDoc_ShapeTool.GetComponents_s(target, children, False)
        if children.Length():
            for index in range(1, children.Length() + 1):
                visit(children.Value(index), (*ancestors, identity))
        else:
            leaves.append(target)

    for index in range(1, roots.Length() + 1):
        visit(roots.Value(index))
    return leaves


def read_glb(file):
    content = Path(file).read_bytes()
    magic, version, length = struct.unpack_from("<4sII", content)
    if magic != b"glTF" or version != 2 or length != len(content):
        raise RuntimeError("OpenCascade did not produce a valid GLB 2 container")
    chunks = []
    offset = 12
    while offset < length:
        size, kind = struct.unpack_from("<II", content, offset)
        end = offset + 8 + size
        if end > length:
            raise RuntimeError("Truncated GLB chunk")
        chunks.append((kind, content[offset + 8 : end]))
        offset = end
    if not chunks or chunks[0][0] != 0x4E4F534A:
        raise RuntimeError("GLB is missing its JSON chunk")
    return json.loads(chunks[0][1]), chunks[1:]


def write_glb(file, data, remaining):
    payload = json.dumps(data, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()
    payload += b" " * (-len(payload) % 4)
    chunks = [(0x4E4F534A, payload), *remaining]
    total = 12 + sum(8 + len(value) for _, value in chunks)
    with Path(file).open("wb") as stream:
        stream.write(struct.pack("<4sII", b"glTF", 2, total))
        for kind, value in chunks:
            stream.write(struct.pack("<II", len(value), kind))
            stream.write(value)


def convert(source, output, *, source_up_axis="Z", deflection=0.25, angle=0.45, provenance=None,
            diagnose_unmeshed_only=False):
    start = time.monotonic()
    source = Path(source).resolve(strict=True)
    output = Path(output).resolve()
    if source == output:
        raise RuntimeError("Original CAD files cannot be overwritten")
    original_sha = digest(source)
    # STEP source units are interpreted by OCCT; all internal lengths are mm.
    # RWGltf uses this document unit to output glTF metres (verified by the
    # conversion regression fixture). Do not add another geometry scale.
    Interface_Static.SetCVal_s("xstep.cascade.unit", "MM")
    document = TDocStd_Document(TCollection_ExtendedString("BinXCAF"))
    XCAFDoc_DocumentTool.SetLengthUnit_s(document, 0.001)
    reader = STEPCAFControl_Reader()
    reader.SetNameMode(True)
    reader.SetColorMode(True)
    reader.SetLayerMode(True)
    reader.SetMatMode(True)
    reader.SetPropsMode(True)
    print(json.dumps({"stage": "step-read", "file": str(source), "bytes": source.stat().st_size}), flush=True)
    if reader.ReadFile(str(source)) != IFSelect_RetDone:
        raise RuntimeError(f"Cannot parse original STEP: {source}")
    roots_available = reader.NbRootsForTransfer()
    if not roots_available or not reader.Transfer(document):
        raise RuntimeError("STEP assembly transfer failed")
    shapes = XCAFDoc_DocumentTool.ShapeTool_s(document.Main())
    roots = TDF_LabelSequence()
    shapes.GetFreeShapes(roots)
    if not roots.Length():
        raise RuntimeError("Original CAD contains no transferable root shapes")
    hierarchy = [describe_occurrence(roots.Value(i)) for i in range(1, roots.Length() + 1)]
    bounds = Bnd_Box()
    faces = triangles = degenerate_faces = 0
    degenerate_face_details = []
    unmeshed = []
    refinements = []
    native_tolerance_limited = []
    native_tolerance_shapes = []
    BRepMesh_IncrementalMesh.SetParallelDefault_s(False)
    products = original_leaf_products(roots)
    print(json.dumps({"stage": "tessellate-original-products", "uniqueLeafProducts": len(products), "originalOccurrences": count_occurrences(hierarchy)}), flush=True)
    for index, product in enumerate(products, 1):
        shape = XCAFDoc_ShapeTool.GetShape_s(product)
        mesher = BRepMesh_IncrementalMesh(shape, deflection, False, angle, False)
        if not mesher.IsDone():
            raise RuntimeError(f"Tessellation failed for original product {label_id(product)}")
        # Only the triangles remain on the original B-rep. Free the mesher's
        # temporary topology graph before processing the next original part.
        del mesher
        if index % 50 == 0 or index == len(products):
            gc.collect()
            print(json.dumps({"stage": "original-products-meshed", "completed": index, "total": len(products)}), flush=True)
    if diagnose_unmeshed_only:
        # Explicit diagnostic mode never writes a GLB or a successful display
        # conversion. Capture every unsupported original face in one pass
        # before potentially expensive local refinement, so a large assembly
        # does not require one whole-machine import per newly discovered case.
        diagnostics = output.parent / "unmeshed-original-faces"
        diagnostics.mkdir(parents=True, exist_ok=True)
        unsupported = []
        checked = supported_fallbacks = 0
        for root_index in range(1, roots.Length() + 1):
            shape = XCAFDoc_ShapeTool.GetShape_s(roots.Value(root_index))
            explorer = TopExp_Explorer(shape, TopAbs_FACE)
            while explorer.More():
                face = TopoDS.Face_s(explorer.Current())
                checked += 1
                triangulation = BRep_Tool.Triangulation_s(face, TopLoc_Location())
                if triangulation is None or triangulation.NbTriangles() == 0:
                    signed_area, _ = precise_face_area(face)
                    area = abs(signed_area)
                    if area > 1e-8 or signed_area < 0:
                        limited = tessellate_original_tolerance_face(face, deflection, angle, original_sha, checked)
                        if limited is not None:
                            native_tolerance_limited.append({"root": root_index, "face": checked, **limited})
                            explorer.Next()
                            continue
                        fallback = tessellate_periodic_cone(face, deflection, angle)
                        if fallback is None:
                            fallback = tessellate_apex_cone(face, deflection, angle)
                        if fallback is None:
                            fallback = tessellate_segmented_periodic_cone(face, deflection, angle)
                        if fallback is not None:
                            supported_fallbacks += 1
                        else:
                            diagnostic = diagnostics / f"face-{checked}.brep"
                            BRepTools.Write_s(face, str(diagnostic))
                            item = {"root": root_index, "face": checked,
                                    "areaSquareMillimetres": area,
                                    "signedSurfaceIntegralSquareMillimetres": signed_area,
                                    "originalFaceDiagnostic": str(diagnostic),
                                    "diagnosticSha256": digest(diagnostic)}
                            unsupported.append(item)
                            print(json.dumps({"stage": "diagnostic-original-face", **item}), flush=True)
                explorer.Next()
        if digest(source) != original_sha:
            raise RuntimeError("Original STEP was changed during diagnostic scan")
        return {
            "schemaVersion": 1,
            "status": "diagnostic-only-no-display-model-created",
            "sourceSha256": original_sha,
            "sourceBytes": source.stat().st_size,
            "provenance": provenance or {},
            "assemblyOccurrences": count_occurrences(hierarchy),
            "uniqueOriginalLeafProducts": len(products),
            "faceOccurrencesChecked": checked,
            "alreadySupportedExactSurfaceFallbacks": supported_fallbacks,
            "nativeToleranceLimitedFaces": native_tolerance_limited,
            "unsupportedOriginalFaces": unsupported,
            "linearDeflectionMillimetres": deflection,
            "angularDeflectionRadians": angle,
            "sourceUnchanged": True,
            "elapsedSeconds": round(time.monotonic() - start, 3),
        }
    for index in range(1, roots.Length() + 1):
        shape = XCAFDoc_ShapeTool.GetShape_s(roots.Value(index))
        print(json.dumps({"stage": "verify-every-original-face-occurrence", "root": index, "roots": roots.Length()}), flush=True)
        BRepBndLib.Add_s(shape, bounds, False)
        explorer = TopExp_Explorer(shape, TopAbs_FACE)
        while explorer.More():
            face = TopoDS.Face_s(explorer.Current())
            faces += 1
            if faces % 10000 == 0:
                print(json.dumps({"stage": "original-face-occurrences-checked", "faces": faces}), flush=True)
            triangulation = BRep_Tool.Triangulation_s(face, TopLoc_Location())
            if triangulation is None or triangulation.NbTriangles() == 0:
                signed_area, _ = precise_face_area(face)
                area = abs(signed_area)
                if area > 1e-8 or signed_area < 0:
                    print(json.dumps({"stage": "refine-missing-original-face", "root": index, "face": faces, "areaSquareMillimetres": area if signed_area >= 0 else None, "signedSurfaceIntegralSquareMillimetres": signed_area}), flush=True)
                    limited = tessellate_original_tolerance_face(face, deflection, angle, original_sha, faces)
                    if limited is not None:
                        record = {"root": index, "face": faces, **limited,
                                  "originalFaceOccurrences": [{"root": index, "face": faces}]}
                        native_tolerance_limited.append(record)
                        native_tolerance_shapes.append((face, record))
                        triangles += limited["triangles"]
                        print(json.dumps({"stage": "retained-pinned-original-native-tolerance-face", **record}), flush=True)
                        explorer.Next()
                        continue
                    # Use the independently validated exact-surface fallback
                    # immediately for its narrowly supported cone class.
                    # Repeated OCCT refinement can otherwise take minutes on
                    # the same valid cone without ever creating triangles.
                    fallback = tessellate_periodic_cone(face, deflection, angle)
                    if fallback is None:
                        fallback = tessellate_apex_cone(face, deflection, angle)
                    if fallback is None:
                        fallback = tessellate_segmented_periodic_cone(face, deflection, angle)
                    if fallback is not None:
                        refinement = {"root": index, "face": faces, **fallback}
                        refinements.append(refinement)
                        triangles += fallback["triangles"]
                        print(json.dumps({"stage": "tessellated-original-periodic-cone", **refinement}), flush=True)
                        explorer.Next()
                        continue
                    # Small original curved faces can require tighter local
                    # tolerances than the whole assembly. Refine their mesh;
                    # never omit a nondegenerate face or replace its surface.
                    native_refinement = refine_original_face(face, deflection, angle)
                    if native_refinement is not None:
                        refinement = {"root": index, "face": faces, **native_refinement}
                        refinements.append(refinement)
                        print(json.dumps({"stage": "refined-original-face", **refinement}), flush=True)
                        triangles += native_refinement["triangles"]
                    else:
                        failure = {"root": index, "face": faces, "areaSquareMillimetres": area if signed_area >= 0 else None, "signedSurfaceIntegralSquareMillimetres": signed_area}
                        if len(unmeshed) < 16:
                            diagnostics = output.parent / "incomplete-original-faces"
                            diagnostics.mkdir(parents=True, exist_ok=True)
                            diagnostic = diagnostics / f"face-{faces}.brep"
                            BRepTools.Write_s(face, str(diagnostic))
                            failure["originalFaceDiagnostic"] = str(diagnostic)
                        unmeshed.append(failure)
                        print(json.dumps({"stage": "original-face-still-unmeshed", **failure}), flush=True)
                else:
                    degenerate_faces += 1
                    degenerate_face_details.append({"root": index, "face": faces, "adaptiveAreaSquareMillimetres": area})
            else:
                triangles += triangulation.NbTriangles()
                for audited_shape, record in native_tolerance_shapes:
                    if face.IsPartner(audited_shape):
                        record["originalFaceOccurrences"].append({"root": index, "face": faces})
            explorer.Next()
    if not triangles or unmeshed:
        raise RuntimeError(f"Original CAD face tessellation missing or outside local area tolerance: {unmeshed[:8]}; total={len(unmeshed)}")
    if bounds.IsVoid():
        raise RuntimeError("CAD has no finite bounds")
    source_bounds = list(bounds.Get())
    if not all(math.isfinite(value) for value in source_bounds):
        raise RuntimeError("Non-finite CAD bounds")
    output.parent.mkdir(parents=True, exist_ok=True)
    writer = RWGltf_CafWriter(TCollection_AsciiString(str(output)), True)
    writer.SetParallel(False)
    writer.SetMergeFaces(True)
    writer.SetSplitIndices16(False)
    writer.SetToEmbedTexturesInGlb(True)
    print(json.dumps({"stage": "write-glb", "trianglesWithInstances": triangles}), flush=True)
    if not writer.Perform(document, TColStd_IndexedDataMapOfStringString(), Message_ProgressRange()):
        raise RuntimeError("OpenCascade failed to export the original assembly")
    gltf, other_chunks = read_glb(output)
    if not gltf.get("meshes") or not gltf.get("nodes"):
        raise RuntimeError("Exported GLB has no renderable parts")
    original_nodes = len(gltf["nodes"])
    if source_up_axis == "Z":
        # Explicit top-level coordinate adaptation, leaving every original
        # occurrence and child transform unmodified. glTF's up axis is Y.
        for scene in gltf.get("scenes", []):
            root = len(gltf["nodes"])
            gltf["nodes"].append({
                "name": "CAD coordinates Z-up to glTF Y-up",
                "rotation": [-math.sqrt(0.5), 0, 0, math.sqrt(0.5)],
                "children": scene.get("nodes", []),
                "extras": {"hostCoordinateAdapter": True},
            })
            scene["nodes"] = [root]
    elif source_up_axis != "Y":
        raise RuntimeError(f"Unsupported source coordinate system: {source_up_axis}")
    gltf.setdefault("asset", {}).setdefault("extras", {})["hardwareSource"] = {
        **(provenance or {}),
        "inputSha256": original_sha,
        "conversion": "OpenCascade STEPCAF/XCAF to glTF; original parts, placements, names and colors",
        "sourceUpAxis": source_up_axis,
        "outputUpAxis": "Y",
        "outputUnit": "metre",
        "linearDeflectionMillimetres": deflection,
        "angularDeflectionRadians": angle,
        "noSyntheticGeometry": True,
    }
    write_glb(output, gltf, other_chunks)
    if digest(source) != original_sha:
        raise RuntimeError("Original STEP was changed during conversion")
    report = {
        "schemaVersion": 1,
        "sourceFile": source.name,
        "sourceSha256": original_sha,
        "sourceBytes": source.stat().st_size,
        "sourceRoots": roots_available,
        "transferredRoots": roots.Length(),
        "assemblyOccurrences": count_occurrences(hierarchy),
        "uniqueOriginalLeafProducts": len(products),
        "tessellationStrategy": "serial original shared leaf products; untouched original XCAF instance tree",
        "sourceBoundsMillimetres": source_bounds,
        "faceOccurrences": faces,
        "degenerateFacesWithoutTriangles": degenerate_faces,
        "degenerateAreaThresholdSquareMillimetres": 1e-8,
        "degenerateFaceDetails": degenerate_face_details,
        "unmeshedNondegenerateFaces": unmeshed,
        "locallyRefinedOriginalFaces": refinements,
        "nativeToleranceLimitedFaces": native_tolerance_limited,
        "trianglesIncludingInstances": triangles,
        "exportedOriginalNodes": original_nodes,
        "exportedMeshes": len(gltf["meshes"]),
        "exportedMaterials": len(gltf.get("materials", [])),
        "outputFile": output.name,
        "outputSha256": digest(output),
        "outputBytes": output.stat().st_size,
        "outputUnit": "metre",
        "sourceUpAxis": source_up_axis,
        "outputUpAxis": "Y",
        "linearDeflectionMillimetres": deflection,
        "angularDeflectionRadians": angle,
        "converter": {"package": "cadquery-ocp", "version": importlib.metadata.version("cadquery-ocp")},
        "provenance": provenance or {},
        "originalHierarchy": hierarchy,
        "elapsedSeconds": round(time.monotonic() - start, 3),
        "limitations": [
            "Triangulated CAD appearance and original assembly hierarchy; no physical joint constraints, mass validation or live telemetry are inferred.",
            "B-rep surfaces are tessellated using the recorded tolerances. Original STEP/native CAD remains downloadable and authoritative.",
        ],
    }
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source")
    parser.add_argument("output")
    parser.add_argument("--report", required=True)
    parser.add_argument("--source-up-axis", choices=["Y", "Z"], default="Z")
    parser.add_argument("--deflection", type=float, default=0.25)
    parser.add_argument("--angle", type=float, default=0.45)
    parser.add_argument("--provenance-json")
    parser.add_argument("--diagnose-unmeshed-only", action="store_true",
                        help="Collect unsupported original faces after standard meshing; never create a GLB")
    args = parser.parse_args()
    if args.deflection <= 0 or not 0 < args.angle < math.pi:
        parser.error("Tessellation tolerances must be positive and angular tolerance less than pi")
    provenance = json.loads(args.provenance_json) if args.provenance_json else {}
    report = convert(args.source, args.output, source_up_axis=args.source_up_axis,
                     deflection=args.deflection, angle=args.angle, provenance=provenance,
                     diagnose_unmeshed_only=args.diagnose_unmeshed_only)
    Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({key: value for key, value in report.items() if key != "originalHierarchy"}), flush=True)


if __name__ == "__main__":
    main()
