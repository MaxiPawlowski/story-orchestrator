import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataRootOf, holderSummary, listeningPids, portOwnership } from './lanePortOwner.mts';

const NETSTAT = `
Active Connections

  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1196
  TCP    127.0.0.1:8160         0.0.0.0:0              LISTENING       4412
  TCP    127.0.0.1:8160         127.0.0.1:52011        ESTABLISHED     4412
  TCP    127.0.0.1:8188         0.0.0.0:0              LISTENING       7310
  TCP    127.0.0.1:52011        127.0.0.1:8160         ESTABLISHED     9001
  TCP    [::1]:8161             [::]:0                 LISTENING       5120
`;

test('listeningPids reads only LISTENING rows for the exact port, IPv4 and IPv6', () => {
  assert.deepEqual(listeningPids(NETSTAT, 8160), [4412]);
  assert.deepEqual(listeningPids(NETSTAT, 8161), [5120]);
  assert.deepEqual(listeningPids(NETSTAT, 816), []);
  assert.deepEqual(listeningPids(NETSTAT, 52011), []);
});

test('dataRootOf reads --dataRoot quoted, unquoted or with =', () => {
  assert.equal(dataRootOf('"C:\\node.exe" server.js --port 8160 --dataRoot C:\\dev\\so-lanes\\60\\data --listen false'), 'C:\\dev\\so-lanes\\60\\data');
  assert.equal(dataRootOf('node server.js --dataRoot "C:\\dev\\so live\\60\\data"'), 'C:\\dev\\so live\\60\\data');
  assert.equal(dataRootOf('node server.js --dataRoot=/srv/lanes/60/data'), '/srv/lanes/60/data');
  assert.equal(dataRootOf('python main.py --port 8188'), null);
});

const lane = { data: 'C:\\dev\\so-lanes\\60\\data', pid: 4412 };

test('the same lane number under another lanes root is not this lane (so-live-lanes vs so-lanes)', () => {
  const live = { pid: 4412, commandLine: 'node server.js --port 8160 --dataRoot C:\\dev\\so-live-lanes\\60\\data' };
  assert.equal(portOwnership(live, lane, 'win32'), 'other');
  assert.equal(holderSummary(live).dataRoot, 'C:\\dev\\so-live-lanes\\60\\data');
});

test('a server on this lane root is own, case and slashes aside on Windows', () => {
  assert.equal(portOwnership({ pid: 1, commandLine: 'node server.js --dataRoot c:/dev/so-lanes/60/data/' }, lane, 'win32'), 'own');
});

test('a non-ST process on the port (ComfyUI on 8188) is other', () => {
  assert.equal(portOwnership({ pid: 7310, commandLine: 'python main.py --listen 127.0.0.1 --port 8188' }, { data: 'C:\\dev\\so-lanes\\88\\data', pid: null }, 'win32'), 'other');
});

test('an unreadable command line falls back to the pid file, else unknown', () => {
  assert.equal(portOwnership({ pid: 4412, commandLine: null }, lane, 'win32'), 'own');
  assert.equal(portOwnership({ pid: 9, commandLine: null }, lane, 'win32'), 'unknown');
  assert.equal(portOwnership({ pid: null, commandLine: null }, { ...lane, pid: null }, 'win32'), 'unknown');
});
