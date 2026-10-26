import json
import math
import sys

import numpy
from PIL import Image


def stats(a_path, b_path):
    a = numpy.asarray(Image.open(a_path).convert("RGB"), dtype=numpy.int16)
    b = numpy.asarray(Image.open(b_path).convert("RGB"), dtype=numpy.int16)
    if a.shape != b.shape:
        return {"sizeMatch": False, "maxAbs": None, "meanAbs": None, "pctChanged": None, "psnr": None}
    diff = numpy.abs(a - b)
    mse = float(numpy.mean(diff.astype(numpy.float64) ** 2))
    return {
        "sizeMatch": True,
        "maxAbs": int(diff.max()),
        "meanAbs": round(float(diff.mean()), 4),
        "pctChanged": round(100.0 * float(numpy.mean(diff.max(axis=2) > 0)), 3),
        "psnr": 999.0 if mse == 0 else round(10 * math.log10(255 * 255 / mse), 2),
    }


def main():
    pairs = json.load(open(sys.argv[1], encoding="utf-8"))
    out = [{**pair, **stats(pair["a"], pair["b"])} for pair in pairs]
    json.dump(out, open(sys.argv[2], "w", encoding="utf-8"), indent=1)


if __name__ == "__main__":
    main()
