# Original Voron cone-face regression fixtures

These three small BRep files are **diagnostic extracts of original Voron CAD**,
licensed under the original [GPL-3.0 license](../../licenses/voron-2.4/LICENSE).
They are not newly reconstructed demonstration geometry. Their source is
[VoronDesign/Voron-2 at 7b32e405f0719881cca782500c822e01e3b16bf2](https://github.com/VoronDesign/Voron-2/tree/7b32e405f0719881cca782500c822e01e3b16bf2),
`CAD/Voron_2.4r2_Assembly_STEP.zip` → `Voron_2.4r2_Assembly.step`.
[SOURCE.json](SOURCE.json) records the source archive and full STEP hashes,
original face traversal ordinals, extraction method, fixture hashes and license.
The ordinals identify this fixed converter traversal, not official part numbers.

OCP 7.8 leaves these valid original faces without triangles after ordinary
meshing and local refinements. Each face contains one degenerate apex edge,
two seam occurrences and six original base-circle arcs. The surface, boundary,
placement and orientation in these files were exported directly with
`BRepTools.Write_s`; no analytic geometry was replaced or simplified.

The independent `apex_cone_tessellation.py` adapter adds a display triangulation
cache to an in-memory original face only. It requires a complete, gap-free cone
period ending at a single apex, preserves every original base-arc endpoint,
uses the original analytic surface/apex and generator-limit normals, and checks
original edge agreement, boundary and triangle sample classification, winding,
area and deflection. Unsupported trims still fail conversion. The original
non-apex `cone_tessellation.py` retains its original stricter rectangle guard.

Run `python -m unittest discover -s integrations/hardware/devices -p 'test_*cone_tessellation.py' -v`
with the pinned conversion Python environment. The regression reads all three
original fixtures and checks SHA preservation, surface samples, normals,
placement exactly once, original arc endpoints, smaller requested tolerances,
and rejection of partial/non-conical/non-apical geometry. This is CPU geometry
verification; WebGL display and whole-machine completeness require their own
checks.
