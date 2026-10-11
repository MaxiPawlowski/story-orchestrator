import argparse
import json
import math
import sys
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SCALE = 4
WIDTH, HEIGHT = 400, 512

LOOKS = {
    "amber": {
        "skin": (226, 176, 130), "skin_shade": (200, 146, 104), "lip": (176, 82, 76),
        "hair": (46, 38, 58), "hair_light": (74, 62, 92), "cloth": (38, 110, 120), "cloth_edge": (24, 78, 88),
        "iris": (64, 142, 96), "head": (112, 138), "eye_y": 238, "eye_dx": 54, "eye_w": 29, "eye_h": 17,
        "iris_r": 13, "brow_dy": 27, "brow_w": 28, "mouth_y": 322, "mouth_w": 25, "style": "long", "blush": 0.35,
    },
    "slate": {
        "skin": (246, 216, 192), "skin_shade": (226, 184, 160), "lip": (200, 108, 112),
        "hair": (150, 78, 44), "hair_light": (188, 110, 64), "cloth": (120, 36, 58), "cloth_edge": (84, 22, 40),
        "iris": (110, 72, 44), "head": (122, 134), "eye_y": 242, "eye_dx": 50, "eye_w": 25, "eye_h": 19,
        "iris_r": 14, "brow_dy": 30, "brow_w": 24, "mouth_y": 318, "mouth_w": 20, "style": "bob", "blush": 0.8,
    },
    "ember": {
        "skin": (148, 98, 70), "skin_shade": (118, 74, 52), "lip": (110, 52, 50),
        "hair": (214, 218, 226), "hair_light": (240, 242, 248), "cloth": (52, 56, 66), "cloth_edge": (30, 32, 40),
        "iris": (214, 148, 52), "head": (108, 142), "eye_y": 232, "eye_dx": 56, "eye_w": 30, "eye_h": 11,
        "iris_r": 10, "brow_dy": 22, "brow_w": 30, "mouth_y": 326, "mouth_w": 27, "style": "crop", "blush": 0.0,
    },
}


def scaled(points):
    return [(x * SCALE, y * SCALE) for x, y in points]


def ellipse(draw, cx, cy, rx, ry, fill):
    draw.ellipse((int((cx - rx) * SCALE), int((cy - ry) * SCALE), int((cx + rx) * SCALE), int((cy + ry) * SCALE)), fill=fill)


def eye_shape(cx, cy, half_w, half_h, tilt, side, steps=40):
    top, bottom = [], []
    for i in range(steps + 1):
        t = -1 + 2 * i / steps
        x = cx + t * half_w
        slope = tilt * t * side
        top.append((x, cy - half_h * (1 - t * t) ** 0.75 + slope * half_w * 0.18))
        bottom.append((x, cy + half_h * 0.62 * (1 - t * t) ** 0.9 + slope * half_w * 0.18))
    return top, bottom


def hair_back(draw, spec, color):
    cx, cy = 200, 215
    rx, ry = spec["head"]
    style = spec["style"]
    if style == "long":
        ellipse(draw, cx, cy - 8, rx + 26, ry + 22, color)
        draw.polygon(scaled([(70, 230), (330, 230), (352, 470), (300, 500), (100, 500), (48, 470)]), fill=color)
    elif style == "bob":
        ellipse(draw, cx, cy - 4, rx + 24, ry + 14, color)
        draw.polygon(scaled([(78, 230), (322, 230), (332, 340), (300, 356), (100, 356), (68, 340)]), fill=color)
    else:
        ellipse(draw, cx, cy - 6, rx + 6, ry + 5, color)


def hair_front(draw, spec, color, light):
    cx, cy = 200, 215
    rx, ry = spec["head"]
    style = spec["style"]
    mask = Image.new("L", (WIDTH * SCALE, HEIGHT * SCALE), 0)
    m = ImageDraw.Draw(mask)
    ellipse(m, cx, cy, rx + 3, ry + 3, 255)
    cap = Image.new("L", mask.size, 0)
    c = ImageDraw.Draw(cap)
    if style == "long":
        c.polygon(scaled([(60, 0), (340, 0), (340, 176), (318, 192), (300, 172), (278, 196), (254, 168), (230, 190), (200, 166),
                          (170, 190), (146, 168), (122, 196), (100, 172), (82, 192), (60, 176)]), fill=255)
        for side in (-1, 1):
            c.polygon(scaled([(cx + side * (rx + 2), 160), (cx + side * (rx - 28), 190), (cx + side * (rx - 22), 330),
                              (cx + side * (rx + 8), 470), (cx + side * (rx + 40), 470), (cx + side * (rx + 40), 190)]), fill=255)
    elif style == "bob":
        c.polygon(scaled([(60, 0), (340, 0), (340, 190), (322, 212), (300, 200), (262, 176), (214, 168), (168, 176), (136, 190), (112, 170),
                          (96, 200), (78, 212), (60, 190)]), fill=255)
        for side in (-1, 1):
            c.polygon(scaled([(cx + side * (rx - 4), 170), (cx + side * (rx - 24), 210), (cx + side * (rx - 18), 330),
                              (cx + side * (rx + 22), 352), (cx + side * (rx + 36), 330), (cx + side * (rx + 36), 190)]), fill=255)
    else:
        c.polygon(scaled([(60, 0), (340, 0), (340, 170), (318, 178), (308, 150), (262, 138), (200, 134), (138, 138), (92, 150), (82, 178), (60, 170)]), fill=255)
    region = Image.new("L", mask.size, 0)
    r = ImageDraw.Draw(region)
    if style == "long":
        ellipse(r, cx, cy - 8, rx + 26, ry + 22, 255)
        r.rectangle((0, 170 * SCALE, WIDTH * SCALE, 470 * SCALE), fill=255)
    elif style == "bob":
        ellipse(r, cx, cy - 4, rx + 24, ry + 14, 255)
        r.rectangle((0, 170 * SCALE, WIDTH * SCALE, 356 * SCALE), fill=255)
    else:
        ellipse(r, cx, cy, rx + 8, ry + 8, 255)
    shape = Image.composite(cap, Image.new("L", mask.size, 0), region)
    layer = Image.new("RGBA", mask.size, color + (0,))
    layer.putalpha(shape)
    highlight = Image.new("RGBA", mask.size, light + (0,))
    h = Image.new("L", mask.size, 0)
    hd = ImageDraw.Draw(h)
    for k in range(4):
        hd.arc((int((cx - 90 + k * 8) * SCALE), int((60 + k * 10) * SCALE), int((cx + 90 - k * 8) * SCALE), int((220 - k * 10) * SCALE)),
               200, 330, fill=150, width=5 * SCALE // 2)
    highlight.putalpha(Image.composite(h, Image.new("L", mask.size, 0), shape))
    return layer, highlight


def build(name):
    spec = LOOKS[name]
    rx, ry = spec["head"]
    cx, cy = 200, 215
    canvas = Image.new("RGBA", (WIDTH * SCALE, HEIGHT * SCALE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    hair_back(draw, spec, spec["hair"])
    ellipse(draw, 200, 520, 205, 135, spec["cloth"])
    draw.polygon(scaled([(0, 512), (0, 440), (60, 410), (140, 392), (260, 392), (340, 410), (400, 440), (400, 512)]), fill=spec["cloth"])
    draw.polygon(scaled([(140, 392), (200, 452), (260, 392), (244, 388), (200, 424), (156, 388)]), fill=spec["cloth_edge"])
    draw.rectangle((int(166 * SCALE), int(318 * SCALE), int(234 * SCALE), int(410 * SCALE)), fill=spec["skin_shade"])
    ellipse(draw, 200, 410, 36, 20, spec["skin_shade"])
    draw.polygon(scaled([(150, 395), (200, 446), (250, 395), (236, 392), (200, 428), (164, 392)]), fill=spec["cloth_edge"])
    for side in (-1, 1):
        ellipse(draw, cx + side * (rx - 1), 242, 15, 26, spec["skin"])
        ellipse(draw, cx + side * (rx - 3), 244, 7, 14, spec["skin_shade"])
    ellipse(draw, cx, cy, rx, ry, spec["skin"])
    jaw = spec["skin"]
    draw.polygon(scaled([(cx - rx * 0.78, cy + ry * 0.55), (cx, cy + ry + 0.5), (cx + rx * 0.78, cy + ry * 0.55)]), fill=jaw)
    if spec["blush"] > 0:
        blush = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        bd = ImageDraw.Draw(blush)
        for side in (-1, 1):
            ellipse(bd, cx + side * (spec["eye_dx"] + 8), 282, 20, 11, (232, 110, 120, int(110 * spec["blush"])))
        canvas.alpha_composite(blush)
        draw = ImageDraw.Draw(canvas)
    truth = {"eyes": [], "mouth": {}, "iris": list(spec["iris"]), "eye_white": [250, 250, 252]}
    for index, side in enumerate((-1, 1)):
        ex, ey = cx + side * spec["eye_dx"], spec["eye_y"]
        top, bottom = eye_shape(ex, ey, spec["eye_w"], spec["eye_h"], 0.5, side)
        outline = top + bottom[::-1]
        draw.polygon(scaled(outline), fill=(250, 250, 252))
        mask = Image.new("L", canvas.size, 0)
        ImageDraw.Draw(mask).polygon(scaled(outline), fill=255)
        iris_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        idraw = ImageDraw.Draw(iris_layer)
        ix, ir = ex + side * -1.5, spec["iris_r"]
        ellipse(idraw, ix, ey + 0.5, ir, ir * 1.04, spec["iris"])
        ellipse(idraw, ix, ey + 0.5, ir * 0.52, ir * 0.54, (20, 18, 26))
        ellipse(idraw, ix - ir * 0.34, ey - ir * 0.34, ir * 0.2, ir * 0.2, (255, 255, 255))
        clipped = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        clipped.paste(iris_layer, (0, 0), mask)
        canvas.alpha_composite(clipped)
        draw = ImageDraw.Draw(canvas)
        lash = (30, 24, 34)
        draw.line(scaled(top), fill=lash, width=int(4.2 * SCALE), joint="curve")
        outer = top[-1] if side == 1 else top[0]
        draw.line(scaled([outer, (outer[0] + side * 7, outer[1] - 4)]), fill=lash, width=int(3.6 * SCALE))
        draw.line(scaled(bottom), fill=spec["skin_shade"], width=int(1.4 * SCALE))
        crease = [(x, y - 11 - 6 * (1 - ((x - ex) / spec["eye_w"]) ** 2)) for x, y in top[6:-6]]
        draw.line(scaled(crease), fill=spec["skin_shade"], width=int(1.2 * SCALE))
        truth["eyes"].append({"white": outline, "top": top, "bottom": bottom, "lash_width": 4.2, "lid_width": 1.4})
        brow_y = ey - spec["brow_dy"]
        brow = [(ex + t * spec["brow_w"], brow_y - 9 * (1 - t * t) + side * t * 3) for t in [-1 + i / 8 for i in range(17)]]
        draw.line(scaled(brow), fill=spec["hair"] if spec["style"] != "crop" else (150, 154, 164), width=int(5 * SCALE), joint="curve")
    draw.line(scaled([(cx - 1, 262), (cx - 4, 290)]), fill=spec["skin_shade"], width=int(3 * SCALE))
    draw.arc((int((cx - 12) * SCALE), int(284 * SCALE), int((cx + 12) * SCALE), int(300 * SCALE)), 20, 160, fill=spec["skin_shade"], width=int(3 * SCALE))
    my, mw = spec["mouth_y"], spec["mouth_w"]
    lip = [(cx + t * mw, my - 5 * (1 - abs(t)) ** 0.8 + 3 * t * t * 0) for t in [-1 + i / 12 for i in range(25)]]
    lower = [(cx + t * mw, my + 7 * (1 - t * t) ** 0.9) for t in [-1 + i / 12 for i in range(25)]]
    draw.polygon(scaled(lip + lower[::-1]), fill=spec["lip"])
    draw.line(scaled([(cx - mw, my), (cx, my + 1.2), (cx + mw, my)]), fill=(70, 30, 34), width=int(2.2 * SCALE))
    truth["mouth"] = {"cx": cx, "cy": my, "halfLen": mw}
    layer, highlight = hair_front(draw, spec, spec["hair"], spec["hair_light"])
    canvas.alpha_composite(layer)
    canvas.alpha_composite(highlight)
    return canvas.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS), truth


def main():
    parser = argparse.ArgumentParser(description="Owned geometric head-and-shoulders busts for rig authoring tests.")
    parser.add_argument("look", choices=sorted(LOOKS))
    parser.add_argument("project", type=Path)
    parser.add_argument("--truth", type=Path)
    args = parser.parse_args()
    project = args.project.resolve()
    if not project.is_relative_to(ROOT):
        print("project must stay inside the worktree", file=sys.stderr)
        return 1
    if (project / "source.png").exists():
        print("source.png exists; choose a new project", file=sys.stderr)
        return 1
    project.mkdir(parents=True, exist_ok=True)
    image, truth = build(args.look)
    image.save(project / "source.png")
    if args.truth:
        truth_path = args.truth.resolve()
        if not truth_path.is_relative_to(ROOT):
            print("truth must stay inside the worktree", file=sys.stderr)
            return 1
        truth_path.parent.mkdir(parents=True, exist_ok=True)
        truth_path.write_text(json.dumps(truth, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {project / 'source.png'} ({WIDTH} x {HEIGHT})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
