import * as data from "./syntheticHead.json";
import { loadHeadManifest, manifestRef } from "./manifest";

export const syntheticHead = loadHeadManifest((data as { default?: unknown }).default ?? data);
export const syntheticRef = manifestRef(syntheticHead);

const motionRig = { ...syntheticHead.rig, strands: [
  { name: "fringeL", nodes: [[44, 22], [40, 32], [37, 41], [35, 48]], sigma: 5, k: 1, max: 2.5 },
  { name: "fringeR", nodes: [[84, 22], [88, 32], [91, 41], [93, 48]], sigma: 5, k: 1, max: 2.5 },
  { name: "sideL", nodes: [[25, 45], [23, 65], [24, 85], [27, 102]], sigma: 6, k: 0.6, max: 3.5 },
  { name: "sideR", nodes: [[103, 45], [105, 65], [104, 85], [101, 102]], sigma: 6, k: 0.6, max: 3.5 },
] };
export const syntheticMotionHead = loadHeadManifest({ ...syntheticHead, member: "shape-motion", rig: motionRig });
export const syntheticMotionRef = manifestRef(syntheticMotionHead);
