// v2.3 plan 01 §A0. Two things are under test:
//
// 1. The in-page capture ring's index. It used to be `entries.length`, which collides past the
//    ring cap of 100 — every later capture got index 100, `watch` stopped printing and a persisted
//    record would have lost every turn after the hundredth without saying so.
// 2. The persist drain: it must survive a reload (the globals go with the page), never write the
//    same capture twice, and report anything the ring evicted before it was drained.
//
// Every test arms through the real `armPayloadCapture` against a fake page that runs the closure
// in this process, so what is exercised is the shipped capture path — the fetch patch, the ring
// cap, the index rule — and not a replica of it that could drift.

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { armPayloadCapture, persistPayloads, drainPayloads, watchPayloads } from './st-payload.mts';

const RING = 100;

const fakePage = { evaluate: async (fn: any, arg: any) => fn(arg) };

const realFetch = globalThis.fetch;
const realXHR = globalThis.XMLHttpRequest;

// Stand in for a freshly loaded ST page: unpatched fetch, no capture state, a context whose only
// used surface is the two event subscriptions the arm makes.
function freshPage() {
  delete (globalThis as any).__soDebugPayloads;
  globalThis.fetch = (async () => ({ ok: true })) as any;
  (globalThis as any).SillyTavern = { getContext: () => ({ eventSource: { on: () => {} }, eventTypes: { GROUP_MEMBER_DRAFTED: 'a', GENERATION_ENDED: 'b' } }) };
}

// One captured generation request, through whatever fetch the arm installed.
const generate = (tag: string) => globalThis.fetch('/api/backends/text-completions/generate', { method: 'POST', body: JSON.stringify({ tag }) } as any);
const tags = (rows: any[]) => rows.map((row) => row.parsedBody?.tag ?? JSON.parse(row.body).tag);

beforeEach(async () => {
  freshPage();
  await armPayloadCapture(fakePage);
});

afterEach(() => {
  delete (globalThis as any).__soDebugPayloads;
  delete (globalThis as any).SillyTavern;
  globalThis.fetch = realFetch;
  globalThis.XMLHttpRequest = realXHR;
});

test('arming patches fetch and captures only generation requests', async () => {
  await generate('a');
  await globalThis.fetch('/api/settings/get', { method: 'POST', body: '{}' } as any);
  const state = (globalThis as any).__soDebugPayloads;
  assert.equal(state.entries.length, 1, 'only backend generation calls belong in a payload record');
  assert.match(state.entries[0].url, /\/api\/backends\//);
});

test('capture indices stay unique and monotonic past the ring cap', async () => {
  for (let i = 0; i < RING + 25; i += 1) await generate(`t${i}`);
  const state = (globalThis as any).__soDebugPayloads;
  const indices = state.entries.map((entry: any) => entry.index);
  assert.equal(state.entries.length, RING);
  assert.equal(new Set(indices).size, indices.length, 'every retained capture needs its own index');
  assert.ok(indices.every((value: number, i: number) => i === 0 || value > indices[i - 1]), 'indices must increase');
  assert.equal(indices.at(-1), RING + 24);
});

test('re-arming an already armed page does not double-patch fetch', async () => {
  const again = await armPayloadCapture(fakePage);
  assert.equal(again.alreadyArmed, true);
  await generate('a');
  assert.equal((globalThis as any).__soDebugPayloads.entries.length, 1, 'a double patch would record each request twice');
});

test('drain returns only what is new, with the body parsed', async () => {
  await generate('a');
  await generate('b');
  const first = await drainPayloads(fakePage, 0);
  assert.deepEqual(tags(first.entries), ['a', 'b']);
  assert.equal(first.dropped, 0);
  assert.deepEqual(first.entries[0].parsedBody, { tag: 'a' });

  await generate('c');
  const second = await drainPayloads(fakePage, first.nextIndex);
  assert.deepEqual(tags(second.entries), ['c']);
});

test('drain reports the hole when the ring evicted captures before they were drained', async () => {
  for (let i = 0; i < RING + 10; i += 1) await generate(`t${i}`);
  const frame = await drainPayloads(fakePage, 0);
  assert.equal(frame.dropped, 10, 'a silent hole in a P0 record is worse than a loud one');
  assert.equal(frame.entries.length, RING);
});

test('drain on an unarmed page says so instead of throwing', async () => {
  delete (globalThis as any).__soDebugPayloads;
  const frame = await drainPayloads(fakePage, 0);
  assert.equal(frame.armed, false);
  assert.deepEqual(frame.entries, []);
});

test('persist writes each capture exactly once across polls', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'so-payload-'));
  const out = join(dir, 'nested', 'session.jsonl');
  await generate('a');
  let poll = 0;
  try {
    const result = await persistPayloads(fakePage, {
      out,
      intervalMs: 0,
      shouldStop: () => {
        poll += 1;
        if (poll === 1) void generate('b');
        return poll >= 3;
      },
    });
    const rows = (await readFile(out, 'utf-8')).trim().split('\n').map((line) => JSON.parse(line));
    assert.deepEqual(tags(rows), ['a', 'b']);
    assert.equal(result.written, 2);
    assert.equal(result.dropped, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('persist re-arms after a reload and keeps the new page captures', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'so-payload-'));
  const out = join(dir, 'session.jsonl');
  await generate('before-reload');
  let poll = 0;
  try {
    const result = await persistPayloads(fakePage, {
      out,
      intervalMs: 0,
      shouldStop: () => {
        poll += 1;
        // A reload throws away the capture state and the fetch patch. persistPayloads must notice
        // on its next poll, re-arm, and treat the new page's index 0 as new rather than as a
        // capture it has already written.
        if (poll === 1) freshPage();
        if (poll === 3) void generate('after-reload');
        return poll >= 5;
      },
    });
    const rows = (await readFile(out, 'utf-8')).trim().split('\n').map((row) => JSON.parse(row));
    assert.deepEqual(tags(rows), ['before-reload', 'after-reload'], 'an index restarting at 0 must not look like an already-seen capture');
    assert.equal(result.rearmed, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('persist keeps the drafted member with the request', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'so-payload-'));
  const out = join(dir, 'session.jsonl');
  (globalThis as any).__soDebugPayloads.currentDraftMember = 'Belle';
  await generate('group-turn');
  let poll = 0;
  try {
    await persistPayloads(fakePage, { out, intervalMs: 0, shouldStop: () => (poll += 1) >= 1 });
    const [row] = (await readFile(out, 'utf-8')).trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(row.draftMember, 'Belle', 'plan 09 correlates the preview against the member ST actually drafted');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- Astra review 2026-09-20: mutations that survived the first round. ---

test('a re-arm by someone else (same page, new epoch) is detected, not treated as the same session', async () => {
  // The earlier reload test entered through `!frame.armed`, so deleting the epoch check alone
  // still passed. Here the page stays armed and only the epoch changes.
  const dir = await mkdtemp(join(tmpdir(), 'so-payload-'));
  const out = join(dir, 'session.jsonl');
  await generate('first-session');
  let poll = 0;
  try {
    const result = await persistPayloads(fakePage, {
      out,
      intervalMs: 0,
      shouldStop: () => {
        poll += 1;
        if (poll === 1) {
          const state = (globalThis as any).__soDebugPayloads;
          state.epoch = 'someone-elses-epoch';
          state.entries = [];
          state.nextIndex = 0;
          state.entries.push({ url: '/api/backends/x', method: 'POST', body: JSON.stringify({ tag: 'second-session' }), index: 0, epoch: state.epoch, draftMember: null, capturedAt: new Date().toISOString() });
          state.nextIndex = 1;
        }
        return poll >= 3;
      },
    });
    const rows = (await readFile(out, 'utf-8')).trim().split('\n').map((line) => JSON.parse(line));
    assert.deepEqual(tags(rows), ['first-session', 'second-session']);
    assert.equal(result.rearmed, 1, 'an epoch change is a new session even when the page never went away');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a page restart makes the gap UNKNOWN, so the record is not called clean', async () => {
  // The count of captures that died with the old page is itself gone with the page. Reporting 0
  // would be a claim we cannot make; the run is marked not-ok and the restart is named.
  const dir = await mkdtemp(join(tmpdir(), 'so-payload-'));
  const out = join(dir, 'session.jsonl');
  let poll = 0;
  try {
    const result = await persistPayloads(fakePage, {
      out,
      intervalMs: 0,
      shouldStop: () => {
        poll += 1;
        if (poll === 1) { void generate('doomed'); freshPage(); }
        return poll >= 3;
      },
    });
    assert.equal(result.rearmed, 1);
    assert.equal(result.unknownGaps, 1, 'a restart is an unknown gap, never a zero');
    assert.equal(result.ok, false, 'a record with an unknown gap is not a clean record');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a write failure stops the run and is reported, never swallowed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'so-payload-'));
  // Point --out at a directory: every append fails with EISDIR.
  const out = join(dir, 'a-directory');
  await mkdtemp(join(tmpdir(), 'x-'));
  const { mkdir } = await import('node:fs/promises');
  await mkdir(out, { recursive: true });
  await generate('a');
  let poll = 0;
  try {
    const result = await persistPayloads(fakePage, { out, intervalMs: 0, shouldStop: () => (poll += 1) >= 3 });
    assert.ok(result.writeErrors >= 1, 'a disk failure must be counted');
    assert.equal(result.ok, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a final drain runs after the stop, so Ctrl-C does not drop the last turn', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'so-payload-'));
  const out = join(dir, 'session.jsonl');
  let poll = 0;
  try {
    await persistPayloads(fakePage, {
      out,
      intervalMs: 0,
      shouldStop: () => {
        poll += 1;
        // Arrives after the loop has decided to stop.
        if (poll === 1) void generate('last-turn');
        return true;
      },
    });
    const rows = (await readFile(out, 'utf-8')).trim().split('\n').map((line) => JSON.parse(line));
    assert.deepEqual(tags(rows), ['last-turn']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('watch prints the number of rows asked for, not index arithmetic', async () => {
  // `printed = entry.index + 1` treated the monotonic session index as a count, so `watch 2` on a
  // page that had already generated twice returned after a single row (Astra review 2026-09-20).
  const watchPage = { ...fakePage, waitForTimeout: async () => {} };
  for (let i = 0; i < 5; i += 1) await generate(`warm-${i}`);   // the ring is already warm
  const printed: string[] = [];
  const realLog = console.log;
  console.log = (line: string) => { printed.push(line); };
  try {
    const pending = watchPayloads(watchPage, 2, 3000);
    await generate('new-1');
    await generate('new-2');
    await generate('new-3');
    await pending;
  } finally {
    console.log = realLog;
  }
  assert.equal(printed.length, 2, 'watch 2 must print exactly two rows');
  assert.deepEqual(printed.map((line) => JSON.parse(line).parsedBody.tag), ['new-1', 'new-2'], 'and only captures made after arming');
});
