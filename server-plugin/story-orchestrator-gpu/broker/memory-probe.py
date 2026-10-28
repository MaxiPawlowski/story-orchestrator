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
gpu_pids = []
gpu_changed = threading.Event()

class PdhValue(ctypes.Structure):
    _fields_ = [("status", ctypes.c_uint32), ("value", ctypes.c_longlong)]

class PdhItem(ctypes.Structure):
    _fields_ = [("name", ctypes.c_wchar_p), ("value", PdhValue)]

pdh = ctypes.WinDLL("pdh.dll")

class GpuProcessMemory:
    def __init__(self):
        self.query = None
        self.counters = {}

    def watch(self, pids):
        if self.query:
            pdh.PdhCloseQuery(self.query)
        self.query, self.counters = ctypes.c_void_p(), {}
        if pdh.PdhOpenQueryW(None, None, ctypes.byref(self.query)) != 0:
            self.query = None
            return
        for pid in pids:
            for field, name in (("sharedMiB", "Shared Usage"), ("dedicatedMiB", "Dedicated Usage")):
                handle = ctypes.c_void_p()
                if pdh.PdhAddEnglishCounterW(self.query, f"\\GPU Process Memory(pid_{pid}_*)\\{name}", None, ctypes.byref(handle)) == 0:
                    self.counters[(pid, field)] = handle

    def read(self):
        if not self.query or pdh.PdhCollectQueryData(self.query) != 0:
            return {}
        out = {}
        for (pid, field), handle in self.counters.items():
            size, count = ctypes.c_uint32(0), ctypes.c_uint32(0)
            pdh.PdhGetFormattedCounterArrayW(handle, 0x400, ctypes.byref(size), ctypes.byref(count), None)
            if not size.value:
                continue
            buffer = (ctypes.c_byte * size.value)()
            if pdh.PdhGetFormattedCounterArrayW(handle, 0x400, ctypes.byref(size), ctypes.byref(count), buffer) != 0:
                continue
            items = ctypes.cast(buffer, ctypes.POINTER(PdhItem))
            out.setdefault(str(pid), {})[field] = sum(items[i].value.value for i in range(count.value)) / 1048576
        return out

def commands():
    global process_id, gpu_pids
    for line in sys.stdin:
        message = json.loads(line)
        if "pid" in message:
            process_id = message.get("pid")
        if "gpu" in message:
            gpu_pids = [int(pid) for pid in message.get("gpu") or []]
            gpu_changed.set()

threading.Thread(target=commands, daemon=True).start()
gpu_memory = GpuProcessMemory()
gpu_readings = {}
gpu_read_at = 0
while True:
    if gpu_changed.is_set():
        gpu_changed.clear()
        gpu_memory.watch(gpu_pids)
        gpu_readings, gpu_read_at = {}, 0
    if gpu_pids and time.time() - gpu_read_at >= 1:
        gpu_readings, gpu_read_at = gpu_memory.read(), time.time()
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
    print(json.dumps({"at": time.time() * 1000, "highCadence": True, "process": process, "gpuProcesses": gpu_readings,
        "host": {"totalMiB": host.totalPhysical / 1048576, "availableMiB": host.availablePhysical / 1048576,
            "commitFreeMiB": host.availablePageFile / 1048576},
        "gpus": [{"uuid": uuid.value.decode(), "totalMiB": gpu.total / 1048576, "freeMiB": gpu.free / 1048576, "usedMiB": gpu.used / 1048576}]}), flush=True)
    time.sleep(0.1)
