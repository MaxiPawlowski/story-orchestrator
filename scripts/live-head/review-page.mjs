import { HeadRenderer } from "../../src/sprites/liveHead/renderer";
import { loadHeadManifest } from "../../src/sprites/liveHead/manifest";
import { restHead } from "../../src/sprites/liveHead/drivers";

const POSES = {
  rest: {}, "eyes-half": { eyeOpen: 0.5 }, "eyes-closed": { eyeOpen: 0 }, "eyes-smile": { eyeSmile: 0.7 },
  "mouth-half": { mouthOpen: 0.5 }, "mouth-open": { mouthOpen: 1 }, "mouth-form": { mouthForm: 0.6, mouthOpen: 0.3 },
  "turn-left": { angleX: -30 }, "turn-right": { angleX: 30 }, "look-up": { angleY: 30 }, "look-down": { angleY: -30 },
  "gaze-left": { gazeX: -1 }, "gaze-right": { gazeX: 1 }, "gaze-up": { gazeY: 1 }, "gaze-down": { gazeY: -1 },
  "tilt-left": { angleZ: -30 }, "tilt-right": { angleZ: 30 }, breath: { breath: 1 },
  anger: { browY: -0.6, browAngle: 0.7, mouthForm: -0.5 }, surprise: { eyeOpen: 1.07, browY: 0.8, mouthForm: 0.6 },
};

const load = (src) => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error("layer decode failed")); image.src = src; });
const SCALE = 2;

window.renderReview = async (value, palette) => {
  const manifest = loadHeadManifest(value), rig = manifest.rig, { width, height } = rig.image;
  const canvas = document.createElement("canvas");
  canvas.style.width = `${width * SCALE}px`; canvas.style.height = `${height * SCALE}px`;
  document.body.append(canvas);
  const renderer = new HeadRenderer(canvas, manifest);
  const images = await Promise.all(manifest.layers.map((layer) => load(layer.image)));
  manifest.layers.forEach((layer, i) => renderer.add(layer, images[i]));
  const cells = (names, region, zoom, columns, label = true) => {
    const [x0, y0, x1, y1] = region, cw = Math.round((x1 - x0) * SCALE * zoom), ch = Math.round((y1 - y0) * SCALE * zoom);
    const rows = Math.ceil(names.length / columns), sheet = document.createElement("canvas");
    sheet.width = cw * columns; sheet.height = (ch + 22) * rows;
    const ctx = sheet.getContext("2d"); ctx.imageSmoothingEnabled = zoom <= 1; ctx.fillStyle = "#8c8c8c"; ctx.fillRect(0, 0, sheet.width, sheet.height);
    names.forEach((name, k) => {
      renderer.draw({ ...restHead(), ...POSES[name] });
      const ox = (k % columns) * cw, oy = Math.floor(k / columns) * (ch + 22);
      const px = canvas.width / width;
      ctx.drawImage(canvas, x0 * px, y0 * px, (x1 - x0) * px, (y1 - y0) * px, ox, oy + 22, cw, ch);
      ctx.fillStyle = "#fff"; ctx.font = "16px sans-serif"; if (label) ctx.fillText(name, ox + 4, oy + 16);
    });
    return sheet.toDataURL("image/png");
  };
  const xs = rig.eyes.flatMap((eye) => eye.roi.map((p) => p[0])), ys = rig.eyes.flatMap((eye) => eye.roi.map((p) => p[1]));
  const eyeBox = [Math.max(0, Math.min(...xs) - 12), Math.max(0, Math.min(...ys) - 18), Math.min(width, Math.max(...xs) + 12), Math.min(height, Math.max(...ys) + 10)];
  const m = rig.face.mouth, mouthBox = [Math.max(0, m.cx - m.rx - 14), Math.max(0, m.cy - m.ry - 16), Math.min(width, m.cx + m.rx + 14), Math.min(height, m.cy + m.ry + 30)];
  const whole = [0, 0, width, height], result = {
    "poses-core": cells(["rest", "eyes-half", "eyes-closed", "mouth-open"], whole, 0.5, 4),
    "poses-turn": cells(["turn-left", "turn-right", "tilt-left", "tilt-right", "look-up", "look-down"], whole, 0.5, 3),
    "poses-gaze": cells(["gaze-left", "gaze-right", "gaze-up", "gaze-down", "breath", "eyes-smile"], whole, 0.5, 3),
    "poses-expression": cells(["anger", "surprise", "mouth-form"], whole, 0.5, 3),
    "zoom-eyes": cells(["rest", "eyes-half", "eyes-closed", "eyes-smile", "gaze-left", "gaze-right", "gaze-up", "gaze-down"], eyeBox, 1.6, 2),
    "zoom-eyes-turn": cells(["turn-left", "turn-right", "tilt-left", "tilt-right"], eyeBox, 1.6, 2),
    "zoom-mouth": cells(["rest", "mouth-half", "mouth-open", "mouth-form", "turn-left", "turn-right"], mouthBox, 2, 3),
  };
  const audit = {};
  if (palette) {
    const gl = canvas.getContext("webgl2"), inside = (polygon, x, y) => {
      let hit = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
      }
      return hit;
    };
    for (const name of ["rest", "eyes-closed", "eyes-half"]) {
      renderer.draw({ ...restHead(), ...POSES[name] });
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const counts = [];
      rig.eyes.forEach((eye) => {
        let iris = 0, white = 0;
        for (let y = 0; y < height * SCALE; y++) for (let x = 0; x < width * SCALE; x++) {
          if (!inside(eye.roi, x / SCALE, y / SCALE)) continue;
          const o = ((canvas.height - 1 - y) * canvas.width + x) * 4, a = pixels[o + 3];
          if (a < 128) continue;
          const r = pixels[o], g = pixels[o + 1], b = pixels[o + 2];
          if (Math.hypot(r - palette.iris[0], g - palette.iris[1], b - palette.iris[2]) < 40) iris++;
          if (r > 235 && g > 235 && b > 235) white++;
        }
        counts.push({ iris: iris / (SCALE * SCALE), white: white / (SCALE * SCALE) });
      });
      audit[name] = counts;
    }
  }
  renderer.draw({ ...restHead() });
  const sample = { canvas: [canvas.width, canvas.height], audit };
  renderer.destroy();
  return { sheets: result, sample };
};
