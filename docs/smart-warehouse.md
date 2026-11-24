# 智慧仓储独立场景

## 打开与运行

3D 孪生顶部选择 **智慧仓储**，或直接访问 `?mode=warehouse`。场景保留 Smart Warehouse 自己的仓库、物流车、AGV、昼夜主题、设备弹窗和镜头控制；“独立打开仓储”可打开完整页面。

```bash
npm ci
npm run dev
```

`npm ci` 会分别安装宿主与仓储的锁定依赖。`npm run dev` 和 `npm run build` 会先构建仓储，随后启动或构建宿主。更新了源码后重新运行命令即可；不会依赖作者在线演示站，也不需要填写额外服务地址。

如果曾以 `--ignore-scripts` 安装依赖，请补运行 `npm run install:warehouse`。也可以单独运行 `npm run build:warehouse`。仓储产物在 `public/integrations/smart-warehouse/`，最终随宿主一起进入 `dist/`，生成文件不入库。

宿主只在进入仓储时创建 iframe；切换到现实工程、iron 或其他工作空间时，在移除 iframe 之前同步触发原 Vue 应用的 `unmount()`。原作自己的退出钩子负责中断模型请求、停止动画帧和时钟、移除输入事件、释放几何与材质；宿主适配层退出 Pointer Lock/全屏、暂停媒体并释放 WebGL 上下文，随后将 iframe 导航到 `about:blank` 再移除。页面重试也走同样的清理路径，开发模式的 StrictMode 重挂载会恢复入口。独立打开时保留浏览器后退缓存恢复能力。

仓储原界面负责模型加载进度、失败重试、暂停和恢复，宿主没有叠加另一套镜头或物理循环。原作没有音频功能；媒体清理只是宿主退出边界，不表示新增声音体验。

手机顶栏将工作空间导航放在独立一行，保留三个可见入口。宿主只在 iframe 地址与原 Vue 场景容器均正确时确认页面已打开；误返回宿主兜底页、页面加载失败或 20 秒未打开都会给出可见重试入口。

## 来源与保留范围

- 上游：[Xxcool/smart-warehouse](https://github.com/Xxcool/smart-warehouse)
- 固定修订：`13f04d17304fedbc4cb4cf53002c4eb4abc4d188`
- 原源码、原文档、模型、图片、许可与 pnpm 锁文件完整保存在 [`integrations/smart-warehouse/upstream/`](../integrations/smart-warehouse/upstream/)，原有文件不改写。
- 保留 [MIT 许可](../integrations/smart-warehouse/upstream/LICENSE) 与作者署名；构建产物也带有 `LICENSE.txt` 与 `source.json`。
- 另补 npm 锁文件以便从宿主 `npm ci` 安装。直接依赖版本与上游 pnpm 锁文件一致；仓储的 Vue/Three.js 依赖与宿主 React/Three.js 分开安装和构建。

构建适配在 [`build-smart-warehouse.mjs`](../scripts/build-smart-warehouse.mjs)：将原本根路径下的 GLB 请求和 glTF 资源基路径改为相对仓储页面地址，并在原 Vue 启动后注册一个轻量退出适配器 [`lifecycle.ts`](../integrations/smart-warehouse/lifecycle.ts)。适配只发生在编译过程中，原源码不变。场景、布局、材质、灯光、相机、AGV 线路与运行参数均沿用上游。

[`upstream-manifest.json`](../integrations/smart-warehouse/upstream-manifest.json) 保存固定上游修订的 55 个 Git blob 哈希，来自该修订的 GitHub Git Tree；每次构建先逐文件校验，遗漏或改写原文件会停止构建。宿主另增的 npm 锁文件不冒充上游原件。2026-11-24 核对上游 `main`，仍为上述修订。上游 README 与 [作者自荐说明](https://github.com/ruanyf/weekly/issues/12143) 说明模型通过 Blender MCP 建模；该固定文件树保留 MIT 许可，未发现单独限制模型或截图分发的条款。

## 行为研究入口

原场景与行为研究分开维护。当前值得复用的行为入口已经在上游抽成了独立函数：

[`src/core/agvSimulation.ts`](../integrations/smart-warehouse/upstream/src/core/agvSimulation.ts) 中的 `getAgvFrame(elapsed, id, offset, routeLength, unloadProgress)`。

它不依赖 Vue 或 Three.js，返回车辆进度、接驳/重载/空载阶段、载货状态，以及与传送带交接有关的参数。原场景继续使用这个函数。后续实验应在单独的研究代码中调用或明确派生该函数，保留可直接对照的上游版本；验证结果成立后再决定是否接入正式场景。

可以先研究以下问题，而不改原展示：

1. 同一辆车跨圈时，箱件颜色与载货状态是否连续；暂停期间仿真时间是否停止。
2. 在独立实验中加入任务队列、卸货工位容量、停车和恢复，检查任务是否丢失或重复完成。
3. 再研究动态避障、路口通行与拥堵处理；这些是待新增能力，不能仅靠模型看起来在运行来认定完成。

当前原项目是**固定路线的本地循环演示**：七台 AGV 以不同进度偏移沿一条线路运行，尚未验证自主路径规划、动态障碍重规划或生产订单调度。设备工序与载货状态随本地动画更新，其他许多温度、吞吐等指标是预设展示数据。未连接实际仓库或设备。

### 可执行的独立研究

[`research/smart-warehouse/agvStudy.ts`](../research/smart-warehouse/agvStudy.ts) 直接调用冻结的 `getAgvFrame`，只增加调用方管理的仿真时间、暂停/恢复、确定性跳转和状态采样，不导入 Vue、Three.js 或任何渲染器，也不写回正式场景。返回的进度、工序、载货状态和传送带交接参数可供后续不同渲染器使用；它们不是设备控制命令。

使用 Node 24：

```bash
npm run study:warehouse -- 60 0.55
```

两个参数依次为实验线路长度和卸货进度比例。这里的 `60`、`0.55` 是明确指定的测试输入，不是从原模型量测出的尺寸；脚本会把输入来源写入 JSON，不能把输出速度或距离当成实际仓库指标。默认采样七台等距车辆，在第 8 秒暂停 30 秒后仍停在第 8 秒，恢复 4 秒后到第 12 秒。

目前已经验证暂停时间不累计、卸货前后载货状态切换、跨圈时传送带箱件颜色与车载箱件衔接、七台车的进度间隔以及非法输入拒绝。等距运行不能证明避障能力；任务队列、路口资源、动态避障和生产调度仍待研究。下一阶段应先在此独立接口上引入任务与工位占用的显式状态，再决定是否派生新场景，继续保留原展示作为对照。

## 验收

核查重点：顶部入口和直达链接；保留原场景的模型与配色；昼夜切换；设备点击与镜头复位；暂停/继续；手机控件；离开后 iframe 卸载，再次进入能重新加载。构建与路由测试不能代替实际 WebGL 画面验收，实测记录在提交说明中列出。

### 可复制的自动检查

```bash
npm ci
npm run lint
npm run test:warehouse
npm run build
npm run verify:warehouse -- --dist --serve
```

`--serve` 在同一进程内启动本地产物预览并进行 HTTP 检查，完成后关闭服务。检查宿主、`?mode=warehouse`、原 Vue 页面、JS/CSS、完整 GLB、许可证及来源记录，拒绝用宿主 HTML 回退页冒充模型或场景。也可用 `npm run verify:warehouse -- --http http://127.0.0.1:3000/` 检查已运行的服务；部署在子目录时把对应子目录保留在 URL 中并以 `/` 结尾。需要单独查看产物时运行 `npm run preview -- --host 127.0.0.1 --port 4174`。

### 2026-11-24 复核与最小加固

| 检查 | 结果与边界 |
| --- | --- |
| 宿主及仓储锁定依赖安装 | `npm ci` 成功，两套依赖保持隔离 |
| 类型与生产构建 | 宿主 `tsc --noEmit`、仓储 `vue-tsc --noEmit`、两套生产构建通过 |
| 接入相关回归 | `npm run test:warehouse` 29 项通过，包括新加的 4 项退出生命周期和 5 项 AGV 状态研究 |
| 原作完整性 | 55 个上游文件全部匹配固定修订；原 GLB 4,039,312 字节，831 节点、825 网格、42 材质，构建后逐字节哈希一致 |
| 资源与 HTTP | 宿主、深链接、原场景、4 个本地 JS/CSS 资源、GLB、MIT 和来源记录检查通过 |
| 全量既有测试 | Bun 1.4.5 跑 128 项：126 通过、2 失败；两项失败均在未修改的 `marsCombatEngine.test.ts`，且在原始 `f3a3f41` 独立 checkout 复现 |
| WebGL、触屏及真实释放效果 | 尚未完成浏览器实跑；上面的生命周期为自动契约测试，不当作 GPU 内存实测 |

两项既有失败分别为掩体接触位置旧断言，以及直接召唤 Alien Queen 的旧断言；本次不改动火星战斗系统以掩盖它们。宿主构建仍提示已有的大型工作台分包警告。需要继续人工验收：桌面与手机从顶部进入、刷新深链接、浏览器前进/后退、昼夜主题、点选设备、镜头复位、暂停恢复，以及反复进出后的画面/输入/GPU 资源回收。

### 2026-11-23 接入核验

- 宿主 TypeScript 检查通过；工作空间路由、iron 协议和共享结构检查的 20 项回归通过。
- 仓储自身 `vue-tsc` 检查、仓储生产构建及宿主生产构建通过，仓储入口单独分包。
- 对上游固定修订中的 55 个原文件逐字节比对，全部一致。
- 实际 HTTP 读取宿主、仓储页面、随包 GLB、MIT 许可和来源记录均为 200；GLB 文件头及嵌入子路径正确。
- 浏览器验收未完成：云端 Chromium 在进入页面之前因系统 socket 权限限制退出，没有取得 WebGL、昼夜切换或手机交互的实跑截图。需在本机按上面的项目完成操作验收。
