import base64
import io
import json
import pathlib
from PIL import Image, ImageDraw

OUT = pathlib.Path("C:/dev/story-orchestrator/test/measurements/v2.7/saga-main-cast")
samples = json.loads((OUT / "samples.json").read_text(encoding="utf-8"))
names = list(dict.fromkeys(row["name"] for row in samples))
boxes = {"Belle": (221, 11, 320, 320), "Dalan": (340, 0, 320, 280), "Tobias": (340, 0, 320, 280),
         "Natalia": (240, 35, 320, 280), "Shiya": (220, 70, 320, 280), "Ronan": (240, 10, 320, 320),
         "Javon": (240, 0, 320, 260), "Eriana": (240, 85, 320, 300)}
sheet = Image.new("RGB", (1800, len(names) * 250), "#263545")
draw = ImageDraw.Draw(sheet)
for index, name in enumerate(names):
    row = next(s for s in samples if s["name"] == name and s["label"] == "neutral")
    for column, kind in enumerate(["base", "talk", "blink"]):
        x, y = column * 600, index * 250
        draw.text((x+8, y+5), f"{name} — {kind}", fill="white")
        if not row[kind]:
            continue
        image = Image.open(io.BytesIO(base64.b64decode(row[kind].split(",", 1)[1]))).convert("RGBA")
        if kind != "base":
            base = Image.open(io.BytesIO(base64.b64decode(row["base"].split(",", 1)[1]))).convert("RGBA")
            base.alpha_composite(image)
            image = base
        image = image.crop((200, 0, 640, 400))
        image.thumbnail((440, 225))
        sheet.paste(image, (x+80, y+25), image)
sheet.save(OUT / "neutral-review.png")
for name in names:
    rows = [row for row in samples if row["name"] == name]
    detail = Image.new("RGB", (900, len(rows) * 220), "#263545")
    title = ImageDraw.Draw(detail)
    x, y, width, height = boxes[name]
    for index, row in enumerate(rows):
        for column, kind in enumerate(["base", "talk", "blink"]):
            title.text((column*300+5, index*220+5), f"{row['label']} / {kind}", fill="white")
            image = Image.open(io.BytesIO(base64.b64decode(row["base"].split(",", 1)[1]))).convert("RGBA")
            if kind != "base" and row[kind]:
                overlay = Image.open(io.BytesIO(base64.b64decode(row[kind].split(",", 1)[1]))).convert("RGBA")
                image.alpha_composite(overlay)
            image = image.crop((x, y, x+width, y+height))
            image.thumbnail((280, 195))
            detail.paste(image, (column*300+10, index*220+25), image)
    detail.save(OUT / f"review-{name}.png")
print(str(OUT / "neutral-review.png"))
