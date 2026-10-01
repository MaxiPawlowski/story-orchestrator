import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { QUIESCE_READ, QUIESCE_STOP, quiesceGeneration, type GenerationProbe, type GenerationReading } from './generationQuiesce.mts';
import { cleanupScenario } from '../so-scenario.mts';
import { runCleanup } from '../so-journey.mts';

const reading = (generating: boolean, saving = false): GenerationReading => ({ generating, saving, chatId: 'sandbox', signals: generating ? ['body-generating'] : [] });

function clockProbe(script: Array<{ generating: boolean; saving?: boolean }>, { stopEnds = false } = {}) {
  let clock = 0;
  let at = 0;
  let stopped = false;
  const calls: string[] = [];
  const probe: GenerationProbe = {
    read: async () => {
      const step = stopEnds && stopped ? { generating: false } : script[Math.min(at, script.length - 1)];
      at += 1;
      calls.push(step.generating ? 'read:generating' : step.saving ? 'read:saving' : 'read:idle');
      return reading(step.generating, step.saving ?? false);
    },
    stop: async () => { stopped = true; calls.push('stop'); return true; },
    sleep: async (ms) => { clock += ms; },
    now: () => clock,
  };
  return { probe, calls };
}

test('an idle page is quiet after the quiet window and nothing is stopped', async () => {
  const { probe, calls } = clockProbe([{ generating: false }]);
  const report = await quiesceGeneration(probe, { quietMs: 400, pollMs: 100 });
  assert.deepEqual([report.idle, report.wasGenerating, report.stops], [true, false, 0]);
  assert.ok(!calls.includes('stop'));
});

test('a running generation is stopped, re-stopped while the next group member drafts, and awaited', async () => {
  const { probe, calls } = clockProbe([{ generating: true }, { generating: true }, { generating: true }, { generating: true }, { generating: true }, { generating: false }]);
  const report = await quiesceGeneration(probe, { quietMs: 300, pollMs: 100, restopMs: 200 });
  assert.equal(report.idle, true);
  assert.equal(report.wasGenerating, true);
  assert.equal(report.stops, 3);
  assert.equal(calls[0], 'read:generating');
  assert.equal(calls[1], 'stop');
  assert.equal(calls.at(-1), 'read:idle');
});

test('a chat save in flight after the stop holds the quiet window open', async () => {
  const { probe } = clockProbe([{ generating: true }, { generating: false, saving: true }, { generating: false, saving: true }, { generating: false }]);
  const report = await quiesceGeneration(probe, { quietMs: 200, pollMs: 100 });
  assert.equal(report.idle, true);
  assert.ok(report.waitedMs >= 400, `waited ${report.waitedMs} ms`);
});

test('negative control: a generation that never stops is reported, never waited out silently', async () => {
  const { probe } = clockProbe([{ generating: true }]);
  const report = await quiesceGeneration(probe, { timeoutMs: 1000, pollMs: 100, restopMs: 300 });
  assert.equal(report.idle, false);
  assert.match(report.error ?? '', /did not stop within 1000 ms/);
  assert.ok(report.stops >= 3);
});

const SWITCHES = /deleteGroupChat|openGroupById|openGroupChat|deleteCharacterChatByName|executeSlashCommands/;

function generatingPage({ readsAfterStop = 1, neverStops = false } = {}) {
  const events: string[] = [];
  let stops = 0;
  let readsSinceStop = 0;
  const page = {
    evaluate: async (fn: (arg: unknown) => unknown, arg: { op?: string } | undefined) => {
      if (arg?.op === QUIESCE_READ) {
        if (stops) readsSinceStop += 1;
        const generating = neverStops || stops === 0 || readsSinceStop <= readsAfterStop;
        events.push(generating ? 'read:generating' : 'read:idle');
        return reading(generating);
      }
      if (arg?.op === QUIESCE_STOP) {
        stops += 1;
        events.push('stop');
        return true;
      }
      events.push(SWITCHES.test(String(fn)) ? 'switch' : 'other');
      return null;
    },
  };
  return { page, events };
}

const guard = () => ({ groupId: 'g1', sandboxChatId: 'sandbox', owned: ['sandbox'], preexisting: [], current: 'sandbox', escaped: null, storyTitles: [] as string[], mirrorBooks: [] as Array<{ name: string; chatId: string }>, branchChats: [] as string[] });
const fast = { quietMs: 0, pollMs: 1, restopMs: 0, timeoutMs: 200 };

function assertStoppedBeforeSwitch(events: string[]) {
  const firstSwitch = events.indexOf('switch');
  const firstOther = events.findIndex((event) => event === 'switch' || event === 'other');
  assert.ok(firstSwitch > 0, `cleanup never switched: ${events.join(' ')}`);
  assert.ok(events.indexOf('stop') >= 0 && events.indexOf('stop') < firstOther, `cleanup touched the page before stopping the generation: ${events.join(' ')}`);
  assert.equal(events[firstOther - 1], 'read:idle', `the last probe before cleanup work did not read idle: ${events.join(' ')}`);
  assert.ok(!events.slice(firstOther).some((event) => event.startsWith('read') || event === 'stop'), 'the probe ran again after cleanup had started');
}

test('H-a so-scenario: sandbox cleanup stops and awaits a running generation before any chat switch', async () => {
  const { page, events } = generatingPage({ readsAfterStop: 2 });
  const cleaned = await cleanupScenario(page, [], guard(), false, null, { quiesce: fast }) as Record<string, any>;
  assert.equal(cleaned.generation.idle, true);
  assert.equal(cleaned.generation.wasGenerating, true);
  assertStoppedBeforeSwitch(events);
});

test('H-a so-scenario negative control: a generation that will not stop leaves the chats in place and fails cleanup', async () => {
  const { page, events } = generatingPage({ neverStops: true });
  const cleaned = await cleanupScenario(page, [], guard(), false, null, { quiesce: fast }) as Record<string, any>;
  assert.equal(cleaned.generation.idle, false);
  assert.match(cleaned.generation.error, /did not stop/);
  assert.deepEqual(cleaned.notDeleted, ['sandbox']);
  assert.ok(!events.includes('switch'), `a chat was switched while the generation ran: ${events.join(' ')}`);
});

test('H-a so-scenario: --keep switches nothing and does not stop the generation', async () => {
  const { page, events } = generatingPage();
  const kept = await cleanupScenario(page, [], guard(), true, null, { quiesce: fast }) as Record<string, any>;
  assert.equal(kept.kept, true);
  assert.deepEqual(events, []);
});

const journeyCleanup = async (page: unknown, historyDir: string) => runCleanup(page, { id: 'J1', cleanup: {} }, {
  importedHashes: [],
  libraryBefore: null,
  configSnapshot: null,
  guard: guard(),
  keep: false,
  allowConfig: false,
  assetBaseline: null,
  activatedLorebooks: [],
  quiesce: fast,
  historyDir,
}) as Promise<Record<string, any>>;

test('H-a so-journey: journey cleanup stops and awaits a running generation before any chat switch', async () => {
  const { page, events } = generatingPage({ readsAfterStop: 1 });
  const report = await journeyCleanup(page, await mkdtemp(join(tmpdir(), 'so-quiesce-')));
  assert.equal(report.generation.idle, true);
  assertStoppedBeforeSwitch(events);
});

test('H-a so-journey negative control: a generation that will not stop deletes nothing and is a leak', async () => {
  const { page, events } = generatingPage({ neverStops: true });
  const report = await journeyCleanup(page, await mkdtemp(join(tmpdir(), 'so-quiesce-')));
  assert.equal(report.generation.idle, false);
  assert.deepEqual(report.chat.notDeleted, ['sandbox']);
  assert.ok(!events.includes('switch'), `a chat was switched while the generation ran: ${events.join(' ')}`);
});
