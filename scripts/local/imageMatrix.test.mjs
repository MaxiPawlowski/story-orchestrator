import test from 'node:test';
import assert from 'node:assert/strict';
import { comfyArgsFor, planCells, PLANS, applicable, changesPixels, estimateMinutes, diffVerdict, ratingPack, switchCost } from './imageMatrix.mjs';

const BASE = ['--cache-ram', '8', '--reserve-vram', '2', '--fast-disk'];

test('baseline arm keeps the controller flags', () => {
    assert.deepEqual(comfyArgsFor(BASE, 'sdpa'), BASE);
});

test('arms add and drop flags, and fast features merge into one --fast', () => {
    assert.deepEqual(comfyArgsFor(BASE, 'ck+fp16acc+autotune'), [...BASE, '--use-ck-attention', '--fast', 'fp16_accumulation', 'autotune']);
    assert.deepEqual(comfyArgsFor(BASE, 'nofastdisk'), ['--cache-ram', '8', '--reserve-vram', '2', '--disable-fast-disk']);
    assert.deepEqual(comfyArgsFor(BASE, 'cachedefault'), ['--reserve-vram', '2', '--fast-disk']);
    assert.deepEqual(comfyArgsFor([...BASE, '--fast', 'autotune'], 'fp16acc'), [...BASE, '--fast', 'fp16_accumulation']);
});

test('unknown arm or workflow fails loudly', () => {
    assert.throws(() => comfyArgsFor(BASE, 'sage'), /Unknown image arm/);
    assert.throws(() => planCells('flux:sdpa'), /Unknown image workflow/);
});

test('fp16 accumulation is skipped on the int8/bf16 Qwen edit', () => {
    assert.equal(applicable('sdxl-scene', 'fp16acc').ok, true);
    const cell = planCells('qwen-edit:fp16acc')[0];
    assert.match(cell.skip, /fp16/);
    assert.equal(estimateMinutes([cell], 2, 6), 0);
});

test('every planned cell is valid and the full plan has a baseline per workflow', () => {
    for (const name of Object.keys(PLANS)) {
        const cells = planCells(name);
        for (const workflow of new Set(cells.map((cell) => cell.workflow))) assert.ok(cells.some((cell) => cell.workflow === workflow && cell.arm === 'sdpa'), `${name} ${workflow}`);
        assert.equal(new Set(cells.map((cell) => cell.id)).size, cells.length);
    }
    assert.ok(estimateMinutes(planCells('full'), 2, 6) > estimateMinutes(planCells('quick'), 2, 6));
});

test('pixel-changing arms are the ones that need a quality check', () => {
    assert.equal(changesPixels('sdpa'), false);
    assert.equal(changesPixels('highvram+nofastdisk'), false);
    assert.equal(changesPixels('highvram+ck'), true);
});

test('diff verdicts', () => {
    assert.equal(diffVerdict({ maxAbs: 0, psnr: 999 }), 'identical');
    assert.equal(diffVerdict({ maxAbs: 3, psnr: 48 }), 'near');
    assert.equal(diffVerdict({ maxAbs: 200, psnr: 21 }), 'changed');
    assert.equal(diffVerdict({ maxAbs: null }), 'unreadable');
});

test('rating pack hides which side is the candidate, stably per salt', () => {
    const pairs = Array.from({ length: 12 }, (_, run) => ({ cell: 'sdxl-scene__ck', run, control: `c${run}.png`, candidate: `x${run}.png` }));
    const pack = ratingPack(pairs, 'salt');
    assert.deepEqual(ratingPack(pairs, 'salt'), pack);
    assert.ok(pack.some((item) => item.key.candidateIs === 'a') && pack.some((item) => item.key.candidateIs === 'b'));
    for (const item of pack) assert.equal(item.key.candidateIs === 'a' ? item.a : item.b, `x${item.key.run}.png`);
});

test('switch cost separates cold, switched and steady runs', () => {
    const runs = [
        { workflow: 'a', cold: true, switched: false, wallMs: 30000, execMs: 9000 },
        { workflow: 'b', cold: true, switched: true, wallMs: 60000, execMs: 35000 },
        { workflow: 'a', cold: false, switched: true, wallMs: 14000, execMs: 8000 },
        { workflow: 'a', cold: false, switched: false, wallMs: 8100, execMs: 7900 },
    ];
    const cost = switchCost(runs);
    assert.equal(cost.a.coldWallMs, 30000);
    assert.equal(cost.a.switchedWallMedianMs, 14000);
    assert.equal(cost.a.steadyExecMs, 7900);
});
