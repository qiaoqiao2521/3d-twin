# 既有机器人机库与档案修复记录

本记录对应 2026-11-24 对既有机库的修复。原有 14 个机库 GLB 保持原字节，原模型层级与几何体继续使用；本轮修正描述文件选择、关节绑定、档案发现和能力标注。新增的九套真实设备由独立 `hardware` 工作区维护，不与这 14 个既有机库入口混算。

## 已修复的问题

| 入口 | 原问题 | 当前使用的描述文件 |
| --- | --- | --- |
| Cassie | 选中了历史生成的通用链，节点与 GLB 不匹配 | `cassie_description/_首选基准原件_PRIMARY/cassie_v4.urdf` |
| ANYmal C | 选中了历史生成的通用链 | `anymal_c_simple_description/_首选基准原件_PRIMARY/anymal.urdf` |
| Baxter | 选中了历史生成的通用链 | `baxter_common/_首选基准原件_PRIMARY/baxter.urdf` |
| Stretch | 选中了历史生成的通用链 | `stretch_description/_首选基准原件_PRIMARY/stretch.urdf` |
| Fourier GR1 | GR1T1 描述与现有 GR1T2 GLB 混用 | `Wiki-GRx-Models-FourierN1/GRX/GR1/gr1t2/basic_urdf/gr1t2.urdf` |

以上路径在 `public/baselines/` 下各自分类目录内，完整路径、文件大小和 SHA-256 见 [robotics-archive-status.json](./robotics-archive-status.json) 的 `selectedSources`。这里的“既有归档”不等于已重新核实每个上游仓库的固定提交、完整资源与再分发许可；历史来源未闭合的部分继续明确保留这一边界。

RexROV2、BlueROV2 和 Z1 当前参与绑定的描述文件是既有本地展开或补充版本，界面与清单均标为“本地适配”，不再作为逐字节上游原件展示。全量档案内另保留其他既有来源文件。

关节绑定使用 GLTFLoader 的节点关联信息恢复 GLB 原始节点名，要求与 URDF 子 link 精确匹配；出现同名 link 组和 visual 网格时，再以 URDF 指定的精确父 link 消歧。无法唯一确定的节点不绑定，避免依遍历顺序或近似字符串误绑。移动关节不再截断为前 16 项，支持对完整名称、父 link、子 link 搜索。滑动关节按关节坐标系旋转后的轴平移，旋转关节保留原节点基准姿态。

这些能力属于本地运动学预览。既有程序化动作、FK/IK、推力与热力效果不代表真机传感、实测力矩、接触求解、闭环传动或减速器仿真；相应说明与力矩示意标签已明确区分。

## 全量档案与历史合成文件

`scripts/generate_all.mjs` 现仅从实际磁盘原件与历史总清单生成索引，不再生成 URDF、MJCF、图片或预览替代物，也不下载不明来源的“补件”。可用下列命令检查索引是否与当前文件一致：

```sh
node scripts/generate_all.mjs --check
```

当前可发现范围与状态如下，数字来自可重新生成的 [robotics-archive-status.json](./robotics-archive-status.json)：

| 项目 | 数量 | 解释 |
| --- | ---: | --- |
| 来源条目 | 39 | 原有机器人档案分类 |
| 运动描述索引 | 1,175 | 包含 URDF、Xacro、MJCF/XML 与 PRIMARY 文件 |
| 文档索引 | 1,538 | 包含历史说明、图像与本地导读 |
| 实际可读运动描述 | 1,175 | 含下列已标记的合成或适配文件，不等于全是上游原件 |
| 实际可读文档 | 1,478 | 以磁盘存在和 HTTP 字节核验为准 |
| 历史缺失文件 | 60 | 55 PNG、4 JPG、1 TXT；界面列出缺失原因，不发起伪原件请求 |
| 历史合成描述 | 31 | 单独标记，保留历史内容供追溯 |
| 当前机库适配描述 | 3 | RexROV2、BlueROV2、Z1 |
| 本地生成文档 | 63 | 与原始上游文档区分 |

31 个已识别的历史合成描述只补充、纠正 XML 注释，保留原有生成链与数值；注释包含 `LOCAL_GENERATED_DEMONSTRATION_NOT_UPSTREAM`，并去除“现实基准原件”等不准确表述。它们不会替代可用 PRIMARY 原件。其他既有源文件与所有机库 GLB 没有被重建或覆盖。

缺失的 60 个文件目前缺少可逐项确认的固定历史版本与许可证据，本轮没有以近似图片、其他版本或新生成文件冒充恢复。档案界面会显示“缺失”，而不是把服务端返回的首页 HTML 当成原件。

档案目录显示完整文件列表，可搜索原路径、查看文本或图片并打开完整文件；不再将原文截断为 120,000 字符。非 MuJoCo 的普通 XML 不标为可运行 MJCF。HTTP 服务对缺失资源返回 404，对中文、空格和 `R1_C++.xml` 等名称保留原字节。

## 进入、刷新与历史导航

从主界面的“现实工程”进入机库，再选机器人或“原始档案”。机库选择、工程子页、来源仓库与档案文件分别通过 `robot`、`engineeringTab`、`baselineRepo`、`baselineFile` 查询参数保存。

示例：

```text
/?mode=hangar&robot=fourier_gr1&engineeringTab=hangar_3d
/?mode=hangar&robot=cassie_biped&engineeringTab=urdf_explorer&baselineRepo=cassie_description&baselineFile=_首选基准原件_PRIMARY%2Fcassie_v4.urdf
```

实际顶层工作区参数以主导航生成的地址为准；机库只更新自身参数，保留父工作区和其他查询项。按钮操作写入浏览器历史，`popstate` 直接恢复选择状态，不用同步 effect 再写回 URL。不存在的机器人、来源或文件按已知索引回退，用户输入的任意路径不会成为请求目标。

WebGL 创建失败时保留 HTML 导航和档案入口，显示真实错误与重试按钮；不会显示假的三维占位体验。正常退出机库时释放输入监听、控制器、动画帧、渲染资源、WebGL context 和 canvas。此容错与清理已通过类型检查，真实 GPU、触屏和浏览器内存回收仍需实机验收。

## 验证结果与复验方法

验证环境：Node `v24.22.3`。定向纯逻辑测试 19 项通过，TypeScript `npm run lint` 通过。核心验证器读取真实 GLB，并实际解码所有几何 primitive，包括 Draco；不会仅检查文件名或 JSON 声明。

```sh
node --test src/utils/manifestUtils.test.ts src/utils/jointBinding.test.ts src/utils/roboticsRoute.test.ts scripts/robotics-archive.test.mjs
npm run lint
npm run verify:robotics
npm run verify:robotics -- --serve
# 完成根项目生产构建后，再核验真实生产预览服务：
npm run verify:robotics -- --preview
```

`--serve` 启动项目实际 Vite 开发服务，`--preview` 启动实际生产预览，执行完毕自动关闭。也可用 `--base=http://127.0.0.1:5197` 指向已运行的服务。无 HTTP 参数时仅执行磁盘、原几何和 CPU 关节检查。最后一次报告写入 [robotics-verification.json](./robotics-verification.json)，以其中 `http.kind` 区分开发与生产验证。

本轮机器人专项先完成实际开发服务验证，随后在根项目完整构建后完成实际生产预览验证；两次均为 2,684 个 HTTP 请求、101,601,319 字节，实际资源与磁盘 SHA-256 一致。请求涵盖可读档案、14 个 GLB、14 张预览图、缺失资源的预期 404，以及对真实 `R1_C%2B%2B.xml` 的独立回归。当前报告的 `http.kind` 为 `Vite production preview`；完整结果见 [交付与验收记录](hardware-acceptance.md)，浏览器视觉保持未验收。

| 机器人 | 精确绑定关节（含固定） | CPU 往返活动关节 |
| --- | ---: | ---: |
| SAR | 19 | 16 |
| RexROV2 | 15 | 14 |
| BlueROV2 | 7 | 7 |
| Unitree G1 | 53 | 43 |
| Unitree Go2 | 41 | 12 |
| Unitree Z1 | 9 | 7 |
| Unitree H1 | 51 | 45 |
| Unitree B2 | 36 | 12 |
| Fourier GR1T2 | 36 | 32 |
| TALOS | 59 | 44 |
| Cassie | 16 | 16 |
| ANYmal C | 77 | 12 |
| Baxter | 48 | 15 |
| Stretch | 43 | 14 |
| 合计 | 510 | 289 |

CPU 验证检查名称与父子关系、非空解码几何、关节限位数值、有限变换、施加运动后矩阵变化及恢复原姿态，并确认测试前后的原 GLB SHA-256 一致。它不验证像素、材质观感、触屏、音频、GPU 内存释放、动力学、机械负载或真机控制。浏览器视觉验收在本专项报告中保持 `not-run`。

## 历史转换脚本与可维护性

三个旧转换入口 `compile_batch_robotics_glbs.mjs`、`compile_real_cad_glbs.mjs`、`rebuild_missing_and_index_glbs.mjs` 不再依赖原作者机器上的 `/home/...` 或 `/tmp/repos/...`。原始 checkout 通过 `ROBOTICS_SOURCE_ROOT` 指定，默认使用本项目 `.cache/robotics-upstream/`；目录内需要按脚本声明的仓库名保留完整模型与依赖网格。

缺少必要原件时立即报错，不跳过丢失视觉件，也不生成通用链来补齐。本轮只验证了这些历史转换脚本的语法与路径约束，未重跑整套转换，既有 GLB 保持不变。历史转换使用的全部上游版本仍需要另行固定，不能将这一入口标为完整、版本闭合的原件重建流水线。

## 顺带纠正的两项旧 Mars 测试夹具

两项既有失败均来自测试夹具与当前规则不一致，游戏引擎没有改动：碰撞测试曾对两张地图都使用 Jezero 障碍与地面高度，现改为实际地图的障碍和地面采样，保留停止、滑移、速度与步态断言；Queen 测试曾在 relay 阶段直接召唤，现先断言该阶段拒绝召唤，再走原任务状态机的中继与连续 8 秒站稳规则，保留原 Boss 攻击、酸液、护盾、弓与近战断言。

```sh
npm exec --yes --package=bun@1.3.3 -- bun test src/utils/marsCombatEngine.test.ts src/utils/marsPolarMission.test.ts
```

上述两文件共 18 项通过。全仓最终测试结果由根项目发布记录汇总，不能由本专项测试数字替代。
