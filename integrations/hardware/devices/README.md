# 原始机械设备接入

这里提供五项原作的固定来源、完整原件索引、独立构建配方和显示转换。OLSK Small / Large CNC 使用原作者的 React 装配应用及其原模型；Voron、Jubilee、OPC UA 教学输送设备使用原 STEP 整机装配，不以参数化积木替代真实结构。

运行时所有必需模型、装配说明、字体和 Draco 解码器都由本站提供。原工程的完整压缩包也在本站；大二进制不写入本仓库 Git，而由固定版本、完整树清单和归档 SHA-256 自动恢复。没有原件、哈希不匹配、依赖安装失败、原应用构建失败或原 CAD 非退化面无法网格化都会中止构建。

## 固定来源

| 设备 / 来源 | 精确提交 | 原始主要展示文件 | 原件粒度与许可 |
| --- | --- | --- | --- |
| [OLSK Small CNC](https://github.com/Open-Lab-Starter-Kit/OLSK-Small-CNC) | `cae066fa5b78b596743e1f2e432b93539cba8c24` | `Assembly_Manual/`；`OLSK_Small_CNC_V3_All_In.glb`；`cad/step/Small CNC V3 ATC Update.step.zip` | 完整装配应用、CAD、BOM、接线与气动资料；代码 AGPL-3.0-or-later，模型/媒体 CC-BY-SA-4.0，机械设计 CERN-OHL-W-2.0 |
| [OLSK Large CNC](https://github.com/Open-Lab-Starter-Kit/OLSK-Large-CNC) | `e7081c49c582b732ea6ab3c160bf557609754cfc` | `Assembly_Manual/`；`OLSK_Large_CNC_V2_IN.glb`；`cad/Step/Large CNC V3.step.zip` | 同上，按 `.reuse/dep5` 区分每类文件；V3 CAD 与 V2 命名显示模型并存，保留原名 |
| [Voron 2.4r2](https://github.com/VoronDesign/Voron-2) | `7b32e405f0719881cca782500c822e01e3b16bf2` | `CAD/Voron_2.4r2_Assembly_STEP.zip` | 原整机 STEP / Fusion 文件、零件、装配手册与固件资料；GPL-3.0 |
| [Jubilee](https://github.com/machineagency/jubilee) | `c877bd2e889560c83da2a68479641a4f7f0d9b83` | `frame/cads/STEP/jubilee.STEP` | 原 SolidWorks 零件/装配、STEP、BOM、图纸与工具；CC-BY-4.0 |
| [Science Jubilee](https://github.com/machineagency/science-jubilee) | `bb918fa78f300f57cc379a80731cfca7bdb55c66` | 完整仓库原件，含 `src/science_jubilee/` 与 `tool_library/` | 作为 Jubilee 的独立控制与工具研究资料保留；MIT，不替代机械设计许可 |
| [OPC UA 教学输送 / 供料设备](https://github.com/roshbeng/opcua_fusion_test_servers_and_hardware) | `d9ab21ced0a26e09a213a218249ac1938340bae6` | `CAD models/conveyor_model/conveyor_model_v1.step`、`CAD models/cobot_model/cobot_model_v1.step` | 原输送机构及配套机械臂整机、原控制脚本；仓库 MIT，未额外推定未声明的硬件认证或第三方资产许可 |

六个固定源共有 1,865 个原文件。`frozen-sources/*.json` 含每个文件的原路径、字节数、SHA-256、Git blob、模式及对应 Git tree；完整 Git tree 可独立重建核对。`licenses/` 原封保留 32 份上游许可与路径映射，`licenses/index.json` 记录原路径和字节哈希；另外保留 Draco 的 Apache-2.0 许可及其来源。全部原件包含历史版本，当前显示版本由 `sources.json` 明确指定。

## 构建与本地文件

在仓库根目录执行：

```sh
npm run install:hardware
npm run build:hardware
```

只构建本组，或选择其中一项：

```sh
node scripts/hardware/build-devices.mjs
node scripts/hardware/build-devices.mjs olsk-small-cnc voron-2.4
```

导出函数为 `buildDevices({ repoRoot, ids? })`。CAD 转换依赖精确版本 `cadquery-ocp==7.8.1.1.post1`；根工具链设置 `HARDWARE_PYTHON`，独立运行也可指定该变量。OLSK 各自用自己的锁文件安装原 React / Three / R3F 依赖，不与宿主 Three.js 统一版本；安装明确包含开发依赖，构建时不会遗漏 Vite。首次获取需要 GitHub codeload 和 npm 网络，正常场景运行不需要这些服务。

原件下载到 `.cache/hardware/sources/<id>-<sha>/archive.tar.gz`。只解压构建必需文件，完整压缩包仍保留全部原件；公开目录与构建目录尽量使用硬链接，避免重复占用数 GB 磁盘。源文件一经哈希确认不会在原位置写入。派生文件在独立工作目录生成，再完整发布到 `public/hardware/<id>/`。

每项公开目录包含：

- `asset.json`：真实能力、展示模型、来源、许可与限制。
- `originals.json`：所有原文件索引；主要 CAD / BOM / 图纸 / 控制源码有单独本地地址，其余文件可从完整本地来源包取得。
- `SOURCE.md`：原作、主展示版本、接入方法和未完成能力。
- 原模型、原装配应用或 STEP 派生 GLB，以及转换报告。
- `build-manifest.json`：本次配方与所有公开文件的字节哈希。缓存命中仍核对完整文件集合与每个哈希。

独立 CAD 转换缓存还核对输入 STEP、转换器、原锥面后备、坐标约定、工具链和输出报告，因此修改 OLSK 布局或发布说明不会强迫重新网格化大型机械装配。共享发布工具与工具链代码也进入总构建指纹。

## OLSK 原装配应用

两个应用均保持原 HashRouter、模型节点、分步装配、零件点选、镜头、材质处理和图示。小屏适配只调整排版，使原菜单、信息栏和三维区域可滚动访问；触摸操作仍由原 OrbitControls 处理。内部 HowTo 链接保留在同一个 iframe，宿主的返回入口持续可用。修正了原组件的跨挂载数组累积，以免从 HowTo 返回后重复装配步骤或菜单。

原应用依赖作者公开 Google Sheets 内容，已取得真实原响应，并以原始字节冻结在 `manual-data/`。这三份外部资料与 Git 提交分别标识，记录各自文档 URL、获取时间和 SHA-256，不虚构其属于 Git 历史。运行时沿用原数据解析过程。Barlow、原 Three 0.148 中的 Draco JS/WASM 及原字体声明全部本地化；没有重新压缩或改写原 GLB。

AGPL 对应源码可从每项的 `adapted-source.tar.gz` 直接下载，含完整适配应用、全部原本地显示资产、三份真实说明快照、依赖锁、Vite 配置与适配记录，可单独 `npm ci --include=dev --ignore-scripts --legacy-peer-deps` 后构建。原仓库完整来源包同时提供，不以只有未修改上游的链接替代对应源码。

原版存在的完成度差异保留可见：

- Large CNC 的 H3、H5、H6、H7、H11 引用 `FirstTestHowTo.glb`，固定上游树没有该文件，作者原站 `https://open-lab-starter-kit.github.io/OLSK-Large-CNC/FirstTestHowTo.glb` 于 2026-11-24 核实返回 HTTP 404。对应页面显示“原图示未提供”的说明，仍提供原文字和导航，没有借用其他模型凑齐。
- Small CNC 的同名示例与 H1 的 T-nut 模型字节相同，SHA-256 为 `bba6b189d1442be4b00ce371fa00e12cf7c2374f794f3e12dae9a1ab76d69364`；H3/H5/H6/H7/H11 仍保留原作者的占位示例，不称为各主题的完整仿真。
- Large 原 HowTo 菜单误读主装配工作表，适配副本将它指向原 HowTo 正文已经使用的同一份作者资料；原版文件完整保留在来源包中。
- Small / Large 原显示模型含 31,999 / 50,213 个 primitive，仍保持原几何与部件，手机 WebGL 性能须实测，不用简化替代模型冒充原作。
- 原主模型部分索引 accessor 把三角数量写入了索引数量字段，原 Three 的 Draco 路径直接使用实际解码出的索引，仍可解析；本接入保留原 GLB 字节，在 `original-runtime-validation.json` 记录该差异。构建时用本地 WASM 实际解码每个压缩原 GLB 的一个 primitive，核对顶点、实际索引范围与所有原 buffer-view 边界；这不是全部 primitive 的视觉验收。

## CAD 转换的边界

`convert-step.py` 读取 STEPCAF / XCAF 原产品树、实例、名称、位置和可读取颜色。按唯一原叶部件顺序网格化，仅把显示三角缓存挂回原 B-rep，最终仍导出原整机树；从未重建替代场景。所有实例中的每个非退化原面都必须有三角，失败即中止。原件转换前后的 SHA-256 必须一致。

OCCT 首次标准网格化失败时，有三个独立且严格限定的原曲面后备：普通非锥顶面必须具有原 UV 矩形四边界、单 wire 和完整周期；锥顶面必须具有原退化锥顶边、两条原接缝，以及连续覆盖整个圆周的原分段圆弧；分段圆环的非锥顶面则独立检查两个完整圆环的每一段原弧与原接缝，并在共同网格中保留两环的原端点。三者都直接采样原解析曲面，记录面积误差、三角内部分类、法线、位置和偏差，不用通用三角补洞替换原曲面；不满足条件的面仍进行普通局部细化，最终失败即中止，不跳过。原 SO101 小锥面、Voron 螺钉锥顶和分段圆环均有真实 BRep 回归证据。

显式 `--diagnose-unmeshed-only` 模式只在标准原部件网格化后，一次扫描全部原面并导出尚不支持的原 BRep 与诊断索引，不写 GLB，也不发布设备。它用于大型整机的失败归类，不能把诊断命令完成当成可显示模型完成。

普通局部细化也不能只看“出现了三角形”。Voron 的一个原微小平面表明，内核状态为成功时仍可能得到不完整的粗网格；另一次检查发现默认固定阶面积积分对这种狭窄曲边有误差。因此普通闭合面的面积使用原曲面自适应积分，局部细化须同时满足内核无错误与实际三角面积相对误差不超过 0.5%，必要时使用更细的原内核容差。每次尝试和最终容差都写入转换报告。`verification/voron-thin-plane-native-refinement.json` 还保存了独立原曲线积分及三角中心到原边界的误差证据。

Voron 固定原 STEP 中的第 8935 面另有源文件本身的精度限制：这是靠原顶点/边容差连接的极薄 B-spline 面，原 UV 端点没有精确闭合，自适应积分的负值不能取绝对值后充当经过认证的真实面积。该唯一来源面保留原 OpenCascade 产生的 4 个三角形、原曲面、原边、原公差与原放置，不作投影替换，不添加封口，也不删除原面。它按固定完整 STEP SHA、原面标识、实际拓扑和原精度作独立审计；其面积未认证，不能算成 0.5% 面积核验通过。其他未知情况仍然阻断构建。固定审计策略在 `native-tolerance-audits/voron-2.4-face-8935.json`，公开副本为 `source-precision-audit.json`，实际结果单列于转换报告的 `nativeToleranceLimitedFaces`；场景清单、模型限制和 `SOURCE.md` 均保留此说明。审计策略与其实现都进入转换缓存指纹，运行时间记录不进入指纹。

内部长度使用毫米，glTF 使用米。对原 Z-up 装配仅添加一个显式 Z→Y 顶层变换，原部件矩阵不动；Y-up 不额外旋转。真实 1000×2000×3000 mm STEP 回归检查最终世界坐标边界，另一回归检查重复实例仍有独立位置，而不是只看文件大小或导出成功。

Jubilee 的原 SolidWorks 装配是 Y-up。`verify_jubilee_axis.py` 独立比较其四个原 `budget_foot_*` 零件在原 STEPCAF 树与导出 GLB 中的完整世界矩阵，并检查四脚的 Y 高度相同、X/Z 位置分开；不根据文件扩展名猜测朝向，也不修改原部件坐标。

这几项展示真实机械结构及原资料；不会从 CAD 猜测关节、惯量、限位、碰撞、加工参数、工具校准或传感器状态。独立的行为研究说明见 [BEHAVIOR.md](BEHAVIOR.md)。

## 验证与未完成验收

```sh
python3 integrations/hardware/devices/verify_frozen_sources.py
python3 integrations/hardware/devices/verify_frozen_sources.py --archives .cache/hardware/sources
npm run test:hardware:cad
node --test integrations/hardware/devices/test_lifecycle.mjs
python3 integrations/hardware/devices/verify_jubilee_axis.py --report integrations/hardware/devices/verification/jubilee-axis.json
```

`test:hardware:cad` 自动选择已经安装的固定 Python 工具链，并包含原 STEP 坐标/实例与三类真实锥面的回归；来源索引及 Jubilee 四脚矩阵检查只需要 Python 3.11+ 标准库。`verification/` 记录实际执行的 CPU 回归与来源核验，公开目录中的转换报告记录每次真实模型转换。根项目还负责公开文件的逐字节 HTTP、生产入口和导航检查。构建成功、HTTP 成功、CPU 几何检查分别只证明其检查范围，不能替代浏览器 WebGL 画面、移动端手势、原镜头体验、连续切换后的 GPU/音频释放或实机验收。

## 本轮实际结果

2026-11-24 完成五项设备的独立串行构建，共 8 个模型/原应用入口、1,865 个完整来源文件索引。构建后只读重新计算了实际配方指纹，并核对公开目录中 805 个文件的精确集合、字节数与 SHA-256，全部一致；这 805 个文件不含五个缓存标记本身。完整结果见 [device-builds.json](verification/device-builds.json)。

| 设备 | 实际输出 | 本地完整原件数 | CPU 核验要点 |
| --- | --- | ---: | --- |
| OLSK Small CNC | 原装配应用与原完整 GLB | 147 | 独立生产构建、本地原 Draco 真实解码、12 个原 GLB 容器及资源边界 |
| OLSK Large CNC | 原装配应用与原完整 GLB | 129 | 同上，11 个原 GLB；上游缺失的五个教程图示仍明确标注 |
| Voron 2.4r2 | 原 STEP 整机转换 | 211 | 1,685 原节点、107,855 原面 occurrence、2,380,917 三角形；第 8935 面原精度限制与第 9004 面数值退化记录分别公开 |
| Jubilee / Science Jubilee | 原 STEP 整机与独立控制原件 | 1,329 | 819 原节点、40,536 原面；四个原机脚完整世界矩阵一致，Y 高度跨度约 1.69×10⁻¹¹ 米 |
| OPC UA 教学设备 | 原输送机构与配套机械臂两套装配 | 49 | 分别保留 5 / 9 原节点、137 / 443 原面；没有运行原 GPIO 或控制端点 |

既有场景的生产 HTTP 回归也已执行：Smart Warehouse 的 10 个 HTTP 检查通过；Warehouse Journey、WareTwin、RFTwin 的 87 项资源逐 HTTP 哈希与 11 个宿主/深链接路由通过，详见 [existing-scenes-http.json](verification/existing-scenes-http.json)。这些结果均不包含浏览器视觉或实机验收。
