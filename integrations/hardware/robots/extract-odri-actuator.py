"""Select an original ODRI product subtree; never recreate or reposition parts."""
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
from OCP.XCAFDoc import XCAFDoc_DocumentTool

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source")
parser.add_argument("output")
parser.add_argument("report")
args = parser.parse_args()
source, output = Path(args.source), Path(args.output)
original_sha = hashlib.sha256(source.read_bytes()).hexdigest()
document = TDocStd_Document(TCollection_ExtendedString("XCAF"))
reader = STEPCAFControl_Reader()
reader.SetColorMode(True)
reader.SetNameMode(True)
if reader.ReadFile(str(source)) != IFSelect_RetDone or not reader.Transfer(document):
    raise RuntimeError("Cannot load the frozen original ODRI STEP")
tool = XCAFDoc_DocumentTool.ShapeTool_s(document.Main())
roots = TDF_LabelSequence()
tool.GetFreeShapes(roots)
matches = {}


def visit(label):
    reference = TDF_Label()
    if tool.GetReferredShape_s(label, reference):
        label = reference
    name = TDataStd_Name()
    value = name.Get().ToExtString() if label.FindAttribute(TDataStd_Name.GetID_s(), name) else ""
    identity = TCollection_AsciiString()
    TDF_Tool.Entry_s(label, identity)
    if value == "_upper_leg_200mm" and tool.IsAssembly_s(label):
        matches[identity.ToCString()] = label
    children = TDF_LabelSequence()
    tool.GetComponents_s(label, children, False)
    for index in range(1, children.Length() + 1):
        visit(children.Value(index))


for index in range(1, roots.Length() + 1):
    visit(roots.Value(index))
if len(matches) != 1:
    raise RuntimeError(f"Expected exactly one original upper-leg actuator product, found {len(matches)}")
identity, selected = next(iter(matches.items()))
children = TDF_LabelSequence()
tool.GetComponents_s(selected, children, False)
if children.Length() != 19:
    raise RuntimeError("Original ODRI actuator assembly component count changed")
output.parent.mkdir(parents=True, exist_ok=True)
writer = STEPCAFControl_Writer()
writer.SetColorMode(True)
writer.SetNameMode(True)
if not writer.Transfer(selected) or writer.Write(str(output)) != IFSelect_RetDone:
    raise RuntimeError("Cannot export the selected original ODRI product")
if hashlib.sha256(source.read_bytes()).hexdigest() != original_sha:
    raise RuntimeError("Original ODRI source changed during selection")
Path(args.report).write_text(json.dumps({
    "schemaVersion": 1, "source": source.name, "sourceSha256": original_sha,
    "selectedProductName": "_upper_leg_200mm", "selectedProductLabel": identity,
    "directComponents": children.Length(), "outputSha256": hashlib.sha256(output.read_bytes()).hexdigest(),
    "selection": "Original Bolt STEP upper-leg actuator product, including both belts, motor, encoder, pulleys, tensioners and fasteners; original product-local placements retained.",
    "noSyntheticGeometry": True, "noJointMotionInferred": True,
}, indent=2) + "\n")
