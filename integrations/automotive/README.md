# 汽车整车拆解与 5.7L V8 发动机

主站「汽车整车 · V8」或 `?mode=automotive` 进入工作台。工作台可在两款商用许可汽车（BMW M3 E30 / Tesla Model 3）爆炸图与独立 V8 运转原理之间切换；部件目录通过 `catalog.json`、`bindings.json`、`relations.json` 和 `models.json` 联动，并区分目录概念和模型中实际匹配的网格。工作台还保留外部汽车系统参考入口。

- `auto-atlas/src/`：整车查看器可编辑源码。
- `v8/src/`：V8 发动机可编辑源码和独立录音样本。
- `public/twins/automotive/`：工作台、契约、适配器、生成的 HTML 与 GLB。
- `npm run automotive:build`：重新构建汽车查看器、V8 HTML 和本地 Three.js 运行依赖；`npm run dev` 和 `npm run build` 已自动调用。
- `bun test`：包含契约、绑定、V8 机构和静态资产检查。

工作台和 Auto Atlas 代码采用 MIT；V8 代码采用其自带的 MIT 许可。模型及录音各自的署名和许可见静态目录的 `data/models.json`；CC BY-SA 3.0 录音署名也保留在 V8 页面中。整车模型和独立 V8 是原理关联，并非同一实车装配。

## 用户手动浏览器复验

`tests/browser-smoke.mjs` 检查汽车工作台，`tests/hub-smoke.mjs` 检查主站入口。前提是用户已经安装可由本项目解析的 `playwright`，并已完成该 Playwright 版本的 Chromium 浏览器安装；脚本不安装依赖或下载浏览器。

若 Playwright 安装在其他位置，可以将 `PLAYWRIGHT_PACKAGE` 设为那个现有安装的 `playwright/package.json` 路径；相对路径以运行命令的工作目录为准。默认使用该 Playwright 管理的 Chromium；需要使用其他现有 Chromium 时，显式设置 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 为可执行文件路径，并由用户确认版本兼容性。脚本不再依赖特定用户目录或系统 Chrome 安装位置。

在仓库根目录启动服务，保持该终端运行：

```bash
npm run dev -- --host 127.0.0.1 --port 3105
```

然后在另一个终端运行：

```bash
node integrations/automotive/tests/browser-smoke.mjs
node integrations/automotive/tests/hub-smoke.mjs
```

可用 `AUTOMOTIVE_BASE_URL` 指定已启动的其他地址，用 `ARTIFACT_DIR` 指定截图和结果目录，默认分别为 `http://127.0.0.1:3105` 与 `/tmp/automotive-hub-qa`。这些是用户自行运行的验收脚本；本次路径修复仅执行 `node --check`，没有启动浏览器，不能据此认定 WebGL、触屏或声音已经通过验收。
