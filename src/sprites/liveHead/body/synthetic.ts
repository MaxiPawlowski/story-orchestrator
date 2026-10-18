import type { BodyManifest, BodyRig } from "./types";
import { loadBodyManifest } from "./validate";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

export const syntheticBodyRig: BodyRig = {
  version: 1, kind: "body", pose: "standing", image: { width: 400, height: 600 },
  head: { cx: 200, cy: 70, rx: 38, ry: 46, pivotX: 200, pivotY: 128, maxRoll: 0.1, band: [107, 128], side: [1.2, 1.8] },
  torso: { pivotX: 200, pivotY: 300, maxRoll: 0.03, sway: 3.44, breath: 2.06, waistBand: [250, 300], breathBand: [140, 250],
    chest: { cx: 200, cy: 180, rx: 40, ry: 38 } },
  arms: [
    { side: "left", state: "free", shoulder: [150, 145], elbow: [138, 225], wrist: [132, 300], swing: 0.12, bend: 0.22,
      outline: [[140, 132], [162, 138], [158, 225], [148, 300], [146, 330], [120, 330], [118, 300], [124, 225], [130, 140]] },
    { side: "right", state: "resting", shoulder: [250, 145], elbow: [262, 225], wrist: [268, 300], swing: 0.12, bend: 0.22,
      outline: [[260, 132], [270, 140], [276, 225], [282, 300], [280, 330], [254, 330], [252, 300], [242, 225], [238, 138]] },
  ],
  strands: [
    { name: "hair1", nodes: [[170, 40], [160, 70], [156, 100], [154, 128]], sigma: 6, k: 0.6, max: 3.8 },
    { name: "hair2", nodes: [[230, 40], [240, 70], [244, 100], [246, 128]], sigma: 6, k: 0.6, max: 3.8 },
  ],
  eyes: [{ cx: 186, cy: 72, rx: 6.84, ry: 5.52 }, { cx: 214, cy: 72, rx: 6.84, ry: 5.52 }],
  mesh: { baseCell: 8, armCell: 4 },
};

export const syntheticBody: BodyManifest = loadBodyManifest({
  version: 1, kind: "body", member: "shape-body", look: "default", pose: "standing", artHash: "b".repeat(64), source: "/characters/shape/standing.png",
  rig: syntheticBodyRig, layers: [{ name: "base", rect: [0, 0, 400, 600], image: PNG }, { name: "arm0", rect: [114, 128, 52, 206], image: PNG }],
});
