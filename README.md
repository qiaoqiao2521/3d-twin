# 3D 孪生 · 机器人、真实设备与原版场景

规范仓库：[qiaoqiao2521/3d-twin](https://github.com/qiaoqiao2521/3d-twin)。原仓库名为 `digital-twin-and-robotics-baseline`。

项目保留已有机器人机库、智慧仓储、汽车与工厂应用，并新增十项硬件的结构展示和完整原件入口。原始文件、CAD 衍生网格、关节运动学、原版装配应用和未连接的控制能力分别说明；工程展示不代表真机测量或动力学验收。

## 启动与构建

使用 Node.js 24、npm、Git、Python 3.11+。CAD 转换固定 `cadquery-ocp==7.8.1.1.post1`，Xacro 展开固定 `xacro==2.1.1`；Thor 完整装配另需 FreeCADCmd 1.0+，可通过 `HARDWARE_FREECAD_CMD` 指定程序，详见 [机器人构建说明](integrations/hardware/robots/README.md)。

```sh
npm ci
npm run install:hardware
npm run dev
```

默认开发与预览端口沿用最新 main 的 `5197`。开发服务启动后，设备目录为 `http://localhost:5197/?workspace=hardware`。

`npm run dev` 与 `npm run build` 在启动前准备汽车、智慧仓储、三个原版工厂应用及十项硬件。首次运行会下载固定版本的完整原件，并执行 CAD 转换，耗时与磁盘占用明显高于普通网页项目。后续使用本地缓存。缺失资源、转换失败或未满足的依赖会使构建失败，不会静默省略某一项。

```sh
npm run lint
npm run test:hardware
npm run test:hardware:cad
npm run test:hardware:opcua
npm run test:warehouse
npm run test:open-demos
npm run build
npm run verify:hardware -- --dist --serve
npm run verify:hardware:kinematics -- --dist
npm run verify:robotics -- --preview
npm run verify:warehouse -- --dist --serve
npm run verify:open-demos -- --dist --serve
```

完整单元测试使用 `bun test`；本轮执行版本为 Bun 1.3.3，可用 `npm exec --yes --package=bun@1.3.3 -- bun test`。生产构建输出 `dist/`，其中原件是可独立部署的普通文件，不依赖运行时访问下载缓存。相同文件系统使用硬链接节省构建空间，跨文件系统自动复制。

## 正常界面与深链接

| 正常入口 | 深链接 | 实际内容 |
| --- | --- | --- |
| 机器人与真实设备 | `?workspace=hardware` | 十项硬件目录、结构展示、关节和原始文件 |
| 现实工程 | `?mode=hangar` | 已有机器人机库与完整档案索引 |
| 智慧仓储 | `?mode=warehouse` | Smart Warehouse 原场景 |
| 汽车整车 · V8 | `?mode=automotive` | 汽车拆解与独立 V8 工作台 |
| 仓储与工厂场景 | `?workspace=open-demos` | Warehouse Journey、WareTwin、RFTwin |
| iron · 虚拟角色 | `?mode=iron` | 独立虚拟角色应用，需要配置其站点 |
| 实验菜单 | `?mode=sandbox` / `?mode=mars_combat` | 原动作沙盒与赤星战区 |

### 十项真实结构

所有设备均从顶部“机器人与真实设备”进入。下表链接附加 `&view=files` 可直达原件目录，附加 `&view=about` 可查来源与能力；文件选择和模型选择会保留到浏览器历史及刷新后的 URL 中。

| 设备 | 入口参数 | 原件与展示形式 |
| --- | --- | --- |
| ODRI | `?workspace=hardware&asset=odri` | 原执行器设计、官方独立 CAD 网页、单腿和 Solo 装配；完整原硬件包 |
| SO-101 | `?workspace=hardware&asset=so101` | 原整机 STEP 展示、四套原 URDF 关节模型及原 MJCF 文件 |
| Thor | `?workspace=hardware&asset=thor` | 原 FreeCAD / STEP / STL、原 ROS 2 描述及衍生展示 |
| PAROL6 | `?workspace=hardware&asset=parol6` | 官方原 URDF / MJCF、末端工具、硬件模型、BOM 与装配资料 |
| OLSK Small CNC | `?workspace=hardware&asset=olsk-small-cnc` | 原版装配应用、整机 CAD、BOM、电气图 |
| OLSK Large CNC | `?workspace=hardware&asset=olsk-large-cnc` | 原版装配应用、整机 CAD、Fusion 分卷、电气与气路图 |
| Voron 2.4 | `?workspace=hardware&asset=voron-2.4` | 原整机 STEP 转换展示、Fusion、STL 和安装手册 |
| Jubilee | `?workspace=hardware&asset=jubilee` | 原整机 STEP 转换展示、SolidWorks、BOM、工具更换结构与独立控制源码 |
| OPC UA 输送与供料 | `?workspace=hardware&asset=opcua-conveyor` | 原输送机及配套机械臂 CAD、原 Python 服务源码 |
| 安川 MA2010 + D500B | `?workspace=hardware&asset=motoman-weld` | 原厂 ROS 模型、六轴与两轴独立展示、示例组合工位 |

完整原件包在同源 `hardware/<id>/originals/` 提供下载，逐文件索引保留原路径。主要 CAD、URDF、网格、图纸和说明还可单独读取；未单独展开的文件明确显示“完整原件包内”。原件不被转换结果替换，页面也不会把源代码链接算作运行中的模型。

详细来源、许可证边界、安装依赖、转换方法与验收步骤见 [硬件接入说明](docs/hardware-integration.md)。本轮的实际测试、完整生产构建、资源与运动学结果、未完成验收见 [交付与验收记录](docs/hardware-acceptance.md)。固定来源在 [机器人清单](integrations/hardware/robots/sources.json) 与 [设备清单](integrations/hardware/devices/sources.json)。

安川本次新增代码以固定上游提交为准，组合工位仅为运动学示例。单独准备：`node scripts/build-hardware.mjs motoman-weld`，验收：`node scripts/verify-hardware-kinematics.mjs --asset=motoman-weld`。当前提交尚未执行完整联网构建或浏览器验收，详见 [首批工业设备接入](docs/industrial-twins-wave1.md)。

## 已有机器人机库的修正

Cassie、ANYmal、Baxter、Stretch 改为读取已有 PRIMARY 描述；Fourier GR1 关节描述与原 GLB 的 GR1T2 型号保持一致。关节匹配依据原节点身份和明确的父子关系，不按相近名称猜测，移动关节按原轴和原点变换。全部关节均有可发现入口，机型、页签和档案选择支持深链接与浏览器历史。

旧生成脚本不再补造通用圆柱机器人冒充“原件”。完整档案索引标明原归档、适配、本地导览、历史合成和缺失状态；缺失文件保持缺失，并返回 HTTP 404。旧档案不是包含每台机器人全部网格与第三方依赖的完整上游克隆，URDF / MJCF 文本阅读也不等于已经启动对应仿真器。

本轮核验记录：[档案状态](docs/robotics-archive-status.json)、[模型与关节验证](docs/robotics-verification.json)。旧说明中“100% 原厂工程真值”“全套资源齐全”等笼统说法已撤回；[历史原文](docs/history/README-2026-11-09.md) 仅供追溯。旧个人绝对目录不再是当前构建前提。

## 保留的原版场景

Smart Warehouse 保持独立 Vue / Three.js 应用与原场景。其原文件、资源、退出释放和 AGV 独立研究见 [智慧仓储说明](docs/smart-warehouse.md)。

Warehouse Journey、WareTwin 与 RFTwin 固定上游提交，分别安装构建，以独立 iframe 按需启动和销毁。Journey 为原预设流程，WareTwin 提供原浏览器实时引擎与 Python 后台，RFTwin 提供原 Local Demo 回放与 Python 工厂后台。具体见 [原版工厂场景](docs/open-warehouse-demos.md) 与 [行为研究](docs/warehouse-behavior-research.md)。需要后台时运行 `npm run start:waretwin` / `npm run start:rftwin`，再用 `npm run verify:demo-backends` 验证协议。

汽车场景保留两款许可汽车的拆解与独立 5.7L V8 动作、剖面和控制，见 [汽车整合说明](integrations/automotive/README.md)。虚拟角色、示意仪表与受力配色的边界见 [iron 工作空间说明](docs/iron-workspace.md)。

## 验收边界

源文件哈希、CAD 单位与坐标、几何资源闭合、关节 CPU 变换、类型检查、单元测试、生产构建和真实 HTTP 返回分别留证。它们不能代替真实浏览器里的 WebGL 画面、触屏操作、音频与显存释放验收。当前浏览器连接无法访问工作区预览，这几项保持未完成；没有把构建通过写成实机验收通过。
