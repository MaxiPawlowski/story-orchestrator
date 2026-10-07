import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAPTURE_LABEL, diffCases, fixtureCaptureLabels, lineHunks, normalise, NORMALISE_RULES, renderNormalised, validateDeclarations, type DeclaredDiff, type PayloadCapture, type PayloadCase } from './payloadGolden.mts';
import { validateFixture } from './scenarioSchema.mts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const PROMPT = [
  '<|turn>system',
  'You are DM Narrator in a group chat with Arin, Ponticius.',
  'The chat started October 7, 2026 3:04pm.',
  '<|turn>user',
  'Player: I look at the job board.',
  '<|turn>model',
  'DM Narrator: The board holds three notices.',
].join('\n');

const capture = (overrides: Partial<PayloadCapture> = {}): PayloadCapture => ({
  label: 'arin',
  member: 'Arin',
  mainApi: 'textgenerationwebui',
  promptKind: 'text',
  checkpoint: 'cp1',
  prompt: PROMPT,
  blocks: [
    { key: 'story_orchestrator_guidance', value: 'Objective: investigate the job board.', position: 1, depth: 4, role: 0, scan: false },
    { key: 'story_orchestrator_epistemic', value: '- You know: the north road washed out', position: 1, depth: 4, role: 0, scan: false },
  ],
  ...overrides,
});

const payloadCase = (captures: PayloadCapture[], chatIds = ['2026-10-7@15h04m03s'], name = 'group-opening'): PayloadCase => ({ case: name, fixture: `test/scenarios/payload/${name}.json`, fixtureSha256: 'f'.repeat(64), chatIds, captures });

const withBlock = (key: string, value: string, base = capture()) => ({ ...base, blocks: base.blocks.map((block) => (block.key === key ? { ...block, value } : block)) });

test('identical captures compare identical', () => {
  const report = diffCases([payloadCase([capture()])], [payloadCase([capture()])]);
  assert.equal(report.ok, true);
  assert.equal(report.identical, true);
});

test('normalisation removes exactly the declared volatile values', () => {
  const later = capture({ prompt: PROMPT.replace('October 7, 2026 3:04pm', 'October 9, 2026 11:58am') });
  const report = diffCases([payloadCase([capture()], ['2026-10-7@15h04m03s'])], [payloadCase([later], ['2026-10-9@11h58m10s'])]);
  assert.equal(report.identical, true, JSON.stringify(report.undeclared));
  const text = 'Chat 2026-10-7@15h04m03s at 2026-10-07T15:04:03.123Z, id 1759606632088, {{time}} 3:04 PM, uuid 123e4567-e89b-12d3-a456-426614174000';
  assert.equal(normalise(text), 'Chat <ST-STAMP> at <ISO-TIME>, id <EPOCH-MS>, {{time}} <CLOCK>, uuid <UUID>');
  assert.equal(normalise('book Story Orchestrator - Quest - mychat-42', ['mychat-42']), 'book Story Orchestrator - Quest - <CHAT-ID>');
  assert.deepEqual(NORMALISE_RULES.map((rule) => rule.id), ['iso-time', 'st-stamp', 'send-date', 'clock', 'epoch-ms', 'uuid']);
});

test('negative control: an undeclared one-character change fails', () => {
  const changed = withBlock('story_orchestrator_epistemic', '- You know: the north road washed outs');
  const report = diffCases([payloadCase([capture()])], [payloadCase([changed])]);
  assert.equal(report.ok, false);
  assert.equal(report.undeclared.length, 1);
  assert.deepEqual(report.undeclared[0].removed, ['- You know: the north road washed out']);
  assert.deepEqual(report.undeclared[0].added, ['- You know: the north road washed outs']);
  assert.notEqual(report.cases[0].captures[0].firstDiffByte, null);
});

test('planted control: normalisation never hides a real block change', () => {
  const pairs: Array<[string, string]> = [
    ['- You know: the north road washed out', '- You know: the south road washed out'],
    ['Tension 3 of 10 at 10:30', 'Tension 4 of 10 at 10:30'],
    ['Met on 2026-10-07 at the gate', 'Met on 2026-10-08 at the gate'],
    ['Arin owes 1759606632 coins', 'Arin owes 1759606633 coins'],
    ['- You know: the north road washed out', ''],
  ];
  for (const [before, after] of pairs) {
    assert.notEqual(normalise(before), normalise(after), `${before} -> ${after}`);
    const report = diffCases([payloadCase([withBlock('story_orchestrator_epistemic', before)])], [payloadCase([withBlock('story_orchestrator_epistemic', after)])]);
    assert.equal(report.ok, false, `${before} -> ${after} hidden`);
  }
  const moved = capture({ blocks: capture().blocks.map((block) => (block.key === 'story_orchestrator_guidance' ? { ...block, depth: 2 } : block)) });
  assert.equal(diffCases([payloadCase([capture()])], [payloadCase([moved])]).ok, false, 'a block moved in depth is a difference');
  for (const rule of NORMALISE_RULES) assert.equal(rule.pattern.test('line one\nline two'), false, `${rule.id} must not touch plain text`);
});

test('a declared change passes and names its owner row', () => {
  const added = 'Scenario: the party waits at the city gate.';
  const changed = capture({ prompt: PROMPT.replace('<|turn>user', `${added}\n<|turn>user`) });
  const declarations: DeclaredDiff[] = [{ case: 'group-opening', label: 'arin', plan: 'v2.7 02 C1', owner: 'v2.8 16', added: [{ contains: 'Scenario: the party waits at the city gate.' }] }];
  const report = diffCases([payloadCase([capture()])], [payloadCase([changed])], declarations);
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.equal(report.identical, false);
  assert.deepEqual(report.cases[0].captures[0].hunks[0].declaredBy, [0]);
});

test('a declaration covers only what it names: an extra line in the same hunk fails', () => {
  const changed = capture({ prompt: PROMPT.replace('<|turn>user', 'Scenario: the party waits at the city gate.\nAnd one more thing.\n<|turn>user') });
  const declarations: DeclaredDiff[] = [{ case: 'group-opening', plan: 'v2.7 02 C1', owner: 'v2.8 16', added: ['Scenario: the party waits at the city gate.'] }];
  assert.equal(diffCases([payloadCase([capture()])], [payloadCase([changed])], declarations).ok, false);
});

test('a declaration for another case or label does not cover the change', () => {
  const changed = withBlock('story_orchestrator_guidance', 'Objective: accept the mission.');
  const elsewhere: DeclaredDiff[] = [
    { case: 'group-memory', plan: 'p', owner: 'o', added: ['Objective: accept the mission.'], removed: ['Objective: investigate the job board.'] },
    { case: 'group-opening', label: 'rest', plan: 'p', owner: 'o', added: ['Objective: accept the mission.'], removed: ['Objective: investigate the job board.'] },
  ];
  const report = diffCases([payloadCase([capture()])], [payloadCase([changed])], elsewhere);
  assert.equal(report.ok, false);
  assert.equal(report.undeclared.length, 1);
  assert.equal(report.stale.length, 2);
});

test('negative control: a stale declaration fails even when nothing else differs', () => {
  const declarations: DeclaredDiff[] = [{ case: 'group-opening', plan: 'v2.7 05', owner: 'v2.8 22', added: [{ regex: 'Before you start:.*' }] }];
  const report = diffCases([payloadCase([capture()])], [payloadCase([capture()])], declarations);
  assert.equal(report.ok, false);
  assert.equal(report.stale.length, 1);
  assert.match(report.stale[0].unmatched[0], /Before you start/);
});

test('a declaration with two patterns is stale when only one happens', () => {
  const changed = withBlock('story_orchestrator_guidance', 'Objective: accept the mission.');
  const declarations: DeclaredDiff[] = [{ case: 'group-opening', plan: 'p', owner: 'o', added: ['Objective: accept the mission.', 'never added'], removed: ['Objective: investigate the job board.'] }];
  const report = diffCases([payloadCase([capture()])], [payloadCase([changed])], declarations);
  assert.equal(report.undeclared.length, 0);
  assert.equal(report.stale.length, 1);
  assert.equal(report.ok, false);
});

test('a removed block is declarable by regex and a missing capture is a difference', () => {
  const without = capture({ blocks: capture().blocks.filter((block) => block.key !== 'story_orchestrator_epistemic') });
  const declarations: DeclaredDiff[] = [{ case: 'group-opening', label: 'arin', plan: 'p', owner: 'o', removed: [{ regex: '## block story_orchestrator_epistemic [^\\n]*\\n- You know: [^\\n]*' }] }];
  assert.equal(diffCases([payloadCase([capture()])], [payloadCase([without])], declarations).ok, true);
  const missing = diffCases([payloadCase([capture(), capture({ label: 'rest', member: null })])], [payloadCase([capture()])]);
  assert.equal(missing.ok, false);
  assert.equal(missing.undeclared[0].label, 'rest');
});

test('case set and fixture drift are problems, never declarable', () => {
  const extra = diffCases([payloadCase([capture()])], [payloadCase([capture()]), payloadCase([capture()], undefined, 'group-memory')]);
  assert.equal(extra.ok, false);
  assert.match(extra.problems[0], /not in the baseline/);
  const drifted = diffCases([payloadCase([capture()])], [{ ...payloadCase([capture()]), fixtureSha256: 'a'.repeat(64) }]);
  assert.equal(drifted.ok, false);
  assert.match(drifted.problems[0], /fixture changed/);
});

test('declared-diff file validation', () => {
  assert.deepEqual(validateDeclarations({ declarations: [{ case: 'c', plan: 'p', owner: 'o', added: ['x'] }] }).problems, []);
  const bad = validateDeclarations({ declarations: [
    { case: 'c', plan: 'p', added: ['x'] },
    { case: 'c', plan: 'p', owner: 'o' },
    { case: 'c', plan: 'p', owner: 'o', added: [{ regex: '(' }] },
    { case: 'c', plan: 'p', owner: 'o', added: [{ regex: '.*' }] },
    { case: 'c', plan: 'p', owner: 'o', added: [''], typo: 1 },
  ] });
  assert.equal(bad.declarations.length, 0);
  assert.ok(bad.problems.some((problem) => problem.includes('declarations[0].owner')));
  assert.ok(bad.problems.some((problem) => problem.includes('declarations[1]: declares no')));
  assert.ok(bad.problems.some((problem) => problem.includes('declarations[2].added[0]')));
  assert.ok(bad.problems.some((problem) => problem.includes('matches the empty string')));
  assert.ok(bad.problems.some((problem) => problem.includes('unknown key "typo"')));
});

test('line hunks are minimal and positioned on the baseline', () => {
  assert.deepEqual(lineHunks('a\nb\nc', 'a\nb\nc'), []);
  assert.deepEqual(lineHunks('a\nb\nc', 'a\nx\nc'), [{ baselineLine: 2, removed: ['b'], added: ['x'] }]);
  assert.deepEqual(lineHunks('a\nc', 'a\nb\nc'), [{ baselineLine: 2, removed: [], added: ['b'] }]);
  assert.deepEqual(lineHunks('a\nb\nc\nd', 'b\nc\nd\ne'), [{ baselineLine: 1, removed: ['a'], added: [] }, { baselineLine: 5, removed: [], added: ['e'] }]);
  assert.match(renderNormalised(capture()), /^# capture arin\nmember: Arin\n/);
});

test('the payload fixtures validate, and every capture label is unique and well-formed', () => {
  const dir = join(ROOT, 'test', 'scenarios', 'payload');
  const files = readdirSync(dir).filter((name) => name.endsWith('.json'));
  assert.ok(files.length >= 2, 'at least two payload cases');
  for (const name of files) {
    const text = readFileSync(join(dir, name), 'utf-8');
    assert.deepEqual(validateFixture(JSON.parse(text), name), [], name);
    const labels = fixtureCaptureLabels(text);
    assert.ok(labels.length > 0, `${name} captures nothing`);
    assert.equal(new Set(labels).size, labels.length, `${name} repeats a capture label`);
    for (const label of labels) assert.match(label, CAPTURE_LABEL, `${name}: ${label}`);
  }
});
