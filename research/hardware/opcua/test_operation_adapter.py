"""Fault injection against real frozen method bodies; no GPIO, server or sockets."""
import asyncio
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from operation_adapter import OperationAdapter


class RecordingExecutor:
    BCM = "recording-only-BCM"

    def __init__(self, *, fail=False, fail_cleanup=False, block=False):
        self.fail = fail
        self.fail_cleanup = fail_cleanup
        self.block = block
        self.started = asyncio.Event()
        self.release = asyncio.Event()
        self.calls = []

    def setmode(self, mode):
        self.calls.append(("setmode", mode))

    def get_or_create_pwm(self, pin, frequency=50):
        self.calls.append(("pwm", pin, frequency))
        executor = self

        class RecordedPwm:
            def ChangeDutyCycle(self, value):
                executor.calls.append(("duty", pin, value))
                if executor.fail:
                    raise OSError("injected actuator failure")
        return RecordedPwm()

    def stop_all_servos(self):
        self.calls.append(("stop",))
        if self.fail_cleanup:
            raise OSError("injected stop failure")

    def cleanup_gpio(self):
        self.calls.append(("cleanup",))

    async def sleep(self, seconds):
        self.calls.append(("sleep", seconds))
        self.started.set()
        if self.block:
            await self.release.wait()


class AdapterTest(unittest.IsolatedAsyncioTestCase):
    async def test_each_original_operation_reports_false_after_actuator_failure(self):
        for name, arguments in (("initialize", ()), ("move_and_supply", ()), ("move_arm", (None, True)), ("reference_cobot", ())):
            with self.subTest(operation=name):
                executor = RecordingExecutor(fail=True)
                adapter = OperationAdapter(executor)
                self.assertFalse(await getattr(adapter, name)(*arguments))
                self.assertEqual(adapter.last_result.phase, "failed")
                self.assertIn("injected actuator failure", adapter.last_result.error)
                self.assertEqual(executor.calls[-2:], [("stop",), ("cleanup",)])

    async def test_original_conveyor_values_and_success_path_are_preserved(self):
        executor = RecordingExecutor()
        adapter = OperationAdapter(executor)
        self.assertTrue(await adapter.initialize())
        self.assertTrue(await adapter.move_and_supply())
        self.assertEqual([call for call in executor.calls if call[0] == "duty"], [("duty", 18, 12.5), ("duty", 18, 3)])
        self.assertEqual([call for call in executor.calls if call[0] == "sleep"], [("sleep", 1), ("sleep", 1)])

    async def test_original_cobot_sequences_complete_only_on_success(self):
        executor = RecordingExecutor()
        adapter = OperationAdapter(executor)
        self.assertTrue(await adapter.reference_cobot())
        self.assertEqual([call[2] for call in executor.calls if call[0] == "duty"], [7, 8, 10, 3.5, 12.5, 12.5])
        self.assertTrue(await adapter.move_arm(None, True))
        self.assertEqual(adapter.last_result.phase, "succeeded")

    async def test_cleanup_failure_does_not_turn_the_original_error_into_success(self):
        executor = RecordingExecutor(fail=True, fail_cleanup=True)
        adapter = OperationAdapter(executor)
        self.assertFalse(await adapter.initialize())
        self.assertIn("actuator failure", adapter.last_result.error)
        self.assertIn("stop failure", adapter.last_result.cleanup_errors[0])
        self.assertEqual(executor.calls[-1], ("cleanup",))

    async def test_cancellation_stays_cancelled_and_cleans_the_injected_executor(self):
        executor = RecordingExecutor(block=True)
        adapter = OperationAdapter(executor)
        task = asyncio.create_task(adapter.initialize())
        await executor.started.wait()
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertEqual(adapter.last_result.phase, "cancelled")
        self.assertFalse(adapter.last_result.success)
        self.assertEqual(executor.calls[-2:], [("stop",), ("cleanup",)])

    async def test_overlap_is_rejected_without_starting_another_sequence(self):
        executor = RecordingExecutor(block=True)
        adapter = OperationAdapter(executor)
        task = asyncio.create_task(adapter.initialize())
        await executor.started.wait()
        self.assertFalse(await adapter.move_and_supply())
        self.assertEqual(adapter.results["move_and_supply"].phase, "rejected")
        self.assertEqual(len([call for call in executor.calls if call[0] == "duty"]), 1)
        executor.release.set()
        self.assertTrue(await task)

    async def test_false_motion_and_system_shutdown_are_not_misreported_as_executed(self):
        executor = RecordingExecutor()
        adapter = OperationAdapter(executor)
        self.assertFalse(await adapter.move_arm(None, False))
        result = await adapter.execute("stop_cobot")
        self.assertFalse(result.success)
        self.assertEqual(result.phase, "rejected")
        self.assertEqual(executor.calls, [])

    async def test_only_exact_frozen_source_bytes_can_supply_operations(self):
        base = Path(__file__).parent
        manifest = json.loads((base / "SOURCE.json").read_text())
        for record in manifest["files"]:
            content = (base / "upstream" / record["path"]).read_bytes()
            self.assertEqual(hashlib.sha256(content).hexdigest(), record["sha256"])
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / manifest["files"][0]["path"]
            destination.parent.mkdir(parents=True)
            destination.write_text("raise RuntimeError('must never execute')\n")
            with self.assertRaisesRegex(ValueError, "hash mismatch"):
                OperationAdapter(RecordingExecutor(), source_root=directory)


if __name__ == "__main__":
    unittest.main(verbosity=2)
