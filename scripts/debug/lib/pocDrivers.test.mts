import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  JOURNEY_FLOORS, JOURNEY_STEPS, POSE_FLOORS, armOrder, checkpointForTurn, classifyCall, parseAuthoringRoute, countCalls, directedPoses, evidenceDirName, gpuIdleProblems, journeyCast,
  journeyGpuMinutes, journeyStory, laneProblem, latencyVerdict, median, p90, parseSmi, plumbingProblems, poseCast, poseStory, skeletonProblems, staleFindings,
  stepVerdict, wizardScript, type Sample, type StaleInput, type StepRow,
} from './pocDrivers.mts';

const row = (id: string, outcome: StepRow['outcome'], extra: Partial<StepRow> = {}): StepRow => ({ id, member: null, outcome, ms: 10, startedAt: '2026-10-14T00:00:00Z', ...extra });

test('floors are predeclared and non-empty', () => {
  assert.ok(JOURNEY_FLOORS.length >= 5);
  assert.ok(POSE_FLOORS.some((line) => line.includes('1.10 x')));
});

test('classifyCall names each provider and ignores status probes', () => {
  assert.equal(classifyCall('http://127.0.0.1:8146/api/plugins/story-orchestrator-harness/complete'), 'sol');
  assert.equal(classifyCall('/api/plugins/story-orchestrator-harness/agent/next'), 'sol');
  assert.equal(classifyCall('/api/plugins/story-orchestrator-judge/ask'), 'judge');
  assert.equal(classifyCall('/api/plugins/story-orchestrator-judge/status'), null);
  assert.equal(classifyCall('/api/plugins/story-orchestrator-media/jobs'), 'comfy');
  assert.equal(classifyCall('/api/plugins/story-orchestrator-media/jobs/abc'), null);
  assert.equal(classifyCall('/api/plugins/story-orchestrator-gpu/lease'), 'gpu-broker');
  assert.equal(classifyCall('/api/plugins/story-orchestrator-gpu/status'), null);
  assert.equal(classifyCall('/api/backends/text-completions/generate'), 'artemis');
  assert.equal(classifyCall('/api/backends/chat-completions/generate', JSON.stringify({ chat_completion_source: 'deepseek' })), 'deepseek');
  assert.equal(classifyCall('/api/backends/chat-completions/generate', 'not json'), 'cm-profile');
  assert.deepEqual(countCalls([{ provider: 'sol' }, { provider: null }, { provider: 'sol' }, { provider: 'comfy' }]), { sol: 2, comfy: 1 });
});

test('stepVerdict: a dry stub passes, a real stub and a missing step do not', () => {
  const rows = [row('a', 'pass'), row('b', 'stub')];
  assert.deepEqual(stepVerdict(rows, 'dry', ['a', 'b']), []);
  assert.deepEqual(stepVerdict(rows, 'real', ['a', 'b']), ['b: stub']);
  assert.deepEqual(stepVerdict(rows, 'dry', ['a', 'b', 'c']), ['c: not run']);
  assert.deepEqual(stepVerdict([row('a', 'pass', { ms: Number.NaN })], 'dry', ['a']), ['a: no timing']);
});

test('plumbingProblems ignores product misses but reports aborts, driver errors and leaks', () => {
  assert.deepEqual(plumbingProblems([row('a', 'fail')], ['a'], { leaked: 0 }), []);
  assert.deepEqual(plumbingProblems([row('a', 'fail', { thrown: true, detail: 'boom' })], ['a'], null), ['a: driver error (boom)']);
  assert.deepEqual(plumbingProblems([row('abort', 'fail', { detail: 'x' })], ['a'], null), ['aborted: x', 'a: not run']);
  assert.deepEqual(plumbingProblems([row('a', 'pass')], ['a'], { leaked: 2 }), ['cleanup: 2 owned asset(s) leaked']);
  assert.deepEqual(plumbingProblems([row('a', 'pass')], ['a'], { error: 'no page' }), ['cleanup: no page']);
});

const sample = (gpuUsedMiB: number | null, gpuUtil: number | null, stub = false): Sample => ({ at: 't', gpuUsedMiB, gpuUtil, ramFreeMiB: 1000, ...(stub ? { stub } : {}) });

test('gpuIdleProblems: idle tail passes, held VRAM, busy GPU and queued jobs fail, stubs are skipped', () => {
  assert.deepEqual(gpuIdleProblems([sample(2000, 0), sample(2100, 1), sample(2000, 0)], 2000, 0), []);
  assert.equal(gpuIdleProblems([sample(2000, 0), sample(9000, 0), sample(2000, 50)], 2000, 1).length, 3);
  assert.deepEqual(gpuIdleProblems([sample(null, null, true), sample(null, null, true), sample(null, null, true)], null, 0), []);
  assert.deepEqual(gpuIdleProblems([sample(1, 1)], 1, 0), ['only 1 closing samples (need 3)']);
  assert.deepEqual(parseSmi('2048, 7'), { usedMiB: 2048, util: 7 });
  assert.equal(parseSmi('n/a'), null);
});

const staleBase = (): StaleInput => ({
  rows: [{ character: 'A', set: 'default', label: 'neutral', sha256: 'h1', actualHash: 'h1', key: 'k1', visualRoot: 'src:1' }],
  actors: [{ name: 'A', set: 'default', path: '/characters/A/default/neutral.png?t=1', liveHead: { look: 'default', artHash: 'bust1' } }],
  sources: { A: { root: 'src:1', looks: { default: { root: 'src:1', bustSha: 'bust1', baseSha: 'b' } } } },
  owned: (name) => name === 'A',
  served: () => true,
});

test('staleFindings: a consistent state is clean; each stale kind is named', () => {
  assert.deepEqual(staleFindings(staleBase()), []);
  const changed = staleBase(); changed.rows[0].actualHash = 'h2';
  assert.match(staleFindings(changed)[0], /changed file/);
  const missing = staleBase(); missing.rows[0].actualHash = null;
  assert.match(staleFindings(missing)[0], /missing file/);
  const twoHashes = staleBase(); twoHashes.rows.push({ ...twoHashes.rows[0], label: 'happy', sha256: 'h9', actualHash: 'h9' });
  assert.ok(staleFindings(twoHashes).some((line) => /holds 2 hashes/.test(line)));
  const unserved = staleBase(); unserved.served = () => false;
  assert.match(staleFindings(unserved)[0], /not served/);
  const root = staleBase(); root.rows[0].visualRoot = 'src:0';
  assert.match(staleFindings(root)[0], /accepted root/);
  const rig = staleBase(); rig.actors[0].liveHead = { look: 'default', artHash: 'old' };
  assert.match(staleFindings(rig)[0], /live head drawn/);
  const look = staleBase(); look.actors[0].set = 'look_x';
  assert.ok(staleFindings(look).some((line) => /default-look rig/.test(line)));
  const foreign = staleBase(); foreign.owned = () => false; foreign.rows[0].actualHash = null;
  assert.deepEqual(staleFindings(foreign), []);
});

test('latency: median, p90 and the +10% verdict', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
  assert.equal(p90([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 9);
  assert.equal(latencyVerdict([110, 110], [100, 100]).pass, true);
  assert.equal(latencyVerdict([111, 111], [100, 100]).pass, false);
  assert.equal(latencyVerdict([], [100]).pass, false);
});

test('arm order alternates by run and turns walk the four checkpoints', () => {
  assert.deepEqual(armOrder(1), ['off', 'on']);
  assert.deepEqual(armOrder(2), ['on', 'off']);
  assert.deepEqual(Array.from({ length: 8 }, (_, turn) => checkpointForTurn(turn, 8)), ['c1', 'c1', 'c2', 'c2', 'c3', 'c3', 'c4', 'c4']);
  assert.equal(checkpointForTurn(0, 0), 'c1');
});

test('journey story: anchors, one start, unreachable gates, a look change, every member directed', () => {
  const cast = journeyCast();
  const story = journeyStory(cast);
  assert.equal(story.checkpoints.filter((cp: any) => cp.start).length, 1);
  assert.ok(story.checkpoints.every((cp: any) => cp.type === 'anchor' && cp.illustrate === false));
  assert.ok(story.checkpoints.every((cp: any) => cast.every((member) => cp.effects.stage.cast[member.id]?.pose)));
  assert.ok(story.checkpoints.some((cp: any) => cp.effects.card));
  assert.ok(cast.every((member) => member.name.startsWith('SO-P41 ')));
  assert.deepEqual(skeletonProblems(structuredClone(story), story), []);
  const moved = structuredClone(story); moved.checkpoints[0].effects.stage.framing = 'full';
  assert.deepEqual(skeletonProblems(moved, story), [`${story.checkpoints[0].id}: stage effect changed`]);
  assert.equal(wizardScript(cast, 'G').length, cast.length + 3);
  assert.ok(journeyGpuMinutes(3, 2) > journeyGpuMinutes(3, 1));
  assert.ok(JOURNEY_STEPS.includes('gpu-idle'));
});

test('pose story: four checkpoints, distinct poses per member, look changes from c2', () => {
  const cast = poseCast();
  const story = poseStory(cast);
  assert.deepEqual(story.checkpoints.map((cp: any) => cp.id), ['c1', 'c2', 'c3', 'c4']);
  assert.ok(cast.every((member) => new Set(member.poses).size === 4));
  assert.equal(story.checkpoints.filter((cp: any) => cp.effects.card).length, 3);
  assert.equal(directedPoses(cast, 4).length, 12);
  assert.equal(directedPoses(cast, 2).length, 6);
});

test('laneProblem refuses the owner ST and lanes below 30', () => {
  assert.match(laneProblem('http://127.0.0.1:8000', 'C:/so-lanes/46/debug')!, /owner ST/);
  assert.match(laneProblem('http://127.0.0.1:8101', 'C:/so-lanes/1/debug')!, /not a lane >= 30/);
  assert.equal(laneProblem('http://127.0.0.1:8146', 'C:\\so-lanes\\46\\debug'), null);
  assert.match(laneProblem('http://127.0.0.1:8146', 'C:\\so-lanes\\0\\debug')!, /lane 0/);
  assert.match(laneProblem('http://127.0.0.1:8188', 'C:/so-lanes/88/debug')!, /reserved for ComfyUI/);
  assert.equal(evidenceDirName('my label', 2, 'dry', '2026-10-14T10:00:00.000Z'), '2026-10-14T10-00-00-000Z-my_label-dry-run2');
});

test('parseAuthoringRoute names the wizard route a journey asks for', () => {
  assert.equal(parseAuthoringRoute(undefined), null);
  assert.equal(parseAuthoringRoute('default'), null);
  assert.deepEqual(parseAuthoringRoute('claude'), { harness: 'claude', model: 'claude-sonnet-5-5' });
  assert.deepEqual(parseAuthoringRoute('claude-opus'), { harness: 'claude', model: 'claude-opus-5-5' });
  assert.deepEqual(parseAuthoringRoute('opencode'), { harness: 'opencode', model: 'openai/gpt-6.1-sol' });
  assert.deepEqual(parseAuthoringRoute('claude:claude-opus-5-5'), { harness: 'claude', model: 'claude-opus-5-5' });
  assert.throws(() => parseAuthoringRoute('codex:default'), /--authoring takes/);
  assert.throws(() => parseAuthoringRoute('claude:'), /--authoring takes/);
});
