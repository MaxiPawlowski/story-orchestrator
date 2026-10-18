import { HeadRenderer } from "../../src/sprites/liveHead/renderer";
import { loadHeadManifest } from "../../src/sprites/liveHead/manifest";
import { restHead } from "../../src/sprites/liveHead/drivers";
import { IDLES, MotionDriver, REACTIONS, sampleTrack } from "../../src/sprites/liveHead/motionDriver";
import { synthesizeCheckedHead } from "../../src/sprites/liveHead/synthesis/synthesize";
import { decodeBytes } from "../../src/sprites/liveHead/synthesis/decode";
import { encodeImage } from "../../src/sprites/builder/images";
import { cutDrawn } from "../../src/sprites/liveHead/drawn";

const SCALE = 2;
const load = (src) => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error("layer decode failed")); image.src = src; });
const owner = () => ({ stillOwns: () => true, lapsed: () => null, lapsedDetail: () => null, signal: new AbortController().signal, release: () => undefined });

window.synthesizeMotionRig = async ({ bust, member, look, source, landmarks, sha256 }) => {
  const bytes = new Uint8Array(await (await fetch(bust)).arrayBuffer());
  const result = await synthesizeCheckedHead({ member, look, source, sha256 }, owner(), {
    landmarks: async () => landmarks, read: async () => bytes, hash: async () => sha256,
    decode: (value, signal) => decodeBytes(value, signal), encode: async (image) => encodeImage(image),
  });
  return result?.manifest ?? null;
};

export function keyPose(motion) {
  let best = 0, bestScore = -1;
  for (let t = 0.05; t < motion.dur; t += 0.05) {
    let score = 0;
    for (const track of motion.tracks) if (track.kind === "add") score += Math.abs(sampleTrack(track.keys, t)) / (track.key.startsWith("gaze") ? 0.05 : 1);
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return best;
}

function gesturePose(motion) {
  const driver = new MotionDriver("review"), p = restHead();
  driver.start(motion.id, 0);
  driver.apply(p, Math.round(keyPose(motion) * 1000), "neutral", "idle", true);
  p.hair = 0;
  return p;
}

const pixels = async (url) => decodeBytes(new Uint8Array(await (await fetch(url)).arrayBuffer()), new AbortController().signal);

window.renderMotionReview = async (value, drawn) => {
  const manifest = loadHeadManifest(value), rig = manifest.rig, { width, height } = rig.image;
  const canvas = document.createElement("canvas");
  canvas.style.width = `${width * SCALE}px`; canvas.style.height = `${height * SCALE}px`;
  document.body.append(canvas);
  const renderer = new HeadRenderer(canvas, manifest);
  const images = await Promise.all(manifest.layers.map((layer) => load(layer.image)));
  manifest.layers.forEach((layer, i) => renderer.add(layer, images[i]));
  let refused = [];
  if (drawn) {
    const frames = Object.fromEntries(await Promise.all(Object.entries(drawn.frames).map(async ([key, url]) => [key, await pixels(url)])));
    const cut = cutDrawn(rig, await pixels(drawn.art), frames, drawn.box);
    renderer.addDrawn(cut.sprites); refused = cut.refused;
  }
  const frames = [
    ["rest", { ...restHead() }, null],
    ["hair spring +x", { ...restHead() }, [1, 0]], ["hair spring -x", { ...restHead() }, [-1, 0]],
    ["hair spring +y", { ...restHead() }, [0, 1]], ["hair spring -y", { ...restHead() }, [0, -1]],
    ["sway left (body -10)", { ...restHead(), bodyAngleX: -10, bodyAngleZ: -10 }, null], ["sway right (body +10)", { ...restHead(), bodyAngleX: 10, bodyAngleZ: 10 }, null],
    ["sway left + hair -x", { ...restHead(), bodyAngleX: -10, bodyAngleZ: -10 }, [-1, 0]], ["sway right + hair +x", { ...restHead(), bodyAngleX: 10, bodyAngleZ: 10 }, [1, 0]],
    ["turn -30", { ...restHead(), angleX: -30 }, null], ["turn +30", { ...restHead(), angleX: 30 }, null],
    ["tilt -30", { ...restHead(), angleZ: -30 }, null], ["tilt +30", { ...restHead(), angleZ: 30 }, null],
    ["mouth open", { ...restHead(), mouthOpen: 0.9 }, null], ["eyes closed", { ...restHead(), eyeOpen: 0 }, null],
  ];
  const gestures = [...REACTIONS, ...IDLES].map((motion) => [`${motion.id} @${keyPose(motion).toFixed(2)}s`, gesturePose(motion), null]);
  const cells = (list, region, zoom, columns) => {
    const [x0, y0, x1, y1] = region, cw = Math.round((x1 - x0) * SCALE * zoom), ch = Math.round((y1 - y0) * SCALE * zoom);
    const rows = Math.ceil(list.length / columns), sheet = document.createElement("canvas");
    sheet.width = cw * columns; sheet.height = (ch + 22) * rows;
    const ctx = sheet.getContext("2d"); ctx.imageSmoothingEnabled = true; ctx.fillStyle = "#8c8c8c"; ctx.fillRect(0, 0, sheet.width, sheet.height);
    list.forEach(([name, p, hold], k) => {
      renderer.holdHair(hold ? hold[0] : null, hold ? hold[1] : 0);
      renderer.draw({ ...p, hair: hold ? 1 : 0 });
      const ox = (k % columns) * cw, oy = Math.floor(k / columns) * (ch + 22), px = canvas.width / width;
      ctx.drawImage(canvas, x0 * px, y0 * px, (x1 - x0) * px, (y1 - y0) * px, ox, oy + 22, cw, ch);
      ctx.fillStyle = "#fff"; ctx.font = "15px sans-serif"; ctx.fillText(name, ox + 4, oy + 16);
    });
    renderer.holdHair(null);
    return { png: sheet.toDataURL("image/png"), jpeg: sheet.toDataURL("image/jpeg", 0.88) };
  };
  const head = rig.head, headBox = [Math.max(0, head.cx - head.rx * 1.15), Math.max(0, head.cy - head.ry * 1.1), Math.min(width, head.cx + head.rx * 1.15), Math.min(height, head.cy + head.ry * 1.5)];
  const whole = [0, 0, width, height], zoom = Math.min(1.2, 700 / ((headBox[2] - headBox[0]) * SCALE * 2));
  const sheets = {
    "motion-core": cells(frames, whole, 0.32, 5),
    "motion-hair-zoom": cells(frames.slice(0, 9), headBox, zoom, 3),
    "motion-gestures": cells(gestures, whole, 0.3, 5),
  };
  const parts = { ...renderer.motionParts(), drawn: renderer.drawnNames(), refused };
  renderer.destroy(); canvas.remove();
  return { sheets, parts, canvas: [canvas.width, canvas.height] };
};

window.renderStrandOverlay = async (value) => {
  const manifest = loadHeadManifest(value), rig = manifest.rig, { width, height } = rig.image;
  const sheet = document.createElement("canvas");
  sheet.width = width * SCALE; sheet.height = height * SCALE;
  const ctx = sheet.getContext("2d"), base = await load(manifest.layers[0].image);
  ctx.drawImage(base, 0, 0, sheet.width, sheet.height);
  for (const layer of manifest.layers.slice(1)) ctx.drawImage(await load(layer.image), layer.rect[0] * SCALE, layer.rect[1] * SCALE, layer.rect[2] * SCALE, layer.rect[3] * SCALE);
  for (const eye of rig.eyes) {
    ctx.strokeStyle = "#00e5ff"; ctx.lineWidth = 1.5; ctx.beginPath();
    eye.opening.forEach(([x, y], k) => (k ? ctx.lineTo(x * SCALE, y * SCALE) : ctx.moveTo(x * SCALE, y * SCALE)));
    ctx.closePath(); ctx.stroke();
  }
  (rig.strands ?? []).forEach((strand, index) => {
    ctx.strokeStyle = "#ff2fd0"; ctx.lineWidth = 3; ctx.beginPath();
    strand.nodes.forEach(([x, y], k) => (k ? ctx.lineTo(x * SCALE, y * SCALE) : ctx.moveTo(x * SCALE, y * SCALE)));
    ctx.stroke();
    ctx.fillStyle = "#ffff00"; ctx.font = "bold 18px sans-serif"; ctx.fillText(String(index + 1), strand.nodes[0][0] * SCALE + 4, strand.nodes[0][1] * SCALE - 4);
  });
  return sheet.toDataURL("image/png");
};
