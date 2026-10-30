import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildDirectorPrompt, checkFrontierSet, directorInputFor, forcedSceneRecord, FRONTIERS_FILE, frozenRefusal, loadFrozen, loadSceneModule, LOCK_FILE, plumbingAnswer,
  prepareFrontier, readDrafts, replayAll, replayOne, type Asker, type Frontier,
} from './lib/sceneReplay.mts';
import { main } from './so-scene-test-replay.mts';
import { testTempDir } from '../lib/testTemp.mjs';

const readJson = async (file: string) => JSON.parse(await readFile(file, 'utf-8'));
const quiet = async <T,>(run: () => Promise<T>): Promise<T> => {
  const log = console.log;
  console.log = () => {};
  try {
    return await run();
  } finally {
    console.log = log;
  }
};

const frontiers = async (): Promise<Frontier[]> => (await loadFrozen()).set.frontiers;

test('the committed frontier set is frozen: 20 synthetic frontiers matching the lock', async () => {
  const { set, sha256 } = await loadFrozen();
  assert.equal(set.frontiers.length, 20);
  assert.equal(set.synthetic, true);
  assert.equal(sha256, (await readJson(LOCK_FILE)).sha256);
  assert.equal(await quiet(() => main(['check'])), 0);
});

test('a drifted frontier set is refused by the hash, the count and every command', async () => {
  const set = checkFrontierSet(await readJson(FRONTIERS_FILE));
  const lock = await readJson(LOCK_FILE);
  assert.equal(frozenRefusal(set, lock), null);
  const edited = structuredClone(set);
  edited.frontiers[3].inputs.openThreads[0] += '.';
  assert.match(frozenRefusal(edited, lock) ?? '', /changed since it was frozen/);
  assert.match(frozenRefusal(set, { ...lock, frontiers: 19 }) ?? '', /20 frontiers, frozen 19/);
  assert.match(frozenRefusal(set, null) ?? '', /no so-scene-frontiers-lock/);
  const dir = await testTempDir('so-scene-');
  const file = join(dir, 'frontiers.json');
  await writeFile(file, JSON.stringify(edited), 'utf-8');
  await assert.rejects(replayAll({ out: dir, run: 1, plumbing: true, frontiersFile: file, lockFile: LOCK_FILE, log: () => {} }), /changed since it was frozen/);
  assert.equal(await quiet(() => main(['check', '--frontiers', file])), 3);
  assert.throws(() => checkFrontierSet({ ...set, synthetic: false }), /synthetic/);
});

test('every frontier parses with the shipped parser and is a director frontier with an open thread', async () => {
  const mod = await loadSceneModule();
  for (const frontier of await frontiers()) {
    const { story, state } = prepareFrontier(mod, frontier);
    assert.equal(story.checkpointById[frontier.frontierId]?.type, 'anchor', frontier.id);
    assert.equal((story.outgoingByCheckpoint[frontier.frontierId] ?? []).length, 0, frontier.id);
    assert.equal(story.living?.authored_until, frontier.frontierId, frontier.id);
    assert.deepEqual(state.visitedPath.at(-1), frontier.frontierId, frontier.id);
  }
});

test('prompt per outcome: expected is byte-identical to no signal, altered and interrupt add exactly one shipped signal line', async () => {
  const mod = await loadSceneModule();
  for (const frontier of await frontiers()) {
    const { story, state, input } = directorInputFor(mod, frontier, 'expected');
    const bare = { ...input };
    delete bare.sceneTest;
    const plain = mod.renderDirectorPrompt({ ...bare, ending: mod.endingFor(story, state.blackboard.values) });
    const expected = buildDirectorPrompt(mod, frontier, 'expected');
    assert.equal(expected, plain, frontier.id);
    assert.doesNotMatch(expected, /Scene signal/);
    const name = story.checkpointById[frontier.frontierId].name;
    for (const outcome of ['altered', 'interrupt'] as const) {
      const prompt = buildDirectorPrompt(mod, frontier, outcome);
      const extra = prompt.split('\n').filter((line) => !plain.split('\n').includes(line));
      assert.equal(extra.length, 1, `${frontier.id} ${outcome}`);
      assert.ok(extra[0].startsWith(`Scene signal: ${outcome}.`), extra[0]);
      assert.ok(extra[0].includes(`on from "${name}"`), extra[0]);
      assert.ok(extra[0].includes(`"${frontier.inputs.openThreads.at(-1)}"`), extra[0]);
      if (outcome === 'interrupt') {
        const focus = /advances the open thread "([^"]+)"/.exec(extra[0])?.[1];
        assert.ok(focus && frontier.inputs.openThreads.includes(focus), extra[0]);
        assert.ok(extra[0].includes('"advances"'));
      } else assert.ok(extra[0].includes('"changed"'));
    }
  }
});

test('the forced record equals the shipped planSceneTest record wherever its natural draw lands on that outcome', async () => {
  const mod = await loadSceneModule();
  const [frontier] = await frontiers();
  const { story } = prepareFrontier(mod, frontier);
  const seen = new Set<string>();
  for (let plannedAt = 0; plannedAt < 400 && seen.size < 3; plannedAt += 1) {
    const natural = mod.planSceneTest({
      story, ids: frontier.ids, frontierId: frontier.frontierId, frontierName: story.checkpointById[frontier.frontierId].name, plannedAt, messageId: plannedAt * 2,
      tension: 'peak', candidates: mod.focusCandidates({ arcs: frontier.inputs.openThreads, unknownNames: [], resting: (text: string) => text }), prior: [],
    });
    if (seen.has(natural.applied)) continue;
    seen.add(natural.applied);
    const forced = forcedSceneRecord(mod, { ...frontier, plannedAt }, story, natural.applied);
    assert.deepEqual(mod.sceneSignal(forced), mod.sceneSignal(natural), `${natural.applied} at ${plannedAt}`);
    assert.equal(forced.focus, natural.focus);
    assert.deepEqual(forced.expected, natural.expected);
  }
  assert.equal(seen.size, 3);
});

const reply = (fields: Record<string, unknown> = {}) => JSON.stringify({
  name: 'Smoke Over the River', objective: 'A barge burns at the far landing and the warden calls for hands.', tension: 'tense', snapshot: {},
  opens_when: { new: { key: 'fire_seen', rubric: 'Has anyone seen the fire at the landing?' } }, new_qualities: [], builds_on: null, new_chapter: false, final: false, reason: 'test', ...fields,
});
const pass = JSON.stringify({ pass: true, issues: [] });
const refuse = JSON.stringify({ pass: false, issues: ['the objective decides for the player'] });

const scripted = (director: string[], critic: string[]): { ask: Asker; prompts: string[] } => {
  const prompts: string[] = [];
  return {
    prompts,
    ask: async (prompt) => {
      prompts.push(prompt);
      const queue = prompt.startsWith('Review one generated turning point') ? critic : director;
      const text = queue.shift();
      if (text === undefined) throw new Error('script ran out');
      return { text, model: 'fake' };
    },
  };
};

test('refusals are counted per attempt with their stage: parse, scene ops, guard (narrated player) and critic', async () => {
  const mod = await loadSceneModule();
  const [frontier] = await frontiers();
  const thread = frontier.inputs.openThreads[0];

  const sceneThenCritic = scripted([reply(), reply({ advances: thread })], [refuse]);
  const first = await replayOne(mod, frontier, 'interrupt', sceneThenCritic.ask, tmpdir());
  assert.equal(first.status, 'refused');
  assert.equal(first.refusal?.stage, 'critic');
  assert.deepEqual(first.attempts.map((attempt) => attempt.stage), ['ops', 'critic']);
  assert.match(first.attempts[0].scene[0], /advances an existing open thread/);
  assert.equal(first.attempts[1].critic?.refused, true);
  assert.equal(first.delivered?.accepted, false);
  assert.equal(first.delivered?.advances, thread);
  assert.ok(sceneThenCritic.prompts[1].includes('Your previous answer was refused'));

  const criticThenOk = scripted([reply({ changed: 'place' }), reply({ changed: 'obstacle' })], [refuse, pass]);
  const second = await replayOne(mod, frontier, 'altered', criticThenOk.ask, tmpdir());
  assert.equal(second.status, 'ok');
  assert.deepEqual(second.attempts.map((attempt) => attempt.stage), ['critic', 'ok']);
  assert.deepEqual(second.delivered, { name: 'Smoke Over the River', objective: 'A barge burns at the far landing and the warden calls for hands.', changed: ['obstacle'], accepted: true });

  const narrated = scripted([reply({ objective: 'The player accepts the warden\'s offer and boards the barge.' }), 'not json at all'], []);
  const third = await replayOne(mod, frontier, 'expected', narrated.ask, tmpdir());
  assert.equal(third.status, 'refused');
  assert.deepEqual(third.attempts.map((attempt) => attempt.stage), ['guard', 'parse']);
  assert.equal(third.attempts[0].narrated, true);
  assert.equal(third.attempts[1].narrated, false);
  assert.equal(third.delivered?.accepted, false);

  const twoChanges = scripted([reply({ changed: ['place', 'cast'] }), reply({ changed: 'cast' })], [pass]);
  const fourth = await replayOne(mod, frontier, 'altered', twoChanges.ask, tmpdir());
  assert.deepEqual(fourth.attempts.map((attempt) => attempt.stage), ['ops', 'ok']);
  assert.match(fourth.attempts[0].scene[0], /exactly one change/);
  assert.equal(fourth.signal?.startsWith('Scene signal: altered.'), true);
});

test('plumbing replay writes 60 resumable drafts per run, never mixes with a real run and is marked', async () => {
  const out = await testTempDir('so-scene-');
  const first = await replayAll({ out, run: 1, plumbing: true, log: () => {} });
  assert.deepEqual([first.written, first.kept, first.failed], [60, 0, 0]);
  const again = await replayAll({ out, run: 1, plumbing: true, log: () => {} });
  assert.deepEqual([again.written, again.kept], [0, 60]);
  const drafts = await readDrafts(out, 1);
  assert.ok(drafts.every((draft) => draft.plumbing === true && draft.route.harness === 'plumbing' && /never a measurement/.test(draft.note)));
  await assert.rejects(replayAll({ out, run: 1, plumbing: false, ask: async () => ({ text: '', model: 'x' }), log: () => {} }), /do not mix modes/);
  await assert.rejects(replayAll({ out, run: 3, plumbing: true, log: () => {} }), /--run must be 1 or 2/);
  assert.equal(JSON.parse(plumbingAnswer('Review one generated turning point ...')).pass, true);
});
