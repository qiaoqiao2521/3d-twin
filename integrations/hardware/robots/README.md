# Original robot hardware integrations

These four integrations preserve the original engineering files and distinguish
static mechanical structure, original joint kinematics, simulation source, and
real hardware control. The viewer does not connect to a controller or claim
that a moving slider validates dynamics.

## Fixed sources

`sources.json` pins the full commit, Git tree and license blob. The builder
fetches each exact commit into `.cache/hardware-sources/`, rejects modified
source caches, checks original file bytes against their Git blob IDs, and
records SHA-256 for every original. All tracked files are available in complete
same-origin archives. Selected CAD, mesh packages, licenses and documentation
also have individual same-origin URLs; archive-only members are labelled as
archive members in `originals.json`.

| Asset / source | Original repository | Commit | License scope |
| --- | --- | --- | --- |
| ODRI hardware | https://github.com/open-dynamic-robot-initiative/open_robot_actuator_hardware | `66af1522b4fba0ec4a1d7790e66f5e4652208d30` | BSD-3-Clause; retain source notices |
| ODRI original CAD HTML | https://github.com/open-dynamic-robot-initiative/open-dynamic-robot-initiative.github.io | `44b1db7c1028ed5c2519f29b43965442dbf16961` | Website BSD-3-Clause; embedded eDrawings and other third-party notices retained separately |
| SO101 | https://github.com/TheRobotStudio/SO-ARM100 | `141aea7bcac2744d92998e30268c413202a56f96` | Apache-2.0 |
| Thor hardware | https://github.com/AngelLM/Thor | `286b081fe6f056d87c379b884781ef77ff6a0159` | Root CC-BY-SA-4.0; native FreeCAD metadata conflict recorded below |
| Thor ROS | https://github.com/AngelLM/Thor-ROS | `e11a56b5aa0d89f0b68a3ea7bd084eab4a050952` | Root CC-BY-SA-4.0; package software also carries Apache-2.0 |
| PAROL6 hardware | https://github.com/Source-Robotics/PAROL6-Desktop-robot-arm | `4bfc33519947e84e561ee64fc46d05c1a4935020` | Hardware CERN-OHL-S-2.0; control firmware GPL-3.0; vendored library notices retained |
| PAROL6 official models | https://github.com/Source-Robotics/robot_descriptions | `a626564c30119b8493a8e0d5e48d7294382cbae2` | Models, meshes and documentation CC-BY-4.0; tools and ROS support Apache-2.0 |

The unchanged license texts are also retained in `licenses/`. Root licenses do
not erase individual notices, firmware licenses, historical model metadata, or
embedded third-party runtime copyrights. A complete source archive includes all
those original declarations.

## What is displayed

### ODRI actuator and Solo12

The mechanical GLB comes from the original
`mechanics/biped_6dof_v1/cad_files/STEP/biped_6dof_v1.STEP`. The extractor selects
the unique original XCAF product `_upper_leg_200mm` with 19 direct components.
It retains the original product-local placements, motor, encoder, two timing
belts, pulleys, tensioners and fasteners; it does not rebuild an actuator from
approximate geometry. This is an original **Bolt upper-leg assembly**, labelled
as such, not falsely described as the Solo12-specific actuator assembly.

The Solo12, three-DOF leg and Solo12 body entries use the author's original
single-file eDrawings exports from `cad_files/`. They remain byte-identical and
run in a disposable same-origin iframe. Their static script/image dependencies
are embedded; actual browser execution and WebGL appearance require separate
acceptance. The full hardware archive also contains the original Solo12
SolidWorks archive and actuator manufacturing files.

The eDrawings HTML contains Dassault Systèmes SolidWorks copyright notices and
bundled dependency notices. We redistribute the original published Web HTML
documents as complete documents, retain those notices, and do not extract or
relicense the embedded renderer as BSD. SOLIDWORKS documents Web HTML export and
HTML sharing in its official manuals:

- https://help.solidworks.com/2022/english/edrawings/t_saving_files_in_edrawings_professional.htm
- https://help.solidworks.com/2026/English/edrawings/c_eDrawings.htm

No locomotion controller, contact physics, torque loop, or robot telemetry is
run by these structure viewers.

### SO101

The complete original `STEP/SO101/SO101 Assembly.step` is downloadable and
converted with its original product names, colors and instance placements.
Four untouched URDFs from `Simulation/SO101/` provide new-calibration follower,
camera follower, leader, and old-calibration follower entries. All referenced
meshes remain in the original relative `assets/` layout. The five arm joints and
gripper/trigger retain their upstream axes and ranges.

The original STEP includes 11 `Wiring_holder` products whose shape
representations contain coordinate frames without surfaces. Their original
nodes and placements remain in the GLB; the exporter's empty-mesh notices are
not hidden or replaced with invented physical parts. All 22,062 nondegenerate
surface occurrences in the supplied STEP are triangulated. One valid periodic
cone requires the narrowly validated original-surface tessellation fallback;
its report records the actual sampling error and preserves the analytic B-rep.

The original simulation README explains that leader trigger travel of 0–45°
and printed-part inertia are provisional estimates, there is no leader MJCF,
some motor properties are adapted from Open Duck Mini, and LeRobot's linear
0–100 gripper mapping has not been applied to these URDF/MJCF files. The host
preserves those facts and does not invent servo gears or windings absent from
the original CAD. Follower MJCF files are original downloads, not a claim of
running MuJoCo physics in this viewer.

### Thor

The original `freecad-src/Assembly.FCStd` links the original native mechanical
parts. A conversion-only working copy resolves case-insensitive Windows file
references on Linux and omits serialized add-on Python objects, so conversion
uses saved geometry without running unavailable Assembly4/Fasteners/gears
callbacks. Every saved B-rep, placement/color binary member and original source
file remains unchanged; the conversion report lists the filename aliases and
omitted runtime objects. The original source archive contains the unadapted
native documents. FreeCADCmd loads the saved native assembly, while the adapter
reads original `GuiDocument.xml` and packed per-face `ColorList` members and
supplies them through FreeCAD's native `Import.export` color API. Original
visibility and saved placements are checked. A STEPCAF selection then retains
the original `Model` assembly and removes only the extra root references used
to pass the color dictionary. No source document is saved, rebuilt or remodelled.
The original authoring documents still depend on their Assembly4, Fasteners
and gears workbenches for parametric editing and may present old-file migration
prompts in a newer FreeCAD. Reading saved B-reps for a static preview does not
claim to validate those authoring workflows.

The complete saved assembly resolves 53 native documents and retains **1,067
mechanical solids**. Three visible `PartDesign::CoordinateSystem` objects
(`LCS_M8Connector`, `LCS_Collar`, and `LCS_Pulley_GT2x40M4`) contain unbounded
mathematical datum surfaces rather than mechanical solids. Their original
names, parents, local matrices, types and visibility are retained as no-mesh
GLB nodes and in `reports/thor-auxiliary-frames.json`; no finite replacement
planes are generated. Only those three explicitly identified auxiliary
objects are excluded from mechanical surface tessellation. Other original
surfaces are still subject to the no-missing-face check.

The recorded export checks 662 saved placement matrices (maximum absolute
matrix difference below `4.6e-12`, tolerance `1e-7`) and retains all 27 original
distinct per-face colors. The final mechanical STEP tessellation covers all
27,720 face occurrences with 884,227 triangles including instances. The
appearance check compares original sRGB/transparency values with the GLB's
linear color/opacity values; it checks data preservation, not visual rendering.

The separate original ROS Xacro is expanded by standard `xacro==2.1.1` using
only the frozen `thor_urdf` and `thor_controller` package directories. A portable
`package://thor_urdf` mapping resolves original DAE meshes. All six arm joints,
the six gripper revolute joints, and the five gripper mimic relations are
retained. Original uniform inertia/mass placeholders are not measured dynamics;
ROS 2, MoveIt, Gazebo and the real controller are not started by the viewer.

**License metadata discrepancy:** Thor's root LICENSE and README declare
CC-BY-SA-4.0, while native FreeCAD documents contain `All rights reserved` in
their stored document metadata. Both original declarations are retained. The
integration does not silently edit the metadata or claim the discrepancy has
been resolved by the author. Original Thor-derived geometry remains attributed
to Ángel LM; CAD conversions are adaptations subject to the applicable
upstream share-alike terms.

### PAROL6

The official central model package supplies six original configurations:
flange, MSG, MSG TPU/glue jaws, SSG48 pinch, SSG48 stock Fin Ray, and pneumatic
gripper. Original link/visual/collision meshes and mimic relationships remain
unchanged. The hardware repository provides original print STL files, BOM,
assembly PDFs, print tables, firmware, and its own license set.

This pinned hardware tree does not provide a complete editable whole-robot STEP
assembly. It must not be marketed as detailed CAD of every internal drive.
The original `docs/MODEL_STATUS.md` still identifies unconfirmed joint limits,
some placeholder speed/effort values, estimated friction/drive gains/rotor
inertia, and unverified tool mass distributions. J6 remains `continuous` as
upstream specifies. TPU and Fin Ray jaws are original rigid-body models here,
not soft-body/grasp validation. The upstream model project also lists real RCB
integration as deferred.

Attribution: PAROL6/MSG/SSG48 models by Source Robotics,
https://github.com/Source-Robotics/robot_descriptions, licensed under CC BY 4.0,
https://creativecommons.org/licenses/by/4.0/. Changes: no changes to original
model files; host manifests, download indexing, source pinning and viewer
adaptation added. The model repository's `ATTRIBUTION.md` distinguishes current
CC-BY-4.0 model packages from older Apache-2.0 releases and historical source
metadata; that distinction is retained.

## Rebuild and verify

Use the root hardware installation/build commands for the complete nine-item
catalog. The robot builder exports `buildRobots({repoRoot, ids?})` and can also
be invoked for focused development:

```sh
npm run install:hardware
npm run build:hardware -- parol6
```

Python 3.11+, the pinned `cadquery-ocp==7.8.1.1.post1` and `xacro==2.1.1` are
required. **Thor also requires FreeCADCmd 1.0 or newer with App/Part/Import modules**;
`HARDWARE_FREECAD_CMD` can select its executable. Its conversion uses the console
application with a private preference file and reads original appearance data
without starting a GUI. This is a CAD export, not a browser or GPU visual test.
Missing tooling or a missing required model fails the build
instead of producing a successful partial catalog.

For a clean checkout, install FreeCAD/FreeCADCmd 1.0+ through the system or
official FreeCAD distribution, make `freecadcmd` available on `PATH` (or set
`HARDWARE_FREECAD_CMD` to its actual executable), then run:

```sh
npm ci
npm run install:hardware
npm run build:hardware
npm run verify:hardware
npm run verify:hardware:kinematics
npm run build
```

The root build runs all nine integrations sequentially. The pinned Python
environment is selected automatically; it need not occupy a particular cache
path if the host already has the exact required versions. FreeCADCmd uses its
own bundled/system Python for native documents, while STEPCAF conversion uses
the separately pinned OCP interpreter. No Xvfb, browser, display server or ROS
installation is required by the robot build. The original ROS applications
have their own upstream runtime requirements when run separately.

`verify-robots.py` checks the local original hashes, archive hashes and complete
file counts; URDF link/joint topology, axes, limits, mimic targets and every
mesh/texture reference; nonempty valid STL/DAE/GLB; and static dependencies of
the original HTML. `reports/verification.json` records the result per asset.
Conversion reports retain original hierarchy, units, source/output hashes and
face/triangle counts, and reject any unmeshed nondegenerate face.

The four asset manifests contain 17 selectable original model entries and
13,878 indexed original files:

| Asset | Model entries | Original files | Complete source archives |
| --- | ---: | ---: | ---: |
| ODRI | 4 | 3,874 | 2 |
| SO101 | 5 | 241 | 1 |
| Thor | 2 | 402 | 2 |
| PAROL6 | 6 | 9,361 | 2 |

The focused source-cache regression uses temporary real local Git remotes. It
covers recovery from an interrupted, empty initialization and rejects unknown
files, staged content, an unexpected remote, a wrong existing commit, and
modified original bytes. Run it with:

```sh
node --test integrations/hardware/robots/source-cache.test.mjs
```

File/format checks do not validate browser images, mobile touch, joint drag
ergonomics, eDrawings interaction, lighting, GPU cleanup or real hardware.
Those must be reported as separate browser/physical acceptance steps. Complete
source archives and converted output are reproducible generated assets; the
maintained integration consists of the pins, notices, adapters and reports.
