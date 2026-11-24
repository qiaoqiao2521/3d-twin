"""Correct result semantics for four frozen upstream operations, with injected I/O.

No asyncua server, GPIO import, socket, system shutdown or default executor is
created here. Upstream files are read-only. Only their four selected async
operation definitions are compiled; imports, server setup and stop_cobot are
never executed. See README.md for the integration boundary.
"""
import ast
import asyncio
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
from typing import Protocol


class Pwm(Protocol):
    def ChangeDutyCycle(self, value: float) -> None: ...


class Executor(Protocol):
    """Explicit dependency: each I/O method must raise on failure, not swallow it."""
    BCM: object

    def setmode(self, mode: object) -> None: ...
    def get_or_create_pwm(self, pin: int, frequency: int = 50) -> Pwm: ...
    def stop_all_servos(self) -> None: ...
    def cleanup_gpio(self) -> None: ...
    async def sleep(self, seconds: float) -> None: ...


@dataclass(frozen=True)
class OperationState:
    operation: str
    phase: str
    error: str | None = None
    cleanup_errors: tuple[str, ...] = ()

    @property
    def success(self):
        return self.phase == "succeeded"


_OPERATIONS = {
    "opcuaprojectconveyor/opcua_conveyor_server.py": ("initialize", "move_and_supply"),
    "opcuaprojectcobot/opcua_cobot_server.py": ("move_arm", "reference_cobot"),
}


def _load_operations(executor, source_root, log):
    base = Path(__file__).resolve().parent
    manifest = json.loads((base / "SOURCE.json").read_text())
    expected = {row["path"]: row for row in manifest["files"]}
    result = {}
    for relative, names in _OPERATIONS.items():
        file = Path(source_root) / relative
        content = file.read_bytes()
        if hashlib.sha256(content).hexdigest() != expected[relative]["sha256"]:
            raise ValueError(f"Frozen upstream source hash mismatch: {relative}")
        module = ast.parse(content, filename=str(file))
        selected = []
        for name in names:
            matches = [node for node in module.body if isinstance(node, ast.AsyncFunctionDef) and node.name == name]
            if len(matches) != 1:
                raise ValueError(f"Missing frozen operation: {name}")
            function = matches[0]
            handlers = [node for node in ast.walk(function) if isinstance(node, ast.ExceptHandler)]
            if len(handlers) != 1 or not isinstance(handlers[0].type, ast.Name) or handlers[0].type.id != "Exception":
                raise ValueError(f"Unexpected frozen error handling: {name}")
            # The upstream except block prints/cleans and then reaches an
            # unconditional True. Propagate that same error into our result
            # adapter instead. Original successful PWM values/order/timing stay.
            handlers[0].body = [ast.Raise()]
            function.decorator_list = []  # No uamethod/asyncua dependency here.
            selected.append(function)
        extracted = ast.fix_missing_locations(ast.Module(body=selected, type_ignores=[]))
        namespace = {
            "__builtins__": {"Exception": Exception},
            "GPIO": SimpleNamespace(BCM=executor.BCM, setmode=executor.setmode),
            "SERVO_PIN": 18,
            "get_or_create_pwm": executor.get_or_create_pwm,
            "stop_all_servos": executor.stop_all_servos,
            "cleanup_gpio": executor.cleanup_gpio,
            "asyncio": SimpleNamespace(sleep=executor.sleep),
            "print": log,
        }
        exec(compile(extracted, str(file), "exec"), namespace)
        result.update({name: namespace[name] for name in names})
    return result


class OperationAdapter:
    """Isolated method-result adapter; an injected executor is always required.

    True means this executor completed the preserved software sequence. It is
    neither a sensor acknowledgement nor proof of actual physical movement.
    The repository only tests a recording executor without hardware.
    """
    def __init__(self, executor: Executor, *, source_root=None, log=lambda *args: None):
        self.executor = executor
        self.operations = _load_operations(executor, source_root or Path(__file__).with_name("upstream"), log)
        self.lock = asyncio.Lock()
        self.last_result = OperationState("", "idle")
        self.results = {}

    def _record(self, operation, phase, error=None, cleanup_errors=()):
        state = OperationState(operation, phase, error, cleanup_errors)
        self.last_result = state
        self.results[operation] = state
        return state

    def _cleanup_after_failure(self):
        errors = []
        for name in ("stop_all_servos", "cleanup_gpio"):
            try:
                getattr(self.executor, name)()
            except Exception as error:
                errors.append(f"{name}: {type(error).__name__}: {error}")
        return tuple(errors)

    async def execute(self, operation, *arguments):
        if operation not in self.operations:
            return self._record(operation, "rejected", "Unsupported operation; no server or shutdown methods are exposed.")
        if operation == "move_arm" and (len(arguments) != 1 or arguments[0] is not True):
            return self._record(operation, "rejected", "Only explicit True starts the preserved sequence; the upstream False branch does not implement an emergency stop.")
        if self.lock.locked():
            return self._record(operation, "rejected", "Another injected operation is running.")
        async with self.lock:
            self._record(operation, "running")
            try:
                completed = await self.operations[operation](None, *arguments)
                if completed is not True:
                    raise RuntimeError("Operation did not explicitly report completion")
            except asyncio.CancelledError:
                self._record(operation, "cancelled", "Operation cancelled", self._cleanup_after_failure())
                raise
            except Exception as error:
                return self._record(operation, "failed", f"{type(error).__name__}: {error}", self._cleanup_after_failure())
            return self._record(operation, "succeeded")

    # Signatures preserve the original parent argument; callers can explicitly
    # bind these Boolean handlers into a separately reviewed OPC UA service.
    async def initialize(self, parent=None):
        return (await self.execute("initialize")).success

    async def move_and_supply(self, parent=None):
        return (await self.execute("move_and_supply")).success

    async def move_arm(self, parent, command_bool):
        return (await self.execute("move_arm", command_bool)).success

    async def reference_cobot(self, parent=None):
        return (await self.execute("reference_cobot")).success
