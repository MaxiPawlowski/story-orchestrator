import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseChatFile, playerLines, transcriptToScenario, turnRecordEval } from './p0-replay.mts';
import { globalsReadButNeverWritten, validateFixture } from './lib/scenarioSchema.mts';

const story = JSON.parse(readFileSync(new URL('../../examples/sun-ruins/quest-for-the-sun-ruins.json', import.meta.url), 'utf-8'));
const header = { chat_metadata: { story_orchestrator: { version: 5, chatId: 'c1', selectedStoryId: 'sun-ruins', stories: { 'sun-ruins': { pinnedStory: story, playedVersion: 3 } } } }, user_name: 'unused', character_name: 'unused' };
const row = (fields: Record<string, unknown>) => JSON.stringify({ send_date: '2026-09-24T08:00:00.000Z', mes: '', ...fields });
const chat = [
  JSON.stringify(header),
  row({ name: 'Arin', is_user: false, mes: 'Welcome to the guild.' }),
  row({ name: 'You', is_user: true, mes: 'I ask about the map.' }),
  row({ name: 'Arin', is_user: false, mes: 'It points east.' }),
  row({ name: 'System', is_user: false, is_system: true, mes: 'Checkpoint: the gate.', extra: { type: 'comment' } }),
  row({ name: 'You', is_user: true, is_system: true, mes: 'A line I hid later.' }),
  row({ name: 'You', is_user: true, mes: '   ' }),
  row({ name: 'You', is_user: true, mes: 'We ride for the gate.' }),
].join('\r\n');

const convert = (text = chat) => transcriptToScenario(parseChatFile(text), { source: 'c1.jsonl', sourceSha256: 'abc' });

test('every non-empty player line becomes one real generation, in order, with a per-turn record', () => {
  const scenario = convert();
  const sends = scenario.steps.filter((step: any) => step.send_generate).map((step: any) => step.send_generate.text);
  assert.deepEqual(sends, ['I ask about the map.', 'A line I hid later.', 'We ride for the gate.']);
  const records = scenario.steps.filter((step: any) => step.eval && step.log);
  assert.equal(records.length, 4);
  assert.match(scenario._note, /3 player line\(s\), 1 of them hidden/);
});

test('the story is the one the chat pinned, imported inline', () => {
  const [first] = convert().steps as any[];
  assert.deepEqual(first.import_story, story);
});

test('the generated scenario passes the closed vocabulary and every eval parses', () => {
  const scenario = convert();
  assert.deepEqual(validateFixture(scenario), []);
  assert.deepEqual(globalsReadButNeverWritten([{ name: 'replay', text: JSON.stringify(scenario) }]), []);
  for (const step of scenario.steps as any[]) if (step.eval) new Function(`return (async () => { ${step.eval} })()`);
});

test('the per-turn record reads only the reads since the previous turn', async () => {
  const audits = [{ acceptedDeltas: [{ delta: { q: 'trust', v: 2 }, evidence: 'I trust you' }], rejected: [] }];
  (globalThis as any).storyOrchestratorRuntime = {
    getEngineState: () => ({ boundary: 4, activeCheckpointId: 'cp2', visitedPath: ['cp1', 'cp2'], blackboard: { values: { trust: 2 } } }),
    getExtractionAudits: () => audits,
  };
  (globalThis as any).__soReplayAuditCursor = 0;
  const first = await new Function(`return (async () => { ${turnRecordEval(1)} })()`)();
  assert.deepEqual(first, { turn: 1, boundary: 4, active: 'cp2', path: ['cp1', 'cp2'], values: { trust: 2 }, reads: 1, accepted: ['trust=2'], rejected: [] });
  audits.push({ acceptedDeltas: [], rejected: [{ line: 'DELTA x', reason: 'no evidence' }] } as never);
  const second = await new Function(`return (async () => { ${turnRecordEval(2)} })()`)();
  assert.equal(second.reads, 1);
  assert.deepEqual(second.rejected, ['no evidence']);
  delete (globalThis as any).storyOrchestratorRuntime;
  delete (globalThis as any).__soReplayAuditCursor;
});

test('control: a chat that pins no story, or has no player lines, is refused rather than replayed empty', () => {
  const unpinned = [JSON.stringify({ chat_metadata: {} }), row({ is_user: true, mes: 'hi' })].join('\n');
  assert.throws(() => convert(unpinned), /pins no story/);
  const silent = [JSON.stringify(header), row({ is_user: false, mes: 'hello' })].join('\n');
  assert.throws(() => convert(silent), /no player lines/);
  assert.throws(() => parseChatFile('{"not":"a header"}'), /not a chat header/);
});

test('extension rows typed by an extension are not player lines', () => {
  assert.deepEqual(playerLines([{ is_user: true, mes: 'x', extra: { type: 'narrator' } }, { is_user: true, mes: 'y' }]).map((line) => line.text), ['y']);
});
