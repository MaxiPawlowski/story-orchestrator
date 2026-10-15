import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startWithRetry } from './laneStartRetry.mts';

test('a lane start that fails once (browser spawn under load) is stopped and started again', async () => {
  const calls: string[] = [];
  let starts = 0;
  const lanes = async (...args: string[]) => {
    calls.push(args.join(' '));
    if (args[0] === 'start' && ++starts === 1) throw new Error("lane 41's browser did not start");
    return 'ok';
  };
  assert.equal(await startWithRetry(41, false, lanes, 2, () => undefined), 'ok');
  assert.deepEqual(calls, ['start 41', 'stop 41', 'start 41']);
});

test('a lane start that keeps failing throws the last error after the attempts', async () => {
  const lanes = async (...args: string[]) => { if (args[0] === 'start') throw new Error('server did not answer'); };
  await assert.rejects(startWithRetry(41, true, lanes, 2, () => undefined), /server did not answer/);
});
