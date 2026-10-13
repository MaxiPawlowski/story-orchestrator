export type PosePoint = [number, number] | null;
export interface Keypoints { format: "openpose-body18"; canvas: [number, number]; points: PosePoint[] }
export interface RetargetBox { x: number; y: number; width: number; height: number }
export interface Retarget { canvas: [number, number]; box: RetargetBox; headToHip?: number; member?: Keypoints; version?: number }

export const RETARGET_VERSION = 3;

const BONES: ReadonlyArray<readonly [number, number]> = [[1, 2], [2, 3], [3, 4], [1, 5], [5, 6], [6, 7], [1, 8], [8, 9], [9, 10], [1, 11], [11, 12], [12, 13], [1, 0],
  [0, 14], [14, 16], [0, 15], [15, 17]];
const MIRROR: Readonly<Record<number, number>> = { 2: 5, 5: 2, 3: 6, 6: 3, 4: 7, 7: 4, 8: 11, 11: 8, 9: 12, 12: 9, 10: 13, 13: 10, 14: 15, 15: 14, 16: 17, 17: 16 };
const HEAD_BONES: ReadonlySet<number> = new Set([0, 14, 15, 16, 17]);
const TRUNK_PAIRS: ReadonlyArray<readonly [number, number]> = [[2, 5], [8, 11]];
const FLOOR_TAGS: ReadonlySet<string> = new Set(["sitting", "kneeling", "lying"]);
const DEFAULT_NECK = 0.22, DEFAULT_HIP = 0.47, DEFAULT_ANKLE = 0.9;
const CANONICAL_NECK_TO_ANKLE = 830 / 1152;
const MIN_BONE = 2, FORESHORTEN_MIN = 0.25, FORESHORTEN_MAX = 1.1, MARGIN = 0.015;

const present = (point: PosePoint | undefined): point is [number, number] => point !== null && point !== undefined;
const round = (value: number): number => Math.round(value * 10) / 10;

function boneLengths(points: readonly PosePoint[], mirrored: boolean): Array<number | undefined> {
  const own: Array<number | undefined> = new Array(18).fill(undefined);
  BONES.forEach(([a, b]) => {
    const from = points[a], to = points[b];
    if (present(from) && present(to)) own[b] = Math.hypot(to[0] - from[0], to[1] - from[1]);
  });
  if (!mirrored) return own;
  return own.map((value, child) => {
    const other = MIRROR[child] === undefined ? undefined : own[MIRROR[child]];
    const good = (length: number | undefined): length is number => length !== undefined && length >= MIN_BONE;
    if (good(value) && good(other)) return (value + other) / 2;
    return good(value) ? value : good(other) ? other : undefined;
  });
}

function middle(a: PosePoint | undefined, b: PosePoint | undefined): [number, number] | null {
  if (present(a) && present(b)) return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return present(a) ? a : present(b) ? b : null;
}

function bounds(points: readonly PosePoint[]): { minX: number; maxX: number; minY: number; maxY: number } {
  const visible = points.filter(present);
  return { minX: Math.min(...visible.map((p) => p[0])), maxX: Math.max(...visible.map((p) => p[0])), minY: Math.min(...visible.map((p) => p[1])),
    maxY: Math.max(...visible.map((p) => p[1])) };
}

function fit(points: readonly PosePoint[], canvas: readonly [number, number]): PosePoint[] {
  const margin = Math.max(2, Math.round(Math.min(canvas[0], canvas[1]) * MARGIN));
  const { minX, maxX, minY, maxY } = bounds(points);
  const k = Math.min(1, (canvas[0] - 2 * margin) / Math.max(1, maxX - minX), (canvas[1] - 2 * margin) / Math.max(1, maxY - minY));
  const pivotX = (minX + maxX) / 2, pivotY = maxY;
  const shrunk = points.map((p) => present(p) ? [pivotX + (p[0] - pivotX) * k, pivotY + (p[1] - pivotY) * k] as [number, number] : null);
  const after = bounds(shrunk);
  const dx = after.minX < margin ? margin - after.minX : after.maxX > canvas[0] - 1 - margin ? canvas[0] - 1 - margin - after.maxX : 0;
  const dy = after.minY < margin ? margin - after.minY : after.maxY > canvas[1] - 1 - margin ? canvas[1] - 1 - margin - after.maxY : 0;
  return shrunk.map((p) => present(p)
    ? [round(Math.max(0, Math.min(canvas[0] - 1, p[0] + dx))), round(Math.max(0, Math.min(canvas[1] - 1, p[1] + dy)))] as [number, number] : null);
}

export function retargetPose(pose: { keypoints: Keypoints; tags: readonly string[] }, target: Retarget, reference?: Keypoints): Keypoints {
  const { box, canvas } = target;
  if (![...canvas, box.width, box.height].every((n) => Number.isFinite(n) && n > 0) || ![box.x, box.y].every((n) => Number.isFinite(n) && n >= 0)
    || box.x + box.width > canvas[0] || box.y + box.height > canvas[1]) throw new Error("Retarget needs an alpha box inside the sprite canvas.");
  const ratio = target.headToHip;
  if (ratio !== undefined && (!Number.isFinite(ratio) || ratio <= 0 || ratio > 2)) throw new Error("Head-to-hip ratio must be positive and at most two.");
  const source = pose.keypoints.points;
  const scale = box.height * (DEFAULT_ANKLE - DEFAULT_NECK) / (CANONICAL_NECK_TO_ANKLE * pose.keypoints.canvas[1]);
  const floorTagged = pose.tags.some((tag) => FLOOR_TAGS.has(tag));
  const lying = pose.tags.includes("lying");
  const member = target.member?.points;
  const memberHips = member ? middle(member[8], member[11]) : null;
  const ankles = member ? [member[10], member[13]].filter(present).map((p) => p[1]) : [];
  const anchorX = memberHips ? memberHips[0] : box.x + box.width / 2;
  const hipY = memberHips ? memberHips[1] : box.y + box.height * DEFAULT_HIP;
  const floorY = ankles.length ? Math.max(...ankles) : box.y + box.height * DEFAULT_ANKLE;

  const neck = source[1];
  if (!present(neck)) {
    const { minX, maxX, maxY } = bounds(source);
    const moved = source.map((p) => present(p) ? [anchorX + (p[0] - (minX + maxX) / 2) * scale, floorY + (p[1] - maxY) * scale] as [number, number] : null);
    return { format: "openpose-body18", canvas, points: fit(moved, canvas) };
  }

  const own = boneLengths(source, false), standing = reference ? boneLengths(reference.points, true) : [], measured = member ? boneLengths(member, true) : [];
  const lengths = BONES.map(([, child]) => {
    const length = own[child];
    if (length === undefined) return undefined;
    const known = measured[child], stand = standing[child];
    if (known !== undefined && stand !== undefined && stand >= MIN_BONE) return known * Math.max(FORESHORTEN_MIN, Math.min(FORESHORTEN_MAX, length / stand));
    return length * scale;
  });
  if (lying) TRUNK_PAIRS.forEach(([a, b]) => {
    const left = BONES.findIndex(([, child]) => child === a), right = BONES.findIndex(([, child]) => child === b);
    if (lengths[left] === undefined || lengths[right] === undefined) return;
    lengths[left] = lengths[right] = ((lengths[left] as number) + (lengths[right] as number)) / 2;
  });
  if (!member && ratio) {
    const torso = [8, 11].flatMap((child) => { const at = BONES.findIndex(([, b]) => b === child); return lengths[at] === undefined ? [] : [lengths[at] as number]; });
    const headAt = BONES.findIndex(([, b]) => b === 0), head = lengths[headAt];
    if (torso.length && head) {
      const k = Math.max(0.5, Math.min(2, ratio * (torso.reduce((a, b) => a + b, 0) / torso.length) / head));
      BONES.forEach(([, child], at) => { if (HEAD_BONES.has(child) && lengths[at] !== undefined) lengths[at] = (lengths[at] as number) * k; });
    }
  }

  const placed: PosePoint[] = new Array(18).fill(null);
  placed[1] = [0, 0];
  BONES.forEach(([parent, child], at) => {
    const from = placed[parent], a = source[parent], b = source[child], length = lengths[at];
    if (!present(from) || !present(a) || !present(b) || length === undefined) return;
    const dx = b[0] - a[0], dy = b[1] - a[1], distance = Math.hypot(dx, dy) || 1;
    placed[child] = [from[0] + dx / distance * length, from[1] + dy / distance * length];
  });

  const hips = middle(placed[8], placed[11]) ?? [0, 0];
  const { minX, maxX, maxY } = bounds(placed);
  let shiftX: number, shiftY: number;
  if (floorTagged) {
    shiftY = floorY - maxY;
    shiftX = lying ? box.x + box.width / 2 - (minX + maxX) / 2 : anchorX - hips[0];
  } else {
    shiftX = anchorX - hips[0];
    shiftY = hipY - hips[1];
  }
  const moved = placed.map((p) => present(p) ? [p[0] + shiftX, p[1] + shiftY] as [number, number] : null);
  return { format: "openpose-body18", canvas, points: fit(moved, canvas) };
}
