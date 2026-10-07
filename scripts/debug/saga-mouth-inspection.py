import base64
import io
import json
import pathlib
from PIL import Image, ImageDraw

OUT = pathlib.Path("C:/dev/story-orchestrator/test/measurements/v2.7/saga-main-cast")
samples = json.loads((OUT / "samples.json").read_text(encoding="utf-8"))
boxes = {"Ronan": (240, 10, 320, 320), "Javon": (240, 0, 320, 260), "Natalia": (240, 35, 320, 280), "Tobias": (340, 0, 320, 280)}
targets = [("Ronan", "neutral"), ("Ronan", "happy"), ("Ronan", "smirk"), ("Javon", "neutral"), ("Javon", "proud"), ("Natalia", "pained"), ("Natalia", "proud"), ("Tobias", "neutral")]
sheet = Image.new("RGB", (1200, len(targets)*300), "#263545")
draw = ImageDraw.Draw(sheet)

def image(data):
    return Image.open(io.BytesIO(base64.b64decode(data.split(",", 1)[-1]))).convert("RGBA")

for index, (name, label) in enumerate(targets):
    sample = next(row for row in samples if row["name"] == name and row["label"] == label)
    raw = json.loads((OUT / f"{name}-{label}-talk-raw.json").read_text(encoding="utf-8"))
    x, y, width, height = boxes[name]
    original = image(sample["base"])
    composite = original.copy()
    composite.alpha_composite(image(sample["talk"]))
    parts = [original.crop((x, y, x+width, y+height)), image(raw["raw"]).resize((width, height)), composite.crop((x, y, x+width, y+height))]
    for column, part in enumerate(parts):
        part.thumbnail((360, 270))
        sheet.paste(part, (column*400+20, index*300+25), part)
        draw.text((column*400+5, index*300+5), f"{name}/{label} — {['base','raw','composite'][column]}", fill="white")
sheet.save(OUT / "mouth-inspection.png")
