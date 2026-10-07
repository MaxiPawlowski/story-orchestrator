import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  activeOutages, columnSettings, diffReopen, freezeCheck, outageMatcher, outagePreflight, parseRouteBlobs, profileSignature, readbackProblems, renderPlan, routeSlice,
  runById, sha256, splitBulkyEvidence, stepReached, validateRuns, verifyArtifacts, verifyRun, type RouteDoc, type RunsDoc, type StoryIndexLike,
} from './integrationRuns.mts';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const loadDoc = (): RunsDoc => JSON.parse(readFileSync(join(ROOT, 'test', 'measurements', 'v2.6-09', 'runs.json'), 'utf-8'));
const DEEPSEEK = profileSignature({ name: 'DeepSeek flash', mode: 'cc', api: 'deepseek', model: 'deepseek-chat' })!;
const ARTEMIS = profileSignature({ name: 'Artemis RunPod RP', mode: 'tc', api: 'textgenerationwebui', 'api-url': 'http://127.0.0.1:18080' })!;
const loadIndex = (): StoryIndexLike => JSON.parse(readFileSync(join(ROOT, 'test', 'sessions', 'adolion-stories.json'), 'utf-8'));

function syntheticRoutes(doc: RunsDoc, index: StoryIndexLike): Record<string, RouteDoc[]> {
  const routes: Record<string, RouteDoc[]> = {};
  for (const run of doc.runs) {
    if (!run.route || !run.story) continue;
    const story = index.stories[run.story] as any;
    const steps = Array.from({ length: run.route.to }, (_, at) => ({ set: { step: at }, expect: at === run.route!.to - 1 ? run.route!.throughExpect ?? story.start : story.start }));
    (routes[run.route.file] ||= []).push({ story: run.story, name: run.route.name, steps });
  }
  return routes;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

test('the frozen runs file validates against the story index (synthetic routes shaped like the declared slices)', () => {
  const doc = loadDoc();
  const index = loadIndex();
  assert.deepEqual(validateRuns(doc, index, syntheticRoutes(doc, index)), []);
});

test('the real pinned route blobs match their frozen sha256 and validate (required with SO_PHASE_C=1, skipped otherwise when the campaign repo is absent)', (t) => {
  const doc = loadDoc();
  const blobs: Record<string, Buffer | null> = {};
  for (const file of Object.keys(doc.campaign.routes)) {
    try { blobs[file] = execFileSync('git', ['-C', doc.campaign.repo, 'show', `${doc.campaign.commit}:${file}`], { stdio: ['ignore', 'pipe', 'ignore'] }); } catch { blobs[file] = null; }
  }
  const unreadable = Object.keys(blobs).filter((file) => blobs[file] === null);
  if (unreadable.length) {
    const reason = `campaign checkout ${doc.campaign.repo} at ${doc.campaign.commit} cannot show ${unreadable.join(', ')}`;
    assert.notEqual(process.env.SO_PHASE_C, '1', `SO_PHASE_C=1 needs the frozen route blobs: ${reason}`);
    t.diagnostic(reason);
    t.skip(`${reason} (set SO_PHASE_C=1 to require it)`);
    return;
  }
  assert.deepEqual(freezeCheck(doc, blobs), []);
  assert.deepEqual(validateRuns(doc, loadIndex(), parseRouteBlobs(blobs)), []);
});

test('negative control: a run missing a required artifact fails validation', () => {
  const doc = loadDoc();
  const index = loadIndex();
  const broken = clone(doc);
  runById(broken, 'I1')!.artifacts = runById(broken, 'I1')!.artifacts.filter((id) => id !== 'payloads');
  const problems = validateRuns(broken, index, syntheticRoutes(doc, index));
  assert.ok(problems.some((problem) => /run I1 is missing required artifact payloads/.test(problem)), problems.join('\n'));
});

test('negative control: a route checkpoint absent from the story index fails validation', () => {
  const doc = loadDoc();
  const index = loadIndex();
  const routes = syntheticRoutes(doc, index);
  routes['tests/routes-academy.json'].find((route) => route.name === 'refuse, retake, survived, trail')!.steps[2].expect = 'no-such-checkpoint';
  const problems = validateRuns(doc, index, routes);
  assert.ok(problems.some((problem) => /run I2 route step 2 expects no-such-checkpoint/.test(problem)), problems.join('\n'));
});

test('negative controls: run shape (tier, both columns, command plan, I4 verbs, I5 services, I6 cuts, slice end)', () => {
  const doc = loadDoc();
  const index = loadIndex();
  const routes = syntheticRoutes(doc, index);
  const broken = clone(doc);
  runById(broken, 'I3')!.tier = 'T6';
  runById(broken, 'I3')!.columns = ['on'];
  runById(broken, 'I3')!.commands = ['seed', 'play'];
  runById(broken, 'I4')!.mutations = runById(broken, 'I4')!.mutations!.filter((mutation) => mutation.verb !== 'reload-mid-gen');
  runById(broken, 'I5')!.outages = runById(broken, 'I5')!.outages!.filter((outage) => outage.service !== 'gpu');
  runById(broken, 'I2')!.cuts = [1, 4];
  runById(broken, 'I1')!.route!.throughExpect = 'the-devourer';
  const problems = validateRuns(broken, index, routes).join('\n');
  for (const wanted of [/run I3 tier is T6/, /run I3 does not run column defaults/, /run I3 command plan does not end with verify/, /run I3 command plan is missing settings/,
    /run I4 mutation schedule never uses reload-mid-gen/, /run I5 cuts gpu 0 time/, /run I6: I2 declares 2 cut points/, /run I1: .*not the declared the-devourer/]) {
    assert.match(problems, wanted);
  }
});

test('negative control: a tampered route blob refuses (sha256 differs from the frozen value)', () => {
  const doc = loadDoc();
  const blob = Buffer.from('[{"story":"adolion-adventurer","name":"x","steps":[]}]');
  const frozen = clone(doc);
  frozen.campaign.routes = { 'tests/routes-adventurer.json': sha256(blob) };
  assert.deepEqual(freezeCheck(frozen, { 'tests/routes-adventurer.json': blob }), []);
  const tampered = Buffer.from(blob.toString().replace('"x"', '"y"'));
  const problems = freezeCheck(frozen, { 'tests/routes-adventurer.json': tampered });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /refusing to run on changed inputs/);
  assert.match(freezeCheck(frozen, { 'tests/routes-adventurer.json': null })[0], /could not be read/);
});

test('reopen diff: identical states are empty, volatile stamps are ignored, one changed field is reported by name', () => {
  const state = {
    engine: { activeCheckpointId: 'first-night', boundary: 9, blackboard: { evidence: 2 }, visitedPath: ['guild-hall', 'first-night'] },
    wi: { gating: { active: true, at: '2026-10-01T00:00:00Z' }, scanGate: { entries: 3 } },
    sampler: { armed: true, checkpointId: 'first-night' }, sprites: null, timeline: { items: [{ messageId: 4, category: 'progress' }] },
  };
  assert.deepEqual(diffReopen(state, clone(state)), []);
  const stamped = clone(state);
  stamped.wi.gating.at = '2026-10-01T00:05:00Z';
  assert.deepEqual(diffReopen(state, stamped), []);
  const reopened = clone(state);
  reopened.sampler.armed = false;
  const diff = diffReopen(state, reopened);
  assert.equal(diff.length, 1);
  assert.deepEqual(diff[0], { field: 'sampler', path: 'sampler.armed', from: true, to: false });
});

test('outage matcher: cutting the memory model aborts its request and never the main reply; the judge is untouched outside its window', () => {
  const doc = loadDoc();
  const run = runById(doc, 'I5')!;
  const context = { memory: [DEEPSEEK], main: ARTEMIS };
  let turn = 7;
  const match = outageMatcher(doc, () => activeOutages(run, turn), context);
  const memoryRequest = { url: 'http://127.0.0.1:8102/api/backends/chat-completions/generate', method: 'POST', postData: JSON.stringify({ chat_completion_source: 'deepseek', model: 'deepseek-chat', messages: [] }) };
  const mainRequest = { url: 'http://127.0.0.1:8102/api/backends/text-completions/generate', method: 'POST', postData: JSON.stringify({ api_server: 'http://127.0.0.1:18080', prompt: 'reply' }) };
  const judgeRequest = { url: 'http://127.0.0.1:8102/api/plugins/story-orchestrator-judge/ask', method: 'POST', postData: '{}' };
  assert.deepEqual(match(memoryRequest), { abort: true, service: 'memory' });
  assert.deepEqual(match(mainRequest), { abort: false, service: null });
  assert.deepEqual(match(judgeRequest), { abort: false, service: null });
  turn = 15;
  assert.deepEqual(match(judgeRequest), { abort: true, service: 'judge' });
  assert.deepEqual(match(memoryRequest), { abort: false, service: null });
  turn = 12;
  assert.deepEqual(match(memoryRequest), { abort: false, service: null });
});

test('outage preflight: DeepSeek vs Artemis passes; a lane where both really share source and endpoint is refused', () => {
  const run = runById(loadDoc(), 'I5')!;
  assert.deepEqual(outagePreflight(run, { memory: [DEEPSEEK], main: ARTEMIS }), []);
  const artemisMemory = profileSignature({ name: 'Story Orchestrator Memory RunPod', mode: 'tc', api: 'textgenerationwebui', 'api-url': 'http://127.0.0.1:18080/' })!;
  assert.match(outagePreflight(run, { memory: [artemisMemory], main: ARTEMIS })[0], /share/);
  const deepseekMain = profileSignature({ name: 'DeepSeek main', mode: 'cc', api: 'deepseek', model: 'deepseek-chat' })!;
  assert.match(outagePreflight(run, { memory: [DEEPSEEK], main: deepseekMain })[0], /share/);
  assert.match(outagePreflight(run, { memory: [], main: ARTEMIS })[0], /cannot be scoped/);
  assert.match(outagePreflight(run, { memory: [DEEPSEEK], main: null })[0], /main reply profile/);
});

test('negative control: a memory cut never aborts a main-profile request even when the URL rule matches it', () => {
  const doc = loadDoc();
  const run = runById(doc, 'I5')!;
  const match = outageMatcher(doc, () => activeOutages(run, 7), { memory: [DEEPSEEK, ARTEMIS], main: ARTEMIS });
  const mainRequest = { url: 'http://x/api/backends/text-completions/generate', postData: JSON.stringify({ api_server: 'http://127.0.0.1:18080' }) };
  assert.deepEqual(match(mainRequest), { abort: false, service: null });
  const otherModel = { url: 'http://x/api/backends/chat-completions/generate', postData: JSON.stringify({ chat_completion_source: 'openrouter', model: 'x' }) };
  assert.deepEqual(match(otherModel), { abort: false, service: null });
});

test('columns: the on column runs without --accept-fallback (T7 wave C resolved its four settings); a pending one still refuses; both columns force images and sprites off', () => {
  const doc = loadDoc();
  const on = columnSettings(doc, 'on');
  assert.equal(on.refusal, null);
  assert.deepEqual(on.fallbacksUsed, []);
  for (const resolution of doc.columns.on.resolutions ?? []) assert.match(String((resolution as { resolvedFrom?: string }).resolvedFrom), /T7 wave C/, `${resolution.id} names where it was resolved from`);
  assert.equal(on.patch!.spikes, undefined, 'SP5.b and SP8.b ship without a flag (v2.7 02 C1, C13), so the on column writes no spike');
  assert.equal(on.patch!.stagecraft.acceptMode, 'auto');
  assert.equal(on.patch!.image.enabled, false);
  assert.deepEqual(readbackProblems(on.patch, {}, Object.fromEntries(Object.entries(doc.columns.on.readback ?? {}).filter(([path]) => path !== 'worldInfo.gatingMode'))), [], 'the on readback expects exactly what the patch writes (gating mode goes through the confirm, not the patch)');
  const pending = { ...doc, columns: { ...doc.columns, on: { ...doc.columns.on, resolutions: [{ ...doc.columns.on.resolutions![0], status: 'pending' as const }] } } };
  assert.match(String(columnSettings(pending, 'on').refusal), /reasoning-effort/);
  assert.deepEqual(columnSettings(pending, 'on', { acceptFallback: true }).fallbacksUsed, ['reasoning-effort']);
  const defaults = columnSettings(doc, 'defaults');
  assert.equal(defaults.refusal, null);
  assert.deepEqual(defaults.patch, { image: { enabled: false }, sprites: { enabled: false, explicit: true } });
});

test('read-back: a setting that did not land is named; an absent optional reads as null', () => {
  const expect = { 'stagecraft.acceptMode': 'auto', 'memory.innerBeat': null };
  assert.deepEqual(readbackProblems({ stagecraft: { acceptMode: 'auto' }, memory: {} }, {}, expect), []);
  const problems = readbackProblems({ stagecraft: { acceptMode: 'review' }, memory: { innerBeat: true } }, {}, expect);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /stagecraft.acceptMode: effective "review", expected "auto"/);
});

test('step reached: a new checkpoint is reached on arrival; a repeated checkpoint needs its set values', () => {
  const step = { set: { evidence: 3 }, expect: 'the-lord-spirit' };
  assert.equal(stepReached({ activeCheckpointId: 'the-lord-spirit', blackboard: {} }, step, 'into-needlehaven'), true);
  assert.equal(stepReached({ activeCheckpointId: 'the-lord-spirit', blackboard: { evidence: 2 } }, step, 'the-lord-spirit'), false);
  assert.equal(stepReached({ activeCheckpointId: 'the-lord-spirit', blackboard: { evidence: 3 } }, step, 'the-lord-spirit'), true);
  assert.equal(stepReached({ activeCheckpointId: 'first-night', blackboard: {} }, step, null), false);
});

test('plan: lanes 1+ only, every command in order, the run header diffed around the play', () => {
  const doc = loadDoc();
  assert.throws(() => renderPlan(doc, 'I1', 'on', 0), /lanes 1\+/);
  const lines = renderPlan(doc, 'I2', 'defaults', 4);
  assert.equal(lines.length, 8);
  assert.match(lines[0], /adolion-fresh\.mts seed 4/);
  assert.match(lines[1], /st-lanes\.mts start 4 --headed/);
  assert.match(lines[2], /so-integration\.mts settings I2 --column defaults/);
  assert.match(lines[4], /so-run-header\.mts capture/);
  assert.match(lines[5], /so-integration\.mts play I2/);
  assert.match(lines[6], /so-run-header\.mts diff .*run-header-diff\.txt/);
  assert.match(lines[7], /verify .*I2-defaults-r1 I2/);
  assert.ok(renderPlan(doc, 'I6', 'on', 1).some((line) => /verify test\/measurements\/v2\.6-09\/out I6/.test(line)));
});

test('route slice: an out-of-range slice is refused', () => {
  const routes = { 'f.json': [{ story: 's', name: 'r', steps: [{ expect: 'a' }, { expect: 'b' }] }] };
  assert.match(routeSlice(routes, { file: 'f.json', name: 'r', from: 0, to: 3 }).problems[0], /outside its 2 steps/);
  assert.match(routeSlice(routes, { file: 'f.json', name: 'zz', from: 0, to: 1 }).problems[0], /not in f.json/);
});

function completeDir(doc: RunsDoc, runId: string, mutate: (dir: string) => void = () => undefined) {
  const dir = mkdtempSync(join(tmpdir(), 'so-int-'));
  const run = runById(doc, runId)!;
  const w = (name: string, text: string) => writeFileSync(join(dir, name), text, 'utf-8');
  w('chats.json', JSON.stringify({ run: run.id, column: 'on', chats: [{ chatId: 'c1', primary: true }], touched: ['c1'] }));
  for (const id of run.artifacts) {
    const spec = doc.artifacts[id];
    if (spec.file === 'chats.json') continue;
    const name = spec.file.replace('{chat}', 'c1');
    if (spec.kind === 'text') w(name, 'no blocking differences\n');
    else if (spec.kind === 'json') w(name, JSON.stringify({ ok: true }));
  }
  const steps = Array.from({ length: 4 }, (_, at) => JSON.stringify({ seq: at + 1, kind: 'step', stepIndex: at, expect: `cp${at}`, outcome: 'played' }));
  w('turns.jsonl', `${JSON.stringify({ seq: 0, kind: 'turn' })}\n${steps.join('\n')}\n`);
  w('journal.jsonl', '{"kind":"boundary"}\n');
  w('payloads.jsonl', '{"index":1}\n');
  if (run.artifacts.includes('reopen')) w('reopen.jsonl', `${(run.cuts ?? []).map((cut) => JSON.stringify({ afterStep: cut, diff: [] })).join('\n')}\n`);
  if (run.artifacts.includes('outages')) w('outages.jsonl', `${(run.outages ?? []).map((outage) => JSON.stringify({ service: outage.service, fromTurn: outage.fromTurn, aborted: outage.exercisable ? 2 : 0 })).join('\n')}\n`);
  mutate(dir);
  return dir;
}

test('verify: a complete artifact set passes (positive control for the negatives below)', () => {
  const doc = loadDoc();
  const result = verifyRun(completeDir(doc, 'I1'), runById(doc, 'I1')!, doc);
  assert.deepEqual(result.problems, []);
  assert.equal(result.ok, true);
});

test('negative control: an empty payloads.jsonl fails verify (zero rows is no evidence)', () => {
  const doc = loadDoc();
  const dir = completeDir(doc, 'I1', (at) => writeFileSync(join(at, 'payloads.jsonl'), '', 'utf-8'));
  const problems = verifyArtifacts(dir, runById(doc, 'I1')!, doc);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /payloads: .*payloads\.jsonl is empty/);
  const blank = completeDir(doc, 'I1', (at) => writeFileSync(join(at, 'payloads.jsonl'), '\n\n', 'utf-8'));
  assert.match(verifyArtifacts(blank, runById(doc, 'I1')!, doc)[0], /payloads\.jsonl is empty/);
});

test('negative controls: a missing per-chat export, an empty findings object, forced steps above the max, a reopen diff, a vacuous outage', () => {
  const doc = loadDoc();
  const missing = completeDir(doc, 'I1', (at) => writeFileSync(join(at, 'chats.json'), JSON.stringify({ chats: [{ chatId: 'c1', primary: true }], touched: ['c1', 'c2'] }), 'utf-8'));
  assert.ok(verifyRun(missing, runById(doc, 'I1')!, doc).problems.some((problem) => /engine-history-c2\.json is missing/.test(problem)));
  const hollow = completeDir(doc, 'I1', (at) => writeFileSync(join(at, 'findings.json'), '{}', 'utf-8'));
  assert.ok(verifyRun(hollow, runById(doc, 'I1')!, doc).problems.some((problem) => /findings\.json holds no content/.test(problem)));
  const forced = completeDir(doc, 'I1', (at) => writeFileSync(join(at, 'turns.jsonl'), `${[0, 1, 2, 3].map((i) => JSON.stringify({ kind: 'step', stepIndex: i, expect: 'x', outcome: i ? 'forced' : 'played' })).join('\n')}\n`, 'utf-8'));
  assert.ok(verifyRun(forced, runById(doc, 'I1')!, doc).problems.some((problem) => /3 of 4 route steps were forced/.test(problem)));
  const drifted = completeDir(doc, 'I1', (at) => writeFileSync(join(at, 'reopen.jsonl'), `${[3, 8, 13].map((cut) => JSON.stringify({ afterStep: cut, diff: cut === 8 ? [{ field: 'timeline', path: 'timeline.items[0].category', from: 'progress', to: 'lore' }] : [] })).join('\n')}\n`, 'utf-8'));
  assert.ok(verifyRun(drifted, runById(doc, 'I1')!, doc).problems.some((problem) => /reopen after step 8 differs from continuous play: timeline\.items\[0\]\.category/.test(problem)));
  const vacuous = completeDir(doc, 'I5', (at) => writeFileSync(join(at, 'outages.jsonl'), `${runById(doc, 'I5')!.outages!.map((outage) => JSON.stringify({ service: outage.service, fromTurn: outage.fromTurn, aborted: outage.service === 'judge' ? 0 : 1 })).join('\n')}\n`, 'utf-8'));
  const problems = verifyRun(vacuous, runById(doc, 'I5')!, doc).problems;
  assert.ok(problems.some((problem) => /judge cut at turn 14 aborted nothing/.test(problem)), problems.join('\n'));
  assert.ok(!problems.some((problem) => /gpu cut/.test(problem)), 'the declared-unexercisable gpu cut is recorded, not failed');
});

test('negative control: I4 verify names a mutation that was never performed and a write in the never-played chat', () => {
  const doc = loadDoc();
  const dir = completeDir(doc, 'I4', (at) => {
    writeFileSync(join(at, 'chats.json'), JSON.stringify({ chats: [{ chatId: 'c2', primary: false }, { chatId: 'c1', primary: true }], touched: ['c1', 'c2'] }), 'utf-8');
    for (const chat of ['c1', 'c2']) for (const kind of ['journal', 'evidence']) writeFileSync(join(at, `${kind}-${chat}.json`), '{"ok":true}', 'utf-8');
    writeFileSync(join(at, 'engine-history-c1.json'), JSON.stringify({ engineHistory: { log: [{ boundary: 1 }] } }), 'utf-8');
    writeFileSync(join(at, 'engine-history-c2.json'), JSON.stringify({ engineHistory: { log: [{ boundary: 1 }] } }), 'utf-8');
    writeFileSync(join(at, 'turns.jsonl'), `${['swipe-new', 'regen', 'edit', 'delete', 'switch-chat-mid-gen'].map((verb) => JSON.stringify({ kind: 'mutation', verb })).join('\n')}\n`, 'utf-8');
  });
  const problems = verifyRun(dir, runById(doc, 'I4')!, doc).problems;
  assert.ok(problems.some((problem) => /mutation reload-mid-gen was never performed/.test(problem)), problems.join('\n'));
  assert.ok(problems.some((problem) => /never-played chat c2 holds 1 boundary/.test(problem)), problems.join('\n'));
});

test('I6 verify reads the reopen rows of I1-I3 and fails on a missing host or a non-empty diff', () => {
  const doc = loadDoc();
  const root = mkdtempSync(join(tmpdir(), 'so-int-i6-'));
  const write = (host: string, rows: object[]) => {
    const dir = join(root, `${host}-on-r1`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'reopen.jsonl'), `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf-8');
  };
  for (const host of ['I1', 'I2', 'I3']) write(host, runById(doc, host)!.cuts!.map((cut) => ({ afterStep: cut, diff: [] })));
  assert.equal(verifyRun(root, runById(doc, 'I6')!, doc, { column: 'on' }).ok, true);
  write('I3', [{ afterStep: 7, diff: [] }, { afterStep: 15, diff: [{ field: 'engine.boundary', path: 'engine.boundary', from: 40, to: 39 }] }]);
  const problems = verifyRun(root, runById(doc, 'I6')!, doc, { column: 'on' }).problems.join('\n');
  assert.match(problems, /I3: no reopen row for the cut after step 21/);
  assert.match(problems, /I3: reopen after step 15 differs: engine\.boundary/);
  assert.match(verifyRun(root, runById(doc, 'I6')!, doc, { column: 'defaults' }).problems.join('\n'), /I1: reopen\.jsonl is missing/);
});

test('bulky evidence: over 1 MB the full chat goes to a gitignored .full.json and the committed file keeps a hash summary', () => {
  const small = { slices: { chat: [{ id: 0, text: 'hi' }], memory: {} } };
  assert.deepEqual(splitBulkyEvidence(small, 'c1'), { committed: JSON.stringify(small, null, 1), full: null });
  const big = { slices: { chat: Array.from({ length: 3 }, (_, id) => ({ id, text: 'x'.repeat(400) })), memory: { rows: 1 } } };
  const split = splitBulkyEvidence(big, 'c1', 1000);
  assert.equal(split.full?.file, 'evidence-c1.full.json');
  assert.equal(split.full?.text, JSON.stringify(big, null, 1));
  const committed = JSON.parse(split.committed);
  assert.deepEqual(committed.slices.memory, { rows: 1 });
  assert.equal(committed.slices.chat.omitted, true);
  assert.equal(committed.slices.chat.messages, 3);
  assert.equal(committed.slices.chat.sha256, sha256(split.full!.text));
});
