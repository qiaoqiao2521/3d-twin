# 仓储与工厂行为研究边界

完整原版体验与行为研究分开维护。本轮宿主只负责目录、来源选择、路由和生命周期，原应用继续管理相机、渲染和业务状态。没有建立额外 Agent 编排平台，也没有把三个原引擎合并成第二套调度器。

## 三种不同计算能力

| 场景 | 行为来源 | 可研究接口 | 不能声称具备 |
| --- | --- | --- | --- |
| Warehouse Journey 3D | 原包裹流程、场景阶段与场内交通时间轴 | 当前阶段、播放/暂停/重放、观察目标、原运动检查 | 真实 WMS、通用 AGV 调度、外部设备控制、刚体碰撞求解 |
| WareTwin Local | 原 `simulation/engine.ts`、`rules.ts`、`astar.ts` 与 `runner.ts` | 引擎步进、机器人/任务状态、路径规划、暂停/倍速、统计快照 | 与 Python 引擎每个中间状态严格一致、真实机器人传感器、实仓约束已标定 |
| WareTwin Backend | 原 FastAPI 模拟引擎与 FULL/PATCH/HEATMAP 协议 | 版本化完整快照、基准 tick 增量、任务/决策/拥堵记录、原 API 命令 | 物理机器人安全控制、工业实时保证、无密钥时真实 LLM 能力 |
| RFTwin Local Demo | `state/demo.ts` 播放 `public/demo` 中的确定性 fixture | 播放时钟、原快照/事件应用、AMR 插值、质检图片及原面板 | 浏览器重新计算工厂生产规则、实时后台、通过回放执行生产命令 |
| RFTwin Backend | `packages/domain_factory/engine.py` 和各领域模块 | 权威 run/seq/sim_time、生产事件、AMR、能耗、合成检测、暂停/恢复、故障场景 | 实厂数字孪生标定、真实视觉准确率、可部署到硬件的机器人闭环控制 |

固定原文件与版本见 [来源记录](../integrations/open-demos/SOURCE.md)。RFTwin 的 `inspector.meta.json` 明示训练与评估来自合成零件图；回放和后台使用相同 wire schema，并不意味着回放具有后台的实时计算能力。

## 后续复用建议

优先从记录和回放接口入手，而不是把 Three.js 对象当作调度状态。研究用适配器可读取 `{source, runId, tick/seq, simTime, entities, tasks, events}`；保持原实体 ID 和单位，并记录它来自预设流程、本地引擎、后台实时还是 fixture。来源状态变化应成为研究记录的一部分，不在后台失联时悄悄把回放结果当成实时观测。

动作命令可按原系统分别整理为暂停、继续、倍速、选择观察目标、创建模拟任务和注入模拟故障。先使用原 API 的参数校验和审计，尤其保留 RFTwin 的控制序号以及 WareTwin 的 base tick 校验。当前仓库的统一宿主没有暴露跨场景调度 API，这些仍是待独立实验的接口建议。

对于 AGV，应分别评估图路径、路口预留、拥堵与电梯规则、离散步进和渲染插值。动画里没有穿模，不等于刚体碰撞已经计算；任务统计一致，不等于现实设备具备安全保证。Journey 的原运动检查验证预设几何与时间轴；WareTwin 的 A* / 规则与 RFTwin 的 AMR / traffic 测试验证各自模型语义，三者证据不可互换。

## 验证与后续实验

Journey 提供原周期运动检查；两个后台可通过真实 HTTP / WebSocket 检查确认时间推进及消息来源。原作者前端/后台测试随固定源码保留，本轮实际执行结果记入 [接入验收说明](open-warehouse-demos.md)。

后续可在独立研究脚本中记录相同种子与参数下的任务吞吐、队列长度、拥堵占比、恢复时间，比较原后台导出的运行记录；不要为测量改写冻结场景，不将新实验默认接管可用演示。现有 Smart Warehouse 的独立 AGV 研究仍使用 `npm run study:warehouse`，它没有替代原仓储物流循环。
