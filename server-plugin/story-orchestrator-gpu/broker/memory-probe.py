import ctypes
import json
import time
import sys
import threading
import psutil

class MemoryStatus(ctypes.Structure):
    _fields_ = [("length", ctypes.c_uint32), ("load", ctypes.c_uint32)] + [(name, ctypes.c_uint64) for name in
        ["totalPhysical", "availablePhysical", "totalPageFile", "availablePageFile", "totalVirtual", "availableVirtual", "extendedVirtual"]]

class GpuMemory(ctypes.Structure):
    _fields_ = [(name, ctypes.c_uint64) for name in ["total", "free", "used"]]

nvml = ctypes.CDLL("C:/Windows/System32/nvml.dll")
if nvml.nvmlInit_v2() != 0:
    raise RuntimeError("NVML initialization failed")
device = ctypes.c_void_p()
if nvml.nvmlDeviceGetHandleByIndex_v2(0, ctypes.byref(device)) != 0:
    raise RuntimeError("The GPU cannot be read")
uuid = ctypes.create_string_buffer(96)
nvml.nvmlDeviceGetUUID(device, uuid, 96)
process_id = None

def commands():
    global process_id
    for line in sys.stdin:
        process_id = json.loads(line).get("pid")

threading.Thread(target=commands, daemon=True).start()
while True:
    host = MemoryStatus()
    host.length = ctypes.sizeof(host)
    gpu = GpuMemory()
    if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(host)) or nvml.nvmlDeviceGetMemoryInfo(device, ctypes.byref(gpu)) != 0:
        raise RuntimeError("Memory telemetry failed")
    process = None
    if process_id:
        try:
            info = psutil.Process(process_id).memory_info()
            process = {"pid": process_id, "rssMiB": info.rss / 1048576, "privateMiB": getattr(info, "private", 0) / 1048576}
        except psutil.Error:
            pass
    print(json.dumps({"at": time.time() * 1000, "highCadence": True, "process": process,
        "host": {"totalMiB": host.totalPhysical / 1048576, "availableMiB": host.availablePhysical / 1048576,
            "commitFreeMiB": host.availablePageFile / 1048576},
        "gpus": [{"uuid": uuid.value.decode(), "totalMiB": gpu.total / 1048576, "freeMiB": gpu.free / 1048576, "usedMiB": gpu.used / 1048576}]}), flush=True)
    time.sleep(0.1)
