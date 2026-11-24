"""Select the unchanged original Thor Model subtree after native color export."""
import argparse
import hashlib
import json
from pathlib import Path

from OCP.IFSelect import IFSelect_RetDone
from OCP.STEPCAFControl import STEPCAFControl_Reader, STEPCAFControl_Writer
from OCP.TCollection import TCollection_ExtendedString, TCollection_AsciiString
from OCP.TDataStd import TDataStd_Name
from OCP.TDF import TDF_Label, TDF_LabelSequence, TDF_Tool
from OCP.TDocStd import TDocStd_Document
from OCP.TopAbs import TopAbs_SOLID
from OCP.TopExp import TopExp_Explorer
from OCP.XCAFDoc import XCAFDoc_DocumentTool

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source")
parser.add_argument("output")
parser.add_argument("native_report")
parser.add_argument("report")
args = parser.parse_args()
source, output = Path(args.source), Path(args.output)
native = json.loads(Path(args.native_report).read_text())
if hashlib.sha256(source.read_bytes()).hexdigest() != native["outputSha256"]:
    raise RuntimeError("Native FreeCAD export checksum changed")
document = TDocStd_Document(TCollection_ExtendedString("XCAF"))
reader = STEPCAFControl_Reader()
reader.SetColorMode(True)
reader.SetNameMode(True)
if reader.ReadFile(str(source)) != IFSelect_RetDone or not reader.Transfer(document):
    raise RuntimeError("Cannot load the original colored native export")
tool = XCAFDoc_DocumentTool.ShapeTool_s(document.Main())
roots = TDF_LabelSequence()
tool.GetFreeShapes(roots)
if roots.Length() != 1:
    raise RuntimeError("Native color export has an unexpected root count")
children = TDF_LabelSequence()
tool.GetComponents_s(roots.Value(1), children, False)
matches = []
root_identity_deltas = []
for index in range(1, children.Length() + 1):
    item = children.Value(index)
    reference = TDF_Label()
    target = reference if tool.GetReferredShape_s(item, reference) else item
    name = TDataStd_Name()
    value = name.Get().ToExtString() if target.FindAttribute(TDataStd_Name.GetID_s(), name) else ""
    if value == "Model" and tool.IsAssembly_s(target):
        transform = tool.GetLocation_s(item).Transformation()
        maximum_delta = max(abs(transform.Value(row, column) - (1 if row == column else 0)) for row in range(1, 4) for column in range(1, 5))
        # A STEP may store an explicit identity placement rather than the
        # empty TopLoc location. Test its numeric matrix, not pointer/form.
        if maximum_delta > 1e-9:
            raise RuntimeError("Unexpected nonidentity original Model root placement")
        root_identity_deltas.append(maximum_delta)
        matches.append(target)
if len(matches) != 1:
    raise RuntimeError(f"Expected one original Thor Model subtree, got {len(matches)}")
selected = matches[0]
parts = TDF_LabelSequence()
tool.GetComponents_s(selected, parts, False)
if parts.Length() != 6:
    raise RuntimeError(f"Original Thor assembly must have six top-level mechanical assemblies, got {parts.Length()}")
shape = tool.GetShape_s(selected)
explorer = TopExp_Explorer(shape, TopAbs_SOLID)
solids = 0
while explorer.More():
    solids += 1
    explorer.Next()
if solids != native["originalSolids"]:
    raise RuntimeError(f"Native export lost original mechanical solids: {solids}/{native['originalSolids']}")
writer = STEPCAFControl_Writer()
writer.SetColorMode(True)
writer.SetNameMode(True)
if not writer.Transfer(selected) or writer.Write(str(output)) != IFSelect_RetDone:
    raise RuntimeError("Cannot write the original Thor assembly subtree")
identity = TCollection_AsciiString()
TDF_Tool.Entry_s(selected, identity)
Path(args.report).write_text(json.dumps({"schemaVersion": 1, "sourceSha256": native["outputSha256"], "outputSha256": hashlib.sha256(output.read_bytes()).hexdigest(), "selectedOriginalProduct": "Model", "selectedLabel": identity.ToCString(), "rootIdentityMaximumMatrixDelta": max(root_identity_deltas), "rootIdentityTolerance": 1e-9, "topMechanicalAssemblies": parts.Length(), "originalSolids": solids, "omittedOnlyExtraRootColorReferences": children.Length() - 1, "originalHierarchyAndColorsRetained": True, "noSyntheticGeometry": True}, indent=2) + "\n")
