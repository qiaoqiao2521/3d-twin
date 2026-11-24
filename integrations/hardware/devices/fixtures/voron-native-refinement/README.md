# Original Voron local-refinement fixtures

These eleven BRep files are diagnostic extracts of the unchanged original
[VoronDesign/Voron-2 at 7b32e405f0719881cca782500c822e01e3b16bf2](https://github.com/VoronDesign/Voron-2/tree/7b32e405f0719881cca782500c822e01e3b16bf2)
STEP assembly, under its original [GPL-3.0 license](../../licenses/voron-2.4/LICENSE).
[SOURCE.json](SOURCE.json) records the original ZIP/STEP hashes, traversal
ordinals, extraction method and each fixture's byte hash. These are not
reconstructed surfaces or replacement demonstration models.

Nine faces are thin circular planar strips, 9019 is an extremely thin planar
lens bounded by original B-splines, and 8935 is a microscopic B-spline face.
The fixtures keep the original analytic geometry, pcurves, topology, placement
and orientation. They are read by the pinned original OCCT mesher; no additional
plane/spline triangulation helper replaces them.

Face 9019 demonstrates two independent numerical pitfalls. Default non-adaptive
surface integration gives an inaccurate area, whereas adaptive integration and
an independent Green integral of its original pcurves converge to approximately
0.000533484544 square millimetres. Separately, OCCT can return status zero with
one or more triangles while covering too little area. The local-refinement
acceptance check therefore compares actual triangle area against the adaptive
original area and continues refining until they agree within 0.5%.

The regression `test_native_face_refinement.py` invokes the production
`precise_face_area` and `refine_original_face` functions on these original
fixtures. Native boundary chords can lie slightly outside an exact concave trim
within the recorded deflection; the separate 9019 report measures that distance
on the original B-rep. These CPU checks do not assert exact curved boundaries
from finite triangles, WebGL appearance, or physical hardware behavior.

## One original precision limitation: face 8935

The original two linear B-spline pcurves of microscopic face 8935 do not close
exactly in parameter space. Their shared original 3D vertices sew them within
the original declared edge/vertex tolerances, which exceed the physical strip
width. Its negative signed area integral is contradicted by a positive direct
Jacobian integral over the common pcurve domain; taking its absolute value
would invent a misleading unsigned-area target.

The narrowly scoped `native_tolerance_tessellation.py` therefore retains the
unchanged original OCCT four-triangle mesh only for the fixed full STEP SHA,
face ordinal 8935 and matching original topology, pcurves, vertices, tolerances
and pinned kernel version. It does not project nodes or add closing edges.
[The fixed source audit](../../native-tolerance-audits/voron-2.4-face-8935.json)
contains the exact source and numerical evidence. Node, original-edge, native
boundary-chord and triangle samples are checked against their actual original
entity tolerances; shared topology vertices retain their own vertex tolerance.
This is explicitly a sampled source-fidelity audit, **not 0.5% area
certification, a face-only tolerance guarantee, or a whole-domain error bound**.
All ordinary closed faces retain the normal area acceptance gate.

`test_native_tolerance_tessellation.py` compares every output node, UV and
triangle with the unmodified native kernel output, checks sample audits and
rejects changed source identity, face index, placement or tolerance. The
original files and fixed audit are never rewritten by tests.
