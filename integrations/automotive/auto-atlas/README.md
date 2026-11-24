# Auto Atlas integration

Interactive vehicle explosion, selection and model switching, based on [Auto Atlas](https://github.com/ahnuchen/auto-atlas). This copy uses the hub's React, Three.js, Vite and Tailwind dependencies. From the repository root, `npm run automotive:build` regenerates the static viewer under `public/twins/automotive/auto-atlas/` without replacing the model files. The hub's `npm run dev` and `npm run build` run this automatically.

Code: MIT, see [LICENSE](LICENSE). Model attribution and license metadata are recorded in `public/twins/automotive/data/models.json` and in the GLB metadata. The BMW model is by Martin Trafas (TinoD2), CC BY 4.0; the Tesla model is by Ameer Studio (uchiha.321abc), CC BY 4.0.
