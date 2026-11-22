# iron 接纳与检查能力同步

iron 继续在自己的仓库独立维护、构建和运行。数字孪生的独立入口接纳虚拟角色；嵌入不改变角色的来源，也不证明其可制造或已经对应真实设备。

## 唯一共享源码

`src/shared/inspection/sceneInspection.ts` 是检查数据契约的权威源，独立于 React、Three.js 和机器人控制器。它分开表示视觉装配节点与运动学关节，并记录程序生成/文件来源、虚拟/工程定位、单位、状态来源与实体证据。未知数值为 `null`，未知单位为 `unknown`。节点选择只匹配完整 ID，不以名字猜测关节。

iron 的 `src/vendor/twin-inspection/sceneInspection.ts` 是同字节副本，由 iron 自己读取本公开仓库。角色蓝图、专属技能、控制器和站点配置不在同步范围内。iron 发布入口被孪生引用，和此处的源码定向同步是两条不同的关系；不存在两仓源码互相覆盖。

## 验证与更新

主分支每次推送运行 `.github/workflows/inspection-contract.yml`：以 Node 24 执行独立契约测试，再将对应提交的模块和 SHA-256 清单打包为检查产物。打包脚本会拒绝源文件与申报提交不相符的情况。工作流不写 iron，不部署站点。

iron 每六小时检查一次，也支持手动运行。它只接受当前孪生 `main` 在上述确切工作流路径中验证成功的完整提交 SHA，再执行 iron 的类型检查、全部现有测试和构建。测试通过 Python 递归枚举 `src` 下全部 `*.test.ts`，使用 `node --import tsx --test --test-concurrency=2`，保持原有 Node 测试语义，不以 Bun test 默认超时筛掉长时间几何测试。全部通过后，iron 的工作流只把模块与来源锁文件直接提交到自己的 `main`。源内容未改变时先核对本地锁与文件一致，再跳过重复验证且不产生提交；失败保留旧版；主分支并发更新导致推送失败时不会强推。

无需跨仓写凭据，不创建 PR 或长期同步分支。`repository_dispatch` 仅为可选唤醒入口；定期检查与手动运行不依赖它。iron 的同一工作流另有相关 `main` 推送触发的只读验证路径：验证已提交版本的锁与全部本地验收，不拉取、不改源码、不提交，使首次接入即有实际 CI 记录。应在运行记录中确认两边工作流成功，不能把工作流文件已经提交当作远程运行已通过。

## 本地校验

```bash
node --test src/shared/inspection/sceneInspection.test.ts
python3 scripts/package_inspection.py --output /tmp/twin-inspection-package
```

打包使用当前已提交 HEAD，不包含任何模型、纹理或角色源码。
