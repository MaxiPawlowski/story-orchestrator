import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkPreconditions, loadFrozen, playRun, type PlayDeps } from './so-integration.mts';
import { runById, verifyRun, type RouteDoc, type RunsDoc, type RunSpec } from './lib/integrationRuns.mts';
import { clearPage, EVENT_TYPES, fakePage, fakeSt, install, uninstall } from './lib/sessionFakes.mts';

afterEach(() => uninstall());

const DOC_PATH = join(import.meta.dirname, '..', '..', 'test', 'measurements', 'v2.6-09', 'runs.json');
const loadDoc = (): RunsDoc => JSON.parse(readFileSync(DOC_PATH, 'utf-8'));

const tinyRun = (doc: RunsDoc): RunSpec => ({
  ...runById(doc, 'I1')!,
  route: { file: 'tests/routes-adventurer.json', name: 'tiny', from: 0, to: 2, throughExpect: 'at-the-walls' },
  drive: { mode: 'play-then-set', turnsPerStep: 2, maxForcedShare: 0.5 },
  cuts: [0],
});
const tinyRoutes: Record<string, RouteDoc[]> = {
  'tests/routes-adventurer.json': [{ story: 'adolion-adventurer', name: 'tiny', steps: [{ set: { path: 'wendhope' }, expect: 'road-to-wendhope' }, { set: { reached_walls: true }, expect: 'at-the-walls' }] }],
};

function stage(doc: RunsDoc, run: RunSpec, { groupId = 'g1', column = 'on' } = {}) {
  const out = mkdtempSync(join(tmpdir(), 'so-integration-'));
  writeFileSync(join(out, 'chats.json'), JSON.stringify({ run: run.id, column, group: run.group, groupId, storyId: run.story, chats: [{ chatId: 'chat-a', primary: true }], touched: [] }), 'utf-8');
  writeFileSync(join(out, 'settings-readback.json'), JSON.stringify({ run: run.id, column, ok: true, problems: [], fallbacksUsed: ['reasoning-effort'] }), 'utf-8');
  return out;
}

function fakeWorld(groupName: string) {
  const fake = fakeSt({ chat: [{ name: 'Adolion Narrator', mes: 'The guild hall is loud.' }] });
  fake.ctx.groups = [{ id: 'g1', name: groupName, members: [] }];
  fake.ctx.chatMetadata.story_orchestrator.stories['adolion-adventurer'].engineHistory = { log: [] };
  fake.ctx.chatMetadata.story_orchestrator.stories['adolion-adventurer'].state = { visitedPath: ['guild-hall'] };
  install(fake);
  return fake;
}

const calls: string[] = [];
const throwingDeps = (): PlayDeps => new Proxy({} as PlayDeps, { get: (_target, key) => async () => { calls.push(String(key)); throw new Error(`dependency ${String(key)} must not be reached`); } });

test('play refuses when the open group is not the run\'s group, before any tail, turn or write', async () => {
  const doc = loadDoc();
  const run = tinyRun(doc);
  const out = stage(doc, run);
  fakeWorld('Adolion - House Nightriver');
  calls.length = 0;
  await assert.rejects(playRun(fakePage(), { doc, run, column: 'on', out, routes: tinyRoutes, deps: throwingDeps() }), /the open group is "Adolion - House Nightriver", not the run's group "Adolion - The Adventurer's Road"/);
  assert.deepEqual(calls, []);
  assert.equal(existsSync(join(out, 'turns.jsonl')), false);
});

test('preconditions: no chats.json, a different column, a non-fresh chat and an unread settings file each refuse', () => {
  const doc = loadDoc();
  const run = tinyRun(doc);
  const read = { chatId: 'chat-a', groupId: 'g1', groupName: run.group, storyId: run.story, activeCheckpointId: 'guild-hall', activeCheckpointName: 'The Guild Hall', userMessages: 0, blackboard: {} };
  const chats = { run: run.id, column: 'on', groupId: 'g1', chats: [{ chatId: 'chat-a', primary: true }] };
  const readback = { column: 'on', ok: true };
  assert.deepEqual(checkPreconditions(read, chats, readback, run, 'on', false), []);
  assert.match(checkPreconditions(read, null, readback, run, 'on', false)[0], /no chats.json/);
  assert.match(checkPreconditions(read, chats, { column: 'defaults', ok: true }, run, 'on', false).join('\n'), /applied for column defaults/);
  assert.match(checkPreconditions({ ...read, userMessages: 2 }, chats, readback, run, 'on', false).join('\n'), /not fresh \(2 player/);
  assert.match(checkPreconditions(read, chats, null, run, 'on', false).join('\n'), /no settings-readback/);
  assert.match(checkPreconditions({ ...read, storyId: 'adolion-saga' }, chats, readback, run, 'on', false).join('\n'), /plays adolion-saga, not adolion-adventurer/);
  assert.match(checkPreconditions({ ...read, groupId: 'g9' }, chats, readback, run, 'on', false).join('\n'), /open group id g9/);
});

test('play drives the route on a fake page: played and forced steps, a reopen cut, every export written, and the run verifies', async () => {
  const doc = loadDoc();
  const run = tinyRun(doc);
  const out = stage(doc, run);
  const fake = fakeWorld(run.group!);
  const { ctx, state, events } = fake;
  const advance: Record<number, string> = { 1: 'road-to-wendhope' };
  let sends = 0;
  let reloads = 0;
  let tailsStopped = false;
  const deps: PlayDeps = {
    send: async (_page, line) => {
      sends += 1;
      ctx.chat.push({ name: 'You', is_user: true, mes: line });
      await events.emit(EVENT_TYPES.GENERATION_STARTED, 'normal', {}, false);
      ctx.chat.push({ name: 'Adolion Narrator', mes: `reply ${sends}` });
      await events.emit(EVENT_TYPES.MESSAGE_RECEIVED, ctx.chat.length - 1, 'normal');
      if (advance[sends]) state.snapshot = { ...state.snapshot, activeCheckpointId: advance[sends], activeCheckpointName: advance[sends], boundary: state.snapshot.boundary + 1 };
      if (state.snapshot.blackboard.reached_walls === 'true') state.snapshot = { ...state.snapshot, activeCheckpointId: 'at-the-walls' };
      return { replied: true };
    },
    waitIdle: async () => undefined,
    waitScheduler: async () => ({ quietMs: 0 }),
    startSend: async () => undefined,
    waitGenerating: async () => true,
    clickSwipeRight: async () => undefined,
    ...clearPage,
    openChat: async () => undefined,
    reload: async () => { reloads += 1; },
    now: () => Date.now(),
    spawnTails: async () => ({ stop: async () => { tailsStopped = true; } }),
    settleChat: async () => undefined,
    captureEvidence: async () => ({ capturedAt: 'now', chatId: 'chat-a', slices: { chat: [] }, unread: {} }),
    evidenceProblems: () => [],
    readJournal: async () => ({ chatId: 'chat-a', events: [{ kind: 'transition' }] }),
    sleep: async () => undefined,
  };
  (fake.runtime as any).setQuality = async (key: string, value: string) => { state.snapshot = { ...state.snapshot, blackboard: { ...state.snapshot.blackboard, [key]: value } }; };
  (fake.runtime as any).activateCheckpoint = async (id: string) => { state.snapshot = { ...state.snapshot, activeCheckpointId: id }; };
  const report = await playRun(fakePage(), { doc, run, column: 'on', out, routes: tinyRoutes, deps });
  const rows = readFileSync(join(out, 'turns.jsonl'), 'utf-8').trim().split('\n').map((line) => JSON.parse(line));
  const steps = rows.filter((row) => row.kind === 'step');
  assert.deepEqual(steps.map((row) => [row.expect, row.outcome]), [['road-to-wendhope', 'played'], ['at-the-walls', 'forced']]);
  assert.equal(rows.filter((row) => row.kind === 'turn').length, 4);
  const reopen = readFileSync(join(out, 'reopen.jsonl'), 'utf-8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(reopen.length, 1);
  assert.equal(reopen[0].afterStep, 0);
  assert.deepEqual(reopen[0].diff, []);
  assert.equal(reloads, 1);
  assert.equal(tailsStopped, true);
  for (const file of ['evidence-chat-a.json', 'journal-chat-a.json', 'engine-history-chat-a.json', 'findings.json']) assert.ok(existsSync(join(out, file)), file);
  assert.ok(report.findings.some((finding) => /at-the-walls\) forced/.test(finding.problem)));
  for (const [name, text] of [['run-header-start.json', '{"label":"x"}'], ['run-header-end.json', '{"label":"y"}'], ['run-header-diff.txt', 'ok\n'], ['journal.jsonl', '{"k":1}\n'], ['payloads.jsonl', '{"i":1}\n']]) writeFileSync(join(out, name), text, 'utf-8');
  const verdict = verifyRun(out, run, doc) as { problems: string[]; forced: number };
  assert.deepEqual(verdict.problems, []);
  assert.equal(verdict.forced, 1);
});

test('play cuts the memory model through page.route during its window only, never the main reply, and records each cut', async () => {
  const doc = loadDoc();
  const run: RunSpec = {
    ...runById(doc, 'I5')!,
    route: { file: 'tests/routes-adventurer.json', name: 'tiny', from: 0, to: 1, throughExpect: 'road-to-wendhope' },
    drive: { mode: 'turns', turns: 4, turnsPerStep: 1, maxForcedShare: 1 },
    outages: [{ service: 'memory', fromTurn: 2, toTurn: 3, exercisable: true }, { service: 'gpu', fromTurn: 4, toTurn: 4, exercisable: false, why: 'images off' }],
  };
  const out = stage(doc, run);
  const fake = fakeWorld(run.group!);
  fake.ctx.extensionSettings = {
    connectionManager: { selectedProfile: 'main', profiles: [{ id: 'main', 'api-url': 'http://127.0.0.1:18080' }, { id: 'mem', 'api-url': 'http://127.0.0.1:18081' }] },
    'story-orchestrator': { settings: { extraction: { profileId: 'mem' } } },
  };
  let handler: any = null;
  const outcomes: Array<{ turn: number; kind: string; result: string }> = [];
  const page = fakePage({ route: async (_pattern: string, fn: any) => { handler = fn; }, unroute: async () => { handler = null; } });
  const request = (server: string) => ({ request: () => ({ url: () => 'http://127.0.0.1:8102/api/backends/text-completions/generate', method: () => 'POST', postData: () => JSON.stringify({ api_server: server }) }) });
  let sends = 0;
  const deps: PlayDeps = {
    send: async (_page, line) => {
      sends += 1;
      for (const [kind, server] of [['main', 'http://127.0.0.1:18080'], ['memory', 'http://127.0.0.1:18081']]) {
        let result = 'none';
        await handler({ ...request(server), abort: async () => { result = 'aborted'; }, fallback: async () => { result = 'passed'; } });
        outcomes.push({ turn: sends, kind, result });
      }
      fake.ctx.chat.push({ name: 'You', is_user: true, mes: line }, { name: 'Adolion Narrator', mes: `reply ${sends}` });
      fake.state.snapshot = { ...fake.state.snapshot, activeCheckpointId: 'road-to-wendhope' };
      return { replied: true };
    },
    waitIdle: async () => undefined, waitScheduler: async () => ({ quietMs: 0 }), startSend: async () => undefined, waitGenerating: async () => true,
    clickSwipeRight: async () => undefined, ...clearPage, openChat: async () => undefined, reload: async () => undefined, now: () => Date.now(),
    spawnTails: async () => ({ stop: async () => undefined }), settleChat: async () => undefined,
    captureEvidence: async () => ({ slices: {} }), evidenceProblems: () => [], readJournal: async () => ({ events: [] }), sleep: async () => undefined,
  };
  await playRun(page, { doc, run, column: 'on', out, routes: tinyRoutes, deps });
  assert.equal(handler, null);
  assert.deepEqual(outcomes.filter((row) => row.result === 'aborted').map((row) => [row.turn, row.kind]), [[2, 'memory'], [3, 'memory']]);
  assert.ok(outcomes.filter((row) => row.kind === 'main').every((row) => row.result === 'passed'));
  const cuts = readFileSync(join(out, 'outages.jsonl'), 'utf-8').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(cuts.map((row) => [row.service, row.aborted, row.status]), [['memory', 2, 'cut'], ['gpu', 0, 'unexercised']]);
});

test('play refuses an outage run whose memory profile shares the main reply endpoint', async () => {
  const doc = loadDoc();
  const run = { ...runById(doc, 'I5')!, route: tinyRun(doc).route };
  const out = stage(doc, run);
  const fake = fakeWorld(run.group!);
  fake.ctx.extensionSettings = {
    connectionManager: { selectedProfile: 'main', profiles: [{ id: 'main', name: 'Artemis RunPod RP', mode: 'tc', api: 'textgenerationwebui', 'api-url': 'http://127.0.0.1:18080' }] },
    'story-orchestrator': { settings: { extraction: { profileId: 'main' } } },
  };
  calls.length = 0;
  await assert.rejects(playRun(fakePage(), { doc, run, column: 'on', out, routes: tinyRoutes, deps: throwingDeps() }), /share one endpoint and source/);
  assert.deepEqual(calls, []);
});

test('loadFrozen refuses to validate on a tampered route blob (git read injected)', async () => {
  const frozen = await loadFrozen({ show: (_repo, _commit, file) => Buffer.from(`[] ${file}`) });
  assert.equal(frozen.frozen, false);
  assert.equal(frozen.problems.length, 3);
  assert.ok(frozen.problems.every((problem) => /refusing to run on changed inputs/.test(problem)));
});
