import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyPresetOverlay, overlayProblems, overlaySha256, PRESET_OVERLAY_PATH, presetFile, profileProblems, replyEffortProblems, sessionOverlay, thinkingExpected, THINKING_REPLY_EFFORT, THINKING_VARIANT, type OverlayFs, type OverlayRecord } from './presetOverlay.mts';

const USER = join('X:', 'lanes', '3', 'data', 'default-user');
const OVERLAY = join('X:', 'repo', 'adolion-fresh.presets.json');
const THOUGHT = '<|turn>model\n<|channel>thought\n<channel|>';
const OPENER = '<|channel>thought\n';
const BRIEF = '<|turn>system\n<|think|>\nBefore replying, think briefly.\n';
const SAMPLERS = ['penalties', 'dry', 'top_n_sigma', 'top_k', 'typ_p', 'tfs_z', 'typical_p', 'xtc', 'top_p', 'adaptive_p', 'min_p', 'temperature'];
const MOVED = ['min_p', ...SAMPLERS.filter((name) => name !== 'min_p')];
const SETTINGS = join(USER, 'settings.json');

const FIX = [
  { kind: 'instruct', preset: 'Gemma 4', key: 'last_output_sequence', op: 'set', value: THOUGHT },
  { kind: 'textgen', preset: 'Artemis v1.1 RP', key: 'samplers', op: 'moveToFront', item: 'min_p' },
];
const THINKING = [
  ...FIX,
  { kind: 'textgen', preset: 'Artemis v1.1 RP', key: 'genamt', op: 'set', value: 1400 },
  { kind: 'instruct', preset: 'Gemma 4 Thinking', key: 'sequences_as_stop_strings', op: 'set', value: false },
  { kind: 'instruct', preset: 'Gemma 4 Thinking', op: 'activate' },
  { kind: 'context', preset: 'Gemma 4', key: 'names_as_stop_strings', op: 'set', value: false },
  { kind: 'settings', key: 'power_user.user_prompt_bias', op: 'set', value: OPENER },
  { kind: 'settings', key: 'power_user.reasoning.auto_parse', op: 'set', value: true },
  { kind: 'settings', key: 'amount_gen', op: 'set', value: 1400 },
  { kind: 'profile', preset: 'Artemis RunPod RP', key: 'instruct', op: 'set', value: 'Gemma 4 Thinking' },
  { kind: 'profile', preset: 'Artemis RunPod RP', key: 'start-reply-with', op: 'set', value: OPENER },
];

const overlayText = JSON.stringify({ version: 2, default: 'fix', variants: { fix: { edits: FIX }, thinking: { edits: THINKING } } }, null, 2);

const lane = (overrides: Record<string, string | null> = {}): Record<string, string | null> => ({
  [OVERLAY]: overlayText,
  [presetFile(USER, 'instruct', 'Gemma 4')]: JSON.stringify({ name: 'Gemma 4', output_sequence: '<|turn>model\n', last_output_sequence: '' }, null, 4),
  [presetFile(USER, 'instruct', 'Gemma 4 Thinking')]: JSON.stringify({ name: 'Gemma 4 Thinking', output_sequence: '<|turn>model\n', last_output_sequence: '', story_string_prefix: BRIEF, sequences_as_stop_strings: true, names_behavior: 'force' }, null, 4),
  [presetFile(USER, 'context', 'Gemma 4')]: JSON.stringify({ name: 'Gemma 4', names_as_stop_strings: true, story_string: 'x' }, null, 4),
  [presetFile(USER, 'textgen', 'Artemis v1.1 RP')]: JSON.stringify({ temp: 1, genamt: 600, samplers: SAMPLERS, sampler_order: [6, 0, 1] }, null, 4),
  [SETTINGS]: JSON.stringify({
    amount_gen: 600,
    power_user: {
      instruct: { preset: 'Gemma 4', enabled: true, output_sequence: '<|turn>model\n', last_output_sequence: '' },
      context: { preset: 'Gemma 4', names_as_stop_strings: true, story_string: 'x' },
      user_prompt_bias: '', reasoning: { name: 'Gemma 4', auto_parse: false },
    },
    textgenerationwebui_settings: { preset: 'Artemis v1.1 RP', samplers: SAMPLERS },
    extension_settings: { connectionManager: { selectedProfile: 'b', profiles: [
      { id: 'a', name: 'Story Orchestrator Memory RunPod', instruct: 'Gemma 4', 'start-reply-with': '' },
      { id: 'b', name: 'Artemis RunPod RP', instruct: 'Gemma 4', 'start-reply-with': '' },
    ] } },
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
const json = (fs: { files: Record<string, string | null> }, path: string) => JSON.parse(fs.files[path]!);

test('preset overlay (fix): sets the thought-channel last_output_sequence, moves min_p first, mirrors the active presets in settings.json, keeps every other key', async () => {
  const fs = fakeFs(lane());
  const record = await applyPresetOverlay(USER, fs, { overlayPath: OVERLAY, variant: 'fix', now: at });
  assert.equal(record.applied, true);
  assert.equal(record.variant, 'fix');
  assert.equal(record.sha256, overlaySha256(overlayText));
  assert.deepEqual(json(fs, presetFile(USER, 'instruct', 'Gemma 4')), { name: 'Gemma 4', output_sequence: '<|turn>model\n', last_output_sequence: THOUGHT });
  assert.deepEqual(json(fs, presetFile(USER, 'textgen', 'Artemis v1.1 RP')), { temp: 1, genamt: 600, samplers: MOVED, sampler_order: [6, 0, 1] });
  const settings = json(fs, SETTINGS);
  assert.equal(settings.power_user.instruct.last_output_sequence, THOUGHT);
  assert.equal(settings.power_user.instruct.enabled, true);
  assert.deepEqual(settings.textgenerationwebui_settings.samplers, MOVED);
  assert.deepEqual(settings.other, { kept: true });
  assert.equal(settings.power_user.user_prompt_bias, '');
  assert.deepEqual(record.edits.map((edit) => ({ key: edit.key, before: edit.before, after: edit.after, changed: edit.changed, mirror: edit.mirror?.path ?? null })), [
    { key: 'last_output_sequence', before: '', after: THOUGHT, changed: true, mirror: 'power_user.instruct.last_output_sequence' },
    { key: 'samplers', before: SAMPLERS, after: MOVED, changed: true, mirror: 'textgenerationwebui_settings.samplers' },
  ]);
  assert.match(fs.files[presetFile(USER, 'instruct', 'Gemma 4')]!, /^\{\n {4}"name"/);
});

test('preset overlay (thinking): switches the active instruct to Gemma 4 Thinking, sets Start Reply With, names-as-stops off, reasoning parse, response length, and the main profile only', async () => {
  const fs = fakeFs(lane());
  const record = await applyPresetOverlay(USER, fs, { overlayPath: OVERLAY, variant: THINKING_VARIANT, now: at });
  assert.equal(record.variant, THINKING_VARIANT);
  const settings = json(fs, SETTINGS);
  assert.deepEqual(settings.power_user.instruct, { preset: 'Gemma 4 Thinking', enabled: true, output_sequence: '<|turn>model\n', last_output_sequence: '', story_string_prefix: BRIEF, sequences_as_stop_strings: false, names_behavior: 'force' });
  assert.equal(settings.power_user.context.names_as_stop_strings, false);
  assert.equal(settings.power_user.user_prompt_bias, OPENER);
  assert.equal(settings.power_user.reasoning.auto_parse, true);
  assert.equal(settings.amount_gen, 1400);
  assert.equal(settings.textgenerationwebui_settings.genamt, undefined);
  assert.equal(json(fs, presetFile(USER, 'textgen', 'Artemis v1.1 RP')).genamt, 1400);
  assert.equal(json(fs, presetFile(USER, 'context', 'Gemma 4')).names_as_stop_strings, false);
  assert.equal(json(fs, presetFile(USER, 'instruct', 'Gemma 4 Thinking')).sequences_as_stop_strings, false);
  const [memory, main] = settings.extension_settings.connectionManager.profiles;
  assert.deepEqual(main, { id: 'b', name: 'Artemis RunPod RP', instruct: 'Gemma 4 Thinking', 'start-reply-with': OPENER });
  assert.deepEqual(memory, { id: 'a', name: 'Story Orchestrator Memory RunPod', instruct: 'Gemma 4', 'start-reply-with': '' });
  assert.equal(settings.power_user.instruct.last_output_sequence, '');
  assert.equal(json(fs, presetFile(USER, 'instruct', 'Gemma 4')).last_output_sequence, THOUGHT);
  const activate = record.edits.find((edit) => edit.op === 'activate')!;
  assert.deepEqual({ before: activate.before, after: activate.after, changed: activate.changed, path: activate.mirror?.path }, { before: 'Gemma 4', after: 'Gemma 4 Thinking', changed: true, path: 'power_user.instruct' });
});

test('preset overlay: the file default picks the variant, an unknown variant is refused before anything is written', async () => {
  const fs = fakeFs(lane());
  assert.equal((await applyPresetOverlay(USER, fs, { overlayPath: OVERLAY, now: at })).variant, 'fix');
  const other = fakeFs(lane());
  await assert.rejects(applyPresetOverlay(USER, other, { overlayPath: OVERLAY, variant: 'turbo', now: at }), /no variant "turbo" \(variants: fix, thinking\)/);
  assert.deepEqual(other.writes, []);
});

test('preset overlay: re-applying is idempotent and records the edits as unchanged (both variants)', async () => {
  for (const variant of ['fix', THINKING_VARIANT]) {
    const fs = fakeFs(lane());
    await applyPresetOverlay(USER, fs, { overlayPath: OVERLAY, variant, now: at });
    const again = await applyPresetOverlay(USER, fs, { overlayPath: OVERLAY, variant, now: at });
    assert.ok(again.edits.every((edit) => !edit.changed), variant);
    assert.deepEqual(json(fs, presetFile(USER, 'textgen', 'Artemis v1.1 RP')).samplers, MOVED);
  }
});

test('preset overlay: a settings.json whose active preset is another one is left alone (fix)', async () => {
  const fs = fakeFs(lane({ [SETTINGS]: JSON.stringify({ power_user: { instruct: { preset: 'ChatML', last_output_sequence: 'x' } }, textgenerationwebui_settings: { preset: 'Other', samplers: ['a'] } }) }));
  const record = await applyPresetOverlay(USER, fs, { overlayPath: OVERLAY, variant: 'fix', now: at });
  assert.deepEqual(record.edits.map((edit) => edit.mirror), [null, null]);
  assert.ok(!fs.writes.includes(SETTINGS));
});

test('preset overlay fails closed: a missing preset file, key, profile or settings field, a sampler list without min_p, a missing overlay; nothing is written', async () => {
  const settings = JSON.parse(lane()[SETTINGS]!);
  const without = (mutate: (s: any) => void) => { const copy = JSON.parse(JSON.stringify(settings)); mutate(copy); return JSON.stringify(copy); };
  const cases: Array<[string, string, Record<string, string | null>, RegExp]> = [
    ['missing preset', 'fix', { [presetFile(USER, 'instruct', 'Gemma 4')]: null }, /instruct "Gemma 4" is missing/],
    ['missing key', 'fix', { [presetFile(USER, 'instruct', 'Gemma 4')]: JSON.stringify({ name: 'Gemma 4' }) }, /has no key last_output_sequence/],
    ['no min_p', 'fix', { [presetFile(USER, 'textgen', 'Artemis v1.1 RP')]: JSON.stringify({ samplers: ['top_k'], genamt: 1 }) }, /does not list min_p/],
    ['not a list', 'fix', { [presetFile(USER, 'textgen', 'Artemis v1.1 RP')]: JSON.stringify({ samplers: 'min_p' }) }, /is not a list/],
    ['wrong type', 'fix', { [presetFile(USER, 'instruct', 'Gemma 4')]: JSON.stringify({ last_output_sequence: 3 }) }, /is number, the overlay sets a string/],
    ['broken json', 'fix', { [presetFile(USER, 'instruct', 'Gemma 4')]: '{' }, /is missing/],
    ['missing thinking instruct', THINKING_VARIANT, { [presetFile(USER, 'instruct', 'Gemma 4 Thinking')]: null }, /instruct "Gemma 4 Thinking" is missing/],
    ['missing profile', THINKING_VARIANT, { [SETTINGS]: without((s) => { s.extension_settings.connectionManager.profiles.pop(); }) }, /profile "Artemis RunPod RP" is missing/],
    ['missing settings key', THINKING_VARIANT, { [SETTINGS]: without((s) => { delete s.power_user.user_prompt_bias; }) }, /settings.json has no key power_user.user_prompt_bias/],
    ['wrong settings type', THINKING_VARIANT, { [SETTINGS]: without((s) => { s.amount_gen = '600'; }) }, /settings.json amount_gen is string, the overlay sets a number/],
    ['no active instruct', THINKING_VARIANT, { [SETTINGS]: without((s) => { delete s.power_user.instruct; }) }, /settings.json has no active instruct/],
  ];
  for (const [label, variant, override, pattern] of cases) {
    const fs = fakeFs(lane(override));
    await assert.rejects(applyPresetOverlay(USER, fs, { overlayPath: OVERLAY, variant, now: at }), pattern, label);
    assert.deepEqual(fs.writes, [], label);
  }
  await assert.rejects(applyPresetOverlay(USER, fakeFs(lane({ [OVERLAY]: null })), { overlayPath: OVERLAY, now: at }), /is missing/);
});

test('preset overlay fails closed when the write does not read back', async () => {
  for (const variant of ['fix', THINKING_VARIANT]) await assert.rejects(applyPresetOverlay(USER, fakeFs(lane(), { dropWrites: true }), { overlayPath: OVERLAY, variant, now: at }), /did not read back/);
});

test('--no-preset-overlay writes nothing and records the old condition with the overlay sha', async () => {
  const fs = fakeFs(lane());
  const record = await applyPresetOverlay(USER, fs, { overlayPath: OVERLAY, disabled: true, now: at });
  assert.deepEqual({ applied: record.applied, reason: record.reason, edits: record.edits, variant: record.variant }, { applied: false, reason: '--no-preset-overlay', edits: [], variant: null });
  assert.equal(record.sha256, overlaySha256(overlayText));
  assert.deepEqual(fs.writes, []);
});

test('overlay sha is line-ending independent; the shape check names bad variants and edits', () => {
  assert.equal(overlaySha256('a\r\nb\r\n'), overlaySha256('a\nb\n'));
  assert.deepEqual(overlayProblems({ version: 2, default: 'x', variants: { x: { edits: [{ kind: 'kobold', preset: '../x', key: '', op: 'swap' }] } } }), [
    'variants.x.edits[0].kind must be one of instruct, textgen, context, settings, profile', 'variants.x.edits[0].preset must be a preset name', 'variants.x.edits[0].key must name a key', 'variants.x.edits[0].op must be set, moveToFront, upsert or activate',
  ]);
  assert.deepEqual(overlayProblems({ version: 2, default: 'x', variants: { x: { edits: [
    { kind: 'settings', preset: 'p', key: 'a..b', op: 'set', value: 1 },
    { kind: 'textgen', preset: 'p', op: 'activate' },
    { kind: 'profile', preset: 'p', key: 'k', op: 'moveToFront', item: 'i' },
  ] } } }), [
    'variants.x.edits[0] (settings) names no preset', 'variants.x.edits[0].key must be a dotted settings.json path',
    'variants.x.edits[1] (activate) switches an instruct or context preset only',
    'variants.x.edits[2] (moveToFront) applies to a preset list only',
  ]);
  assert.deepEqual(overlayProblems({ version: 2, default: 'x', variants: { x: { edits: [] } } }), ['variant x lists no edits']);
  assert.deepEqual(overlayProblems({ version: 1, edits: [] }), ['preset overlay version must be 2', 'the preset overlay lists no variants']);
  assert.deepEqual(overlayProblems({ version: 2, default: 'y', variants: { x: { edits: FIX } } }), ['the preset overlay default must name one of its variants (x)']);
});

test('the checked-in overlay is valid, defaults to thinking, keeps the A100 fix as variant fix, and the thinking variant carries every key of the stga recommendation', async () => {
  const overlay = JSON.parse(await readFile(PRESET_OVERLAY_PATH, 'utf-8'));
  assert.deepEqual(overlayProblems(overlay), []);
  assert.equal(overlay.default, THINKING_VARIANT);
  const rows = (name: string) => overlay.variants[name].edits.map((edit: any) => [edit.kind, edit.preset ?? null, edit.key ?? null, edit.op, edit.op === 'moveToFront' ? edit.item : edit.op === 'activate' ? null : edit.value]);
  const fix = [
    ['instruct', 'Gemma 4', 'last_output_sequence', 'set', THOUGHT],
    ['instruct', 'Gemma 4', 'sequences_as_stop_strings', 'set', false],
    ['textgen', 'Artemis v1.1 RP', 'samplers', 'moveToFront', 'min_p'],
  ];
  assert.deepEqual(rows('fix'), fix);
  const thinking = rows(THINKING_VARIANT);
  for (const row of [
    ...fix,
    ['textgen', 'Artemis v1.1 RP', 'genamt', 'set', 1400],
    ['instruct', 'Gemma 4 Thinking', 'last_output_sequence', 'set', ''],
    ['instruct', 'Gemma 4 Thinking', 'names_behavior', 'set', 'force'],
    ['instruct', 'Gemma 4 Thinking', 'sequences_as_stop_strings', 'set', false],
    ['instruct', 'Gemma 4 Thinking', null, 'activate', null],
    ['context', 'Gemma 4', 'names_as_stop_strings', 'set', false],
    ['settings', null, 'power_user.user_prompt_bias', 'set', OPENER],
    ['settings', null, 'power_user.show_user_prompt_bias', 'set', false],
    ['settings', null, 'power_user.reasoning.auto_parse', 'set', true],
    ['settings', null, 'power_user.reasoning.name', 'set', 'Gemma 4'],
    ['settings', null, 'power_user.reasoning.prefix', 'set', OPENER],
    ['settings', null, 'power_user.reasoning.suffix', 'set', '<channel|>'],
    ['settings', null, 'amount_gen', 'set', 1400],
    ['profile', 'Artemis RunPod RP', 'instruct', 'set', 'Gemma 4 Thinking'],
    ['profile', 'Artemis RunPod RP', 'start-reply-with', 'set', OPENER],
    ['profile', 'Artemis RunPod RP', 'reasoning-template', 'set', 'Gemma 4'],
    ['settings', null, 'power_user.auto_fix_generated_markdown', 'set', false],
  ]) assert.ok(thinking.some((entry: unknown[]) => JSON.stringify(entry) === JSON.stringify(row)), JSON.stringify(row));
  const echo = overlay.variants[THINKING_VARIANT].edits.find((edit: any) => edit.op === 'upsert');
  assert.deepEqual([echo.key, echo.match, echo.value.id, echo.value.placement, echo.value.substituteRegex, echo.value.replaceString], ['extension_settings.regex', 'id', 'so-thinking-name-echo', [2], 2, '<channel|>']);
  const prefix = overlay.variants[THINKING_VARIANT].edits.find((edit: any) => edit.key === 'story_string_prefix');
  assert.match(prefix.value, /<\|think\|>\nBefore replying, think briefly/);
});

test('session overlay: a lane without a record is the pre-overlay condition (warning, never a failure), and an applied record must match the page', async () => {
  const fs = fakeFs(lane());
  const record: OverlayRecord = await applyPresetOverlay(USER, fs, { overlayPath: OVERLAY, variant: 'fix', now: at });
  const live = { instruct: { preset: 'Gemma 4', last_output_sequence: THOUGHT }, textgen: { preset: 'Artemis v1.1 RP', samplers: MOVED } };
  const ok = sessionOverlay(record, live);
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.overlay.sha256, record.sha256);
  assert.equal(ok.overlay.variant, 'fix');
  assert.deepEqual(ok.overlay.edits.map((edit) => edit.mirrored), [true, true]);
  const stale = sessionOverlay(record, { ...live, textgen: { preset: 'Artemis v1.1 RP', samplers: SAMPLERS } });
  assert.equal(stale.problems.length, 1);
  assert.match(stale.problems[0], /samplers/);
  assert.deepEqual(sessionOverlay(record, { instruct: { preset: 'ChatML', last_output_sequence: '' }, textgen: null }).problems, []);
  const none = sessionOverlay(null, live);
  assert.deepEqual({ sha: none.overlay.sha256, applied: none.overlay.applied, problems: none.problems, warned: none.warnings.length, variant: none.overlay.variant }, { sha: null, applied: false, problems: [], warned: 1, variant: null });
  const off = sessionOverlay(await applyPresetOverlay(USER, fakeFs(lane()), { overlayPath: OVERLAY, disabled: true, now: at }), { ...live, instruct: { preset: 'Gemma 4', last_output_sequence: '' } });
  assert.deepEqual(off.problems, []);
  assert.match(off.warnings[0], /overlay off/);
  const unnamed = { ...record, variant: undefined } as unknown as OverlayRecord;
  assert.equal(sessionOverlay(unnamed, live).overlay.variant, 'fix');
});

test('session overlay (thinking): the page must run the switched instruct, the opener, names-as-stops off, the response length and the profile values', async () => {
  const record = await applyPresetOverlay(USER, fakeFs(lane()), { overlayPath: OVERLAY, variant: THINKING_VARIANT, now: at });
  const live = {
    instruct: { preset: 'Gemma 4 Thinking', last_output_sequence: '', sequences_as_stop_strings: false },
    textgen: { preset: 'Artemis v1.1 RP', samplers: MOVED },
    context: { preset: 'Gemma 4', names_as_stop_strings: false },
    settings: { 'power_user.user_prompt_bias': OPENER, 'power_user.reasoning.auto_parse': true, amount_gen: 1400 },
    profile: { name: 'Artemis RunPod RP', instruct: 'Gemma 4 Thinking', 'start-reply-with': OPENER },
  };
  const ok = sessionOverlay(record, live);
  assert.deepEqual(ok.problems, []);
  assert.equal(thinkingExpected(ok.overlay), true);
  const wrong = sessionOverlay(record, {
    ...live, instruct: { ...live.instruct, preset: 'Gemma 4' }, context: { preset: 'Gemma 4', names_as_stop_strings: true },
    settings: { ...live.settings, 'power_user.user_prompt_bias': '' }, profile: { ...live.profile, 'start-reply-with': '' },
  });
  for (const pattern of [/instruct preset "Gemma 4", the seed's preset overlay switched it to "Gemma 4 Thinking"/, /names_as_stop_strings = true/, /power_user.user_prompt_bias = ""/, /profile "Artemis RunPod RP" has start-reply-with = ""/]) {
    assert.ok(wrong.problems.some((line) => pattern.test(line)), String(pattern));
  }
  const unread = sessionOverlay(record, { ...live, settings: { 'power_user.user_prompt_bias': OPENER } });
  assert.ok(unread.problems.some((line) => /did not report amount_gen/.test(line)));
  assert.equal(thinkingExpected(sessionOverlay(await applyPresetOverlay(USER, fakeFs(lane()), { overlayPath: OVERLAY, variant: 'fix', now: at }), null).overlay), false);
  assert.equal(thinkingExpected(null), false);
  assert.deepEqual(profileProblems(record, 'Artemis RunPod RP'), []);
  assert.match(profileProblems(record, 'Other').join(), /wrote profile\(s\) "Artemis RunPod RP", but the session selects "Other"/);
  assert.deepEqual(profileProblems(null, 'Other'), []);
});

test('preset overlay: the shipped overlay turns sequences_as_stop_strings off with the thought channel, and a page still splitting sequences into stops is refused', async () => {
  const shipped = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../adolion-fresh.presets.json', import.meta.url), 'utf8'));
  for (const name of Object.keys(shipped.variants)) {
    const stops = shipped.variants[name].edits.find((edit: { key: string; preset: string }) => edit.key === 'sequences_as_stop_strings' && edit.preset === 'Gemma 4');
    assert.deepEqual(stops, { kind: 'instruct', preset: 'Gemma 4', key: 'sequences_as_stop_strings', op: 'set', value: false }, name);
  }
  const record = {
    overlay: 'x', sha256: 'abc', variant: 'fix', applied: true, reason: null, at: 't', problems: [],
    edits: [{ kind: 'instruct' as const, preset: 'Gemma 4', key: 'sequences_as_stop_strings', op: 'set' as const, file: 'f', before: true, after: false, changed: true, mirror: null }],
  };
  const live = (value: unknown) => ({ instruct: { preset: 'Gemma 4', last_output_sequence: '', sequences_as_stop_strings: value }, textgen: null });
  assert.deepEqual(sessionOverlay(record, live(false)).problems, []);
  assert.match(sessionOverlay(record, live(true)).problems.join(), /sequences_as_stop_strings = true/);
});

test('T5-5-1 overlay: upsert adds a regex script once, replaces it by id on a re-seed, keeps the install\'s own scripts, and the page must run it', async () => {
  const shipped = JSON.parse(await readFile(PRESET_OVERLAY_PATH, 'utf-8'));
  const echo = shipped.variants[THINKING_VARIANT].edits.find((edit: any) => edit.op === 'upsert');
  const markdown = shipped.variants[THINKING_VARIANT].edits.find((edit: any) => edit.key === 'power_user.auto_fix_generated_markdown');
  const own = { id: 'user-own', scriptName: 'mine', findRegex: '/a/g' };
  const settings = JSON.parse(lane()[SETTINGS]!);
  settings.extension_settings.regex = [own];
  settings.power_user.auto_fix_generated_markdown = true;
  const text = JSON.stringify({ version: 2, default: 'thinking', variants: { thinking: { edits: [markdown, echo] } } });
  const fs = fakeFs({ ...lane(), [OVERLAY]: text, [SETTINGS]: JSON.stringify(settings) });
  const record = await applyPresetOverlay(USER, fs, { overlayPath: OVERLAY, now: at });
  const written = json(fs, SETTINGS);
  assert.deepEqual(written.extension_settings.regex, [own, echo.value]);
  assert.equal(written.power_user.auto_fix_generated_markdown, false);
  await applyPresetOverlay(USER, fs, { overlayPath: OVERLAY, now: at });
  assert.deepEqual(json(fs, SETTINGS).extension_settings.regex, [own, echo.value], 'a re-seed replaces the script by id instead of adding a second copy');
  const live = (regex: unknown, fix = false) => ({ instruct: null, textgen: null, settings: { 'power_user.auto_fix_generated_markdown': fix, 'extension_settings.regex': regex } });
  assert.deepEqual(sessionOverlay(record, live([{ ...echo.value, extra: 1 }, own])).problems, []);
  assert.match(sessionOverlay(record, live([own])).problems.join(), /entry "so-thinking-name-echo" is null/);
  assert.match(sessionOverlay(record, live([{ ...echo.value, disabled: true }])).problems.join(), /so-thinking-name-echo/);
  assert.match(sessionOverlay(record, live([echo.value], true)).problems.join(), /auto_fix_generated_markdown = true/);
  assert.deepEqual(overlayProblems({ version: 2, default: 'x', variants: { x: { edits: [
    { kind: 'instruct', preset: 'p', key: 'k', op: 'upsert', match: 'id', value: { id: 'a' } },
    { kind: 'settings', key: 'a.b', op: 'upsert', value: { id: 'a' } },
    { kind: 'settings', key: 'a.b', op: 'upsert', match: 'id', value: { name: 'a' } },
  ] } } }), [
    'variants.x.edits[0] (upsert) applies to a settings.json list only',
    'variants.x.edits[1] (upsert) needs a match field',
    'variants.x.edits[2] (upsert) needs an object value whose id names it',
  ]);
});

test('T5-5-1 overlay: the name-echo regex drops a repeated speaker name after the thought channel and nothing else', () => {
  const shipped = JSON.parse(readFileSync(PRESET_OVERLAY_PATH, 'utf-8'));
  const script = shipped.variants[THINKING_VARIANT].edits.find((edit: any) => edit.op === 'upsert').value;
  const compile = (name: string) => {
    const source = script.findRegex.replace('{{char}}', name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const parts = /^\/(.*)\/([a-z]*)$/s.exec(source)!;
    return (text: string) => text.replace(new RegExp(parts[1], parts[2]), script.replaceString);
  };
  const forre = compile('Forre');
  const thought = '<|channel>thought\n*   plan\n*   Forre: smug<channel|>';
  assert.equal(forre(`${thought}Forre: *Forre glances at the token.*`), `${thought}*Forre glances at the token.*`);
  assert.equal(forre(`${thought}\n\nForre: "A wise decision."`), `${thought}"A wise decision."`);
  assert.equal(forre(`${thought}Forre's smile thins.`), `${thought}Forre's smile thins.`);
  assert.equal(forre(`${thought}"Take your time," *Forre says.*\nForre: again`), `${thought}"Take your time," *Forre says.*\nForre: again`);
  assert.equal(forre(`${thought}Alexander: "No."`), `${thought}Alexander: "No."`);
  assert.equal(compile('Adolion Narrator')(`${thought}Adolion Narrator: The tent.`), `${thought}The tent.`);
  assert.equal(compile('Sir (A.)')(`${thought}Sir (A.): Hello`), `${thought}Hello`);
});

test('reply effort: the session baseline selects medium, and a thinking lane that reads back anything else is refused', async () => {
  const baseline = JSON.parse(await readFile(join(import.meta.dirname, '..', '..', '..', 'test', 'sessions', 'baseline-settings.json'), 'utf-8'));
  assert.equal(baseline.settings.extraction.replyEffort, THINKING_REPLY_EFFORT);
  assert.equal(THINKING_REPLY_EFFORT, 'medium');
  const thinking = { applied: true, variant: THINKING_VARIANT };
  const expected = baseline.settings;
  assert.deepEqual(replyEffortProblems(thinking, expected, { extraction: { replyEffort: 'medium' } }), []);
  assert.deepEqual(replyEffortProblems(thinking, expected, { extraction: {} }), []);
  assert.match(replyEffortProblems(thinking, expected, { extraction: { replyEffort: 'high' } }).join(';'), /reply effort "high", expected "medium"/);
  assert.match(replyEffortProblems(thinking, {}, { extraction: { replyEffort: 'off' } }).join(';'), /expected "medium"/);
  assert.deepEqual(replyEffortProblems(thinking, { extraction: { replyEffort: 'low' } }, { extraction: { replyEffort: 'low' } }), []);
  assert.deepEqual(replyEffortProblems({ applied: true, variant: 'fix' }, expected, { extraction: { replyEffort: 'high' } }), []);
  assert.deepEqual(replyEffortProblems({ applied: false, variant: THINKING_VARIANT }, expected, { extraction: { replyEffort: 'off' } }), []);
});
