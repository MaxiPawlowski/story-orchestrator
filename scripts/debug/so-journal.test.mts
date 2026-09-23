// v2.3 plan 01 §A0: the P0 record is only as good as this tail. If `follow` re-emits on every
// poll, the record is unreadable; if it dedupes across a chat switch, the record is wrong. Both
// are driven here against a fake ST page — the same closure the real script sends into the browser.

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { followSessionJournal } from './so-journal.mts';

// The page closure runs against `SillyTavern.getContext()` and `globalThis.storyOrchestratorRuntime`.
// A fake page just calls it in this process, so the globals below are the whole ST surface it uses.
const world: any = { chatId: 'chat-a', groupId: 'g1', chat: [], events: [], audits: [], storyId: 'adolion-adventurer' };

const fakePage = {
  evaluate: async (fn: any, arg: any) => fn(arg),
};

beforeEach(() => {
  world.chatId = 'chat-a';
  world.groupId = 'g1';
  world.storyId = 'adolion-adventurer';
  world.chat = [];
  world.events = [];
  world.audits = [];
  (globalThis as any).SillyTavern = {
    getContext: () => ({
      chatId: world.chatId,
      groupId: world.groupId,
      chat: world.chat,
      chatMetadata: { story_orchestrator: { selectedStoryId: world.storyId, stories: { [world.storyId]: { extras: { extraction: { audits: world.audits } } } } } },
    }),
  };
  (globalThis as any).storyOrchestratorRuntime = {
    getSessionJournal: () => world.events,
    getSnapshot: () => ({ activeCheckpointId: 'guild-hall', activeCheckpointName: 'The Guild Hall', boundary: world.events.length }),
  };
});

afterEach(() => {
  delete (globalThis as any).SillyTavern;
  delete (globalThis as any).storyOrchestratorRuntime;
});

const event = (at: string, kind: string, summary: string) => ({ at, kind, boundary: 1, messageId: 2, summary });

// Run the tail for a bounded number of polls, mutating the world between them.
async function runTail(steps: Array<() => void>, options: Record<string, unknown> = {}) {
  const lines: any[] = [];
  let poll = 0;
  await followSessionJournal(fakePage, {
    intervalMs: 0,
    onLine: (row: any) => lines.push(row),
    shouldStop: () => {
      if (poll < steps.length) steps[poll++]();
      return poll >= steps.length;
    },
    ...options,
  });
  return lines;
}

test('the first poll emits a session row naming the chat and story', async () => {
  const lines = await runTail([() => {}]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].kind, 'session');
  assert.equal(lines[0].detail.chatId, 'chat-a');
  assert.equal(lines[0].detail.storyId, 'adolion-adventurer');
});

test('an event is emitted once, not on every poll', async () => {
  world.events = [event('2026-09-20T00:00:00Z', 'transition', 'guild-hall → road-to-wendhope')];
  const lines = await runTail([() => {}, () => {}, () => {}]);
  const transitions = lines.filter((line) => line.kind === 'transition');
  assert.equal(transitions.length, 1, 'a re-derived journal must not re-emit what was already recorded');
});

test('new events appear as play continues', async () => {
  world.events = [event('2026-09-20T00:00:00Z', 'boundary', 'boundary 1')];
  const lines = await runTail([
    () => { world.events = [...world.events, event('2026-09-20T00:00:01Z', 'delta', 'path = wendhope')]; },
    () => { world.events = [...world.events, event('2026-09-20T00:00:02Z', 'transition', 'guild-hall → road-to-wendhope')]; },
    () => {},
  ]);
  assert.deepEqual(lines.map((line) => line.kind), ['session', 'boundary', 'delta', 'transition']);
});

test('a chat switch emits a new session row and does not replay the old chat', async () => {
  world.events = [event('2026-09-20T00:00:00Z', 'boundary', 'boundary 1')];
  const lines = await runTail([
    () => {
      world.chatId = 'chat-b';
      world.storyId = 'adolion-academy';
      (globalThis as any).SillyTavern.getContext().chatMetadata.story_orchestrator.stories['adolion-academy'] = { extras: { extraction: { audits: [] } } };
      world.events = [event('2026-09-20T00:00:05Z', 'boundary', 'boundary 1')];
    },
    () => {},
  ]);
  const sessions = lines.filter((line) => line.kind === 'session');
  assert.equal(sessions.length, 2);
  assert.equal(sessions[1].detail.chatId, 'chat-b');
  // The second chat's boundary has the same summary as the first's; it must still be recorded,
  // because it is a different chat's event — the stamp is part of the key.
  assert.equal(lines.filter((line) => line.kind === 'boundary').length, 2);
  assert.deepEqual(lines.filter((line) => line.kind === 'boundary').map((line) => line.chatId), ['chat-a', 'chat-b']);
});

test('an audit is emitted with its window, scope, rejections and raw response', async () => {
  world.audits = [{
    id: 'a1',
    createdAt: '2026-09-20T00:00:03Z',
    reason: 'cadence',
    priority: 0,
    window: { from: 0, to: 6 },
    scope: ['path', 'reached_walls'],
    prompt: 'PROMPT',
    rawResponse: 'DELTA path value=wendhope evidence="I take the job"\nDELTA entered_mines value=true evidence="x"',
    acceptedDeltas: [{ delta: { q: 'path', v: 'wendhope' }, evidence: 'I take the job' }],
    rejected: [{ line: 'DELTA entered_mines value=true evidence="x"', reason: 'outside requested scope' }],
  }];
  const lines = await runTail([() => {}]);
  const audit = lines.find((line) => line.kind === 'audit');
  assert.ok(audit, 'the audit ring is the only place the raw response survives');
  assert.equal(audit.detail.reason, 'cadence');
  assert.deepEqual(audit.detail.window, { from: 0, to: 6 });
  assert.deepEqual(audit.detail.scope, ['path', 'reached_walls']);
  assert.deepEqual(audit.detail.accepted, [{ q: 'path', v: 'wendhope', evidence: 'I take the job' }]);
  assert.equal(audit.detail.rejected[0].reason, 'outside requested scope');
  assert.match(audit.detail.rawResponse, /entered_mines/);
});

test('an audit is emitted once even though the ring keeps returning it', async () => {
  world.audits = [{ id: 'a1', createdAt: '2026-09-20T00:00:03Z', reason: 'cadence', window: { from: 0, to: 6 }, scope: [], acceptedDeltas: [], rejected: [] }];
  const lines = await runTail([() => {}, () => {}, () => {}]);
  assert.equal(lines.filter((line) => line.kind === 'audit').length, 1);
});

test('--kind filters events but never the session row', async () => {
  world.events = [event('2026-09-20T00:00:00Z', 'boundary', 'boundary 1'), event('2026-09-20T00:00:01Z', 'delta', 'path = wendhope')];
  const lines = await runTail([() => {}], { kinds: ['delta'] });
  assert.deepEqual(lines.map((line) => line.kind), ['session', 'delta']);
});

test('--no-audits leaves the audit ring alone', async () => {
  world.audits = [{ id: 'a1', createdAt: '2026-09-20T00:00:03Z', reason: 'cadence', window: { from: 0, to: 1 }, scope: [], acceptedDeltas: [], rejected: [] }];
  const lines = await runTail([() => {}], { audits: false });
  assert.equal(lines.filter((line) => line.kind === 'audit').length, 0);
});

test('a destroyed execution context is survived, not fatal', async () => {
  // A reload or chat switch throws out of page.evaluate. A played session does that routinely.
  let calls = 0;
  const flakyPage = {
    evaluate: async (fn: any, arg: any) => {
      calls += 1;
      if (calls === 1) throw new Error('Execution context was destroyed');
      return fn(arg);
    },
  };
  world.events = [event('2026-09-20T00:00:00Z', 'boundary', 'boundary 1')];
  const lines: any[] = [];
  let poll = 0;
  await followSessionJournal(flakyPage, {
    intervalMs: 0,
    onLine: (row: any) => lines.push(row),
    shouldStop: () => (poll += 1) >= 2,
  });
  assert.ok(lines.some((line) => line.kind === 'boundary'), 'the tail must resume after the page comes back');
});

test('--out appends JSONL that parses back to what was printed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'so-journal-'));
  const out = join(dir, 'nested', 'follow.jsonl');
  world.events = [event('2026-09-20T00:00:00Z', 'boundary', 'boundary 1')];
  try {
    const lines = await runTail([() => {}], { out });
    const written = (await readFile(out, 'utf-8')).trim().split('\n').map((line) => JSON.parse(line));
    assert.deepEqual(written.map((row) => row.kind), lines.map((row) => row.kind));
    assert.equal(written[1].summary, 'boundary 1');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a closed stdout does not truncate the record (EPIPE, found live 2026-09-20)', async () => {
  // `follow | head -3` closed stdout mid-poll; the console.log threw and the tail died before it
  // reached the audit block, so the JSONL lost every audit of that poll without saying so.
  const dir = await mkdtemp(join(tmpdir(), 'so-journal-epipe-'));
  const out = join(dir, 'follow.jsonl');
  world.events = [event('2026-09-20T00:00:00Z', 'boundary', 'boundary 1'), event('2026-09-20T00:00:01Z', 'delta', 'path = wendhope')];
  world.audits = [{ id: 'a1', createdAt: '2026-09-20T00:00:03Z', reason: 'cadence', window: { from: 0, to: 6 }, scope: [], acceptedDeltas: [], rejected: [] }];
  const realLog = console.log;
  console.log = () => { throw Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }); };
  let poll = 0;
  try {
    await followSessionJournal(fakePage, { out, intervalMs: 0, shouldStop: () => (poll += 1) >= 1 });
  } finally {
    console.log = realLog;
  }
  try {
    const rows = (await readFile(out, 'utf-8')).trim().split('\n').map((line) => JSON.parse(line));
    const kinds = rows.map((row) => row.kind);
    assert.ok(kinds.includes('audit'), 'the audit block must still be reached after stdout dies');
    assert.deepEqual(kinds, ['session', 'boundary', 'delta', 'audit']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- Astra review 2026-09-20: mutations that survived the first round. ---

test('two chats producing an identical event still record both (the stamp is load-bearing)', async () => {
  // The earlier switch test passed even with the chat stamp removed from the key, because the two
  // chats' events had different timestamps. Here they are byte-identical, so only the stamp can
  // tell them apart.
  const identical = event('2026-09-20T00:00:00Z', 'boundary', 'boundary 1');
  world.events = [identical];
  const lines = await runTail([
    () => {
      world.chatId = 'chat-b';
      world.storyId = 'adolion-academy';
      (globalThis as any).SillyTavern.getContext().chatMetadata.story_orchestrator.stories['adolion-academy'] = { extras: { extraction: { audits: [] } } };
      world.events = [identical];
    },
    () => {},
  ]);
  assert.deepEqual(lines.filter((line) => line.kind === 'boundary').map((line) => line.chatId), ['chat-a', 'chat-b']);
});

test('the audit row carries the prompt and priority, not only the summary', async () => {
  world.audits = [{
    id: 'a1', createdAt: '2026-09-20T00:00:03Z', reason: 'cadence', priority: 1,
    window: { from: 0, to: 6 }, scope: ['path'], prompt: 'THE PROMPT THAT WAS SENT',
    rawResponse: 'DELTA path value=wendhope evidence="x"', acceptedDeltas: [], rejected: [],
  }];
  const [audit] = (await runTail([() => {}])).filter((line) => line.kind === 'audit');
  assert.equal(audit.detail.prompt, 'THE PROMPT THAT WAS SENT', 'a P0 record has to answer what was asked, not just what came back');
  assert.equal(audit.detail.priority, 1);
  assert.equal(audit.detail.judged, null);
});

test('two accepted deltas for the same quality in one read are both recorded', async () => {
  // These collapse under a key built from at|kind|boundary|messageId|summary alone.
  const same = { at: '2026-09-20T00:00:00Z', kind: 'delta', boundary: 1, messageId: 2, summary: 'path = wendhope' };
  world.events = [{ ...same, detail: { evidence: 'I take the Wendhope job' } }, { ...same, detail: { evidence: 'we ride for Wendhope' } }];
  const deltas = (await runTail([() => {}])).filter((line) => line.kind === 'delta');
  assert.equal(deltas.length, 2, 'distinct evidence for the same delta must not be collapsed');
  assert.notEqual(deltas[0].detail.evidence, deltas[1].detail.evidence);
});
