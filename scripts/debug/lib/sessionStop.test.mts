import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headerDiffArgs, HEADER_DIFF_ALLOW, servedIdentityWarnings, stopSequence, type StopDeps } from './sessionStop.mts';
import { describe as describeDifference, diffHeaders } from '../so-run-header.mts';

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

test('review leftovers: the stop diff passes --owned with the session chats and never allows the whole chat block', () => {
  const args = headerDiffArgs('start.json', 'end.json', [{ chatId: 'chat-a' }, { chatId: 'chat-b' }, { chatId: 'chat-a' }, {}]);
  assert.deepEqual(args.slice(args.indexOf('--owned'), args.indexOf('--owned') + 2), ['--owned', 'chat-a,chat-b']);
  assert.ok(!HEADER_DIFF_ALLOW.split(',').includes('chat'));
  assert.ok(!headerDiffArgs('s', 'e', []).includes('--owned'));
  const header = (chatId: string, chatLength: number) => ({ chat: { chatId, chatLength, groupId: 'g', authorView: false } });
  const allow = HEADER_DIFF_ALLOW.split(',');
  assert.equal(diffHeaders(header('chat-x', 3), header('chat-x', 5), allow, { ownedChats: ['chat-a'] })[0].allowed, false);
  assert.equal(diffHeaders(header('chat-a', 3), header('chat-a', 5), allow, { ownedChats: ['chat-a'] })[0].allowed, true);
});

const SERVED = 'ceb15ac19ec07dec3a70c5d80785b611d806cad5e9659520e5d54a8a2182ab19';
const mismatch = (served: string, dist: string) => `the page is running a bundle that is not the built one: served ${served.slice(0, 16)} vs dist ${dist.slice(0, 16)}`;
const t0Header = ({ head, bundleSha256, served, dirty = true, extraWarnings = [] as string[] }: { head: string; bundleSha256: string; served: string; dirty?: boolean; extraWarnings?: string[] }) => ({
  build: { head, dirty, manifest: { version: '2.4.0', flavor: 'prod', bundleSha256, builtAt: `built-${head}`, fileSha256: head.slice(0, 16), sourceSha256: `src-${head}`, bundleBytes: head.length } },
  bundle: { served: { http: 200, sha256: served, bytes: 1284044 } },
  warnings: [mismatch(served, bundleSha256), ...extraWarnings],
  chat: { chatId: 'chat-a', chatLength: 1, groupId: 'g', authorView: false },
});
const t0Start = t0Header({ head: 'fb5b07b4c38dbc15adc6d187d99fe7fbeaec43c2', bundleSha256: '38062b709bbf73ef16754056db9d13288a82861a6ed3688133ed12c2a403414b', served: SERVED });
const t0End = (served = SERVED, patch: Partial<Parameters<typeof t0Header>[0]> = {}) => ({
  ...t0Header({ head: 'd444cd7fffd21e2097439b875305bfa5e7f9e7d2', bundleSha256: '0d0d9a5777807cec857c17f2b63ce521db59693d1e8129a180c0130ba04444cd', served, ...patch }),
  chat: { chatId: 'chat-a', chatLength: 14, groupId: 'g', authorView: false },
});
const stopDiff = (before: unknown, after: unknown) => diffHeaders(before, after, HEADER_DIFF_ALLOW.split(','), { ownedChats: ['chat-a'], servedIdentity: headerDiffArgs('s', 'e', []).includes('--served-identity') });

test('T0-3 stop: master moving mid-run (build.head, build.manifest.*, the mismatch warning) is allowed when the served bundle is identical', () => {
  const differences = stopDiff(t0Start, t0End());
  const blocking = differences.filter((difference) => !difference.allowed).map((difference) => difference.path);
  assert.deepEqual(blocking, []);
  const served = differences.filter((difference) => difference.allowedBy?.startsWith('served-bundle')).map((difference) => difference.path);
  assert.ok(served.includes('build.head'));
  assert.ok(served.includes('build.manifest.bundleSha256'));
  assert.ok(served.includes('warnings'));
  const output = differences.map(describeDifference).join('\n');
  const warnings = servedIdentityWarnings(output);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^the repo build moved during the session \(.*build\.head.*\) while the served bundle ceb15ac19ec07dec stayed identical/);
});

test('T0-3 stop control: a changed served bundle still invalidates, build drift included', () => {
  const other = '1111111111111111aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const blocking = stopDiff(t0Start, t0End(other)).filter((difference) => !difference.allowed).map((difference) => difference.path);
  assert.ok(blocking.includes('bundle.served.sha256'));
  assert.ok(blocking.includes('build.head'));
  assert.ok(blocking.includes('build.manifest.bundleSha256'));
  assert.ok(blocking.includes('warnings'));
});

test('T0-3 stop control: the served identity excuses neither a tree that went dirty nor an unrelated new warning', () => {
  const clean = t0Header({ head: 'fb5b07b4c38dbc15adc6d187d99fe7fbeaec43c2', bundleSha256: '38062b709bbf73ef16754056db9d13288a82861a6ed3688133ed12c2a403414b', served: SERVED, dirty: false });
  const blocking = stopDiff(clean, t0End(SERVED, { extraWarnings: ['judge.model could not be read'] })).filter((difference) => !difference.allowed).map((difference) => difference.path);
  assert.deepEqual(blocking.sort(), ['build.dirty', 'warnings']);
  assert.deepEqual(diffHeaders(t0Start, t0End(), HEADER_DIFF_ALLOW.split(','), { ownedChats: ['chat-a'] }).filter((difference) => !difference.allowed).map((difference) => difference.path).includes('build.head'), true, 'without --served-identity the build drift still blocks');
});

test('T0-3 stop: the session records the served-identity allowance as a warning and stays valid', async () => {
  const output = stopDiff(t0Start, t0End()).map(describeDifference).join('\n');
  const outcome = await stopSequence(deps({ headerDiff: async () => ({ code: 0, output }) }));
  assert.equal(outcome.valid, true);
  assert.equal(outcome.warnings.length, 1);
  assert.match(outcome.warnings[0], /served bundle ceb15ac19ec07dec stayed identical/);
  const quiet = await stopSequence(deps());
  assert.deepEqual(quiet.warnings, []);
});

test('T4-4 2026-10-02: the stop diff allows the session chats it created and the paths its card changes on purpose', () => {
  const args = headerDiffArgs('s', 'e', [{ chatId: 'chat-a', groupId: 'g1' }, { chatId: 'chat-b', groupId: 'g1' }, { chatId: 'solo' }], ['inventory.v2Stories']);
  const allow = args[args.indexOf('--allow') + 1].split(',');
  assert.ok(allow.includes('inventory.groupChats:+g1/chat-b'));
  assert.ok(!allow.some((entry) => entry.includes('solo')));
  assert.ok(allow.includes('inventory.v2Stories'));
  const inventory = (groupChats: string[], v2Stories: string[]) => ({ inventory: { groupChats, v2Stories } });
  const before = inventory(['g1/chat-a'], ['adolion-adventurer@29']);
  const after = inventory(['g1/chat-a', 'g1/chat-b'], ['adolion-adventurer@31']);
  const blocking = (entries: string[]) => diffHeaders(before, after, entries, { ownedChats: ['chat-a', 'chat-b'] }).filter((difference) => !difference.allowed).map((difference) => difference.path);
  assert.deepEqual(blocking(allow), []);
  assert.deepEqual(blocking(headerDiffArgs('s', 'e', [{ chatId: 'chat-a', groupId: 'g1' }])[4].split(',')).sort(), ['inventory.groupChats', 'inventory.v2Stories']);
  const foreign = diffHeaders(before, inventory(['g1/chat-a', 'g1/chat-z'], ['adolion-adventurer@29']), allow, { ownedChats: ['chat-a', 'chat-b'] }).filter((difference) => !difference.allowed).map((difference) => difference.path);
  assert.deepEqual(foreign, ['inventory.groupChats']);
});
