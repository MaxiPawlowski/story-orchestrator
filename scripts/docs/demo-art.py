"""Synthetic showcase art for the demo story (plan 46 W4), rendered on the local ComfyUI.

Usage: python -I scripts/docs/demo-art.py <step> [--force]
  chars        base full-body cut-outs (Qwen-Image-2512 + BiRefNet toonout)
  looks        look changes, torso inpainted over the base (face untouched)
  poses        pose variants (text to image, same character text and seed)
  busts        head-and-shoulders crops for the live head (needs the landmark server)
  expressions  happy / angry / worried, face inpainted over each bust
  frames       blink + 4 mouth shapes (talk, talk2, mouth_o, mouth_wide) per bust, masked to the rig's eyes/mouth
               (needs published busts and rigs: publish, demo-rigs.mjs, frames, publish again)
  publish      compressed files + sidecars into docs/guide/assets/showcase/, demo.json for the animated-character page
  all          every step in order
Scene backgrounds come from the shared plan 45 set (docs/guide/assets/showcase/backdrops/), not from here.
Raw renders land in .build/demo-art/raw (gitignored); published files in docs/guide/assets/showcase/.
Every job waits for an empty ComfyUI queue, then holds a GPU broker lease (SO_GPU_BROKER, default the local
controller on :18888; SO_GPU_BROKER=off skips it) while it renders. One job at a time. Nothing is downloaded.
"""

import base64
import hashlib
import io
import json
import math
import os
import random
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RAW = os.path.join(ROOT, ".build", "demo-art", "raw")
OUT = os.path.join(ROOT, "docs", "guide", "assets", "showcase")
COMFY = os.environ.get("SO_COMFY_URL", "http://127.0.0.1:8188")
LANDMARKS = os.environ.get("SO_LANDMARKS_URL", "http://127.0.0.1:8096")
BROKER = os.environ.get("SO_GPU_BROKER", "http://127.0.0.1:18888")
LEASE_PATIENCE_S = int(os.environ.get("SO_LEASE_PATIENCE_S", "3600"))
NEED_GPU_MIB = int(os.environ.get("SO_DEMO_NEED_GPU_MIB", "21000"))

MODEL = {"unet": "qwen_image_2512_fp8_e4m3fn.safetensors", "clip": "qwen_2.5_vl_7b_fp8_scaled.safetensors", "vae": "qwen_image_vae.safetensors"}
CUTOUT = "BiRefNet_toonout"
STEPS = 30
CFG = 4.0
STYLE = "clean anime visual novel character art, soft cel shading, crisp line art, full body, standing, facing the viewer, plain light grey studio background, even lighting"
CHAR_NEGATIVE = "open mouth, teeth, grin, laughing"
NEGATIVE = "photo, realistic, 3d render, text, watermark, logo, signature, frame, border, extra limbs, extra fingers, deformed hands, blurry, lowres, cropped, nsfw, glasses, hat covering eyes"

PAGE = os.path.join(ROOT, "docs", "guide", "showcase", "animated-character")
LICENCE = "Qwen-Image-2512: Apache-2.0 (https://huggingface.co/Qwen/Qwen-Image-2512). Cut-out: BiRefNet toonout via ComfyUI-RMBG. Output: synthetic, SFW, made for this guide."
POSE_LABELS = {"wave": "Waving", "lantern": "Lantern", "arms": "Arms folded", "rope": "Rope", "map": "Map", "point": "Pointing"}
LOOK_LABELS = {"base": "Everyday", "oilskin": "Oilskin coat"}
BLURBS = {
    "june": ("The beacon keeper's apprentice. Her look changes in the story's third scene, so she has two rigs.", "Okay, okay, don't panic. The key was right here when I came in, I promise. Unless it wasn't."),
    "tobin": ("The old ferryman, and the lead in the opening scene. A beard is hard for face detectors; his rig still blinks and talks.", "Wind's backing west. We'll have rain before the tea's cold, and the boats need that light."),
    "wren": ("A travelling cartographer who notices what others miss.", "The scuff marks go to the bookcase, not the door. Someone came this way in a hurry."),
}

CAST = {
    "june": {
        "name": "SO-Demo June",
        "seed": 4101,
        "face": "a young woman with a short copper bob haircut, freckles and bright green eyes",
        "text": "a young woman lighthouse apprentice, short copper bob haircut, freckles, bright green eyes, relaxed gentle expression with the mouth closed, cream cable-knit sweater, long red wool scarf, brown work trousers, brown leather boots",
        "looks": {"oilskin": "a bright yellow hooded oilskin raincoat buttoned over a cream sweater, red scarf at the collar, brown trousers, boots"},
        "poses": {"wave": "waving one hand in greeting", "lantern": "holding up an old brass lantern in both hands"},
    },
    "tobin": {
        "name": "SO-Demo Tobin",
        "seed": 4202,
        "face": "an elderly man with a short neat white beard, bushy white eyebrows, grey eyes and a weathered face",
        "text": "an elderly ferryman, short neat white beard, weathered kind face, bushy white eyebrows, grey eyes, bald crown with short white hair at the sides, navy wool peacoat with brass buttons, grey scarf, dark trousers, sturdy boots",
        "looks": {},
        "poses": {"arms": "arms folded across his chest, stern", "rope": "carrying a coil of rope over one shoulder"},
    },
    "wren": {
        "name": "SO-Demo Wren",
        "seed": 4303,
        "face": "a young woman with long black hair and warm brown eyes",
        "text": "a young woman cartographer, long black hair in a single side braid, warm brown eyes, calm thoughtful expression, teal travelling coat, white blouse, leather satchel stuffed with rolled maps, grey skirt over dark leggings, ankle boots",
        "looks": {},
        "poses": {"map": "unrolling a large paper map in both hands", "point": "pointing ahead with one hand"},
    },
}


EXPRESSIONS = {
    "happy": "a warm happy smile with closed lips, eyes slightly narrowed with joy",
    "angry": "an angry frown, furrowed brows, lips pressed together",
    "worried": "a worried anxious look, raised inner eyebrows, small frown, lips closed",
}


def log(*parts):
    print(*parts, flush=True)


def http(method, url, body=None, headers=None, timeout=60):
    data = json.dumps(body).encode() if isinstance(body, (dict, list)) else body
    request = urllib.request.Request(url, data=data, method=method, headers=headers or ({"Content-Type": "application/json"} if data else {}))
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def queue_empty():
    queue = json.loads(http("GET", f"{COMFY}/queue"))
    return not queue["queue_running"] and not queue["queue_pending"]


def wait_turn():
    waited = 0
    while not queue_empty():
        if waited % 60 == 0:
            log(f"  queue busy, waiting ({waited}s)")
        time.sleep(5)
        waited += 5


def upload(path_or_image, name):
    buffer = io.BytesIO()
    image = path_or_image if isinstance(path_or_image, Image.Image) else Image.open(path_or_image)
    image.save(buffer, "PNG")
    boundary = uuid.uuid4().hex
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{name}\"\r\nContent-Type: image/png\r\n\r\n").encode() + buffer.getvalue() \
        + f"\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"overwrite\"\r\n\r\ntrue\r\n--{boundary}--\r\n".encode()
    reply = json.loads(http("POST", f"{COMFY}/upload/image", body, {"Content-Type": f"multipart/form-data; boundary={boundary}"}))
    return reply["name"]


def broker_lease(graph):
    if BROKER == "off":
        return None
    files = [{"kind": "diffusionModels", "name": MODEL["unet"]}, {"kind": "textEncoders", "name": MODEL["clip"]}, {"kind": "vaes", "name": MODEL["vae"]}]
    size = next((node["inputs"] for node in graph.values() if node["class_type"] == "EmptySD3LatentImage"), {"width": 1024, "height": 1024})
    body = {"workflowKey": "so-demo-art-qwen-image-2512", "modelFiles": files, "needGpuMiB": NEED_GPU_MIB, "width": size["width"], "height": size["height"]}
    started = time.time()
    while True:
        try:
            return json.loads(http("POST", f"{BROKER}/lease", body, timeout=900))["lease"]
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")[:300]
            if time.time() - started > LEASE_PATIENCE_S:
                raise RuntimeError(f"GPU broker refused the lease: {detail}")
            log(f"  broker refused ({error.code}), retrying in 20s: {detail}")
            time.sleep(20)


def broker_call(route, lease):
    if lease is not None:
        try:
            http("POST", f"{BROKER}/{route}", {"lease": lease}, timeout=30)
        except (urllib.error.URLError, OSError) as error:
            log(f"  broker {route} failed: {error}")


def run(graph, save_node):
    wait_turn()
    lease = broker_lease(graph)
    try:
        return render(graph, save_node, lease)
    finally:
        broker_call("release", lease)


def render(graph, save_node, lease):
    client = uuid.uuid4().hex
    reply = json.loads(http("POST", f"{COMFY}/prompt", {"prompt": graph, "client_id": client}))
    prompt_id = reply["prompt_id"]
    started = time.time()
    renewed = started
    while True:
        time.sleep(3)
        if time.time() - renewed > 30:
            broker_call("renew", lease)
            renewed = time.time()
        history = json.loads(http("GET", f"{COMFY}/history/{prompt_id}"))
        if prompt_id in history:
            entry = history[prompt_id]
            status = entry.get("status", {})
            if status.get("status_str") == "error":
                raise RuntimeError(json.dumps(status)[:800])
            images = entry["outputs"][save_node]["images"]
            image = images[0]
            raw = http("GET", f"{COMFY}/view?filename={urllib.parse.quote(image['filename'])}&subfolder={urllib.parse.quote(image['subfolder'])}&type={image['type']}")
            log(f"  done in {time.time() - started:.0f}s")
            return Image.open(io.BytesIO(raw)).copy(), prompt_id
        if time.time() - started > 900:
            raise RuntimeError("ComfyUI job timed out")


def base_graph(positive, seed, width, height, denoise=1.0, latent=None):
    graph = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": MODEL["unet"], "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": MODEL["clip"], "type": "qwen_image", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": MODEL["vae"]}},
        "4": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1", 0], "shift": 3.1}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": positive}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": NEGATIVE}},
        "7": {"class_type": "EmptySD3LatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}},
        "8": {"class_type": "KSampler", "inputs": {"model": ["4", 0], "positive": ["5", 0], "negative": ["6", 0], "latent_image": latent or ["7", 0],
                                                   "seed": seed, "steps": STEPS, "cfg": CFG, "sampler_name": "euler", "scheduler": "simple", "denoise": denoise}},
        "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
        "10": {"class_type": "SaveImage", "inputs": {"images": ["9", 0], "filename_prefix": "so-demo/render"}},
    }
    return graph


def with_cutout(graph):
    graph["11"] = {"class_type": "BiRefNetRMBG", "inputs": {"image": ["9", 0], "model": CUTOUT, "sensitivity": 1.0, "mask_blur": 0, "mask_offset": 0,
                                                            "invert_output": False, "refine_foreground": True, "background": "Alpha"}}
    graph["12"] = {"class_type": "SaveImage", "inputs": {"images": ["11", 0], "filename_prefix": "so-demo/cutout"}}
    return graph


def inpaint_graph(positive, seed, image_name, mask_name, denoise):
    graph = base_graph(positive, seed, 64, 64, denoise, latent=["15", 0])
    del graph["7"]
    graph["13"] = {"class_type": "LoadImage", "inputs": {"image": image_name}}
    graph["14"] = {"class_type": "VAEEncode", "inputs": {"pixels": ["13", 0], "vae": ["3", 0]}}
    graph["16"] = {"class_type": "LoadImageMask", "inputs": {"image": mask_name, "channel": "red"}}
    graph["15"] = {"class_type": "SetLatentNoiseMask", "inputs": {"samples": ["14", 0], "mask": ["16", 0]}}
    return graph


def raw_path(*parts):
    path = os.path.join(RAW, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path


def out_path(*parts):
    path = os.path.join(OUT, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path


def sidecar(path, info):
    info = {**info, "model": MODEL, "steps": STEPS, "cfg": CFG, "sampler": "euler/simple", "comfy": COMFY, "built": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    with open(path + ".json", "w", encoding="utf-8", newline="\n") as handle:
        json.dump(info, handle, indent=2)
        handle.write("\n")


def flatten(image):
    if image.mode != "RGBA":
        return image.convert("RGB")
    canvas = Image.new("RGB", image.size, (214, 214, 214))
    canvas.paste(image, mask=image.split()[3])
    return canvas


def trim_alpha(image, pad=12):
    box = image.split()[3].point(lambda a: 255 if a > 8 else 0).getbbox()
    if not box:
        return image
    x0, y0, x1, y1 = box
    return image.crop((max(0, x0 - pad), max(0, y0 - pad), min(image.width, x1 + pad), min(image.height, y1 + pad)))


def save_webp(image, path, width=None, quality=82):
    if width and image.width > width:
        image = image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)
    image.save(path, "WEBP", quality=quality, method=6)
    return image.size


def step_chars(force):
    for key, member in CAST.items():
        target = raw_path("chars", f"{key}.png")
        if os.path.exists(target) and not force:
            continue
        log(f"char {key}")
        positive = f"{member['text']}. {STYLE}"
        graph = with_cutout(base_graph(positive, member["seed"], 832, 1216))
        graph["6"]["inputs"]["text"] = f"{NEGATIVE}, {CHAR_NEGATIVE}"
        image, prompt_id = run(graph, "12")
        image.save(target)
        sidecar(target, {"kind": "character", "member": member["name"], "prompt": positive, "negative": f"{NEGATIVE}, {CHAR_NEGATIVE}", "seed": member["seed"], "size": [832, 1216], "cutout": CUTOUT, "prompt_id": prompt_id})


def torso_mask(image, chin_y):
    mask = Image.new("L", image.size, 0)
    alpha = image.split()[3].point(lambda a: 255 if a > 8 else 0).filter(ImageFilter.MaxFilter(41))
    cut = Image.new("L", image.size, 0)
    ImageDraw.Draw(cut).rectangle((0, chin_y, image.width, image.height), fill=255)
    mask.paste(alpha, mask=cut)
    return mask.filter(ImageFilter.GaussianBlur(6))


def detect(image):
    buffer = io.BytesIO()
    flatten(image).save(buffer, "PNG")
    reply = json.loads(http("POST", f"{LANDMARKS}/v1/landmarks", {"png": base64.b64encode(buffer.getvalue()).decode()}, timeout=120))
    faces = [face for face in reply.get("faces", []) if face["box"][4] >= 0.5]
    if not faces:
        raise RuntimeError("no face found")
    return max(faces, key=lambda face: (face["box"][2] - face["box"][0]) * (face["box"][3] - face["box"][1]))


def step_looks(force):
    for key, member in CAST.items():
        base = Image.open(raw_path("chars", f"{key}.png")).convert("RGBA")
        for look, text in member["looks"].items():
            target = raw_path("looks", f"{key}-{look}.png")
            if os.path.exists(target) and not force:
                continue
            log(f"look {key}/{look}")
            face = detect(base)
            chin = max(point[1] for point in face["points"][0:5]) + 0.25 * (face["box"][3] - face["box"][1])
            mask = torso_mask(base, int(chin))
            image_name = upload(flatten(base), f"so-demo-{key}-base.png")
            mask_name = upload(Image.merge("RGB", (mask, mask, mask)), f"so-demo-{key}-{look}-mask.png")
            positive = f"{member['text'].split(',')[0]} wearing {text}. {STYLE}"
            graph = with_cutout(inpaint_graph(positive, member["seed"] + 7, image_name, mask_name, 0.85))
            rendered, prompt_id = run(graph, "12")
            rendered = rendered.convert("RGBA").resize(base.size)
            keep = Image.new("L", base.size, 0)
            keep.paste(mask)
            merged = Image.composite(rendered, base, keep)
            merged.save(target)
            sidecar(target, {"kind": "look", "member": member["name"], "look": look, "from": f"chars/{key}.png", "prompt": positive, "seed": member["seed"] + 7, "denoise": 0.85, "mask": "torso below the chin", "prompt_id": prompt_id})


def step_poses(force):
    for key, member in CAST.items():
        for pose, text in member["poses"].items():
            target = raw_path("poses", f"{key}-{pose}.png")
            if os.path.exists(target) and not force:
                continue
            log(f"pose {key}/{pose}")
            positive = f"{member['text']}, {text}. {STYLE.replace('standing, facing the viewer, ', '')}"
            graph = with_cutout(base_graph(positive, member["seed"], 832, 1216))
            image, prompt_id = run(graph, "12")
            image.save(target)
            sidecar(target, {"kind": "pose", "member": member["name"], "pose": pose, "prompt": positive, "negative": NEGATIVE, "seed": member["seed"], "cutout": CUTOUT, "prompt_id": prompt_id})



BUST_MAX = 640


def bust_box(face):
    x0, y0, x1, y1 = face["box"][:4]
    w, h = x1 - x0, y1 - y0
    side = max(w * 3.8, h * 3.85)
    left, top = round((x0 + x1) / 2 - side / 2), round(y0 - h * 0.75)
    return (left, top, left + round(side), top + round(side))


def widened(image, box, pad=8):
    rows = image.split()[3].crop((0, max(0, box[1]), image.width, min(image.height, box[3]))).point(lambda a: 255 if a > 8 else 0).getbbox()
    if not rows:
        return box
    return (min(box[0], rows[0] - pad), box[1], max(box[2], rows[2] + pad), box[3])


def unmoved(face, box, scale):
    x0, y0 = box[0], box[1]
    return {"box": [face["box"][0] / scale + x0, face["box"][1] / scale + y0, face["box"][2] / scale + x0, face["box"][3] / scale + y0, face["box"][4]],
            "points": [[x / scale + x0, y / scale + y0, s] for x, y, s in face["points"]]}


def known_face(key, image):
    path = raw_path("busts", f"{key}.detect.json")
    if os.path.exists(path):
        info = json.load(open(path, encoding="utf-8"))
        return info.get("full") or unmoved(info["face"], info["crop"], info["scale"])
    return detect(image)


def rebase_expressions(key, char, old_box, old_scale, box, scale, size):
    for expression in EXPRESSIONS:
        path = raw_path("expressions", f"{key}-{expression}.png")
        info_path = path + ".json"
        if not os.path.exists(path):
            continue
        info = json.load(open(info_path, encoding="utf-8")) if os.path.exists(info_path) else {}
        if info.get("crop") == list(box):
            continue
        canvas = char.copy()
        old = Image.open(path).convert("RGBA")
        canvas.paste(old.resize((round(old.width / old_scale), round(old.height / old_scale)), Image.LANCZOS) if old_scale != 1 else old, (old_box[0], old_box[1]))
        moved_art = canvas.crop(box)
        if scale != 1:
            moved_art = moved_art.resize(size, Image.LANCZOS)
        moved_art.save(path)
        info.update({"crop": list(box), "rebased_from": list(old_box)})
        with open(info_path, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(info, handle, indent=2)
            handle.write("\n")
        log(f"  rebased {key}-{expression} onto the new bust")


def moved(face, box, scale):
    x0, y0 = box[0], box[1]
    return {"box": [(face["box"][0] - x0) * scale, (face["box"][1] - y0) * scale, (face["box"][2] - x0) * scale, (face["box"][3] - y0) * scale, face["box"][4]],
            "points": [[(x - x0) * scale, (y - y0) * scale, s] for x, y, s in face["points"]]}


def step_busts(force):
    sources = [(key, None, raw_path("chars", f"{key}.png")) for key in CAST]
    sources += [(key, look, raw_path("looks", f"{key}-{look}.png")) for key, member in CAST.items() for look in member["looks"]]
    boxes = {}
    for key, look, path in sources:
        image = Image.open(path).convert("RGBA")
        if key not in boxes:
            previous = raw_path("busts", f"{key}.detect.json")
            before = json.load(open(previous, encoding="utf-8")) if os.path.exists(previous) else None
            full = known_face(key, image)
            boxes[key] = (widened(image, bust_box(full)), full, before)
        box, full, before = boxes[key]
        bust = image.crop(box)
        scale = min(1.0, BUST_MAX / bust.width)
        if scale < 1:
            bust = bust.resize((round(bust.width * scale), round(bust.height * scale)), Image.LANCZOS)
        name = f"{key}-{look}" if look else key
        bust.save(raw_path("busts", f"{name}.png"))
        face = moved(full, box, scale)
        with open(raw_path("busts", f"{name}.detect.json"), "w", encoding="utf-8", newline="\n") as handle:
            json.dump({"width": bust.width, "height": bust.height, "face": face, "full": full, "crop": list(box), "scale": scale}, handle, indent=2)
        if not look and before and before.get("crop") != list(box):
            rebase_expressions(key, image, before["crop"], before["scale"], box, scale, bust.size)
        log(f"bust {name} {bust.size} face {face['box'][4]:.2f}")


def face_mask(size, face, grow=1.15):
    x0, y0, x1, y1 = face["box"][:4]
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2 + (y1 - y0) * 0.05
    rx, ry = (x1 - x0) / 2 * grow * 0.8, (y1 - y0) / 2 * grow * 0.75
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=255)
    return mask.filter(ImageFilter.GaussianBlur(5))


def expression_mask(size, rig):
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    brow = rig["face"]["brow"]
    eye_bottom = max(point[1] for eye in rig["eyes"] for point in eye["roi"])
    eye_x = [point[0] for eye in rig["eyes"] for point in eye["roi"]]
    left, right = min(min(eye_x), brow["cx"] - brow["rx"]), max(max(eye_x), brow["cx"] + brow["rx"])
    pad = (right - left) * 0.04
    draw.ellipse((left - pad, brow["cy"] - brow["ry"] * 1.4, right + pad, eye_bottom + pad), fill=255)
    area = rig["mouth"]["area"]
    rx, ry = area["rx"] * 1.2, area["ry"] * 0.8
    draw.ellipse((area["cx"] - rx, area["cy"] - ry, area["cx"] + rx, area["cy"] + ry), fill=255)
    return mask.filter(ImageFilter.GaussianBlur(4))


def step_expressions(force):
    for key, member in CAST.items():
        bust_path = raw_path("busts", f"{key}.png")
        bust = Image.open(bust_path).convert("RGBA")
        mask = expression_mask(bust.size, rig_of(key))
        for expression, text in EXPRESSIONS.items():
            target = raw_path("expressions", f"{key}-{expression}.png")
            if os.path.exists(target) and not force:
                continue
            log(f"expression {key}/{expression}")
            work = bust
            scale = 1
            if bust.width < 768:
                scale = 2
                work = bust.resize((bust.width * 2, bust.height * 2), Image.LANCZOS)
            image_name = upload(flatten(work), f"so-demo-{key}-bust.png")
            big_mask = mask.resize(work.size)
            mask_name = upload(Image.merge("RGB", (big_mask, big_mask, big_mask)), f"so-demo-{key}-face-mask.png")
            positive = f"close-up face of {member['face']}, with {text}. clean anime visual novel character art, soft cel shading, crisp line art"
            rendered, prompt_id = run(inpaint_graph(positive, member["seed"] + 11, image_name, mask_name, 0.6), "10")
            rendered = rendered.convert("RGBA").resize(bust.size, Image.LANCZOS)
            merged = Image.composite(rendered, bust, mask)
            merged.putalpha(bust.split()[3])
            merged.save(target)
            crop = json.load(open(raw_path("busts", f"{key}.detect.json"), encoding="utf-8"))["crop"]
            sidecar(target, {"kind": "expression", "member": member["name"], "expression": expression, "from": f"busts/{key}.png", "crop": crop, "prompt": positive, "seed": member["seed"] + 11, "denoise": 0.6, "mask": "rig brows and eyes plus the mouth area (nose, freckles and proportions kept)", "upscale": scale, "prompt_id": prompt_id})


FRAME_EDITS = {
    "blink": "eyes fully closed, gentle closed eyelids with lashes, mouth unchanged",
    "talk": "mouth visibly open as if speaking, gently parted lips with natural mouth shading, no second mouth",
    "talk2": "mouth slightly open as if speaking, lips barely parted, no second mouth",
    "mouth_o": "mouth in a small rounded open shape as if saying oh, lips in a soft circle, no second mouth",
    "mouth_wide": "mouth slightly open and stretched wide as if saying ee, teeth just visible, no second mouth",
}
FRAME_DENOISE = 0.55


def rig_of(name):
    return json.load(open(os.path.join(PAGE, "rigs", f"{name}.rig.json"), encoding="utf-8"))["rig"]


def frame_mask(size, rig, key):
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    if key == "blink":
        for eye in rig["eyes"]:
            xs = [p[0] for p in eye["roi"]]
            ys = [p[1] for p in eye["roi"]]
            pad = (max(ys) - min(ys)) * 0.35
            draw.ellipse((min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad), fill=255)
    else:
        area = rig["mouth"]["area"]
        rx, ry = area["rx"] * 1.6, max(area["ry"], area["rx"] * 0.5) * 1.6
        draw.ellipse((area["cx"] - rx, area["cy"] - ry * 0.8, area["cx"] + rx, area["cy"] + ry * 1.2), fill=255)
    return mask.filter(ImageFilter.GaussianBlur(3))


def step_frames(force):
    for key, member in CAST.items():
        for look in ["base", *member["looks"]]:
            name = key if look == "base" else f"{key}-{look}"
            if not os.path.exists(os.path.join(PAGE, "rigs", f"{name}.rig.json")):
                log(f"frames {name}: no rig yet (publish, then node scripts/docs/demo-rigs.mjs, then frames, then publish)")
                continue
            bust = Image.open(out_path("characters", f"{name}.png")).convert("RGBA")
            rig = rig_of(name)
            for frame, text in FRAME_EDITS.items():
                target = raw_path("frames", f"{name}-{frame}.png")
                if os.path.exists(target) and not force:
                    continue
                log(f"frame {name}/{frame}")
                mask = frame_mask(bust.size, rig, frame)
                work, big = bust, mask
                if bust.width < 768:
                    work = bust.resize((bust.width * 2, bust.height * 2), Image.LANCZOS)
                    big = mask.resize(work.size)
                image_name = upload(flatten(work), f"so-demo-{name}-frame-base.png")
                mask_name = upload(Image.merge("RGB", (big, big, big)), f"so-demo-{name}-{frame}-mask.png")
                positive = f"close-up face of {member['face']}, {text}. Same character, same art style and colours. clean anime visual novel character art, soft cel shading, crisp line art"
                rendered, prompt_id = run(inpaint_graph(positive, member["seed"] + 23, image_name, mask_name, FRAME_DENOISE), "10")
                rendered = rendered.convert("RGBA").resize(bust.size, Image.LANCZOS)
                merged = Image.composite(rendered, bust, mask)
                merged.putalpha(bust.split()[3])
                merged.save(target)
                sidecar(target, {"kind": "frame", "member": member["name"], "look": look, "frame": frame, "from": f"characters/{name}.png", "prompt": positive,
                                 "seed": member["seed"] + 23, "denoise": FRAME_DENOISE, "mask": "rig eyes (blink) or rig mouth area", "prompt_id": prompt_id})


def git_head():
    import subprocess
    return subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()


def publish_sidecar(path, raw_file, extra):
    raw_info = {}
    if raw_file and os.path.exists(raw_file + ".json"):
        raw_info = json.load(open(raw_file + ".json", encoding="utf-8"))
    info = {"build": git_head(), "licence": LICENCE, "source": "scripts/docs/demo-art.py on the owner's local ComfyUI (plan 46 W4)", **extra}
    for key in ("kind", "member", "look", "pose", "expression", "frame", "prompt", "seed", "denoise", "model", "steps", "cfg", "sampler", "cutout", "built"):
        if key in raw_info and key not in info:
            info[key] = raw_info[key]
    with open(path + ".json", "w", encoding="utf-8", newline="\n") as handle:
        json.dump(info, handle, indent=2)
        handle.write("\n")


def mask_rect(size, face):
    box = face_mask(size, face).getbbox()
    x0, y0, x1, y1 = box
    return [max(0, x0 - 2), max(0, y0 - 2), min(size[0], x1 + 2) - max(0, x0 - 2), min(size[1], y1 + 2) - max(0, y0 - 2)]


def step_publish(force):
    data = {"characters": []}
    for key, member in CAST.items():
        looks = {}
        for look in ["base", *member["looks"]]:
            name = key if look == "base" else f"{key}-{look}"
            bust_raw = raw_path("busts", f"{name}.png")
            bust_out = out_path("characters", f"{name}.png")
            Image.open(bust_raw).save(bust_out, optimize=True)
            publish_sidecar(bust_out, raw_path("chars", f"{key}.png") if look == "base" else raw_path("looks", f"{name}.png"), {"use": "live-head bust (the rig is built from these exact bytes)"})
            full_raw = raw_path("chars", f"{key}.png") if look == "base" else raw_path("looks", f"{name}.png")
            full_out = out_path("characters", f"{name}-full.webp")
            save_webp(trim_alpha(Image.open(full_raw).convert("RGBA")), full_out, width=420)
            publish_sidecar(full_out, full_raw, {"use": "full-body sprite"})
            looks[look] = {"label": LOOK_LABELS.get(look, look), "bust": f"../../assets/showcase/characters/{name}.png", "rig": f"rigs/{name}.rig.json",
                           "full": f"../../assets/showcase/characters/{name}-full.webp"}
            frames = {}
            for frame in FRAME_EDITS:
                raw = raw_path("frames", f"{name}-{frame}.png")
                if not os.path.exists(raw):
                    continue
                target = out_path("frames", f"{name}-{frame}.png")
                Image.open(raw).save(target, optimize=True)
                publish_sidecar(target, raw, {"use": f"drawn {frame} frame for the live head (aligned to the bust)"})
                frames[frame] = f"../../assets/showcase/frames/{name}-{frame}.png"
            if frames:
                looks[look]["frames"] = frames
        detect_info = json.load(open(raw_path("busts", f"{key}.detect.json"), encoding="utf-8"))
        rect = mask_rect((detect_info["width"], detect_info["height"]), detect_info["face"])
        expressions = {}
        for expression in EXPRESSIONS:
            raw = raw_path("expressions", f"{key}-{expression}.png")
            if not os.path.exists(raw):
                continue
            target = out_path("expressions", f"{key}-{expression}.webp")
            patch = Image.open(raw).convert("RGBA").crop((rect[0], rect[1], rect[0] + rect[2], rect[1] + rect[3]))
            patch.save(target, "WEBP", lossless=True, method=6)
            publish_sidecar(target, raw, {"use": "face patch drawn over the bust at rect", "rect": rect})
            expressions[expression] = {"patch": f"../../assets/showcase/expressions/{key}-{expression}.webp", "rect": rect}
        poses = {}
        for pose in member["poses"]:
            raw = raw_path("poses", f"{key}-{pose}.png")
            if not os.path.exists(raw):
                continue
            target = out_path("poses", f"{key}-{pose}.webp")
            save_webp(trim_alpha(Image.open(raw).convert("RGBA")), target, width=420)
            publish_sidecar(target, raw, {"use": "pose render"})
            poses[pose] = {"label": POSE_LABELS.get(pose, pose), "image": f"../../assets/showcase/poses/{key}-{pose}.webp"}
        blurb, line = BLURBS[key]
        data["characters"].append({"id": key, "name": member["name"], "blurb": blurb, "line": line, "looks": looks, "expressions": expressions, "poses": poses})
    os.makedirs(PAGE, exist_ok=True)
    with open(os.path.join(PAGE, "demo.json"), "w", encoding="utf-8", newline="\n") as handle:
        json.dump(data, handle, indent=2)
        handle.write("\n")
    log("published; now run node scripts/docs/demo-rigs.mjs")


STEPS_IN_ORDER = {"chars": step_chars, "looks": step_looks, "poses": step_poses, "busts": step_busts, "expressions": step_expressions, "frames": step_frames, "publish": step_publish}


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 2
    force = "--force" in args
    step = args[0]
    for name, fn in STEPS_IN_ORDER.items():
        if step in (name, "all"):
            fn(force)
    return 0


if __name__ == "__main__":
    sys.exit(main())
