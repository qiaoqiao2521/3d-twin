# OPC UA 原动作结果语义研究

固定来源：[roshbeng/opcua_fusion_test_servers_and_hardware](https://github.com/roshbeng/opcua_fusion_test_servers_and_hardware/tree/d9ab21ced0a26e09a213a218249ac1938340bae6)，提交 `d9ab21ced0a26e09a213a218249ac1938340bae6`。两份研究用服务器脚本逐字节保存在 `upstream/`；SHA-256 见 `SOURCE.json`，原 MIT 文本见 `LICENSE.upstream`。完整仓库与 CAD 原件仍由设备目录的原件包提供。

## 修正的具体缺陷

原输送机的 `initialize`、`move_and_supply`，原机械臂的 `move_arm`、`reference_cobot` 均在 `except Exception` 打印错误后继续执行尾部 `return True`。外围直接调用这四个原方法无法判断异常是否已经被吞掉；它们的布尔结果不能作为操作成功证据。

`operation_adapter.py` 验证原文件哈希后，只从 AST 抽取这四个原异步方法，并在内存中把异常分支改为重新抛出。原方法里的成功路径、引脚编号、占空比顺序与等待时长保持原定义；既有原文件不写入、不改名、不覆盖。错误进入独立适配层后，返回 `False`、记录 `failed` 状态，尝试停止和清理注入执行器；清理自身失败也保留失败状态与原始错误。取消继续向调用者传播，状态记为 `cancelled`，不会转成成功。重叠请求会拒绝执行。

注入的执行器必须在 I/O 失败时抛出异常，不能再次吞掉错误。原 `move_arm(False)` 只打印“停止”而没有中断正在执行的序列，因此适配层明确返回拒绝，不把它标为急停已执行。涉及系统关机的 `stop_cobot` 不在适配接口中。

## 独立边界

本模块不导入 `RPi.GPIO` 或 `asyncua`，不执行原模块顶层代码，不创建 OPC UA 服务，不打开 socket，不运行 shell 或系统关机，也不接入网页渲染生命周期。必须由调用者显式提供执行器；本仓只提供记录调用与注入故障的无硬件测试执行器，没有默认真机实现。

适配方法保留原 `parent` 参数与布尔返回签名，可供后续经过单独验证的服务显式绑定。当前网页仅展示原 CAD 与控制源码，尚未把此适配器连接到 OPC UA 端点或 Raspberry Pi。测试中的 `True` 仅说明注入执行器完成了原软件序列，不等于传感器确认或真实机械动作完成。

## 复验

只需 Python 标准库：

```sh
python3 -m unittest discover -s research/hardware/opcua -p 'test_*.py' -v
```

8 项测试涵盖四个实际原方法的异常返回、原成功序列、清理异常、取消、重叠请求、未实现的停止/关机拒绝与冻结原件哈希。执行器记录占空比调用但不驱动物理引脚；虚拟等待不实际等待舵机运动。没有进行 OPC UA 协议、GPIO、真实急停或机械安全验收。
