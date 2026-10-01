import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { applyPresetOverlay, overlayProblems, overlaySha256, PRESET_OVERLAY_PATH, presetFile, sessionOverlay, type OverlayFs, type OverlayRecord } from './presetOverlay.mts';

const USER = join('X:', 'lanes', '3', 'data', 'default-user');
const OVERLAY = join('X:', 'repo', 'adolion-fresh.presets.json');
const THOUGHT = '<|turn>model\n<|channel>thought\n<channel|>';
const SAMPLERS = ['penalties', 'dry', 'top_n_sigma', 'top_k', 'typ_p', 'tfs_z', 'typical_p', 'xtc', 'top_p', 'adaptive_p', 'min_p', 'temperature'];
const MOVED = ['min_p', ...SAMPLERS.filter((name) => name !== 'min_p')];

const overlayText = JSON.stringify({
  version: 1,
  edits: [
    { kind: 'instruct', preset: 'Gemma 4', key: 'last_output_sequence', op: 'set', value: THOUGHT },
    { kind: 'textgen', preset: 'Artemis v1.1 RP', key: 'samplers', op: 'moveToFront', item: 'min_p' },
  ],
}, null, 2);

const lane = (overrides: Record<string, string | null> = {}): Record<string, string | null> => ({
  [OVERLAY]: overlayText,
  [presetFile(USER, 'instruct', 'Gemma 4')]: JSON.stringify({ name: 'Gemma 4', output_sequence: '<|turn>model\n', last_output_sequence: '' }, null, 4),
  [presetFile(USER, 'textgen', 'Artemis v1.1 RP')]: JSON.stringify({ temp: 1, samplers: SAMPLERS, sampler_order: [6, 0, 1] }, null, 4),
  [join(USER, 'settings.json')]: JSON.stringify({
    power_user: { instruct: { preset: 'Gemma 4', enabled: true, last_output_sequence: '' } },
    textgenerationwebui_settings: { preset: 'Artemis v1.1 RP', samplers: SAMPLERS },
    other: { kept: true },
  }, null, 4),
  ...overrides,
});

const fakeFs = (files: Record<string, string | null>, { dropWrites = false } = {}): OverlayFs & { files: Record<string, string | null>; writes: string[] } => {
  const writes: string[] = [];
  return {
    files, writes,
    read: async (path) => files[path] ?? null,
    write: async (path, text) => { writes.push(path); if (!dropWrites) files[path] = text; },
  };
};

const at = () => '2026-10-01T20:00:00.000Z';

test('preset overlay: sets the thought-channel last_output_sequence, moves min_p first, mirrors the active presets in settings.json, keeps every other key', async () => {
  const fs = fakeFs(lane());
  const record = await applyPresetOverlay(USER, fs, { overlayPath: OVERLAY, now: at });
  assert.equal(record.applied, true);
  assert.equal(record.sha256, overlaySha256(overlayText));
  const instruct = JSON.parse(fs.files[presetFile(USER, 'instruct', 'Gemma 4')]!);
  assert.deepEqual(instruct, { name: 'Gemma 4', output_sequence: '<|turn>model\n', last_output_sequence: THOUGHT });
  const textgen = JSON.parse(fs.files[presetFile(USER, 'textgen', 'Artemis v1.1 RP')]!);
  assert.deepEqual(textgen, { temp: 1, samplers: MOVED, sampler_order: [6, 0, 1] });
  const settings = JSON.parse(fs.files[join(USER, 'settings.json')]!);
  assert.equal(settings.power_user.instruct.last_output_sequence, THOUGHT);
  assert.equal(settings.power_user.instruct.enabled, true);
  assert.deepEqual(settings.textgenerationwebui_settings.samplers, MOVED);
  assert.deepEqual(settings.other, { kept: true });
  assert.deepEqual(record.edits.map((edit) => ({ key: edit.key, before: edit.before, after: edit.after, changed: edit.changed, mirror: edit.mirror?.path ?? null })), [
    { key: 'last_output_sequence', before: '', after: THOUGHT, changed: true, mirror: 'power_user.instruct.last_output_sequence' },
    { key: 'samplers', before: SAMPLERS, after: MOVED, changed: true, mirror: 'textgenerationwebui_settings.samplers' },
  ]);
  assert.match(fs.files[presetFile(USER, 'instruct', 'Gemma 4')]!, /^\{\n {4}"name"/);
});

test('preset overlay: re-applying is idempotent and records the edits as unchanged', async () => {
  const fs = fakeFs(lane());
  await applyPresetOverlay(USER, fs, { overlayPath: OVERLAY, now: at });
  const again = await applyPresetOverlay(USER, fs, { overlayPath: OVERLAY, now: at });
  assert.deepEqual(again.edits.map((edit) => edit.changed), [false, false]);
  assert.deepEqual(JSON.parse(fs.files[presetFile(USER, 'textgen', 'Artemis v1.1 RP')]!).samplers, MOVED);
});

test('preset overlay: a settings.json whose active preset is another one is left alone', async () => {
  const fs = fakeFs(lane({ [join(USER, 'settings.json')]: JSON.stringify({ power_user: { instruct: { preset: 'ChatML', last_output_sequence: 'x' } }, textgenerationwebui_settings: { preset: 'Other', samplers: ['a'] } }) }));
  const record = await applyPresetOverlay(USER, fs, { overlayPath: OVERLAY, now: at });
  assert.deepEqual(record.edits.map((edit) => edit.mirror), [null, null]);
  assert.ok(!fs.writes.includes(join(USER, 'settings.json')));
});

test('preset overlay fails closed: a missing preset file, a missing key, a sampler list without min_p, a missing overlay; nothing is written', async () => {
  const cases: Array<[string, Record<string, string | null>, RegExp]> = [
    ['missing preset', { [presetFile(USER, 'instruct', 'Gemma 4')]: null }, /instruct "Gemma 4" is missing/],
    ['missing key', { [presetFile(USER, 'instruct', 'Gemma 4')]: JSON.stringify({ name: 'Gemma 4' }) }, /has no key last_output_sequence/],
    ['no min_p', { [presetFile(USER, 'textgen', 'Artemis v1.1 RP')]: JSON.stringify({ samplers: ['top_k'] }) }, /does not list min_p/],
    ['not a list', { [presetFile(USER, 'textgen', 'Artemis v1.1 RP')]: JSON.stringify({ samplers: 'min_p' }) }, /is not a list/],
    ['wrong type', { [presetFile(USER, 'instruct', 'Gemma 4')]: JSON.stringify({ last_output_sequence: 3 }) }, /is number, the overlay sets a string/],
    ['broken json', { [presetFile(USER, 'instruct', 'Gemma 4')]: '{' }, /is missing/],
  ];
  for (const [label, override, pattern] of cases) {
    const fs = fakeFs(lane(override));
    await assert.rejects(applyPresetOverlay(USER, fs, { overlayPath: OVERLAY, now: at }), pattern, label);
    assert.deepEqual(fs.writes, [], label);
  }
  await assert.rejects(applyPresetOverlay(USER, fakeFs(lane({ [OVERLAY]: null })), { overlayPath: OVERLAY, now: at }), /is missing/);
});

test('preset overlay fails closed when the write does not read back', async () => {
  await assert.rejects(applyPresetOverlay(USER, fakeFs(lane(), { dropWrites: true }), { overlayPath: OVERLAY, now: at }), /did not read back/);
});

test('--no-preset-overlay writes nothing and records the old condition with the overlay sha', async () => {
  const fs = fakeFs(lane());
  const record = await applyPresetOverlay(USER, fs, { overlayPath: OVERLAY, disabled: true, now: at });
  assert.deepEqual({ applied: record.applied, reason: record.reason, edits: record.edits }, { applied: false, reason: '--no-preset-overlay', edits: [] });
  assert.equal(record.sha256, overlaySha256(overlayText));
  assert.deepEqual(fs.writes, []);
});

test('overlay sha is line-ending independent; the shape check names bad edits', () => {
  assert.equal(overlaySha256('a\r\nb\r\n'), overlaySha256('a\nb\n'));
  assert.deepEqual(overlayProblems({ version: 1, edits: [{ kind: 'kobold', preset: '../x', key: '', op: 'swap' }] }), [
    'edits[0].kind must be instruct or textgen', 'edits[0].preset must be a preset name', 'edits[0].key must name a key', 'edits[0].op must be set or moveToFront',
  ]);
  assert.deepEqual(overlayProblems({ version: 1, edits: [] }), ['the preset overlay lists no edits']);
});

test('the checked-in overlay is valid and names exactly the two A100 edits', async () => {
  const overlay = JSON.parse(await readFile(PRESET_OVERLAY_PATH, 'utf-8'));
  assert.deepEqual(overlayProblems(overlay), []);
  assert.deepEqual(overlay.edits.map((edit: any) => [edit.kind, edit.preset, edit.key, edit.op, edit.value ?? edit.item]), [
    ['instruct', 'Gemma 4', 'last_output_sequence', 'set', THOUGHT],
    ['textgen', 'Artemis v1.1 RP', 'samplers', 'moveToFront', 'min_p'],
  ]);
});

test('session overlay: a lane without a record is the pre-overlay condition (warning, never a failure), and an applied record must match the page', async () => {
  const fs = fakeFs(lane());
  const record: OverlayRecord = await applyPresetOverlay(USER, fs, { overlayPath: OVERLAY, now: at });
  const live = { instruct: { preset: 'Gemma 4', last_output_sequence: THOUGHT }, textgen: { preset: 'Artemis v1.1 RP', samplers: MOVED } };
  const ok = sessionOverlay(record, live);
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.overlay.sha256, record.sha256);
  assert.deepEqual(ok.overlay.edits.map((edit) => edit.mirrored), [true, true]);
  const stale = sessionOverlay(record, { ...live, textgen: { preset: 'Artemis v1.1 RP', samplers: SAMPLERS } });
  assert.equal(stale.problems.length, 1);
  assert.match(stale.problems[0], /samplers/);
  assert.deepEqual(sessionOverlay(record, { instruct: { preset: 'ChatML', last_output_sequence: '' }, textgen: null }).problems, []);
  const none = sessionOverlay(null, live);
  assert.deepEqual({ sha: none.overlay.sha256, applied: none.overlay.applied, problems: none.problems, warned: none.warnings.length }, { sha: null, applied: false, problems: [], warned: 1 });
  const off = sessionOverlay(await applyPresetOverlay(USER, fakeFs(lane()), { overlayPath: OVERLAY, disabled: true, now: at }), { ...live, instruct: { preset: 'Gemma 4', last_output_sequence: '' } });
  assert.deepEqual(off.problems, []);
  assert.match(off.warnings[0], /overlay off/);
});
