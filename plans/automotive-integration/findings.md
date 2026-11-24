# 发现
- 起始工作区干净；源目录在 /data/下载/汽车解剖对比/，不得写入。
- 工作台原设计分别启动 18760、18761、18762 端口，两个适配桥都固定指向 18760；部署时需统一同源及修正消息来源检查。
- 三个 GLB 在 auto-atlas/public/models；V8 内嵌录音署名 CC BY-SA 3.0。
- 主仓库尚未安装 node_modules，需按 lockfile 安装依赖后验证。
- 直接解析 GLB 的 asset.extras 发现艾瑞泽署名 Ddiaz Design，原模型许可为 CC BY-NC-SA 4.0，而非源 README 中暗示可待定的 CC BY；已请求用户确认是否拥有额外再授权权利。BMW 与 Tesla 均内嵌 CC BY 4.0 和作者来源。
- 主仓库 Vite 开发服务忽略 public 目录监听；启动后新建 manifest.json 时，开发服务暂时回退到 HTML。完成静态文件写入后需重启开发服务再验 URL。
- 单独运行原有 marsCombatEngine 测试仍有 2 项失败，涉及掩体碰撞和召唤 Queen；相关文件没有本次差异。迁入绑定测试已调整以兼容 Bun。
- 完整浏览器工作台测试通过 20 项；另从主站依次载入艾瑞泽、BMW、Tesla，并确认 V8 实际画面与本地依赖。
- 最终开发与 dist HTTP 检查各 35 项全为 200；新增的全车型商用 CC BY 4.0 验收测试明确拦截当前艾瑞泽冲突。
