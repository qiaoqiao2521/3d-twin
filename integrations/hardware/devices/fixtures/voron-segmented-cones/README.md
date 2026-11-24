# Original Voron segmented-circle cone fixtures

These are diagnostic extracts of original CAD from
[VoronDesign/Voron-2 at 7b32e405f0719881cca782500c822e01e3b16bf2](https://github.com/VoronDesign/Voron-2/tree/7b32e405f0719881cca782500c822e01e3b16bf2),
`CAD/Voron_2.4r2_Assembly_STEP.zip` → `Voron_2.4r2_Assembly.step`.
They retain the upstream [GPL-3.0 license](../../licenses/voron-2.4/LICENSE).
[SOURCE.json](SOURCE.json) contains full archive/STEP hashes, extraction method,
original traversal ordinals and each fixture's byte hash. These are original
analytic faces, not replacement geometry; the independent tessellation adapter
is newly written code.

Faces 38016, 38509 and 38510 are valid complete non-apical cone frusta. Each
single wire contains two seam occurrences, one complete circular edge and a
second circle split across two original edges. Their five-edge topology is
correctly rejected by the existing four-edge rectangular fallback; the apex
fallback also correctly rejects these non-apical faces. No guard in either
existing helper was widened.

`segmented_periodic_cone_tessellation.py` requires both original circles to cover
the full period without gaps or overlaps, both original seam edges to span the
complete height, and every pcurve to be linear and match its original 3D edge.
It creates a shared parameter grid containing every original circular-edge
endpoint, samples the unchanged original surface and D1 normals, and attaches
only a triangulation cache. Face 38509 is REVERSED: the adapter retains that
orientation for the standard exporter rather than flipping local triangles
twice.

Each triangle's sampled center and edge midpoints are classified on the
original face, and boundary points must be ON. In addition to area and sampled
deviation, an analytic interpolation-error bound covers every barycentric point:

`maximum radius × angular span² / 8 + radius range × angular span / 4`.

The first term bounds the angular second-order remainder; the second bounds
the covariance between linear radius and angular coordinate. The axial term is
interpolated exactly. Refinement continues until that bound is within the
requested deflection and area error is below 0.5%. Unsupported geometry still
fails without a mesh.

Run `python -m unittest discover -s integrations/hardware/devices -p 'test_*cone_tessellation.py' -v`
in the pinned conversion environment. Regressions cover all three original
files, exact surface samples, world placement once, every original 3D edge
endpoint, REVERSED orientation, dense barycentric error samples, tighter
tolerances and rejection cases. This is CPU geometry verification, not WebGL
visual acceptance or a substitute for checking every face of the full machine.
