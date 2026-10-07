import hashlib
import json
import pathlib
from PIL import Image, ImageDraw

ROOT = pathlib.Path("C:/dev/adolion-campaign")
ART = pathlib.Path("C:/dev/so-lanes/6/adolion-fresh/sprites-40dd2d0f0a4c/campaign/sprites")
OUT = pathlib.Path(__file__).resolve().parents[2] / "test/sessions/evidence/measurements-v2.7/saga-main-cast"
NAMES = ["Belle", "Dalan", "Tobias", "Natalia", "Shiya", "Ronan", "Javon", "Eriana"]
OUT.mkdir(parents=True, exist_ok=True)
rows = []
sheet = Image.new("RGB", (1600, 900), "#263545")
draw = ImageDraw.Draw(sheet)
faces = Image.new("RGB", (1600, 800), "#263545")
face_draw = ImageDraw.Draw(faces)
for index, name in enumerate(NAMES):
    spec_file = next(p for p in (ROOT / "campaign" / "sprites").glob("*/sets.json") if json.loads(p.read_text(encoding="utf-8"))["name"] == name)
    spec = json.loads(spec_file.read_text(encoding="utf-8"))
    packs = []
    for entry in spec["sets"]:
        directory = ART / spec_file.parent.name / "sprites" / entry["id"]
        files = []
        for path in sorted(directory.glob("*.png")):
            data = path.read_bytes()
            with Image.open(path) as image:
                files.append({"label": path.stem, "sha256": hashlib.sha256(data).hexdigest(), "width": image.width, "height": image.height})
        packs.append({"id": entry["id"], "labels": files, "outfitLength": len(entry["outfit"])})
    with Image.open(ART / spec_file.parent.name / "sprites" / "default" / "neutral.png") as image:
        image = image.convert("RGBA")
        face = image.crop((200, 0, 600, 400))
        fx, fy = (index % 4) * 400, (index // 4) * 400
        faces.paste(face, (fx, fy), face)
        face_draw.text((fx+5, fy+5), name, fill="white")
        for height in range(50, 400, 50):
            face_draw.line((fx, fy+height, fx+400, fy+height), fill="#697989")
            face_draw.text((fx+4, fy+height), str(height), fill="white")
        image.thumbnail((380, 410))
        x, y = (index % 4) * 400, (index // 4) * 450
        sheet.paste(image, (x + (400-image.width)//2, y+30), image)
        draw.text((x+10, y+5), name, fill="white")
    rows.append({"name": name, "slug": spec_file.parent.name, "folder": spec.get("folder", name), "sets": packs})
sheet.save(OUT / "main-cast.png")
faces.save(OUT / "main-faces.png")
(OUT / "inventory.json").write_text(json.dumps(rows, indent=2))
print(json.dumps({"characters": len(rows), "sets": sum(len(r["sets"]) for r in rows), "baseExpressions": sum(len(r["sets"][0]["labels"]) for r in rows), "out": str(OUT)}))
