import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureCaptureLabels, type PayloadCapture, type PayloadCase } from './payloadGolden.mts';
import { describePrefixReport, payloadCaseGroup, payloadLogGroups, prefixReport, RESTING_KEY, validatePrefixDeclarations } from './prefixGate.mts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const turn = (role: string, text: string) => `<|turn>${role}\n${text}<turn|>\n`;
const LINES = Array.from({ length: 10 }, (_, index) => (index % 2 ? `Arin: reply ${index} by the bell tower.` : `Player: line ${index} at the job board.`));

const prompt = (n: number, head = 'Lore: the river town keeps its bells.') => {
  const turns = LINES.slice(0, n).map((text) => turn(text.startsWith('Player') ? 'user' : 'model', text));
  turns.splice(turns.length - 2, 0, turn('system', `Objective at turn ${n}: reach the quarry.`));
  return `${turn('system', `Write the next reply.\n${head}`)}${turns.join('')}<|turn>model\n`;
};

const capture = (label: string, member: string | null, text: string): PayloadCapture => ({
  label, member, mainApi: 'textgenerationwebui', promptKind: 'text', checkpoint: 'cp1', prompt: text,
  blocks: [{ key: 'story_orchestrator_guidance', value: 'Objective: reach the quarry.', position: 1, depth: 2, role: 0, scan: false }],
});

const payloadCase = (captures: PayloadCapture[]): PayloadCase => ({ case: 'group-test', fixture: 'f', fixtureSha256: 'x', chatIds: [], captures });

test('a stable case passes; a member key and the resting key are paired separately', () => {
  const group = payloadCaseGroup(payloadCase([
    capture('a-rest', null, prompt(4)), capture('a-arin', 'Arin', prompt(4)),
    capture('b-rest', null, prompt(6)), capture('b-arin', 'Arin', prompt(6)),
  ]));
  const report = prefixReport([group]);
  assert.equal(report.ok, true);
  assert.deepEqual(report.pairs.map((pair) => [pair.key, pair.from, pair.to, pair.verdict]), [[RESTING_KEY, 'a-rest', 'b-rest', 'ok'], ['Arin', 'a-arin', 'b-arin', 'ok']]);
  assert.match(describePrefixReport(report).at(-1) ?? '', /^prefix stability: 2 pair\(s\)/);
});

test('planted control: a clock in the head fails with an excerpt at the divergence', () => {
  const report = prefixReport([payloadCaseGroup(payloadCase([capture('a-arin', 'Arin', prompt(4, 'It is 3:04 PM.')), capture('b-arin', 'Arin', prompt(6, 'It is 3:05 PM.'))]))]);
  assert.equal(report.ok, false);
  assert.equal(report.failing.length, 1);
  assert.equal(report.failing[0].verdict, 'above-boundary');
  assert.ok(report.failing[0].lost > 0);
  assert.match(report.failing[0].excerpt?.previous ?? '', /3:04 PM/);
  assert.ok(describePrefixReport(report).some((line) => line.startsWith('FAIL')));
});

test('a declared restart is not compared, and a declaration matching no pair is stale', () => {
  const group = payloadCaseGroup(payloadCase([capture('a-arin', 'Arin', prompt(4, 'Story one.')), capture('b-arin', 'Arin', prompt(6, 'Story two.'))]));
  const declared = { group: 'group-test', key: 'Arin', from: 'a-arin', to: 'b-arin', plan: 'p', why: 'w' };
  const report = prefixReport([group], [declared]);
  assert.equal(report.ok, true);
  assert.equal(report.pairs[0].declaredBy, 0);
  const stale = prefixReport([group], [declared, { ...declared, from: 'x', to: 'y' }]);
  assert.equal(stale.ok, false);
  assert.deepEqual(stale.stale.map((entry) => entry.declaration), [1]);
});

test('a prompt with no boundary fails closed', () => {
  const report = prefixReport([payloadCaseGroup(payloadCase([{ ...capture('a', 'Arin', 'plain one'), blocks: [] }, { ...capture('b', 'Arin', 'plain two'), blocks: [] }]))]);
  assert.equal(report.failing[0]?.verdict, 'no-boundary');
});

test('payload JSONL: streamed drafted requests key by member, non-streamed by first turn, per chat, no text kept', () => {
  const side = (n: number, value: string) => `${turn('system', 'Read the story so far.')}${turn('user', `values: ${value}\n${LINES.slice(0, n).join('\n')}`)}<|turn>model\n`;
  const row = (index: number, chatId: string, body: Record<string, unknown>, member: string | null = null) => ({ index, chatId, url: '/api/backends/text-completions/generate', draftMemberName: member, parsedBody: body });
  const rows = [
    row(0, 'c1', { prompt: prompt(4), stream: true }, 'Arin'),
    row(1, 'c1', { prompt: side(4, 'a=1'), stream: false }, 'Arin'),
    { kind: 'response', requestIndex: 0 },
    { index: 2, url: '/api/backends/text-completions/props' },
    row(3, 'c1', { prompt: prompt(6), stream: true }, 'Arin'),
    row(4, 'c1', { prompt: side(6, 'a=2'), stream: false }),
    row(5, 'c2', { prompt: prompt(6, 'It is 3:05 PM.'), stream: true }, 'Arin'),
  ];
  const groups = payloadLogGroups(rows);
  assert.deepEqual(groups.map((group) => [group.group, group.entries.map((entry) => entry.label)]), [['c1', ['#0', '#1', '#3', '#4']], ['c2', ['#5']]]);
  const report = prefixReport(groups);
  assert.deepEqual(report.pairs.map((pair) => [pair.key.startsWith('side:') ? 'side' : pair.key, pair.verdict]), [['Arin', 'ok'], ['side', 'ok']]);
  assert.equal(report.ok, true);
  assert.ok(report.pairs.every((pair) => pair.excerpt === undefined));
  assert.equal(report.keys.singletons, 1);
  assert.equal(prefixReport(groups, [], { sideFails: true }).ok, true);
});

test('payload JSONL: a side pass whose values sit above the newest message is reported, gated only on request', () => {
  const side = (value: string, last: string) => `${turn('system', 'Read the story so far.')}${turn('user', `values: ${value}`)}${turn('user', last)}<|turn>model\n`;
  const rows = [
    { index: 0, chatId: 'c', url: '/generate', parsedBody: { prompt: side('a=1', 'Player: one'), stream: false } },
    { index: 1, chatId: 'c', url: '/generate', parsedBody: { prompt: side('a=2', 'Player: two'), stream: false } },
  ];
  const report = prefixReport(payloadLogGroups(rows));
  assert.equal(report.ok, true);
  assert.equal(report.reported.length, 1);
  assert.equal(report.reported[0].verdict, 'above-boundary');
  assert.equal(prefixReport(payloadLogGroups(rows), [], { sideFails: true }).ok, false);
});

test('declarations: shape problems are named', () => {
  assert.deepEqual(validatePrefixDeclarations({ prefix: [{ group: 'g', from: 'a', to: 'b', plan: 'p', why: 'w' }] }).problems, []);
  const { problems } = validatePrefixDeclarations({ prefix: [{ group: 'g', from: 'a', plan: '', why: 'w', extra: 1 }] });
  assert.deepEqual(problems.sort(), ['prefix[0].plan: required non-empty string', 'prefix[0].to: required non-empty string', 'prefix[0]: unknown key "extra"']);
  assert.equal(validatePrefixDeclarations(42).problems.length, 1);
});

test('the shipped prefix declarations name real captures of one key, in order, in their fixtures', () => {
  const doc = JSON.parse(readFileSync(resolve(ROOT, 'test', 'measurements', 'v2.7', 'payload', 'prefix-declared.json'), 'utf-8'));
  const { declarations, problems } = validatePrefixDeclarations(doc);
  assert.deepEqual(problems, []);
  assert.ok(declarations.length > 0);
  for (const declaration of declarations) {
    const text = readFileSync(resolve(ROOT, 'test', 'scenarios', 'payload', `${declaration.group}.json`), 'utf-8');
    const labels = fixtureCaptureLabels(text);
    const from = labels.indexOf(declaration.from);
    const to = labels.indexOf(declaration.to);
    assert.ok(from >= 0 && to > from, `${declaration.group}: ${declaration.from} -> ${declaration.to} are not captures in order`);
    const memberOf = (label: string) => text.match(new RegExp(`capture\\(\\s*\\\\?['"]${label}\\\\?['"]\\s*,\\s*\\{\\s*member:\\s*\\\\?['"]([^'"\\\\]+)`))?.[1] ?? RESTING_KEY;
    assert.equal(memberOf(declaration.from), declaration.key ?? memberOf(declaration.from), `${declaration.group}: ${declaration.from} is not a ${declaration.key} capture`);
    assert.equal(memberOf(declaration.to), memberOf(declaration.from));
    const between = labels.slice(from + 1, to).filter((label) => memberOf(label) === memberOf(declaration.from));
    assert.deepEqual(between, [], `${declaration.group}: ${declaration.from} -> ${declaration.to} are not consecutive for their key`);
  }
});
