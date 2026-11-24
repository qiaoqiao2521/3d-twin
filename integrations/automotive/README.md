# 汽车整车拆解与 5.7L V8 发动机

主站「汽车整车 · V8」或 `?mode=automotive` 进入工作台。工作台可在两款商用许可汽车（BMW M3 E30 / Tesla Model 3）爆炸图与独立 V8 运转原理之间切换；部件目录通过 `catalog.json`、`bindings.json`、`relations.json` 和 `models.json` 联动，并区分目录概念和模型中实际匹配的网格。工作台还保留外部汽车系统参考入口。

- `auto-atlas/src/`：整车查看器可编辑源码。
- `v8/src/`：V8 发动机可编辑源码和独立录音样本。
- `public/twins/automotive/`：工作台、契约、适配器、生成的 HTML 与 GLB。
- `npm run automotive:build`：重新构建汽车查看器、V8 HTML 和本地 Three.js 运行依赖；`npm run dev` 和 `npm run build` 已自动调用。
- `bun test`：包含契约、绑定、V8 机构和静态资产检查。

工作台和 Auto Atlas 代码采用 MIT；V8 代码采用其自带的 MIT 许可。模型及录音各自的署名和许可见静态目录的 `data/models.json`；CC BY-SA 3.0 录音署名也保留在 V8 页面中。整车模型和独立 V8 是原理关联，并非同一实车装配。
