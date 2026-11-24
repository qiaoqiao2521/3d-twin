# 九项开放硬件接入与验收

本批范围为 ODRI、SO-101、Thor、PAROL6、OLSK Small CNC、OLSK Large CNC、Voron 2.4、Jubilee 和 OPC UA 输送与供料设备。九项均属于本仓库顶部“机器人与真实设备”工作空间，不另建 Motion 或 Earth 项目。

本轮实际执行结果、数量、原场景回归与尚未完成的项目汇总在 [交付与验收记录](hardware-acceptance.md)，资源与运动学详细记录分别为 [hardware-verification.json](hardware-verification.json) 和 [hardware-kinematics-verification.json](hardware-kinematics-verification.json)。

## 文件与显示的关系

每项都有同源 `hardware/<id>/asset.json` 和 `originals.json`。完整原件以固定提交的完整归档包提供，原始路径、每个成员的大小与可用的哈希写入索引；主要 CAD、URDF、网格、BOM、图纸和说明还可单独下载。页面明确区分“可直接读取”与“完整原件包内”。在包内的文件没有伪造一个会返回 HTML 的下载地址。

源码仓库保存固定版本、许可证副本、转换脚本、依赖锁、适配层和核验记录；大量上游原件在正常构建时取得，作为部署产物实际包含在 `dist/hardware/`。原件包在项目内可下载，外部 GitHub 链接只用于追溯。运行部署不需要访问构建缓存或 GitHub。

原件目录只读。原应用修改发生在独立工作副本；STEP 到 GLB 的结果、Xacro 展开和坐标适配单独保留来源。对原文件生成可浏览衍生物不改变、替换原 CAD。Python 转换不会把失败的曲面删掉后仍声称整机完整。

Thor 原文档中的三个 LCS 坐标系，其底层辅助几何是无限基准面。转换保留它们在原父级下的名称、矩阵、可见性与类型元数据，不把无限面冒充机械实体，也不造有限替代面；原 FreeCAD 文件和全部 1,067 个机械实体完整保留。SO-101 原 STEP 中 11 个只有坐标框架、没有曲面的 Wiring_holder 节点也原样保留为空几何节点，并明确说明上游现状。

## 九项入口与实际能力

| ID | 展示 | 保留的主要原件 | 明确的边界 |
| --- | --- | --- | --- |
| `odri` | 原 Bolt 上腿执行器子装配；原作者 Solo12、单腿与机身 eDrawings Web HTML | 完整硬件源、SolidWorks、STEP、BOM、图纸、独立网页源 | Bolt 执行器不冒充 Solo12 专属零件；不运行步态、接触动力学或电机控制 |
| `so101` | 原机械装配与原 follower / leader 关节描述 | STEP、STL、URDF、MJCF、原软件与说明 | 原伺服未公开的内部齿轮和绕组不能从外壳推断；原关节参数有作者注明的估计项 |
| `thor` | 原 FreeCAD 装配衍生展示与原 ROS 描述展开 | FreeCAD、STEP、STL、齿轮/带轮/张紧器原件、Thor-ROS 完整源 | ROS 2 / MoveIt / Gazebo 仍需原运行环境；展示不连接硬件 |
| `parol6` | 官方模型库的原关节模型与末端工具 | URDF、MJCF、网格、硬件 STL/3MF、BOM、装配及控制资料 | 硬件仓未提供完整可编辑整机 CAD；某些动力学和工具参数属于估计，不能当实测标定 |
| `olsk-small-cnc` | 原版三维装配手册与原模型 | 整机 STEP/Fusion、BOM、电气图、原应用、作者原装配说明快照 | 保留的原模型和原流程不是切削仿真、实际刀库或设备遥测 |
| `olsk-large-cnc` | 原版三维装配手册与原模型 | 整机 STEP、完整 Fusion 分卷、BOM、电气与气路图 | 上游 V3 资料与 V2 文件名 GLB 并存；H3/H5/H6/H7/H11 引用的 FirstTestHowTo.glb 在固定源和原站均缺失，保留说明并明确提示 |
| `voron-2.4` | 原 2.4r2 整机 STEP 的层级化展示 | 原 STEP、Fusion、155 个 STL、DXF、安装手册及配置 | 原微小 face 8935 按原 CAD 公差保留原内核网格，面积未认证；打印与温控未接入 |
| `jubilee` | 原整机 STEP 与换工具结构 | SolidWorks、STEP、BOM、安装资料、Science Jubilee 原控制源码 | 静态结构检查；Python 控制代码单独保留，不从页面执行真机指令 |
| `opcua-conveyor` | 原输送机和配套机械臂 CAD | STEP、Fusion、Inventor、原 Python OPC UA 服务 | 原程序为定时 PWM，没有位置编码器反馈；原文机械臂轴数不一致，不补造型号或反馈量 |

清单是各视图的准确依据：界面显示当前模型源路径、衍生格式和能力边界；不可用的转换会阻止构建，不会用外链或通用机器人代替。

## 入口、导航与手机

目录为 `?workspace=hardware`。设备链接为 `?workspace=hardware&asset=<id>&view=structure`，原件目录为 `&view=files`，来源及许可为 `&view=about`。`model=<model-id>` 固定模型选择，`file=<source-id>:<original-path>` 固定原件选择。参数通过 URLSearchParams 编码；浏览器后退、前进和刷新恢复同一个工作空间。

“结构与运动”里的模型选择框能发现每个原件展示，不只显示默认的一套。CAD 模式可旋转、缩放、选中、定位、隐藏、单独查看、恢复装配、展开结构和剖切；部件名与层级来自模型。URDF 模式按原轴、原点和限位控制关节，显示跟随关节，支持全部活动关节；没有有效限位的自由度不会被猜成安全的滑块范围。结构展开在 URDF 模式关闭，避免与关节变换叠加后误解装配。

手机提供“三维操作 / 结构层级 / 关节控制”切换与触摸目标，避免画布手势截获滚动后无法到达下面的关节面板；CAD 画布支持旋转、缩放和平移。保留原界面的宽屏应用允许横向查看，其真实触屏可用性仍需设备验收，不能仅依据 CSS 判定通过。

## 生命周期与资源

宿主按需加载当前模型，切换时取消 fetch、停止绘制、断开 ResizeObserver、移除输入监听、销毁控制器、释放几何体/材质/纹理与 Draco 工作线程，并释放 WebGL 上下文。没有场景时不会继续创建新帧；隐藏页面停止绘制。

Three 0.170 的 Draco 初始化可能在退出后才完成，并继续创建 Worker。适配层在退出时立即销毁，初始化完成后再次收尾，模型解析的 finally 另作兜底；真实 DRACOLoader 的 CPU 回归覆盖迟到 Worker、Blob URL、已有 Worker 及初始化拒绝。它验证此异步清理路径，不代表已经测量浏览器显存。

ODRI 原 HTML 与 OLSK 原应用在独立 iframe 中运行。离开页面先调用可用的原应用卸载入口、暂停媒体、退出 Pointer Lock / 全屏，再卸载整个文档。OLSK 的适配层另处理页面隐藏及原 React 根卸载。原 eDrawings 文件保持字节不变，浏览器卸载该独立文档；尚未声称测得其真实 GPU 回收结果。

新增公共资源服务对缺失的 `hardware/`、`baselines/`、`robotics_glb/` 等资源返回真正的 404，存在文件按实际字节流式返回，支持 HEAD、Range 与缓存校验。它也修复了 `R1_C%2B%2B.xml` 之类合法编码路径被 Vite 回退成 200 HTML 的问题。

## 构建环境

Node 24、npm、Git、Python 3.11+、tar/gzip 为基础依赖。`npm run install:hardware` 检测固定的 `cadquery-ocp==7.8.1.1.post1` 与 `xacro==2.1.1`；缺失时在项目缓存创建隔离环境。可通过 `HARDWARE_PYTHON` 指定已准备好的解释器。

Thor 原 `.FCStd` 装配导出还需 FreeCADCmd 1.0+ 的 App、Part 和 Import 模块，可用 `HARDWARE_FREECAD_CMD` 指定可执行程序。离线转换读取原保存几何、装配引用及放置，并从原 `GuiDocument.xml` 与 `ColorList` 取出配色，通过 FreeCAD 原生导出接口传递，不启动图形界面。上游对大小写不敏感文件名的引用，在转换工作副本中用指向同一原文件的别名修复并留证；工作副本不执行缺失的 Assembly4 / Fasteners / gears 运行时回调，原仓库和完整归档不修改。它是 CAD 导出，不等于浏览器 WebGL 验收。

首次准备会下载多 GB 原件，CAD 转换需要数 GB 内存，故重型转换串行执行。缓存命中会核对来源与转换配方，不重新下载所有内容。正常生产构建必须包含全部九项；仅开发某一项时可用 `npm run build:hardware -- <id>`，不能把这种局部输出标成完整交付。

`public/` 与 `dist/` 的大文件可用硬链接复用磁盘块，部署产物本身是普通文件；跨文件系统自动回退复制。修改适配器须先写工作副本，绝不能就地修改已发布的硬链接原件。

## 许可与署名

许可按来源和目录分别保留，不能将仓库根许可机械地套用到所有第三方内容。

| 来源 | 核实并保留的许可信息 |
| --- | --- |
| ODRI 硬件 | BSD-3-Clause |
| ODRI 官方网页 | 网站 BSD-3-Clause；原导出 HTML 中的 Dassault Systèmes 与第三方声明仍有效，未单独提取或重新许可其嵌入运行时 |
| SO-101 | Apache-2.0 |
| Thor | 仓库 README / LICENSE 的 CC-BY-SA-4.0；FreeCAD 原文档另有“All rights reserved”元数据，原样保留并记录差异 |
| Thor-ROS | 根 CC-BY-SA-4.0 与子包许可分别保留 |
| PAROL6 硬件 | CERN-OHL-S-2.0；控制板固件 GPL-3.0；第三方内容各自保留声明 |
| PAROL6 官方模型 | 模型、网格、文档 CC-BY-4.0；工具和 ROS 支持 Apache-2.0 |
| OLSK 两套机床 | 按 `.reuse/dep5`：软件 AGPL-3.0-or-later，CAD/BOM/电气资料 CERN-OHL-W-2.0，装配模型与媒体 CC-BY-SA-4.0；字体保留原许可 |
| Voron 2.4 | GPL-3.0 |
| Jubilee / Science Jubilee | 机械设计 CC-BY-4.0 / 独立控制软件 MIT |
| OPC UA 输送设备 | 上游根 MIT；缺失的 PDF / BOM 不以生成资料冒充 |

OLSK 修改版额外提供当前适配源码、固定依赖和构建方式，与完整原件包一起可重建对应应用；原 Google Sheets 装配说明固定为作者原数据快照，并记录来源、获取时间与 SHA-256。程序不再依赖每次浏览时实时请求外部表格。Large CNC 原 HowTo 菜单错误引用主装配表的适配错误也单独纠正；原源和固定快照不改变。

三份表格的公开性另行通过无账号、无 Cookie、无 API Key 的匿名 CSV 请求复核，均返回 HTTP 200；原应用的固定源码引用及作者对装配手册的 CC-BY-SA-4.0 声明一并保留在 [手册公开来源核验](../integrations/hardware/devices/verification/manual-public-access.json)。原手册中的唯一 Drive 链接按原文本保留，没有将其目标文件下载归档或重新分发；公开可读与许可来源分别记录。

SOLIDWORKS 官方说明将 Web HTML 作为 eDrawings 的导出/分享形式：[保存 Web HTML](https://help.solidworks.com/2022/english/edrawings/t_saving_files_in_edrawings_professional.htm)、[eDrawings 概述与分享](https://help.solidworks.com/2026/English/edrawings/c_eDrawings.htm)。本项目使用原作者已经发布的完整导出文件，保留其中所有声明。

## 独立控制研究中的修复

[OPC UA 操作适配研究](../research/hardware/opcua/README.md) 保留两份 MIT 原脚本及 SHA，仅独立抽取四个已核实方法进行异常传播适配。原 `initialize`、`move_and_supply`、`move_arm`、`reference_cobot` 吞掉异常后仍返回 True 的问题已纠正为失败状态；取消传播、清理错误、重叠操作与未实现分支均有故障注入测试。它不导入原服务器、不连接 asyncua / GPIO，也不执行系统关机；成功仅表示预设命令流程结束，没有把它称为实测位置反馈。原件归档保持不变。

## 已修复的旧机库问题

四处 PRIMARY 描述路径、GR1T2 型号对应、关节同名歧义、移动关节姿态及完整关节发现已检查；不按遍历顺序随意挑一个同名网格。14 个原 GLB 的 510 个解析关节可精确绑定，289 个活动关节做了 CPU 变换和归位检查。该检查不会声称原模型的惯性数据已经通过真机辨识。

档案索引现包含 1,175 个描述项和 1,538 个文档项，其中 60 个旧索引文件缺失、31 个描述属于历史合成、3 个属于适配、63 份属于本地导览。它们已在界面区分。历史合成文件不会冒充原件，缺失文件不会补成通用模型。原归档本来未包含所有上游网格，因此它不是完整 ROS / MuJoCo 安装。

两项既有赤星测试失败修正的是测试夹具：碰撞检查改用实际地图障碍，Queen 检查先走原状态机完成继电器和连续驻守，再验证攻击，另保留未解锁时拒绝召唤断言。没有修改游戏规则以迎合测试。

## 验收命令与当前限制

运行根 README 列出的安装、类型检查、测试和生产构建，再执行 `verify:hardware -- --dist --serve`，逐项验证完整原件包、单独原件、展示资源、模型节点、URDF 网格引用、原应用静态依赖、真实 HTTP 字节和深链接。`verify:robotics -- --preview` 检查已有档案和模型。

STEP 回归使用具有非零原点的 1000 × 2000 × 3000 mm 原 CAD，验证输出米制和世界坐标：Z 向上转 Y 向上后的跨度应为 X=1、Y=3、Z=2 m，另验证原部件名和材质颜色。记录在 `integrations/hardware/devices/verification/unit-axis.json`。这避免单位缩放错误和重复旋转坐标轴。

SO-101 的有效非锥顶面与 Voron 的有效锥顶面分别采用受限的原曲面后备三角化。只有原曲面类型、原边界、完整周期和拓扑符合对应条件才启用；检验曲面偏差、面积、法向、三角内部与边界，原 CAD 哈希不变。Voron 的三个永久真实面回归记录在 `integrations/hardware/devices/verification/voron-apex-cones.json`，每面 66 个三角形、最大采样偏差约 0.001699 mm；这些单面结果不能单独替代整机全部面的验证。

完整周期、圆周分段的圆锥台另有严格后备；细薄平面优先使用原 OCCT 的更细网格，并核对自适应原面积与实际三角面积。已闭合的待修复原面采用 0.5% 面积误差门槛。

唯一单独处理的是固定 Voron 原 STEP 的 face 8935：其两条原参数边界在端点依靠原顶点/边容差接合，物理域宽度小于这些原公差，负的有符号面积不能取绝对值后冒充精密无符号面积。此面保留原内核四个三角形，核验原公差和实际三维采样偏差，不补造封边、不修改原曲面，也不计作 0.5% 面积认证通过。审计绑定固定 STEP SHA 与原面身份，其他未知情况仍失败；结果单列为 `nativeToleranceLimitedFaces`。设备“来源与能力”页提供真实精度报告链接及限制说明。

浏览器验收尚未完成：连接的浏览器缺少可用上下文；备用浏览器访问工作区本地预览返回 `ERR_CONNECTION_REFUSED`。因此 WebGL 真实画面、镜头操作、触屏、音频、反复切换后的显存与内存占用均未标为通过。

可用浏览器后的验收顺序：从正常顶部入口打开九项，逐个选择全部展示；确认原结构/材质/层级，操作 CAD 选择与恢复、所有 URDF 关节与原版装配按钮；检查原件包、关键 CAD 和图纸下载；测试目录返回、后退前进、深链接刷新；以手机检查手势与面板；反复切换并记录 WebGL context、音频、网络、CPU 与内存；最后回归原机器人、Smart Warehouse、汽车和三个工厂场景。每项保存具体设备/浏览器和观察结果，不能只填写“构建成功”。
