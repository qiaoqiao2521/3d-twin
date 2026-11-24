"""Export Thor's saved assembly and original stored per-face colors.

Run with FreeCADCmd. FreeCAD's Import.export accepts (Part::Feature, colors)
entries; we supply colors decoded from the original GuiDocument.xml/ColorList
members. A later STEPCAF selection keeps only the original Model root, removing
the extra root references required to give Import.export its color dictionary.
No native document is recomputed, saved, or remodelled.
"""
import hashlib
import json
import os
from pathlib import Path
import struct
import traceback
import xml.etree.ElementTree as ET
import zipfile

import FreeCAD as App
import Import
import Part

log = os.fdopen(os.dup(1), "w", buffering=1)


def emit(data):
    print(json.dumps(data), file=log, flush=True)


def digest(file):
    with Path(file).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def unpack_color(value):
    # FreeCAD packed format is RRGGBBTT, with T denoting transparency.
    return ((value >> 24 & 255) / 255, (value >> 16 & 255) / 255,
            (value >> 8 & 255) / 255, (value & 255) / 255)


try:
    source = Path(os.environ["HARDWARE_THOR_SOURCE"]).resolve()
    original = Path(os.environ["HARDWARE_THOR_ORIGINAL"]).resolve()
    output = Path(os.environ["HARDWARE_THOR_STEP"]).resolve()
    report_file = Path(os.environ["HARDWARE_THOR_REPORT"]).resolve()
    if App.GuiUp:
        raise RuntimeError("Use FreeCADCmd for this deterministic saved-geometry export")
    if int(App.Version()[0]) < 1:
        raise RuntimeError("FreeCAD 1.0 or newer is required")
    originals = {file.name.casefold(): file for file in original.parent.iterdir() if file.suffix.lower() == ".fcstd"}
    original_hashes = {file.name: digest(file) for file in originals.values()}
    appearance = {}
    stored_objects = {}
    for file in originals.values():
        with zipfile.ZipFile(file) as zipped:
            model_xml = ET.fromstring(zipped.read("Document.xml"))
            stored_objects[file.name.casefold()] = {item.get("name"): item for item in model_xml.findall("./ObjectData/Object")}
            gui = ET.fromstring(zipped.read("GuiDocument.xml"))
            entries = {}
            for item in gui.findall(".//ViewProvider"):
                properties = {prop.get("name"): prop for prop in item.findall("./Properties/Property")}
                colors = []
                color_list = properties.get("DiffuseColor")
                if color_list is not None:
                    binary = color_list.find("ColorList")
                    if binary is not None and binary.get("file"):
                        data = zipped.read(binary.get("file"))
                        count = struct.unpack_from("<I", data)[0]
                        if len(data) != 4 + count * 4:
                            raise RuntimeError(f"Unsupported original ColorList: {file.name}/{binary.get('file')}")
                        colors = [unpack_color(value) for value in struct.unpack_from(f"<{count}I", data, 4)]
                shape_color = properties.get("ShapeColor")
                if not colors and shape_color is not None:
                    colors = [unpack_color(int(shape_color.find("PropertyColor").get("value")))]
                transparency = properties.get("Transparency")
                if transparency is not None:
                    value = int(transparency.find("Integer").get("value")) / 100
                    if value:
                        colors = [(*color[:3], value) for color in colors]
                visibility = properties.get("Visibility")
                visible = visibility.find("Bool").get("value") == "true" if visibility is not None else None
                override = properties.get("OverrideMaterial")
                if override is not None and override.find("Bool").get("value") == "true":
                    raise RuntimeError(f"Original instance material override needs explicit handling: {file.name}/{item.get('name')}")
                entries[item.get("name")] = {"colors": colors, "visible": visible}
            appearance[file.name.casefold()] = entries

    App.ParamGet("User parameter:BaseApp/Preferences/Document").SetBool("NoPartialLoading", True)
    emit({"stage": "load-original-saved-assembly", "source": str(source)})
    document = App.openDocument(str(source))
    emit({"stage": "loaded-original-documents", "count": len(App.listDocuments())})
    model = document.getObject("Model")
    if model is None:
        raise RuntimeError("Missing original Thor Model root")
    # Restore the original GUI visibility to App properties solely for the
    # native export filter; GUI services themselves are not initialized.
    for doc in App.listDocuments().values():
        key = Path(doc.FileName).name.casefold()
        if key not in appearance:
            raise RuntimeError(f"Loaded document has no frozen original: {doc.Name}")
        for obj in doc.Objects:
            info = appearance[key].get(obj.Name)
            if info is not None and info["visible"] is not None:
                obj.Visibility = info["visible"]

    parts = {}
    auxiliary_frames = []
    known_auxiliary_frames = {
        ("AssemblyArt4", "LCS_M8Connector"),
        ("AssemblyArt56", "LCS_Collar"),
        ("AssemblyArt56", "LCS_Pulley_GT2x40M4"),
    }
    checked_placements = []
    visited = set()

    def collect(obj, linked=False):
        identity = (obj.Document.Name, obj.Name)
        if identity in visited:
            return
        visited.add(identity)
        key = Path(obj.Document.FileName).name.casefold()
        stored = stored_objects[key].get(obj.Name)
        if stored is None:
            raise RuntimeError(f"Runtime object lacks a frozen original: {identity}")
        saved = stored.find('./Properties/Property[@name="Placement"]/PropertyPlacement')
        if saved is not None and hasattr(obj, "Placement"):
            attributes = saved.attrib
            placement = App.Placement(App.Vector(*(float(attributes[f"P{axis}"]) for axis in "xyz")), App.Rotation(*(float(attributes[f"Q{index}"]) for index in range(4))))
            a, b = placement.toMatrix().A, obj.Placement.toMatrix().A
            error = max(abs(x - y) for x, y in zip(a, b))
            if error > 1e-7:
                raise RuntimeError(f"FreeCAD changed a saved original placement: {identity}; max delta {error}")
            checked_placements.append({"document": key, "object": obj.Name, "maximumMatrixDelta": error})
        target = obj.LinkedObject if obj.isDerivedFrom("App::Link") else obj.getLinkedObject(False)
        if isinstance(target, tuple):
            target = target[0]
        if target is not None and (target.Document.Name, target.Name) != identity:
            collect(target, True)
            return
        if obj.isDerivedFrom("App::Part") or obj.isDerivedFrom("App::DocumentObjectGroup"):
            for child in obj.Group:
                if child.Visibility:
                    collect(child)
            return
        if not obj.isDerivedFrom("Part::Feature"):
            return
        shape = obj.Shape
        if identity in known_auxiliary_frames:
            if obj.TypeId != "PartDesign::CoordinateSystem" or len(shape.Solids) != 0:
                raise RuntimeError(f"Refusing to isolate a mechanical object as a datum: {identity}")
            auxiliary_frames.append({
                "sourceDocument": Path(obj.Document.FileName).name,
                "parentAssembly": obj.Document.Name, "name": obj.Name, "label": obj.Label,
                "originalType": obj.TypeId, "originalVisibility": bool(obj.Visibility),
                "originalLocalMatrixMillimetres": obj.Placement.toMatrix().A,
                "originalSolidCount": 0,
                "displayAdaptation": "Original auxiliary coordinate-system name/placement retained as a no-mesh node. Its unbounded datum surfaces are not mechanical solids and are not replaced with finite geometry.",
            })
            obj.Visibility = False
            return
        faces = len(shape.Faces)
        if not faces:
            return
        info = appearance[key].get(obj.Name)
        if info is None or not info["colors"]:
            raise RuntimeError(f"Original visible CAD part has no saved appearance: {identity}")
        colors = info["colors"]
        if len(colors) == 1:
            colors = colors * faces
        if len(colors) != faces:
            raise RuntimeError(f"Original per-face colors disagree with saved B-rep: {identity}: {len(colors)} colors / {faces} faces")
        parts[identity] = (obj, colors)

    collect(model)
    if {(item["parentAssembly"], item["name"]) for item in auxiliary_frames} != known_auxiliary_frames:
        raise RuntimeError("The three explicitly reviewed original auxiliary frames were not found")
    shape = model.Shape
    solids = len(shape.Solids)
    if solids < 1 or not parts:
        raise RuntimeError("Original Thor assembly did not load its mechanical parts")
    emit({"stage": "native-step-export", "originalSolids": solids, "coloredPartDefinitions": len(parts), "checkedPlacements": len(checked_placements)})
    output.parent.mkdir(parents=True, exist_ok=True)
    Import.export([model, *parts.values()], str(output), exportHidden=False, legacy=False, keepPlacement=True)
    for file in originals.values():
        if digest(file) != original_hashes[file.name]:
            raise RuntimeError(f"Original CAD changed during export: {file.name}")
    # Datum coordinate systems contain unbounded mathematical surfaces. Bound
    # the original mechanical solids without changing or deleting any solid.
    bounds = Part.makeCompound(shape.Solids).BoundBox
    report = {
        "schemaVersion": 1, "source": original.name,
        "sourceSha256": original_hashes[original.name], "outputSha256": digest(output),
        "freecadVersion": App.Version(), "loadedDocuments": len(App.listDocuments()),
        "nativeKernelVersion": Part.OCC_VERSION,
        "originalSolids": solids, "coloredPartDefinitions": len(parts),
        "boundsMillimetres": [bounds.XMin, bounds.YMin, bounds.ZMin, bounds.XMax, bounds.YMax, bounds.ZMax],
        "preservedSavedPlacements": True, "checkedPlacements": checked_placements,
        "originalsModified": False, "recomputed": False,
        "originalColorSource": "Original GuiDocument.xml and packed per-face ColorList; restored through FreeCAD Import.export (Part::Feature, colors) support",
        "colorParts": [{"document": key[0], "object": key[1], "faces": len(value[1]), "uniqueColors": sorted(set(value[1]))} for key, value in parts.items()],
        "auxiliaryFrames": auxiliary_frames,
        "selectionRequired": "This temporary STEP contains original Model plus extra root references for supplying the native color dictionary. Select only the original Model subtree before display.",
        "licenseNotice": "Root CC-BY-SA-4.0; original native FreeCAD metadata All rights reserved. Both retained unchanged.",
    }
    report_file.write_text(json.dumps(report, indent=2) + "\n")
    emit({"stage": "native-step-exported", "bytes": output.stat().st_size, "sha256": report["outputSha256"]})
    os._exit(0)
except Exception:
    traceback.print_exc(file=log)
    os._exit(1)
