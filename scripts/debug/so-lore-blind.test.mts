import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { claudeRaterArgv, claudeReply, loreReadme, raterOrder, renderLorePack, unsealedLoreMarkdown } from './so-lore-blind.mts';
import { armOrder, LORE_RULE_OFF_GLOBAL, RETRYABLE_TRANSPORT, withTransportRetry } from './so-wizard-agent.mts';
import { aggregateLore, buildLorePack, type LoreArm, type LoreRunTask } from './lib/loreBlind.mts';

const tasks = (arm: LoreArm): LoreRunTask[] => [1, 2].map((at) => ({ id: `t${at}`, kind: 'place', arm, entry: { title: `${arm}-${at}`, keys: ['k'], content: `c${at}` } }));

test('the claude rater runs with no tools, no settings, no session and the requested model', () => {
  const argv = claudeRaterArgv('claude-opus-5-5');
  assert.deepEqual(argv.slice(0, 3), ['-p', '--tools', '']);
  for (const flag of ['--setting-sources', '--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands']) assert.ok(argv.includes(flag), flag);
  assert.equal(argv[argv.indexOf('--model') + 1], 'claude-opus-5-5');
});

test('claudeReply reads the result and the served model; an error result is empty', () => {
  assert.deepEqual(claudeReply('noise\n{"result":"{\\"score\\": 3}","is_error":false,"modelUsage":{"claude-opus-5-5":{}}}'), { text: '{"score": 3}', served: ['claude-opus-5-5'] });
  assert.equal(claudeReply('{"result":"x","is_error":true}').text, '');
  assert.deepEqual(claudeReply('not json'), { text: '', served: [] });
});

test('each rater sees every entry once in its own order', () => {
  const ids = Array.from({ length: 20 }, (_, at) => `E${String(at + 1).padStart(2, '0')}`);
  const a = raterOrder(ids, 'claude:claude-opus-5-5');
  const b = raterOrder(ids, 'claude:claude-sonnet-5-5');
  assert.deepEqual([...a].sort(), ids);
  assert.deepEqual([...b].sort(), ids);
  assert.notDeepEqual(a, b);
  assert.deepEqual(raterOrder(ids, 'claude:claude-opus-5-5'), a);
});

test('the pack markdown and README never name an arm, a task or the switch', () => {
  const { pack, key } = buildLorePack({ seed: 'x', rubric: 'R', runs: [{ run: 'run1', tasks: [...tasks('on'), ...tasks('off')] }] });
  const shown = `${renderLorePack({ ...pack, entries: pack.entries.map((entry) => ({ ...entry, title: 'T' })) })}\n${loreReadme(pack, 'f'.repeat(64), 0)}`;
  assert.doesNotMatch(shown, /\bt1\b|\bt2\b|run1|storyOrchestratorDebug/);
  assert.equal(Object.keys(key.entries).length, 4);
});

test('the unsealed summary states both raters, every arm and on - off', () => {
  const { key } = buildLorePack({ seed: 'y', rubric: 'R', runs: [{ run: 'run1', tasks: [...tasks('on'), ...tasks('off')] }] });
  const sheet = Object.fromEntries(Object.keys(key.entries).map((id) => [id, { score: key.entries[id].arm === 'on' ? 4 : 3 }]));
  const text = unsealedLoreMarkdown(aggregateLore({ a: sheet, b: sheet }, key), ['a', 'b']);
  assert.match(text, /- on: 2 entries, median 4\.00 \(a 4\.00, b 4\.00\)/);
  assert.match(text, /- off: 2 entries, median 3\.00/);
  assert.match(text, /- on - off: 1\.00 \(a 1\.00, b 1\.00\)/);
});

test('lore-guidance alternates the arm order by task and names the same switch the page reads', () => {
  assert.deepEqual([0, 1, 2].map((index) => armOrder(['on', 'off'], index)), [['on', 'off'], ['off', 'on'], ['on', 'off']]);
  const prompts = readFileSync(resolve(process.cwd(), 'src/copilot/prompts.ts'), 'utf-8');
  assert.ok(prompts.includes(`LORE_RULE_OFF_GLOBAL = "${LORE_RULE_OFF_GLOBAL}"`));
});

test('withTransportRetry retries a model-listing or quota failure, never another error, and stops after its attempts', async () => {
  const waits: number[] = [];
  const wait = async (ms: number) => { waits.push(ms); };
  let calls = 0;
  const flaky = await withTransportRetry(async () => { calls += 1; if (calls < 3) throw new Error('config: OpenCode does not list the model openai/gpt-6.1-sol as available'); return { bridgeProblems: [] as string[], value: calls }; }, 't', 3, wait, 5);
  assert.deepEqual([flaky.attempts, flaky.result.value, flaky.retried.length, waits], [3, 3, 2, [5, 5]]);
  await assert.rejects(withTransportRetry(async () => { throw new Error('the draft did not validate'); }, 't', 3, wait, 5), /did not validate/);
  const refused = await withTransportRetry(async () => ({ bridgeProblems: ['the Studio resolver refused the harness route: usage limit reached'] }), 't', 2, wait, 5);
  assert.deepEqual([refused.attempts, refused.retried.length], [2, 1]);
  assert.ok(!RETRYABLE_TRANSPORT.test('no native tool call reached the page'));
});
