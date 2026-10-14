import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TOUCH_HOLD_MS, touchPress, touchPressSpec } from './lib/touchPress.mts';
import { validateSteps } from './lib/scenarioSchema.mts';

const fakePage = (point: { x: number; y: number; target: string } | Error) => {
  const sent: Array<[string, unknown]> = [];
  let detached = false;
  const page = {
    evaluate: async () => { if (point instanceof Error) throw point; return point; },
    context: () => ({
      newCDPSession: async () => ({
        send: async (method: string, params: unknown) => { sent.push([method, params]); return {}; },
        detach: async () => { detached = true; },
      }),
    }),
  };
  return { page, sent, detached: () => detached };
};

test('touch-press needs a target and a bounded hold', () => {
  assert.throws(() => touchPressSpec({}), /selector or a graphNode/);
  assert.throws(() => touchPressSpec({ selector: '#x', holdMs: -1 }), /holdMs/);
  assert.equal(touchPressSpec({ graphNode: 'gate' }).holdMs, DEFAULT_TOUCH_HOLD_MS);
  assert.deepEqual(touchPressSpec({ selector: '#x', holdMs: 40 }), { selector: '#x', holdMs: 40 });
});

test('touch-press sends touchStart, waits the hold, touchEnd, then turns emulation off and detaches', async () => {
  const { page, sent, detached } = fakePage({ x: 10, y: 20, target: 'node gate' });
  const waits: number[] = [];
  const result = await touchPress(page, { graphNode: 'gate', holdMs: 650 }, async (ms) => { waits.push(ms); });
  assert.deepEqual(sent.map(([method, params]) => [method, (params as { type?: string; enabled?: boolean }).type ?? (params as { enabled?: boolean }).enabled]), [
    ['Emulation.setTouchEmulationEnabled', true],
    ['Input.dispatchTouchEvent', 'touchStart'],
    ['Input.dispatchTouchEvent', 'touchEnd'],
    ['Emulation.setTouchEmulationEnabled', false],
  ]);
  assert.deepEqual((sent[1][1] as { touchPoints: unknown[] }).touchPoints, [{ x: 10, y: 20 }]);
  assert.deepEqual(waits, [650]);
  assert.equal(detached(), true);
  assert.equal(result.input, 'cdp-touch');
});

test('touch-press opens no CDP session when the target is missing', async () => {
  const { page, sent } = fakePage(new Error('graph node nope is not on the canvas'));
  await assert.rejects(touchPress(page, { graphNode: 'nope' }), /not on the canvas/);
  assert.equal(sent.length, 0);
});

test('touch-press is part of the closed ui vocabulary', () => {
  assert.deepEqual(validateSteps([{ ui: { action: 'touch-press', graphNode: 'gate' } }]), []);
  assert.equal(validateSteps([{ ui: { action: 'touch-hold' } }]).length, 1);
});
