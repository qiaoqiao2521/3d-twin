# 九项真实结构接入：本轮交付与验收记录

本轮已实现九项设备的本地目录、25 个模型或原应用入口、15,743 个原始文件索引和 13 份固定提交的完整原件归档，并修复已发现的宿主、旧机器人机库和转换问题。安装、类型检查、单元测试、完整生产构建、几何/运动学与生产 HTTP 验证通过。**浏览器视觉、真实手机操作、音频、显存/内存释放和真实设备控制未完成验收。**

测试基于 main 的 `34108d40e7af2ffc54531a792f3cf857e2cc2a95` 加本轮工作区改动，保留该远端提交将默认开发/预览端口改为 `5197` 的调整。实际环境为 Node.js 24.22.3、npm 11.19.1、Bun 1.3.3；Python CAD 与 Xacro 版本见接入说明。机器可读汇总见 [hardware-acceptance.json](hardware-acceptance.json)。

## 从哪里进入

正常顶部导航为“机器人与真实设备”，目录是 `http://localhost:5197/?workspace=hardware`。每项均有“结构与运动”“原始文件”“来源与能力”，可返回目录，模型和文件选择写入深链接，后退、前进和刷新沿用同一状态。浏览器实际操作仍在待验收清单中。

| 设备 | 深链接参数 | 本地模型或应用 | 原始文件 / 完整归档 |
| --- | --- | --- | --- |
| ODRI | `?workspace=hardware&asset=odri` | 原执行器 CAD 衍生网格，原 Solo12、单腿和机身网页，共 4 项 | 3,874 / 2 |
| SO-101 | `?workspace=hardware&asset=so101` | 原整机 CAD 与四套原 URDF，共 5 项 | 241 / 1 |
| Thor | `?workspace=hardware&asset=thor` | 原 FreeCAD 完整装配衍生网格、原 ROS 描述，共 2 项 | 402 / 2 |
| PAROL6 | `?workspace=hardware&asset=parol6` | 官方六套原 URDF 与不同末端工具 | 9,361 / 2 |
| OLSK Small CNC | `?workspace=hardware&asset=olsk-small-cnc` | 原三维装配应用、原整机模型，共 2 项 | 147 / 1 |
| OLSK Large CNC | `?workspace=hardware&asset=olsk-large-cnc` | 原三维装配应用、原整机模型，共 2 项 | 129 / 1 |
| Voron 2.4 | `?workspace=hardware&asset=voron-2.4` | 原 STEP 整机衍生网格 | 211 / 1 |
| Jubilee | `?workspace=hardware&asset=jubilee` | 原 STEP 整机衍生网格，包含工具更换结构 | 1,329 / 2 |
| OPC UA 输送与供料 | `?workspace=hardware&asset=opcua-conveyor` | 原输送机、原配套机械臂 CAD，共 2 项 | 49 / 1 |

25 项由 **9 个 GLB 结构展示、11 个 URDF 视图、5 个原应用入口**组成。完整源归档、源路径索引、关键 CAD / 网格 / 图纸、许可证均由本项目同源发布；未单独展开的文件明确指向完整原件包。Git 保存固定版本、适配源码、依赖锁、许可证和可重复构建配方；多 GB 原件在正常构建中取得并实际包含在 `dist/hardware/`，不依赖运行时访问构建缓存。

## 已执行的验证

下列命令均实际执行并成功退出，不将多个命令的重叠用例相加成一个独立用例总数。

| 检查 | 本轮实际结果 |
| --- | --- |
| `npm ci --no-audit --no-fund` | 通过，包含既有 postinstall |
| `npm run lint` | TypeScript 通过 |
| `npm exec --yes --package=bun@1.3.3 -- bun test` | 34 个文件，191 通过，0 失败 |
| `npm run test:hardware` | 28 通过，0 失败 |
| `npm run test:hardware:cad` | 39 通过，0 失败；包含真实原曲面、原公差及拒绝不满足条件输入的回归 |
| `npm run test:hardware:opcua` | 8 通过，0 失败；故障注入，不连接硬件 |
| `npm run test:warehouse` | 32 通过，0 失败 |
| `npm run test:open-demos` | 12 通过，0 失败 |
| `npm run build` | 完整执行汽车、智慧仓储、三个工厂应用、九项硬件及宿主生产构建 |
| `git diff --check` | 通过 |

生产构建保留原应用的独立技术栈，未强制与宿主统一 Three.js。共享 Three.js 和旧 TwinWorkbench 仍有 Vite 大 chunk 提示，构建成功不表示手机性能已经验收。

原许可证、原 OPC UA 脚本和原 CAD 曲面测试记录保留各自字节及原有空白；`.gitattributes` 为这些明确路径关闭文本换行归一化和空白格式检查，原 BRep 记录按二进制数据对待。宿主与适配代码仍执行正常格式检查，没有为通过检查而重写原件。

### 新硬件：实际资源与运动学

`npm run verify:hardware -- --dist --serve --report=docs/hardware-verification.json` 实际通过生产预览 HTTP 读取资源并核对 SHA-256，包含完整原件包、单独原件、原应用、模型、许可、Draco 解码器和深链接。

合计 **1,991 次 HTTP 请求**，其中包括 27 个宿主路由和 9 个预期的缺失资源 404 检查；其余 1,955 个实际资源响应核对了 **5,393,039,085 字节**。字节总量不包含宿主 HTML 路由和缺失探针响应体。没有把预期 404 计成 200，也没有把 HTTP 200 当成 WebGL 已渲染。详见 [硬件资源与 HTTP 报告](hardware-verification.json)。

`npm run verify:hardware:kinematics -- --dist` 使用实际 URDFLoader 与 STL / OBJ / Collada 解码器，通过 9 份清单、11 套 URDF、167 个真实网格、3,083,753 个三角形；核验 72 个独立驱动关节、10 个跟随关节，完成 216 次运动检查、132 次限位检查、340 次跟随检查和 72 次归位检查。详见 [实际 URDF 运动学报告](hardware-kinematics-verification.json)。这些是 CPU 几何与变换验证，不是接触动力学或真机标定。

### 已有场景回归

| 范围 | 本轮实际结果 | 记录 |
| --- | --- | --- |
| 旧机器人机库 | 14 个原 GLB；510 个精确关节绑定、289 个活动关节 CPU 变换；2,684 次 HTTP 请求、101,601,319 字节 | [机器人验证](robotics-verification.json) |
| Smart Warehouse | 55 个原文件与固定提交一致；10 个生产 HTTP 检查；原 GLB 4,039,312 字节、831 节点、825 mesh、42 材质 | [既有场景 HTTP](../integrations/hardware/devices/verification/existing-scenes-http.json) |
| Warehouse Journey / WareTwin / RFTwin | 分别 47 / 18 / 22 项资源，87 项实际 HTTP SHA-256 全部一致；另有 11 个路由，共 98 项检查 | 同上 |
| 汽车与 V8 | 34 个资源 HTTP 200，9,862,908 字节；2 个有效汽车 GLB 与 14 个本地 V8 addon | [汽车 HTTP](automotive-http-verification.json) |

旧机器人 HTTP 请求包括缺失档案的预期 404；`local/live` 工厂路由返回宿主页面也不表示后台或设备已连接。本轮未运行汽车浏览器 smoke 脚本。

## 已修复的问题

宿主修复合法编码文件路径返回 SPA HTML、缺失资源伪 200、退出后 Draco 初始化迟到仍创建 Worker、模型切换时迟到异步结果和手机画布阻挡面板滚动等问题。按需装载与销毁保留原应用隔离，代码级清理回归已经执行，实际 GPU/音频释放仍待观察。

旧机库修复 Cassie / ANYmal / Baxter / Stretch 的 PRIMARY 路径、GR1T2 对应关系、同名节点歧义、移动关节原轴变换和只显示前 16 个关节的问题；完善档案状态与历史导航。停止用通用模型补造缺失原件，31 份历史合成描述和 3 份适配描述明确标记，14 个既有 GLB 保持原字节。

CAD 转换修复原单位/轴向适配、Jubilee 倒置方向、Thor 原引用大小写和缺失插件回调导致的读取失败，以及部分有效原锥面无法被默认网格器处理的问题。Thor 的 1,067 个原机械实体保留；Jubilee 四个原机脚的位置与原装配矩阵核对通过。转换只生成衍生物，完整归档内的 CAD 不变。

OLSK 原说明与字体、Draco 资源改为固定同源资源，修复 HowTo 重挂载重复菜单及 Large 菜单错表；修改版对应源码另行提供下载。OPC UA 原脚本保持不变，独立研究适配器纠正异常后仍返回成功的逻辑，未运行原 GPIO 或设备服务。

OLSK 三份原装配说明表另做公开来源复核：匿名请求不带账号、Cookie、Authorization 或 API Key，均返回 CSV HTTP 200；固定上游的 README 明确将装配手册和说明文字按 CC-BY-SA-4.0 发布。来源代码、匿名响应哈希、快照比较及原链接范围见 [手册公开来源核验](../integrations/hardware/devices/verification/manual-public-access.json)。

## 仍需明确保留的限制

OLSK Large 原 H3 / H5 / H6 / H7 / H11 指向的 `FirstTestHowTo.glb` 在固定上游及原站缺失。原说明和导航保留，并明确提示缺图；Small 对应的作者原占位模型也没有冒充完整功能。

Voron 原 face 8935 的细薄边界依赖原 CAD 自身公差接合。它保留原内核 4 个三角形、6 个节点，通过原公差采样审计，**面积未认证，也未证明整个曲面域的误差上界**；单独列入 `nativeToleranceLimitedFaces`，不混入普通闭合面的 0.5% 面积核验。原 face 9004 为明确记录的数值退化面，没有冒称已产生显示三角形。实际来源、固定策略和精度报告可从设备“来源与能力”读取。

SO-101 原 STEP 的 11 个 Wiring_holder 原本没有曲面，保留其框架与层级；Thor 的 3 个无限基准面保留原节点与元数据，不用虚构有限面替换。Thor 根 CC-BY-SA-4.0 与原 FreeCAD “All rights reserved”元数据差异保留披露，未声称原作者已澄清。

旧机器人档案仍有 60 个原索引条目缺失，界面与 HTTP 均如实标记。关节滑块、结构拆解、原装配说明和原控制源码都不代表已接入设备反馈、碰撞动力学、步态、切削或打印控制。

连接的浏览器缺少可用上下文，备用浏览器访问工作区预览返回 `ERR_CONNECTION_REFUSED`，因此未完成 WebGL 视觉、真实移动触屏、镜头/音频、反复切换后的 GPU 和内存测量。也未验证公开站点部署。提交 main 与这些验收分别记录，不能相互代替。后续具体操作步骤见 [硬件接入说明](hardware-integration.md#验收命令与当前限制)。
