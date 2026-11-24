# 原版仓储与工厂场景来源

本目录保存固定来源、宿主适配、许可证和回归检查。完整上游在首次 `npm ci` 时按精确提交获取到忽略目录 `.cache/open-demos/<id>/source`；每次安装、构建均核对提交、Git tree 及全部原文件的 Git blob SHA-1。原件只读使用，适配写入同级 `work`，产物写入 `public/open-demos/<id>`。缺少任一场景、源码不一致或构建失败会使命令失败，不会降级为外链。

## 固定版本

| 场景 | 官方仓库与固定提交 | Git tree | 许可 |
| --- | --- | --- | --- |
| Warehouse Journey 3D | [hiobuy/warehouse-journey-3d](https://github.com/hiobuy/warehouse-journey-3d/tree/48d9c57803239ff0ef0763ba4ce0b8be6445d399) | `f9065543ee88f8a2b411d2b8ff1d166308ee2b13` | [MIT / HioBuy](licenses/warehouse-journey-MIT.txt) |
| WareTwin | [WayneChou-bot/WareTwin](https://github.com/WayneChou-bot/WareTwin/tree/81f365f323e1a097e5819ca9045637544163f219) | `77248f4037d06704d8cd2be277e08cad1f9f29b8` | [MIT / Wayne Chou](licenses/waretwin-MIT.txt) |
| RFTwin | [WayneChou-bot/RFTwin](https://github.com/WayneChou-bot/RFTwin/tree/006a20362eb4886b161ee38e634b99ac7876a785) | `d2036952f5f60d76f0f998c6fb35f8f327231787` | [MIT / Wayne Chou](licenses/rftwin-MIT.txt) |

机器可读提交、来源网址、许可证 blob 及后台入口见 [catalog.json](catalog.json)。当前分别包含 98、99、141 个原始文件。`source` 中的原场景、镜头、材质、动作、业务规则、数据结构和原测试均未更改；各应用按各自锁文件安装，保留 Next 15 / React 19 和 Vite 5 / React 18 / Three.js 版本边界。

原作者演示：[Journey](https://warehouse.demo.hiobuy.com)、[WareTwin](https://ware-twin.vercel.app)、[RFTwin](https://rf-twin.vercel.app)。这些是来源参考，本工作台使用同源构建产物运行，不依赖远端演示在线。

## 资源权限与署名

- Journey 上游 README 说明场景采用程序化建模，完整源码、仓库预览图和场景由仓库 MIT 许可覆盖；`public/fonts` 内 Manrope、DM Sans 单独采用 SIL OFL，原字体文件与 [Manrope 声明](licenses/OFL-Manrope.txt)、[DM Sans 声明](licenses/OFL-DM-Sans.txt) 一并保留。[固定版 README](https://github.com/hiobuy/warehouse-journey-3d/blob/48d9c57803239ff0ef0763ba4ce0b8be6445d399/README.md)
- WareTwin 上游 README 明确布局由 `docs/layout/gen_layout.py` 合成，不使用第三方地图或开放数据集。原作 Inter 与 JetBrains Mono 采用 SIL OFL；宿主将相同字体的 Latin 字重自托管，使用精确锁定的 `@fontsource/inter@5.3.0` 与 `@fontsource/jetbrains-mono@5.3.0`，保留包信息及 [Inter](licenses/OFL-inter.txt)、[JetBrains Mono](licenses/OFL-jetbrains-mono.txt) 许可，消除运行时 Google Fonts 请求。[固定版 README](https://github.com/WayneChou-bot/WareTwin/blob/81f365f323e1a097e5819ca9045637544163f219/README.md)
- RFTwin 的 fixture、零件图片和 ONNX 检测模型在原 MIT 仓库内。`scripts/train_vision.py` 与 `assets/vision/inspector.meta.json` 明确模型由合成零件图训练；这不是实厂样本或经过真实生产验证的检测器。完整 `frontend/public/demo`、原模型和元数据随原源码保留。[固定版模型元数据](https://github.com/WayneChou-bot/RFTwin/blob/006a20362eb4886b161ee38e634b99ac7876a785/assets/vision/inspector.meta.json)
- 三个应用均保留原作者名称、原 README 和各自 LICENSE；字体许可证不会被仓库 MIT 覆盖。依赖包依照各自锁文件及包内许可证使用，不把宿主的私有代码或其他现有模型、音频一概声明为可公开分发。

每个构建目录包含 `LICENSE.txt`、`UPSTREAM-README.md`、`SOURCE.json` 和 `ASSET-MANIFEST.json`。`SOURCE.json` 记录精确提交、适配指纹、每个原文件的长度与 Git blob；`ASSET-MANIFEST.json` 记录产物路径、字节数与 SHA-256。发布时保留这些文件和字体许可。

## 宿主适配范围

`scripts/open-demos.mjs` 仅在可重建工作副本中进行以下修改：

1. Journey 启用上游已有静态导出能力，设置部署子路径与字体/预览图路径，隔离父目录 PostCSS 配置，保留 Next 默认使用的 CSS 兼容处理。
2. WareTwin、RFTwin 通过各自原版 React root 注册退出卸载，并把原 store 的数据来源状态报告给宿主；Vite 独立构建配置阻断父目录样式工具链向子应用渗透。
3. WareTwin 的本地入口显式选择原 TypeScript 引擎，实时入口使用同源 WebSocket / API。原模拟规则、调度和渲染代码保持原样。
4. RFTwin 的本地入口直接启动原 `state/demo.ts` fixture 播放器，实时入口使用原连接管理器；适配启动方式、同源 API、图像 URL，以及显式本地入口的中英文提示。只有 `source=local` 提示不连接实时后台；实时入口离线回退仍使用原重连行为与原文案。
5. `lifecycle.js` 在原应用之前加载，退出时调用原卸载、释放输入与 Pointer Lock、关闭音频/Worker/WebSocket、释放 WebGL 上下文；宿主随后移除 iframe 文档。目录页面不启动隐藏场景。

升级版本需更新 catalog 的提交、tree、license blob，并重新检查全部适配锚点、许可证、资源和行为。脚本拒绝把已有缓存原件强制重置到另一版本；需要保留旧缓存或明确移走后再获取新版本。
