"""Story Orchestrator face-landmark cross-check server (v2.8 plan 36, harvest item 5).

Serves hysts/anime-face-detector (MIT code, MIT weights) on 127.0.0.1, CPU only:
  GET  /health        -> {"ok", "model", "device", "weights"}
  POST /v1/landmarks  {"png": "<base64>"} -> {"ok", "width", "height", "faces": [{"box": [x0,y0,x1,y1,score], "points": [[x,y,score] x28]}]}

Started by scripts/local/landmarks.mjs (the tray's Start). Weights are read from --weights (yolov3.safetensors, hrnetv2.safetensors).
"""

import argparse
import base64
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

os.environ["CUDA_VISIBLE_DEVICES"] = ""
os.environ.setdefault("HF_HUB_OFFLINE", "1")

LOOPBACK = {"127.0.0.1", "localhost", "::1"}
MAX_BODY_BYTES = 24_000_000
MODEL = "hysts/anime-face-detector yolov3+hrnetv2"


class Detector:
    def __init__(self, weights):
        self.weights = weights
        self.lock = threading.Lock()
        self.detector = None

    def load(self):
        import torch
        from anime_face_detector.detector import LandmarkDetector

        torch.set_num_threads(max(1, min(4, (os.cpu_count() or 2) // 2)))
        self.detector = LandmarkDetector(
            os.path.join(self.weights, "hrnetv2.safetensors"),
            face_detector_name="yolov3",
            face_detector_checkpoint_path=os.path.join(self.weights, "yolov3.safetensors"),
            device="cpu",
        )

    def detect(self, png_bytes):
        import cv2
        import numpy as np

        image = cv2.imdecode(np.frombuffer(png_bytes, dtype=np.uint8), cv2.IMREAD_UNCHANGED)
        if image is None:
            raise ValueError("the image could not be decoded")
        if image.ndim == 2:
            image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
        elif image.shape[2] == 4:
            alpha = image[:, :, 3:4].astype(np.float32) / 255.0
            image = (image[:, :, :3].astype(np.float32) * alpha + 255.0 * (1.0 - alpha)).astype(np.uint8)
        height, width = image.shape[:2]
        with self.lock:
            preds = self.detector(image)
        faces = []
        for pred in preds:
            faces.append({
                "box": [float(v) for v in pred["bbox"]],
                "points": [[float(x), float(y), float(s)] for x, y, s in pred["keypoints"]],
            })
        return {"ok": True, "width": int(width), "height": int(height), "faces": faces}


def handler_for(detector):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            sys.stderr.write("%s\n" % (fmt % args))

        def reply(self, code, body):
            data = json.dumps(body).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.path != "/health":
                return self.reply(404, {"ok": False, "reason": "not-found"})
            self.reply(200, {"ok": detector.detector is not None, "model": MODEL, "device": "cpu", "weights": detector.weights})

        def do_POST(self):
            if self.path != "/v1/landmarks":
                return self.reply(404, {"ok": False, "reason": "not-found"})
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0 or length > MAX_BODY_BYTES:
                return self.reply(413, {"ok": False, "reason": "too-large"})
            try:
                body = json.loads(self.rfile.read(length))
                png = base64.b64decode(body["png"], validate=True)
            except Exception:
                return self.reply(400, {"ok": False, "reason": "bad-request"})
            try:
                self.reply(200, detector.detect(png))
            except ValueError as error:
                self.reply(400, {"ok": False, "reason": "bad-image", "message": str(error)})
            except Exception as error:
                self.reply(500, {"ok": False, "reason": "detector-error", "message": str(error)})

    return Handler


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8096)
    parser.add_argument("--weights", required=True)
    args = parser.parse_args()
    if args.host not in LOOPBACK:
        sys.exit("refusing a non-loopback bind")
    detector = Detector(args.weights)
    detector.load()
    server = ThreadingHTTPServer((args.host, args.port), handler_for(detector))
    sys.stderr.write("landmark server on %s:%d (cpu)\n" % (args.host, args.port))
    server.serve_forever()


if __name__ == "__main__":
    main()
