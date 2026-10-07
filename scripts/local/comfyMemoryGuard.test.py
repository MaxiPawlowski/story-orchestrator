import asyncio
import importlib.util
import pathlib
import sys
import types
import unittest

calls = []
queue = {"running": [], "pending": []}
server = types.SimpleNamespace(instance=types.SimpleNamespace(routes=types.SimpleNamespace(post=lambda route: lambda fn: fn),
    prompt_queue=types.SimpleNamespace(get_current_queue_volatile=lambda: (queue["running"], queue["pending"]))))
sys.modules["server"] = types.SimpleNamespace(PromptServer=server)
sys.modules["aiohttp"] = types.SimpleNamespace(web=types.SimpleNamespace(json_response=lambda body, status=200: (status, body)))
sys.modules["torch"] = types.SimpleNamespace(cuda=types.SimpleNamespace(synchronize=lambda: calls.append("sync"), empty_cache=lambda: calls.append("empty"),
    memory=types.SimpleNamespace(host_memory_stats=lambda: {"allocated_bytes.current": 4096, "active_bytes.current": 2048})),
    accelerator=types.SimpleNamespace(empty_host_cache=lambda: calls.append("host_empty")))
spec = importlib.util.spec_from_file_location("so_guard", pathlib.Path(__file__).parent / "comfyMemoryGuard" / "__init__.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class GuardTests(unittest.TestCase):
    def setUp(self):
        calls.clear()
        queue["running"] = []
        queue["pending"] = []

    def request(self, remote="127.0.0.1", header="1"):
        return types.SimpleNamespace(remote=remote, headers={"X-SO-Local": header})

    def test_host_cache_refuses_foreign_and_busy_requests(self):
        self.assertEqual(asyncio.run(module.trim_host_cache(self.request(remote="10.0.0.1")))[0], 403)
        self.assertEqual(asyncio.run(module.trim_host_cache(self.request(header="0")))[0], 403)
        queue["pending"] = ["foreign"]
        self.assertEqual(asyncio.run(module.trim_host_cache(self.request()))[0], 409)
        self.assertEqual(calls, [])

    def test_host_cache_uses_public_api_without_touching_live_models(self):
        status, result = asyncio.run(module.trim_host_cache(self.request()))
        self.assertEqual(status, 200)
        self.assertEqual(calls, ["sync", "host_empty"])
        self.assertFalse(hasattr(module, "trim_native_pool"))
        self.assertEqual(result["activeAfter"], 2048)

unittest.main()
