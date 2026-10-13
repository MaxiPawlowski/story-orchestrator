import { retargetPose, retargetVersion } from '../../../src/sprites/poses/retarget.ts';
export type Point = [number, number] | null;
export interface Keypoints { format: 'openpose-body18'; canvas: [number, number]; points: Point[] }
export interface PoseLike { id: string; text: string; tags: string[]; keypoints: Keypoints; version?: number }
export interface Box { x: number; y: number; width: number; height: number }

export const readBody18 = (flat: unknown): Point[] | null => {
    if (!Array.isArray(flat) || flat.length !== 54 || flat.some((n) => typeof n !== 'number' || !Number.isFinite(n))) return null;
    return Array.from({ length: 18 }, (_, at) => Number(flat[at * 3 + 2]) > 0.3 ? [Number(flat[at * 3]), Number(flat[at * 3 + 1])] : null);
};

export function readDwpose(raw: unknown): Keypoints {
    const frames: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const frame = Array.isArray(frames) && frames.length === 1 ? frames[0] : null;
    if (!frame || !Array.isArray(frame.people) || frame.people.length < 1) throw new Error('no person found');
    const width = Number(frame.canvas_width), height = Number(frame.canvas_height);
    const points = readBody18(frame.people[0].pose_keypoints_2d);
    if (!points || !Number.isInteger(width) || !Number.isInteger(height)) throw new Error('unreadable DWPose output');
    return { format: 'openpose-body18', canvas: [width, height], points };
}

export function posePck(output: Keypoints, target: Keypoints, threshold = 0.1): number {
    const points = target.points.flatMap((point, index) => point ? [{ point, found: output.points[index] }] : []);
    if (!points.length) return 0;
    const visible = points.map(({ point }) => point);
    const extent = Math.max(1, Math.max(...visible.map((p) => p[0])) - Math.min(...visible.map((p) => p[0])),
        Math.max(...visible.map((p) => p[1])) - Math.min(...visible.map((p) => p[1])));
    return points.filter(({ point, found }) => {
        if (!found) return false;
        const x = found[0] * target.canvas[0] / output.canvas[0], y = found[1] * target.canvas[1] / output.canvas[1];
        return Math.hypot(point[0] - x, point[1] - y) <= threshold * extent;
    }).length / points.length;
}

export function headToHipRatio(keypoints: Keypoints): number | undefined {
    const [nose, neck] = keypoints.points, left = keypoints.points[8], right = keypoints.points[11];
    if (!nose || !neck || !left || !right) return undefined;
    const torso = Math.hypot(neck[0] - (left[0] + right[0]) / 2, neck[1] - (left[1] + right[1]) / 2);
    const ratio = Math.hypot(nose[0] - neck[0], nose[1] - neck[1]) / torso;
    return Number.isFinite(ratio) && ratio > 0 && ratio <= 2 ? ratio : undefined;
}

export function poseHead(keypoints: Keypoints): Box | null {
    const head = [0, 14, 15, 16, 17].flatMap((at) => keypoints.points[at] ? [keypoints.points[at] as [number, number]] : []);
    if (!head.length) return null;
    const minX = Math.min(...head.map((p) => p[0])), maxX = Math.max(...head.map((p) => p[0]));
    const minY = Math.min(...head.map((p) => p[1])), maxY = Math.max(...head.map((p) => p[1]));
    const span = Math.max(16, maxX - minX, maxY - minY);
    const x = Math.max(0, Math.floor(minX - span * 0.5)), y = Math.max(0, Math.floor(minY - span * 0.65));
    return { x, y, width: Math.min(keypoints.canvas[0] - x, Math.ceil(span * 2)), height: Math.min(keypoints.canvas[1] - y, Math.ceil(span * 2.2)) };
}

export interface Retarget { canvas: [number, number]; box: Box; headToHip?: number; member?: Keypoints }

export const retarget = (pose: PoseLike, target: Retarget, reference?: Keypoints): Keypoints =>
    retargetPose({ keypoints: pose.keypoints, tags: pose.tags }, { ...target, version: retargetVersion(pose) }, reference) as Keypoints;

export function percentile(values: number[], fraction: number): number {
    if (!values.length) return NaN;
    const sorted = [...values].sort((a, b) => a - b);
    const rank = Math.max(0, Math.ceil(fraction * sorted.length) - 1);
    return sorted[Math.min(rank, sorted.length - 1)];
}
export const median = (values: number[]): number => {
    if (!values.length) return NaN;
    const sorted = [...values].sort((a, b) => a - b), mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export function quote(input: { bodySeconds: number[]; headSeconds: number[]; bodies: number; heads: number; deadlineMs: number; nowMs: number }) {
    const body = median(input.bodySeconds), head = median(input.headSeconds);
    const seconds = body * input.bodies + head * input.heads;
    return { bodySeconds: body, headSeconds: head, estimateSeconds: seconds, finishesAtMs: input.nowMs + seconds * 1000, fits: input.nowMs + seconds * 1000 <= input.deadlineMs };
}

export interface Verdict { identity2: number | null; identity3: number | null; pck2: number; pck3: number; qa2: number; qa3: number; medianBody: number; p90Body: number;
    peakVramGb: number | null; labelVisible: number | null }
export const FLOORS = { identity: 0.9, pck2: 0.7, qa: 0.9, medianBodySeconds: 90, p90BodySeconds: 150, peakVramGb: 22, labelVisible: 0.9, pckGain: 0.1 } as const;

export function verdict(v: Verdict) {
    const identityKept = v.identity2 !== null && v.identity3 !== null && v.identity2 >= FLOORS.identity && v.identity2 >= v.identity3;
    const met = {
        identity2: v.identity2 === null ? null : v.identity2 >= FLOORS.identity,
        pck2: v.pck2 >= FLOORS.pck2,
        qa2: v.qa2 >= FLOORS.qa,
        medianBody: v.medianBody <= FLOORS.medianBodySeconds,
        p90Body: v.p90Body <= FLOORS.p90BodySeconds,
        peakVram: v.peakVramGb === null ? null : v.peakVramGb <= FLOORS.peakVramGb,
        labelVisible: v.labelVisible === null ? null : v.labelVisible >= FLOORS.labelVisible,
        pckGain: v.pck2 - v.pck3 >= FLOORS.pckGain - 1e-9,
        noIdentityLoss: identityKept,
    };
    const decision = met.pck2 && met.pckGain && identityKept ? 'P2 passes' : (v.pck3 >= FLOORS.pck2 || v.pck2 >= FLOORS.pck2) ? 'P3 sufficient (P2 not kept)'
        : 'P4 needed (not downloaded)';
    return { met, decision };
}

export function peakFromSamples(csv: string): number | null {
    const used = csv.split(/\r?\n/).map((line) => Number(line.split(',')[1]?.trim().split(' ')[0])).filter((n) => Number.isFinite(n) && n > 0);
    return used.length ? Math.max(...used) : null;
}

export function shapePck(output: Keypoints, target: Keypoints, threshold = 0.1): number {
    const toTarget = (p: [number, number]): [number, number] => [p[0] * target.canvas[0] / output.canvas[0], p[1] * target.canvas[1] / output.canvas[1]];
    const wanted = target.points.flatMap((point, index) => point ? [{ point, index }] : []);
    if (!wanted.length) return 0;
    const paired = wanted.flatMap(({ point, index }) => output.points[index] ? [{ from: point, to: toTarget(output.points[index] as [number, number]) }] : []);
    if (paired.length < 4) return 0;
    const span = (values: number[]) => [Math.min(...values), Math.max(...values)] as const;
    const fit = (axis: 0 | 1) => {
        const [fa, fb] = span(paired.map((p) => p.from[axis])), [ta, tb] = span(paired.map((p) => p.to[axis]));
        const scale = fb - fa > 1e-6 ? (tb - ta) / (fb - fa) : 1;
        return (value: number) => ta + (value - fa) * scale;
    };
    const mapX = fit(0), mapY = fit(1);
    const extent = Math.max(1, ...[0, 1].map((axis) => { const [a, b] = span(wanted.map(({ point }) => point[axis])); return b - a; }));
    return wanted.filter(({ point, index }) => {
        const found = output.points[index];
        if (!found) return false;
        const moved = toTarget(found as [number, number]);
        return Math.hypot(mapX(point[0]) - moved[0], mapY(point[1]) - moved[1]) <= threshold * extent;
    }).length / wanted.length;
}
