import json
import sys
from PIL import Image, ImageDraw
import numpy as np

EDGES = [[1, 2], [2, 3], [3, 4], [1, 5], [5, 6], [6, 7], [1, 8], [8, 9], [9, 10], [1, 11], [11, 12], [12, 13], [1, 0], [0, 14], [14, 16], [0, 15], [15, 17]]
COLORS = ["#ff0000", "#ff5500", "#ffaa00", "#ffff00", "#aaff00", "#55ff00", "#00ff00", "#00ff55", "#00ffaa", "#00ffff", "#00aaff", "#0055ff", "#0000ff", "#5500ff",
          "#aa00ff", "#ff00ff", "#ff00aa", "#ff0055"]


def skeleton(args):
    points = json.load(open(args["points"]))
    width, height = points["canvas"]
    image = Image.new("RGB", (width, height), "black")
    draw = ImageDraw.Draw(image)
    line = max(3, round(width / 100))
    dot = max(4, width / 90)
    for index, (a, b) in enumerate(EDGES):
        left, right = points["points"][a], points["points"][b]
        if left and right:
            draw.line([tuple(left), tuple(right)], fill=COLORS[index], width=line)
    for index, point in enumerate(points["points"]):
        if point:
            draw.ellipse([point[0] - dot, point[1] - dot, point[0] + dot, point[1] + dot], fill=COLORS[index])
    image.save(args["out"])
    return {"width": width, "height": height}


def alpha_box(args):
    array = np.array(Image.open(args["image"]).convert("RGBA"))
    ys, xs = np.nonzero(array[:, :, 3] > 16)
    if not len(xs):
        return {"error": "no visible subject"}
    return {"x": int(xs.min()), "y": int(ys.min()), "width": int(xs.max() - xs.min() + 1), "height": int(ys.max() - ys.min() + 1),
            "canvas": [array.shape[1], array.shape[0]]}


def crop(args):
    box = args["box"]
    source = Image.open(args["image"]).convert("RGBA")
    canvas = Image.new("RGBA", (box["width"], box["height"]), (255, 255, 255, 255))
    canvas.alpha_composite(source, (-box["x"], -box["y"]))
    canvas.convert("RGB").save(args["out"])
    return {"width": box["width"], "height": box["height"]}


def paste(args):
    box = args["box"]
    base = np.array(Image.open(args["base"]).convert("RGBA")).astype(np.float64)
    edit = Image.open(args["edit"]).convert("RGB").resize((box["width"], box["height"]), Image.BILINEAR)
    edit = np.array(edit).astype(np.float64)
    ys, xs = np.mgrid[0:box["height"], 0:box["width"]]
    distance = np.sqrt(((xs + 0.5 - box["width"] / 2) / (box["width"] / 2)) ** 2 + ((ys + 0.5 - box["height"] / 2) / (box["height"] / 2)) ** 2)
    weight = np.clip((1 - distance) / 0.12, 0, 1)[:, :, None]
    region = base[box["y"]:box["y"] + box["height"], box["x"]:box["x"] + box["width"], :3]
    out = base.copy()
    out[box["y"]:box["y"] + box["height"], box["x"]:box["x"] + box["width"], :3] = np.round(region * (1 - weight) + edit * weight)
    result = out.astype(np.uint8)
    Image.fromarray(result, "RGBA").save(args["out"])
    before = np.array(Image.open(args["base"]).convert("RGBA")).astype(int)
    inside = (slice(box["y"], box["y"] + box["height"]), slice(box["x"], box["x"] + box["width"]))
    delta = np.abs(before[:, :, :3] - result.astype(int)[:, :, :3]).max(axis=2)
    opaque = before[:, :, 3] > 8
    changed = int(((delta > 4) & opaque)[inside].sum())
    return {"changed": changed}


def resize_to(args):
    base = Image.open(args["base"])
    image = Image.open(args["image"]).convert("RGBA").resize(base.size, Image.BILINEAR)
    image.save(args["out"])
    return {"width": base.size[0], "height": base.size[1]}


def qa(args):
    array = np.array(Image.open(args["image"]).convert("RGBA"))
    alpha = array[:, :, 3]
    transparent = bool((alpha <= 8).any())
    visible = alpha > 8
    colours = len({tuple(c) for c in array[visible][:4096, :3]}) if visible.any() else 0
    reasons = []
    if not transparent or not visible.any():
        reasons.append("needs a visible subject and a transparent background")
    if colours < 8:
        reasons.append("blank or nearly single-colour")
    if visible.any():
        ys, xs = np.nonzero(visible)
        h, w = alpha.shape
        if ys.min() <= 1 or ys.max() >= h - 2:
            reasons.append("head or feet touch the top or bottom edge")
        if xs.min() <= 1 or xs.max() >= w - 2:
            reasons.append("subject touches a side edge")
        coverage = float(visible.mean())
        if coverage < 0.04:
            reasons.append("subject smaller than 4 percent of the canvas")
    return {"ok": not reasons, "reasons": reasons, "width": int(array.shape[1]), "height": int(array.shape[0])}


def sheet(args):
    cell = args.get("cell", 384)
    items = args["items"]
    cols = len(items)
    out = Image.new("RGB", (cols * cell, cell + 24), "white")
    draw = ImageDraw.Draw(out)
    for index, item in enumerate(items):
        image = Image.open(item["path"]).convert("RGBA")
        if item.get("box"):
            b = item["box"]
            image = image.crop((b["x"], b["y"], b["x"] + b["width"], b["y"] + b["height"]))
        ratio = min(cell / image.width, cell / image.height)
        image = image.resize((max(1, round(image.width * ratio)), max(1, round(image.height * ratio))), Image.LANCZOS)
        tile = Image.new("RGBA", (cell, cell), (235, 235, 235, 255))
        tile.alpha_composite(image, ((cell - image.width) // 2, (cell - image.height) // 2))
        out.paste(tile.convert("RGB"), (index * cell, 24))
        draw.text((index * cell + 4, 6), item["label"], fill="black")
    out.save(args["out"])
    return {"width": out.size[0], "height": out.size[1]}


COMMANDS = {"skeleton": skeleton, "alpha-box": alpha_box, "crop": crop, "paste": paste, "resize-to": resize_to, "qa": qa, "sheet": sheet}

if __name__ == "__main__":
    print(json.dumps(COMMANDS[sys.argv[1]](json.loads(sys.argv[2]))))
