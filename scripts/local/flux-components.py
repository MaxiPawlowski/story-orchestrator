import hashlib
import json
import os
import struct
import sys

source = sys.argv[1]
with open(source, "rb") as handle:
    length = struct.unpack("<Q", handle.read(8))[0]
    header = json.loads(handle.read(length))
    start = length + 8
groups = {}
for name in header:
    if name != "__metadata__":
        prefix = ".".join(name.split(".")[:2])
        groups.setdefault(prefix, []).append(name)
if len(sys.argv) == 2:
    print(json.dumps({key: {"count": len(names), "examples": names[:2]} for key, names in groups.items()}, indent=2))
    sys.exit(0)
destination = sys.argv[2]
os.makedirs(destination, exist_ok=True)
mapping = {"clip_l": "text_encoders.clip_l.transformer.", "t5xxl": "text_encoders.t5xxl.transformer.", "ae": "vae."}
records = []
for label, prefix in mapping.items():
    entries = [(name, data) for name, data in header.items() if name.startswith(prefix)]
    if not entries:
        raise RuntimeError("No tensors found for " + prefix)
    output = os.path.join(destination, label + ".safetensors")
    if os.path.exists(output):
        raise RuntimeError("Refusing to overwrite " + output)
    target = {"__metadata__": {"format": "pt"}}
    offset = 0
    for name, data in entries:
        size = data["data_offsets"][1] - data["data_offsets"][0]
        target[name[len(prefix):]] = {**data, "data_offsets": [offset, offset + size]}
        offset += size
    encoded = json.dumps(target, separators=(",", ":")).encode()
    encoded += b" " * ((8 - len(encoded) % 8) % 8)
    digest = hashlib.sha256()
    with open(source, "rb") as reader, open(output, "xb") as writer:
        first = struct.pack("<Q", len(encoded)) + encoded
        writer.write(first)
        digest.update(first)
        for name, data in entries:
            reader.seek(start + data["data_offsets"][0])
            remaining = data["data_offsets"][1] - data["data_offsets"][0]
            while remaining:
                chunk = reader.read(min(remaining, 4 * 1024 * 1024))
                if not chunk:
                    raise RuntimeError("Truncated source tensor")
                writer.write(chunk)
                digest.update(chunk)
                remaining -= len(chunk)
    records.append({"file": output, "tensorBytes": offset, "tensors": len(entries), "sha256": digest.hexdigest()})
with open(os.path.join(destination, "provenance.json"), "w") as writer:
    json.dump({"source": source, "operation": "byte-identical component extraction, no quantization", "components": records}, writer, indent=2)
print(json.dumps(records, indent=2))
