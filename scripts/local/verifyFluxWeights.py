import hashlib
import json
import os
import sys

root = sys.argv[1]
expected = {"flux1-dev-Q5_K_S.gguf": "aa76146ca0f1b09c67e0c3fcef18be3a375837ecd5aaa021d3e9ebc558bd68f9",
    "svdq-int4_r32-flux.1-dev.safetensors": "26953e71e2f3c270bb1ccaf044122890056375b5d295c6fea876b0d594f207c2"}
rows = []
for name, target in expected.items():
    digest = hashlib.sha256()
    file = os.path.join(root, name)
    with open(file, "rb") as reader:
        while chunk := reader.read(8 * 1024 * 1024):
            digest.update(chunk)
    actual = digest.hexdigest()
    if actual != target:
        raise RuntimeError("Downloaded model hash mismatch: " + name)
    rows.append({"name": name, "bytes": os.path.getsize(file), "sha256": actual})
print(json.dumps(rows, indent=2))
if len(sys.argv) > 2:
    with open(sys.argv[2], "w") as writer:
        json.dump(rows, writer, indent=2)
