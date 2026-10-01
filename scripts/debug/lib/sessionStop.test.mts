import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stopSequence, type StopDeps } from './sessionStop.mts';

const drained = { ready: { at: 'r' }, drained: { at: 'd', ok: true } };

const deps = (patch: Partial<StopDeps> = {}, log: string[] = []): StopDeps => ({
  endPhase: async () => { log.push('end'); return { ok: true, problems: [] }; },
  headerDiff: async () => { log.push('diff'); return { code: 0, output: '' }; },
  requestDrain: async () => { log.push('drain'); },
  waitDrained: async () => { log.push('wait'); return { journal: drained, payloads: drained, console: drained }; },
  killTails: async () => { log.push('kill'); },
  verify: async () => { log.push('verify'); return []; },
  ...patch,
});

test('AS-22 stop: the state is exported and the tails drained BEFORE any tail is killed', async () => {
  const log: string[] = [];
  const outcome = await stopSequence(deps({}, log));
  assert.deepEqual(log, ['end', 'diff', 'drain', 'wait', 'kill', 'verify']);
  assert.equal(outcome.valid, true);
});

test('AS-22 stop: a failed header diff makes the session invalid', async () => {
  const outcome = await stopSequence(deps({ headerDiff: async () => ({ code: 1, output: 'blocking: judge.enabled' }) }));
  assert.equal(outcome.valid, false);
  assert.deepEqual(outcome.runHeaderDiff, { exit: 1, ok: false });
  assert.match(outcome.invalid[0], /run header diff failed/);
});

test('AS-22 stop: a tail that never acknowledged its drain, or a failed verification, makes the session invalid', async () => {
  const lost = await stopSequence(deps({ waitDrained: async () => ({ journal: drained, payloads: { ready: { at: 'r' }, drained: null }, console: drained }) }));
  assert.equal(lost.valid, false);
  assert.ok(lost.invalid.some((line) => /payloads tail never acknowledged its final drain/.test(line)));
  const short = await stopSequence(deps({ verify: async () => ['required artifact turns: 0 captured, the card needs at least 1'] }));
  assert.equal(short.valid, false);
  const endless = await stopSequence(deps({ endPhase: async () => ({ ok: false, problems: ['could not reopen c1'] }) }));
  assert.equal(endless.valid, false);
  assert.deepEqual(endless.problems, ['could not reopen c1']);
});
