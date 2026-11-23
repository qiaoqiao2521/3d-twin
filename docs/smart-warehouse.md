# 智慧仓储独立场景

## 打开与运行

3D 孪生顶部选择 **智慧仓储**，或直接访问 `?mode=warehouse`。场景保留 Smart Warehouse 自己的仓库、物流车、AGV、昼夜主题、设备弹窗和镜头控制；“独立打开仓储”可打开完整页面。

```bash
npm ci
npm run dev
```

`npm ci` 会分别安装宿主与仓储的锁定依赖。`npm run dev` 和 `npm run build` 会先构建仓储，随后启动或构建宿主。更新了源码后重新运行命令即可；不会依赖作者在线演示站，也不需要填写额外服务地址。

如果曾以 `--ignore-scripts` 安装依赖，请补运行 `npm run install:warehouse`。也可以单独运行 `npm run build:warehouse`。仓储产物在 `public/integrations/smart-warehouse/`，最终随宿主一起进入 `dist/`，生成文件不入库。

宿主只在进入仓储时创建 iframe；切换到现实工程、iron 或其他工作空间时卸载它，释放该文档与 WebGL 视口。仓储原界面负责模型加载进度、失败重试、暂停和恢复，宿主没有叠加另一套镜头或物理循环。

手机顶栏将工作空间导航放在独立一行，保留三个可见入口。宿主只在 iframe 地址与原 Vue 场景容器均正确时确认页面已打开；误返回宿主兜底页、页面加载失败或 20 秒未打开都会给出可见重试入口。

## 来源与保留范围

- 上游：[Xxcool/smart-warehouse](https://github.com/Xxcool/smart-warehouse)
- 固定修订：`13f04d17304fedbc4cb4cf53002c4eb4abc4d188`
- 原源码、原文档、模型、图片、许可与 pnpm 锁文件完整保存在 [`integrations/smart-warehouse/upstream/`](../integrations/smart-warehouse/upstream/)，原有文件不改写。
- 保留 [MIT 许可](../integrations/smart-warehouse/upstream/LICENSE) 与作者署名；构建产物也带有 `LICENSE.txt` 与 `source.json`。
- 另补 npm 锁文件以便从宿主 `npm ci` 安装。直接依赖版本与上游 pnpm 锁文件一致；仓储的 Vue/Three.js 依赖与宿主 React/Three.js 分开安装和构建。

唯一构建适配在 [`build-smart-warehouse.mjs`](../scripts/build-smart-warehouse.mjs)：将原本根路径下的 GLB 请求和 glTF 资源基路径改为相对仓储页面地址，保证嵌入子目录时仍加载随包携带的模型。适配只发生在编译过程中，原源码不变。场景、布局、材质、灯光、相机、AGV 线路与运行参数均沿用上游。

## 行为研究入口

原场景与行为研究分开维护。当前值得复用的行为入口已经在上游抽成了独立函数：

[`src/core/agvSimulation.ts`](../integrations/smart-warehouse/upstream/src/core/agvSimulation.ts) 中的 `getAgvFrame(elapsed, id, offset, routeLength, unloadProgress)`。

它不依赖 Vue 或 Three.js，返回车辆进度、接驳/重载/空载阶段、载货状态，以及与传送带交接有关的参数。原场景继续使用这个函数。后续实验应在单独的研究代码中调用或明确派生该函数，保留可直接对照的上游版本；验证结果成立后再决定是否接入正式场景。

可以先研究以下问题，而不改原展示：

1. 同一辆车跨圈时，箱件颜色与载货状态是否连续；暂停期间仿真时间是否停止。
2. 在独立实验中加入任务队列、卸货工位容量、停车和恢复，检查任务是否丢失或重复完成。
3. 再研究动态避障、路口通行与拥堵处理；这些是待新增能力，不能仅靠模型看起来在运行来认定完成。

当前原项目是**固定路线的本地循环演示**：七台 AGV 以不同进度偏移沿一条线路运行，尚未验证自主路径规划、动态障碍重规划或生产订单调度。设备工序与载货状态随本地动画更新，其他许多温度、吞吐等指标是预设展示数据。未连接实际仓库或设备。

## 验收

核查重点：顶部入口和直达链接；保留原场景的模型与配色；昼夜切换；设备点击与镜头复位；暂停/继续；手机控件；离开后 iframe 卸载，再次进入能重新加载。构建与路由测试不能代替实际 WebGL 画面验收，实测记录在提交说明中列出。

### 2026-11-23 接入核验

- 宿主 TypeScript 检查通过；工作空间路由、iron 协议和共享结构检查的 20 项回归通过。
- 仓储自身 `vue-tsc` 检查、仓储生产构建及宿主生产构建通过，仓储入口单独分包。
- 对上游固定修订中的 55 个原文件逐字节比对，全部一致。
- 实际 HTTP 读取宿主、仓储页面、随包 GLB、MIT 许可和来源记录均为 200；GLB 文件头及嵌入子路径正确。
- 浏览器验收未完成：云端 Chromium 在进入页面之前因系统 socket 权限限制退出，没有取得 WebGL、昼夜切换或手机交互的实跑截图。需在本机按上面的项目完成操作验收。
