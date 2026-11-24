# V8 Engine Explorer integration

The `src/` files provide the 5.7 L 90° V8 geometry, mechanism and audio. The hub's `npm run automotive:build` assembles the standalone and embedded HTML pages in `public/twins/automotive/v8/`. The embedded page adds the workbench bridge and starts in performance mode; the standalone page retains the original controls. Three.js is served locally.

Code is MIT; see [LICENSE](LICENSE). The recorded sound loops embedded in `src/42_samples.js` are derived from [Ferrari 458 Italia](https://commons.wikimedia.org/wiki/File:Ferrari_458_Italia.ogg) and [Ferrari F430 (2010)](https://commons.wikimedia.org/wiki/File:Ferrari_F430_(2010).ogg) by Edvvc, CC BY-SA 3.0. The recordings were trimmed, looped and pitch-matched.

Run the mechanism tests with `node --test integrations/automotive/v8/tests/mechanism.test.mjs` from the repository root.
