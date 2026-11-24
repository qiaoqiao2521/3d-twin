# Hardware integration contract

Each asset is built into `public/hardware/<id>/`, with an `asset.json` and an `originals.json`. Generated files are reproducible from full commit pins; the upstream directory is never rewritten to adapt it to the host.

`asset.json`: `schemaVersion: 1`, `id`, `title`, `kind` (`robot` or `machine`), `description`, `sources`, `models`, `capabilities` (`structure`, `motion`, `live` strings), `limitations` (string array), `filesIndex: "originals.json"`.

Sources: `id`, `repository`, full `revision`, optional `tree`, `license`, `root` (asset-relative original directory), optional `archive`, `archiveSha256`, `archiveSize`, `fileCount`.

Models: `id`, `label`, `format` (`gltf`, `urdf`, `html`), asset-relative `path`, `unit` (`m`, `mm`), `up` (`Y`, `Z`), `role` (`assembly`, `kinematic`, `original-app`), `source: {id, path}`, optional `limitations` and `packages` mapping URDF package names to asset-relative directories. GLB must preserve original transforms and names. A conversion must identify its source, units and limitations. HTML runs as an independent same-origin document and is destroyed on exit.

`originals.json`: `{schemaVersion: 1, files: [{sourceId, path, size, sha256?, url?, archive?}]}`. `path` is the unchanged upstream path. `url` and `archive` are relative to the asset directory. All original files must exist either individually or inside the complete locally served source archive. A missing individual URL is labelled as an archive member, never passed off as a directly viewable local file.

`asset.json` may also include `integrationSource: [{path, label, license}]` for downloadable corresponding source of the adapted application. OLSK publishes its complete current AGPL application source, including adapted files, dependency locks and local assets, separately from the untouched upstream archive.

`verificationReports: [{path, label}]` exposes locally published conversion and source-precision reports in the provenance view. These are clearly labelled generated inspection records, separate from original engineering files. A native tolerance limitation must also remain visible in `limitations`; a report link alone must not conceal it.

The catalog root contains `HOST-RESOURCES.json`, with the exact local decoder source/version, size and SHA-256 for each decoder file, and `THIRD_PARTY_NOTICES.txt` with host runtime licenses. Per-asset original and adapted licenses remain separate. Verification includes these host files and their actual HTTP bytes.

`scripts/hardware/common.mjs` exports `publishSource({assetDir, sourceRoot?, source, archivePath?, paths?, fileIndex?})`, returning `{source, files}`. A full archive is indexed even if `sourceRoot` contains only selected extracted files. Optional `fileIndex` supplies the full archive entries, avoiding a second archive scan. `paths` selects original paths or directories for individual publication; omit to publish all tracked files in `sourceRoot`. Originals may be hardlinked to conserve storage, and must never be modified after publication.

Builders export `buildRobots({repoRoot, ids?})` and `buildDevices({repoRoot, ids?})`. Existing download caches can be reused. CLI filtering is for development; the normal production build requires all nine assets. Python CAD conversions use the separately pinned toolchain. No ROS, real controller or machine is contacted by the viewer.
