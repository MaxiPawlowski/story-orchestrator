import gc
from aiohttp import web
from server import PromptServer

NODE_CLASS_MAPPINGS = {}

@PromptServer.instance.routes.post("/so-local/host-cache")
async def trim_host_cache(request):
    if request.remote not in ("127.0.0.1", "::1") or request.headers.get("X-SO-Local") != "1":
        return web.json_response({"error": "Local controller header required"}, status=403)
    running, pending = PromptServer.instance.prompt_queue.get_current_queue_volatile()
    if running or pending:
        return web.json_response({"error": "A Comfy job is active; no host cache is trimmed"}, status=409)
    import torch
    empty = getattr(getattr(torch, "accelerator", None), "empty_host_cache", None)
    if not callable(empty):
        return web.json_response({"error": "This PyTorch has no public host-cache release API"}, status=501)
    gc.collect()
    torch.cuda.synchronize()
    before = torch.cuda.memory.host_memory_stats()
    empty()
    after = torch.cuda.memory.host_memory_stats()
    return web.json_response({"trimmed": True, "allocatedBefore": before.get("allocated_bytes.current"),
                             "allocatedAfter": after.get("allocated_bytes.current"), "activeBefore": before.get("active_bytes.current"),
                             "activeAfter": after.get("active_bytes.current")})
