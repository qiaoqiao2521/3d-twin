# 赤星战区驾驶与瞄准 · 2026-11-18

## 复现与验收

- 启动 `bun run dev`，打开 `/?actor=husky_ugv` 出击。静止时按 D 检查原地右转，再按 W 入弯，最后按 S 制动并倒车。自由沙盒沿用相同驾驶方式。
- 在同一台 Chromium 的 1280 × 633 视口中，只按 D 约 0.4 秒游戏时间，旧版 Husky 横移 3.27 米。修复后原地转向约 44°，水平位移为 0。自由沙盒中按 W 的首段实际位移也与前后轮中心连线同向。
- 行驶时快速转动鼠标，按 2 开火。在实测的发射帧，Husky 炮管与弹迹的夹角从约 28° 降到 0.03°。换用 G1 并按 4，复合弓从箭头模型发射，实测夹角为 0.01°。步枪散布和四联装的分散发射属于各自的游戏设定。
- 在标题页用 Tab 选中地图或机体，再用 Enter 或空格确认选择。点击出击后切走标签，返回时应留在暂停菜单。两个战区分别以泰坦和异形女皇为默认领主。

## 二改入口

- 车辆运动由 [actionSandboxEngine.ts](../../src/utils/actionSandboxEngine.ts) 和 [marsCombatEngine.ts](../../src/utils/marsCombatEngine.ts) 调用相同的底盘逻辑。轮轴、转向和接地行程由 [groundDriveWheels.ts](../../src/utils/groundDriveWheels.ts) 驱动。
- 从仓库根目录执行 `node scripts/rig_mars_rover_wheels.mjs`，可从数字孪生 L1 原件重新生成毅力号六轮游戏模型。建模输入和游戏输出分开，可独立替换。
- [marsCombatAim.ts](../../src/utils/marsCombatAim.ts) 负责肩视镜头、准星射线和武器挂点。运行 `bun test src/utils/groundDriveWheels.test.mjs src/utils/marsCombatAim.test.ts` 可复核实际 GLB 节点和射击几何。

知识库收尾为 `no_reusable_delta`。本轮测量随游戏版本保存在这里。
