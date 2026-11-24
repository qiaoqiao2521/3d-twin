# 仓储与工厂原版场景接入与验收

顶部 **仓储与工厂场景** 是正常入口；现有 **智慧仓储**、**汽车整车 · V8**、**现实工程**、**iron** 和实验空间继续独立运行。目录提供三个完整同源应用，返回目录会销毁当前 iframe，浏览器前进/后退、直接深链接和刷新均使用宿主 URL 状态恢复。仓库现名为 `qiaoqiao2521/3d-twin`。

## 入口与真实能力

| 入口 | 场景与实际运行方式 | 后台要求 |
| --- | --- | --- |
| `/?workspace=open-demos` | 桌面、手机均可发现的场景目录 | 无 |
| `/?workspace=open-demos&demo=warehouse-journey&source=local` | 原 Warehouse Journey 3D；交互式微缩仓库、包裹全流程、原相机与播放控制；业务为预设流程 | 无 |
| `/?workspace=open-demos&demo=waretwin&source=local` | 原 WareTwin；浏览器 TypeScript 引擎实时推进、任务调度与车辆交互 | 无 |
| `/?workspace=open-demos&demo=waretwin&source=live` | 原 WareTwin Python 引擎、WebSocket FULL/PATCH/HEATMAP、后端 API | `npm run start:waretwin` |
| `/?workspace=open-demos&demo=rftwin&source=local` | 原 RFTwin Local Demo，播放 Python 预生成的快照、事件、AMR 和检测图，不在浏览器重新执行生产规则 | 无 |
| `/?workspace=open-demos&demo=rftwin&source=live` | 原 RFTwin Python 工厂引擎、WebSocket 快照和增量、原生产/质检/AMR 面板 | `npm run start:rftwin` |

这些都是模拟仓库和工厂，没有连接现实设施。后台实时指原版模拟引擎的实时计算。宿主显示的 LOCAL、LOCAL DEMO、LIVE、离线回退和错误状态来自原 store，不把点击“后端实时”等同于已经连接。通用启动提示仅为“正在连接数据源”；显式本地回放的原页面中英文横幅明确不连接实时后台，实时入口回退仍保留后台重连。

WareTwin、RFTwin 原作是桌面控制台。宿主保留至少 1280 × 720 的原界面，手机可滚动查看，并使用底部“左侧 / 场景 / 右侧”切换视野；这没有把原作重写为手机原生布局。Journey 使用原作自己的移动布局与画质策略。手机触屏、镜头和帧率须以浏览器验收记录为准。

## 一次安装、独立构建

建议 Node.js 24，首次安装需要 Git 与网络。保持原锁文件，无需把 Three.js 或 React 版本强制统一。

```sh
npm ci
npm run lint
npm run test:warehouse
npm run test:open-demos
npm run build
npm run verify:warehouse -- --dist --serve
npm run verify:open-demos -- --dist --serve
npm run preview -- --host 127.0.0.1
```

根 `npm ci` 的 postinstall 安装原 Smart Warehouse 与三个固定版应用；根 `npm run build` 的 prebuild 依次构建最新主分支汽车工作台、Smart Warehouse 与三个新场景，再构建宿主。缺少应用或资源直接失败。产物为 `dist/`，无需独立 Next 服务；开发入口 `npm run dev` 同样先准备所有场景。

缓存布局为 `.cache/open-demos/<id>/source`（精确原件）和 `work`（可重建适配副本）。构建输出 `public/open-demos/<id>` 和 `dist/open-demos/<id>` 都是产物，不提交到 Git。完整来源、许可及资产权限见 [SOURCE](../integrations/open-demos/SOURCE.md)。

## 原版后台

本地预览不要求 Python。需要实时后台时，使用 Python 3.12 与 venv，在项目根目录分别启动：

```sh
# 可预先完成两个后台的独立环境安装
npm run install:demo-backends

# 两个终端分别运行；再在前端选择“后端实时”
npm run start:waretwin
npm run start:rftwin
```

脚本按固定原源码的 requirements 安装独立 venv，WareTwin 绑定 `127.0.0.1:8101`，RFTwin 绑定 `127.0.0.1:8102`。可用 `WARETWIN_PORT`、`RFTWIN_PORT` 调整端口，前端 Vite 与对应后台需使用相同值；`OPEN_DEMO_PYTHON` 可指定 Python 可执行文件。WareTwin 数据库写入缓存的 `data`，不改原仓库文件。RFTwin 保留原 `wsproto` WebSocket 后端。

Vite dev 与 preview 都代理 `/open-demo-api/waretwin/*`、`/open-demo-api/rftwin/*`，转发 HTTP 与 WebSocket 并保留原同源防护。没有关闭原 rate limit / origin 检查。正式部署 `dist/` 时，需在自己的反向代理复制这两条路由并允许 WebSocket Upgrade；纯静态托管可以完整运行三个本地入口，实时入口需要对应 Python 服务。只开放实际使用的来源域名，后台继续监听内部地址。

本轮没有配置外部 AI 密钥，也没有请求收费模型服务；原作规则回复、合成视觉和离线回放的边界保留。启动命令会继承开发者主动设置的原作环境变量，详见原 README。

验证真实后台协议：

```sh
npm run verify:demo-backends
```

该检查启动自己的两个原版后台和生产预览代理，检测健康状态、时间推进、WebSocket 原始消息，以及 RFTwin 同源暂停/恢复；结束后关闭本次启动的进程。它是 HTTP/协议验收，不操纵浏览器。

## 验收方法

自动检查覆盖安装、宿主及各子应用类型检查、生产构建；原 Smart Warehouse 的 55 个冻结文件与回归；新增 98 / 99 / 141 个原文件的逐 blob 核对；目录/深链接/返回、来源校验及退出释放契约；全部产物的 SHA-256 与实际生产 HTTP 字节比较；原作者运动和业务测试；后台的原始 HTTP / WebSocket 协议。

自动检查通过不能单独证明画面正确、镜头正常或真实设备内存已经释放。浏览器验收应逐项记录：从正常导航进入三个场景，操作原镜头与面板，确认来源状态；刷新和前进/后退；切换回 Smart Warehouse、汽车与现实工程；窄屏触屏和横向面板导航；多次切换后检查无残留音频、Pointer Lock、后台连接和持续增长的 WebGL/内存。未观察的项目保持未完成。

## 本次恢复后的验证记录

2026-11-24，执行环境恢复后从最新主分支 `ad019e595cd67f622be94291af712903c89da684` 重新接入，保留 BMW / Tesla / V8 全部内容。旧宿主暂存对象不可恢复，因此依据原适配上下文重建；下表全部是恢复后重新执行的结果，不沿用旧构建作为验收。环境为 Node 24.22.3、npm 11.19.1、Python 3.12.14；全仓测试使用临时安装的官方 Bun 1.4.5。

| 检查 | 本次结果 |
| --- | --- |
| 根 `npm ci` | 通过；包含原 Smart Warehouse 与三个场景各自的完整依赖安装 |
| 根 `npm run lint` | 通过，TypeScript 无错误 |
| 根 `npm run build` | 通过；汽车、Smart Warehouse、Journey、WareTwin、RFTwin 与宿主全部生产构建成功；原大包提示仍存在 |
| `npm run test:open-demos` | 12 / 12；包含 6 项路由检查、6 项宿主与来源/生命周期检查，其中覆盖显式 local 的 RFTwin 中英文横幅 |
| `npm run test:warehouse` | 32 / 32；原清理、AGV、实体检查、桥接与新旧路由回归 |
| Journey 原 `check:motion` | 通过，周期内 12,001 个采样；场内交通、货架/围栏、叉车、交接与货物面板等原检查 |
| WareTwin 原前端 Vitest | 32 / 32 |
| WareTwin 原后端 pytest | 52 / 52 |
| RFTwin 原后端 pytest | 157 / 157；保留 1 条原 Starlette / httpx 弃用提示 |
| 汽车原 Node 回归 | 25 / 25；BMW / Tesla 的模型绑定、资源与许可、V8 原机构检查 |
| 新场景原件与生产 HTTP | 98 + 99 + 141 个原文件逐 Git blob 一致；87 个完整产物逐 SHA-256 与生产 HTTP 字节比对通过，包含原回放与字体许可 |
| Smart Warehouse 原件与生产 HTTP | 55 个原文件一致；4 个本地 bundle、4,039,312 字节 GLB、宿主/深链接/许可/来源全部通过 |
| 汽车生产 HTTP | 34 个资源、2 个有效 GLB、14 个 V8 addon，0 缺失 |
| 两个原后台和生产代理 | 原健康状态与模拟时间推进通过；WareTwin 的 FULL / HEATMAP / PATCH，RFTwin 的 snapshot / amr_patch，以及 RFTwin 同源暂停/恢复通过 |
| 完整 `bun test` | 160 通过、2 个既存失败；未宣称全仓测试通过，详见下一段 |
| `git diff --check` 与原件再核对 | 通过；汽车原源码、模型、数据、许可未改 |

完整 Bun 测试的两条失败位于原 `src/utils/marsCombatEngine.test.ts` 的 80 和 535 行：旧掩体碰撞预期，以及直接召唤 Queen 的旧预期。将未修改的最新远端 `ad019e5` 用 `git archive` 取到独立目录，使用同一 Bun 重新执行，结果为 152 通过、同样 2 条失败；新增 8 条测试通过。本轮没有修改这些火星游戏实现或测试，也没有跳过这两条失败。汽车生成的 JavaScript 与最新主分支逐字节一致，文件名随 CSS 内容变化而重算；CSS 因原 Tailwind 扫描新增宿主类名增加 415 字节，汽车内容及原构建脚本保持原样。

原作者测试可以单独复跑：

```sh
npm exec --yes --package=bun@1.4.5 -- bun test
npm --prefix .cache/open-demos/warehouse-journey/work run check:motion
npm --prefix .cache/open-demos/waretwin/work/frontend test

# WareTwin 原运行锁不含测试工具，测试仅补装在其独立 venv
.cache/open-demos/waretwin/.venv/bin/python -m pip install pytest==9.1.1 httpx==0.28.1
(cd .cache/open-demos/waretwin/source/backend && ../../.venv/bin/python -m pytest -q -p no:cacheprovider)
(cd .cache/open-demos/rftwin/source && ../.venv/bin/python -m pytest tests/ -q -p no:cacheprovider)
```

两个原版后台依赖安装成功；WareTwin 保留原 `requirements.lock`，RFTwin 保留原带版本范围的 `requirements.txt`。各 venv 的安装记录保存于 `.cache/open-demos/<id>/backend-installed.txt`；WareTwin 测试额外补装的两个工具版本如上，未改原依赖文件。

## 浏览器与实机边界

此前浏览器阶段已从正常目录进入 RFTwin 本地回放，并发现原回退横幅会误称后台重连；当前实现保留已修正的 `source=local` 条件中英文提示和回归。此前可用 Cloud Chrome 报告 `GL_VENDOR` / `GL_RENDERER` 为 `Disabled`，因此没有完成真实 WebGL 画面、镜头、动作、光照、音频或 GPU 释放验收。环境恢复后的这一轮不把此前 HTML 操作记录升级为新视觉证据；真实手机与长期内存曲线仍需在支持 WebGL 的设备验收。

行为复用研究见 [仓储行为研究](warehouse-behavior-research.md)，不修改冻结场景的规则。

本次恢复后 root 尝试统一浏览器复验时，本机扩展上下文不可用，云端本地预览连接被拒绝，随后浏览器安全策略阻止读取错误页。因此没有取得这次重建的新浏览器导航或画面证据；上表工程与HTTP/协议检查已重新实际执行，真实设备验收继续保持未完成。
