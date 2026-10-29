import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateFixture } from './lib/scenarioSchema.mts';
import { cleanReply, installReplyRelay, opensThought, promptOf, RELAY_MODEL_ID, sseText, textBody } from './lib/replyRelay.mts';
import { abaScenario, caseScenario, labBook, labStory, QO_CASES, QO_DIR, scoreCase, stringPass, summarize, tagsOf, type QoRating, type QoReply } from './lib/quantumOgre.mts';
import { rateCommand, scenariosCommand } from './so-qogre.mts';
import { testTempDirSync } from '../lib/testTemp.mjs';

const ROOT = join(import.meta.dirname, '..', '..');

test('62 probe: the checked-in probe family is what the generator writes', () => {
  assert.deepEqual(scenariosCommand(true).problems, []);
});

test('62 probe: every probe fixture passes the closed scenario vocabulary and its evals parse', () => {
  const files = readdirSync(join(ROOT, QO_DIR)).filter((name) => name.startsWith('quantum-ogre-') && !/\.(story|book)\.json$/.test(name));
  assert.equal(files.length, QO_CASES.length + 1);
  for (const name of files) {
    const doc = JSON.parse(readFileSync(join(ROOT, QO_DIR, name), 'utf-8'));
    assert.deepEqual(validateFixture(doc, name), [], name);
    for (const step of doc.steps) if (typeof step.eval === 'string') assert.doesNotThrow(() => new Function(`return (async () => { ${step.eval} })()`), `${name}: ${step.eval.slice(0, 80)}`);
  }
});

test('62 probe: ten cases over three kinds, each with one committed fact handed to its holder', () => {
  assert.equal(QO_CASES.length, 10);
  assert.deepEqual([...new Set(QO_CASES.map((item) => item.kind))].sort(), ['container', 'knowledge', 'trace']);
  const book = labBook().entries as Record<string, { characterFilter: { names: string[] }; key: string[]; content: string }>;
  for (const [uid, item] of QO_CASES.entries()) {
    const entry = book[String(uid)];
    assert.equal(entry.content, item.lore);
    assert.deepEqual(entry.characterFilter.names, item.kind === 'container' ? [] : [item.holder]);
    assert.ok(item.keys.some((key) => item.ask.toLowerCase().includes(key)), `${item.id}: the ask carries a key`);
    assert.ok(item.keys.some((key) => item.reask.toLowerCase().includes(key)) && item.keys.some((key) => item.reask2.toLowerCase().includes(key)), `${item.id}: both re-asks carry a key`);
    assert.notEqual(item.probe.speaker, item.kind === 'container' ? 'nobody' : item.holder, `${item.id}: the disclosure probe drafts a non-holder`);
    assert.ok(item.needles.every((needle) => item.fact.toLowerCase().includes(needle)), `${item.id}: needles come from the fact`);
  }
  assert.deepEqual(labStory().requirements.lorebooks, ['SO-QO Lab']);
});

test('62 probe: a case scenario records 14 replies: the probe, the ask and 5 swipes, 3 fillers, 2 re-asks, leave and return', () => {
  const scenario = caseScenario(QO_CASES[4]);
  const tags = scenario.steps.map((step) => (typeof (step as { eval?: string }).eval === 'string' ? (step as { eval: string }).eval.match(/tag: "([^"]+)"/)?.[1] : null)).filter(Boolean);
  assert.deepEqual(tags, tagsOf());
  assert.equal(tags.length, 14);
  assert.equal(abaScenario().requires.lane, 'no-model');
});

test('62 relay: an open thought prefill is closed before the reply, names and template tokens are stripped', () => {
  assert.equal(opensThought('<|turn>model\n<|channel>thought\n'), true);
  assert.equal(opensThought('<|channel>thought\nhm<channel|>Arin:'), false);
  assert.equal(textBody('Hi.', '<|channel>thought\n'), 'Reply drafted by the relay.<channel|>Hi.');
  assert.equal(textBody('Hi.', 'Arin:'), 'Hi.');
  assert.equal(cleanReply('Arin: "Hessa Vane."<turn|>', 'Arin'), '"Hessa Vane."');
  assert.equal(cleanReply('**DM Narrator:** Rain falls.', 'DM Narrator'), 'Rain falls.');
  assert.equal(promptOf('chat', { messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }] }), '[system]\nS\n\n[user]\nU');
  const events = sseText('Hi.').split('\n\n').filter(Boolean);
  assert.equal(JSON.parse(events[0].slice(6)).choices[0].text, 'Hi.');
  assert.equal(events.at(-1), 'data: [DONE]');
});

test('62 relay: streamed replies are served, side calls refused, status answered (fake route)', async () => {
  const handlers: Array<(route: unknown) => Promise<unknown>> = [];
  const page = {
    route: async (_pattern: string, handler: (route: unknown) => Promise<unknown>) => { handlers.push(handler); },
    unroute: async () => undefined,
    evaluate: async () => 'Arin',
  };
  const relay = await installReplyRelay(page as never, { mode: 'scripted', workDir: tmpdir(), script: ({ index, speaker }) => `${speaker} reply ${index}` });
  const call = async (path: string, body: unknown) => {
    let fulfilled: { status: number; body: string } | null = null;
    let fellBack = false;
    await handlers[0]({
      request: () => ({ url: () => `http://127.0.0.1:8184${path}`, postData: () => JSON.stringify(body) }),
      fulfill: async (value: { status: number; body: string }) => { fulfilled = value; },
      fallback: async () => { fellBack = true; },
    });
    return { fulfilled: fulfilled as { status: number; body: string } | null, fellBack };
  };
  assert.equal(JSON.parse((await call('/api/backends/text-completions/status', {})).fulfilled!.body).result, RELAY_MODEL_ID);
  assert.equal((await call('/api/backends/text-completions/generate', { stream: false, prompt: 'x' })).fulfilled!.status, 503);
  const loud = await call('/api/backends/text-completions/generate', { stream: true, prompt: 'Arin:' });
  assert.equal(loud.fulfilled!.status, 200);
  assert.match(loud.fulfilled!.body, /Arin reply 0/);
  assert.equal((await call('/api/characters/all', {})).fellBack, true);
  assert.equal(relay.calls.length, 1);
  assert.equal(relay.refused(), 1);
});

const rating = (item: string, tag: string, speaker: string, statesFact: boolean, contradicts = false): QoRating => ({ case: item, tag, speaker, statesFact, contradicts, conflicting: contradicts ? ['x'] : [], detail: null, stringFact: null, needlesNamed: [] });
const reply = (item: string, tag: string, swipe: number): QoReply => ({ case: item, tag, speaker: '', mesId: 4, swipe, swipes: 6, text: '' });

test('62 score: contradictions over the ask swipes and the re-asks; disclosure only before the fact is public', () => {
  const knowledge = QO_CASES.find((item) => item.id === 'k1-bell')!;
  const asks = Array.from({ length: 6 }, (_, index) => rating('k1-bell', `ask-${index}`, 'Arin', index !== 5, index === 2));
  const replies = Array.from({ length: 6 }, (_, index) => reply('k1-bell', `ask-${index}`, index));
  const hidden = scoreCase(knowledge, [rating('k1-bell', 'probe', 'Luke', false), ...asks, rating('k1-bell', 'filler-1', 'Luke', true), rating('k1-bell', 'filler-3', 'DM Narrator', false), rating('k1-bell', 'reask-later', 'Arin', true, true), rating('k1-bell', 'reask-revisit', 'Arin', true)], replies, { largest_group: 3, groups: 2 });
  assert.deepEqual(hidden.q1, { replies: 6, contradictions: 1, conflictingItems: 1, statesFact: 5 });
  assert.deepEqual(hidden.q2, { replies: 2, contradictions: 1, statesFact: 2 });
  assert.deepEqual(hidden.q2d, { eligible: 3, disclosures: 1, tags: ['filler-1'] });
  const told = scoreCase(knowledge, [rating('k1-bell', 'probe', 'Luke', true), ...asks.slice(0, 5), rating('k1-bell', 'ask-5', 'Arin', true), rating('k1-bell', 'filler-1', 'Luke', true)], replies, null);
  assert.deepEqual(told.q2d, { eligible: 1, disclosures: 1, tags: ['probe'] });
  const container = QO_CASES[0];
  const box = scoreCase(container, [rating(container.id, 'probe', 'DM Narrator', true), rating(container.id, 'filler-1', 'Luke', true), rating(container.id, 'ask-0', 'DM Narrator', true, true)], [reply(container.id, 'ask-0', 0)], null);
  assert.deepEqual(box.q2d, { eligible: 1, disclosures: 1, tags: ['probe'] });
  const summary = summarize([hidden, box]);
  assert.equal(summary.Q1.contradictions, 2);
  assert.equal(summary.Q1.complete, false);
  assert.equal(summary.Q2d.disclosures, 2);
  assert.deepEqual(stringPass(knowledge, 'It was Hessa.'), { stringFact: true, needlesNamed: ['hessa'] });
  assert.deepEqual(stringPass(container, 'A compass and a chart.'), { stringFact: null, needlesNamed: ['compass', 'chart'] });
});

test('62 rate: blind rater answers are parsed, an unparsed answer is an error that a re-run retries', async () => {
  const run = testTempDirSync('qogre-');
  const item = QO_CASES[4];
  writeFileSync(join(run, `${item.id}.json`), JSON.stringify({ replies: [{ ...reply(item.id, 'ask-0', 0), speaker: 'Arin', text: 'It was Hessa Vane.' }, { ...reply(item.id, 'ask-1', 1), speaker: 'Arin', text: 'Old Tom rang it.' }] }));
  const seen: string[] = [];
  const quiet = console.log;
  console.log = () => {};
  try {
    const first = await rateCommand(['rate', '--run', run, '--concurrency', '1'], async (agent, prompt) => {
      seen.push(prompt);
      if (agent.id === 'so-qo-agree') return { text: '{"largest_group": 1, "groups": 2}', model: 'stub' };
      return { text: prompt.includes('Old Tom') ? 'not json' : '{"states_fact": true, "contradicts": false, "conflicting": [], "detail": "an alarm"}', model: 'stub' };
    });
    assert.equal(first.ok, false);
    assert.ok(seen.every((prompt) => !prompt.includes('Story so far')));
    assert.ok(seen[0].includes(item.fact) && seen[0].includes(item.ask));
    const second = await rateCommand(['rate', '--run', run], async () => ({ text: '{"states_fact": false, "contradicts": true, "conflicting": ["Old Tom"], "detail": null}', model: 'stub' }));
    assert.equal(second.ok, true);
    const stored = JSON.parse(readFileSync(join(run, 'ratings.json'), 'utf-8'));
    assert.deepEqual(stored.ratings.map((row: QoRating) => [row.tag, row.contradicts, row.conflicting]), [['ask-0', false, []], ['ask-1', true, ['Old Tom']]]);
  } finally {
    console.log = quiet;
  }
});
