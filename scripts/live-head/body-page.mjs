import { BodyRenderer } from "../../src/sprites/liveHead/body/renderer";
import { loadBodyManifest } from "../../src/sprites/liveHead/body/validate";
import { buildBodyManifest } from "../../src/sprites/liveHead/body/synthesize";
import { invertedTriangles } from "../../src/sprites/liveHead/body/geometry";
import { restHead } from "../../src/sprites/liveHead/drivers";
import { decodeBytes } from "../../src/sprites/liveHead/synthesis/decode";
import { encodeImage } from "../../src/sprites/builder/images";

const load = (src) => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error("layer decode failed")); image.src = src; });

window.synthesizeBodyRig = async ({ image, identity, landmarks }) => {
  const bytes = new Uint8Array(await (await fetch(image)).arrayBuffer());
  const pixels = await decodeBytes(bytes, new AbortController().signal);
  return buildBodyManifest(identity, pixels, landmarks, async (cut) => encodeImage(cut));
};

export const BODY_EXTREMES = [
  ["rest", {}, null],
  ["breath 1", { breath: 1 }, null],
  ["sway left (-10)", { bodyAngleX: -10, bodyAngleZ: -10 }, null], ["sway right (+10)", { bodyAngleX: 10, bodyAngleZ: 10 }, null],
  ["upper arms -10", { armAngle: -10 }, null], ["upper arms +10", { armAngle: 10 }, null],
  ["forearms -10", { handAngle: -10 }, null], ["forearms +10", { handAngle: 10 }, null],
  ["hair +x", {}, [1, 0]], ["hair -x", {}, [-1, 0]], ["hair +y", {}, [0, 1]], ["hair -y", {}, [0, -1]],
  ["head tilt -30", { angleZ: -30 }, null], ["head tilt +30", { angleZ: 30 }, null],
  ["all -10 / hair -x", { bodyAngleX: -10, bodyAngleZ: -10, armAngle: -10, handAngle: -10 }, [-1, 0]],
  ["all +10 / hair +x", { bodyAngleX: 10, bodyAngleZ: 10, armAngle: 10, handAngle: 10 }, [1, 0]],
];

window.renderBodyReview = async (value, sourceUrl) => {
  const manifest = loadBodyManifest(value), rig = manifest.rig, { width, height } = rig.image;
  const canvas = document.createElement("canvas");
  canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  document.body.append(canvas);
  const renderer = new BodyRenderer(canvas, manifest);
  const images = await Promise.all(manifest.layers.map((layer) => load(layer.image)));
  manifest.layers.forEach((layer, i) => renderer.add(layer, images[i]));
  const source = await load(sourceUrl);
  const inverted = {};
  const paint = ([name, patch, hold]) => {
    renderer.holdHair(hold ? hold[0] : null, hold ? hold[1] : 0);
    renderer.draw({ ...restHead(), ...patch, hair: hold ? 1 : 0 });
    inverted[name] = renderer.meshes().reduce((sum, mesh) => sum + invertedTriangles(mesh.rest, mesh.pos, mesh.triangles), 0);
  };
  const cells = (list, region, tileWidth, columns, withSource) => {
    const [x0, y0, x1, y1] = region, cw = Math.round(tileWidth), ch = Math.round(tileWidth * (y1 - y0) / (x1 - x0));
    const entries = withSource ? [["source image", null, null], ...list] : list;
    const rows = Math.ceil(entries.length / columns), sheet = document.createElement("canvas");
    sheet.width = cw * columns; sheet.height = (ch + 22) * rows;
    const ctx = sheet.getContext("2d"); ctx.imageSmoothingEnabled = true; ctx.fillStyle = "#8c8c8c"; ctx.fillRect(0, 0, sheet.width, sheet.height);
    entries.forEach((entry, k) => {
      const ox = (k % columns) * cw, oy = Math.floor(k / columns) * (ch + 22);
      if (entry[1] === null) ctx.drawImage(source, x0, y0, x1 - x0, y1 - y0, ox, oy + 22, cw, ch);
      else {
        paint(entry);
        const px = canvas.width / width;
        ctx.drawImage(canvas, x0 * px, y0 * px, (x1 - x0) * px, (y1 - y0) * px, ox, oy + 22, cw, ch);
      }
      ctx.fillStyle = "#fff"; ctx.font = "15px sans-serif"; ctx.fillText(entry[0], ox + 4, oy + 16);
    });
    renderer.holdHair(null);
    return { png: sheet.toDataURL("image/png"), jpeg: sheet.toDataURL("image/jpeg", 0.86) };
  };
  const head = rig.head, top = Math.max(0, head.cy - head.ry * 1.2), bottom = Math.min(height, rig.torso.pivotY + (rig.torso.pivotY - top) * 0.35);
  const xs = [head.cx - head.rx * 2, head.cx + head.rx * 2, ...(rig.arms ?? []).flatMap((arm) => arm.outline.map((p) => p[0]))];
  const pad = (Math.max(...xs) - Math.min(...xs)) * 0.15, zoomBox = [Math.max(0, Math.min(...xs) - pad), Math.max(0, top - pad), Math.min(width, Math.max(...xs) + pad), bottom];
  const sheets = {
    "body-core": cells(BODY_EXTREMES, [0, 0, width, height], 230, 6, true),
    "body-zoom": cells(BODY_EXTREMES.filter(([name]) => /rest|sway|arms|all/.test(name)), zoomBox, 300, 4, true),
  };
  const parts = renderer.motionParts();
  renderer.destroy(); canvas.remove();
  return { sheets, parts, inverted };
};

window.renderBodyOverlay = async (value, sourceUrl) => {
  const manifest = loadBodyManifest(value), rig = manifest.rig, { width, height } = rig.image;
  const sheet = document.createElement("canvas");
  sheet.width = width; sheet.height = height;
  const ctx = sheet.getContext("2d");
  ctx.drawImage(await load(sourceUrl), 0, 0);
  const dot = ([x, y], colour, label) => { ctx.fillStyle = colour; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); if (label) { ctx.font = "bold 13px sans-serif"; ctx.fillText(label, x + 6, y - 4); } };
  ctx.strokeStyle = "#ffff00"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(rig.head.cx, rig.head.cy, rig.head.rx, rig.head.ry, 0, 0, Math.PI * 2); ctx.stroke();
  dot([rig.head.pivotX, rig.head.pivotY], "#ffff00", "neck"); dot([rig.torso.chest.cx, rig.torso.chest.cy], "#ffff00", "chest"); dot([rig.torso.pivotX, rig.torso.pivotY], "#ffff00", "hips");
  ctx.strokeStyle = "#ffff00"; ctx.setLineDash([6, 4]);
  for (const y of [rig.torso.waistBand[0], rig.torso.waistBand[1]]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  ctx.setLineDash([]);
  (rig.arms ?? []).forEach((arm, index) => {
    ctx.strokeStyle = arm.state === "free" ? "#00e5ff" : arm.state === "resting" ? "#7cff4f" : "#ff9f1a"; ctx.lineWidth = 2; ctx.beginPath();
    arm.outline.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); [arm.shoulder, arm.elbow, arm.wrist].forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    dot(arm.shoulder, ctx.strokeStyle, `arm${index + 1} ${arm.state}`); dot(arm.elbow, ctx.strokeStyle); dot(arm.wrist, ctx.strokeStyle);
  });
  (rig.strands ?? []).forEach((strand, index) => {
    ctx.strokeStyle = "#ff2fd0"; ctx.lineWidth = 3; ctx.beginPath();
    strand.nodes.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.fillStyle = "#ff2fd0"; ctx.font = "bold 14px sans-serif"; ctx.fillText(String(index + 1), strand.nodes[0][0] + 4, strand.nodes[0][1] - 4);
  });
  return { png: sheet.toDataURL("image/png"), jpeg: sheet.toDataURL("image/jpeg", 0.88) };
};
