# 首批工业设备接入

## 安川 MA2010 + D500B

- 原仓：https://github.com/Yaskawa-Global/motoman_ros2_support_packages/tree/a77f186048bd3c35fc3bb5142f9d9270dbebe69f
- 选择三套相关 ROS 包，保留原始包清单、Xacro、STL、配置及启动文件。三套 package.xml 声明 BSD-3-Clause，逐个固定 blob；不声称整个上游仓库统一许可。
- 新增组合工位与两套独立原模型。标准 Xacro 展开，不重画网格、不改关节参数。组合工位在独立 world 下添加两个固定安装关节及名称前缀；2m 基座间距是示例，不代表实机安装。
- 复用已有原件目录、结构/关节查看器、原始文件与验收；尚未实现焊枪、工件、焊道、协调轨迹、实际 TCP 及物理仿真。

### 本地验收

```sh
python3 -m unittest discover -s integrations/hardware/robots -p 'test_motoman_weld.py' -v
node scripts/build-hardware.mjs motoman-weld
node scripts/verify-hardware-kinematics.mjs --asset=motoman-weld
npm run lint
npm run test:hardware
npm run dev
````

入口：`?workspace=hardware&asset=motoman-weld`。组合工位 8 个运动关节，单独模型分别 6、2。检查全部 STL 加载、原件页、返回、逐轴滑块、相机和触屏。当前提交尚无联网构建/WebGL 实测结果，不能声称已验收。构建失败时保留报错，不补造网格。

## 其余三项（尚未接入展示）

| 设备 | 已确认来源 | 阻塞与后续 |
| --- | --- | --- |
| Kawasaki RS007L | https://github.com/Kawasaki-Robotics/khi_robot/tree/678dd3fbc4f75fd76c1fd5277116d0edc6528f13 | 包声明 STL 另受 KHI CAD 免责声明约束，限定用于布局设计检查，公开分发或其他使用须核对许可；暂不发布网格。https://kawasakirobotics.com/asia-oceania/products/cad-disclaimer/ |
| LumenPnP | https://github.com/opulo-inc/lumenpnp/tree/64cf68d5b7980f095ef11913065e7f45a1e3e447 | FreeCAD/Git LFS 与发布附件、硬件 CERN-OHL-W v2 及独立商标条款；需完整原装配及轴绑定，不造替代几何。 |
| FarmBot Genesis | https://genesis.farm.bot/v1.8/extras/cad.html | 原 CAD CC0，Onshape 总装与子总成需导出并固定版本，核对真实模型及轴坐标。 |

后续新增独立工艺回放，不将单轴演示等同实测控制或焊接质量。
