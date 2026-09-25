import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyJudgeMode, armSummary, costReport, diffArms, filterJudgeCalls, judgeModeSettings, markJudgeMode, withEstablished, overSteerColumns, parseJudgeMode, rescoreRates, restoreJudgeConfig, ringTotals, wardenNotes, wardenTally } from './judgeHarness.mts';
import { OVER_STEER_FAMILIES } from './overSteer.mts';
import { RUNNER_SET_GLOBALS } from './scenarioSchema.mts';

const judge = (use: string, detail: Record<string, unknown> = {}, messageId = 4) => ({ kind: 'judge', messageId, summary: `judge ${use} in 300 ms`, detail: { use, model: 'jev-1.13.0', ...detail } });

test('calls --use keeps one use, and reads the use from the summary on a record written before detail.use existed', () => {
  const events = [judge('warden'), judge('lore'), { kind: 'judge', summary: 'judge warden fell back (timeout) in 4000 ms', detail: { model: null } }, { kind: 'stagecraft', summary: 'x' }];
  assert.equal(filterJudgeCalls(events).length, 3);
  assert.equal(filterJudgeCalls(events, { use: 'warden' }).length, 2);
});

test('ring totals count what was sent, keep cache hits apart and charge nothing for a call that never left', () => {
  const totals = ringTotals([
    judge('warden', { inputTokens: 300, outputTokens: 20 }),
    judge('warden', { cached: true }),
    judge('lore', { fallback: 'unavailable' }),
    judge('lore', { fallback: 'timeout' }),
  ]);
  assert.deepEqual({ calls: totals.calls, cachedCalls: totals.cachedCalls, inputTokens: totals.inputTokens, fallbacks: totals.fallbacks }, { calls: 2, cachedCalls: 1, inputTokens: 300, fallbacks: { unavailable: 1, timeout: 1 } });
  assert.equal(totals.byUse.warden.calls, 1);
  assert.equal(totals.byUse.lore.calls, 1);
});

test('the cost report reads the meter and says what the ring no longer shows (X23)', () => {
  const report = costReport({ calls: 5, cachedCalls: 1, inputTokens: 1_000_000, outputTokens: 50, cost: 0 }, [judge('warden', { inputTokens: 400_000 })]);
  assert.deepEqual(report.notInRing, { calls: 4, inputTokens: 600_000 });
  assert.equal(report.estimatedUsd, 0.042);
  assert.equal(report.hostCost, null);
  assert.equal(costReport(null, []).estimatedUsd, null);
});

test('--judge-uses: a list is the on arm, off is the control, warden rides the stagecraft switch', () => {
  assert.equal(parseJudgeMode(undefined), null);
  assert.deepEqual(parseJudgeMode('off'), { label: 'off', uses: [] });
  assert.deepEqual(parseJudgeMode('warden, loreSelect', 'auto'), { label: 'on', uses: ['warden', 'loreSelect'], wardenMode: 'auto' });
  assert.throws(() => parseJudgeMode('warden', 'sometimes'), /auto or review/);
});

const before = { judge: { enabled: false, model: 'jev-1.13.0', uses: { loreSelect: false, stallCheck: true } }, warden: { wardenEnabled: false, wardenAcceptMode: 'review' }, curator: { curatorEnabled: true, acceptMode: 'auto' } };

test('the on arm switches the master switch on with exactly the listed uses; the control switches everything off', () => {
  const on = judgeModeSettings(before, { label: 'on', uses: ['loreSelect', 'warden'], wardenMode: 'auto' });
  assert.deepEqual(on.judge, { enabled: true, model: 'jev-1.13.0', uses: { loreSelect: true, stallCheck: false } });
  assert.deepEqual(on.warden, { wardenEnabled: true, wardenAcceptMode: 'auto' });
  const off = judgeModeSettings(before, { label: 'off', uses: [] });
  assert.deepEqual(off.judge.uses, { loreSelect: false, stallCheck: false });
  assert.equal(off.judge.enabled, false);
  assert.deepEqual(off.warden, { wardenEnabled: false, wardenAcceptMode: 'review' });
});

test('an unknown use is refused, so a typo cannot run the on arm with nothing on', () => {
  assert.throws(() => judgeModeSettings(before, { label: 'on', uses: ['sceneOoc'] }), /unknown judge use\(s\) sceneOoc/);
});

const fakePage = (state: { settings: unknown }) => {
  (globalThis as any).storyOrchestratorRuntime = { getGlobalSettings: () => state.settings, setStagecraftSettings: () => {} };
  return { evaluate: (fn, arg) => fn(arg) };
};

test('a judge mode refuses to write when the settings cannot be read back later', async () => {
  const page = fakePage({ settings: null });
  await assert.rejects(() => applyJudgeMode(page, { label: 'on', uses: ['loreSelect'] }), /could not be read/);
});

test('restore is a no-op when nothing moved, and refuses to claim a restore with no capture', async () => {
  const page = fakePage({ settings: { judge: before.judge, stagecraft: { ...before.warden, ...before.curator } } });
  assert.deepEqual(await restoreJudgeConfig(page, before as never), { restored: false, unchanged: true });
  assert.deepEqual(await restoreJudgeConfig(page, null), { restored: false, reason: 'no pre-run capture' });
});

test('restore puts back the WI curator switches a live judge fixture turned off, and a mode never moves them', async () => {
  assert.deepEqual(judgeModeSettings(before, { label: 'on', uses: ['warden'], wardenMode: 'auto' }).curator, before.curator);
  const state = { settings: { judge: before.judge, stagecraft: { ...before.warden, ...before.curator, curatorEnabled: false } } };
  (globalThis as any).storyOrchestratorRuntime = { getGlobalSettings: () => state.settings, setStagecraftSettings: (next) => { state.settings.stagecraft = { ...state.settings.stagecraft, ...next }; } };
  (globalThis as any).SillyTavern = { getContext: () => ({ extensionSettings: { 'story-orchestrator': { settings: state.settings } } }) };
  const result = await restoreJudgeConfig({ evaluate: (fn, arg) => fn(arg) }, before as never);
  assert.equal(result.restored, true);
  assert.deepEqual({ curatorEnabled: state.settings.stagecraft.curatorEnabled, acceptMode: state.settings.stagecraft.acceptMode }, before.curator);
});

test('the warden tally reads flagged, applied, lapsed and pending notes from the proposal ring', () => {
  const tally = wardenTally([
    { curator: 'warden', ops: [{ status: 'applied' }] },
    { curator: 'warden', ops: [{ status: 'rejected', message: 'lapsed' }] },
    { curator: 'warden', ops: [{ status: 'pending' }] },
    { curator: 'wi', ops: [{ status: 'applied' }] },
  ]);
  assert.deepEqual(tally, { flagged: 3, applied: 1, lapsed: 1, rejected: 0, pending: 1 });
});

test('rescore rates leave an unanswered reply out of the denominator', () => {
  assert.deepEqual(rescoreRates([{ arm: 'on', flagged: true }, { arm: 'on', flagged: false }, { arm: 'on', flagged: null }, { arm: 'off', flagged: false }]), [
    { arm: 'on', asked: 3, answered: 2, flagged: 1, defectRate: 0.5 },
    { arm: 'off', asked: 1, answered: 1, flagged: 0, defectRate: 0 },
  ]);
});

const record = (label: string, meter: Record<string, number>, id = 'J8') => ({ id, cleanup: { judgeMode: { mode: { label, uses: label === 'on' ? ['warden'] : [] } }, judgeMeter: meter, judgeCalls: { events: [judge('warden', { inputTokens: meter.inputTokens })] }, warden: { flagged: label === 'on' ? 2 : 0, applied: label === 'on' ? 1 : 0, lapsed: 0, rejected: 0, pending: 0 }, rescore: { rows: [{}, {}] } } });

test('the arm diff tabulates meter, warden and rescore columns, and refuses two different journeys', () => {
  const off = armSummary(record('off', { calls: 0, cachedCalls: 0, inputTokens: 0, outputTokens: 0, cost: 0 }));
  const on = armSummary(record('on', { calls: 6, cachedCalls: 1, inputTokens: 5400, outputTokens: 120, cost: 0 }));
  const rows = diffArms(off, on, [{ arm: 'off', asked: 2, answered: 2, flagged: 1, defectRate: 0.5 }, { arm: 'on', asked: 2, answered: 2, flagged: 0, defectRate: 0 }]);
  assert.deepEqual(rows.find((row) => row.metric === 'judge calls (meter)'), { metric: 'judge calls (meter)', off: 0, on: 6, delta: 6 });
  assert.deepEqual(rows.find((row) => row.metric === 'notes applied (warden)'), { metric: 'notes applied (warden)', off: 0, on: 1, delta: 1 });
  assert.deepEqual(rows.find((row) => row.metric === 'next-reply defect rate (rescore)'), { metric: 'next-reply defect rate (rescore)', off: 0.5, on: 0, delta: -0.5 });
  assert.throws(() => diffArms(off, armSummary(record('on', { calls: 1, cachedCalls: 0, inputTokens: 1, outputTokens: 0, cost: 0 }, 'J5'))), /different journeys/);
});

test('the page is told which judge arm is running, and a restore always takes the marker away', async () => {
  const page = { evaluate: (fn, arg) => fn(arg) };
  await markJudgeMode(page, { label: 'off', uses: [] });
  assert.deepEqual((globalThis as any).__soJudgeMode, { label: 'off', uses: [] });
  assert.ok(RUNNER_SET_GLOBALS.has('__soJudgeMode'), 'the fixture guard must know the runner sets this global');
  await markJudgeMode(page, { label: 'on', uses: ['warden'], wardenMode: 'auto' });
  assert.deepEqual((globalThis as any).__soJudgeMode, { label: 'on', uses: ['warden'], wardenMode: 'auto' });
  await restoreJudgeConfig(page, null);
  assert.equal('__soJudgeMode' in globalThis, false);
});

const NOTE = 'Continuity: established — The old stone bridge over the river collapsed in the flood and is gone. Keep the next reply consistent with it.';
const row = (index: number, text: string) => ({ id: `m${index}`, reply: { speaker: 'Seren', text } });

test('warden notes keep the applied notes only, with the reply each one answered', () => {
  const notes = wardenNotes([
    { curator: 'warden', messageId: 1, ops: [{ status: 'applied', op: { kind: 'note', text: NOTE, replyMessageId: 1 } }] },
    { curator: 'warden', messageId: 5, ops: [{ status: 'rejected', message: 'lapsed', op: { kind: 'note', text: 'x', replyMessageId: 5 } }] },
    { curator: 'wi', messageId: 2, ops: [{ status: 'applied', op: { kind: 'patch' } }] },
  ]);
  assert.deepEqual(notes, [{ text: NOTE, replyMessageId: 1 }]);
});

test('over-steer columns measure reply N+1 after each applied note against the control arm at the same turn', () => {
  const on = { notes: [{ text: NOTE, replyMessageId: 1 }], rows: [row(1, 'I crossed the old stone bridge this morning.'), row(3, 'Seren stops. "The old stone bridge over the river collapsed in the flood, remember?"'), row(5, 'They walk on.')] };
  const off = { notes: [], rows: [row(1, 'I crossed the old stone bridge this morning.'), row(3, 'Seren nods and leads the way down to the water.'), row(5, 'They walk on.')] };
  const [column] = overSteerColumns(on, off, OVER_STEER_FAMILIES.continuity);
  assert.equal(column.reply?.id, 'm3');
  assert.equal(column.control?.id, 'm3');
  assert.equal(column.restate?.ok, false);
  assert.ok((column.restate?.span ?? 0) >= 6);
  assert.equal(column.controlRestate?.ok, true);
  assert.deepEqual(column.swing, { words: 14, controlWords: 10, lengthRatio: 1.4, sharedWithControl: 1 });
  const [orphan] = overSteerColumns({ notes: [{ text: NOTE, replyMessageId: 5 }], rows: on.rows }, off, OVER_STEER_FAMILIES.continuity);
  assert.equal(orphan.reply, null);
  assert.match(orphan.missing ?? '', /no reply after message 5/);
});

test('an arm summary carries the notes and reply rows the over-steer columns read', () => {
  const summary = armSummary({ id: 'J8', cleanup: { judgeMode: { mode: { label: 'on', uses: ['warden'] } }, wardenNotes: [{ text: NOTE, replyMessageId: 1 }], rescore: { rows: [row(3, 'x')] } } });
  assert.deepEqual(summary.notes, [{ text: NOTE, replyMessageId: 1 }]);
  assert.equal(summary.rows.length, 1);
  assert.deepEqual(armSummary({ id: 'J8', cleanup: {} }).notes, []);
});

test('a rescore can hold every arm to one declared fact set, and refuses an empty one', () => {
  const rows = [{ id: 'm1', arm: 'off', established: ['bridge gone', 'bridge intact'] }, { id: 'm3', arm: 'on', established: ['bridge gone'] }];
  assert.deepEqual(withEstablished(rows, ['bridge gone']).map((row) => row.established), [['bridge gone'], ['bridge gone']]);
  assert.equal(withEstablished(rows, null), rows);
  assert.throws(() => withEstablished(rows, []), /names no fact/);
});
