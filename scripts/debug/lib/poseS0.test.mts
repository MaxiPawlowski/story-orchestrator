import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FLOORS, shapePck, headToHipRatio, median, peakFromSamples, percentile, poseHead, posePck, quote, readBody18, readDwpose, retarget, verdict, type Keypoints, type PoseLike } from './poseS0.mts';

const standing = (): Keypoints => ({ format: 'openpose-body18', canvas: [100, 200], points: [[50, 20], [50, 40], [30, 45], [25, 80], [20, 110], [70, 45], [75, 80], [80, 110],
    [40, 110], [40, 150], [40, 190], [60, 110], [60, 150], [60, 190], [46, 16], [54, 16], [42, 18], [58, 18]] });
const flat = (points: Keypoints['points'], confidence = 0.9) => points.flatMap((p) => p ? [p[0], p[1], confidence] : [0, 0, 0]);

test('readBody18 keeps confident points and nulls the rest', () => {
    const raw = flat(standing().points);
    raw[2] = 0.1;
    const points = readBody18(raw);
    assert.equal(points?.[0], null);
    assert.deepEqual(points?.[1], [50, 40]);
    assert.equal(readBody18([1, 2, 3]), null);
});

test('readDwpose needs exactly one frame with a person and a canvas', () => {
    const frame = { canvas_width: 100, canvas_height: 200, people: [{ pose_keypoints_2d: flat(standing().points) }] };
    assert.deepEqual(readDwpose(JSON.stringify([frame])).canvas, [100, 200]);
    assert.throws(() => readDwpose([{ ...frame, people: [] }]), /no person/);
    assert.throws(() => readDwpose([frame, frame]));
});

test('posePck is 1 for the target itself and drops as joints move past 0.1 of the extent', () => {
    const target = standing();
    assert.equal(posePck(target, target), 1);
    const moved: Keypoints = { ...target, points: target.points.map((p, at) => at === 3 ? [p![0] + 30, p![1]] : p) as Keypoints['points'] };
    assert.equal(posePck(moved, target), 17 / 18);
    const missing: Keypoints = { ...target, points: target.points.map((p, at) => at < 9 ? null : p) as Keypoints['points'] };
    assert.equal(posePck(missing, target), 9 / 18);
});

test('posePck scales an output on another canvas to the target canvas', () => {
    const target = standing();
    const doubled: Keypoints = { format: 'openpose-body18', canvas: [200, 400], points: target.points.map((p) => p && [p[0] * 2, p[1] * 2]) as Keypoints['points'] };
    assert.equal(posePck(doubled, target), 1);
});

test('headToHipRatio and poseHead read the head from the shipped keypoints', () => {
    assert.ok(Math.abs((headToHipRatio(standing()) as number) - 20 / 70) < 1e-9);
    const hidden = standing();
    hidden.points[0] = null;
    assert.equal(headToHipRatio(hidden), undefined);
    const box = poseHead(standing());
    assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 100 && box.y + box.height <= 200);
});

test('retarget fits a shipped pose into the base alpha box', () => {
    const pose = JSON.parse(readFileSync('assets/poses/sit_chair.json', 'utf8')) as PoseLike;
    const keypoints = retarget(pose, { canvas: [768, 1152], box: { x: 200, y: 20, width: 300, height: 1100 } });
    const visible = keypoints.points.flatMap((p) => p ? [p] : []);
    assert.ok(Math.min(...visible.map((p) => p[0])) >= 200 - 1);
    assert.ok(Math.max(...visible.map((p) => p[1])) <= 1120 + 1);
});

test('median, percentile and quote', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([1, 2, 3, 4]), 2.5);
    assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 9);
    assert.ok(Number.isNaN(median([])));
    const q = quote({ bodySeconds: [60, 70], headSeconds: [20], bodies: 24, heads: 48, deadlineMs: 10_000_000, nowMs: 0 });
    assert.equal(q.estimateSeconds, 65 * 24 + 20 * 48);
    assert.equal(q.fits, true);
    assert.equal(quote({ bodySeconds: [60], headSeconds: [20], bodies: 24, heads: 48, deadlineMs: 1000, nowMs: 0 }).fits, false);
});

test('verdict applies the plan 33 floors and the P2 over P3 rule', () => {
    const base = { identity2: 0.95, identity3: 0.93, pck2: 0.8, pck3: 0.6, qa2: 1, qa3: 1, medianBody: 60, p90Body: 100, peakVramGb: 20, labelVisible: 1 };
    assert.equal(verdict(base).decision, 'P2 passes');
    assert.equal(verdict({ ...base, pck3: 0.75 }).decision, 'P3 sufficient (P2 not kept)');
    assert.equal(verdict({ ...base, pck2: 0.4, pck3: 0.3 }).decision, 'P4 needed (not downloaded)');
    assert.equal(verdict({ ...base, identity2: 0.85 }).met.noIdentityLoss, false);
    assert.equal(verdict({ ...base, identity2: 0.85 }).decision, 'P3 sufficient (P2 not kept)');
    assert.equal(verdict({ ...base, medianBody: 91 }).met.medianBody, false);
    assert.equal(verdict({ ...base, peakVramGb: null }).met.peakVram, null);
    assert.equal(FLOORS.pckGain, 0.1);
});

test('peakFromSamples takes the largest memory.used sample', () => {
    assert.equal(peakFromSamples('2026/10/11 11:00:00.1, 1000\n2026/10/11 11:00:01.1, 18500\n\n2026/10/11 11:00:02.1, 900\n'), 18500);
    assert.equal(peakFromSamples(''), null);
});

test('shapePck ignores a global stretch or shift that posePck counts as a miss', () => {
    const target = standing();
    const stretched: Keypoints = { ...target, points: target.points.map((p) => p && [p[0] * 0.5 + 20, p[1] * 0.6 + 30]) as Keypoints['points'] };
    assert.ok(posePck(stretched, target) < 0.5);
    assert.equal(shapePck(stretched, target), 1);
    const bent: Keypoints = { ...target, points: target.points.map((p, at) => at === 4 ? [p![0] + 60, p![1] - 40] : p) as Keypoints['points'] };
    assert.ok(shapePck(bent, target) < 1);
    assert.equal(shapePck({ ...target, points: target.points.map(() => null) }, target), 0);
});
